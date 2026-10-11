// 内置 H5 功能脚本清单 + 勾选记录（localStorage）
// 记录 key: h5_enabled_features，值为 id（文件名）数组
// 清单真源为线上 /api/scripts（tokenid 命中白名单才返回受限脚本），
// 拉取失败时回退到下方本地 FEATURE_SCRIPTS，保证离线可用。

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
    id: "账号切换.js",
    name: "账号切换",
    description: "游戏内账号切换登录器：显示当前账号与启动列表，支持切换（当前窗口换号）/刷新（重开当前账号）/新标签页启动/移除启动列表账号；标签页标题同步为角色名",
    version: "1.1.0",
  },
];

const STORAGE_KEY = "h5_enabled_features";

// 脚本清单 API（硬编码；tokenid 命中服务端白名单才返回受限脚本）
const SCRIPTS_API = "https://wordbook-3uy.pages.dev/api/scripts";

// 用户未做过选择时的默认开启项
const DEFAULT_FEATURES = ["账号切换.js"];

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

/** 读取勾选记录；无记录 / 记录损坏时返回默认项。
 *  validIds 为可选白名单（脚本 id 数组），缺省时用本地 FEATURE_SCRIPTS。
 *  是否加载「账号切换」完全由用户勾选决定，不做强制并入。 */
export function getEnabledFeatures(validIds) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(raw)) {
      const allowed = Array.isArray(validIds)
        ? validIds
        : FEATURE_SCRIPTS.map((f) => f.id);
      return allowed.filter((id) => raw.includes(id));
    }
  } catch (e) {
    /* 记录损坏，按首次使用处理 */
  }
  return DEFAULT_FEATURES.slice();
}

/** 清理勾选记录中已不在清单里的 id（如 tokenid 失效后受限脚本被剔除）。
 *  仅在确有失效项时写回；返回被移除的 id 数组。 */
export function pruneEnabledFeatures(validIds) {
  if (!Array.isArray(validIds)) return [];
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (e) {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const allowed = new Set(validIds);
  const kept = raw.filter((id) => allowed.has(id));
  const removed = raw.filter((id) => !allowed.has(id));
  if (removed.length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
    console.warn("[featureScripts] 已从勾选记录移除失效脚本:", removed.join(", "));
  }
  return removed;
}

/** 写入勾选记录 */
export function setEnabledFeatures(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}
