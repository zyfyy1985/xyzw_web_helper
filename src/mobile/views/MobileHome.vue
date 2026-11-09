<template>
  <div class="m-page m-home">
    <!-- ============ ① 身份牌 ============
         直接托管桌面 IdentityCard（embedded 模式）：头像 / 称号 / 等级 / 战力 / 本周活动
         + 全部资源，全在组件内部，这里只做移动端版式。
         卡片内只显示前 3 项资产，「全部」用捕获监听拦下来开抽屉（见 onDeskClick）。 -->
    <section class="m-desk" @click.capture="onDeskClick">
      <IdentityCard embedded />
    </section>

    <!-- ============ ② 快捷入口 ============
         六格全部指向真实可达目标。注意 mobile 模式下 /admin/* 会被路由守卫弹回
         ⇒ 旧版页面（消息测试等）不放这里，统一由「我的 → 切回旧版界面」兜底。 -->
    <section class="m-quick">
      <!-- 这个格子是 div 不是 button：里面还要放一个齿轮按钮，button 不能嵌套 -->
      <div class="m-qa" role="button" tabindex="0" @click="openGame" @keydown.enter="openGame">
        <span class="m-gear" role="button" title="内置脚本" @click.stop="showScriptDialog = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.2a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/></svg>
        </span>
        <span class="m-ib" style="background: var(--m-primary)">
          <MIcon name="game" />
        </span>
        <span class="m-lb">打开游戏</span>
      </div>
      <!-- 多开：与桌面 /multi 同样的协同内核，进去默认把当前账号放进第 1 窗 -->
      <button class="m-qa" @click="openMulti">
        <span class="m-ib" style="background: var(--m-primary)">
          <MIcon name="grid" />
        </span>
        <span class="m-lb">多开</span>
      </button>
      <button class="m-qa" @click="router.push('/mobile/batch')">
        <span class="m-ib" style="background: var(--m-primary)">
          <MIcon name="batch" />
        </span>
        <span class="m-lb">批量执行</span>
      </button>
      <button class="m-qa" @click="router.push('/mobile/schedule')">
        <span class="m-ib" style="background: var(--m-primary)">
          <MIcon name="calendar" />
        </span>
        <span class="m-lb">定时任务</span>
      </button>
      <button class="m-qa" @click="openPanel('salt')">
        <span class="m-ib" style="background: var(--m-primary)">
          <MIcon name="salt" />
        </span>
        <span class="m-lb">盐场</span>
      </button>
      <button class="m-qa" @click="openPanel('peach')">
        <span class="m-ib" style="background: var(--m-primary)">
          <MIcon name="peach" />
        </span>
        <span class="m-lb">蟠桃园</span>
      </button>
    </section>

    <!-- ============ ③④⑤ 三张状态卡 ============
         桌面原组件零改动，靠 .m-desk 做变量重映射 + 卡片压平；
         三者都是 gameData 可选链取数，不需要就绪门。 -->
    <section class="m-desk">
      <DailyTaskStatus />
      <HangUpStatusCard />
      <BottleHelperCard />
    </section>

    <!-- 内置脚本（打开游戏前勾选，与桌面 Dashboard 同一个对话框） -->
    <BuiltinScriptDialog v-model:show="showScriptDialog" @start="openGame" />

    <!-- ============ 全部资产抽屉 ============
         卡片只留前 3 项，点「全部」把组件里已经算好的 48 项搬到这里看。
         列表从 DOM 读（.res-item 的 label / value 文本），不重抄 IdentityCard 的取数逻辑。 -->
    <div class="m-home-mask" :class="{ on: resSheet }" @click="resSheet = false"></div>
    <div class="m-home-sheet" :class="{ on: resSheet }">
      <div class="m-grab"></div>
      <div class="m-as-head">
        <div>
          <h4>全部资产</h4>
          <div class="m-as-sub">{{ resItems.length }} 项 · 与角色数据同步</div>
        </div>
      </div>
      <!-- 48 项平铺两列 = 一屏长得一样的行，既没有主次也找不到东西。
           现在分三层：主货币（band 大格）→ 分组标题 → 两列账目。 -->
      <section class="m-as-hero" v-if="coreAssets.length">
        <div v-for="it in coreAssets" :key="it.label" class="m-as-cell">
          <span class="m-as-k">{{ it.label }}</span>
          <span class="m-as-v">{{ it.value }}</span>
        </div>
      </section>
      <section v-for="g in assetGroups" :key="g.key" class="m-as-sec">
        <div class="m-as-sec-title">
          <span class="m-as-sec-k">{{ g.name }}</span>
          <span class="m-as-sec-n">{{ g.items.length }} 项</span>
        </div>
        <div class="m-as-grid">
          <div v-for="it in g.items" :key="it.label" class="m-as-row">
            <span class="m-as-label">{{ it.label }}</span>
            <span class="m-as-value">{{ it.value }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useTokenStore } from "@/stores/tokenStore";
import { useMessage } from "naive-ui";
import useIndexedDB from "@/hooks/useIndexedDB";
import { convertBinToLx } from "@/utils/gameLauncher";
import IdentityCard from "@/mobile/fork/components/Common/IdentityCard.vue";
import MIcon from "@/mobile/components/MIcon.vue";
import BuiltinScriptDialog from "@/mobile/fork/components/BuiltinScriptDialog.vue";
import DailyTaskStatus from "@/mobile/fork/components/Daily/DailyTaskStatus.vue";
import HangUpStatusCard from "@/mobile/fork/components/cards/HangUpStatusCard.vue";
import BottleHelperCard from "@/mobile/fork/components/cards/BottleHelperCard.vue";
import { useBattleVersionWarmup } from "@/mobile/utils/battleVersion";
import { openGameWindow, navigateGameWindow } from "@/utils/gameWindow";

const router = useRouter();
const message = useMessage();
const tokenStore = useTokenStore();
const { getArrayBuffer } = useIndexedDB();

/* 首页加载完成：把战斗版本号取回来存进 store（旧版在 /admin/game-features 里做这件事）。
   切磋 / 爬塔 / 闯关这些战斗命令要带它，取不到会带 null 被服务端拒。只取一次，已有值直接跳过。 */
