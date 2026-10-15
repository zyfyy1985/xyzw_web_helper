/**
 * 全站唯一的后端地址源
 *
 * 三个后端接口其实是**同一个服务**（`E:\xyzw_server` 的双平台部署）：
 *   /api/auth      账号（注册 / 登录 / 改密）
 *   /api/state     云同步键值
 *   /api/scripts   内置功能脚本清单
 * ⇒ 地址只在下面写一次，三个接口全部由它派生。换域名只改这一行。
 *
 * ## 地址写死在这里（明文常量）
 *   https://www.kofs.kdns.fr   ← **EdgeOne** 部署，2026-10-15 实测比另一份更好用
 *   ★ 这份 KV 已绑定（`?action=ping` → `kv:true`）：
 *       - `/api/auth` 注册 / 登录 / 改密 ✅
 *       - `/api/state` 云同步 ✅（未带 token 时按预期回 401）
 *       - `/api/scripts` 脚本清单 ✅（不依赖 KV）
 *       - `/api/hortor*`、`/api/weixin*` 4 条**第三方反向代理** ✅（见后端 `shared/proxy.js`）
 *   ⚠️ 另一份同代码的 **Cloudflare** 部署 https://xyzw-server.pages.dev
 *      当日实测**连不上**（curl 无响应，HTTP 000），故不作为主地址。
 *   ⚠️ 历史注释一度写成「只有 pages.dev 可用、kofs 的 kv:false」—— 已过时，别照着改。
 *
 * ## 为什么不用环境变量（曾经的 `VITE_AUTH_BASE`，已废弃）
 *   ① 这个地址不是秘密，没有藏起来的必要；
 *   ② 环境变量要在**本地 `.env` + 部署平台的环境变量**两个地方各配一次，云端那份极易漏 ——
 *      而漏了的后果是「变量为空 ⇒ 退化成同源 ⇒ 所有 `/api/*` 全部 404、登录直接不可用」，
 *      属于自找的故障点。写死在源码里 ⇒ 前端零配置，构建环境怎么变都不会错。
 *
 * ## 不需要前端做代理
 *   后端 CORS 是 `Access-Control-Allow-Origin: *`（并带 `Authorization` 与 OPTIONS 预检），
 *   浏览器**跨域直连**即可。
 *
 *   ★ TokenImport 的 4 条第三方代理也**一律走这个 base**（`api("/api/hortor")` 这样拼）：
 *     反向代理统一由后端（`E:\xyzw_server` 的 `shared/proxy.js` + 双平台 catch-all 入口）承担，
 *     前端只负责拼绝对地址 ⇒ **部署在任何静态平台上都能用**
 *     （帽子云 / GitHub Pages / Azure SWA 这些没有边缘函数的平台不需要做任何额外配置）。
 */

/** 后端根地址（明文常量；首尾空白与末尾斜杠会被剥掉，所以这里写脏一点也不会拼出 `//api`） */
export const SERVER_BASE = "https://www.kofs.kdns.fr"
  .trim()
  .replace(/\/+$/, "");

/** 拼后端接口地址：`api("/api/scripts")` */
export const api = (path) => SERVER_BASE + path;

/** 兼容旧名字 —— `/api/auth`（authApi）与 `/api/state`（cloudState）都在用它 */
export const AUTH_BASE = SERVER_BASE;
