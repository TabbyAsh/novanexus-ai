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
const { extractTextLayer } = require('./pdf');

const HOME = os.homedir();
const FOLDERS = ['Downloads', 'Desktop', 'Documents'];

/**
 * Downloads is not always under the home directory — a second drive is a
 * common setup, and a tool that only looks in C:\Users\<name> will report
 * "found nothing" while the statements sit in D:\Kibble\Downloads. So the
 * usual places are checked, then every fixed drive one level deep.
 * Override entirely with NOVA_LEDGER_DIRS="D:/somewhere;E:/else".
 */
function searchDirs() {
  const dirs = [];
  for (const f of FOLDERS) {
    dirs.push(path.join(HOME, f));
    dirs.push(path.join(HOME, 'OneDrive', f));
  }

  const fromEnv = String(process.env.NOVA_LEDGER_DIRS || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  dirs.unshift(...fromEnv);

  if (process.platform === 'win32') {
    for (const letter of 'DEFGH') {
      const root = `${letter}:\\`;
      let top;
      try { top = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
      for (const f of FOLDERS) dirs.push(path.join(root, f));
      for (const e of top) {
        if (!e.isDirectory()) continue;
        if (/^(\$|Windows|Program Files|System Volume)/i.test(e.name)) continue;
        for (const f of FOLDERS) dirs.push(path.join(root, e.name, f));
      }
    }
  }
  return [...new Set(dirs)];
}

const SEARCH_DIRS = searchDirs();

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

/** A PDF worth opening: says statement-ish things, or is named that way. */
function pdfLooksFinancial(full, name) {
  const { text } = extractTextLayer(full);
  if (text && text.replace(/\s/g, '').length > 200) {
    // A single word like "balance" or "account" appears in plenty of ordinary
    // documents, so require several distinct banking signals AND a column of
    // actual money amounts. Otherwise every business ebook in Downloads
    // registers as a bank statement.
    const signals = ['statement', 'balance', 'deposit', 'withdrawal', 'transaction', 'account summary', 'posted', 'available balance']
      .filter((w) => new RegExp(w, 'i').test(text)).length;
    const amounts = (text.match(/\$\s?\d{1,3}(?:,\d{3})*\.\d{2}/g) || []).length;
    return signals >= 3 && amounts >= 5;
  }
  // No text layer — it is a scan, and only OCR could tell. Judge by the name
  // rather than OCR'ing every PDF in Downloads, which would take minutes.
  return /statement|bank|account|checking|savings|credit|transaction/i.test(name);
}

function scanDir(dir, out, seen) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const isPdf = /\.pdf$/i.test(e.name);
    if (!/\.csv$/i.test(e.name) && !isPdf) continue;
    const full = path.join(dir, e.name);

    if (isPdf) {
      if (seen.has(full.toLowerCase())) continue;
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (st.size > MAX_BYTES || st.size < 200) continue;
      if ((Date.now() - st.mtimeMs) / 86400000 > MAX_AGE_DAYS) continue;
      if (!pdfLooksFinancial(full, e.name)) continue;
      seen.add(full.toLowerCase());
      out.push({
        kind: 'pdf',
        path: full,
        name: e.name,
        dir,
        rows: null,
        modified: new Date(st.mtimeMs).toISOString().slice(0, 10),
        institution: guessInstitution(e.name, []),
      });
      continue;
    }

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
      kind: 'csv',
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
