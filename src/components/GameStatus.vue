<template>
  <div
    class="game-status-container"
    :class="{
      'full-grid': activeSection === 'fightPvp',
      'full-page-mode':
        activeSection === 'saltFieldGroup' ||
        activeSection === 'campChallengeGroup' ||
        activeSection === 'apexChallengeGroup' ||
        activeSection === 'peachGroup' ||
        activeSection === 'rankGroup',
      'club-mode': activeSection === 'club',
    }"
  >
    <!-- 身份牌常驻（嵌入式，Tabs 上方） -->
    <IdentityCard embedded />

    <!-- 下方选卡分区切换（Tabs）：日常｜俱乐部｜活动 -->
    <n-tabs
      class="section-tabs"
      v-model:value="activeSection"
      type="line"
      animated
      size="small"
    >
      <n-tab-pane name="daily" tab="日常" />
      <n-tab-pane name="club" tab="俱乐部" />
      <n-tab-pane name="activity" tab="活动" />
      <n-tab-pane v-if="ENABLE_TOOLS_TAB" name="tools" tab="工具" />
      <n-tab-pane name="apexChallengeGroup" tab="逐鹿盐山" />
      <n-tab-pane name="campChallengeGroup" tab="营地挑战" />
      <n-tab-pane name="saltFieldGroup" tab="盐场" />
      <n-tab-pane name="peachGroup" tab="蟠桃园" />
      <n-tab-pane name="rankGroup" tab="排行榜" />
      <n-tab-pane name="fightPvp" tab="切磋" />
    </n-tabs>

    <!-- 阵容（仅日常） -->
    <TeamFormation v-show="activeSection === 'daily'" />

    <!-- 每日任务状态（仅日常） -->
    <DailyTaskStatus v-show="activeSection === 'daily'" />

    <!-- 咸将塔状态 -->
    <TowerStatus v-show="activeSection === 'daily' && isShowTowerStatus" />

    <!-- 怪异塔状态 -->
    <WeirdTowerStatus v-show="activeSection === 'daily'" />

    <!-- 盐罐机器人状态（提取组件） -->
    <BottleHelperCard v-show="activeSection === 'daily'" />

    <!-- 挂机状态（提取组件） -->
    <HangUpStatusCard v-show="activeSection === 'daily'" />

    <!-- 无限阵容助手（提取组件） -->
    <Unlimitedlineup v-show="activeSection === 'tools'" />

    <!-- 宝箱助手（提取组件） -->
    <BoxHelperCard v-show="activeSection === 'tools'" />

    <!-- 钓鱼助手（提取组件） -->
    <FishHelperCard v-show="activeSection === 'tools'" />

    <!-- 招募助手（提取组件） -->
    <RecruitHelperCard v-show="activeSection === 'tools'" />

    <!-- 升星助手（提取组件） -->
    <StarUpgradeCard v-if="activeSection === 'tools'" />

    <!-- 竞技场助手（提取组件） -->
    <FightHelperCard v-if="activeSection === 'tools'" />

    <!-- 梦境助手（提取组件） -->
    <DreamHelperCard v-if="activeSection === 'tools'" />

    <!-- 武将升级助手（提取组件） -->
    <HeroUpgradeCard v-if="activeSection === 'tools'" />

    <!-- 洗练助手（提取组件） -->
    <RefineHelperCard v-if="activeSection === 'tools'" />

    <!-- 消耗活动进度（提取组件） -->
    <ConsumptionProgressCard v-if="activeSection === 'tools'" />
    <!-- 咸王宝库（提取组件） -->
    <BossTower v-if="activeSection === 'tools'" />
    <!-- 俱乐部排位（暂时隐藏） -->
    <div
      class="status-card legion-match"
      v-if="ENABLE_LEGION_MATCH && activeSection === 'club'"
    >
      <div class="card-header">
        <img
          src="/icons/1733492491706152.png"
          alt="俱乐部图标"
          class="status-icon"
        />
        <div class="status-info">
          <h3>俱乐部排位</h3>
          <p>赛事状态</p>
        </div>
        <div class="status-badge" :class="{ active: legionMatch.isRegistered }">
          <div class="status-dot" />
          <span>{{ legionMatch.isRegistered ? "已报名" : "未报名" }}</span>
        </div>
      </div>
      <div class="card-content">
        <p class="description">
          每逢周三周四周五有比赛<br />
          立即报名参与精彩对决！
        </p>
        <button
          class="action-button"
          :disabled="legionMatch.isRegistered"
          @click="registerLegionMatch"
        >
          {{ legionMatch.isRegistered ? "已报名" : "立即报名" }}
        </button>
      </div>
    </div>

    <!-- 俱乐部签到（已迁移到俱乐部信息-概览，故隐藏原卡片） -->
    <div
      class="status-card legion-signin"
      v-if="ENABLE_LEGION_SIGNIN_CARD && activeSection === 'club'"
    >
      <div class="card-header">
        <img
          src="/icons/1733492491706148.png"
          alt="签到图标"
          class="status-icon"
        />
        <div class="status-info">
          <h3>俱乐部签到</h3>
          <p>每日签到状态</p>
        </div>
        <div class="status-badge" :class="{ active: legionSignin.isSignedIn }">
          <div class="status-dot" />
          <span>{{ legionSignin.isSignedIn ? "已签到" : "待签到" }}</span>
        </div>
      </div>
      <div class="card-content">
        <p v-if="legionSignin.clubName" class="club-name">
          当前俱乐部<br />
          <strong>{{ legionSignin.clubName }}</strong>
        </p>
        <p v-else class="description">尚未加入任何俱乐部</p>
        <div class="action-row">
          <button
            class="action-button"
            :disabled="legionSignin.isSignedIn"
            @click="signInLegion"
          >
            {{ legionSignin.isSignedIn ? "已签到" : "立即签到" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 俱乐部信息（仅俱乐部分区） -->
    <ClubInfo v-if="activeSection === 'club'" />

    <!-- 月度任务进度（提取组件） -->
    <MonthlyTasksCard v-show="activeSection === 'activity'" />

    <!-- 咸鱼大冲关（提取组件） -->
    <StudyChallengeCard v-show="activeSection === 'activity'" />

    <!-- 换皮闯关 -->
    <SkinChallengeCard v-show="activeSection === 'activity'" />

    <!-- 逐鹿盐山分组 -->
    <div class="apex-challenge-group" v-if="activeSection === 'apexChallengeGroup'">
      <ApexChallenge />
    </div>

    <!-- 营地挑战分组 -->
    <div class="camp-challenge-group" v-if="activeSection === 'campChallengeGroup'">
      <CampChallenge />
    </div>

    <!-- 盐场分组（包含盐场、周战绩、月战绩） -->
    <div class="salt-field-group" v-if="activeSection === 'saltFieldGroup'">
      <div
        class="sub-nav"
        style="
          padding: 8px;
          background: var(--n-color);
          display: flex;
          justify-content: center;
        "
      >
        <n-tabs
          type="segment"
          animated
          v-model:value="saltFieldSubTab"
          size="small"
        >
          <n-tab-pane name="warrank" tab="盐场" />
          <n-tab-pane name="weekBattle" tab="本周盐场战绩" />
          <n-tab-pane name="monthBattle" tab="本月盐场战绩" />
          <n-tab-pane name="legionWarMap" tab="盐场地图" />
          <n-tab-pane name="legionWarStatistics" tab="盐场战况" />
        </n-tabs>
      </div>

      <!-- 盐场匹配信息详情 样式切换 -->
      <div
        class="style-switch-bar"
        v-if="saltFieldSubTab === 'warrank'"
        style="
          padding: 0 8px 8px;
          background: var(--n-color);
          display: flex;
          justify-content: center;
        "
      >
        <n-radio-group v-model:value="warrankStyle" size="small">
          <n-radio-button value="style1">样式一</n-radio-button>
          <n-radio-button value="style2">样式二</n-radio-button>
        </n-radio-group>
        <!-- [本地扩展] 说明：样式一/样式二 只切换导出图片的版式 -->
        <span class="style-switch-hint">仅影响导出图片版式</span>
      </div>

      <div
        class="warrank-full-container"
        v-if="saltFieldSubTab === 'weekBattle'"
      >
        <ClubBattleRecords />
      </div>

      <div
        class="warrank-full-container"
        :class="{ 'style2-container': warrankStyle === 'style2' }"
        v-if="saltFieldSubTab === 'warrank'"
      >
        <ClubWarrankV2 v-if="warrankStyle === 'style2'" />
        <ClubWarrank v-else />
      </div>

      <div
        class="warrank-full-container"
        v-if="saltFieldSubTab === 'monthBattle'"
      >
        <ClubMonthBattleRecords />
      </div>

      <div
        class="warrank-full-container"
        v-if="saltFieldSubTab === 'legionWarMap'"
      >
        <LegionWarMap />
      </div>
      <div
        class="warrank-full-container"
        v-if="saltFieldSubTab === 'legionWarStatistics'"
      >
        <LegionWarStatistics />
      </div>
    </div>

    <!-- 蟠桃园分组 -->
    <div class="peach-group" v-if="activeSection === 'peachGroup'">
      <div
        class="sub-nav"
        style="
          padding: 8px;
          background: var(--n-color);
          display: flex;
          justify-content: center;
        "
      >
        <n-tabs
          type="segment"
          animated
          v-model:value="peachSubTab"
          size="small"
        >
          <n-tab-pane name="peach" tab="蟠桃园信息" />
          <n-tab-pane name="peachBattle" tab="蟠桃园战绩" />
        </n-tabs>
      </div>

      <!-- 蟠桃园信息 样式切换 -->
      <div
        class="style-switch-bar"
        v-if="peachSubTab === 'peach'"
        style="
          padding: 0 8px 8px;
          background: var(--n-color);
          display: flex;
          justify-content: center;
        "
      >
        <n-radio-group v-model:value="peachStyle" size="small">
          <n-radio-button value="style1">样式一</n-radio-button>
          <n-radio-button value="style2">样式二</n-radio-button>
        </n-radio-group>
      </div>

      <div class="warrank-full-container" v-if="peachSubTab === 'peachBattle'">
        <PeachBattleRecords />
      </div>

      <div
        class="warrank-full-container"
        :class="{ 'style2-container': peachStyle === 'style2' }"
        v-if="peachSubTab === 'peach'"
      >
        <PeachInfoV2 v-if="peachStyle === 'style2'" />
        <PeachInfo v-else />
      </div>
    </div>

    <!-- 排行榜分组 -->
    <div class="rank-group" v-if="activeSection === 'rankGroup'">
      <div
        class="sub-nav"
        style="
          padding: 8px;
          background: var(--n-color);
          display: flex;
          justify-content: center;
        "
      >
        <n-tabs type="segment" animated v-model:value="rankSubTab" size="small">
          <n-tab-pane name="serverrank" tab="区服榜" />
          <n-tab-pane name="toprank" tab="巅峰榜" />
          <n-tab-pane name="topclubrank" tab="俱乐部榜" />
          <n-tab-pane name="goldclubrank" tab="黄金积分榜" />
          <n-tab-pane name="greatRouteRank" tab="伟大航路积分榜" />
        </n-tabs>
      </div>

      <div class="warrank-full-container" v-if="rankSubTab === 'serverrank'">
        <ServerRankList />
      </div>

      <div class="warrank-full-container" v-if="rankSubTab === 'toprank'">
        <TopRankList />
      </div>

      <div class="warrank-full-container" v-if="rankSubTab === 'topclubrank'">
        <TopClubList />
      </div>

      <div class="warrank-full-container" v-if="rankSubTab === 'goldclubrank'">
        <GoldClubList />
      </div>

      <div
        class="warrank-full-container"
        v-if="rankSubTab === 'greatRouteRank'"
      >
        <GreatRouteRankList />
      </div>
    </div>
    <!-- 切磋（提取组件） -->
    <FightPvp v-if="activeSection === 'fightPvp'" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { useMessage } from "naive-ui";
import {
  preloadQuestions,
  getQuestionCount,
} from "@/utils/studyQuestionsFromJSON.js";
import BottleHelperCard from "./cards/BottleHelperCard.vue";
import BoxHelperCard from "./cards/BoxHelperCard.vue";
import FishHelperCard from "./cards/FishHelperCard.vue";
import RecruitHelperCard from "./cards/RecruitHelperCard.vue";
import StarUpgradeCard from "./cards/StarUpgradeCard.vue";
import HangUpStatusCard from "./cards/HangUpStatusCard.vue";
import MonthlyTasksCard from "./cards/MonthlyTasksCard.vue";
import StudyChallengeCard from "./cards/StudyChallengeCard.vue";
import SkinChallengeCard from "./cards/SkinChallengeCard.vue";
import ClubWarrank from "./Club/ClubWarrank.vue";
import ClubWarrankV2 from "./Club/ClubWarrankV2.vue";
import ClubMonthBattleRecords from "./Club/ClubMonthBattleRecords.vue";
import ClubBattleRecords from "./Club/ClubBattleRecords.vue";
import PeachBattleRecords from "./Club/PeachBattleRecords.vue";
import TopRankList from "./cards/TopRankListPageCard.vue";
import TopClubList from "./cards/TopClubListPageCard.vue";
import GreatRouteRankList from "./Club/GreatRouteRankListPageCard.vue";
import GoldClubList from "./cards/GoldRankListPageCard.vue";
import FightPvp from "./cards/FightPvp.vue";
import FightHelperCard from "./cards/FightHelperCard.vue";
import DreamHelperCard from "./cards/DreamHelperCard.vue";
import HeroUpgradeCard from "./cards/HeroUpgradeCard.vue";
import ConsumptionProgressCard from "./cards/ConsumptionProgressCard.vue";
import RefineHelperCard from "./cards/RefineHelperCard.vue";
import TowerStatus from "./Tower/TowerStatus.vue";
import WeirdTowerStatus from "./Tower/WeirdTowerStatus.vue";
import BossTower from "./Tower/BossTower.vue";
import PeachInfo from "./Club/PeachInfo.vue";
import PeachInfoV2 from "./Club/PeachInfoV2.vue";
import ServerRankList from "./cards/ServerRankListPageCard.vue";
import LegionWarMap from "./Club/LegionWarMap.vue";
import LegionWarStatistics from "./Club/LegionWarStatistics.vue";
import Unlimitedlineup from "./cards/Unlimitedlineup.vue";
import CampChallenge from "./Club/CampChallenge.vue";
import ApexChallenge from "./Apex/ApexChallenge.vue";

const tokenStore = useTokenStore();
const message = useMessage();

const legionMatch = ref({
  isRegistered: false,
});

// 响应式数据
const showIdentity = ref(false);
const activeSection = ref("daily");
const saltFieldSubTab = ref("warrank");
const peachSubTab = ref("peach");
const rankSubTab = ref("serverrank");

// 盐场匹配信息详情 / 蟠桃园信息 界面样式选择（style1=原有样式，style2=移植样式）
const warrankStyle = ref(
  localStorage.getItem("club_warrank_style") || "style1"
);
const peachStyle = ref(localStorage.getItem("peach_info_style") || "style1");

watch(warrankStyle, (newStyle) => {
  localStorage.setItem("club_warrank_style", newStyle);
});
watch(peachStyle, (newStyle) => {
  localStorage.setItem("peach_info_style", newStyle);
});

// 活动开放时间：仅周一到周三可参与
const isActivityOpen = computed(() => {
  const day = new Date().getDay(); // 0=周日,1=周一,...,6=周六
  return day >= 1 && day <= 3;
});

const bottleHelper = ref({
  isRunning: false,
  remainingTime: 0,
  stopTime: 0,
});

const hangUp = ref({
  isActive: false,
  remainingTime: 0,
  elapsedTime: 0,
  lastTime: 0,
  hangUpTime: 0,
  isExtending: false, // 加钟状态
  isClaiming: false, // 领取奖励状态
});

const legionSignin = ref({
  isSignedIn: false,
  clubName: "",
});

// 使用 tokenStore 中的答题状态（仍用于 badge 状态等场景，如果仅在子组件中使用也可移除）
const study = computed(() => tokenStore.gameData.studyStatus);

// 计算属性
const roleInfo = computed(() => {
  return tokenStore.gameData?.roleInfo || null;
});
const isShowTowerStatus = computed(() => {
  const tower = roleInfo.value?.role?.tower;
  const towerId = tower?.id;
  const floor = Math.floor(towerId / 10) + 1;
  if (floor > 450) {
    return false;
  }
  return true;
});

// WebSocket连接状态
const isConnected = computed(() => {
  if (!tokenStore.selectedToken) return false;
  const status = tokenStore.getWebSocketStatus(tokenStore.selectedToken.id);
  return status === "connected";
});

// 格式化时间 - 确保显示到秒
const formatTime = (seconds) => {
  // 确保传入值为数字，并向下取整到秒
  const totalSeconds = Math.floor(Number(seconds) || 0);

  if (totalSeconds <= 0) return "00:00:00";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

// 更新数据
const updateGameStatus = () => {
  if (!roleInfo.value) return;

  const role = roleInfo.value.role;

  // 更新盐罐机器人状态
  if (role.bottleHelpers) {
    const now = Date.now() / 1000;
    bottleHelper.value.stopTime = role.bottleHelpers.helperStopTime;
    bottleHelper.value.isRunning = role.bottleHelpers.helperStopTime > now;
    // 确保剩余时间为整数秒
    bottleHelper.value.remainingTime = Math.max(
      0,
      Math.floor(role.bottleHelpers.helperStopTime - now),
    );
    // 控制台精简，避免频繁刷屏
  }

  // 更新挂机状态
  if (role.hangUp) {
    const now = Date.now() / 1000;
    hangUp.value.lastTime = role.hangUp.lastTime;
    hangUp.value.hangUpTime = role.hangUp.hangUpTime;

    const elapsed = now - hangUp.value.lastTime;
    if (elapsed <= hangUp.value.hangUpTime) {
      // 确保剩余时间为整数秒
      hangUp.value.remainingTime = Math.floor(
        hangUp.value.hangUpTime - elapsed,
      );
      hangUp.value.isActive = true;
    } else {
      hangUp.value.remainingTime = 0;
      hangUp.value.isActive = false;
    }
    // 确保已挂机时间为整数秒
    hangUp.value.elapsedTime = Math.floor(
      hangUp.value.hangUpTime - hangUp.value.remainingTime,
    );
    // 控制台精简
  }

  // 更新俱乐部排位状态
  if (role.statistics) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime() / 1000;

    legionMatch.value.isRegistered =
      Number(role.statistics["last:legion:match:sign:up:time"]) >
      todayTimestamp;
  }

  // 更新俱乐部签到状态
  if (role.statisticsTime) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime() / 1000;

    legionSignin.value.isSignedIn =
      role.statisticsTime["legion:sign:in"] > todayTimestamp;
  }
};

// 定时器更新
let timer = null;
const startTimer = () => {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    // 更新盐罐机器人剩余时间
    if (bottleHelper.value.isRunning && bottleHelper.value.remainingTime > 0) {
      bottleHelper.value.remainingTime = Math.max(
        0,
        bottleHelper.value.remainingTime - 1,
      );
      if (bottleHelper.value.remainingTime <= 0) {
        bottleHelper.value.isRunning = false;
      }
    }

    // 更新挂机剩余时间
    if (hangUp.value.isActive && hangUp.value.remainingTime > 0) {
      hangUp.value.remainingTime = Math.max(0, hangUp.value.remainingTime - 1);
      hangUp.value.elapsedTime = hangUp.value.elapsedTime + 1;
      if (hangUp.value.remainingTime <= 0) {
        hangUp.value.isActive = false;
      }
    }
  }, 1000);
};

