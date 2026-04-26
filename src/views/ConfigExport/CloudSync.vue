<template>
  <div class="">
    <!-- 警告提示 -->
    <n-alert type="warning" :show-icon="true" style="margin-bottom: 16px">
      <template #header>
        <strong>⚠️ 重要提示</strong>
      </template>
      <div style="color: var(--warning-color)">
        同步内容包含敏感信息，请确保云端环境安全。
      </div>
      <div style="color: var(--warning-color)">
        同步完成后，就可以在云端执行定时任务了。
      </div>
    </n-alert>
    <!-- 步骤条 -->
    <div class="step-container">
      <n-steps :current="syncComplete ? 3 : currentStep" size="small">
        <n-step title="身份验证" />
        <n-step title="确认同步" />
        <n-step title="同步完成" />
      </n-steps>
    </div>

    <!-- 步骤 1：输入 Token -->
    <div v-if="currentStep === 0" class="content">
      <n-alert type="info" :show-icon="true" style="margin-bottom: 20px">
        请输入您的访问令牌以继续操作
      </n-alert>

      <div class="token-input">
        <n-input
          v-model:value="token"
          type="password"
          placeholder="请输入 Token (例如: sk-1234567890abcdef)"
          size="large"
          :status="tokenError ? 'error' : ''"
          @input="clearTokenError"
        >
          <template #prefix> 🔑 </template>
        </n-input>
        <p
          v-if="tokenError"
          style="color: #ef4444; font-size: 13px; margin: 8px 0 0 0"
        >
          请输入有效的 Token
        </p>
      </div>

      <n-button
        type="primary"
        size="large"
        block
        @click="nextStep"
        :disabled="!token.trim()"
        style="height: 48px; font-size: 16px"
      >
        下一步 →
      </n-button>
    </div>

    <!-- 步骤 2：确认同步 -->
    <div v-if="currentStep === 1" class="content">
      <n-alert type="warning" :show-icon="true" style="margin-bottom: 20px">
        请确认以下同步内容
      </n-alert>

      <div class="sync-list">
        <div v-for="(item, index) in syncItems" :key="index" class="sync-item">
          <span class="sync-icon">{{ item.icon }}</span>
          <span>{{ item.name }}</span>
        </div>
      </div>

      <n-button
        type="primary"
        size="large"
        block
        @click="startSync"
        style="height: 48px; font-size: 16px"
      >
        🚀 开始同步
      </n-button>
    </div>

    <!-- 步骤 3：同步进度 -->
    <div v-if="currentStep === 2" class="content">
      <div v-if="!syncComplete && !syncError">
        <div style="text-align: center; margin-bottom: 24px">
          <n-spin size="large" />
          <h3 style="margin: 16px 0 8px 0; color: #1f2937">正在同步中...</h3>
          <p style="margin: 0; color: #6b7280">{{ currentItem }}</p>
        </div>

        <div class="progress-section">
          <div class="progress-text">
            <span>同步进度</span>
            <span>{{ progress }}%</span>
          </div>
          <n-progress
            :percentage="progress"
            :show-indicator="false"
            status="success"
            :height="10"
            style="border-radius: 5px"
          />
          <div class="progress-text">
            <span>当前步骤</span>
            <span>{{ currentIndex + 1 }} / {{ syncItems.length }}</span>
          </div>
        </div>

        <div class="status-text">预计剩余时间：{{ remainingTime }} 秒</div>
      </div>

      <div v-else-if="syncError">
        <div class="error-icon">❌</div>
        <h3 style="text-align: center; color: #dc2626; margin-bottom: 8px">
          同步失败
        </h3>
        <n-alert type="error" :show-icon="true" style="margin-bottom: 24px">
          <p style="margin: 0; word-break: break-all">{{ syncError }}</p>
        </n-alert>
        <n-button
          type="primary"
          size="large"
          block
          @click="reset"
          style="height: 48px; font-size: 16px"
        >
          重新开始
        </n-button>
      </div>

      <div v-else>
        <div class="success-icon">🎉</div>
        <h3 style="text-align: center; color: #1f2937; margin-bottom: 8px">
          同步完成！
        </h3>
        <p style="text-align: center; color: #6b7280; margin-bottom: 24px">
          所有数据已成功同步到云端
        </p>
        <n-button
          type="primary"
          size="large"
          block
          @click="reset"
          style="height: 48px; font-size: 16px"
        >
          重新开始
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import {
  NSteps,
  NStep,
  NInput,
  NButton,
  NAlert,
  NProgress,
  NSpin,
} from "naive-ui";
import { useMessage } from "naive-ui";

// 响应式状态
const currentStep = ref(0);
const token = ref("");
const tokenError = ref(false);
const actorId = ref("");
const syncError = ref(null);

