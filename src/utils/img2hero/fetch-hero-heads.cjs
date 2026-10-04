#!/usr/bin/env node
/* ============================================================================
 * 英雄大头像图库 —— 从游戏 CDN 下载，导出成「伪战报」JSON
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * heads/heroes/<皮肤名> 在游戏资源里是 cc.SpriteFrame（图集子图），bundle 里
 * 没有独立 PNG：必须「拉 SpriteFrame 描述 → 拿图集 → 按 rect 裁」。
 * 本工具把这套流程封起来，产物直接是 hero-feature-builder.cjs --features 能吃的伪战报格式，
 * 于是「下载图库 → 逐图提特征 → 生成识别器」可以一条链跑通。
 *
 * ── 自动标英雄 id ──────────────────────────────────────────────────────────
 * 资源名是拼音（guanyu6），本身不带 id。映射来源：
 *   ① --skins 给的名单（默认 .workbuddy/red-hero-skins.json）
 *      形如 [{ id, nickName, skins:[{ id, path }] }]，path 就是 heads 里的皮肤名
 *      → 精确命中即可标出 heroId / 中文名；命中不了的（非名单英雄）留空。
 *   ② 标到的 id 会写进 battle.heroId / battle.sponsor.heroIds，
 *      连同 rowName（中文名+皮肤序号）方便人工核对。
 *
 * ── ⚠️ 裁切的两个坑（都在 cropSprite 里处理了）────────────────────────────
 *   1. rect 的 y 就是 PNG 的左上原点，**不要翻转**（按 cocos 惯例翻会静默裁到别的图块）
 *   2. frame 里可能带 "rotated":1 —— 图块是「宽高互换 + 顺时针转 90°」存的，
 *      必须裁 [x,y,w→h,h→w] 再逆时针转回来，否则会跨过两个图块
 *
 * ── 用法 ──────────────────────────────────────────────────────────────────
 *   node src/utils/img2hero/fetch-hero-heads.cjs [选项]
 *
 *   --out <路径>     输出 JSON（默认 .workbuddy/hero-heads.json）
 *   --vers <路径>    bundle 版本表（默认 .workbuddy/_bundlevers.json）
 *   --skins <路径>   皮肤→英雄 id 映射表（默认 .workbuddy/red-hero-skins.json，可 --no-skins 关闭）
 *   --filter <正则>  只处理匹配的皮肤名，如 --filter "^guanyu"
 *   --limit <N>      最多处理 N 个
 *   --all            拉图库里【全部】255 个头像（默认只拉英雄名单里的，即 22 红将 / 178 个）
 *   --force          即使输出已存在也重新下载
 *   --quiet          少说话
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { decodePNG, encodePNG } = require("./pnglite.cjs");

const ROOT = path.join(__dirname, "..", "..", ".."); // src/utils/img2hero → 仓库根
const CDN = "https://xxz-xyzw-res.hortorgames.com/remote/";
const PREFIX = "heads/heroes/";                       // 只要这套（small_heads / bodies 是独立图，不需要裁）
const DEFAULT_VERS = path.join(ROOT, ".workbuddy", "_bundlevers.json");
const DEFAULT_SKINS = path.join(ROOT, ".workbuddy", "red-hero-skins.json");
const DEFAULT_ROSTER = path.join(ROOT, ".workbuddy", "hero-roster.json"); // { roster: [{id, name}] } —— 中文名在这
const DEFAULT_OUT = path.join(ROOT, ".workbuddy", "hero-heads.json");
const ATLAS_CACHE = path.join(ROOT, ".workbuddy", "_atlas-cache");

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

function req(url, timeoutMs) {
  return new Promise((resolve) => {
    const r = https.get(url, { headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0" } }, (x) => {
      const c = [];
      x.on("data", (d) => c.push(d));
      x.on("end", () => resolve({ status: x.statusCode, buf: Buffer.concat(c) }));
    });
    r.on("error", () => resolve({ status: -1, buf: Buffer.alloc(0) }));
    r.setTimeout(timeoutMs || 30000, () => r.destroy());
  });
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
 * @param {string} [opts.vers]   bundle 版本表路径
 * @param {string} [opts.skins]  皮肤→英雄映射表路径；传空字符串表示不要映射
 * @param {string} [opts.filter] 皮肤名正则
 * @param {number} [opts.limit]
 * @param {boolean} [opts.all]   是否拉全部（默认只拉名单里的英雄）
 * @param {boolean} [opts.quiet]
 * @returns {Promise<{json:object, stats:object}>}
 */