// 盐罐机器人操作
const handleBottleHelper = () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  const tokenId = tokenStore.selectedToken.id;

  // 停止后重启
  tokenStore.sendMessage(tokenId, "bottlehelper_stop");
  setTimeout(() => {
    tokenStore.sendMessage(tokenId, "bottlehelper_start");
    tokenStore.sendMessage(tokenId, "role_getroleinfo");
  }, 500);

  message.info(
    bottleHelper.value.isRunning ? "重启盐罐机器人" : "启动盐罐机器人",
  );
};

// 挂机操作 - 参考HangUpStatus逻辑优化
const extendHangUp = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  const tokenId = tokenStore.selectedToken.id;

  try {
    // 降噪
    hangUp.value.isExtending = true;
    message.info("正在加钟...");

    // 按照参考代码的逻辑，发送4次分享回调请求
    const promises = [];
    for (let i = 0; i < 4; i++) {
      const promise = new Promise((resolve) => {
        setTimeout(() => {
          // 降噪
          const result = tokenStore.sendMessage(
            tokenId,
            "system_mysharecallback",
            {
              isSkipShareCard: true,
              type: 2,
            },
          );
          resolve(result);
        }, i * 300); // 增加间隔时间确保稳定性
      });
      promises.push(promise);
    }

    // 等待所有请求完成
    await Promise.all(promises);

    // 降噪

    // 延迟获取最新角色信息
    setTimeout(() => {
      // 降噪
      tokenStore.sendMessage(tokenId, "role_getroleinfo");
    }, 1500);

    // 延迟显示完成消息和重置状态
    setTimeout(() => {
      message.success("加钟操作已完成，请查看挂机剩余时间");
      hangUp.value.isExtending = false;
    }, 2500);
  } catch (error) {
    console.error("🕐 加钟操作失败:", error);
    message.error("加钟操作失败: " + (error.message || "未知错误"));
    hangUp.value.isExtending = false;
  }
};

