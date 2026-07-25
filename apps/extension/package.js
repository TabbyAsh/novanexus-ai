#!/usr/bin/env node
/**
 * Build the Chrome Web Store upload for Nova Lens.
 *
 *   node apps/extension/package.js
 *   -> apps/extension/dist/nova-lens-v<version>.zip
 *
 * Writes the ZIP directly (deflate via zlib) so packaging never depends on a
 * `zip` binary or PowerShell being available on the machine.
 * Only the files Chrome actually loads are included — dev tooling stays out.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const SHIP = ['manifest.json', 'background.js', 'content.js', 'card.css',
  'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png'];

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// DOS time/date — fixed timestamp keeps the zip byte-stable across rebuilds
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function build() {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of SHIP) {
    const full = path.join(ROOT, name);
    if (!fs.existsSync(full)) throw new Error(`missing file: ${name} (run make-icons.js first?)`);
    const data = fs.readFileSync(full);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useStore = deflated.length >= data.length;
    const payload = useStore ? data : deflated;
    const method = useStore ? 0 : 8;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8'); // forward slashes: correct for ZIP

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);        // version made by
    central.writeUInt16LE(20, 6);        // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 38);        // external file attributes
    central.writeUInt32LE(offset, 42);  // relative offset of local header
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(SHIP.length, 8);
  end.writeUInt16LE(SHIP.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  const zip = Buffer.concat([...locals, centralBuf, end]);
  const outDir = path.join(ROOT, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `nova-lens-v${version}.zip`);
  fs.writeFileSync(out, zip);
  console.log(`built ${path.relative(process.cwd(), out)}  (${zip.length} bytes, ${SHIP.length} files, v${version})`);
  return out;
}

build();
