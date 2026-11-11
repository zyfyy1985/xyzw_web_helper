import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { g_utils, ProtoMsg } from "@/utils/bonProtocol";
import { gameLogger, tokenLogger, wsLogger } from "@/utils/logger";
import { XyzwWebSocketClient } from "@/utils/xyzwWebSocket";

import useIndexedDB from "@/hooks/useIndexedDB";
import { generateRandomSeed } from "@/utils/randomSeed";
import {
  transformToken,
  getTokenId,
  setAuthUserRateLimiterCallback,
  scheduleAuthUserRequest,
} from "@/utils/token";
import { abToBase64, base64ToAb } from "@/utils/binCloud";
import { shareApi } from "@/utils/shareApi";
import {
  refreshTokenFromCombUser,
  roleIndexFromServerId,
} from "@/utils/wechatForceLogout";
import { emitPlus, $emit } from "./events/index.js";
import router from "@/router";

const { getArrayBuffer, storeArrayBuffer, deleteArrayBuffer, clearAll } =
  useIndexedDB();

declare interface TokenData {
  id: string;
  name: string;
  token: string; // 原始Base64 token
  wsUrl: string | null; // 可选的自定义WebSocket URL
  server: string;
  remark?: string; // 备注信息
  importMethod?: "manual" | "bin" | "url" | "wxQrcode" | "mobile" | "wxForceLogout";
  sourceUrl?: string; // 当importMethod为url时，存储url链接
  avatar?: string; // 用户头像URL
  upgradedToPermanent?: boolean; // 是否升级为长期有效
  upgradedAt?: string; // 升级时间
  updatedAt?: string; // 更新时间
  combUser?: Record<string, unknown>;
  serverId?: string | number;
  roleId?: string | number;
  roleIndex?: number;
  /* ---------- 角色授权（他人共享给我的角色） ----------
   * ★ 共享角色**也会进 gameTokens**：控制台、玩法页、工具全部以 `selectedToken` 为唯一入口，
   *   不进这个数组就等于「能看见但用不了」。代价是同步层必须把它剥掉（见
   *   `localStorageCloudSync` 的 `gameTokens` 特判），否则它会被推到自己的云端、
   *   还会被 `ownedTokenKeys()` 当成自己的角色，把授权方的 bin 一起迁过去。
   *   `shared: false/undefined` = 自己的角色，语义与改造前完全一致。 */
  shared?: boolean;
  /** 授权记录 id（服务端 `shr_<gid>`），撤销 / 取凭证 / 退出都用它 */
  grantGid?: string;
  /** 授权方用户名 */
  sharedFrom?: string;
  /** 授权到期时间（ms）。过期后服务端 list 不再返回，本地由 refreshSharedGrants 清掉 */
  expiresAt?: number;
  /** 还没取到凭证（只拿到了元信息）：点「控制台」时才去拉 cred + bin */
  needCred?: boolean;
}

declare interface WebSocketConnection {
  status: "connecting" | "connected" | "disconnected" | "error";
  client: XyzwWebSocketClient | null;
  lastError: { timestamp: string; error: string } | null;
  tokenId: string;
  sessionId: string;
  createdAt: string;
  lastMessageAt: string | null;
  randomSeedSynced?: boolean;
  lastRandomSeedSource?: number | null;
  lastRandomSeed?: number | null;
}

declare type WebCtx = Record<string, Partial<WebSocketConnection>>;

declare interface ConnectLock {
  tokenId: string;
  operation: "connect" | "disconnect";
  timestamp: number;
  sessionId: string;
}
declare type LockCtx = Record<string, Partial<ConnectLock>>;

// 分组接口定义
declare interface TokenGroup {
  id: string;
  name: string;
  color: string; // 分组颜色，用于UI显示
  tokenIds: string[]; // 属于该分组的token ID列表
  createdAt?: string;
  updatedAt?: string;
}

export const gameTokens = useLocalStorage<TokenData[]>("gameTokens", []);
export const hasTokens = computed(() => gameTokens.value.length > 0);
// ★ Token 数量上限（自用约定）：最多保留 6 个。添加入口（TokenImport 页）统一拦截，
// addToken 内再硬兜底；restore（importTokens 整体替换）不受影响。
// 所有入口/文案都读这个常量（MobileTokens 的「最多 N 个账号」、TokenImport 的「还能添加 N 个」），
// 改数字即可，别在页面里另写死。
export const MAX_GAME_TOKENS = 6;
/**
 * 只数「自己的」角色。
 * ★ 共享来的角色不占配额：它们由授权方管理、随时可能被撤销，占掉名额会让用户
 *   为了收一个共享角色反而删掉自己的号。所有「还能加几个」的判断都必须用它。
 */
export const countOwnTokens = (list: TokenData[] = gameTokens.value) =>
  (list || []).filter((t) => !t.shared).length;
export const selectedTokenId = useLocalStorage("selectedTokenId", "");
export const selectedToken = computed(() => {
  return gameTokens.value?.find((token) => token.id === selectedTokenId.value);
});
export const selectedRoleInfo = useLocalStorage<any>("selectedRoleInfo", null);

// 跨标签页连接协调
const activeConnections = useLocalStorage("activeConnections", {});

// Token分组管理
export const tokenGroups = useLocalStorage<TokenGroup[]>("tokenGroups", []);

/**
 * 重构后的Token管理存储
 * 以名称-token列表形式管理多个游戏角色
 */
