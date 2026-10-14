<template>
  <div class="login-page">
    <div class="login-container">
      <!-- 登录表单卡片 -->
      <div class="login-card glass">
        <div class="card-header">
          <div class="brand">
            <n-icon class="brand-logo" :size="64">
              <GameController />
            </n-icon>
            <h1 class="brand-title">游戏管理系统</h1>
          </div>
          <p class="welcome-text">欢迎回来，请登录您的账户</p>
        </div>

        <div class="card-body">
          <n-form
            ref="loginFormRef"
            :model="loginForm"
            :rules="loginRules"
            size="large"
            :show-label="false"
          >
            <n-form-item path="username">
              <n-input
                v-model:value="loginForm.username"
                placeholder="用户名或邮箱"
                :input-props="{ autocomplete: 'username' }"
              >
                <template #prefix>
                  <n-icon>
                    <PersonCircle />
                  </n-icon>
                </template>
              </n-input>
            </n-form-item>

            <n-form-item path="password">
              <n-input
                v-model:value="loginForm.password"
                type="password"
                placeholder="密码"
                :input-props="{ autocomplete: 'current-password' }"
                @keydown.enter="handleLogin"
              >
                <template #prefix>
                  <n-icon>
                    <LockClosed />
                  </n-icon>
                </template>
              </n-input>
            </n-form-item>

            <n-button
              type="primary"
              size="large"
              block
              :loading="authStore.isLoading"
              class="login-button"
              @click="handleLogin"
            >
              {{ authStore.isSyncing ? "正在加载数据…" : "登录" }}
            </n-button>
          </n-form>

          <div class="register-prompt">
            <span>还没有账户？</span>
            <n-button text type="primary" @click="router.push('/register')">
              立即注册
            </n-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 背景装饰 -->
    <div class="background-decoration">
      <div class="decoration-circle circle-1" />
      <div class="decoration-circle circle-2" />
      <div class="decoration-circle circle-3" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import { useAuthStore } from "@/stores/auth";
import { PersonCircle, LockClosed, GameController } from "@vicons/ionicons5";

const router = useRouter();
const message = useMessage();
const authStore = useAuthStore();
const loginFormRef = ref(null);

// 登录表单数据
const loginForm = reactive({
  username: "",
  password: "",
});

// 表单验证规则
const loginRules = {
  username: [
    {
      required: true,
      message: "请输入用户名或邮箱",
      trigger: ["input", "blur"],
    },
  ],
  password: [
    {
      required: true,
      message: "请输入密码",
      trigger: ["input", "blur"],
    },
    {
      min: 6,
      message: "密码长度不能少于6位",
      trigger: ["input", "blur"],
    },
  ],
};

// 处理登录
const handleLogin = async () => {
  if (!loginFormRef.value) return;

  try {
    await loginFormRef.value.validate();

    const result = await authStore.login({
      username: loginForm.username,
      password: loginForm.password,
    });

    if (result.success) {
      message.success("登录成功");

      // 跳转到dashboard或之前访问的页面
      const redirect =
        router.currentRoute.value.query.redirect || "/admin/dashboard";
      router.push(redirect);
    } else {
      message.error(result.message);
    }
  } catch (error) {
    // 表单验证失败
    console.error("Login validation failed:", error);
  }
};

onMounted(() => {
  // 如果已经登录，直接跳转
  if (authStore.isAuthenticated) {
    router.push("/admin/dashboard");
  }
});
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100dvh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom));
}

/* 深色主题下背景 */
[data-theme="dark"] .login-page {
  background: linear-gradient(135deg, #0f172a 0%, #1f2937 100%);
}

.login-container {
  display: grid;
  grid-template-columns: 1fr;
  max-width: 500px;
  width: 100%;
  padding: var(--spacing-lg);
}

.login-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-2xl);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* 深色主题下登录卡片 */
[data-theme="dark"] .login-card {
  background: rgba(17, 24, 39, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

.card-header {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.brand-logo {
  color: var(--primary-color);
}

.brand-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0;
}

.welcome-text {
  color: var(--text-secondary);
  font-size: var(--font-size-md);
  margin: 0;
}

.card-body {
  .n-form {
    .n-form-item {
      margin-bottom: var(--spacing-lg);
    }
  }
}

.login-button {
  height: 48px;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-lg);
}

.register-prompt {
  text-align: center;
  color: var(--text-secondary);

  span {
    margin-right: var(--spacing-sm);
  }
}


// 背景装饰
.background-decoration {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: -1;
}

.decoration-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  animation: float 6s ease-in-out infinite;
}

.circle-1 {
  width: 200px;
  height: 200px;
  top: 10%;
  right: 10%;
  animation-delay: 0s;
}

.circle-2 {
  width: 150px;
  height: 150px;
  bottom: 20%;
  left: 15%;
  animation-delay: 2s;
}

.circle-3 {
  width: 100px;
  height: 100px;
  top: 60%;
  right: 20%;
  animation-delay: 4s;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }

  50% {
    transform: translateY(-20px) rotate(180deg);
  }
}

// 响应式设计
@media (max-width: 640px) {
  .login-container {
    padding: var(--spacing-md);
  }

  .login-card {
    padding: var(--spacing-xl);
  }

  .brand-title {
    font-size: var(--font-size-xl);
  }

  .decoration-circle {
    display: none;
  }
}
</style>
