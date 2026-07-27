/**
 * A CSV parser that survives real bank exports.
 *
 * Written out rather than pulled in: this file reads financial data, and a
 * dependency-free parser is one less package with access to it. Handles quoted
 * fields, embedded commas and newlines, escaped quotes, BOMs and CRLF — all of
 * which appear in genuine exports from banks and brokerages.
 */

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Parse CSV text into an array of string arrays. */
function parseRows(text) {
  const src = stripBom(String(text || ''));
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  // trailing field / row (files often lack a final newline)
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

/**
 * Parse into objects keyed by header. Some exports (notably brokerages) put a
 * title or disclaimer above the real header, so the header row is located by
 * finding the first row whose cells are mostly short, non-numeric labels.
 */
function parseCsv(text) {
  const rows = parseRows(text);
  if (rows.length === 0) return { headers: [], records: [], headerIndex: -1 };

  let headerIndex = 0;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = rows[r].map((c) => String(c).trim());
    if (cells.length < 2) continue;
    const named = cells.filter((c) => c !== '' && !isNumericLike(c)).length;
    if (named >= Math.max(2, Math.ceil(cells.length * 0.6))) { headerIndex = r; break; }
  }

  const headers = rows[headerIndex].map((h) => String(h).trim());
  const records = [];
  for (let r = headerIndex + 1; r < rows.length; r++) {
    const cells = rows[r];
    // skip repeated headers and obvious footers
    if (cells.length === 1) continue;
    const rec = {};
    for (let c = 0; c < headers.length; c++) rec[headers[c]] = (cells[c] == null ? '' : String(cells[c]).trim());
    records.push(rec);
  }
  return { headers, records, headerIndex };
}

function isNumericLike(s) {
  const t = String(s).replace(/[$,()\s]/g, '');
  return t !== '' && Number.isFinite(Number(t));
}

/** "$1,234.56", "(45.00)", "-12.30 USD" → 1234.56, -45, -12.3 */
function parseMoney(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '' || /^(n\/?a|none|null|--?)$/i.test(s)) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /\bDR\b/i.test(s);
  s = s.replace(/[()]/g, '').replace(/[A-Za-z]/g, '').replace(/[$,\s]/g, '').replace(/^-/, '');
  if (s === '' || !Number.isFinite(Number(s))) return null;
  const v = Number(s);
  return negative ? -v : v;
}

/** Dates arrive as ISO, US, or with times attached. Returns YYYY-MM-DD or null. */
function parseDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);              // 2026-07-25
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);            // 07/25/2026 (US)
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/);      // 07/25/26
  if (m) return `20${m[3]}-${pad(m[1])}-${pad(m[2])}`;

  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);  // Jul 25, 2026
  if (m) {
    const mm = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${pad(m[2])}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

module.exports = { parseRows, parseCsv, parseMoney, parseDate, isNumericLike };