const syncItems = ref([
  { name: "创建虚拟环境", icon: "🌐" },
  { name: "构建虚拟环境", icon: "👤" },
  { name: "同步配置信息", icon: "⚙️" },
  { name: "同步定时任务", icon: "⏰" },
]);

const currentIndex = ref(0);
const syncComplete = ref(false);

// 计算属性
const progress = computed(() => {
  const completedSteps = currentIndex.value;
  const totalSteps = syncItems.value.length;
  return Math.round((completedSteps / totalSteps) * 100);
});

const currentItem = computed(() => {
  return syncItems.value[currentIndex.value]?.name || "同步完成";
});

const remainingTime = computed(() => {
  const remainingSteps = syncItems.value.length - currentIndex.value;
  return Math.max(0, (remainingSteps - 1) * 1.2).toFixed(1);
});

// 获取 message 实例
const message = useMessage();

// 获取完整的状态数据
const getStateData = async () => {
  /**
   * 获取完整的状态数据
   */
  // 获取localStorage数据
  const localStorageData = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    localStorageData[key] = localStorage.getItem(key);
  }
  console.info(
    `获取到 ${Object.keys(localStorageData).length} 项localStorage数据`,
  );

  // 获取IndexedDB数据
  console.info("开始获取IndexedDB数据...");
  const indexedDBData = await new Promise((resolve) => {
    const result = { databases: [] };

    const getAllDatabases = indexedDB.databases
      ? indexedDB.databases()
      : Promise.resolve([]);

    getAllDatabases
      .then((dbs) => {
        const dbPromises = dbs.map((db) => {
          if (!db.name) return Promise.resolve(null);

          return new Promise((resolveDb) => {
            const request = indexedDB.open(db.name, db.version);

            request.onsuccess = (event) => {
              const database = event.target.result;
              const storeNames = database.objectStoreNames;
              const stores = [];

              const storePromises = [];
              for (let i = 0; i < storeNames.length; i++) {
                const storeName = storeNames[i];
                storePromises.push(
                  new Promise((storeResolve) => {
                    const transaction = database.transaction(
                      [storeName],
                      "readonly",
                    );
                    const store = transaction.objectStore(storeName);
                    const dataRequest = store.getAll();

                    const storeInfo = {
                      name: storeName,
                      keyPath: store.keyPath,
                      indexes: [],
                      data: [],
                    };

                    // 获取所有索引
                    for (let j = 0; j < store.indexNames.length; j++) {
                      const indexName = store.indexNames[j];
                      const index = store.index(indexName);
                      storeInfo.indexes.push({
                        name: indexName,
                        keyPath: index.keyPath,
                        unique: index.unique,
                      });
                    }

                    dataRequest.onsuccess = (dataEvent) => {
                      const items = dataEvent.target.result;
                      const processedItems = items.map((item) => {
                        return JSON.parse(
                          JSON.stringify(item, (key, value) => {
                            if (value instanceof ArrayBuffer) {
                              const uint8Array = new Uint8Array(value);
                              let binary = "";
                              for (let k = 0; k < uint8Array.byteLength; k++) {
                                binary += String.fromCharCode(uint8Array[k]);
                              }
                              return {
                                __type__: "ArrayBuffer",
                                data: btoa(binary),
                              };
                            }
                            return value;
                          }),
                        );
                      });
                      storeInfo.data = processedItems;
                      stores.push(storeInfo);
                      storeResolve();
                    };

                    dataRequest.onerror = () => {
                      storeInfo.data = [];
                      stores.push(storeInfo);
                      storeResolve();
                    };
                  }),
                );
              }

              Promise.all(storePromises).then(() => {
                database.close();
                resolveDb({ name: db.name, version: db.version, stores });
              });
            };

            request.onerror = () => {
              resolveDb(null);
            };
          });
        });

        Promise.all(dbPromises).then((results) => {
          result.databases = results.filter(Boolean);
          resolve(result);
        });
      })
      .catch(() => {
        resolve({ databases: [] });
      });
  });

  const dbCount = indexedDBData.databases.length;
  console.info(`成功获取 ${dbCount} 个IndexedDB数据库`);

  // 构建完整的状态数据
  const stateData = {
    cookies: [],
    localStorage: localStorageData,
    indexedDB: indexedDBData,
    exportedAt: new Date().toISOString(),
  };

  return stateData;
};

// 方法
const clearTokenError = () => {
  if (tokenError.value) {
    tokenError.value = false;
  }
};

const nextStep = () => {
  if (!token.value.trim()) {
    tokenError.value = true;
    return;
  }
  tokenError.value = false;
  currentStep.value = 1;
};

