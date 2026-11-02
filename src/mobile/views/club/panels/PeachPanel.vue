<template>
  <div class="m-pane">
    <!-- 二级分段：蟠桃园信息 / 蟠桃园战绩（对齐旧版 GameStatus peachSubTab 两个子 tab） -->
    <div class="m-seg">
      <button
        v-for="s in subs"
        :key="s.key"
        :class="{ on: sub === s.key }"
        @click="sub = s.key"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- 与旧版一致：每次切到某个子页都重新查询（旧版是 v-if 重挂载，这里保留 DOM 但显式 refresh） -->
    <PeachInfoPanel v-if="shown.info" v-show="sub === 'info'" ref="infoRef" />
    <PeachBattlePanel v-if="shown.battle" v-show="sub === 'battle'" ref="battleRef" />
  </div>
</template>

<script setup>
/* ============================================================
 * 蟠桃园面板（移动端）
 * 数据逻辑照抄 src/components/Club/PeachInfoV2.vue（样式二超集）
 *            + src/components/Club/PeachBattleRecords.vue
 * 旧版由 GameStatus.vue 侧边栏 peachGroup 承载，子 tab：
 *   peach（蟠桃园信息）/ peachBattle（蟠桃园战绩）。
 * 仅展示形式改为移动端二级分段。
 * ============================================================ */
import { nextTick, ref, watch } from "vue";
import PeachInfoPanel from "./PeachInfoPanel.vue";
import PeachBattlePanel from "./PeachBattlePanel.vue";

const subs = [
  { key: "info", label: "蟠桃园信息" },
  { key: "battle", label: "蟠桃园战绩" },
];
const sub = ref("info");
const shown = ref({ info: true, battle: false });
const infoRef = ref(null);
const battleRef = ref(null);

watch(sub, async (v) => {
  const first = !shown.value[v];
  shown.value[v] = true;
  // 切换视图回顶部（对齐旧版 tab 切换的体感）
  const sc = document.querySelector(".mobile-shell .m-scroll");
  if (sc) sc.scrollTop = 0;
  await nextTick();
  /* 首次挂载由子组件 onMounted 自己拉；之后每次切回来重新查询（等价旧版重挂载） */
  if (!first) {
    if (v === "info") infoRef.value?.refresh?.();
    else battleRef.value?.refresh?.();
  }
});
</script>

<script>
export default { name: "MobilePeachPanel" };
</script>
