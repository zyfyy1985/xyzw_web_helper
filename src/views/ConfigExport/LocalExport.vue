<template>
  <div class="export-local-form">
    <!-- 警告提示 -->
    <n-alert type="warning" :show-icon="true" style="margin-bottom: 16px">
      <template #header>
        <strong>⚠️ 重要提示</strong>
      </template>
      <div style="color: var(--warning-color)">
        导出内容包含敏感信息，注意妥善保存
      </div>
    </n-alert>

    <!-- 导出内容预览 -->
    <div class="export-preview">
      <n-divider>将导出以下内容</n-divider>

      <!-- 可导出内容预览 -->
      <div class="preview-list">
        <!-- 本地存储数据（可展开） -->
        <n-collapse>
          <n-collapse-item title="📦 本地存储数据" name="localStorage">
            <template #header-extra>
              <span class="preview-count"
                >{{ exportDataCount.localStorage }} 项</span
              >
            </template>
            <div class="storage-details">
              <!-- gameTokens 角色数据 -->
              <div class="detail-item">
                <div class="detail-header">
                  <n-icon size="18">
                    <PersonCircle />
                  </n-icon>
                  <span>👤 角色数据 (gameTokens)</span>
                </div>
                <div class="detail-content">
                  <div
                    v-for="(token, index) in parsedTokens"
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
                  <div v-if="parsedTokens.length === 0" class="empty-item">
                    暂无角色数据
                  </div>
                </div>
              </div>

              <!-- scheduledTasks 定时任务 -->
              <div class="detail-item" v-if="hasScheduledTasks">
                <div class="detail-header">
                  <n-icon size="18">
                    <TimerOutline />
                  </n-icon>
                  <span>⏰ 定时任务 (scheduledTasks)</span>
                </div>
                <div class="detail-content">
                  <div
                    v-for="(task, index) in parsedScheduledTasks"
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
              <div class="detail-item">
                <div class="detail-header">
                  <n-icon size="18">
                    <SettingsOutline />
                  </n-icon>
                  <span>⚙️ 其他配置</span>
                </div>
                <div class="detail-content">
                  <n-tag
                    v-for="(value, key) in otherConfigKeys"
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
          <n-icon size="20">
            <CubeOutline />
          </n-icon>
          <span class="preview-label">🗄️ IndexedDB数据</span>
          <span class="preview-count"> {{ indexedDBCount }} 个数据库 </span>
        </div>
      </div>

      <n-divider />

      <!-- 确认导出按钮 -->
      <n-space vertical style="width: 100%">
        <n-checkbox v-model:checked="confirmExport" style="margin-bottom: 8px">
          <span style="color: var(--warning-color); font-weight: bold">
            我已了解导出内容包含敏感信息，注意妥善保存
          </span>
        </n-checkbox>
        <n-button
          type="primary"
          size="large"
          block
          :loading="isExporting"
          :disabled="!confirmExport"
          @click="handleExport"
        >
          <template #icon>
            <n-icon>
              <CloudUpload />
            </n-icon>
          </template>
          确认导出
        </n-button>
      </n-space>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useMessage } from "naive-ui";
import {
  CloudUpload,
  CubeOutline,
  PersonCircle,
  TimerOutline,
  SettingsOutline,
} from "@vicons/ionicons5";

const emit = defineEmits(["export"]);
const message = useMessage();

// 响应式数据
const isExporting = ref(false);
const confirmExport = ref(false);

// 获取导出的数据统计
const tokenCount = computed(() => {
  try {
    const tokens = localStorage.getItem("gameTokens");
    if (tokens) {
      const parsed = JSON.parse(tokens);
      return Array.isArray(parsed) ? parsed.length : 0;
    }
  } catch (e) {
    console.error("解析gameTokens失败:", e);
  }
  return 0;
});

