#!/usr/bin/env node
/* ============================================================================
 * 战报图片 → 英雄对照表的离线处理器
 *
 * ★★ 阈值一致性（重要）：识别阈值 = 你标注时页面用的【聚类阈值】，由 --merge 从标注文件的
 *    clusterThreshold 原样继承写入识别器 —— 正常流程永远不用手填。只有显式 --force-threshold N
 *    才会覆盖（会打警告，且识别与标注可能不一致）。
 *
 * 用法：
 *   node src/utils/img2hero/hero-table-builder.cjs --scan  <战报.json> [--out 前缀]
 *        用当前表自动识别战报里所有图 → 写 <前缀>-识别结果.json
 *        并生成 <前缀>-待标注.html（含【全部】图：已识别的预填英雄名+显示识别距离供抽查，未识别的待你标）
 *
 *   node src/utils/img2hero/hero-table-builder.cjs --merge <标注导出.json> [--mode centroid|members] [--max-per-hero 20]
 *        把标注结果并入主表 .workbuddy/hero-table.json，并【重新生成】
 *        public/game/features/heroImageMatcher.js（第 1 步那个运行时识别器）
 *
 *   node src/utils/img2hero/hero-table-builder.cjs --labeler <战报.json> [--out 前缀]
 *        生成「全部图」的标注页（想一次标完时用）
 *
 *   node src/utils/img2hero/hero-table-builder.cjs --stats
 * ==========================================================================*/
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..", ".."); // src/utils/img2hero → 仓库根
const TEMPLATE = path.join(__dirname, "hero-image-matcher.template.js");
const MASTER = path.join(ROOT, ".workbuddy", "hero-table.json");
const ROSTER = path.join(ROOT, ".workbuddy", "hero-roster.json");
const MATCHER_OUT = path.join(ROOT, "public", "game", "features", "heroImageMatcher.js");
const EVAL = path.join(__dirname, "eval-local-html.cjs");
const NODE = process.execPath;
const WORK = path.join(ROOT, ".workbuddy");

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const has = (n) => argv.includes(n);

// ── 基础工具 ────────────────────────────────────────────────────────────────
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 1), "utf8");

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

/** 从模板里抽出 FEATURE 代码块（保证标注页与识别器算法同源） */
function featureBlock() {
  const t = fs.readFileSync(TEMPLATE, "utf8");
  const b = t.indexOf("/*==FEATURE-BEGIN==*/");
  const e = t.indexOf("/*==FEATURE-END==*/");
  if (b < 0 || e < 0) throw new Error("模板缺 FEATURE 哨兵");
  return t.slice(b + "/*==FEATURE-BEGIN==*/".length, e);
}

