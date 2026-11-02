<template>
  <div class="m-page m-tools m-desk">
    <!-- ========== 宫格视图 ==========
         与「玩法」页同一套交互：宫格 → 点进单个工具 → 系统返回键 / 再点一次「工具」tab 回宫格。
         7 个工具分两组（资源 / 对战与活动），按使用场景排。
         2026-11-02 改版（用户：太单调）——一组一张卡 + 卡头「组名 / N 项」，
         组内两列磁贴：28px 图标 + 名称 + 一行副标题；版式与「玩法」页共用 mobile.css 那套。 -->
    <div class="m-tools-grid" v-show="!active">
      <div v-for="g in groups" :key="g.label" class="m-glist">
        <div class="m-glist-h">
          <span class="m-glist-t">{{ g.label }}</span>
          <span class="m-glist-n">{{ g.items.length }} 项</span>
        </div>
        <div class="m-tiles">
          <button
            v-for="(t, i) in g.items"
            :key="t.key"
            class="m-tile"
            :class="{ 'm-tile--wide': g.items.length % 2 === 1 && i === g.items.length - 1 }"
            @click="open(t.key)"
          >
            <span class="m-tile-ic"><MIcon :name="t.icon" :size="18" /></span>
            <span class="m-tile-tx">
              <span class="m-tile-nm">{{ t.label }}</span>
              <span class="m-tile-sub">{{ t.sub }}</span>
            </span>
          </button>
        </div>
      </div>
      <div class="m-card m-tools-note">
        <span class="m-tools-bar"></span>
        <p class="m-hint" style="margin: 0">工具均以当前选中账号运行，运行中请勿切换账号或断开连接。</p>
      </div>
    </div>

    <!-- 就绪门：工具组件直接读 tokenStore.gameData.roleInfo，
         数据未到时工具卡会抛 "reading 'heroes' of null" 并冒泡到根、整页白屏。
         桌面端靠 v-show 分区少踩到，移动端必须挡住。 -->
    <div class="m-card" v-show="!!active && !dataReady">
      <div class="m-empty" style="padding: 32px 0">
        <div class="m-logo">◌</div>
        <h3>等待账号数据</h3>
        <p>{{ hasToken ? "正在读取角色信息，连上后工具会自动出现。" : "尚未选择账号，请先在「我的 → 管理 Token」里导入。" }}</p>
        <button class="m-btn m-btn-g" @click="goTokens">去管理 Token</button>
      </div>
    </div>

    <!-- ========== 工具面板 ==========
         一次只渲染一个工具，靠 <KeepAlive> 保住已经打开过的实例：
         · 工具都有 state.isRunning 长任务，离开 / 切走时不能被销毁（定时器一停任务就半死），
           而 KeepAlive 的「失活」只调 onDeactivated、不调 onUnmounted，任务继续跑。
         · 也避免首屏同时挂 11 个共 8k 行组件 —— 实测那样会让本页的渲染效应停止刷新
           （父级 ref 变了但 DOM 不更新），页面看起来卡死在第一个工具上。
         · KeepAlive 本身常驻：回宫格时只是 currentTool 变 null，缓存不丢，再进还在。 -->
    <KeepAlive>
      <component v-if="currentTool && dataReady" :is="currentTool.comp" :key="currentTool.key" />
    </KeepAlive>
  </div>
</template>

<script setup>
/* 工具 tab —— 移植旧版 GameStatus.vue 的「工具」分区（ENABLE_TOOLS_TAB），
   移动端只上 7 个（原 11 个，11-01 按用户要求下架 4 个）。
 * 原则：组件本体一行不改（逻辑 / 取数 / 命令全部原样），只在本页做两件事：
 *   1. 宫格导航：一次只露一个工具，别再纵向堆一堆卡
 *   2. 根节点挂 .m-desk：桌面主题变量重映射 + MyCard 压平 + 控件收口都在 mobile.css 里统一处理
 *      （弹窗那层的样式在 mobile.css 的 body.m-mobile 下，由 MobileLayout 统一挂标记）
 * 新增工具时：在 GameStatus.vue 的 tools 分区加组件，这里同步加一项即可。 */
