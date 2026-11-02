<template>
  <div class="status-card consumption-progress">
    <!-- 头部：图标走 MIcon（原来是 emoji 📊），副标题说清这张卡在算什么 -->
    <div class="cp-head">
      <span class="cp-ic"><MIcon name="chart" :size="21" /></span>
      <div class="cp-ht">
        <h3>消耗活动进度</h3>
        <p>五条消耗任务 → 攒够 {{ targetGold }} 个黄金道具</p>
      </div>
    </div>

    <!-- 概览：三格等宽 band -->
    <div class="cp-stats">
      <div class="cp-stat">
        <span class="k">黄金道具</span>
        <span class="v">{{ currentGold }}<i>/{{ targetGold }}</i></span>
      </div>
      <div class="cp-stat">
        <span class="k">普通道具</span>
        <span class="v">{{ ActivityItem }}</span>
      </div>
      <div class="cp-stat">
        <span class="k">获取率</span>
        <span class="v">{{ gainRateText }}<i>/黄金</i></span>
      </div>
    </div>

    <!-- 结论：还差多少普通道具（这张卡真正要回答的那句话） -->
    <div class="cp-need" :class="{ ok: remainingOrdNeeded === 0 }">
      <span class="cp-need-k">{{ remainingOrdNeeded === 0 ? "普通道具已够，不用再凑" : "还需普通道具" }}</span>
      <span v-if="remainingOrdNeeded > 0" class="cp-need-v">{{ remainingOrdNeeded }}</span>
      <MIcon v-else name="check" :size="20" class="cp-need-ic" />
    </div>
    <p class="cp-hint">
      已累计 {{ totalObtained }} · 库存 {{ ActivityItem }} 已计入 · 按 {{ goldRateText }} 个普通道具换 1 个黄金估算
    </p>

    <!-- 五条消耗任务的进度 -->
    <div class="cp-sec">
      <span class="cp-sec-t">任务进度</span>
      <span class="cp-sec-x">{{ progressList.length }} 项</span>
    </div>
    <div v-if="!hasActivityData" class="cp-empty">暂无活动数据</div>
    <div v-else class="cp-list">
      <div v-for="item in progressList" :key="item.id" class="cp-item">
        <div class="cp-item-t">
          <span class="cp-nm">
            {{ item.name }}
            <em v-if="item.obtainedItems > 0">已获 {{ item.obtainedItems }}</em>
          </span>
          <span class="cp-num"><b>{{ item.current }}</b>/{{ item.nextTarget }}</span>
        </div>
        <n-progress
          type="line"
          :percentage="item.percentage"
          :color="item.isCompleted ? 'var(--m-green)' : 'var(--m-primary)'"
          rail-color="var(--m-band)"
          :height="6"
          :show-indicator="false"
        />
        <div class="cp-item-f">
          <span v-if="!item.isCompleted"
            >下一档 {{ item.nextTarget }}（还需 {{ item.nextTarget - item.current }}）</span
          >
          <span v-else class="done">已完成所有档位</span>
        </div>
      </div>
    </div>

    <!-- 方案：招募 / 宝箱 / 盐罐 默认打满，不给它们出行，只算 捕获 / 金砖 -->
    <div class="cp-sec">
      <span class="cp-sec-t">捕获 / 金砖 怎么调</span>
      <span v-if="planOptions.length" class="cp-sec-x">{{ planOptions.length }} 条</span>
    </div>
    <p class="cp-assume">
      招募 · 宝箱 · 盐罐 按打满算<template v-if="assumedFullGain > 0"
        >，还能产出 <b>{{ assumedFullGain }}</b> 普通道具，不用管</template
      >
    </p>
    <p v-if="planOptions.length === 0" class="cp-empty">{{ planEmptyText }}</p>
    <div v-else class="cp-plans">
      <div v-for="(combo, idx) in planOptions" :key="idx" class="cp-combo">
        <div class="cp-combo-h">
          <span class="cp-combo-no">{{ idx + 1 }}</span>
          <span class="cp-combo-t">{{ combo.title }}</span>
          <span class="cp-combo-v">+{{ combo.sumDelta }} 普通</span>
        </div>
        <div
          v-for="step in combo.combo"
          :key="step.id + '-' + step.threshold"
          class="cp-combo-r"
        >
          <span class="cp-combo-nm">{{ step.name }}</span>
          <span class="cp-combo-x">升到 {{ step.threshold }}</span>
          <span class="cp-combo-d">+{{ step.delta }}</span>
          <span class="cp-combo-c">耗 {{ step.cost }}</span>
        </div>
      </div>
    </div>

    <!-- 开普通道具：数量与按钮同一行，主操作占满剩余宽度 -->
    <div class="cp-open">
      <div class="cp-open-r">
        <span class="k">使用数量</span>
        <n-input-number
          v-model:value="Activitynumber"
          :min="1"
          :max="Math.max(1, ActivityItem)"
          :step="1"
          size="small"
          class="cp-num-in"
        />
        <span class="cp-stock">库存 {{ ActivityItem }}</span>
      </div>
      <!-- ★ 没有普通道具时不能让他点：原来只判 isRunning，0 库存照样把 item_openpack 发出去 -->
      <a-button
        type="primary"
        size="small"
        block
        :disabled="state.isRunning || ActivityItem <= 0"
        :loading="state.isRunning"
        @click="OpenActivityItem"
        >{{ ActivityItem > 0 ? "打开普通道具" : "没有普通道具可开" }}</a-button
      >
    </div>

    <!-- 方案直接铺在卡里（只有 3 条），不再藏进弹窗 -->
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, watchEffect } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import MIcon from "@/mobile/components/MIcon.vue";

