/**
 * 云端键值存储客户端 —— 对应 E:\xyzw_server 的 `/api/state`（Cloudflare / EdgeOne 双平台）
 *
 * 用途：把原本只存在 localStorage 的业务数据（已存阵容、定时任务…）同步到云端，
 *       按账号隔离。账号身份取自 `auth_token`（服务端会验签）。
 *
 * 约定：
 *   - 读：`cloudGetEx(key)` 返回完整结果，调用方据此决定「用云端 / 迁移本地 / 保持原样」
 *   - 写：`cloudSet(key, value)` 是**异步 + 按 key 防抖合并**的，永不抛异常，失败仅告警
 *   - 任何云端问题都不阻断本地读写（本地始终是"先写、先读、保底"的那一份）
 *
 * ★ 失败不丢（2026-10-14 新增）：
 *   写失败时在 localStorage 留一条「未推送标记」`cloud_pending_<key>`，并做有限次退避重试
 *   （2s→4s→8s→16s→32s→60s，共 6 次）；监听 `online` 或下次启动时由 `flushDirty()` 立即重推。
 *   标记**跨会话保留**，且必须在「云端 → 本地」覆盖**之前**补推 —— 没有这层保护时，
 *   断网期间的本地改动会在下一次启动被云端旧值静默覆盖（这是真实存在过的数据丢失路径）。
 *
 *   标记里**只记状态（op / 重试次数 / 归属账号），不复制值**：重试时现读 localStorage，
 *   所以不会把大键（`gameTokens`、`saved_lineups_*`）复制一份撑爆配额。
 *   代价：本地键在重试前就没了的话无从补推 —— 此时标记自动作废（见 retryKey）。
 */
import { AUTH_BASE, AUTH_TOKEN_KEY, AUTH_USER_KEY } from "./authApi";

const STATE_URL = AUTH_BASE + "/api/state";
const DEFAULT_TIMEOUT = 15000;
/** 写：按 key 防抖合并的窗口 */
const WRITE_DELAY = 700;
/** fetch keepalive 的 body 上限（规范值 64KB，留点余量） */
const MAX_KEEPALIVE_BYTES = 60000;

function authToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

/** 当前登录账号名（用于给「未推送标记」打归属；取不到就空串） */
function currentUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return "";
    const u = JSON.parse(raw);
    return (u && (u.username || u.u || u.name)) || "";
  } catch {
    return "";
  }
}

/**
 * 统一请求。永不抛异常，一律返回结果对象：
 *   成功 { ok:true, status, ...payload }
 *   失败 { ok:false, status, error, message }   status=0 表示网络层失败
 *
 * `keepalive`：用页面卸载（跳转 / 关标签页）时的收尾推送。
 *   浏览器会保活这类请求，即使发起它的页面已经卸载也能送达。
 *   受 fetch 规范限制（body ≤ 64KB），超了就退回普通请求。
 */
