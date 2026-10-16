#!/usr/bin/env node
/* ============================================================================
 * 英雄大头像图库 —— 全链路现取（不依赖任何本地中间产物）
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * heads/heroes/<皮肤名> 在游戏资源里是 cc.SpriteFrame（图集子图），bundle 里
 * 没有独立 PNG：必须「拉 SpriteFrame 描述 → 拿图集 → 按 rect 裁」。
 * 本工具把这套流程封起来，产物直接是 hero-feature-builder.cjs --features 能吃的
 * 伪战报格式，于是「下载图库 → 逐图提特征 → 生成识别器」可以一条链跑通。
 *
 * ── 实时性：三样东西都现场从 CDN 取（新英雄 / 新皮肤跑一次就有）─────────────
 *   ① bundle 版本表   POST https://xxz-xyzw.hortorgames.com/login/manifest
 *                     → body.bundleVers（icons / config 两个版本号）
 *   ② 皮肤→英雄映射   config 包里的三张表现拼：
 *                       AvatarConf[avatarId] = { path, headIcon, nickName, ... }
 *                       HeroConf[heroId]     = { nickName, skinList:[avatarId…] }  ← 权威分组
 *                       LanguageConf[键]     = 中文名
 *                     规则：英雄 H 的皮肤 = H.skinList 里的 avatarId → AvatarConf.path，
 *                     去掉尾部 `_N` 就是图集名（dianwei2_1 → dianwei2）。
 *                     ★ 不能用「前缀猜」：HeroConf 会把复用的 100x id（simayi5 等）
 *                       分给具体英雄，猜前缀会漏 20+ 个，还会把 dianwei2 挂错英雄。
 *   ③ 图集 PNG        icons/native/<xx>/<uuid>.<ver>.png
 * 因此不再依赖 _bundlevers.json / red-hero-skins.json / hero-roster.json 等
 * 任何历史产物，也不依赖 _atlas-cache（默认每次现下）。
 *
 * ── 默认只拉「红色武将」 ──────────────────────────────────────────────────
 * 颜色品质现取 HeroConf[heroId].color：3=红（101–122 共 22 个英雄，与旧
 * red-hero-skins.json 的名单一致）、2=橙、1=紫。默认 colors=[3]，所以默认就是红将。
 * --all 关掉颜色过滤拉全部 255 张；--color / --hero-ids 可换筛选口径。
 *
 * ── ⚠️ 裁切的两个坑（都在 cropSprite 里处理了）────────────────────────────
 *   1. rect 的 y 就是 PNG 的左上原点，**不要翻转**（按 cocos 惯例翻会静默裁到别的图块）
 *   2. frame 里可能带 "rotated":1 —— 图块是「宽高互换 + 顺时针转 90°」存的，
 *      必须裁 [x,y,w→h,h→w] 再逆时针转回来，否则会跨过两个图块
 *
 * ── 用法 ──────────────────────────────────────────────────────────────────
 *   node src/utils/img2hero/fetch-hero-heads.cjs [选项]
 *
 *   默认：现拉版本表 + 现拼映射 + 现下图集，**只输出红色武将（color=3）的头像**。
 *
 *   --out <路径>     输出 JSON（默认 .workbuddy/hero-heads.json）
 *                     ★ 每次还会在**同目录**写一份同名 .html 图库（按角色分组看图）
 *   --html <路径>    指定 HTML 输出位置（默认 = JSON 同名换 .html）
 *   --no-html        不生成 HTML 图库
 *   --all            不按颜色过滤，输出全部 heads/heroes 头像（255 张）
 *   --color <表>     指定品质，如 --color 3（默认）/ --color 1,2 / --color 2,3
 *   --hero-ids <表>  只处理这些英雄，如 --hero-ids 101-122,201（给了就覆盖颜色过滤）
 *   --filter <正则>  只处理匹配的皮肤名，如 --filter "^guanyu"
 *   --limit <N>      最多处理 N 个
 *   --roster-only    只保留能标到 heroId 的（配 --all 用：221 张全是英雄皮肤）
 *   --no-label       不拼映射、不标 heroId（纯下图；映射拉失败时也会自动退到这里）
 *   --vers <路径>    用本地版本表（离线 / 排障用；默认在线取）
 *   --cache          复用 .workbuddy/_atlas-cache（默认不读不写）
 *   --force          兼容保留（默认已是「总是重下」）
 *   --quiet          少说话
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { decodePNG, encodePNG } = require("./pnglite.cjs");

const ROOT = path.join(__dirname, "..", "..", ".."); // src/utils/img2hero → 仓库根
const CDN = "https://xxz-xyzw-res.hortorgames.com/remote/";
const MANIFEST = "https://xxz-xyzw.hortorgames.com/login/manifest?platform=hortor&version=0.1.0-androidh5";
const PREFIX = "heads/heroes/";                       // 只要这套（small_heads / bodies 是独立图，不需要裁）
const DEFAULT_OUT = path.join(ROOT, ".workbuddy", "hero-heads.json");
const ATLAS_CACHE = path.join(ROOT, ".workbuddy", "_atlas-cache");
/** 需要从 config 包里现取的三张表（哪张资产装哪张表不写死，按资产名优先级扫） */
const WANTED_TABLES = ["LanguageConf", "HeroConf", "AvatarConf"];
/** 品质：3=红（默认只拉红将）/ 2=橙 / 1=紫（现取 HeroConf[heroId].color） */
const RED_COLOR = 3;

