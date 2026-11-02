/**
 * 新旧界面模式切换（移动端 UI 总开关）
 * mode: 'legacy'（旧版桌面界面） | 'mobile'（新版移动端界面）
 * 持久化：localStorage key = xyzw_ui_mode
 * 旧版页面与逻辑完全不动；本模块只决定入口走哪套壳。
 *
 * ★ 默认值：**没选过的一律走新版（mobile）**。2026-11-02 上线前定的口径 ——
 *   「如果用户没有选择过旧界面，统一默认为新界面风格」。
 *   只要显式选过（存了 'mobile' / 'legacy'）就尊重用户，永不再改。
 *
 *   上一版是按设备判定的（iPhone/Android/窄屏 → mobile，其余 → legacy），
 *   两个理由都不再成立：
 *   ① iOS「添加到主屏幕」的 web app 与 Safari 存储完全隔离，主屏里永远空 localStorage，
 *      旧逻辑靠 UA 兜；现在默认就是 mobile，比 UA 判定更准（iPad 报 iPad 也能进新版）；
 *   ② 上线后希望新用户统一看到新界面，而不是按屏幕宽度分裂成两套体验。
 *   想回旧版的用户仍可在「我的 → 外观」或桌面端「设置 → 界面模式」切回去（那边会写 key）。
 */
import { reactive } from "vue";

const KEY = "xyzw_ui_mode";

/** 没显式设置时的默认值：新版界面 */
const DEFAULT_MODE = "mobile";

function readMode() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "mobile" || saved === "legacy") return saved; // 显式选过，尊重用户
  } catch (e) {
    /* 存储不可用时走默认 */
  }
  return DEFAULT_MODE;
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