const tokenStore = useTokenStore();
const message = useMessage();
// 获取活动数据
const fetchActivityData = () => {
  if (tokenStore.selectedToken) {
    tokenStore.sendMessage(tokenStore.selectedToken.id, "activity_get");
  }
};

onMounted(() => {
  fetchActivityData();
});

watch(
  () => tokenStore.selectedToken,
  () => {
    fetchActivityData();
  },
);

const state = ref({
  isRunning: false,
});

const Activitynumber = ref(4);
// 消耗任务ID定义
const ConsumptionTaskID = {
  招募: 1,
  宝箱: 2,
  捕获: 3,
  盐罐: 4,
  金砖: 5,
};

// 任务名称映射
const TaskNames = {
  [ConsumptionTaskID.招募]: "招募",
  [ConsumptionTaskID.宝箱]: "宝箱",
  [ConsumptionTaskID.捕获]: "捕获",
  [ConsumptionTaskID.盐罐]: "盐罐",
  [ConsumptionTaskID.金砖]: "金砖",
};

// 任务档位配置 (参考 ConsumptionTask.ts)
const missionTypes = {
  [ConsumptionTaskID.招募]: [
    { num: 80 },
    { num: 160 },
    { num: 240 },
    { num: 320 },
    { num: 400 },
    { num: 560 },
    { num: 720 },
    { num: 880 },
    { num: 1040 },
    { num: 1200 },
    { num: 1440 },
    { num: 1680 },
    { num: 1920 },
    { num: 2160 },
    { num: 2400 },
    { num: 2720 },
    { num: 3040 },
    { num: 3360 },
    { num: 3680 },
    { num: 4000 },
  ],
  [ConsumptionTaskID.宝箱]: [
    { num: 2000 },
    { num: 4000 },
    { num: 6000 },
    { num: 8000 },
    { num: 10000 },
    { num: 14000 },
    { num: 18000 },
    { num: 22000 },
    { num: 26000 },
    { num: 30000 },
    { num: 36000 },
    { num: 42000 },
    { num: 48000 },
    { num: 54000 },
    { num: 60000 },
    { num: 68000 },
    { num: 76000 },
    { num: 84000 },
    { num: 92000 },
    { num: 100000 },
  ],
  [ConsumptionTaskID.捕获]: [
    { num: 25 },
    { num: 50 },
    { num: 75 },
    { num: 125 },
    { num: 175 },
    { num: 225 },
    { num: 300 },
    { num: 375 },
    { num: 450 },
    { num: 525 },
    { num: 625 },
    { num: 725 },
    { num: 825 },
    { num: 925 },
    { num: 1050 },
    { num: 1175 },
    { num: 1300 },
    { num: 1450 },
    { num: 1600 },
    { num: 1750 },
  ],
  [ConsumptionTaskID.盐罐]: [
    { num: 3 },
    { num: 6 },
    { num: 9 },
    { num: 12 },
    { num: 15 },
    { num: 18 },
    { num: 21 },
    { num: 24 },
    { num: 27 },
    { num: 30 },
    { num: 33 },
    { num: 36 },
    { num: 39 },
    { num: 42 },
    { num: 45 },
    { num: 48 },
    { num: 51 },
    { num: 54 },
    { num: 57 },
    { num: 60 },
  ],
  [ConsumptionTaskID.金砖]: [
    { num: 10000 },
    { num: 20000 },
    { num: 30000 },
    { num: 40000 },
    { num: 50000 },
    { num: 70000 },
    { num: 90000 },
    { num: 110000 },
    { num: 130000 },
    { num: 150000 },
    { num: 180000 },
    { num: 210000 },
    { num: 240000 },
    { num: 270000 },
    { num: 300000 },
    { num: 340000 },
    { num: 380000 },
    { num: 420000 },
    { num: 460000 },
    { num: 500000 },
  ],
};