const claimHangUpReward = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  const tokenId = tokenStore.selectedToken.id;

  try {
    // 降噪
    hangUp.value.isClaiming = true;
    message.info("正在领取挂机奖励...");

    // 参考HangUpStatus的S函数逻辑
    // 1. 发送初始分享回调
    tokenStore.sendMessage(tokenId, "system_mysharecallback");

    // 2. 领取挂机奖励
    setTimeout(() => {
      tokenStore.sendMessage(tokenId, "system_claimhangupreward");
    }, 200);

    // 3. 发送跳过分享卡片的回调
    setTimeout(() => {
      tokenStore.sendMessage(tokenId, "system_mysharecallback", {
        isSkipShareCard: true,
        type: 2,
      });
    }, 400);

    // 4. 获取最新角色信息
    setTimeout(() => {
      tokenStore.sendMessage(tokenId, "role_getroleinfo");
    }, 600);

    // 5. 显示完成消息并重置状态
    setTimeout(() => {
      message.success("挂机奖励领取完成");
      hangUp.value.isClaiming = false;
    }, 1200);

    // 降噪
  } catch (error) {
    console.error("🎁 领取挂机奖励失败:", error);
    message.error("领取挂机奖励失败: " + (error.message || "未知错误"));
    hangUp.value.isClaiming = false;
  }
};

