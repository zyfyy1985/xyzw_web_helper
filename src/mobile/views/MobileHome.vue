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
    <div class="m-home-sec">
      <b>快捷入口</b><i>06</i><span class="rule"></span>
    </div>
    <section class="m-quick">
      <!-- 这个格子是 div 不是 button：里面还要放一个齿轮按钮，button 不能嵌套 -->
      <div class="m-qa" role="button" tabindex="0" @click="openGame" @keydown.enter="openGame">
        <span class="m-gear" role="button" title="内置脚本" @click.stop="openScripts">
          <MIcon name="gear" :size="12" />
        </span>
        <span class="m-ib">
          <MIcon name="game" />
        </span>
        <span class="m-lb">打开游戏</span>
      </div>
      <!-- 多开：与桌面 /multi 同样的协同内核，进去默认把当前账号放进第 1 窗 -->
      <button class="m-qa" @click="openMulti">
        <span class="m-ib">
          <MIcon name="grid" />
        </span>
        <span class="m-lb">多开</span>
      </button>
      <button class="m-qa" @click="router.push('/mobile/batch')">
        <span class="m-ib">
          <MIcon name="batch" />
        </span>
        <span class="m-lb">批量执行</span>
      </button>
      <button class="m-qa" @click="router.push('/mobile/schedule')">
        <span class="m-ib">
          <MIcon name="calendar" />
        </span>
        <span class="m-lb">定时任务</span>
      </button>
      <button class="m-qa" @click="openPanel('salt')">
        <span class="m-ib">
          <MIcon name="salt" />
        </span>
        <span class="m-lb">盐场</span>
      </button>
      <button class="m-qa" @click="openPanel('peach')">
        <span class="m-ib">
          <MIcon name="peach" />
        </span>
        <span class="m-lb">蟠桃园</span>
      </button>
    </section>

    <!-- ============ ③④⑤ 三张状态卡 ============
         桌面原组件零改动，靠 .m-desk 做变量重映射 + 卡片压平；
         三者都是 gameData 可选链取数，不需要就绪门。 -->
    <div class="m-home-sec">
      <b>运行状态</b><i>03</i><span class="rule"></span>
    </div>
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

/* 首页直达某个玩法面板：一次点击 = 一层历史（[首页] → [首页, 玩法面板]）。
 * 原来这里连着 push 两次（先 /mobile/club 再 ?panel=），只为让返回键落在宫格，
 * 代价是历史栈里多一条用户根本没看见过的宫格 —— 连点几次首页快捷入口，返回键就要按好几次。
 * 现在返回直接回首页；想去宫格点一下「玩法」tab 即可（它本来就是该 tab 的入口）。 */
