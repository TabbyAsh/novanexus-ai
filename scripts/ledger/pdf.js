/**
 * Get text out of a bank statement PDF.
 *
 * Two kinds arrive. Most are text-based and `pdftotext` reads them directly.
 * Some — anything scanned, screenshotted, or produced by a teller machine —
 * contain no text at all, only a picture of the page. Those are carved out as
 * PNGs and passed to Tesseract.
 *
 * OCR'd money is never trusted on its own; see statements.js, which rebuilds
 * every amount from the running balance and reports what failed to reconcile.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync, execSync } = require('child_process');

const TESSERACT_CANDIDATES = [
  'tesseract',
  'C:/Program Files/Tesseract-OCR/tesseract.exe',
  'C:/Program Files (x86)/Tesseract-OCR/tesseract.exe',
];

function which(cmd) {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function findTesseract() {
  for (const c of TESSERACT_CANDIDATES) {
    if (c.includes('/') || c.includes('\\')) { if (fs.existsSync(c)) return c; }
    else if (which(c)) return c;
  }
  return null;
}

/**
 * Text layer via pdftotext. `-table` is tried first and matters enormously:
 * with `-layout`, a wrapped description cell bleeds into neighbouring rows, so
 * amounts end up attached to the wrong transaction — a payroll DEPOSIT was
 * being read onto a purchase line. `-table` keeps each row intact.
 */
function extractTextLayer(pdfPath) {
  if (!which('pdftotext')) return { text: '', tool: null };
  for (const mode of ['-table', '-layout']) {
    const out = path.join(os.tmpdir(), `nova-ledger-${Date.now()}-${mode.slice(1)}.txt`);
    try {
      execFileSync('pdftotext', [mode, pdfPath, out], { stdio: 'ignore', timeout: 120000 });
      const text = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
      try { fs.unlinkSync(out); } catch {}
      if (text && text.replace(/\s/g, '').length > 200) return { text, tool: `pdftotext ${mode}` };
    } catch { /* try the next mode */ }
  }
  return { text: '', tool: 'pdftotext' };
}

// ── PNG writing, so carved images can be handed to OCR ─────────────────────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePng(file, width, height, channels, bpc, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bpc; ihdr[9] = channels === 3 ? 2 : 0;
  const stride = width * channels;
  const rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    rows[y * (stride + 1)] = 0;
    pixels.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

/** Every FlateDecode image in the PDF, written out as PNGs. */
function extractImages(pdfPath, outDir) {
  const buf = fs.readFileSync(pdfPath);
  const s = buf.toString('latin1');
  const files = [];
  let idx = 0, from = 0;

  while (true) {
    const at = s.indexOf('/Subtype /Image', from);
    if (at < 0) break;
    from = at + 10;
    const dictEnd = s.indexOf('>>', at);
    if (dictEnd < 0) continue;
    const dict = s.slice(Math.max(0, at - 200), dictEnd);
    const num = (k) => { const m = dict.match(new RegExp('/' + k + '\\s+(\\d+)')); return m ? parseInt(m[1], 10) : null; };
    const width = num('Width'), height = num('Height'), length = num('Length');
    const bpc = num('BitsPerComponent') || 8;
    const cs = (dict.match(/\/ColorSpace\s*\/(\w+)/) || [])[1];
    const filter = (dict.match(/\/Filter\s*\/(\w+)/) || [])[1];
    if (!width || !height || !length || filter !== 'FlateDecode') continue;

    let p = s.indexOf('stream', dictEnd);
    if (p < 0) continue;
    p += 'stream'.length;
    if (s[p] === '\r') p++;
    if (s[p] === '\n') p++;

    let pixels;
    try { pixels = zlib.inflateSync(buf.subarray(p, p + length)); } catch { continue; }
    const channels = cs === 'DeviceRGB' ? 3 : cs === 'DeviceGray' ? 1 : 3;
    if (pixels.length < width * height * channels) continue;

    const file = path.join(outDir, `page${++idx}.png`);
    writePng(file, width, height, channels, bpc, pixels);
    files.push(file);
  }
  return files;
}

/** OCR a PNG. Returns '' when Tesseract is unavailable. */
function ocrImage(pngPath, tesseract) {
  const base = pngPath.replace(/\.png$/i, '_ocr');
  try {
    execFileSync(tesseract, [pngPath, base], { stdio: 'ignore', timeout: 180000 });
    const txt = base + '.txt';
    const text = fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8') : '';
    try { fs.unlinkSync(txt); } catch {}
    return text;
  } catch { return ''; }
}

/**
 * Text for a statement PDF, whichever kind it is.
 * Returns { text, method, pages, warnings }.
 */
function readPdf(pdfPath) {
  const warnings = [];
  const { text } = extractTextLayer(pdfPath);
  if (text && text.replace(/\s/g, '').length > 200) {
    return { text, method: 'text-layer', pages: null, warnings };
  }

  const tesseract = findTesseract();
  if (!tesseract) {
    warnings.push('This PDF is a scan with no text in it, and Tesseract OCR was not found. Install Tesseract, or ask the bank for a CSV.');
    return { text: '', method: 'none', pages: 0, warnings };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-ledger-'));
  try {
    const images = extractImages(pdfPath, tmp);
    if (images.length === 0) {
      warnings.push('No readable text and no extractable page images — this PDF format is not supported. Ask the bank for a CSV.');
      return { text: '', method: 'none', pages: 0, warnings };
    }
    const parts = images.map((img) => ocrImage(img, tesseract));
    warnings.push(`Read by OCR from ${images.length} scanned page${images.length === 1 ? '' : 's'} — every amount is re-derived from the running balance and checked.`);
    return { text: parts.join('\n'), method: 'ocr', pages: images.length, warnings };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { readPdf, extractTextLayer, extractImages, findTesseract, which };