// ── HTTP ────────────────────────────────────────────────────────────────────
/** 统一请求：返回 {status, buf}，网络错误不抛（status -1） */
function req(url, opt) {
  const o = opt || {};
  return new Promise((resolve) => {
    const r = https.request(
      url,
      { method: o.method || "GET", headers: Object.assign({ Accept: "*/*", "User-Agent": "Mozilla/5.0" }, o.headers || {}) },
      (x) => {
        const c = [];
        x.on("data", (d) => c.push(d));
        x.on("end", () => resolve({ status: x.statusCode, buf: Buffer.concat(c) }));
      }
    );
    r.on("error", () => resolve({ status: -1, buf: Buffer.alloc(0) }));
    r.setTimeout(o.timeout || 30000, () => r.destroy());
    r.end(o.body || "");
  });
}

async function getJson(url, timeout) {
  const r = await req(url, { timeout: timeout || 30000 });
  if (r.status !== 200) throw new Error(`${url} HTTP ${r.status}`);
  return JSON.parse(r.buf.toString("utf8"));
}

/** cocos 资源包里的 JsonAsset：剥掉 [1,0,0,…,[0,"名字",{…}]] 包装拿里面的表对象 */
function jsonAssetOf(text) {
  const arr = JSON.parse(text);
  for (const it of arr) {
    if (Array.isArray(it) && it[0] && it[0][2] && typeof it[0][2] === "object" && !Array.isArray(it[0][2])) return it[0][2];
  }
  throw new Error("不是 cc.JsonAsset 包装");
}

// ── 小工具 ──────────────────────────────────────────────────────────────────
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** 图库自带的稳定 hash（逐图去重与追溯用；fetch 与 builder 两边认同一个值） */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

/** cocos 压缩 uuid（22 位 base64）→ 36 位标准 uuid；短 uuid 原样返回 */
const UUID_CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const UUID_B64 = new Array(128).fill(0);
for (let i = 0; i < UUID_CH.length; i++) UUID_B64[UUID_CH.charCodeAt(i)] = i;
const HEX = "0123456789abcdef";
function decodeUuid(b) {
  const u = String(b).split("@")[0];
  if (u.length !== 22) return u;
  const slot = [];
  for (let i = 0; i < 36; i++) { if (i === 8 || i === 13 || i === 18 || i === 23) continue; slot.push(i); }
  const t = new Array(36).fill("-");
  for (const s of slot) t[s] = "";
  t[slot[0]] = u[0]; t[slot[1]] = u[1];
  let j = 2;
  for (let i = 2; i < 22; i += 2) {
    const l = UUID_B64[u.charCodeAt(i)], r = UUID_B64[u.charCodeAt(i + 1)];
    t[slot[j++]] = HEX[l >> 2];
    t[slot[j++]] = HEX[((l & 3) << 2) | (r >> 4)];
    t[slot[j++]] = HEX[r & 0xF];
  }
  return t.join("");
}

/** 固定并发数的任务池 */
async function pool(items, limit, worker) {
  let i = 0;
  const results = new Array(items.length);
  await Promise.all(new Array(Math.min(limit, items.length || 1)).fill(0).map(async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) break;
      try { results[idx] = await worker(items[idx], idx); } catch (e) { results[idx] = { err: String((e && e.message) || e) }; }
    }
  }));
  return results;
}

/** 资产名 → 扫描优先级（语言表最可能同时带 HeroConf，其次 level 带 AvatarConf） */
function assetRank(name) {
  if (/language/i.test(name)) return 0;
  if (/level/i.test(name)) return 1;
  if (/config/i.test(name)) return 3;
  return 2;
}

/** cfg.versions.import / native 的 [idx, ver] 扁平数组 → {idx: ver} */
function pairMap(list) {
  const m = {};
  const a = list || [];
  for (let i = 0; i < a.length; i += 2) m[a[i]] = a[i + 1];
  return m;
}

// ── ① 版本表（在线现取） ────────────────────────────────────────────────────
/**
 * POST /login/manifest → body.bundleVers
 * @param {string} [localPath] 传了就用本地文件、不联网（离线 / 排障）
 */
async function fetchBundleVers(localPath) {
  if (localPath) {
    const bv = readJson(localPath);
    if (!bv.icons) throw new Error(`${localPath} 里没有 icons 字段`);
    return { bv, from: path.relative(ROOT, localPath) };
  }
  const r = await req(MANIFEST, { method: "POST", headers: { "Content-Type": "application/json;charset=UTF-8" } });
  if (r.status !== 200) throw new Error(`版本表 HTTP ${r.status}（${MANIFEST}）`);
  const body = JSON.parse(r.buf.toString("utf8"));
  const bv = JSON.parse(body.body.bundleVers);
  if (!bv || !bv.icons) throw new Error("版本表里没有 icons 字段");
  return { bv, from: "login/manifest" };
}

