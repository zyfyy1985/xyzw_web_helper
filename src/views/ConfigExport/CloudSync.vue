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
      <div v-if="!syncComplete">
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

  await createActor();
  await buildActor();
  await syncStateData();
  await syncSchedules();
};

// 实现 createActor 函数，调用 Apify API 创建 actor
const createActor = async () => {
  console.info("开始检查是否存在 KOFA actor...");

  // 直接使用组件中的 token 变量作为 API Key
  const apiKey = token.value.trim();

  if (!apiKey) {
    console.error("未找到 API Key，请先在云端同步页面填写 Token");
    message.error("未找到 API Key，请先在云端同步页面填写 Token");
    return false;
  }

  try {
    // 先调用 Apify API 获取所有 actor
    const listResponse = await fetch("https://api.apify.com/v2/acts", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (listResponse.ok) {
      const listData = await listResponse.json();
      console.info(`获取到 ${listData.data.items.length} 个 actor`);

      // 检查是否存在名为 KOFA 的 actor
      const existingActor = listData.data.items.find(
        (actor) => actor.name === "KOFA",
      );

      if (existingActor) {
        console.info(`发现已存在的 KOFA actor，ID: ${existingActor.id}`);
        message.success("发现已存在的 KOFA actor");
        // 保存 actor ID 以便后续构建使用
        actorId.value = existingActor.id;
        currentIndex.value = 1;
        return true;
      } else {
        console.info("未找到 KOFA actor，开始创建...");
        // 调用 Apify API 创建 actor
        const createResponse = await fetch("https://api.apify.com/v2/acts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
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

        if (createResponse.ok) {
          const createData = await createResponse.json();
          console.info(`成功创建 actor，ID: ${createData.data.id}`);
          message.success("成功创建 actor");
          // 保存 actor ID 以便后续构建使用
          actorId.value = createData.data.id;
          currentIndex.value = 1;
          return true;
        } else {
          const errorData = await createResponse.json();
          console.error("创建 actor 失败:", errorData);
          message.error(
            `创建 actor 失败: ${errorData.errorMessage || "未知错误"}`,
          );
          return false;
        }
      }
    } else {
      const errorData = await listResponse.json();
      console.error("获取 actor 列表失败:", errorData);
      message.error(
        `获取 actor 列表失败: ${errorData.errorMessage || "未知错误"}`,
      );
      return false;
    }
  } catch (err) {
    console.error("检查 actor 时发生网络异常:", err);
    message.error("检查 actor 失败: 网络错误");
    return false;
  }
};

// 实现 buildActor 函数，调用 Apify API 构建 actor
const buildActor = async () => {
  console.info("开始构建 actor...");

  // 直接使用组件中的 token 变量作为 API Key
  const apiKey = token.value.trim();

  if (!apiKey) {
    console.error("未找到 API Key，请先在云端同步页面填写 Token");
    message.error("未找到 API Key，请先在云端同步页面填写 Token");
    return false;
  }

  if (!actorId.value) {
    console.error("未找到 actor ID，请先创建 actor");
    message.error("未找到 actor ID，请先创建 actor");
    return false;
  }

  try {
    // 调用 Apify API 构建 actor
    const response = await fetch(
      `https://api.apify.com/v2/acts/${actorId.value}/builds?version=0.0`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (response.ok) {
      const buildData = await response.json();
      console.info(`成功开始构建 actor，构建 ID: ${buildData.data.id}`);
      message.success("成功开始构建 actor");
      currentIndex.value = 2;
      return true;
    } else {
      const errorData = await response.json();
      console.error("构建 actor 失败:", errorData);
      message.error(`构建 actor 失败: ${errorData.errorMessage || "未知错误"}`);
      return false;
    }
  } catch (err) {
    console.error("构建 actor 时发生网络异常:", err);
    message.error("构建 actor 失败: 网络错误");
    return false;
  }
};

// 实现 createSchedule 函数，调用 Apify API 创建定时任务
const createSchedule = async (name, cronExpression) => {
  console.info("开始创建定时任务...");

  // 直接使用组件中的 token 变量作为 API Key
  const apiKey = token.value.trim();

  if (!apiKey) {
    console.error("未找到 API Key，请先在云端同步页面填写 Token");
    message.error("未找到 API Key，请先在云端同步页面填写 Token");
    return false;
  }

  if (!actorId.value) {
    console.error("未找到 actor ID，请先创建 actor");
    message.error("未找到 actor ID，请先创建 actor");
    return false;
  }

  try {
    // 调用 Apify API 创建定时任务
    const response = await fetch("https://api.apify.com/v2/schedules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: name,
        isEnabled: true,
        isExclusive: true,
        cronExpression: cronExpression,
        timezone: "Asia/Shanghai",
        description: `Schedule for ${name} 任务`,
        title: `${name} Schedule`,
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

    if (response.ok) {
      const scheduleData = await response.json();
      console.info(`成功创建定时任务，ID: ${scheduleData.data.id}`);
      message.success("成功创建定时任务");
      return true;
    } else {
      const errorData = await response.json();
      console.error("创建定时任务失败:", errorData);
      message.error(
        `创建定时任务失败: ${errorData.errorMessage || "未知错误"}`,
      );
      return false;
    }
  } catch (err) {
    console.error("创建定时任务时发生网络异常:", err);
    message.error("创建定时任务失败: 网络错误");
    return false;
  }
};

// 实现 syncSchedules 函数，从 stateData 中读取 scheduledTasks 并创建定时任务
const syncSchedules = async () => {
  console.info("开始同步定时任务...");

  try {
    // 获取完整的状态数据
    const stateData = await getStateData();

    // 从 localStorage 中读取 scheduledTasks
    let scheduledTasks = [];
    if (stateData.localStorage && stateData.localStorage.scheduledTasks) {
      try {
        scheduledTasks = JSON.parse(stateData.localStorage.scheduledTasks);
        if (!Array.isArray(scheduledTasks)) {
          scheduledTasks = [];
        }
      } catch (e) {
        console.error("解析 scheduledTasks 失败:", e);
        scheduledTasks = [];
      }
    }

    // 检查是否有定时任务
    if (scheduledTasks.length > 0) {
      console.info(`发现 ${scheduledTasks.length} 个定时任务`);

      // 遍历 scheduledTasks，为每个任务创建定时任务
      for (const task of scheduledTasks) {
        console.info(`处理定时任务: ${task.name}`);

        // 转换 cron 表达式
        let cronExpression = task.cronExpression || "* * * * *"; // 默认每分钟执行
        if (task.runType === "daily") {
          // 对于 daily 类型，每天执行一次
          // 解析任务中的时间，默认 00:00
          let hour = 0;
          let minute = 0;

          // 检查任务是否有时间设置
          if (task.runTime) {
            // 假设 task.runTime 格式为 "HH:MM"，例如 "07:30"
            const timeParts = task.runTime.split(":");
            if (timeParts.length === 2) {
              hour = parseInt(timeParts[0], 10) || 0;
              minute = parseInt(timeParts[1], 10) || 0;
            }
          }

          // 生成 cron 表达式：分钟 小时 * * *
          cronExpression = `${minute} ${hour} * * *`;
        }

        // 调用 API 创建定时任务
        await createScheduleForTask(task, cronExpression);
      }
    } else {
      console.info("未发现定时任务");
    }
  } catch (err) {
    console.error("同步定时任务时发生异常:", err);
    message.error("同步定时任务失败: " + err.message);
  }

  currentIndex.value = 3;
  console.info("定时任务同步完成");
  syncComplete.value = true;

  return true;
};

// 为单个任务创建定时任务
const createScheduleForTask = async (task, cronExpression) => {
  // 直接使用组件中的 token 变量作为 API Key
  const apiKey = token.value.trim();

  if (!apiKey) {
    console.error("未找到 API Key，请先在云端同步页面填写 Token");
    message.error("未找到 API Key，请先在云端同步页面填写 Token");
    return false;
  }

  if (!actorId.value) {
    console.error("未找到 actor ID，请先创建 actor");
    message.error("未找到 actor ID，请先创建 actor");
    return false;
  }

  try {
    // 调用 Apify API 创建定时任务
    const response = await fetch("https://api.apify.com/v2/schedules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: `${task.id.replace("_", "-")}`, // 使用任务ID作为名称，避免汉字
        isEnabled: task.enable,
        isExclusive: true,
        cronExpression: cronExpression,
        timezone: "Asia/Shanghai",
        description: `Schedule for task: ${task.name}`,
        title: `KOFA Schedule - ${task.name}`,
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

    if (response.ok) {
      const scheduleData = await response.json();
      console.info(`成功创建定时任务，ID: ${scheduleData.data.id}`);
      message.success(`成功创建定时任务: ${task.name}`);
      return true;
    } else {
      const errorData = await response.json();
      console.error(`创建定时任务失败 (${task.name}):`, errorData);
      message.error(
        `创建定时任务失败 (${task.name}): ${errorData.errorMessage || "未知错误"}`,
      );
      return false;
    }
  } catch (err) {
    console.error(`创建定时任务时发生网络异常 (${task.name}):`, err);
    message.error(`创建定时任务失败 (${task.name}): 网络错误`);
    return false;
  }
};

const syncStateData = async () => {
  /**
   * 将状态数据同步到 Apify Key-Value Store
   */
  console.info("开始同步状态数据到云端...");
  // 更新当前步骤索引
  currentIndex.value = 2;

  try {
    // 获取完整的状态数据
    const stateData = await getStateData();
    console.info("开始同步数据到 Apify Key-Value Store...");

    // 直接使用组件中的 token 变量作为 API Key
    const apiKey = token.value.trim();

    if (!apiKey) {
      console.error("未找到 API Key，请先在云端同步页面填写 Token");
      message.error("未找到 API Key，请先在云端同步页面填写 Token");
      return false;
    }

    try {
      // 先创建一个 Key-Value Store
      console.info("正在创建 Key-Value Store...");
      const createStoreResponse = await fetch(
        "https://api.apify.com/v2/key-value-stores?name=KOFS",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      if (!createStoreResponse.ok) {
        const errorData = await createStoreResponse.json();
        console.error("创建 Key-Value Store 失败:", errorData);
        message.error(
          `创建 Key-Value Store 失败: ${errorData.errorMessage || "未知错误"}`,
        );
        return false;
      }

      const storeData = await createStoreResponse.json();
      const storeId = storeData.data.id;
      console.info(`成功创建 Key-Value Store，ID: ${storeId}`);

      // 然后使用创建的 Store ID 同步数据
      console.info("开始同步数据到 Apify Key-Value Store...");
      const response = await fetch(
        `https://api.apify.com/v2/key-value-stores/${storeId}/records/state.json`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(stateData),
        },
      );

      if (response.ok) {
        console.info("状态数据已成功同步到 Apify Key-Value Store");
        message.success("状态数据已成功同步到云端");
        return true;
      } else {
        const errorData = await response.json();
        console.error("同步状态数据失败:", errorData);
        message.error(
          `同步状态数据失败: ${errorData.errorMessage || "未知错误"}`,
        );
        return false;
      }
    } catch (err) {
      console.error("同步状态数据时发生网络异常:", err);
      message.error("同步状态数据失败: 网络错误");
      return false;
    }
  } catch (err) {
    console.error("同步状态数据时发生异常:", err);
    message.error("同步状态数据失败: " + err.message);
    return false;
  }
};

const reset = () => {
  currentStep.value = 0;
  token.value = "";
  actorId.value = "";
  currentIndex.value = 0;
  syncComplete.value = false;
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
</style>