// 功能开关：暂时隐藏俱乐部排位与旧签到卡片
const ENABLE_LEGION_MATCH = false;
const ENABLE_LEGION_SIGNIN_CARD = false;
const ENABLE_TOOLS_TAB = true; // 工具分区开关

// 盐场战绩入口已移动至俱乐部信息模块

// 学习答题逻辑已移动到 StudyChallengeCard 组件

// 监听角色信息变化
watch(
  roleInfo,
  (newValue) => {
    if (newValue) {
      updateGameStatus();
    }
  },
  { deep: true, immediate: true },
);

// 监听 WebSocket 连接状态（俱乐部信息）
const hasFetchedLegionOnce = ref(false);
watch(
  () =>
    tokenStore.selectedToken
      ? tokenStore.getWebSocketStatus(tokenStore.selectedToken.id)
      : "disconnected",
  (status) => {
    if (status === "connected") {
      if (!hasFetchedLegionOnce.value && tokenStore.selectedToken) {
        hasFetchedLegionOnce.value = true;
        const tokenId = tokenStore.selectedToken.id;
        tokenStore.sendMessage(tokenId, "legion_getinfo");
      }
    }
  },
);

// 战绩加载逻辑现由俱乐部信息模块负责

// 生命周期
onMounted(() => {
  updateGameStatus();
  startTimer();
  // 获取俱乐部信息
  if (
    tokenStore.selectedToken &&
    tokenStore.getWebSocketStatus(tokenStore.selectedToken.id) === "connected"
  ) {
    const tokenId = tokenStore.selectedToken.id;
    tokenStore.sendMessage(tokenId, "legion_getinfo");
    hasFetchedLegionOnce.value = true;
  }
});

// 组件卸载时清理定时器
onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
  }
});
</script>

<style scoped lang="scss">
.game-status-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);

  // 在大屏幕上限制最大列数以确保卡片有足够宽度
  @media (min-width: 1400px) {
    grid-template-columns: repeat(3, 1fr);
    max-width: 1400px;
    margin: 0 auto;
  }

  // 在中等屏幕上确保有足够空间
  @media (max-width: 1200px) {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  // 在较小屏幕上使用单列布局
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }

  @media (max-width: 768px) {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--spacing-sm);
    gap: var(--spacing-md);
  }
}

.full-grid {
  grid-template-columns: repeat(1, 1fr);
}

.game-status-container.full-page-mode {
  max-width: 100% !important;
  grid-template-columns: 1fr;
  padding: var(--spacing-sm);

  @media (min-width: 1400px) {
    max-width: 100% !important;
  }
}

.game-status-container.club-mode {
  @media (min-width: 1400px) {
    grid-template-columns: repeat(2, 1fr);
    max-width: 100% !important;
  }
}

.section-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px var(--spacing-sm);
}

.identity-toggle {
  padding: 6px 12px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  cursor: pointer;
}

.section-tabs {
  margin: 0 var(--spacing-sm) var(--spacing-md) var(--spacing-sm);
  grid-column: 1 / -1;
  border-bottom: 1px solid var(--border-light);
  overflow: auto;
}

.section-tabs :deep(.n-tabs-pane-wrapper) {
  display: none;
}

.warrank-full-container {
  grid-column: 1 / -1;
  width: 100%;
  height: calc(100vh - 200px);
  min-height: 600px;
  overflow-x: hidden;
  overflow-y: auto;

  @media (max-width: 768px) {
    height: auto;
    min-height: 500px;
  }
}

/* 样式二（移植版）容器尺寸，不影响样式一 */
.warrank-full-container.style2-container {
  position: relative;
  z-index: 1;
  height: calc(100vh - 180px);
  min-height: 700px;

  @media (max-width: 768px) {
    height: calc(100vh - 180px);
    min-height: 500px;
  }
}

.salt-field-group,
.peach-group,
.rank-group {
  grid-column: 1 / -1;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.monthly-tasks .description.muted {
  color: var(--text-tertiary);
  margin-top: var(--spacing-sm);
}

.monthly-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--spacing-xs);
  font-size: var(--font-size-sm);
}

.status-dot {
  &.completed {
    background: var(--success-color);
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
  }
}

.energy-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.card-content {
  .time-display {
    font-size: 1.5rem;
    /* text-2xl */
    font-weight: 700;
    /* font-bold */
    color: var(--text-primary);
    text-align: center;
    margin-bottom: var(--spacing-md);
    font-family:
      "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "Consolas", monospace;
    letter-spacing: 0.1em;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    background: var(--bg-tertiary);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-light);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.06);
    transition: all 0.2s ease-in-out;

    &:hover {
      transform: translateY(-1px);
      box-shadow:
        0 4px 6px rgba(0, 0, 0, 0.1),
        0 2px 4px rgba(0, 0, 0, 0.06);
    }
  }

  .description {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    margin-bottom: var(--spacing-lg);
  }

  .club-name {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-lg);

    strong {
      color: var(--text-primary);
      font-weight: var(--font-weight-medium);
    }
  }

  .tower-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-lg);

    .label {
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
    }

    .tower-level {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      color: var(--text-primary);
    }
  }
}

