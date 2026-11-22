<template>
  <div class="run-status">
    <!-- 卡头已移到页面级（与「快捷入口 06」同一套分区标题），卡里只有四行 -->
    <div class="rs-list">
      <div
        class="rs-row m-veil-off"
        :class="{ pressed: press === 0 }"
        role="button"
        tabindex="0"
        :aria-expanded="open === 0 ? 'true' : 'false'"
        @click="toggle(0)"
        @keydown.enter="toggle(0)"
        @pointerdown="press = 0"
        @pointerup="press = -1"
        @pointercancel="press = -1"
        @pointerleave="press = -1"
      >
        <span class="rs-ic"><MIcon name="tasks" :size="14" /></span>
        <span class="rs-tx">
          <b>每日任务</b>
          <i>今日 {{ doneCount }}/{{ tasks.length }} · {{ isFull ? "已完成" : "进行中" }}</i>
        </span>
        <span class="rs-val">{{ dailyPoint }}%</span>
        <span class="rs-dot"></span>
        <svg
          class="rs-chev"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
      <div class="rs-acts" :class="{ on: open === 0 }">
        <button class="rs-btn" @click.stop="showSettings = true">任务设置</button>
        <button class="rs-btn" @click.stop="showTaskDetails = true">任务详情</button>
        <button
          class="rs-btn pri"
          :disabled="busy || !isConnected"
          @click.stop="runDailyFix"
        >
          <span v-if="busy">执行中...</span>
          <span v-else-if="!isConnected">未连接</span>
          <span v-else>一键补差</span>
        </button>
      </div>
      <div
        class="rs-row m-veil-off"
        :class="{ pressed: press === 1 }"
        role="button"
        tabindex="0"
        :aria-expanded="open === 1 ? 'true' : 'false'"
        @click="toggle(1)"
        @keydown.enter="toggle(1)"
        @pointerdown="press = 1"
        @pointerup="press = -1"
        @pointercancel="press = -1"
        @pointerleave="press = -1"
      >
        <span class="rs-ic"><MIcon name="clock" :size="14" /></span>
        <span class="rs-tx">
          <b>挂机时间</b>
          <i>已挂机 {{ fmtClock(hangUp.elapsed) }}</i>
        </span>
        <span class="rs-val">{{ fmtClock(hangUp.remaining) }}</span>
        <span class="rs-dot" :class="{ idle: !hangUp.isActive }"></span>
        <svg
          class="rs-chev"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
      <div class="rs-acts" :class="{ on: open === 1 }">
        <button class="rs-btn" :disabled="hangUp.isExtending" @click.stop="extendHangUp">
          <span v-if="hangUp.isExtending">加钟中...</span>
          <span v-else>加钟</span>
        </button>
        <button
          class="rs-btn pri"
          :disabled="hangUp.isClaiming"
          @click.stop="claimHangUpReward"
        >
          <span v-if="hangUp.isClaiming">领取中...</span>
          <span v-else>领取奖励</span>
        </button>
      </div>
      <div
        class="rs-row m-veil-off"
        :class="{ pressed: press === 2 }"
        role="button"
        tabindex="0"
        :aria-expanded="open === 2 ? 'true' : 'false'"
        @click="toggle(2)"
        @keydown.enter="toggle(2)"
        @pointerdown="press = 2"
        @pointerup="press = -1"
        @pointercancel="press = -1"
        @pointerleave="press = -1"
      >
        <span class="rs-ic"><MIcon name="cube" :size="14" /></span>
        <span class="rs-tx">
          <b>盐罐机器人</b>
          <i>{{ bottle.isRunning ? "运行中" : "已停止" }}</i>
        </span>
        <span class="rs-val">{{ fmtClock(bottle.remaining) }}</span>
        <span class="rs-dot" :class="{ idle: !bottle.isRunning }"></span>
        <svg
          class="rs-chev"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
      <div class="rs-acts" :class="{ on: open === 2 }">
        <button class="rs-btn pri" @click.stop="toggleBottle">
          {{ bottle.isRunning ? "重启服务" : "启动服务" }}
        </button>
      </div>
      <div
        class="rs-row m-veil-off"
        :class="{ pressed: press === 3 }"
        role="button"
        tabindex="0"
        :aria-expanded="open === 3 ? 'true' : 'false'"
        @click="toggle(3)"
        @keydown.enter="toggle(3)"
        @pointerdown="press = 3"
        @pointerup="press = -1"
        @pointercancel="press = -1"
        @pointerleave="press = -1"
      >
        <span class="rs-ic"><MIcon name="book" :size="14" /></span>
        <span class="rs-tx">
          <b>功法</b>
          <i>已探索 {{ fmtClock(legacy.elapsed) }}</i>
        </span>
        <span class="rs-val">{{ legacyText }}</span>
        <span class="rs-dot" :class="{ idle: !legacy.isUpgrading && legacy.produce <= 0 }"></span>
        <svg
          class="rs-chev"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
      <div class="rs-acts" :class="{ on: open === 3 }">
        <button
          class="rs-btn pri"
          :disabled="legacy.claiming || !legacy.produce"
          @click.stop="claimLegacy"
        >
          <span v-if="legacy.claiming">领取中...</span>
          <span v-else>领取残卷</span>
        </button>
      </div>
    </div>

    <!-- 任务设置模态框 -->
    <n-modal
      v-model:show="showSettings"
      preset="card"
      title="任务设置"
      class="m-setmodal"
      style="width: 90%; max-width: 360px"
    >
      <template #header>
        <div class="modal-header">
          <n-icon>
            <Settings />
          </n-icon>
          <span>任务设置</span>
        </div>
      </template>

      <div class="sm-body">
        <section class="sm-sec">
          <div class="sm-sec-title">阵容</div>
          <div class="sm-row">
            <span class="sm-label">竞技场阵容</span>
            <n-select
              v-model:value="settings.arenaFormation"
              :options="formationOptions"
              class="sm-ctl"
            />
          </div>
          <div class="sm-row">
            <span class="sm-label">BOSS阵容</span>
            <n-select
              v-model:value="settings.bossFormation"
              :options="formationOptions"
              class="sm-ctl"
            />
          </div>
          <div class="sm-row">
            <span class="sm-label">BOSS次数</span>
            <n-select
              v-model:value="settings.bossTimes"
              :options="bossTimesOptions"
              class="sm-ctl"
            />
          </div>
        </section>

        <section class="sm-sec">
          <div class="sm-sec-title">执行间隔</div>
          <div class="sm-row">
            <span class="sm-label">命令延迟</span>
            <n-input-number
              v-model:value="settings.commandDelay"
              :min="0"
              :max="5000"
              :step="100"
              class="sm-num"
            />
          </div>
          <div class="sm-row">
            <span class="sm-label">任务延迟</span>
            <n-input-number
              v-model:value="settings.taskDelay"
              :min="0"
              :max="5000"
              :step="100"
              class="sm-num"
            />
          </div>
        </section>

        <section class="sm-sec">
          <div class="sm-sec-title">自动执行</div>
          <div class="sm-row">
            <span class="sm-label">领罐子</span>
            <n-switch v-model:value="settings.claimBottle" />
          </div>
          <div class="sm-row">
            <span class="sm-label">领挂机</span>
            <n-switch v-model:value="settings.claimHangUp" />
          </div>
          <div class="sm-row">
            <span class="sm-label">竞技场</span>
            <n-switch v-model:value="settings.arenaEnable" />
          </div>
          <div class="sm-row">
            <span class="sm-label">开宝箱</span>
            <n-switch v-model:value="settings.openBox" />
          </div>
          <div class="sm-row">
            <span class="sm-label">领取邮件奖励</span>
            <n-switch v-model:value="settings.claimEmail" />
          </div>
          <div class="sm-row">
            <span class="sm-label">黑市购买物品</span>
            <n-switch v-model:value="settings.blackMarketPurchase" />
          </div>
          <div class="sm-row">
            <span class="sm-label">付费招募</span>
            <n-switch v-model:value="settings.payRecruit" />
          </div>
        </section>
      </div>
    </n-modal>

    <!-- 任务详情模态框 -->
    <n-modal
      v-model:show="showTaskDetails"
      preset="card"
      title="每日任务详情"
      class="m-taskdetail"
      style="width: 90%; max-width: 360px"
    >
      <template #header>
        <div class="modal-header">
          <n-icon>
            <Calendar />
          </n-icon>
          <span>每日任务详情</span>
          <button
            class="refresh-button"
            :disabled="busy"
            @click="handleRefreshTaskStatus"
          >
            <n-icon>
              <Refresh />
            </n-icon>
            刷新状态
          </button>
        </div>
      </template>

      <div class="td-body">
        <!-- 汇总：完成数 + 4px 进度条，一眼看完整体，不必一行行数绿块 -->
        <div class="td-sum">
          <div class="td-sum-row">
            <span class="td-sum-n">
              {{ doneCount }}<small> / {{ tasks.length }}</small>
            </span>
            <span class="td-sum-lb">已完成</span>
          </div>
          <div class="td-bar">
            <i
              :style="{
                width: (doneCount / (tasks.length || 1)) * 100 + '%',
              }"
            ></i>
          </div>
        </div>

        <div class="td-list">
          <div
            v-for="task in tasks"
            :key="task.id"
            class="td-row"
            :class="{ 'is-done': task.completed }"
          >
            <n-icon class="td-ico">
              <CheckmarkCircle v-if="task.completed" />
              <EllipseOutline v-else />
            </n-icon>
            <span class="td-main">
              <span class="td-name">{{ task.name }}</span>
              <span v-if="task.hint" class="td-hint">{{ task.hint }}</span>
            </span>
            <span class="td-state">
              {{ task.completed ? "已完成" : "未完成" }}
            </span>
          </div>
        </div>
      </div>
    </n-modal>

    <!-- 执行日志模态框 -->
    <n-modal
      v-model:show="showLog"
      preset="card"
      title="任务执行日志"
      style="width: 90%; max-width: 450px"
    >
      <template #header>
        <div class="modal-header">
          <n-icon>
            <DocumentText />
          </n-icon>
          <span>任务执行日志</span>
        </div>
      </template>

      <div ref="logContainer" class="log-container">
        <div
          v-for="logItem in logList"
          :key="logItem.time + logItem.message"
          class="log-item"
        >
          <span class="log-time">{{ logItem.time }}</span>
          <span
            class="log-message"
            :class="{
              error: logItem.type === 'error',
              success: logItem.type === 'success',
              warning: logItem.type === 'warning',
            }"
          >
            {{ logItem.message }}
          </span>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { DailyTaskRunner } from "@/utils/dailyTaskRunner";
