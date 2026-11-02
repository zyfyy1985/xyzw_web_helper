<template>
  <div class="m-pane m-desk m-rank">
    <!-- 二级分段：与桌面 GameStatus 的 rankGroup 五个子页签一一对应，key 也照抄 -->
    <div class="m-seg">
      <button
        v-for="t in tabs"
        :key="t.key"
        :class="{ on: sub === t.key }"
        @click="sub = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- 一次只挂一个榜：各自挂载就会自动查一次，同时挂五个等于一进页面打五条榜单命令 -->
    <ServerRankList v-if="sub === 'serverrank'" />
    <TopRankList v-else-if="sub === 'toprank'" />
    <ClubRankPanel v-else-if="sub === 'topclubrank'" mode="club" />
    <ClubRankPanel v-else-if="sub === 'goldclubrank'" mode="gold" />
    <ClubRankPanel v-else-if="sub === 'greatRouteRank'" mode="route" />
  </div>
</template>

<script setup>
/* ============================================================
 * 排行榜（移动端宿主）
 * 五个榜全部改为移动端原生实现，不再托管桌面表格：
 *   components/ServerRankList.vue   区服榜（玩家行）
 *   components/TopRankList.vue      巅峰榜（玩家行 + 段位 + 积分）
 *   components/ClubRankPanel.vue    俱乐部 / 黄金 / 航路（俱乐部行 + 前三车头，mode 切换）
 * 桌面那五张卡是「flex 行 + 固定像素列宽」的表格（一行 600px 起步），
 * 塞进 390px 只能横向滚动，手感与全站其他页面完全不是一套 —— 这是重写的直接原因。
 * 点人统一走 components/RankPlayerSheet（玩家详情 + 切磋 + 武将），与盐场 / 蟠桃同一套组件。
 * ============================================================ */
import { ref } from "vue";
import ServerRankList from "../components/ServerRankList.vue";
import TopRankList from "../components/TopRankList.vue";
import ClubRankPanel from "../components/ClubRankPanel.vue";

const tabs = [
  /* 标签取短名：5 个页签在 390px 下每个只有 ~70px，「黄金积分榜」「俱乐部榜」会被切断。
     每个榜自己卡头上都有全名，页签只承担切换，不需要重复全称。 */
  { key: "serverrank", label: "区服" },
  { key: "toprank", label: "巅峰" },
  { key: "topclubrank", label: "俱乐部" },
  { key: "goldclubrank", label: "黄金" },
  { key: "greatRouteRank", label: "航路" },
];

const sub = ref("serverrank");
</script>

<style scoped>
/* 分段控件吸顶：榜单很长，翻到下面还能切榜
   ★ 只用直接子代（>）：榜内也有 .m-seg（黄金榜的名次分段），跟着吸顶会串味 */
.m-rank > :deep(.m-seg) {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--m-bg);
  border: none;
  border-radius: 4px;
  padding: 6px 0;
  gap: 6px;
}
.m-rank > :deep(.m-seg button) {
  flex: 0 0 auto;
}
</style>

<script>
export default { name: "MobileRankingPanel" };
</script>