const openPanel = (panel) => {
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

/* ---------- 共享角色（别人授权给我登录的）----------
 * 早期版本把它们挡在多开 / 内置脚本之外（理由是会与授权方互相顶号）。现在按产品口径放开：
 * 授权本来就是让人「能玩这个号」，而多开与脚本只是玩法入口，不是权限边界。
 * ★ 但有一个共同前提：**必须先「接入」**。未接入的共享条目 id 还是临时值
 *   （`shared:<gid>`）、`token` 是空串、本地也没有 bin —— 直接拿去开游戏或挂脚本
 *   只会得到「未找到 BIN」或一条连不上的 WS。接入后 id 换成 MD5(bin)，一切都与自己的号一致。
 * @returns 可用的 token（已接入）或 null（用户取消 / 接入失败，调用方直接 return） */
async function ensureUsableToken(token) {
  if (!token) return null;
  if (!(token.shared && token.needCred)) return token;
  const res = await tokenStore.adoptSharedToken(token.id);
  if (!res || !res.ok) {
    message.error((res && res.message) || "无法接入该共享角色，请稍后重试");
    return null;
  }
  return res.token;
}

/* ---------- 内置脚本 ---------- */
async function openScripts() {
  const token = tokenStore.selectedToken;
  if (token && !(await ensureUsableToken(token))) return;
  showScriptDialog.value = true;
}

/* ---------- 多开 ----------
 * 独立全屏页（/mobile/multi），进去先用当前账号占住第 1 窗：
 * 传 bin_id 而不是在页面里读 store —— 多开页不套 MobileLayout，不依赖壳里的自动选号。
 * 共享角色同样可以进，但传的必须是**接入后**的真 id（临时 id 在多开页里没有 bin）。 */
async function openMulti() {
  const token = tokenStore.selectedToken;
  let ready = token;
  if (token && token.shared && token.needCred) {
    ready = await ensureUsableToken(token);
    if (!ready) return;
  }
  router.push({ path: "/mobile/multi", query: ready ? { bin_id: ready.id } : {} });
}

async function openGame() {
  let token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择一个 Token");
    return;
  }
  /* ★★ 先开窗、再 await：await 之后再 window.open 会被拦。窄屏（真手机）返回 null ⇒ 页内跳转。
     key 传 bin_id：不同账号各开一个窗口，同一个账号再点只聚焦。 */
  const win = openGameWindow(null, { key: token.id });
  /* 共享角色未接入时 id 还是临时值（`shared:<gid>`）、本地没有 bin ⇒ 先接入换真 id。
     必须放在开窗**之后**：接入是网络请求，await 之后就开不出新窗口了。 */
  if (token.shared && token.needCred) {
    const res = await tokenStore.adoptSharedToken(token.id);
    if (!res || !res.ok) {
      if (win) win.close();
      message.error((res && res.message) || "无法接入该共享角色，请稍后重试");
      return;
    }
    token = res.token;
  }
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
 * 首页 —— 方案 B「极简数据面板」落地（design/mobile-home/02-minimal.html）
 *
 * 照搬 mobile.css 顶部的三条硬约束：
 *   1. 全站一支行动色 --m-primary（换肤自动跟随）；语义色只出现在数据徽章上。
 *   2. 卡片 = --m-card 底 + 1px --m-border 描边，无阴影；层次靠底色差与描边。
 *   3. 圆角封顶：卡片 11(--m-r-lg) / 控件 7(--m-r-md) / 徽章小块 --m-r-sm；无药丸。
 *
 * 主题适配（本轮的重点）：
 *   - 不写死任何十六进制。半透明主色一律
 *       color-mix(in srgb, var(--m-primary) x%, transparent)
 *     —— skins.css 里没有 --m-primary-rgb 三元组（换肤只覆盖十六进制），
 *       写 rgba(var(--m-primary-rgb)) 会在薄荷青/胭脂等皮肤下停在经典蓝。
 *   - 深浅色全部由 token 自动成立：--m-card / --m-bg / --m-border / --m-band
 *     在暗色下各有一档，亮色稿的结构原样搬到暗色不需要另写一套。
 *   - App.vue 的 html[data-theme=dark] span,div,p,label{color:#fff!important}
 *     是 (0,1,1)+important，会压平灰阶层级 ⇒ 下面所有文字色都是
 *     「.m-home.m-home 双类抬特异性 + :deep 点名到叶子 + !important」。
 * ============================================================ */

.m-page.m-home {
  position: relative; /* 网格纸 ::before 的定位基准 */
  /* 等宽数字：数据面板的「仪表读数」感全靠它 */
  --m-mono: "SF Mono", "Roboto Mono", "JetBrains Mono", Consolas, monospace;
}
/* 极淡网格纸：主色 5%（color-mix 跟随换肤与深浅色），越往下越淡。
 * z-index:-1 落在 .mobile-shell 的底色之上、所有卡片之下；
 * 卡片自带 --m-card 底 ⇒ 网格只在卡片间隙露出，不会画到卡上。 */
.m-page.m-home::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(color-mix(in srgb, var(--m-primary) 5%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--m-primary) 5%, transparent) 1px, transparent 1px);
  background-size: 24px 24px;
  -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 46%);
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 46%);
}

/* ---------- 分区标题：快捷入口 06 ———————— ---------- */
.m-home-sec {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 3px;
}
.m-home-sec b {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.2px;
  color: var(--m-text2) !important;
}
.m-home-sec i {
  font-style: normal;
  font-family: var(--m-mono);
  font-size: 9px;
  letter-spacing: 0.8px;
  font-variant-numeric: tabular-nums;
  color: var(--m-text3) !important;
}
.m-home-sec .rule {
  flex: 1;
  height: 1px;
  background: var(--m-band);
}

/* ============================================================
 * ① 身份牌（托管 fork/IdentityCard，结构改动在该组件内：
 *    活动带独立成行、战力单独成块右对齐、底部条加「全部资产 N 项」）
 * ============================================================ */
