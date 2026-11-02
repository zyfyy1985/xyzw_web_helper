<!-- ============================================================
 * 巅峰榜（移动端原生版）
 * 桌面版 TopRankListPageCard.vue 是 7 列固定像素宽表格（排名/服务器/头像/玩家ID/名称/战力/积分），
 * 390px 下必须横滚。这里按区服榜同一套版式重排：
 *   名次 / 头像 / 名称（+段位）/ 服务器·战力 / 积分 → 点行出玩家详情（含切磋、武将）。
 * 命令与字段照抄桌面版：arena_getarearank { rankType: 1 }，一次回全量。
 * ============================================================ -->
<template>
  <div class="m-card">
    <div class="m-card-h">
      <span class="m-t">
        <MIcon name="crown" :size="14" class="tk-ico" />巅峰榜
        <small v-if="queryDate" class="tk-date">{{ queryDate }}</small>
      </span>
      <button class="m-link" :disabled="loading" @click="fetchRank">
        {{ loading ? "查询中…" : "查询" }}
      </button>
    </div>

    <div class="tk-bar">
      <span class="m-more">
        {{ rows.length ? `共 ${rows.length} 名玩家` : "点右上「查询」拉取当日巅峰榜" }}
      </span>
      <button
        class="m-act m-act-i"
        :disabled="!rows.length || exporting || loading"
        @click="exportImage"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
        {{ exporting ? "导出中…" : "导出图片" }}
      </button>
    </div>

    <p class="m-hint tk-hint">点任意玩家查看详情，抽屉里可以直接发起切磋、翻武将。</p>
  </div>

  <div v-if="loading && !rows.length" class="m-card">
    <div class="tk-skel"><i></i><i></i><i></i><i></i></div>
  </div>

  <div v-else-if="!rows.length" class="m-card">
    <div class="m-empty" style="padding: 30px 0">
      <div class="m-logo">👑</div>
      <h3>{{ connected ? "还没有榜单数据" : "游戏未连接" }}</h3>
      <p>{{ connected ? "点「查询」拉取今日巅峰榜" : "先到 Token 管理里连上游戏服务器" }}</p>
    </div>
  </div>

  <div v-else class="m-card tk-card">
    <div ref="exportDom" class="tk-list">
      <button
        v-for="r in rows"
        :key="r.key"
        class="tk-row"
        :class="{ 'is-pending': pendingId === r.roleId }"
        @click="openPlayer(r)"
      >
        <span class="tk-rank" :class="{ top: r.rank <= 3 }">{{ r.rank || "-" }}</span>
        <img v-if="r.headImg" class="tk-ava" :src="r.headImg" alt="" @error="onImgError" />
        <span v-else class="tk-ava tk-ava--ph">{{ (r.name || "?").charAt(0) }}</span>
        <span class="tk-body">
          <span class="tk-l1">
            <span class="tk-nm">{{ r.name || "未知玩家" }}</span>
            <span v-if="r.legacyName" class="tk-tag">{{ r.legacyName }}</span>
          </span>
          <span class="tk-meta">
            服务器 {{ r.serverId || "-" }} · 战力 {{ r.powerText }}
          </span>
        </span>
        <span class="tk-tail">
          <span class="tk-score">{{ r.scoreText }}</span>
          <span class="tk-score-lb">积分</span>
          <MIcon name="chevron" :size="14" class="tk-arrow" />
        </span>
      </button>
    </div>
  </div>

  <RankPlayerSheet ref="sheetRef" @update:pending="pendingId = $event" />
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import html2canvas from "html2canvas";
import { useTokenStore } from "@/stores/tokenStore";
import { formatPower } from "@/utils/legionWar";
import { legacycolor } from "@/utils/HeroList";
import { downloadCanvasAsImage } from "@/utils/imageExport";
import MIcon from "@/mobile/components/MIcon.vue";
import RankPlayerSheet from "./RankPlayerSheet.vue";

const tokenStore = useTokenStore();
const message = useMessage();

const loading = ref(false);
const exporting = ref(false);
const rows = ref([]);
const queryDate = ref("");
const exportDom = ref(null);
const sheetRef = ref(null);
const pendingId = ref(0);

const connected = computed(
  () => tokenStore.getWebSocketStatus(tokenStore.selectedToken?.id) === "connected",
);

const todayText = () => {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};

/* ★ 桌面版这里直接 score.toFixed(0)：服务端省略 score 时会抛 undefined 崩掉整张表。
   手机端统一给空保护，缺值画 0。 */
const fmtScore = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : "0";
};

const fetchRank = async () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择游戏角色");
    return;
  }
  if (!connected.value) {
    message.error("WebSocket 未连接，无法查询榜单");
    return;
  }
  loading.value = true;
  try {
    const result = await tokenStore.sendMessageWithPromise(
      token.id,
      "arena_getarearank",
      { rankType: 1 },
      5000,
    );
    const list = result?.list;
    if (!list || !Object.keys(list).length) {
      rows.value = [];
      message.warning("未查询到巅峰榜单数据");
      return;
    }
    rows.value = Object.values(list)
      .map((m) => {
        const legacy = Number(m?.legacy?.color) || 0;
        return {
          key: `${m.serverId}-${m.roleId}`,
          roleId: m.roleId || 0,
          serverId: m.serverId || 0,
          name: m.name || "",
          rank: Number(m.rank) || 0,
          headImg: m.headImg || "",
          legacy,
          legacyName: legacy > 0 ? legacycolor[legacy]?.name || "" : "",
          scoreText: fmtScore(m.score),
          powerText: formatPower(m.power) || "0",
        };
      })
      .sort((a, b) => a.rank - b.rank);
    queryDate.value = todayText();
  } catch (e) {
    message.error(`查询失败: ${e.message}`);
  } finally {
    loading.value = false;
  }
};

