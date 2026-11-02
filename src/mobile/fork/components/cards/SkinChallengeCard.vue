<template>
  <MyCard class="skin-challenge" :statusClass="statusClass">
    <template #icon>
      <img src="/icons/1733492491706152.png" alt="换皮闯关" />
    </template>
    <template #title>
      <h3>换皮闯关</h3>
      <p>挑战关卡赢取奖励</p>
    </template>
    <template #badge>
      <!-- Badge content moved to default slot -->
    </template>
    <template #default>
      <div class="header-info">
        <span class="challenge-count">今日挑战 {{ dailyFightNum }}/10</span>
        <span class="daily-target" v-if="isActivityValid">今日可挑战 {{ todayInfo }}</span>
        <span class="daily-target ended" v-else>活动已结束</span>
      </div>

      <div v-if="!isActivityValid" class="expired-mask">
         当前活动已结束
      </div>
      <div class="boss-grid" :class="{ 'disabled': !isActivityValid }">
        <div
          v-for="type in 6"
          :key="type"
          class="boss-card"
          :class="{
            'active': isTowerOpen(type),
            'cleared': isTowerCleared(type),
            'locked': !isTowerOpen(type)
          }"
        >
          <!-- 手机版：BOSS 序号和层数并到一行，第二行只放「状态或按钮」——
               原来四行竖排（序号 / 层数 / 未开放 / 挑战）一张卡 110px，六张就把首屏吃掉。 -->
          <div class="boss-head">
            <span class="boss-title">BOSS {{ type }}</span>
            <span class="boss-level">第 {{ getTowerLevel(type) }} 层</span>
          </div>

          <div class="boss-status">
            <span v-if="isTowerCleared(type)" class="status-text cleared">已通关</span>
            <span v-else-if="!isTowerOpen(type)" class="status-text locked">未开放</span>
            <button
              v-else
              class="challenge-btn"
              :disabled="!canChallenge(type) || isFighting"
              @click="challengeSingle(type)"
            >
              {{ isFighting ? "挑战中" : "挑战" }}
            </button>
          </div>
        </div>
      </div>
      
      <div class="action-row">
        <button
          class="action-button secondary"
          :disabled="isFighting"
          @click="refreshInfo"
        >
          {{ isFighting ? "刷新中..." : "刷新进度" }}
        </button>
      </div>
    </template>
  </MyCard>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { getTowerActId } from "@/utils/towerActId.js";
import { useMessage } from "naive-ui";
import MyCard from "../Common/MyCard.vue";

const tokenStore = useTokenStore();
const message = useMessage();

const isFighting = ref(false);
const actId = ref(null);
const isActivityValid = computed(() => {
  if (!actId.value) return false;
  
  const idStr = String(actId.value);
  if (idStr.length < 6) return false;
  
  // Format: YYMMDDX -> 20YY-MM-DD
  const year = "20" + idStr.substring(0, 2);
  const month = idStr.substring(2, 4);
  const day = idStr.substring(4, 6);
  
  const startDate = new Date(`${year}-${month}-${day}T00:00:00`);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 7);
  
  const now = new Date();
  return now >= startDate && now < endDate;
});

const levelRewardMap = ref({});
const dailyFightNum = ref(0); // Mock or real data
const finishedCount = computed(() => Object.keys(levelRewardMap.value).length);

const statusClass = computed(() => {
  if (finishedCount.value >= 48) return "completed";
  return "active";
});

// Calculate today's open boss
const todayWeekDay = new Date().getDay(); // 0-6 (Sun-Sat)
const openTowerMap = {
  5: [1], // Friday
  6: [2], // Saturday
  0: [3], // Sunday
  1: [4], // Monday
  2: [5], // Tuesday
  3: [6], // Wednesday
  4: [1, 2, 3, 4, 5, 6] // Thursday (All open)
};

const todayOpenTowers = computed(() => {
  return openTowerMap[todayWeekDay] || [];
});

const todayInfo = computed(() => {
  const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const dayName = weekDays[todayWeekDay];
  const towers = todayOpenTowers.value;
  if (towers.length === 6) return `${dayName} - 全部开放`;
  if (towers.length > 0) return `${dayName} - BOSS ${towers.join(",")}`;
  return `${dayName} - 无活动`;
});

