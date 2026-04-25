<template>
  <!-- 本地恢复表单 -->
  <n-form
    ref="restoreFormRef"
    :model="restoreForm"
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

    <!-- 步骤1：选择本地备份文件 -->
    <n-form-item :label="'本地备份文件'" :show-label="true">
      <a-upload
        v-model:file-list="fileList"
        accept=".json"
        :max="1"
        @before-upload="handleBeforeUpload"
        draggable
        dropzone
        placeholder="请点击上传或将备份文件拖拽到此处"
      >
        <div class="dropzone-content">请点击上传或将备份文件拖拽到此处</div>
      </a-upload>
    </n-form-item>

    <n-form-item :show-label="false">
      <n-button
        type="primary"
        size="large"
        block
        :loading="isLoading"
        :disabled="!selectedFile"
        @click="handleParseFile"
      >
        <template #icon>
          <n-icon>
            <Search />
          </n-icon>
        </template>
        解析文件
      </n-button>
    </n-form-item>

    <!-- 步骤2：恢复内容预览 -->
    <div v-if="localData" class="restore-preview">
      <n-divider>将恢复以下内容</n-divider>

      <!-- 可恢复内容预览 -->
      <div class="preview-list">
        <!-- 本地存储数据（可展开） -->
        <n-collapse :default-expanded-names="['localStorage']">
          <n-collapse-item title="📦 本地存储数据" name="localStorage">
            <template #header-extra>
              <span class="preview-count"
                >{{
                  Object.keys(localData.localStorage || {}).length || 0
                }}
                项</span
              >
            </template>
            <div class="storage-details">
              <!-- gameTokens 角色数据 -->
              <div
                class="detail-item"
                v-if="localData.localStorage?.gameTokens"
              >
                <div class="detail-header">
                  <n-icon size="18"><PersonCircle /></n-icon>
                  <span>👤 角色数据 (gameTokens)</span>
                </div>
                <div class="detail-content">
                  <div
                    v-for="(token, index) in parseJson(
                      localData.localStorage.gameTokens,
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
                v-if="localData.localStorage?.scheduledTasks"
              >
                <div class="detail-header">
                  <n-icon size="18"><TimerOutline /></n-icon>
                  <span>⏰ 定时任务 (scheduledTasks)</span>
                </div>
                <div class="detail-content">
                  <div
                    v-for="(task, index) in parseJson(
                      localData.localStorage.scheduledTasks,
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
              <div class="detail-item" v-if="localData.localStorage">
                <div class="detail-header">
                  <n-icon size="18"><SettingsOutline /></n-icon>
                  <span>⚙️ 其他配置</span>
                </div>
                <div class="detail-content">
                  <n-tag
                    v-for="(value, key) in getOtherConfig(
                      localData.localStorage,
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
            {{ localData.indexedDB?.databases?.length || 0 }} 个数据库
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
import { ref } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import {
  CloudDownload,
  Search,
  CloudUpload,
  CubeOutline,
  PersonCircle,
  TimerOutline,
  SettingsOutline,
} from "@vicons/ionicons5";

const emit = defineEmits(["cancel", "ok"]);
const message = useMessage();
const tokenStore = useTokenStore();

// 响应式数据
const restoreFormRef = ref(null);
const restoreForm = ref({});
const fileList = ref([]);
const selectedFile = ref(null);
const localData = ref(null);
const isLoading = ref(false);
const isRestoring = ref(false);
const confirmOverwrite = ref(false);

// 处理文件上传前
const handleBeforeUpload = (file) => {
  console.log("Before upload file:", file);
  selectedFile.value = file;
  console.log("Selected file set to:", selectedFile.value);
  return false; // 阻止自动上传，我们只需要文件对象
};

