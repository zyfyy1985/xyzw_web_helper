#!/usr/bin/env node
/* ============================================================================
 * 识别器校验 —— 拿「盐场收集图」当测试数据，逐张过 public/game/features/heroImageMatcher.js
 *
 * 做什么：
 *   1) 校验生成的识别器本身是否正常（清单式，任何一条不过就退出码 1）：
 *        · 能被加载出 window.__HERO_IMG_MATCH__，且有 identifyFeature / distFeature / table
 *        · 表非空；stats().featureVersion / dims 与模板 FEATURE 块一致（算法没漂）
 *        · 特征库的 featureVersion / dims 与模板一致
 *        · 表里每条 feat 长度 = FW*FH*3，且能在特征库回查到是哪张图（hash/skinPath）
 *        · ★ 自检：自己按「最近邻」重扫一遍表，结果必须与识别器自己的 identifyFeature 一致
 *          （不一致 = 识别器实现有 bug，而不是测试数据的问题）
 *   2) 逐张识别测试图（默认 .workbuddy/盐场收集图.json），带出 top1 / 次选 / dist / margin
 *   3) 出一张 HTML：每行 **左＝原图（盐场收集图）** → **右＝识别结果命中的库原图**，
 *      并列出 dist / margin / 次选（第 2、3 名**不同英雄**，只列文字）；margin<5 的标「存疑」，
 *      最可疑的排前面。同时在控制台打印**平均每张图的识别耗时**（解码+提特征 / 匹配 分开计）。
 *
 * 用法：
 *   node src/utils/img2hero/verify-matcher.cjs [测试数据.json] [选项]
 *
 *   --out <路径>      HTML 输出（默认 .workbuddy/盐场识别校验.html）
 *   --matcher <路径>  识别器（默认 public/game/features/heroImageMatcher.js）
 *   --feats <路径>    特征库（默认 .workbuddy/hero-features.json）—— 用来回查命中的是哪张库图
 *   --lib <路径>      图库（默认 .workbuddy/hero-heads.json）—— 提供库原图 dataURL
 *   --limit <N>       只验前 N 张（快速冒烟）
 *
 * 退出码：0 = 识别器自检全过；1 = 有硬问题（加载/版本/自检不一致）。
 *        单张图识别不出（解码失败等）只计数、不失败。
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { decodePNG, encodeRGBFromRGBA } = require("./pnglite.cjs");

const ROOT = path.join(__dirname, "..", "..", ".."); // src/utils/img2hero → 仓库根
const TEMPLATE = path.join(__dirname, "hero-image-matcher.template.js");
const DEFAULT_MATCHER = path.join(ROOT, "public", "game", "features", "heroImageMatcher.js");
const DEFAULT_FEATS = path.join(ROOT, ".workbuddy", "hero-features.json");
const DEFAULT_LIB = path.join(ROOT, ".workbuddy", "hero-heads.json");
// 测试数据：优先本体目录（跟脚本放一起），退回 .workbuddy
const TESTS_HERE = path.join(__dirname, "盐场收集图.json");
const TESTS_BUDDY = path.join(ROOT, ".workbuddy", "盐场收集图.json");
const DEFAULT_TESTS = fs.existsSync(TESTS_HERE) ? TESTS_HERE : TESTS_BUDDY;
const DEFAULT_OUT = path.join(ROOT, ".workbuddy", "盐场识别校验.html");

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// 位置参数（测试数据路径）= 不是 --flag、也不是带值 flag 的取值
const VALUE_FLAGS = ["--out", "--matcher", "--feats", "--lib", "--limit"];
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) { if (VALUE_FLAGS.includes(a)) i++; continue; }
  positional.push(a);
}
const TEST_PATH = positional[0] || DEFAULT_TESTS;
const OUT = path.resolve(flag("--out", DEFAULT_OUT));
const MATCHER = path.resolve(flag("--matcher", DEFAULT_MATCHER));
const FEATS = path.resolve(flag("--feats", DEFAULT_FEATS));
const LIB = path.resolve(flag("--lib", DEFAULT_LIB));
const LIMIT = +flag("--limit", "0") || 0;

// ── 校验清单 ────────────────────────────────────────────────────────────────
const checklist = [];
function check(name, ok, detail) {
  checklist.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) });
  return !!ok;
}

// ── 加载识别器 / FEATURE 块 ─────────────────────────────────────────────────
/*
 * ★ 用 runInThisContext（**当前 realm**）而不是 runInNewContext：
 *   代码本体逐字节不变（`window` / `atob` 当参数注入），结果完全一致，但是
 *   Node 的 vm 新 context 不会 JIT 识别器里那种紧循环 —— 实测同一次全表比对
 *   在新 context 里要 ~110ms，在主 realm 只要 ~1.1ms（差 100×）。
 *   换过来有两个好处：① 脚本快几十倍；② 控制台报的「识别耗时」是算法真实成本，
 *   而不是 vm 沙箱开销（浏览器里识别器就跑在主 realm，跟这里的口径一致）。
 */
