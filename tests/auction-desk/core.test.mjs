import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COST_FIELDS, emptyDossier, emptyItem, emptyState, analyze, validateDossier,
  lockForecast, lockLedgerForecast, verifyForecast, validateState, validateOutcome, learningSummary,
  appraisalToItem, safeUrl, canonical, uid } from '../../apps/web/public/tools/auction-desk/core.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const copy = v => JSON.parse(JSON.stringify(v));
function fixture() {
  const d = emptyDossier();
  Object.assign(d, { title: 'SYNTHETIC TEST ONLY', auctionUrl: 'https://example.test/auction/1', taxBase: 'bid+premium', capitalLimit: 1000, minimumProfit: 20 });
  for (const k of Object.keys(COST_FIELDS)) d.costs[k] = 0;
  d.costs.bid = 100;
  d.items.push({ ...emptyItem(), title: 'Synthetic test item', low: 200, mid: 300, high: 400, evidenceRef: 'test-fixture:not-market-evidence' });
  return d;
}
async function frozenState() { const s = emptyState(); s.dossier = fixture(); s.forecasts.push(await lockForecast(s.dossier)); return s; }
function outcome(f, overrides = {}) { return { id: uid(), recordedAt: new Date().toISOString(), forecastId: f.id,
  status: 'won', finalized: true, notes: 'SYNTHETIC TEST ONLY', winningBid: 100, grossSales: 280, totalCashCost: 150, ownerHours: 2, ...overrides }; }