import { serverNowSec, serverNowMs } from "@/utils/serverClock";
import { useMessage } from "naive-ui";
import MIcon from "@/mobile/components/MIcon.vue";
import {
  Settings,
  Calendar,
  CheckmarkCircle,
  EllipseOutline,
  DocumentText,
  Refresh,
} from "@vicons/ionicons5";

const tokenStore = useTokenStore();
const message = useMessage();

// 响应式数据
const showSettings = ref(false);
const showTaskDetails = ref(false);
const showLog = ref(false);
const busy = ref(false);
const logContainer = ref(null);

// 任务设置
const settings = reactive({
  arenaFormation: 1,
  bossFormation: 1,
  bossTimes: 2,
  claimBottle: true,
  payRecruit: true,
  openBox: true,
  arenaEnable: true,
  claimHangUp: true,
  claimEmail: true,
  blackMarketPurchase: true,
  commandDelay: 500,
  taskDelay: 500,
});

// 每日任务列表
const tasks = ref([
  { id: 1, name: "登录一次游戏", completed: false, loading: false },
  { id: 2, name: "分享一次游戏", completed: false, loading: false },
  { id: 3, name: "赠送好友3次金币", completed: false, loading: false },
  { id: 4, name: "进行2次招募", completed: false, loading: false },
  { id: 5, name: "领取5次挂机奖励", completed: false, loading: false },
  { id: 6, name: "进行3次点金", completed: false, loading: false },
  { id: 7, name: "开启3次宝箱", completed: false, loading: false },
  {
    id: 12,
    name: "黑市购买1次物品",
    hint: "请先设置采购清单",
    completed: false,
    loading: false,
  },
  { id: 13, name: "进行1场竞技场战斗", completed: false, loading: false },
  { id: 14, name: "收获1个任意盐罐", completed: false, loading: false },
]);

