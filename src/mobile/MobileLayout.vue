<template>
  <div class="mobile-shell">
    <!-- 顶部栏：账号 + 连接状态（2026-11-02 末轮：左侧两行 + 右侧三态图标）
         版式：
           ① 左侧两行 —— 名字在上（13px），「服务器 · 连接状态」在下（11px）。
              单行时那 280px 里要同时塞名字、服务器和一块状态，长账号名会被挤到只剩两三个字；
              分两行后名字独占一行，状态也从「一颗 6px 圆点」升级成字面可读的「已连接 / 未连接」。
           ② 状态颜色：绿=已连接 / 琥珀=连接中 / 红=未连接（颜色 + 文字双编码，不靠猜）。
           ③ 右侧槽位是三态图标（方案 B）：绿链环 / 琥珀转圈 / 灰断链+角点，固定 32px。
              三态都开「连接状态」抽屉 —— 顶栏不直接断连（挂机误触会掐掉任务），也不直接连。
           ④ 深浅色开关移出顶栏：「我的 → 深浅色主题」本来就是同一套 useTheme 的开关，
              顶栏那个月亮是重复入口（还占着一个 32px 槽位）。
         头像右下角那颗 6px 状态点随之移除：状态已在第二行明写，两处显示同一件事只是噪音。 -->
    <header class="m-appbar">
      <div class="m-acct" role="button" tabindex="0" @click="acctSheet = true" @keydown.enter="acctSheet = true">
        <span class="m-ava">{{ acctChar }}</span>
        <span class="m-acct-txt">
          <span class="m-nm">{{ acctName }}</span>
          <span class="m-sv">
            {{ acctServer }}<span v-if="selectedToken" class="m-ws-st" :class="wsTone"> · {{ wsLabel }}</span>
          </span>
        </span>
      </div>
      <!-- 右侧：三态图标（方案 B，2026-11-02）
           已连接 = 绿色链环 / 连接中 = 琥珀转圈（disabled，防重复点）/ 未连接 = 灰断链 + 琥珀角点。
           三态都点开「连接状态」抽屉 —— 顶栏既不直接断连（挂机时误触会掐掉正在跑的任务），
           也不直接连（会和壳挂载时的自动连接打架）。槽位固定 32px，名字区拿到最大宽度。 -->
      <button
        v-if="wsStatus === 'connecting'"
        class="m-iconbtn busy"
        disabled
        aria-label="正在连接"
        title="正在连接"
      >
        <span class="m-arc"></span>
      </button>
      <button
        v-else-if="wsConnected"
        class="m-iconbtn on"
        title="连接状态 · 已连接"
        aria-label="连接状态：已连接"
        @click="wsSheet = true"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 0 1 0 10h-2" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
      </button>
      <button
        v-else
        class="m-iconbtn off"
        title="连接状态 · 未连接"
        aria-label="连接状态：未连接"
        @click="wsSheet = true"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 0 1 0 10h-2" /></svg>
        <i class="m-badot"></i>
      </button>
    </header>

    <!-- 滚动内容 -->
    <main class="m-scroll">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['MobileClubPage', 'MobileTools']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>

    <!-- 底部 Tab -->
    <nav class="m-tabbar">
      <button
        v-for="t in tabs"
        :key="t.name"
        :class="{ on: tabOn(t) }"
        @click="goTab(t)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="t.iconPath" />
        {{ t.label }}
      </button>
    </nav>

    <!-- 账号抽屉 -->
    <div class="m-mask" :class="{ on: acctSheet }" @click="acctSheet = false"></div>
    <div class="m-sheet" :class="{ on: acctSheet }">
      <div class="m-grab"></div>
      <h4>切换账号</h4>
      <div class="m-sh-sub">Token 与配置按账号隔离 · 本地存储</div>
      <template v-if="gameTokens.length">
        <div
          v-for="tk in gameTokens"
          :key="tk.id"
          class="m-trow"
          style="cursor: pointer"
          @click="pickAccount(tk)"
        >
          <span class="m-ib m-ib--ava">{{ acctCharOf(tk) }}</span>
          <span class="m-body">
            <span class="m-nm">{{ tk.name }}</span>
            <span class="m-ds">{{ tk.server }} · {{ wsText(tk.id) }}</span>
          </span>
          <span class="m-rt">
            <span v-if="tk.id === selectedTokenId" class="m-tag done">当前</span>
          </span>
        </div>
      </template>
      <p v-else class="m-hint" style="margin: 8px 0 14px">
        还没有导入任何账号，请先到「Token 管理」导入。
      </p>
      <button class="m-btn m-btn-p m-btn-block" style="margin-top: 12px" @click="goTokens">
        管理 Token / 导入新账号
      </button>
    </div>

    <!-- 连接状态抽屉 -->
    <div class="m-mask" :class="{ on: wsSheet }" @click="wsSheet = false"></div>
    <div class="m-sheet" :class="{ on: wsSheet }">
      <div class="m-grab"></div>
      <h4>连接状态</h4>
      <div class="m-sh-sub">{{ acctName }} · {{ acctServer }}</div>
      <div class="m-kv"><span class="m-k">WebSocket</span><span class="m-v" :style="{ color: wsColor }">{{ wsLabel }}</span></div>
      <div class="m-kv"><span class="m-k">角色 ID</span><span class="m-v">{{ roleId || "-" }}</span></div>
      <button
        v-if="selectedToken"
        class="m-btn m-btn-g m-btn-block"
        style="margin-top: 12px"
        :disabled="wsStatus === 'connecting'"
        @click="reconnect"
      >
        {{ wsStatus === "connecting" ? "正在连接…" : wsConnected ? "重新连接" : "连接账号" }}
      </button>
    </div>

    <!-- Toast -->
    <div class="m-toast" :class="{ on: toast.on }">{{ toast.msg }}</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useTokenStore } from "@/stores/tokenStore";

