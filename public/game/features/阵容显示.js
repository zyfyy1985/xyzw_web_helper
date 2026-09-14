// @name         阵容显示
// @version      1.3.0
// @description  在盐场与蟠桃队伍列表中识别并显示真实阵容类型


/* ── 已移除第三方用量上报 ──────────────────────────────────────────────
   原脚本会向 https://119.29.73.12/report POST 用量数据，载荷内含
   accountBase64（游戏登录凭证）、设备指纹、UA、页面地址与区服信息。
   本段在原脚本体执行前置位「已上报」标记使其内部逻辑直接短路，
   并兜底拦截 fetch / GM_xmlhttpRequest / XHR 到该地址的请求。
   注：脚本内硬编码地址已一并改为 192.29.73.12（无效地址），
   即便本段拦截失效也不会落到真实收集端。
   拦截命中时会在控制台打印「[用量上报已拦截]」日志，便于确认生效。
   ───────────────────────────────────────────────────────────────────── */
(function () {
  var g = (typeof unsafeWindow !== "undefined" && unsafeWindow) || window;
  var BLOCK = ["119.29.73.12", "192.29.73.12"];
  function blocked(u) { try { var s = String(u); return BLOCK.some(function (b) { return s.indexOf(b) !== -1; }); } catch (e) { return false; } }
  function hit(kind, url) {
    try {
      if (typeof console !== "undefined" && console && typeof console.log === "function") {
        console.log("[用量上报已拦截] " + kind + " -> " + url);
      }
    } catch (e) {}
  }

  ["__MENGWANG_SALT_LINEUP_DISPLAY_USAGE_REPORTED__",
   "__XIANYU_BRIEF_REPORT_MIGRATION_USAGE_REPORTED__",
   "__PET_AUTO_MERGE_USAGE_REPORTED__",
   "__SALT_PEACH_AUTO_DEPLOY_CAR_USAGE_REPORTED__"
  ].forEach(function (k) { try { g[k] = true; } catch (e) {} });

  var rawFetch = g.fetch;
  if (typeof rawFetch === "function") {
    g.fetch = function (url) {
      if (blocked(url)) { hit("fetch", url); return Promise.reject(new Error("usage report disabled")); }
      return rawFetch.apply(this, arguments);
    };
  }

  var rawGM = g.GM_xmlhttpRequest;
  if (typeof rawGM === "function") {
    g.GM_xmlhttpRequest = function (detail) {
      if (detail && blocked(detail.url)) {
        hit("GM_xmlhttpRequest", detail.url);
        if (typeof detail.onerror === "function") detail.onerror({ statusText: "usage report disabled" });
        return;
      }
      return rawGM.apply(this, arguments);
    };
  }

  var XHR = g.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    var rawOpen = XHR.prototype.open;
    XHR.prototype.open = function (method, url) {
      this.__usageBlocked = blocked(url);
      this.__usageUrl = url;
      return rawOpen.apply(this, arguments);
    };
    var rawSend = XHR.prototype.send;
    XHR.prototype.send = function () {
      if (this.__usageBlocked) { hit("XMLHttpRequest", this.__usageUrl); return; }
      return rawSend.apply(this, arguments);
    };
  }
})();
(function () {
  "use strict";

  const SCRIPT_NAME = "阵容显示";
  const SCRIPT_VERSION = "1.3.0";
  const GLOBAL_MARK = "__MENGWANG_SALT_LINEUP_DISPLAY__";
  const TEAM_RESOLVER_KEY = "__MENGWANG_SALT_LINEUP_TEAM_RESOLVER__";
  const HOOK_MARK = "__mengwangSaltLineupDisplayHooked";
  const REQUEST_INTERVAL_MS = 180;
  const REQUEST_TIMEOUT_MS = 1800;
  const CACHE_TTL_MS = 5000;
  const H5_SESSION_STORAGE_KEY = "monster_h5_session_bootstrap_v1";
  const H5_DEVICE_STORAGE_KEY = "monster_h5_device_id";
  const USAGE_REPORT_MARK = "__MENGWANG_SALT_LINEUP_DISPLAY_USAGE_REPORTED__";
  const USAGE_REPORT_API_GLOBAL = "__SALT_LINEUP_USAGE_API__";
  const USAGE_REPORT_RETRY_DELAY_MS = 3000;
  const USAGE_REPORT_MAX_ATTEMPTS = 4;
  const USAGE_REPORT_AUTH_WAIT_TIMEOUT_MS = 15000;
  const USAGE_REPORT_AUTH_POLL_INTERVAL_MS = 400;
  const LEGACY_LOGIN_MAX_LENGTH = 48 * 1024;
  const GAME_LOGIN_SAMPLE_LENGTH = 4096;
  const ACCOUNT_HEX_MAX_LENGTH = LEGACY_LOGIN_MAX_LENGTH * 2;
  const ACCOUNT_SOURCE_MAX_DEPTH = 4;

  if (window[GLOBAL_MARK]) return;
  window[GLOBAL_MARK] = true;

  const TeamTag = {
    UNKNOWN: "未知",
    HIDDEN: "阵容已隐藏",
    CAN_ZHEN: "残阵",
    SHI_DIAN: "十殿阵容",
    SAN_SHU: "三蜀",
    WU_GUO: "吴国",
    DUBAO: "毒爆",
    LVHUATUO: "合力吕佗",
    LVZHAO: "合力吕赵",
    ZHUGE_COUPLE: "诸葛夫妇",
    DIANWEI: "典韦",
    JIANGWEI: "姜维",
    SIMA: "司马懿",
    GUANYU: "关羽",
    ZHOUYU: "周瑜",
    LVBU: "吕布",
    ZHAOYUN: "赵云",
    HUATUO: "华佗",
    ZHANGJIAO: "张角",
    ZHUGELIANG: "诸葛亮",
    SUNCE: "孙策",
    HUANGYUEYING: "黄月英",
    TAISHICI: "太史慈"
  };

  // 规则顺序与原脚本一致，越靠前的组合优先显示。
  const TEAM_RULES = [
    [TeamTag.SHI_DIAN, ["黄月英", "曹仁", "张角", "诸葛亮", "太史慈"]],
    [TeamTag.SAN_SHU, ["诸葛亮", "黄月英", "赵云"]],
    [TeamTag.WU_GUO, ["周瑜", "孙策", "太史慈"]],
    [TeamTag.DUBAO, ["张角", "华佗"]],
    [TeamTag.LVHUATUO, ["吕布", "华佗"]],
    [TeamTag.LVZHAO, ["吕布", "赵云"]],
    [TeamTag.ZHUGE_COUPLE, ["诸葛亮", "黄月英"]],
    [TeamTag.DIANWEI, ["典韦"]],
    [TeamTag.JIANGWEI, ["姜维"]],
    [TeamTag.SIMA, ["司马懿"]],
    [TeamTag.GUANYU, ["关羽"]],
    [TeamTag.ZHOUYU, ["周瑜"]],
    [TeamTag.LVBU, ["吕布"]],
    [TeamTag.ZHAOYUN, ["赵云"]],
    [TeamTag.ZHUGELIANG, ["诸葛亮"]],
    [TeamTag.HUANGYUEYING, ["黄月英"]],
    [TeamTag.HUATUO, ["华佗"]],
    [TeamTag.ZHANGJIAO, ["张角"]],
    [TeamTag.SUNCE, ["孙策"]],
    [TeamTag.TAISHICI, ["太史慈"]]
  ];

  const TARGETS = [
    {
      moduleName: "AttackTroopsPage",
      exportName: "AttackTroopsPage",
      kind: "troops",
      mode: "salt",
      itemOffsetX: 40,
      teamOffsetX: 50
    },
    {
      moduleName: "DefenseTroopsPage",
      exportName: "DefenseTroopsPage",
      kind: "troops",
      mode: "salt",
      itemOffsetX: 50,
      teamOffsetX: 45
    },
    {
      moduleName: "LPTroopsPage",
      exportName: "LPTroopsPage",
      kind: "troops",
      mode: "payload",
      itemOffsetX: 40,
      teamOffsetX: 40
    },
    {
      moduleName: "LegionDetailsDialog",
      exportName: "LegionDetailsDialog",
      kind: "legion-details"
    },
    {
      moduleName: "LegionInfoDialog",
      exportName: "LegionInfoDialog",
      kind: "legion-info"
    }
  ];

  const heroNameToIds = new Map();
  const teamCache = new Map();
  const pendingRequests = new Map();
  const rankTeamCache = new Map();
  const pendingRankRequests = new Map();
  const requestQueue = [];
  const visiblePages = new Set();
  const installedTargets = new Set();
  let queueRunning = false;
  let nextRequestAt = 0;
  let queueTimer = null;
  let usageReportAttempts = 0;
  let usageReportPromise = null;

  function log(...args) {
    try {
      console.log(`[${SCRIPT_NAME}]`, ...args);
    } catch (_) {
      // Ignore console failures in embedded runtimes.
    }
  }

  function warn(...args) {
    try {
      console.warn(`[${SCRIPT_NAME}]`, ...args);
    } catch (_) {
      // Ignore console failures in embedded runtimes.
    }
  }

  function readH5UsageCredentials(bootstrap) {
    try {
      let session = null;
      try {
        const rawSession = window.sessionStorage?.getItem(H5_SESSION_STORAGE_KEY);
        session = rawSession ? JSON.parse(rawSession) : null;
      } catch (_) {
        session = null;
      }
      const storedToken = typeof session?.runtimeToken === "string"
        ? session.runtimeToken.trim()
        : "";
      const bootstrapToken = typeof bootstrap?.runtimeToken === "string"
        ? bootstrap.runtimeToken.trim()
        : "";
      const runtimeToken = bootstrapToken || storedToken;
      const deviceId = String(window.localStorage?.getItem(H5_DEVICE_STORAGE_KEY) || "").trim();
      const storedExpiresAt = Number(session?.expiresAt);
      const bootstrapExpiresAt = Number(bootstrap?.expiresAt);
      const sameSession = Boolean(storedToken && storedToken === bootstrapToken);
      const validStoredExpiry = Number.isFinite(storedExpiresAt) && storedExpiresAt > 0
        ? storedExpiresAt
        : null;
      const validBootstrapExpiry = Number.isFinite(bootstrapExpiresAt) && bootstrapExpiresAt > 0
        ? bootstrapExpiresAt
        : null;
      const expiresAt = sameSession
        ? Math.max(validStoredExpiry || 0, validBootstrapExpiry || 0) || null
        : bootstrapToken
          ? validBootstrapExpiry
          : validStoredExpiry;

      // Match the bridge's non-empty token contract; the collector performs
      // the authoritative session check against the H5 API.
      if (!runtimeToken || !/^[\x21-\x7e]{1,2048}$/.test(runtimeToken)) return null;
      if (!deviceId || !/^[A-Za-z0-9_-]{16,128}$/.test(deviceId)) return null;

      return {
        runtimeToken,
        deviceId,
        expiresAt
      };
    } catch (_) {
      return null;
    }
  }

  function waitForPromise(value, timeoutMs, timeoutMessage) {
    if (!value || typeof value.then !== "function") return Promise.resolve(value);

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      Promise.resolve(value).then((result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(result);
      }, (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  function waitForH5LoginAuthorization() {
    const bridgeReady = window.GameBridge?.ready;
    return waitForPromise(
      bridgeReady,
      USAGE_REPORT_AUTH_WAIT_TIMEOUT_MS,
      "等待 H5 登录授权超时"
    ).catch(() => null).then((bootstrap) => {
      const credentials = readH5UsageCredentials(bootstrap);
      if (credentials && credentials.expiresAt !== null && credentials.expiresAt <= Date.now()) {
        throw new Error("H5 登录授权已过期");
      }
      return waitForPromise(
        waitForGameAccountAuthorization(bootstrap),
        USAGE_REPORT_AUTH_WAIT_TIMEOUT_MS + 1000,
        "获取游戏登录授权超时"
      ).then((gameAccount) => {
        const accountBase64 = gameAccount.accountBase64;
        if (!accountBase64) throw new Error("未获取到登录授权");
        return {
          credentials,
          bootstrap,
          accountBase64,
          accountSource: gameAccount.source,
          mode: credentials ? "h5" : "legacy"
        };
      });
    });
  }

  function normalizeAccountBase64(value) {
    const accountBase64 = String(value || "").replace(/\s+/g, "").trim()
      .replace(/-/g, "+").replace(/_/g, "/");
    if (accountBase64.length < 4 || accountBase64.length > LEGACY_LOGIN_MAX_LENGTH) return "";
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(accountBase64)) return "";
    const unpaddedLength = accountBase64.replace(/=+$/, "").length;
    if (unpaddedLength % 4 === 1) return "";
    return accountBase64 + "=".repeat((4 - accountBase64.length % 4) % 4);
  }

  function hexToBase64(value) {
    const hex = String(value || "").trim();
    if (!hex || hex.length > ACCOUNT_HEX_MAX_LENGTH || hex.length % 2 !== 0
      || !/^[0-9a-f]+$/i.test(hex)) return "";
    try {
      let binary = "";
      for (let index = 0; index < hex.length; index += 2) {
        binary += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
      }
      return normalizeAccountBase64(btoa(binary));
    } catch (_) {
      return "";
    }
  }

  function bytesToBase64(value) {
    try {
      let bytes = null;
      const isArrayBuffer = value && Object.prototype.toString.call(value) === "[object ArrayBuffer]";
      if (isArrayBuffer) bytes = new Uint8Array(value);
      else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      else if (Array.isArray(value) && value.length && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
        bytes = Uint8Array.from(value);
      } else if (value?.type === "Buffer" && Array.isArray(value.data)) {
        bytes = Uint8Array.from(value.data);
      }
      if (!bytes || !bytes.length) return "";
      let binary = "";
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }
      return normalizeAccountBase64(btoa(binary));
    } catch (_) {
      return "";
    }
  }

  function extractAccountCandidate(value, fieldName, depth = 0) {
    const sourceName = String(fieldName || "");
    const byteCandidate = bytesToBase64(value);
    if (byteCandidate) return byteCandidate;
    if (typeof value === "string") {
      const dataUrlMatch = value.trim().match(/^data:[^;,]+;base64,([A-Za-z0-9+/_=-]+)$/i);
      if (dataUrlMatch) return normalizeAccountBase64(dataUrlMatch[1]);
      if (/hex/i.test(sourceName)) return hexToBase64(value);
      return normalizeAccountBase64(value);
    }
    if (!value || typeof value !== "object") return "";

    const preferredFields = [
      "accountBase64", "gameAccountBase64", "accountBinBase64", "binData",
      "binBase64", "dataBase64", "base64", "encoded", "contentBase64"
    ];
    for (const field of preferredFields) {
      const candidate = extractAccountCandidate(value[field], field, depth + 1);
      if (candidate) return candidate;
    }
    for (const field of ["hexString", "hex", "binHex"]) {
      const candidate = hexToBase64(value[field]);
      if (candidate) return candidate;
    }
    if (typeof value.data === "string" && (/bin|account|data|getbin/i.test(sourceName) || value.type === "base64")) {
      const candidate = normalizeAccountBase64(value.data);
      if (candidate) return candidate;
    }
    if (depth >= ACCOUNT_SOURCE_MAX_DEPTH) return "";
    for (const field of [
      "data", "result", "value", "account", "authorization", "loginAuthorization",
      "payload", "bin", "binary", "user", "userData", "session", "credentials"
    ]) {
      if (value[field] === undefined || value[field] === value) continue;
      const candidate = extractAccountCandidate(value[field], `${sourceName}.${field}`, depth + 1);
      if (candidate) return candidate;
    }
    return "";
  }

  function readCurrentFileNameCandidates() {
    const candidates = [];
    const seen = new Set();
    const addCandidate = (value) => {
      const fileName = String(value || "").trim();
      if (!fileName || seen.has(fileName)) return;
      seen.add(fileName);
      candidates.push(fileName);
    };

    try {
      let search = String(window.location?.search || "");
      if (!search) {
        const href = String(window.location?.href || "");
        const queryStart = href.indexOf("?");
        if (queryStart >= 0) {
          const hashStart = href.indexOf("#", queryStart);
          search = href.slice(queryStart, hashStart >= 0 ? hashStart : undefined);
        }
      }
      const href = String(window.location?.href || "");
      if (typeof URLSearchParams === "function") {
        const params = new URLSearchParams(search);
        for (const key of ["fileName", "filename", "binFileName", "binName"]) {
          addCandidate(params.get(key));
        }
      }

      // URLSearchParams treats a literal '+' as a space. Decode the raw
      // query value as well so storage keys remain byte-for-byte compatible.
      const rawMatch = href.match(/[?&](?:fileName|filename|binFileName|binName)=([^&#]*)/i);
      if (rawMatch) {
        try {
          addCandidate(decodeURIComponent(rawMatch[1]));
        } catch (_) {
          addCandidate(rawMatch[1]);
        }
      }
    } catch (_) {
      // Some custom-scheme documents expose an incomplete Location object.
    }

    return candidates;
  }

  function parseStoredAccountRecord(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw;
    }
  }

  function readCurrentFileAccount() {
    const fileNames = readCurrentFileNameCandidates();
    if (!fileNames.length) return null;

    for (const fileName of fileNames) {
      const records = [];
      try {
        const fileData = window.fileData;
        if (fileData && typeof fileData === "object") {
          const record = typeof fileData.get === "function"
            ? fileData.get(fileName)
            : Object.prototype.hasOwnProperty.call(fileData, fileName)
              ? fileData[fileName]
              : undefined;
          if (record !== undefined && record !== null) {
            records.push(["window.fileData", record]);
          }
        }
      } catch (_) {
        // Continue with storage-backed records.
      }

      for (const storageName of ["localStorage", "sessionStorage"]) {
        try {
          const storage = window[storageName];
          const raw = storage?.getItem?.(fileName);
          if (raw !== null && raw !== undefined) {
            records.push([storageName, parseStoredAccountRecord(raw)]);
          }
        } catch (_) {
          // A storage area can be unavailable while an embedded page starts.
        }
      }

      for (const [source, record] of records) {
        let accountBase64 = extractAccountCandidate(record, fileName);
        if (!accountBase64 && typeof record === "string") {
          accountBase64 = hexToBase64(record);
        }
        if (accountBase64) {
          return { accountBase64, source: `current-file:${source}` };
        }
      }
    }

    return null;
  }

  function readCurrentRoleId() {
    try {
      const globals = [window.ROLE, window.globalThis?.ROLE];
      try {
        const serverData = typeof window.__require === "function"
          ? (window.__require("ServerData") || window.__require("game/parent3-LPTile/orange/data/ServerData"))
          : null;
        globals.push(serverData?.ROLE);
      } catch (_) {
        // The manager may not expose the Cocos module loader.
      }
      for (const role of globals) {
        const roleId = String(role?.roleId ?? role?.uid ?? role?.id ?? "").trim();
        if (/^\d{1,32}$/.test(roleId) && Number(roleId) > 0) return roleId;
      }
    } catch (_) {
      // Ignore inaccessible game globals.
    }
    return "";
  }

  function readCurrentServerId() {
    try {
      const values = [
        window.GameBridge?.getTargetServerId?.(),
        window.serverId,
        window.currentServerId,
        window.__SERVER_ID__
      ];
      for (const value of values) {
        const serverId = String(value || "").trim();
        if (/^\d{1,32}$/.test(serverId) && Number(serverId) > 0) return serverId;
      }
      const urlMatch = String(window.location?.href || "").match(/(?:server|zone|area)[^0-9]{0,4}(\d{1,32})/i);
      return urlMatch ? urlMatch[1] : "";
    } catch (_) {
      return "";
    }
  }

  function readStorageAccounts(storage, storageName, roleId, serverId) {
    const candidates = [];
    if (!storage) return candidates;
    for (let index = 0; index < storage.length; index += 1) {
      const key = String(storage.key(index) || "");
      const raw = storage.getItem(key);
      if (!raw || !/(bin|account|login|aiking|user|role|hexstring|base64)/i.test(`${key} ${raw.slice(0, 512)}`)) continue;
      let parsed = raw;
      try { parsed = JSON.parse(raw); } catch (_) { /* direct string or encoded value */ }
      const records = Array.isArray(parsed) ? parsed : [parsed];
      for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
        const record = records[recordIndex];
        const accountBase64 = extractAccountCandidate(record, `${key}[${recordIndex}]`);
        if (!accountBase64) continue;
        const recordRoleId = String(record?.roleId ?? record?.uid ?? record?.userId ?? record?.role?.roleId ?? "").trim();
        const recordServerId = String(record?.serverId ?? record?.server?.id ?? "").trim();
        let score = 0;
        if (roleId && recordRoleId === roleId) score += 300;
        if (serverId && recordServerId === serverId) score += 100;
        if (roleId && key.includes(roleId)) score += 100;
        if (serverId && key.includes(serverId)) score += 50;
        if (/\.bin(?:$|[-_])/i.test(key)) score += 10;
        candidates.push({ accountBase64, key, score, source: `${storageName}:${key}` });
      }
    }
    return candidates;
  }

  function safeReadStorageAccounts(storage, storageName, roleId, serverId) {
    try {
      return readStorageAccounts(storage, storageName, roleId, serverId);
    } catch (_) {
      return [];
    }
  }

  function selectBestAccountCandidate(candidates) {
    const uniqueCandidates = new Map();
    for (const candidate of candidates) {
      const existing = uniqueCandidates.get(candidate.accountBase64);
      if (!existing || candidate.score > existing.score) {
        uniqueCandidates.set(candidate.accountBase64, candidate);
      }
    }
    const sorted = [...uniqueCandidates.values()].sort((left, right) => right.score - left.score);
    if (!sorted.length) return null;
    if (sorted.length === 1 || sorted[0].score > sorted[1].score) return sorted[0];
    return null;
  }

  function readAiKingLocalStorageAccount() {
    try {
      const roleId = readCurrentRoleId();
      const serverId = readCurrentServerId();
      const candidates = [
        ...safeReadStorageAccounts(window.localStorage, "localStorage", roleId, serverId),
        ...safeReadStorageAccounts(window.sessionStorage, "sessionStorage", roleId, serverId)
      ];
      const selected = selectBestAccountCandidate(candidates);
      if (selected) return { accountBase64: selected.accountBase64, source: `storage:${selected.source}` };
    } catch (_) {
      // Some embedded pages deny localStorage access until the game is ready.
    }
    return null;
  }

  async function readAiKingManagerWindowAccount() {
    try {
      const requireCandidates = [window.require, window.__non_webpack_require__];
      let remote = null;
      for (const requireFunction of requireCandidates) {
        if (typeof requireFunction !== "function") continue;
        try {
          remote = requireFunction("electron")?.remote;
          if (remote?.BrowserWindow?.getAllWindows) break;
        } catch (_) {
          // Try another Node require function.
        }
      }
      if (!remote?.BrowserWindow?.getAllWindows) return null;

      const snapshotCode = `(() => {
        const items = [];
        for (const storageName of ["localStorage", "sessionStorage"]) {
          try {
            const storage = window[storageName];
            if (!storage) continue;
            for (let index = 0; index < storage.length; index += 1) {
              const key = String(storage.key(index) || "");
              const raw = String(storage.getItem(key) || "");
              if (!raw || !/(bin|account|login|aiking|user|role|hexstring|base64)/i.test(key + " " + raw.slice(0, 512))) continue;
              items.push({ storageName, key, raw: raw.slice(0, ${ACCOUNT_HEX_MAX_LENGTH + 4096}) });
            }
          } catch (_) {}
        }
        return items;
      })()`;
      const roleId = readCurrentRoleId();
      const serverId = readCurrentServerId();
      const candidates = [];
      const windows = remote.BrowserWindow.getAllWindows();
      for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
        const webContents = windows[windowIndex]?.webContents;
        if (!webContents || webContents.isDestroyed?.()) continue;
        try {
          const items = await webContents.executeJavaScript(snapshotCode, true);
          if (!Array.isArray(items) || !items.length) continue;
          const values = Object.fromEntries(items.map((item) => [
            `${item.storageName}:${item.key}`,
            String(item.raw || "")
          ]));
          const storage = {
            get length() { return Object.keys(values).length; },
            key(index) { return Object.keys(values)[index] ?? null; },
            getItem(key) { return values[key] ?? null; }
          };
          candidates.push(...safeReadStorageAccounts(
            storage,
            `electron-window-${windowIndex}`,
            roleId,
            serverId
          ));
        } catch (_) {
          // A destroyed or privileged manager window can reject JavaScript execution.
        }
      }
      const selected = selectBestAccountCandidate(candidates);
      return selected
        ? { accountBase64: selected.accountBase64, source: `ai-king-manager:${selected.source}` }
        : null;
    } catch (_) {
      return null;
    }
  }

  async function readGameAccountAuthorization(bootstrap) {
    // URL fileName is the deterministic account binding for manager webviews.
    const currentFileAccount = readCurrentFileAccount();
    if (currentFileAccount) return currentFileAccount;

    const bridgeReaders = [
      ["GameBridge.getBinData", () => window.GameBridge?.getBinData?.()],
      ["GameBridge.getAccountBase64", () => window.GameBridge?.getAccountBase64?.()],
      ["GameBridge.getAccount", () => window.GameBridge?.getAccount?.()],
      ["GameBridge.getGameAccount", () => window.GameBridge?.getGameAccount?.()],
      ["electronAPI.getBinData", () => window.electronAPI?.getBinData?.()],
      ["electronAPI.getAccountBase64", () => window.electronAPI?.getAccountBase64?.()],
      ["electronAPI.getAccount", () => window.electronAPI?.getAccount?.()],
      ["electronAPI.getGameAccount", () => window.electronAPI?.getGameAccount?.()],
      ["bridge.getBinData", () => window.bridge?.getBinData?.()],
      ["bridge.getAccount", () => window.bridge?.getAccount?.()],
      ["api.getBinData", () => window.api?.getBinData?.()],
      ["api.getAccount", () => window.api?.getAccount?.()],
      ["window.accountBase64", () => window.accountBase64],
      ["window.gameAccountBase64", () => window.gameAccountBase64],
      ["window.__ACCOUNT_BASE64__", () => window.__ACCOUNT_BASE64__],
      ["window.__GAME_ACCOUNT__", () => window.__GAME_ACCOUNT__],
      ["window.__LOGIN_AUTH__", () => window.__LOGIN_AUTH__]
    ];
    for (const [source, reader] of bridgeReaders) {
      try {
        const value = await reader();
        const accountBase64 = extractAccountCandidate(value, source);
        if (accountBase64) return { accountBase64, source };
      } catch (_) {
        // Try the next adapter.
      }
    }
    const bootstrapAccount = extractAccountCandidate(bootstrap, "accountBase64");
    if (bootstrapAccount) return { accountBase64: bootstrapAccount, source: "GameBridge.ready" };
    const managerWindowAccount = await readAiKingManagerWindowAccount();
    if (managerWindowAccount) return managerWindowAccount;
    return readAiKingLocalStorageAccount() || { accountBase64: "", source: "none" };
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitForGameAccountAuthorization(bootstrap) {
    const deadline = Date.now() + USAGE_REPORT_AUTH_WAIT_TIMEOUT_MS;
    let latestBootstrap = bootstrap;
    while (Date.now() < deadline) {
      try {
        const account = await readGameAccountAuthorization(latestBootstrap);
        if (account?.accountBase64) return account;
      } catch (_) {
        // Embedded storage and bridge objects can become available after load.
      }
      if (!latestBootstrap) {
        try {
          const ready = window.GameBridge?.ready;
          if (ready) {
            latestBootstrap = await waitForPromise(
              ready,
              Math.min(1000, Math.max(100, deadline - Date.now())),
              "等待运行时授权超时"
            );
          }
        } catch (_) {
          // Continue polling the deterministic fileName path.
        }
      }
      await delay(Math.min(USAGE_REPORT_AUTH_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    }
    return readGameAccountAuthorization(latestBootstrap);
  }

  // Keep only a short stable fingerprint in the normal event metadata.
  function readGameLoginAuthorization(bootstrap, knownAccountBase64, accountSource) {
    const accountBase64 = knownAccountBase64 || extractAccountCandidate(bootstrap, "accountBase64");

    if (!accountBase64) {
      return {
        type: "h5-game-account",
        present: false,
        length: 0,
        fingerprint: null,
        source: accountSource || "none"
      };
    }

    const sample = accountBase64.length > GAME_LOGIN_SAMPLE_LENGTH * 2
      ? `${accountBase64.slice(0, GAME_LOGIN_SAMPLE_LENGTH)}${accountBase64.slice(-GAME_LOGIN_SAMPLE_LENGTH)}`
      : accountBase64;
    let hashA = 2166136261;
    let hashB = 2654435761;
    for (let index = 0; index < sample.length; index += 1) {
      const code = sample.charCodeAt(index);
      hashA = Math.imul(hashA ^ code, 16777619);
      hashB = Math.imul(hashB ^ code, 2246822519);
    }

    return {
      type: "h5-game-account",
      present: true,
      length: accountBase64.length,
      fingerprint: `${(hashA >>> 0).toString(16).padStart(8, "0")}${(hashB >>> 0).toString(16).padStart(8, "0")}`,
      source: accountSource || "unknown"
    };
  }

  function canSendLoginAuthorization(reportUrl) {
    try {
      const parsed = new URL(reportUrl, window.location?.href || "http://127.0.0.1");
      return parsed.protocol === "https:"
        || parsed.hostname === "127.0.0.1"
        || parsed.hostname === "localhost"
        || parsed.hostname === "[::1]";
    } catch (_) {
      return false;
    }
  }

  function resolveUsageReportUrl() {
    const configured = String(window[USAGE_REPORT_API_GLOBAL] || "").trim();
    if (configured) return configured;
    const reportEndpoint = ["https://192.29.73.12", "report"].join("/");
    return reportEndpoint;
  }

  function parseUsageReportResponse(status, responseText) {
    let result = null;
    try {
      result = JSON.parse(String(responseText || ""));
    } catch (_) {
      // The collector normally returns JSON; keep the status as the useful error when it does not.
    }
    if (status < 200 || status >= 300) {
      throw new Error(result?.message || `HTTP ${status}`);
    }
    if (result?.success !== true || result?.data?.authorized !== true) {
      throw new Error("上报服务未确认登录授权");
    }
    return result;
  }

  function sendUsageReportRequest(reportUrl, headers, body) {
    const gmRequest = window.GM_xmlhttpRequest;
    if (typeof gmRequest === "function") {
      // The game is loaded through the aiking:// protocol. Its fetch implementation
      // blocks cross-origin HTTPS, while the manager's GM bridge is explicitly allowed.
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          callback(value);
        };
        try {
          gmRequest({
            method: "POST",
            url: reportUrl,
            headers,
            data: body,
            timeout: 10000,
            onload: (response) => {
              try {
                const rawResponse = response?.responseText ?? response?.response ?? "";
                const responseText = typeof rawResponse === "string"
                  ? rawResponse
                  : JSON.stringify(rawResponse);
                const status = Number(response?.status ?? response?.statusCode ?? 0);
                finish(resolve, parseUsageReportResponse(status, responseText));
              } catch (error) {
                finish(reject, error);
              }
            },
            onerror: (response) => finish(reject, new Error(String(response?.statusText || "GM request failed"))),
            ontimeout: () => finish(reject, new Error("GM request timed out")),
            onabort: () => finish(reject, new Error("GM request aborted"))
          });
        } catch (error) {
          finish(reject, error);
        }
      });
    }

    return fetch(reportUrl, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      headers,
      body
    }).then(async (response) => {
      const responseText = typeof response.text === "function"
        ? await response.text()
        : JSON.stringify(await response.json().catch(() => null));
      const result = parseUsageReportResponse(response.status, responseText);
      return result;
    });
  }

  // 上报已移除：原实现会把 accountBase64（游戏登录凭证）、UA、页面地址、区服
  // POST 到第三方收集端 https://119.29.73.12/report。此处改为空实现，不再发起任何请求。
  function reportScriptUsage() {}

  function requireGameModule(name) {
    if (typeof window.__require !== "function") return null;
    try {
      return window.__require(name);
    } catch (_) {
      return null;
    }
  }

  function getLegionWarModule() {
    const Configs = requireGameModule("Configs");
    const ModuleManager = requireGameModule("ModuleManager");
    return ModuleManager?.GET_MODULE?.(Configs?.ModuleType?.LEGION_WAR) || null;
  }

  function toSafeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function resolvePlayerId(player) {
    return toSafeNumber(
      player?.id ?? player?.codeIdV2 ?? player?.roleId ?? player?.codeId ?? 0
    );
  }

  function resolveTeamPlayerId(player, mode = "salt") {
    if (mode === "payload") {
      return toSafeNumber(player?.roleId ?? player?.id ?? 0);
    }
    return resolvePlayerId(player);
  }

  function getTeamValues(teamInfo) {
    if (!teamInfo) return [];
    if (typeof teamInfo.values === "function") {
      return Array.from(teamInfo.values());
    }
    if (Array.isArray(teamInfo)) return teamInfo;
    if (typeof teamInfo === "object") return Object.values(teamInfo);
    return [];
  }

  function getTeamSize(teamInfo) {
    const mapSize = Number(teamInfo?.size || 0);
    return mapSize > 0 ? mapSize : getTeamValues(teamInfo).length;
  }

  function getHeroIdsByName(name) {
    if (heroNameToIds.has(name)) return heroNameToIds.get(name);

    const Configs = requireGameModule("Configs");
    const LanguageExt = requireGameModule("LanguageExt");
    const heroes = Configs?.HeroConf?.list;
    const getContent = LanguageExt?.GET_CONTENT;
    if (!heroes || typeof getContent !== "function") return [];

    const ids = [];
    for (const hero of heroes) {
      const localizedName = String(getContent(hero?.nickName) || "");
      if (localizedName.includes(name)) ids.push(Number(hero.id));
    }
    heroNameToIds.set(name, ids);
    return ids;
  }

  function getTeamHeroIds(teamInfo) {
    return getTeamValues(teamInfo)
      .map((hero) => toSafeNumber(hero?.heroId ?? hero?.id ?? 0))
      .filter((id) => id > 0);
  }

  function hasMissingHeroIdentity(teamInfo) {
    const size = getTeamSize(teamInfo);
    return size > 0 && getTeamHeroIds(teamInfo).length < size;
  }

  function detectTeamTag(teamInfo) {
    const size = getTeamSize(teamInfo);
    if (size <= 0) return TeamTag.UNKNOWN;

    const teamHeroIds = getTeamHeroIds(teamInfo);
    for (const [tag, heroNames] of TEAM_RULES) {
      const matched = heroNames.every((name) => {
        const ids = getHeroIdsByName(name);
        return ids.some((id) => teamHeroIds.includes(id));
      });
      if (matched) return tag;
    }
    if (size <= 4) return TeamTag.CAN_ZHEN;
    return hasMissingHeroIdentity(teamInfo) ? TeamTag.HIDDEN : TeamTag.UNKNOWN;
  }

  function summarizeTeam(teamInfo) {
    const size = getTeamSize(teamInfo);
    if (size <= 0) return "";
    const parts = [detectTeamTag(teamInfo)];
    const missing = Math.max(0, 5 - size);
    if (missing > 0) parts.push(`缺${missing}`);
    return parts.join(" ");
  }

  function cloneTeamInfo(teamInfo) {
    return teamInfo instanceof Map ? new Map(teamInfo) : teamInfo;
  }

  function buildTeamCacheKey(playerId, mode = "salt") {
    return `${mode}:${playerId}`;
  }

  function readCachedTeam(playerId, mode = "salt") {
    const cacheKey = buildTeamCacheKey(playerId, mode);
    const cached = teamCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() - cached.time > CACHE_TTL_MS) {
      teamCache.delete(cacheKey);
      return null;
    }
    return cached.teamInfo;
  }

  function enqueueRequest(executor) {
    return new Promise((resolve) => {
      requestQueue.push({ executor, resolve });
      flushRequestQueue();
    });
  }

  function flushRequestQueue() {
    if (queueRunning || queueTimer !== null) return;

    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay > 0) {
      queueTimer = window.setTimeout(() => {
        queueTimer = null;
        flushRequestQueue();
      }, delay);
      return;
    }

    const task = requestQueue.shift();
    if (!task) return;
    queueRunning = true;
    const requestStartedAt = Date.now();
    Promise.resolve()
      .then(task.executor)
      .then(task.resolve, () => task.resolve(null))
      .finally(() => {
        queueRunning = false;
        nextRequestAt = Math.max(Date.now(), requestStartedAt + REQUEST_INTERVAL_MS);
        flushRequestQueue();
      });
  }

  function requestTeamInfo(playerId) {
    const module = getLegionWarModule();
    const Generated = requireGameModule("data-index");
    const responseEvent = Generated?.RESPS?.War_GetTeamInfoResp;
    const ResponseType = Generated?.War_GetTeamInfoResp;
    if (!module?.network || !module?.sendGetTeamInfo || !responseEvent || !ResponseType) {
      warn("游戏阵容接口尚未就绪");
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const context = {};
      let completed = false;
      let timeoutId = null;

      const finish = (teamInfo) => {
        if (completed) return;
        completed = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        module.network.off(responseEvent, onResponse, context);
        resolve(teamInfo || null);
      };

      const onResponse = (event) => {
        if (event?.data?.code) {
          finish(null);
          return;
        }
        try {
          const response = event.data.getData(new ResponseType());
          finish(response?.teamInfo || null);
        } catch (error) {
          warn(`解析阵容失败: roleId=${playerId}`, error);
          finish(null);
        }
      };

      module.network.on(responseEvent, onResponse, context);
      try {
        module.sendGetTeamInfo(String(playerId));
      } catch (error) {
        warn(`请求阵容失败: roleId=${playerId}`, error);
        finish(null);
        return;
      }

      timeoutId = window.setTimeout(() => finish(null), REQUEST_TIMEOUT_MS);
    });
  }

  function getSharedTeamResolver() {
    const resolver = window[TEAM_RESOLVER_KEY];
    return resolver && typeof resolver === "object" ? resolver : null;
  }

  function extractRoleIdFromHeadImg(headImg) {
    const raw = String(headImg || "").trim();
    if (!raw) return 0;
    const match = raw.match(/\/release\/(\d+)\/[^/?#]+(?:[?#].*)?$/i);
    return toSafeNumber(match?.[1]);
  }

  async function loadHeadImgTeamInfo(player) {
    const roleId = extractRoleIdFromHeadImg(player?.headImg);
    if (roleId <= 0) return null;
    const rankModule = getRankModule();
    if (!rankModule?.sendGetRoleInfoWithCache) return null;
    try {
      const roleInfo = await Promise.resolve(rankModule.sendGetRoleInfoWithCache(roleId));
      const battleTeam = roleInfo?.battleTeam;
      return getTeamSize(battleTeam) > 0 ? battleTeam : null;
    } catch (error) {
      warn(`通过头像角色信息读取阵容失败: roleId=${roleId}`, error);
      return null;
    }
  }

  async function resolveTeamInfo(player, playerId, mode = "salt") {
    const resolver = getSharedTeamResolver();
    if (mode === "payload") {
      if (typeof resolver?.resolvePayloadPlayerTeamInfo === "function") {
        try {
          const result = await resolver.resolvePayloadPlayerTeamInfo(player);
          if (result?.teamInfo) return result.teamInfo;
        } catch (error) {
          warn(`蟠桃阵容识别失败: roleId=${playerId}`, error);
        }
      }
      return getTeamSize(player?.teamInfo) > 0 ? player.teamInfo : null;
    }

    if (getTeamHeroIds(player?.teamInfo).length > 0) {
      return player.teamInfo;
    }

    if (typeof resolver?.resolvePlayerTeamInfo === "function") {
      try {
        const result = await resolver.resolvePlayerTeamInfo(player);
        if (result?.teamInfo) return result.teamInfo;
      } catch (error) {
        warn(`共享阵容识别失败: roleId=${playerId}`, error);
      }
    }

    const headImgTeamInfo = await loadHeadImgTeamInfo(player);
    if (headImgTeamInfo) return headImgTeamInfo;

    const teamInfo = await requestTeamInfo(playerId);
    if (!teamInfo || !hasMissingHeroIdentity(teamInfo)) return teamInfo;

    const rankTeamInfo = await loadRankTeamInfo(playerId);
    return rankTeamInfo && getTeamHeroIds(rankTeamInfo).length > 0
      ? rankTeamInfo
      : teamInfo;
  }

  function loadTeamInfo(player, mode = "salt") {
    const playerId = resolveTeamPlayerId(player, mode);
    if (playerId <= 0) return Promise.resolve(null);
    const cacheKey = buildTeamCacheKey(playerId, mode);
    const cached = readCachedTeam(playerId, mode);
    if (cached) return Promise.resolve(cached);
    if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

    const pending = enqueueRequest(() => resolveTeamInfo(player, playerId, mode))
      .then((teamInfo) => {
        if (teamInfo) {
          teamCache.set(cacheKey, {
            time: Date.now(),
            teamInfo: cloneTeamInfo(teamInfo)
          });
        }
        return teamInfo;
      })
      .finally(() => pendingRequests.delete(cacheKey));

    pendingRequests.set(cacheKey, pending);
    return pending;
  }

  function getRankModule() {
    const Configs = requireGameModule("Configs");
    const ModuleManager = requireGameModule("ModuleManager");
    return ModuleManager?.GET_MODULE?.(Configs?.ModuleType?.RANK) || null;
  }

  function loadRankTeamInfo(roleId) {
    if (rankTeamCache.has(roleId)) {
      return Promise.resolve(rankTeamCache.get(roleId));
    }
    if (pendingRankRequests.has(roleId)) return pendingRankRequests.get(roleId);

    const rankModule = getRankModule();
    if (!rankModule?.sendGetRoleTeam) return Promise.resolve(null);

    let request;
    try {
      request = rankModule.sendGetRoleTeam(String(roleId), 17);
    } catch (error) {
      warn(`盐场外阵容请求失败: roleId=${roleId}`, error);
      return Promise.resolve(null);
    }

    const pending = Promise.resolve(request)
      .then((response) => {
        if (response?.code) return null;
        const fighterMap = response?.teamInfo?.team || null;
        if (fighterMap) rankTeamCache.set(roleId, fighterMap);
        return fighterMap;
      })
      .catch((error) => {
        warn(`盐场外阵容请求失败: roleId=${roleId}`, error);
        return null;
      })
      .finally(() => pendingRankRequests.delete(roleId));

    pendingRankRequests.set(roleId, pending);
    return pending;
  }

  function applyLabelStyle(label, item) {
    const field = item?.m_strength || item?.m_name || item?.m_power;
    if (!label || !field) return;
    label.color = field.color;
    label.fontSize = field.fontSize;
    label.verticalAlign = field.verticalAlign;
    label.align = "left";
    label.leading = field.leading;
    label.singleLine = true;
    label.height = field.height;
  }

  function ensureLineupLabel(item) {
    if (!item) return null;
    if (item.__saltLineupLabel) return item.__saltLineupLabel;

    const GTextField = window.fgui?.GTextField;
    if (!GTextField || typeof item.addChild !== "function") return null;

    const label = new GTextField();
    label.touchable = false;
    label.visible = false;
    label.singleLine = true;
    label.width = 180;
    item.addChild(label);
    applyLabelStyle(label, item);
    item.__saltLineupLabel = label;
    return label;
  }

  function positionLineupLabel(item, label, offsetX) {
    const field = item?.m_strength || item?.m_name || item?.m_power;
    if (!field || !label) return;
    label.x = Number(field.x || 0) + Number(offsetX || 0);
    label.y = Number(field.y || 0);
  }

  function clearLineupLabel(item, offsetX) {
    const label = ensureLineupLabel(item);
    if (!label) return;
    label.text = "";
    label.visible = false;
    positionLineupLabel(item, label, offsetX);
  }

  function schedulePageRefresh(page) {
    if (!page || page.__saltLineupRefreshTimer) return;
    page.__saltLineupRefreshTimer = window.setTimeout(() => {
      page.__saltLineupRefreshTimer = null;
      if (!visiblePages.has(page)) return;
      try {
        page._refresh?.();
      } catch (error) {
        warn("刷新阵容文字失败", error);
      }
    }, 0);
  }

  function refreshItem(page, item, player, offsetX, mode = "salt") {
    if (!item || !player) {
      clearLineupLabel(item, offsetX);
      return;
    }

    const label = ensureLineupLabel(item);
    if (!label) return;
    applyLabelStyle(label, item);
    item.setChildIndex?.(label, Math.max(0, Number(item.numChildren || 1) - 1));
    positionLineupLabel(item, label, offsetX);

    if (toSafeNumber(player?.bossConfId) > 0) {
      clearLineupLabel(item, offsetX);
      return;
    }

    const playerId = resolveTeamPlayerId(player, mode);
    if (playerId <= 0) {
      clearLineupLabel(item, offsetX);
      return;
    }

    const cacheKey = buildTeamCacheKey(playerId, mode);
    item.__saltLineupCacheKey = cacheKey;
    const teamInfo = readCachedTeam(playerId, mode);
    const summary = teamInfo ? summarizeTeam(teamInfo) : "";
    if (summary) {
      label.text = `阵容：${summary}`;
      label.visible = true;
    } else {
      label.text = "阵容：读取中";
      label.visible = true;
    }

    loadTeamInfo(player, mode).then((loadedTeamInfo) => {
      if (!loadedTeamInfo || !visiblePages.has(page) || item.__saltLineupCacheKey !== cacheKey) return;
      const loadedSummary = summarizeTeam(loadedTeamInfo);
      if (loadedSummary) {
        label.text = `阵容：${loadedSummary}`;
        label.visible = true;
      }
      schedulePageRefresh(page);
    });
  }

  function installPageHook(PageClass, options) {
    const proto = PageClass?.prototype;
    if (!proto) return false;
    if (proto[HOOK_MARK]) return false;
    const originalRefreshItem = proto._refreshItem;
    const originalRefreshTeamItem = proto._refreshTeamItem;
    if (
      typeof originalRefreshItem !== "function" &&
      typeof originalRefreshTeamItem !== "function"
    ) {
      return false;
    }
    proto[HOOK_MARK] = true;

    const originalOnShow = proto.onShow;
    proto.onShow = function (...args) {
      visiblePages.add(this);
      const result = originalOnShow?.apply(this, args);
      schedulePageRefresh(this);
      return result;
    };

    const originalOnShown = proto.onShown;
    proto.onShown = function (...args) {
      const result = originalOnShown?.apply(this, args);
      visiblePages.add(this);
      schedulePageRefresh(this);
      return result;
    };

    const originalOnHide = proto.onHide;
    proto.onHide = function (...args) {
      visiblePages.delete(this);
      if (this.__saltLineupRefreshTimer) {
        window.clearTimeout(this.__saltLineupRefreshTimer);
        this.__saltLineupRefreshTimer = null;
      }
      return originalOnHide?.apply(this, args);
    };

    if (typeof originalRefreshItem === "function") {
      proto._refreshItem = function (index, item, player) {
        const result = originalRefreshItem.call(this, index, item, player);
        refreshItem(this, item, player, options.itemOffsetX, options.mode);
        return result;
      };
    }

    if (typeof originalRefreshTeamItem === "function") {
      proto._refreshTeamItem = function (index, item, player) {
        const result = originalRefreshTeamItem.call(this, index, item, player);
        refreshItem(this, item, player, options.teamOffsetX, options.mode);
        return result;
      };
    }

    return true;
  }

  function ensureOutsideLineupLabel(item) {
    if (!item) return null;
    if (item.__saltOutsideLineupLabel) return item.__saltOutsideLineupLabel;

    const GTextField = window.fgui?.GTextField;
    if (!GTextField || typeof item.addChild !== "function") return null;

    const label = new GTextField();
    label.touchable = false;
    label.singleLine = true;
    item.addChild(label);
    item.__saltOutsideLineupLabel = label;
    return label;
  }

  function refreshOutsideLineup(item, member) {
    const label = ensureOutsideLineupLabel(item);
    if (!label) return;

    const roleId = resolvePlayerId(member);
    const baseField = item?.m_power || item?.m_strength || item?.m_name;
    applyLabelStyle(label, { m_strength: baseField });
    label.x = Number(baseField?.x || 0) + 210;
    label.y = Number(baseField?.y || 0);
    label.visible = roleId > 0;
    item.__saltOutsideLineupRoleId = roleId;

    if (roleId <= 0) {
      label.text = "";
      return;
    }

    const cached = rankTeamCache.get(roleId);
    label.text = cached ? summarizeTeam(cached) : "读取中";
    loadRankTeamInfo(roleId).then((teamInfo) => {
      if (item.__saltOutsideLineupRoleId !== roleId) return;
      label.text = teamInfo ? summarizeTeam(teamInfo) : TeamTag.UNKNOWN;
    });
  }

  function installOutsideListHook(DialogClass, kind) {
    const proto = DialogClass?.prototype;
    if (!proto) return false;
    if (proto[HOOK_MARK]) return false;

    if (kind === "legion-details") {
      const originalRefreshMember = proto._refreshMember;
      if (typeof originalRefreshMember !== "function") return false;
      proto[HOOK_MARK] = true;
      proto._refreshMember = function (index, item) {
        const result = originalRefreshMember.call(this, index, item);
        const Configs = requireGameModule("Configs");
        const ModuleManager = requireGameModule("ModuleManager");
        const legionModule = ModuleManager?.GET_MODULE?.(Configs?.ModuleType?.LEGION);
        refreshOutsideLineup(item, legionModule?.sortMembers?.[index]);
        return result;
      };
      return true;
    }

    const originalRefreshItem = proto._refreshItem;
    if (typeof originalRefreshItem !== "function") return false;
    proto[HOOK_MARK] = true;
    proto._refreshItem = function (index, item) {
      const result = originalRefreshItem.call(this, index, item);
      refreshOutsideLineup(item, this?._members?.[index]);
      return result;
    };
    return true;
  }

  function processTarget(requireFunction, target) {
    try {
      const module = requireFunction(target.moduleName);
      const PageClass = module?.[target.exportName];
      if (!PageClass?.prototype) return false;
      if (PageClass.prototype[HOOK_MARK]) {
        installedTargets.add(target.moduleName);
        return false;
      }
      const installed = target.kind === "troops"
        ? installPageHook(PageClass, target)
        : installOutsideListHook(PageClass, target.kind);
      if (installed) {
        installedTargets.add(target.moduleName);
        log(`Hook 成功: ${target.moduleName}`);
      }
      return installed;
    } catch (_) {
      return false;
    }
  }

  function installAll(requireFunction) {
    if (typeof requireFunction !== "function") return false;
    for (const target of TARGETS) processTarget(requireFunction, target);
    return installedTargets.size === TARGETS.length;
  }

  function patchRequireWatcher() {
    const existingRequire = window.__require;
    try {
      let internalRequire = existingRequire;
      Object.defineProperty(window, "__require", {
        configurable: true,
        get() {
          return internalRequire;
        },
        set(nextRequire) {
          internalRequire = nextRequire;
          installAll(nextRequire);
        }
      });
      installAll(internalRequire);
    } catch (error) {
      warn("无法监听 __require，将使用轮询安装", error);
    }
  }

  function startPolling() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const complete = installAll(window.__require);
      if (complete || attempts >= 180) {
        window.clearInterval(timer);
        if (typeof window.__require !== "function") {
          warn("未检测到游戏运行时 __require");
        }
      }
    }, 1000);
  }

  patchRequireWatcher();
  startPolling();
  reportScriptUsage();
  log("已启动，仅启用盐场阵容显示");
})();
