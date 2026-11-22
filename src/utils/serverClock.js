/**
 * 服务器时间（单调对齐）
 *
 * 为什么需要：游戏里所有倒计时（挂机、盐罐、功法探索）都不是服务端算好给你的，
 * 而是客户端拿「开始时刻 / 结束时刻」+ 自己的 `serverTime` 现算。游戏包里的
 * `serverTime` 并不是 `Date.now()`：
 *
 *     serverTime = syncServerTime + Date.now() - 同步瞬间的 Date.now()
 *
 * 其中 `syncServerTime` 由**每一条下行报文的 `time` 字段**刷新（`doReceiveMsg` 里
 * `e.time && (O.serverTime = e.time)`）。也就是说游戏用的始终是「服务器时间 + 本地流逝」，
 * 手机系统时钟偏了几分钟，游戏面板也不会歪。
 *
 * 我们如果直接 `Date.now()`，手机时钟一偏，面板和页面就会差出那段偏移 ——
 * 表现就是「两个时间不一样」，但代码一处都没算错。这里做同样的事：
 * 记录一次 `time`，之后用 `Date.now()` 补流逝量。
 *
 * ★ 单位：`time` 是**毫秒**（游戏里拿它和 `Date.now()` 直接比、和 `1e3 × 秒` 相加）。
 *   这里仍然兜一层秒级，避免某个协议版本换成秒后整站时间放大 1000 倍。
 */

/** 服务器时间 - 本地时间（毫秒） */
let offsetMs = 0;
/** 最近一次对齐的时刻（本地毫秒），0 = 从没对齐过 */
let syncedAt = 0;

/** 合理区间：2020-01-01 ~ 2100-01-01（毫秒），超出视为脏数据直接丢 */
const MIN_MS = 1577836800000;
const MAX_MS = 4102444800000;

/**
 * 用一条下行报文的 `time` 对齐服务器时间。传 0 / undefined / 脏值都安全（直接忽略）。
 * @param {number|string} t 报文里的服务器时间
 */
export const noteServerTime = (t) => {
  const raw = Number(t);
  if (!Number.isFinite(raw) || raw <= 0) return;
  const ms = raw > 1e11 ? raw : raw * 1000; // > 1e11 秒 ≈ 公元 5138 年 ⇒ 只能是毫秒
  if (ms < MIN_MS || ms > MAX_MS) return;
  offsetMs = ms - Date.now();
  syncedAt = Date.now();
};

/** 服务器当前时间（毫秒）。没对齐过时等价于本地时间 */
export const serverNowMs = () => Date.now() + offsetMs;

/** 服务器当前时间（秒，整数）。倒计时都用它 */
export const serverNowSec = () => Math.floor(serverNowMs() / 1000);

/** 调试用：看偏移量有多大（手机时钟准不准一眼就知道） */
export const serverClockInfo = () => ({
  offsetMs,
  offsetSec: Math.round(offsetMs / 1000),
  syncedAt,
  synced: syncedAt > 0,
});

/** 退出登录 / 换号时复位，避免把上一个号的偏移带过去 */
export const resetServerClock = () => {
  offsetMs = 0;
  syncedAt = 0;
};
