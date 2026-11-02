<template>
  <div class="m-pane m-desk m-monthly">
    <MonthlyTasksCard />
  </div>
</template>

<script setup>
/* ============================================================
 * 月度任务（移动端宿主）
 * 复用 src/components/cards/MonthlyTasksCard.vue，逻辑一行不改：
 *   · 钓鱼 / 竞技场进度、补齐规则、下发 topUpMonthly、下拉「一键完成」全在组件里
 *   · 组件对 gameData 用可选链，且数据靠 ws 状态触发，无需就绪门
 * 只改窄屏排布：桌面把「刷新 / 钓鱼补齐+▾ / 竞技场补齐+▾」挤在一行，
 * 390px 下三块互相抢宽，文字全被压成一列竖排。
 * ============================================================ */
import MonthlyTasksCard from "@/mobile/fork/components/cards/MonthlyTasksCard.vue";
</script>

<style scoped>
/* 进度行：桌面 justify-content:space-between 单行，窄屏允许换行不截断 */
.m-monthly :deep(.monthly-row) {
  flex-wrap: wrap;
  gap: 2px 8px;
  font-size: 13px;
}
.m-monthly :deep(.monthly-row .row-title) {
  color: var(--m-text2);
}
.m-monthly :deep(.monthly-row .row-value) {
  color: var(--m-text);
  font-weight: 500;
}

/* 动作区：三块改成「刷新独占一行 + 两个补齐各占一半」 */
.m-monthly :deep(.action-row) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.m-monthly :deep(.action-row > .action-button.secondary) {
  grid-column: 1 / -1;
}
.m-monthly :deep(.action-row .n-button-group) {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  /* 圆角只在整组两端 + 裁剪：靠每颗按钮自己圆角会做出「三条圆边」的错位感 */
  border-radius: var(--m-r-md);
  overflow: hidden;
}

/* 统一按钮高度与圆角（桌面按字号自己算，手机上 30px 太矮点不准） */
.m-monthly :deep(.action-button) {
  min-height: 40px;
  border: none;
  border-radius: var(--m-r-md);
  font-size: 13px;
  font-weight: 500;
  padding: 0 10px;
}
/* 刷新进度：次要动作，但**不能画成灰底**——灰底在手机上和禁用态长得一样
   （用户第一反应就是「这按钮为什么是灰的」）。走规范 button-outline：
   canvas 底 + hairline 描边 + 深蓝字，一眼看出「能点，只是不主」。 */
.m-monthly :deep(button.action-button.secondary) {
  width: 100%;
  background: var(--m-card);
  border: 1px solid var(--m-hairline);
  color: var(--m-primary-deep);
}
html[data-theme="dark"] .m-monthly :deep(button.action-button.secondary) {
  color: var(--m-primary);
}
/* 补齐按钮是 Naive 的 split button（主键 + ▾），两半必须同高同色、圆角只留在组两端。
   ★ 之前主键被 Naive 的 --n-height 压成 34px、▾ 半边 40px 还是白底 ⇒ 看起来像两颗错位叠在一起的按钮。
     这里对整组统一 height/min-height/radius，用 !important 一次性压住 Naive 的 --n-height。 */
.m-monthly :deep(.action-row .n-button-group .n-button) {
  height: 40px !important;
  min-height: 40px !important;
  border-radius: 0 !important;
}
/* 主键：吃满剩余宽度。--n-color 必须 !important（Naive 把颜色写在内联 style 里），
   color 也必须 !important（App.vue 有 html[data-theme="dark"] .n-button{color:#fff}）。 */
.m-monthly :deep(.action-row .n-button-group .n-button.action-button) {
  flex: 1 1 auto;
  min-width: 0;
  --n-color: var(--m-primary) !important;
  --n-color-hover: var(--m-primary-deep) !important;
  --n-color-pressed: var(--m-primary-deep) !important;
  --n-color-disabled: var(--m-primary) !important;
  --n-text-color: var(--m-on-primary) !important;
  --n-text-color-hover: var(--m-on-primary) !important;
  --n-text-color-disabled: var(--m-on-primary) !important;
  --n-border: 0 none transparent !important;
  --n-border-hover: 0 none transparent !important;
  --n-border-pressed: 0 none transparent !important;
  --n-border-focus: 0 none transparent !important;
  --n-border-disabled: 0 none transparent !important;
  color: var(--m-on-primary) !important;
}
/* ▾ 半边：同色 + 一道半透明白线分界（Naive 默认把它画成白底，右边那块白就是它） */
.m-monthly :deep(.action-row .n-button-group .n-button:not(.action-button)) {
  flex: 0 0 38px;
  --n-color: var(--m-primary) !important;
  --n-color-hover: var(--m-primary-deep) !important;
  --n-color-pressed: var(--m-primary-deep) !important;
  --n-color-disabled: var(--m-primary) !important;
  --n-text-color: var(--m-on-primary) !important;
  --n-text-color-hover: var(--m-on-primary) !important;
  --n-text-color-disabled: var(--m-on-primary) !important;
  --n-border: 0 none transparent !important;
  --n-border-hover: 0 none transparent !important;
  --n-border-pressed: 0 none transparent !important;
  --n-border-focus: 0 none transparent !important;
  box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.5);
  color: var(--m-on-primary) !important;
}
/* 禁用时整组一起褪色，别一半实一半虚 */
.m-monthly :deep(.action-row .n-button-group .n-button:disabled) {
  opacity: 0.45;
}

/* 说明文字收一档，别抢正文注意力 */
.m-monthly :deep(.description.muted) {
  font-size: 12px;
  line-height: 1.55;
  color: var(--m-text3);
}
.m-monthly :deep(.status-indicator.closed) {
  color: var(--m-red);
  font-size: 11px;
}
</style>

<script>
export default { name: "MobileMonthlyTasksPanel" };
</script>