const openPlayer = async (row) => {
  if (!row.roleId) {
    message.error("该玩家 ID 缺失，无法查询");
    return;
  }
  await sheetRef.value?.open(row.roleId);
};

const onImgError = (e) => {
  e.target.src = "/icons/xiaoyugan.png";
};

/* ---------- 导出图片（与区服榜同参数：2 倍缩放 + 白底） ---------- */
const exportImage = async () => {
  if (!exportDom.value) return;
  exporting.value = true;
  try {
    await new Promise((r) => setTimeout(r, 50));
    const canvas = await html2canvas(exportDom.value, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      height: exportDom.value.scrollHeight,
      width: exportDom.value.scrollWidth,
      windowWidth: exportDom.value.scrollWidth,
      windowHeight: exportDom.value.scrollHeight,
      allowTaint: true,
    });
    const name = `${(queryDate.value || todayText()).replace(/\//g, "-")}-巅峰榜.png`;
    downloadCanvasAsImage(canvas, name);
  } catch (e) {
    console.error("导出图片失败:", e);
    message.error("导出图片失败，请重试");
  } finally {
    exporting.value = false;
  }
};

onMounted(() => {
  if (connected.value) fetchRank();
});

watch(connected, (ok) => {
  if (ok && !rows.value.length && !loading.value) fetchRank();
});

watch(
  () => tokenStore.selectedToken?.id,
  () => {
    rows.value = [];
    queryDate.value = "";
    sheetRef.value?.close();
    sheetRef.value?.reset();
  },
);
</script>

<style scoped>
.tk-ico {
  display: inline-block;
  margin-right: 4px;
  vertical-align: -2px;
  color: var(--m-primary);
}
.tk-date {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--m-text3) !important;
  font-variant-numeric: tabular-nums;
}
.tk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.tk-bar .m-more {
  flex: 1 1 auto;
  min-width: 0;
}
.tk-hint {
  margin: 8px 0 0;
}

/* ---------- 列表 ---------- */
.tk-card {
  padding: 0;
  overflow: hidden;
}
.tk-list {
  display: flex;
  flex-direction: column;
  background: var(--m-card);
}
/* 行：名次 / 头像 / 主体 / 积分+箭头，两行制（名字 + 服务器与战力） */
.tk-row {
  display: grid;
  grid-template-columns: 24px 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--m-band);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}
.tk-row:last-child {
  border-bottom: none;
}
.tk-row:active {
  background: var(--m-bg);
}
.tk-row.is-pending {
  opacity: 0.6;
}

.tk-rank {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--m-text2) !important;
  font-variant-numeric: tabular-nums;
}
.tk-rank.top {
  background: var(--m-primary);
  color: var(--m-on-primary) !important;
}

.tk-ava {
  width: 34px;
  height: 34px;
  border-radius: var(--m-r-sm);
  object-fit: cover;
  background: var(--m-bg);
}
.tk-ava--ph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--m-text3) !important;
}

.tk-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tk-l1 {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.tk-nm {
  font-size: 14px;
  font-weight: 600;
  color: var(--m-text) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 段位：单色体系里只给一枚中性 tag，不引金银铜 */
.tk-tag {
  flex: none;
  font-size: 10px;
  line-height: 15px;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--m-primary-soft);
  color: var(--m-primary) !important;
  font-weight: 500;
}
.tk-meta {
  font-size: 11px;
  color: var(--m-text3) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.tk-tail {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  flex: none;
}
.tk-score {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--m-text) !important;
  font-variant-numeric: tabular-nums;
}
.tk-score-lb {
  font-size: 10px;
  color: var(--m-text3) !important;
}
.tk-arrow {
  color: var(--m-text3);
  align-self: center;
  margin-left: 2px;
}

/* 加载骨架：四行等宽灰条 */
.tk-skel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 6px 0;
}
.tk-skel i {
  display: block;
  height: 34px;
  border-radius: var(--m-r-sm);
  background: var(--m-band);
  animation: tk-pulse 1.3s ease-in-out infinite;
}
.tk-skel i:nth-child(2) { width: 88%; }
.tk-skel i:nth-child(3) { width: 94%; }
.tk-skel i:nth-child(4) { width: 80%; }
@keyframes tk-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 359px) {
  .tk-row { grid-template-columns: 22px 30px minmax(0, 1fr) auto; gap: 8px; padding: 10px 12px; }
  .tk-rank { width: 22px; height: 22px; font-size: 11px; }
  .tk-ava { width: 30px; height: 30px; }
  .tk-nm { font-size: 13.5px; }
  .tk-score { font-size: 12.5px; }
  .tk-score-lb { display: none; }
}
</style>

<script>
export default { name: "MobileTopRankList" };
</script>
