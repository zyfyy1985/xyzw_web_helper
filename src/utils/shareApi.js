/**
 * 角色授权（托管式共享）接口客户端 —— 对应 `E:\xyzw_server` 的 `/api/share`
 *
 * 与 `/api/auth`、`/api/state` 是同一个后端、同一个 KV，地址统一由 `./endpoints` 派生。
 *
 * 约定照 `authApi`：**永不抛异常**，一律返回结果对象：
 *   成功 { ok:true, status, ...payload }
 *   失败 { ok:false, status, error, message }   status=0 表示网络层失败
 *
 * 接口分工（详见服务端 `shared/share.js` 头部）：
 *   create   owner 把自己的角色授给某人（服务端会校验该角色确实在 owner 的 gameTokens 里）
 *   list     发出 / 收到 两侧清单；收到侧已撤销、已过期的**不会返回**
 *   cred     被授权人取登录凭证（取一次就会刷新 lastSeenAt）
 *   bin      被授权人按需取 bin（大块，单独一条请求）
 *   refresh  owner 刷新 token 后回写
 *   revoke   owner 撤销（服务端清空凭证 + 删 bin + 删对方索引）
 *   leave    被授权人主动退出
 *   ack      心跳校验（返回 active / gone，客户端据此剔除本地条目）
 */
import { AUTH_BASE } from "./endpoints";
import { AUTH_TOKEN_KEY } from "./authApi";

const SHARE_URL = AUTH_BASE + "/api/share";

/** 取凭证/撤销这类小请求 */
const DEFAULT_TIMEOUT = 20000;
/** bin 是几百 KB 的 base64，给足时间（移动网络上传/下载都可能慢） */
const BIN_TIMEOUT = 45000;

function authToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * 统一请求。永不抛异常，一律返回结果对象。
 * @param {object} opts
 * @param {"GET"|"POST"} [opts.method]
 * @param {string} opts.action
 * @param {object} [opts.body]
 * @param {string} [opts.query]    GET 的查询串（默认 action=xxx）
 * @param {number} [opts.timeout]
 */
async function call(opts) {
  const {
    method = "POST",
    action,
    body,
    query,
    timeout = DEFAULT_TIMEOUT,
  } = opts;

  const token = authToken();
  if (!token) {
    return { ok: false, status: 0, error: "unauthorized", message: "未登录" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const url =
      method === "GET"
        ? `${SHARE_URL}?${query || `action=${encodeURIComponent(action)}`}`
        : SHARE_URL;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
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
      message: aborted ? "请求超时，请重试" : "无法连接授权服务，请检查网络",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const shareApi = {
  /**
   * owner 授权：tokenId + 目标用户名 + 有效期（"24h" | "7d" | "30d"）
   * @param {{tokenId:string,to:string,ttl:string,meta?:object,cred?:object,bin?:string|null}} payload
   */
  create: (payload) => call({ action: "create", body: payload }),

  /** 清单：role = "owner"（我发出的）| "grantee"（我收到的） */
  list: (role) =>
    call({ method: "GET", action: "list", query: `action=list&role=${role}` }),

  cred: (gid) =>
    call({ method: "GET", action: "cred", query: `action=cred&gid=${encodeURIComponent(gid)}` }),

  bin: (gid) =>
    call({
      method: "GET",
      action: "bin",
      query: `action=bin&gid=${encodeURIComponent(gid)}`,
      timeout: BIN_TIMEOUT,
    }),

  ack: (gid) =>
    call({ method: "GET", action: "ack", query: `action=ack&gid=${encodeURIComponent(gid)}` }),

  refresh: (gid, cred) => call({ action: "refresh", body: { gid, cred } }),

  revoke: (gid) => call({ action: "revoke", body: { gid } }),

  leave: (gid) => call({ action: "leave", body: { gid } }),
};

export default shareApi;
