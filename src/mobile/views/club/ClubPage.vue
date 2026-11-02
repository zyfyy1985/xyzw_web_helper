<template>
  <div class="m-page">
    <!-- 玩法宫格：按分类进入各面板。
         2026-11-02 改版（用户：太单调）——一组一张卡 + 卡头「组名 / N 项」，
         组内两列磁贴：28px 图标 + 名称 + 一行副标题（说清点进去能看到什么）；
         磁贴之间用 1px 分隔线连成网格，奇数项最后一项横跨两列。
         样式在 mobile.css 的「入口分组卡」，与「工具」页共用同一套。 -->
    <template v-if="!active">
      <div v-for="g in groups" :key="g.label" class="m-glist">
        <div class="m-glist-h">
          <span class="m-glist-t">{{ g.label }}</span>
          <span class="m-glist-n">{{ g.items.length }} 项</span>
        </div>
        <div class="m-tiles">
          <button
            v-for="(p, i) in g.items"
            :key="p.key"
            class="m-tile"
            :class="{ 'm-tile--wide': g.items.length % 2 === 1 && i === g.items.length - 1 }"
            @click="open(p.key)"
          >
            <span class="m-tile-ic"><MIcon :name="p.icon" :size="18" /></span>
            <span class="m-tile-tx">
              <span class="m-tile-nm">{{ p.label }}</span>
              <span class="m-tile-sub">{{ p.sub }}</span>
            </span>
          </button>
        </div>
      </div>
    </template>

    <!-- 面板视图：进入靠路由 query，返回交给系统/浏览器返回键 -->
    <template v-else>
      <ClubPanel v-if="active === 'club'" />
      <SaltPanel v-else-if="active === 'salt'" />
      <PeachPanel v-else-if="active === 'peach'" />
      <ApexPanel v-else-if="active === 'apex'" />
      <CampPanel v-else-if="active === 'camp'" />
      <WeirdTowerPanel v-else-if="active === 'tower'" />
      <TowerStatusPanel v-else-if="active === 'xianTower'" />
      <WeirdTowerStatusPanel v-else-if="active === 'weirdTower'" />
      <PushingLevelsPanel v-else-if="active === 'pushing'" />
      <MonthlyTasksPanel v-else-if="active === 'monthly'" />
      <StudyChallengePanel v-else-if="active === 'study'" />
      <SkinChallengePanel v-else-if="active === 'skin'" />
      <RankingPanel v-else-if="active === 'ranking'" />
      <FightPvpPanel v-else-if="active === 'pvp'" />
    </template>
  </div>
</template>

