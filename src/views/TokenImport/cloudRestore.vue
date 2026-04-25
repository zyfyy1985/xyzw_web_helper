<template>
  <!-- 从云端恢复表单 -->
  <n-form
    ref="restoreFormRef"
    :model="restoreForm"
    :rules="restoreRules"
    :label-placement="'top'"
    :size="'large'"
    :show-label="true"
  >
    <!-- 警告提示 -->
    <n-alert type="warning" :show-icon="true" style="margin-bottom: 16px">
      <template #header>
        <strong>⚠️ 重要提示</strong>
      </template>
      <div style="color: var(--warning-color)">
        恢复操作会覆盖本地数据，请谨慎操作！<br />
        如果本地有重要数据，请先进行导出备份。
      </div>
    </n-alert>

    <!-- 步骤1：输入Token -->
    <n-form-item :label="'云端恢复Token'" :path="'token'" :show-label="true">
      <n-input
        v-model:value="restoreForm.token"
        type="textarea"
        :rows="3"
        placeholder="请输入云端恢复Token..."
        clearable
      />
    </n-form-item>

    <n-form-item :show-label="false">
      <n-button
        type="primary"
        size="large"
        block
        :loading="isLoading"
        :disabled="!restoreForm.token"
        @click="handleFetchInfo"
      >
        <template #icon>
          <n-icon>
            <Search />
          </n-icon>
        </template>
        获取云端数据
      </n-button>
    </n-form-item>

    <!-- 步骤2：恢复内容预览 -->
    <div v-if="cloudData" class="restore-preview">
      <n-divider>将恢复以下内容</n-divider>

      <!-- 可恢复内容预览 -->
      <div class="preview-list">
        <!-- 本地存储数据（可展开） -->
        <n-collapse :default-expanded-names="['localStorage']">
          <n-collapse-item title="📦 本地存储数据" name="localStorage">
            <template #header-extra>
              <span class="preview-count"
                >{{
                  Object.keys(cloudData.localStorage || {}).length || 0
                }}
                项</span
              >
            </template>
            <div class="storage-details">
              <!-- gameTokens 角色数据 -->
              <div
                class="detail-item"
                v-if="cloudData.localStorage?.gameTokens"
              >
                <div class="detail-header">
                  <n-icon size="18"><PersonCircle /></n-icon>
                  <span>👤 角色数据 (gameTokens)</span>
                </div>
                <div class="detail-content">
                  <div
                    v-for="(token, index) in parseJson(
                      cloudData.localStorage.gameTokens,
                    )"
                    :key="index"
                    class="token-item"
                  >
                    <n-tag type="info" size="small">{{
                      token.name || "未命名"
                    }}</n-tag>
                    <span class="token-info">{{
                      token.server || "未知服务器"
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- scheduledTasks 定时任务 -->
              <div
                class="detail-item"
                v-if="cloudData.localStorage?.scheduledTasks"
              >
                <div class="detail-header">
                  <n-icon size="18"><TimerOutline /></n-icon>
                  <span>⏰ 定时任务 (scheduledTasks)</span>
                </div>
                <div class="detail-content">
                  <div
                    v-for="(task, index) in parseJson(
                      cloudData.localStorage.scheduledTasks,
                    )"
                    :key="index"
                    class="task-item"
                  >
                    <n-tag type="warning" size="small">{{
                      task.name || "未命名"
                    }}</n-tag>
                    <span class="task-info" v-if="task.cronExpression">{{
                      task.cronExpression
                    }}</span>
                    <span class="task-info" v-else-if="task.runTime">{{
                      task.runTime
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- 其他配置数据 -->
              <div class="detail-item" v-if="cloudData.localStorage">
                <div class="detail-header">
                  <n-icon size="18"><SettingsOutline /></n-icon>
                  <span>⚙️ 其他配置</span>
                </div>
                <div class="detail-content">
                  <n-tag
                    v-for="(value, key) in getOtherConfig(
                      cloudData.localStorage,
                    )"
                    :key="key"
                    size="small"
                    style="margin: 2px"
                  >
                    {{ key }}
                  </n-tag>
                </div>
              </div>
            </div>
          </n-collapse-item>
        </n-collapse>

        <!-- IndexedDB数据 -->
        <div class="preview-item">
          <n-icon size="20"><CubeOutline /></n-icon>
          <span class="preview-label">🗄️ IndexedDB数据</span>
          <span class="preview-count">
            {{ cloudData.indexedDB?.databases?.length || 0 }} 个数据库
          </span>
        </div>
      </div>

      <n-divider />

      <!-- 确认恢复按钮 -->
      <n-space vertical style="width: 100%">
        <n-checkbox
          v-model:checked="confirmOverwrite"
          style="margin-bottom: 8px"
        >
          <span style="color: var(--error-color); font-weight: bold">
            我已了解恢复操作会覆盖本地数据，谨慎操作
          </span>
        </n-checkbox>
        <n-button
          type="error"
          size="large"
          block
          :loading="isRestoring"
          :disabled="!confirmOverwrite"
          @click="handleRestore"
        >
          <template #icon>
            <n-icon>
              <CloudDownload />
            </n-icon>
          </template>
          确认恢复
        </n-button>
      </n-space>
    </div>
  </n-form>
</template>

<script setup>
import { ref, watch } from "vue";
import axios from "axios";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { useLocalStorage } from "@vueuse/core";
import {
  CloudDownload,
  Search,
  AlertCircleOutline,
  ServerOutline,
  CubeOutline,
  PersonCircle,
  TimerOutline,
  SettingsOutline,
} from "@vicons/ionicons5";

const emit = defineEmits(["cancel", "ok"]);
const message = useMessage();
const tokenStore = useTokenStore();

// 表单引用
const restoreFormRef = ref(null);
const isLoading = ref(false);
const isRestoring = ref(false);

// 云端数据
const cloudData = ref(null);

// 确认覆盖
const confirmOverwrite = ref(false);

// 是否可以恢复
const canRestore = ref(false);

// 监听确认覆盖状态
watch(
  [confirmOverwrite, cloudData],
  () => {
    canRestore.value = confirmOverwrite.value && !!cloudData.value;
  },
  { deep: true },
);

// 表单数据
const restoreForm = ref({
  token: "",
});

// 表单验证规则
const restoreRules = {
  token: {
    required: true,
    message: "请输入云端恢复Token",
    trigger: "blur",
  },
};

// 解析JSON字符串
const parseJson = (str) => {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
};

// 获取其他配置项（排除gameTokens和scheduledTasks）
const getOtherConfig = (localStorage) => {
  if (!localStorage) return {};
  const result = {};
  const excludeKeys = ["gameTokens", "scheduledTasks"];
  for (const key in localStorage) {
    if (excludeKeys.includes(key)) continue;
    result[key] = localStorage[key];
  }
  return result;
};

// 获取云端数据
const handleFetchInfo = async () => {
  if (!restoreForm.value.token) {
    message.warning("请输入云端恢复Token");
    return;
  }

  isLoading.value = true;
  try {
    const apiToken = restoreForm.value.token;

    // 1. 获取所有Key-Value Stores
    const storesResponse = await axios.get(
      "https://api.apify.com/v2/key-value-stores",
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      },
    );

    const stores = storesResponse.data.data?.items || [];
    if (stores.length === 0) {
      throw new Error("未找到任何Key-Value Stores");
    }

    // 2. 根据name字段查找Store，精确匹配state-json
    const targetStore = stores.find((store) => store.name === "state-json");

    if (!targetStore) {
      throw new Error("未找到名称为state-json的Key-Value Store");
    }

    // 3. 直接从找到的Store获取state.json
    const stateResponse = await axios.get(
      `https://api.apify.com/v2/key-value-stores/${targetStore.id}/records/state.json`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      },
    );

    const cloudStoreData = stateResponse.data;

    // 4. 设置云端数据用于恢复预览
    cloudData.value = {
      localStorage: cloudStoreData.localStorage || {},
      indexedDB: cloudStoreData.indexedDB || { databases: [] },
    };
  } catch (err) {
    console.error("获取云端数据失败:", err);
    if (err.response?.status === 401) {
      message.error("API Token无效或已过期");
    } else {
      message.error("获取云端数据失败: " + (err.message || "未知错误"));
    }
    cloudData.value = null;
  } finally {
    isLoading.value = false;
  }
};

