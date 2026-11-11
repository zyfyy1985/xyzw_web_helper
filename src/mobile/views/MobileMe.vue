<template>
  <div class="m-page m-me">
    <!-- 顶部原来那张「头像 + 名字 + 已选 Token + 切换账号」的账号卡已按用户要求去掉（11-02）：
         同样的信息现在由下面的「账户信息」卡给全，而「切换账号」的入口在顶栏
         ——点顶部那条账号名（.m-acct）打开的就是同一个账号抽屉。 -->

    <!-- ============ 账户信息 ============
         只读三行（用户名 / 用户身份 / 注册时间），数据来自 authStore.userInfo
         （服务端 /api/auth 的 me / login 只回 { username, createdAt }）。
         修改密码从「系统」挪到这里：它是账号级动作，和主题/换肤不是一类。
         ★ 三行的图标块与下面「修改密码」完全同形（36px 实心 --m-primary-deep + 白图标），
           只去掉 role / 箭头 / 悬停 —— 同一张卡里出现「细描边小图标 + 实心方块」两套，
           看着像两拨控件拼在一起（用户 11-02 指出）。 -->
    <div class="m-card">
      <div class="m-card-h"><span class="m-t">账户信息</span></div>

      <div class="m-trow">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.5 3.1-5.6 7-5.6s7 2.1 7 5.6"/></svg>
        </span>
        <span class="m-body"><span class="m-nm">用户名</span></span>
        <span class="m-rt m-me-val">{{ acctUser }}</span>
      </div>

      <div class="m-trow">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6z"/><path d="M9.2 12l2 2 3.6-3.9"/></svg>
        </span>
        <span class="m-body"><span class="m-nm">用户身份</span></span>
        <span class="m-rt m-me-val">{{ acctRole }}</span>
      </div>

      <div class="m-trow">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>
        </span>
        <span class="m-body"><span class="m-nm">注册时间</span></span>
        <span class="m-rt m-me-val">{{ acctCreated }}</span>
      </div>

      <div class="m-trow" role="button" tabindex="0" @click="openPwd" @keydown.enter="openPwd">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        </span>
        <span class="m-body">
          <span class="m-nm">修改密码</span>
          <span class="m-ds">登录密码，改完下次登录用新密码</span>
        </span>
        <span class="m-rt">
          <svg class="m-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </div>

      <!-- 角色授权：账号级动作，和修改密码同一张卡。
           入口只放在这里 + 角色列表每张卡的「⋯」，两处指的是同一件事。 -->
      <div class="m-trow" role="button" tabindex="0" @click="router.push('/mobile/share')" @keydown.enter="router.push('/mobile/share')">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="3"/><path d="M12 12h8M17 12v3M20 12v2"/></svg>
        </span>
        <span class="m-body">
          <span class="m-nm">角色授权</span>
          <span class="m-ds">把自己的角色授权给他人，或查看收到哪些角色</span>
        </span>
        <span class="m-rt">
          <svg class="m-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </div>
    </div>

    <!-- ============ 调试 ============
         只给 fisher 看（用户 11-02 要求）：消息测试是排障用的原始报文收发台，
         普通用户点进去只会看到一堆看不懂的帧。卡名按用户要求从「工具与调试」收成「调试」。
         ★ 这是纯前端开关，服务端 /api/auth 的 me 只回 { username, createdAt }，
           没有角色字段 ⇒ 挡的是「入口可见性」，不是权限。要真拦，得后端加 role。 -->
    <div v-if="isDev" class="m-card">
      <div class="m-card-h"><span class="m-t">调试</span></div>
      <div class="m-trow" role="button" tabindex="0" @click="router.push('/mobile/ws-test')" @keydown.enter="router.push('/mobile/ws-test')">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-9 8.4L7 22l.9-3.7A8.5 8.5 0 1 1 21 11.5z"/><path d="M9 10h7M9 14h4"/></svg>
        </span>
        <span class="m-body">
          <span class="m-nm">消息测试</span>
          <span class="m-ds">手动发命令，看原始收发报文</span>
        </span>
        <span class="m-rt">
          <svg class="m-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </div>
    </div>

    <!-- ============ 系统 ============ -->
    <div class="m-card">
      <div class="m-card-h"><span class="m-t">系统</span></div>
      <div class="m-trow" role="button" tabindex="0" @click="toggleTheme" @keydown.enter="toggleTheme">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </span>
        <span class="m-body">
          <span class="m-nm">深浅色主题</span>
          <span class="m-ds">当前：{{ isDark ? "深色" : "浅色" }}</span>
        </span>
        <span class="m-rt"><span class="m-sw" :class="{ on: isDark }"><i /></span></span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="openSkin" @keydown.enter="openSkin">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H13a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4 6 6 0 0 0-6-6h-3z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16.5" cy="10" r="1.2"/></svg>
        </span>
        <span class="m-body">
          <span class="m-nm">主题换肤</span>
          <span class="m-ds">当前：{{ skin.label }}</span>
        </span>
        <span class="m-rt">
          <span class="m-skin-pv">
            <i :style="{ background: skinSwatch(skin.id, 1) }" />
            <i :style="{ background: skinSwatch(skin.id, 2) }" />
          </span>
        </span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="confirmClearCache" @keydown.enter="confirmClearCache">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.2-6.9"/><path d="M21 4v5h-5"/></svg>
        </span>
        <span class="m-body">
          <span class="m-nm">清除缓存</span>
          <span class="m-ds">清掉浏览器缓存的文件再重载，不动账号和本地数据</span>
        </span>
        <span class="m-rt">
          <svg class="m-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="goLegacy" @keydown.enter="goLegacy">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.6"/><path d="M8 20h8"/></svg>
        </span>
        <span class="m-body">
          <span class="m-nm">切回旧版界面</span>
          <span class="m-ds">旧版为宽屏布局，页面更全（含配置类旧界面）</span>
        </span>
        <span class="m-rt">
          <svg class="m-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </div>
      <!-- 原「关于」卡里的「界面版本 / 数据来源」两行按用户要求去掉（11-02）：
           版本号在「关于」里对用户没有行动价值，数据来源同理由开发看即可。 -->
    </div>

    <!-- ============ 隐私与协议 ============
         原「关于」卡：标题改成「隐私与协议」，内容换成两份文档入口。
         界面版本 / 数据来源两行挪到「系统」卡尾部（它们的性质是系统信息，不是协议）。 -->
    <div class="m-card">
      <div class="m-card-h"><span class="m-t">隐私与协议</span></div>
      <div class="m-trow" role="button" tabindex="0" @click="openLegal('privacy')" @keydown.enter="openLegal('privacy')">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6z"/><path d="M12 8v4M12 15.2v.2"/></svg>
        </span>
        <span class="m-body">
          <span class="m-nm">隐私政策</span>
          <span class="m-ds">我们收集哪些信息、怎么使用和保存</span>
        </span>
        <span class="m-rt">
          <svg class="m-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="openLegal('terms')" @keydown.enter="openLegal('terms')">
        <span class="m-ib" style="background: var(--m-primary-deep)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>
        </span>
        <span class="m-body">
          <span class="m-nm">用户协议</span>
          <span class="m-ds">使用本站服务的权利与约定</span>
        </span>
        <span class="m-rt">
          <svg class="m-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </div>
    </div>

    <!-- ============ 退出登录 ============ -->
    <button class="m-btn m-btn-g m-btn-block m-me-logout" @click="handleLogout">退出登录</button>

    <!-- ============================================================
         修改密码（移植自桌面 views/Profile.vue，规则同一份 passwordPolicy）
         ============================================================ -->
    <div class="m-mask" :class="{ on: pwdSheet }" @click="closePwd"></div>
    <div class="m-sheet" :class="{ on: pwdSheet }">
      <div class="m-grab"></div>
      <h4>修改密码</h4>
      <div class="m-sh-sub">{{ PASSWORD_MIN }}-{{ PASSWORD_MAX }} 位，需同时包含大写字母、小写字母和数字</div>

      <label class="m-pw-f">
        <span>当前密码</span>
        <input
          v-model="pwdForm.currentPassword"
          class="m-finput"
          type="password"
          autocomplete="current-password"
          placeholder="请输入当前密码"
        />
      </label>
      <label class="m-pw-f">
        <span>新密码</span>
        <input
          v-model="pwdForm.newPassword"
          class="m-finput"
          type="password"
          autocomplete="new-password"
          placeholder="请输入新密码"
        />
      </label>
      <label class="m-pw-f">
        <span>确认新密码</span>
        <input
          v-model="pwdForm.confirmPassword"
          class="m-finput"
          type="password"
          autocomplete="new-password"
          placeholder="请再次输入新密码"
          @keydown.enter="submitPwd"
        />
      </label>

      <p v-if="pwdErr" class="m-pw-err">{{ pwdErr }}</p>

      <div class="m-pw-btns">
        <button class="m-btn m-btn-g" @click="closePwd">取消</button>
        <button class="m-btn m-btn-p" :disabled="pwdBusy" @click="submitPwd">{{ pwdBusy ? "提交中" : "确认修改" }}</button>
      </div>
    </div>

    <!-- ============================================================
         主题换肤：只换「行动色」（按钮/标签/高亮/身份牌），与深浅色叠加
         点卡片立即生效（不留「确定」——皮肤是即时可见的，多一步确认只是多一次点击）
         ============================================================ -->
    <div class="m-mask" :class="{ on: skinSheet }" @click="skinSheet = false"></div>
    <div class="m-sheet" :class="{ on: skinSheet }">
      <div class="m-grab"></div>
      <h4>主题换肤</h4>
      <div class="m-sh-sub">只换行动色，页底/文字/红绿黄语义色不动；与「深浅色主题」可任意组合</div>

      <div class="m-skin-grid">
        <button
          v-for="s in skins"
          :key="s.id"
          class="m-skin"
          :class="{ on: s.id === skinId }"
          @click="setSkin(s.id)"
        >
          <span class="m-skin-chip" :style="{ background: skinSwatch(s.id, 1) }">
            <i :style="{ background: skinSwatch(s.id, 2) }" />
          </span>
          <span class="m-skin-nm">{{ s.label }}</span>
        </button>
      </div>
    </div>

    <!-- 隐私政策 / 用户协议全文抽屉（与注册页共用同一个组件、同一份文案） -->
    <LegalSheet ref="legalRef" />
  </div>
