<template>
  <div class="home-page">
    <!-- 导航栏 -->
    <nav class="navbar glass">
      <div class="container">
        <div class="nav-content">
          <div class="nav-brand">
            <img src="/icons/xiaoyugan.png" alt="XYZW" class="brand-logo" />
            <span class="brand-text">XYZW 游戏管理系统</span>
          </div>

          <div class="mobile-menu-button">
            <n-button text @click="isMobileMenuOpen = true">
              <n-icon>
                <Menu />
              </n-icon>
            </n-button>
          </div>

          <div class="nav-actions">
            <template v-if="!authStore.isAuthenticated">
              <n-button
                text
                type="primary"
                size="large"
                @click="router.push('/login')"
              >
                登录
              </n-button>
              <n-button
                type="primary"
                size="large"
                @click="router.push('/register')"
              >
                注册
              </n-button>
            </template>
            <template v-else>
              <n-button
                type="primary"
                size="large"
                @click="router.push('/admin/dashboard')"
              >
                进入控制台
              </n-button>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <n-drawer
      v-model:show="isMobileMenuOpen"
      placement="left"
      style="width: 260px"
    >
      <div class="drawer-menu">
        <router-link
          to="/"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Ribbon />
          </n-icon>
          <span>首页</span>
        </router-link>
        <router-link
          to="/admin/dashboard"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Settings />
          </n-icon>
          <span>控制台</span>
        </router-link>
        <router-link
          to="/admin/game-features"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Cube />
          </n-icon>
          <span>游戏功能</span>
        </router-link>
        <router-link
          to="/tokens"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <PersonCircle />
          </n-icon>
          <span>Token管理</span>
        </router-link>
        <router-link
          to="/changelog"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Ribbon />
          </n-icon>
          <span>更新日志</span>
        </router-link>
        <div class="drawer-actions">
          <n-button
            type="primary"
            block
            @click="
              router.push('/login');
              isMobileMenuOpen = false;
            "
            >登录</n-button
          >
          <n-button
            type="primary"
            block
            @click="
              router.push('/register');
              isMobileMenuOpen = false;
            "
            >注册</n-button
          >
        </div>
      </div>
    </n-drawer>

    <!-- 主要内容 -->
    <main class="main-content">
      <!-- 英雄区域 -->
      <section class="hero-section">
        <div class="container">
          <div class="hero-content">
            <div class="hero-text">
              <h1 class="hero-title">专业的游戏管理平台</h1>
              <p class="hero-subtitle">让游戏变得更简单，让管理变得更高效</p>
              <div class="hero-actions">
                <n-button
                  type="primary"
                  size="large"
                  class="hero-button"
                  @click="
                    router.push(
                      authStore.isAuthenticated
                        ? '/admin/dashboard'
                        : '/register',
                    )
                  "
                >
                  {{ authStore.isAuthenticated ? "进入控制台" : "立即开始" }}
                </n-button>
                <n-button
                  type="primary"
                  size="large"
                  class="hero-button"
                  @click="restoreState"
                >
                  恢复配置
                </n-button>
              </div>
            </div>

            <div class="hero-visual">
              <div class="feature-cards">
                <div
                  v-for="card in featureCards"
                  :key="card.id"
                  class="feature-card"
                >
                  <div class="card-icon">
                    <component :is="card.icon" />
                  </div>
                  <div class="card-content">
                    <h3>{{ card.title }}</h3>
                    <p>{{ card.description }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 功能特性 -->
      <section ref="featuresSection" class="features-section">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title">核心功能</h2>
            <p class="section-subtitle">为您提供全方位的游戏管理解决方案</p>
          </div>

          <div class="features-grid">
            <div
              v-for="feature in features"
              :key="feature.id"
              class="feature-item"
            >
              <div class="feature-icon">
                <component :is="feature.icon" />
              </div>
              <h3 class="feature-title">
                {{ feature.title }}
              </h3>
              <p class="feature-description">
                {{ feature.description }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 统计数据 -->
      <section class="stats-section">
        <div class="container">
          <div class="stats-grid">
            <div v-for="stat in stats" :key="stat.id" class="stat-item">
              <div class="stat-number">
                {{ stat.number }}
              </div>
              <div class="stat-label">
                {{ stat.label }}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 页脚 -->
    <footer class="footer">
      <div class="container">
        <div class="footer-content">
          <div class="footer-brand">
            <img src="/icons/xiaoyugan.png" alt="XYZW" class="footer-logo" />
            <span class="footer-text">XYZW 游戏管理系统</span>
          </div>
          <div class="footer-links">
            <router-link to="/changelog" class="footer-link">
              更新日志
            </router-link>
            <a href="#" class="footer-link">关于我们</a>
            <a href="#" class="footer-link">隐私政策</a>
            <a href="#" class="footer-link">服务条款</a>
            <a href="#" class="footer-link">联系我们</a>
          </div>
        </div>
        <div class="footer-bottom">
          <p>&copy; 2024 XYZW. All rights reserved.</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, markRaw } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { PersonCircle, Cube, Ribbon, Settings, Menu } from "@vicons/ionicons5";
import { useMessage } from "naive-ui";
import { useLocalStorage } from "@vueuse/core";
import { sleep } from "@/utils/base";

const router = useRouter();
const authStore = useAuthStore();
const featuresSection = ref(null);
const isMobileMenuOpen = ref(false);
const message = useMessage();

// 功能卡片数据
const featureCards = ref([
  {
    id: 1,
    icon: markRaw(PersonCircle),
    title: "角色管理",
    description: "统一管理游戏角色",
  },
  {
    id: 2,
    icon: markRaw(Cube),
    title: "任务系统",
    description: "自动化日常任务",
  },
  {
    id: 3,
    icon: markRaw(Ribbon),
    title: "数据统计",
    description: "全面的数据分析",
  },
]);

// 功能特性数据
const features = ref([
  {
    id: 1,
    icon: markRaw(PersonCircle),
    title: "角色管理",
    description: "轻松管理多个游戏角色，统一查看角色信息、等级进度和装备状态",
  },
  {
    id: 2,
    icon: markRaw(Cube),
    title: "任务自动化",
    description: "智能日常任务系统，自动完成重复性任务，节省您的宝贵时间",
  },
  {
    id: 3,
    icon: markRaw(Ribbon),
    title: "数据分析",
    description: "详细的数据统计和分析报告，帮助您更好地了解游戏进度",
  },
  {
    id: 4,
    icon: markRaw(Settings),
    title: "个性化设置",
    description: "灵活的配置选项，根据您的需求定制最适合的管理方案",
  },
]);

// 统计数据
const stats = ref([
  { id: 1, number: "1000+", label: "活跃用户" },
  { id: 2, number: "50K+", label: "管理角色" },
  { id: 3, number: "100K+", label: "完成任务" },
  { id: 4, number: "99.9%", label: "系统稳定性" },
]);

// 滚动到功能区域
const scrollToFeatures = () => {
  if (featuresSection.value) {
    featuresSection.value.scrollIntoView({
      behavior: "smooth",
    });
  }
};

const restoreState = async () => {
  /**
   * 从备份文件恢复localStorage和IndexedDB数据
   * 让用户选择备份文件，然后执行恢复逻辑
   */
  try {
    console.info("开始恢复配置...");
    let file;

    // 尝试使用File System Access API（现代浏览器支持）
    if (window.showOpenFilePicker) {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "JSON Files",
            accept: { "application/json": [".json"] },
          },
        ],
        multiple: false,
        excludeAcceptAllOption: true,
        suggestedName: "state.json",
      });
      console.info(`选择的文件: ${fileHandle.name}`);
      file = await fileHandle.getFile();
    } else {
      // 回退方案：使用传统文件输入（支持所有浏览器，包括移动设备）
      file = await new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.style.display = "none";

        input.onchange = () => {
          if (input.files && input.files[0]) {
            resolve(input.files[0]);
          } else {
            reject(new Error("用户取消了文件选择"));
          }
          document.body.removeChild(input);
        };

        input.oncancel = () => {
          reject(new Error("用户取消了文件选择"));
          document.body.removeChild(input);
        };

        document.body.appendChild(input);
        input.click();
      });
      console.info(`选择的文件: ${file.name}`);
    }

    // 读取文件内容
    console.info(`文件大小: ${file.size} 字节`);
    const fileContent = await file.text();
    console.info(`文件内容长度: ${fileContent.length} 字符`);
    const stateData = JSON.parse(fileContent);
    console.info("文件解析成功:", {
      hasLocalStorage: !!stateData.localStorage,
      hasIndexedDB: !!stateData.indexedDB,
      databasesCount: stateData.indexedDB?.databases?.length || 0,
    });

    if (!stateData) {
      console.error("备份文件为空，无法恢复");
      message.error("备份文件为空，无法恢复");
      return false;
    }

    // 执行恢复逻辑
    console.info("开始恢复数据...");

    // 恢复localStorage数据 - 直接使用localStorage.setItem
    if (stateData.localStorage) {
      const localStorageData = stateData.localStorage;
      console.info(
        `准备恢复 ${Object.keys(localStorageData).length} 项localStorage数据`,
      );

      // 批量恢复所有localStorage数据
      console.info("批量恢复localStorage数据...");
      localStorage.clear();
      await sleep(1000);
      for (const key in localStorageData) {
        try {
          console.info(`恢复localStorage: ${key}`);
          localStorage.setItem(key, localStorageData[key]);
          console.info(`恢复localStorage数据: ${key}`);
        } catch (e) {
          console.error("恢复localStorage失败:", key, e);
        }
      }

      console.info("localStorage数据恢复完成");
    } else {
      console.info("备份文件中没有localStorage数据");
    }

    // 恢复IndexedDB数据 - 直接打开，不删除重建
    if (stateData.indexedDB && stateData.indexedDB.databases) {
      const indexedDBData = stateData.indexedDB;
      console.info(
        `准备恢复 ${indexedDBData.databases.length} 个IndexedDB数据库`,
      );

      // 等待所有数据库恢复完成
      const dbPromises = [];
      for (const dbInfo of indexedDBData.databases) {
        if (dbInfo && dbInfo.name) {
          console.info(
            `处理数据库: ${dbInfo.name} (版本: ${dbInfo.version || 1})`,
          );
          // 直接打开已存在的数据库
          dbPromises.push(openDatabase(dbInfo));
        }
      }
      // 等待所有数据库恢复完成
      await Promise.all(dbPromises);
      console.info(
        `成功恢复 ${indexedDBData.databases.length} 个IndexedDB数据库`,
      );
    } else {
      console.info("备份文件中没有IndexedDB数据");
    }

    console.info("配置恢复完成！");
    // 直接刷新页面以应用更改
    window.location.reload();
    return true;
  } catch (err) {
    if (err.name === "AbortError") {
      console.info("用户取消了文件选择");
      return false;
    }
    console.error("恢复配置时发生异常:", err);
    message.error("恢复配置失败: " + err.message);
    return false;
  }

  function openDatabase(dbInfo) {
    return new Promise((resolve, reject) => {
      console.info(`打开数据库: ${dbInfo.name}`);
      // 创建或打开数据库
      const version = dbInfo.version || 1;
      console.info(`数据库版本: ${version}`);
      const openReq = indexedDB.open(dbInfo.name, version);

      openReq.onupgradeneeded = (event) => {
        console.info(`数据库 ${dbInfo.name} 需要升级`);
        const database = event.target.result;
        // 创建存储对象，使用保存的keyPath
        if (dbInfo.stores) {
          console.info(`准备创建 ${dbInfo.stores.length} 个存储对象`);
          dbInfo.stores.forEach((storeInfo) => {
            console.info(`处理存储对象: ${storeInfo.name}`);
            if (!database.objectStoreNames.contains(storeInfo.name)) {
              try {
                console.info(`创建存储对象: ${storeInfo.name}`);
                // 使用保存的keyPath，默认为'id'
                const keyPath = storeInfo.keyPath || "id";
                console.info(`存储对象keyPath: ${keyPath}`);
                const objectStore = database.createObjectStore(storeInfo.name, {
                  keyPath,
                });

                // 创建保存的索引
                if (storeInfo.indexes && storeInfo.indexes.length > 0) {
                  console.info(`准备创建 ${storeInfo.indexes.length} 个索引`);
                  storeInfo.indexes.forEach((indexInfo) => {
                    try {
                      console.info(
                        `创建索引: ${indexInfo.name} (keyPath: ${indexInfo.keyPath})`,
                      );
                      objectStore.createIndex(
                        indexInfo.name,
                        indexInfo.keyPath,
                        {
                          unique: indexInfo.unique || false,
                        },
                      );
                    } catch (e) {
                      console.error("创建索引失败:", indexInfo.name, e);
                    }
                  });
                }
              } catch (e) {
                console.error("创建存储对象失败:", storeInfo.name, e);
              }
            } else {
              console.info(`存储对象 ${storeInfo.name} 已存在，跳过创建`);
            }
          });
        }
      };

      openReq.onsuccess = async (event) => {
        console.info(`数据库 ${dbInfo.name} 打开成功`);
        const database = event.target.result;

        try {
          // 清空并恢复数据
          if (dbInfo.stores) {
            console.info(`处理 ${dbInfo.stores.length} 个存储对象的数据`);
            for (const storeInfo of dbInfo.stores) {
              console.info(`处理存储对象 ${storeInfo.name} 的数据`);
              // 清空现有数据
              console.info(`清空存储对象 ${storeInfo.name} 的现有数据`);
              await new Promise((resolveClear) => {
                const clearTransaction = database.transaction(
                  [storeInfo.name],
                  "readwrite",
                );
                const clearStore = clearTransaction.objectStore(storeInfo.name);
                const clearRequest = clearStore.clear();
                clearRequest.onsuccess = () => resolveClear();
                clearRequest.onerror = () => resolveClear();
              });
              await sleep(500);

              // 恢复数据
              if (storeInfo.data && storeInfo.data.length > 0) {
                console.info(
                  `准备恢复 ${storeInfo.data.length} 条数据到存储对象 ${storeInfo.name}`,
                );
                await new Promise((resolveAdd) => {
                  const addTransaction = database.transaction(
                    [storeInfo.name],
                    "readwrite",
                  );
                  const addStore = addTransaction.objectStore(storeInfo.name);

                  let completed = 0;
                  storeInfo.data.forEach((item, index) => {
                    console.info(
                      `恢复第 ${index + 1} 条数据到 ${storeInfo.name}`,
                    );
                    // 处理ArrayBuffer数据
                    function processData(data) {
                      if (Array.isArray(data)) {
                        return data.map(processData);
                      } else if (typeof data === "object" && data !== null) {
                        if (data.__type__ === "ArrayBuffer") {
                          console.info("处理ArrayBuffer数据");
                          // 将Base64转换为ArrayBuffer
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

                    const processedItem = processData(item);
                    const addRequest = addStore.add(processedItem);
                    addRequest.onsuccess = () => {
                      completed++;
                      if (completed === storeInfo.data.length) {
                        resolveAdd();
                      }
                    };
                    addRequest.onerror = () => {
                      completed++;
                      if (completed === storeInfo.data.length) {
                        resolveAdd();
                      }
                    };
                  });
                });
                console.info(`数据恢复完成: ${storeInfo.name}`);
              } else {
                console.info(`存储对象 ${storeInfo.name} 没有数据需要恢复`);
              }
            }
          }
        } finally {
          console.info(`关闭数据库: ${dbInfo.name}`);
          database.close();
          resolve();
        }
      };

      openReq.onerror = (event) => {
        console.error("打开数据库失败:", dbInfo.name, event.target.error);
        reject(event.target.error);
      };
    });
  }
};

onMounted(() => {
  // 初始化认证状态
  authStore.initAuth();
});
</script>

<style scoped lang="scss">
.home-page {
  min-height: 100dvh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  position: relative;
  overflow-x: hidden;
  padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom));
}