const isTowerOpen = (type) => {
  return todayOpenTowers.value.includes(type) || todayOpenTowers.value.includes(6) && todayWeekDay === 4; // Special case for Thursday if map is correct
};

const isTowerCleared = (type) => {
  const key1 = `${type}008`;
  const key2 = Number(key1);
  return !!(levelRewardMap.value[key1] || levelRewardMap.value[key2]);
};

const getTowerLevel = (type) => {
  // Find highest cleared level
  for (let i = 8; i >= 1; i--) {
    const key1 = `${type}00${i}`;
    const key2 = Number(key1);
    if (levelRewardMap.value[key1] || levelRewardMap.value[key2]) {
        // If 8 is cleared, return 8
        if (i === 8) return 8;
        // Else return next level
        return i + 1;
    }
  }
  return 1;
};

const canChallenge = (type) => {
  return isActivityValid.value && isTowerOpen(type) && !isTowerCleared(type);
};

const getInfo = async () => {
  if (!tokenStore.selectedToken) return;
  const tokenId = tokenStore.selectedToken.id;
  if (tokenStore.getWebSocketStatus(tokenId) !== "connected") return;

  try {
    const res = await tokenStore.sendMessageWithPromise(tokenId, "towers_getinfo", { actId: getTowerActId() }, 5000);
    if (res) {
      // Handle nested data structure if necessary
      const data = res.actId ? res : (res.towerData && res.towerData.actId ? res.towerData : res);
      
      actId.value = data.actId;
      levelRewardMap.value = data.levelRewardMap || {};
      
      console.log('SkinChallenge Info:', {
         actId: data.actId,
         mapSize: Object.keys(levelRewardMap.value).length,
         keys: Object.keys(levelRewardMap.value).slice(0, 10),
         map: levelRewardMap.value,
         rawRes: res
      });

      // Try to find daily num if exists in response
      if (data.todayUseTickCnt !== undefined) {
        dailyFightNum.value = data.todayUseTickCnt;
      }
    }
  } catch (e) {
    // console.error(e);
  }
};

const refreshInfo = async () => {
  isFighting.value = true;
  await getInfo();
  message.success("进度已刷新");
  isFighting.value = false;
};

