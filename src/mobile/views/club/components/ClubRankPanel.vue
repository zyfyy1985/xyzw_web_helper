<!-- ============================================================
 * 俱乐部类榜单（移动端原生版）：俱乐部榜 / 黄金积分榜 / 伟大航路积分榜
 * 三个榜的命令与字段不同，但版式、点人、导出完全一样，所以合成一个组件，用 mode 切：
 *   club  → legion_getarearank {}                       一次回全量
 *   gold  → legionwar_getgoldmonthwarrank {startRank,endRank}   按名次分段（1-100 / … / 401-500）
 *   route → saltroad_getwartype {date} → 决定段位区间
 *           → saltroad_getsaltroadwartotalrank {date,startRank,endRank}
 *
 * ★ 取数节奏照抄航路榜的分页思路，不抄桌面版的「全量无节流并发」：
 *   俱乐部详情（legion_getinfobyid）才是重活，500 家一起打会把 ws 打满。
 *   这里一次 20 家、并发 4，先把行画出来（红淬/战力/车头位留白），详情回来后原地补。
 * ============================================================ -->
<template>
  <div class="m-card">
    <div class="m-card-h">
      <span class="m-t">
        <MIcon :name="mode === 'route' ? 'flag' : mode === 'gold' ? 'star' : 'club'" :size="14" class="cp-ico" />{{ title }}
        <small v-if="subTitle" class="cp-sub">{{ subTitle }}</small>
        <small v-if="queryDate" class="cp-date">{{ queryDate }}</small>
      </span>
      <button class="m-link" :disabled="loading" @click="query">
        {{ loading ? "查询中…" : "查询" }}
      </button>
    </div>

    <!-- 黄金榜：名次分段（服务端一次只回 100 名） -->
    <div v-if="mode === 'gold'" class="m-seg cp-seg">
      <button
        v-for="s in GOLD_SEGMENTS"
        :key="s.key"
        :class="{ on: seg === s.key }"
        @click="pickSegment(s.key)"
      >
        {{ s.label }}
      </button>
    </div>

    <div class="cp-bar">
      <span class="m-more cp-count">
        {{ countText }}
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

    <!-- 联盟筛选：按已加载行的公告识别（详情回来后才会出现，所以有条件才显示） -->
    <div v-if="allianceOptions.length > 1" class="cp-chips">
      <button class="cp-chip" :class="{ on: alliance === 'all' }" @click="alliance = 'all'">
        全部
      </button>
      <button
        v-for="a in allianceOptions"
        :key="a"
        class="cp-chip"
        :class="{ on: alliance === a }"
        @click="alliance = a"
      >
        {{ a }}
      </button>
    </div>

    <p class="m-hint cp-hint">点俱乐部名下的车头头像看玩家详情，抽屉里能直接切磋、翻武将。</p>
  </div>

  <div v-if="loading && !rows.length" class="m-card">
    <div class="cp-skel"><i></i><i></i><i></i><i></i></div>
  </div>

  <div v-else-if="!rows.length" class="m-card">
    <div class="m-empty" style="padding: 30px 0">
      <div class="m-logo">{{ mode === "route" ? "⛵" : mode === "gold" ? "🏅" : "🏰" }}</div>
      <h3>{{ connected ? "还没有榜单数据" : "游戏未连接" }}</h3>
      <p>{{ connected ? `点「查询」拉取${title}` : "先到 Token 管理里连上游戏服务器" }}</p>
    </div>
  </div>

  <div v-else class="m-card cp-card">
    <div ref="exportDom">
      <ClubRankList
        :rows="visibleRows"
        :score-label="scoreLabel"
        :pending-id="pendingId"
        @open-player="openPlayer"
      />
    </div>

    <button v-if="hasMore" class="cp-more" :disabled="loadingMore" @click="loadNextPage">
      {{ loadingMore ? "加载中…" : `加载更多（还剩 ${restCount} 家）` }}
    </button>
    <p v-else-if="alliance !== 'all'" class="cp-foot">
      已按「{{ alliance }}」筛选，共 {{ visibleRows.length }} 家
    </p>
  </div>

  <RankPlayerSheet ref="sheetRef" @update:pending="pendingId = $event" />
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import html2canvas from "html2canvas";
import { useTokenStore } from "@/stores/tokenStore";
import { formatPower } from "@/utils/legionWar";
import { allianceincludes } from "@/utils/clubWarrankUtils";
import {
  getFirstSaturdayOfMonth,
  getRankQueryDate,
  getRankParams,
  getWarTypeName,
} from "@/utils/clubBattleUtils";
import { downloadCanvasAsImage } from "@/utils/imageExport";
import MIcon from "@/mobile/components/MIcon.vue";
import ClubRankList from "./ClubRankList.vue";
import RankPlayerSheet from "./RankPlayerSheet.vue";

