<template>
  <div class="m-pane m-push">
    <!-- ── 页头：标题 + 运行状态 ───────────────────────────── -->
    <div class="m-push-head">
      <div class="m-push-head-txt">
        <div class="m-push-t">主线推关</div>
        <div class="m-push-s">多账号批量推图，打完自动接下一关</div>
      </div>
      <span class="m-push-tag" :class="hasAnyRunning ? 'run' : 'idle'">
        {{ hasAnyRunning ? `推图中 ${runningCount}` : "待机" }}
      </span>
    </div>

    <!-- ── 账号列表：整块引用批量任务的账号选择器（标题 / 计数 / 管理分组 / 分组选择 + 一键清除 /
           每组人数 / 排序 / 全选 / 账号行），宿主一个字都不自己画 ──────────────── -->
    <div class="m-card">
      <TokenPicker
        v-model="selectedTokenIds"
        title="账号列表"
        :count-text="`已选 ${selectedTokenIds.length} / 共 ${tokens.length}`"
        manage-label="管理分组"
        :items="sortedTokens"
        :sort-config="tokenSort"
        :columns="2"
        max-height="38vh"
        :groups="tokenGroups"
        :group-selected-ids="selectedGroupIds"
        :group-counts="tokenGroupCounts"
        groups-title="分组选择"
        clear-groups-label="一键清除所有分组选择"
        :show-settings="false"
        :status-of="statusKind"
        @sort="sortTokens"
        @toggle-group="toggleGroup"
        @clear-groups="clearAllGroupSelection"
        @manage-groups="groupManagerOpen = true"
      />
    </div>

    <!-- ── 开战：两个全局参数 + 三个动作 ───────────────────── -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-t">开战</span>
        <span class="m-more">
          已选 {{ selectedTokenIds.length }} 个 · 推图中 {{ runningCount }} 个
        </span>
      </div>
      <div class="m-kv">
        <span class="m-k">自动继续</span>
        <span class="m-v">
          <button
            type="button"
            class="m-sw"
            :class="{ on: autoContinue }"
            role="switch"
            :aria-checked="autoContinue"
            @click="autoContinue = !autoContinue"
          >
            <i />
          </button>
        </span>
      </div>
      <div class="m-kv">
        <span class="m-k">最大重试</span>
        <span class="m-v">
          <span class="m-step">
            <button type="button" :disabled="maxRetries <= 1" @click="bumpMaxRetries(-1)">−</button>
            <input
              v-model.number="maxRetries"
              type="number"
              inputmode="numeric"
              @change="normalizeMaxRetries"
            />
            <button type="button" :disabled="maxRetries >= 999999" @click="bumpMaxRetries(1)">
              +
            </button>
          </span>
        </span>
      </div>
      <div class="m-btnrow">
        <button
          type="button"
          class="m-pb"
          :disabled="!selectedTokenIds.length || allSelectedRunning"
          @click="startSelected"
        >
          开始推图
        </button>
        <button
          type="button"
          class="m-db"
          :disabled="!hasSelectedRunning"
          @click="stopSelected"
        >
          全部停止
        </button>
        <button type="button" class="m-tb" @click="clearSelection">清除</button>
      </div>
    </div>

    <!-- ── 火把：三个档位 + 每个账号的发放数量 ──────────────── -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-t">火把</span>
        <button
          type="button"
          class="m-link"
          :disabled="!selectedTokenIds.length || !hasAnyRunning"
          @click="useTorchForSelected"
        >
          {{ torchRunning ? "发放中…" : "使用火把" }}
        </button>
      </div>
      <div class="m-chips m-chips--3">
        <button
          v-for="opt in torchOptions"
          :key="opt.value"
          type="button"
          class="m-chip"
          :class="{ on: torchItemId === opt.value }"
          @click="torchItemId = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="m-kv">
        <span class="m-k">每个账号使用数量</span>
        <span class="m-v">
          <span class="m-step">
            <button type="button" :disabled="torchQuantity <= 1" @click="bumpTorchQty(-1)">−</button>
            <input
              v-model.number="torchQuantity"
              type="number"
              inputmode="numeric"
              @change="normalizeTorchQty"
            />
            <button type="button" :disabled="torchQuantity >= 999" @click="bumpTorchQty(1)">
              +
            </button>
          </span>
        </span>
      </div>
      <p class="m-hint m-torch-hint">推图过程中才能发放；发完会断开这些账号的连接。</p>
    </div>

    <!-- ── 推图卡：正在跑 / 挂在选中里的账号 ───────────────── -->
    <div v-if="runningCards.length" class="m-runs">
      <div
        v-for="card in runningCards"
        :key="card.tokenId"
        class="m-card m-run"
        :class="{ on: card.running }"
      >
        <div class="m-run-h">
          <i class="m-run-dot" :class="`is-${statusKind(card.tokenId)}`" />
          <span class="m-run-nm" :title="card.tokenName">{{ card.tokenName }}</span>
          <span class="m-run-score">
            <b class="m-run-w">{{ card.wins }}胜</b>
            <b class="m-run-l">{{ card.losses }}负</b>
          </span>
        </div>
        <div class="m-run-meta">
          第 <b>{{ card.level > 0 ? card.level : "--" }}</b> 关
          <span class="m-run-sep">·</span>
          BOSS {{ card.bossName || "--" }}
        </div>
        <div v-if="card.torchLabel && card.torchLabel !== '火把 无'" class="m-run-torch">
          {{ card.torchLabel }}
        </div>
        <template v-if="card.running">
          <div class="m-pbar-wrap m-run-prog">
            <div class="m-pbar"><i :style="{ width: `${progressPercent(card)}%` }" /></div>
            <span class="m-pct">{{ formatDuration(card.countdown) }}</span>
          </div>
          <div class="m-run-foot">
            <span class="m-hint">已战斗 {{ card.battles }} 场</span>
            <button type="button" class="m-db m-db-sm" @click="stopOne(card.tokenId)">停止</button>
          </div>
        </template>
        <template v-else>
          <div class="m-run-foot">
            <span class="m-run-err" :title="card.lastError || '无'">
              {{ card.lastError || "无错误" }}
            </span>
            <button type="button" class="m-pb m-pb-sm" @click="startOne(card.tokenId)">
              启动
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- ── 推图日志 ────────────────────────────────────── -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-t">推图日志</span>
        <span class="m-more">{{ logs.length }}/2000</span>
        <button
          type="button"
          class="m-chip m-chip-xs"
          :class="{ on: autoScroll }"
          @click="autoScroll = !autoScroll"
        >
          自动滚动
        </button>
        <button type="button" class="m-link" :disabled="!logs.length" @click="clearLogs">
          清空
        </button>
      </div>
      <div v-if="logFilterOptions.length > 1 || logs.length" class="m-chiprow">
        <button
          type="button"
          class="m-chip m-chip-xs"
          :class="{ on: !logFilterTokenId }"
          @click="logFilterTokenId = null"
        >
          全部账号
        </button>
        <button
          v-for="opt in logFilterOptions"
          :key="opt.value"
          type="button"
          class="m-chip m-chip-xs"
          :class="{ on: logFilterTokenId === opt.value }"
          @click="logFilterTokenId = logFilterTokenId === opt.value ? null : opt.value"
        >
          {{ opt.label }}
        </button>
        <button
          type="button"
          class="m-chip m-chip-xs"
          :class="{ on: onlyErrors }"
          @click="onlyErrors = !onlyErrors"
        >
          仅错误
        </button>
      </div>
      <div
        ref="logsContainer"
        class="m-loglist"
        :class="{ 'is-empty': !visibleLogs.length }"
      >
        <div
          v-for="(log, index) in visibleLogs"
          :key="index"
          class="m-logi"
          :class="log.type"
        >
          <span class="m-logt">{{ log.time }}</span>
          <span class="m-logn">[{{ log.tokenName }}]</span>
          <span class="m-logm">{{ log.msg }}</span>
        </div>
        <div v-if="!visibleLogs.length" class="m-logempty">
          {{ logs.length ? "当前筛选下没有日志" : "还没有日志，开始推图后会实时打印" }}
        </div>
      </div>
    </div>

    <!-- 分组管理抽屉：由账号选择器标题行右侧的「管理分组」打开 -->
    <TokenGroupManager v-model:show="groupManagerOpen" :tokens="tokens" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import TokenPicker from "@/mobile/components/TokenPicker.vue";
