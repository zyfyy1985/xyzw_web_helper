// 内置 H5 功能脚本清单 + 勾选记录（localStorage）
// 记录 key: h5_enabled_features，值为 { [tokenid]: id(文件名)[] } —— 按 tokenid 隔离，
// 避免换 token 后沿用上一个 token 的勾选（把受限脚本带给无权限的 token，越权）。
// 清单真源为线上 /api/scripts（tokenid 命中白名单才返回受限脚本），
// 拉取失败时回退到下方本地 FEATURE_SCRIPTS，保证离线可用。

import { api } from "./endpoints";

export const FEATURE_SCRIPTS = [
  {
    id: "模拟战斗.js",
    name: "模拟战斗",
    description: "",
    version: "",
  },
  {
    id: "自动蟠桃.js",
    name: "自动蟠桃",
    description: "在蟠桃园提供自动布阵和自动上船操作",
    version: "1.0.0",
  },
  {
    id: "长按连点.js",
    name: "长按连点",
    description: "长按游戏画面后自动连续点击，松手立即停止",
    version: "1.0.0",
  },

  {
    id: "战斗增强.js",
    name: "战斗增强",
    description: "仅在切磋战斗中，于武将头顶一行一个实时显示：血/盾/怒/攻（实时值=(面板+绝对值)×(光环+比率)+战斗内绝对值）/防/益负buff计数/增减伤（一行，buff 增量口径）/治疗（buff 增量口径，= 治疗加成−受疗降低）/本场累计 灼烧·中毒·流血·格挡次数（DOT=buff 实例累计；格挡=飘字入队点 hook 精确计数）；头顶最多同时显示 5 项（满后置灰）；面板三段式（显示目标/实时数据/本场统计）；三级定位战斗（公开 API → 服务端工厂 → 血条板/飘字 hook 实体 BFS，开场即出数字）；内置诊断浮层（?beDiag=1 或 api.setDiag(true)，含怪异咸将塔跳过开关只读探针（平台名/开关 Map/服务端下发值）+ 执行链零侵入观测（包裹 optimizeBattle/tryBattle 记次数/耗时/异常/totalFrame，不改语义）+ 怪异塔「自动跳过」兜底：老引擎组参时丢掉 endTime ⇒ 在工厂层补回（脚本加载即生效，不必开启面板；?beNoSkipFix=1 关闭））；色条包住文字宽度并居中；面板加载时默认收起，设置按账号隔离",
    version: "3.7.17",
  },
  {
    id: "账号切换.js",
    name: "账号切换",
    description: "游戏内账号切换登录器：显示当前账号与启动列表，支持切换（当前窗口换号）/刷新（重开当前账号）/新标签页启动/移除启动列表账号；标签页标题同步为角色名",
    version: "1.1.0",
  },
];

const STORAGE_KEY = "h5_enabled_features";

// 脚本清单 API —— 地址跟随 ./endpoints（与 /api/auth、/api/state 同一个后端）
// tokenid 命中服务端白名单才返回受限脚本
const SCRIPTS_API = api("/api/scripts");

// 用户未做过选择时的默认开启项
const DEFAULT_FEATURES = ["账号切换.js"];

function readRecord() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (e) {
    return undefined; // 记录损坏
  }
}

function isMap(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 拉取线上脚本清单；tokenid 缺省 / 未命中白名单时服务端自动剔除受限脚本。
 *  任何异常（网络 / 非 200 / 结构不符）都回退到本地 FEATURE_SCRIPTS。 */
export async function fetchFeatureScripts(tokenid) {
  try {
    const qs = tokenid ? "?tokenid=" + encodeURIComponent(tokenid) : "";
    const res = await fetch(SCRIPTS_API + qs);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) throw new Error("清单为空");
    const valid = list.filter((s) => s && typeof s.id === "string" && s.id);
    if (!valid.length) throw new Error("清单无有效条目");
    return valid;
  } catch (e) {
    console.warn("[featureScripts] 拉取线上脚本清单失败，回退本地清单:", e);
    return FEATURE_SCRIPTS.slice();
  }
}

/** 读取当前 token 的勾选记录；无记录 / 记录损坏 / 旧扁平格式（不可信，可能混入
 *  其他 token 勾选的受限脚本）时返回默认项。
 *  validIds 为可选白名单（脚本 id 数组），缺省时用本地 FEATURE_SCRIPTS。
 *  是否加载「账号切换」完全由用户勾选决定，不做强制并入。 */
export function getEnabledFeatures(validIds, tokenid) {
  const raw = readRecord();
  if (isMap(raw) && tokenid && Array.isArray(raw[tokenid])) {
    const allowed = Array.isArray(validIds)
      ? validIds
      : FEATURE_SCRIPTS.map((f) => f.id);
    const set = new Set(raw[tokenid].filter((id) => typeof id === "string"));
    return allowed.filter((id) => set.has(id));
  }
  return DEFAULT_FEATURES.slice();
}

/** 清理当前 token 勾选记录中已不在清单里的 id（如 tokenid 失效后受限脚本被剔除）。
 *  只修剪当前 token 的条目，其他 token 不动；空数组会保留 = 显式「全不勾」
 *  （区别于条目缺失 → 默认项）。
 *  兼容迁移：读到旧扁平数组（全局无隔离的格式）时，与服务端清单取交集后归属到
 *  当前 token 并移除旧值 —— 交集保证不会把受限脚本迁给无权限的 token。
 *  仅在确有改动时写回；返回被移除的 id 数组。 */
export function pruneEnabledFeatures(validIds, tokenid) {
  if (!Array.isArray(validIds) || !tokenid) return [];
  const raw = readRecord();
  const allowed = new Set(validIds);

  if (Array.isArray(raw)) {
    // 旧扁平格式 → 迁移（此路径必在拿到服务端清单后才会走到，迁移是权限安全的）
    const removed = raw.filter((id) => !allowed.has(id));
    const record = { [tokenid]: raw.filter((id) => allowed.has(id)) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    if (removed.length) {
      console.warn(
        "[featureScripts] 迁移旧勾选记录时移除失效脚本:",
        removed.join(", ")
      );
    }
    return removed;
  }

  if (!isMap(raw) || !Array.isArray(raw[tokenid])) return [];
  const entry = raw[tokenid].filter((id) => typeof id === "string");
  const kept = entry.filter((id) => allowed.has(id));
  const removed = entry.filter((id) => !allowed.has(id));
  if (removed.length) {
    raw[tokenid] = kept; // 空数组保留 = 显式全不勾
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    console.warn("[featureScripts] 已从勾选记录移除失效脚本:", removed.join(", "));
  }
  return removed;
}

/** 写入当前 token 的勾选记录（其他 token 条目不动） */
export function setEnabledFeatures(ids, tokenid) {
  if (!tokenid) return;
  const raw = readRecord();
  const record = isMap(raw) ? raw : {};
  record[tokenid] = Array.isArray(ids)
    ? ids.filter((id) => typeof id === "string")
    : [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}