useBattleVersionWarmup();

/* 首页直达某个玩法面板：先在历史里放一层宫格，系统返回键回到宫格而不是首页 */
const openPanel = async (panel) => {
  await router.push("/mobile/club");
  router.push({ path: "/mobile/club", query: { panel } });
};

/* ---------- 打开游戏 ----------
 * 与桌面 Dashboard.openGame 同一套流程：IndexedDB 取 BIN → 转 LX → 写 localStorage →
 * 进 /game。BIN 转换直接用 @/utils/gameLauncher 里的导出实现（不另抄一份加解密）。 */
const showScriptDialog = ref(false);

/* ---------- 身份牌「全部资产」抽屉 ----------
 * 卡片里只渲染前 3 项，剩下的 45 项在组件里已经算好（含 0 值项），
 * 点「全部」时直接读当前 DOM 的 .res-item 文本，不把 IdentityCard 那套
 * 51 项取数逻辑在移动端重抄一遍（两份数据源必然会漂）。
 * 必须用捕获阶段拦：组件自己的 @click 会把 isExpanded 翻成 true，卡片当场铺开。 */
const resSheet = ref(false);
const resItems = ref([]);

/* 「全部资产」的分层：前 4 项（金砖 / 彩玉 / 白玉 / 金币）是主货币，放进 band 大格；
   其余按名字里的关键词归到 通用材料 / 碎片 / 宝箱 / 袋子 / 火把。
   ★ 只按 label 关键词归类，不重抄 IdentityCard 的取数逻辑 —— 那边顺序或字段一改，两份就会漂。 */
