<!-- ============================================================
 * 区服榜（移动端原生版）
 * 桌面版 ServerRankListPageCard.vue 是「flex 行 + 像素列宽」的表格，390px 下必须横滚，
 * 手感和整站其他页面完全不是一套。这里改成原生列表：
 *   卡头（榜单名 + 查询日期 + 查询）→ 工具行（人数 / 导出图片）→ 白卡 hairline 行
 * 每一行点击都复用站内既有组件：PlayerSheet（玩家详情，mid 插槽塞 DuelBlock 切磋）+ HeroSheet（武将详情）。
 * 数据命令与字段照抄桌面版：rank_getserverrank 取榜，rank_getroleinfo 查人（在 usePlayerInfo 里）。
 * ============================================================ -->
<template>
  <div class="m-card">
    <div class="m-card-h">
      <span class="m-t">
        <MIcon name="ranking" :size="14" class="rk-ico" />区服榜
        <small v-if="queryDate" class="rk-date">{{ queryDate }}</small>
      </span>
      <button class="m-link" :disabled="loading" @click="fetchRank">
        {{ loading ? "查询中…" : "查询" }}
      </button>
    </div>

    <div class="rk-bar">
      <span class="m-more">
        {{ rows.length ? `共 ${rows.length} 名玩家` : "点右上「查询」拉取当日榜单" }}
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

    <p class="m-hint rk-hint">点任意玩家查看详情，抽屉里可以直接发起切磋、翻武将。</p>
  </div>

  <div v-if="loading && !rows.length" class="m-card">
    <div class="rk-skel"><i></i><i></i><i></i><i></i></div>
  </div>

  <div v-else-if="!rows.length" class="m-card">
    <div class="m-empty" style="padding: 30px 0">
      <div class="m-logo">🚩</div>
      <h3>{{ connected ? "还没有榜单数据" : "游戏未连接" }}</h3>
      <p>{{ connected ? "点「查询」拉取今日区服榜" : "先到 Token 管理里连上游戏服务器" }}</p>
    </div>
  </div>

  <div v-else class="m-card rk-card">
    <!-- 导出的就是这个容器（截图见用户手上的旧版也是整张表） -->
    <div ref="exportDom" class="rk-list">
      <button
        v-for="r in rows"
        :key="r.roleId || r.key"
        class="rk-row"
        :class="{ 'is-pending': pendingId === r.roleId }"
        @click="openPlayer(r)"
      >
        <span class="rk-rank" :class="{ top: r.rank <= 3 }">{{ r.rank || "-" }}</span>
        <img v-if="r.headImg" class="rk-ava" :src="r.headImg" alt="" @error="onImgError" />
        <span v-else class="rk-ava rk-ava--ph">{{ (r.name || "?").charAt(0) }}</span>
        <span class="rk-body">
          <span class="rk-nm">{{ r.name || "未知玩家" }}</span>
          <span class="rk-meta">
            服务器 {{ r.serverId || "-" }} · ID {{ r.roleId || "-" }}
          </span>
        </span>
        <span class="rk-tail">
          <span class="rk-pw">{{ r.powerText }}</span>
          <MIcon name="chevron" :size="14" class="rk-arrow" />
        </span>
      </button>
    </div>
  </div>

  <!-- 玩家详情（含切磋）+ 武将详情：与盐场 / 俱乐部 / 蟠桃同一套组件 -->
  <PlayerSheet
    v-model="playerSheet"
    :loading="queryLoading"
    :player="playerInfo"
    @open-hero="openHero"
  >
    <template #mid>
      <DuelBlock :player="playerInfo" />
    </template>
  </PlayerSheet>
  <HeroSheet v-model="heroSheet" :hero="currentHero" />
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import html2canvas from "html2canvas";
import { useTokenStore } from "@/stores/tokenStore";
import { formatPower } from "@/utils/legionWar";
import { downloadCanvasAsImage } from "@/utils/imageExport";
import MIcon from "@/mobile/components/MIcon.vue";
import PlayerSheet from "./PlayerSheet.vue";
import HeroSheet from "./HeroSheet.vue";
import DuelBlock from "./DuelBlock.vue";
import { usePlayerInfo } from "./usePlayerInfo.js";

const tokenStore = useTokenStore();
const message = useMessage();

const loading = ref(false);
const exporting = ref(false);
const rows = ref([]);
const queryDate = ref("");
const exportDom = ref(null);

const connected = computed(
  () => tokenStore.getWebSocketStatus(tokenStore.selectedToken?.id) === "connected",
);

/* 每日榜单按本地日期区分（服务端只回当日榜，日期只作展示与文件名） */
const todayText = () => {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
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
    const result = await tokenStore.sendMessageWithPromise(token.id, "rank_getserverrank", {}, 5000);
    const list = result?.list;
    if (!list || !Object.keys(list).length) {
      rows.value = [];
      message.warning("未查询到区服榜单数据");
      return;
    }
    rows.value = Object.values(list)
      .map((m) => ({
        key: `${m.serverId}-${m.roleId}`,
        roleId: m.roleId || 0,
        serverId: m.serverId || 0,
        name: m.name || "",
        rank: Number(m.rank) || 0,
        headImg: m.headImg || "",
        powerText: formatPower(m.power) || "0",
      }))
      .sort((a, b) => a.rank - b.rank);
    queryDate.value = todayText();
  } catch (e) {
    message.error(`查询失败: ${e.message}`);
  } finally {
    loading.value = false;
  }
};