.m-home :deep(.identity-embedded) {
  grid-column: auto;
}
.m-home.m-home :deep(.identity-card.embedded) {
  display: block;
  background: var(--m-card);
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-lg);
  padding: 0;
  overflow: hidden;
}
/* 组件自带的「身份牌 / 角色与资源概览」卡头在移动端纯占高度 */
.m-home.m-home :deep(.identity-card.embedded > .card-header) {
  display: none;
}
.m-home.m-home :deep(.identity-card.embedded > .loading) {
  padding: 14.5px;
  color: var(--m-text3) !important;
}

/* ===== 顶部：头像｜名字+门派+等级｜战力（右，大） ===== */
.m-home.m-home :deep(.identity-card .role-profile-header) {
  background: none !important; /* 压掉 fork 里 rank-* 的整段渐变底 */
  border-radius: 0;
  padding: 14.5px 14.5px 0;
}
.m-home.m-home :deep(.identity-card .role-profile-content) {
  flex-direction: row;
  align-items: center;
  text-align: left;
  gap: 12px;
}
.m-home.m-home :deep(.identity-card .avatar-container),
.m-home.m-home :deep(.identity-card .role-avatar) {
  width: 50px;
  height: 50px;
  flex: none;
}
.m-home.m-home :deep(.identity-card .role-avatar) {
  border-radius: var(--m-r-lg);
  border: 1px solid var(--m-border);
  background: var(--m-band);
  object-fit: cover;
}
.m-home.m-home :deep(.identity-card .role-info-section) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: 5px;
  align-content: center;
  min-width: 0;
  flex: 1;
}
.m-home.m-home :deep(.identity-card .role-name) {
  display: flex;
  align-items: center;
  min-width: 0;
  color: var(--m-text) !important;
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
}
/* 门派 tag：压成「浅主色底 + 深主色字」的小方块（随换肤走）。
 * 组件给的是内联饱和色（inline style），必须 !important 才盖得过；
 * 内部的 .n-tag__content 是 span，暗色下会被 App.vue 刷白，也要点名。 */
.m-home.m-home :deep(.identity-card .role-name .n-tag) {
  height: 17px;
  padding: 0 6px;
  margin-left: 6px !important;
  font-size: 9.5px;
  line-height: 17px;
  font-weight: 500;
  background: var(--m-primary-soft) !important;
  border: none;
  border-radius: var(--m-r-sm);
  opacity: 1;
  filter: none;
}
.m-home.m-home :deep(.identity-card .role-name .n-tag),
.m-home.m-home :deep(.identity-card .role-name .n-tag .n-tag__content) {
  color: var(--m-primary-deep) !important;
}
.m-home.m-home :deep(.identity-card .role-stats) {
  display: flex;
  align-items: baseline;
  /* ★ 必须显式压回左对齐：fork 里有一条 @media(max-width:768px)
     .role-stats{justify-content:center}（桌面端居中版式残留），
     手机宽度下生效 ⇒ ID 被推到中间偏右（用户真机截图就是这个） */
  justify-content: flex-start;
  gap: 7px;
  min-width: 0;
  color: var(--m-text3) !important;
  font-size: 10.5px;
  line-height: 1.3;
}
/* 角色 ID 一行：整行同一字体字号（10.5px 灰字），不做等宽/加粗强调 ——
   之前 ID 数字用 12px 等宽字，baseline 对齐后旁边的汉字看着就退后了几个像素 */
.m-home.m-home :deep(.identity-card .role-stats .role-id) {
  min-width: 0;
  font-variant-numeric: tabular-nums;
  color: var(--m-text3) !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
/* 战力：这张卡唯一的大数字，右对齐、等宽、行动色 */
.m-home.m-home :deep(.identity-card .role-power) {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  text-align: right;
}
.m-home.m-home :deep(.identity-card .role-power span) {
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--m-text3) !important;
}
.m-home.m-home :deep(.identity-card .role-power b) {
  font-family: var(--m-mono);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.2px;
  font-variant-numeric: tabular-nums;
  color: var(--m-primary) !important;
}

