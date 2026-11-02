<template>
  <div class="m-pane m-skin">
    <SkinChallengeCard />
  </div>
</template>

<script setup>
/* ============================================================
 * 换皮闯关（移动端宿主）
 *
 * 2026-10-31：卡片本身已按 DESIGN.md 改成手机版版式（两列两行、语义色状态、描边刷新），
 * 样式全部收在 fork 副本自己的 scoped 里 —— 宿主不再需要 .m-desk + 一长串 :deep() 去压桌面值。
 * 逻辑仍然一行不改：开放日映射（周四全开）、活动有效期判定、单 BOSS 挑战、刷新进度都在组件里。
 * ============================================================ */
import SkinChallengeCard from "@/mobile/fork/components/cards/SkinChallengeCard.vue";
</script>

<style scoped>
/* 这张卡的 #badge 槽是空的（「Badge content moved to default slot」），
   只剩 MyCard 里那个空 .status-dot，在手机上就是一个孤零零的绿点，没有任何信息。
   只在移动端藏掉，桌面不动。 */
.m-skin :deep(.card-header .status-badge) {
  display: none;
}
</style>

<script>
export default { name: "MobileSkinChallengePanel" };
</script>
