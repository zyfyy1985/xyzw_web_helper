import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { authApi, AUTH_TOKEN_KEY, AUTH_USER_KEY } from "@/utils/authApi";
import { pullFromCloudOnce, accountBoundaryCleanup } from "@/utils/localStorageCloudSync";

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * 账号认证 store（对接 E:\xyzw_server 的 EdgeOne `/api/auth`）
 *
 * 对外 API 与旧版本保持一致：user / token / isLoading / isAuthenticated / userInfo
 *                              login / register / logout / fetchUserInfo / initAuth
 * 新增：changePassword
 */
export const useAuthStore = defineStore("auth", () => {
  // 状态
  const user = ref(readJSON(AUTH_USER_KEY));
  const token = ref(localStorage.getItem(AUTH_TOKEN_KEY) || null);
  const isLoading = ref(false);
  /** 登录已成功、正在同步等待云端首拉（Login 页据此把按钮文案换成「正在加载数据」） */
  const isSyncing = ref(false);
  const isInitialized = ref(false);

  // 计算属性
  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const userInfo = computed(() => user.value);

  // 持久化
  const persist = () => {
    if (token.value) localStorage.setItem(AUTH_TOKEN_KEY, token.value);
    else localStorage.removeItem(AUTH_TOKEN_KEY);

    if (user.value) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user.value));
    else localStorage.removeItem(AUTH_USER_KEY);
  };

  const clear = () => {
    token.value = null;
    user.value = null;
    persist();
  };

  // 登录
  const login = async (credentials = {}) => {
    isLoading.value = true;
    try {
      const res = await authApi.login(credentials.username, credentials.password);

      if (!res.ok) {
        return { success: false, message: res.message, code: res.error };
      }

      // ★ 账号边界：此刻 localStorage 里还是上一个账号的 token / auth_user。
      //   若换了账号：先趁旧 token 有效补推它的未上传改动，再清掉旧账号的本地业务键
      //   —— 否则下面的拉取会把旧账号残留当成「本地独有数据」迁进新账号云端（数据串号）。
      //   （未登录过的新用户 / 无痕模式没有 prevUser，跳过 —— 本地预置数据的首次上云迁移不受影响）
      const prevUser = readJSON(AUTH_USER_KEY);
      const nameOf = (u) => (u && (u.username || u.u || u.name)) || "";
      if (prevUser && res.user && nameOf(prevUser) !== nameOf(res.user)) {
        await accountBoundaryCleanup();
      }

      token.value = res.token;
      user.value = res.user;
      persist();

      // 登录成功后拉一次云端数据。★ 只有登录这一处是**同步等待**（等拉取完再进页面）：
      // 内部顺序 = 先补推脏数据（A0）→ 再云端→本地（A），「未上传的先上传、然后再拉取」由此保证；
      // 对账完成后才返回，跳转目标页时本地已是云端最新 —— 无痕模式不会再误判「没有Token」。
      // initAuth 的启动拉取保持异步，不阻塞首屏；对账失败也不阻断登录。
      isSyncing.value = true; // 登录已成功 → 界面从「登录中」切换为「正在加载数据」
      try {
        await pullFromCloudOnce(true);
      } catch {
        /* 登录不因云同步失败而失败 */
      }

      return { success: true };
    } finally {
      isLoading.value = false;
      isSyncing.value = false;
    }
  };

  // 注册（注册成功后不自动登录，需回登录页登录）
  const register = async (userInfo = {}) => {
    isLoading.value = true;
    try {
      const res = await authApi.register(userInfo.username, userInfo.password, userInfo.inviteCode);
      if (!res.ok) {
        return { success: false, message: res.message, code: res.error };
      }
      return { success: true, message: "注册成功，请登录" };
    } finally {
      isLoading.value = false;
    }
  };

  // 登出
  const logout = async () => {
    const oldToken = token.value;
    if (oldToken) {
      // ★ 登出 = 账号边界：趁 token 还有效，把「改了没推上去」的数据先补推上自己的云端，
      //   然后清掉本地业务键。数据本体在各自账号的云端，重新登录会拉回来。
      //   （整个会话都离线期间的改动无从补推，登出即丢 —— 已知取舍，见 accountBoundaryCleanup）
      await accountBoundaryCleanup();
    }
    clear();
    // token 无状态，服务端只是形式上的通知，失败也无所谓
    if (oldToken) authApi.logout(oldToken).catch(() => {});
  };

  // 拉取/校验当前用户信息
  const fetchUserInfo = async () => {
    if (!token.value) {
      clear();
      return false;
    }

    const res = await authApi.me(token.value);

    if (res.ok) {
      user.value = res.user;
      persist();
      return true;
    }

    // 只有服务端明确判定失效（401）才登出；
    // 网络异常 / 服务不可用不应把用户踢下线
    if (res.status === 401) {
      // token 已被服务端判定失效：没推上去的改动再也推不出去了，
      // 但仍要走账号边界清理 —— 否则残留数据会串进下个登录的账号
      await accountBoundaryCleanup();
      clear();
      return false;
    }
    return !!user.value;
  };

  // 修改密码
  const changePassword = async (oldPassword, newPassword) => {
    if (!token.value) return { success: false, message: "未登录" };

    isLoading.value = true;
    try {
      const res = await authApi.changePassword(token.value, oldPassword, newPassword);
      if (!res.ok) return { success: false, message: res.message, code: res.error };
      return { success: true, message: "密码修改成功" };
    } finally {
      isLoading.value = false;
    }
  };

  // 初始化认证状态：先用本地缓存即时恢复，再后台向服务端校验
  const initAuth = async () => {
    if (!isInitialized.value) {
      isInitialized.value = true;

      // 后台校验，避免阻塞路由跳转
      if (token.value && user.value) {
        fetchUserInfo().catch(() => {});
        // 已登录 → 把云端数据拉回本地（幂等；失败下次还有机会）
        void pullFromCloudOnce();
      }
    }
    return isAuthenticated.value;
  };

  return {
    // 状态
    user,
    token,
    isLoading,
    isSyncing,

    // 计算属性
    isAuthenticated,
    userInfo,

    // 方法
    login,
    register,
    logout,
    fetchUserInfo,
    changePassword,
    initAuth,
  };
});
