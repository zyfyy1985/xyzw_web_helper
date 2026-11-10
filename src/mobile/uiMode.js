/**
 * 新旧界面模式切换（移动端 UI 总开关）
 * mode: 'legacy'（旧版桌面界面） | 'mobile'（新版移动端界面）
 * 持久化：localStorage key = xyzw_ui_mode
 * 旧版页面与逻辑完全不动；本模块只决定入口走哪套壳。
 *
 * ★ 默认值（2026-11-10 定）：没选过时按设备分流 ——
 *   手机 / 平板 → mobile（新版），电脑 → legacy（旧版）。
 *   只要显式选过（存了 'mobile' / 'legacy'）就尊重用户，永不再按设备改写。
 *
 *   判定顺序（先 UA 再屏宽，两者都拿不到才退回 legacy）：
 *   ① 手机 UA：iPhone / iPod / Android 手机 / Windows Phone / 等等 → mobile；
 *   ② iPadOS 13+ 默认把 UA 伪装成 "Macintosh"，靠 maxTouchPoints > 1 认出来 → mobile
 *      （桌面 Mac 的 maxTouchPoints 是 0，不会误判）；
 *   ③ 剩下的按可视宽度兜底：< 768 → mobile（桌面浏览器拖窄、分屏、安卓平板竖屏都算），
 *      否则 legacy。
 *   ★ 为什么必须留 UA 这一层：iOS「添加到主屏幕」的 web app 与 Safari 存储隔离，
 *     主屏里 localStorage 永远是空的，只能靠 UA 认出这是手机。
 *   ★ 为什么电脑端不给新版：桌面宽度下移动壳是撑开的单列，表格类页面（排行榜 / 盐场）
 *     要靠旧版的宽表格才好看；用户在任一端都能手动切，切完写 key、以后不再被设备判定覆盖。
 */
import { reactive } from "vue";

const KEY = "xyzw_ui_mode";

/** 手机 / 平板 UA 判定（含伪装成 Mac 的 iPadOS） */
function isHandheld() {
  const ua = (navigator && navigator.userAgent) || "";
  if (/iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|BlackBerry|Mobile\b/i.test(ua)) {
    return true;
  }
  /* iPadOS 13+ 的 Safari 发的是 "Macintosh; Intel Mac OS X"，
     唯一可靠的差别是它有多点触控（桌面 Mac 的 maxTouchPoints 为 0）。 */
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1) return true;
  return false;
}

/** 没显式设置时的默认值：手机/平板 → mobile，电脑 → legacy */
function detectDefaultMode() {
  try {
    if (isHandheld()) return "mobile";
    const w = Math.min(
      window.innerWidth || 9999,
      (window.screen && window.screen.width) || 9999,
    );
    return w < 768 ? "mobile" : "legacy";
  } catch (e) {
    /* navigator / window 缺失（打包期、极老浏览器）→ 保守走旧版 */
    return "legacy";
  }
}

function readMode() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "mobile" || saved === "legacy") return saved; // 显式选过，尊重用户
  } catch (e) {
    /* 存储不可用时走设备判定 */
  }
  return detectDefaultMode();
}

export const uiMode = reactive({
  mode: readMode(),
});

export function isMobileMode() {
  return uiMode.mode === "mobile";
}

export function switchUiMode(mode) {
  uiMode.mode = mode === "mobile" ? "mobile" : "legacy";
  try {
    localStorage.setItem(KEY, uiMode.mode);
  } catch (e) {
    /* 忽略写入失败（隐私模式等） */
  }
}

export default { uiMode, isMobileMode, switchUiMode };
