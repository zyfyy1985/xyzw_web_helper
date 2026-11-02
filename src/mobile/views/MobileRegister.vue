<template>
  <div class="mobile-shell m-auth">
    <main class="m-auth-main">
      <div class="m-auth-wrap">
        <div class="m-auth-head">
          <span class="m-auth-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8.5" r="3.5" />
              <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
              <path d="M18.5 4.5v4M16.5 6.5h4" />
            </svg>
          </span>
          <h1 class="m-auth-title">注册账户</h1>
          <p class="m-auth-sub">需要邀请码，注册后登录使用</p>
        </div>

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
              placeholder="3-20 个字符"
            />
          </label>

          <label class="m-auth-f">
            <span class="m-auth-lb">邮箱</span>
            <input
              v-model="form.email"
              class="m-finput"
              type="email"
              autocomplete="email"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="请输入邮箱地址"
            />
          </label>

          <label class="m-auth-f">
            <span class="m-auth-lb">密码</span>
            <input
              v-model="form.password"
              class="m-finput"
              type="password"
              autocomplete="new-password"
              placeholder="请输入密码"
            />
            <span class="m-hint">8-64 位，需同时含大写字母、小写字母和数字</span>
          </label>

          <label class="m-auth-f">
            <span class="m-auth-lb">确认密码</span>
            <input
              v-model="form.confirmPassword"
              class="m-finput"
              type="password"
              autocomplete="new-password"
              placeholder="请再次输入密码"
            />
          </label>

          <label class="m-auth-f">
            <span class="m-auth-lb">邀请码</span>
            <input
              v-model="form.inviteCode"
              class="m-finput"
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              autocorrect="off"
              spellcheck="false"
              maxlength="32"
              placeholder="XYZW 开头的 16 位字母数字"
            />
            <span class="m-hint">可带 XYZW 前缀与横线，会自动规范化</span>
          </label>

          <label class="m-auth-agree">
            <input v-model="form.agree" type="checkbox" />
            <span class="m-auth-box" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            </span>
            <span class="m-auth-agree-t">
              我已阅读并同意
              <button
                type="button"
                class="m-auth-doc m-veil-off"
                @click.prevent.stop="openLegal('terms')"
              >用户协议</button>
              和
              <button
                type="button"
                class="m-auth-doc m-veil-off"
                @click.prevent.stop="openLegal('privacy')"
              >隐私政策</button>
            </span>
          </label>

          <p v-if="err" class="m-auth-err">{{ err }}</p>

          <button class="m-btn m-btn-p m-btn-block" type="submit" :disabled="busy || !form.agree">
            {{ busy ? "注册中…" : "注册账户" }}
          </button>
        </form>

        <div class="m-auth-alt">
          已有账户？
          <button class="m-link" type="button" @click="router.push('/mobile/login')">立即登录</button>
        </div>
      </div>
    </main>

    <!-- 用户协议 / 隐私政策全文抽屉（与「我的 → 隐私与协议」共用同一个组件） -->
    <LegalSheet ref="legalRef" />
  </div>
</template>

<script setup>
/**
 * 移动端注册页（/mobile/register）
 *
 * 字段与校验完全照搬桌面 views/Register.vue：
 *   用户名 3-20 位 / 邮箱格式 / 密码走 passwordPolicy（8-64 位 + 大小写 + 数字）/
 *   两次密码一致 / 邀请码 16 位字母数字 / 必须勾选同意条款。
 * 密码规则复用 @/utils/passwordPolicy 的导出函数（与后端 shared/auth.js 同源），
 * 不在这里另抄一份正则。
 *
 * 唯一的有意差异：桌面版「服务条款 / 隐私政策」两个按钮绑的是未定义的 showTerms /
 * showPrivacy（点了会抛错，对应弹窗也从未实现）。移动版把这两个词做成真入口：
 * 点开是底部抽屉里的全文（components/LegalSheet.vue，文案在 legal/docs.js），
 * 与「我的 → 隐私与协议」同一份 —— 勾选之前就能读到，不是让人盲勾。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import LegalSheet from "@/mobile/components/LegalSheet.vue";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  isPasswordComplexityOk,
  isPasswordLengthOk,
} from "@/utils/passwordPolicy";

const router = useRouter();
const authStore = useAuthStore();

/* 协议抽屉：组件自己管开合与滚动，这里只把 key 递进去 */
const legalRef = ref(null);
function openLegal(key) {
  legalRef.value?.open(key);
}

const form = reactive({
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  inviteCode: "",
  agree: false,
});

const err = ref("");
const busy = computed(() => authStore.isLoading);

/**
 * 邀请码归一化：与后端 shared/auth.js 的 normalizeInviteCode 完全一致
 * （去空格/横线/下划线 → 转大写 → 剥掉 XYZW 前缀），保证前后端判定同源。
 * ⚠️ 正文位数必须与后端 INVITE_BODY_LEN 对齐：2026-10-15 由 8 位加长为 16 位。
 */
const INVITE_BODY_RE = /^[A-HJ-NP-Z2-9]{16}$/;
function normalizeInviteCode(value) {
  let s = String(value == null ? "" : value)
    .toUpperCase()
    .replace(/[\s\-_]/g, "");
  if (s.startsWith("XYZW")) s = s.slice(4);
  return s;
}

/** 第一条不通过的规则；文案与桌面端的 validate 提示逐字对齐 */
function validate() {
  const username = form.username.trim();
  if (!username) return "请输入用户名";
  if (username.length < 3 || username.length > 20) return "用户名长度应在3-20个字符之间";

  const email = form.email.trim();
  if (!email) return "请输入邮箱地址";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "请输入正确的邮箱格式";

  if (!form.password) return "请输入密码";
  if (!isPasswordLengthOk(form.password)) return `密码长度需 ${PASSWORD_MIN}-${PASSWORD_MAX} 位`;
  if (!isPasswordComplexityOk(form.password)) return "密码需同时包含大写字母、小写字母和数字";

  if (!form.confirmPassword) return "请确认密码";
  if (form.confirmPassword !== form.password) return "两次输入的密码不一致";

  if (!form.inviteCode.trim()) return "请输入邀请码";
  if (!INVITE_BODY_RE.test(normalizeInviteCode(form.inviteCode))) {
    return "邀请码格式不正确（16 位字母数字，如 3F7K-9QMD-2XTV-8HBW）";
  }

  if (!form.agree) return "请先同意服务条款和隐私政策";
  return "";
}

async function submit() {
  if (busy.value) return;
  err.value = validate();
  if (err.value) return;

  /* 邀请码按原样提交（带不带 XYZW 前缀都由后端 normalizeInviteCode 归一），与桌面版一致 */
  const result = await authStore.register({
    username: form.username.trim(),
    email: form.email.trim(),
    password: form.password,
    inviteCode: form.inviteCode.trim(),
  });

  if (!result.success) {
    err.value = result.message || "注册失败，请重试";
    return;
  }
  /* 注册不自动登录（与桌面版一致，后端注册接口只返回成功）：
     回登录页并带 ?registered=1，那边显示一条「注册成功」的 band 提示 */
  router.replace("/mobile/login?registered=1");
}

onMounted(() => document.body.classList.add("m-mobile"));
onBeforeUnmount(() => {
  if (!router.currentRoute.value.path.startsWith("/mobile/")) {
    document.body.classList.remove("m-mobile");
  }
});
</script>