/* ===== 本周活动：独立数据带（浅主色底，标签+值+剩余） ===== */
.m-home.m-home :deep(.identity-card .activity-week) {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 12.5px 14.5px 0;
  padding: 7.5px 10px;
  background: var(--m-primary-soft);
  border-radius: var(--m-r-md);
  min-width: 0;
}
.m-home.m-home :deep(.identity-card .activity-label) {
  flex: none;
  padding: 2px 6px;
  border-radius: var(--m-r-sm);
  background: var(--m-primary);
  font-family: var(--m-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.6px;
  line-height: 1.3;
  color: var(--m-on-primary) !important;
}
.m-home.m-home :deep(.identity-card .activity-name) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--m-primary-deep) !important;
}
.m-home.m-home :deep(.identity-card .activity-remain) {
  margin-left: auto;
  flex: none;
  font-family: var(--m-mono);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  color: var(--m-text3) !important;
}

/* ≤359px：8 字长名 + 门派 tag 会把「战力」挤走 ⇒ 这一档收窄字号让位 */
@media (max-width: 359px) {
  .m-home.m-home :deep(.identity-card .role-name) {
    font-size: 14px;
  }
}

/* ===== 三项关键资产：一列一条，竖向发丝线分隔 ===== */
.m-home.m-home :deep(.identity-card .resources) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 12.5px 14.5px 0;
  padding: 11.5px 0;
  border-top: 1px solid var(--m-band);
  background: none;
}
/* 卡片只留前 3 项，其余进抽屉（display:none 仍在 DOM 里，抽屉直接读文本） */
.m-home.m-home :deep(.identity-card .resources .res-item:nth-child(n + 4)) {
  display: none;
}
.m-home.m-home :deep(.identity-card .res-item) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 4px;
  min-height: 0;
  padding: 0;
  background: none;
  border: none;
}
.m-home.m-home :deep(.identity-card .resources .res-item + .res-item) {
  padding-left: 12px;
  border-left: 1px solid var(--m-band);
}
.m-home.m-home :deep(.identity-card .res-item .label) {
  max-width: 100%;
  color: var(--m-text3) !important;
  font-size: 9.5px;
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-home.m-home :deep(.identity-card .res-item .value) {
  max-width: 100%;
  color: var(--m-text) !important;
  font-family: var(--m-mono);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 底部：左「全部资产 N 项」右「查看全部 ›」（点击整行开抽屉） ===== */
.m-home.m-home :deep(.identity-card .resources-toggle) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 8.5px 14.5px 10px;
  border-top: 1px solid var(--m-band);
  /* 设计稿 #fafbfc：比白卡「浅一丁点」的同色调条，不是页面底色那么深。
     2% 主色混入卡底，随换肤走；暗色下同理得到一条比卡底略浅的条 */
  background: color-mix(in srgb, var(--m-primary) 2%, var(--m-card));
  border-radius: 0;
  cursor: pointer;
}
.m-home.m-home :deep(.identity-card .res-total) {
  font-size: 10px;
  letter-spacing: 0.5px;
  color: var(--m-text3) !important;
}
.m-home.m-home :deep(.identity-card .resources-toggle .n-button) {
  height: 22px;
  padding: 0 2px;
  font-size: 11.5px;
  font-weight: 600;
  --n-text-color: var(--m-primary) !important;
  --n-text-color-hover: var(--m-primary-deep) !important;
  --n-text-color-pressed: var(--m-primary-deep) !important;
  --n-text-color-focus: var(--m-primary) !important;
}
/* 按钮文字是 span，暗色下会被 App.vue 刷白 ⇒ 点名 */
.m-home.m-home :deep(.identity-card .resources-toggle .n-button .n-button__content) {
  color: var(--m-primary) !important;
}

/* ============================================================
 * ② 快捷入口：一张整卡 + 内部发丝线 3×2 网格
 *    之前是六张独立描边卡、每格里再套一个描边图标块——两层框、
 *    12 段描边，视觉很碎。现在收敛成一个容器，格间用 1px 发丝线
 *    分隔（与「玩法/工具」页磁贴、全站「分隔靠发丝线」语言一致），
 *    图标裸主色不再套底块。
 * ============================================================ */
.m-home .m-quick {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  background: var(--m-card);
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-lg);
  overflow: hidden;
}
.m-home .m-qa {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 13px 6px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  position: relative;
  box-shadow: none;
  font-family: inherit;
}
/* 发丝线：2/3 列左边线，第二行上边线（1px --m-band，全站分隔线规范） */
.m-home .m-qa:nth-child(3n + 2),
.m-home .m-qa:nth-child(3n + 3) {
  border-left: 1px solid var(--m-band);
}
.m-home .m-qa:nth-child(n + 4) {
  border-top: 1px solid var(--m-band);
}
/* 图标：裸主色线性图标，无底块（去掉「框中框」的里层框） */
.m-home .m-qa .m-ib {
  width: auto;
  height: auto;
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--m-primary);
}
/* App.vue 的暗色 *{color:#fff} 比继承强，图标必须显式点名 */
.m-home .m-qa .m-ib svg {
  width: 21px;
  height: 21px;
  color: var(--m-primary);
}
.m-home .m-qa .m-lb {
  font-size: 11px;
  font-weight: 400;
  line-height: 1.3;
  color: var(--m-text2) !important;
}
/* 齿轮：与「每日任务」卡头齿轮完全一致（23.5px 圆、卡底色、1px 描边、灰图标）。
   两颗齿轮在同一屏上，样式必须同一颗（用户 11-19 口径） */
