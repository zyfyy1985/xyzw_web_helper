<template>
  <div class="m-page m-ws">
    <!-- ============ 连接 ============
         状态徽标 + 角色选择 + 连接/断开；连上之后把「连接详情」直接接在同一张卡里 ——
         调试页一屏能看到「现在连着谁、什么时候连的、连的哪个地址」，不用再往下翻。 -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-t">连接</span>
        <span class="m-ws-st" :class="statusClass">{{ statusText }}</span>
      </div>

      <label class="m-ws-f">
        <span class="m-ws-lb">角色</span>
        <span class="m-ws-selwrap">
          <select v-model="selectedRoleId" class="m-finput m-ws-sel">
            <option :value="''">请选择要测试的角色</option>
            <option v-for="o in roleOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <svg class="m-ws-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </span>
      </label>

      <button
        v-if="status !== 'connected'"
        class="m-btn m-btn-p m-ws-wide"
        :disabled="!selectedRoleId || status === 'connecting'"
        @click="connect"
      >
        {{ status === "connecting" ? "连接中…" : "连接 WebSocket" }}
      </button>
      <button v-else class="m-btn m-btn-g m-ws-wide" @click="disconnect">断开连接</button>

      <p v-if="notice" class="m-ws-note" :class="noticeType">{{ notice }}</p>

      <template v-if="selectedRoleId">
        <div class="m-kv m-ws-kv"><span class="m-k">角色 ID</span><span class="m-v">{{ roleIdShown }}</span></div>
        <div class="m-kv m-ws-kv"><span class="m-k">连接时间</span><span class="m-v">{{ formatTime(wsConn && wsConn.connectedAt) }}</span></div>
        <div v-if="wsConn && wsConn.wsUrl" class="m-kv m-ws-kv">
          <span class="m-k">地址</span>
          <span class="m-v m-ws-url" :class="{ open: urlOpen }" role="button" tabindex="0" @click="urlOpen = !urlOpen" @keydown.enter="urlOpen = !urlOpen">
            {{ wsConn.wsUrl }}
          </span>
        </div>
      </template>
    </div>

    <!-- ============ 命令测试 ============
         三个动作的主次按「最常用→最少用」排：主按钮占满一行，另两个并排压在下面。
         桌面版是三个同色主按钮挤一行，手机上每个只剩 90px、字全被截。 -->
    <div class="m-card">
      <div class="m-card-h"><span class="m-t">命令测试</span></div>

      <label class="m-ws-f">
        <span class="m-ws-lb">命令</span>
        <span class="m-ws-selwrap">
          <select v-model="selectedCommand" class="m-finput m-ws-sel">
            <option value="">请选择命令</option>
            <option v-for="c in COMMANDS" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
          <svg class="m-ws-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </span>
      </label>

      <label class="m-ws-f">
        <span class="m-ws-lb">参数（JSON，可留空）</span>
        <textarea v-model="commandParams" class="m-finput m-ws-json" rows="3" spellcheck="false" placeholder='{"roleId": 123456}'></textarea>
      </label>

      <p v-if="paramErr" class="m-ws-note err">{{ paramErr }}</p>

      <div class="m-ws-btns">
        <button class="m-btn m-btn-p m-ws-wide" :disabled="!canSend" @click="sendAndWait">
          {{ waiting ? "等待响应…" : "发送并等待响应" }}
        </button>
        <div class="m-ws-btns2">
          <button class="m-btn m-btn-g" :disabled="!canSend" @click="sendOnly">{{ sending ? "发送中…" : "只发送" }}</button>
          <button class="m-btn m-btn-g" :disabled="!canSend" @click="runConcurrent">{{ concurrency ? "并发测试中…" : "并发 5 次" }}</button>
        </div>
      </div>
      <p class="m-ws-hint">
        未连接时只能看日志；发命令要先在上面把 WebSocket 连上。
      </p>
    </div>

    <!-- ============ 消息日志 ============
         每条默认折叠成 3 行（长 JSON 会占掉两三屏），点「展开」看全文。
         这里刻意不受 max-height 限制地整段滚 —— 日志本身就是这一页的主体。 -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-t">消息日志</span>
        <span class="m-ws-count">{{ messageLog.length }}</span>
        <button class="m-link m-veil-off" :disabled="!messageLog.length" @click="clearLog">清空</button>
      </div>

      <div v-if="!messageLog.length" class="m-ws-empty">还没有收发记录</div>

      <div v-else class="m-ws-log">
        <div v-for="(m, i) in messageLog" :key="i" class="m-ws-item" :class="m.type">
          <div class="m-ws-item-h">
            <span class="m-ws-tag" :class="m.type">{{ m.type === "sent" ? "发送" : "接收" }}</span>
            <span class="m-ws-time">{{ formatTime(m.timestamp) }}</span>
            <button class="m-link m-veil-off m-ws-toggle" @click="toggleOpen(i)">
              {{ openIdx.includes(i) ? "收起" : "展开" }}
            </button>
          </div>
          <pre class="m-ws-pre" :class="{ open: openIdx.includes(i) }">{{ pretty(m.data) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 消息测试（/mobile/ws-test）—— 只给调试用，入口在「我的 → 调试」，仅 fisher 可见。
 *
 * 这页原先是把桌面 WebSocketTester 整个托管在 .m-desk 里，靠二十来条 :deep() 覆盖硬掰：
 * 桌面的「外卡套内卡 + 两列 descriptions + 三个同色主按钮」在 390px 下必然散架 ——
 * 连接详情里一整条原始 wss URL 占掉半屏、命令下拉的弹层宽度塌成一条、三个主按钮挤成 90px。
 * 现在直接按移动端版式重写：卡是 .m-card，行是 .m-kv，控件是 .m-finput / .m-btn，
 * 数据与动作完全照搬原来的 fork（同一批 tokenStore 方法），没有新增也没有省掉任何一步。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useTokenStore } from "@/stores/tokenStore";

const tokenStore = useTokenStore();

/* ---------- 角色 ---------- */
const selectedRoleId = ref("");
const roleOptions = computed(() =>
  tokenStore.gameTokens.map((t) => ({ label: `${t.name} (${t.server})`, value: t.id })),
);
const selectedToken = computed(
  () => tokenStore.gameTokens.find((t) => t.id === selectedRoleId.value) || null,
);
/* 「角色 ID」显示 token 里那个真正的角色 ID：
   selectedRoleId 是**本地 Token 的 id**（上面下拉框的 value），拿它当角色 ID 会误导排障
   —— 桌面版就有这个毛病（把 token.id 当 roleId 显示）。没导进来的 token 才退回显示 token.id。 */
const roleIdShown = computed(() => selectedToken.value?.roleId || selectedRoleId.value);

/* ---------- 连接状态 ----------
 * store 里 wsConnections 的变更不保证每次都触发本组件的依赖收集，
 * 所以沿用 fork 的做法：每秒主动拉一次（只在选了角色时拉）。
 * status 用普通 ref，不写成 computed(读 store) —— 那样拿不到「1 秒前的值」用于对比。 */
const status = ref("disconnected");
const wsConn = ref(null);
const urlOpen = ref(false);

function refresh() {
  const id = selectedRoleId.value;
  if (!id) {
    status.value = "disconnected";
    wsConn.value = null;
    return;
  }
  status.value = tokenStore.getWebSocketStatus(id);
  wsConn.value = tokenStore.wsConnections[id] || null;
}

watch(selectedRoleId, () => {
  urlOpen.value = false;
  notice.value = "";
  refresh();
});

const STATUS_TEXT = {
  connected: "已连接",
  connecting: "连接中",
  disconnected: "未连接",
  reconnecting: "重连中",
  error: "连接错误",
};
const STATUS_CLASS = {
  connected: "is-on",
  connecting: "is-wait",
  reconnecting: "is-wait",
  error: "is-err",
};
const statusText = computed(() => STATUS_TEXT[status.value] || "未知");
const statusClass = computed(() => STATUS_CLASS[status.value] || "is-off");

/* ---------- 一行提示 ----------
 * 不用顶部 toast：这页是排障台，提示紧贴触发它的那颗按钮，读起来不用来回找。 */
const notice = ref("");
const noticeType = ref("ok");
function say(text, type = "ok") {
  notice.value = text;
  noticeType.value = type;
}

function connect() {
  const id = selectedRoleId.value;
  if (!id) return say("请先选择角色", "err");
  const token = selectedToken.value;
  if (!token) return say("找不到这个角色对应的 Token 数据", "err");

  status.value = "connecting";
  try {
    tokenStore.createWebSocketConnection(id, token.token, token.wsUrl);
    say("连接已启动，等状态变成「已连接」");
  } catch (e) {
    say(`连接失败：${e.message}`, "err");
  }
  /* 握手是异步的，立刻读状态只会读到 connecting；800ms 后再校正一次，
     之后交给下面的 1 秒轮询 */
  setTimeout(refresh, 800);
}

function disconnect() {
  const id = selectedRoleId.value;
  if (!id) return;
  tokenStore.closeWebSocketConnection(id);
  status.value = "disconnected";
  wsConn.value = null;
  say("已断开");
}

/* ---------- 命令 ---------- */
const COMMANDS = [
  { label: "获取角色信息", value: "role_getroleinfo" },
  { label: "获取数据包版本", value: "system_getdatabundlever" },
  { label: "签到奖励", value: "system_signinreward" },
  { label: "领取每日任务奖励", value: "task_claimdailyreward" },
  { label: "获取邮件列表", value: "mail_getlist" },
  { label: "领取所有邮件附件", value: "mail_claimallattachment" },
  { label: "获取军团信息", value: "legion_getinfo" },
  { label: "英雄招募", value: "hero_recruit" },
  { label: "领取挂机奖励", value: "system_claimhangupreward" },
];
const selectedCommand = ref("");
const commandParams = ref("{}");
const paramErr = ref("");

const sending = ref(false);
const waiting = ref(false);
const concurrency = ref(false);
const busy = computed(() => sending.value || waiting.value || concurrency.value);
/* 没连上就发只会拿到「命令发送失败」，直接把按钮按掉，别让人白点 */
const canSend = computed(() => !!selectedCommand.value && !busy.value && status.value === "connected");

/** 返回参数对象；JSON 不合法时把错误留在 paramErr 并返回 null */
function readParams() {
  paramErr.value = "";
  const raw = commandParams.value.trim();
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      paramErr.value = "参数要是一个 JSON 对象，例如 {\"roleId\": 123}";
      return null;
    }
    return v;
  } catch (e) {
    paramErr.value = `JSON 解析失败：${e.message}`;
    return null;
  }
}