import TokenGroupManager from "@/mobile/components/TokenGroupManager.vue";
import { BOSS_NAMES } from "./boss_names.js";

const MAX_LOGS = 2000;
const KNOWLEDGE_COIN_ITEM_ID = 1024;
// 火把信息刷新间隔（毫秒）
const TORCH_REFRESH_INTERVAL = 30000;

const message = useMessage();
const tokenStore = useTokenStore();

const selectedTokenIds = ref([]);
const selectedGroupIds = ref([]);
/* 账号排序：交给 TokenPicker 的排序按钮驱动（字段名与 TokenImport / 批量任务共用） */
const tokenSort = ref({ field: "lastUsed", direction: "asc" });
/* 分组管理抽屉（TokenPicker 标题行右侧的「管理分组」） */
const groupManagerOpen = ref(false);
const autoContinue = ref(true);
const maxRetries = ref(999999);
const autoScroll = ref(true);
const onlyErrors = ref(false);
const logsContainer = ref(null);
const logs = ref([]);
const runningStates = reactive({});
const torchRunning = ref(false);
const torchItemId = ref(1008);
/* 每个账号的使用数量，默认 10 个（桌面端默认 150，手机上一来就发一箱没道理） */
const torchQuantity = ref(10);
const logFilterTokenId = ref(null);
// 倒计时刷新（用于火把时间），每秒更新一次显示
const tickNow = ref(Date.now());
let tickTimer = null;

const torchOptions = [
  { label: "木材火把", value: 1008 },
  { label: "青铜火把", value: 1009 },
  { label: "咸神火把", value: 1010 },
];

const tokens = computed(() => tokenStore.gameTokens || []);
const tokenGroups = computed(() => tokenStore.tokenGroups || []);
/* 分组胶囊里的人数：只算「账号还在」的那部分（与批量任务同一个口径） */
const tokenGroupCounts = computed(() => {
  const map = {};
  tokenGroups.value.forEach((group) => {
    map[group.id] = tokenStore.getValidGroupTokenIds(group.id).length;
  });
  return map;
});

function sortValue(token, field) {
  if (field === "name") return String(token.name || token.id || "").toLowerCase();
  if (field === "server") return String(token.server || "").toLowerCase();
  const raw = field === "createdAt" ? token.createdAt : token.lastUsed || token.updatedAt;
  return new Date(raw || 0).getTime();
}

const sortedTokens = computed(() => {
  const { field, direction } = tokenSort.value;
  const dir = direction === "desc" ? -1 : 1;
  return [...tokens.value].sort((a, b) => {
    const left = sortValue(a, field);
    const right = sortValue(b, field);
    if (left === right) return String(a.id).localeCompare(String(b.id));
    return left < right ? -dir : dir;
  });
});

/* 点同一个字段切升降序，点别的字段从升序开始 */
function sortTokens(field) {
  const current = tokenSort.value;
  tokenSort.value = {
    field,
    direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
  };
}

const runningCount = computed(() => {
  return Object.values(runningStates).filter((state) => state?.running && !state.stopFlag).length;
});

const allSelectedRunning = computed(() => {
  return selectedTokenIds.value.length > 0
    && selectedTokenIds.value.every((tokenId) => isRunning(tokenId));
});