.m-home .m-qa .m-gear {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 23.5px;
  height: 23.5px;
  border-radius: 50%;
  border: 1px solid var(--m-border);
  background: var(--m-card);
  color: var(--m-text3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.m-home .m-qa .m-gear svg {
  width: 11px;
  height: 11px;
}

/* ============================================================
 * ③ 三张状态卡（托管 MyCard / DailyTaskStatus）：白卡 + 描边，
 *    图标块浅主色底，计时等宽大数字，动作键 32px
 * ============================================================ */
.m-home.m-home :deep(.status-card) {
  background: var(--m-card);
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-lg);
  padding: 13px 14.5px;
  box-shadow: none;
  min-height: 0;
  transform: none;
  transition: none;
}
.m-home.m-home :deep(.status-card .card-header) {
  flex-wrap: nowrap;
  align-items: center;
  gap: 9px;
  margin-bottom: 11px;
}
/* 图标块：25px 浅主色底 + 线性图标（MIcon，currentColor 跟行动色，随换肤走） */
.m-home.m-home :deep(.status-card .card-header .status-icon) {
  flex: none;
  box-sizing: border-box;
  width: 25px;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--m-r-md);
  background: var(--m-primary-soft);
  border: 1px solid color-mix(in srgb, var(--m-primary) 16%, transparent);
  color: var(--m-primary);
  overflow: hidden;
}
/* App.vue 的暗色 *{color:#fff} 比继承强，svg 必须显式点名 */
.m-home.m-home :deep(.status-card .card-header .status-icon svg) {
  color: var(--m-primary);
}
.m-home.m-home :deep(.status-card .card-header .status-title h3),
.m-home.m-home :deep(.status-card .card-header .status-info h3) {
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--m-text) !important;
}
.m-home.m-home :deep(.status-card .card-header .status-title p),
.m-home.m-home :deep(.status-card .card-header .status-info p) {
  margin: 2px 0 0;
  font-size: 9.5px;
  line-height: 1.35;
  color: var(--m-text3) !important;
}
/* 徽章：小块（--m-r-md），语义色仍由 MyCard 的 --bg-color/--font-color 提供 */
.m-home.m-home :deep(.status-card .status-badge) {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4.5px;
  padding: 3px 8px;
  border-radius: var(--m-r-md);
  font-size: 9.5px;
  font-weight: 500;
  line-height: 1.4;
  background: var(--m-band);
  color: var(--m-text3) !important;
}
.m-home.m-home :deep(.status-card .status-badge .status-dot) {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--m-text4);
}
/* 传了 status-class 的卡片保留语义色（挂机中 / 运行中是数据语义，不能拍成灰块）。
 * ★ 特异性必须压过上面那条灰色底：这里 (0,6,0) > 上面的 (0,5,0)。 */
.m-home.m-home :deep(.status-card .status-badge.weekly),
.m-home.m-home :deep(.status-card .status-badge.active),
.m-home.m-home :deep(.status-card .status-badge.energy),
.m-home.m-home :deep(.status-card .status-badge.completed) {
  background: var(--bg-color);
  color: var(--font-color) !important;
}
.m-home.m-home :deep(.status-card .status-badge .status-dot) {
  background: currentColor;
}

