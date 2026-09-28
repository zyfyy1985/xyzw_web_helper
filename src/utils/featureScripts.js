// 内置 H5 功能脚本清单 + 勾选记录（localStorage）
// 记录 key: h5_enabled_features，值为 id（文件名）数组
// 用户从未选择过时，只默认开启「长按连点」，其余全部关闭

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
    id: "阵容显示.js",
    name: "阵容显示",
    description: "在盐场与蟠桃队伍列表中识别并显示真实阵容类型",
    version: "1.4.0",
  },
  {
    id: "标记攻击.js",
    name: "标记攻击",
    description:
      "驻守时自动挑战：两种模式 ——「精准锁定」只打锁定名单里的人，「无差别攻击」有目标就发；",
    version: "2.31.1",
  },
  {
    id: "账号切换.js",
    name: "账号切换",
    description: "游戏内账号切换登录器：显示当前账号与启动列表，支持切换（当前窗口换号）/刷新（重开当前账号）/新标签页启动/移除启动列表账号；标签页标题同步为角色名",
    version: "1.1.0",
  },
];

const STORAGE_KEY = "h5_enabled_features";

// 用户未做过选择时的默认开启项
const DEFAULT_FEATURES = ["账号切换.js"];

/** 读取勾选记录；无记录 / 记录损坏时返回默认项。
 *  是否加载「账号切换」完全由用户勾选决定，不做强制并入。 */
export function getEnabledFeatures() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(raw)) {
      return FEATURE_SCRIPTS.map((f) => f.id).filter((id) => raw.includes(id));
    }
  } catch (e) {
    /* 记录损坏，按首次使用处理 */
  }
  return DEFAULT_FEATURES.slice();
}

/** 写入勾选记录 */
export function setEnabledFeatures(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}
