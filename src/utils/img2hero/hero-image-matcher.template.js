/* ============================================================================
 * 盐场隐藏阵容 → 英雄识别（运行时）
 *   本文件是【模板】：由 src/utils/img2hero/hero-table-builder.cjs 填充 __TABLE__ / __THRESHOLD__
 *   生成到 public/game/features/heroImageMatcher.js —— 生成物别手改。
 *
 * ★ 算法一致性：featureOfImage 用 FEATURE-BEGIN/END 哨兵包住，标注页会把【同一份代码块】
 *   原样内联 → 两边特征绝对一致。改算法只改这里 + 重新生成（标注页也由 builder 生成）。
 *
 * 游戏页用法：
 *   const r = await window.__HERO_IMG_MATCH__.identify(base64OrDataURI);
 *     r = { matched:true,  heroId, heroName, dist, secondDist, margin }
 *       | { matched:false, dist, nearest:{heroId,heroName}, reason:"no-table"|"too-far" }
 *       | null（图片解码失败）
 *   const r2 = window.__HERO_IMG_MATCH__.identifyFeature(featureArray);  // 已有特征时同步调用
 *   window.__HERO_IMG_MATCH__.stats()  → { featureVersion, tableSize, threshold, dims, updatedAt }
 *   window.__HERO_IMG_MATCH__.table    → 原始表（调试用）
 * ==========================================================================*/
(function () {
  "use strict";

  var FW = 36;                 // 特征宽（与标注页一致，勿改！）
  var FH = 24;                 // 特征高
  var FEATURE_VERSION = 3;     // 3 = 36×24 白底等比居中 RGB；改算法必须+1
  // ★ 识别阈值 = 标注页导出时用的【聚类阈值】原值（由 hero-table-builder 继承写入），两者必须同一个数
  var THRESHOLD = __THRESHOLD__;
  var THRESHOLD_SOURCE = __THRESHOLD_SOURCE__; // 出处："label-export" | "manual" | "default"
  var UPDATED_AT = __UPDATED_AT__;
  var TABLE = __TABLE__;       // [{ heroId, heroName, feat: "base64(Uint8 2592)", count }]

  /*==FEATURE-BEGIN==*/
  // 把图（HTMLImageElement / ImageBitmap / CanvasImageSource）转成特征向量
  // 等比缩放居中贴到 36×24 白底，取 RGB 逐像素（长度 36*24*3 = 2592）
  function featureOfImage(im) {
    var c = document.createElement("canvas");
    c.width = FW; c.height = FH;
    var x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, FW, FH);
    var nw = im.naturalWidth || im.width;
    var nh = im.naturalHeight || im.height;
    var s = Math.min(FW / nw, FH / nh);
    var w = nw * s, h = nh * s;
    x.drawImage(im, (FW - w) / 2, (FH - h) / 2, w, h);
    var d = x.getImageData(0, 0, FW, FH).data;
    var v = new Float32Array(FW * FH * 3);
    for (var i = 0, k = 0; i < d.length; i += 4, k += 3) {
      v[k] = d[i]; v[k + 1] = d[i + 1]; v[k + 2] = d[i + 2];
    }
    return v;
  }
  /*==FEATURE-END==*/

  /** 平均每通道差，0~255 量纲（与标注页 dist 一致） */
  function distFeature(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 3) {
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return sum / (a.length / 3) / 3;
  }

  var DECODED = null;
  function ensureDecoded() {
    if (DECODED) return DECODED;
    DECODED = [];
    for (var i = 0; i < TABLE.length; i++) {
      var e = TABLE[i];
      try {
        var raw = atob(e.feat);
        var u = new Uint8Array(raw.length);
        for (var k = 0; k < raw.length; k++) u[k] = raw.charCodeAt(k);
        DECODED.push({ heroId: e.heroId, heroName: e.heroName, feat: u, count: e.count || 0 });
      } catch (err) {
        /* 单条坏了不影响其它 */
      }
    }
    return DECODED;
  }

  /** 已算好特征时同步识别 */
  function identifyFeature(feat) {
    var t = ensureDecoded();
    if (!t.length || !feat) {
      return { matched: false, dist: null, nearest: null, reason: "no-table" };
    }
    var best = null, bestD = Infinity, secondD = Infinity;
    for (var i = 0; i < t.length; i++) {
      var d = distFeature(feat, t[i].feat);
      if (d < bestD) {
        secondD = bestD; bestD = d; best = t[i];
      } else if (d < secondD) {
        secondD = d;
      }
    }
    var out = {
      dist: Math.round(bestD * 100) / 100,
      secondDist: isFinite(secondD) ? Math.round(secondD * 100) / 100 : null,
      nearest: { heroId: best.heroId, heroName: best.heroName }
    };
    if (bestD <= THRESHOLD) {
      out.matched = true;
      out.heroId = best.heroId;
      out.heroName = best.heroName;
      out.margin = out.secondDist === null ? null : Math.round((out.secondDist - bestD) * 100) / 100;
    } else {
      out.matched = false;
      out.reason = "too-far";
    }
    return out;
  }

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("image decode failed")); };
      im.src = src;
    });
  }

  /** base64 / dataURI → 英雄。返回 Promise<结果|null> */
  function identify(src) {
    if (typeof src !== "string" || !src) return Promise.resolve(null);
    var uri = src.indexOf("data:") === 0 ? src : "data:image/png;base64," + src;
    return loadImage(uri).then(
      function (im) { return identifyFeature(featureOfImage(im)); },
      function () { return null; }
    );
  }

  /** 批量：给 5 格图（含空位）→ 每格结果数组（并发，够快） */
  function identifyList(list) {
    return Promise.all((list || []).map(function (s) { return (s ? identify(s) : Promise.resolve(null)); }));
  }

  window.__HERO_IMG_MATCH__ = {
    identify: identify,
    identifyList: identifyList,
    identifyFeature: identifyFeature,
    featureOfImage: featureOfImage,   // 供同源复用（标注页就是内联这段）
    distFeature: distFeature,
    stats: function () {
      return {
        featureVersion: FEATURE_VERSION,
        tableSize: TABLE.length,
        threshold: THRESHOLD,
        thresholdSource: THRESHOLD_SOURCE,
        dims: [FW, FH],
        updatedAt: UPDATED_AT
      };
    },
    table: TABLE,
    FW: FW,
    FH: FH,
    THRESHOLD: THRESHOLD
  };
})();