/* ---------- 每日任务 ---------- */
/* 组件给 .daily-task 挂了 4px 橘色左边线做「专用色」标记 —— 本体系里卡片一律无边框 */
.m-home.m-home :deep(.status-card.daily-task) {
  border-left: 1px solid var(--m-border);
}
.m-home.m-home :deep(.daily-task .card-header) {
  flex-wrap: nowrap;
  align-items: center;
  margin-bottom: 11px;
}
.m-home.m-home :deep(.daily-task .header-right) {
  width: auto;
  margin-left: auto;
  margin-top: 0;
  gap: 5.5px;
}
.m-home.m-home :deep(.daily-task .settings-gear) {
  width: 23.5px;
  height: 23.5px;
  box-sizing: border-box; /* fork 自带 padding 3.5px，content-box 会撑大到 30.5px */
  padding: 0;
  /* 圆形，对齐六宫格里那颗「内置脚本」齿轮 */
  border-radius: 50%;
  background: var(--m-card);
  border: 1px solid var(--m-border);
  color: var(--m-text3) !important;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* ★ fork 里 .settings-gear svg{width:16px} 会把 MIcon 的 12px 图标拉大，
   两颗齿轮就一大一小（用户真机反馈）——显式钉回 12px */
.m-home.m-home :deep(.daily-task .settings-gear svg) {
  width: 12px;
  height: 12px;
}
.m-home.m-home :deep(.daily-task .progress-container) {
  margin-bottom: 9px;
}
/* 进度条：Naive 把 rail/fill 颜色与高度写成内联（rail-color=var(--m-bg)、高度 8px），
   只能 !important 压回 band + 5px 细条 */
.m-home.m-home :deep(.daily-task .n-progress) {
  --n-fill-color: var(--m-primary) !important;
}
.m-home.m-home :deep(.daily-task .n-progress-graph-line),
.m-home.m-home :deep(.daily-task .n-progress-graph-line-rail),
.m-home.m-home :deep(.daily-task .n-progress-graph-line-fill) {
  height: 5px !important;
}
.m-home.m-home :deep(.daily-task .n-progress-graph-line-rail) {
  background-color: var(--m-band) !important;
  border-radius: var(--m-r-sm) !important;
}
.m-home.m-home :deep(.daily-task .n-progress-graph-line-fill) {
  border-radius: var(--m-r-sm) !important;
}
.m-home.m-home :deep(.daily-task .info-container) {
  display: flex;
  align-items: baseline;
  justify-content: center; /* 用户口径：居中显示「今日任务完成100%」 */
  margin-top: 8px;
  font-size: 10px;
  color: var(--m-text3) !important;
}
.m-home.m-home :deep(.daily-task .info-container span) {
  color: var(--m-text3) !important;
}
.m-home.m-home :deep(.daily-task .info-container b) {
  /* 与说明文字同字号（整行一句话），只用颜色区分 —— 之前 11.5px mono
     与 10px 汉字基线混排又会出现「退后几像素」的观感 */
  margin-left: 1px;
  font-family: var(--m-mono);
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--m-primary) !important;
}
.m-home.m-home :deep(.daily-task .card-actions) {
  margin-top: 0;
  padding-top: 0;
  display: flex;
  gap: 8px;
}
/* 双按钮行：任务详情（次）+ 一键补差（主），等宽并排 */
.m-home.m-home :deep(.daily-task .action-button) {
  flex: 1;
  min-height: 32px;
  padding: 0 12px;
  border-radius: var(--m-r-md);
  font-size: 12px;
  font-weight: 500;
  background: var(--m-primary);
  color: var(--m-on-primary) !important;
  border: none;
}
.m-home.m-home :deep(.daily-task .action-button.secondary) {
  background: var(--m-card);
  border: 1px solid var(--m-border);
  color: var(--m-text2) !important;
}
.m-home.m-home :deep(.daily-task .action-button:disabled) {
  background: var(--m-band);
  color: var(--m-text3) !important;
  border-color: transparent;
}
/* 卡头状态徽章：进行中 / 已完成 —— 设计稿 B 是绿点 + 绿字，
 * 与挂机卡的「挂机中」同一语义色（fork 的 completed 只绿了完成态）。
 * (0,5,0)/(0,6,0) 压过 fork 的 `.daily-task .status-badge.completed`(0,4,0) */
.m-home.m-home :deep(.daily-task .status-badge) {
  background: var(--m-green-soft);
  color: var(--m-green) !important;
}
.m-home.m-home :deep(.daily-task .status-badge .status-dot) {
  background: var(--m-green);
}