test('empty draft is needs_data with no numerical profit or bid ceiling', () => {
  const r = analyze(emptyDossier()); assert.equal(r.status, 'needs_data'); assert.equal(r.scenarios, null); assert.equal(r.maximumBid, null);
});
test('zero costs are explicit and distinguishable from unknown costs', () => {
  const d = fixture(); assert.equal(analyze(d).status, 'review'); d.costs.cleanup = null;
  const r = analyze(d); assert.equal(r.status, 'needs_data'); assert.ok(r.missing.includes('Cleanout / disposal'));
});
test('every cost, policy amount and tax base is a required input', () => {
  for (const k of Object.keys(COST_FIELDS)) { const d = fixture(); d.costs[k] = null; assert.equal(analyze(d).status, 'needs_data', k); }
  for (const k of ['capitalLimit', 'minimumProfit', 'taxBase']) { const d = fixture(); d[k] = null; assert.equal(analyze(d).status, 'needs_data', k); }
});
test('negative, NaN, Infinity, strings and excessive decimal precision are rejected', () => {
  for (const v of [-1, NaN, Infinity, '100', 0.001, 1000001]) { const d = fixture(); d.costs.bid = v; assert.equal(analyze(d).status, 'invalid'); }
});
test('unsupported currency and credential-bearing URLs are rejected', () => {
  const d = fixture(); d.currency = 'EUR'; assert.equal(analyze(d).status, 'invalid'); d.currency = 'USD'; d.auctionUrl = 'https://user:secret@example.test'; assert.equal(analyze(d).status, 'invalid');
});
test('unsafe URL protocols are rejected', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', '//example.test', 'ftp://example.test']) assert.equal(safeUrl(url), false);
  assert.equal(safeUrl('https://example.test/a?q=1'), true);
});
test('missing evidence locks calculation even with complete numerical estimates', () => {
  const d = fixture(); d.items[0].evidenceRef = '  '; assert.equal(analyze(d).status, 'needs_data');
});
test('included item must have all ordered scenarios', () => {
  for (const k of ['low', 'mid', 'high']) { const d = fixture(); d.items[0][k] = null; assert.equal(analyze(d).status, 'needs_data'); }
  const d = fixture(); d.items[0].low = 500; assert.equal(analyze(d).status, 'invalid');
});
test('excluded unpriced contents add no value and are disclosed', () => {
  const d = fixture(); const unknown = { ...emptyItem(), included: false, title: 'Unseen contents' }; d.items.push(unknown);
  const r = analyze(d); assert.equal(r.scenarios.low.proceeds, 200); assert.deepEqual(r.exclusions, [unknown.id]);
});
test('no included items never produces a positive bid ceiling', () => {
  const d = fixture(); d.items[0].included = false; assert.equal(analyze(d).status, 'needs_data');
});
test('duplicate item IDs, invalid quantities and excessive list sizes fail closed', () => {
  const d = fixture(); d.items.push(copy(d.items[0])); assert.equal(analyze(d).status, 'invalid');
  for (const q of [0, -1, 1.5, 1001, null]) { const x = fixture(); x.items[0].quantity = q; assert.equal(analyze(x).status, 'invalid'); }
  const x = fixture(); x.items = Array.from({ length: 201 }, () => emptyItem()); assert.equal(analyze(x).status, 'invalid');
});
test('quantities multiply proceeds once; fees apply once to the aggregate', () => {
  const d = fixture(); d.items[0].quantity = 2; d.costs.resaleFeePct = 10;
  const r = analyze(d); assert.equal(r.scenarios.low.proceeds, 400); assert.equal(r.scenarios.low.variableFees, 40);
});
test('buyer premium and chosen sales-tax base are explicit', () => {
  const d = fixture(); Object.assign(d.costs, { buyerPremiumPct: 10, salesTaxPct: 7, facilityFee: 5 });
  d.taxBase = 'bid'; assert.equal(analyze(d).scenarios.low.tax, 7);
  d.taxBase = 'bid+premium'; assert.equal(analyze(d).scenarios.low.tax, 7.7);
  d.taxBase = 'bid+premium+facility'; assert.equal(analyze(d).scenarios.low.tax, 8.05);
});
test('fractional-cent expenses round upward', () => {
  const d = fixture(); Object.assign(d.costs, { bid: 0.01, buyerPremiumPct: 1, salesTaxPct: 1, resaleFeePct: 0.01 });
  const r = analyze(d); assert.equal(r.scenarios.low.premium, 0.01); assert.equal(r.scenarios.low.tax, 0.01); assert.equal(r.scenarios.low.variableFees, 0.02);
});
test('refundable deposit affects cash limit but not economic profit', () => {
  const d = fixture(); const a = analyze(d); d.costs.refundableDeposit = 75; const b = analyze(d);
  assert.equal(b.scenarios.low.economicProfit, a.scenarios.low.economicProfit); assert.equal(b.scenarios.low.cashCommitted, a.scenarios.low.cashCommitted + 75);
  d.capitalLimit = 150; assert.equal(analyze(d).maximumBid, 75);
});
test('owner labor reduces economic profit without pretending it is cash paid', () => {
  const d = fixture(); Object.assign(d.costs, { laborHours: 2.5, laborRate: 20 });
  const r = analyze(d); assert.equal(r.scenarios.low.labor, 50); assert.equal(r.scenarios.low.cashProfit, 100); assert.equal(r.scenarios.low.economicProfit, 50); assert.equal(r.scenarios.low.cashCommitted, 100);
});
test('bid ceiling obeys low-case target, and one cent above it fails', () => {
  const d = fixture(); let r = analyze(d); assert.equal(r.maximumBid, 180);
  d.costs.bid = 180; assert.equal(analyze(d).status, 'review'); d.costs.bid = 180.01; assert.equal(analyze(d).status, 'skip');
});
test('cash cap constrains ceiling even when profit is high', () => {
  const d = fixture(); d.capitalLimit = 50; d.costs.refundableDeposit = 10; d.costs.transport = 5;
  assert.equal(analyze(d).maximumBid, 35);
});
test('no feasible bid is distinct from a feasible zero-dollar bid', () => {
  const d = fixture(); d.minimumProfit = 200; assert.equal(analyze(d).maximumBid, 0);
  d.minimumProfit = 200.01; assert.equal(analyze(d).maximumBid, null); assert.equal(analyze(d).status, 'skip');
});
test('1,000 generated scenarios: boundary is maximal and monotone in every expense', () => {
  let seed = 48117; const rand = n => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 1000; i++) {
    const d = fixture(); d.costs.bid = rand(10000) / 100; d.costs.buyerPremiumPct = rand(3000) / 100; d.costs.salesTaxPct = rand(1200) / 100;
    d.costs.resaleFeePct = rand(2500) / 100; d.costs.cleanup = rand(7000) / 100; d.costs.laborHours = rand(400) / 100;
    d.costs.laborRate = rand(3000) / 100; d.capitalLimit = rand(30000) / 100;
    const r = analyze(d); if (r.maximumBid === null) continue;
    d.costs.bid = r.maximumBid; const boundary = analyze(d); assert.equal(boundary.status, 'review');
    d.costs.bid = Math.round((r.maximumBid + 0.01) * 100) / 100; assert.equal(analyze(d).status, 'skip');
    d.costs.cleanup += 10; d.costs.cleanup = Math.round(d.costs.cleanup * 100) / 100;
    const more = analyze(d); assert.ok(more.maximumBid === null || more.maximumBid <= r.maximumBid);
  }
});
test('sum over supported gross limit fails instead of returning unsafe arithmetic', () => {
  const d = fixture(); d.items[0].low = d.items[0].mid = d.items[0].high = 1000000; d.items[0].quantity = 2; assert.equal(analyze(d).status, 'invalid');
});
test('empty and incomplete forecasts cannot be locked', async () => {
  await assert.rejects(lockForecast(emptyDossier()));
});
test('locked forecast is a deep snapshot, not a reference to mutable draft', async () => {
  const d = fixture(); const f = await lockForecast(d); d.items[0].low = 1; d.costs.bid = 999;
  assert.equal(f.input.items[0].low, 200); assert.equal(f.input.costs.bid, 100); assert.equal(await verifyForecast(f), true);
});
test('hash detects a changed input, result, ID or timestamp', async () => {
  const f = await lockForecast(fixture());
  for (const mutate of [x => x.input.costs.bid++, x => x.result.maximumBid++, x => x.id += 'x', x => x.lockedAt = '2000-01-01T00:00:00Z']) {
    const changed = copy(f); mutate(changed); assert.equal(await verifyForecast(changed), false);
  }
});
test('canonical keys are stable across property order', () => { assert.equal(canonical({ b: 2, a: [1, 3] }), canonical({ a: [1, 3], b: 2 })); });
test('round-trip validates ledger and rejects corrupted imported history', async () => {
  const s = await frozenState(); assert.deepEqual(await validateState(copy(s)), s); s.forecasts[0].input.costs.bid++;
  await assert.rejects(validateState(s), /hash mismatch/);
});
test('unknown schema, future engine, duplicate forecasts and invalid timestamps are rejected', async () => {
  const s = await frozenState(); await assert.rejects(validateState({ ...s, schemaVersion: 9 }));
  const future = copy(s); future.forecasts[0].engineVersion = '999'; await assert.rejects(validateState(future), /engine version/);
  const dup = copy(s); dup.forecasts.push(dup.forecasts[0]); await assert.rejects(validateState(dup), /Duplicate/);
  const time = copy(s); time.forecasts[0].lockedAt = 'not-a-date'; await assert.rejects(validateState(time), /timestamp/);
});
test('unknown and incomplete outcome data are never promoted to completed profit', async () => {
  const s = await frozenState(), f = s.forecasts[0];
  const o = outcome(f, { totalCashCost: null }); assert.ok(validateOutcome(o, s.forecasts).length);
  assert.ok(validateOutcome(outcome(f, { forecastId: 'missing' }), s.forecasts).length);
  s.outcomes.push(outcome(f, { finalized: false, totalCashCost: null })); assert.equal(learningSummary(s).completed, 0);
});
test('pre-forecast outcome timestamp is rejected', async () => {
  const s = await frozenState(); assert.ok(validateOutcome(outcome(s.forecasts[0], { recordedAt: '2000-01-01T00:00:00Z' }), s.forecasts).length);
});
test('lost/no-bid outcomes preserved; unsold auctions are not counted as zero-dollar sales', async () => {
  const s = await frozenState(); s.outcomes.push(outcome(s.forecasts[0], { status: 'lost', grossSales: null, totalCashCost: null, ownerHours: null }));
  const r = learningSummary(s); assert.equal(r.lost, 1); assert.equal(r.completed, 0); assert.equal(r.meanAbsoluteGrossError, null);
});
test('latest append-only update is counted once; actual costs drive realized profit', async () => {
  const s = await frozenState(); s.forecasts[0].input.costs.laborRate; // no mutation
  s.outcomes.push(outcome(s.forecasts[0], { finalized: false })); s.outcomes.push(outcome(s.forecasts[0]));
  const r = learningSummary(s); assert.equal(r.resolved, 1); assert.equal(r.completed, 1); assert.equal(r.meanAbsoluteGrossError, 20); assert.equal(r.rows[0].actualEconomicProfit, 130); assert.equal(s.outcomes.length, 2);
});
test('duplicate outcome IDs are rejected on import', async () => {
  const s = await frozenState(); const o = outcome(s.forecasts[0]); s.outcomes.push(o, o); await assert.rejects(validateState(s), /Duplicate outcome/);
});
test('appraisal adapter preserves explicitly sold, comparable, non-outlier evidence only', () => {
  const a = { id: 'appraisal-1', input_value: 'Synthetic chair', valuation: { estimated_low: 10, estimated_mid: 20, estimated_high: 30, currency: 'USD' }, comps_evidence: [
    { comparable: true, is_outlier: false, status: 'sold', url: 'https://example.test/sold' },
    { comparable: true, is_outlier: false, status: 'active', url: 'https://example.test/active' },
    { comparable: true, is_outlier: true, status: 'sold', url: 'https://example.test/outlier' },
    { comparable: true, is_outlier: false, status: 'sold', url: 'javascript:alert(1)' },
  ] };
  const i = appraisalToItem(a); assert.equal(i.evidenceRef, 'https://example.test/sold'); assert.equal(i.origin, 'imported_unverified_appraisal'); assert.equal(i.mid, 20);
});
test('appraisal adapter does not invent missing comparables or convert foreign currency', () => {
  const i = appraisalToItem({ valuation: { estimated_mid: '200' } }); assert.equal(i.mid, null); assert.equal(i.evidenceRef, '');
  assert.throws(() => appraisalToItem({ valuation: { currency: 'EUR' } }));
});
test('CLI validates, emits reports, locks to a new file, and refuses overwrites', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nova-auction-test-'));
  try {
    const s = emptyState(); s.dossier = fixture(); const input = path.join(dir, 'in.json'), output = path.join(dir, 'out.json');
    await writeFile(input, JSON.stringify(s)); const cli = path.join(root, 'scripts/nova-auction.mjs');
    const report = JSON.parse(execFileSync(process.execPath, [cli, 'report', input], { encoding: 'utf8' })); assert.equal(report.report.status, 'review');
    execFileSync(process.execPath, [cli, 'lock', input, output]); const saved = JSON.parse(await readFile(output, 'utf8')); assert.equal(saved.forecasts.length, 1);
    const before = await readFile(output, 'utf8'); const repeat = spawnSync(process.execPath, [cli, 'lock', input, output]); assert.equal(repeat.status, 1); assert.equal(await readFile(output, 'utf8'), before);
    await writeFile(input, JSON.stringify(emptyState())); const missing = spawnSync(process.execPath, [cli, 'report', input]); assert.equal(missing.status, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('no new prediction for an auction after its outcome is known', async () => {
  const s = await frozenState(); s.outcomes.push(outcome(s.forecasts[0]));
  await assert.rejects(lockLedgerForecast(s), /already has an outcome/);
});
test('multiple forecasts of one auction cannot inflate learning sample count', async () => {
  const s = await frozenState(); s.forecasts.push(await lockForecast(s.dossier));
  const first = outcome(s.forecasts[0]); s.outcomes.push(first);
  assert.ok(validateOutcome(outcome(s.forecasts[1]), s.forecasts, s.outcomes).some(x => x.includes('another forecast')));
});
test('outcome updates may not reorder known history', async () => {
  const s = await frozenState(); const first = outcome(s.forecasts[0], { recordedAt: '2099-01-01T00:00:00Z' });
  assert.ok(validateOutcome(outcome(s.forecasts[0]), s.forecasts, [first]).some(x => x.includes('chronologically')));
});
test('learning cannot be manipulated by duplicate-auction outcomes in an imported ledger', async () => {
  const s = await frozenState(); s.forecasts.push(await lockForecast(s.dossier));
  s.outcomes.push(outcome(s.forecasts[0]), outcome(s.forecasts[1]));
  await assert.rejects(validateState(s), /already bound/);
});
