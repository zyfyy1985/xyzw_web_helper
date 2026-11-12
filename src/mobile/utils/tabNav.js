/* 回到某个 tab 的入口页 —— 「回同一层」的跳转唯一入口
 * （底部 tab 点击、Token 管理页的「进入控制台」这类）。
 *
 * 为什么不能一律 push：底部 tab 是同一层的切换，push 会让历史栈变成 [A, B, A]，
 * 来回切几次就要连按好几次返回才退得出去。
 * 为什么不能一律 replace：replace 只换栈顶，[首页, 批量任务] 点首页 tab 之后栈变成
 * [首页, 批量任务, 首页]，再点批量任务又长一格 —— 每来回一次长一格，同样退不出去。
 *
 * 所以：上一格正好是目标入口 ⇒ 退一格（不新增任何条目）；否则 replace 栈顶。
 * 浏览器不允许删除历史条目，「退一格 + replace」是能做到的最小栈深度。
 * 真正「进入下一层」的跳转（宫格 ?panel= / 多开 / Token 管理 / 批量任务）仍走 push，
 * 返回才能逐层退回 —— 别把这个函数用在那类地方。
 */

/** history.state.back 是完整 URL（可能带 base 前缀与 query/hash），只比较路由路径 */
const locPath = (u) => String(u).split("?")[0].split("#")[0];

/** 上一格是不是 path（忽略 query / hash / base 前缀） */
export function backIs(path) {
  const back = window.history.state && window.history.state.back;
  if (typeof back !== "string" || !back) return false;
  const p = locPath(back);
  return p === path || p.endsWith(path);
}

/** 上一次 back 已发出但还没落地时的记认（见 goTabRoot 里的说明） */
let pendingBack = null;

/** 回到 tab 入口：能不新增历史条目就不新增 */
export function goTabRoot(router, path) {
  /* history.back() 是异步的：popstate 落地之前 history.state 还是旧条目，
     此时再点一次同一个 tab 会判成「backIs 仍为真」→ 再退一格，一口气退过头
     （连点两下的手机上真会发生）。所以记一笔「back 已发出但还没落地」，
     落到新地址后 here 变化，自动失效；万一没落地，500ms 后也自动过期。 */
  const here = location.pathname + location.search;
  if (pendingBack && pendingBack.from === here && Date.now() - pendingBack.at < 500) return;
  if (backIs(path)) {
    pendingBack = { from: here, at: Date.now() };
    router.back();
  } else {
    pendingBack = null;
    router.replace(path);
  }
}
