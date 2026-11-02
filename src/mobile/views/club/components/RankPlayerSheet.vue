<!-- ============================================================
 * 榜单行 → 玩家详情抽屉（含连续切磋 + 武将详情）
 * 五个榜（区服 / 巅峰 / 俱乐部 / 黄金 / 航路）共用一套：rank_getroleinfo 查人 →
 * PlayerSheet（mid 插槽塞 DuelBlock）+ HeroSheet。
 *
 * 用法：
 *   <RankPlayerSheet ref="sheetRef" @update:pending="pendingId = $event" />
 *   sheetRef.value.open(roleId)
 * pending 不在这里存：列表行要拿它画「这一行正在查询」的降透明度态，
 * 所以用 emit 把 roleId 交给调用方，组件内部不留第二份状态。
 * ============================================================ -->
<template>
  <PlayerSheet
    v-model="sheet"
    :loading="queryLoading"
    :player="player"
    @open-hero="openHero"
  >
    <template #mid>
      <DuelBlock :player="player" />
    </template>
  </PlayerSheet>
  <HeroSheet v-model="heroSheet" :hero="currentHero" />
</template>

<script setup>
import { ref } from "vue";
import PlayerSheet from "./PlayerSheet.vue";
import HeroSheet from "./HeroSheet.vue";
import DuelBlock from "./DuelBlock.vue";
import { usePlayerInfo } from "./usePlayerInfo.js";

const emit = defineEmits(["update:pending"]);

const sheet = ref(false);
const heroSheet = ref(false);
const currentHero = ref(null);

/* silent：行本身有 pending 态，不需要「正在查询 / 查询成功」两条 toast 盖住抽屉标题 */
const { loading: queryLoading, player, fetchPlayer, reset } = usePlayerInfo({
  silent: true,
});

const open = async (roleId) => {
  if (!roleId || queryLoading.value) return false;
  emit("update:pending", roleId);
  let fetched = null;
  try {
    fetched = await fetchPlayer(roleId);
  } finally {
    emit("update:pending", 0);
  }
  if (!fetched) return false;
  sheet.value = true;
  return true;
};

const openHero = (hero) => {
  currentHero.value = hero;
  heroSheet.value = true;
};

const close = () => {
  sheet.value = false;
  heroSheet.value = false;
};

defineExpose({ open, close, reset });
</script>

<script>
export default { name: "MobileRankPlayerSheet" };
</script>
