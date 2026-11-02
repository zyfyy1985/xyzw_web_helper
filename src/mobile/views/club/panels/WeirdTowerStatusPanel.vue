<template>
  <div class="m-pane m-desk m-weird-tower">
    <WeirdTowerStatus />
  </div>
</template>

<script setup>
/* ============================================================
 * 怪异塔（爬塔 / 道具 / 合成）—— 移动端宿主
 * 复用 src/components/Tower/WeirdTowerStatus.vue，逻辑一行不改。
 * 注意与本目录的 WeirdTowerPanel.vue 区分：那个是「俱乐部怪异塔成员榜」（拉 legion 成员数据），
 * 这个是玩家自己的怪异塔爬塔面板，两者数据源与功能完全不同，别合并。
 * 组件对 gameData 全程用可选链，无需就绪门。
 * ============================================================ */
import WeirdTowerStatus from "@/mobile/fork/components/Tower/WeirdTowerStatus.vue";
</script>

<style scoped>
/* 左边 4px 紫条：规范不要边框 */
.m-weird-tower :deep(.tower-status) {
  border-left: none;
  min-height: 0;
}

/* 卡头：桌面 ≤768 断点写成竖排居中，改回横排 */
.m-weird-tower :deep(.card-header) {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  text-align: left;
  gap: 10px;
  margin-bottom: 12px;
}
.m-weird-tower :deep(.energy-display) {
  align-self: auto;
  background: var(--m-bg);
}

/* 「购买」：桌面橙红渐变 → 唯一行动蓝 */
.m-weird-tower :deep(.buy-energy-button) {
  min-height: 28px;
  padding: 0 10px;
  border-radius: var(--m-r-sm);
  background: var(--m-primary);
  color: var(--m-on-primary);
  font-size: 12px;
  font-weight: 500;
  line-height: 28px;

  transform: none;
}
.m-weird-tower :deep(.buy-energy-button.disabled) {
  background: var(--m-band);
  color: var(--m-text3);
}

/* 主按钮：紫 var(--m-primary) → 唯一行动蓝。三个按钮纵向排列，高度统一到 40 */
.m-weird-tower :deep(.climb-button) {
  min-height: 40px;
  border-radius: var(--m-r-md);
  font-size: 13px;
  font-weight: 500;
}
.m-weird-tower :deep(.climb-button.active) {
  background: var(--m-primary);
  color: var(--m-on-primary);
}
.m-weird-tower :deep(.climb-button.disabled) {
  background: var(--m-band);
  color: var(--m-text3);
}

/* 停止按钮：桌面白底 + 灰边框，暗色下是一块白砖 */
.m-weird-tower :deep(.stop-button) {
  min-height: 40px;
  border: none;
  border-radius: var(--m-r-md);
  background: var(--m-band);
  color: var(--m-red);
  font-size: 13px;
}

/* 爬塔次数输入框：桌面是 86px 固定宽 + 灰边框，改成无边框 band 输入 */
.m-weird-tower :deep(.climb-limit-input) {
  flex: 0 0 72px;
  width: 72px;
  min-height: 40px;
  border: none;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  color: var(--m-text);
  font-size: 13px;
}
.m-weird-tower :deep(.climb-limit-input:focus) {
  border: none;
  background: var(--m-primary-soft);
}
.m-weird-tower :deep(.climb-limit-unit) {
  font-size: 13px;
  color: var(--m-text3);
}

/* 层数条 */
.m-weird-tower :deep(.card-content) {
  background: var(--m-bg);
  border-radius: var(--m-r-md);
  padding: 14px;
  margin-bottom: 10px;
}
/* 卡身 flex + align-items:center 会让 .tower-floor 收缩，space-between 失效 */
.m-weird-tower :deep(.card-content .tower-floor) {
  width: 100%;
  gap: 8px;
}
.m-weird-tower :deep(.card-content .label) {
  font-size: 12px;
  color: var(--m-text3);
}
.m-weird-tower :deep(.card-content .floor-number) {
  font-size: 16px;
  font-weight: 700;
  color: var(--m-text);
}
</style>

<script>
export default { name: "MobileWeirdTowerStatusPanel" };
</script>
