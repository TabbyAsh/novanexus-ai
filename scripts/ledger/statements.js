/**
 * Read a bank statement's transaction table out of plain text.
 *
 * THE CENTRAL IDEA: never trust the amount column.
 *
 * On a scanned statement, OCR will eventually misread a digit, and a wrong
 * amount silently corrupts every figure downstream. But statements carry a
 * RUNNING BALANCE, and that column is chained — so each amount can be rebuilt
 * as (this balance − previous balance), and the OCR'd amount then becomes a
 * check on that arithmetic rather than the source of it. When the two disagree
 * the row is flagged instead of quietly believed.
 *
 * That also removes the need to know which column is "withdrawal" and which is
 * "deposit", which every bank lays out differently: the sign of the balance
 * change already says which it was.
 */

const MONEY = /-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g;
const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

const toNum = (tok) => {
  const neg = /^-/.test(String(tok).trim());
  const v = Number(String(tok).replace(/[-$,\s]/g, ''));
  return Number.isFinite(v) ? (neg ? -v : v) : null;
};
const round2 = (n) => Math.round(n * 100) / 100;

/** "Jun 05#", "Jun 5", "06/05/26", "06/05" at the start of a line. */
function leadingDate(line, year) {
  let m = line.match(/^\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\s*#?/);
  if (m) {
    const mm = MONTHS[m[1].toLowerCase()];
    if (mm) return { date: `${year}-${mm}-${String(m[2]).padStart(2, '0')}`, rest: line.slice(m[0].length) };
  }
  m = line.match(/^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*#?/);
  if (m) {
    const yr = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : year;
    return { date: `${yr}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`, rest: line.slice(m[0].length) };
  }
  return null;
}

/** The statement's year, so "Jun 05" can be dated. */
function detectYear(text) {
  let m = text.match(/Statement Period[:\s]*\d{1,2}\/\d{1,2}\/(\d{2,4})/i);
  if (m) return m[1].length === 2 ? `20${m[1]}` : m[1];
  m = text.match(/\b(20\d{2})\b/);
  return m ? m[1] : String(new Date().getFullYear());
}

const isBalanceSeed = (l) => /previous balance|opening balance|beginning balance/i.test(l);
const isBalanceEnd = (l) => /new balance|ending balance|closing balance/i.test(l);
const isNoise = (l) => /page \d+ of \d+|statement period|member number|dividend rate|annual percentage|www\.|\.com\b|customer service|p\.o\. box/i.test(l);

/** Section headings like "$8 SHARE - ESSENTIAL SHARE DRAFT" or "360 Checking". */
function accountHeading(line) {
  const l = line.trim();
  if (l.length < 4 || l.length > 60) return null;
  // A summary row carries figures; a heading names an account and nothing else.
  // Without this, "360 Checking...0478 $9.92 $33.83" became an account name.
  MONEY.lastIndex = 0;
  if (MONEY.test(l)) { MONEY.lastIndex = 0; return null; }
  MONEY.lastIndex = 0;
  if (/\b(share|checking|savings|draft|money market|credit card)\b/i.test(l) && !leadingDate(l, '2000')) {
    if (/^[^a-z]*$/.test(l.replace(/[a-z]/g, (c) => c)) || /[A-Z]{3,}/.test(l) || /\d{3,}/.test(l)) {
      return l.replace(/\s+/g, ' ').slice(0, 50);
    }
  }
  return null;
}

/**
 * Parse statement text into transactions.
 * Returns { transactions, reconciled, unreconciled, accounts, warnings }.
 */
function parseStatement(text, sourceLabel) {
  const year = detectYear(text);
  const lines = String(text || '').split(/\r?\n/);
  const transactions = [];
  const warnings = [];
  const accounts = new Set();

  let account = sourceLabel || 'statement';
  let prevBalance = null;
  let pending = null; // last transaction, so continuation lines extend it

  const flush = () => { pending = null; };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) { flush(); continue; }

    const heading = accountHeading(line);
    if (heading) { account = heading; accounts.add(account); prevBalance = null; flush(); continue; }

    if (isBalanceSeed(line)) {
      const toks = line.match(MONEY) || [];
      if (toks.length) prevBalance = toNum(toks[toks.length - 1]);
      flush();
      continue;
    }
    if (isBalanceEnd(line)) { flush(); continue; }
    if (isNoise(line)) { flush(); continue; }

    const dated = leadingDate(line, year);
    if (!dated) {
      // continuation of the previous row's description (merchant, city, ids)
      if (pending && line.trim().length > 2 && !/^\d{4,}\s+\d{4,}/.test(line.trim())) {
        const extra = line.trim().replace(/\s{2,}/g, ' ');
        if (!/^\d/.test(extra) && pending.description.length < 120) {
          pending.description = `${pending.description} ${extra}`.trim();
        }
      }
      continue;
    }

    const tokens = dated.rest.match(MONEY) || [];
    if (tokens.length === 0) { flush(); continue; }

    const values = tokens.map(toNum).filter((v) => v !== null);
    if (values.length === 0) { flush(); continue; }

    const balance = values[values.length - 1];
    const stated = values.length > 1 ? Math.abs(values[values.length - 2]) : null;

    let amount = null;
    let verified = false;
    if (prevBalance !== null) {
      amount = round2(balance - prevBalance);
      // The OCR'd amount column should equal the balance movement.
      if (stated !== null && Math.abs(Math.abs(amount) - stated) <= 0.02) verified = true;
    } else if (stated !== null) {
      // No chain yet (first row of a section): fall back to the printed amount,
      // direction unknown, and say so rather than guessing a sign.
      amount = -stated;
      warnings.push(`No opening balance before "${dated.rest.trim().slice(0, 40)}" — its direction is assumed to be an outflow.`);
    }
    if (amount === null) { flush(); continue; }

    const description = dated.rest
      .replace(MONEY, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s#-]+/, '')
      .trim()
      .slice(0, 120);

    const tx = { date: dated.date, amount, description: description || '(no description)', account, balance, verified, source: 'statement_pdf' };
    transactions.push(tx);
    pending = tx;
    prevBalance = balance;
    accounts.add(account);
  }

  const reconciled = transactions.filter((t) => t.verified).length;
  return {
    transactions,
    reconciled,
    unreconciled: transactions.length - reconciled,
    accounts: [...accounts],
    warnings,
  };
}

module.exports = { parseStatement, detectYear, leadingDate };