const route = useRoute();
const router = useRouter();
const tokenStore = useTokenStore();
const { gameTokens, selectedToken, selectedTokenId, gameData } = storeToRefs(tokenStore);

/* ---------- Tab 定义 ---------- */
const tabs = [
  {
    name: "MobileHome",
    path: "/mobile/home",
    label: "首页",
    iconPath:
      '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  },
  {
    name: "MobileClubPage",
    path: "/mobile/club",
    label: "玩法",
    iconPath:
      '<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>',
  },
  {
    name: "MobileTools",
    path: "/mobile/tools",
    label: "工具",
    iconPath:
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  },
  {
    name: "MobileMe",
    path: "/mobile/me",
    label: "我的",
    iconPath:
      '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  },
];

/* ---------- 账号信息 ---------- */
const acctName = computed(() => selectedToken.value?.name || "未选择账号");
const acctServer = computed(() => selectedToken.value?.server || "点击导入 Token");
const acctChar = computed(() => (selectedToken.value?.name || "咸").charAt(0));
const acctCharOf = (tk) => (tk?.name || "咸").charAt(0);
/* 账号列表头像不再按「名字长度 % 4」取 --m-ava-1..4（那条规则没有含义）：
   三个字的名字会落到近黑的 ava-4，在一列同色块里独一份，看着像出了 bug。
   Token 管理页早就统一成 --m-primary 了，这里漏改，现在对齐。
   账号之间真要区分靠右侧「当前」标签与顶栏名字，不靠头像颜色。 */

/* ---------- 连接状态（三态：已连接 / 连接中 / 未连接） ----------
 * 自动连接后必然有一段时间是 connecting，只按 connected 判会显示「未连接」，
 * 用户以为没生效又去点重连 ⇒ 顶栏与抽屉都走同一套三态文案。 */
const wsStatus = computed(() => {
  const id = selectedTokenId.value;
  return id ? tokenStore.getWebSocketStatus(id) : "disconnected";
});
const wsConnected = computed(() => wsStatus.value === "connected");
const wsLabel = computed(() =>
  wsConnected.value ? "已连接" : wsStatus.value === "connecting" ? "连接中" : "未连接",
);
const wsColor = computed(() =>
  wsConnected.value ? "var(--m-green)" : wsStatus.value === "connecting" ? "var(--m-amber)" : "var(--m-text3)",
);
/* 顶栏第二行状态字的类名（on / busy / off）：颜色写在 mobile.css 里，
   亮暗两套各一段 —— 不在这里拼色值，换肤时才不会漏。 */
const wsTone = computed(() =>
  wsConnected.value ? "on" : wsStatus.value === "connecting" ? "busy" : "off",
);
const wsText = (id) => {
  const s = tokenStore.getWebSocketStatus(id);
  return s === "connected" ? "已连接" : s === "connecting" ? "连接中" : "未连接";
};
const roleId = computed(() => gameData.value?.roleInfo?.role?.roleId || "");

/* ---------- Tab 跳转 ----------
 * 已在同一模块时用 replace 回到入口（玩法→宫格），避免历史栈里出现两条 /mobile/club；
 * 每次都把 .m-scroll 复位到顶部（路由 scrollBehavior 作用于 window，壳内滚动容器是 .m-scroll）。 */
const scrollTop = () => {
  const el = document.querySelector(".m-scroll");
  if (el) el.scrollTop = 0;
};
/* 子页（玩法面板 / 批量任务）在路由上不属于任何 tab，但视觉上归属入口所在的 tab，
   否则从 /mobile/batch 进来四个 tab 全灭。 */
const tabOn = (t) => {
  if (route.name === t.name) return true;
  if (t.name === "MobileHome") return route.path.startsWith("/mobile/batch");
  if (t.name === "MobileMe") return route.path.startsWith("/mobile/tokens") || route.path.startsWith("/mobile/ws-test");
  if (t.name === "MobileClubPage") return route.path.startsWith("/mobile/club");
  return false;
};
const goTab = (t) => {
  if (tabOn(t)) {
    router.replace(t.path);
  } else {
    router.push(t.path);
  }
  scrollTop();
};

/* ---------- 抽屉 ---------- */
const acctSheet = ref(false);
const wsSheet = ref(false);
/* 「我的 → 切换账号」复用顶栏这个抽屉，不另做一套账号选择器 */
provide("mOpenAccountSheet", () => (acctSheet.value = true));
const toast = reactive({ on: false, msg: "" });
let toastTimer = null;
function showToast(msg) {
  toast.msg = msg;
  toast.on = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.on = false), 2200);
}
function pickAccount(tk) {
  tokenStore.selectToken(tk.id);
  acctSheet.value = false;
  showToast("已切换到「" + tk.name + "」");
}
function goTokens() {
  acctSheet.value = false;
  router.push("/mobile/tokens");
}

