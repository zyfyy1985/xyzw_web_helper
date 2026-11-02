<template>
  <div class="m-card" ref="exportDom">
    <div class="m-card-h">
      <span class="m-t">俱乐部历史盐场战绩</span>
      <span class="m-acts" v-if="!isExporting">
        <button class="m-act" :disabled="loading" @click="fetchBattleRecords">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
          刷新
        </button>
        <button class="m-act m-act-i" :disabled="loading" @click="handleExportImage">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
          导出图片
        </button>
      </span>
    </div>

    <!-- 表头（列宽与数据行严格一致：日期自适应 / 类型居中 / 名次末列） -->
    <div class="m-thead m-thead-h">
      <span class="m-th">比赛日期</span>
      <span class="m-th m-th-c">比赛类型</span>
      <span class="m-th m-th-r">名次</span>
    </div>
    <p v-if="loading" class="m-hint" style="text-align: center; padding: 16px 0">正在加载战绩数据…</p>
    <template v-else-if="tableData.length">
      <div class="m-hrow" v-for="(row, i) in rows" :key="i">
        <span class="m-hdate">{{ row.warDate }}</span>
        <span class="m-htype">{{ legionWarTypesw(row.legionWarType) }}</span>
        <span class="m-medal" :class="medalCls(row.rank)">{{ rankText(row.rank) }}</span>
      </div>
      <!-- 每页 10 条 -->
      <div class="m-pager" v-if="pageCount > 1 && !isExporting">
        <button class="m-btn m-btn-g" style="padding: 6px 10px; font-size: 11.5px" :disabled="page <= 1" @click="page--">上一页</button>
        <span class="m-pager-t">第 {{ page }} / {{ pageCount }} 页 · 共 {{ tableData.length }} 条 · 每页 10 条</span>
        <button class="m-btn m-btn-g" style="padding: 6px 10px; font-size: 11.5px" :disabled="page >= pageCount" @click="page++">下一页</button>
      </div>
    </template>
    <div v-else class="m-empty" style="padding: 30px 0">
      <div class="m-logo">🏆</div>
      <h3>暂无数据</h3>
      <p>共 0 条 · 点右上角「刷新」重试</p>
    </div>
  </div>
</template>

<script setup>
/* ============================================================
 * 俱乐部历史战绩（移动端）
 * 数据逻辑照抄 src/components/Club/ClubHistoryRecords.vue：
 *   · 命令 legion_getinfo → info.warMap 展平反转 + info.warRank 反转
 *   · legionWarTypesw 类型映射 / 名次配色规则完全一致
 *   · 导出文件名规则：俱乐部历史战绩_${日期}.png
 * 仅展示形式改为移动端。
 * ============================================================ */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { exportDomAsImage } from "@/mobile/utils/exportImage";

const message = useMessage();
const tokenStore = useTokenStore();

const loading = ref(false);
const battleRecords = ref(null);
const exportDom = ref(null);
const isExporting = ref(false);

/* ---------- 表格数据（照抄 tableData computed） ---------- */
const tableData = computed(() => {
  if (!battleRecords.value || !battleRecords.value.warMap || !battleRecords.value.warRank) {
    return [];
  }
  return battleRecords.value.warMap.map((member, index) => ({
    key: index,
    legionWarType: member.legionWarType,
    warDate: member.warDate,
    rank: battleRecords.value.warRank[index],
  }));
});

/* ---------- 分页（每页 10 条；导出图片时整表输出） ---------- */
const PAGE_SIZE = 10;
const page = ref(1);
const pageCount = computed(() => Math.max(1, Math.ceil(tableData.value.length / PAGE_SIZE)));
const pagedData = computed(() =>
  tableData.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);
const rows = computed(() => (isExporting.value ? tableData.value : pagedData.value));

/* 数据变化或页码越界时回到第一页 */
watch(tableData, () => {
  page.value = 1;
});
watch(pageCount, (n) => {
  if (page.value > n) page.value = n;
});

/* ---------- 类型映射（照抄 legionWarTypesw） ---------- */
const legionWarTypesw = (legionWarType) => {
  switch (legionWarType) {
    case 15:
      return "灰岩岛";
    case 16:
      return "进阶周赛";
    case 17:
      return "进阶月赛";
    case 18:
      return "青铜周赛";
    case 19:
      return "青铜月赛";
    case 20:
      return "秘蓝周赛";
    case 21:
      return "秘蓝月赛";
    case 22:
      return "月宫周赛";
    case 23:
      return "月宫月赛";
    case 24:
      return "天宫周赛";
    case 25:
      return "天宫月赛";
    case 6:
      return "夺旗赛";
    default:
      return "伟大航路";
  }
};