// 选项配置
const formationOptions = [1, 2, 3, 4, 5, 6].map((v) => ({
  label: `阵容${v}`,
  value: v,
}));
const bossTimesOptions = [0, 1, 2, 3, 4].map((v) => ({
  label: `${v}次`,
  value: v,
}));

/* 详情弹窗顶部的进度汇总要用 */
const doneCount = computed(
  () => tasks.value.filter((t) => t.completed).length,
);

// 计算属性
const roleInfo = computed(() => {
  return tokenStore.selectedTokenRoleInfo;
});

const roleDailyPoint = computed(() => {
  return roleInfo.value?.role?.dailyTask?.dailyPoint ?? 0;
});

const dailyPoint = computed(() => Math.min(roleDailyPoint.value, 100));
const isFull = computed(() => dailyPoint.value >= 100);
/* 进度条只认主题色（--m-primary）。满进度原先切到 --m-green，
   全站「只有一个行动色」的规则被破掉，皮肤换色时也跟不上。 */
const progressColor = computed(() => "var(--m-primary)");

// WebSocket连接状态
const isConnected = computed(() => {
  if (!tokenStore.selectedToken) return false;
  const status = tokenStore.getWebSocketStatus(tokenStore.selectedToken.id);
  return status === "connected";
});

// 日志系统
const logList = ref([]);
const LOG_MAX = 500;

const log = (message, type = "info") => {
  const time = new Date().toLocaleTimeString();
  logList.value.push({ time, message, type });

  if (logList.value.length > LOG_MAX) {
    logList.value.splice(0, logList.value.length - LOG_MAX);
  }

  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
};

// 同步服务器任务完成状态
const syncCompleteFromServer = (resp) => {
  if (!resp?.role?.dailyTask?.complete) {
    log("角色信息中无任务完成数据", "warning");
    return;
  }

  const complete = resp.role.dailyTask.complete;
  const isDone = (v) => v === -1;

  log("开始同步任务完成状态...");
  log(`服务器返回的任务完成数据: ${JSON.stringify(complete)}`);

  let syncedCount = 0;
  let completedCount = 0;

  // 先重置所有任务为未完成，然后根据服务器数据更新
  tasks.value.forEach((task) => {
    task.completed = false;
  });

  // 同步服务器返回的完成状态
  Object.keys(complete).forEach((k) => {
    const id = Number(k);
    const idx = tasks.value.findIndex((t) => t.id === id);

    if (idx >= 0) {
      const isCompleted = isDone(complete[k]);
      tasks.value[idx].completed = isCompleted;
      syncedCount++;

      if (isCompleted) {
        completedCount++;
      }

      log(
        `任务${id} "${tasks.value[idx].name}": ${isCompleted ? "已完成" : "未完成"}`,
        isCompleted ? "success" : "info",
      );
    } else {
      log(`服务器返回未知任务ID: ${id} (完成值: ${complete[k]})`, "warning");
    }
  });

  log(`任务状态同步完成: ${completedCount}/${syncedCount} 已完成`);
  log(`当前进度: ${roleDailyPoint.value}/100`);
};