const hasSelectedRunning = computed(() => {
  return selectedTokenIds.value.some((tokenId) => isRunning(tokenId));
});

const hasAnyRunning = computed(() => {
  return Object.values(runningStates).some((state) => state?.running && !state.stopFlag);
});

function getTorchLabel(state) {
  if (!state) return "火把 无";
  const remaining = computeTorchRemaining(state);
  if (state.torchType > 0 && remaining > 0) {
    const name = state.torchTypeName || getTorchName(state.torchType);
    return `${name} ${formatTorchTime(remaining)}`;
  }
  return "火把 无";
}

const runningCards = computed(() => {
  const ids = new Set(selectedTokenIds.value);
  Object.values(runningStates).forEach((state) => {
    if (state?.tokenId) ids.add(state.tokenId);
  });

  return [...ids]
    .filter((tokenId) => tokens.value.some((token) => token.id === tokenId))
    .map((tokenId) => {
      const token = getToken(tokenId);
      const state = runningStates[tokenId] || {};
      const level = Number(state.level || 0);
      return {
        tokenId,
        tokenName: token?.name || tokenId,
        running: Boolean(state.running && !state.stopFlag),
        level,
        bossName:
          state.bossName && Number(state.bossLevel || 0) === level
            ? state.bossName
            : getBossName(level),
        wins: state.wins || 0,
        losses: state.losses || 0,
        battles: state.battles || 0,
        countdown: state.countdown || 0,
        totalTime: state.totalTime || 0,
        lastError: state.lastError || "",
        torchLabel: getTorchLabel(state),
      };
    });
});

const visibleLogs = computed(() => {
  let list = logs.value;
  if (logFilterTokenId.value) {
    list = list.filter((log) => log.tokenId === logFilterTokenId.value);
  }
  if (onlyErrors.value) {
    list = list.filter((log) => log.type === "error");
  }
  return list;
});

const logFilterOptions = computed(() => {
  const map = new Map();
  logs.value.forEach((log) => {
    if (!map.has(log.tokenId)) {
      map.set(log.tokenId, { label: log.tokenName, value: log.tokenId });
    }
  });
  selectedTokenIds.value.forEach((id) => {
    if (!map.has(id)) {
      const t = getToken(id);
      map.set(id, { label: t?.name || id, value: id });
    }
  });
  Object.values(runningStates).forEach((state) => {
    if (state?.tokenId && !map.has(state.tokenId)) {
      map.set(state.tokenId, { label: state.tokenName || state.tokenId, value: state.tokenId });
    }
  });
  return Array.from(map.values());
});

