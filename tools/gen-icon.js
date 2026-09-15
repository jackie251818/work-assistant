/**
 * 应用图标生成器（零依赖）
 * 在 512x512 超采样画布上绘制，再降采样输出：
 *   assets/icon.png  256x256（打包/通知用）
 *   assets/tray.png  32x32  （托盘用）
 *   assets/icon.ico  多尺寸 16~256（exe/安装包图标）
 * 大尺寸图案：深蓝圆角底 + 青色描边 + 日历任务卡片
 * 小尺寸图案：深蓝圆角底 + 简洁青色对勾（保证 16/24/32 下清晰）
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------- PNG 编码 ---------------- */
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

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/** 多尺寸 ICO（图像数据直接内嵌 PNG，Vista+ 支持） */
function encodeICO(sizes, pngs) {
  const n = sizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(n, 4);
  const entries = [];
  let offset = 6 + 16 * n;
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s;
    e[1] = s >= 256 ? 0 : s;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += pngs[i].length;
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}

/** macOS ICNS：把多个尺寸的 PNG 打包（icp4~icp9 + ic10） */
function encodeICNS(sizes, pngs) {
  const typeMap = {
    16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'icp7',
    256: 'icp8', 512: 'icp9', 1024: 'ic10'
  };
  const entries = [];
  let totalSize = 8; // 'icns' + 文件大小
  sizes.forEach((s, i) => {
    const type = typeMap[s];
    if (!type) return;
    const data = pngs[i];
    const entrySize = 8 + data.length;
    const entry = Buffer.alloc(entrySize);
    entry.write(type, 0, 'ascii');
    entry.writeUInt32BE(entrySize, 4);
    data.copy(entry, 8);
    entries.push(entry);
    totalSize += entrySize;
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(totalSize, 4);
  return Buffer.concat([header, ...entries]);
}

/* ---------------- 画布 ---------------- */
class Canvas {
  constructor(size) {
    this.s = size;
    this.buf = Buffer.alloc(size * size * 4);
  }
  setPx(x, y, r, g, b, a) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.s || y >= this.s || a <= 0) return;
    const i = (y * this.s + x) * 4;
    if (a >= 255) {
      this.buf[i] = r;
      this.buf[i + 1] = g;
      this.buf[i + 2] = b;
      this.buf[i + 3] = 255;
    } else {
      const sa = a / 255;
      const da = this.buf[i + 3] / 255;
      const outA = sa + da * (1 - sa);
      if (outA <= 0) return;
      this.buf[i] = Math.round((r * sa + this.buf[i] * da * (1 - sa)) / outA);
      this.buf[i + 1] = Math.round((g * sa + this.buf[i + 1] * da * (1 - sa)) / outA);
      this.buf[i + 2] = Math.round((b * sa + this.buf[i + 2] * da * (1 - sa)) / outA);
      this.buf[i + 3] = Math.round(outA * 255);
    }
  }
  fillRect(x0, y0, x1, y1, color, alpha = 255) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        this.setPx(x, y, color[0], color[1], color[2], alpha);
  }
  fillRR(x0, y0, x1, y1, r, color, alpha = 255) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
        const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) this.setPx(x, y, color[0], color[1], color[2], alpha);
      }
    }
  }
  strokeRR(x0, y0, x1, y1, r, w, color, alpha = 255) {
    for (let y = y0 - w; y <= y1 + w; y++) {
      for (let x = x0 - w; x <= x1 + w; x++) {
        const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
        const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r && d >= r - w) this.setPx(x, y, color[0], color[1], color[2], alpha);
      }
    }
  }
  fillCircle(cx, cy, rad, color, alpha = 255) {
    for (let y = cy - rad; y <= cy + rad; y++)
      for (let x = cx - rad; x <= cx + rad; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rad * rad) this.setPx(x, y, color[0], color[1], color[2], alpha);
      }
  }
  ring(cx, cy, outer, inner, color, alpha = 255) {
    for (let y = cy - outer; y <= cy + outer; y++)
      for (let x = cx - outer; x <= cx + outer; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= outer && d >= inner) this.setPx(x, y, color[0], color[1], color[2], alpha);
      }
  }
  /** 粗线段（胶囊端点） */
  line(x0, y0, x1, y1, w, color, alpha = 255) {
    const minX = Math.min(x0, x1) - w;
    const maxX = Math.max(x0, x1) + w;
    const minY = Math.min(y0, y1) - w;
    const maxY = Math.max(y0, y1) + w;
    const len2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let t = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = x0 + (x1 - x0) * t;
        const py = y0 + (y1 - y0) * t;
        if (Math.hypot(x - px, y - py) <= w / 2)
          this.setPx(x, y, color[0], color[1], color[2], alpha);
      }
    }
  }
  downscale(target) {
    const k = this.s / target;
    const out = Buffer.alloc(target * target * 4);
    for (let y = 0; y < target; y++) {
      for (let x = 0; x < target; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        const sx = Math.round(x * k), sy = Math.round(y * k), ex = Math.round((x + 1) * k), ey = Math.round((y + 1) * k);
        let n = 0;
        for (let yy = sy; yy < ey; yy++)
          for (let xx = sx; xx < ex; xx++) {
            const i = (Math.min(yy, this.s - 1) * this.s + Math.min(xx, this.s - 1)) * 4;
            r += this.buf[i]; g += this.buf[i + 1]; b += this.buf[i + 2]; a += this.buf[i + 3]; n++;
          }
        const o = (y * target + x) * 4;
        out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
      }
    }
    return out;
  }
}