</template>

<script setup>
import { computed, inject, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useMessage, useDialog } from "naive-ui";
import { storeToRefs } from "pinia";
import { useTokenStore } from "@/stores/tokenStore";
import { useAuthStore } from "@/stores/auth";
import { useTheme } from "@/composables/useTheme";
import { useSkin, skinSwatch } from "@/mobile/utils/skin";
import { confirmAction } from "@/mobile/utils/confirm";
import {
  PASSWORD_MIN,
  PASSWORD_MAX,
  isPasswordLengthOk,
  isPasswordComplexityOk,
} from "@/utils/passwordPolicy";
import { switchUiMode } from "@/mobile/uiMode";
import LegalSheet from "@/mobile/components/LegalSheet.vue";

const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const authStore = useAuthStore();

/* ---------- 隐私与协议 ----------
 * 两份文档的正文在 src/mobile/legal/docs.js，抽屉本身在 components/LegalSheet.vue
 * （注册页用的是同一个组件，改文案只改 docs.js 一处）。这里只负责把 key 递进去。 */
const legalRef = ref(null);
function openLegal(key) {
  legalRef.value?.open(key);
}

/* ---------- 工具与调试的可见性 ----------
 * 只有 fisher 这个账号能看到「消息测试」入口。判断用用户名（服务端没有角色字段），
 * 大小写不敏感 —— 登录名大小写由用户输入决定，不该因为写成 Fisher 就看不见。 */