const CORE_LABELS = ["金砖", "彩玉", "白玉", "金币"];
/* 关键词要先判特例、再落兜底：四圣宝珠碎片属于碎片，金币袋子属于袋子，别被「金币」抢走 */
const ASSET_KEYWORDS = [
  { key: "shard", match: (n) => n.includes("碎片") },
  { key: "box", match: (n) => n.includes("宝箱") },
  { key: "bag", match: (n) => n.includes("袋子") },
  { key: "torch", match: (n) => n.includes("火把") },
];
const ASSET_GROUPS = [
  { key: "material", name: "通用材料" },
  { key: "shard", name: "碎片" },
  { key: "box", name: "宝箱" },
  { key: "bag", name: "袋子" },
  { key: "torch", name: "火把" },
];

const coreAssets = computed(() => {
  const map = new Map(resItems.value.map((it) => [it.label, it]));
  return CORE_LABELS.map((label) => map.get(label)).filter(Boolean);
});

const assetGroups = computed(() => {
  const buckets = new Map();
  resItems.value.forEach((it) => {
    if (CORE_LABELS.includes(it.label)) return;
    const hit = ASSET_KEYWORDS.find((r) => r.match(it.label));
    const key = hit ? hit.key : "material";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  });
  return ASSET_GROUPS.map((g) => ({ ...g, items: buckets.get(g.key) || [] })).filter(
    (g) => g.items.length > 0,
  );
});

function onDeskClick(e) {
  const hit = e.target?.closest?.(".resources-toggle");
  if (!hit) return;
  e.stopPropagation();
  e.preventDefault();
  const nodes = e.currentTarget.querySelectorAll(".identity-card .res-item");
  resItems.value = Array.from(nodes).map((n) => ({
    label: n.querySelector(".label")?.textContent?.trim() || "",
    value: n.querySelector(".value")?.textContent?.trim() || "",
  }));
  resSheet.value = true;
}

/* ---------- 多开 ----------
 * 独立全屏页（/mobile/multi），进去先用当前账号占住第 1 窗：
 * 传 bin_id 而不是在页面里读 store —— 多开页不套 MobileLayout，不依赖壳里的自动选号。 */
function openMulti() {
  const token = tokenStore.selectedToken;
  router.push({ path: "/mobile/multi", query: token ? { bin_id: token.id } : {} });
}

async function openGame() {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择一个 Token");
    return;
  }
  /* ★★ 先开窗、再 await：await 之后再 window.open 会被拦。窄屏（真手机）返回 null ⇒ 页内跳转。
     key 传 bin_id：不同账号各开一个窗口，同一个账号再点只聚焦。 */
  const win = openGameWindow(null, { key: token.id });
  const binData = await getArrayBuffer(token.id);
  if (!binData) {
    if (win) win.close();
    message.error("未找到该 Token 的 BIN 数据");
    return;
  }
  const hex = Array.from(convertBinToLx(binData), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  localStorage.setItem("bin_data_" + token.id, hex);
  localStorage.setItem("current_bin_id", token.id);
  let binList = [];
  try {
    binList = JSON.parse(localStorage.getItem("bin_file_list") || "[]");
  } catch (e) {
    binList = [];
  }
  if (!Array.isArray(binList)) binList = [];
  if (!binList.find((i) => i.id === token.id)) {
    binList.push({
      id: token.id,
      name: token.name || "Token",
      byteLength: binData.byteLength,
      size: (binData.byteLength / 1024).toFixed(1) + " KB",
      order: binList.length,
    });
    localStorage.setItem("bin_file_list", JSON.stringify(binList));
  }
  /* ★ 带上 bin_id：多账号可能同时开几个窗口，靠 URL 自证身份 */
  const href = router.resolve({ path: "/game", query: { bin_id: token.id } }).href;
  if (win) navigateGameWindow(win, href);
  else router.push("/game");
}
</script>