.action-row {
  display: flex;
  gap: var(--spacing-sm);

  .action-button {
    flex: 1;
  }
}

.loading-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
}

.loading-icon {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

// 响应式设计
@media (max-width: 768px) {
  .game-status-container {
    grid-template-columns: 1fr;
    padding: var(--spacing-sm);
  }

  .status-card {
    padding: var(--spacing-md);
  }

  .card-header {
    flex-wrap: wrap;
    gap: var(--spacing-sm);

    .status-info {
      flex: 1;
      min-width: 120px;
    }

    .status-badge {
      margin-left: auto;
    }
  }
}

/* ==================== 盐场 / 蟠桃园 / 排行榜 手机端防溢出 ====================
   原设计为桌面 dashboard：固定高度 + overflow:hidden 的容器。
   在手机端 grid 项默认 min-width:auto 会被内容撑开，导致整页横向滚动。
   改为：分组容器允许收缩，子导航/内容容器内允许横向滚动。 */
@media (max-width: 768px) {
  /* 各分组容器允许收缩，避免被 grid 撑出视口
     营地挑战 / 逐鹿盐山同样需要，否则内部宽内容会把整页撑出横向滚动条 */
  .salt-field-group,
  .peach-group,
  .rank-group,
  .camp-challenge-group,
  .apex-challenge-group {
    min-width: 0;
  }

  /* 子导航（segment tabs）允许横向滚动。
     注意：内联 style 已设置 display:flex justify-content:center，
     手机端改为 flex-start 让标签从左开始排，方便横向看。 */
  .salt-field-group .sub-nav,
  .peach-group .sub-nav,
  .rank-group .sub-nav {
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    justify-content: flex-start !important;
    flex-wrap: nowrap;
    scrollbar-width: none;
  }

  .salt-field-group .sub-nav::-webkit-scrollbar,
  .peach-group .sub-nav::-webkit-scrollbar,
  .rank-group .sub-nav::-webkit-scrollbar {
    display: none;
  }

  /* n-tabs 内部保证不换行，tab 缩字号（naive-ui 的 tab 元素类名是 .n-tabs-tab） */
  .salt-field-group :deep(.n-tabs),
  .peach-group :deep(.n-tabs),
  .rank-group :deep(.n-tabs) {
    white-space: nowrap;
    min-width: max-content;
  }

  .salt-field-group :deep(.n-tabs-tab),
  .peach-group :deep(.n-tabs-tab),
  .rank-group :deep(.n-tabs-tab) {
    font-size: 13px;
    padding: 6px 12px;
    flex-shrink: 0;
  }

  /* 样式切换栏（样式一/样式二）也允许横向滚动 */
  .style-switch-bar {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    justify-content: flex-start !important;
  }

  /* 内容容器：去掉固定高度 + overflow:hidden，
     改为容器内可横向滚动 + 自适应高度，避免整页溢出 */
  .warrank-full-container {
    height: auto !important;
    min-height: 400px !important;
    max-height: calc(100vh - 120px);
    overflow-x: auto !important;
    overflow-y: visible !important;
  }

  /* 样式二容器去掉更高的最小高度限制 */
  .warrank-full-container.style2-container {
    min-height: 400px !important;
    height: auto !important;
  }

  /* ---- 操作区 / 结果区分离 ----
     有独立结果容器的组件（盐场匹配详情、三个战绩组件）：
     根容器保持手机宽度，操作按钮区（导出/样式/刷新/日期等）按手机布局显示；
     仅"结果展示区"按桌面 1280px 宽度渲染，在结果区内部横向滚动查看。
     其余无独立结果容器的组件整体按桌面宽度渲染（外层容器横滑）。 */
  .warrank-full-container > * {
    width: 1280px !important;
    min-width: 1280px !important;
    max-width: none !important;
    box-sizing: border-box;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* 有独立结果容器的组件：根恢复手机宽度 */
  .warrank-full-container :deep(.club-warrank-container),
  .warrank-full-container :deep(.records-container),
  .warrank-full-container :deep(.club-month-battle-records-container),
  /* 盐场地图 / 盐场战况 也是 `.warrank-full-container` 的直接子元素，但根类名
     原先不在列表里 → 被上面 `> *` 的 1280px 顶宽，连「暂未开放」占位都 1280px 宽、
     手机上得横向拖动。它们的内部内容本来就走 100% / 百分比，放回手机宽度即可。 */
  .warrank-full-container :deep(.legion-war-statistics-container),
  .warrank-full-container :deep(.legion-war-map-container) {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* 结果区 = 横向滚动容器（操作区在结果区外，保持手机宽度可见） */
  .warrank-full-container :deep(.table-content),
  .warrank-full-container :deep(.records-list),
  .warrank-full-container :deep(.records-wrapper) {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: none !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    -webkit-overflow-scrolling: touch;
  }

  /* 结果区内容按桌面 1280px 宽度渲染（与导出图片一致） */
  .warrank-full-container :deep(.table-content > *),
  .warrank-full-container :deep(.records-list > *),
  .warrank-full-container :deep(.records-wrapper > *) {
    width: 1280px !important;
    min-width: 1280px !important;
    max-width: none !important;
    box-sizing: border-box;
  }

  /* 操作区（在结果区外）允许换行，适配手机宽度 */
  .warrank-full-container :deep(.function-section),
  .warrank-full-container :deep(.stats-section),
  .warrank-full-container :deep(.header-actions),
  .warrank-full-container :deep(.toolbar),
  .warrank-full-container :deep(.filter-section) {
    flex-wrap: wrap;
    max-width: 100%;
    min-width: 0;
  }

  /* ---- 本周盐场战绩 / 本月盐场战绩 / 蟠桃园战绩：原生 <table> 桌面宽度 ---- */
  /* style2 包裹层：hidden → auto，解除表格被裁剪 */
  .warrank-full-container :deep(.style2-table-wrapper) {
    overflow-x: auto !important;
    overflow-y: visible !important;
    -webkit-overflow-scrolling: touch;
  }

  /* 原生表格：宽度跟随内容（单元格不换行时自然撑开），超出交给结果区横滑 */
  .warrank-full-container :deep(table.style1-table),
  .warrank-full-container :deep(table.style2-table),
  .warrank-full-container :deep(table.members-table) {
    width: max-content;
    min-width: 100%;
  }
}

/* ============================================================================
 * [本地扩展 · 盐场大表移动端卡片视图]
 * ----------------------------------------------------------------------------
 * 手机上（<=768px）把盐场各组件的宽表换成卡片列表：
 *   · ClubWarrank            盐场匹配·样式一（11 列 div 伪表格，约 1305px）
 *   · ClubWarrankV2          盐场匹配·样式二（9 列 n-data-table，scroll-x 1380）
 *   · ClubBattleRecords      本周盐场战绩（原生 table ×2 个样式分支，各 7 列）
 *   · ClubMonthBattleRecords 本月盐场战绩（原生 table ×3 个样式分支）
 *   · LegionWarStatistics    盐场战况（3 张 n-data-table，10/9/10 列）
 * 各组件模板里并列插入 .salt-cards 卡片块（纯插入、0 行删除），本段只负责
 * 「窄屏显示卡片 + 隐藏宽表 + 卡片外观」。所有选择器都带 .salt-field-group
 * 前缀，不会波及其他分组（蟠桃园 / 排行榜 / 营地挑战等）。
 *
 * 与导出图片的关系：.salt-cards 默认 display:none，只在 <=768px 显示；而导出
 * 长图按 >=1280px 桌面宽度渲染（html2canvas 的 windowWidth），媒体查询不命中，
 * 所以导出图里不会出现卡片，仍是原来的表格版式。
 *
 * 样式一/样式二 那个开关只切换导出图片的版式（ClubWarrank ↔ ClubWarrankV2），
 * 卡片块放在样式分支之外共用一套，窄屏下不受它影响。
 * ========================================================================== */

/* 桌面隐藏（同时保证导出长图里不出现卡片） */
.salt-field-group :deep(.salt-cards) {
  display: none;
}

/* 「样式一/样式二」旁边的说明文字 */
.style-switch-hint {
  margin-left: 8px;
  align-self: center;
  font-size: 12px;
  line-height: 1.4;
  color: #94a3b8;
  white-space: nowrap;
}

@media (max-width: 768px) {
  /* ① 窄屏隐藏各张宽表（连外层容器一起藏，免得留下空白或横向滚动条） */
  .salt-field-group :deep(.warrank-full-container .table-container),
  .salt-field-group :deep(.warrank-full-container .members-table-wrapper),
  .salt-field-group :deep(.warrank-full-container .style1-table-container),
  .salt-field-group :deep(.warrank-full-container .style2-table-wrapper),
  .salt-field-group :deep(.warrank-full-container .n-data-table) {
    display: none !important;
  }

  /* ② 结果区整体改回手机宽度。
        原来是「结果区强制 1280px + 外层横滑」，宽表已换成卡片，再留着
        1280px 会把卡片也撑成 1280px 宽、手机上又得横滑。 */
  .salt-field-group :deep(.warrank-full-container .table-content > *),
  .salt-field-group :deep(.warrank-full-container .records-list > *),
  .salt-field-group :deep(.warrank-full-container .records-wrapper > *) {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box;
  }

  /* ③ 卡片列表容器 */
  .salt-field-group :deep(.salt-cards) {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* 联盟分组标题行 / 取数时间页脚行（对应宽表里的合并行） */
  .salt-field-group :deep(.salt-cards__group) {
    padding: 6px 10px;
    border-radius: 8px;
    background: #eef2f7;
    color: #334155;
    font-size: 12px;
    font-weight: 700;
  }
  .salt-field-group :deep(.salt-cards__footer) {
    padding: 4px 2px;
    color: #94a3b8;
    font-size: 12px;
    text-align: center;
  }

  /* ④ 卡片本体 */
  .salt-field-group :deep(.salt-card) {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--n-border-color, #e2e8f0);
    border-radius: 10px;
    background: var(--n-card-color, #ffffff);
    box-sizing: border-box;
  }
  .salt-field-group :deep(.salt-card__head) {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
  }
  .salt-field-group :deep(.salt-card__rank) {
    flex: 0 0 auto;
    min-width: 26px;
    height: 22px;
    padding: 0 6px;
    border-radius: 6px;
    background: #eef2f7;
    color: #475569;
    font-size: 12px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .salt-field-group :deep(.salt-card__avatar) {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid #e5e7eb;
  }
  .salt-field-group :deep(.salt-card__avatar--ph) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%);
  }
  .salt-field-group :deep(.salt-card__name) {
    min-width: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--n-text-color, #1f2937);
    overflow-wrap: anywhere;
  }
  .salt-field-group :deep(.salt-card__badge) {
    margin-left: auto;
    flex: 0 0 auto;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 700;
    color: #1677ff;
    background: #e6f0ff;
    white-space: nowrap;
  }

  /* ⑤ 字段网格：两列 */
  .salt-field-group :deep(.salt-card__grid) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
  }
  .salt-field-group :deep(.salt-card__cell) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    min-width: 0;
  }
  .salt-field-group :deep(.salt-card__label) {
    font-size: 11px;
    line-height: 1.3;
    color: #94a3b8;
  }
  .salt-field-group :deep(.salt-card__value) {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
    overflow-wrap: anywhere;
  }

  /* ⑥ 整行字段（联盟 / 公告 / 俱乐部） */
  .salt-field-group :deep(.salt-card__line) {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }
  .salt-field-group :deep(.salt-card__line .salt-card__label) {
    flex: 0 0 auto;
    white-space: nowrap;
  }
  .salt-field-group :deep(.salt-card__line .salt-card__value) {
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
    text-align: right;
  }

  /* ⑦ 数值配色，对齐宽表里的行内色值 */
  .salt-field-group :deep(.salt-card__value.is-kill) { color: #ff4d4f; font-weight: 700; }
  .salt-field-group :deep(.salt-card__value.is-death) { color: #94a3b8; }
  .salt-field-group :deep(.salt-card__value.is-occupy) { color: #f59e0b; }
  .salt-field-group :deep(.salt-card__value.is-revive) { color: #10b981; }
  .salt-field-group :deep(.salt-card__value.is-power) { color: #fa8c16; }
  .salt-field-group :deep(.salt-card__value.is-red) { color: #ff4d4f; font-weight: 700; }
  .salt-field-group :deep(.salt-card__value.is-score) { color: #6366f1; font-weight: 700; }
  .salt-field-group :deep(.salt-card__value.is-muted) { color: #94a3b8; }

  /* ⑧ 前三车头 */
  .salt-field-group :deep(.salt-card__heros) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .salt-field-group :deep(.salt-card__hero) {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 5px 6px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
  }
  .salt-field-group :deep(.salt-card__hero-avatar) {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid #e5e7eb;
  }
  .salt-field-group :deep(.salt-card__hero-avatar--ph) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%);
  }
  .salt-field-group :deep(.salt-card__hero-name) {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    color: #1f2937;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .salt-field-group :deep(.salt-card__hero-beast) {
    flex: 0 0 auto;
    padding: 1px 4px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
    white-space: nowrap;
  }
  .salt-field-group :deep(.salt-card__hero-meta) {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #6b7280;
    white-space: nowrap;
  }
  .salt-field-group :deep(.salt-card__hero-lineup) {
    padding: 0 4px;
    border-radius: 6px;
    font-style: normal;
    font-size: 10px;
    font-weight: 600;
  }
  .salt-field-group :deep(.salt-card__hero-red) {
    color: #ef4444;
    font-weight: 700;
  }

  /* ⑨ 编辑模式（手改排名 / 联盟）的控件宽度 */
  .salt-field-group :deep(.salt-card__rank-input) {
    flex: 0 0 auto;
    width: 72px;
  }
  .salt-field-group :deep(.salt-card__alliance-select) {
    flex: 0 0 auto;
    width: 110px;
  }

  /* ⑩ 本月战绩：默认样式是「日期为列」，卡片里改成逐日展开 */
  .salt-field-group :deep(.salt-card__dates) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding-top: 6px;
    border-top: 1px dashed var(--n-border-color, #e2e8f0);
  }
  .salt-field-group :deep(.salt-card__date-row) {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }
  .salt-field-group :deep(.salt-card__date-label) {
    flex: 0 0 auto;
    min-width: 44px;
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
  }
  .salt-field-group :deep(.salt-card__date-value) {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 11px;
    color: #475569;
    overflow-wrap: anywhere;
  }

  /* ⑫ 手机端「阵营分类」= 顶部提示条 + 联盟标签栏（样式一 / 样式二 统一）
        只覆盖 <=768px：桌面各自保持原样；导出长图按 >=1280px 渲染，媒体查询
        不命中，所以导出图里仍是各样式原来的桌面版式，不受本段影响。
        配色 = 每个联盟一个辨识色，与样式二的表格行底色同一套；
        改色只需改最下面那 7 行，四个变量的含义：
          --tab-solid 选中态实心色（底色 + 描边）
          --tab-dark  未选中态文字色（也是计数徽标文字色）
          --tab-tint  未选中态底色（也是计数徽标底色）
          --tab-line  未选中态描边色 */
  .salt-field-group :deep(.announcement-section) {
    background: #f8fafc !important;
    border: 1px solid #e2e8f0 !important;
    border-left: 3px solid #1677ff !important;
    border-radius: 8px !important;
    padding: 8px 10px !important;
    margin-bottom: 8px !important;
    box-shadow: none !important;
    overflow: visible !important;
  }

  .salt-field-group :deep(.announcement-section .announcement-content) {
    justify-content: flex-start !important;
    align-items: center !important;
    gap: 6px !important;
    flex-wrap: wrap !important;
  }

  .salt-field-group
    :deep(.announcement-section .announcement-content .announcement-text) {
    color: #334155 !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    line-height: 1.5 !important;
    text-align: left !important;
    max-width: none !important;
  }

  .salt-field-group
    :deep(.announcement-section .announcement-content .announcement-fetch-time) {
    color: #94a3b8 !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    line-height: 1.5 !important;
  }

  /* 联盟标签栏：网格自动换行（每行 3~4 个、全部可见），不再横向滚动 */
  .salt-field-group :deep(.alliance-tabs-section) {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)) !important;
    gap: 6px !important;
    background: transparent !important;
    padding: 0 !important;
    margin-bottom: 10px !important;
    overflow: visible !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box;
  }

  .salt-field-group :deep(.alliance-tab) {
    flex: none !important;
    min-width: 0 !important;
    width: auto !important;
    height: auto !important;
    padding: 7px 6px !important;
    border-radius: 8px !important;
    gap: 4px !important;
    font-size: 12px !important;
    line-height: 1.2 !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
    box-shadow: none !important;
    transform: none !important;
    background: var(--tab-tint, #f8fafc) !important;
    border: 1px solid var(--tab-line, #e2e8f0) !important;
    color: var(--tab-dark, #475569) !important;

    .tab-text {
      font-size: 12px !important;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tab-count {
      flex: 0 0 auto;
      font-size: 10px !important;
      line-height: 1 !important;
      padding: 2px 5px !important;
      border-radius: 9px !important;
      font-weight: 700 !important;
      background: var(--tab-tint, #f1f5f9) !important;
      color: var(--tab-dark, #475569) !important;
    }

    &.active {
      background: var(--tab-solid, #1677ff) !important;
      border-color: var(--tab-solid, #1677ff) !important;
      color: #ffffff !important;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12) !important;

      .tab-count {
        background: rgba(255, 255, 255, 0.3) !important;
        color: #ffffff !important;
      }
    }
  }

  /* 各联盟配色（改色只改这 7 行）。选择器同时覆盖三套既有类名：
       样式一 表格行/卡片 = alliance-large / alliance-dream / …
       样式二 表格标签   = alliance-tag-…
       样式二 标签栏     = alliance-…
     这样「联盟色 chip」（见 ⑬）无论带哪一套类名都能取到色。 */
  .salt-field-group :deep(.alliance-large),
  .salt-field-group :deep(.alliance-tag-dalianmeng),
  .salt-field-group :deep(.alliance-dalianmeng) { --tab-solid: #52c41a; --tab-dark: #237804; --tab-tint: #f2fbe9; --tab-line: rgba(82, 196, 26, 0.32); } /* 大联盟 · 绿 */
  .salt-field-group :deep(.alliance-dream),
  .salt-field-group :deep(.alliance-tag-mengmeng),
  .salt-field-group :deep(.alliance-mengmeng) { --tab-solid: #faad14; --tab-dark: #ad6800; --tab-tint: #fff8e6; --tab-line: rgba(250, 173, 20, 0.34); } /* 梦盟 · 橙 */
  .salt-field-group :deep(.alliance-xin-justice),
  .salt-field-group :deep(.alliance-tag-zhengyi),
  .salt-field-group :deep(.alliance-zhengyi) { --tab-solid: #f5222d; --tab-dark: #cf1322; --tab-tint: #fff1f0; --tab-line: rgba(245, 34, 45, 0.30); } /* 正义联盟 · 红 */
  .salt-field-group :deep(.alliance-dragon),
  .salt-field-group :deep(.alliance-tag-longmeng),
  .salt-field-group :deep(.alliance-longmeng) { --tab-solid: #722ed1; --tab-dark: #531dab; --tab-tint: #f6f0ff; --tab-line: rgba(114, 46, 209, 0.30); } /* 龙盟 · 紫 */
  .salt-field-group :deep(.alliance-xi),
  .salt-field-group :deep(.alliance-tag-ximeng),
  .salt-field-group :deep(.alliance-ximeng) { --tab-solid: #13c2c2; --tab-dark: #08979c; --tab-tint: #e6fbfb; --tab-line: rgba(19, 194, 194, 0.32); } /* 曦盟 · 青 */
  .salt-field-group :deep(.alliance-unknown),
  .salt-field-group :deep(.alliance-other),
  .salt-field-group :deep(.alliance-tag-unknown),
  .salt-field-group :deep(.alliance-tag-other) { --tab-solid: #94a3b8; --tab-dark: #475569; --tab-tint: #f4f6f9; --tab-line: #e2e8f0; } /* 未知联盟 / 其它 · 灰 */
  .salt-field-group :deep(.alliance-all) { --tab-solid: #1677ff; --tab-dark: #0958d9; --tab-tint: #eef5ff; --tab-line: rgba(22, 119, 255, 0.30); } /* 全部 · 蓝 */
  /* ⑬ 名字行重排（只作用于带 --inline 的名字行）：服务器 id 并入名字行、
        联盟改成靠右的色 chip、公告移到名字下方单独一行。
        其他卡片（本周/本月战绩、盐场战况）不带 --inline，名字仍可换行。 */
  .salt-field-group :deep(.salt-card__head--inline) {
    flex-wrap: nowrap;
  }
  /* 名字占剩余空间，过长省略 → 服务器 id / 联盟 chip 始终留在同一行 */
  .salt-field-group :deep(.salt-card__head--inline .salt-card__name) {
    flex: 0 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* 「本俱乐部」徽标不再独占右侧（右侧让给联盟 chip） */
  .salt-field-group :deep(.salt-card__head--inline .salt-card__badge) {
    margin-left: 0;
  }
  /* 服务器 id：跟在名字后面的浅灰小块 */
  .salt-field-group :deep(.salt-card__server) {
    flex: 0 0 auto;
    padding: 1px 6px;
    border-radius: 6px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.6;
    white-space: nowrap;
  }
  /* 联盟色 chip：颜色取各联盟的 --tab-* 变量（色板见 ⑫ 段） */
  .salt-field-group :deep(.salt-card .salt-card__alliance-chip) {
    margin-left: auto;
    flex: 0 0 auto;
    padding: 1px 8px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.6;
    white-space: nowrap;
    background: var(--tab-tint, #f4f6f9) !important;
    color: var(--tab-dark, #475569) !important;
    border: 1px solid var(--tab-line, #e2e8f0) !important;
  }
  /* 编辑模式下联盟改成下拉框，同样靠右 */
  .salt-field-group :deep(.salt-card .salt-card__alliance-select) {
    flex: 0 0 auto;
    margin-left: auto;
  }
  /* ⑭ 收尾细节：公告整行左对齐；卡片描边改用俱乐部（联盟）色 */
  .salt-field-group :deep(.salt-card__line--announce) {
    justify-content: flex-start;
  }
  .salt-field-group :deep(.salt-card__line--announce .salt-card__value) {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
  }
  /* 描边色取联盟标签色（色板见 ⑫ 段）；未带联盟类的卡片回落到原边框色 */
  .salt-field-group :deep(.salt-card) {
    border-color: var(--tab-solid, var(--n-border-color, #e2e8f0));
  }
  /* 卡片字段全部挤到同一行、等宽平分 —— 盐场匹配卡片（红淬 | 战力 | 等级 | 积分）
        与 本周 / 本月战绩条目（击杀 | 死亡 | 攻城 | 复活丹 | K/D）共用。
        grid-auto-flow: column + grid-auto-columns —— 列数自动跟随字段数，
        所以被 v-if 隐藏的字段（盐场「积分」、月报 default 样式的「攻城」）
        不会留下空列；需先把 base 的 grid-template-columns 清成 none，
        否则前两项会先占掉 base 的那两列。
        只作用于带 --1row 的网格 —— .salt-card__grid 是多张卡片共用的类。 */
  .salt-field-group :deep(.salt-card__grid--1row) {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
  }
  /* 盐场战况 · 4 列字段网格 —— 战队 / 个人 / 全部 三个视图共用：
        战队战况（8 字段，排 4 / 4）：积分 | 击杀数 | 免费复活 | 花费总丹 ／
                                      四圣 | 人数 | 红数 | 战力
        个人 · 全部战况（7 字段，排 4 / 3）：积分 | 击杀数 | 死亡次数 | K/D ／
                                            已复活次数 | 复活丹 | 刨地
        ⚠️ 战队战况原来写的是 3 / 3 / 2（6 列栅格 + nth-child 跨列）：第三行每格宽度是
        上面两行的 1.5 倍，视觉不均，已废弃，不要再改回去。
        只作用于带 --lg 的网格（.salt-card__grid 是多张卡片共用的类）。 */
  .salt-field-group :deep(.salt-card__grid--lg) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  /* ⑮ 盐场战况 · 全部战况：俱乐部名并入名字行、靠右
        （原来在名字下方单独一行 .salt-card__line，用户要求跟名字同行）。
        只作用于带 --club 修饰类的名字行 —— 同 ⑬ 的 --inline，避免影响
        本周/本月战绩、盐场匹配、个人战况那些共用 .salt-card__head 的卡片。 */
  .salt-field-group :deep(.salt-card__head--club) {
    flex-wrap: nowrap;
  }
  /* 名字吃剩余空间、过长省略 → 俱乐部名始终留在同一行右侧 */
  .salt-field-group :deep(.salt-card__head--club .salt-card__name) {
    flex: 0 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* 俱乐部名：右对齐浅灰小块（配色对齐 .salt-card__rank / .salt-card__server） */
  .salt-field-group :deep(.salt-card .salt-card__club) {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 50%;
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 6px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* ============================================================================
 * [本地扩展 · 导出长图期间临时恢复桌面版式]
 * ----------------------------------------------------------------------------
 * 起因：<=768px 时各宽表被 display:none 换成卡片（见 ① 与 ⑫），而导出函数是在
 *      **真机 DOM** 上量 scrollWidth / scrollHeight 的 —— 量到的就是手机版式的
 *      尺寸，于是长图会导出成卡片版式、或被截断成一条。
 *      媒体查询按「视口」判定，给元素写死桌面宽度并不会让 @media 失效，所以只能
 *      在导出期间临时把桌面版式「打开」——用非媒体查询的标记类实现：
 *        导出前 exportDom.classList.add("export-desktop-layout")
 *        导出后（finally）移除 → 界面立刻回到手机端卡片视图
 * 样式二（ClubWarrankV2）本来就用它自己的 .salt-image-exporting 做同类事情，
 * 这里一并识别它的「恢复宽表 / 隐藏卡片」，不动它的导出逻辑和 1380 宽度。
 * ========================================================================== */

/* A. 结果区固定桌面宽度（样式二有自己的 1380，不干预） */
.salt-field-group
  :deep(.warrank-full-container .export-desktop-layout:not(.salt-image-exporting)) {
  width: 1280px !important;
  min-width: 1280px !important;
  max-width: none !important;
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}

/* B. 隐藏卡片（导出图里只保留宽表） */
.salt-field-group :deep(.export-desktop-layout .salt-cards),
.salt-field-group :deep(.salt-image-exporting .salt-cards) {
  display: none !important;
}

/* C. 恢复宽表（revert = 回到浏览器默认 display，div → block、table → table） */
.salt-field-group :deep(.export-desktop-layout .table-container),
.salt-field-group :deep(.export-desktop-layout .members-table-wrapper),
.salt-field-group :deep(.export-desktop-layout .style1-table-container),
.salt-field-group :deep(.export-desktop-layout .style2-table-wrapper),
.salt-field-group :deep(.export-desktop-layout .n-data-table),
.salt-field-group :deep(.salt-image-exporting .table-container),
.salt-field-group :deep(.salt-image-exporting .n-data-table) {
  display: revert !important;
}

/* D. 营地挑战组（CampChallenge 不在 .salt-field-group 里，单独一套） */
.camp-challenge-group :deep(.export-desktop-layout .member-cards) {
  display: none !important;
}

.camp-challenge-group :deep(.export-desktop-layout .table-card .camp-data-table),
.camp-challenge-group
  :deep(.export-desktop-layout .members-table-section .camp-data-table) {
  display: revert !important;
}
</style>