const isDev = computed(() => (authStore.userInfo?.username || "").trim().toLowerCase() === "fisher");

/* ---------- 账户信息 ----------
 * 服务端 /api/auth 的 login / me 只回 { username, createdAt }（见 shared/auth.js），
 * 没有角色字段 ⇒ 身份默认「普通用户」；哪天后端加了 role / isAdmin，这里自然跟上，不用改模板。 */
const acctUser = computed(() => authStore.userInfo?.username || "—");
/* 身份：服务端现在没有 role 字段 ⇒ 默认「普通用户」。
   11-02 中途一度改成 SVIP + 金色胶囊，随即按用户要求改回 —— 身份牌这类「荣誉」文案别自己加戏，
   真要分级等后端出 role 字段再接（这里已经留好了 role / isAdmin 两条判断）。 */
const acctRole = computed(() => {
  const u = authStore.userInfo || {};
  if (u.isAdmin) return "管理员";
  return u.role || "普通用户";
});
/* createdAt 是 ISO 串（2026-07-16T06:08:54.123Z）⇒ 转本地时区按 yyyy-MM-dd HH:mm:ss 展示 */
const fmtDateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
};
const acctCreated = computed(() => fmtDateTime(authStore.userInfo?.createdAt));

/* ---------- 主题 ----------
 * 必须走 useTheme().toggleTheme()：它同时写 html.dark 类 + data-theme 属性（桌面样式靠 .dark，
 * 移动端靠 [data-theme]），关灯时两者都摘；isDark 是它内部的全局 ref，切换后本页即时反映。
 * 直接改 dataset.theme 会让复用桌面组件的那部分在暗色下不变色、并残留 .dark 类。 */