export const useTokenStore = defineStore("tokens", () => {
  const wsConnections = ref<WebCtx>({}); // WebSocket连接状态
  const connectionLocks = ref<LockCtx>({}); // 连接操作锁，防止竞态条件

  // 游戏数据存储
  const gameData = ref({
    roleInfo: null,
    legionInfo: null,
    commonActivityInfo: null, // 消耗活动进度
    bossTowerInfo: null, //宝库
    evoTowerInfo: null, //怪异塔
    presetTeam: null,
    battleVersion: null as number | null, // 战斗版本号
    studyStatus: {
      isAnswering: false,
      questionCount: 0,
      answeredCount: 0,
      status: "", // '', 'starting', 'answering', 'claiming_rewards', 'completed'
      timestamp: null,
    },
    lastUpdated: null as string | null,
  });

  // 获取当前选中token的角色信息
  const selectedTokenRoleInfo = computed(() => {
    return gameData.value.roleInfo;
  });

  const readStatisticsValue = (stats: any, key: string) => {
    if (!stats) return undefined;
    try {
      if (typeof stats.get === "function") {
        return stats.get(key);
      }
      if (Object.prototype.hasOwnProperty.call(stats, key)) {
        return stats[key];
      }
    } catch (error) {
      gameLogger.warn("读取统计数据失败:", error);
    }
    return undefined;
  };

  const extractLastLoginTimestamp = (payload: any) => {
    if (!payload) return null;

    const candidateSources = [
      payload?.role?.statistics,
      payload?.statistics,
      payload?.role?.statisticsTime,
      payload?.statisticsTime,
    ];

    const candidateKeys = [
      "last:login:time",
      "lastLoginTime",
      "last_login_time",
    ];

    for (const stats of candidateSources) {
      if (!stats) continue;
      for (const key of candidateKeys) {
        const value = readStatisticsValue(stats, key);
        if (value !== undefined && value !== null) {
          const numeric = Number(value);
          if (!Number.isNaN(numeric) && numeric > 0) {
            return numeric;
          }
        }
      }
    }
    return null;
  };

  const syncRandomSeedFromStatistics = (
    tokenId: string,
    rolePayload: any,
    client: XyzwWebSocketClient | null,
  ) => {
    if (!client) return;
    const connection = wsConnections.value[tokenId];
    if (!connection || connection.status !== "connected") {
      return;
    }

    const lastLoginTime = extractLastLoginTimestamp(rolePayload);
    if (!lastLoginTime) {
      return;
    }

    if (
      connection.randomSeedSynced &&
      connection.lastRandomSeedSource === lastLoginTime
    ) {
      return;
    }

    const randomSeed = generateRandomSeed(lastLoginTime);

    try {
      client.send("system_custom", {
        key: "randomSeed",
        value: randomSeed,
      });
      connection.randomSeedSynced = true;
      connection.lastRandomSeedSource = lastLoginTime;
      connection.lastRandomSeed = randomSeed;
      wsLogger.info(`同步 randomSeed [${tokenId}]`, {
        lastLoginTime,
        randomSeed,
      });
    } catch (error) {
      wsLogger.error(`发送 randomSeed 失败 [${tokenId}]`, error);
    }
  };

  // ==================== 角色授权（托管式共享） ====================
  /* 两边的角色不同，别混着看：
   *   · 授权方（owner）：把某个自己的角色授给某人。凭证从本地 token + IndexedDB 的 bin 取，
   *     服务端会校验这个 tokenId 确实在自己账号的 gameTokens 里（防伪造）。
   *   · 被授权方（grantee）：别人的角色会出现在 `gameTokens` 里（`shared: true`），
   *     先只有元信息，点「控制台」时才去拉 cred + bin —— 否则列表一打开就要下几百 KB。
   * ⚠️ 共享条目**永远不进自己的云端**：同步层对 `gameTokens` 做了剥离，见
   *    `localStorageCloudSync` 里 `notify` / `doFirstPull` / `ownedTokenKeys` 三处。 */

  /** 未接入的共享角色用这个 id；接入后换成真 id（= MD5(bin)），才能和 bin 对上 */
  const SHARED_ID_PREFIX = "shared:";

  const isSharedToken = (tokenId: string) => {
    const t = gameTokens.value.find((x) => x.id === tokenId);
    return !!(t && t.shared);
  };

  /** owner：把 tokenId 授权给 to（ttl: "24h" | "7d" | "30d"） */
  const grantToken = async (tokenId: string, to: string, ttl: string) => {
    const token = gameTokens.value.find((t) => t.id === tokenId);
    if (!token) return { ok: false, message: "角色不存在" };
    if (token.shared) return { ok: false, message: "别人的角色不能转授权" };

    // bin 是角色凭据本体（刷新 token / 进游戏都要它），没有 bin 的授权基本只能用一次
    let bin: string | null = null;
    try {
      const buf = await getArrayBuffer(token.id);
      if (buf) bin = abToBase64(buf);
    } catch {
      bin = null;
    }

    return shareApi.create({
      tokenId: token.id,
      to,
      ttl,
      meta: {
        name: token.name || "",
        server: token.server || "",
        avatar: token.avatar || "",
      },
      cred: {
        token: token.token,
        wsUrl: token.wsUrl || "",
        combUser: token.combUser || null,
        serverId: token.serverId ?? null,
        roleId: token.roleId ?? null,
      },
      bin,
    });
  };

  /** 清单：role = "owner"（我发出的）| "grantee"（我收到的） */
  const listGrants = (role: "owner" | "grantee") => shareApi.list(role);

  /** owner：撤销。服务端会清空凭证 + 删 bin + 删对方索引 */
  const revokeGrant = async (gid: string) => {
    const res = await shareApi.revoke(gid);
    if (res.ok) await refreshSharedGrants();
    return res;
  };

  /**
   * owner：token 刷新后把新凭证回写给所有 active 授权。
   * 不做这件事，对方会在授权期内某天突然「登录失效」，且原因完全看不出。
   */
  const syncGrantsForToken = async (tokenId: string) => {
    const token = gameTokens.value.find((t) => t.id === tokenId);
    if (!token || token.shared || !token.token) return { ok: true, updated: 0 };

    const list = await shareApi.list("owner");
    if (!list.ok) return list;
    const targets = (list.grants || []).filter(
      (g: any) => g.tokenId === tokenId && g.state === "active",
    );
    if (!targets.length) return { ok: true, updated: 0 };

    let updated = 0;
    for (const g of targets) {
      const r = await shareApi.refresh(g.gid, {
        token: token.token,
        wsUrl: token.wsUrl || "",
        combUser: token.combUser || null,
        serverId: token.serverId ?? null,
        roleId: token.roleId ?? null,
      });
      if (r.ok) updated++;
    }
    return { ok: true, updated };
  };

  /* ---------- 到期本地结算 ----------
   * 服务端**没有定时任务**：过期只在「下次 list / 取凭证」时才被发现。
   * 如果用户把控制台一直开着，那条授权即便到期了也不会自己断 —— 已经建立的 WS 会话
   * 不受服务端授权状态影响。所以本地再补一层：到点就断连 + 移除 + 删 bin。
   * 定时器只是「尽力而为」：后台标签页会被浏览器节流，读取时判定仍然是兜底。 */
  const sharedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** setTimeout 的上限是 2^31-1 ≈ 24.8 天，30 天的授权必须分段排队 */
  const MAX_TIMER_MS = 20 * 24 * 60 * 60 * 1000;

  /** 到期结算（纯本地，不依赖网络）：断连 → 清选中 → 移除条目 → 删 bin */
  const expireSharedLocal = (gid: string) => {
    const idx = gameTokens.value.findIndex((t) => t.shared && t.grantGid === gid);
    if (idx < 0) return false;
    const t = gameTokens.value[idx];

    if (wsConnections.value[t.id]) closeWebSocketConnection(t.id);
    if (selectedTokenId.value === t.id) selectedTokenId.value = "";
    gameTokens.value.splice(idx, 1);

    const stillOwned = gameTokens.value.some((x) => x.id === t.id && !x.shared);
    if (!stillOwned) void deleteArrayBuffer(t.id).catch(() => {});
    return true;
  };

  function scheduleSharedExpiry(gid: string, expiresAt: number) {
    const old = sharedTimers.get(gid);
    if (old) clearTimeout(old);
    if (!expiresAt) return;

    const tick = () => {
      const left = expiresAt - Date.now();
      if (left > 0) {
        sharedTimers.set(gid, setTimeout(tick, Math.min(left, MAX_TIMER_MS)));
        return;
      }
      sharedTimers.delete(gid);
      expireSharedLocal(gid);
      void refreshSharedGrants(); // 顺手与服务端对齐；网络不通也不影响本地已经断开
    };

    const left = expiresAt - Date.now();
    if (left <= 0) {
      expireSharedLocal(gid);
      return;
    }
    sharedTimers.set(gid, setTimeout(tick, Math.min(left, MAX_TIMER_MS)));
  }

  /**
   * 被授权方：把服务端清单同步成本地的共享条目。
   * 服务端已撤销 / 已过期的**不会返回** ⇒ 本地对应条目在这里被删除（「无残留」的落点）。
   * @returns 本次新增 + 移除的数量，UI 用来决定要不要提示
   */
  const refreshSharedGrants = async () => {
    const res = await shareApi.list("grantee");
    if (!res.ok) return res;

    const grants = (res.grants || []) as any[];
    const alive = new Map<string, any>(grants.map((g) => [String(g.gid), g]));
    let removed = 0;
    let added = 0;

    // ① 先删：服务端已经不给我了（已撤销 / 已过期）
    const kept: TokenData[] = [];
    const gone: TokenData[] = [];
    for (const t of gameTokens.value) {
      if (!t.shared) {
        kept.push(t);
        continue;
      }
      if (t.grantGid && alive.has(t.grantGid)) {
        kept.push(t);
        continue;
      }
      gone.push(t);
    }
    for (const t of gone) {
      if (wsConnections.value[t.id]) closeWebSocketConnection(t.id);
      // 选中的就是它 → 立刻清空，否则首页/工具页拿着一个不存在的 selectedToken 空转
      if (selectedTokenId.value === t.id) selectedTokenId.value = "";
    }
    /* 本地 bin 是**授权方的凭据副本**，授权没了就必须一起删：
     * 过期只删条目不删 bin，等于把凭证留在 IndexedDB 里（用户要的「无残留」就不成立）。
     * 先确认这个 id 没被自己的角色占用 —— 否则会误删自己的 bin。 */
    const binDoomed = gone
      .filter((t) => !kept.some((x) => x.id === t.id && !x.shared))
      .map((t) => t.id);
    if (binDoomed.length) {
      await Promise.all(
        binDoomed.map((id) => deleteArrayBuffer(id).catch(() => {})),
      );
    }
    removed = gone.length;

    // ② 再补 / 更新
    for (const g of grants) {
      const idx = kept.findIndex((t) => t.shared && t.grantGid === g.gid);
      const meta = g.meta || {};
      if (idx >= 0) {
        kept[idx] = {
          ...kept[idx],
          name: meta.name || kept[idx].name,
          server: meta.server || kept[idx].server,
          avatar: meta.avatar || kept[idx].avatar,
          expiresAt: g.expiresAt || kept[idx].expiresAt,
          sharedFrom: g.owner,
        };
        continue;
      }
      kept.push({
        id: SHARED_ID_PREFIX + g.gid,
        grantGid: String(g.gid),
        shared: true,
        sharedFrom: g.owner,
        needCred: true,
        name: meta.name || "共享角色",
        server: meta.server || "",
        avatar: meta.avatar || "",
        token: "",
        wsUrl: null,
        serverId: null,
        roleId: null,
        importMethod: "manual",
        expiresAt: g.expiresAt || 0,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
      });
      added++;
    }

    // 只在真有变化时整体赋值，避免每次启动都触发一次 gameTokens 的写入与重渲染
    if (removed || added || kept.length !== gameTokens.value.length) {
      gameTokens.value = kept;
    }

    // ③ 排到期定时：先清掉已经不存在的 gid（避免定时器泄漏），再按最新 expiresAt 重排
    const aliveGids = new Set(
      kept.filter((t) => t.shared && t.grantGid).map((t) => String(t.grantGid)),
    );
    for (const [gid, timer] of sharedTimers) {
      if (!aliveGids.has(gid)) {
        clearTimeout(timer);
        sharedTimers.delete(gid);
      }
    }
    for (const t of kept) {
      if (t.shared && t.grantGid) {
        scheduleSharedExpiry(String(t.grantGid), t.expiresAt || 0);
      }
    }

    return { ok: true, added, removed, count: grants.length };
  };

  /**
   * 被授权方：真正接入 —— 拉凭证与 bin，把临时 id 换成真 id。
   * ★ 真 id 必须 = MD5(bin 字节)，与 `getTokenId(bin)` 同源；否则本地 bin 的键对不上，
   *   刷新 token / 进游戏都会失败（这两条路径都是按 tokenId 去 IndexedDB 取的）。
   */
  const adoptSharedToken = async (tokenId: string) => {
    const idx = gameTokens.value.findIndex((t) => t.id === tokenId);
    if (idx < 0) return { ok: false, message: "角色不存在" };
    const entry = gameTokens.value[idx];
    if (!entry.shared) return { ok: true, token: entry };
    if (!entry.grantGid) return { ok: false, message: "授权记录缺失，请刷新后重试" };

    const credRes: any = await shareApi.cred(entry.grantGid);
    if (!credRes.ok) {
      // 撤销 / 过期 / 网络失败：把服务端状态同步下来（本地条目会被清掉）
      if (credRes.error === "revoked" || credRes.error === "expired" || credRes.status === 404) {
        await refreshSharedGrants();
      }
      return { ok: false, message: credRes.message || "无法获取登录凭证" };
    }
    const cred = credRes.cred || {};
    if (!cred.token) return { ok: false, message: "授权方尚未配置凭证" };

    let realId = entry.id;
    let binBuffer: ArrayBuffer | null = null;
    if (credRes.hasBin) {
      const binRes: any = await shareApi.bin(entry.grantGid);
      if (binRes.ok && binRes.bin) {
        try {
          binBuffer = base64ToAb(binRes.bin);
          const hashed = getTokenId(binBuffer as ArrayBuffer);
          // 同一个 bin 只可能对应同一个角色：本机若已有同 id 的「自己的」角色，说明冲突
          const clash = gameTokens.value.find((t) => t.id === hashed && !t.shared);
          if (clash) {
            return { ok: false, message: "本机已有同一角色，无法重复接入" };
          }
          realId = hashed;
        } catch {
          binBuffer = null; // bin 解不开就退化成「无 bin」，凭证仍然可用（只是刷新要重新授权）
        }
      }
    }

    if (binBuffer) {
      // ★ skipCloud：共享 bin 是**授权方**的凭据副本，绝不能推进自己的云端
      await storeArrayBuffer(realId, binBuffer, { shared: true, gid: entry.grantGid }, {
        skipCloud: true,
      });
    }

    const merged: TokenData = {
      ...entry,
      id: realId,
      token: String(cred.token),
      wsUrl: cred.wsUrl || null,
      combUser: cred.combUser || null,
      serverId: cred.serverId ?? null,
      roleId: cred.roleId ?? null,
      needCred: false,
      importMethod: binBuffer ? "bin" : "manual",
    };

    if (realId !== entry.id) {
      // 换 id：先摘掉临时条目，再把选中标记跟过去，避免「当前账号」指向一个不存在的 id
      gameTokens.value.splice(idx, 1, merged);
      if (selectedTokenId.value === entry.id) selectedTokenId.value = realId;
      if (wsConnections.value[entry.id]) closeWebSocketConnection(entry.id);
    } else {
      gameTokens.value[idx] = merged;
    }

    return { ok: true, token: merged };
  };

  /** 被授权方：移除本机的共享角色（同时通知服务端退出，不再出现在清单里） */
  const dropSharedToken = async (tokenId: string) => {
    const idx = gameTokens.value.findIndex((t) => t.id === tokenId && t.shared);
    if (idx < 0) return { ok: false, message: "不是共享角色" };
    const entry = gameTokens.value[idx];

    let res: any = { ok: true };
    if (entry.grantGid) res = await shareApi.leave(entry.grantGid);

    // 主动移除 → 先撤掉到期定时器，否则它到点还会再跑一次（幂等，但没必要）
    if (entry.grantGid && sharedTimers.has(String(entry.grantGid))) {
      clearTimeout(sharedTimers.get(String(entry.grantGid)) as any);
      sharedTimers.delete(String(entry.grantGid));
    }

    if (wsConnections.value[tokenId]) closeWebSocketConnection(tokenId);
    gameTokens.value.splice(idx, 1);
    if (selectedTokenId.value === tokenId) selectedTokenId.value = "";

    // 删本地 bin 前先确认这个 id 没有被自己的角色占用（冲突检查在 adopt 里做过，这里兜底）
    const stillOwned = gameTokens.value.some((t) => t.id === tokenId && !t.shared);
    if (!stillOwned) await deleteArrayBuffer(tokenId).catch(() => {});

    return res;
  };

  // Token管理
  const addToken = (tokenData: TokenData) => {
    let id =
      tokenData.id ||
      `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    // ★ 数量上限兜底：只有「净新增」受限；同 id 的更新（调用方应走 updateToken）不受影响
    const isExisting = gameTokens.value.some((t) => t.id === id);
    if (!isExisting && countOwnTokens() >= MAX_GAME_TOKENS) {
      throw new Error(
        `最多只能有 ${MAX_GAME_TOKENS} 个 Token，请先删除现有 Token 再添加`,
      );
    }
    const newToken = {
      id: id,
      name: tokenData.name,
      token: tokenData.token, // 保存原始Base64 token
      wsUrl: tokenData.wsUrl || null, // 可选的自定义WebSocket URL
      server: tokenData.server || "",
      remark: tokenData.remark || "", // 备注信息
      level: tokenData.level || 1,
      profession: tokenData.profession || "",
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      isActive: true,
      // URL获取相关信息
      sourceUrl: tokenData.sourceUrl || null, // Token来源URL（用于刷新）
      importMethod: tokenData.importMethod || "manual", // 导入方式：manual 或 url
      avatar: tokenData.avatar || "", // 用户头像
      combUser: tokenData.combUser || null,
      serverId: tokenData.serverId ?? null,
      roleId: tokenData.roleId ?? null,
      roleIndex: tokenData.roleIndex ?? null,
    };

    gameTokens.value.push(newToken);
    return newToken;
  };

  const updateToken = (tokenId: string, updates: Partial<TokenData>) => {
    const index = gameTokens.value.findIndex((token) => token.id === tokenId);
    if (index !== -1) {
      gameTokens.value[index] = {
        ...gameTokens.value[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      // 凭证变了（手动编辑 / 自动刷新 / 重新获取）→ 回写给所有 active 授权。
      // fire-and-forget：这步在保存路径上，失败只影响对方「下次登录」，
      // 不能拖慢保存；打开「角色授权」页时还会整体对齐一次（见 syncGrantsForToken）。
      if (updates.token && !gameTokens.value[index].shared) {
        void syncGrantsForToken(tokenId);
      }
      return true;
    }
    return false;
  };

  const removeToken = async (tokenId: string) => {
    gameTokens.value = gameTokens.value.filter((token) => token.id !== tokenId);

    // 关闭对应的WebSocket连接
    if (wsConnections.value[tokenId]) {
      closeWebSocketConnection(tokenId);
    }

    // 如果删除的是当前选中token，清除选中状态
    if (selectedTokenId.value === tokenId) {
      selectedTokenId.value = null;
    }

    // 同时删除IndexedDB中的数据
    await deleteArrayBuffer(tokenId);

    return true;
  };

  const selectToken = (tokenId: string, forceReconnect = false) => {
    const token = gameTokens.value.find((t) => t.id === tokenId);
    if (!token) {
      return null;
    }

    // 检查是否已经是当前选中的token
    const isAlreadySelected = selectedTokenId.value === tokenId;
    const existingConnection = wsConnections.value[tokenId];
    const isConnected = existingConnection?.status === "connected";
    const isConnecting = existingConnection?.status === "connecting";

    tokenLogger.debug(`选择Token: ${tokenId}`, {
      isAlreadySelected,
      isConnected,
      isConnecting,
      forceReconnect,
    });

    // 更新选中状态
    selectedTokenId.value = tokenId;

    // 更新最后使用时间
    updateToken(tokenId, { lastUsed: new Date().toISOString() });
    //避免点击断开链接
    if (isConnected) {
      return token;
    }
    // 智能连接判断
    const shouldCreateConnection =
      forceReconnect || // 强制重连
      !isAlreadySelected || // 首次选择此token
      !existingConnection || // 没有现有连接
      existingConnection.status === "disconnected" || // 连接已断开
      existingConnection.status === "error"; // 连接出错

    if (shouldCreateConnection) {
      if (isAlreadySelected && !forceReconnect) {
        wsLogger.info(`Token已选中但无连接，创建新连接: ${tokenId}`);
      } else if (!isAlreadySelected) {
        wsLogger.info(`切换到新Token，创建连接: ${tokenId}`);
      } else if (forceReconnect) {
        wsLogger.info(`强制重连Token: ${tokenId}`);
      }

      // 创建WebSocket连接
      createWebSocketConnection(tokenId, token.token, token.wsUrl);
    } else {
      if (isConnected) {
        wsLogger.debug(`Token已连接，跳过连接创建: ${tokenId}`);
      } else if (isConnecting) {
        wsLogger.debug(`Token连接中，跳过连接创建: ${tokenId}`);
      } else {
        wsLogger.debug(`Token已选中且有连接，跳过连接创建: ${tokenId}`);
      }
    }

    return token;
  };

  // Token刷新尝试记录
  const tokenRefreshAttempts = ref<Record<string, number>>({});

  // 尝试自动刷新Token
  const attemptTokenRefresh = async (
    tokenId: string,
    forceReconnect = false,
  ) => {
    // 检查冷却时间 (10秒)
    const lastAttempt = tokenRefreshAttempts.value[tokenId] || 0;
    const now = Date.now();
    if (now - lastAttempt < 10000) {
      wsLogger.warn(`Token刷新过于频繁，跳过 [${tokenId}]`);
      return false;
    }
    tokenRefreshAttempts.value[tokenId] = now;

    const gameToken = gameTokens.value.find((t) => t.id === tokenId);
    if (!gameToken) return false;

    wsLogger.info(`尝试自动刷新Token [${tokenId}]`);
    let refreshSuccess = false;

    try {
      if (gameToken.importMethod === "url" && gameToken.sourceUrl) {
        // URL形式token刷新
        const token = await scheduleAuthUserRequest(async () => {
          const response = await fetch(gameToken.sourceUrl!);
          if (response.ok) {
            const data = await response.json();
            if (data.token) {
              return data.token;
            }
          }
          return null;
        });
        if (token) {
          updateToken(tokenId, { ...gameToken, token });
          wsLogger.info(`从URL获取token成功: ${gameToken.name}`);
          refreshSuccess = true;
        }
      } else if (gameToken.combUser) {
        const refreshed = await refreshTokenFromCombUser(
          gameToken.combUser as any,
          {
            serverId: gameToken.serverId,
            roleIndex: gameToken.roleIndex,
            roleId: gameToken.roleId,
          },
        );
        updateToken(tokenId, {
          ...gameToken,
          token: refreshed.token,
          serverId: refreshed.role.serverId,
          roleId: refreshed.role.roleId,
          roleIndex: roleIndexFromServerId(refreshed.role.serverId),
          lastRefreshed: Date.now(),
        } as any);
        refreshSuccess = true;
      } else if (gameToken.importMethod === "wxForceLogout") {
        wsLogger.error(`Token刷新失败: 未保存 combUser [${tokenId}]`);
      } else if (
        gameToken.importMethod === "bin" ||
        gameToken.importMethod === "wxQrcode" ||
        gameToken.importMethod === "mobile"
      ) {
        // Bin形式token刷新
        let userToken: ArrayBuffer | null = await getArrayBuffer(tokenId);
        let usedOldKey = false;

        if (!userToken) {
          const tokenByName = await getArrayBuffer(gameToken.name);
          if (tokenByName) {
            userToken = tokenByName;
            usedOldKey = true;
          }
        }

        if (userToken) {
          const token = await transformToken(userToken);
          updateToken(tokenId, { ...gameToken, token });
          if (usedOldKey) {
            const saved = await storeArrayBuffer(tokenId, userToken);
            if (saved) {
              await deleteArrayBuffer(gameToken.name);
            }
          }
          refreshSuccess = true;
        } else {
          wsLogger.error(`Token刷新失败: 未找到BIN数据 [${tokenId}]`);
        }
      }
    } catch (error) {
      wsLogger.error(`Token刷新过程出错 [${tokenId}]:`, error);
    }

    if (refreshSuccess) {
      wsLogger.info(`Token刷新成功 [${tokenId}]`);

      const currentPath = router.currentRoute.value.path;
      const shouldReconnect =
        forceReconnect ||
        currentPath === "/tokens" ||
        currentPath === "/admin/game-features";

      if (shouldReconnect) {
        wsLogger.info(`触发自动重连 [${tokenId}]`);
        // 重置重连状态以允许立即重连
        if (wsConnections.value[tokenId]) {
          wsConnections.value[tokenId].reconnectAttempts = 0;
        }
        selectToken(tokenId, true);
      }
      return true;
    } else {
      wsLogger.error(`Token刷新失败，请手动重新导入 [${tokenId}]`);
      return false;
    }
  };

  // 游戏消息处理
  const handleGameMessage = async (
    tokenId: string,
    message: ProtoMsg,
    client: any,
  ) => {
    try {
      if (!message) {
        gameLogger.warn(`消息处理跳过 [${tokenId}]: 无效消息`);
        return;
      }
      if (message.error) {
        const errText = String(message.error).toLowerCase();
        gameLogger.warn(`消息处理跳过 [${tokenId}]:`, message.error);
        if (errText.includes("token") && errText.includes("expired")) {
          const conn = wsConnections.value[tokenId];
          if (conn) {
            conn.status = "error";
            conn.lastError = {
              timestamp: new Date().toISOString(),
              error: "token expired",
            };
          }

          const gameToken = gameTokens.value.find((t) => t.id === tokenId);
          if (gameToken) {
            // 调用统一的Token刷新逻辑
            const refreshed = await attemptTokenRefresh(tokenId);
            if (!refreshed) {
              wsLogger.error(
                `Token 已过期且无法自动刷新，请重新导入 [${tokenId}]`,
              );
            }
          }
        }
        return;
      }

      const cmd = message.cmd?.toLowerCase();
      const body = message.getData();

      if (cmd === "role_getroleinforesp") {
        syncRandomSeedFromStatistics(tokenId, body, client);

        // 更新头像
        if (body?.role?.headImg) {
          const token = gameTokens.value.find((t) => t.id === tokenId);
          if (token && token.avatar !== body.role.headImg) {
            updateToken(tokenId, { avatar: body.role.headImg });
            wsLogger.debug(`更新头像 [${tokenId}]: ${body.role.headImg}`);
          }
        }
      }

      emitPlus(cmd, {
        tokenId,
        body,
        message,
        client,
        gameData,
      });

      gameLogger.gameMessage(tokenId, cmd, !!body);
    } catch (error) {
      gameLogger.error(`处理消息失败 [${tokenId}]:`, error);
    }
  };

  // 验证token有效性
  const validateToken = (token: any) => {
    if (!token) return false;
    if (typeof token !== "string") return false;
    if (token.trim().length === 0) return false;
    // 简单检查：token应该至少有一定长度
    if (token.trim().length < 10) return false;
    return true;
  };

  // Base64解析功能（增强版）
  const parseBase64Token = (base64String: string) => {
    try {
      // 输入验证
      if (!base64String || typeof base64String !== "string") {
        throw new Error("Token字符串无效");
      }

      // 移除可能的前缀和空格
      const cleanBase64 = base64String.replace(/^data:.*base64,/, "").trim();

      if (cleanBase64.length === 0) {
        throw new Error("Token字符串为空");
      }

      // 解码base64
      let decoded;
      try {
        decoded = atob(cleanBase64);
      } catch (decodeError) {
        // 如果不是有效的Base64，作为纯文本token处理
        decoded = base64String.trim();
      }

      // 尝试解析为JSON
      let tokenData;
      try {
        tokenData = JSON.parse(decoded);
      } catch {
        // 不是JSON格式，作为纯token处理
        tokenData = { token: decoded };
      }

      // 提取实际token
      const actualToken = tokenData.token || tokenData.gameToken || decoded;

      // 验证token有效性
      if (!validateToken(actualToken)) {
        throw new Error(`提取的token无效: "${actualToken}"`);
      }

      return {
        success: true,
        data: {
          ...tokenData,
          actualToken, // 添加提取出的实际token
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "解析失败：" + error.message,
      };
    }
  };

  const importBase64Token = (
    name: string,
    base64String: string,
    additionalInfo = {},
  ) => {
    const parseResult = parseBase64Token(base64String);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error,
        message: `Token "${name}" 导入失败: ${parseResult.error}`,
      };
    }

    const tokenData = {
      name,
      token: parseResult.data.actualToken, // 使用验证过的实际token
      ...additionalInfo,
      ...parseResult.data, // 解析出的数据覆盖手动输入
    };

    try {
      const newToken = addToken(tokenData);

      // 添加更多验证信息到成功消息
      const tokenInfo = parseResult.data.actualToken;
      const displayToken =
        tokenInfo.length > 20
          ? `${tokenInfo.substring(0, 10)}...${tokenInfo.substring(tokenInfo.length - 6)}`
          : tokenInfo;

      return {
        success: true,
        token: newToken,
        tokenName: name,
        message: `Token "${name}" 导入成功`,
        details: `实际Token: ${displayToken}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Token "${name}" 添加失败: ${error.message}`,
      };
    }
  };

  // 连接管理辅助函数
  const generateSessionId = () =>
    "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  const currentSessionId = generateSessionId();

  // 获取连接锁
  const acquireConnectionLock = async (
    tokenId: string,
    operation = "connect",
  ) => {
    const lockKey = `${tokenId}_${operation}`;
    const connect = connectionLocks.value;
    if (connect[lockKey]) {
      wsLogger.debug(`等待连接锁释放: ${tokenId} (${operation})`);
      // 等待现有操作完成，最多等待10秒
      let attempts = 0;
      while (connect[lockKey] && attempts < 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
      if (connect[lockKey]) {
        wsLogger.warn(`连接锁等待超时: ${tokenId} (${operation})`);
        return false;
      }
    }
    connect[lockKey] = {
      tokenId,
      operation,
      timestamp: Date.now(),
      sessionId: currentSessionId,
    };
    wsLogger.connectionLock(tokenId, operation, true);
    return true;
  };

  // 释放连接锁
  const releaseConnectionLock = (tokenId: string, operation = "connect") => {
    const lockKey = `${tokenId}_${operation}`;
    if (connectionLocks.value[lockKey]) {
      delete connectionLocks.value[lockKey];
      wsLogger.connectionLock(tokenId, operation, false);
    }
  };

  // 更新跨标签页连接状态
  const updateCrossTabConnectionState = (
    tokenId: string,
    action: string,
    sessionId: string = currentSessionId,
  ) => {
    let state = useLocalStorage(`ws_connection_${tokenId}`, {
      action, // 'connecting', 'connected', 'disconnecting', 'disconnected'
      sessionId,
      timestamp: Date.now(),
      url: window.location.href,
    });

    if (activeConnections.value) {
      activeConnections.value[tokenId] = state.value;
    }
  };

  // 检查是否有其他标签页的活跃连接
  const checkCrossTabConnection = (tokenId: string) => {
    const storageKey = `ws_connection_${tokenId}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const state = JSON.parse(stored);
        const isRecent = Date.now() - state.timestamp < 30000; // 30秒内的状态认为是活跃的
        const isDifferentSession = state.sessionId !== currentSessionId;

        if (
          isRecent &&
          isDifferentSession &&
          (state.action === "connecting" || state.action === "connected")
        ) {
          wsLogger.debug(`检测到其他标签页的活跃连接: ${tokenId}`);
          return state;
        }
      }
    } catch (error) {
      wsLogger.warn("检查跨标签页连接状态失败:", error);
    }
    return null;
  };

  // WebSocket连接管理（重构版 - 防重连）
  const createWebSocketConnection = async (
    tokenId: string,
    base64Token: string,
    customWsUrl = null,
  ) => {
    wsLogger.info(`开始创建连接: ${tokenId}`);

    // 1. 获取连接锁，防止竞态条件
    const lockAcquired = await acquireConnectionLock(tokenId, "connect");
    if (!lockAcquired) {
      wsLogger.error(`无法获取连接锁: ${tokenId}`);
      return null;
    }

    try {
      // 2. 检查跨标签页连接状态
      const crossTabState = checkCrossTabConnection(tokenId);
      if (crossTabState) {
        wsLogger.debug(`跳过创建，其他标签页已有连接: ${tokenId}`);
        releaseConnectionLock(tokenId, "connect");
        return null;
      }

      // 3. 更新跨标签页状态为连接中
      updateCrossTabConnectionState(tokenId, "connecting");

      // 4. 如果存在现有连接，先优雅关闭
      if (wsConnections.value[tokenId]) {
        wsLogger.debug(`优雅关闭现有连接: ${tokenId}`);
        await closeWebSocketConnectionAsync(tokenId);
      }

      // 5. 解析token
      const parseResult = parseBase64Token(base64Token);
      let actualToken;
      if (parseResult.success) {
        actualToken = parseResult.data.actualToken;
      } else {
        if (validateToken(base64Token)) {
          actualToken = base64Token;
        } else {
          throw new Error(`Token无效: ${parseResult.error}`);
        }
      }
      // 6. 构建WebSocket URL
      const baseWsUrl = `wss://xxz-xyzw.hortorgames.com/agent?p=${encodeURIComponent(actualToken)}&e=x&lang=chinese`;

      const wsUrl = customWsUrl || baseWsUrl;

      wsLogger.debug(
        `Token: ${actualToken.substring(0, 10)}...${actualToken.slice(-4)}`,
      );

      // 7. 创建新的WebSocket客户端（增强版）
      const wsClient = new XyzwWebSocketClient({
        url: wsUrl,
        utils: g_utils,
        heartbeatMs: 5000,
      });

      // 8. 设置连接状态（带会话ID）
      wsConnections.value[tokenId] = {
        client: wsClient,
        status: "connecting",
        tokenId,
        wsUrl,
        actualToken,
        sessionId: currentSessionId,
        connectedAt: null,
        lastMessage: null,
        lastError: null,
        reconnectAttempts: 0,
        randomSeedSynced: false,
        lastRandomSeedSource: null,
        lastRandomSeed: null,
      };

      // 9. 设置事件监听（增强版）
      wsClient.onConnect = () => {
        wsLogger.wsConnect(tokenId);
        if (wsConnections.value[tokenId]) {
          wsConnections.value[tokenId].status = "connected";
          wsConnections.value[tokenId].connectedAt = new Date().toISOString();
          wsConnections.value[tokenId].reconnectAttempts = 0;
          wsConnections.value[tokenId].randomSeedSynced = false;
          wsConnections.value[tokenId].lastRandomSeedSource = null;
          wsConnections.value[tokenId].lastRandomSeed = null;
        }
        updateCrossTabConnectionState(tokenId, "connected");
        releaseConnectionLock(tokenId, "connect");
        localStorage.removeItem("xyzw_chat_msg_list");
        try {
          wsClient.send("role_getroleinfo");
        } catch (error) {
          wsLogger.warn(`初始化角色信息请求失败 [${tokenId}]`, error);
        }
      };

      wsClient.onDisconnect = async (event) => {
        const reason = event.code === 1006 ? "异常断开" : event.reason || "";
        wsLogger.wsDisconnect(tokenId, reason);
        if (wsConnections.value[tokenId]) {
          const conn = wsConnections.value[tokenId];
          conn.status = "disconnected";
          conn.randomSeedSynced = false;

          // 如果连接异常断开(1006)且从未连接成功(握手失败)，尝试刷新Token
          // connectedAt 为 null 表示 socket.onopen 还没触发就断开了，通常意味着握手失败（如403 Forbidden）
          if (event.code === 1006 && !conn.connectedAt) {
            wsLogger.warn(`检测到握手失败(1006)，尝试刷新Token [${tokenId}]`);
            // 强制刷新并重连
            await attemptTokenRefresh(tokenId, true);
          }
        }
        updateCrossTabConnectionState(tokenId, "disconnected");
      };

      wsClient.onError = (error) => {
        wsLogger.wsError(tokenId, error);
        if (wsConnections.value[tokenId]) {
          wsConnections.value[tokenId].status = "error";
          wsConnections.value[tokenId].lastError = {
            timestamp: new Date().toISOString(),
            error: error.toString(),
            url: wsUrl,
          };
        }
        releaseConnectionLock(tokenId, "connect");
      };

      // 10. 设置消息监听
      wsClient.setMessageListener((message: ProtoMsg) => {
        const cmd = message?.cmd || "unknown";
        wsLogger.wsMessage(tokenId, cmd, true);

        if (wsConnections.value[tokenId]) {
          wsConnections.value[tokenId].lastMessage = {
            timestamp: new Date().toISOString(),
            data: message,
            cmd: message?.cmd,
          };
          handleGameMessage(tokenId, message, wsClient);
        }
      });

      // 11. 初始化连接
      wsClient.init();

      wsLogger.verbose(`WebSocket客户端创建成功: ${tokenId}`);
      return wsClient;
    } catch (error) {
      wsLogger.error(`创建连接失败 [${tokenId}]:`, error);
      updateCrossTabConnectionState(tokenId, "disconnected");
      releaseConnectionLock(tokenId, "connect");
      return null;
    }
  };

  // 异步版本的关闭连接（优雅关闭）
  const closeWebSocketConnectionAsync = async (tokenId: string) => {
    const lockAcquired = await acquireConnectionLock(tokenId, "disconnect");
    if (!lockAcquired) {
      wsLogger.warn(`无法获取断开连接锁: ${tokenId}`);
      return;
    }

    try {
      const connection = wsConnections.value[tokenId];
      if (connection && connection.client) {
        wsLogger.debug(`开始优雅关闭连接: ${tokenId}`);

        connection.status = "disconnecting";
        updateCrossTabConnectionState(tokenId, "disconnecting");

        connection.client.disconnect();

        // 等待连接完全关闭
        await new Promise((resolve) => {
          const checkDisconnected = () => {
            if (!connection.client.connected) {
              resolve();
            } else {
              setTimeout(checkDisconnected, 100);
            }
          };
          setTimeout(resolve, 5000); // 最多等待5秒
          checkDisconnected();
        });

        delete wsConnections.value[tokenId];
        updateCrossTabConnectionState(tokenId, "disconnected");
        wsLogger.info(`连接已优雅关闭: ${tokenId}`);
      }
    } catch (error) {
      wsLogger.error(`关闭连接失败 [${tokenId}]:`, error);
    } finally {
      releaseConnectionLock(tokenId, "disconnect");
    }
  };

  // 同步版本的关闭连接（保持向后兼容）
  const closeWebSocketConnection = (tokenId: string) => {
    closeWebSocketConnectionAsync(tokenId).catch((error) => {
      wsLogger.error(`关闭连接异步操作失败 [${tokenId}]:`, error);
    });
  };

  const getWebSocketStatus = (tokenId: string) => {
    return wsConnections.value[tokenId]?.status || "disconnected";
  };

  // 获取WebSocket客户端
  const getWebSocketClient = (tokenId: string) => {
    return wsConnections.value[tokenId]?.client || null;
  };

  // 设置消息监听器
  const setMessageListener = (listener: any) => {
    if (selectedToken.value) {
      const connection = wsConnections.value[selectedToken.value.id];
      if (connection && connection.client) {
        connection.client.setMessageListener(listener);
      }
    }
  };

  // 设置是否显示消息
  const setShowMsg = (show: any) => {
    if (selectedToken.value) {
      const connection = wsConnections.value[selectedToken.value.id];
      if (connection && connection.client) {
        connection.client.setShowMsg(show);
      }
    }
  };

  // 发送消息到WebSocket
  const sendMessage = (
    tokenId: string,
    cmd: string,
    params = {},
    options = {},
  ) => {
    const connection = wsConnections.value[tokenId];
    if (!connection || connection.status !== "connected") {
      wsLogger.error(`WebSocket未连接，无法发送消息 [${tokenId}]`);
      return false;
    }

    try {
      const client = connection.client;
      if (!client) {
        wsLogger.error(`WebSocket客户端不存在 [${tokenId}]`);
        return false;
      }

      client.send(cmd, params, options);
      wsLogger.wsMessage(tokenId, cmd, false);

      return true;
    } catch (error) {
      wsLogger.error(`发送失败 [${tokenId}] ${cmd}:`, error.message);
      return false;
    }
  };

  // Promise版发送消息
  const sendMessageWithPromise = async (
    tokenId: string,
    cmd: string,
    params = {},
    timeout = 5000,
  ) => {
    const connection = wsConnections.value[tokenId];
    if (!connection || connection.status !== "connected") {
      return Promise.reject(new Error(`WebSocket未连接 [${tokenId}]`));
    }

    const client = connection.client;
    if (!client) {
      return Promise.reject(new Error(`WebSocket客户端不存在 [${tokenId}]`));
    }

    // 为战斗相关命令自动注入 battleVersion
    const battleCommands = [
      "fight_startareaarena",
      "fight_startpvp",
      "fight_starttower",
      "fight_startboss",
      "fight_startlegionboss",
      "fight_startdungeon",
      "fight_level",
    ];
    if (battleCommands.includes(cmd)) {
      const battleVersion = gameData.value.battleVersion;
      params = { battleVersion, ...params };
      wsLogger.info(
        `⚔️ [战斗命令] 注入 battleVersion: ${battleVersion} [${cmd}]`,
      );
    }

    try {
      const result = await client.sendWithPromise(cmd, params, timeout);

      // 特殊日志：fight_starttower 响应
      if (cmd === "fight_starttower") {
        wsLogger.info(`🗼 [咸将塔] 收到爬塔响应 [${tokenId}]:`, result);
      }

      return result;
    } catch (error) {
      // 特殊日志：fight_starttower 错误
      if (cmd === "fight_starttower") {
        wsLogger.error(`🗼 [咸将塔] 爬塔请求失败 [${tokenId}]:`, error.message);
      }
      return Promise.reject(error);
    }
  };

  // 发送心跳消息
  const sendHeartbeat = (tokenId: string) => {
    return sendMessage(tokenId, "heart_beat");
  };

  // 发送获取角色信息请求（异步处理）
  const sendGetRoleInfo = async (
    tokenId: string,
    params = {},
    retryCount = 0,
  ) => {
    try {
      // 增加超时时间到15秒，并添加重试机制
      const timeout = 15000;
      const roleInfo = await sendMessageWithPromise(
        tokenId,
        "role_getroleinfo",
        params,
        timeout,
      );

      // 手动更新游戏数据（因为响应可能不会自动触发消息处理）
      if (roleInfo) {
        gameData.value.roleInfo = roleInfo;
        gameData.value.lastUpdated = new Date().toISOString();
        gameLogger.verbose("角色信息已通过 Promise 更新");
      }

      return roleInfo;
    } catch (error) {
      gameLogger.error(`获取角色信息失败 [${tokenId}]:`, error.message);

      // 重试机制：最多重试2次，每次间隔1秒
      if (retryCount < 2) {
        gameLogger.info(
          `正在重试获取角色信息 [${tokenId}]，重试次数: ${retryCount + 1}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return sendGetRoleInfo(tokenId, params, retryCount + 1);
      }

      throw error;
    }
  };

  // 发送获取数据版本请求
  const sendGetDataBundleVersion = (tokenId: string, params = {}) => {
    return sendMessageWithPromise(tokenId, "system_getdatabundlever", params);
  };

  // 发送签到请求
  const sendSignIn = (tokenId: string) => {
    return sendMessageWithPromise(tokenId, "system_signinreward");
  };

  // 发送领取日常任务奖励
  const sendClaimDailyReward = (tokenId: string, rewardId = 0) => {
    return sendMessageWithPromise(tokenId, "task_claimdailyreward", {
      rewardId,
    });
  };

  // 发送获取队伍信息
  const sendGetTeamInfo = (tokenId: string, params = {}) => {
    return sendMessageWithPromise(tokenId, "presetteam_getinfo", params);
  };

  //发送消息到世界
  const sendMessageToWorld = (tokenId: string, message: string) => {
    return sendMessageWithPromise(tokenId, "system_sendchatmessage", {
      channel: 1,
      emojiId: 0,
      extra: null,
      msg: message,
      msgType: 1,
    });
  };
  //发送消息到俱乐部
  const sendMessageToLegion = (tokenId: string, message: string) => {
    return sendMessageWithPromise(tokenId, "system_sendchatmessage", {
      channel: 2,
      emojiId: 0,
      extra: null,
      msg: message,
      msgType: 1,
    });
  };

  // 发送自定义游戏消息
  const sendGameMessage = (
    tokenId: string,
    cmd: string,
    params = {},
    options = {},
  ) => {
    if (options.usePromise) {
      return sendMessageWithPromise(tokenId, cmd, params, options.timeout);
    } else {
      return sendMessage(tokenId, cmd, params, options);
    }
  };

  // 获取当前塔层数
  const getCurrentTowerLevel = () => {
    try {
      // 从游戏数据中获取塔信息
      const roleInfo = gameData.value.roleInfo;
      if (!roleInfo || !roleInfo.role) {
        gameLogger.warn("角色信息不存在");
        return null;
      }

      const tower = roleInfo.role.tower;
      if (!tower) {
        gameLogger.warn("塔信息不存在");
        return null;
      }

      // 可能的塔层数字段（根据实际数据结构调整）
      const level =
        tower.level || tower.currentLevel || tower.floor || tower.stage;

      // 当前塔层数
      return level;
    } catch (error) {
      gameLogger.error("获取塔层数失败:", error);
      return null;
    }
  };

  // 获取详细塔信息
  const getTowerInfo = () => {
    try {
      const roleInfo = gameData.value.roleInfo;
      if (!roleInfo || !roleInfo.role) {
        return null;
      }

      return roleInfo.role.tower || null;
    } catch (error) {
      gameLogger.error("获取塔信息失败:", error);
      return null;
    }
  };

  // 工具方法
  const exportTokens = () => {
    return {
      // ★ 共享角色不导出：那是别人的凭证，落成 JSON 文件后就再也收不回来了
      //   （撤销授权只能让服务端停止下发，已经下载到磁盘的副本我们管不到）。
      //   恢复备份后服务端清单会重新把它们拉回来，不依赖这份文件。
      tokens: gameTokens.value.filter((t) => !t.shared),
      exportedAt: new Date().toISOString(),
      version: "2.0",
    };
  };

  const importTokens = (data: any) => {
    try {
      if (data.tokens && Array.isArray(data.tokens)) {
        // 恢复备份是「恢复自己的号」，不该顺带把别人授权给我的角色踢掉 —— 原地保留
        const keptShared = gameTokens.value.filter((t) => t.shared);
        const incoming = data.tokens.filter((t: any) => !(t && t.shared));
        gameTokens.value = [...incoming, ...keptShared];
        return {
          success: true,
          message: `成功导入 ${incoming.length} 个Token`,
        };
      } else {
        return { success: false, message: "导入数据格式错误" };
      }
    } catch (error) {
      return { success: false, message: "导入失败：" + error.message };
    }
  };

  const clearAllTokens = async () => {
    // 关闭所有WebSocket连接
    Object.keys(wsConnections.value).forEach((tokenId) => {
      closeWebSocketConnection(tokenId);
    });

    gameTokens.value = [];
    selectedTokenId.value = null;

    // 清空IndexedDB
    await clearAll();
  };

  const cleanExpiredTokens = async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 找出需要清理的token
    const tokensToRemove = gameTokens.value.filter((token) => {
      // ★ 共享角色不参与「24 小时未使用」清理：它的生命周期由授权方决定，
      //   本机只是缓存一份。清理了下次启动还会被 refreshSharedGrants 拉回来，
      //   白白断一次连接。过期/撤销由服务端 list 决定，不走这条路径。
      if (token.shared) return false;
      // URL和bin文件导入的token设为长期有效，不会过期
      // 升级为长期有效的token也不会过期
      if (
        token.importMethod === "url" ||
        token.importMethod === "bin" ||
        token.importMethod === "wxQrcode" ||
        token.importMethod === "mobile" ||
        token.importMethod === "wxForceLogout" ||
        token.upgradedToPermanent
      ) {
        return false;
      }
      // 手动导入的token按原逻辑处理（24小时过期）
      const lastUsed = new Date(token.lastUsed || token.createdAt);
      return lastUsed <= oneDayAgo;
    });

    const cleanedCount = tokensToRemove.length;

    // 逐个删除，触发清理逻辑（WebSocket断开、IndexedDB删除等）
    for (const token of tokensToRemove) {
      await removeToken(token.id);
    }

    return cleanedCount;
  };

  // 将现有token升级为长期有效
  const upgradeTokenToPermanent = (tokenId: string) => {
    const token = gameTokens.value.find((t) => t.id === tokenId);
    if (
      token &&
      !token.upgradedToPermanent &&
      token.importMethod !== "url" &&
      token.importMethod !== "bin" &&
      token.importMethod !== "wxQrcode" &&
      token.importMethod !== "mobile" &&
      token.importMethod !== "wxForceLogout"
    ) {
      updateToken(tokenId, {
        upgradedToPermanent: true,
        upgradedAt: new Date().toISOString(),
      });
      return true;
    }
    return false;
  };

  // 连接唯一性验证和监控
  const validateConnectionUniqueness = (tokenId: string) => {
    const connections = Object.values(wsConnections.value).filter(
      (conn) =>
        conn.tokenId === tokenId &&
        (conn.status === "connecting" || conn.status === "connected"),
    );

    if (connections.length > 1) {
      wsLogger.warn(
        `检测到重复连接: ${tokenId}, 连接数: ${connections.length}`,
      );
      // 保留最新的连接，关闭旧连接
      const sortedConnections = connections.sort(
        (a, b) => new Date(b.connectedAt || 0) - new Date(a.connectedAt || 0),
      );

      for (let i = 1; i < sortedConnections.length; i++) {
        const oldConnection = sortedConnections[i];
        wsLogger.debug(`关闭重复连接: ${tokenId}`);
        closeWebSocketConnectionAsync(oldConnection.tokenId);
      }

      return false; // 检测到重复连接
    }

    return true; // 连接唯一
  };

  // 连接监控和清理
  const connectionMonitor = {
    // 定期检查连接状态
    startMonitoring: () => {
      setInterval(() => {
        const now = Date.now();

        // 检查连接超时（超过30秒未活动）
        Object.entries(wsConnections.value).forEach(([tokenId, connection]) => {
          const lastActivity =
            connection.lastMessage?.timestamp || connection.connectedAt;
          if (lastActivity) {
            const timeSinceActivity = now - new Date(lastActivity).getTime();
            if (
              timeSinceActivity > 30000 &&
              connection.status === "connected"
            ) {
              wsLogger.warn(`检测到连接可能已断开: ${tokenId}`);
              // 发送心跳检测
              if (connection.client) {
                connection.client.sendHeartbeat();
              }
            }
          }
        });

        // 清理过期的连接锁（超过10分钟）
        Object.entries(connectionLocks.value).forEach(([tokenId, lock]) => {
          if (now - lock.timestamp > 600000) {
            delete connectionLocks.value[tokenId];
            wsLogger.debug(`清理过期连接锁: ${tokenId}`);
          }
        });

        // 清理过期的跨标签页状态（超过5分钟）
        Object.entries(activeConnections.value).forEach(([tokenId, state]) => {
          if (now - state.timestamp > 300000) {
            wsLogger.debug(`清理过期跨标签页状态: ${tokenId}`);
            delete activeConnections.value[tokenId];
            localStorage.removeItem(`ws_connection_${tokenId}`);
          }
        });
      }, 10000); // 每10秒检查一次
    },

    // 获取连接统计信息
    getStats: () => {
      const duplicateTokens: string[] = [];
      const stats = {
        totalConnections: Object.keys(wsConnections.value).length,
        connectedCount: 0,
        connectingCount: 0,
        disconnectedCount: 0,
        errorCount: 0,
        duplicateTokens,
        activeLocks: Object.keys(connectionLocks.value).length,
        crossTabStates: Object.keys(activeConnections.value).length,
      };

      // 统计连接状态
      const tokenCounts = new Map();
      Object.values(wsConnections.value).forEach((connection) => {
        stats[connection.status + "Count"]++;

        // 检测重复token
        const count = tokenCounts.get(connection.tokenId) || 0;
        tokenCounts.set(connection.tokenId, count + 1);

        if (count > 0) {
          stats.duplicateTokens.push(connection.tokenId);
        }
      });

      return stats;
    },

    // 强制清理所有连接
    forceCleanup: async () => {
      wsLogger.info("开始强制清理所有连接...");

      const cleanupPromises = Object.keys(wsConnections.value).map((tokenId) =>
        closeWebSocketConnectionAsync(tokenId),
      );

      await Promise.all(cleanupPromises);

      // TODO:
      // 清理所有锁和状态
      // connectionLocks.value.clear()
      // activeConnections.value.clear()

      // 清理localStorage中的跨标签页状态
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("ws_connection_")) {
          localStorage.removeItem(key);
        }
      });

      wsLogger.info("强制清理完成");
    },
  };

  // 监听localStorage变化（跨标签页通信）
  const setupCrossTabListener = () => {
    window.addEventListener("storage", (event) => {
      if (event.key?.startsWith("ws_connection_")) {
        const tokenId = event.key.replace("ws_connection_", "");
        wsLogger.debug(
          `检测到跨标签页连接状态变化: ${tokenId}`,
          event.newValue,
        );

        // 如果其他标签页建立了连接，考虑关闭本标签页的连接
        if (event.newValue) {
          try {
            const newState = JSON.parse(event.newValue);
            const localConnection = wsConnections.value[tokenId];

            if (
              newState.action === "connected" &&
              newState.sessionId !== currentSessionId &&
              localConnection?.status === "connected"
            ) {
              wsLogger.info(
                `检测到其他标签页已连接同一token，关闭本地连接: ${tokenId}`,
              );
              closeWebSocketConnectionAsync(tokenId);
            }
          } catch (error) {
            wsLogger.warn("解析跨标签页状态失败:", error);
          }
        }
      }
    });
  };

  // 初始化
  const initTokenStore = () => {
    // // 恢复数据
    // const savedTokens = localStorage.getItem('gameTokens')
    // const savedSelectedId = localStorage.getItem('selectedTokenId')

    // if (savedTokens) {
    //   try {
    //     gameTokens.value = JSON.parse(savedTokens)
    //   } catch (error) {
    //     tokenLogger.error('解析Token数据失败:', error.message)
    //     gameTokens.value = []
    //   }
    // }

    // if (savedSelectedId) {
    //   selectedTokenId.value = savedSelectedId
    // }

    // 清理过期token
    cleanExpiredTokens();
    // 启动连接监控
    connectionMonitor.startMonitoring();
    /* 别人授权给我的角色：启动时对齐一次清单（撤销 / 过期的会在这一步被清掉）。
       异步、不阻塞启动；未登录时服务端回 401，这里静默失败，进角色列表时还会再拉一次。 */
    void refreshSharedGrants();

    // 设置跨标签页监听
    setupCrossTabListener();

    // 设置限流等待回调
    setAuthUserRateLimiterCallback((waitTimeMs: number, queueSize: number) => {
      const waitSeconds = Math.ceil(waitTimeMs / 1000);
      $emit.emit("token:refresh:waiting", {
        waitTimeMs,
        waitSeconds,
        queueSize,
        timestamp: Date.now(),
      });
    });

    tokenLogger.info("Token Store 初始化完成，连接监控已启动");
  };
  const setBattleVersion = (version: number | null) => {
    gameData.value.battleVersion = version;
    gameData.value.lastUpdated = new Date().toISOString();
  };

  const getBattleVersion = () => {
    return gameData.value.battleVersion;
  };

  // =====================
  // Token分组管理方法
  // =====================

  /**
   * 创建新的分组
   */
  const createTokenGroup = (name: string, color: string = "#1677ff") => {
    const group: TokenGroup = {
      id: "group_" + Date.now() + Math.random().toString(36).slice(2),
      name,
      color,
      tokenIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tokenGroups.value.push(group);
    return group;
  };

  /**
   * 删除分组
   */
  const deleteTokenGroup = (groupId: string) => {
    const index = tokenGroups.value.findIndex((g) => g.id === groupId);
    if (index !== -1) {
      tokenGroups.value.splice(index, 1);
    }
  };

  /**
   * 更新分组信息
   */
  const updateTokenGroup = (groupId: string, updates: Partial<TokenGroup>) => {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (group) {
      Object.assign(group, updates, {
        updatedAt: new Date().toISOString(),
      });
    }
  };

  /**
   * 添加token到分组
   */
  const addTokenToGroup = (groupId: string, tokenId: string) => {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (group && !group.tokenIds.includes(tokenId)) {
      group.tokenIds.push(tokenId);
      group.updatedAt = new Date().toISOString();
    }
  };

  /**
   * 从分组移除token
   */
  const removeTokenFromGroup = (groupId: string, tokenId: string) => {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (group) {
      const index = group.tokenIds.indexOf(tokenId);
      if (index !== -1) {
        group.tokenIds.splice(index, 1);
        group.updatedAt = new Date().toISOString();
      }
    }
  };

  /**
   * 获取token所属的分组
   */
  const getTokenGroups = (tokenId: string): TokenGroup[] => {
    return tokenGroups.value.filter((g) => g.tokenIds.includes(tokenId));
  };

  /**
   * 获取分组中的所有token ID
   */
  const getGroupTokenIds = (groupId: string): string[] => {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    return group ? group.tokenIds : [];
  };

  /**
   * 获取分组中有效的（存在于gameTokens中的）token ID
   */
  const getValidGroupTokenIds = (groupId: string): string[] => {
    const tokenIds = getGroupTokenIds(groupId);
    const validTokenIds = gameTokens.value.map((t) => t.id);
    return tokenIds.filter((id) => validTokenIds.includes(id));
  };

  /**
   * 移除不存在的token从所有分组
   */
  const cleanupInvalidTokens = () => {
    const validTokenIds = new Set(gameTokens.value.map((t) => t.id));
    tokenGroups.value.forEach((group) => {
      group.tokenIds = group.tokenIds.filter((id) => validTokenIds.has(id));
    });
  };

  return {
    // 状态
    gameTokens,
    selectedTokenId,
    wsConnections,
    gameData,

    // 计算属性
    hasTokens,
    selectedToken,
    selectedTokenRoleInfo,

    // Token管理方法
    addToken,
    updateToken,
    removeToken,
    selectToken,

    // 角色授权
    isSharedToken,
    grantToken,
    listGrants,
    revokeGrant,
    syncGrantsForToken,
    refreshSharedGrants,
    adoptSharedToken,
    dropSharedToken,

    // Base64解析方法
    parseBase64Token,
    importBase64Token,

    // WebSocket方法
    createWebSocketConnection,
    closeWebSocketConnection,
    getWebSocketStatus,
    getWebSocketClient,
    sendMessage,
    sendMessageWithPromise,
    setMessageListener,
    setShowMsg,
    sendHeartbeat,
    sendGetRoleInfo,
    sendGetDataBundleVersion,
    sendSignIn,
    sendClaimDailyReward,
    sendGetTeamInfo,
    sendGameMessage,

    // 工具方法
    exportTokens,
    importTokens,
    clearAllTokens,
    cleanExpiredTokens,
    upgradeTokenToPermanent,
    initTokenStore,

    //游戏内发送消息方法
    sendMessageToLegion,
    sendMessageToWorld,

    // 塔信息方法
    getCurrentTowerLevel,
    getTowerInfo,

    // battleVersion
    setBattleVersion,
    getBattleVersion,

    // 调试工具方法
    validateToken,
    debugToken: (tokenString: string) => {
      console.log("🔍 Token调试信息:");
      console.log("原始Token:", tokenString);
      const parseResult = parseBase64Token(tokenString);
      console.log("解析结果:", parseResult);
      if (parseResult.success) {
        console.log("实际Token:", parseResult.data.actualToken);
        console.log(
          "Token有效性:",
          validateToken(parseResult.data.actualToken),
        );
      }
      return parseResult;
    },

    // 连接管理增强功能
    validateConnectionUniqueness,
    connectionMonitor,
    currentSessionId: () => currentSessionId,

    // Token分组管理方法
    tokenGroups,
    createTokenGroup,
    deleteTokenGroup,
    updateTokenGroup,
    addTokenToGroup,
    removeTokenFromGroup,
    getTokenGroups,
    getGroupTokenIds,
    getValidGroupTokenIds,
    cleanupInvalidTokens,

    // 开发者工具
    devTools: {
      getConnectionStats: () => connectionMonitor.getStats(),
      forceCleanup: () => connectionMonitor.forceCleanup(),
      showConnectionLocks: () => Object.keys(connectionLocks.value),
      showCrossTabStates: () => Object.keys(activeConnections.value),
      testDuplicateConnection: (tokenId: string) => {
        // 降噪
        const token = gameTokens.value.find((t) => t.id === tokenId);
        if (token) {
          // 故意创建第二个连接进行测试
          createWebSocketConnection(tokenId + "_test", token.token);
        }
      },
    },
  };
});