<script setup>
import { nextTick, onErrorCaptured, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ClubPanel from "./panels/ClubPanel.vue";
import SaltPanel from "./panels/SaltPanel.vue";
import PeachPanel from "./panels/PeachPanel.vue";
import ApexPanel from "./panels/ApexPanel.vue";
import CampPanel from "./panels/CampPanel.vue";
import WeirdTowerPanel from "./panels/WeirdTowerPanel.vue";
import TowerStatusPanel from "./panels/TowerStatusPanel.vue";
import WeirdTowerStatusPanel from "./panels/WeirdTowerStatusPanel.vue";
import PushingLevelsPanel from "./panels/PushingLevelsPanel.vue";
import MonthlyTasksPanel from "./panels/MonthlyTasksPanel.vue";
import StudyChallengePanel from "./panels/StudyChallengePanel.vue";
import SkinChallengePanel from "./panels/SkinChallengePanel.vue";
import RankingPanel from "./panels/RankingPanel.vue";
import FightPvpPanel from "./panels/FightPvpPanel.vue";
import MIcon from "@/mobile/components/MIcon.vue";
import { useBattleVersionWarmup } from "@/mobile/utils/battleVersion";

/* 玩法页加载完成：同样把战斗版本号取回来（首页已经取过就直接返回）。
   切磋 / 爬塔 / 闯关这些战斗命令要带它，取不到会带 null 被服务端拒。 */
useBattleVersionWarmup();

/* 面板清单（键与面板组件一一对应）
   后 8 项是直接托管桌面组件的「宿主面板」：外面套 .m-desk（mobile.css 里统一做
   主题变量重映射 + 卡片压平 + 控件收口），面板内部只写各自组件特有的窄屏修正。 */
const panels = {
  club: { key: "club", label: "俱乐部", icon: "club", sub: "概况·成员·怪异塔信息" },
  salt: { key: "salt", label: "盐场", icon: "salt", sub: "匹配·周报·月报·地图" },
  peach: { key: "peach", label: "蟠桃园", icon: "peach", sub: "匹配·战绩" },
  apex: { key: "apex", label: "逐鹿盐山", icon: "apex", sub: "竞猜·助威" },
  camp: { key: "camp", label: "营地挑战", icon: "camp", sub: "战况·督战" },
  /* 注意：tower 是「俱乐部怪异塔成员榜」（拉 legion 成员数据），
     和下面 weirdTower 的「怪异塔爬塔」不是一回事，两个都得留。
     宫格里已不再出格子 —— 它已并入「俱乐部 → 怪异塔信息」页签；
     保留这个 key 只为兼容旧深链 `/mobile/club?panel=tower`。 */
  tower: { key: "tower", label: "怪异塔", icon: "tower", sub: "成员榜" },
  xianTower: { key: "xianTower", label: "咸将塔", icon: "tower", sub: "一键爬塔" },
  weirdTower: { key: "weirdTower", label: "怪异塔", icon: "weird", sub: "爬塔·使用道具·合成道具" },
  pushing: { key: "pushing", label: "主线推关", icon: "flag", sub: "自动推主线关卡" },
  monthly: { key: "monthly", label: "月度任务", icon: "calendar", sub: "竞技补齐·钓鱼补齐" },
  study: { key: "study", label: "咸鱼大冲关", icon: "target", sub: "答题" },
  skin: { key: "skin", label: "换皮闯关", icon: "shirt", sub: "换皮活动" },
  ranking: { key: "ranking", label: "排行榜", icon: "ranking", sub: "多榜切换" },
  pvp: { key: "pvp", label: "切磋", icon: "swords", sub: "找对手对战" },
};

/* 分类分组：俱乐部 / 单人挑战 / 活动与榜单
   原「跨服玩法」组已拆（2026-10-28 按产品要求）：盐场、蟠桃园并入「俱乐部」，逐鹿并入「活动」，
   组内清空后整组删除，免得留一个空标题。
   「怪异塔成员」不再出格子：已并入 俱乐部面板的「怪异塔信息」页签（紧挨历史战绩）。
   2026-11-02 改版：原「活动」4 项 + 「榜单与切磋」2 项合成一组 6 项（正好 3 行两列），
   少一个组标题、页面更短；入口顺序与原来一致。 */
const groups = [
  { label: "俱乐部", items: [panels.club, panels.salt, panels.peach, panels.camp] },
  { label: "单人挑战", items: [panels.xianTower, panels.weirdTower, panels.pushing] },
  { label: "活动与榜单", items: [panels.monthly, panels.study, panels.skin, panels.apex, panels.ranking, panels.pvp] },
];

const active = ref("");

/* 进入面板走路由 query（/mobile/club?panel=salt）：
   · 不新增任何路由，只加 query，手机/浏览器的返回键天然回到宫格
   · 首页快捷入口也能直达（?panel=salt）
   · 返回宫格 = 退一格历史，无需页面内的返回按钮 */
const route = useRoute();
const router = useRouter();
/* 面板根是 .m-pane，滚动发生在 MobileLayout 的 .m-scroll 上 */
const scrollTop = () => {
  const el = document.querySelector(".m-scroll");
  if (el) el.scrollTop = 0;
};

const open = (key) => {
  router.push({ path: "/mobile/club", query: { panel: key } });
  scrollTop();
};

/* active 由 query 派生，避免与历史栈各存一份状态 */
watch(
  () => route.query.panel,
  (key) => {
    /* 只用自有键判定：?panel=constructor、?panel[]=salt 等非法值一律回宫格 */
    active.value =
      typeof key === "string" && Object.prototype.hasOwnProperty.call(panels, key) ? key : "";
  },
  {
    immediate: true,
  },
);

/* 面板切换后复位滚动（含浏览器返回键切换 query 的场景） */
watch(active, () => nextTick(scrollTop));

/* 兜底：任一桌面组件报错都不许冒泡到根 —— 否则整个移动端壳（含底部 tab）会被卸载。
   现有面板自己兜住了数据未就绪，但新接进来的桌面组件（塔 / 榜单 / 切磋 / 推关）
   体量都在 800~3300 行，一个空指针就能白屏，这里统一拦一道。 */
onErrorCaptured((err, instance, info) => {
  console.warn("[mobile-club] 面板渲染异常，已拦截:", info, err?.message || err);
  return false;
});

</script>

<script>
export default { name: "MobileClubPage" };
</script>

<style scoped>
/* 入口列表的版式全部在 mobile.css 的「入口分组卡」（.m-glist / .m-tile），
   与「工具」页共用一套；本页不再自己写宫格样式（原来那套 3 列 .m-gcard 已删）。 */
</style>
