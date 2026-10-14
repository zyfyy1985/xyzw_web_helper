/**
 * 账号接口客户端 —— 对应 `E:\xyzw_server` 的 `/api/auth`
 *（同一份代码双平台部署；生产用的是 Cloudflare 那份，EdgeOne 那份 KV 没绑、`/api/state` 没部署）
 *
 * 端点只有一个：`<BASE>/api/auth`，用 POST body 的 `action` 或 GET 的 `?action=` 区分操作。
 *   POST {action:"register"|"login"|"logout"|"password"}
 *        register 需带 inviteCode（一次性邀请码，格式 XYZW-XXXX-XXXX）
 *   GET  ?action=me|ping
 *
 * 地址不在这里定 —— 统一由 `./endpoints` 派生（明文常量写死在那里，换域名只改那一处）。
 * 跨域直连即可，**不需要任何代理**（后端 CORS 全放开）。
 */

import { AUTH_BASE, api } from "./endpoints";

export { AUTH_BASE };

const AUTH_URL = api("/api/auth");

/** 本地缓存用的键（与旧的 `token` / `user` 区分，避免与历史数据混淆） */
export const AUTH_TOKEN_KEY = "auth_token";
export const AUTH_USER_KEY = "auth_user";

const DEFAULT_TIMEOUT = 15000;

/**
 * 统一请求。永不抛异常，一律返回结果对象：
 *   成功 { ok:true, status, ...payload }
 *   失败 { ok:false, status, error, message }   status=0 表示网络层失败
 */
async function call({ method = "POST", action, body, token, timeout = DEFAULT_TIMEOUT }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const url =
      method === "GET" ? `${AUTH_URL}?action=${encodeURIComponent(action)}` : AUTH_URL;

    const res = await fetch(url, {
      method,
      headers: {
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: method === "POST" ? JSON.stringify({ action, ...(body || {}) }) : undefined,
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok || !data || data.ok !== true) {
      return {
        ok: false,
        status: res.status,
        error: (data && data.error) || `http_${res.status}`,
        message: (data && data.message) || `请求失败（HTTP ${res.status}）`,
      };
    }

    return { ok: true, status: res.status, ...data };
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    return {
      ok: false,
      status: 0,
      error: aborted ? "timeout" : "network_error",
      message: aborted
        ? "请求超时，请重试"
        : `无法连接账号服务（${AUTH_BASE || "同源"}），请检查网络或服务地址`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const authApi = {
  register: (username, password, inviteCode) =>
    call({ action: "register", body: { username, password, inviteCode } }),

  login: (username, password) =>
    call({ action: "login", body: { username, password } }),

  logout: (token) => call({ action: "logout", token }),

  me: (token) => call({ method: "GET", action: "me", token }),

  changePassword: (token, oldPassword, newPassword) =>
    call({ action: "password", body: { oldPassword, newPassword }, token }),

  /** 健康检查：确认 EdgeOne 上函数已上线、KV 是否绑定成功 */
  ping: () => call({ method: "GET", action: "ping", timeout: 8000 }),
};

export default authApi;