<style scoped lang="scss">
/* ============================================================
 * 首页对托管组件的窄屏修正（.m-desk 已统一做了变量重映射 / 去投影 / 控件收口，
 * 这里只补 IdentityCard 与三张状态卡在 390px 下的具体版式）
 * ============================================================ */

/* ---------- 身份牌（深色卡）：整张墨底，本周活动做视觉焦点 ----------
 * 一块饱和蓝 + 一堆平铺数字是最容易显「凑」的组合，所以整张卡换成深墨底：
 * 底色本身承担「这是一张主卡」的角色，亮蓝只留给「本周活动」一个焦点，
 * 其余信息（名字 / 等级 / 战力 / 资产）全部降级为白与灰。
 * 只展示前 3 项资产，其余 45 项进底部抽屉（见 template 里的 .m-home-sheet）。 */
.m-home :deep(.identity-embedded) {
  grid-column: auto;
}
.m-home :deep(.identity-card.embedded) {
  display: block;
  background: var(--m-ink-bg);
  border: none;
  border-radius: var(--m-r-lg);
  padding: 0;
  overflow: hidden;
}
/* 组件自带的「身份牌 / 角色与资源概览」卡头在移动端纯占高度 */
.m-home :deep(.identity-card.embedded > .card-header) {
  display: none;
}
.m-home :deep(.identity-card.embedded > .loading) {
  padding: 14px 16px;
  color: var(--m-ink-t3);
}

/* ===== ① 顶部：头像 + 名字｜本周活动（焦点） ===== */
.m-home :deep(.identity-card .role-profile-header) {
  background: none;
  border-radius: 4px;
  padding: 14px 16px 0;
}
.m-home :deep(.identity-card .role-profile-content) {
  flex-direction: row;
  align-items: flex-start;
  text-align: left;
  gap: 11px;
}
.m-home :deep(.identity-card .avatar-container),
.m-home :deep(.identity-card .role-avatar) {
  width: 44px;
  height: 44px;
  flex: none;
}
.m-home :deep(.identity-card .role-avatar) {
  border-radius: var(--m-r-md);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
}
/* 两列：第 1 行「名字 | 本周活动」，第 2 行「Lv · 战力」跨满。
 * 名字列按内容取宽（占优），活动列 1fr 让位并在不够时省略。 */