const rewardConfigs = {
  [ConsumptionTaskID.招募]: [
    { num: 8 },
    { num: 8 },
    { num: 8 },
    { num: 8 },
    { num: 8 },
    { num: 16 },
    { num: 16 },
    { num: 16 },
    { num: 16 },
    { num: 16 },
    { num: 24 },
    { num: 24 },
    { num: 24 },
    { num: 24 },
    { num: 24 },
    { num: 32 },
    { num: 32 },
    { num: 32 },
    { num: 32 },
    { num: 32 },
  ],
  [ConsumptionTaskID.宝箱]: [
    { num: 4 },
    { num: 4 },
    { num: 4 },
    { num: 4 },
    { num: 4 },
    { num: 8 },
    { num: 8 },
    { num: 8 },
    { num: 8 },
    { num: 8 },
    { num: 12 },
    { num: 12 },
    { num: 12 },
    { num: 12 },
    { num: 12 },
    { num: 16 },
    { num: 16 },
    { num: 16 },
    { num: 16 },
    { num: 16 },
  ],
  [ConsumptionTaskID.捕获]: [
    { num: 4 },
    { num: 4 },
    { num: 4 },
    { num: 8 },
    { num: 8 },
    { num: 8 },
    { num: 12 },
    { num: 12 },
    { num: 12 },
    { num: 12 },
    { num: 16 },
    { num: 16 },
    { num: 16 },
    { num: 16 },
    { num: 20 },
    { num: 20 },
    { num: 20 },
    { num: 24 },
    { num: 24 },
    { num: 24 },
  ],
  [ConsumptionTaskID.盐罐]: [
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
    { num: 1 },
  ],
  [ConsumptionTaskID.金砖]: [
    { num: 3 },
    { num: 3 },
    { num: 3 },
    { num: 3 },
    { num: 3 },
    { num: 6 },
    { num: 6 },
    { num: 6 },
    { num: 6 },
    { num: 6 },
    { num: 9 },
    { num: 9 },
    { num: 9 },
    { num: 9 },
    { num: 9 },
    { num: 12 },
    { num: 12 },
    { num: 12 },
    { num: 12 },
    { num: 12 },
  ],
};

