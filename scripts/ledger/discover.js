/**
 * Find the financial exports without being told where they are.
 *
 * Downloading a file already puts it somewhere predictable. Asking someone to
 * then locate it, rename it and move it into a folder is three chances to give
 * up, so instead we look in the places browsers save things and identify the
 * financial CSVs by their SHAPE — a date column plus an amount column — rather
 * than by filename, which is never what you expect.
 *
 * Read-only: files are examined where they sit and never moved or copied.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseCsv } = require('./csv');
const { buildMapping } = require('./normalize');

const HOME = os.homedir();
const SEARCH_DIRS = [
  path.join(HOME, 'Downloads'),
  path.join(HOME, 'Desktop'),
  path.join(HOME, 'Documents'),
  path.join(HOME, 'OneDrive', 'Downloads'),
  path.join(HOME, 'OneDrive', 'Desktop'),
  path.join(HOME, 'OneDrive', 'Documents'),
];

const MAX_AGE_DAYS = 180;
const MAX_BYTES = 25 * 1024 * 1024;

/** Does this CSV look like money? A date column and something amount-shaped. */
function looksFinancial(headers) {
  const m = buildMapping(headers, '');
  const hasDate = !!m.dateCol;
  const hasAmount = !!m.amountCol || (!!m.debitCol && !!m.creditCol);
  return { ok: hasDate && hasAmount, mapping: m };
}

/** Guess who produced it, for a friendlier label. */
function guessInstitution(filename, headers) {
  const f = String(filename).toLowerCase();
  const H = headers.map((h) => String(h).toLowerCase()).join(' ');
  if (f.includes('webull')) return 'Webull';
  if (f.includes('cashapp') || f.includes('cash_app') || f.includes('cash app')) return 'Cash App';
  if (f.includes('chase')) return 'Chase';
  if (f.includes('paypal')) return 'PayPal';
  if (f.includes('venmo')) return 'Venmo';
  if (f.includes('coinbase')) return 'Coinbase';
  if (f.includes('robinhood')) return 'Robinhood';
  if (H.includes('symbol')) return 'a brokerage';
  return 'a bank or card';
}

function scanDir(dir, out, seen) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/\.csv$/i.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (seen.has(full.toLowerCase())) continue;
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.size > MAX_BYTES || st.size < 20) continue;
    const ageDays = (Date.now() - st.mtimeMs) / 86400000;
    if (ageDays > MAX_AGE_DAYS) continue;

    let headers, records;
    try {
      const text = fs.readFileSync(full, 'utf8');
      ({ headers, records } = parseCsv(text));
    } catch { continue; }
    if (!headers || headers.length < 2 || records.length === 0) continue;

    const { ok, mapping } = looksFinancial(headers);
    if (!ok) continue;

    seen.add(full.toLowerCase());
    out.push({
      path: full,
      name: e.name,
      dir,
      rows: records.length,
      modified: new Date(st.mtimeMs).toISOString().slice(0, 10),
      institution: guessInstitution(e.name, headers),
      mapping,
      headers,
      records,
    });
  }
}

/** Every financial-looking CSV in the usual places, newest first. */
function discover(extraDirs) {
  const out = [];
  const seen = new Set();
  for (const dir of [...(extraDirs || []), ...SEARCH_DIRS]) scanDir(dir, out, seen);
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

module.exports = { discover, looksFinancial, guessInstitution, SEARCH_DIRS };