async function sendOnly() {
  const params = readParams();
  if (!params) return;
  sending.value = true;
  try {
    const ok = tokenStore.sendMessage(selectedRoleId.value, selectedCommand.value, params);
    if (ok) {
      pushLog("sent", { command: selectedCommand.value, params });
      say("命令已发出");
    } else {
      say("命令发送失败：当前连接可能已断开", "err");
    }
  } catch (e) {
    say(`命令发送失败：${e.message}`, "err");
  } finally {
    sending.value = false;
  }
}

async function sendAndWait() {
  const params = readParams();
  if (!params) return;
  waiting.value = true;
  try {
    const res = await tokenStore.sendMessageWithPromise(
      selectedRoleId.value,
      selectedCommand.value,
      params,
    );
    pushLog("sent", { command: selectedCommand.value, params });
    pushLog("received", res);
    say("已收到响应");
  } catch (e) {
    pushLog("received", { error: e.message });
    say(`等待响应失败：${e.message}`, "err");
  } finally {
    waiting.value = false;
  }
}

/** 同时发 5 条同一个命令，验「响应串号 / 丢包」这类问题 */
async function runConcurrent() {
  const params = readParams();
  if (!params) return;
  concurrency.value = true;
  const started = Date.now();
  try {
    pushLog("sent", { message: "开始并发测试：同时发送 5 个相同命令", command: selectedCommand.value, params });

    const tasks = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(
        tokenStore
          .sendMessageWithPromise(selectedRoleId.value, selectedCommand.value, {
            ...params,
            requestIndex: i + 1,
          })
          .then((response) => ({ requestIndex: i + 1, response, success: true }))
          .catch((error) => ({ requestIndex: i + 1, error: error.message, success: false })),
      );
    }

    const results = await Promise.allSettled(tasks);
    const duration = Date.now() - started;
    const fetched = results.map((r) => (r.status === "fulfilled" ? r.value : { error: r.reason }));
    const okCount = fetched.filter((v) => v.success).length;

    pushLog("received", {
      message: "并发测试完成",
      totalRequests: 5,
      successCount: okCount,
      failCount: 5 - okCount,
      duration: `${duration}ms`,
      results: fetched,
    });

    if (okCount === 5) say(`5 条全部响应，耗时 ${duration}ms`);
    else if (okCount > 0) say(`部分成功：${okCount} 条响应，${5 - okCount} 条失败`, "err");
    else say("全部失败，先确认连接是否还在", "err");
  } catch (e) {
    pushLog("received", { message: "并发测试异常", error: e.message });
    say(`并发测试失败：${e.message}`, "err");
  } finally {
    concurrency.value = false;
  }
}

