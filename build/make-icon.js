'use strict';

// Gera build/icon.png e build/icon.ico (256..16) sem dependências.
// PNG via zlib nativo + CRC32 próprio; ICO embutindo PNGs (Vista+).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'build');
fs.mkdirSync(OUT, { recursive: true });

// ------------------------------------------------ PNG
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------ arte
function roundRect(px, py, x0, y0, x1, y1, r) {
  const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  const dx = Math.max(x0 + rr - px, px - (x1 - rr), 0);
  const dy = Math.max(y0 + rr - py, py - (y1 - rr), 0);
  return Math.hypot(dx, dy) <= rr;
}
function ellipse(px, py, cx, cy, rx, ry) {
  return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
}
function rect(px, py, x0, y0, x1, y1) {
  return px >= x0 && px < x1 && py >= y0 && py < y1;
}

// retorna [r,g,b,a] em 0..255 para coordenada (2x supersampling por camada)
function colorAt(x, y) {
  // fundo transparente
  let col = [0, 0, 0, 0];
  const S = 260; // espaço de desenho

  // painel redondo escuro
  if (roundRect(x, y, 14, 14, S - 14, S - 14, 52)) {
    const g = 0.86 + 0.14 * (y / S); // leve gradiente
    col = [Math.round(18 * g), Math.round(27 * g), Math.round(44 * g), 255];
  } else {
    return col;
  }

  const inXX = (a, b) => x >= a && x < b;

  // pão superior (semi-elipse + retângulo)
  if (ellipse(x, y, S / 2, 92, 84, 74) || (inXX(44, S - 44) && y >= 70 && y < 116)) {
    const d = Math.round(15 + 20 * (y / S));
    col = [0xEF, 0xC2, 0x6B];
    col = [Math.min(255, col[0] + d), Math.min(255, col[1] + d), Math.min(255, col[2] + d), 255];
  }
  // queijo derretido
  if (inXX(38, S - 38) && y >= 122 && y < 140) {
    col = [0xF7, 0xC9, 0x3A, 255];
  }
  // alface
  if (inXX(46, S - 46) && y >= 152 && y < 166) {
    col = [0x42, 0xB3, 0x54, 255];
  }
  // carne (retângulo arredondado)
  if (roundRect(x, y, 42, 172, S - 42, 210, 16)) {
    col = [0x6E, 0x3A, 0x20, 255];
  }
  // tomate
  if (inXX(50, S - 50) && y >= 176 && y < 200 && col[0] === 0x6E) {
    col = [0xD8, 0x44, 0x35, 255];
  }
  // pão inferior
  if (roundRect(x, y, 48, 222, S - 48, 250, 16)) {
    col = [0xE3, 0xB3, 0x56, 255];
  }
  return col;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // supersampling 3x3
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const X = ((x * 3 + sx + 0.5) / (size * 3)) * 260;
          const Y = ((y * 3 + sy + 0.5) / (size * 3)) * 260;
          const c = colorAt(X, Y);
          r += c[0]; g += c[1]; b += c[2]; a += c[3];
        }
      }
      const n = 9;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return { rgba, png: encodePNG(size, size, rgba) };
}

const sizes = [256, 128, 64, 48, 32, 16];
const pngs = {};
for (const s of sizes) pngs[s] = render(s);

// PNG 256 p/ pasta build
fs.writeFileSync(path.join(OUT, 'icon.png'), pngs[256].png);

// ------------------------------------------------- ICO
const count = sizes.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // type: ícone
header.writeUInt16LE(count, 4);

const entries = [];
let offset = 6 + 16 * count;
for (const s of sizes) {
  const png = pngs[s].png;
  const e = Buffer.alloc(16);
  e[0] = s >= 256 ? 0 : s;
  e[1] = s >= 256 ? 0 : s;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4);  // planos
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += png.length;
}
const ico = Buffer.concat([header, ...entries, ...sizes.map(s => pngs[s].png)]);
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico);

console.log('Ícones gerados em', OUT, `(ico ${ico.length} bytes)`);