<template>
  <PushingLevels />
</template>

<script setup>
/* ============================================================
 * 主线推关（移动端宿主）
 *
 * 2026-10-31：整页改成移动端原生版式（卡片 / 平带 / --m-* 配色），
 * 宿主不再需要 .m-desk + :deep() 去压桌面样式 ——
 * 原来的 100 多条 :deep() 全部集中在 fork 副本自己的 scoped 样式里，
 * 换肤和深浅色只认一份变量，改一个地方就够了。
 *
 * 逻辑仍在 fork/views/PushingLevels.vue：多账号勾选 / 分组 / 火把批量使用 /
 * 开始停止 / 逐账号推图卡 / 2000 条日志与筛选，一条没删。
 * 这一页本来就是「多账号批量」工具（数据源是 tokenStore.gameTokens，不是当前选中账号），
 * 移动端保持原样，不做「只跑当前账号」的裁剪 —— 砍掉就是功能缺失。
 * ============================================================ */
import PushingLevels from "@/mobile/fork/views/PushingLevels.vue";
</script>

<script>
export default { name: "MobilePushingLevelsPanel" };
</script>