watch(
  () => [visibleLogs.value.length, onlyErrors.value, logFilterTokenId.value],
  () => {
    if (!autoScroll.value) return;
    nextTick(() => {
      const el = logsContainer.value;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  },
);

function getToken(tokenId) {
  return tokens.value.find((token) => token.id === tokenId);
}

function getTokenName(tokenId) {
  return getToken(tokenId)?.name || tokenId;
}

function getWebSocketStatus(tokenId) {
  return tokenStore.getWebSocketStatus(tokenId) || "disconnected";
}

function isConnected(tokenId) {
  return getWebSocketStatus(tokenId) === "connected";
}

function isRunning(tokenId) {
  const state = runningStates[tokenId];
  return Boolean(state?.running && !state.stopFlag);
}

/* 连接状态 → 行尾那颗粒的档位（ok 绿 / busy 琥珀呼吸 / err 红 / off 灰） */
function statusKind(tokenId) {
  const status = getWebSocketStatus(tokenId);
  if (status === "connected") return "ok";
  if (status === "connecting" || status === "disconnecting") return "busy";
  if (status === "error") return "err";
  return "off";
}

/* 数字步进：手输/点按都收口到 [min, max]，空值按 min 兜底 */
function clampNum(value, min, max) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}
function bumpMaxRetries(delta) {
  maxRetries.value = clampNum((Number(maxRetries.value) || 0) + delta, 1, 999999);
}
function normalizeMaxRetries() {
  maxRetries.value = clampNum(maxRetries.value, 1, 999999);
}
function bumpTorchQty(delta) {
  torchQuantity.value = clampNum((Number(torchQuantity.value) || 0) + delta, 1, 999);
}
function normalizeTorchQty() {
  torchQuantity.value = clampNum(torchQuantity.value, 1, 999);
}

function toggleGroup(group) {
  const index = selectedGroupIds.value.indexOf(group.id);
  const validIds = (group.tokenIds || []).filter((tokenId) => getToken(tokenId));

  if (index >= 0) {
    selectedGroupIds.value.splice(index, 1);
    const groupSet = new Set(validIds);
    selectedTokenIds.value = selectedTokenIds.value.filter((tokenId) => !groupSet.has(tokenId));
  } else {
    selectedGroupIds.value.push(group.id);
    selectedTokenIds.value = [...new Set([...selectedTokenIds.value, ...validIds])];
  }
}

/* 「一键清除所有分组选择」：分组勾选和账号勾选一起清（口径与批量任务同名方法一致） */
function clearAllGroupSelection() {
  selectedGroupIds.value = [];
  selectedTokenIds.value = [];
}

function clearSelection() {
  Object.keys(runningStates).forEach((tokenId) => {
    stopOne(tokenId);
  });
  Object.keys(runningStates).forEach((tokenId) => {
    delete runningStates[tokenId];
  });
  selectedTokenIds.value = [];
  selectedGroupIds.value = [];
}

function initState(tokenId, tokenName) {
  runningStates[tokenId] = {
    tokenId,
    tokenName,
    running: true,
    stopFlag: false,
    level: 0,
    bossName: "",
    bossLevel: 0, // bossName 对应的关卡，用于判断名称是否过期
    wins: 0,
    losses: 0,
    retries: 0,
    maxRetries: maxRetries.value || 999999,
    battles: 0,
    countdown: 0,
    totalTime: 0,
    lastError: "",
    startTime: Date.now(),
    consecutiveErrors: 0,
    maxConsecutiveErrors: 5,
    // 火把相关
    torchType: 0,
    torchTypeName: "",
    torchRemaining: 0,
    torchSettleTime: 0,
    torchActive: false,
    torchBaseTimestamp: 0,
    torchBaseRemaining: 0,
    lastTorchFetch: 0,
  };
}

/* 日志时间固定 24 小时制：默认 toLocaleTimeString() 在中文环境会输出「下午2:22:01」，
   比时间列宽出一截（手机上直接把 BOSS 那列挤掉）。8 个字符才排得进 52px。 */
function formatClock(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function addLog(tokenId, tokenName, msg, type = "info") {
  logs.value.push({
    time: formatClock(new Date()),
    tokenId,
    tokenName,
    msg,
    type,
  });

  if (logs.value.length > MAX_LOGS) {
    const overflow = logs.value.length - MAX_LOGS;
    logs.value.splice(0, overflow);
  }
}

function clearLogs() {
  logs.value = [];
}

function sanitizeError(error) {
  return String(error?.message || error || "")
    .replace(/请求超时: \w+(\s*\(\d+ms\))?/g, "请求超时")
    .replace(/\b\w+_\w+\b(\s*\(\d+ms\))?/g, "")
    .trim();
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function responseBody(response) {
  if (response?.body && typeof response.body === "object") return response.body;
  return response || {};
}

function getTorchName(torchType) {
  if (!torchType || torchType === 0) return "";
  const option = torchOptions.find((item) => item.value === torchType);
  return option ? option.label : `火把(${torchType})`;
}

function applyTorchInfo(state, info) {
  if (!state || !info) return;
  const type = Number(info.torchType || 0);
  const remaining = Number(info.torchRemaining || 0);
  const settleTime = Number(info.torchSettleTime || 0);

  state.torchType = type;
  state.torchTypeName = getTorchName(type);
  state.torchRemaining = remaining;
  state.torchSettleTime = settleTime;
  state.torchActive = type > 0 && remaining > 0;
  state.torchBaseTimestamp = Date.now();
  state.torchBaseRemaining = remaining;
  state.lastTorchFetch = Date.now();
}

function readTorchFromResponse(response) {
  const body = responseBody(response);
  const role = body.role || body.body?.role || {};
  return {
    torchType: pickNumber(role.autoClickType, body.autoClickType) || 0,
    torchRemaining: pickNumber(role.autoClickTime, body.autoClickTime) || 0,
    torchSettleTime: pickNumber(role.autoClickSettleTime, body.autoClickSettleTime) || 0,
  };
}

function computeTorchRemaining(state) {
  if (!state) return 0;
  // settleTime 是绝对时间戳时才使用它计算倒计时
  if (state.torchSettleTime > 0) {
    const settleMs = state.torchSettleTime < 1e12
      ? state.torchSettleTime * 1000
      : state.torchSettleTime;
    if (settleMs > tickNow.value) {
      return Math.max(0, Math.floor((settleMs - tickNow.value) / 1000));
    }
  }
  // 否则用基础值做本地倒计时
  if (state.torchBaseTimestamp && state.torchBaseRemaining) {
    const diff = state.torchBaseRemaining
      - Math.floor((tickNow.value - state.torchBaseTimestamp) / 1000);
    return Math.max(0, diff);
  }
  return Number(state.torchRemaining || 0);
}

function formatTorchTime(seconds) {
  if (!seconds || seconds <= 0) return "0分钟";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

function getBossName(level) {
  if (!level || level <= 0) return "";
  return BOSS_NAMES[level] || "";
}

/**
 * 更新关卡并同步 BOSS 名称。
 * 服务器返回名称时优先使用，否则按当前关卡从 BOSS_NAMES 重新取值，
 * 避免关卡推进后仍显示启动时那一关的 BOSS。
 */
function applyLevel(state, level, serverBossName = "") {
  if (!state) return;
  const nextLevel = Number(level) || 0;
  if (nextLevel > 0) state.level = nextLevel;

  if (serverBossName) {
    state.bossName = serverBossName;
    state.bossLevel = state.level;
    return;
  }
  if (state.bossLevel !== state.level || !state.bossName) {
    state.bossName = getBossName(state.level);
    state.bossLevel = state.level;
  }
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return minutes > 0 ? `${minutes}m${rest}s` : `${rest}s`;
}

function progressPercent(card) {
  if (!card.totalTime) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - card.countdown / card.totalTime) * 100)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitConnected(tokenId, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isConnected(tokenId)) return true;
    await sleep(200);
  }
  return isConnected(tokenId);
}

async function ensureConnected(tokenId, retryCount = 2) {
  if (isConnected(tokenId)) return true;

  const token = getToken(tokenId);
  const tokenName = token?.name || tokenId;
  if (!token) {
    addLog(tokenId, tokenName, "重连失败：未找到账号数据", "error");
    return false;
  }

  for (let attempt = 0; attempt < retryCount; attempt++) {
    if (attempt > 0) {
      addLog(tokenId, tokenName, `重连尝试 ${attempt}/${retryCount}，等待 3 秒...`, "warning");
      await sleep(3000);
    } else {
      addLog(tokenId, tokenName, "WebSocket 断开，尝试连接...", "info");
    }

    try {
      await tokenStore.createWebSocketConnection(tokenId, token.token, token.wsUrl);
      if (await waitConnected(tokenId, 3000)) {
        addLog(tokenId, tokenName, "WebSocket 连接成功", "success");
        return true;
      }
    } catch (error) {
      addLog(tokenId, tokenName, `连接失败：${sanitizeError(error)}`, "error");
    }
  }

  addLog(tokenId, tokenName, `WebSocket 连接失败，已重试 ${retryCount} 次，放弃`, "error");
  return false;
}

async function fetchTorchInfo(tokenId, tokenName, { silent = false } = {}) {
  if (!isConnected(tokenId)) return null;
  try {
    const response = await tokenStore.sendMessageWithPromise(
      tokenId,
      "role_getroleinfo",
      {},
      10000,
    );
    const info = readTorchFromResponse(response);
    const state = runningStates[tokenId] || initState(tokenId, tokenName);
    if (state !== runningStates[tokenId]) runningStates[tokenId] = state;
    applyTorchInfo(state, info);
    if (!silent) {
      if (info.torchType > 0) {
        addLog(
          tokenId,
          tokenName,
          `火把状态：${state.torchTypeName} ${formatTorchTime(state.torchRemaining)}`,
          "info",
        );
      } else {
        addLog(tokenId, tokenName, "当前没有使用中的火把", "info");
      }
    }
    return state;
  } catch (error) {
    if (!silent) {
      addLog(tokenId, tokenName, `获取火把信息失败：${sanitizeError(error)}`, "warning");
    }
    return null;
  }
}

async function initializeBattleData(tokenId, tokenName) {
  try {
    await tokenStore.sendMessageWithPromise(tokenId, "role_getroleinfo", {}, 10000);
    const response = await tokenStore.sendMessageWithPromise(tokenId, "fight_startlevel", {}, 10000);
    const version = response?.battleData?.version || response?.body?.battleData?.version;
    if (version) {
      tokenStore.setBattleVersion(version);
      addLog(tokenId, tokenName, `battleVersion: ${version}`, "info");
    }
  } catch (error) {
    addLog(tokenId, tokenName, `初始化战斗数据失败：${sanitizeError(error)}`, "warning");
  }
}

async function upgradeHangupReward(tokenId, tokenName) {
  try {
    const roleInfo = await tokenStore.sendMessageWithPromise(tokenId, "role_getroleinfo", {}, 5000);
    const items = roleInfo?.role?.items || roleInfo?.body?.role?.items || roleInfo?.items || [];
    let coinCount = 0;

    if (Array.isArray(items)) {
      const coin = items.find((entry) => Number(entry.id ?? entry.itemId) === KNOWLEDGE_COIN_ITEM_ID);
      coinCount = Number(coin?.num ?? coin?.count ?? coin?.quantity ?? 0);
    } else if (items && typeof items === "object") {
      coinCount = Number(items[KNOWLEDGE_COIN_ITEM_ID]?.num ?? items[KNOWLEDGE_COIN_ITEM_ID] ?? 0);
    }

    if (coinCount <= 0) {
      addLog(tokenId, tokenName, "知识币不足，跳过升级挂机奖励", "info");
      return;
    }

    addLog(tokenId, tokenName, `知识币剩余：${coinCount}，开始升级挂机奖励`, "info");
    let used = 0;
    while (coinCount > 0) {
      const state = runningStates[tokenId];
      if (!state || state.stopFlag) break;

      const upgradeNum = coinCount >= 50 ? 50 : coinCount >= 10 ? 10 : 1;
      try {
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "system_hangupupgrade",
          { upgradeNum },
          5000,
        );
        coinCount -= upgradeNum;
        used += upgradeNum;
        addLog(tokenId, tokenName, `升级挂机 +${upgradeNum}，剩余 ${coinCount}`, "success");
      } catch (error) {
        addLog(tokenId, tokenName, `升级挂机失败 (${upgradeNum})：${sanitizeError(error)}`, "warning");
        break;
      }
      await sleep(1200);
    }

    if (used > 0) {
      addLog(tokenId, tokenName, `升级挂机奖励完成，共用 ${used} 个知识币`, "success");
    }
  } catch (error) {
    addLog(tokenId, tokenName, `升级挂机奖励异常：${sanitizeError(error)}`, "warning");
  }
}

