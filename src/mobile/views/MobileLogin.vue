<template>
  <!-- 登录页不在 MobileLayout 里（没有顶栏 / tabbar），所以自己撑一个 .mobile-shell：
       PC 上同样是 430px 居中窄壳，与壳内页面视觉连续，不会突然变成一屏宽的桌面卡片。 -->
  <div class="mobile-shell m-auth">
    <main class="m-auth-main">
      <div class="m-auth-wrap">
        <div class="m-auth-head">
          <span class="m-auth-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7.5 8h9a4.5 4.5 0 0 1 4.4 3.6l.8 3.6a2.6 2.6 0 0 1-4.6 2.2L16 15.5H8l-1.1 1.9a2.6 2.6 0 0 1-4.6-2.2l.8-3.6A4.5 4.5 0 0 1 7.5 8z" />
              <path d="M8.2 11.6v2M7.2 12.6h2M15.4 11.9h.01M17.2 13.4h.01" />
            </svg>
          </span>
          <h1 class="m-auth-title">咸鱼助手</h1>
          <p class="m-auth-sub">Token 管理与游戏辅助</p>
        </div>

        <!-- 注册成功后由注册页带 ?registered=1 跳回：用一条 band 提示，不依赖 toast
             （登录页还没有壳里的 toast 容器） -->
        <p v-if="justRegistered" class="m-auth-ok">注册成功，请用新账户登录</p>

        <form class="m-card m-auth-card" @submit.prevent="submit">
          <label class="m-auth-f">
            <span class="m-auth-lb">用户名</span>
            <input
              v-model="form.username"
              class="m-finput"
              type="text"
              autocomplete="username"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="请输入用户名"
            />
          </label>

          <label class="m-auth-f">
            <span class="m-auth-lb">密码</span>
            <input
              v-model="form.password"
              class="m-finput"
              type="password"
              autocomplete="current-password"
              placeholder="请输入密码"
            />
          </label>

          <p v-if="err" class="m-auth-err">{{ err }}</p>

          <button class="m-btn m-btn-p m-btn-block" type="submit" :disabled="busy">
            {{ busy ? (authStore.isSyncing ? "正在加载数据…" : "登录中…") : "登录" }}
          </button>
        </form>

        <div class="m-auth-alt">
          还没有账户？
          <button class="m-link" type="button" @click="goRegister">立即注册</button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
/**
 * 移动端登录页（/mobile/login）
 *
 * 逻辑与桌面 views/Login.vue 同一套：authStore.login + 同一条校验规则
 * （用户名必填、密码必填且不少于 6 位 —— 这是登录页的历史口径，
 *   不要套 passwordPolicy 的 8-64 位强度规则，老账号是弱密码会被锁在门外）。
 * 只把展示换成移动端设计语言：--m-* token + .m-card / .m-finput / .m-btn。
 *
 * ★ 只支持用户名登录：后端 shared/auth.js 的 key = sha256(username)、请求体只认
 *   username/password，邮箱既不落库也不参与登录（桌面版「用户名或邮箱」的说法是错的）。
 *
 * 与桌面版的差异（有意为之，非功能缺失）：
 *   · 去向默认 /mobile/home，不再写死 /admin/dashboard —— 移动模式下 /admin/* 会被守卫弹回
 *   · 校验错误显示在卡片内联位置（同 MobileMe 改密码），不是右上角 toast
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const form = reactive({ username: "", password: "" });
const err = ref("");

const busy = computed(() => authStore.isLoading);
const justRegistered = computed(() => route.query.registered === "1");

/** 第一条不通过的规则，文案与桌面 Register/Login 的 naive 规则对齐（只认用户名） */
function validate() {
  if (!form.username.trim()) return "请输入用户名";
  if (!form.password) return "请输入密码";
  if (form.password.length < 6) return "密码长度不能少于6位";
  return "";
}

/**
 * 登录后去向：优先用守卫带上来的 redirect（例如直接打开 /mobile/tokens 被弹回来），
 * 其余一律回移动端首页。指向登录/注册页自身的 redirect 视为无效，避免自跳。
 */
function targetPath() {
  const q = route.query.redirect;
  if (typeof q === "string" && q && !/^\/(mobile\/)?(login|register)/.test(q)) return q;
  return "/mobile/home";
}

async function submit() {
  if (busy.value) return;
  err.value = validate();
  if (err.value) return;

  const result = await authStore.login({
    username: form.username.trim(),
    password: form.password,
  });

  if (!result.success) {
    err.value = result.message || "登录失败，请重试";
    return;
  }
  router.replace(targetPath());
}

function goRegister() {
  router.push("/mobile/register");
}

/* body.m-mobile 限域移动端弹窗 / Naive 控件样式（同 MobileLayout 的做法）。
   卸载时只在去向不是 /mobile/* 时才摘掉：登录成功后 MobileLayout 会自己再加一次，
   若这里无条件 remove 且卸载晚于挂载，会把壳里的移动端样式一并抹掉。 */
onMounted(() => document.body.classList.add("m-mobile"));
onBeforeUnmount(() => {
  if (!router.currentRoute.value.path.startsWith("/mobile/")) {
    document.body.classList.remove("m-mobile");
  }
});
</script>