/* ---------- 日志 ---------- */
const messageLog = ref([]);
const openIdx = ref([]);

function pushLog(type, data) {
  messageLog.value.unshift({ type, data, timestamp: new Date().toISOString() });
  if (messageLog.value.length > 60) messageLog.value = messageLog.value.slice(0, 60);
  /* 新记一条在最上面 ⇒ 原来的展开下标整体后移一位，不改就会「展开的是上一条」 */
  openIdx.value = openIdx.value.map((i) => i + 1);
}
function toggleOpen(i) {
  openIdx.value = openIdx.value.includes(i)
    ? openIdx.value.filter((x) => x !== i)
    : [...openIdx.value, i];
}
function clearLog() {
  messageLog.value = [];
  openIdx.value = [];
}

function pretty(v) {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

/* ---------- 轮询 ---------- */
let timer = null;
onMounted(() => {
  refresh();
  timer = setInterval(refresh, 1000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped lang="scss">
/* ---------- 连接卡 ---------- */
.m-ws-st {
  flex: none;
  padding: 2px 8px;
  border-radius: var(--m-r-sm);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
}
.m-ws-st.is-on { color: var(--m-green); background: var(--m-green-soft); }
.m-ws-st.is-wait { color: var(--m-amber); background: var(--m-amber-soft); }
.m-ws-st.is-err { color: var(--m-red); background: var(--m-red-soft); }
.m-ws-st.is-off { color: var(--m-text3); background: var(--m-band); }

.m-ws-f {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}
.m-ws-lb {
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--m-text3) !important;
}

/* 原生 select 自己带箭头，各家画的都不一样且不跟主题 ⇒ 统一抹掉自绘一个 */
.m-ws-selwrap {
  position: relative;
  display: block;
}
.m-ws-sel {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 30px;
  font-size: 14px;
  line-height: 1.4;
  text-overflow: ellipsis;
}
.m-ws-chev {
  position: absolute;
  right: 10px;
  top: 50%;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--m-text3);
  pointer-events: none;
}

.m-ws-wide {
  width: 100%;
  margin-top: 2px;
}
.m-ws-btns {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2px;
}
.m-ws-btns2 {
  display: flex;
  gap: 8px;
}
.m-ws-btns2 .m-btn {
  flex: 1;
  width: auto;
}

/* 提示条：紧贴触发它的按钮，红/绿一眼分得开 */
.m-ws-note {
  margin: 10px 0 0;
  padding: 7px 10px;
  border-radius: var(--m-r-sm);
  font-size: 12px;
  line-height: 1.5;
}
.m-ws-note.ok { color: var(--m-green) !important; background: var(--m-green-soft); }
.m-ws-note.err { color: var(--m-red) !important; background: var(--m-red-soft); }

/* 详情行：复用全局 .m-kv 的行距与分隔线，只把三档灰度拉回来 ——
   App.vue 的 `html[data-theme="dark"] span{color:#fff!important}` 会把 .m-k 与 .m-v 压成同色，
   键值分不开。选择器到 .m-ws 这一层才够具体。 */
.m-ws-kv .m-k {
  color: var(--m-text3) !important;
}
.m-ws-kv .m-v {
  color: var(--m-text2) !important;
  font-weight: 500;
}
/* 原始 wss 地址带一长串 urlencode：折叠时只占一行，点一下才铺开全文。
   不这么做它会占掉半屏，而且完全不可读。 */
.m-ws-url {
  max-width: 64%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  color: var(--m-text3) !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  word-break: break-all;
}
.m-ws-url.open {
  white-space: pre-wrap;
  max-height: 180px;
  overflow-y: auto;
}

/* ---------- 命令 ---------- */
.m-ws-json {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  resize: vertical;
  min-height: 62px;
}
.m-ws-hint {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--m-text3) !important;
}

/* ---------- 日志 ---------- */
.m-ws-count {
  flex: none;
  min-width: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--m-band);
  color: var(--m-text3) !important;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.m-ws-empty {
  padding: 18px 0 12px;
  text-align: center;
  font-size: 12px;
  color: var(--m-text3) !important;
}
/* 「清空」在没有日志时是禁用的：.m-link 本身没有禁用态，不补这一条会看着能点、点了没反应 */
.m-ws-log-h .m-link:disabled,
.m-card-h .m-link:disabled {
  opacity: 0.35;
}
.m-ws-log {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 46vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.m-ws-item {
  padding: 8px 10px;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  border-left: 3px solid var(--m-border);
}
.m-ws-item.sent { border-left-color: var(--m-primary); }
.m-ws-item.received { border-left-color: var(--m-green); }
.m-ws-item-h {
  display: flex;
  align-items: center;
  gap: 8px;
}
.m-ws-tag {
  flex: none;
  padding: 0 6px;
  border-radius: var(--m-r-sm);
  font-size: 10.5px;
  line-height: 17px;
}
.m-ws-tag.sent { color: var(--m-primary) !important; background: var(--m-primary-soft); }
.m-ws-tag.received { color: var(--m-green) !important; background: var(--m-green-soft); }
.m-ws-time {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--m-text3) !important;
  font-variant-numeric: tabular-nums;
}
.m-ws-toggle {
  flex: none;
  font-size: 11.5px;
}
/* 折叠成 3 行多一点的高度；用 max-height 而不是 line-clamp，因为内容是 pre 换行文本 */
.m-ws-pre {
  margin: 6px 0 0;
  max-height: 62px;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--m-text2) !important;
}
.m-ws-pre.open {
  max-height: 320px;
  overflow-y: auto;
}
</style>

<script>
export default { name: "MobileWsTest" };
</script>