async function runOneBattle(tokenId, tokenName) {
  const state = runningStates[tokenId];
  if (!state || state.stopFlag) return { stopped: true };

  let battleTime = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await tokenStore.sendMessageWithPromise(
        tokenId,
        "fight_calcleveltime",
        {},
        15000,
      );
      const body = responseBody(response);
      battleTime = pickNumber(body.battleTime, body.body?.battleTime) || 0;
      const syncedLevel = pickNumber(body.currLevel, body.levelId, body.body?.currLevel);
      const syncedBossName = body.bossName || body.body?.bossName || body.role?.bossName || "";

      if (syncedLevel !== null && syncedLevel !== state.level) {
        applyLevel(state, syncedLevel, syncedBossName);
        addLog(tokenId, tokenName, `等级同步：${syncedLevel}`, "info");
        if (state.bossName) {
          addLog(tokenId, tokenName, `BOSS：${state.bossName}`, "info");
        }
      } else if (syncedBossName && syncedBossName !== state.bossName) {
        applyLevel(state, state.level, syncedBossName);
        addLog(tokenId, tokenName, `BOSS同步：${syncedBossName}`, "info");
      } else {
        applyLevel(state, state.level);
      }
      if (battleTime > 0) break;

      state.losses += 1;
      state.retries += 1;
      state.lastError = "服务器未返回战斗时间";
      addLog(tokenId, tokenName, `服务器未返回有效战斗时间，重试 ${state.retries}`, "warning");
    } catch (error) {
      if (String(error?.message || "").includes("WebSocket") && attempt === 0) {
        if (await ensureConnected(tokenId)) continue;
      }

      state.losses += 1;
      state.retries += 1;
      state.lastError = sanitizeError(error);
      addLog(tokenId, tokenName, `计算战斗时间失败，重试 ${state.retries}：${state.lastError}`, "error");
      return { success: false, error: state.lastError };
    }
  }

  if (battleTime <= 0) {
    if (state.retries >= state.maxRetries) state.stopFlag = true;
    return { success: false, error: state.lastError };
  }

  state.totalTime = battleTime;
  state.countdown = battleTime;
  state.battles += 1;
  addLog(tokenId, tokenName, `开始关卡 ${state.level || 0}，预计 ${battleTime}s`, "info");

  if (state.level > 0 && state.level % 100 === 1) {
    addLog(tokenId, tokenName, `通过逢100关卡 ${state.level - 1}，自动升级挂机奖励`, "info");
    await upgradeHangupReward(tokenId, tokenName);
  }

  const startedAt = Date.now();
  let tick = 0;
  while (state.countdown > 0 && !state.stopFlag) {
    await sleep(1000);
    tick += 1;
    state.countdown = Math.max(
      0,
      Math.ceil((battleTime * 1000 - (Date.now() - startedAt)) / 1000),
    );
    if (tick % 25 === 0) {
      try {
        tokenStore.sendMessage(tokenId, "heart_beat");
      } catch {}
    }
  }

  if (state.stopFlag) return { stopped: true };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await tokenStore.sendMessageWithPromise(tokenId, "fight_level", {}, 15000);
      const body = responseBody(response);
      const success = Boolean(body.success || body.isWin);
      const nextLevel = pickNumber(body.currLevel, body.nextLevel, body.levelId);
      const nextBossName = body.bossName || body.body?.bossName || body.role?.bossName || "";

      if (success) {
        state.wins += 1;
        state.retries = 0;
        state.consecutiveErrors = 0;
        applyLevel(state, nextLevel || state.level + 1, nextBossName);
        addLog(
          tokenId,
          tokenName,
          `胜利，当前关卡 ${state.level}${state.bossName ? `，BOSS：${state.bossName}` : ""}`,
          "success",
        );
        // 战斗结束后刷新火把状态
        fetchTorchInfo(tokenId, tokenName, { silent: true }).catch(() => {});
        return { success: true };
      }

      state.losses += 1;
      state.retries += 1;
      state.lastError = body.code || body.msg || "服务器判定失败";
      if (state.retries >= state.maxRetries) {
        state.stopFlag = true;
        addLog(tokenId, tokenName, `连续失败 ${state.retries} 次，停止推图`, "error");
      } else {
        addLog(tokenId, tokenName, `失败，重试 ${state.retries} 次`, "warning");
      }
      return { success: false, error: state.lastError };
    } catch (error) {
      const errorMessage = sanitizeError(error);
      if (String(error?.message || "").includes("WebSocket") && attempt === 0) {
        if (await ensureConnected(tokenId)) continue;
      }

      state.losses += 1;
      state.retries += 1;
      state.consecutiveErrors += 1;
      state.lastError = errorMessage;

      if (state.consecutiveErrors >= state.maxConsecutiveErrors) {
        addLog(
          tokenId,
          tokenName,
          `连续战斗异常 ${state.consecutiveErrors} 次，尝试断开重连...`,
          "warning",
        );
        if (await ensureConnected(tokenId)) {
          state.consecutiveErrors = 0;
          addLog(tokenId, tokenName, "重连成功，继续推图", "success");
          if (attempt === 0) continue;
        }
      }

      if (state.retries >= state.maxRetries) {
        state.stopFlag = true;
        addLog(tokenId, tokenName, `连续失败 ${state.retries} 次，停止`, "error");
      } else {
        addLog(tokenId, tokenName, `战斗异常，重试 ${state.retries} 次：${errorMessage}`, "error");
      }
      return { success: false, error: errorMessage };
    }
  }

  return { success: false, error: "未知战斗异常" };
}