// 消耗活动的ID (仅作参考，实际逻辑会自动查找)
const ACTIVITY_ID = 2512261;
const roleInfo = computed(() => tokenStore.gameData?.roleInfo || null);
const ActivityItem = computed(
  () => roleInfo.value?.role?.items?.[5261]?.quantity || 0,
);
const ActivityGoldItem = computed(
  () => roleInfo.value?.role?.items?.[5262]?.quantity || 0,
);
/* 库存掉到 0 时输入框里还挂着 4，会显得自相矛盾（使用数量 4 / 库存 0）⇒ 跟着钳一下。
   ★ 必须写在 ActivityItem 之后：写在前面会踩 const 的 TDZ。 */
watch(
  ActivityItem,
  (v) => {
    const max = Math.max(1, v || 0);
    if (Activitynumber.value > max) Activitynumber.value = max;
  },
  { immediate: true },
);
const commonActivityInfo = computed(() => {
  const data = tokenStore.gameData?.commonActivityInfo;
  // 尝试获取活动列表对象，兼容可能的层级结构
  return data?.activity?.commonActivityInfo || data?.commonActivityInfo || {};
});

const hasActivityData = computed(() => {
  console.log("🚀 ~ commonActivityInfo.value:", commonActivityInfo.value);
  if (!commonActivityInfo.value) return false;

  // 查找包含有效任务ID (1-5) 的活动
  return Object.values(commonActivityInfo.value).some((activity) => {
    if (!activity?.task) return false;
    return Object.keys(activity.task).some((key) => {
      const id = Number(key);
      return id >= 1 && id <= 5;
    });
  });
});

const OpenActivityItem = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  if (state.value.isRunning) return;
  /* 库存兜底：按钮已禁用，这里再挡一次（连点 / 输入框里手敲也能进来）。
     ★ 原来完全没判库存，0 个也照发 item_openpack。 */
  if (ActivityItem.value <= 0) {
    message.warning("没有普通道具可开");
    return;
  }
  const n = Math.min(
    Math.max(1, Math.floor(Number(Activitynumber.value) || 1)),
    ActivityItem.value,
  );
  if (n !== Activitynumber.value) Activitynumber.value = n;

  const tokenId = tokenStore.selectedToken.id;
  state.value.isRunning = true;
  message.info("道具开启中");
  /* ★ try/finally：失败时原来 isRunning 永远停在 true，按钮一直转圈 */
  try {
    await tokenStore.sendMessageWithPromise(tokenId, "item_openpack", {
      itemId: 5261,
      index: 0,
      number: n,
    });
    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    message.success("道具开启完毕");
  } catch (error) {
    message.error("开启失败: " + (error?.message || "请重试"));
  } finally {
    state.value.isRunning = false;
  }
};

const progressList = computed(() => {
  if (!commonActivityInfo.value) return [];

  // 查找包含有效任务ID (1-5) 的活动
  const activityData = Object.values(commonActivityInfo.value).find(
    (activity) => {
      if (!activity?.task) return false;
      return Object.keys(activity.task).some((key) => {
        const id = Number(key);
        return id >= 1 && id <= 5;
      });
    },
  );

  if (!activityData) return [];

  const tasks = activityData.task || {};

  // 现在 current 表示已消耗量（不是轮数）。
  // 使用 missionTypes[id] 找到 current 所处的轮次（即 missionTypes 中 num <= current 的数量），
  // 然后按照 rewardConfigs[id] 的逐轮奖励累加前 N 轮的奖励。
  const calcObtainedForTask = (id, consumed) => {
    const rewardCfg = rewardConfigs[id];
    if (!rewardCfg || !rewardCfg.length || !consumed || consumed <= 0) return 0;

    const missionCfg = missionTypes[id] || [];

    // missionCfg 中每一项的 num 表示达到该小轮的累计消耗阈值。
    // 计算已完成的小轮数：missionCfg 中 num <= consumed 的数量
    let completedRounds = 0;
    for (let i = 0; i < missionCfg.length; i++) {
      const threshold = missionCfg[i]?.num || 0;
      if (consumed >= threshold) completedRounds++;
      else break;
    }

    // 累加 rewardCfg 前 completedRounds 项，超出部分使用最后一项补齐
    const len = rewardCfg.length;
    const lastVal = rewardCfg[len - 1]?.num || 0;
    let total = 0;
    for (let i = 0; i < completedRounds; i++) {
      if (i < len) total += rewardCfg[i]?.num || 0;
      else total += lastVal;
    }

    return total;
  };

  return Object.keys(TaskNames).map((key) => {
    const id = Number(key);
    const current = tasks[id] || 0;
    const configs = missionTypes[id] || [];

    // 找到下一个未完成的目标
    let nextTarget = 0;
    let isCompleted = false;

    const nextConfig = configs.find((c) => c.num > current);
    if (nextConfig) {
      nextTarget = nextConfig.num;
    } else {
      // 如果都完成了，取最后一个作为目标
      if (configs.length > 0) {
        nextTarget = configs[configs.length - 1].num;
        isCompleted = true;
      }
    }

    // 计算百分比
    let percentage = 0;
    if (isCompleted) {
      percentage = 100;
    } else if (nextTarget > 0) {
      percentage = Math.min(100, (current / nextTarget) * 100);
    }

    return {
      id,
      name: TaskNames[id],
      current,
      nextTarget,
      percentage,
      isCompleted,
      // 通用计算：若该任务在 rewardConfigs 中有配置，则计算已获得的道具数
      obtainedItems: calcObtainedForTask(id, current),
    };
  });
});

