/**
 * Turn any financial CSV into one shape.
 *
 * Every bank invents its own schema, so columns are located by meaning rather
 * than by name, and the mapping it chose is REPORTED. A number whose basis you
 * cannot see is a number you cannot trust, and this file's output decides how
 * much runway you think you have.
 *
 * Sign convention throughout: negative = money leaving you.
 */
const { parseMoney, parseDate } = require('./csv');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Pick the first header whose normalised name matches any candidate. */
function findColumn(headers, candidates, opts) {
  const exclude = (opts && opts.exclude) || [];
  for (const cand of candidates) {
    for (const h of headers) {
      const n = norm(h);
      if (!n || exclude.some((x) => n.includes(norm(x)))) continue;
      if (n === norm(cand)) return h;
    }
  }
  for (const cand of candidates) {
    for (const h of headers) {
      const n = norm(h);
      if (!n || exclude.some((x) => n.includes(norm(x)))) continue;
      if (n.includes(norm(cand))) return h;
    }
  }
  return null;
}

const DATE_COLS = ['date', 'transactiondate', 'posteddate', 'postingdate', 'settleddate', 'tradedate', 'time', 'timestamp', 'filledtime', 'created'];
const AMOUNT_COLS = ['netamount', 'amount', 'transactionamount', 'value', 'total', 'net'];
const DEBIT_COLS = ['debit', 'withdrawal', 'withdrawals', 'moneyout', 'paidout'];
const CREDIT_COLS = ['credit', 'deposit', 'deposits', 'moneyin', 'paidin'];
const DESC_COLS = ['description', 'name', 'merchant', 'memo', 'details', 'payee', 'transactiontype', 'type', 'activity', 'notes'];
const BALANCE_COLS = ['balance', 'runningbalance', 'endingbalance'];
const FEE_COLS = ['fee', 'fees', 'commission'];

/** Identify the export so its quirks can be handled explicitly. */
function detectSource(headers, filename) {
  const H = headers.map(norm);
  const f = norm(filename || '');
  const has = (...names) => names.every((n) => H.some((h) => h.includes(norm(n))));

  if (has('symbol') && (has('quantity') || has('shares')) && (has('marketvalue') || has('lastprice') || has('costbasis'))) {
    return 'brokerage_positions';
  }
  if (has('symbol') && (has('side') || has('filled') || has('action'))) return 'brokerage_transactions';
  if (f.includes('webull')) return H.some((h) => h.includes('symbol')) ? 'brokerage_transactions' : 'bank_generic';
  if (has('assettype') || f.includes('cashapp') || f.includes('cash_app')) return 'cashapp';
  return 'bank_generic';
}

/**
 * Some exports list every amount as positive and put the direction in a type
 * column ("Debit"/"Credit", "Withdrawal"/"Deposit", "Sent"/"Received").
 */
const OUTFLOW_WORDS = ['debit', 'withdraw', 'withdrawal', 'payment', 'purchase', 'sent', 'sale', 'fee', 'charge', 'transfer out', 'bill', 'buy'];
const INFLOW_WORDS = ['credit', 'deposit', 'received', 'refund', 'interest', 'dividend', 'cashback', 'transfer in', 'payroll', 'sell'];

function directionFromText(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return 0;
  const out = OUTFLOW_WORDS.some((w) => t.includes(w));
  const inn = INFLOW_WORDS.some((w) => t.includes(w));
  if (out && !inn) return -1;
  if (inn && !out) return 1;
  return 0;
}

/**
 * Build the column mapping and describe it. `assumptions` is surfaced to the
 * user so a wrong guess is visible rather than silently wrong.
 */
function buildMapping(headers, filename) {
  const source = detectSource(headers, filename);
  const dateCol = findColumn(headers, DATE_COLS);
  const debitCol = findColumn(headers, DEBIT_COLS);
  const creditCol = findColumn(headers, CREDIT_COLS);
  // "Net Amount" beats "Amount" when both exist — it is the figure after fees.
  const amountCol = findColumn(headers, AMOUNT_COLS, { exclude: ['fee', 'commission', 'balance', 'price', 'quantity'] });
  const descCol = findColumn(headers, DESC_COLS);
  const balanceCol = findColumn(headers, BALANCE_COLS);
  const feeCol = findColumn(headers, FEE_COLS);

  const assumptions = [];
  if (dateCol) assumptions.push(`date from "${dateCol}"`);
  if (debitCol && creditCol) assumptions.push(`amount from "${creditCol}" (in) and "${debitCol}" (out)`);
  else if (amountCol) assumptions.push(`amount from "${amountCol}"`);
  if (descCol) assumptions.push(`description from "${descCol}"`);
  if (feeCol) assumptions.push(`fees from "${feeCol}"`);

  return { source, dateCol, amountCol, debitCol, creditCol, descCol, balanceCol, feeCol, assumptions };
}

/**
 * Normalise records into transactions.
 * Returns { transactions, mapping, skipped, signNote }.
 */
function normalizeRecords(records, headers, filename, accountLabel) {
  const mapping = buildMapping(headers, filename);
  const out = [];
  let skipped = 0;

  for (const rec of records) {
    const date = parseDate(mapping.dateCol ? rec[mapping.dateCol] : null);
    if (!date) { skipped++; continue; }

    let amount = null;
    if (mapping.debitCol && mapping.creditCol) {
      const d = parseMoney(rec[mapping.debitCol]);
      const c = parseMoney(rec[mapping.creditCol]);
      if (d != null && d !== 0) amount = -Math.abs(d);
      else if (c != null && c !== 0) amount = Math.abs(c);
    } else if (mapping.amountCol) {
      amount = parseMoney(rec[mapping.amountCol]);
    }
    if (amount == null) { skipped++; continue; }

    const description = (mapping.descCol ? rec[mapping.descCol] : '') || '';
    const balance = mapping.balanceCol ? parseMoney(rec[mapping.balanceCol]) : null;

    out.push({
      date,
      amount,
      description: String(description).slice(0, 160),
      account: accountLabel,
      source: mapping.source,
      balance,
      raw: rec,
    });
  }

  // If a single amount column gave us only positives, direction lives in the
  // text. Apply it — otherwise every expense would read as income.
  let signNote = null;
  const allPositive = out.length > 0 && out.every((t) => t.amount >= 0);
  if (allPositive && !(mapping.debitCol && mapping.creditCol)) {
    let applied = 0;
    for (const t of out) {
      const dir = directionFromText(`${t.description} ${JSON.stringify(t.raw)}`);
      if (dir === -1) { t.amount = -Math.abs(t.amount); applied++; }
    }
    signNote = applied > 0
      ? `every amount was positive; direction inferred from text for ${applied} of ${out.length} rows`
      : `every amount was positive and no direction could be inferred — treating all as INCOME, which is probably wrong`;
  }

  for (const t of out) delete t.raw;
  return { transactions: out, mapping, skipped, signNote };
}

module.exports = { normalizeRecords, buildMapping, detectSource, findColumn, directionFromText };
