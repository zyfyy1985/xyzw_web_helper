/* ============================================================================
 * 盐场隐藏阵容 → 英雄识别（运行时）
 *   本文件是【模板】：由 src/utils/img2hero/hero-feature-builder.cjs --matcher
 *   填充 __TABLE__ / __UPDATED_AT__ 生成到 public/game/features/heroImageMatcher.js
 *   —— 生成物别手改。
 *
 * ★ 算法一致性（全链唯一权威实现 = 下面 FEATURE 块里的 featureOfRGBA / distFeature）：
 *   - 浏览器端：featureOfImage(im) 把图按【原尺寸】画到 canvas 取 ImageData → featureOfRGBA
 *     （canvas 只负责解码出像素，缩放/白底合成全部由 featureOfRGBA 显式完成）
 *   - Node 端（hero-feature-builder.cjs --features）：pnglite 解码出 RGBA → 在 vm 里
 *     【原样执行同一个 FEATURE 块】提特征
 *   两端跑的是逐字节相同的代码：改算法只改 FEATURE 块，然后重跑 --features + --matcher。
 *
 * 游戏页用法：
 *   const r = await window.__HERO_IMG_MATCH__.identify(base64OrDataURI);
 *     r = { matched:true, heroId, heroName, dist, secondDist, margin }   // ★ 只要表非空就必命中
 *       | { matched:false, dist:null, nearest:null, reason:"no-table" } // 表为空
 *       | null（图片解码失败）
 *   ★ 判定规则 = 【最近邻即答案】（不设阈值门槛）。margin(= secondDist - dist) 只是可信度参考：
 *     越大越像唯一答案；越小说明 top1/top2 几乎并列，结果可能是巧合。
 *   const r2 = window.__HERO_IMG_MATCH__.identifyFeature(featureArray);  // 已有特征时同步调用
 *   window.__HERO_IMG_MATCH__.stats()  → { featureVersion, tableSize, dims, updatedAt }
 *   window.__HERO_IMG_MATCH__.table    → 原始表（调试用）
 * ==========================================================================*/
(function () {
  "use strict";

  /*==FEATURE-BEGIN==*/
  // ── 纯像素函数：禁止出现 document / Image / Buffer 等 DOM 或宿主依赖
  //    （浏览器端内联使用，Node 端在 vm 沙箱里原样执行）────────────────────

  var FW = 36;   // 特征宽
  var FH = 24;   // 特征高
  // FEATURE_VERSION 与本块实现绑定：改缩放/取色逻辑必须 +1（特征库与识别器要整体重建）
  var FEATURE_VERSION = 4;   // 4 = 36×24 白底等比居中 RGB，显式双线性重采样（Node/浏览器同码）

  // RGBA（4 字节/像素，sw×sh）→ 特征向量（长度 FW*FH*3 = 2592）
  // 等比缩放居中贴到 36×24 白底：双线性重采样 + alpha 加权合成到白底
  function featureOfRGBA(data, sw, sh) {
    var cv = new Uint8Array(FW * FH * 3).fill(255);
    var sc = Math.min(FW / sw, FH / sh);
    var dw = sw * sc, dh = sh * sc;
    var ox = (FW - dw) / 2, oy = (FH - dh) / 2;
    for (var y = 0; y < FH; y++) {
      for (var x = 0; x < FW; x++) {
        var fx = (x + 0.5 - ox) / sc - 0.5;
        var fy = (y + 0.5 - oy) / sc - 0.5;
        if (fx < -0.5 || fy < -0.5 || fx > sw - 0.5 || fy > sh - 0.5) continue;
        var x0 = Math.floor(fx), y0 = Math.floor(fy);
        var tx = fx - x0, ty = fy - y0;
        var r = 0, g = 0, b = 0, a = 0, wsum = 0;
        for (var j = 0; j <= 1; j++) {
          for (var i = 0; i <= 1; i++) {
            var wx = i ? tx : 1 - tx, wy = j ? ty : 1 - ty;
            var wt = wx * wy;
            if (wt <= 0) continue;
            var cx = Math.max(0, Math.min(sw - 1, x0 + i)), cy = Math.max(0, Math.min(sh - 1, y0 + j));
            var s = (cy * sw + cx) * 4;
            var sa = data[s + 3] / 255;
            r += data[s] * sa * wt; g += data[s + 1] * sa * wt; b += data[s + 2] * sa * wt;
            a += sa * wt; wsum += wt;
          }
        }
        if (wsum <= 0) continue;
        var aa = a / wsum;
        var t = (y * FW + x) * 3;
        cv[t] = Math.round(r / wsum + 255 * (1 - aa));
        cv[t + 1] = Math.round(g / wsum + 255 * (1 - aa));
        cv[t + 2] = Math.round(b / wsum + 255 * (1 - aa));
      }
    }
    return cv;
  }

  // 平均每通道绝对差，0~255 量纲
  function distFeature(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 3) {
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return sum / (a.length / 3) / 3;
  }
  /*==FEATURE-END==*/

  var UPDATED_AT = __UPDATED_AT__;
  var TABLE = __TABLE__;       // [{ heroId, heroName, feat: "base64(Uint8 2592)", count }]

  // 浏览器包装：按【原尺寸】把图取成 RGBA（不做任何缩放，缩放交给 featureOfRGBA）
  function featureOfImage(im) {
    var nw = im.naturalWidth || im.width;
    var nh = im.naturalHeight || im.height;
    var c = document.createElement("canvas");
    c.width = nw; c.height = nh;
    var x = c.getContext("2d");
    x.drawImage(im, 0, 0);
    var d = x.getImageData(0, 0, nw, nh).data;
    return featureOfRGBA(d, nw, nh);
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

  /** 已算好特征时同步识别：最近邻即答案 */
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
    return {
      matched: true,
      heroId: best.heroId,
      heroName: best.heroName,
      dist: Math.round(bestD * 100) / 100,
      secondDist: isFinite(secondD) ? Math.round(secondD * 100) / 100 : null,
      margin: isFinite(secondD) ? Math.round((secondD - bestD) * 100) / 100 : null,
      nearest: { heroId: best.heroId, heroName: best.heroName }
    };
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
    featureOfImage: featureOfImage,
    distFeature: distFeature,
    stats: function () {
      return {
        featureVersion: FEATURE_VERSION,
        tableSize: TABLE.length,
        dims: [FW, FH],
        updatedAt: UPDATED_AT
      };
    },
    table: TABLE,
    FW: FW,
    FH: FH
  };
})();