// 刷新角色信息
const refreshRoleInfo = async () => {
  if (!tokenStore.selectedToken) {
    throw new Error("没有选中的Token");
  }

  const tokenId = tokenStore.selectedToken.id;
  log("正在获取角色信息...");

  try {
    const response = await tokenStore.sendGetRoleInfo(tokenId);
    log("角色信息获取成功", "success");

    // 同步任务状态
    if (response) {
      syncCompleteFromServer(response);
    }

    return response;
  } catch (error) {
    log(`获取角色信息失败: ${error.message}`, "error");
    throw error;
  }
};

// 一键补差主函数
const runDailyFix = async () => {
  if (!tokenStore.selectedToken || busy.value) {
    message.warning("没有选中Token或正在执行中");
    return;
  }

  if (!isConnected.value) {
    message.error("WebSocket连接未建立，请检查连接状态");
    return;
  }

  busy.value = true;
  showLog.value = true;
  logList.value = [];

  try {
    log("=== 开始执行一键补差任务 ===");

    // 使用 DailyTaskRunner 执行任务
    const runner = new DailyTaskRunner(tokenStore, {
      commandDelay: settings.commandDelay,
      taskDelay: settings.taskDelay,
    });

    await runner.run(
      tokenStore.selectedToken.id,
      {
        onLog: (logItem) => log(logItem.message, logItem.type),
        onProgress: (progress) => {
          log(`任务进度: ${progress}%`);
        },
      },
      settings,
    ); // 传入当前组件的响应式 settings

    log("=== 任务执行完成 ===", "success");
    message.success("每日任务补差执行完成");

    // 最终刷新角色信息
    setTimeout(async () => {
      try {
        await refreshRoleInfo();
        log("最终角色信息刷新完成", "success");
      } catch (error) {
        log(`最终刷新失败: ${error.message}`, "warning");
      }
    }, 3000);
  } catch (error) {
    log(`任务执行失败: ${error.message}`, "error");
    console.error("详细错误信息:", error);
    message.error(`任务执行失败: ${error.message}`);
  } finally {
    busy.value = false;
  }
};

// 刷新任务状态
const handleRefreshTaskStatus = async () => {
  if (!isConnected.value) {
    message.warning("WebSocket未连接，无法刷新任务状态");
    return;
  }

  try {
    log("手动刷新任务状态...");
    await refreshRoleInfo();
    message.success("任务状态刷新成功");
  } catch (error) {
    log(`刷新失败: ${error.message}`, "error");
    message.error(`刷新失败: ${error.message}`);
  }
};

// 辅助函数
const getCurrentRole = () => {
  return tokenStore.selectedToken
    ? { roleId: tokenStore.selectedToken.id }
    : null;
};