// 执行恢复
const handleRestore = async () => {
  if (!canRestore.value) {
    message.warning("请勾选确认并选择要恢复的内容");
    return;
  }

  isRestoring.value = true;
  try {
    // 恢复localStorage数据
    if (cloudData.value.localStorage) {
      const localStorageData = cloudData.value.localStorage;
      let restoredCount = 0;

      for (const key in localStorageData) {
        if (Object.prototype.hasOwnProperty.call(localStorageData, key)) {
          localStorage.setItem(key, localStorageData[key]);
          restoredCount++;
        }
      }
      message.success(`已恢复 ${restoredCount} 项本地存储数据`);
    }

    // 恢复IndexedDB数据
    if (cloudData.value.indexedDB) {
      await restoreIndexedDB(cloudData.value.indexedDB);
      message.success("已恢复IndexedDB数据");
    }

    message.success("云端数据恢复成功！");
    emit("ok");

    // 延迟跳转到dashboard页面
    setTimeout(() => {
      window.location.href = "/admin/dashboard";
    }, 1500);
  } catch (err) {
    console.error("恢复失败:", err);
    message.error("恢复失败: " + err.message);
  } finally {
    isRestoring.value = false;
  }
};

// 恢复IndexedDB数据
const restoreIndexedDB = async (indexedDBData) => {
  if (!indexedDBData.databases || !indexedDBData.databases.length) {
    return;
  }

  for (const dbInfo of indexedDBData.databases) {
    if (!dbInfo || !dbInfo.name) continue;

    const version = dbInfo.version || 1;
    const openReq = indexedDB.open(dbInfo.name, version);

    await new Promise((resolve, reject) => {
      openReq.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (dbInfo.stores) {
          dbInfo.stores.forEach((storeInfo) => {
            if (!database.objectStoreNames.contains(storeInfo.name)) {
              const keyPath = storeInfo.keyPath || "id";
              const objectStore = database.createObjectStore(storeInfo.name, {
                keyPath,
              });
              if (storeInfo.indexes && storeInfo.indexes.length > 0) {
                storeInfo.indexes.forEach((indexInfo) => {
                  objectStore.createIndex(indexInfo.name, indexInfo.keyPath, {
                    unique: indexInfo.unique || false,
                  });
                });
              }
            }
          });
        }
      };

      openReq.onsuccess = async (event) => {
        const database = event.target.result;
        try {
          if (dbInfo.stores) {
            for (const storeInfo of dbInfo.stores) {
              await new Promise((resolveClear) => {
                const clearTransaction = database.transaction(
                  [storeInfo.name],
                  "readwrite",
                );
                const clearStore = clearTransaction.objectStore(storeInfo.name);
                clearStore.clear();
                clearTransaction.oncomplete = () => resolveClear();
              });

              if (storeInfo.data && storeInfo.data.length > 0) {
                for (const item of storeInfo.data) {
                  await new Promise((resolveAdd) => {
                    const addTransaction = database.transaction(
                      [storeInfo.name],
                      "readwrite",
                    );
                    const addStore = addTransaction.objectStore(storeInfo.name);
                    const processedItem = processData(item);
                    const addRequest = addStore.add(processedItem);
                    addRequest.onsuccess = () => resolveAdd();
                    addRequest.onerror = () => resolveAdd();
                  });
                }
              }
            }
          }
        } finally {
          database.close();
          resolve();
        }
      };

      openReq.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }
};

// 处理ArrayBuffer数据
function processData(data) {
  if (Array.isArray(data)) {
    return data.map(processData);
  } else if (typeof data === "object" && data !== null) {
    if (data.__type__ === "ArrayBuffer") {
      const binaryString = atob(data.data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
    const result = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        result[key] = processData(data[key]);
      }
    }
    return result;
  }
  return data;
}
</script>

<style scoped lang="scss">
.restore-preview {
  padding: 12px;
  background: var(--base-bg-color);
  border-radius: 8px;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--card-color);
  border-radius: 8px;
  border: 1px solid var(--border-color);

  .preview-label {
    flex: 1;
    font-weight: 500;
  }

  .preview-count {
    color: var(--text-color-3);
    font-size: 13px;
  }
}

.storage-details {
  padding: 8px 0;
}

.detail-item {
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-color-2);
}

.detail-content {
  padding-left: 26px;
}

.token-item,
.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.token-info,
.task-info {
  color: var(--text-color-3);
  font-size: 12px;
}

.large-text {
  max-width: 300px;
  word-break: break-all;
}
</style>