const props = defineProps({
  mode: { type: String, default: "club" }, // club | gold | route
});

const tokenStore = useTokenStore();
const message = useMessage();

const loading = ref(false);
const loadingMore = ref(false);
const exporting = ref(false);
const rows = ref([]);
const rawList = ref([]);
const queryDate = ref("");
const islandName = ref("");
const warTypeName = ref("");
const exportDom = ref(null);
const sheetRef = ref(null);
const pendingId = ref(0);
const alliance = ref("all");

const GOLD_SEGMENTS = [
  { key: "gold1", label: "1-100", start: 1, end: 100 },
  { key: "gold2", label: "101-200", start: 101, end: 200 },
  { key: "gold3", label: "201-300", start: 201, end: 300 },
  { key: "gold4", label: "301-400", start: 301, end: 400 },
  { key: "gold5", label: "401-500", start: 401, end: 500 },
];
const seg = ref("gold1");

/* 一次补多少家详情；4 路并发是「快」与「别把 ws 打满」的折中 */
const PAGE_SIZE = 20;
const DETAIL_CONCURRENCY = 4;

const ALLIANCE_ORDER = ["梦盟", "大联盟", "正义联盟", "龙盟", "曦盟", "未知联盟"];

const title = computed(() => {
  if (props.mode === "gold") return "黄金积分榜";
  if (props.mode === "route") return "伟大航路";
  return "俱乐部榜";
});
const subTitle = computed(() => {
  if (props.mode === "route") return islandName.value || warTypeName.value || "";
  return "";
});
const scoreLabel = computed(() => {
  if (props.mode === "gold") return "黄金积分";
  if (props.mode === "route") return "积分";
  return "";
});

const connected = computed(
  () => tokenStore.getWebSocketStatus(tokenStore.selectedToken?.id) === "connected",
);

const todayText = () => {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};

const fmtScore = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : "0";
};

const countText = computed(() => {
  if (!rawList.value.length) return "点右上「查询」拉取榜单";
  const total = rawList.value.length;
  const loaded = rows.value.length;
  const base = loaded >= total ? `共 ${total} 家` : `共 ${total} 家 · 已加载 ${loaded}`;
  /* 筛选是纯前端过滤，总数不会变，所以把命中数补在尾巴上，否则「共 30 家」和 4 行对不上 */
  return alliance.value === "all" ? base : `${base} · ${alliance.value} ${visibleRows.value.length} 家`;
});

const restCount = computed(() => Math.max(0, rawList.value.length - rows.value.length));
/* 筛选期间也要能继续加载：加载更多只是往后补页，筛选是纯前端过滤，两者不冲突 */
const hasMore = computed(() => restCount.value > 0);

const allianceOptions = computed(() => {
  const set = new Set(rows.value.map((r) => r.alliance).filter(Boolean));
  return ALLIANCE_ORDER.filter((a) => set.has(a));
});

const visibleRows = computed(() =>
  alliance.value === "all" ? rows.value : rows.value.filter((r) => r.alliance === alliance.value),
);

/* 限流并发：4 个 worker 抢队列，避免 20 条 legion_getinfobyid 同时涌进 ws */
const mapLimit = async (list, limit, fn) => {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const idx = cursor++;
      await fn(list[idx]);
    }
  });
  await Promise.all(workers);
};

/* 榜单返回的俱乐部基础行。announcement 只有详情里才有，所以联盟 tag 先留空，
   详情回来再由 fetchLegionDetail 补上（别写「未知联盟」，那会误报）。 */
