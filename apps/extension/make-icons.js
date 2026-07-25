#!/usr/bin/env node
/**
 * Nova Lens icon generator.
 *
 * The Chrome Web Store requires real PNGs and this machine has no image
 * libraries, so the encoder is written out longhand against Node's zlib.
 * The mark is the nova itself — a luminous core with four diffraction
 * spikes — because a glyph survives 16px and a letterform does not.
 *
 *   node apps/extension/make-icons.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── minimal PNG encoder (RGBA, 8-bit, no interlace) ────────────────────────
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
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // each scanline is prefixed with filter byte 0 (None)
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── the mark ───────────────────────────────────────────────────────────────
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const R = size / 2;
  // rounded-square backdrop, deep space blue
  const radius = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - c;
      const dy = y - c;

      // rounded rect coverage (signed distance)
      const qx = Math.abs(dx) - (R - radius);
      const qy = Math.abs(dy) - (R - radius);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
      const cover = 1 - smoothstep(-0.9, 0.6, outside);
      if (cover <= 0.001) continue;

      // backdrop gradient: lighter toward the top
      const g = clamp01(0.5 - dy / (size * 1.6));
      let r = 4 + 12 * g;
      let gg = 18 + 26 * g;
      let b = 34 + 44 * g;

      // the nova: core glow + four diffraction spikes
      const dist = Math.hypot(dx, dy) / R;               // 0..1
      const core = Math.exp(-Math.pow(dist / 0.17, 2));  // gaussian core
      const halo = Math.exp(-Math.pow(dist / 0.52, 2)) * 0.42;

      const ax = Math.abs(dx) / R;
      const ay = Math.abs(dy) / R;
      // horizontal + vertical spikes, tapering with distance
      const spikeH = Math.exp(-Math.pow(ay / 0.055, 2)) * Math.max(0, 1 - ax / 0.92);
      const spikeV = Math.exp(-Math.pow(ax / 0.055, 2)) * Math.max(0, 1 - ay / 0.92);
      // diagonal spikes, softer
      const du = Math.abs(dx - dy) / (R * 1.414);
      const dv = Math.abs(dx + dy) / (R * 1.414);
      const diag = (Math.exp(-Math.pow(du / 0.05, 2)) + Math.exp(-Math.pow(dv / 0.05, 2)))
        * Math.max(0, 1 - dist / 0.85) * 0.32;

      const light = clamp01(core * 1.25 + halo + (spikeH + spikeV) * 0.85 + diag);

      // cyan → white as it brightens (#7dd8ff toward #eafcff)
      r = r + light * (234 - r) * Math.pow(light, 0.75) + light * 30;
      gg = gg + light * (252 - gg) * Math.pow(light, 0.55) + light * 70;
      b = b + light * (255 - b) * Math.pow(light, 0.35) + light * 90;

      buf[i] = Math.min(255, Math.round(r));
      buf[i + 1] = Math.min(255, Math.round(gg));
      buf[i + 2] = Math.min(255, Math.round(b));
      buf[i + 3] = Math.round(255 * cover);
    }
  }
  return buf;
}

const outDir = path.join(__dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = encodePNG(size, size, drawIcon(size));
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png  ${png.length} bytes`);
}
console.log('done');
