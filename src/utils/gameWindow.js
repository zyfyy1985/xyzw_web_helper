/**
 * 用「指定大小的独立窗口」打开游戏。
 *
 * 这就是怪兽脚本那种「点开始游戏，单独弹一个手机比例的窗口」的做法：
 * 它没有 Electron / 打包，就是 `window.open(url, name, "width=…,height=…,popup=yes")`
 * —— Chromium 对这种带 features 的 window.open 会开一个**没有标签栏**的弹窗，
 * 只剩标题栏 + 地址栏，所以看起来像个小应用。
 *
 * ★★ 三个必须遵守的点（踩过就知道）：
 *   1. **必须在点击事件的同步栈里调用**。`await` 之后再 window.open，会被弹窗拦截器
 *      当成广告拦掉（返回 null）。需要先异步取 BIN 的场合：先开一个空窗拿句柄，
 *      异步准备好再改 `win.location`。
 *   2. 跨窗口写 `location.href` 时**必须是绝对地址**：about:blank 的 base 不是本站，
 *      写相对路径会解析到 about:blank 上去。
 *   3. 同名窗口已存在时 window.open 会**复用并导航**，但 features 里的尺寸会被忽略，
 *      所以复用时要显式 `win.resizeTo(w, h)`。
 *   4. 「是不是手机」只认 UA，不能认 innerWidth —— 游戏本身就跑在 480 宽的小窗里，
 *      按宽度判断会让小窗里的自己以为自己是手机，于是永远只会开新标签页。
 *
 * 想在 PC 上连地址栏都去掉（完全像客户端）：用 Edge/Chrome 的应用窗口模式启动
 *   msedge --app=http://localhost:3000/game --window-size=480,940
 * 或者把它「安装为应用」（PWA 的 display: standalone）。
 */

/** 默认窗口尺寸：480 宽 ≈ 手机 1080P 的等比缩，高度给到浏览器边框后内容约 850 */
export const GAME_WIN_SIZE = { width: 480, height: 940 };

/**
 * 手机判定：★ 不能用 innerWidth —— 游戏本身就跑在一个 480 宽的小窗里，
 * 按宽度判断会「自己在小窗里 ⇒ 以为自己是手机 ⇒ 只会开新标签页」（11-01 踩到）。
 * 只认设备：手机 / 平板才退化成页内跳转，桌面浏览器哪怕窗口很窄也照样开小窗。
 */
function isPhoneDevice() {
  try {
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPod|Windows Phone|HarmonyOS|Mobile/i.test(ua)) return true;
    /* iPadOS 13+ 的 UA 伪装成桌面 Mac：靠触点数认 */
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  } catch (e) {
    /* 拿不到 UA 就当桌面，宁可开小窗也不要退化成标签页 */
  }
  return false;
}

/** 窗口名。★★ 必须带账号 key：固定名字会让第二个账号「开在第一个窗口里」 */
const WIN_NAME = "xyzw_game";

/** 只保留字母数字下划线，避免奇怪的 bin_id 把窗口名搞坏 */
const safeKey = (k) =>
  String(k ?? "")
    .replace(/[^\w-]/g, "")
    .slice(0, 40);

const abs = (url) => {
  try {
    return new URL(url || "about:blank", window.location.href).href;
  } catch (e) {
    return "about:blank";
  }
};

/** 把弹窗摆在父窗口正中（超出屏幕就贴边，别飞到屏幕外） */
function centerOf(width, height) {
  const sw = window.screen?.availWidth || window.screen?.width || width;
  const sh = window.screen?.availHeight || window.screen?.height || height;
  const px = Number.isFinite(window.screenLeft) ? window.screenLeft : window.screenX || 0;
  const py = Number.isFinite(window.screenTop) ? window.screenTop : window.screenY || 0;
  const ow = window.outerWidth || width;
  const oh = window.outerHeight || height;
  const clamp = (v, max) => Math.max(0, Math.min(Math.round(v), Math.max(0, max)));
  return {
    left: clamp(px + (ow - width) / 2, sw - width),
    top: clamp(py + (oh - height) / 2, sh - height),
  };
}

/**
 * 打开 / 复用游戏窗口。
 * @param {string} [url] 目标地址，省略则先开 about:blank（异步准备完再赋值）
 * @param {{width?:number,height?:number,key?:string|number}} [opts]
 *        key = 账号标识（bin_id）。★ 不同 key 开不同窗口，同 key 才会复用/聚焦。
 * @returns {Window|null} 窗口句柄；**返回 null 表示没开**（手机 / 平板，或被拦截），调用方自行退回页内跳转
 */
export function openGameWindow(url, opts = {}) {
  if (typeof window === "undefined") return null;
  if (isPhoneDevice()) return null;

  const key = safeKey(opts.key);
  const name = key ? `${WIN_NAME}_${key}` : WIN_NAME;
  const width = Math.round(opts.width || GAME_WIN_SIZE.width);
  const height = Math.round(opts.height || GAME_WIN_SIZE.height);
  const { left, top } = centerOf(width, height);
  const features = [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "menubar=no",
    "toolbar=no",
    "status=no",
    "location=yes",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");

  let win = null;
  try {
    win = window.open(abs(url), name, features);
  } catch (e) {
    win = null;
  }
  if (!win) return null;

  /* 复用旧窗口时 features 里的尺寸不生效，这里补一刀；用户手动拉过大小也会被拉回 */
  const offSize =
    (win.outerWidth && win.outerWidth !== width) ||
    (win.outerHeight && win.outerHeight !== height);
  if (offSize) {
    try {
      win.resizeTo(width, height);
    } catch (e) {
      /* 跨域 / 被浏览器忽略，无副作用 */
    }
  }
  try {
    win.focus();
  } catch (e) {
    /* 同上 */
  }
  return win;
}

/** 把已经开着的窗口导航到目标页（配合 openGameWindow() 先开空窗用） */
export function navigateGameWindow(win, url) {
  const href = abs(url);
  try {
    win.location.replace(href);
  } catch (e) {
    try {
      win.location.href = href;
    } catch (err) {
      /* 窗口已被关闭 */
    }
  }
}