async function fetchHeads(opts) {
  const o = opts || {};
  const log = o.quiet ? () => {} : (...a) => console.log(...a);

  // ---------- 1) 版本表 ----------
  const versPath = o.vers || DEFAULT_VERS;
  if (!fs.existsSync(versPath)) {
    throw new Error(`找不到 bundle 版本表：${versPath}\n` +
      `（它来自 POST /login/manifest 的 body.bundleVers；也可以直接改成本地已有的同名文件）`);
  }
  const bver = readJson(versPath);
  const iconsVer = bver.icons;
  if (!iconsVer) throw new Error(`${versPath} 里没有 icons 字段`);

  // ---------- 2) 皮肤名 → 英雄 id 映射 ----------
  // 中文名单独取自 hero-roster.json —— red-hero-skins.json 里的 nickName 是 "hero_101" 这种占位串
  const nameById = new Map();
  if (fs.existsSync(DEFAULT_ROSTER)) {
    const rj = readJson(DEFAULT_ROSTER);
    for (const r of rj.roster || []) nameById.set(r.id, r.name);
  }

  const skinMap = new Map();     // 皮肤名（精确，如 guanyu6） → { heroId, heroName, skinId }
  const baseToHero = new Map();  // 拼音前缀（如 guanyu） → { heroId, heroName }，用于覆盖映射表没收录的英雄
  const skinsPath = o.skins === undefined ? DEFAULT_SKINS : o.skins;
  if (skinsPath && fs.existsSync(skinsPath)) {
    const roster = readJson(skinsPath);
    for (const h of Array.isArray(roster) ? roster : []) {
      const cn = nameById.get(h.id) || "";
      for (const sk of h.skins || []) {
        if (!sk.path) continue;
        skinMap.set(sk.path, { heroId: h.id, heroName: cn, skinId: sk.id });
        const base = sk.path.replace(/[0-9_]+$/, "");
        if (base && !baseToHero.has(base)) baseToHero.set(base, { heroId: h.id, heroName: cn });
      }
    }
    log(`英雄 id 映射：${skinMap.size} 个皮肤 / ${baseToHero.size} 个拼音前缀，中文名 ${nameById.size} 个`);
  } else {
    log("英雄 id 映射：无（不会自动标 heroId）");
  }

  // ---------- 3) 拉 icons 包的 config ----------
  const cfgRes = await req(CDN + `icons/config.${iconsVer}.json`);
  if (cfgRes.status !== 200) throw new Error(`icons/config.${iconsVer}.json HTTP ${cfgRes.status}`);
  const cfg = JSON.parse(cfgRes.buf.toString("utf8"));
  const vImp = {}, vNat = {};
  const vi = cfg.versions.import || []; for (let i = 0; i < vi.length; i += 2) vImp[vi[i]] = vi[i + 1];
  const vn = cfg.versions.native || []; for (let i = 0; i < vn.length; i += 2) vNat[vn[i]] = vn[i + 1];
  log(`icons config：${(cfgRes.buf.length / 1024).toFixed(0)}KB，${Object.keys(cfg.paths).length} 个资源`);

  // ---------- 4) 挑出目标 ----------
  const re = o.filter ? new RegExp(o.filter) : null;
  // ★ 默认只拉「英雄名单里的」（红将）；--all 才拉全部。
  //   名单为空（--no-skins 或没读到映射）时退化成全部，免得一张都拉不到。
  const onlyRoster = !o.all && skinMap.size > 0;
  const jobs = [];
  let skippedByRoster = 0;
  for (const k of Object.keys(cfg.paths)) {
    const spec = cfg.paths[k];
    if (!Array.isArray(spec) || typeof spec[0] !== "string" || !spec[0].startsWith(PREFIX)) continue;
    const name = spec[0].slice(PREFIX.length);
    if (re && !re.test(name)) continue;
    // 名单里可能写在「皮肤名」上（如 dianwei2_1），而图集里是去掉 _1 的 dianwei2
    // —— 所以精确撞不上时，还要看拼音前缀在不在名单里
    if (onlyRoster && !skinMap.has(name) && !baseToHero.has(name.replace(/[0-9_]+$/, ""))) { skippedByRoster++; continue; }
    jobs.push({ name, idx: +k });
  }
  jobs.sort((a, b) => a.name.localeCompare(b.name));
  if (o.limit) jobs.length = Math.min(jobs.length, o.limit);
  if (!jobs.length) throw new Error("没有匹配到任何 heads/heroes/* 资源");
  log(onlyRoster
    ? `目标 ${jobs.length} 个头像（名单内的红将皮肤；另有 ${skippedByRoster} 个非名单英雄已跳过，--all 可全拉）`
    : `目标 ${jobs.length} 个头像（全部）`);

  // ---------- 5) 每个头像的 SpriteFrame 描述 ----------
  await pool(jobs, 8, async (j) => {
    const uuidC = cfg.uuids[j.idx];
    const full = decodeUuid(uuidC);
    const ver = vImp[j.idx];
    const r = await req(CDN + `icons/import/${full.slice(0, 2)}/${full}.${ver}.json`);
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
  log(`SpriteFrame 描述拿到 ${withDesc.length}/${jobs.length}${jobs.length - withDesc.length ? "（失败的会跳过）" : ""}`);

  // ---------- 6) 图集去重下载 + 缓存 ----------
  const atlasKeys = new Set(withDesc.map((j) => j.tex));
  fs.mkdirSync(ATLAS_CACHE, { recursive: true });
  // 短 uuid → 索引（用完整 uuid 前缀匹配；cfg.uuids 里既有 22 位压缩也有 9 位短形式）
  const decoded = cfg.uuids.map((u) => decodeUuid(u));
  const findIdx = (short) => {
    for (let i = 0; i < decoded.length; i++) if (decoded[i].startsWith(short)) return i;
    return -1;
  };
  const atlasBuf = new Map();
  await pool([...atlasKeys], 4, async (short) => {
    const cachePath = path.join(ATLAS_CACHE, short + ".png");
    if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) { atlasBuf.set(short, fs.readFileSync(cachePath)); return; }
    const idx = findIdx(short);
    const nver = idx >= 0 ? vNat[idx] : null;
    if (!nver) { atlasBuf.set(short, null); return; }
    const uuid = decoded[idx];
    const r = await req(CDN + `icons/native/${uuid.slice(0, 2)}/${uuid}.${nver}.png`, 60000);
    if (r.status !== 200) { atlasBuf.set(short, null); return; }
    fs.writeFileSync(cachePath, r.buf);
    atlasBuf.set(short, r.buf);
  });
  const atlasDim = new Map();
  for (const [short, buf] of atlasBuf) {
    if (!buf) continue;
    try { atlasDim.set(short, decodePNG(buf)); } catch (e) { /* 坏图集跳过 */ }
  }
  log(`图集就绪 ${atlasDim.size}/${atlasKeys.size} 张（缓存于 ${path.relative(ROOT, ATLAS_CACHE)}）`);

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
    // 两级：先精确撞皮肤名；撞不上再退到拼音前缀（图库固定 255 个，映射表只覆盖部分英雄）
    let meta = skinMap.get(j.name);
    let matchHow = meta ? "skin" : "";
    if (!meta) {
      meta = baseToHero.get(j.name.replace(/[0-9_]+$/, ""));
      matchHow = meta ? "base" : "";
    }
    if (!meta) meta = {};
    if (meta.heroId) tagged++;
    bytes += png.length;
    battles.push({
      ok: true,
      recordName: `HEADS/${j.name}.json`,
      attackType: 0,
      rowRoleId: meta.heroId || 0,
      rowName: meta.heroName ? meta.heroName + j.name.replace(/^[a-z_]+/, "") : j.name,
      // ★ 自动标上的英雄 id（有映射才有）
      heroId: meta.heroId || 0,
      heroName: meta.heroName || "",
      skinId: meta.skinId || 0,
      skinPath: j.name,
      matchHow, // "skin"=皮肤名精确命中 / "base"=拼音前缀推断 / ""=没标上
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
    source: "img2hero/fetch-hero-heads.cjs 英雄大头像图库",
    count: battles.length,
    stats: { count: battles.length, bytes, mb: +(bytes / 1048576).toFixed(2), dropped: skipped, tagged, rotated: battles.filter((b) => b.rotated).length },
    battles,
  };
  return { json, stats: json.stats };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const has = (n) => argv.includes(n);

  const out = path.resolve(flag("--out", DEFAULT_OUT));
  if (fs.existsSync(out) && !has("--force")) {
    const old = readJson(out);
    console.log(`已存在（--force 可重下）：${out}`);
    console.log(`  ${old.count} 张，标到 heroId 的 ${old.stats && old.stats.tagged != null ? old.stats.tagged : "?"} 个，${old.stats ? old.stats.mb : "?"} MB`);
    return;
  }

  const { json, stats } = await fetchHeads({
    vers: flag("--vers", DEFAULT_VERS),
    skins: has("--no-skins") ? "" : flag("--skins", DEFAULT_SKINS),
    filter: flag("--filter", null) || null,
    limit: flag("--limit", null) ? +flag("--limit") : 0,
    all: has("--all"),
    quiet: has("--quiet"),
  });

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(json), "utf8");
  console.log("");
  console.log(`图库 → ${out}`);
  console.log(`  ${stats.count} 张 / ${stats.mb} MB / 其中自动标上 heroId ${stats.tagged} 个 / 旋转图块 ${stats.rotated} 个${stats.dropped ? " / 跳过 " + stats.dropped : ""}`);
  console.log(`  可直接喂给：node src/utils/img2hero/hero-feature-builder.cjs --features ${path.relative(ROOT, out)}`);
}

module.exports = { fetchHeads };

if (require.main === module) {
  main().catch((e) => { console.error("失败:", (e && e.message) || e); process.exitCode = 1; });
}