const normBasic = (c, fallbackRank) => {
  const score = c?.score ?? c?.sRScore ?? 0;
  return {
    key: `c${c?.id}`,
    id: c?.id,
    rank: Number(c?.rank) || fallbackRank,
    name: c?.name || "",
    serverId: c?.serverId || 0,
    logo: c?.logo || "",
    score,
    scoreText: fmtScore(score),
    redQuench: Number(c?.redQuench) || 0,
    power: Number(c?.power) || 0,
    powerText: formatPower(c?.power) || "0",
    announcement: c?.announcement || "",
    alliance: c?.announcement ? allianceincludes(c.announcement) : "",
    topHeroes: [],
    detailLoaded: false,
  };
};

/* 单个俱乐部详情：红淬 / 战力 / 公告 → 联盟 / 前三车头（按红淬降序，取 3） */
const fetchLegionDetail = async (tokenId, legionId) => {
  try {
    const d = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getinfobyid",
      { legionId },
      10000,
    );
    const ld = d?.legionData || {};
    const members = ld.members || {};
    const heroes = Object.entries(members)
      .map(([roleId, m]) => ({
        id: roleId,
        name: m?.name || m?.custom?.name || "未知",
        headImg: m?.headImg || m?.custom?.headImg || "",
        power: m?.power || 0,
        redQuench: m?.custom?.red_quench_cnt || 0,
      }))
      .sort((a, b) => b.redQuench - a.redQuench)
      .slice(0, 3);

    return {
      redQuench: Number(ld.quenchNum) || 0,
      power: Number(ld.power) || 0,
      powerText: formatPower(ld.power) || "0",
      announcement: ld.announcement || "",
      alliance: ld.announcement ? allianceincludes(ld.announcement) : "",
      topHeroes: heroes,
      detailLoaded: true,
    };
  } catch (e) {
    /* 单家详情失败不影响整张榜：保留基础行，标记已尝试 */
    return { detailLoaded: true };
  }
};

/* ---------- 三种榜的「基础行」取数 ---------- */
const fetchBasics = async (tokenId) => {
  if (props.mode === "club") {
    const res = await tokenStore.sendMessageWithPromise(tokenId, "legion_getarearank", {}, 10000);
    queryDate.value = todayText();
    const list = Array.isArray(res?.list) ? res.list : [];
    return list.map((c, i) => normBasic(c, i + 1));
  }

  if (props.mode === "gold") {
    const s = GOLD_SEGMENTS.find((x) => x.key === seg.value) || GOLD_SEGMENTS[0];
    const res = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legionwar_getgoldmonthwarrank",
      { startRank: s.start, endRank: s.end },
      10000,
    );
    queryDate.value = todayText();
    const list = Array.isArray(res?.legionList) ? res.legionList : [];
    return list.map((c, i) => normBasic(c, s.start + i));
  }

  /* route：先问本期是哪种岛（决定名次区间），再按区间拉榜 */
  const firstSaturday = getFirstSaturdayOfMonth();
  const today = new Date();
  const target = new Date(firstSaturday);
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  if (todayDate < targetDate) {
    message.warning(`当前日期在当月第一个周六(${firstSaturday})之前，不可查询`);
    return [];
  }

  const wt = await tokenStore.sendMessageWithPromise(
    tokenId,
    "saltroad_getwartype",
    { date: firstSaturday },
    10000,
  );
  if (!wt?.warType) {
    message.error("获取岛屿类型失败");
    return [];
  }
  const params = getRankParams(wt.warType);
  if (!params) {
    message.error("当前榜单只允许青铜、秘蓝、月宫、天宫查询");
    return [];
  }
  islandName.value = params.name;
  warTypeName.value = getWarTypeName(wt.warType);

  const qd = getRankQueryDate();
  queryDate.value = qd;
  const res = await tokenStore.sendMessageWithPromise(
    tokenId,
    "saltroad_getsaltroadwartotalrank",
    { date: qd, startRank: params.startRank, endRank: params.endRank },
    20000,
  );
  const list = Array.isArray(res?.legionList) ? res.legionList : [];
  return list.map((c, i) => normBasic(c, params.startRank + i));
};