// ── ② 皮肤 → 英雄映射（在线现拼） ───────────────────────────────────────────
/** 图集里的皮肤名 = AvatarConf.path 去掉尾部 `_N`（dianwei2_1 → dianwei2） */
function normalizeSkinPath(p) {
  return String(p).replace(/_\d+$/, "");
}

/** LanguageConf 里把 {key, chinese} 全捞成 key→中文 */
function buildLangIndex(langConf) {
  const map = new Map();
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    if (typeof o.key === "string" && typeof o.chinese === "string") { map.set(o.key, o.chinese); return; }
    for (const k of Object.keys(o)) walk(o[k]);
  })(langConf);
  return map;
}

/**
 * 由三张表拼出「图集皮肤名 → {heroId, heroName, skinId}」
 * 权威分组 = HeroConf[heroId].skinList（不是猜前缀）
 */
function buildSkinMap(opt) {
  const avatarConf = opt.avatarConf || {};
  const heroConf = opt.heroConf || {};
  const lang = buildLangIndex(opt.langConf || {});
  const names = opt.atlasNames instanceof Set ? opt.atlasNames : new Set(opt.atlasNames || []);

  /** 英雄中文名：LanguageConf[hero_<id>] → AvatarConf.nickName 的词条 → 本身就是中文的 nickName */
  const heroNameOf = (hid) => {
    const h = heroConf[String(hid)] || {};
    const a = avatarConf[String(hid)] || {};
    const byKey = lang.get(h.nickName) || lang.get(a.nickName);
    if (byKey) return byKey;
    const ni = a.nickName;
    if (typeof ni === "string" && ni && !lang.has(ni) && !/^[A-Za-z][A-Za-z0-9_]*$/.test(ni)) return ni;
    return "";
  };

  /** 品质：HeroConf.color 优先，兜底 AvatarConf.color（3=红 / 2=橙 / 1=紫） */
  const heroColorOf = (hid) => {
    const h = heroConf[String(hid)] || {};
    const a = avatarConf[String(hid)] || {};
    const c = h.color != null ? h.color : a.color;
    const n = Number(c);
    return Number.isFinite(n) ? n : 0;
  };

  const map = new Map();
  const colorCount = {};
  let dup = 0;
  for (const hid of Object.keys(heroConf)) {
    const heroId = Number(hid);
    const h = heroConf[hid] || {};
    const ids = Array.isArray(h.skinList) ? h.skinList : [];
    const heroName = heroNameOf(heroId);
    const color = heroColorOf(heroId);
    for (const aid of new Set(ids)) {
      const a = avatarConf[String(aid)];
      if (!a || !a.path) continue;
      if (!String(a.headIcon || "").startsWith(PREFIX)) continue;
      const name = normalizeSkinPath(a.path);
      if (!names.has(name)) continue;                 // 图集里没有的皮肤直接忽略
      if (map.has(name)) { dup++; continue; }         // 两名英雄抢同一张图 → 先到先得
      map.set(name, { heroId, heroName, skinId: Number(aid), color });
      colorCount[color] = (colorCount[color] || 0) + 1;
    }
  }
  const unlabeled = [...names].filter((n) => !map.has(n));
  return { map, unlabeled, dup, colorCount, heroCount: new Set([...map.values()].map((v) => v.heroId)).size };
}

/**
 * 挑可选目标（纯函数，便于离线断言）
 * 优先级：heroIds（给了就覆盖颜色）→ colors → 都不给时 rosterOnly 只丢未标注的
 * @param {Array<{name:string, meta:object|null}>} jobs
 * @param {{heroIds?:number[]|Set, colors?:number[]|Set, rosterOnly?:boolean}} opts
 * @returns {{jobs:Array, skipped:{byHeroId:number, byColor:number, unlabeled:number}}}
 */
function filterHeads(jobs, opts) {
  const o = opts || {};
  const toSet = (v) => (v instanceof Set ? v : v && v.length ? new Set(v) : null);
  const ids = toSet(o.heroIds);
  const colors = toSet(o.colors);
  const kept = [];
  const skipped = { byHeroId: 0, byColor: 0, unlabeled: 0 };
  for (const j of jobs) {
    const meta = j.meta || null;
    if (ids) { if (!meta || !ids.has(meta.heroId)) { skipped.byHeroId++; continue; } }
    else if (colors) { if (!meta || !colors.has(meta.color)) { skipped.byColor++; continue; } }
    else if (o.rosterOnly && !meta) { skipped.unlabeled++; continue; }
    kept.push(j);
  }
  return { jobs: kept, skipped };
}

/** 打开一个 bundle 的 config.<ver>.json，返回 {cfg, vImp, loadAsset(idx)} */
async function openBundle(name, ver) {
  const cfg = await getJson(`${CDN}${name}/config.${ver}.json`);
  const vImp = pairMap(cfg.versions.import);
  return {
    cfg,
    vImp,
    loadAsset: async (idx) => {
      const uuid = decodeUuid(cfg.uuids[idx]);
      const r = await req(`${CDN}${name}/import/${uuid.slice(0, 2)}/${uuid}.${vImp[idx]}.json`, { timeout: 60000 });
      if (r.status !== 200) throw new Error(`${name}/import/${uuid.slice(0, 2)}/${uuid} HTTP ${r.status}`);
      return jsonAssetOf(r.buf.toString("utf8"));
    },
  };
}

