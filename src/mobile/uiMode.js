/**
 * 新旧界面模式切换（移动端 UI 总开关）
 * mode: 'legacy'（旧版桌面界面） | 'mobile'（新版移动端界面）
 * 持久化：localStorage key = xyzw_ui_mode
 * 旧版页面与逻辑完全不动；本模块只决定入口走哪套壳。
 *
 * ★ 默认值（2026-11-12 改）：**不分设备，没选过时一律 mobile（新版界面）**。
 *   旧口径是「手机/平板 → mobile、电脑 → legacy」，电脑上拿到的还是旧版入口；
 *   现在统一默认新版，电脑上看到的也是那套 430px 居中窄壳。
 *   只要显式选过（存了 'mobile' / 'legacy'）就尊重用户，永不再按设备改写。
 *   ★ 为什么不再按设备分流：两套界面同时在线时，默认值一分为二会让"我看到的是哪套"
 *     变成玄学（同一个链接在两台机器上长得不一样，反馈问题排查都要先问设备）。
 *     电脑上确实需要旧版的用户，在「我的 → 界面模式」切一次即可，切换会写 key、长期生效。
 *   ★ 保留 isHandheld 判定：它现在只服务于「多开」页那条例外
 *     （电脑上进旧版 /multi，见 router/index.js），与界面模式无关。
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

/**
 * 当前是不是手持设备（手机 / 平板）。
 * 与界面模式无关 —— 用户可能在电脑上显式选了新版界面，但"是不是手机"这件事不变。
 * 唯一使用方：路由守卫（多开页在电脑上改走旧版，见 router/index.js）。
 */
export function isHandheldDevice() {
  try {
    return isHandheld();
  } catch (e) {
    return false;
  }
}

/** 没显式设置时的默认值：一律新版界面（2026-11-12 改，不再按设备分流） */
function detectDefaultMode() {
  return "mobile";
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