const startSync = async () => {
  currentStep.value = 2;
  currentIndex.value = 0;
  syncComplete.value = false;
  syncError.value = null;

  try {
    const actorResult = await createActor();
    if (!actorResult) {
      return;
    }
    currentIndex.value++;

    const buildResult = await buildActor();
    if (!buildResult) {
      return;
    }
    currentIndex.value++;

    const stateResult = await syncStateData();
    if (!stateResult) {
      return;
    }
    currentIndex.value++;

    const scheduleResult = await syncSchedules();
    if (!scheduleResult) {
      return;
    }
    currentIndex.value++;

    syncComplete.value = true;
  } catch (err) {
    console.error("同步过程出错:", err);
    syncError.value = err.message || "同步过程中发生未知错误";
  }
};

const APIFY_BASE = "https://api.apify.com/v2";

async function request(path, options) {
  options = options || {};
  const res = await fetch(APIFY_BASE + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + token.value.trim(),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.error?.message || "未知错误");
  }
  return json;
}

// 实现 createActor 函数，调用 Apify API 创建 actor
const createActor = async () => {
  try {
    let res = await request("/acts");
    let actor = res?.data?.items?.find((a) => a.name === "KOFA");
    if (!actor) {
      res = await request("/acts", {
        method: "POST",
        body: JSON.stringify({
          name: "KOFA",
          description: "KOFA actor",
          title: "KOFA",
          isPublic: false,
          defaultRunOptions: {
            build: "latest",
            timeoutSecs: 3600,
            memoryMbytes: 512,
          },
          versions: [
            {
              versionNumber: "0.0",
              sourceType: "TARBALL",
              tarballUrl: "https://assitant.pages.dev/actor.zip",
              envVars: [{ name: "TZ", value: "Asia/Shanghai" }],
            },
          ],
        }),
      });
      actor = res.data;
      console.info(`成功创建 actor: ${actor.name}`);
    }
    actorId.value = actor.id;
    return true;
  } catch (err) {
    console.error("创建 actor 时发生网络异常:", err);
    syncError.value = "创建虚拟环境失败: " + (err.message || "未知错误");
    return false;
  }
};

// 实现 buildActor 函数，调用 Apify API 构建 actor
const buildActor = async () => {
  console.info("开始构建 actor...");
  try {
    // 调用 Apify API 构建 actor
    const response = await request(
      `/acts/${actorId.value}/builds?version=0.0`,
      {
        method: "POST",
      },
    );
    console.info(`成功开始构建 actor，构建 ID: ${response.data.id}`);
    return true;
  } catch (err) {
    console.error("构建 actor 时发生网络异常:", err);
    syncError.value = "构建虚拟环境失败: " + (err.message || "未知错误");
    return false;
  }
};

// 实现 createSchedule 函数，调用 Apify API 创建定时任务
const createSchedule = async (task, cronExpression) => {
  console.info("开始创建定时任务...");
  try {
    // 调用 Apify API 创建定时任务
    const response = await request("/schedules", {
      method: "POST",
      body: JSON.stringify({
        name: `${task.id.replace("_", "-")}`, // 使用任务ID作为名称，避免汉字
        isEnabled: task.enabled,
        isExclusive: true,
        cronExpression: cronExpression,
        timezone: "Asia/Shanghai",
        description: `Schedule for task: ${task.name}`,
        title: `KOFSch-${task.name}`,
        actions: [
          {
            type: "RUN_ACTOR",
            actorId: actorId.value,
            runOptions: {
              build: "latest",
              memoryMbytes: 512,
              timeoutSecs: 3600,
            },
          },
        ],
      }),
    });
    console.info(`成功创建定时任务，ID: ${response.data.id}`);
    return true;
  } catch (err) {
    console.error("创建定时任务时发生网络异常:", err);
    return false;
  }
};

const updateSchedule = async (scheduleId, task, cronExpression) => {
  console.info(`开始更新定时任务 ${task.name}...`);
  try {
    // 调用 Apify API 更新定时任务
    const response = await request(`/schedules/${scheduleId}`, {
      method: "PUT",
      body: JSON.stringify({
        isEnabled: task.enabled,
        isExclusive: true,
        cronExpression: cronExpression,
        timezone: "Asia/Shanghai",
        description: `Schedule for task: ${task.name}`,
        title: `KOFSch-${task.name}`,
        actions: [
          {
            type: "RUN_ACTOR",
            actorId: actorId.value,
            runOptions: {
              build: "latest",
              memoryMbytes: 512,
              timeoutSecs: 3600,
            },
          },
        ],
      }),
    });
    console.info(`成功更新定时任务，ID: ${response.data.id}`);
    return true;
  } catch (err) {
    console.error("更新定时任务时发生网络异常:", err);
    return false;
  }
};

