// 内置 H5 功能脚本清单 + 勾选记录（localStorage）
// 记录 key: h5_enabled_features，值为 id（文件名）数组
// 用户从未选择过时，只默认开启「长按连点」，其余全部关闭

export const FEATURE_SCRIPTS = [
  {
    id: "Monster.js",
    name: "游戏助手",
    description: "游戏功能助手",
    version: "1.0.0",
  },
  {
    id: "咸鱼简报迁移.js",
    name: "咸鱼简报迁移",
    description: "将仓库中的咸鱼简报入口迁移到英雄页底部按钮栏",
    version: "1.0.0",
  },
  {
    id: "宠物-自动合成.js",
    name: "宠物蛋自动开启合成",
    description: "在宠物界面增加自动开蛋合成和图鉴激活领奖按钮",
    version: "1.0.0",
  },
  {
    id: "模拟战斗.js",
    name: "模拟战斗",
    description: "",
    version: "",
  },
  {
    id: "盐场视距.js",
    name: "盐场视距",
    description: "",
    version: "",
  },
  {
    id: "自动星级挑战.js",
    name: "自动星级挑战",
    description: "在星级挑战面板增加原生自动挑战按钮。",
    version: "",
  },
  {
    id: "自动蟠桃.js",
    name: "自动蟠桃",
    description: "在蟠桃园提供自动布阵和自动上船操作",
    version: "1.0.0",
  },
  {
    id: "装备洗练消耗显示.js",
    name: "装备洗练消耗显示",
    description: "在装备洗练对话框居中显示当前白玉/彩玉图标与已用数量",
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
    version: "1.3.5",
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
 *  账号切换登录器是基础能力：无论勾选记录如何，始终包含。 */
export function getEnabledFeatures() {
  const base = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(raw)) {
        return FEATURE_SCRIPTS.map((f) => f.id).filter((id) => raw.includes(id));
      }
    } catch (e) {
      /* 记录损坏，按首次使用处理 */
    }
    return DEFAULT_FEATURES.slice();
  })();
  return base.includes("账号切换.js")
    ? base
    : [...base, "账号切换.js"];
}

/** 写入勾选记录 */
export function setEnabledFeatures(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}