/* ---------- 进页面自动连接当前账号 ----------
 * 移动端此前没有任何「自动连」入口：进壳以后所有面板都先弹「WebSocket 未连接」，
 * 必须手动去 Token 管理里点连接。这里在壳挂载完成后连一次：
 *   · selectToken 自带幂等判断（已连接 / 连接中 / 断开中直接返回），重复调用不会打架；
 *   · 顺带刷新 lastUsed，避免长期不在桌面端登录时被 24h 清理规则当成僵尸账号；
 *   · 只在壳挂载时触发一次 —— 用户手动断开后不会被反复重连（要连就点顶栏 → 连接账号）。 */
function autoConnect() {
  const id = selectedTokenId.value;
  if (id && gameTokens.value?.some((t) => t.id === id)) {
    tokenStore.selectToken(id);
    return;
  }
  /* 没有选中但本地有账号（刚导入 / 选中被清掉）→ 退回列表第一个 */
  const first = gameTokens.value?.[0];
  if (first) tokenStore.selectToken(first.id);
}

/* 抽屉里的手动重连：forceReconnect 会先优雅关闭旧连接再新建 */
function reconnect() {
  const id = selectedTokenId.value;
  if (!id) return;
  wsSheet.value = false;
  tokenStore.selectToken(id, true);
  showToast("正在重新连接…");
}

/* 顶栏三态图标点开的是抽屉，抽屉里那个按钮才是真正的「连接 / 重新连接」，
   所以这里不需要单独的 connectNow —— 一键直连那条路在方案 C 里有，改回方案 B 后收掉了。 */

/* ---------- 卸载时把自己的跨标签页状态标成 disconnected ----------
 * tokenStore 的跨标签页守卫只认 30 秒内、且 sessionId 不同的记录（视为「别的标签页在连」）。
 * sessionId 是每次页面加载新生成的，而旧连接在刷新时没机会写 disconnected ⇒
 * 刷新后 30 秒内自动连接会被自己上一轮的状态挡住，表现成「点了刷新就不连了」。
 * 这里在 pagehide 补上这一步，让刷新/关闭标签页不会留下假装活跃的记录。 */
function markConnectionClosed() {
  const id = selectedTokenId.value;
  if (!id) return;
  const key = `ws_connection_${id}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const state = JSON.parse(raw);
    localStorage.setItem(key, JSON.stringify({ ...state, action: "disconnected", timestamp: Date.now() }));
  } catch (e) {
    /* 存储不可用时忽略：只是优化项，不影响连接本身 */
  }
}

/* ---------- 移动端标记 ----------
 * 桌面组件里的弹窗都 teleport 到 body，出了 .m-desk 子树，样式与 token 都够不到，
 * 会以桌面尺寸（700/900px 宽）盖在手机上。这里在整个壳活着期间给 body 打标记，
 * mobile.css 用 `body.m-mobile ...` 限域；离开 /mobile（切回旧版界面）时摘掉，桌面端零影响。 */
onMounted(() => {
  document.body.classList.add("m-mobile");
  window.addEventListener("pagehide", markConnectionClosed);
  autoConnect();
});
onBeforeUnmount(() => {
  document.body.classList.remove("m-mobile");
  window.removeEventListener("pagehide", markConnectionClosed);
});

/* ---------- 主题 ----------
 * 顶栏的月亮按钮已移除（2026-11-02 末轮改成连接状态）：深浅色开关只留
 * 「我的 → 深浅色主题」那一处，走的是同一个 useTheme()，功能没有丢，
 * 所以这里不再 import useTheme、也不再留 toggleTheme。 */

/* 移动端壳不缓存首页/我的，玩法宫格缓存（切 Tab 回来保留宫格状态） */
watch(
  () => route.name,
  () => {
    acctSheet.value = false;
    wsSheet.value = false;
  },
);
</script>

<script>
export default { name: "MobileLayout" };
</script>
