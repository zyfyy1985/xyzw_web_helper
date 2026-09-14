// 内置 H5 功能脚本清单 + 勾选记录（localStorage）
// 记录 key: h5_enabled_features，值为 id（文件名）数组；首次使用默认全选

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
    version: "1.0.0",
  },
];

const STORAGE_KEY = "h5_enabled_features";

/** 读取勾选记录；无记录 / 记录损坏时默认全选 */
export function getEnabledFeatures() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(raw)) {
      return FEATURE_SCRIPTS.map((f) => f.id).filter((id) => raw.includes(id));
    }
  } catch (e) {
    /* 记录损坏，按首次使用处理 */
  }
  return FEATURE_SCRIPTS.map((f) => f.id);
}

/** 写入勾选记录 */
export function setEnabledFeatures(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}