const { isDark, toggleTheme } = useTheme();

/* ---------- 主题换肤 ----------
 * 与深浅色是两层：setSkin 只写 html[data-skin]（skins.css 据此覆盖 --m-* 行动色），
 * 完全不动 data-theme，所以「深色 + 薰衣草紫」这种组合是合法的。
 * currentSkin 是模块级 ref，切完本页「当前：xx」即时更新，无需刷新。 */
const { skins, skinId, skin, setSkin } = useSkin();
const skinSheet = ref(false);
function openSkin() {
  skinSheet.value = true;
}

/* 外观切换：写入 xyzw_ui_mode 后整页重载，交给路由守卫按新模式重新分流 */
function goLegacy() {
  switchUiMode("legacy");
  router.push("/admin/dashboard");
}

/* ---------- 修改密码 ----------
 * 规则与桌面 views/Profile.vue 同源：都来自 utils/passwordPolicy（前端唯一真源，
 * 与后端 shared/auth.js 对齐）。桌面上走 naive 表单规则，移动端用原生 input + 手写校验，
 * 校验顺序与提示文案保持逐条一致，避免两边对同一串密码给出不同结论。 */
const pwdSheet = ref(false);
const pwdBusy = ref(false);
const pwdErr = ref("");
const pwdForm = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });

function resetPwd() {
  pwdForm.currentPassword = "";
  pwdForm.newPassword = "";
  pwdForm.confirmPassword = "";
  pwdErr.value = "";
}

function openPwd() {
  resetPwd();
  pwdSheet.value = true;
}

function closePwd() {
  if (pwdBusy.value) return;
  pwdSheet.value = false;
  resetPwd();
}

/** 返回第一条不通过的提示；全部通过返回空串 */
function checkPwd() {
  if (!pwdForm.currentPassword) return "请输入当前密码";
  if (!pwdForm.newPassword) return "请输入新密码";
  if (!isPasswordLengthOk(pwdForm.newPassword)) return `密码长度需 ${PASSWORD_MIN}-${PASSWORD_MAX} 位`;
  if (!isPasswordComplexityOk(pwdForm.newPassword)) return "密码需同时包含大写字母、小写字母和数字";
  if (!pwdForm.confirmPassword) return "请确认新密码";
  if (pwdForm.confirmPassword !== pwdForm.newPassword) return "两次输入的密码不一致";
  return "";
}

async function submitPwd() {
  if (pwdBusy.value) return;
  const err = checkPwd();
  pwdErr.value = err;
  if (err) return;

  pwdBusy.value = true;
  try {
    const result = await authStore.changePassword(pwdForm.currentPassword, pwdForm.newPassword);
    if (!result.success) {
      pwdErr.value = result.message || "密码修改失败";
      message.error(pwdErr.value);
      return;
    }
    message.success(result.message || "密码修改成功");
    pwdSheet.value = false;
    resetPwd();
  } catch (e) {
    pwdErr.value = "密码修改失败，请稍后重试";
    message.error(pwdErr.value);
  } finally {
    pwdBusy.value = false;
  }
}

/* ---------- 清除缓存 ----------
 * 场景：发了新版本，但浏览器还在用旧文件（主文档 / 预缓存），新功能看不见。
 * 只清「浏览器替我们缓存的东西」，业务数据一个字节都不碰：
 *   · Cache Storage（caches API）：全删
 *   · Service Worker：注销（本站没注册，防御性兜一层）
 *   · 再整页 reload —— 浏览器对主文档的重载会带 max-age=0 重新校验，拿到新 HTML
 * ★★ 绝不能顺手 localStorage.clear() / indexedDB.deleteDatabase()：
 *    auth_token、gameTokens、h5_script_settings、云端阵容缓存全在里面，
 *    清了等于把用户的账号和配置抹掉（用户 11-02 明确要求保留）。
 *    sessionStorage / Cookie 同理不动。
 */
