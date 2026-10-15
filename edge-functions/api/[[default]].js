// ============================================================================
// EdgeOne Pages · Edge Functions —— /api/* 反向代理
// ============================================================================
// 本文件 = edge-functions/api/[[default]].js
//   [[default]] 是 EdgeOne 的「多级动态路由」，命中本站 /api/** 的全部请求
//   （/api/x、/api/x/y/z 都算；裸 /api 不在覆盖范围内，前端也不请求它）
//
// 这是根目录 worker.js 的 EdgeOne 版本 —— 同一个仓库、同一套 4 条前缀代理：
//   /api/hortor-ucenter  → comb-platform.hortorgames.com（Host: ucenter-app-server…）
//   /api/hortor          → comb-platform.hortorgames.com
//   /api/weixin-long     → long.open.weixin.qq.com
//   /api/weixin          → open.weixin.qq.com
// 前端用的是相对路径（src/views/TokenImport/mobile.vue、wxqrcode.vue），
// 所以同一份前端代码在 CF 和 EdgeOne 上接的是同一套地址，不需要改前端。
//
// Cloudflare 侧的对应文件：根目录 worker.js
//   → 构建时被 vite.config.js 的 closeBundle 复制成 dist/_worker.js（CF Pages Advanced Mode）
// EdgeOne 侧不需要 _worker.js，平台只认仓库根的 edge-functions/ 目录。
//
// ── EdgeOne 与 Cloudflare 的运行期差异（都已在下面消化，改代码别踩回去）──
// 1. 运行时是 V8，**没有 Response.json()** → 一律 new Response(JSON.stringify(...))
// 2. **没有 env.ASSETS**（那是 CF Pages 的静态资源绑定），也**不需要**：
//    EdgeOne 的静态资源路由优先级高于函数，本文件只吃 /api/*，
//    静态资源与 SPA 回退（未匹配路径 → 200 + index.html）都由平台处理
// 3. 函数目录只能是仓库根的 edge-functions/（CF 是 functions/），路径即路由、大小写敏感
//    静态路由优先级高于 [[default]]，所以以后在本目录新增 edge-functions/api/xxx.js
//    不会被这个 catch-all 抢走
// 4. 不能 import Node 内置模块 / npm 包；单文件代码包 ≤ 5MB、请求体 ≤ 1MB、单次 CPU ≤ 200ms
//
// ── 已知的行为差异点：Host 头 ──
// Host / Connection 在 Fetch 规范里属于「禁止头」（forbidden header name），
// 标准 fetch() 会无视客户端设置的值。CF 上原版照样 set 上去、线上可用；
// 这里同样照设（尽力而为），另外对**没配 Host 的代理**显式删掉透传过来的本站 Host，
// 免得上游收到「部署域名的 Host」而路由错乱。
// 若某条代理线上 401/404，第一件事是抓包看上游实际收到的 Host。
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

// 代理表（与 worker.js 逐字一致）。匹配时按前缀长度降序取最长命中，
// 保证 /api/hortor-ucenter 不会被 /api/hortor 吃掉、/api/weixin-long 不会被 /api/weixin 吃掉。
const PROXIES = [
  {
    prefix: "/api/hortor-ucenter",
    target: "https://comb-platform.hortorgames.com",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 12; ALN-AL80 Build/HUAWEIALN-AL80; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.5735.196 Mobile Safari/537.36",
      "Accept": "application/json",
      "Host": "ucenter-app-server.hortorgames.com",
      "Content-Type": "application/json; charset=utf-8",
    },
  },
  {
    prefix: "/api/hortor",
    target: "https://comb-platform.hortorgames.com",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 12; 23117RK66C Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36",
      "Accept": "*/*",
      "Host": "comb-platform.hortorgames.com",
      "Connection": "keep-alive",
      "Content-Type": "text/plain; charset=utf-8",
      "Origin": "https://open.weixin.qq.com",
      "Referer": "https://open.weixin.qq.com/",
    },
  },
  {
    prefix: "/api/weixin-long",
    target: "https://long.open.weixin.qq.com",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN",
      "Accept": "*/*",
      "Referer": "https://open.weixin.qq.com/",
    },
  },
  {
    prefix: "/api/weixin",
    target: "https://open.weixin.qq.com",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Referer": "https://open.weixin.qq.com/",
    },
  },
].sort(function (a, b) {
  return b.prefix.length - a.prefix.length;
});

function withCors(init) {
  const headers = new Headers(init || {});
  Object.keys(CORS_HEADERS).forEach(function (key) {
    headers.set(key, CORS_HEADERS[key]);
  });
  return headers;
}

// EdgeOne 没有 Response.json()，只能自己拼
function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: withCors({ "Content-Type": "application/json; charset=utf-8" }),
  });
}

function matchProxy(pathname) {
  for (let i = 0; i < PROXIES.length; i++) {
    if (pathname.indexOf(PROXIES[i].prefix) === 0) return PROXIES[i];
  }
  return null;
}

function buildUpstreamUrl(proxy, url) {
  const target = new URL(proxy.target);
  const rest = url.pathname.slice(proxy.prefix.length);
  target.pathname = rest || "/";
  target.search = url.search;
  return target;
}

function buildUpstreamHeaders(proxy, request) {
  const headers = new Headers(request.headers);
  Object.keys(proxy.headers).forEach(function (key) {
    headers.set(key, String(proxy.headers[key]));
  });
  if (!proxy.headers.Host) {
    // 没配 Host 的代理：不要把本站域名的 Host 透传给上游
    headers.delete("Host");
  }
  return headers;
}

export function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  // CORS 预检：任何路径都直接放行，不打上游
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCors({}) });
  }

  const proxy = matchProxy(url.pathname);
  if (!proxy) {
    // 本站 /api/* 下没有别的接口；返回 404 JSON 而不是走 SPA 回退，
    // 免得前端把 index.html 当成接口响应解析（X-Proxy-By 用来区分这两种情况）
    return jsonResponse(
      {
        error: "not_found",
        by: "edgeone",
        path: url.pathname,
        proxies: PROXIES.map(function (p) {
          return p.prefix;
        }),
      },
      404
    );
  }

  const targetUrl = buildUpstreamUrl(proxy, url);
  const init = {
    method: request.method,
    headers: buildUpstreamHeaders(proxy, request),
    redirect: "follow",
  };
  // GET / HEAD 不能带 body，其余原样转发（EdgeOne 请求体上限 1MB）
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return fetch(targetUrl.toString(), init).then(
    function (upstream) {
      const headers = new Headers(upstream.headers);
      Object.keys(CORS_HEADERS).forEach(function (key) {
        headers.set(key, CORS_HEADERS[key]);
      });
      headers.set("X-Proxy-By", "edgeone");
      headers.set("X-Proxy-Target", proxy.prefix);
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: headers,
      });
    },
    function (error) {
      return jsonResponse(
        {
          error: (error && error.message) || String(error),
          by: "edgeone",
          proxy: proxy.prefix,
          target: proxy.target,
        },
        500
      );
    }
  );
}
