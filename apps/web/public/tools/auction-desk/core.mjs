/** Nova Auction Desk: deterministic scenario arithmetic, not an autonomous bidder.
 * All money is USD; unknown != zero; source references are assertions, not verification.
 * No I/O, providers, credentials, networking or global mutable state in this module.
 */
export const VERSION = '1.0.0';
export const SCHEMA = 1;
export const COST_FIELDS = Object.freeze({
  bid: 'Current / proposed bid', buyerPremiumPct: 'Buyer premium (%)',
  facilityFee: 'Nonrefundable facility fee', salesTaxPct: 'Acquisition sales tax (%)',
  transport: 'Transport', cleanup: 'Cleanout / disposal', storage: 'Storage',
  repairs: 'Repairs / testing', outboundShipping: 'Seller-paid outbound shipping',
  packaging: 'Packaging', fixedSellingFees: 'Total fixed selling fees',
  resaleFeePct: 'Effective variable resale fees (%)', returnReserve: 'Return / loss reserve',
  laborHours: 'Owner hours', laborRate: 'Value per owner hour',
  refundableDeposit: 'Refundable deposit (cash tied up)',
});
export const TAX_BASES = Object.freeze(['bid', 'bid+premium', 'bid+premium+facility']);
const FIXED = ['transport', 'cleanup', 'storage', 'repairs', 'outboundShipping', 'packaging', 'fixedSellingFees', 'returnReserve'];
const clone = value => JSON.parse(JSON.stringify(value));
const rounded = n => Math.round(n * 100);
const ceilRatio = (n, d) => Math.ceil(n / d);
const usd = cents => cents / 100;
export function uid() { return globalThis.crypto.randomUUID(); }
export function safeUrl(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
}
export function emptyDossier() {
  return { id: uid(), title: '', auctionUrl: '', currency: 'USD', notes: '', items: [],
    costs: Object.fromEntries(Object.keys(COST_FIELDS).map(k => [k, null])),
    taxBase: null, capitalLimit: null, minimumProfit: null };
}
export function emptyItem() {
  return { id: uid(), title: '', quantity: 1, included: true,
    low: null, mid: null, high: null, evidenceRef: '', appraisalId: '', origin: 'operator' };
}
export function emptyState() {
  return { schemaVersion: SCHEMA, dossier: emptyDossier(), forecasts: [], outcomes: [] };
}
function validNumber(v, max = 1_000_000) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max &&
    Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
}
function text(v, max = 4000) { return typeof v === 'string' && v.length <= max; }
function plain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
/** Malformed data is rejected; missing business inputs remain explicitly unknown. */
export function validateDossier(d) {
  const errors = [];
  if (!plain(d)) return ['dossier must be an object'];
  for (const k of ['id', 'title', 'auctionUrl', 'notes']) if (!text(d[k])) errors.push(`${k}: invalid text`);
  if (!d.id) errors.push('id: required');
  if (d.currency !== 'USD') errors.push('currency: this version supports USD only');
  if (d.auctionUrl && !safeUrl(d.auctionUrl)) errors.push('auctionUrl: use HTTP(S), without credentials');
  if (d.taxBase !== null && !TAX_BASES.includes(d.taxBase)) errors.push('taxBase: unsupported');
  for (const k of ['capitalLimit', 'minimumProfit']) if (d[k] !== null && !validNumber(d[k])) errors.push(`${k}: invalid amount`);
  if (!plain(d.costs)) errors.push('costs: required');
  else for (const k of Object.keys(COST_FIELDS)) {
    const v = d.costs[k]; const max = k.endsWith('Pct') ? 100 : k === 'laborHours' ? 10000 : 1_000_000;
    if (v !== null && !validNumber(v, max)) errors.push(`costs.${k}: invalid number (maximum ${max}, two decimal places)`);
  }
  if (!Array.isArray(d.items) || d.items.length > 200) errors.push('items: an array of at most 200 items is required');
  else {
    const seen = new Set();
    d.items.forEach((i, index) => {
      const at = `items[${index}]`;
      if (!plain(i)) { errors.push(`${at}: invalid item`); return; }
      for (const k of ['id', 'title', 'evidenceRef', 'appraisalId', 'origin']) if (!text(i[k])) errors.push(`${at}.${k}: invalid text`);
      if (!i.id || seen.has(i.id)) errors.push(`${at}.id: missing or duplicate`); seen.add(i.id);
      if (typeof i.included !== 'boolean') errors.push(`${at}.included: required boolean`);
      if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 1000) errors.push(`${at}.quantity: 1–1000 required`);
      for (const k of ['low', 'mid', 'high']) if (i[k] !== null && !validNumber(i[k])) errors.push(`${at}.${k}: invalid amount`);
      if (['low', 'mid', 'high'].every(k => validNumber(i[k])) && !(i.low <= i.mid && i.mid <= i.high)) errors.push(`${at}: low <= mid <= high required`);
    });
  }
  return errors;
}
export function analyze(d) {
  const invalid = validateDossier(d);
  if (invalid.length) return { status: 'invalid', missing: invalid, scenarios: null, maximumBid: null, exclusions: [] };
  const missing = [], exclusions = d.items.filter(i => !i.included).map(i => i.id);
  if (!d.title.trim()) missing.push('Auction title');
  if (!d.auctionUrl.trim()) missing.push('Auction source URL');
  for (const [k, label] of Object.entries(COST_FIELDS)) if (d.costs[k] === null) missing.push(label);
  if (d.taxBase === null) missing.push('Tax base from the auction terms');
  if (d.capitalLimit === null) missing.push('Scenario cash limit');
  if (d.minimumProfit === null) missing.push('Required economic profit');
  const items = d.items.filter(i => i.included);
  if (!items.length) missing.push('At least one explicitly included item');
  items.forEach((i, n) => {
    if (!i.title.trim()) missing.push(`Item ${n + 1}: title`);
    if (!i.evidenceRef.trim()) missing.push(`Item ${n + 1}: source reference`);
    for (const k of ['low', 'mid', 'high']) if (i[k] === null) missing.push(`Item ${n + 1}: ${k} proceeds`);
  });
  if (missing.length) return { status: 'needs_data', missing, scenarios: null, maximumBid: null, exclusions };
  const gross = Object.fromEntries(['low', 'mid', 'high'].map(k => [k, items.reduce((s, i) => s + rounded(i[k]) * i.quantity, 0)]));
  if (gross.high > 100_000_000) return { status: 'invalid', missing: ['Total gross scenario exceeds supported $1,000,000 limit'], scenarios: null, maximumBid: null, exclusions };
  const c = d.costs;
  const fixed = FIXED.reduce((s, k) => s + rounded(c[k]), 0);
  const labor = ceilRatio(rounded(c.laborHours) * rounded(c.laborRate), 100);
  const deposit = rounded(c.refundableDeposit);
  const premiumBps = rounded(c.buyerPremiumPct), taxBps = rounded(c.salesTaxPct), resaleBps = rounded(c.resaleFeePct);
  function at(bid, proceeds) {
    const premium = ceilRatio(bid * premiumBps, 10000), facility = rounded(c.facilityFee);
    const taxable = bid + (d.taxBase.includes('premium') ? premium : 0) + (d.taxBase.includes('facility') ? facility : 0);
    const tax = ceilRatio(taxable * taxBps, 10000);
    const acquisition = bid + premium + facility + tax;
    const variableFees = ceilRatio(proceeds * resaleBps, 10000);
    const cashCosts = acquisition + fixed + variableFees;
    const cashProfit = proceeds - cashCosts;
    return { bid, proceeds, premium, facility, tax, acquisition, fixed, variableFees,
      cashCosts, deposit, cashCommitted: cashCosts + deposit, labor,
      cashProfit, economicProfit: cashProfit - labor };
  }
  const limit = rounded(d.capitalLimit), target = rounded(d.minimumProfit);
  const feasible = bid => { const a = at(bid, gross.low); return a.economicProfit >= target && a.cashCommitted <= limit; };
  let ceiling = null;
  if (feasible(0)) {
    let lo = 0, hi = limit;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (feasible(mid)) lo = mid; else hi = mid - 1; }
    ceiling = lo;
  }
  const bid = rounded(c.bid);
  const scenarios = Object.fromEntries(['low', 'mid', 'high'].map(k => [k,
    Object.fromEntries(Object.entries(at(bid, gross[k])).map(([key, cents]) => [key, usd(cents)]))]));
  return { engineVersion: VERSION, status: ceiling !== null && bid <= ceiling ? 'review' : 'skip',
    missing: [], scenarios, maximumBid: ceiling === null ? null : usd(ceiling), exclusions,
    warning: 'Unverified input scenarios, not expected returns or permission to bid. Cash reserve uses low-case selling fees; deposit is assumed refundable. Fees are rounded upward.' };
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function lockForecast(d) {
  const result = analyze(d);
  if (['invalid', 'needs_data'].includes(result.status)) throw new Error('Complete valid inputs before locking a forecast.');
  const payload = { id: uid(), lockedAt: new Date().toISOString(), engineVersion: VERSION, input: clone(d), result };
  return { ...payload, hash: await digest(payload) };
}
export async function verifyForecast(f) {
  if (!plain(f)) return false;
  const { hash, ...payload } = f;
  return typeof hash === 'string' && hash === await digest(payload);
}
export async function lockLedgerForecast(state) {
  if (state.forecasts.length >= 1000) throw new Error('Forecast limit reached.');
  const ids = new Set(state.forecasts.filter(f => f.input.id === state.dossier.id).map(f => f.id));
  if (state.outcomes.some(o => ids.has(o.forecastId))) throw new Error('This auction already has an outcome; a new forecast would not be prospective.');
  return lockForecast(state.dossier);
}
export function validateOutcome(o, forecasts, priorOutcomes = []) {
  const errors = [];
  if (!plain(o)) return ['outcome: invalid object'];
  if (!text(o.id) || !o.id || !text(o.notes) || !text(o.recordedAt) || !Number.isFinite(Date.parse(o.recordedAt))) errors.push('outcome: invalid metadata');
  const forecast = forecasts.find(f => f.id === o.forecastId);
  if (!forecast) errors.push('outcome: unknown forecast');
  if (!['won', 'lost', 'no_bid'].includes(o.status)) errors.push('outcome: unsupported status');
  if (typeof o.finalized !== 'boolean') errors.push('outcome: finalized must be explicit');
  for (const k of ['winningBid', 'grossSales', 'totalCashCost', 'ownerHours']) if (o[k] !== null && !validNumber(o[k])) errors.push(`outcome.${k}: invalid amount`);
  if (o.status === 'won' && o.finalized && ['grossSales', 'totalCashCost', 'ownerHours'].some(k => o[k] === null)) errors.push('outcome: finalized wins need gross sales, complete cash cost and hours');
  if (forecast && Date.parse(o.recordedAt) < Date.parse(forecast.lockedAt)) errors.push('outcome: timestamp precedes forecast');
  if (forecast) {
    const sameAuction = new Set(forecasts.filter(f => f.input.id === forecast.input.id).map(f => f.id));
    if (priorOutcomes.some(p => sameAuction.has(p.forecastId) && p.forecastId !== o.forecastId)) errors.push('outcome: this auction is already bound to another forecast; append updates to that forecast');
    if (priorOutcomes.some(p => p.forecastId === o.forecastId && Date.parse(p.recordedAt) > Date.parse(o.recordedAt))) errors.push('outcome: updates must be appended chronologically');
    if (forecasts.some(f => f.input.id === forecast.input.id && Date.parse(f.lockedAt) > Date.parse(o.recordedAt))) errors.push('outcome: a forecast was locked after this outcome; not prospective');
  }
  return errors;
}
export function learningSummary(state) {
  const latest = new Map();
  state.outcomes.forEach(o => latest.set(o.forecastId, o));
  const resolved = [...latest.values()], completed = resolved.filter(o => o.status === 'won' && o.finalized);
  const rows = completed.map(o => {
    const f = state.forecasts.find(x => x.id === o.forecastId);
    const actualEconomicProfit = usd(rounded(o.grossSales) - rounded(o.totalCashCost) - ceilRatio(rounded(o.ownerHours) * rounded(f.input.costs.laborRate), 100));
    return { forecastId: f.id, forecastAt: f.lockedAt, outcomeAt: o.recordedAt,
      predictedGrossMid: f.result.scenarios.mid.proceeds, actualGross: o.grossSales,
      absoluteGrossError: usd(Math.abs(rounded(o.grossSales) - rounded(f.result.scenarios.mid.proceeds))),
      lowHighCovered: o.grossSales >= f.result.scenarios.low.proceeds && o.grossSales <= f.result.scenarios.high.proceeds,
      predictedEconomicProfitMid: f.result.scenarios.mid.economicProfit, actualEconomicProfit };
  });
  return { resolved: resolved.length, won: resolved.filter(o => o.status === 'won').length,
    lost: resolved.filter(o => o.status === 'lost').length, noBid: resolved.filter(o => o.status === 'no_bid').length,
    completed: rows.length, meanAbsoluteGrossError: rows.length ? rows.reduce((s, r) => s + r.absoluteGrossError, 0) / rows.length : null,
    intervalCoverage: rows.length ? rows.filter(r => r.lowHighCovered).length / rows.length : null, rows,
    note: 'Descriptive, self-reported outcomes of completed wins only; not unbiased out-of-sample model performance. No model has been trained.' };
}
export async function validateState(s) {
  if (!plain(s) || s.schemaVersion !== SCHEMA) throw new Error('Unsupported ledger schema.');
  const errors = validateDossier(s.dossier);
  if (!Array.isArray(s.forecasts) || s.forecasts.length > 1000 || !Array.isArray(s.outcomes) || s.outcomes.length > 5000) throw new Error('Invalid ledger record arrays or size limits.');
  const ids = new Set();
  for (const f of s.forecasts) {
    if (!plain(f) || !text(f.id) || !f.id || ids.has(f.id)) throw new Error('Duplicate or invalid forecast ID.');
    ids.add(f.id);
    if (f.engineVersion !== VERSION) throw new Error('Unsupported forecast engine version; migrate explicitly.');
    if (!text(f.lockedAt) || !Number.isFinite(Date.parse(f.lockedAt))) throw new Error('Invalid forecast timestamp.');
    if (!(await verifyForecast(f))) throw new Error(`Forecast hash mismatch: ${f.id}`);
    if (canonical(analyze(f.input)) !== canonical(f.result) || !['review', 'skip'].includes(f.result.status)) throw new Error(`Forecast result mismatch: ${f.id}`);
  }
  const outcomeIds = new Set(), priorOutcomes = [];
  for (const o of s.outcomes) {
    errors.push(...validateOutcome(o, s.forecasts, priorOutcomes));
    priorOutcomes.push(o);
    if (!o.id || outcomeIds.has(o.id)) errors.push('Duplicate outcome ID');
    outcomeIds.add(o.id);
  }
  if (errors.length) throw new Error(errors.slice(0, 8).join('; '));
  return clone(s);
}
/** Adapt existing per-item appraisal JSON; source links remain UNVERIFIED. */
export function appraisalToItem(a) {
  if (!plain(a) || !plain(a.valuation)) throw new Error('Expected existing item-appraisal JSON with a valuation object.');
  const item = emptyItem(), v = a.valuation;
  item.title = String(a.title || a.input_value || 'Imported appraisal').slice(0, 500);
  item.appraisalId = String(a.id || '').slice(0, 500); item.origin = 'imported_unverified_appraisal';
  for (const [k, name] of Object.entries({ low: 'estimated_low', mid: 'estimated_mid', high: 'estimated_high' })) {
    const n = v[name]; item[k] = validNumber(n) ? n : null;
  }
  const refs = Array.isArray(a.comps_evidence) ? a.comps_evidence.filter(c =>
    plain(c) && c.comparable === true && c.is_outlier === false && typeof c.status === 'string' &&
    c.status.toLowerCase() === 'sold' && typeof c.url === 'string' && safeUrl(c.url)).slice(0, 3).map(c => c.url) : [];
  item.evidenceRef = refs.join('\n');
  if (v.currency && v.currency !== 'USD') throw new Error('Non-USD appraisal: no implicit currency conversion.');
  return item;
}
