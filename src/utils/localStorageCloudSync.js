/**
 * localStorage → 云端 的**统一同步层**（唯一入口）
 *
 * 设计动机：不要在 4 个业务点各写一遍「读云 / 写云」，而是拦住 localStorage 本身。
 * 所有写入方（VueUse 的 useLocalStorage、备份恢复、组件里直接 setItem）都走
 * `Storage.prototype` 上的同名方法，覆写一次就能全覆盖。
 *
 * 机制：
 *   ① 覆写 `Storage.prototype.setItem / removeItem / clear`
 *      - `this === localStorage` 才处理（`sessionStorage` 共用同一个原型，必须放过）
 *      - 命中白名单 → `cloudSet(key, 解析后的值)`（cloudSet 自带 700ms 按 key 防抖合并）
 *      - `suppress` 计数挡住「云端写回本地」引发的回环
 *   ② 监听 `storage` 事件 → 覆盖**其他标签页**造成的改动
 *   ③ `online` 事件 → `flushDirty()`：网络恢复时立刻把没推上去的键补推（见 ⑤）
 *   ④ `pullFromCloudOnce()`：首次登录 / 刷新时做一次双向对账
 *      - **先补推上次没推成功的键**（见 ⑤）—— 必须在下面的覆盖之前，否则本地改动会被云端旧值盖掉
 *      - 云端有、本地没有 → 写进本地
 *      - 本地有、云端没有 → 推上去（首次上云迁移、备份恢复后的补推）
 *      - 云端是**空数组**而本地非空 → 不覆盖，改为把本地回推（防「凭空清空」）
 *      - 仍然带着未推送标记的键 → **不覆盖**（本地更新，云端是旧的）
 *      - 顺带对账 IndexedDB 的 bin：拉回本地缺的 + 补推云端没有的
 *   ⑤ 写入失败不丢：`cloudState` 会在 localStorage 留 `cloud_pending_<key>` 标记并退避重试，
 *      标记**跨会话保留**。这是「断网改完、下次打开被云端覆盖」那条老路径的唯一挡板。
 *   ⑥ `pagehide` / `beforeunload` → `cloudFlush(keepalive)` + `flushDirty(keepalive)`：
 *      跳转或关标签页前把排队的写入发出去（keepalive 让请求在页面卸载后仍然送达）。
 *      备份恢复流程会自动跳转，靠这一步保证恢复的数据一定推得上去。
 *
 * ⚠️ IndexedDB 拦不到（没有同步 API 可覆写），所以 bin 的**写入时**推送仍在
 *    `hooks/useIndexedDB.ts` 里；本模块负责**启动时的对账**（③）与卸载前的收尾（④）。
 *    这是本方案唯一的例外。
 */
import {
  cloudGetEx,
  cloudSet,
  cloudDel,
  cloudList,
  cloudFlush,
  flushDirty,
  listDirty,
} from "./cloudState";
import { CLOUD_BIN_PREFIX, pushBinToCloud } from "./binCloud";
import useIndexedDB from "@/hooks/useIndexedDB";

// ==================== 同步范围 ====================
/** 精确匹配的键 */
const SYNC_KEYS = [
  "gameTokens",
  "scheduledTasks",
  "tokenGroups",
  "selectedTokenId",
  "selectedRoleInfo",
];
/** 前缀匹配的键 */
const SYNC_PREFIXES = ["saved_lineups_"];

/** 明确排除（防止以后放宽白名单时误伤；也会挡住前缀误匹配） */
const BLOCK_KEYS = [
  "auth_token",
  "auth_user",
  "theme",
  "userPreferences",
  "tokenSortConfig",
  "activeConnections",
];
const BLOCK_PREFIXES = ["cloud_", "ws_connection_", "xyzw_"];

export function isSyncableKey(key) {
  if (!key) return false;
  if (BLOCK_KEYS.includes(key)) return false;
  if (BLOCK_PREFIXES.some((p) => key.startsWith(p))) return false;
  return SYNC_KEYS.includes(key) || SYNC_PREFIXES.some((p) => key.startsWith(p));
}