/** 战报 JSON → 不重复图片列表（按出现次数降序） */
function uniqImages(war) {
  const map = new Map();
  for (const b of war.battles || []) {
    if (!b.ok) continue;
    for (const side of ["sponsor", "accept"]) {
      const arr = b[side + "EncryptedImages"];
      const items = (b[side + "Images"] && b[side + "Images"].items) || [];
      if (!Array.isArray(arr)) continue;
      arr.forEach((v, i) => {
        if (typeof v !== "string" || !v) return;
        const body = v.startsWith("data:") ? v.slice(v.indexOf(",") + 1) : v;
        if (!body) return;
        const hash = (items[i] && items[i].hash) || fnv1a(body);
        let e = map.get(body);
        if (!e) {
          e = { hash, src: v, count: 0 };
          map.set(body, e);
        }
        e.count++;
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ── 主表 / 识别器生成 ───────────────────────────────────────────────────────
function loadMaster() {
  if (fs.existsSync(MASTER)) {
    const m = readJson(MASTER);
    if (Array.isArray(m.entries)) return m;
  }
  return { version: 1, updatedAt: null, threshold: 24, entries: [] };
}
function saveMaster(m) {
  m.updatedAt = new Date().toISOString();
  writeJson(MASTER, m);
  return m;
}

/** 用主表生成识别器 JS（限每英雄最多 maxPerHero 条特征 + 可选的同英雄近重复去重，控制体积） */
function decodeFeat(b64) {
  const buf = Buffer.from(b64, "base64");
  const u = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) u[i] = buf[i];
  return u;
}
function featDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 3) {
    s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return s / (a.length / 3) / 3;
}
function buildMatcherJs(master, maxPerHero, dedupe) {
  const byHero = new Map();
  const held = []; // {heroId, f}
  let deduped = 0;
  // 出现次数多的优先保留
  const sorted = master.entries.slice().sort((a, b) => (b.count || 0) - (a.count || 0));
  const picked = [];
  for (const e of sorted) {
    if (!e.feat) continue;
    const n = byHero.get(e.heroId) || 0;
    if (maxPerHero > 0 && n >= maxPerHero) continue;
    const f = decodeFeat(e.feat);
    if (dedupe > 0 && held.some((h) => h.heroId === e.heroId && featDist(f, h.f) <= dedupe)) {
      deduped++;
      continue;
    }
    byHero.set(e.heroId, n + 1);
    held.push({ heroId: e.heroId, f: f });
    picked.push({ heroId: e.heroId, heroName: e.heroName, feat: e.feat, count: e.count || 0 });
  }
  const tpl = fs.readFileSync(TEMPLATE, "utf8");
  const js = tpl
    .replaceAll("__TABLE__", JSON.stringify(picked))
    .replaceAll("__THRESHOLD__", String(master.threshold || 24))
    .replaceAll("__THRESHOLD_SOURCE__", JSON.stringify(master.thresholdSource || "default"))
    .replaceAll("__UPDATED_AT__", JSON.stringify(master.updatedAt || null));
  fs.writeFileSync(MATCHER_OUT, js, "utf8");
  return { picked: picked.length, heroes: byHero.size, bytes: js.length, out: MATCHER_OUT, deduped: deduped };
}

// ── 标注页（含特征导出；聚类算法与识别器同源）──────────────────────────────
function buildLabelerHtml(images, opts) {
  const roster = fs.existsSync(ROSTER) ? readJson(ROSTER).roster : [];
  const hint = opts && opts.hint ? opts.hint : "";
  const FBTN = featureBlock();
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>武将图片标注（${images.length} 张）</title>
<style>
  :root{--ok:#0e9f8e;--line:#d8dee9}
  *{box-sizing:border-box}
  body{margin:0;padding:14px;background:#f2f4f8;color:#222;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}
  header{position:sticky;top:0;z-index:5;background:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.08);display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  .pill{background:#eef2f6;border-radius:6px;padding:3px 10px}.pill b{color:var(--ok)}
  input[type=range]{width:170px}
  input[type=search]{width:170px;border:1px solid var(--line);border-radius:8px;padding:7px 10px}
  button{border:0;border-radius:8px;padding:7px 14px;cursor:pointer;background:var(--ok);color:#fff;font-size:14px}
  .cluster{background:#fff;border-radius:12px;padding:10px;margin-top:12px;box-shadow:0 1px 5px rgba(0,0,0,.07)}
  .cluster.labeled{outline:2px solid var(--ok)}
  .chead{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .chead .cid{background:#eef2f6;border-radius:6px;padding:2px 8px;font-size:12px;color:#556}
  .chead input{flex:1;min-width:200px;border:1px solid var(--line);border-radius:8px;padding:7px 10px;font-size:14px}
  .chead input:focus{outline:2px solid var(--ok);border-color:transparent}
  .members{margin-top:8px;display:flex;flex-wrap:wrap;gap:8px}
  .member{width:104px;background:#f7f8fb;border:1px solid #e6eaf1;border-radius:8px;padding:5px;text-align:center}
  .member img{width:92px;height:60px;object-fit:contain;cursor:zoom-in;background:repeating-conic-gradient(#f6f7fa 0 25%,#eceff4 0 50%) 0 0/14px 14px}
  .member .m{font-size:10px;color:#778;margin-top:2px}
  .member .split{border:0;background:none;color:#c33;cursor:pointer;font-size:11px;padding:0}
  #zoom{position:fixed;inset:0;background:rgba(15,18,24,.85);display:none;align-items:center;justify-content:center;z-index:9;cursor:zoom-out}
  #zoom img{max-width:94vw;max-height:94vh;image-rendering:pixelated}
  .hint{font-size:12px;color:#667}
  select{border:1px solid var(--line);border-radius:8px;padding:7px 8px;font-size:14px}
  .cluster.auto{outline:2px solid #3b82f6}
  .badge{font-size:10px;border-radius:4px;padding:0 4px;color:#fff;background:#3b82f6;white-space:nowrap}
  .badge.ok{background:#16a34a}
  .badge.no{background:#c2410c}
</style></head><body>
<header>
  <b>武将图片标注</b>
  <span class="pill">图 <b>${images.length}</b></span>
  <span class="pill">簇 <b id="cc">0</b></span>
  <span class="pill">已标 <b id="done">0</b></span>
  <span class="pill">自动 <b id="autoN">0</b></span>
  <label class="hint">阈值 <input type="range" id="th" min="2" max="60" value="${(opts && opts.threshold) || 24}"> <b id="thv">${(opts && opts.threshold) || 24}</b></label>
  <input type="search" id="q" placeholder="按英雄名过滤…">
  <select id="flt"><option value="all">全部</option><option value="auto">自动识别的</option><option value="todo">待人工的</option><option value="manual">我标过的</option></select>
  <button id="export">导出标注（含特征）</button>
</header>
<div class="hint" style="margin-top:8px">${hint}</div>
<div id="clusters"></div><div id="zoom"><img id="zoomImg" alt=""></div><datalist id="roster"></datalist>
<script>
const IMAGES = ${JSON.stringify(images.map((im) => ({ src: im.src, hash: im.hash, count: im.count, nearest: im.nearest || null, rec: im.rec || null })))};
const ROSTER = ${JSON.stringify(roster)};
const KEY = "saltClusterLabels_v4";
let labels = {}; try { labels = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem("saltClusterLabels_v3") || "{}"); } catch (_) {}
// 扫描得到的自动识别结果：只用于预填 + 置信度提示；用户没动过的不会写进 labels
function autoOf(c){var best=null;c.members.forEach(function(m){var r=IMAGES[m].rec;if(r&&r.matched&&(!best||r.dist<best.dist))best=r});return best}
function autoCount(c){var n=0;c.members.forEach(function(m){var r=IMAGES[m].rec;if(r&&r.matched)n++});return n}
let threshold = ${(opts && opts.threshold) || 24};
let clusters = [], feats = [];
const FW = 36, FH = 24;
${FBTN}
function load(src){return new Promise(function(res,rej){var im=new Image();im.onload=function(){res(im)};im.onerror=rej;im.src=src})}
function toU8(f){var u=new Uint8Array(f.length);for(var i=0;i<f.length;i++)u[i]=Math.max(0,Math.min(255,Math.round(f[i])));return u}
function b64(u){var s="";for(var i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)}
function dist(a,b){var s=0;for(var i=0;i<a.length;i+=3){s+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])}return s/(a.length/3)/3}
function centroid(ms){var c=new Float32Array(FW*FH*3);ms.forEach(function(i){var f=feats[i];for(var k=0;k<c.length;k++)c[k]+=f[k]});for(var k=0;k<c.length;k++)c[k]/=ms.length;return c}
function recluster(){clusters=[];IMAGES.forEach(function(im,i){var f=feats[i],best=null,bd=Infinity;for(var j=0;j<clusters.length;j++){var d=dist(f,clusters[j].centroid);if(d<bd){bd=d;best=clusters[j]}}if(best&&bd<=threshold){best.members.push(i);best.centroid=centroid(best.members)}else{clusters.push({members:[i],centroid:Float32Array.from(f)})}});document.getElementById("cc").textContent=clusters.length}
document.getElementById("roster").innerHTML = ROSTER.map(function(r){return "<option value='"+r.name+"'>"}).join("");
function render(){
  var wrap=document.getElementById("clusters");wrap.innerHTML="";
  var kw=document.getElementById("q").value.trim().toLowerCase();
  clusters.forEach(function(c,ci){
    var first=IMAGES[c.members[0]],lab=labels[first.hash]||null;
    var names=new Set();c.members.forEach(function(m){var l=labels[IMAGES[m].hash];if(l&&l.heroName)names.add(l.heroName)});
    var auto=autoOf(c),isAuto=!lab&&!names.size&&!!auto;
    var label=lab?lab.heroName:([...names][0]||(auto?auto.heroName:""));
    var hintTxt=isAuto?("自动识别 d="+auto.dist+"，不对就改"):(autoCount(c)?("部分识别 "+autoCount(c)+"/"+c.members.length):"");
    var card=document.createElement("div");
    card.className="cluster"+(label?" labeled":"")+(isAuto?" auto":"");
    card.innerHTML='<div class="chead"><span class="cid">簇'+(ci+1)+" · "+c.members.length+' 张</span>'+(isAuto?'<span class="badge">自动</span>':'')+
      '<input list="roster" placeholder="英雄名（下拉选）…" value="'+label.replace(/"/g,"&quot;")+'">'+
      '<span class="hint">'+hintTxt+'</span></div><div class="members"></div>';
    var nm=c.members.map(function(m){var l=labels[IMAGES[m].hash];return (l&&l.heroName)||""}).join(" ").toLowerCase();
    var hitKw=!kw||nm.indexOf(kw)>=0||(label||"").toLowerCase().indexOf(kw)>=0;
    var flt=document.getElementById("flt").value;
    var hitFlt=flt==="all"||(flt==="auto"&&isAuto)||(flt==="manual"&&(!!lab||names.size>0))||(flt==="todo"&&!label);
    card.classList.toggle("hidden",!(hitKw&&hitFlt));
    var input=card.querySelector("input"),mem=card.querySelector(".members");
    c.members.forEach(function(mi){
      var im=IMAGES[mi],d=document.createElement("div");
      d.className="member";
      var rb=im.rec?('<span class="badge '+(im.rec.matched?"ok":"no")+'">'+(im.rec.matched?("d"+im.rec.dist):("?"+im.rec.dist))+'</span>'):'';
      d.innerHTML='<img loading="lazy" src="'+im.src+'"><div class="m">×'+im.count+" "+rb+' <code>'+im.hash.slice(0,6)+'</code> <button class="split">拆</button></div>';
      d.querySelector("img").onclick=function(){document.getElementById("zoomImg").src=im.src;document.getElementById("zoom").style.display="flex"};
      d.querySelector(".split").onclick=function(e){e.stopPropagation();
        clusters.splice(clusters.indexOf(c),1);
        var others=c.members.filter(function(m){return m!==mi});
        if(others.length)clusters.push({members:others,centroid:centroid(others)});
        clusters.push({members:[mi],centroid:Float32Array.from(feats[mi])});
        delete labels[im.hash];render();update()};
      mem.appendChild(d);
    });
    input.oninput=function(){
      var v=input.value.trim(),hit=ROSTER.find(function(r){return r.name===v||String(r.id)===v});
      var hid=hit?hit.id:null;
      c.members.forEach(function(m){var h=IMAGES[m].hash;if(v)labels[h]={heroId:hid,heroName:v};else delete labels[h]});
      card.querySelector(".hint").textContent=hid?("heroId="+hid):"";
      card.classList.toggle("labeled",!!v);
      card.classList.remove("auto"); // 用户动过就不再算自动
      save();update();
    };
    wrap.appendChild(card);
  });
  update();
}
function save(){localStorage.setItem(KEY,JSON.stringify(labels))}
function update(){
  var n=IMAGES.filter(function(im){var l=labels[im.hash];return l&&l.heroName}).length;
  var m=IMAGES.filter(function(im){var r=im.rec;return r&&r.matched}).length;
  document.getElementById("done").textContent=n+" / "+IMAGES.length;
  var ae=document.getElementById("autoN"); if(ae) ae.textContent=m;
}
document.getElementById("th").oninput=function(e){threshold=Number(e.target.value);document.getElementById("thv").textContent=threshold;recluster();render()};
document.getElementById("q").oninput=render;
document.getElementById("flt").onchange=render;
document.getElementById("zoom").onclick=function(){document.getElementById("zoom").style.display="none"};
document.getElementById("export").onclick=function(){
  // 每簇只需三项：heroId / heroName / 质心特征（导出文件很小，约 65 簇 ≈ 230KB）
  var cls=[];
  clusters.forEach(function(c){
    var lab=null;
    for(var k=0;k<c.members.length;k++){var l=labels[IMAGES[c.members[k]].hash];if(l&&l.heroName){lab=l;break}}
    if(!lab)return;
    cls.push({heroId:lab.heroId,heroName:lab.heroName,centroid:b64(toU8(c.centroid))});
  });
  // 头部带【出处】：聚类阈值 / 特征版本 / 特征尺寸 —— 将来阈值或算法变了也能追溯、能校验
  var payload={exportedAt:new Date().toISOString(),clusterThreshold:threshold,featureVersion:3,dims:[FW,FH],clusters:cls};
  var blob=new Blob([JSON.stringify(payload,null,1)],{type:"application/json"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="英雄图片标注-"+new Date().toISOString().slice(0,10)+".json";a.click();
};
(async function(){
  var imgs=await Promise.all(IMAGES.map(function(im){return load(im.src)}));
  imgs.forEach(function(im){feats.push(featureOfImage(im))});
  recluster();render();
})();
</script></body></html>`;
}

// ── 扫描：用识别器识别战报里所有图 ───────────────────────────────────────────
function buildScanHtml(matcherJs, images) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>scan</title></head><body>
<script>${matcherJs}</script>
<script>
const IMAGES = ${JSON.stringify(images.map((im) => ({ hash: im.hash, src: im.src, count: im.count })))};
const FW = 36, FH = 24;
window.__RESULT__ = (async function () {
  function load(src){return new Promise(function(res,rej){var im=new Image();im.onload=function(){res(im)};im.onerror=rej;im.src=src})}
  function b64(u){var s="";for(var i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)}
  var API = window.__HERO_IMG_MATCH__;
  var out = [];
  for (var i = 0; i < IMAGES.length; i++) {
    var im = await load(IMAGES[i].src);
    var f = API.featureOfImage(im);
    var u = new Uint8Array(f.length);
    for (var k = 0; k < f.length; k++) u[k] = Math.max(0, Math.min(255, Math.round(f[k])));
    var r = API.identifyFeature(f);
    out.push({
      hash: IMAGES[i].hash, count: IMAGES[i].count, src: IMAGES[i].src,
      feat: b64(u),
      matched: !!r.matched, heroId: r.heroId || null, heroName: r.heroName || null,
      dist: r.dist, secondDist: r.secondDist || null, reason: r.reason || null,
      nearest: r.nearest || null
    });
  }
  return { stats: API.stats(), images: out };
})();
</script></body></html>`;
}

function runScan(matcherJs, images) {
  const htmlPath = path.join(WORK, "_scan.html");
  fs.writeFileSync(htmlPath, buildScanHtml(matcherJs, images), "utf8");
  const out = execFileSync(NODE, [EVAL, htmlPath, "document.title", "noshot"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  const i = out.indexOf("RESULT:");
  if (i < 0) throw new Error("扫描没拿到结果：\n" + out.slice(0, 800));
  return JSON.parse(out.slice(i + "RESULT:".length).trim());
}

// ── 子命令 ──────────────────────────────────────────────────────────────────
function cmdScan() {
  const warPath = argv[argv.indexOf("--scan") + 1];
  const outPrefix = flag("--out", path.join(path.dirname(warPath), "盐场"));
  const master = loadMaster();
  if (has("--force-threshold")) {
    master.threshold = Number(flag("--force-threshold", "24"));
    master.thresholdSource = "manual";
    console.log(`  ⚠️ --force-threshold ${master.threshold}：本次识别阈值被手工覆盖（与标注的聚类阈值可能不一致）`);
  }
  const war = readJson(warPath);
  const images = uniqImages(war);
  const matcherJs = fs.readFileSync(TEMPLATE, "utf8")
    .replaceAll("__TABLE__", JSON.stringify(master.entries.filter((e) => e.feat).map((e) => ({ heroId: e.heroId, heroName: e.heroName, feat: e.feat, count: e.count || 0 }))))
    .replaceAll("__THRESHOLD__", String(master.threshold || 24))
    .replaceAll("__THRESHOLD_SOURCE__", JSON.stringify(master.thresholdSource || "default"))
    .replaceAll("__UPDATED_AT__", JSON.stringify(master.updatedAt));
  console.log(`战报 ${war.battles.length} 场 | 不重复图 ${images.length} 张 | 表内条目 ${master.entries.length} | 阈值 ${master.threshold}`);
  const res = runScan(matcherJs, images);
  const recognized = res.images.filter((x) => x.matched);
  const unknown = res.images.filter((x) => !x.matched);
  const slots = recognized.reduce((a, x) => a + x.count, 0);
  const unknownSlots = unknown.reduce((a, x) => a + x.count, 0);
  console.log(`✅ 已识别 ${recognized.length} 张（占 ${slots} 个槽位） | ❓未识别 ${unknown.length} 张（占 ${unknownSlots} 个槽位）`);

  const resultPath = `${outPrefix}-识别结果.json`;
  writeJson(resultPath, {
    scannedAt: new Date().toISOString(),
    warReport: warPath,
    threshold: master.threshold,
    tableSize: master.entries.length,
    recognized,
    unknown: unknown.map((x) => ({ hash: x.hash, count: x.count, src: x.src, feat: x.feat, nearest: x.nearest, dist: x.dist }))
  });
  console.log("识别结果 →", resultPath);

  if (res.images.length) {
    const labPath = `${outPrefix}-待标注.html`;
    const feats = new Map(unknown.map((x) => [x.hash, x]));
    // ★ 把【全部】图都放进标注页：已识别的预填结果 + 每张显示识别距离，便于人工抽查纠错
    const imgs = res.images.map((x) => ({
      hash: x.hash,
      src: x.src,
      count: x.count,
      rec: { heroId: x.heroId || null, heroName: x.heroName || null, dist: x.dist, matched: !!x.matched }
    }));
    fs.writeFileSync(
      labPath,
      buildLabelerHtml(imgs, {
        threshold: master.threshold,
        hint: `共 ${res.images.length} 张 = 自动识别 ${recognized.length}（已预填，抽查不对就改）+ 未识别 ${unknown.length}（需你标）。右上可切「全部 / 自动识别的 / 待人工的 / 我标过的」；标完导出再跑 --merge。`
      }),
      "utf8"
    );
    console.log("待标注页 →", labPath, `（共 ${res.images.length} 张：自动识别 ${recognized.length} 已预填 + 未识别 ${unknown.length}）`);
    void feats;
  } else {
    console.log("🎉 全部识别，无需标注");
  }
  // 统计近邻距离分布，便于校准阈值
  const dists = res.images.filter((x) => x.dist !== null).map((x) => x.dist).sort((a, b) => a - b);
  if (dists.length) {
    const q = (p) => dists[Math.floor(p * (dists.length - 1))];
    console.log(`最佳距离分布: p10=${q(0.1)} p50=${q(0.5)} p90=${q(0.9)} max=${dists[dists.length - 1]}`);
  }
}

function cmdMerge() {
  const src = argv[argv.indexOf("--merge") + 1];
  const maxPerHero = Number(flag("--max-per-hero", "20"));
  const dedupe = Number(flag("--dedupe", "0"));
  // centroid（默认/推荐）：一簇一条 = 该簇质心特征 → 一个英雄形态组一个特征值
  // members：逐张一条（覆盖面最大、体积也最大，配合 --dedupe 瘦身）
  const mode = flag("--mode", "centroid");
  const data = readJson(src);
  let records = [];
  if (mode === "members") {
    records = (data.entries || data.table || []).map((e) => ({
      hash: e.hash,
      heroId: e.heroId,
      heroName: e.heroName,
      feat: e.feat,
      count: e.count || 0
    }));
  } else {
    records = (data.clusters || []).map((c) => ({
      // 导出只有三项，用「heroId + 质心内容指纹」当稳定键：重复导入同一份不会产生重复条目
      hash: "c:" + c.heroId + ":" + fnv1a(c.centroid || "").slice(0, 6),
      heroId: c.heroId,
      heroName: c.heroName,
      feat: c.centroid,
      count: c.count || 0
    }));
  }
  if (!records.length) {
    throw new Error(`标注文件里没有可用条目（mode=${mode}，需要 ${mode === "members" ? "entries" : "clusters"}）`);
  }
  const master = loadMaster();
  // ★ 铁律：识别阈值必须与标注时的【聚类阈值】一致 → 默认原样继承标注文件里的 clusterThreshold。
  //   只有显式 --force-threshold 才会覆盖（会打警告），正常流程不要用它。
  const forced = has("--force-threshold") ? Number(flag("--force-threshold", "24")) : null;
  const inherited = typeof data.clusterThreshold === "number" ? data.clusterThreshold : null;
  if (inherited === null) {
    console.log("  ⚠️ 标注文件没带 clusterThreshold（老版本导出）—— 沿用现主表阈值，可能不一致");
  }
  const prev = typeof master.threshold === "number" ? master.threshold : null;
  const usedThreshold = forced !== null ? forced : inherited !== null ? inherited : prev !== null ? prev : 24;
  master.threshold = usedThreshold;
  master.thresholdSource = forced !== null ? "manual" : inherited !== null ? "label-export" : "default";
  if (forced !== null && inherited !== null && forced !== inherited) {
    console.log(`  ⚠️ --force-threshold ${forced} 覆盖了标注文件的聚类阈值 ${inherited} → 识别与标注可能不一致！`);
  }
  if (inherited !== null && prev !== null && inherited !== prev) {
    console.log(`  提示：本批标注聚类阈值 ${inherited} ≠ 主表旧阈值 ${prev}，已统一为 ${inherited}（旧条目是按旧阈值聚的）`);
  }
  // 特征版本/尺寸校验：防止把不同算法的特征混进同一张表
  if (data.featureVersion !== undefined && data.featureVersion !== 3) {
    throw new Error(`标注文件的 featureVersion=${data.featureVersion}，当前识别器是 3 —— 算法不一致，拒绝合并`);
  }
  if (Array.isArray(data.dims) && (data.dims[0] !== 36 || data.dims[1] !== 24)) {
    throw new Error(`标注文件 dims=${JSON.stringify(data.dims)}，当前是 [36,24] —— 拒绝合并`);
  }
  const byHash = new Map(master.entries.map((e) => [e.hash, e]));
  let added = 0,
    updated = 0,
    skipped = 0;
  for (const e of records) {
    if (!e.hash || !e.heroId || !e.heroName || !e.feat) {
      skipped++;
      continue;
    }
    if (byHash.has(e.hash)) updated++;
    else added++;
    byHash.set(e.hash, e);
  }
  master.entries = [...byHash.values()];
  saveMaster(master);
  const info = buildMatcherJs(master, maxPerHero, mode === "members" ? dedupe : 0);
  console.log(`标注合并（mode=${mode}）：新增 ${added} 条 / 覆盖 ${updated} 条 / 跳过 ${skipped} 条（缺 feat 或 heroId）`);
  console.log(`  识别阈值 → ${usedThreshold}（来源：${master.thresholdSource}${master.thresholdSource === "label-export" ? " = 标注页聚类阈值" : ""}）`);
  console.log(`主表 → ${MASTER}（${master.entries.length} 条，${new Set(master.entries.map((e) => e.heroId)).size} 个英雄）`);
  console.log(
    `识别器 → ${info.out}（内置 ${info.picked} 条特征 / ${info.heroes} 个英雄 / ${(info.bytes / 1024).toFixed(0)}KB` +
      (mode === "members" && dedupe > 0 ? ` / 同英雄去重掉 ${info.deduped} 条(阈值${dedupe})` : "") +
      "）"
  );
}

function cmdLabeler() {
  const warPath = argv[argv.indexOf("--labeler") + 1];
  const outPrefix = flag("--out", path.join(path.dirname(warPath), "盐场"));
  const war = readJson(warPath);
  const images = uniqImages(war);
  const p = `${outPrefix}-全量标注.html`;
  fs.writeFileSync(p, buildLabelerHtml(images, { threshold: 24, hint: `全部 ${images.length} 张图。标完导出，再跑 --merge 合并。` }), "utf8");
  console.log("全量标注页 →", p, `（${images.length} 张）`);
}

function cmdStats() {
  const master = loadMaster();
  const heroes = new Map();
  master.entries.forEach((e) => {
    if (!heroes.has(e.heroId)) heroes.set(e.heroId, { name: e.heroName, n: 0 });
    heroes.get(e.heroId).n++;
  });
  console.log(`主表 ${MASTER}`);
  console.log(`  条目 ${master.entries.length} | 英雄 ${heroes.size} | 识别阈值 ${master.threshold}(${master.thresholdSource || "?"}) | 更新 ${master.updatedAt || "—"}`);
  const list = [...heroes.entries()].sort((a, b) => b[1].n - a[1].n);
  list.slice(0, 20).forEach(([id, v]) => console.log(`   ${String(id).padStart(3)} ${v.name}  ×${v.n}`));
  if (list.length > 20) console.log(`   …其余 ${list.length - 20} 个英雄`);
  console.log(fs.existsSync(MATCHER_OUT) ? `识别器 ${MATCHER_OUT}（${(fs.statSync(MATCHER_OUT).size / 1024).toFixed(0)}KB）` : "识别器尚未生成");
}

function cmdReset() {
  const master = { version: 1, updatedAt: new Date().toISOString(), threshold: 24, thresholdSource: "default", entries: [] };
  writeJson(MASTER, master);
  const info = buildMatcherJs(master, 0);
  console.log("已重置主表为空，并重新生成空识别器 →", info.out);
}

/** 只按主表重生成识别器（不动主表）—— 改模板/改限流后用它 */
function cmdRebuild() {
  const master = loadMaster();
  const info = buildMatcherJs(master, Number(flag("--max-per-hero", "20")), Number(flag("--dedupe", "0")));
  console.log(
    `按主表重生成识别器 → ${info.out}（${master.entries.length} 条主表 → 内置 ${info.picked} 条 / ${info.heroes} 个英雄 / ` +
      `${(info.bytes / 1024).toFixed(0)}KB / 阈值 ${master.threshold}）`
  );
}

// ── 入口 ────────────────────────────────────────────────────────────────────
try {
  if (has("--scan")) cmdScan();
  else if (has("--merge")) cmdMerge();
  else if (has("--labeler")) cmdLabeler();
  else if (has("--reset")) cmdReset();
  else if (has("--rebuild")) cmdRebuild();
  else if (has("--stats")) cmdStats();
  else {
    console.log(fs.readFileSync(__filename, "utf8").split("============================================================================*/")[0]);
  }
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
}
void os;