.drawer-menu {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
}

.drawer-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius-medium);
  color: var(--text-secondary);
  text-decoration: none;
}

.drawer-item.router-link-active {
  background: var(--primary-color-light);
  color: var(--primary-color);
}

.drawer-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

// 导航栏
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-fixed);
  padding: var(--spacing-md) 0;
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mobile-menu-button {
  display: none;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius-small);
}

.brand-text {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: white;
}

.nav-actions {
  display: flex;
  gap: var(--spacing-sm);
}

// 主要内容
.main-content {
  padding-top: 80px;
}

// 英雄区域
.hero-section {
  padding: var(--spacing-2xl) 0;
  min-height: 80vh;
  display: flex;
  align-items: center;
}

.hero-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-2xl);
  align-items: center;
}

.hero-text {
  color: white;
}

.hero-title {
  font-size: 3.5rem;
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  margin-bottom: var(--spacing-md);
  background: linear-gradient(
    45deg,
    var(--bg-primary),
    var(--primary-color-light)
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: var(--font-size-xl);
  opacity: 0.9;
  margin-bottom: var(--spacing-xl);
  line-height: var(--line-height-relaxed);
}

.hero-actions {
  display: flex;
  gap: var(--spacing-md);
}

.hero-button {
  padding: var(--spacing-md) var(--spacing-xl);
  font-size: var(--font-size-lg);
}

// 功能卡片
.feature-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-md);
}