/* 名次文案（照抄旧版 column render：`第 ${rank} 名`） */
const rankText = (rank) => (rank === undefined || rank === null || rank === "" ? "-" : `第 ${rank} 名`);

/* ---------- 名次配色（照抄：1 金 / 2 银 / 3 铜 / >20 靠后） ---------- */
const medalCls = (rank) => {
  if (rank === 1) return "g1";
  if (rank === 2) return "g2";
  if (rank === 3) return "g3";
  if (rank > 20) return "low";
  return "";
};

/* ---------- 查询战绩（照抄 fetchBattleRecords） ---------- */
const fetchBattleRecords = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择游戏角色");
    return;
  }

  const tokenId = tokenStore.selectedToken.id;

  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接，无法查询战绩");
    return;
  }

  loading.value = true;

  try {
    const result = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getinfo",
      10000,
    );
    if (result && result.info.warRank && result.info.warMap) {
      const warMapValueList = Object.values(result.info.warMap);
      battleRecords.value = {
        warMap: [].concat(...warMapValueList).reverse(),
        warRank: result.info.warRank.reverse(),
      };
      message.success("战绩加载成功");
    } else {
      battleRecords.value = null;
      message.warning("未查询到战绩数据");
    }
  } catch (error) {
    console.error("查询战绩失败:", error);
    message.error(`查询失败: ${error.message}`);
    battleRecords.value = null;
  } finally {
    loading.value = false;
  }
};

/* ---------- 导出图片（照抄 handleExportImage，文件名规则一致） ---------- */
const handleExportImage = async () => {
  if (!exportDom.value) {
    message.error("未找到要导出的内容");
    return;
  }

  let loadingMsg = null;
  try {
    isExporting.value = true;
    loadingMsg = message.loading("正在生成图片，请稍候...", { duration: 0 });
    /* 分页时导出为整表：等 rows 切到全量、翻页条隐藏后再截图 */
    await nextTick();

    const dateStr = new Date().toLocaleDateString().replace(/\//g, "-");
    const filename = `俱乐部历史战绩_${dateStr}.png`;
    await exportDomAsImage(exportDom.value, filename);

    message.success("图片导出成功");
  } catch (err) {
    console.error("DOM转图片失败：", err);
    message.error("导出图片失败，请重试");
  } finally {
    loadingMsg?.destroy?.();
    isExporting.value = false;
  }
};

/* ---------- Inline 行为：挂载即拉取（照抄旧组件 onMounted inline） ---------- */
onMounted(() => {
  fetchBattleRecords();
});
</script>

<script>
export default { name: "MobileClubHistoryPanel" };
</script>

<style scoped>
/* 三列：比赛日期（左）/ 比赛类型（居中）/ 名次（末列 30 徽章）
   表头与数据行用同一套 flex 规则，保证逐列对齐。
   ★ 「比赛类型」要的是**落在整行中线上**，用 flex 做不到：
     中间列宽度等于内容宽，它只会紧贴在日期后面，右边再被名次顶住 —— 视觉上就偏左。
     改成 grid 的 `1fr auto 1fr`：左右两列平分剩余空间 ⇒ 中间列的中心必然等于整行中心。
     （特异性写成 .m-hrow.m-hrow 是为了压过 mobile.css 里共享的 .m-hrow{display:flex}） */
.m-thead-h.m-thead-h,
.m-hrow.m-hrow {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  column-gap: 10px;
}
.m-thead-h .m-th:nth-child(1) { text-align: left; }
.m-thead-h .m-th:nth-child(2) { text-align: center; }
.m-thead-h .m-th:nth-child(3) { text-align: right; }
.m-hrow .m-hdate {
  min-width: 0; text-align: left;
  font-size: 11.5px; color: var(--m-text3); font-variant-numeric: tabular-nums;
}
.m-hrow .m-htype { min-width: 0; text-align: center; }
/* 名次徽章：文案为「第 N 名」，宽度需容纳 3 位数名次，故 54px + 10px 字号、不省略 */
.m-hrow .m-medal { justify-self: end; box-sizing: border-box; font-size: 10px; white-space: nowrap; }
/* 翻页条（与逐鹿面板同款） */
.m-pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
.m-pager-t { font-size: 11px; color: var(--m-text3); text-align: center; flex: 1; }
</style>