/** 在 config 包里扫出需要的表（哪张资产装哪张表不写死） */
async function loadConfigTables(vers, log) {
  const b = await openBundle("config", vers.config);
  const idxs = Object.keys(b.cfg.paths)
    .filter((k) => String(b.cfg.paths[k][1]) === "0")     // 0 = JsonAsset
    .sort((x, y) => assetRank(String(b.cfg.paths[x][0])) - assetRank(String(b.cfg.paths[y][0])));
  const found = {};
  for (const idx of idxs) {
    if (WANTED_TABLES.every((t) => found[t])) break;
    let obj;
    try { obj = await b.loadAsset(idx); } catch (e) { log(`  跳过资产 ${b.cfg.paths[idx][0]}：${e.message}`); continue; }
    const got = [];
    for (const t of WANTED_TABLES) {
      if (!found[t] && obj[t] && typeof obj[t] === "object") { found[t] = obj[t]; got.push(t); }
    }
    if (got.length) log(`  资产 ${b.cfg.paths[idx][0]} → ${got.join(" / ")}`);
  }
  const missing = WANTED_TABLES.filter((t) => !found[t]);
  if (missing.length) throw new Error(`config 包里找不到表：${missing.join(", ")}`);
  return found;
}

/** 图标包里 heads/heroes/* 的皮肤名清单（+ 每个名字的 SpriteFrame 索引） */
async function listAtlasNames(vers) {
  const cfg = await getJson(`${CDN}icons/config.${vers.icons}.json`);
  const jobs = [];
  let skippedInternal = 0;
  for (const k of Object.keys(cfg.paths)) {
    const spec = cfg.paths[k];
    if (!Array.isArray(spec) || typeof spec[0] !== "string" || !spec[0].startsWith(PREFIX)) continue;
    const name = spec[0].slice(PREFIX.length);
    // 图集内部伪条目（heads/heroes/AutoAtlas）不是 SpriteFrame，跳过
    if (!name || name.startsWith("/") || /^AutoAtlas$/i.test(name)) { skippedInternal++; continue; }
    jobs.push({ name, idx: +k });
  }
  jobs.sort((a, b) => a.name.localeCompare(b.name));
  return { cfg, jobs, skippedInternal };
}

/**
 * 从图集里抠出一个 SpriteFrame（★ 上面注释里说的两个坑都在这里）
 * @param {{w:number,h:number,data:Buffer}} atlas 已解码的图集
 * @param {number[]} rect [x, y, w, h]（游戏给的原值）
 * @param {boolean} rotated 图块是否被旋转 90° 存储
 */
function cropSprite(atlas, rect, rotated) {
  const [rx, ry, rw, rh] = rect;
  // rotated 时，图集上的实际区域是宽高互换的
  const aw = rotated ? rh : rw;
  const ah = rotated ? rw : rh;
  if (rx < 0 || ry < 0 || rx + aw > atlas.w || ry + ah > atlas.h) {
    throw new Error(`rect 越界 [${rect}]${rotated ? " rotated" : ""} vs 图集 ${atlas.w}x${atlas.h}`);
  }
  // 注意：srcY 就是 ry，不翻转
  const cut = Buffer.alloc(aw * ah * 4);
  for (let y = 0; y < ah; y++) {
    atlas.data.copy(cut, y * aw * 4, ((ry + y) * atlas.w + rx) * 4, ((ry + y) * atlas.w + rx + aw) * 4);
  }
  if (!rotated) return { w: aw, h: ah, data: cut };
  // 逆时针 90° 还原（输出尺寸回到 rw × rh）
  const w = ah, h = aw;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      const nx = y, ny = aw - 1 - x;
      cut.copy(out, (ny * w + nx) * 4, (y * aw + x) * 4, (y * aw + x) * 4 + 4);
    }
  }
  return { w, h, data: out };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
/**
 * 下载 heads/heroes/* 全部头像，组装成「伪战报」对象
 * @param {object} [opts]
 * @param {string}  [opts.vers]       本地版本表路径；不传则在线取
 * @param {string}  [opts.filter]     皮肤名正则
 * @param {number}  [opts.limit]
 * @param {number[]}[opts.colors]     品质过滤（默认 [3] = 红将）；传 [] / 不传由调用方决定
 * @param {boolean} [opts.rosterOnly] 只留能标到 heroId 的（colors 为空时生效）
 * @param {boolean} [opts.noLabel]    不拼映射
 * @param {number[]}[opts.heroIds]    只留这些 heroId（给了就覆盖 colors）
 * @param {boolean} [opts.cache]      复用图集缓存
 * @param {boolean} [opts.quiet]
 * @returns {Promise<{json:object, stats:object}>}
 */