async function clearPageCache() {
  let cachesCleared = 0;
  let swCleared = 0;

  if (typeof caches !== "undefined" && caches.keys) {
    const keys = await caches.keys().catch(() => []);
    for (const key of keys) {
      if (await caches.delete(key).catch(() => false)) cachesCleared++;
    }
  }

  if (navigator.serviceWorker?.getRegistrations) {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    for (const reg of regs) {
      if (await reg.unregister().catch(() => false)) swCleared++;
    }
  }

  return { cachesCleared, swCleared };
}

function confirmClearCache() {
  confirmAction(dialog, {
    title: "清除缓存",
    content:
      "会清掉浏览器为本站缓存的文件，然后重新加载页面。Token、脚本设置、云端阵容这些本地数据不会被删除。",
    details: [
      { label: "清理", value: "浏览器缓存文件" },
      { label: "保留", value: "Token / 设置 / 本地数据" },
    ],
    positiveText: "清理并重载",
    onPositiveClick: async () => {
      const { cachesCleared, swCleared } = await clearPageCache();
      const total = cachesCleared + swCleared;
      message.success(total ? `已清理 ${total} 项缓存，正在重新加载…` : "缓存已是最新，正在重新加载…");
      /* 给提示条 400ms，再整页重载（重载这件事本身就是「清缓存」的收尾） */
      setTimeout(() => window.location.reload(), 400);
    },
  });
}

async function handleLogout() {
  await authStore.logout();
  message.success("已退出登录");
  /* 退出后落在移动端登录页（守卫也会把 /login 改写成 /mobile/login，这里直接给目标少一次跳转） */
  router.push("/mobile/login");
}
</script>

<style scoped lang="scss">
/* ---------- 账户信息（只读三行） ----------
 * 图标块、名字字号全部沿用 `.m-trow` 的基础规则 —— 三行与下面的「修改密码」必须同形，
 * 区别只剩「不给 role / 不给箭头 / 不给悬停」（没有 role="button" 就天然不吃全局悬停规则）。
 * 行尾的值是**信息**不是操作：比名字浅一档、不加粗、右对齐、超长折行不裁字。 */
.m-me-val {
  flex: 0 1 auto;
  max-width: 62%;
  font-size: 13px;
  font-weight: 400;
  color: var(--m-text3);
  text-align: right;
  word-break: break-all;
}

/* 行尾箭头 */
.m-chev {
  width: 16px;
  height: 16px;
  color: var(--m-text3);
}

/* 退出登录：不可逆操作，用语义红字 + 常规描边；不抢页面里唯一那颗行动蓝 */
.m-me-logout {
  margin-top: 4px;
  padding: 13px 12px;
  font-size: 14px;
  color: var(--m-red);
  border: 1px solid var(--m-border);
}

/* ---------- 修改密码抽屉 ---------- */
.m-pw-f {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}
.m-pw-f > span {
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--m-text3);
}
/* type=password 的原生 input：iOS 上字号 <16px 会触发聚焦缩放，这里单独抬到 16px 并压掉内建图标 */
.m-pw-f .m-finput {
  font-size: 16px;
  letter-spacing: 0.04em;
}
.m-pw-err {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--m-red);
}
.m-pw-btns {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.m-pw-btns .m-btn {
  flex: 1;
  width: auto;
}

/* ---------- 主题换肤 ---------- */
/* 行尾双色预览：两粒小圆点（primary + secondary），比一行色带更省高度、也不抢开关的位置 */
.m-skin-pv {
  display: inline-flex;
  gap: 3px;
}
.m-skin-pv i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: block;
}

/* 抽屉里的 6 宫格：3 列 × 2 行，320 宽下每格仍有 88px，够放 40px 色块 + 两字名 */
.m-skin-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.m-skin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 11px 4px 9px;
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-md);
  background: var(--m-card);
  color: var(--m-text2);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  -webkit-appearance: none;
}
/* 选中态只做「一圈行动色」：不加勾、不加底色，避免在已经上色的按钮上再叠一层色 */
.m-skin.on {
  border-color: var(--m-primary);
  box-shadow: inset 0 0 0 1px var(--m-primary);
}
.m-skin-chip {
  width: 40px;
  height: 40px;
  border-radius: var(--m-r-md);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 4px;
}
.m-skin-chip i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid #ffffff;
  display: block;
}
.m-skin-nm {
  font-size: 12px;
  line-height: 1.2;
  color: var(--m-text2);
}
.m-skin.on .m-skin-nm {
  font-weight: 700;
  color: var(--m-text);
}
</style>

<script>
export default { name: "MobileMe" };
</script>
