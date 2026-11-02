/**
 * 主题换肤（skin）—— 与深浅色（theme）正交的第二层外观。
 *
 * 【为什么单独一个属性】
 * 深浅色由 html[data-theme="dark"] 驱动（main.js 的 applyTheme），
 * 皮肤若塞进同一个属性，切皮肤就等于把暗色关掉。所以皮肤挂 html[data-skin="<id>"]，
 * 两者可任意组合：浅色+薄荷青、深色+薰衣草紫 都能成立。
 *
 * 【配色来源】
 * 主体参考背单词 app/src/main/java/com/example/vocab/ui/theme/ThemePalette.kt（薄荷青 / 海盐蓝 /
 * 薰衣草紫），另加本站自有「经典蓝」（默认）与后补的「石墨灰」「琥珀金」——
 * 那三套是全冷色之外的中性与暖色补充。亮/暗各一套，落在 skins.css 覆盖 --m-primary 一族。
 * 首项「经典蓝」= 本站原有配色（data-skin="blue" 不写任何覆盖规则），
 * 保证没选过的用户观感与换肤前完全一致。
 *
 * 【为什么用 ref 而不是每次读 localStorage】
 * 选择页与「我的」页要即时反映当前皮肤；同页切换时 DOM 已按 dataset 变了，
 * 但 Vue 的文案（「当前：薄荷青」）需要响应式来源，否则要刷新才变。
 */
import { computed, ref } from "vue";

/**
 * 可选皮肤。色卡预览色不写在这里 —— 取 skins.css 的 --sk-<id>-1 / -2，
 * 与真正生效的 --m-primary 同一个源（生成脚本算出来的），避免「色卡比实际亮」。
 *
 * 顺序按色相排一圈（红 → 暖 → 中性 → 青 → 蓝 → 靛 → 紫 → 品红），
 * 选择页是 3 列栅格，9 套正好 3×3 排满。
 *
 * 2026-11-02：移除「经典蓝」（它就是 :root 原值，作为皮肤没有实际内容，
 * 且默认皮肤不该是「没有覆盖」这一档）；默认改为「海盐蓝」。
 * 老用户 localStorage 里如果还存着 "blue"，isValid 判非法 → 自动落到 DEFAULT_SKIN，
 * 不需要写迁移。新增 胭脂 / 群青 / 莓紫 / 深松 四套。
 */
export const SKINS = [
  { id: "rouge", label: "胭脂" },
  { id: "amber", label: "琥珀金" },
  { id: "graphite", label: "石墨灰" },
  { id: "mint", label: "薄荷青" },
  { id: "petrol", label: "深松" },
  { id: "ocean", label: "海盐蓝" },
  { id: "ultramarine", label: "群青" },
  { id: "lavender", label: "薰衣草紫" },
  { id: "mulberry", label: "莓紫" },
];

/** 色卡两块色：n=1 主色（按钮/高亮）、n=2 副色（只做点缀） */
export const skinSwatch = (id, n) => `var(--sk-${id}-${n})`;

/* 默认皮肤：深松（petrol）—— 2026-11-02 上线定的。
   此前的默认是「经典蓝」，已随该皮肤一起移除；海盐蓝曾短暂接棒，最终选深松：
   它是最暗的一套（夜里不刺眼），且离语义绿/行动蓝都有一段色相距离。 */
export const DEFAULT_SKIN = "petrol";

/* 独立 key：与深浅色的 "theme" 分开，互不覆盖（localStorageCloudSync 会照常同步这个 key） */
const STORAGE_KEY = "xyzw_m_skin";

const isValid = (id) => SKINS.some((s) => s.id === id);

function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isValid(saved) ? saved : DEFAULT_SKIN;
  } catch {
    /* 隐私模式禁用 localStorage：不抛错，直接用默认皮肤 */
    return DEFAULT_SKIN;
  }
}

const currentSkin = ref(readSaved());

/**
 * 应用皮肤：写 dataset（CSS 从这里取值）+ 落盘。
 * 幂等，可在启动时无脑调一次。
 * @param {string} [id] 皮肤 id；**不传 = 沿用当前值**（启动时那一次必须不传，
 *   否则会把用户存下的皮肤按「非法值」重置回默认蓝 —— 真踩过）
 */
export function applySkin(id = currentSkin.value) {
  const next = isValid(id) ? id : DEFAULT_SKIN;
  currentSkin.value = next;
  document.documentElement.setAttribute("data-skin", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* 同上：写不进去只影响下次启动的默认值，不影响本次生效 */
  }
}

/** 组件里用：{ skinId, skin, skins, setSkin } */
export function useSkin() {
  return {
    skins: SKINS,
    skinId: currentSkin,
    skin: computed(() => SKINS.find((s) => s.id === currentSkin.value) || SKINS[0]),
    setSkin: applySkin,
  };
}