async function fetchHeads(opts) {
  const o = opts || {};
  const log = o.quiet ? () => {} : (...a) => console.log(...a);

  // ---------- 1) 版本表：默认在线取（--vers 才用本地） ----------
  const { bv, from } = await fetchBundleVers(o.vers);
  log(`版本表（${from}）：icons=${bv.icons} config=${bv.config}`);

  // ---------- 2) 图标包清单 ----------
  const { cfg, jobs: allJobs, skippedInternal } = await listAtlasNames(bv);
  log(`图标包：${Object.keys(cfg.paths).length} 个资源，其中 ${PREFIX}* 共 ${allJobs.length} 个头像` +
    (skippedInternal ? `（跳过 ${skippedInternal} 个图集内部条目）` : ""));

  // ---------- 3) 映射：在线现拼（失败不阻塞下图） ----------
  let skinMap = new Map();
  if (o.noLabel) {
    log("映射：按 --no-label 跳过（不标 heroId）");
  } else {
    try {
      const tables = await loadConfigTables(bv, log);
      const built = buildSkinMap({
        avatarConf: tables.AvatarConf,
        heroConf: tables.HeroConf,
        langConf: tables.LanguageConf,
        atlasNames: new Set(allJobs.map((j) => j.name)),
      });
      skinMap = built.map;
      const cc = Object.keys(built.colorCount).sort().map((c) => `color${c}=${built.colorCount[c]}`).join(" ");
      log(`映射：${built.heroCount} 个英雄 / 标到 ${skinMap.size} 个头像（${cc}）` +
        (built.unlabeled.length ? `（另 ${built.unlabeled.length} 个未标注）` : "") +
        (built.dup ? ` / ${built.dup} 个重名跳过` : ""));
    } catch (e) {
      console.log(`⚠️ 映射拼装失败（${e.message}）—— 继续下图，只是不标 heroId`);
    }
  }

  // ---------- 4) 挑出目标（默认只拉红将 = color 3） ----------
  const re = o.filter ? new RegExp(o.filter) : null;
  // 颜色 / hero-ids 都依赖映射：--no-label 或映射失败时自动失效，否则会把图全筛没
  const labelOn = skinMap.size > 0;
  const useColors = labelOn ? o.colors : null;
  const useHeroIds = labelOn ? o.heroIds : null;
  if (!labelOn && ((o.colors && o.colors.length) || (o.heroIds && o.heroIds.length))) {
    console.log("⚠️ 没有可用映射 → 颜色 / hero-ids 筛选自动失效，本次输出全部头像");
  }
  const nameOk = allJobs.filter((j) => {
    if (re && !re.test(j.name)) return false;
    j.meta = skinMap.get(j.name) || null;
    return true;
  });
  const picked = filterHeads(nameOk, { heroIds: useHeroIds, colors: useColors, rosterOnly: o.rosterOnly });
  const jobs = picked.jobs;
  if (o.limit) jobs.length = Math.min(jobs.length, o.limit);
  if (!jobs.length) {
    throw new Error("没有匹配到任何 heads/heroes/* 资源（筛选条件太窄？默认只拉红将，可用 --all / --color / --hero-ids 放宽）");
  }
  const scope = useHeroIds && useHeroIds.length ? `heroIds=${useHeroIds.join("/")}`
    : useColors && useColors.length ? `color=${useColors.slice().sort().join("/")}` : "不过滤";
  log(`目标 ${jobs.length} 个头像（${scope}）` +
    (picked.skipped.byColor ? `（颜色过滤掉 ${picked.skipped.byColor}）` : "") +
    (picked.skipped.byHeroId ? `（hero-ids 过滤掉 ${picked.skipped.byHeroId}）` : "") +
    (picked.skipped.unlabeled ? `（未标注过滤掉 ${picked.skipped.unlabeled}）` : ""));

  // ---------- 5) 每个头像的 SpriteFrame 描述 ----------
  const vImp = pairMap(cfg.versions.import);
  await pool(jobs, 8, async (j) => {
    const full = decodeUuid(cfg.uuids[j.idx]);
    const r = await req(`${CDN}icons/import/${full.slice(0, 2)}/${full}.${vImp[j.idx]}.json`);
    if (r.status !== 200) { j.err = "描述 HTTP " + r.status; return; }
    let jj;
    try { jj = JSON.parse(r.buf.toString("utf8")); } catch (e) { j.err = "描述解析失败"; return; }
    const tex = Array.isArray(jj[1]) ? jj[1][0] : null;
    const frame = (jj[5] && jj[5][0]) || null;
    if (!tex || !frame || !frame.rect) { j.err = "描述里缺 texture/rect"; return; }
    j.tex = tex;                                  // 图集的 uuid（可能是 9 位短形式）
    j.rect = frame.rect;
    j.rotated = !!frame.rotated;                  // ★ 旋转标记
  });
  const withDesc = jobs.filter((j) => j.tex && j.rect);
  {
    const bad = jobs.filter((j) => !j.tex || !j.rect);
    if (bad.length) {
      const why = {};
      for (const j of bad) why[j.err || "缺 texture/rect"] = (why[j.err || "缺 texture/rect"] || 0) + 1;
      log(`SpriteFrame 描述拿到 ${withDesc.length}/${jobs.length}，失败 ${bad.length}：` +
        Object.keys(why).map((w) => `${w}×${why[w]}`).join(" / ") +
        `\n  失败样例：${bad.slice(0, 6).map((j) => j.name).join(", ")}`);
    } else {
      log(`SpriteFrame 描述拿到 ${withDesc.length}/${jobs.length}`);
    }
  }

  // ---------- 6) 图集去重下载（默认不落盘，--cache 才复用） ----------
  const atlasKeys = new Set(withDesc.map((j) => j.tex));
  if (o.cache) fs.mkdirSync(ATLAS_CACHE, { recursive: true });
  const vNat = pairMap(cfg.versions.native);
  // 短 uuid → 索引（用完整 uuid 前缀匹配；cfg.uuids 里既有 22 位压缩也有 9 位短形式）
  const decoded = cfg.uuids.map((u) => decodeUuid(u));
  const findIdx = (short) => {
    for (let i = 0; i < decoded.length; i++) if (decoded[i].startsWith(short)) return i;
    return -1;
  };
  const atlasBuf = new Map();
  let cacheHit = 0;
  await pool([...atlasKeys], 4, async (short) => {
    const idx = findIdx(short);
    const nver = idx >= 0 ? vNat[idx] : null;
    if (!nver) { atlasBuf.set(short, null); return; }
    if (o.cache) {
      // 缓存名带版本号：图集重打包（uuid / 版本变）→ 自动失效，不会拿旧图错裁
      const cachePath = path.join(ATLAS_CACHE, `${short}.${nver}.png`);
      if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) { atlasBuf.set(short, fs.readFileSync(cachePath)); cacheHit++; return; }
    }
    const uuid = decoded[idx];
    const r = await req(`${CDN}icons/native/${uuid.slice(0, 2)}/${uuid}.${nver}.png`, { timeout: 60000 });
    if (r.status !== 200) { atlasBuf.set(short, null); return; }
    if (o.cache) fs.writeFileSync(path.join(ATLAS_CACHE, `${short}.${nver}.png`), r.buf);
    atlasBuf.set(short, r.buf);
  });
  const atlasDim = new Map();
  for (const [short, buf] of atlasBuf) {
    if (!buf) continue;
    try { atlasDim.set(short, decodePNG(buf)); } catch (e) { /* 坏图集跳过 */ }
  }
  const atlasBad = [...atlasKeys].filter((k) => !atlasDim.has(k));
  log(`图集就绪 ${atlasDim.size}/${atlasKeys.size} 张` + (o.cache ? `（缓存命中 ${cacheHit} 张 → ${path.relative(ROOT, ATLAS_CACHE)}）` : "") +
    (atlasBad.length ? `，缺 ${atlasBad.length} 张：${atlasBad.slice(0, 4).join(", ")}` : ""));

  // ---------- 7) 裁切 → 组装伪战报 ----------
  const battles = [];
  let bytes = 0, skipped = 0, tagged = 0;
  for (const j of withDesc) {
    const atlas = atlasDim.get(j.tex);
    if (!atlas) { skipped++; continue; }
    let crop;
    try { crop = cropSprite(atlas, j.rect, j.rotated); } catch (e) { skipped++; continue; }
    const png = encodePNG(crop.w, crop.h, crop.data);
    const b64 = png.toString("base64");
    const body = "data:image/png;base64," + b64;
    const hash = fnv1a(b64);
    const meta = j.meta || {};
    if (meta.heroId) tagged++;
    bytes += png.length;
    battles.push({
      ok: true,
      recordName: `HEADS/${j.name}.json`,
      attackType: 0,
      rowRoleId: meta.heroId || 0,
      rowName: meta.heroName ? meta.heroName + j.name.replace(/^[a-z_]+/, "") : j.name,
      // ★ 现拼现标的英雄 id（HeroConf.skinList 命中才有）
      heroId: meta.heroId || 0,
      heroName: meta.heroName || "",
      heroColor: meta.color || 0,   // 3=红 2=橙 1=紫
      skinId: meta.skinId || 0,
      skinPath: j.name,
      matchHow: meta.heroId ? "skin" : "", // "skin"=skinList 精确命中 / ""=没标上
      rotated: j.rotated || false,
      sponsor: { roleId: meta.heroId || 0, name: meta.heroName || j.name, heroIds: meta.heroId ? [meta.heroId] : [], teamInfo: [] },
      accept: { heroIds: [], teamInfo: [] },
      sponsorImages: { present: true, count: 1, items: [{ present: true, len: b64.length, hash }] },
      acceptImages: { present: false, count: 0, items: [] },
      sponsorEncryptedImages: [body],
      acceptEncryptedImages: [],
    });
  }

  const json = {
    exportedAt: new Date().toISOString(),
    source: "img2hero/fetch-hero-heads.cjs 英雄大头像图库（版本表/映射/图集全部现取）",
    bundleVers: { icons: bv.icons, config: bv.config },
    scope: {
      colors: useColors ? [...useColors].sort() : null,
      heroIds: useHeroIds && useHeroIds.length ? useHeroIds : null,
      rosterOnly: !!o.rosterOnly,
      labeled: labelOn,
    },
    count: battles.length,
    stats: {
      count: battles.length,
      bytes,
      mb: +(bytes / 1048576).toFixed(2),
      dropped: skipped,
      tagged,
      heroes: new Set(battles.filter((b) => b.heroId).map((b) => b.heroId)).size,
      colors: [...new Set(battles.map((b) => b.heroColor).filter(Boolean))].sort(),
      unlabeled: battles.length - tagged,
      rotated: battles.filter((b) => b.rotated).length,
    },
    battles,
  };
  return { json, stats: json.stats };
}