async function startOne(tokenId) {
  const tokenName = getTokenName(tokenId);
  if (isRunning(tokenId)) {
    addLog(tokenId, tokenName, "该账号已在推图中", "warning");
    return;
  }

  initState(tokenId, tokenName);
  addLog(tokenId, tokenName, "开始推图", "success");

  if (!await ensureConnected(tokenId)) {
    runningStates[tokenId].running = false;
    runningStates[tokenId].lastError = "WebSocket 未连接";
    return;
  }

  await initializeBattleData(tokenId, tokenName);

  try {
    const roleInfo = await tokenStore.sendMessageWithPromise(tokenId, "role_getroleinfo", {}, 10000);
    const body = responseBody(roleInfo);
    const level = pickNumber(body.levelId, body.body?.levelId, body.currLevel);
    if (level !== null) {
      applyLevel(runningStates[tokenId], level);
      addLog(tokenId, tokenName, `当前关卡：${level}`, "info");

      try {
        const levelInfo = await tokenStore.sendMessageWithPromise(tokenId, "fight_level", {}, 10000);
        const bossName = levelInfo?.bossName || levelInfo?.body?.bossName || levelInfo?.role?.bossName || "";
        applyLevel(runningStates[tokenId], level, bossName);
        if (runningStates[tokenId].bossName) {
          addLog(tokenId, tokenName, `BOSS：${runningStates[tokenId].bossName}`, "info");
        }
      } catch (levelError) {
        addLog(tokenId, tokenName, `获取BOSS信息失败：${sanitizeError(levelError)}`, "info");
      }
    }
    // 启动时查询火把状态
    await fetchTorchInfo(tokenId, tokenName, { silent: true });
  } catch (error) {
    addLog(tokenId, tokenName, `获取当前关卡失败：${sanitizeError(error)}`, "warning");
  }

  try {
    while (runningStates[tokenId] && !runningStates[tokenId].stopFlag) {
      const state = runningStates[tokenId];
      // 周期性刷新火把
      if (Date.now() - (state.lastTorchFetch || 0) > TORCH_REFRESH_INTERVAL) {
        fetchTorchInfo(tokenId, tokenName, { silent: true }).catch(() => {});
      }

      const result = await runOneBattle(tokenId, tokenName);
      if (result.stopped) break;

      if (!state || state.stopFlag) break;

      if (!result.success) {
        if (state.retries >= state.maxRetries) break;
        await sleep(3000);
      } else if (!autoContinue.value) {
        addLog(tokenId, tokenName, "自动继续已关闭，推图暂停", "warning");
        state.stopFlag = true;
        break;
      }

      await sleep(2000);
    }
  } catch (error) {
    addLog(tokenId, tokenName, `推图异常：${sanitizeError(error)}`, "error");
  } finally {
    const state = runningStates[tokenId];
    if (state) {
      state.running = false;
      state.countdown = 0;
      const elapsed = Math.round((Date.now() - state.startTime) / 1000);
      addLog(
        tokenId,
        tokenName,
        `推图结束：${state.wins}胜 ${state.losses}败，共 ${state.battles} 场，耗时 ${elapsed}s`,
        state.wins > 0 ? "success" : "warning",
      );
      // 推图结束后再次查询火把状态
      try {
        if (isConnected(tokenId)) {
          await fetchTorchInfo(tokenId, tokenName, { silent: true });
        }
      } catch {}
    }
  }
}