function loadMatcher(file) {
  const src = fs.readFileSync(file, "utf8");
  const w = {};
  const atobFn = (x) => Buffer.from(x, "base64").toString("binary");
  vm.runInThisContext(`(function(window, atob){${src}\n})`, { filename: path.basename(file) })(w, atobFn);
  return w.__HERO_IMG_MATCH__ || null;
}

/** 从模板抽 FEATURE 块原样执行 → 提特征用的 featureOfRGBA（与识别器逐字节同源） */
function loadFeatureBlock() {
  const t = fs.readFileSync(TEMPLATE, "utf8");
  const b = t.indexOf("/*==FEATURE-BEGIN==*/"), e = t.indexOf("/*==FEATURE-END==*/");
  if (b < 0 || e < 0) throw new Error("模板缺 FEATURE 哨兵");
  return vm.runInThisContext(
    `(function(){${t.slice(b, e)}\nreturn { featureOfRGBA: featureOfRGBA, distFeature: distFeature, featureVersion: FEATURE_VERSION, FW: FW, FH: FH };})()`,
    { filename: path.basename(TEMPLATE) }
  );
}

// ── 小工具 ──────────────────────────────────────────────────────────────────
const bodyOf = (src) => (src.startsWith("data:") ? src.slice(src.indexOf(",") + 1) : src);
const decodeSrc = (src) => decodePNG(Buffer.from(bodyOf(src), "base64"));
const b64ToU8 = (b64) => new Uint8Array(Buffer.from(b64, "base64"));
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 库原图 → 显示用白底 RGB 缩略图（最近邻）。库图 183×118 ≈ 盐场图 2×，缩到 92×60 后两边可直接对看 */
const THUMB_W = 92, THUMB_H = 60;
const thumbCache = new Map();
function thumbOf(src) {
  if (thumbCache.has(src)) return thumbCache.get(src);
  let uri = null;
  try {
    const img = decodeSrc(src);
    const out = Buffer.alloc(THUMB_W * THUMB_H * 4);
    for (let y = 0; y < THUMB_H; y++) {
      const sy = Math.min(img.h - 1, Math.floor((y * img.h) / THUMB_H));
      for (let x = 0; x < THUMB_W; x++) {
        const sx = Math.min(img.w - 1, Math.floor((x * img.w) / THUMB_W));
        const s = (sy * img.w + sx) * 4, d = (y * THUMB_W + x) * 4;
        out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3];
      }
    }
    uri = "data:image/png;base64," + encodeRGBFromRGBA(THUMB_W, THUMB_H, out).toString("base64");
  } catch (e) { /* 坏图集 → 交给调用方走占位 */ }
  thumbCache.set(src, uri);
  return uri;
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
function main() {
  console.log("识别器校验 —— 盐场收集图逐张识别 + 原图/结果图对照\n");

  // ① 识别器
  let API = null;
  try { API = loadMatcher(MATCHER); } catch (e) { /* 下面记失败 */ }
  check("识别器可加载出 window.__HERO_IMG_MATCH__", !!(API && API.identifyFeature && API.distFeature && API.table), API ? "API ok" : "加载失败 / 缺 API");
  if (!API || !API.identifyFeature) {
    report(); console.error("\n致命：识别器不可用，后续步骤无法进行。");
    process.exitCode = 1; return;
  }
  check("识别表非空", API.table.length > 0, `${API.table.length} 条`);

  // ② 模板 FEATURE 块（提特征用；也是算法版本的真源）
  const FB = loadFeatureBlock();
  const st = API.stats ? API.stats() : {};
  check("识别器 featureVersion 与模板一致", st.featureVersion === FB.featureVersion, `识别器=${st.featureVersion} 模板=${FB.featureVersion}`);
  check("识别器 dims 与模板一致", Array.isArray(st.dims) && st.dims[0] === FB.FW && st.dims[1] === FB.FH, `${JSON.stringify(st.dims)} vs [${FB.FW},${FB.FH}]`);

  // ③ 特征库 / 图库
  const feats = JSON.parse(fs.readFileSync(FEATS, "utf8"));
  const lib = JSON.parse(fs.readFileSync(LIB, "utf8"));
  check("特征库 featureVersion 与模板一致", feats.featureVersion === FB.featureVersion, `特征库=${feats.featureVersion} 模板=${FB.featureVersion}`);
  check("特征库 dims 与模板一致", Array.isArray(feats.dims) && feats.dims[0] === FB.FW && feats.dims[1] === FB.FH, `${JSON.stringify(feats.dims)}`);

  // feat → 特征库条目（回查是哪张库图）；hash → dataURL
  const entryOfFeat = new Map((feats.entries || []).map((e) => [e.feat, e]));
  const srcOfHash = new Map();
  const baseSrcOfHero = new Map(); // heroId → 兜底库图（没有精确命中条目时用）
  for (const b of lib.battles || []) {
    const pics = (b.sponsorImages && b.sponsorImages.items) || [];
    const srcs = b.sponsorEncryptedImages || [];
    pics.forEach((it, i) => { if (it && it.hash && srcs[i]) srcOfHash.set(it.hash, srcs[i]); });
    if (b.heroId && srcs[0] && !baseSrcOfHero.has(b.heroId)) baseSrcOfHero.set(b.heroId, srcs[0]);
  }

  const FEAT_LEN = FB.FW * FB.FH * 3;
  const dp = API.table.map((e) => {
    const u8 = b64ToU8(e.feat);
    return { heroId: e.heroId, heroName: e.heroName, u8, entry: entryOfFeat.get(e.feat) || null };
  });
  check("表里每条 feat 长度 = FW*FH*3", dp.every((d) => d.u8.length === FEAT_LEN), `期望 ${FEAT_LEN}`);
  const noEntry = dp.filter((d) => !d.entry).length;
  check("表里每条都能回查到库原图（特征库/图库同源）", noEntry === 0, noEntry ? `${noEntry}/${dp.length} 条查不到` : `全部 ${dp.length} 条可回查`);

  // ④ 测试数据
  const raw = JSON.parse(fs.readFileSync(TEST_PATH, "utf8"));
  let items = Array.isArray(raw.images) ? raw.images
    : (raw.battles || []).map((b) => ({ hash: b.sponsorImages && b.sponsorImages.items && b.sponsorImages.items[0] && b.sponsorImages.items[0].hash, src: (b.sponsorEncryptedImages || [])[0] }));
  items = items.filter((it) => it && it.src);
  if (LIMIT) items = items.slice(0, LIMIT);
  check("测试数据非空", items.length > 0, `${path.basename(TEST_PATH)} → ${items.length} 张`);
  if (!items.length) { report(); process.exitCode = 1; return; }

  // ⑤ 逐张识别（顺带计时：解码+提特征 / 匹配 分开算）
  const rows = [];
  let badDecode = 0, selfMismatch = 0;
  let tDecode = 0n, tMatch = 0n, tSlow = 0n;
  const T0 = process.hrtime.bigint();
  for (const it of items) {
    const tImg = process.hrtime.bigint();
    let s = tImg, feat = null, decoded = true;
    try { const img = decodeSrc(it.src); feat = FB.featureOfRGBA(img.data, img.w, img.h); }
    catch (e) { decoded = false; }
    tDecode += process.hrtime.bigint() - s;
    if (!decoded) { badDecode++; rows.push({ src: it.src, err: "解码失败" }); continue; }

    s = process.hrtime.bigint();
    const official = API.identifyFeature(feat);

    // 自检：自己按最近邻重扫一遍（用识别器自己的 distFeature），结果必须与官方一致
    // 同时按「英雄」聚合各家的最小距离 → 用来排「次选」（同英雄的多张皮肤只算最有代表性的一张）
    let b1 = null, d1 = Infinity, d2 = Infinity;
    const perHero = new Map();
    for (const d of dp) {
      const x = API.distFeature(feat, d.u8);
      if (x < d1) { d2 = d1; d1 = x; b1 = d; }
      else if (x < d2) { d2 = x; }
      const h = perHero.get(d.heroId);
      if (!h || x < h.d) perHero.set(d.heroId, { heroId: d.heroId, heroName: d.heroName, d: x });
    }
    tMatch += process.hrtime.bigint() - s;

    const agree = !!(official && b1 && official.heroId === b1.heroId);
    if (!agree) selfMismatch++;

    const margin = isFinite(d2) ? d2 - d1 : Infinity;
    // 识别结果对应的库原图：首选精确命中的那条 → 回查 hash → dataURL；否则用该英雄的基础库图
    const hitSrc = (b1 && b1.entry && srcOfHash.get(b1.entry.hash)) || (b1 && baseSrcOfHero.get(b1.heroId)) || null;
    // 次选（第 2/3 名的**不同英雄**）：只出文字档（名字 + d）
    const alts = [...perHero.values()].sort((a, b) => a.d - b.d).slice(1, 3)
      .map((a) => ({ heroId: a.heroId, heroName: a.heroName, d: +a.d.toFixed(1) }));
    const per = process.hrtime.bigint() - tImg;
    if (per > tSlow) tSlow = per;
    rows.push({
      src: it.src,
      hash: it.hash || "",
      heroId: official ? official.heroId : 0,
      heroName: official ? official.heroName : "",
      skinPath: (b1 && b1.entry && b1.entry.skinPath) || "",
      dist: +d1.toFixed(2),
      margin: isFinite(margin) ? +margin.toFixed(2) : null,
      hitSrc,
      alts,
      agree,
      exact: !!(b1 && b1.entry),
    });
  }
  const tAll = process.hrtime.bigint() - T0;
  const done = rows.filter((r) => !r.err);
  check("自检：自算最近邻与 identifyFeature 结果一致", selfMismatch === 0, selfMismatch ? `${selfMismatch} 张不一致` : `${done.length}/${done.length} 一致`);

  // ⑥ HTML：最可疑的（margin 小）排前面
  const doubt = done.filter((r) => r.margin != null && r.margin < 5).length;
  done.sort((a, b) => (a.margin == null ? Infinity : a.margin) - (b.margin == null ? Infinity : b.margin));
  const nHero = new Set(done.map((r) => r.heroId)).size;
  const nExact = done.filter((r) => r.exact).length;

  const cards = rows.map((r) => {
    if (r.err) {
      return `<div class="card err"><div class="img missing">原图</div><span class="arrow">→</span><div class="img missing">${esc(r.err)}</div></div>`;
    }
    const thumb = r.hitSrc ? thumbOf(r.hitSrc) : null;
    const right = thumb
      ? `<img class="img top1" loading="lazy" src="${thumb}" title="${esc(r.skinPath)}">`
      : `<div class="img missing">库中无对应原图</div>`;
    // 次选只列文字档（不带图）
    const altTxt = (r.alts || []).length
      ? `<div class="alt">` + r.alts.map((a, i) => `次选${i + 2} ${esc(a.heroName || "?")} d=${a.d}`).join("　") + `</div>`
      : "";
    const cls = r.margin != null && r.margin < 5 ? "doubt" : r.margin != null && r.margin >= 10 ? "ok" : "";
    return `<div class="card ${cls}">` +
      `<img class="img salt" loading="lazy" src="${r.src}" title="原图">` +
      `<span class="arrow">→</span>${right}` +
      `<div class="info"><b>${esc(r.heroName || "?")}</b>#${r.heroId} · <code>${esc(r.skinPath || "?")}</code>` +
      `　d=${r.dist}　margin=${r.margin == null ? "∞" : r.margin}${r.margin != null && r.margin < 5 ? '　<span class="tag">存疑</span>' : ""}` +
      altTxt +
      `<div class="meta">${r.exact ? "命中库图" : "命中英雄（无精确库图，回退基础图）"}${r.hash ? ` · hash <code>${esc(r.hash)}</code>` : ""}${r.agree ? "" : ' · <span class="tag">自检不一致</span>'}</div></div>` +
      `</div>`;
  }).join("\n");

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>识别器校验（${done.length} 张）</title>
<style>
 body{margin:0;padding:14px;background:#f5f6f8;color:#222;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}
 header{position:sticky;top:0;z-index:5;background:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.08);display:flex;gap:12px;flex-wrap:wrap;align-items:center}
 header b{font-size:15px}
 .pill{background:#eef2f6;border-radius:6px;padding:2px 9px;font-size:12px;color:#334}
 .pill b{color:#0e9f8e}.pill.bad{background:#fde8e8;color:#b3261e}
 .card{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #e6eaf1;border-left:4px solid #cbd5e1;border-radius:10px;padding:8px;margin-bottom:8px}
 .card.ok{border-left-color:#16a34a}.card.doubt{border-left-color:#f59e0b;background:#fffbeb}.card.err{border-left-color:#dc2626;background:#fef2f2}
 .img{width:92px;height:60px;object-fit:contain;background:repeating-conic-gradient(#f6f7fa 0 25%,#eceff4 0 50%) 0 0/14px 14px;border-radius:6px;cursor:zoom-in}
 .img.missing{display:flex;align-items:center;justify-content:center;color:#c00;font-size:11px;cursor:default;background:#f6f7fa}
 .arrow{color:#94a3b8;font-size:16px}
 .info{flex:1;min-width:0}.info code{background:#eef2f6;border-radius:4px;padding:0 4px}
 .alt{color:#667;font-size:12px;margin-top:2px}
 .meta{color:#94a3b8;font-size:11px;margin-top:2px}
 .tag{background:#f59e0b;color:#fff;border-radius:4px;padding:0 5px;font-size:11px}
 #zoom{position:fixed;inset:0;background:rgba(15,18,24,.85);display:none;align-items:center;justify-content:center;z-index:9;cursor:zoom-out}
 #zoom img{max-width:94vw;max-height:94vh;image-rendering:pixelated;background:#fff;padding:6px;border-radius:8px}
</style></head><body>
<header>
 <b>识别器校验</b>
 <span class="pill">测试图 <b>${done.length}</b></span>
 <span class="pill">命中英雄 <b>${nHero}</b></span>
 <span class="pill ${doubt ? "bad" : ""}">存疑 margin&lt;5 <b>${doubt}</b></span>
 ${badDecode ? `<span class="pill bad">解码失败 <b>${badDecode}</b></span>` : ""}
 <span class="pill">自检一致 <b>${done.length - selfMismatch}/${done.length}</b></span>
 <span class="pill">精确命中库图 <b>${nExact}/${done.length}</b></span>
 <span style="color:#8892a4;font-size:12px">左＝原图（盐场收集图），右＝识别命中的库原图；次选（第 2 名英雄）只列文字；最可疑的排前面</span>
</header>
${cards}
<div id="zoom"><img id="zoomImg" alt=""></div>
<script>document.addEventListener("click",function(e){var t=e.target;var z=document.getElementById("zoom");if(t.tagName==="IMG"&&t.classList&&t.classList.contains("img")){document.getElementById("zoomImg").src=t.src;z.style.display="flex"}else if(z.style.display==="flex"){z.style.display="none"}});</script>
</body></html>`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html, "utf8");

  // ⑦ 结论
  report();
  console.log("");
  console.log(`识别：${done.length} 张 / 命中 ${nHero} 个英雄 / 存疑(margin<5) ${doubt}` +
    (badDecode ? ` / 解码失败 ${badDecode}` : "") + ` / 自检一致 ${done.length - selfMismatch}/${done.length}`);
  const ms = (ns) => Number(ns) / 1e6;
  const n = items.length || 1;
  console.log(`耗时：总 ${(ms(tAll) / 1000).toFixed(2)}s / 单张平均 ${(ms(tAll) / n).toFixed(1)}ms` +
    `（解码+提特征 ${(ms(tDecode) / n).toFixed(1)}ms + 匹配 ${(ms(tMatch) / n).toFixed(1)}ms）` +
    ` / 最慢一张 ${ms(tSlow).toFixed(1)}ms`);
  console.log(`对照页 → ${OUT}（${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB）`);

  const hardFail = checklist.some((c) => !c.ok);
  if (hardFail) { console.error("\n结论：识别器有问题（上面 ✗ 项）。"); process.exitCode = 1; }
  else console.log("\n结论：识别器自检全过 ✓");
}

function report() {
  console.log("校验清单：");
  for (const c of checklist) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? "  ← " + c.detail : ""}`);
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error("失败:", (e && e.message) || e); process.exitCode = 1; }
}
