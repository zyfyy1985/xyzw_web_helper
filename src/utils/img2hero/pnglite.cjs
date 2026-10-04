/* ============================================================================
 * pnglite —— 极简 PNG 解码 / 编码（零依赖，纯 Node）
 *
 * 为什么不用 sharp / canvas：img2hero 这套工具要在裸 Node 下跑通，不引三方库。
 * 本文件只服务一个场景：把「图集里的一个矩形」抠出来、再原样存成 PNG。
 *
 * 解码：支持 bitDepth 1/2/4/8 × colorType 0(灰) / 2(RGB) / 3(调色板) / 4(灰+A) / 6(RGBA)
 *       —— 游戏导出的图这三种都出现过：图集是 RGBA，small_heads 是调色板，导出图是 RGB。
 * 编码：固定 RGBA8、filter 全 0（实现简单且对这类卡通图压缩率够好）。
 *       想要更小体积就用 encodeRGB（无 alpha，省 ~25%）。
 *
 * ⚠️ 已知不支持：16bit、交错(interlace)、APNG。遇到会直接抛错而不是静默出错。
 * ==========================================================================*/
"use strict";

// ── CRC32（PNG 每个 chunk 都要） ───────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 解码 PNG → { w, h, data }，data 为 RGBA8（长度 w*h*4），已把调色板/灰度统一展开。
 * @param {Buffer} buf PNG 字节
 */
function decodePNG(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("不是 PNG");
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const bd = buf[24];          // bitDepth
  const ct = buf[25];          // colorType
  const interlace = buf[28];
  if (interlace) throw new Error("不支持交错(interlace) PNG");
  if (![1, 2, 4, 8].includes(bd)) throw new Error("不支持的 bitDepth " + bd);

  const chan = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : ct === 0 ? 1 : ct === 3 ? 1 : 0;
  if (!chan) throw new Error("不支持的 colorType " + ct);
  const bits = ct === 3 ? bd : chan * bd;        // 每像素位数
  const fbpp = Math.max(1, Math.ceil(bits / 8)); // filter 用的「每像素字节数」（不足 1 算 1）

  // 收集数据块
  let o = 8, palette = null, trns = null;
  const idat = [];
  while (o + 12 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.slice(o + 4, o + 8).toString("ascii");
    const data = buf.slice(o + 8, o + 8 + len);
    if (type === "IDAT") idat.push(data);
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IEND") break;
    o += 12 + len;
  }
  const zlib = require("zlib");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = Math.ceil((w * bits) / 8);
  if (raw.length < h * (stride + 1)) throw new Error("IDAT 数据不足");

  // 逐行反 filter（PNG 的 5 种 filter 类型）
  const px = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= fbpp ? cur[x - fbpp] : 0;
      const b = prev[x];
      const c = x >= fbpp ? prev[x - fbpp] : 0;
      let v = line[x];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
    cur.copy(px, y * stride);
    prev = cur;
  }

  // 统一展开成 RGBA
  const rgba = Buffer.alloc(w * h * 4);
  if (ct === 3) {                                  // 调色板
    if (!palette) throw new Error("调色板图缺 PLTE");
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let idx;
        if (bd === 8) idx = px[y * stride + x];
        else {
          const bp = x * bd, byte = px[y * stride + (bp >> 3)];
          idx = (byte >> (8 - bd - (bp & 7))) & ((1 << bd) - 1);
        }
        const d = (y * w + x) * 4;
        rgba[d] = palette[idx * 3];
        rgba[d + 1] = palette[idx * 3 + 1];
        rgba[d + 2] = palette[idx * 3 + 2];
        rgba[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
      }
    }
    return { w, h, data: rgba };
  }
  for (let i = 0, n = w * h; i < n; i++) {
    const s = i * chan, d = i * 4;
    if (chan === 4) { rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = px[s + 3]; }
    else if (chan === 3) { rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = 255; }
    else if (chan === 2) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = px[s + 1]; }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = 255; }
  }
  return { w, h, data: rgba };
}

/** 拼一个 PNG chunk（长度 + 类型 + 数据 + CRC） */
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/**
 * RGBA8 → PNG 字节
 * @param {number} w @param {number} h
 * @param {Buffer} rgba 长度必须 = w*h*4
 */
function encodePNG(w, h, rgba) {
  if (!Buffer.isBuffer(rgba)) rgba = Buffer.from(rgba);
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;                     // filter = 0 (None)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const zlib = require("zlib");
  return Buffer.concat([PNG_SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * RGBA8 → 合成到白底后的 RGB PNG（体积比 RGBA 小 ~25%）
 * 游戏头像四周大片透明，存成 RGB 更省；代价是丢掉透明度信息。
 * @param {Buffer} rgba
 * @param {number} [bg] 背景色，默认白 0xffffff
 */
function encodeRGBFromRGBA(w, h, rgba, bg) {
  const c = bg === undefined ? 0xffffff : bg;
  const bR = (c >> 16) & 255, bG = (c >> 8) & 255, bB = c & 255;
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, n = w * h; i < n; i++) {
    const s = i * 4, d = i * 3, a = rgba[s + 3], ia = 255 - a;
    rgb[d] = (rgba[s] * a + bR * ia) / 255 | 0;
    rgb[d + 1] = (rgba[s + 1] * a + bG * ia) / 255 | 0;
    rgb[d + 2] = (rgba[s + 2] * a + bB * ia) / 255 | 0;
  }
  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const zlib = require("zlib");
  return Buffer.concat([PNG_SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** 读 PNG 头拿尺寸（不解码像素，做快速探测用） */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

module.exports = { decodePNG, encodePNG, encodeRGBFromRGBA, pngSize, crc32 };