// 所有类别累计已获得的普通道具数
const totalObtained = computed(() => {
  return progressList.value.reduce((s, it) => s + (it.obtainedItems || 0), 0);
});

// 预测相关
const targetGold = ref(250);
// 默认黄金产出率（普通道具 -> 1 黄金），当观测数据不可用时使用
const defaultGoldRate = 4;

// 当前已获得黄金
const currentGold = computed(() => ActivityGoldItem.value || 0);
const remainingGoldNeeded = computed(() =>
  Math.max(0, targetGold.value - currentGold.value),
);

// 基于观测的黄金产出率：使用 当前已获得黄金 / 普通道具 已累计获取 计算金率（普通道具/黄金）
const goldRateObserved = computed(() => {
  const g = currentGold.value || 0;
  const o = totalObtained.value || 0;
  const s = ActivityItem.value || 0;
  if (g > 0 && o > 0 && o > s) {
    // 返回使用的普通道具/黄金（即平均需要多少普通道具产出 1 个黄金）
    return (o - s) / g;
  }
  return null;
});

const goldRateUsed = computed(() => {
  return goldRateObserved.value || defaultGoldRate;
});

/* 展示用：产出比保留 2 位，获取率（黄金/普通道具）保留 2 位 */
const goldRateText = computed(() => Math.round((goldRateUsed.value || 0) * 100) / 100);
const gainRateText = computed(
  () => Math.round((1 / (goldRateUsed.value || 1)) * 100) / 100,
);

// 估算需要的普通道具数量（简单线性估算）：需要 remainingGoldNeeded * goldRateUsed 个普通道具
const neededOrd = computed(
  () => remainingGoldNeeded.value * (goldRateUsed.value || defaultGoldRate),
);

// 当前库存普通道具
const currentOrdStock = computed(() => ActivityItem.value || 0);
// 对于显示，向上取整剩余所需的普通道具数，确保提示为整数
const remainingOrdNeeded = computed(() =>
  Math.max(0, Math.ceil(neededOrd.value - currentOrdStock.value)),
);

// 构造可选升级项分组：对每个类别列出未来每个档位的选项
const groupedUpgradeOptions = computed(() => {
  const groups = [];
  for (const k of Object.keys(TaskNames)) {
    const id = Number(k);
    const name = TaskNames[id];
    const current = progressList.value.find((p) => p.id === id)?.current || 0;
    const configs = missionTypes[id] || [];
    const rewards = rewardConfigs[id] || [];
    const beforeRounds = configs.filter((c) => c.num <= current).length;
    const opts = [];
    for (let j = beforeRounds; j < configs.length; j++) {
      const threshold = configs[j].num;
      const completedRounds = j + 1;
      let delta = 0;
      for (let r = beforeRounds; r < completedRounds; r++) {
        delta += rewards[r]?.num || rewards[rewards.length - 1]?.num || 0;
      }
      const cost = Math.max(0, threshold - current);
      if (delta > 0 && cost > 0) {
        opts.push({
          id,
          name,
          threshold,
          delta,
          cost,
          roundsIndex: completedRounds,
        });
      }
    }
    groups.push({ id, name, current, options: opts });
  }
  return groups;
});

