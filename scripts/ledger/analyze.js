/**
 * What the transactions actually mean: burn, runway, and what recurs.
 *
 * The trap this is built around is internal transfers. Moving $500 from a bank
 * to Webull is not $500 of income and $500 of spending — but it appears in both
 * exports and would inflate income and burn simultaneously, making the runway
 * number confidently wrong. They are detected and excluded before anything else
 * is computed.
 */

const monthOf = (d) => String(d).slice(0, 7);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round2 = (n) => Math.round(n * 100) / 100;
const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

/**
 * Pair equal-and-opposite amounts across accounts within a few days.
 * Conservative by design: only near-exact magnitude matches are paired, so a
 * genuine expense is never silently erased from the burn figure.
 */
function findInternalTransfers(transactions, windowDays = 4) {
  const flags = new Set();
  const outs = transactions.map((t, i) => ({ t, i })).filter((x) => x.t.amount < 0);
  const ins = transactions.map((t, i) => ({ t, i })).filter((x) => x.t.amount > 0);
  const usedIn = new Set();

  for (const o of outs) {
    const target = Math.abs(o.t.amount);
    if (target < 1) continue;
    let best = null;
    for (const n of ins) {
      if (usedIn.has(n.i)) continue;
      if (n.t.account === o.t.account) continue;      // must cross accounts
      if (Math.abs(n.t.amount - target) > 0.01) continue;
      const gap = daysBetween(n.t.date, o.t.date);
      if (gap > windowDays) continue;
      if (!best || gap < best.gap) best = { n, gap };
    }
    if (best) { flags.add(o.i); flags.add(best.n.i); usedIn.add(best.n.i); }
  }
  return flags;
}

/** Strip card noise so the same merchant groups together. */
function merchantKey(description) {
  return String(description || '')
    .toLowerCase()
    .replace(/\d{2,}/g, ' ')                       // card/txn numbers, dates
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(purchase|payment|recurring|autopay|pos|debit|credit|card|ach|web|id|ref|pending)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

/** Charges that repeat at a roughly monthly cadence — the quiet drain. */
function findRecurring(transactions) {
  const groups = new Map();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const key = merchantKey(t.description);
    if (!key || key.length < 3) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const recurring = [];
  for (const [key, txs] of groups) {
    if (txs.length < 3) continue;
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i].date, sorted[i - 1].date));
    const typicalGap = median(gaps);
    if (typicalGap < 20 || typicalGap > 45) continue;          // monthly-ish only
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const amt = median(amounts);
    const spread = Math.max(...amounts) - Math.min(...amounts);
    if (amt > 0 && spread > amt * 0.35) continue;              // not a fixed charge
    recurring.push({
      label: key,
      monthly: round2(amt),
      occurrences: sorted.length,
      lastSeen: sorted[sorted.length - 1].date,
      example: sorted[sorted.length - 1].description,
    });
  }
  return recurring.sort((a, b) => b.monthly - a.monthly);
}

/** Per-month income, spend and net, excluding internal transfers. */
function monthlySummary(transactions, transferFlags) {
  const months = new Map();
  transactions.forEach((t, i) => {
    if (transferFlags.has(i)) return;
    const m = monthOf(t.date);
    if (!months.has(m)) months.set(m, { month: m, income: 0, spend: 0, net: 0, count: 0 });
    const row = months.get(m);
    if (t.amount >= 0) row.income += t.amount; else row.spend += Math.abs(t.amount);
    row.net += t.amount;
    row.count++;
  });
  return [...months.values()]
    .map((r) => ({ ...r, income: round2(r.income), spend: round2(r.spend), net: round2(r.net) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Burn and runway.
 *
 * The current month is excluded — it is incomplete, and counting it makes burn
 * look smaller than it is, which is the dangerous direction for this number.
 * Burn is the MEDIAN of complete months, not the mean, so one unusual month
 * does not set your runway.
 */
function computeRunway(monthly, cashOnHand, opts) {
  const options = opts || {};
  const currentMonth = options.today ? monthOf(options.today) : monthOf(new Date().toISOString());
  const complete = monthly.filter((m) => m.month !== currentMonth);
  const considered = complete.slice(-6);

  if (considered.length === 0) {
    return { ok: false, reason: 'No complete month of data yet — import at least one full month before trusting a runway figure.', monthsConsidered: 0 };
  }

  const nets = considered.map((m) => m.net);
  const medianNet = round2(median(nets));
  const burn = medianNet < 0 ? round2(Math.abs(medianNet)) : 0;
  const result = {
    ok: true,
    monthsConsidered: considered.length,
    months: considered.map((m) => m.month),
    medianMonthlyNet: medianNet,
    medianMonthlyIncome: round2(median(considered.map((m) => m.income))),
    medianMonthlySpend: round2(median(considered.map((m) => m.spend))),
    burn,
  };

  if (burn === 0) {
    result.runwayMonths = null;
    result.verdict = 'Income covers spending in the median month — no burn to run out of.';
    return result;
  }
  if (!Number.isFinite(cashOnHand) || cashOnHand == null) {
    result.runwayMonths = null;
    result.verdict = `Burning ${burn.toFixed(2)}/month. Provide cash on hand to compute runway.`;
    return result;
  }
  result.cashOnHand = round2(cashOnHand);
  result.runwayMonths = round2(cashOnHand / burn);
  result.runwayDate = addMonths(new Date(), result.runwayMonths).toISOString().slice(0, 10);
  result.verdict = `Burning ${burn.toFixed(2)}/month against ${cashOnHand.toFixed(2)} — about ${result.runwayMonths.toFixed(1)} months.`;
  return result;
}

function addMonths(date, months) {
  const d = new Date(date);
  const whole = Math.floor(months);
  d.setMonth(d.getMonth() + whole);
  d.setDate(d.getDate() + Math.round((months - whole) * 30));
  return d;
}

module.exports = { findInternalTransfers, findRecurring, monthlySummary, computeRunway, merchantKey, median, monthOf };