/* ---------- 玩家详情（复用站内抽屉 + 切磋 + 武将） ---------- */
const playerSheet = ref(false);
const heroSheet = ref(false);
const currentHero = ref(null);
const pendingId = ref(0);

/* silent：榜单行自己有 pending 态，不需要「正在查询 / 查询成功」两条 toast 盖住抽屉 */
const { loading: queryLoading, player: playerInfo, fetchPlayer, reset } = usePlayerInfo({
  silent: true,
});

const openPlayer = async (row) => {
  if (!row.roleId) {
    message.error("该玩家 ID 缺失，无法查询");
    return;
  }
  if (queryLoading.value) return;
  pendingId.value = row.roleId;
  const fetched = await fetchPlayer(row.roleId);
  pendingId.value = 0;
  if (!fetched) return;
  playerSheet.value = true;
};

const openHero = (hero) => {
  currentHero.value = hero;
  heroSheet.value = true;
};

/* 头像加载失败回退官方图标（与盐场/俱乐部同一处理） */
const onImgError = (e) => {
  e.target.src = "/icons/xiaoyugan.png";
};

/* ---------- 导出图片（照抄桌面版参数：2 倍缩放 + 白底） ---------- */
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
    const name = `${(queryDate.value || todayText()).replace(/\//g, "-")}-区服榜.png`;
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

/* 进页面时还没连上、之后连上了：自动补一次，省得用户以为按钮坏了 */
watch(connected, (ok) => {
  if (ok && !rows.value.length && !loading.value) fetchRank();
});

/* 换号：清掉上一个账号的榜单与抽屉 */
watch(
  () => tokenStore.selectedToken?.id,
  () => {
    rows.value = [];
    queryDate.value = "";
    playerSheet.value = false;
    reset();
  },
);
</script>

<style scoped>
.rk-ico {
  display: inline-block;
  margin-right: 4px;
  vertical-align: -2px;
  color: var(--m-primary);
}
.rk-date {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--m-text3) !important;
  font-variant-numeric: tabular-nums;
}
/* 工具行：人数在左、导出在右 */
.rk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.rk-bar .m-more {
  flex: 1 1 auto;
  min-width: 0;
}
.rk-hint {
  margin: 8px 0 0;
}

/* ---------- 列表 ---------- */
.rk-card {
  padding: 0;
  overflow: hidden;
}
.rk-list {
  display: flex;
  flex-direction: column;
  background: var(--m-card);
}
/* 行：名次 / 头像 / 主体 / 战力+箭头，两行制（名字 + 服务器与 ID） */
.rk-row {
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
.rk-row:last-child {
  border-bottom: none;
}
.rk-row:active {
  background: var(--m-bg);
}
.rk-row.is-pending {
  opacity: 0.6;
}

/* 名次：前三名给实心行动色，其余中性底（不引金银铜，保持单色体系） */
.rk-rank {
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
.rk-rank.top {
  background: var(--m-primary);
  color: var(--m-on-primary) !important;
}

.rk-ava {
  width: 34px;
  height: 34px;
  border-radius: var(--m-r-sm);
  object-fit: cover;
  background: var(--m-bg);
}
.rk-ava--ph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--m-text3) !important;
}

.rk-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rk-nm {
  font-size: 14px;
  font-weight: 600;
  color: var(--m-text) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rk-meta {
  font-size: 11px;
  color: var(--m-text3) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.rk-tail {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
.rk-pw {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--m-text2) !important;
  font-variant-numeric: tabular-nums;
}
.rk-arrow {
  color: var(--m-text3);
}

/* 加载骨架：四行等宽灰条 */
.rk-skel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 6px 0;
}
.rk-skel i {
  display: block;
  height: 34px;
  border-radius: var(--m-r-sm);
  background: var(--m-band);
  animation: rk-pulse 1.3s ease-in-out infinite;
}
.rk-skel i:nth-child(2) { width: 88%; }
.rk-skel i:nth-child(3) { width: 94%; }
.rk-skel i:nth-child(4) { width: 80%; }
@keyframes rk-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 359px) {
  /* 320：名次列与头像各收一档，名字还留得下 6~7 个字 */
  .rk-row { grid-template-columns: 22px 30px minmax(0, 1fr) auto; gap: 8px; padding: 10px 12px; }
  .rk-rank { width: 22px; height: 22px; font-size: 11px; }
  .rk-ava { width: 30px; height: 30px; }
  .rk-nm { font-size: 13.5px; }
}
</style>

<script>
export default { name: "MobileServerRankList" };
</script>