// 实现 syncSchedules 函数，从 stateData 中读取 scheduledTasks 并创建定时任务
const syncSchedules = async () => {
  console.info("开始同步定时任务...");
  try {
    const stateData = await getStateData();
    let scheduledTasks = [];
    try {
      const raw = stateData?.localStorage?.scheduledTasks;
      const parsed = JSON.parse(raw);
      scheduledTasks = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("解析 scheduledTasks 失败:", e);
      scheduledTasks = [];
    }

    if (scheduledTasks.length > 0) {
      console.info(`发现 ${scheduledTasks.length} 个定时任务`);
      const resp = await request("/schedules", {
        method: "GET",
      });
      const apifySchedules = resp.data.items || [];
      for (const task of scheduledTasks) {
        console.info(`处理定时任务: ${task.name}`);
        let cronExpression = task.cronExpression;
        if (task.runType === "daily" && task.runTime) {
          const [hour = 0, minute = 0] = task.runTime.split(":").map(Number);
          cronExpression = `${minute} ${hour} * * *`;
        }
        const existing = apifySchedules.find((schedule) => {
          return schedule.title === `KOFSch-${task.name}`;
        });
        if (existing) {
          // 检查是否相同（enable, cronExpression, actorId）
          const isSame =
            existing.isEnabled === task.enabled &&
            existing.cronExpression === cronExpression &&
            existing.actions?.[0]?.actorId === actorId.value;

          if (isSame) {
            console.info(`定时任务 ${task.name} 已存在且相同，跳过`);
            continue;
          } else {
            console.info(`定时任务 ${task.name} 已存在但不同，执行更新`);
            await updateSchedule(existing.id, task, cronExpression);
            continue;
          }
        }
        await createSchedule(task, cronExpression);
      }
    } else {
      console.info("未发现定时任务");
    }
  } catch (err) {
    console.error("同步定时任务时发生异常:", err);
    syncError.value = "同步定时任务失败: " + (err.message || "未知错误");
    return false;
  }
  console.info("定时任务同步完成");
  return true;
};

const syncStateData = async () => {
  /**
   * 将状态数据同步到 Apify Key-Value Store
   */
  console.info("开始同步状态数据到云端...");
  try {
    // 获取完整的状态数据
    const stateData = await getStateData();
    console.info("开始同步数据到 Apify Key-Value Store...");
    // 先创建一个 Key-Value Store
    console.info("正在创建 Key-Value Store...");
    const resp = await request("/key-value-stores?name=KOFS", {
      method: "POST",
    });
    const storeId = resp.data.id;
    console.info(`成功创建 Key-Value Store，ID: ${storeId}`);

    // 然后使用创建的 Store ID 同步数据
    console.info("开始同步数据到 Apify Key-Value Store...");
    const response = await request(
      `/key-value-stores/${storeId}/records/state.json`,
      {
        method: "PUT",
        body: JSON.stringify(stateData),
      },
    );
    return true;
  } catch (err) {
    console.error("同步状态数据时发生异常:", err);
    syncError.value = "同步配置信息失败: " + (err.message || "未知错误");
    return false;
  }
};

const reset = () => {
  currentStep.value = 0;
  token.value = "";
  actorId.value = "";
  currentIndex.value = 0;
  syncComplete.value = false;
  syncError.value = null;
  // 重置时不发送 cancel 事件，避免模态框关闭
};
</script>

<style scoped>
.cloud-sync-container {
  width: 440px;
  padding: 36px;
  background: white;
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}

.header {
  text-align: center;
  margin-bottom: 32px;
}

.header h2 {
  margin: 0 0 8px 0;
  color: #1f2937;
  font-weight: 600;
}

.header p {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

.step-container {
  margin-top: 32px;
  margin-bottom: 32px;
}

.content {
  min-height: 180px;
  padding: 8px 0;
}

.token-input {
  margin: 24px 0;
}

.sync-list {
  margin: 24px 0;
}

.sync-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin: 8px 0;
  background: #f9fafb;
  border-radius: 10px;
  border-left: 4px solid #6366f1;
}

.sync-icon {
  margin-right: 12px;
  font-size: 18px;
}

.progress-section {
  margin: 24px 0;
}

.progress-text {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  color: #374151;
}

.status-text {
  text-align: center;
  margin-top: 20px;
  color: #6b7280;
  font-size: 14px;
}

.success-icon {
  text-align: center;
  font-size: 48px;
  margin: 20px 0;
}

.error-icon {
  text-align: center;
  font-size: 48px;
  margin: 20px 0;
}
</style>
