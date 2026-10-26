import { emptyState, emptyItem, COST_FIELDS, analyze, validateState, lockLedgerForecast } from './auction-core.mjs';
const N = globalThis.NovaLens, $ = id => document.getElementById(id);
let state = N.empty(), selected = null, writing = false;
const money = n => N.amount(n) ? '$' + n.toFixed(2) : 'Unknown';
const number = el => el.value.trim() === '' ? null : Number(el.value);
const node = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const notice = (text, error = false) => { $('notice').textContent = text; $('notice').className = error ? 'error' : ''; };
async function call(type, values = {}) { const r = await chrome.runtime.sendMessage({ type: 'lens:' + type, ...values }); if (!r?.ok) throw new Error(r?.error || 'Lens worker unavailable.'); return r.data; }
const guard = fn => async () => { try { await fn(); } catch (e) { notice(e.message, true); } };
function link(url, label = 'Open source ↗') { const a = node('a', label); if (N.safeUrl(url)) { a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; }
function download(name, data) { const a = node('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function chosen() { return state.listings[selected]; }
function target() { return selected + '\n' + $('item-title').value.trim(); }
function currentAppraisal() { return N.appraisal(state.comps.filter(c => c.matchFor === target())); }
async function load() {
  state = N.validate(await call('get')); state.ledger = state.ledger ? await validateState(state.ledger) : emptyState();
  if (!state.listings[selected]) selected = Object.keys(state.listings)[0] || null;
  renderSources(); renderSelected(); renderCosts(); renderDecision(); renderAlerts();
}
function renderSources() {
  $('sources').replaceChildren();
  if (!Object.keys(state.listings).length) $('sources').append(node('p', 'No captured sources yet.', 'small'));
  for (const [id, r] of Object.entries(state.listings)) {
    const b = node('button', r.latest.title, 'source' + (id === selected ? ' selected' : '')); b.append(node('small', `${money(r.latest.price)} · ${r.watching ? 'WATCHING' : 'CAPTURED'}`), node('small', N.freshness(r)));
    b.onclick = () => { selected = id; $('item-title').value = ''; $('item-evidence').value = ''; renderSources(); renderSelected(); }; $('sources').append(b);
  }
}
function renderSelected() {
  const r = chosen(); $('snapshot').replaceChildren(); $('watch-controls').hidden = !r;
  if (!r) { renderComps(); return; }
  const s = r.latest; $('selected-title').textContent = s.title;
  $('snapshot').append(node('div', N.freshness(r), 'badge'), link(s.url));
  const metrics = node('div', undefined, 'metric-row');
  for (const [label, value] of [['Current / asking price', money(s.price)], ['Refundable deposit', money(s.deposit)], ['Closing time', s.endsAt ? new Date(s.endsAt).toLocaleString() : 'Unknown']]) { const v = node('div'); v.append(node('small', label), node('strong', value)); metrics.append(v); }
  $('snapshot').append(metrics, node('p', `Observed ${new Date(s.observedAt).toLocaleString()} · ${s.method} · ${s.currency}`, 'small'), node('p', s.provenance, 'small'));
  if (r.lastError) $('snapshot').append(node('p', r.lastError.message, 'error'));
  const details = node('details'), sum = node('summary', 'Pickup, terms and source history'); details.append(sum, node('pre', s.terms || 'No terms captured. Check the original listing.'), node('p', `${r.history.length} retained source versions. Latest source status: ${s.status}.`, 'small'));
  for (const snap of r.history.slice(-8).reverse()) details.append(node('p', `${new Date(snap.observedAt).toLocaleString()} · ${money(snap.price)} · closes ${snap.endsAt || 'unknown'}`, 'small'));
  $('snapshot').append(details);
  if (s.photos?.length) {
    const photos = node('div', undefined, 'thumbs');
    s.photos.filter(url => /^https:\/\/uccdn\.bid13\.com\/thumbs\//.test(url)).forEach((url, i) => {
      const a = link(url, ''), img = node('img'); img.src = url; img.alt = `Source photo ${i + 1}; inspect before identifying contents`; a.append(img); photos.append(a);
    }); $('snapshot').append(photos, node('p', 'Source photos are evidence to inspect. No unseen contents are valued.', 'small'));
  }
  $('watch-ceiling').value = r.ceiling ?? ''; $('watching').checked = r.watching; $('background').checked = r.background;
  $('background').disabled = s.source !== 'bid13.com'; $('refresh').disabled = !r.background;
  if (!$('item-title').value) $('item-title').value = s.source === 'bid13.com' ? '' : s.title;
  if (!$('item-evidence').value && s.source !== 'bid13.com') $('item-evidence').value = s.url;
  renderComps();
}
function renderComps() {
  const a = currentAppraisal(); $('appraisal').replaceChildren(node('strong', a.low === null ? 'Value unestablished' : `${money(a.low)} – ${money(a.high)}`), node('p', `${a.count} qualified sold items · median ${money(a.mid)}`, 'small'), node('p', a.basis, 'small'));
  $('use-appraisal').disabled = !chosen() || !a.count || a.status !== 'evidence_range' || !$('item-title').value.trim() || !$('item-evidence').value.trim();
  $('comparables').replaceChildren();
  if (!state.comps.length) $('comparables').append(node('p', 'No captured comparisons. Nothing is valued from the asking price.', 'small'));
  for (const c of state.comps) {
    const row = node('div', undefined, 'record'); row.append(link(c.url, c.title), node('p', `${c.status.toUpperCase()} · ${money(c.price)} · ${c.currency} · sold ${c.soldAt ? new Date(c.soldAt).toLocaleDateString() : 'date unknown'} · shipping ${money(c.shipping)}`, 'small'));
    const label = node('label', undefined, 'check'), check = node('input'); check.type = 'checkbox'; check.checked = c.matchConfirmed && c.matchFor === target(); check.disabled = !selected || !$('item-title').value.trim();
    check.onchange = guard(async () => { await call('match', { id: c.id, listingId: selected, itemTitle: $('item-title').value.trim(), confirmed: check.checked }); state = await call('get'); renderComps(); });
    label.append(check, document.createTextNode('I checked this source: same item, comparable condition/quantity, exact sale price.')); row.append(label);
    const reason = N.appraisal([{ ...c, matchConfirmed: check.checked }]).excluded[0]?.reason;
    if (reason) row.append(node('p', reason, 'small'));
    row.append(node('small', `Captured ${new Date(c.observedAt).toLocaleString()} · ${c.provenance}`)); $('comparables').append(row);
  }
}
function renderCosts() {
  for (const k of ['capitalLimit', 'minimumProfit', 'taxBase']) $(k).value = state.ledger.dossier[k] ?? '';
  $('cost-fields').replaceChildren();
  state.ledger.dossier.costEvidence ||= {};
  for (const [k, name] of Object.entries(COST_FIELDS)) {
    const label = node('label', name), input = node('input'); input.type = 'number'; input.min = 0; input.step = '.01'; input.placeholder = 'Unknown'; input.value = state.ledger.dossier.costs[k] ?? ''; input.id = 'cost-' + k;
    const evidence = state.ledger.dossier.costEvidence[k];
    const ref = node('input'); ref.type = 'text'; ref.maxLength = 2000; ref.placeholder = 'Source URL or assumption note'; ref.value = evidence?.ref || ''; ref.setAttribute('aria-label', name + ': source or assumption');
    const origin = node('small', evidence?.kind || 'Unknown / operator assumption');
    input.oninput = guard(async () => { state.ledger.dossier.costs[k] = number(input); state.ledger.dossier.costEvidence[k] = { kind: 'operator_assumption', ref: '', checkedAt: new Date().toISOString() }; ref.value = ''; origin.textContent = 'operator_assumption'; renderDecision(); await saveLedger(); });
    ref.oninput = guard(async () => { const kind = N.safeUrl(ref.value) ? 'operator_linked_source' : 'operator_assumption'; state.ledger.dossier.costEvidence[k] = { kind, ref: ref.value, checkedAt: new Date().toISOString() }; origin.textContent = kind; renderDecision(); await saveLedger(); });
    label.append(input, ref, origin); $('cost-fields').append(label);
  }
}
function snapshotFacts(s) { return JSON.stringify([s.url, s.title, s.price, s.deposit, s.endsAt, s.terms, s.status, s.currency, s.photos || []]); }
function evidenceIssue() {
  const evidence = state.ledger.dossier.lensEvidence;
  if (!evidence) return 'Use a captured source in the ledger first.';
  const r = state.listings[evidence.sourceId];
  if (!r || r.lastError || Date.now() - Date.parse(r.latest.observedAt) > 6 * 60000) return 'Source is stale or refresh failed. Recheck it before locking a forecast.';
  if (evidence.sourceFacts !== snapshotFacts(r.latest)) return 'Source changed since the ledger was prepared. Use the updated source and recheck costs.';
  for (const i of state.ledger.dossier.items) {
    if (!i.included || !i.lensComps) continue;
    const live = i.lensComps.map(ref => state.comps.find(c => c.id === ref.id)).filter(Boolean);
    const a = N.appraisal(live.filter(c => c.matchFor === i.lensTarget));
    if (a.status !== 'evidence_range' || a.accepted.length !== i.lensComps.length || a.low !== i.low || a.mid !== i.mid || a.high !== i.high) return 'Sold evidence changed or aged out. Rebuild this item appraisal.';
  }
  return null;
}
function renderDecision() {
  const result = analyze(state.ledger.dossier), issue = evidenceIssue();
  $('decision').replaceChildren(node('strong', issue ? 'Recheck evidence' : result.maximumBid === null ? 'No supported ceiling' : `Conditional ceiling ${money(result.maximumBid)}`));
  if (issue) $('decision').append(node('p', issue));
  if (result.missing.length) $('decision').append(node('p', `${result.missing.length} missing inputs: ${result.missing.slice(0, 6).join('; ')}${result.missing.length > 6 ? '…' : ''}`, 'small'));
  if (!issue && result.scenarios) { const l = result.scenarios.low; $('decision').append(node('p', `Low scenario: gross ${money(l.proceeds)} · cash costs ${money(l.cashCosts)} · refundable deposit ${money(l.deposit)} · cash reserved ${money(l.cashCommitted)} · owner labor ${money(l.labor)} · economic profit ${money(l.economicProfit)}`, 'small')); }
  const assumptionCount = Object.keys(COST_FIELDS).filter(k => state.ledger.dossier.costs[k] !== null && !['source_observation', 'operator_linked_source'].includes(state.ledger.dossier.costEvidence?.[k]?.kind)).length;
  if (assumptionCount) $('decision').append(node('p', `${assumptionCount} cost input(s) are operator assumptions. Linked sources also require review.`, 'small'));
  $('lock').disabled = !!issue || ['invalid', 'needs_data'].includes(result.status);
  $('ledger-items').replaceChildren();
  for (const i of state.ledger.dossier.items) {
    const row = node('div', undefined, 'record'); row.append(node('strong', `${i.title} × ${i.quantity}`), node('p', `Gross per item: ${money(i.low)} / ${money(i.mid)} / ${money(i.high)}`, 'small'));
    const remove = node('button', 'Remove from draft'); remove.onclick = guard(async () => { state.ledger.dossier.items = state.ledger.dossier.items.filter(x => x.id !== i.id); renderDecision(); await saveLedger(); }); row.append(remove); $('ledger-items').append(row);
  }
  $('forecasts').replaceChildren();
  for (const f of state.ledger.forecasts.slice(-5).reverse()) $('forecasts').append(node('p', `Locked ${new Date(f.lockedAt).toLocaleString()} · ${f.input.title} · ${f.hash}`, 'small'));
}
async function saveLedger() { writing = true; try { await call('ledger', { ledger: state.ledger }); } finally { writing = false; } }
function renderAlerts() { $('alerts').replaceChildren(); if (!state.alerts.length) $('alerts').append(node('p', 'No observed watch events yet.', 'small')); for (const a of state.alerts.slice(-30).reverse()) { const row = node('div', undefined, 'record'); row.append(node('strong', a.message), node('p', `${state.listings[a.listingId]?.latest.title || a.listingId} · ${new Date(a.at).toLocaleString()}`, 'small')); $('alerts').append(row); } }
$('save-watch').onclick = guard(async () => { await call('watch', { id: selected, watching: $('watching').checked, background: $('background').checked, ceiling: number($('watch-ceiling')) }); await load(); notice('Watch settings saved. Source access and browser uptime govern refresh timing.'); });
$('refresh').onclick = guard(async () => { const r = await call('refresh', { id: selected }); await load(); notice(r.note || 'Source refreshed; previous versions retained.'); });
$('use-source').onclick = guard(async () => {
  const s = chosen()?.latest; if (!s) throw new Error('Capture and select a source first.');
  const d = state.ledger.dossier; if (d.auctionUrl && d.auctionUrl !== s.url && d.items.length) throw new Error('Export this ledger before switching its auction; existing item appraisals are preserved.');
  d.title = s.title; d.auctionUrl = s.url; d.costs.bid = s.price; d.costs.refundableDeposit = s.deposit;
  d.costEvidence ||= {};
  for (const k of ['bid', 'refundableDeposit']) d.costEvidence[k] = { kind: 'source_observation', ref: s.url, checkedAt: s.observedAt };
  d.notes = s.terms; d.lensEvidence = { sourceId: selected, sourceFacts: snapshotFacts(s), observedAt: s.observedAt, source: s, comparables: [] };
  renderCosts(); renderDecision(); await saveLedger(); notice('Confirmed price and deposit copied. All other unknown costs remain blank.');
});
$('use-appraisal').onclick = guard(async () => {
  const a = currentAppraisal(), quantity = number($('item-quantity'));
  if (a.status !== 'evidence_range' || !$('item-title').value.trim() || !$('item-evidence').value.trim() || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('Provide a visible item identity, evidence reference, quantity and qualified sold comparisons.');
  if (state.ledger.dossier.auctionUrl !== chosen()?.latest.url) throw new Error('Use this source in the cost ledger first.');
  const item = { ...emptyItem(), title: $('item-title').value.trim(), quantity, low: a.low, mid: a.mid, high: a.high, evidenceRef: $('item-evidence').value.trim() + '\n' + a.accepted.map(c => c.url).join('\n'), origin: 'lens_source_evidence_operator_matched', lensComps: a.accepted, lensTarget: target() };
  const old = state.ledger.dossier.items.findIndex(i => i.lensTarget === item.lensTarget);
  if (old >= 0) state.ledger.dossier.items[old] = item; else state.ledger.dossier.items.push(item);
  renderDecision(); await saveLedger(); notice('Observed sold range added as a gross-resale scenario. Unseen contents remain unpriced.');
});
for (const k of ['capitalLimit', 'minimumProfit', 'taxBase']) $(k).oninput = guard(async () => { state.ledger.dossier[k] = k === 'taxBase' ? $(k).value || null : number($(k)); renderDecision(); await saveLedger(); });
for (const k of ['item-title', 'item-evidence', 'item-quantity']) $(k).oninput = renderComps;
$('lock').onclick = guard(async () => { const issue = evidenceIssue(); if (issue) throw new Error(issue); state.ledger.forecasts.push(await lockLedgerForecast(state.ledger)); await saveLedger(); renderDecision(); notice('Forecast locked with source snapshot and individual comparable evidence. No bid placed.'); });
$('export').onclick = () => download('Nova-Lens-evidence.json', state);
$('export-ledger').onclick = () => download('Nova-Lens-Auction-Desk-ledger.json', state.ledger);
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = guard(async () => { const file = $('import-file').files[0]; if (!file) return; if (file.size > 5e6) throw new Error('Backup exceeds 5 MB limit.'); const candidate = N.validate(JSON.parse(await file.text())); if (candidate.ledger) await validateState(candidate.ledger); await call('import', { state: candidate }); selected = null; await load(); notice('Validated backup restored. Source freshness is still checked against capture time.'); });
chrome.storage.onChanged.addListener((changes, area) => { if (area !== 'local' || !changes[N.KEY] || writing) return; guard(async () => { const fresh = N.validate(changes[N.KEY].newValue); fresh.ledger = fresh.ledger ? await validateState(fresh.ledger) : emptyState(); state = fresh; renderSources(); renderSelected(); renderAlerts(); renderDecision(); })(); });
setInterval(() => { renderSources(); renderDecision(); }, 15000);
await guard(load)();

$('copy-brief').onclick = guard(async () => {
  if (!chosen()) throw new Error('Capture and select a source first.');
  const brief = N.sourceBrief(chosen().latest, state.comps.filter(c => c.matchFor === target()));
  await navigator.clipboard.writeText(brief);
  notice('Public source facts and selected comparable evidence copied. Paste into Nova or ChatGPT for review. Personal ceilings and the cost ledger were not included.');
});