/* ---------- 分页补详情 ---------- */
const loadNextPage = async () => {
  const tokenId = tokenStore.selectedToken?.id;
  if (!tokenId) return;
  const start = rows.value.length;
  if (start >= rawList.value.length) return;

  const slice = rawList.value.slice(start, start + PAGE_SIZE).map((o) => ({ ...o, topHeroes: [] }));
  rows.value = rows.value.concat(slice);

  /* ★ 必须拿 concat 之后的代理对象来改：直接改 slice 里的原始对象不会触发渲染 */
  const fresh = rows.value.slice(start);
  loadingMore.value = true;
  try {
    await mapLimit(fresh, DETAIL_CONCURRENCY, async (row) => {
      const detail = await fetchLegionDetail(tokenId, row.id);
      Object.assign(row, detail);
    });
  } finally {
    loadingMore.value = false;
  }
};

const query = async () => {
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
  rows.value = [];
  rawList.value = [];
  alliance.value = "all";
  try {
    const basics = await fetchBasics(token.id);
    if (!basics.length) {
      message.warning("未查询到榜单数据");
      return;
    }
    rawList.value = basics;
    await loadNextPage();
  } catch (e) {
    message.error(`查询失败: ${e.message}`);
  } finally {
    loading.value = false;
  }
};

const pickSegment = (key) => {
  if (seg.value === key) return;
  seg.value = key;
  query();
};

const openPlayer = async (hero) => {
  const roleId = hero?.id;
  if (!roleId) {
    message.error("该玩家 ID 缺失，无法查询");
    return;
  }
  await sheetRef.value?.open(roleId);
};

/* ---------- 导出图片 ---------- */
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
    const stamp = (queryDate.value || todayText()).replace(/[/:]/g, "-");
    downloadCanvasAsImage(canvas, `${stamp}-${title.value}.png`);
  } catch (e) {
    console.error("导出图片失败:", e);
    message.error("导出图片失败，请重试");
  } finally {
    exporting.value = false;
  }
};

onMounted(() => {
  if (connected.value) query();
});

watch(connected, (ok) => {
  if (ok && !rows.value.length && !loading.value) query();
});

watch(
  () => tokenStore.selectedToken?.id,
  () => {
    rows.value = [];
    rawList.value = [];
    queryDate.value = "";
    islandName.value = "";
    warTypeName.value = "";
    sheetRef.value?.close();
    sheetRef.value?.reset();
  },
);
</script>

<style scoped>
.cp-ico {
  display: inline-block;
  margin-right: 4px;
  vertical-align: -2px;
  color: var(--m-primary);
}
.cp-sub,
.cp-date {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--m-text3) !important;
  font-variant-numeric: tabular-nums;
}
.cp-seg {
  margin-bottom: 10px;
}
.cp-seg button {
  padding: 6px 10px;
  font-size: 12px;
}
.cp-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.cp-count {
  flex: 1 1 auto;
  min-width: 0;
}
.cp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.cp-chip {
  border: none;
  font-family: inherit;
  font-size: 11.5px;
  line-height: 20px;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  color: var(--m-text2) !important;
  cursor: pointer;
}
.cp-chip.on {
  background: var(--m-primary-soft);
  color: var(--m-primary) !important;
  font-weight: 500;
}
.cp-hint {
  margin: 8px 0 0;
}

/* ---------- 列表容器 ---------- */
.cp-card {
  padding: 0;
  overflow: hidden;
}
.cp-more {
  display: block;
  width: 100%;
  border: none;
  border-top: 1px solid var(--m-band);
  background: var(--m-card);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--m-primary) !important;
  padding: 13px 0;
  cursor: pointer;
}
.cp-more:disabled {
  color: var(--m-text3) !important;
  opacity: 0.7;
}
.cp-foot {
  margin: 0;
  border-top: 1px solid var(--m-band);
  padding: 11px 14px;
  font-size: 11px;
  color: var(--m-text3) !important;
}

/* 骨架 */
.cp-skel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 6px 0;
}
.cp-skel i {
  display: block;
  height: 54px;
  border-radius: var(--m-r-sm);
  background: var(--m-band);
  animation: cp-pulse 1.3s ease-in-out infinite;
}
.cp-skel i:nth-child(2) { width: 90%; }
.cp-skel i:nth-child(3) { width: 96%; }
.cp-skel i:nth-child(4) { width: 82%; }
@keyframes cp-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>

<script>
export default { name: "MobileClubRankPanel" };
</script>