const loadSettings = (roleId) => {
  try {
    const raw = localStorage.getItem(`daily-settings:${roleId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Failed to load settings:", error);
    return null;
  }
};

const saveSettings = (roleId, s) => {
  try {
    localStorage.setItem(`daily-settings:${roleId}`, JSON.stringify(s));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
};

// 监听设置变化
watch(
  settings,
  (cur) => {
    const role = getCurrentRole();
    if (role) saveSettings(role.roleId, cur);
  },
  { deep: true },
);

// 监听token选择变化
watch(
  () => tokenStore.selectedToken,
  async (newToken, oldToken) => {
    if (newToken && newToken !== oldToken) {
      log(`切换到Token: ${newToken.name}`);

      // 加载新token的设置
      const saved = loadSettings(newToken.id);
      if (saved) Object.assign(settings, saved);

      // 如果WebSocket已连接，尝试获取最新角色信息
      if (isConnected.value) {
        try {
          await refreshRoleInfo();
        } catch (error) {
          console.warn("切换token后获取角色信息失败:", error.message);
        }
      }
    }
  },
  { immediate: true },
);

// 监听角色信息变化，自动同步任务状态
watch(
  () => tokenStore.selectedTokenRoleInfo,
  (newRoleInfo) => {
    if (newRoleInfo?.role?.dailyTask?.complete) {
      log("角色信息更新，同步任务状态");
      syncCompleteFromServer(newRoleInfo);
    }
  },
  { immediate: true, deep: true },
);

// 生命周期
onMounted(async () => {
  log("组件初始化完成");

  // 首次拉取角色信息（如果有选中的token且已连接）
  if (tokenStore.selectedToken && isConnected.value) {
    try {
      await refreshRoleInfo();
    } catch (error) {
      console.warn("初始化时获取角色信息失败:", error.message);
    }
  }

  const role = getCurrentRole();
  if (role) {
    const saved = loadSettings(role.roleId);
    if (saved) Object.assign(settings, saved);
  }

  // 初始化时的任务状态同步会通过 watch selectedTokenRoleInfo 自动处理
});

onBeforeUnmount(() => {
  log("组件即将卸载");
});

/* ============================================================
 * 方案 A：四行「运行状态」
 * 原先首页摞三张卡（每日任务 216px / 挂机 178 / 盐罐 108），首屏露不完，
 * 第四项（功法）根本没地方放。四条信息结构完全一样：一件事 + 一个倒数 + 一两个动作，
 * 本来就是一张列表的四行 —— 这里把三张卡的数据与动作收进一个组件，功法是新增的第四行。
 * ============================================================ */
const open = ref(-1);
/* 按压态自己接管：安卓上「点完松手仍是 :active」是全站叠色那套规则的死角
 * （元素在 touchend 后被重渲染，WebView 不保证补发 mouseup，:active 就挂住了）。
 * 所以行挂 .m-veil-off 退出全站叠色，按下/抬起由 pointer 事件记账，CSS 只认 .pressed。 */
const press = ref(-1);
const toggle = (i) => {
  press.value = -1;
  open.value = open.value === i ? -1 : i;
  /* 功法数据不在 roleInfo 里，展开时顺手拉一次（比定时轮询省） */
  if (open.value === 3) refreshLegacy();
};

const fmtClock = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(total / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`;
};

/* ★★ 时间单位陷阱（这套协议里混着两种单位，必须在这里收口）：
 *   - 秒：role.hangUp.lastTime（挂机开始）、role.bottleHelpers.helperStopTime（盐罐结束）
 *   - 毫秒：roleLegacy.hangUpBeginTime / createLevelEndTime
 *     判据在游戏包里：isExploreFinish 里直接 `hangUpBeginTime + getHangUpMaxTime()` 再和
 *     `serverTime` 比较，而 getHangUpMaxTime() 返回 `1e3 × produceTimeMax`（毫秒）⇒ 三者同为毫秒。
 *   教训：按秒处理毫秒值 ⇒ `now − begin` 得到巨大负数 ⇒ 被 Math.max(0,…) 夹成 0，
 *   界面表现就是「已探索」永远停在 1 分钟左右（只跟着定时器每秒 +1）。
 *   1e11 秒 ≈ 公元 5138 年，超过就只可能是毫秒。
 * ★ 为什么归一到**毫秒**而不是秒：面板是在毫秒上先相减/夹断、最后才 floor 成秒
 *   （`getFormatBySecond(ms)`），所以它的「已探索 + 剩余」常常显示成 05:59:59 而不是 06:00:00。
 *   我们先截成整数秒再相减就会差 1 秒，跟面板对不上。保留毫秒、末端才 floor，才是逐秒一致。 */
const asMs = (v) => {
  const n = Number(v) || 0;
  if (n <= 0) return 0;
  return n > 1e11 ? Math.floor(n) : Math.floor(n * 1000);
};

/* ---------- 挂机：服务端给「开始时刻 + 总时长」，剩余与已挂在本地算 ---------- */
const hangUp = ref({
  isActive: false,
  remaining: 0,
  elapsed: 0,
  lastTime: 0, // 挂机开始时刻（秒），心跳按它重算，不靠累加
  total: 0, // 挂机总时长（秒）
  isExtending: false,
  isClaiming: false,
});
const syncHangUp = () => {
  const role = roleInfo.value?.role;
  if (!role?.hangUp) return;
  /* ★ 用服务器时间，不用 Date.now()：游戏面板算倒计时用的是它自己的 serverTime
     （由每条下行报文的 time 对齐），手机时钟偏了面板不会跟着偏，我们跟它对齐才一致。 */
  const now = serverNowSec();
  const total = Number(role.hangUp.hangUpTime) || 0;
  const used = Math.max(0, now - (Number(role.hangUp.lastTime) || 0));
  hangUp.value.lastTime = Number(role.hangUp.lastTime) || 0;
  hangUp.value.total = total;
  hangUp.value.isActive = used < total;
  hangUp.value.remaining = Math.max(0, Math.floor(total - used));
  hangUp.value.elapsed = Math.floor(Math.min(used, total));
};
watch(roleInfo, syncHangUp, { deep: true, immediate: true });

const extendHangUp = async () => {
  if (!tokenStore.selectedToken) return message.warning("请先选择Token");
  const tokenId = tokenStore.selectedToken.id;
  hangUp.value.isExtending = true;
  message.info("正在加钟...");
  try {
    for (let i = 0; i < 4; i++) {
      if (i) await new Promise((r) => setTimeout(r, 300));
      tokenStore.sendMessage(tokenId, "system_mysharecallback", {
        isSkipShareCard: true,
        type: 2,
      });
    }
    setTimeout(() => tokenStore.sendMessage(tokenId, "role_getroleinfo"), 1500);
    setTimeout(() => {
      hangUp.value.isExtending = false;
      message.success("加钟操作已完成，请查看挂机剩余时间");
    }, 2500);
  } catch (e) {
    hangUp.value.isExtending = false;
    message.error("加钟操作失败: " + (e?.message || "未知错误"));
  }
};

const claimHangUpReward = async () => {
  if (!tokenStore.selectedToken) return message.warning("请先选择Token");
  const tokenId = tokenStore.selectedToken.id;
  hangUp.value.isClaiming = true;
  message.info("正在领取挂机奖励...");
  try {
    tokenStore.sendMessage(tokenId, "system_mysharecallback");
    setTimeout(
      () => tokenStore.sendMessage(tokenId, "system_claimhangupreward"),
      200,
    );
    setTimeout(
      () =>
        tokenStore.sendMessage(tokenId, "system_mysharecallback", {
          isSkipShareCard: true,
          type: 2,
        }),
      400,
    );
    setTimeout(() => tokenStore.sendMessage(tokenId, "role_getroleinfo"), 600);
    setTimeout(() => {
      hangUp.value.isClaiming = false;
      message.success("挂机奖励领取完成");
    }, 1200);
  } catch (e) {
    hangUp.value.isClaiming = false;
    message.error("领取挂机奖励失败: " + (e?.message || "未知错误"));
  }
};

/* ---------- 盐罐机器人：只给结束时刻 helperStopTime ---------- */
const bottle = ref({ isRunning: false, remaining: 0, stopTime: 0 });
const syncBottle = () => {
  const role = roleInfo.value?.role;
  if (!role?.bottleHelpers) return;
  const stop = Number(role.bottleHelpers.helperStopTime) || 0;
  const left = Math.max(0, Math.floor(stop - serverNowSec()));
  bottle.value.stopTime = stop;
  bottle.value.isRunning = left > 0;
  bottle.value.remaining = left;
};
watch(roleInfo, syncBottle, { deep: true, immediate: true });

const toggleBottle = () => {
  if (!tokenStore.selectedToken) return message.warning("请先选择Token");
  const tokenId = tokenStore.selectedToken.id;
  const wasRunning = bottle.value.isRunning;
  if (wasRunning) tokenStore.sendMessage(tokenId, "bottlehelper_stop");
  setTimeout(() => {
    tokenStore.sendMessage(tokenId, "bottlehelper_start");
    tokenStore.sendMessage(tokenId, "role_getroleinfo");
  }, wasRunning ? 500 : 0);
  message.info(wasRunning ? "重启盐罐机器人" : "启动盐罐机器人");
};

/* ---------- 功法（残卷探索）----------
 * 数据链路（从游戏包反查得到，不是猜的）：
 *   ① 唯一指令就是 `legacy_getinfo`（响应 `legacy_getinforesp`），它填 SERVER_DATA.roleLegacy；
 *      我们需要的字段全在里头：hangUpBeginTime（探索开始时刻）、produceLevelId（探索等级）、
 *      produceItemCnt（已产出的残卷数，>0 即可领）、createLevelEndTime / createLevelId（传承创作等级）。
 *   ② 界面上那三行数字是**客户端算的**（游戏包 LegacyHangUpComp._refresh）：
 *        已探索 = min(serverTime − hangUpBeginTime, max)
 *        剩余   = max(hangUpBeginTime + max − serverTime, 0)
 *      max = getHangUpMaxTime() = 1000 × LegacyDreamDustConf[produceLevelId].produceTimeMax
 *                                (+ 1000 × 特权 collectTimeAdd)
 *   ③ ★ max 不是接口返回的，是**配置表**：客户端从配置包（ConstantURI.ConfigData，json + lz4）
 *      里读，跟 WS 指令无关，所以「多一条命令就能拿到剩余时间」这条路不存在。
 *      能拿到的只有开始时刻 —— 和盐罐的 helperStopTime（服务端算好的绝对结束时刻）不同。
 *   ④ 于是按盐罐同样的思路：时长拿一次，之后自己倒数。
 *      时长从游戏面板反推（3 级两次读数都是互补到 5:59:59）：
 *        00:04:56 + 05:55:03 = 5:59:59
 *        00:30:17 + 05:29:42 = 5:59:59  ⇒ produceTimeMax(3) = 21600s
 *      ★ 换了探索等级若时长不同，在 LEGACY_TOTAL_BY_LEVEL 里加一行即可（不用改逻辑）。
 *      ★ 也可以在 localStorage 写 { "<produceLevelId>": 秒数 } 覆盖（调试/临时用）。 */
const LEGACY_TOTAL_BY_LEVEL = { 3: 21600 };
const LEGACY_TOTAL_FALLBACK = 21600;
const legacyTotalOf = (level) => {
  try {
    const saved = JSON.parse(localStorage.getItem("legacy_explore_total") || "{}");
    if (saved && Number(saved[level]) > 0) return Number(saved[level]);
  } catch (e) {
    /* 手写坏了就当没写 */
  }
  return LEGACY_TOTAL_BY_LEVEL[level] || LEGACY_TOTAL_FALLBACK;
};

const legacy = ref({
  beginMs: 0, // 探索开始时刻（毫秒，原样保存，面板口径）
  elapsed: 0,
  remaining: 0,
  total: LEGACY_TOTAL_FALLBACK, // 秒
  upgradeLeft: 0,
  upgradeEndMs: 0, // 传承创作结束时刻（毫秒）
  isUpgrading: false,
  produceLevel: 0,
  createLevel: 0,
  produce: 0,
  loaded: false,
  claiming: false,
});
/* asMs 定义在文件上方「时间工具」区（fmtClock 之后），这里直接用，别再重复声明 */

const pickLegacy = (resp) =>
  resp?.roleLegacy ||
  resp?.data?.roleLegacy ||
  resp?.info?.roleLegacy ||
  resp?.legacy ||
  null;
const syncLegacy = (rl) => {
  if (!rl) return;
  /* ★ 口径照抄游戏包 LegacyHangUpComp._refreshExploreTime：
   *     elapsed   = floor(clamp(serverTime − hangUpBeginTime, 0, max) / 1000)
   *     remaining = floor(max(hangUpBeginTime + max − serverTime, 0) / 1000)
   *   注意三点：
   *     ① now 必须是**服务器时间**（游戏用它自己的 serverTime，不是 Date.now）；
   *     ② elapsed 要按 max 夹一次，否则满了还会继续涨，跟不上面板上的「已满」；
   *     ③ 全程用毫秒、末端才 floor —— 先把 begin 截成秒再相减，读数会跟面板差 1 秒。 */
  const nowMs = serverNowMs();
  const beginMs = asMs(rl.hangUpBeginTime);
  const endMs = asMs(rl.createLevelEndTime);
  /* ★ 两个等级别弄混：produceLevelId = 探索等级（配置表按它查时长）；
     createLevelId = 传承创作等级（管可领取的书/背包上限）。之前在界面上用错的正是后者。 */
  const produceLevel = Number(rl.produceLevelId) || 0;
  const total = legacyTotalOf(produceLevel);
  const totalMs = total * 1000;
  legacy.value.beginMs = beginMs;
  legacy.value.produceLevel = produceLevel;
  legacy.value.createLevel = Number(rl.createLevelId) || 0;
  legacy.value.total = total;
  legacy.value.elapsed = beginMs > 0
    ? Math.floor(Math.min(Math.max(nowMs - beginMs, 0), totalMs) / 1000)
    : 0;
  legacy.value.remaining = beginMs > 0
    ? Math.max(0, Math.floor((beginMs + totalMs - nowMs) / 1000))
    : 0;
  legacy.value.upgradeEndMs = endMs;
  legacy.value.upgradeLeft = Math.max(0, Math.floor((endMs - nowMs) / 1000));
  legacy.value.isUpgrading = legacy.value.upgradeLeft > 0;
  legacy.value.produce = Number(rl.produceItemCnt) || 0;
  legacy.value.loaded = true;
};
const refreshLegacy = async () => {
  const token = tokenStore.selectedToken;
  if (!token || !isConnected.value) return;
  try {
    const resp = await tokenStore.sendMessageWithPromise(
      token.id,
      "legacy_getinfo",
      {},
      6000,
    );
    syncLegacy(pickLegacy(resp));
  } catch (e) {
    /* 未解锁 / 超时都不该打断首页，静默 */
  }
};
/* 右侧永远是一个时间：升级中显示升级剩余，否则显示剩余探索 */
const legacyText = computed(() => {
  if (legacy.value.isUpgrading) return fmtClock(legacy.value.upgradeLeft);
  return fmtClock(legacy.value.remaining);
});

const claimLegacy = async () => {
  if (!tokenStore.selectedToken) return message.warning("请先选择Token");
  const tokenId = tokenStore.selectedToken.id;
  legacy.value.claiming = true;
  try {
    await tokenStore.sendMessageWithPromise(
      tokenId,
      "legacy_claimhangup",
      {},
      6000,
    );
    message.success("残卷已领取");
    await refreshLegacy();
    tokenStore.sendMessage(tokenId, "role_getroleinfo");
  } catch (e) {
    message.error("领取残卷失败: " + (e?.message || "未知错误"));
  } finally {
    legacy.value.claiming = false;
  }
};

watch(isConnected, (v) => {
  if (v) refreshLegacy();
});

/* 一个 1s 心跳同时走四行：倒数 -=1，已探索 +=1（不要四条各自起定时器） */
let tickTimer = null;
onMounted(() => {
  tickTimer = setInterval(() => {
    if (hangUp.value.total > 0) {
      /* 同功法：从开始时刻重算（息屏节流下 +=1 会走慢） */
      const now = serverNowSec();
      const used = Math.max(0, now - hangUp.value.lastTime);
      hangUp.value.isActive = used < hangUp.value.total;
      hangUp.value.remaining = Math.max(
        0,
        Math.floor(hangUp.value.total - used),
      );
      hangUp.value.elapsed = Math.floor(Math.min(used, hangUp.value.total));
    }
    if (bottle.value.stopTime > 0) {
      /* 盐罐有服务端给的绝对结束时刻，直接拿它减 */
      bottle.value.remaining = Math.max(
        0,
        Math.floor(bottle.value.stopTime - serverNowSec()),
      );
      bottle.value.isRunning = bottle.value.remaining > 0;
    }
    if (legacy.value.upgradeEndMs > 0) {
      /* 传承创作也有绝对结束时刻，照盐罐的方式算 */
      legacy.value.upgradeLeft = Math.max(
        0,
        Math.floor((legacy.value.upgradeEndMs - serverNowMs()) / 1000),
      );
      legacy.value.isUpgrading = legacy.value.upgradeLeft > 0;
    }
    if (legacy.value.beginMs > 0) {
      /* ★ 从「开始时刻」重算，不要每秒 +=1 累加：手机息屏后定时器被节流，
         累加会越走越慢（游戏面板按 serverTime 重算，所以它不会歪）。重算永远自愈。
         毫秒全程、末端 floor，与面板逐秒一致（面板也常显示 05:59:59 而不是 06:00:00）。 */
      const nowMs = serverNowMs();
      const totalMs = legacy.value.total * 1000;
      legacy.value.elapsed = Math.floor(
        Math.min(Math.max(nowMs - legacy.value.beginMs, 0), totalMs) / 1000,
      );
      legacy.value.remaining = Math.max(
        0,
        Math.floor((legacy.value.beginMs + totalMs - nowMs) / 1000),
      );
    }
  }, 1000);
  refreshLegacy();
});
onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<style scoped lang="scss">
// 模态框样式
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  width: 100%;
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--border-light);
  border-radius: var(--border-radius-medium);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.settings-content {
  padding: var(--spacing-sm) 0;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.setting-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.setting-switches {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.switch-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.task-item-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.task-status-icon {
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);

  &.completed {
    color: var(--success-color);
  }
}

.task-name {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.log-container {
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-medium);
  padding: var(--spacing-md);
  max-height: 360px;
  overflow-y: auto;
}

.log-item {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
  font-size: var(--font-size-sm);
}

.log-time {
  color: var(--text-tertiary);
  min-width: 72px;
  flex-shrink: 0;
}

.log-message {
  color: var(--text-secondary);

  &.error {
    color: var(--error-color);
  }

  &.success {
    color: var(--success-color);
  }

  &.warning {
    color:var(--m-amber);
  }
}

// 响应式设计
@media (max-width: 768px) {
  .refresh-button {
    font-size: var(--font-size-xs);
  }
}

/* ============================================================
 * 方案 A：运行状态四行（设计稿 design/home-status-card.html）
 * ★ 版式与「快捷入口」同一套：同卡片（--m-card + 1px 边 + --m-r-lg）、
 *   同发丝线（--m-band）、图标都是裸主题色线性图标（无底块）。
 * ★ 四行右列只放会变的数字，不再挂「剩余时间 / 完成度」小字 —— 四行一起挂会让行尾发挤。
 * ============================================================ */
.run-status {
  background: var(--m-card);
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-lg);
  overflow: hidden;
}
.rs-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid var(--m-band);
  cursor: pointer;
  transition: background 0.12s;

  &:first-child {
    border-top: 0;
  }
  /* 按压反馈由 pointer 事件记账（.pressed），不用 :active ——
     安卓上点完松手 :active 会挂住，全站叠色那条规则在这种会重渲染的行上不适用 */
  &.pressed {
    background: var(--m-band);
  }
}
/* 图标：与「快捷入口」一致 —— 裸主色线性图标，不要底块（去掉「框中框」） */
.rs-ic {
  width: auto;
  height: auto;
  flex: none;
  border-radius: 0;
  background: none;
  color: var(--m-primary);
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 20px;
    height: 20px;
    color: var(--m-primary);
  }
}
.rs-tx {
  flex: 1;
  min-width: 0;

  b {
    display: block;
    /* 与「快捷入口」的格子标签同一号（11px）：同一个屏上两块卡，字号不能各走一套 */
    font-size: 11px;
    font-weight: 500;
    line-height: 1.35;
    color: var(--m-text);
  }
  i {
    display: block;
    font-style: normal;
    font-size: 10px;
    line-height: 1.35;
    color: var(--m-text3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
.rs-val {
  flex: none;
  /* 与行标题同号（11.5 略大于 11 是为了等宽数字不糊），不再大一号：
     四行并列时数字本来就靠 tabular-nums 对齐，字号放大只会把行尾撑得很吵。 */
  font-size: 11.5px;
  font-weight: 500;
  color: var(--m-text);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
/* ★ 原先这里有个 `.rs-val.sm { font-size: 12px }`，给「可领取 / 探索中」这种文字状态用；
   右侧改成永远显示时间后它只剩副作用 —— 功法行（唯一还挂着 sm 的地方）数字比邻居小一号。删掉。 */
/* 状态点只用两种：主题色（有事在做 / 有待处理）+ 灰（空闲）。
   ★ 曾经有个 `&.warn { background: var(--m-amber) }` 给「可领残卷 / 快到期」用 ——
     `--m-amber` 只在 mobile.css 的 :root 与 dark 各定义一次，**没有按皮肤定义**，
     所以九套皮肤下它都是同一个橙，看得出来只有它一个点不跟主题。
     要警示语义就换说法（文案/图标），别在单色卡里插一个不跟皮肤的第三色。 */
.rs-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: var(--m-primary);

  &.idle {
    background: var(--m-text3);
    opacity: 0.45;
  }
}
.rs-chev {
  color: var(--m-text3);
  flex: none;
  transition: transform 0.18s;
}
.rs-row[aria-expanded="true"] .rs-chev {
  transform: rotate(90deg);
}
/* 展开条：上边距不能为 0，否则按钮贴着上一行的边界，看着跟上面粘成一块 */
.rs-acts {
  display: none;
  gap: 7px;
  padding: 4px 12px 10px;

  &.on {
    display: flex;
  }
}
.rs-btn {
  flex: 1;
  height: 29px;
  border-radius: 7px;
  border: 1px solid var(--m-border);
  background: transparent;
  color: var(--m-text2);
  font-size: 11.5px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
  }
  &.pri {
    background: var(--m-primary);
    border-color: transparent;
    color: var(--m-on-primary);
  }
}
</style>
