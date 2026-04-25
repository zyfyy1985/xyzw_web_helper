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

const syncItems = ref([
  { name: "创建虚拟环境", icon: "🌐" },
  { name: "同步用户信息", icon: "👤" },
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

// 定义 emit
const emit = defineEmits(["export", "cancel"]);

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

  await syncStateData();

  const timer = setInterval(async () => {
    if (currentIndex.value < syncItems.value.length - 1) {
      currentIndex.value++;
    } else {
      clearInterval(timer);
      syncComplete.value = true;
      // 同步完成后获取状态数据并同步到云端
    }
  }, 1200);
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
        // 同步完成后发送 export 事件
        emit("ok");
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
  currentIndex.value = 0;
  syncComplete.value = false;
  // 重置时发送 cancel 事件
  emit("cancel");
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