/* ★★ 用户口径（11-01）：「招募 · 宝箱 · 盐罐 默认都是满的，其他两个调整下」。
   这三条在活动里必定打满，所以：
     ① 不给它们出方案行（否则方案里全是「升到 4000 / 耗 100000」这种废话）；
     ② 它们从当前档到满档的奖励按「必得」计入基线；
     ③ 真正要算的只剩 捕获 / 金砖 两条 ⇒ 枚举空间 21×21，方案数量天然收得住。 */
const ASSUMED_FULL_IDS = [
  ConsumptionTaskID.招募,
  ConsumptionTaskID.宝箱,
  ConsumptionTaskID.盐罐,
];
const PLAN_TASK_IDS = [ConsumptionTaskID.捕获, ConsumptionTaskID.金砖];

const planGroups = computed(() =>
  groupedUpgradeOptions.value.filter((g) => PLAN_TASK_IDS.includes(g.id)),
);

/* 三条「必满」任务还能再产出多少普通道具（满档奖励 - 已获得） */
const assumedFullGain = computed(() => {
  let sum = 0;
  for (const id of ASSUMED_FULL_IDS) {
    const row = progressList.value.find((p) => p.id === id);
    if (!row) continue;
    const all = (rewardConfigs[id] || []).reduce((s, r) => s + (r?.num || 0), 0);
    sum += Math.max(0, all - (row.obtainedItems || 0));
  }
  return sum;
});

/* 扣掉「必满」三条之后，还需要 捕获 / 金砖 补的数量 */
const planTarget = computed(() =>
  Math.max(0, Math.ceil((remainingOrdNeeded.value || 0) - assumedFullGain.value)),
);

const planEmptyText = computed(() => {
  if (remainingOrdNeeded.value <= 0) return "普通道具已够，不用再凑";
  if (planTarget.value <= 0) return "招募 · 宝箱 · 盐罐 打满就够，捕获 / 金砖 不用动";
  return "捕获 / 金砖 拉满也不够，还需再开普通道具";
});

/* ★★ 最多 3 条方案，且**按策略分**而不是按「便宜」排：
   捕获 的「耗」是次数、金砖 的「耗」是金砖数 —— 拿这两个数比大小没有意义
   （上一版正是按 sumCost 排序，结果前三条全是「只升捕获」的近似方案）。
   所以只给三种互斥的打法：两条一起 / 只升捕获 / 只升金砖。 */
const planOptions = computed(() => {
  const target = planTarget.value;
  if (target <= 0) return [];
  const groups = planGroups.value || [];
  const optsOf = (id) => groups.find((g) => g.id === id)?.options || [];
  const cap = optsOf(ConsumptionTaskID.捕获);
  const gold = optsOf(ConsumptionTaskID.金砖);
  const list = [];

  /* ① 两条一起：让「多出来的普通道具」最少。
     档位收益是固定的，跨任务比消耗没意义，比谁浪费得少才公平。 */
  let best = null;
  for (const a of cap) {
    for (const b of gold) {
      const sum = a.delta + b.delta;
      if (sum < target) continue;
      const extra = sum - target;
      if (!best || extra < best.extra) {
        best = { extra, sumDelta: sum, combo: [a, b] };
      }
    }
  }
  if (best) list.push({ title: "两条一起", ...best });

  /* ② 只动一条：取「第一个够用的档」（options 已按档位升序） */
  for (const [id, title] of [
    [ConsumptionTaskID.捕获, "只升捕获"],
    [ConsumptionTaskID.金砖, "只升金砖"],
  ]) {
    const one = optsOf(id).find((o) => o.delta >= target);
    if (one) list.push({ title, sumDelta: one.delta, extra: one.delta - target, combo: [one] });
  }

  return list;
});
</script>