/* ---------- 挂机 / 盐罐 ---------- */
.m-home.m-home :deep(.status-card .card-content) {
  margin-bottom: 9px;
}
/* 计时：等宽大数字，整卡的数据焦点 */
.m-home.m-home :deep(.status-card .time-display) {
  font-family: var(--m-mono);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 1.5px;
  font-variant-numeric: tabular-nums;
  color: var(--m-text) !important;
  text-align: center;
  margin: 2px 0 10px;
}
/* MyCard 的 .status-card .active 会给动作行刷一层淡绿底，移动端只留按钮自己的语义 */
.m-home.m-home :deep(.status-card .card-action) {
  background: transparent;
  gap: 8px;
}
/* 动作键：32px（全局基线 29px 是给行内小动作的，
   这三处是整宽主 CTA，单独抬一档）；主键实心蓝、次键白底描边 */
.m-home.m-home :deep(.card-action > button.action-button) {
  min-height: 32px;
  padding: 0 12px;
  border-radius: var(--m-r-md);
  font-size: 12px;
  font-weight: 500;
}
.m-home.m-home :deep(.card-action > button.action-button.secondary) {
  background: var(--m-card);
  border: 1px solid var(--m-border);
  color: var(--m-text2) !important;
}
.m-home.m-home :deep(.card-action > button.action-button.primary) {
  background: var(--m-primary);
  border: 1px solid transparent;
  color: var(--m-on-primary) !important;
}
/* 盐罐卡是 Arco 的 type=primary secondary：背景收到行动蓝，字色也要点名
   （暗色下 Arco 自带的白字会压在浅主色上） */
.m-home.m-home :deep(.bottle-helper .card-action .arco-btn) {
  height: 32px;
  font-size: 12px;
  border-radius: var(--m-r-md);
  background: var(--m-primary);
  border-color: var(--m-primary);
  color: var(--m-on-primary) !important;
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
  padding: 7px 14.5px calc(18px + env(safe-area-inset-bottom));
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
  gap: 11px;
  margin-bottom: 11px;
}
.m-home-sheet h4 {
  margin: 0;
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--m-text) !important;
}
.m-home-sheet .m-as-sub {
  margin-top: 2.5px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--m-text3) !important;
}
/* 主货币：2×2 分离小格（--m-bg 底），不再用 1px 缝拼网格 */
.m-home-sheet .m-as-hero {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12.5px;
}
.m-home-sheet .m-as-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 9px 11px;
  /* 设计稿 #f7f9fc 是「带一点主色调的极淡灰白」，不是中性灰；
     用 3% 主色混入卡底，随换肤走（skins 没有 RGB 三元组，不能用 rgba(var(--m-primary-rgb))） */
  background: color-mix(in srgb, var(--m-primary) 3%, var(--m-card));
  border-radius: var(--m-r-md);
}
.m-home-sheet .m-as-k {
  font-size: 9.5px;
  line-height: 1.3;
  letter-spacing: 0.5px;
  color: var(--m-text3) !important;
}
.m-home-sheet .m-as-v {
  overflow: hidden;
  font-family: var(--m-mono);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-text) !important;
}
/* 分组：节标题 = 2px 行动色竖线 + 11px 灰字 + 右侧项数 */
.m-home-sheet .m-as-sec + .m-as-sec {
  margin-top: 12.5px;
}
.m-home-sheet .m-as-sec-title {
  display: flex;
  align-items: center;
  gap: 5.5px;
  margin-bottom: 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  line-height: 16px;
  color: var(--m-text3) !important;
}
.m-home-sheet .m-as-sec-title::before {
  content: "";
  flex: none;
  width: 2.5px;
  height: 9px;
  border-radius: 1px;
  background: var(--m-primary);
}
.m-home-sheet .m-as-sec-k {
  color: var(--m-text3) !important;
}
.m-home-sheet .m-as-sec-n {
  margin-left: auto;
  font-family: var(--m-mono);
  font-size: 9.5px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--m-text3) !important;
}
/* 两列账目：标签左、数值右（等宽），行间发丝线 */
.m-home-sheet .m-as-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 18px;
}
.m-home-sheet .m-as-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 7px;
  padding: 6.5px 0;
  border-bottom: 1px solid var(--m-band);
}
.m-home-sheet .m-as-row .m-as-label {
  overflow: hidden;
  font-size: 11.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-text3) !important;
}
.m-home-sheet .m-as-row .m-as-value {
  flex: none;
  font-family: var(--m-mono);
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--m-text) !important;
}
</style>

<script>
export default { name: "MobileHome" };
</script>