// ── 图库 HTML（按角色分组看图） ───────────────────────────────────────────────
/** 品质：3=红 / 2=橙 / 1=紫（0=未知，通常是没标上映射的） */
const QUALITY = { 3: { label: "红", cls: "q3" }, 2: { label: "橙", cls: "q2" }, 1: { label: "紫", cls: "q1" } };

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * 把图库 JSON 渲染成 HTML：**按角色分组**，每组列出该角色的全部皮肤。
 * 纯函数（不碰网络 / 磁盘），便于离线断言。
 * @param {object} json fetchHeads 的产物（读 json.battles）
 * @returns {string} HTML 文本
 */
function buildGalleryHtml(json) {
  const battles = (json && json.battles) || [];

  // ---- 按 heroId 归组（heroId=0 → 未标注一桶）；显示名取 heroName ----
  const groups = new Map();
  for (const b of battles) {
    const heroId = b.heroId || 0;
    const key = heroId ? "h" + heroId : "__unlabeled__";
    if (!groups.has(key)) {
      groups.set(key, { heroId, heroName: b.heroName || "", color: 0, skins: [] });
    }
    const g = groups.get(key);
    if (!g.heroName && b.heroName) g.heroName = b.heroName;
    if (!g.color && b.heroColor) g.color = b.heroColor;
    const pics = (b.sponsorImages && b.sponsorImages.items) || [];
    const srcs = b.sponsorEncryptedImages || [];
    g.skins.push({
      path: b.skinPath || "",
      skinId: b.skinId || 0,
      rotated: !!b.rotated,
      hash: (pics[0] && pics[0].hash) || "",
      src: srcs[0] || "",
    });
  }

  // ---- 排序：有 id 的在前 → 品质高在前 → heroId 升序；组内按皮肤 id 升序 ----
  const groupList = [...groups.values()];
  groupList.sort((a, b) => {
    if (!!a.heroId !== !!b.heroId) return a.heroId ? -1 : 1;
    if (a.heroId && b.heroId) {
      if ((b.color || 0) !== (a.color || 0)) return (b.color || 0) - (a.color || 0);
      return a.heroId - b.heroId;
    }
    return 0;
  });
  for (const g of groupList) {
    g.skins.sort((x, y) => (x.skinId - y.skinId) || String(x.path).localeCompare(String(y.path)));
  }

  const nHeroes = groupList.filter((g) => g.heroId).length;
  const nSkins = battles.length;
  const colorTally = {};
  for (const b of battles) if (b.heroColor) colorTally[b.heroColor] = (colorTally[b.heroColor] || 0) + 1;
  const tally = [3, 2, 1].filter((c) => colorTally[c])
    .map((c) => `<span class="pill ${QUALITY[c].cls}">${QUALITY[c].label} ${colorTally[c]}</span>`).join("");

  const q = (c) => QUALITY[c] || { label: "", cls: "" };
  const sections = groupList.map((g) => {
    const title = g.heroId
      ? `${escHtml(g.heroName || "?")} <span class="id">#${g.heroId}</span>`
      : `未标注 <span class="id">（没标上映射的皮肤）</span>`;
    const badge = g.color ? `<span class="pill ${q(g.color).cls}">${q(g.color).label}</span>` : "";
    const figs = g.skins.map((s) => {
      const img = s.src
        ? `<img src="${s.src}" loading="lazy" alt="${escHtml(s.path)}"${s.rotated ? ' class="rot"' : ""}>`
        : `<span class="miss">无图</span>`;
      return `<figure class="skin" title="${escHtml(s.path)}">${img}` +
        `<figcaption><code>${escHtml(s.path || "?")}</code>${s.skinId ? `<span>${s.skinId}</span>` : ""}</figcaption></figure>`;
    }).join("");
    return `<section><h2>${title} ${badge}<span class="n">${g.skins.length} 张</span></h2><div class="grid">${figs}</div></section>`;
  }).join("\n");

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>英雄皮肤图库（${nSkins} 张 / ${nHeroes} 英雄）</title>
<style>
 body{margin:0;padding:14px;background:#f5f6f8;color:#222;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}
 header{position:sticky;top:0;z-index:5;background:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.08);display:flex;gap:12px;flex-wrap:wrap;align-items:center}
 header b{font-size:15px}
 .pill{background:#eef2f6;border-radius:6px;padding:2px 9px;font-size:12px;color:#334}
 .pill b{color:#0e9f8e}
 .pill.q3{background:#fde8e8;color:#b3261e}.pill.q2{background:#fdf0dc;color:#92400e}.pill.q1{background:#efe7fd;color:#5b21b6}
 section{margin-top:16px}
 h2{font-size:15px;margin:0 0 8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
 h2 .id{color:#8892a4;font-weight:normal;font-size:12px}
 h2 .n{color:#667;font-weight:normal;font-size:12px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}
 .skin{margin:0;background:#fff;border:1px solid #e6eaf1;border-radius:8px;padding:5px;display:flex;flex-direction:column;align-items:center;gap:4px}
 .skin img{width:100%;height:64px;object-fit:contain;background:repeating-conic-gradient(#f6f7fa 0 25%,#eceff4 0 50%) 0 0/12px 12px;border-radius:5px;cursor:zoom-in;image-rendering:auto}
 figcaption{font-size:10px;color:#667;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 figcaption code{background:#eef2f6;border-radius:3px;padding:0 3px}
 .miss{display:flex;align-items:center;justify-content:center;height:64px;color:#c00;font-size:11px}
 #zoom{position:fixed;inset:0;background:rgba(15,18,24,.85);display:none;align-items:center;justify-content:center;z-index:9;cursor:zoom-out}
 #zoom img{max-width:94vw;max-height:94vh;image-rendering:pixelated;background:#fff;padding:6px;border-radius:8px}
</style></head><body>
<header>
 <b>英雄皮肤图库</b>
 <span class="pill">英雄 <b>${nHeroes}</b></span>
 <span class="pill">皮肤 <b>${nSkins}</b></span>
 ${tally}
 ${json && json.scope ? `<span class="pill">范围 <b>${escHtml(json.scope.colors ? "color=" + json.scope.colors.join("/") : json.scope.heroIds ? "heroIds=" + json.scope.heroIds.join("/") : "全部")}</b></span>` : ""}
 <span style="color:#8892a4;font-size:12px">按角色分组；点图放大</span>
</header>
${sections}
<div id="zoom"><img id="zoomImg" alt=""></div>
<script>document.addEventListener("click",function(e){var t=e.target;var z=document.getElementById("zoom");if(t.tagName==="IMG"&&t.parentNode&&t.parentNode.className==="skin"){document.getElementById("zoomImg").src=t.src;z.style.display="flex"}else if(z.style.display==="flex"){z.style.display="none"}});</script>
</body></html>`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
/** "101-122,201" → [101..122, 201] */
function parseNumList(spec) {
  const out = [];
  for (const part of String(spec).split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); } else out.push(+t);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const has = (n) => argv.includes(n);

  const out = path.resolve(flag("--out", DEFAULT_OUT));
  // 默认只拉红将（color 3）；--all 关掉颜色过滤；--hero-ids 优先于颜色
  const colors = has("--all") ? null : parseNumList(flag("--color", String(RED_COLOR)));
  const heroIds = has("--hero-ids") ? parseNumList(flag("--hero-ids", "")) : null;

  console.log("img2hero 英雄头像图库 —— 现取版本表 / 现拼映射 / 现下图集");
  console.log(colors ? `筛选：品质 color=${colors.join("/")}${colors.length === 1 && colors[0] === RED_COLOR ? "（红将，默认）" : ""}`
    : heroIds ? `筛选：heroIds=${heroIds.join("/")}` : "筛选：不过滤（--all）");
  const { json, stats } = await fetchHeads({
    vers: flag("--vers", null) || null,
    filter: flag("--filter", null) || null,
    limit: flag("--limit", null) ? +flag("--limit") : 0,
    colors,
    rosterOnly: has("--roster-only"),
    noLabel: has("--no-label"),
    heroIds,
    cache: has("--cache"),
    quiet: has("--quiet"),
  });

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(json), "utf8");
  console.log("");
  console.log(`图库 → ${out}`);

  // 同目录同名 .html：按角色分组看图（--no-html 关，--html <路径> 换位置）
  let htmlOut = null;
  if (!has("--no-html")) {
    htmlOut = path.resolve(flag("--html", out.replace(/\.json$/i, "") + ".html"));
    fs.mkdirSync(path.dirname(htmlOut), { recursive: true });
    fs.writeFileSync(htmlOut, buildGalleryHtml(json), "utf8");
    const heroes = new Set(json.battles.filter((b) => b.heroId).map((b) => b.heroId)).size;
    console.log(`图库 HTML → ${htmlOut}（按角色 ${heroes} 组）`);
  }
  console.log(
    `  ${stats.count} 张 / ${stats.mb} MB / 标到 heroId ${stats.tagged}（${stats.heroes} 个英雄）/ 未标注 ${stats.unlabeled}` +
      ` / 品质 ${stats.colors.length ? stats.colors.join("/") : "无"}` +
      ` / 旋转图块 ${stats.rotated}${stats.dropped ? " / 跳过 " + stats.dropped : ""}`
  );
  console.log(`  可直接喂给：node src/utils/img2hero/hero-feature-builder.cjs --features ${path.relative(ROOT, out)}`);
}

module.exports = { fetchHeads, buildSkinMap, filterHeads, buildGalleryHtml, normalizeSkinPath, decodeUuid, cropSprite, fetchBundleVers, parseNumList, RED_COLOR };

if (require.main === module) {
  main().catch((e) => { console.error("失败:", (e && e.message) || e); process.exitCode = 1; });
}