<style scoped lang="scss">
/* 消耗活动进度（移动端）
   设计口径与工具坞其余卡片一致：卡内分区用 band 灰块、不做卡片套卡片；
   数值 tabular-nums，结论（还需多少）单独一行放大。 */
.consumption-progress {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---------- 头部 ---------- */
.cp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cp-ic {
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  color: var(--m-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cp-ht {
  min-width: 0;

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--m-text);
  }

  p {
    margin: 2px 0 0;
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--m-text3);
  }
}

/* ---------- 概览三格 ---------- */
.cp-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.cp-stat {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);

  .k {
    font-size: 11px;
    line-height: 1.2;
    color: var(--m-text3);
  }

  .v {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--m-text);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    i {
      font-style: normal;
      font-size: 11px;
      font-weight: 500;
      color: var(--m-text3);
    }
  }
}

/* ---------- 结论条 ---------- */
.cp-need {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--m-r-md);
  /* 行动色带的 8% 底色；暗色下用主色同款透明底才不会脏 */
  background: color-mix(in srgb, var(--m-primary) 8%, transparent);

  .cp-need-k {
    font-size: 12px;
    font-weight: 500;
    color: var(--m-text2);
  }

  .cp-need-v {
    font-size: 20px;
    font-weight: 700;
    line-height: 1;
    color: var(--m-primary);
    font-variant-numeric: tabular-nums;
  }

  .cp-need-ic {
    color: var(--m-green);
    flex: none;
  }

  &.ok {
    background: color-mix(in srgb, var(--m-green) 12%, transparent);

    .cp-need-v {
      color: var(--m-green);
    }
  }
}

.cp-hint {
  margin: -4px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--m-text3);
}

/* ---------- 分区标题 ---------- */
.cp-sec {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;

  .cp-sec-t {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--m-text);
  }

  .cp-sec-x {
    font-size: 11px;
    color: var(--m-text3);
    font-variant-numeric: tabular-nums;
  }
}

/* ---------- 任务进度 ---------- */
.cp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cp-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);

  /* 22/2000 这种 1% 的进度，fill 只有 3px，圆角一收就成一颗「点」⇒ 给个最小宽度 */
  :deep(.n-progress-graph-line-fill) {
    min-width: 6px;
  }
}

.cp-item-t {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.cp-nm {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--m-text);

  em {
    flex: none;
    font-style: normal;
    font-size: 10px;
    font-weight: 500;
    line-height: 1;
    padding: 3px 5px;
    border-radius: var(--m-r-sm);
    color: var(--m-primary);
    background: color-mix(in srgb, var(--m-primary) 12%, transparent);
  }
}

.cp-num {
  flex: none;
  font-size: 12px;
  color: var(--m-text3);
  font-variant-numeric: tabular-nums;

  b {
    font-size: 14px;
    font-weight: 700;
    color: var(--m-text);
  }
}

.cp-item-f {
  font-size: 11px;
  line-height: 1.3;
  color: var(--m-text3);
  font-variant-numeric: tabular-nums;

  .done {
    color: var(--m-green);
  }
}

/* ---------- 空态 ---------- */
.cp-empty {
  margin: 0;
  padding: 14px 12px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  text-align: center;
  font-size: 12px;
  color: var(--m-text3);
}

/* ---------- 方案 ---------- */
.cp-assume {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--m-text3);

  b {
    color: var(--m-text2);
    font-variant-numeric: tabular-nums;
  }
}

