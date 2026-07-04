// 零依赖 PNG 生成器：为「随手记」画粉色渐变 + 白色爱心的应用图标
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'claude-my-product');

/* ---------- CRC32 ---------- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 绘制 ---------- */
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// 渐变端点（135°）：樱花粉 -> 奶杏橙
const C1 = [255, 158, 196];
const C2 = [255, 200, 162];

// 经典心形不等式：在内部返回 true（y 轴向上）
function inHeart(x, yv) {
  const a = x * x + yv * yv - 1;
  return a * a * a - x * x * yv * yv * yv <= 0;
}

function makeIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const rad = maskable ? 0 : size * 0.22;            // 圆角；maskable 满版
  const cx = size / 2;
  const cyHeart = size * 0.50;
  const hs = size * (maskable ? 0.235 : 0.265);      // 爱心缩放（maskable 留安全区）
  const SS = 4;                                       // 超采样抗锯齿

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;

      // 背景渐变（135°）
      const t = clamp01((px + py) / (2 * size));
      let r = lerp(C1[0], C2[0], t), g = lerp(C1[1], C2[1], t), b = lerp(C1[2], C2[2], t);

      // 圆角方形 alpha（抗锯齿）
      let bgA = 1;
      if (rad > 0) {
        const dx = Math.max(rad - px, px - (size - rad), 0);
        const dy = Math.max(rad - py, py - (size - rad), 0);
        if (dx > 0 && dy > 0) {
          const d = Math.sqrt(dx * dx + dy * dy);
          bgA = clamp01(rad - d + 0.5);
        }
      }

      // 白色爱心 —— 超采样覆盖率
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS - cx) / hs;
          const yv = (cyHeart - (py + (sy + 0.5) / SS)) / hs;
          if (inHeart(x, yv)) hit++;
        }
      }
      const cov = hit / (SS * SS);
      if (cov > 0) { r = lerp(r, 255, cov); g = lerp(g, 255, cov); b = lerp(b, 255, cov); }

      rgba[i] = r | 0; rgba[i + 1] = g | 0; rgba[i + 2] = b | 0;
      rgba[i + 3] = Math.round(bgA * 255);
    }
  }
  return encodePNG(size, size, rgba);
}

const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
  ['favicon-64.png', 64, false],
];
jobs.forEach(([name, size, mask]) => {
  fs.writeFileSync(path.join(OUT, name), makeIcon(size, mask));
  console.log('wrote', name, size + 'x' + size);
});
console.log('done');
