/* 站内确认框的唯一入口。
 *
 * 全站原来有 13 处用了一个浏览器原生 confirm()、剩下十几处各写各的 dialog.xxx：
 * 有的确认键是默认蓝、有的是 Naive 的 error 红(#d03050) 而不走站内 --m-red，
 * 有的带右上角 X 有的不带 —— 同一种「确认删除」长得都不一样。
 * 这里收成两个口径：
 *   confirmDanger  —— 破坏性（删除 / 清除 / 踢出）：warning 图标 + 确认键红色
 *   confirmAction  —— 非破坏性（刷新 / 覆盖 / 升级）：确认键走唯一行动蓝
 * 两者都不带 X：卡片底部已经有「取消」，右上角再来一个就是重复动作。
 * 按钮尺寸 / 等宽 / 暗色字色由 mobile.css 的 `body.m-mobile .n-dialog ...` 统一收口。
 */
import { h } from "vue";

/* 正文 = 一句说明 + 一块 band 账目。
 * 原来只有一整段长句（「将删除 X，它配置的 2 个账号 / 2 个任务不会被删除」），
 * 而删东西时最该看清的三件事 —— 删的是什么、动几个账号、动几项任务 —— 全糊在句子里。
 * 说明句降成 --m-text2，影响面拆成账目行（和任务设置弹窗同一套读法）。 */
const renderContent = (content, details) => {
  if (!details || !details.length) return content;
  return h("div", { class: "m-cf" }, [
    content ? h("p", { class: "m-cf-lead" }, content) : null,
    h(
      "div",
      { class: "m-cf-band" },
      details.map((d) =>
        h("div", { class: "m-cf-row" }, [
          h("span", { class: "m-cf-k" }, d.label),
          h("span", { class: "m-cf-v" }, d.value),
        ]),
      ),
    ),
  ]);
};

const base = ({
  title,
  content,
  details,
  positiveText,
  negativeText = "取消",
  onPositiveClick,
  onNegativeClick,
}) => ({
  title,
  /* ★ Naive 的 DialogOptions.content 只认 string | (() => VNodeChild)：
     直接塞一个裸 VNode 进去不会渲染，弹窗里只剩标题和两个按钮（踩过）。
     有账目时才包成函数，纯文本继续走 string，少一层渲染。 */
  content:
    details && details.length ? () => renderContent(content, details) : content,
  positiveText,
  negativeText,
  closable: false,
  onPositiveClick,
  onNegativeClick,
});

export function confirmDanger(dialog, opts) {
  return dialog.warning({
    ...base({ positiveText: "删除", ...opts }),
    positiveButtonProps: { type: "error" },
  });
}

export function confirmAction(dialog, opts) {
  return dialog.warning({
    ...base({ positiveText: "确定", ...opts }),
    positiveButtonProps: { type: "primary" },
  });
}