.cp-plans {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cp-combo {
  padding: 10px 12px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
}

/* ---------- 开普通道具 ---------- */
.cp-open {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cp-open-r {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  .k {
    font-size: 12px;
    color: var(--m-text3);
  }
}

/* 「使用数量」输入框
 * ★ Naive 的 +/− 是它自己渲染的两颗 `n-button--default-type/medium`：
 *   自带 5% 灰底 + 34px 高 + 各自圆角，并排贴在输入框右端 ⇒ 看着像一坨灰块。
 *   这里把它收成「band 底 + 无边框 + 加减透明，中间一根 hairline」。
 *   ★★ Naive 把 --n-color/--n-border 写成**内联** style，普通声明赢不过 ⇒ 必须 !important。 */
.cp-num-in {
  width: 130px;
  flex: none;

  :deep(.n-input) {
    --n-color: var(--m-bg) !important;
    --n-color-focus: var(--m-bg) !important;
    --n-color-disabled: var(--m-band) !important;
    --n-text-color: var(--m-text) !important;
    --n-text-color-disabled: var(--m-text3) !important;
    --n-border: 0 !important;
    --n-border-hover: 0 !important;
    --n-border-focus: 0 !important;
    --n-border-disabled: 0 !important;
    --n-box-shadow-focus: none !important;
    --n-caret-color: var(--m-primary) !important;
    --n-font-size: 13px !important;
    --n-border-radius: var(--m-r-sm) !important;
    background: var(--m-bg);
    border-radius: var(--m-r-sm);
  }

  /* 加减键：无底、26×26、压色走行动色 */
  :deep(.n-input__suffix) {
    gap: 0;
    padding-right: 2px;
  }

  :deep(.n-input__suffix .n-button) {
    --n-color: transparent !important;
    --n-color-hover: var(--m-border) !important;
    --n-color-pressed: var(--m-border) !important;
    --n-color-focus: transparent !important;
    --n-text-color: var(--m-text3) !important;
    --n-text-color-hover: var(--m-primary) !important;
    --n-text-color-pressed: var(--m-primary) !important;
    --n-border: 0 !important;
    --n-border-hover: 0 !important;
    --n-border-focus: 0 !important;
    --n-border-pressed: 0 !important;
    width: 26px;
    height: 26px;
    min-width: 26px;
    padding: 0;
    margin: 0;
    border-radius: var(--m-r-sm);
  }

  /* 两半之间不画分隔线：box-shadow 会跟着圆角拐成弧，看着像块小卡片 */
  :deep(.n-input__suffix .n-button + .n-button) {
    box-shadow: none;
  }

  /* 库存 0 时整框禁用：加减跟着淡掉，别再出现两块灰底 */
  :deep(.n-input__suffix .n-button[disabled]) {
    --n-color: transparent !important;
    --n-color-disabled: transparent !important;
    background: transparent !important;
    opacity: 0.45;
  }
}

/* 库存数跟在输入框旁边，填数量时不用回上面找 */
.cp-stock {
  flex: none;
  font-size: 11px;
  color: var(--m-text3);
  font-variant-numeric: tabular-nums;
}

/* ---------- 方案行 ---------- */
.cp-combo-h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.cp-combo-no {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: var(--m-on-primary);
  background: var(--m-primary);
  font-variant-numeric: tabular-nums;
}

.cp-combo-t {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--m-text);
}

/* 方案头右侧：这一条能补多少普通道具 */
.cp-combo-v {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--m-primary);
  font-variant-numeric: tabular-nums;
}

.cp-combo-r {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 46px 54px;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  font-size: 12px;
  color: var(--m-text2);
  font-variant-numeric: tabular-nums;

  & + & {
    box-shadow: inset 0 1px 0 var(--m-band);
  }
}

.cp-combo-nm {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-combo-x {
  color: var(--m-text3);
  white-space: nowrap;
}

.cp-combo-d {
  text-align: right;
  font-weight: 700;
  color: var(--m-green);
}

.cp-combo-c {
  text-align: right;
  font-size: 11px;
  color: var(--m-text3);
}


/* 320 宽：三格数字挤，缩字号；方案行去掉「耗」列以外的余量 */
@media (max-width: 359px) {
  .cp-stat .v {
    font-size: 13px;
  }

  .cp-combo-r {
    grid-template-columns: minmax(0, 1fr) auto 40px 48px;
  }
}
</style>