async function startSelected() {
  for (const tokenId of selectedTokenIds.value) {
    if (!isRunning(tokenId)) {
      startOne(tokenId);
      await sleep(2000);
    }
  }
}

function stopOne(tokenId) {
  const tokenName = getTokenName(tokenId);
  const state = runningStates[tokenId];
  if (state) {
    state.stopFlag = true;
    addLog(tokenId, tokenName, "手动停止推图", "warning");
  }
  try {
    tokenStore.closeWebSocketConnection(tokenId);
  } catch {}
}

function stopSelected() {
  selectedTokenIds.value.forEach((tokenId) => {
    if (isRunning(tokenId)) stopOne(tokenId);
  });
}

async function useTorchForSelected() {
  if (!selectedTokenIds.value.length) return;

  const option = torchOptions.find((item) => item.value === torchItemId.value);
  const itemName = option?.label || `#${torchItemId.value}`;
  const quantity = torchQuantity.value || 1;
  torchRunning.value = true;

  let successCount = 0;
  let failCount = 0;

  for (const tokenId of selectedTokenIds.value) {
    const tokenName = getTokenName(tokenId);
    addLog(tokenId, tokenName, `开始使用 ${itemName} x${quantity}`, "info");
    try {
      if (!await ensureConnected(tokenId)) {
        addLog(tokenId, tokenName, `连接失败，跳过使用 ${itemName}`, "error");
        failCount += 1;
        continue;
      }

      // 1. 使用火把
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "item_consume",
        { itemId: torchItemId.value, quantity },
        10000,
      );
      // 2. 同一连接下立刻查询最新火把状态（不关闭连接）
      try {
        const state = runningStates[tokenId] || initState(tokenId, tokenName);
        if (state !== runningStates[tokenId]) runningStates[tokenId] = state;
        const roleInfo = await tokenStore.sendMessageWithPromise(
          tokenId,
          "role_getroleinfo",
          {},
          10000,
        );
        applyTorchInfo(state, readTorchFromResponse(roleInfo));
      } catch (fetchError) {
        addLog(tokenId, tokenName, `刷新火把状态失败：${sanitizeError(fetchError)}`, "warning");
      }

      addLog(tokenId, tokenName, `使用 ${itemName} x${quantity} 完成`, "success");
      successCount += 1;
    } catch (error) {
      addLog(tokenId, tokenName, `使用 ${itemName} 失败：${sanitizeError(error)}`, "error");
      failCount += 1;
    } finally {
      try {
        tokenStore.closeWebSocketConnection(tokenId);
      } catch {}
    }
  }

  torchRunning.value = false;
  message.success(`使用 ${itemName} 完成：成功 ${successCount} 个，失败 ${failCount} 个`);
}

onMounted(() => {
  tickTimer = setInterval(() => {
    tickNow.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  Object.values(runningStates).forEach((state) => {
    if (state?.running) {
      state.stopFlag = true;
      try {
        tokenStore.closeWebSocketConnection(state.tokenId);
      } catch {}
    }
  });
});
</script>

<style scoped>
/* ============================================================
 * 主线推关（移动端）—— 依 src/mobile/DESIGN.md 重排
 *   · 一张卡只做一件事：账号选择 / 开战 / 火把 / 推图卡 / 日志
 *   · 分隔靠卡片之间的 12px 与卡内 band 平带，不用边框堆叠
 *   · 颜色全部吃 --m-*，换肤 + 深浅色都自动跟随
 *
 * 暗色坑：App.vue 有 html[data-theme="dark"] span/div/p{color:#fff!important}（(0,1,2)），
 * 比继承强 ⇒ 所有「要压暗的文字」必须带 !important，靠 scoped 多一级类名压回去。
 * ============================================================ */

/* ---------- 页头 ---------- */
.m-push-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.m-push-head-txt {
  flex: 1;
  min-width: 0;
}
.m-push-t {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--m-text) !important;
}
.m-push-s {
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--m-text3) !important;
  margin-top: 2px;
}
.m-push-tag {
  flex: none;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  padding: 3px 8px;
  border-radius: var(--m-r-sm);
}
.m-push-tag.idle {
  color: var(--m-text3) !important;
  background: var(--m-bg);
}
.m-push-tag.run {
  color: var(--m-blue) !important;
  background: var(--m-blue-soft);
}

/* ---------- 卡内文字层级（压过 App.vue 的暗色刷白） ---------- */
.m-push .m-card-h .m-more {
  color: var(--m-text3) !important;
}
.m-push .m-kv .m-k {
  color: var(--m-text3) !important;
}
.m-push .m-hint {
  color: var(--m-text3) !important;
}