async function request(
  method,
  { key, value, query, timeout = DEFAULT_TIMEOUT, keepalive = false } = {},
) {
  const token = authToken();
  if (!token) {
    return { ok: false, status: 0, error: "unauthorized", message: "未登录，已跳过云端同步" };
  }

  const payload = method === "POST" ? JSON.stringify({ key, value }) : undefined;
  const useKeepalive =
    !!keepalive && payload !== undefined && payload.length <= MAX_KEEPALIVE_BYTES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const url =
      method === "POST"
        ? STATE_URL
        : `${STATE_URL}?${query || `key=${encodeURIComponent(key)}`}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: payload,
      keepalive: useKeepalive,
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok || !data || data.ok !== true) {
      return {
        ok: false,
        status: res.status,
        error: (data && data.error) || `http_${res.status}`,
        message: (data && data.message) || `请求失败（HTTP ${res.status}）`,
      };
    }

    return { ok: true, status: res.status, ...data };
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    return {
      ok: false,
      status: 0,
      error: aborted ? "timeout" : "network_error",
      message: aborted ? "请求超时" : "无法连接云端存储",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 读一条云端数据。
 * @returns {{ok:boolean,status:number,error?:string,value?:any,updatedAt?:string}}
 *   - ok:true          云端有这条数据（value 可能是空数组）
 *   - status:404       云端确实没有（可用于「首次上云」迁移判断）
 *   - status:0         未登录 / 网络异常（**不要**据此判定云端为空）
 */
export async function cloudGetEx(key) {
  return request("GET", { key });
}

/** 读一条云端数据，只取值；读不到（404 / 未登录 / 异常）一律返回 null */
export async function cloudGet(key) {
  const res = await cloudGetEx(key);
  return res.ok ? res.value : null;
}

/**
 * 判断「云端确实没有这条数据」（可用于首次上云迁移）。
 * 必须用错误码判断，不能只看 HTTP 404 ——
 * 接口路径不存在 / 网关返回的 404 是 HTML，错误码会是 `http_404`，
 * 那种情况绝不能当成"云端为空"去做迁移。
 */
export function cloudIsAbsent(res) {
  return !!res && res.status === 404 && res.error === "not_found";
}

/**
 * 列出云端某前缀下的逻辑键（新设备发现云端有哪些数据用，例如 bin 文件）。
 * @returns 完整结果对象；`ok:true` 时 `keys` 是逻辑键数组
 */
export async function cloudListEx(prefix = "") {
  const query = prefix ? `list=1&prefix=${encodeURIComponent(prefix)}` : "list=1";
  return request("GET", { query, timeout: 20000 });
}

/**
 * 列出云端逻辑键。
 * @returns {string[]|null} 成功返回数组（可能为空）；**拉取失败返回 null**（别当空处理）
 */
export async function cloudList(prefix = "") {
  const res = await cloudListEx(prefix);
  return res.ok && Array.isArray(res.keys) ? res.keys : null;
}

// ==================== 未推送标记（dirty）====================
/**
 * 标记的 localStorage 键前缀。
 * ⚠️ 必须以 `cloud_` 开头 —— `localStorageCloudSync` 的 BLOCK_PREFIXES 里有 `cloud_`，
 *    保证标记本身不会被当成业务数据同步上去（否则会自我循环）。
 */
export const DIRTY_PREFIX = "cloud_pending_";
/** 一条标记在「本次会话」内最多重试这么多次；之后靠 online 事件 / 下次启动兜底 */
const MAX_RETRY = 6;
const RETRY_BASE = 2000;
const RETRY_MAX_DELAY = 60000;

const retryTimers = new Map();

function dirtyStorageKey(key) {
  return DIRTY_PREFIX + key;
}

function writeDirty(key, rec) {
  try {
    localStorage.setItem(dirtyStorageKey(key), JSON.stringify(rec));
  } catch (e) {
    console.warn(`[cloudState] 写未推送标记失败：${key}`, e);
  }
}

function readDirty(key) {
  try {
    const raw = localStorage.getItem(dirtyStorageKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDirty(key) {
  try {
    localStorage.removeItem(dirtyStorageKey(key));
  } catch {
    /* ignore */
  }
}

/** 所有「未推送成功」的业务键（不含前缀） */
function dirtyKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DIRTY_PREFIX)) out.push(k.slice(DIRTY_PREFIX.length));
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** 供调试 / 启动对账 / 测试查看还有哪些键没推上去 */
export function listDirty() {
  return dirtyKeys();
}

/**
 * 打标记。未登录时不打（没有可归账的账号，推上去只会污染别人的数据）。
 */
function markDirty(key, op, track = true) {
  if (!track) return;
  if (!authToken()) return;
  writeDirty(key, {
    op: op === "del" ? "del" : "set",
    n: 0,
    t: Date.now(),
    u: currentUser(),
  });
}

/** 重试时现读本地值（标记里不存值，避免大键被复制一份） */
function readLocalValue(key) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** 指数退避：n=0→2s, 1→4s, 2→8s, 3→16s, 4→32s, 5→60s（封顶） */
function retryDelay(n) {
  return Math.min(RETRY_BASE * Math.pow(2, Math.max(0, n)), RETRY_MAX_DELAY);
}

function clearRetryTimer(key) {
  const t = retryTimers.get(key);
  if (t !== undefined) {
    clearTimeout(t);
    retryTimers.delete(key);
  }
}

async function attempt(key, op, value, keepalive = false) {
  const res =
    op === "del"
      ? await request("DELETE", { key })
      : await request("POST", { key, value, keepalive });
  lastResults.set(key, res);
  return res;
}

function scheduleRetry(key) {
  if (retryTimers.has(key)) return;
  const rec = readDirty(key);
  if (!rec) return;
  const tries = rec.n || 0;
  // 本次会话重试够了就停手；标记留着，交给 online 事件 / 下次启动
  if (tries >= MAX_RETRY) return;
  const timer = setTimeout(() => {
    retryTimers.delete(key);
    void retryKey(key);
  }, retryDelay(tries));
  retryTimers.set(key, timer);
}

/**
 * 重推一条未推送成功的键。
 * @returns {Promise<boolean>} true = 已落地（推成功或确认无需再推）
 */
async function retryKey(key, keepalive = false) {
  const rec = readDirty(key);
  if (!rec) return true;

  // 换了账号：这条属于上一个账号，本次不推（新账号的 pull 会用自己的数据覆盖本地）
  if ((rec.u || "") !== currentUser()) return false;

  const op = rec.op === "del" ? "del" : "set";
  const value = op === "del" ? undefined : readLocalValue(key);

  // 本地已经没有这条键了 ⇒ 无从补推，标记作废
  if (op === "set" && value === undefined) {
    clearDirty(key);
    clearRetryTimer(key);
    return true;
  }

  const res = await attempt(key, op, value, keepalive);
  if (res.ok) {
    clearDirty(key);
    clearRetryTimer(key);
    return true;
  }
  if (res.error === "unauthorized") return false;

  // 失败：累加重试次数 + 再排一次
  writeDirty(key, { ...rec, n: (rec.n || 0) + 1, t: Date.now() });
  scheduleRetry(key);
  return false;
}

/**
 * 把当前账号所有「未推送成功」的键立刻重推一遍。
 * 调用时机：① 启动对账（**必须在云端覆盖本地之前**）② 浏览器 `online` 事件 ③ 页面卸载前。
 * 顺带把重试次数归零 —— 换了一次网络条件，理应重新给满次数。
 * @returns {Promise<{total:number, ok:number, left:number}>}
 */
export async function flushDirty(keepalive = false) {
  if (!authToken()) return { total: 0, ok: 0, left: dirtyKeys().length };

  const keys = dirtyKeys();
  let ok = 0;
  for (const key of keys) {
    const rec = readDirty(key);
    if (!rec) continue;
    // 归属别的账号 → 直接丢弃（本地数据是全账号共享的，留着只会污染新账号）
    if ((rec.u || "") !== currentUser()) {
      clearDirty(key);
      continue;
    }
    writeDirty(key, { ...rec, n: 0, t: Date.now() });
    clearRetryTimer(key);
    if (await retryKey(key, keepalive)) ok++;
  }
  return { total: keys.length, ok, left: dirtyKeys().length };
}

/** 删除一条云端数据（bin 文件也走这里） */
export async function cloudDel(key, opts = {}) {
  const res = await request("DELETE", { key });
  lastResults.set(key, res);
  if (res.ok) {
    clearDirty(key);
    return res;
  }
  if (res.error === "unauthorized") return res;
  console.warn(`[cloudState] 删除云端「${key}」失败：${res.message}`);
  markDirty(key, "del", opts.dirty !== false);
  if (opts.dirty !== false) scheduleRetry(key);
  return res;
}

// ==================== 写：防抖合并 ====================
const pendingTimers = new Map();
const pendingValues = new Map();
const lastResults = new Map();

async function flushKey(key, keepalive = false) {
  pendingTimers.delete(key);
  const entry = pendingValues.get(key);
  pendingValues.delete(key);
  if (!entry) return;

  const res = await attempt(key, entry.op, entry.value, keepalive);
  if (res.ok) {
    clearDirty(key);
    clearRetryTimer(key);
    return;
  }
  if (res.error === "unauthorized") {
    console.warn(`[cloudState] 跳过保存「${key}」：未登录`);
    return;
  }

  console.warn(`[cloudState] 保存「${key}」到云端失败：${res.message}（已留标记，稍后重试）`);
  markDirty(key, entry.op, entry.track);
  if (entry.track) scheduleRetry(key);
}

/**
 * 异步推送一条数据到云端（按 key 防抖合并，连写多次只发最后一版）。
 * 不返回 Promise、不抛异常 —— 调用方按「本地已存好」处理即可。
 * 失败不会丢：会留下 `cloud_pending_<key>` 标记并自动退避重试（见文件头说明）。
 *
 * @param {object} [opts]
 * @param {number} [opts.delay]  防抖窗口，默认 700ms
 * @param {boolean} [opts.dirty] 传 false 关掉「失败留标记 + 重试」。
 *        用于**值不存在于 localStorage** 的键（bin 文件的 base64），
 *        因为那类键重试时读不回原值，留标记没有意义。
 */
export function cloudSet(key, value, opts = {}) {
  const delay = typeof opts.delay === "number" ? opts.delay : WRITE_DELAY;
  pendingValues.set(key, {
    op: "set",
    value,
    track: opts.dirty !== false,
  });
  if (pendingTimers.has(key)) return;
  pendingTimers.set(
    key,
    setTimeout(() => {
      void flushKey(key);
    }, delay),
  );
}

/**
 * 立刻把排队中的写入全部发出去。
 * @param {boolean} keepalive 页面卸载时传 true —— 请求会在页面跳转/关闭后继续送达
 */
export function cloudFlush(keepalive = false) {
  const keys = [...pendingTimers.keys()];
  keys.forEach((k) => clearTimeout(pendingTimers.get(k)));
  return Promise.all(keys.map((k) => flushKey(k, keepalive)));
}

/** 最近一次写入结果（调试用） */
export function cloudLastResult(key) {
  return lastResults.get(key) || null;
}
