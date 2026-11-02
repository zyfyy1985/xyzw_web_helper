<template>
  <div class="m-pane m-desk m-xian-tower">
    <!-- 就绪门：组件 setup 里 watch(() => tokenStore.gameData.towerResult)，
         gameData 为 null 时当场抛 TypeError 并冒到根，整页白屏。桌面靠 v-show 分区少踩到。 -->
    <div v-if="!dataReady" class="m-card">
      <div class="m-empty" style="padding: 30px 0">
        <div class="m-logo">◌</div>
        <h3>等待账号数据</h3>
        <p>连上账号后咸将塔信息会自动出现</p>
      </div>
    </div>
    <TowerStatus v-else />
  </div>
</template>

<script setup>
/* ============================================================
 * 咸将塔（移动端宿主）
 * 逻辑一行不改：直接复用 src/components/Tower/TowerStatus.vue（爬塔 / 买小鱼干 / 停止全在里面）。
 * 这里只做两件事：
 *   1. 就绪门（见上）
 *   2. 窄屏修正：桌面卡自带 @media(≤768) 会把卡头改成竖排居中、带 4px 彩色左边条、
 *      主按钮用 #6366f1 紫 —— 与 DESIGN.md「无边框、唯一行动色」冲突，逐条盖回
 * ============================================================ */
import { computed } from "vue";
import TowerStatus from "@/mobile/fork/components/Tower/TowerStatus.vue";
import { useTokenStore } from "@/stores/tokenStore";

const tokenStore = useTokenStore();
const dataReady = computed(() => !!tokenStore.gameData?.roleInfo);
</script>

<style scoped>
/* 左边 4px 彩色条：规范不要边框，层次交给底色 */
.m-xian-tower :deep(.tower-status) {
  border-left: none;
  min-height: 0;
}

/* 卡头：桌面 ≤768 断点写成 flex-direction:column + text-align:center（一行标题被拆成三行），
   手机屏幕够横排，改回「图标 + 标题 + 小鱼干靠右」 */
.m-xian-tower :deep(.card-header) {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  text-align: left;
  gap: 10px;
  margin-bottom: 12px;
}
.m-xian-tower :deep(.energy-display) {
  align-self: auto;
  background: var(--m-bg);
}

/* 「购买」：桌面是橙红渐变（var(--m-amber)→var(--m-amber)），本体系只允许一个行动色，收成行动蓝 */
.m-xian-tower :deep(.buy-energy-button) {
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
.m-xian-tower :deep(.buy-energy-button.disabled) {
  background: var(--m-band);
  color: var(--m-text3);
}

/* 主按钮：紫 var(--m-primary) → 唯一行动蓝 */
.m-xian-tower :deep(.climb-button) {
  min-height: 40px;
  border-radius: var(--m-r-md);
  font-size: 13px;
  font-weight: 500;
}
.m-xian-tower :deep(.climb-button.active) {
  background: var(--m-primary);
  color: var(--m-on-primary);
}
.m-xian-tower :deep(.climb-button.disabled) {
  background: var(--m-band);
  color: var(--m-text3);
}

/* 停止按钮：桌面白底 + var(--m-border) 边框，暗色下是一块白砖 */
.m-xian-tower :deep(.stop-button) {
  min-height: 40px;
  border: none;
  border-radius: var(--m-r-md);
  background: var(--m-band);
  color: var(--m-red);
  font-size: 13px;
}

/* 层数条：桌面靠 --bg-tertiary 反色，这里换成 band，圆角收到 8 */
.m-xian-tower :deep(.card-content) {
  background: var(--m-bg);
  border-radius: var(--m-r-md);
  padding: 14px;
  margin-bottom: 10px;
}
/* 卡身是 flex + align-items:center，.tower-floor 不撑满时 space-between 失效，
   结果「当前层数」和数字黏在一起 —— 补 width:100% 让 desktop 的左右分栏意图生效 */
.m-xian-tower :deep(.card-content .tower-floor) {
  width: 100%;
  gap: 8px;
}
.m-xian-tower :deep(.card-content .label) {
  font-size: 12px;
  color: var(--m-text3);
}
.m-xian-tower :deep(.card-content .floor-number) {
  font-size: 16px;
  font-weight: 700;
  color: var(--m-text);
}
</style>

<script>
export default { name: "MobileTowerStatusPanel" };
</script>