.feature-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  }
}

.card-icon {
  width: 48px;
  height: 48px;
  color: #fff;
  margin-bottom: var(--spacing-md);

  :deep(svg) {
    width: 100%;
    height: 100%;
  }
}

.card-content h3 {
  color: white;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-sm);
}

.card-content p {
  color: rgba(255, 255, 255, 0.8);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
}

// 功能特性区域
.features-section {
  padding: var(--spacing-2xl) 0;
  background: var(--bg-primary);
}

.section-header {
  text-align: center;
  margin-bottom: var(--spacing-2xl);
}

.section-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-md);
}

.section-subtitle {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0 auto;
  line-height: var(--line-height-relaxed);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-xl);
}

.feature-item {
  text-align: center;
  padding: var(--spacing-xl);
  border-radius: var(--border-radius-large);
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-heavy);
  }
}

.feature-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--spacing-lg);
  color: var(--primary-color);

  :deep(svg) {
    width: 100%;
    height: 100%;
  }
}

.feature-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-md);
}

.feature-description {
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
}

// 统计区域
.stats-section {
  padding: var(--spacing-2xl) 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 深色主题下统计区背景 */
[data-theme="dark"] .stats-section {
  background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-xl);
}

.stat-item {
  text-align: center;
  color: white;
}

.stat-number {
  font-size: 3rem;
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-sm);
}

.stat-label {
  font-size: var(--font-size-lg);
  opacity: 0.9;
}

// 页脚
.footer {
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: var(--spacing-xl) 0;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.footer-logo {
  width: 24px;
  height: 24px;
}

.footer-text {
  font-weight: var(--font-weight-medium);
}

.footer-links {
  display: flex;
  gap: var(--spacing-lg);
}

.footer-link {
  color: rgba(255, 255, 255, 0.8);
  transition: color var(--transition-fast);

  &:hover {
    color: white;
  }
}

.footer-bottom {
  text-align: center;
  padding-top: var(--spacing-lg);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
}

// 响应式设计
@media (max-width: 768px) {
  .hero-content {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .mobile-menu-button {
    display: inline-flex;
    margin-left: auto;
  }

  .nav-actions {
    display: none;
  }

  .hero-title {
    font-size: 2.5rem;
  }

  .hero-actions {
    justify-content: center;
  }

  .footer-content {
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .nav-actions {
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .footer-links {
    flex-direction: column;
    gap: var(--spacing-md);
  }
}
</style>