import Unlimitedlineup from "@/mobile/fork/components/cards/Unlimitedlineup.vue";
import BoxHelperCard from "@/mobile/fork/components/cards/BoxHelperCard.vue";
import FishHelperCard from "@/mobile/fork/components/cards/FishHelperCard.vue";
import RecruitHelperCard from "@/mobile/fork/components/cards/RecruitHelperCard.vue";
import FightHelperCard from "@/mobile/fork/components/cards/FightHelperCard.vue";
import RefineHelperCard from "@/mobile/fork/components/cards/RefineHelperCard.vue";
import ConsumptionProgressCard from "@/mobile/fork/components/cards/ConsumptionProgressCard.vue";
import MIcon from "@/mobile/components/MIcon.vue";
import { computed, nextTick, onErrorCaptured, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTokenStore } from "@/stores/tokenStore";

const tokenStore = useTokenStore();
const route = useRoute();
const router = useRouter();

/* 工具清单：key 走路由 query，comp 是桌面原组件
   11-01 精简：武将升级 / 升星助手 / 梦境助手 / 咸王功能 下架（用户要求），
   洗练助手从「养成」挪进「资源」，「阵容助手」更名「云阵容」。
   sub = 磁贴副标题（11-02 改版新增），一句话说清这个工具干什么，别再只靠图标猜。 */
const tools = [
  { key: "box", label: "宝箱助手", icon: "box", sub: "批量开箱", comp: BoxHelperCard },
  { key: "recruit", label: "招募助手", icon: "recruit", sub: "批量招募", comp: RecruitHelperCard },
  { key: "fish", label: "钓鱼助手", icon: "fish", sub: "批量钓鱼", comp: FishHelperCard },
  { key: "refine", label: "洗练助手", icon: "sliders", sub: "自动洗练", comp: RefineHelperCard },
  { key: "lineup", label: "云阵容", icon: "formation", sub: "云端阵容一键切回", comp: Unlimitedlineup },
  { key: "fight", label: "竞技场助手", icon: "swords", sub: "自动挑战", comp: FightHelperCard },
  { key: "consume", label: "消耗进度", icon: "chart", sub: "资源消耗与方案推荐", comp: ConsumptionProgressCard },
];

const byKey = Object.fromEntries(tools.map((t) => [t.key, t]));

/* 宫格分组：资源（拿资源 + 花在装备上的洗练） / 对战与活动（打）。
   「养成」组原先是武将升级 / 升星 / 洗练，前两个下架、洗练挪走后整组空了，直接去掉。 */
const groups = [
  { label: "资源", items: [byKey.box, byKey.recruit, byKey.fish, byKey.refine] },
  { label: "对战与活动", items: [byKey.lineup, byKey.fight, byKey.consume] },
];

const active = ref("");

/* 进入靠路由 query（/mobile/tools?panel=refine）：
   · 不新增路由，手机/浏览器的返回键天然回宫格
   · 再点一次「工具」tab 也会带 query 重置回宫格（见 MobileLayout.goTab）
   · 只用自有键判定：?panel=constructor 之类一律回宫格 */
watch(
  () => route.query.panel,
  (key) => {
    active.value = typeof key === "string" && Object.prototype.hasOwnProperty.call(byKey, key) ? key : "";
  },
  { immediate: true },
);

/* 滚动发生在 MobileLayout 的 .m-scroll 上，切换面板后复位 */
const scrollTop = () => {
  const el = document.querySelector(".m-scroll");
  if (el) el.scrollTop = 0;
};
watch(active, () => nextTick(scrollTop));

const open = (key) => {
  router.push({ path: "/mobile/tools", query: { panel: key } });
  scrollTop();
};

/* 工具组件都直接读 tokenStore.gameData.roleInfo，未就绪时挂载会抛错 */
const hasToken = computed(() => !!tokenStore.hasTokens);
const dataReady = computed(() => !!tokenStore.gameData?.roleInfo);

const goTokens = () => router.push("/mobile/tokens");

/* 当前工具（宫格态为 null）。面板只渲染这一个，其余靠 KeepAlive 缓存。 */
const currentTool = computed(() => (active.value ? byKey[active.value] || null : null));

/* 兜底：任何一个工具组件报错都不许冒泡到根 —— 否则整个移动端壳（含底部 tab）会被卸载 */
onErrorCaptured((err, instance, info) => {
  console.warn("[mobile-tools] 工具组件渲染异常，已拦截:", info, err?.message || err);
  return false;
});
</script>

<script>
/* 显式声明 name：壳里用 <keep-alive :include> 缓存本页，
   否则切到别的 tab 再回来会重新挂载 —— 运行中的工具（state.isRunning）会被重置，
   而命令其实还在发，UI 与实际不一致。 */
export default { name: "MobileTools" };
</script>