/* ---------------- 绘制（设计坐标 256，超采样由参数 S 控制） ---------------- */
function drawBackground(c, P) {
  const top = [0x16, 0x29, 0x47];
  const bottom = [0x0a, 0x10, 0x22];
  for (let y = P(12); y <= P(244); y++) {
    const t = (y - P(12)) / P(232);
    const col = [
      Math.round(top[0] + (bottom[0] - top[0]) * t),
      Math.round(top[1] + (bottom[1] - top[1]) * t),
      Math.round(top[2] + (bottom[2] - top[2]) * t)
    ];
    for (let x = P(12); x <= P(244); x++) {
      const cx0 = x < P(64) ? P(64) : x > P(192) ? P(192) : x;
      const cy0 = y < P(64) ? P(64) : y > P(192) ? P(192) : y;
      if (Math.hypot(x - cx0, y - cy0) <= P(52)) c.setPx(x, y, col[0], col[1], col[2], 255);
    }
  }
  c.strokeRR(P(12), P(12), P(244), P(244), P(52), P(4), [0x22, 0xd3, 0xee], 170);
}

function drawCalendar(c, P) {
  // 满卡青色 + 白色覆盖下半
  c.fillRR(P(62), P(74), P(194), P(196), P(16), [0x06, 0xb6, 0xd4]);
  c.fillRect(P(62), P(108), P(194), P(196), [0xf8, 0xfa, 0xfc]);
  c.fillRR(P(62), P(180), P(194), P(196), P(16), [0xf8, 0xfa, 0xfc]);
  c.fillRect(P(193), P(110), P(194), P(180), [0xd9, 0xe2, 0xec]);
  // 挂环
  c.ring(P(104), P(74), P(13), P(7), [0x0e, 0x74, 0x90]);
  c.ring(P(152), P(74), P(13), P(7), [0x0e, 0x74, 0x90]);
  // 任务行
  const rows = [
    { y: 132, x2: 172 },
    { y: 154, x2: 160 },
    { y: 176, x2: 142 }
  ];
  for (const row of rows) {
    c.fillCircle(P(87), P(row.y), P(6), [0x06, 0xb6, 0xd4]);
    c.fillRR(P(104), P(row.y - 5), P(row.x2), P(row.y + 5), P(5), [0xc4, 0xcf, 0xde]);
  }
}

function drawCheck(c, P) {
  // 青色圆形底
  c.fillCircle(P(128), P(130), P(72), [0x06, 0xb6, 0xd4], 235);
  // 深色对勾（粗线段胶囊）
  c.line(P(92), P(132), P(116), P(158), P(20), [0x07, 0x1a, 0x2c], 255);
  c.line(P(116), P(158), P(168), P(98), P(20), [0x07, 0x1a, 0x2c], 255);
}

/* ---------------- 生成 ---------------- */
const SS = 512; // 超采样画布
const P = (v) => Math.round((v / 256) * SS);

const fullCanvas = new Canvas(SS);
drawBackground(fullCanvas, P);
drawCalendar(fullCanvas, P);

const simpleCanvas = new Canvas(SS);
drawBackground(simpleCanvas, P);
drawCheck(simpleCanvas, P);

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

fs.writeFileSync(
  path.join(assetsDir, 'icon.png'),
  encodePNG(256, 256, fullCanvas.downscale(256))
);
fs.writeFileSync(
  path.join(assetsDir, 'tray.png'),
  encodePNG(32, 32, simpleCanvas.downscale(32))
);

// ICO：小尺寸简洁对勾，大尺寸完整日历
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = icoSizes.map((s) => {
  const src = s <= 48 ? simpleCanvas : fullCanvas;
  return encodePNG(s, s, src.downscale(s));
});
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), encodeICO(icoSizes, icoPngs));

// ICNS：macOS 应用图标（16~512，小尺寸用简洁对勾，大尺寸用完整日历）
const icnsSizes = [16, 32, 64, 128, 256, 512];
const icnsPngs = icnsSizes.map((s) => {
  const src = s <= 48 ? simpleCanvas : fullCanvas;
  return encodePNG(s, s, src.downscale(s));
});
fs.writeFileSync(path.join(assetsDir, 'icon.icns'), encodeICNS(icnsSizes, icnsPngs));

console.log(
  '图标已生成: icon.png, tray.png, icon.ico (' + icoSizes.join('/') +
  '), icon.icns (' + icnsSizes.join('/') + ')'
);