.m-home :deep(.identity-card .role-info-section) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  column-gap: 8px;
  row-gap: 5px;
  min-width: 0;
  flex: 1;
  padding-top: 1px;
}
.m-home :deep(.identity-card .role-name) {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  color: var(--m-ink-t1);
  font-size: 16px;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
}
.m-home :deep(.identity-card .role-name .n-tag) {
  height: 17px;
  padding: 0 5px;
  margin-left: 6px !important;
  font-size: 10.5px;
  line-height: 17px;
  /* 门派色是组件内联的饱和红，压在深底上会和「本周活动」抢注意力 ⇒ 压一档 */
  opacity: 0.8;
  filter: saturate(0.62);
}
.m-home :deep(.identity-card .role-stats) {
  grid-column: 1 / -1;
  grid-row: 2;
  justify-content: flex-start;
  gap: 8px;
  color: var(--m-ink-t3);
  font-size: 11.5px;
}
/* ★ 本周活动 = 全卡唯一焦点：亮蓝字 + 半透明蓝底胶囊，其余信息一律压成灰白 */
/* 只留活动名（黑市周），「本周活动：」这四个字在移动端多余（胶囊本身就是标签） */
.m-home :deep(.identity-card .activity-label) {
  display: none;
}
.m-home :deep(.identity-card .activity-week) {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  align-self: center;
  margin: 0;
  padding: 4px 9px;
  max-width: 100%;
  background: var(--m-ink-chip-bg);
  border-radius: 8px;
  color: var(--m-ink-chip-fg);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ≤359px（老款 5.0" / 320 逻辑宽）：8 字中文名 + 门派 tag 挤在同一列，
 * .role-name 的 overflow:hidden 会把 tag 切成一条红边（实测只剩「：」两笔）
 * ⇒ 这一档只留名字，tag 让位。 */
@media (max-width: 359px) {
  .m-home :deep(.identity-card .role-name .n-tag) {
    display: none;
  }
}

/* ===== ② 三项关键资产：一列一条，竖向发丝线分隔 ===== */
.m-home :deep(.identity-card .resources) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 13px 16px 0;
  padding: 13px 0 12px;
  border-top: 1px solid var(--m-ink-line);
  background: none;
}
/* 卡片只留前 3 项，其余进抽屉（display:none 仍在 DOM 里，抽屉直接读文本） */
.m-home :deep(.identity-card .resources .res-item:nth-child(n + 4)) {
  display: none;
}
.m-home :deep(.identity-card .res-item) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 4px;
  min-height: 0;
  padding: 0;
  background: none;
  border: none;
  border-radius: 4px;
}
.m-home :deep(.identity-card .resources .res-item + .res-item) {
  padding-left: 12px;
  border-left: 1px solid var(--m-ink-line);
}
.m-home :deep(.identity-card .res-item .label) {
  max-width: 100%;
  color: var(--m-ink-t3);
  font-size: 10.5px;
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-home :deep(.identity-card .res-item .value) {
  max-width: 100%;
  color: var(--m-ink-t1);
  /* 14px 而非 15：数值太亮太大就会和「本周活动」抢焦点 */
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== ③ 底部：左「资产」右「全部 ›」 ===== */
.m-home :deep(.identity-card .resources-toggle) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--m-ink-line);
  background: none;
  border-radius: 4px;
}
.m-home :deep(.identity-card .resources-toggle::before) {
  content: "资产";
  color: var(--m-ink-t3);
  font-size: 11px;
  letter-spacing: 0.4px;
}
/* 组件按钮文案是「展开全部 / 收起」（桌面 GameStatus 也在用，不能改组件），
 * 这里 font-size:0 藏掉原文字、用 ::before 换成「全部」，点击由 .m-desk 的捕获监听接管 */
.m-home :deep(.identity-card .resources-toggle .n-button) {
  width: auto;
  height: 24px;
  font-size: 0;
  font-weight: 500;
  color: var(--m-ink-t1) !important;
  --n-text-color: var(--m-ink-t1) !important;
  --n-text-color-hover:var(--m-primary-soft) !important;
  --n-text-color-pressed:var(--m-primary-soft) !important;
  --n-text-color-focus: var(--m-ink-t1) !important;
}
.m-home :deep(.identity-card .resources-toggle .n-button::before) {
  content: "全部";
  font-size: 12.5px;
}
.m-home :deep(.identity-card .resources-toggle .n-button::after) {
  content: "";
  width: 6px;
  height: 6px;
  margin-left: 5px;
  margin-top: -2px;
  border-right: 1.4px solid currentColor;
  border-bottom: 1.4px solid currentColor;
  transform: rotate(-45deg);
}

/* ★ App.vue 的 html[data-theme="dark"] span/div{color:var(--m-on-primary)!important} 会把这套深色卡
 * 里的灰阶层级全压成纯白（标签和数值同色），必须抬特异性 + !important 拉回来。 */
.m-home.m-home :deep(.identity-card .role-name) {
  color: var(--m-ink-t1) !important;
}
.m-home.m-home :deep(.identity-card .role-stats) {
  color: var(--m-ink-t3) !important;
}
/* ★ 只设 .role-stats 不够：里面「Lv.6000」「战力 12.3亿」是两个 span，
 * 会被 App.vue 的 html[data-theme="dark"] span{color:var(--m-on-primary)!important} 直接命中，
 * 继承色永远输给直接命中 ⇒ 必须点名到 span 本身。 */