// ==================== 内部状态 ====================
/** >0 表示处在「云端写回本地」的过程中，此时不要回推 */
let suppress = 0;
let installed = false;
/**
 * 首次拉取完成前**不向云端推送**。
 * 原因：`useLocalStorage(key, defaultValue)`（VueUse 的 writeDefaults 默认开启）会在模块
 * 初始化时把默认值写进 localStorage —— 如果不拦，首次打开就会把一堆 `[]` 推上云端，
 * 反过来在别的设备上把真实数据"清空"（这正是之前那次数据丢失的成因之一）。
 */
let pushEnabled = false;

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, raw) {
  try {
    localStorage.setItem(key, raw);
  } catch (e) {
    console.warn(`[cloudSync] 写入 localStorage 失败：${key}`, e);
  }
}

/**
 * 直接写 localStorage 时，内存里的 `useLocalStorage` ref **不会**自动更新 ——
 * VueUse 只监听 `storage` 事件，而同页写入不触发该事件（只在其他标签页触发）。
 * 这里手工派发一个 StorageEvent，让所有 useLocalStorage 同步刷新。
 * 这正是 VueUse 自己写 storage 时的做法（@vueuse/core 内部的 dispatchWriteEvent）。
 *
 * ⚠️ `dispatchEvent` 是**同步**的，所以调用时必须已经在 `suppress` 里，
 *    否则我们自己的 storage 监听器会把刚拉下来的值又推回云端。
 */
function refreshReactiveBindings(key, oldValue, newValue) {
  try {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        oldValue,
        newValue,
        storageArea: localStorage,
      }),
    );
  } catch (e) {
    console.warn(`[cloudSync] 派发 storage 事件失败：${key}`, e);
  }
}

/** localStorage 里存的都是字符串；能解析成 JSON 就按 JSON 推，否则推原始字符串 */
function parseValue(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function stringifyValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** 只有「空数组」才触发空值保护 —— 字符串/对象的空值语义太含糊，不拦 */
function isEmptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

function localIsNonEmptyArray(key) {
  const raw = safeGet(key);
  if (!raw) return false;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length > 0;
  } catch {
    return false;
  }
}

/** 所有本地「应同步」的键（含前缀匹配） */
function localSyncableKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isSyncableKey(k)) keys.push(k);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

/**
 * 一个键发生变化 → 推云端（或删云端）
 */
function notify(key, rawValue) {
  if (suppress > 0) return;
  if (!isSyncableKey(key)) return;
  if (!pushEnabled) return; // 首次拉取完成前不推（见 pushEnabled 的说明）

  if (rawValue === null || rawValue === undefined) {
    cloudDel(key);
  } else {
    cloudSet(key, parseValue(rawValue));
  }
}