// 解析角色数据
const parsedTokens = computed(() => {
  try {
    const tokens = localStorage.getItem("gameTokens");
    if (tokens) {
      const parsed = JSON.parse(tokens);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error("解析gameTokens失败:", e);
  }
  return [];
});

const taskCount = computed(() => {
  try {
    const tasks = localStorage.getItem("scheduledTasks");
    if (tasks) {
      const parsed = JSON.parse(tasks);
      return Array.isArray(parsed) ? parsed.length : 0;
    }
  } catch (e) {
    console.error("解析scheduledTasks失败:", e);
  }
  return 0;
});

// 解析定时任务数据
const parsedScheduledTasks = computed(() => {
  try {
    const tasks = localStorage.getItem("scheduledTasks");
    if (tasks) {
      const parsed = JSON.parse(tasks);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error("解析scheduledTasks失败:", e);
  }
  return [];
});

const hasScheduledTasks = computed(() => {
  return taskCount.value > 0;
});

const otherConfigKeys = computed(() => {
  const excludeKeys = ["gameTokens", "scheduledTasks"];
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && !excludeKeys.includes(key)) {
      result[key] = true;
    }
  }
  return result;
});

// 获取IndexedDB数据库数量
const indexedDBCount = ref(0);

// 初始化时获取IndexedDB数据库数量
const initIndexedDBCount = async () => {
  try {
    const getAllDatabases = indexedDB.databases
      ? indexedDB.databases()
      : Promise.resolve([]);

    const dbs = await getAllDatabases;
    indexedDBCount.value = dbs ? dbs.length : 0;
  } catch (e) {
    console.error("获取IndexedDB数据库失败:", e);
    indexedDBCount.value = 0;
  }
};

// 组件挂载时初始化
onMounted(() => {
  initIndexedDBCount();
});

const exportDataCount = computed(() => {
  return {
    localStorage: localStorage.length,
  };
});

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

// 本地导出状态数据
const localExportState = async () => {
  /**
   * 手动保存localStorage、IndexedDB和cookies数据
   * 使用浏览器File System Access API让用户选择保存位置
   */
  console.info("开始导出状态数据...");

  try {
    // 获取完整的状态数据
    const stateData = await getStateData();

    // 打印数据库详细信息
    const dbCount = stateData.indexedDB.databases.length;
    for (const db of stateData.indexedDB.databases) {
      const storeCount = db.stores ? db.stores.length : 0;
      const totalData = db.stores
        ? db.stores.reduce(
            (sum, store) => sum + (store.data ? store.data.length : 0),
            0,
          )
        : 0;
      console.info(
        `数据库: ${db.name}, 版本: ${db.version}, 存储对象: ${storeCount}, 数据总量: ${totalData}`,
      );
    }

    // 使用File System Access API让用户选择保存位置
    const options = {
      suggestedName: `state-${new Date().toISOString().slice(0, 10)}.json`,
      types: [
        {
          description: "JSON Files",
          accept: { "application/json": [".json"] },
        },
      ],
    };

    try {
      // 检测是否是 Android WebView
      if (window.AndroidDownload) {
        // Android WebView 的保存方式
        const jsonContent = JSON.stringify(stateData, null, 2);
        const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));
        window.AndroidDownload.downloadFile(
          options.suggestedName,
          base64Content,
          "application/json",
        );
        console.info(`状态数据已下载为: ${options.suggestedName}`);
        message.success(`状态数据已成功下载为: ${options.suggestedName}`);
        return true;
      } else if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker(options);
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(stateData, null, 2));
        await writable.close();
        console.info(`状态数据已保存至: ${handle.name}`);
        message.success(`状态数据已成功保存到: ${handle.name}`);
        return true;
      } else {
        // 回退方案：使用传统下载方式（支持所有浏览器，包括移动设备）
        const blob = new Blob([JSON.stringify(stateData, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = options.suggestedName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.info(`状态数据已下载为: ${options.suggestedName}`);
        message.success(`状态数据已成功下载为: ${options.suggestedName}`);
        return true;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.info("用户取消了保存操作");
        return false;
      }
      throw err;
    }
  } catch (err) {
    console.error("保存状态数据时发生异常:", err);
    message.error("导出状态数据失败: " + err.message);
    return false;
  }
};

// 处理导出
const handleExport = async () => {
  isExporting.value = true;
  try {
    // 执行本地导出
    await localExportState();
    // 触发父组件的导出方法
    emit("ok");
    confirmExport.value = false;
  } catch (error) {
    console.error("导出失败:", error);
    message.error("导出失败：" + error.message);
  } finally {
    isExporting.value = false;
  }
};
</script>

<style scoped lang="scss">
.export-local-form {
  padding: var(--spacing-md);
}

.export-preview {
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
</style>