.m-home.m-home :deep(.identity-card .role-stats .level-text),
.m-home.m-home :deep(.identity-card .role-stats .power-value) {
  color: var(--m-ink-t3) !important;
}
.m-home.m-home :deep(.identity-card .activity-week) {
  color: var(--m-ink-chip-fg) !important;
}
.m-home.m-home :deep(.identity-card .res-item .label) {
  color: var(--m-ink-t3) !important;
}
.m-home.m-home :deep(.identity-card .res-item .value) {
  color: var(--m-ink-t1) !important;
}
.m-home.m-home :deep(.identity-card .resources-toggle::before) {
  color: var(--m-ink-t3) !important;
}

/* ---------- 全部资产抽屉 ----------
 * 页面内会被 .m-scroll 的 overflow 裁掉，所以改 fixed 定位；宽度按壳宽收口，PC 上不横跨整个窗口。 */
.m-home-mask {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 50%;
  width: var(--m-shell-w, 100vw);
  margin-left: calc(var(--m-shell-w, 100vw) / -2);
  background: rgba(6, 14, 28, 0.55);
  z-index: 40;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}
.m-home-mask.on {
  opacity: 1;
  pointer-events: auto;
}
.m-home-sheet {
  position: fixed;
  bottom: 0;
  left: 50%;
  width: var(--m-shell-w, 100vw);
  margin-left: calc(var(--m-shell-w, 100vw) / -2);
  box-sizing: border-box;
  max-height: 78vh;
  overflow-y: auto;
  padding: 8px 16px calc(20px + env(safe-area-inset-bottom));
  background: var(--m-card);
  border-radius: var(--m-r-lg) var(--m-r-lg) 0 0;
  z-index: 41;
  transform: translateY(105%);
  transition: transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.m-home-sheet.on {
  transform: translateY(0);
}
.m-home-sheet .m-as-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.m-home-sheet h4 {
  margin: 0;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--m-text);
}
.m-home-sheet .m-as-sub {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--m-text3);
}
/* 主货币：band 灰底 + 1px 缝，缝本身就是分隔线（不描边、不卡片套卡片） */
.m-home-sheet .m-as-hero {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin-bottom: 14px;
  overflow: hidden;
  border-radius: var(--m-r-lg);
  background: var(--m-band);
}
.m-home-sheet .m-as-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 9px 12px;
  background: var(--m-card);
}
.m-home-sheet .m-as-k {
  font-size: 11px;
  line-height: 14px;
  color: var(--m-text3) !important;
}
.m-home-sheet .m-as-v {
  overflow: hidden;
  font-size: 17px;
  font-weight: 700;
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-text) !important;
}
/* 分组：节标题 = 3px 行动色竖线 + 12.5px 灰字 + 右侧项数 */
.m-home-sheet .m-as-sec + .m-as-sec {
  margin-top: 14px;
}
.m-home-sheet .m-as-sec-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 18px;
  color: var(--m-text3) !important;
}
.m-home-sheet .m-as-sec-title::before {
  content: "";
  flex: none;
  width: 3px;
  height: 10px;
  border-radius: 4px;
  background: var(--m-primary);
}
.m-home-sheet .m-as-sec-k {
  color: var(--m-text3) !important;
}
.m-home-sheet .m-as-sec-n {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--m-text3) !important;
}
/* 两列账目：标签左、数值右，行间发丝线 */
.m-home-sheet .m-as-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
}
.m-home-sheet .m-as-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--m-band);
}
/* App.vue 暗色规则同样会压掉抽屉里的灰阶 */
.m-home-sheet .m-as-row .m-as-label {
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-text3) !important;
}
.m-home-sheet .m-as-row .m-as-value {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--m-text) !important;
}
.m-home-sheet h4 {
  color: var(--m-text) !important;
}
.m-home-sheet .m-as-sub {
  color: var(--m-text3) !important;
}