/* ---------- 步进数字（最大重试 / 火把数量共用一个） ---------- */
.m-step {
  display: inline-flex;
  align-items: center;
  height: 32px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  overflow: hidden;
}
.m-step button {
  width: 30px;
  height: 32px;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 15px;
  line-height: 1;
  color: var(--m-text2) !important;
  cursor: pointer;
}
.m-step button[disabled] {
  opacity: 0.35;
  pointer-events: none;
}
.m-step input {
  width: 66px;
  height: 32px;
  border: none;
  background: none;
  padding: 0;
  text-align: center;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  color: var(--m-text) !important;
  font-variant-numeric: tabular-nums;
  -webkit-appearance: none;
  appearance: none;
}
/* 去掉 number 输入框的原生上下三角（桌面浏览器会画） */
.m-step input::-webkit-outer-spin-button,
.m-step input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* ---------- 火把档位 / 日志筛选：同一套小胶囊 ---------- */
.m-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.m-chips--3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.m-chip {
  border: none;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--m-text2) !important;
  padding: 8px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.m-chip.on {
  background: var(--m-primary);
  color: var(--m-on-primary) !important;
}
.m-chip-xs {
  font-size: 11px;
  font-weight: 400;
  padding: 4px 8px;
}
.m-chiprow {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  overflow-x: auto;
  scrollbar-width: none;
}
.m-chiprow::-webkit-scrollbar {
  display: none;
}

/* ---------- 动作按钮（卡内基线 36px，不用 44px 的整幅 CTA） ---------- */
.m-btnrow {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.m-pb,
.m-db,
.m-tb {
  height: 36px;
  border: none;
  border-radius: var(--m-r-md);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0 12px;
  flex: none;
}
.m-pb {
  flex: 1 1 auto;
  background: var(--m-primary);
  color: var(--m-on-primary) !important;
}
.m-db {
  background: var(--m-red-soft);
  color: var(--m-red) !important;
}
.m-tb {
  background: none;
  color: var(--m-text3) !important;
  font-weight: 400;
  padding: 0 6px;
}
.m-pb[disabled],
.m-db[disabled],
.m-tb[disabled] {
  opacity: 0.4;
  pointer-events: none;
}
.m-pb-sm,
.m-db-sm {
  height: 30px;
  font-size: 12px;
  padding: 0 12px;
  flex: none;
}

/* 文字按钮（卡头右侧）：色必须 !important，否则暗色被刷白 */
.m-push .m-link {
  color: var(--m-primary) !important;
  font-size: 12.5px;
}
.m-push .m-link[disabled] {
  opacity: 0.4;
  pointer-events: none;
}

.m-torch-hint {
  margin: 10px 0 0;
}

/* ---------- 推图卡 ---------- */
.m-runs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.m-run {
  padding: 12px 14px;
}
.m-run-h {
  display: flex;
  align-items: center;
  gap: 7px;
}
.m-run-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--m-r-sm);
  background: var(--m-border);
}
.m-run-dot.is-ok { background: var(--m-green); }
.m-run-dot.is-busy {
  background: var(--m-amber);
  animation: m-run-pulse 1.1s ease-in-out infinite;
}
.m-run-dot.is-err { background: var(--m-red); }
@keyframes m-run-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.m-run-nm {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--m-text2) !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-run-score {
  flex: none;
  display: inline-flex;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.m-run-w { color: var(--m-green) !important; }
.m-run-l { color: var(--m-red) !important; }
.m-run-meta {
  margin-top: 5px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--m-text3) !important;
}
.m-run-meta b {
  font-weight: 700;
  color: var(--m-text) !important;
  font-variant-numeric: tabular-nums;
}
.m-run-sep {
  margin: 0 2px;
}
.m-run-torch {
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--m-amber) !important;
}
.m-run-prog {
  margin-top: 9px;
}
.m-run-prog .m-pct {
  font-size: 12px;
}
.m-run-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 9px;
}
.m-run-err {
  min-width: 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--m-text3) !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 日志：卡内一块 band 底的控制台 ---------- */
.m-loglist {
  height: 260px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 6px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
/* 空态不占 260px：没日志的时候那块控制台只有一行提示，撑满一屏高纯属浪费 */
.m-loglist.is-empty {
  height: auto;
  padding: 26px 10px;
}
.m-logi {
  display: grid;
  grid-template-columns: 52px 66px minmax(0, 1fr);
  gap: 6px;
  padding: 4px 6px;
  border-radius: var(--m-r-sm);
  font-size: 11px;
  line-height: 1.5;
  color: var(--m-text2) !important;
}
.m-logt {
  color: var(--m-text3) !important;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.m-logn {
  color: var(--m-text3) !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-logm {
  min-width: 0;
  overflow-wrap: anywhere;
}
.m-logi.success { color: var(--m-green) !important; }
.m-logi.warning { color: var(--m-amber) !important; }
.m-logi.error {
  background: var(--m-red-soft);
  color: var(--m-red) !important;
}
/* 语义色整行着色时，行内两列子元素也跟着走（否则被上面 text3 抢走） */
.m-logi.success .m-logt,
.m-logi.success .m-logn { color: var(--m-green) !important; opacity: 0.75; }
.m-logi.warning .m-logt,
.m-logi.warning .m-logn { color: var(--m-amber) !important; opacity: 0.75; }
.m-logi.error .m-logt,
.m-logi.error .m-logn { color: var(--m-red) !important; opacity: 0.75; }
.m-logempty {
  margin: auto;
  padding: 8px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--m-text3) !important;
  text-align: center;
}

/* ---------- 超窄屏（320）：日志三列再挤一档 ---------- */
@media (max-width: 360px) {
  .m-logi {
    grid-template-columns: 50px 56px minmax(0, 1fr);
    gap: 4px;
    font-size: 10.5px;
  }
  .m-chip {
    font-size: 12px;
    padding: 8px 6px;
  }
}
</style>
