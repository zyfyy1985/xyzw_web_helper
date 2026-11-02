<template>
  <MyCard
    class="study"
    :statusClass="{ weekly: true, completed: study.isCompleted }"
  >
    <template #icon>
      <img src="/icons/1736425783912140.png" alt="学习图标" />
    </template>
    <template #title>
      <h3>咸鱼大冲关</h3>
      <p>每日知识挑战</p>
    </template>
    <template #badge>
      <span>每周任务</span>
    </template>
    <template #default>
      <p class="description">没有什么可以阻挡我求知的欲望！</p>
    </template>
    <template #action>
      <!-- 一键答题：只在空闲（status 为空或 idel）时露出 —— 与 startStudy 自己的守卫同口径。
           原来只判 !thisWeek，答题过程中「一键答题」和「答题中...」两颗按钮会同时出现。
           图标一律走 MIcon（原来是 emoji 🎯，同 ✅ 的问题）。 -->
      <a-button
        v-if="!study.thisWeek && isIdle"
        status="primary"
        class="m-ic-btn"
        @click="startStudy"
      >
        <MIcon name="target" :size="15" class="m-ic" />一键答题
      </a-button>
      <a-button
        v-if="!study.thisWeek && study.status == 'starting'"
        status="warning"
        :disabled="true"
      >
        正在获取题库...
      </a-button>
      <a-button
        v-if="!study.thisWeek && study.status == 'answering'"
        status="warning"
        :disabled="true"
      >
        答题中...
      </a-button>
      <a-button
        v-if="!study.thisWeek && study.status == 'claiming_rewards'"
        status="warning"
        :disabled="true"
      >
        正在领取奖励...
      </a-button>
      <a-button
        v-if="!study.thisWeek && study.status == 'completed'"
        status="warning"
        :disabled="true"
      >
        答题完成
      </a-button>
      <a-button v-if="study.thisWeek" status="success" :disabled="true" class="m-ic-btn">
        <MIcon name="check" :size="14" class="m-ic" />已完成无需作答
      </a-button>
    </template>
  </MyCard>
</template>

<script setup>
import { computed } from "vue";
import { useMessage } from "naive-ui";
import {
  preloadQuestions,
  getQuestionCount,
} from "@/utils/studyQuestionsFromJSON.js";
import { useTokenStore } from "@/stores/tokenStore";
import MyCard from "../Common/MyCard.vue";
/* 勾子走移动端统一图标源（24 网格 / 1.8 描边 / currentColor），
 * 不用 emoji ✅：emoji 跟着系统字体走，各机型胖瘦不一，颜色也压不进主题色。 */
import MIcon from "@/mobile/components/MIcon.vue";

const tokenStore = useTokenStore();
const message = useMessage();
const study = computed(() => tokenStore.gameData.studyStatus);

/* 空闲判定（status 为空或 idel）：startStudy 的守卫写的是同一个条件，
 * 这里抽出来给模板用，免得按钮露出了却点不动。 */
const isIdle = computed(() => !study.value.status || study.value.status === "idel");

const startStudy = async () => {
  if (!tokenStore.selectedToken || study.value.thisWeek) return;
  if (study.value.status != "" && study.value.status != "idel") return;
  console.log("开始答题", study.value);

  study.value.status = "starting";
  await preloadQuestions();
  study.value.status = "answering";
  const questionCount = await getQuestionCount();
  message.info(`🚀 开始一键答题... (题库包含 ${questionCount} 道题目)`);

  if (study.value.isCompleted)
    return message.success("✅ 咸鱼大冲关任务已完成，无需重复作答！");
  try {
    tokenStore.gameData.studyStatus = {
      ...tokenStore.gameData.studyStatus,
      isAnswering: true,
      questionCount: 0,
      answeredCount: 0,
      status: "starting",
      timestamp: Date.now(),
    };
    const tokenId = tokenStore.selectedToken.id;
    tokenStore.sendMessage(tokenId, "study_startgame");
    setTimeout(() => {
      if (tokenStore.gameData.studyStatus.isAnswering) {
        tokenStore.gameData.studyStatus = {
          ...tokenStore.gameData.studyStatus,
          isAnswering: false,
          questionCount: 0,
          answeredCount: 0,
          status: "",
          timestamp: null,
        };
        message.warning("答题超时，已自动重置状态");
      }
    }, 40000);
    message.info(`🚀 开始一键答题... (题库包含 ${questionCount} 道题目)`);
  } catch (error) {
    console.error("启动答题失败:", error);
    message.error("启动答题失败: " + error.message);
  }
};
</script>

<style scoped>
/* 带图标的动作按钮（一键答题 / 已完成无需作答）：只负责把图标和文字拉到同一条基线。
 * Arco 的 a-button 靠 line-height 撑高，裸 svg 会贴到文字下沿，
 * 所以用 inline-flex + gap 显式对齐，别指望 vertical-align。 */
.m-ic-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 颜色一律 currentColor：暗色下 App.vue 的 `*{color:#fff}` 会命中 svg 内部节点，
 * 固定色值反而会和按钮字色分家。 */
.m-ic {
  flex: none;
  color: currentColor;
}
</style>