// ==================== 安装拦截 ====================
/** useIndexedDB 的 initDB 是异步的，这里等一下它 */
async function waitDbReady(db, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (!db.isReady.value && Date.now() - startedAt < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return db.isReady.value;
}

/**
 * 把本地有、云端还没有的 bin 补推上去。
 * 主要场景：备份恢复（恢复流程直接写 IndexedDB，绕过了 useIndexedDB 的推送钩子）。
 * 副作用：别的设备删掉的 bin 若本地还在，会被重新推回云端 —— 但那只是个孤儿文件，
 * 没有对应账号就读不到，无害；换来的是「恢复出来的 bin 一定不会丢」。
 */
async function pushLocalOnlyBins(db) {
  const cloudBinKeys = await cloudList(CLOUD_BIN_PREFIX); // null = 拉取失败
  if (!cloudBinKeys) return 0;

  const inCloud = new Set(cloudBinKeys);
  let pushed = 0;

  const localKeys = await db.getAllKeys();
  for (const binKey of localKeys) {
    if (inCloud.has(CLOUD_BIN_PREFIX + binKey)) continue;
    const buffer = await db.getArrayBuffer(binKey);
    if (buffer) {
      pushBinToCloud(binKey, buffer);
      pushed++;
    }
  }
  return pushed;
}
/**
 * 覆写 Storage.prototype 上的写方法。幂等。
 * ⚠️ 必须在任何业务代码写 localStorage **之前**调用（main.js 第一行 import 它）。
 */
export function installLocalStorageCloudSync() {
  if (installed) return false;
  if (typeof window === "undefined") return false;

  let ls;
  try {
    ls = window.localStorage;
  } catch {
    return false;
  }
  if (!ls) return false;

  const proto = Object.getPrototypeOf(ls);
  if (!proto || typeof proto.setItem !== "function") return false;

  const nativeSetItem = proto.setItem;
  const nativeRemoveItem = proto.removeItem;
  const nativeClear = proto.clear;

  proto.setItem = function (key, value) {
    const result = nativeSetItem.call(this, key, value);
    // sessionStorage 共用同一个原型，必须放过
    if (this === ls) {
      try {
        notify(String(key), value === undefined ? null : String(value));
      } catch (e) {
        console.warn("[cloudSync] setItem 钩子异常:", e);
      }
    }
    return result;
  };

  proto.removeItem = function (key) {
    const result = nativeRemoveItem.call(this, key);
    if (this === ls) {
      try {
        notify(String(key), null);
      } catch (e) {
        console.warn("[cloudSync] removeItem 钩子异常:", e);
      }
    }
    return result;
  };

  proto.clear = function () {
    // 先收集将要被清掉的同步键，再清
    let doomed = [];
    if (this === ls) {
      try {
        doomed = localSyncableKeys();
      } catch {
        doomed = [];
      }
    }
    const result = nativeClear.call(this);
    if (this === ls) {
      doomed.forEach((k) => {
        try {
          notify(k, null);
        } catch {
          /* ignore */
        }
      });
    }
    return result;
  };

  // 其他标签页的改动只会发 storage 事件，不会走本页的原型方法
  window.addEventListener("storage", (e) => {
    try {
      if (!e.key) return; // 别的标签页 clear()，跳过（各页各自的白名单不同，不猜）
      notify(e.key, e.newValue);
    } catch (err) {
      console.warn("[cloudSync] storage 事件处理异常:", err);
    }
  });

  // 网络恢复 → 立刻把之前没推上去的键补推。
  // 没有这一步，断网期间的改动只能静默躺在 localStorage，等到下次启动才被处理。
  const flushOnOnline = () => {
    void flushDirty();
  };
  window.addEventListener("online", flushOnOnline);

  // 页面卸载（跳转 / 关标签页）前把排队的写入发出去。
  // `keepalive` 让请求在被卸载的页面之外继续送达 —— 备份恢复后会 `window.location.href`
  // 自动跳转，没有这一步就可能在跳转瞬间丢掉还没推上去的数据。
  // 顺带也覆盖了「用户编辑到一半直接关标签页」的场景。
  const flushOnUnload = () => {
    try {
      void cloudFlush(true);
      // 排队中的 + 之前已经失败过的都要发；这儿发不出去也没关系，
      // 标记留在 localStorage 里，下次启动的 pullFromCloudOnce 会继续补推。
      void flushDirty(true);
    } catch {
      /* 卸载阶段不能再抛 */
    }
  };
  window.addEventListener("pagehide", flushOnUnload);
  window.addEventListener("beforeunload", flushOnUnload);

  installed = true;
  console.info(
    `[cloudSync] 已接管 localStorage 云同步（白名单 ${SYNC_KEYS.length} 个键 + ` +
      `${SYNC_PREFIXES.length} 个前缀）`,
  );
  return true;
}

// ==================== 首次拉取 ====================
let pulledOnce = false;
/** 最近一次（或进行中的）首次对账 promise；waitFirstPull 靠它等对账落地 */
let firstPullPromise = null;

/**
 * 从云端把数据拉回本地，并把本地独有的键推上去。
 * 幂等：同一会话默认只跑一次；未登录时不消费这次机会（下次还能跑）。
 *
 * ⚠️ 顺序不可调换：**先补推上次没推成功的键（A0），再执行「云端→本地」覆盖（A）**。
 *    反过来就等于把断网期间的本地改动直接抹掉 —— 别再"顺手"把这段挪走。
 */
export async function pullFromCloudOnce(force = false) {
  if (pulledOnce && !force) return { pulled: false, reason: "already" };

  const token = safeGet("auth_token");
  if (!token) return { pulled: false, reason: "not_logged_in" };

  pulledOnce = true;
  firstPullPromise = doFirstPull();
  return firstPullPromise;
}

/**
 * 等待「首次云端对账」落地（成功或失败都算落地）。
 * @returns {Promise<boolean>}
 *   true  = 没有在途的对账（未登录 / 从未发起 / 已结束）—— 调用方可以立刻下判断
 *   false = 对账还在路上（等满 timeoutMs 仍未结束）—— 此时**不该**凭「本地是空的」
 *           下结论（新设备 / 无痕模式：数据还在云端，正在灌进来的路上）
 *
 * 用途：登录后「没数据才做的事」（如自动弹「添加Token」）必须等它 ——
 *       否则无痕模式下登录完立刻进页面，就会提前弹窗（真机踩过）。
 */
export function waitFirstPull(timeoutMs = 30000) {
  if (!firstPullPromise) return Promise.resolve(true);
  return Promise.race([
    firstPullPromise.then(
      () => true,
      () => true,
    ),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

async function doFirstPull() {
  let cloudKeys = null;
  try {
    cloudKeys = await cloudList(); // 失败返回 null
  } catch (e) {
    console.warn("[cloudSync] 列出云端键失败:", e);
  }
  if (!cloudKeys) {
    pulledOnce = false; // 拉取失败，允许下次重试
    return { pulled: false, reason: "list_failed" };
  }

  // 确认能和云端对话了，从这一刻起本地改动才开始往上推
  pushEnabled = true;

  // A0. ★ 先把「上次没推成功」的键补推上去。
  //     必须在 A 段之前 —— 否则云端那份旧值会把本地的新改动直接覆盖掉，
  //     这正是「断网改完、下次打开就丢」的成因。
  let dirtyPushed = 0;
  try {
    const r = await flushDirty();
    dirtyPushed = r.ok;
  } catch (e) {
    console.warn("[cloudSync] 补推未推送成功的键出错:", e);
  }

  const targets = cloudKeys.filter(isSyncableKey);
  const stillDirty = new Set(listDirty()); // 补推后仍然没上去的（还在断网 / 服务端拒绝）
  const retryLocal = []; // 因空值保护而暂时不覆盖的键
  let wrote = 0;
  let keptLocal = 0;

  // A. 云端 → 本地
  suppress++;
  try {
    for (const key of targets) {
      // 本地有更新的改动还没推上去 → 绝不覆盖，否则就是丢数据
      if (stillDirty.has(key)) {
        keptLocal++;
        continue;
      }

      const res = await cloudGetEx(key);
      if (!res.ok) continue;

      if (isEmptyArray(res.value) && localIsNonEmptyArray(key)) {
        // 云端空的、本地有货 → 保本地，稍后回推
        retryLocal.push(key);
        continue;
      }

      const raw = stringifyValue(res.value);
      if (raw === null) continue;
      const oldRaw = safeGet(key);
      safeSet(key, raw);
      // 让内存里的 useLocalStorage ref 跟着刷新（同页写入不会自动触发）
      refreshReactiveBindings(key, oldRaw, raw);
      wrote++;
    }
  } finally {
    suppress--;
  }

  // B. 本地 → 云端（云端还没有的键 = 首次上云迁移）
  let pushed = 0;
  const cloudSetKeys = new Set(targets);
  for (const key of localSyncableKeys()) {
    if (cloudSetKeys.has(key)) continue;
    const raw = safeGet(key);
    if (raw === null) continue;
    notify(key, raw);
    pushed++;
  }

  // C. 空值保护跳过的键，回推本地的版本
  for (const key of retryLocal) {
    const raw = safeGet(key);
    if (raw !== null) notify(key, raw);
  }

  // D. IndexedDB 的 bin —— localStorage 能拦，IndexedDB 拦不到，只能显式对账
  let binsIn = 0;
  let binsOut = 0;
  try {
    const db = useIndexedDB();
    if (await waitDbReady(db)) {
      const pulled = await db.syncFromCloud(); // 云端 → 本地（只增不删）
      binsIn = pulled.added;
      binsOut = await pushLocalOnlyBins(db); // 本地 → 云端（补推云端还没有的）
    } else {
      console.warn("[cloudSync] IndexedDB 未就绪，跳过 bin 对账");
    }
  } catch (e) {
    console.warn("[cloudSync] 同步 bin 失败:", e);
  }

  console.info(
    `[cloudSync] 补推 ${dirtyPushed} 个未上传键、云端→本地 ${wrote} 个键、` +
      `本地→云端 ${pushed} 个键、保留本地 ${keptLocal} 个（尚未推成功）、` +
      `bin 拉回 ${binsIn} / 补推 ${binsOut}`,
  );

  return { pulled: true, wrote, pushed, binsIn, binsOut, dirtyPushed, keptLocal };
}

/** 强制把排队的写入立刻发出去（例如跳转前） */
export { cloudFlush };

/**
 * 把本地所有「应同步」的键强制推一遍（**绕过 pushEnabled**）。
 * 用于「恢复备份」这类必须落地的场景 —— 万一首次拉取失败导致推送未启用，
 * 恢复出来的数据也要能上去。
 */
export function pushAllLocalKeysToCloud() {
  const keys = localSyncableKeys();
  for (const key of keys) {
    const raw = safeGet(key);
    if (raw === null) continue;
    cloudSet(key, parseValue(raw));
  }
  return keys.length;
}

/**
 * 清空本地所有「应同步」的业务键（账号边界清理用，见 accountBoundaryCleanup）。
 *
 * ⚠️ 必须在 suppress 里删 —— 否则删除本身会被当成「用户删数据」推上云端，
 *    把刚登出的那个账号的云端数据清空（灾难）。
 * ⚠️ 删除后还要**多按住一小段 suppress**：useLocalStorage 对 removal 的响应
 *    （ref 置空 → 内部 watch 回写）是异步 flush 的，若在它落地前放开 suppress，
 *    那些回写会被当成用户操作推上云端。按住的窗口里发生的回写只会落在本地
 *    （值是空默认，无害），不会被推、也不会留标记。
 * ⚠️ 只清 localStorage：IndexedDB 的 bin 按 tokenId 存放、跨账号混在本地，
 *    且云端对孤儿文件天然容忍（推上去也只是无害孤儿），不动它。
 * @returns {number} 清掉的键数
 */
export function clearLocalBusinessKeys(holdMs = 120) {
  const keys = localSyncableKeys();
  if (!keys.length) return 0;
  suppress++;
  try {
    for (const key of keys) {
      const oldRaw = safeGet(key);
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      // 派发 storage 事件让内存里的 useLocalStorage ref 一起清空，
      // 避免残留的内存值之后又被写回 localStorage（复活成旧账号的数据）
      refreshReactiveBindings(key, oldRaw, null);
    }
  } finally {
    setTimeout(() => {
      suppress--;
    }, holdMs);
  }
  return keys.length;
}

/**
 * 账号边界清理（登出 / 换账号登录 / 401 下线时调用）：
 *   ① 趁当前 token 还有效，把「排队中」和「带未推送标记」的数据先推上去
 *      —— **脏数据优先上传**；
 *   ② 再清掉本地业务键 —— localStorage 是全账号共享的，不清的话，旧账号残留会在
 *      下个账号首次对账时被当成「本地独有数据」迁进别人的云端（数据串号）。
 *
 * ⚠️ 已知取舍：整个会话都离线（从未与云端握手成功）期间的改动没有未推送标记，
 *    无从补推，清理即丢。发生前提是「登录后全程断网」，窗口很小。
 * @returns {number} 清掉的键数
 */
export async function accountBoundaryCleanup() {
  try {
    await cloudFlush();
    await flushDirty();
  } catch {
    /* 尽力而为：推不上去也照样清（token 已失效时推本来就不会成功） */
  }
  return clearLocalBusinessKeys();
}

/** 供调试 / 测试观察当前是否已开始向上推 */
export function isCloudPushEnabled() {
  return pushEnabled;
}

// ==================== 自安装 ====================
// 直接 import 本模块即接管（幂等）。main.js 里放在**第一行 import**，
// 保证早于任何业务模块的 `useLocalStorage(...)` 初始化写入。
installLocalStorageCloudSync();