/* ---------- 每日任务 ---------- */
/* 组件给 .daily-task 挂了 4px 橘色左边线做「专用色」标记 —— 本体系里卡片一律无边框 */
.m-home :deep(.status-card.daily-task) {
  border-left: none;
}
.m-home :deep(.daily-task .card-header) {
  flex-wrap: nowrap;
  align-items: center;
  margin-bottom: 10px;
}
.m-home :deep(.daily-task .header-right) {
  width: auto;
  margin-left: auto;
  margin-top: 0;
  gap: 6px;
}
.m-home :deep(.daily-task .settings-gear) {
  width: 26px;
  height: 26px;
  border-radius: var(--m-r-sm);
  background: var(--m-band);
  color: var(--m-text3);
}
.m-home :deep(.daily-task .settings-gear:hover) {
  background: var(--m-primary);
  color: var(--m-on-primary);
  transform: none;
}
.m-home :deep(.daily-task .progress-container) {
  margin-bottom: 10px;
}
/* 进度条：Naive 把 rail/fill 颜色写成内联（rail-color=var(--m-bg)、--n-fill-color=var(--m-primary)），
   暗色下轨道几乎全白 —— 只能 !important 压回 band + 唯一行动蓝 */
.m-home :deep(.daily-task .n-progress) {
  --n-fill-color: var(--m-primary) !important;
}
.m-home :deep(.daily-task .n-progress-graph-line-rail) {
  background-color: var(--m-band) !important;
  border-radius: var(--m-r-sm) !important;
}
.m-home :deep(.daily-task .info-container) {
  font-size: 11px;
  color: var(--m-text3);
}
.m-home :deep(.daily-task .card-actions) {
  margin-top: 0;
  padding-top: 0;
}
.m-home :deep(.daily-task .action-button) {
  min-height: 36px;
  padding: 0 14px;
  border-radius: var(--m-r-md);
  font-size: 14px;
  font-weight: 500;
  background: var(--m-primary);
  color: var(--m-on-primary);
}
.m-home :deep(.daily-task .action-button:disabled) {
  background: var(--m-band);
  color: var(--m-text3);
}

/* ---------- 挂机 / 盐罐 ---------- */
.m-home :deep(.status-card .card-content) {
  margin-bottom: 10px;
}
.m-home :deep(.status-card .time-display) {
  font-family: "SF Mono", "Roboto Mono", Consolas, monospace;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--m-text);
  text-align: center;
  margin-bottom: 0;
  font-variant-numeric: tabular-nums;
}
/* MyCard 的 .status-card .active 会给动作行刷一层淡绿底，移动端只留按钮自己的语义 */
.m-home :deep(.status-card .card-action) {
  background: transparent;
}
/* 三张卡的动作键统一 36px（卡内基线 32px 是给「行内小动作」的，
   这三处是整宽主 CTA，跟登录页主按钮一样需要一眼看到，所以单独抬一档） */
.m-home :deep(.card-action > button.action-button) {
  min-height: 36px;
  padding: 0 14px;
  border-radius: var(--m-r-md);
  font-size: 14px;
  font-weight: 500;
}
/* 挂机卡两个原生 button（.action-button secondary / primary）——补齐配色 */
.m-home :deep(.card-action > button.action-button.secondary) {
  background: var(--m-band);
  color: var(--m-text2);
}
.m-home :deep(.card-action > button.action-button.primary) {
  background: var(--m-primary);
  color: var(--m-on-primary);
}
/* 盐罐卡是 Arco 的 type=primary secondary：背景被收到行动蓝了，但 Arco 自己的字色还是白，
   暗色下就是白字压在浅蓝上（实测 rgb(255,255,255) on rgb(107,192,255)） */
.m-home :deep(.bottle-helper .card-action .arco-btn) {
  height: 36px;
  font-size: 14px;
  border-radius: var(--m-r-md);
  background: var(--m-primary);
  border-color: var(--m-primary);
  color: var(--m-on-primary);
}
</style>

<script>
export default { name: "MobileHome" };
</script>
