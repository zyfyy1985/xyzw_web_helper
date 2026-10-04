#!/usr/bin/env node
/* ============================================================================
 * 英雄图特征 / 识别器 构建器（img2hero 全链只剩两步）
 *
 * 用法：
 *   node src/utils/img2hero/hero-feature-builder.cjs --features [图库.json] [--out 特征库.json]
 *        图库（fetch-hero-heads.cjs 产物，默认 .workbuddy/hero-heads.json，每张图自带 heroId）
 *        → 逐图提特征（纯 Node：pnglite 解码 + 模板 FEATURE 块重采样；无聚类、无质心）
 *        → 特征库 JSON：{ featureVersion, dims, entries:[{hash,heroId,heroName,skinPath,feat,count}] }
 *
 *   node src/utils/img2hero/hero-feature-builder.cjs --matcher [特征库.json]
 *        [--max-per-hero N] [--dedupe D] [--out public/game/features/heroImageMatcher.js]
 *        特征库 → 运行时识别器（最近邻全量逐图；max-per-hero 0=不限每英雄条数，
 *        dedupe>0 时同英雄内特征距离 ≤ D 的近重复只留一条，控制体积）。
 *
 * ★ 算法同源：本工具【不实现】特征算法 —— 直接把模板 hero-image-matcher.template.js 的
 *   FEATURE 块（featureOfRGBA / distFeature）放进 vm 原样执行。改算法只改模板，
 *   然后 --features 重建特征库 → --matcher 重建识别器，两端永不漂移。
 * ==========================================================================*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { decodePNG } = require("./pnglite.cjs");

const ROOT = path.join(__dirname, "..", "..", ".."); // src/utils/img2hero → 仓库根
const TEMPLATE = path.join(__dirname, "hero-image-matcher.template.js");
const MATCHER_OUT = path.join(ROOT, "public", "game", "features", "heroImageMatcher.js");
const DEFAULT_LIB = path.join(ROOT, ".workbuddy", "hero-heads.json");     // fetch-hero-heads 产物
const DEFAULT_FEATS = path.join(ROOT, ".workbuddy", "hero-features.json"); // 特征库默认落点

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const has = (n) => argv.includes(n);

/** 从模板里抽出 FEATURE 块并在 vm 沙箱原样执行 → 拿 featureOfRGBA / distFeature */
function loadFeatureBlock() {
  const t = fs.readFileSync(TEMPLATE, "utf8");
  const b = t.indexOf("/*==FEATURE-BEGIN==*/");
  const e = t.indexOf("/*==FEATURE-END==*/");
  if (b < 0 || e < 0) throw new Error("模板缺 FEATURE 哨兵");
  const code = t.slice(b, e);
  const sandbox = {};
  vm.runInNewContext(
    code + "\nthis.__FB__ = { featureOfRGBA: featureOfRGBA, distFeature: distFeature, featureVersion: FEATURE_VERSION, FW: FW, FH: FH };",
    sandbox,
    { filename: "hero-image-matcher.feature-block.js" }
  );
  return sandbox.__FB__;
}

/** dataURI / 裸 base64 → {w,h,data}（pnglite 解码） */
function decodeImage(src) {
  const body = src.startsWith("data:") ? src.slice(src.indexOf(",") + 1) : src;
  return decodePNG(Buffer.from(body, "base64"));
}