<style scoped>
/* ============================================================
 * 一、宫格
 * 版式统一在 mobile.css 的「入口分组卡」（.m-glist / .m-tile），与玩法页共用；
 * 本页只留底部那条脚注卡（原来是一整行裸灰字，现在收进卡里、左侧一条蓝标）。
 * ============================================================ */
.m-tools-grid .m-tools-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: var(--m-r-md);
}
.m-tools-bar {
  width: 3px;
  height: 14px;
  flex: none;
  margin-top: 2px;
  border-radius: 2px;
  background: var(--m-primary);
}

/* ============================================================
 * 二、只在工具里出现的窄屏修正
 * 通用的「桌面 → 移动端」压平（卡片壳、卡头、徽章、控件）已经搬到 mobile.css 的 .m-desk，
 * 这里只留某几个工具自己特有的问题。选择器重复 .m-tools 抬特异性，压过组件 scoped 样式。
 * ============================================================ */

/* ---------- 洗练助手：条件行里三个控件带死宽度（150 / 120 / 80 / 100px 内联）----------
   内联样式只能用 !important 盖过；改成「label + 控件撑满」。 */
.m-tools.m-tools :deep(.auto-form) {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.m-tools.m-tools :deep(.form-item) {
  width: 100%;
  flex-wrap: nowrap;
  gap: 8px;
}
.m-tools.m-tools :deep(.form-item .form-label) {
  flex: none;
  white-space: nowrap;
}
.m-tools.m-tools :deep(.form-item .n-select),
.m-tools.m-tools :deep(.form-item .n-input),
.m-tools.m-tools :deep(.form-item .n-input-number) {
  flex: 1 1 auto;
  width: auto !important;
  min-width: 0;
}

/* 二级密码行：label + 输入框 + 验证按钮，挤一行会压字 */
.m-tools.m-tools :deep(.password-info) {
  flex-wrap: wrap;
  row-gap: 8px;
}
.m-tools.m-tools :deep(.password-info .n-input) {
  flex: 1 1 140px;
  width: auto !important;
  min-width: 0;
}

/* 装备部位 tab（头/衣/鞋…）：桌面单行并排，窄屏换行成两行 */
.m-tools.m-tools :deep(.equip-tabs) {
  flex-wrap: wrap;
}
/* 淬炼按钮组：4 个按钮 + 次数信息，允许换行 */
.m-tools.m-tools :deep(.actions) {
  flex-wrap: wrap;
  row-gap: 8px;
}

/* 武将列表：桌面靠宽屏铺开，窄屏给个上限省纵向空间（仍可内部滚动） */
.m-tools.m-tools :deep(.hero-list) {
  max-height: 260px;
}

/* 属性小行（竞技场 / 洗练等工具还在用 .stat-row）：窄屏允许换行，别把「攻/防/速」截断 */
.m-tools.m-tools :deep(.stat-row),
.m-tools.m-tools :deep(.stat-row-small) {
  flex-wrap: wrap;
  gap: 4px 6px;
}

/* ---------- 消耗活动进度：这张卡没走 MyCard，自带一套桌面样式 ---------- */
.m-tools.m-tools :deep(.consumption-progress.status-card) {
  background: var(--m-card);
  border: none;
  border-radius: var(--m-r-md);
  height: auto;
}
/* 桌面把整段信息写成主色蓝加粗，读起来像报错；正文应回到 ink-body 层级 */
.m-tools.m-tools :deep(.consumption-progress .item-values .current),
.m-tools.m-tools :deep(.consumption-progress .setting-item .label) {
  color: var(--m-text2);
  font-weight: 400;
  font-family: inherit;
  line-height: 1.6;
}
/* 一行里塞「使用数量: + 数字框 + 说明」，窄屏必然压字，改为可换行 */
.m-tools.m-tools :deep(.consumption-progress .setting-item) {
  flex-wrap: wrap;
  row-gap: 8px;
}
.m-tools.m-tools :deep(.consumption-progress .setting-item .n-input-number) {
  width: 100%;
}
.m-tools.m-tools :deep(.consumption-progress .header-left .title) {
  font-size: 15px;
  font-weight: 700;
  color: var(--m-text);
}
/* 明细行（组合名 / 数值 / 状态）：窄屏换成可换行，不截断 */
.m-tools.m-tools :deep(.consumption-progress .item-header),
.m-tools.m-tools :deep(.consumption-progress .item-values),
.m-tools.m-tools :deep(.consumption-progress .item-footer) {
  flex-wrap: wrap;
  row-gap: 4px;
}
</style>