// 解析文件
const handleParseFile = async () => {
  if (!selectedFile.value) {
    message.warning("请选择备份文件");
    return;
  }

  isLoading.value = true;
  try {
    const file = selectedFile.value;
    const reader = new FileReader();

    await new Promise((resolve, reject) => {
      reader.onload = (e) => {
        try {
          const content = e.target.result;
          const parsedData = JSON.parse(content);
          localData.value = parsedData;
          message.success("文件解析成功");
          resolve();
        } catch (error) {
          message.error("文件格式错误，请选择正确的备份文件");
          reject(error);
        }
      };
      reader.onerror = () => {
        message.error("文件读取失败");
        reject(new Error("文件读取失败"));
      };
      reader.readAsText(file);
    });
  } catch (error) {
    console.error("解析文件失败:", error);
  } finally {
    isLoading.value = false;
  }
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

// 处理恢复
const handleRestore = async () => {
  if (!localData.value) {
    message.warning("请先解析备份文件");
    return;
  }

  isRestoring.value = true;
  try {
    // 恢复本地存储数据
    if (localData.value.localStorage) {
      for (const [key, value] of Object.entries(localData.value.localStorage)) {
        localStorage.setItem(key, value);
      }
    }

    // 恢复IndexedDB数据
    if (localData.value.indexedDB?.databases) {
      for (const dbInfo of localData.value.indexedDB.databases) {
        await restoreIndexedDB(dbInfo);
      }
    }

    message.success("恢复成功！页面将自动刷新");

    // 延迟跳转到dashboard页面
    setTimeout(() => {
      window.location.href = "/admin/dashboard";
    }, 1500);
  } catch (error) {
    console.error("恢复失败:", error);
    message.error("恢复失败：" + error.message);
  } finally {
    isRestoring.value = false;
  }
};

// 恢复IndexedDB数据
const restoreIndexedDB = (dbInfo) => {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(dbInfo.name, dbInfo.version || 1);

    openRequest.onupgradeneeded = (event) => {
      const database = event.target.result;

      // 创建存储对象
      for (const storeInfo of dbInfo.stores || []) {
        if (!database.objectStoreNames.contains(storeInfo.name)) {
          const store = database.createObjectStore(storeInfo.name, {
            keyPath: storeInfo.keyPath || "id",
            autoIncrement: storeInfo.autoIncrement || false,
          });

          // 创建索引
          if (storeInfo.indexes) {
            for (const indexInfo of storeInfo.indexes) {
              store.createIndex(indexInfo.name, indexInfo.keyPath, {
                unique: indexInfo.unique || false,
              });
            }
          }
        }
      }
    };

    openRequest.onsuccess = (event) => {
      const database = event.target.result;

      const restorePromises = (dbInfo.stores || []).map((storeInfo) => {
        return new Promise((resolveStore) => {
          // 清空现有数据
          const clearTransaction = database.transaction(
            [storeInfo.name],
            "readwrite",
          );
          const clearStore = clearTransaction.objectStore(storeInfo.name);
          clearStore.clear();
          clearTransaction.oncomplete = () => {
            // 插入新数据
            if (storeInfo.data && storeInfo.data.length > 0) {
              const addTransaction = database.transaction(
                [storeInfo.name],
                "readwrite",
              );
              const addStore = addTransaction.objectStore(storeInfo.name);

              let completed = 0;
              for (const item of storeInfo.data) {
                const processedItem = processData(item);
                const addRequest = addStore.add(processedItem);
                addRequest.onsuccess = () => {
                  completed++;
                  if (completed === storeInfo.data.length) {
                    resolveStore();
                  }
                };
                addRequest.onerror = () => {
                  completed++;
                  if (completed === storeInfo.data.length) {
                    resolveStore();
                  }
                };
              }
            } else {
              resolveStore();
            }
          };
        });
      });

      Promise.all(restorePromises).then(() => {
        database.close();
        resolve();
      });
    };

    openRequest.onerror = (event) => {
      reject(event.target.error);
    };
  });
};

// 处理数据（特别是ArrayBuffer）
const processData = (item) => {
  if (!item || typeof item !== "object") return item;

  if (item.data && item.data.__type__ === "ArrayBuffer") {
    // 处理ArrayBuffer数据
    const binaryString = atob(item.data.data);
    const length = binaryString.length;
    const arrayBuffer = new ArrayBuffer(length);
    const uint8Array = new Uint8Array(arrayBuffer);

    for (let i = 0; i < length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
    }

    return {
      ...item,
      data: arrayBuffer,
    };
  }

  return item;
};
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

.dropzone-content {
  width: 100%;
  border: 1px dashed #fcc;
  border-radius: 8px;
  text-align: center;
  color: #888;
  padding: 40px 20px;
  font-size: 12px;
}
</style>