// ── ① 图库 → 特征库（逐图一条，无聚类无质心）────────────────────────────────
function cmdFeatures() {
  let libPath = argv[argv.indexOf("--features") + 1];
  if (!libPath || libPath.startsWith("--")) libPath = DEFAULT_LIB;
  const out = flag("--out", DEFAULT_FEATS);
  const FB = loadFeatureBlock();
  const war = JSON.parse(fs.readFileSync(libPath, "utf8"));

  // 收集所有自带 heroId 的图（伪战报格式：battles[].heroId + sponsorImages.items[].hash + sponsorEncryptedImages[]）
  const items = [];
  for (const b of war.battles || []) {
    if (!b.heroId) continue;
    const pics = (b.sponsorImages && b.sponsorImages.items) || [];
    const srcs = b.sponsorEncryptedImages || [];
    pics.forEach((it, i) => {
      if (it && it.hash && srcs[i]) {
        items.push({ hash: it.hash, src: srcs[i], heroId: b.heroId, heroName: b.heroName || "", skinPath: b.skinPath || "" });
      }
    });
  }
  if (!items.length) {
    throw new Error("图库里没有带 heroId 的图 —— 先跑 node src/utils/img2hero/fetch-hero-heads.cjs 生成图库");
  }

  const seen = new Set();
  const entries = [];
  let bad = 0;
  for (const it of items) {
    if (seen.has(it.hash)) continue; // 同 hash 只取一张
    seen.add(it.hash);
    let img;
    try {
      img = decodeImage(it.src);
    } catch (e) {
      bad++;
      continue;
    }
    const feat = FB.featureOfRGBA(img.data, img.w, img.h);
    entries.push({
      hash: it.hash,
      heroId: it.heroId,
      heroName: it.heroName,
      skinPath: it.skinPath,
      feat: Buffer.from(feat).toString("base64"),
      count: 1
    });
  }
  const data = {
    exportedAt: new Date().toISOString(),
    generator: "hero-feature-builder.cjs --features（逐图特征，无聚类/质心）",
    source: libPath,
    featureVersion: FB.featureVersion,
    dims: [FB.FW, FB.FH],
    entries
  };
  fs.writeFileSync(out, JSON.stringify(data, null, 1), "utf8");
  const heroes = new Set(entries.map((e) => e.heroId)).size;
  console.log(`图库 ${path.basename(libPath)} → 特征库 ${out}`);
  console.log(`  ${entries.length} 条（${heroes} 个英雄）/ featureVersion ${data.featureVersion} / dims 36×24${bad ? ` / 解码失败跳过 ${bad}` : ""}`);
  console.log(`  下一步：node src/utils/img2hero/hero-feature-builder.cjs --matcher ${path.relative(ROOT, out)}`);
}

// ── ② 特征库 → 运行时识别器 ─────────────────────────────────────────────────
function cmdMatcher() {
  let libPath = argv[argv.indexOf("--matcher") + 1];
  if (!libPath || libPath.startsWith("--")) libPath = DEFAULT_FEATS;
  const out = flag("--out", MATCHER_OUT);
  const maxPerHero = Number(flag("--max-per-hero", "0"));
  const dedupe = Number(flag("--dedupe", "0"));
  const FB = loadFeatureBlock();
  const data = JSON.parse(fs.readFileSync(libPath, "utf8"));
  if (data.featureVersion !== undefined && data.featureVersion !== FB.featureVersion) {
    throw new Error(`特征库 featureVersion=${data.featureVersion}，模板是 ${FB.featureVersion} —— 算法不一致，先重跑 --features`);
  }
  if (Array.isArray(data.dims) && (data.dims[0] !== FB.FW || data.dims[1] !== FB.FH)) {
    throw new Error(`特征库 dims=${JSON.stringify(data.dims)}，模板是 [${FB.FW},${FB.FH}] —— 拒绝生成`);
  }

  const entries = (data.entries || []).filter((e) => e.heroId && e.feat);
  // 稳定排序：同一份特征库多次生成 → 产物逐字节一致
  entries.sort((a, b) => (a.heroId - b.heroId) || String(a.skinPath || a.hash).localeCompare(String(b.skinPath || b.hash)));

  const byHero = new Map();
  const held = []; // {heroId, f:Uint8Array} 供 dedupe 比对
  const picked = [];
  let deduped = 0;
  for (const e of entries) {
    const n = byHero.get(e.heroId) || 0;
    if (maxPerHero > 0 && n >= maxPerHero) continue;
    if (dedupe > 0) {
      const f = new Uint8Array(Buffer.from(e.feat, "base64"));
      if (held.some((h) => h.heroId === e.heroId && FB.distFeature(f, h.f) <= dedupe)) {
        deduped++;
        continue;
      }
      held.push({ heroId: e.heroId, f });
    }
    byHero.set(e.heroId, n + 1);
    picked.push({ heroId: e.heroId, heroName: e.heroName, feat: e.feat, count: e.count || 1 });
  }

  const js = fs
    .readFileSync(TEMPLATE, "utf8")
    .replaceAll("__TABLE__", JSON.stringify(picked))
    .replaceAll("__UPDATED_AT__", JSON.stringify(new Date().toISOString()));
  fs.writeFileSync(out, js, "utf8");
  console.log(`特征库 ${path.basename(libPath)} → 识别器 ${out}`);
  console.log(
    `  内置 ${picked.length} 条 / ${byHero.size} 个英雄 / ${(js.length / 1024).toFixed(0)}KB` +
      (maxPerHero > 0 ? ` / 每英雄上限 ${maxPerHero}` : "") +
      (dedupe > 0 ? ` / 同英雄去重掉 ${deduped} 条(阈值${dedupe})` : "")
  );
}

// ── 入口 ────────────────────────────────────────────────────────────────────
try {
  if (has("--features")) cmdFeatures();
  else if (has("--matcher")) cmdMatcher();
  else {
    console.log(fs.readFileSync(__filename, "utf8").split("============================================================================*/")[0]);
  }
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
}