const challengeSingle = async (type) => {
  if (isFighting.value) return;
  
  isFighting.value = true;
  const tokenId = tokenStore.selectedToken.id;
  
  try {
     message.info(`开始挑战 BOSS ${type}`);
     
     let needStart = true;
     let loop = true;
     let failCount = 0;
     
     while (loop) {
        if (needStart) {
            await tokenStore.sendMessageWithPromise(tokenId, "towers_start", { actId: getTowerActId(), towerType: type }, 5000);
        }
        
        const fightRes = await tokenStore.sendMessageWithPromise(tokenId, "towers_fight", { actId: getTowerActId(), towerType: type }, 5000);
        const battleData = fightRes?.battleData;
        const curHP = battleData?.result?.accept?.ext?.curHP;
        
        if (curHP === 0) {
            // Get current level before updating info (it will be the level just cleared)
            const currentLevel = getTowerLevel(type);
            message.success(`BOSS ${type} 第 ${currentLevel} 层挑战成功`);
            
            // 挑战成功，不需要重新 start，直接继续 fight
            needStart = false;
            failCount = 0;
            
            // 检查是否通关（需要更新 levelRewardMap）
            await getInfo();
            if (isTowerCleared(type)) {
                loop = false;
                message.success(`BOSS ${type} 已全部通关`);
            } else {
                // 等待一下避免过快请求
                await new Promise(r => setTimeout(r, 1000));
            }
        } else {
            const currentLevel = getTowerLevel(type);
            message.warning(`BOSS ${type} 第 ${currentLevel} 层挑战失败`);
            // 挑战失败，需要重新 start
            needStart = true;
            failCount++;
            
            if (failCount >= 3) {
                message.error(`BOSS ${type} 第 ${currentLevel} 层连续失败 3 次，停止挑战`);
                loop = false;
            } else {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
     }
  } catch (e) {
     message.error(`挑战出错: ${e.message}`);
  } finally {
     isFighting.value = false;
     await getInfo();
  }
};

watch(
  () => tokenStore.selectedToken,
  (newVal) => {
    if (newVal) {
       setTimeout(getInfo, 1000);
    }
  },
  { immediate: true }
);

watch(
  () => tokenStore.getWebSocketStatus(tokenStore.selectedToken?.id),
  (status) => {
    if (status === "connected") {
      getInfo();
    }
  }
);
</script>

<style scoped lang="scss">
/* ---------- 顶部信息行：今日挑战 x/10 + 今日可挑战 / 活动已结束 ---------- */
.header-info {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin-bottom: 10px;
}

.challenge-count {
  font-size: 13px;
  font-weight: 700;
  color: var(--m-text) !important;
  font-variant-numeric: tabular-nums;
}

.daily-target {
  font-size: 12px;
  color: var(--m-text3) !important;
}
.daily-target.ended {
  color: var(--m-red) !important;
}

/* ---------- BOSS 网格：这份副本只给移动端用，直接写死两列 ----------
   ★ 不能用 @media 判断宽度：媒体查询按【视口】宽度算，不看 .mobile-shell 那条 430px 的壳，
     桌面上开着 1832px 窗口时壳只有 430px，却会走 repeat(3) ⇒ 卡片被压到 110px、层数折行。 */
.boss-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

/* 活动过期时不再整块 50% 透明度：那样连「未开放」三个字都看不清，
   改成每张卡自己降一档文字色（下面 .locked 那几条）。 */
.boss-grid.disabled {
  opacity: 1;
  pointer-events: none;
}

.boss-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 9px 10px;
  border: none;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  text-align: left;
  transition: background 0.12s;

  &.active {
    background: var(--m-primary-soft);
  }

  /* ★ 顺序有意义：模板里 `cleared` 和 `locked` 会同时为真（已通关的 BOSS 今天没开放），
     后写的规则赢 ⇒ locked 必须排在 cleared 前面，否则已通关的卡永远是一块灰底，
     只剩「已通关」三个绿字在灰底上，看着像个错色 bug。 */
  &.locked {
    background: var(--m-bg);
  }

  &.cleared {
    background: var(--m-green-soft);
  }
}

/* 第一行：BOSS 序号（小、弱）+ 层数（大、强） */
.boss-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.boss-title {
  margin: 0;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--m-text3) !important;
  letter-spacing: 0;
}

.boss-level {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--m-text) !important;
  font-variant-numeric: tabular-nums;
}

/* 第二行：未开放 / 已通关 / 挑战按钮，三者同高，锁住的卡不会矮一截 */
.boss-status {
  margin: 0;
}

.status-text {
  display: block;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 30px;
  color: var(--m-text3) !important;

  &.cleared {
    color: var(--m-green) !important;
  }

  &.locked {
    color: var(--m-text3) !important;
  }

  /* 「进行中」文案被按钮取代，留着只是为了兼容旧结构 */
  &.active {
    display: none;
  }
}

.challenge-btn {
  width: 100%;
  height: 30px;
  border: none;
  border-radius: var(--m-r-sm);
  background: var(--m-primary);
  color: var(--m-on-primary) !important;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    background: var(--m-band);
    color: var(--m-text3) !important;
    cursor: not-allowed;
  }
}

/* 活动已结束：语义软底红条，不用高饱和整块红 */
.expired-mask {
  margin-bottom: 10px;
  padding: 9px 10px;
  border-radius: var(--m-r-md);
  background: var(--m-red-soft);
  color: var(--m-red) !important;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}

.action-row {
  margin: 0;
  display: flex;
}

/* 刷新进度：描边按钮（灰底在手机上会被当成禁用态） */
.action-button {
  width: 100%;
  height: 40px;
  border: 1px solid var(--m-hairline);
  border-radius: var(--m-r-md);
  background: var(--m-card);
  color: var(--m-primary-deep) !important;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
html[data-theme="dark"] .action-button {
  color: var(--m-primary) !important;
}

@media (max-width: 360px) {
  /* 320：两列仍保留，只把层数字号收一档，避免「第 10 层」挤压 BOSS 序号 */
  .boss-level {
    font-size: 12.5px;
  }
  .boss-title {
    font-size: 10px;
  }
}
</style>
