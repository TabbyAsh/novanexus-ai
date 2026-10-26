import { COST_FIELDS, emptyState, emptyDossier, emptyItem, analyze, lockLedgerForecast,
  validateState, validateOutcome, learningSummary, appraisalToItem, uid } from './core.mjs';
const KEY = 'nova:auction-desk:v1';
const $ = id => document.getElementById(id);
const money = n => n === null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const number = el => el.value.trim() === '' ? null : Number(el.value);
let state = emptyState(); let storageBlocked = false; let locking = false;
function node(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
function notify(text, error = false) { $('message').textContent = text; $('message').className = error ? 'notice error' : 'notice'; }
function persist() {
  if (storageBlocked) { $('save-status').textContent = 'Autosave paused — export this session'; return; }
  try { localStorage.setItem(KEY, JSON.stringify(state)); $('save-status').textContent = 'Saved in this browser'; }
  catch { $('save-status').textContent = 'Browser save failed — export a backup'; }
}
function numericField(label, value, change, attrs = {}) {
  const l = node('label', label), i = node('input'); i.type = 'number'; i.min = '0'; i.step = '.01'; i.max = '1000000'; i.placeholder = 'Unknown';
  i.value = value === null ? '' : String(value); Object.assign(i, attrs);
  i.addEventListener('input', () => { change(number(i)); update(); }); l.append(i); return l;
}
function textField(label, value, change, multiline = false) {
  const l = node('label', label), i = node(multiline ? 'textarea' : 'input'); i.value = value; i.maxLength = 4000;
  i.addEventListener('input', () => { change(i.value); update(); }); l.append(i); return l;
}
function renderItems() {
  $('items').replaceChildren();
  if (!state.dossier.items.length) $('items').append(node('p', 'No items yet. Nothing is assumed valuable.', 'empty'));
  state.dossier.items.forEach((i, index) => {
    const card = node('div', undefined, 'item'), top = node('div', undefined, 'row');
    const remove = node('button', 'Remove'); remove.addEventListener('click', () => { state.dossier.items.splice(index, 1); renderItems(); update(); });
    top.append(node('strong', `Item ${index + 1}`), remove); card.append(top);
    const fields = node('div', undefined, 'fields');
    fields.append(textField('Description / identity', i.title, v => i.title = v));
    fields.append(numericField('Quantity', i.quantity, v => i.quantity = v, { min: '1', max: '1000', step: '1' }));
    card.append(fields);
    const include = node('label', undefined, 'check'), cb = node('input'); cb.type = 'checkbox'; cb.checked = i.included;
    cb.addEventListener('change', () => { i.included = cb.checked; update(); });
    include.append(cb, document.createTextNode('Include this explicitly identified item')); card.append(include);
    const nums = node('div', undefined, 'numbers');
    ['low', 'mid', 'high'].forEach(k => nums.append(numericField(`${k.toUpperCase()} / unit ($)`, i[k], v => i[k] = v)));
    card.append(nums, textField('Evidence reference(s): source URL, vault record, photo ID or source hash', i.evidenceRef, v => i.evidenceRef = v, true));
    card.append(node('small', `Origin: ${i.origin}${i.appraisalId ? ` · appraisal ${i.appraisalId}` : ''}. Not independently verified.`));
    $('items').append(card);
  });
}
function renderForm() {
  for (const k of ['title', 'auctionUrl', 'notes']) $(k).value = state.dossier[k];
  for (const k of ['capitalLimit', 'minimumProfit']) $(k).value = state.dossier[k] ?? '';
  $('taxBase').value = state.dossier.taxBase ?? '';
  $('cost-fields').replaceChildren();
  for (const [k, label] of Object.entries(COST_FIELDS)) {
    const field = numericField(label, state.dossier.costs[k], v => state.dossier.costs[k] = v,
      { id: `cost-${k}`, max: k.endsWith('Pct') ? '100' : k === 'laborHours' ? '10000' : '1000000' });
    $('cost-fields').append(field);
  }
  renderItems(); renderHistory(); update(false);
}
function update(save = true) {
  const r = analyze(state.dossier);
  $('status').textContent = { needs_data: 'NEEDS DATA', invalid: 'INVALID', review: 'HUMAN REVIEW', skip: 'OUTSIDE LIMITS' }[r.status];
  $('ceiling').textContent = r.maximumBid === null ? (r.status === 'skip' ? 'No feasible bid' : 'Unknown') : money(r.maximumBid);
  $('lock').disabled = locking || ['invalid', 'needs_data'].includes(r.status);
  $('missing').replaceChildren(); $('scenario-results').replaceChildren();
  if (r.missing.length) {
    const details = node('details'); details.open = true;
    details.append(node('summary', `${r.missing.length} required inputs / corrections`)); const list = node('ul');
    r.missing.forEach(v => list.append(node('li', v))); details.append(list); $('missing').append(details);
  }
  if (r.exclusions.length) $('missing').append(node('p', `${r.exclusions.length} excluded item(s): $0 counted.`, 'muted'));
  if (r.scenarios) {
    const summary = node('div', undefined, 'submetrics');
    for (const [label, val] of [['Low-case economic profit', r.scenarios.low.economicProfit], ['Low-case cash reserve', r.scenarios.low.cashCommitted]]) {
      const c = node('div'); c.append(node('small', label), node('strong', money(val))); summary.append(c);
    }
    const t = node('table'), head = node('tr'); ['USD', 'Low', 'Mid', 'High'].forEach(x => head.append(node('th', x))); t.append(head);
    for (const [label, k] of [['Gross proceeds', 'proceeds'], ['Acquisition + tax', 'acquisition'], ['Variable fees', 'variableFees'], ['Other cash costs', 'fixed'], ['Owner labor value', 'labor'], ['Economic profit', 'economicProfit']]) {
      const row = node('tr'); row.append(node('td', label)); ['low', 'mid', 'high'].forEach(s => row.append(node('td', money(r.scenarios[s][k])))); t.append(row);
    }
    $('scenario-results').append(summary, t, node('p', 'Cash reserve includes deposit and low-case selling costs, excludes owner labor. It is not a timing-accurate cash-flow forecast.', 'muted'));
  }
  if (save) persist();
}
function renderHistory() {
  $('history').replaceChildren(); const select = $('outcome-forecast'), previous = select.value; select.replaceChildren();
  if (!state.forecasts.length) { $('history').append(node('p', 'No locked forecasts. No activity is simulated.', 'empty')); select.append(new Option('Lock a forecast first', '')); }
  [...state.forecasts].reverse().forEach(f => {
    const row = node('div', undefined, 'record'); row.append(node('strong', f.input.title), node('div', `${new Date(f.lockedAt).toLocaleString()} · ${f.result.status}`, 'muted'));
    row.append(node('div', `Ceiling: ${f.result.maximumBid === null ? 'none feasible' : money(f.result.maximumBid)}`), node('code', `SHA-256 ${f.hash}`));
    $('history').append(row); select.append(new Option(`${f.input.title} · ${f.lockedAt}`, f.id));
  });
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
  $('record-outcome').disabled = !state.forecasts.length;
  const s = learningSummary(state); $('learning').replaceChildren();
  $('learning').append(node('p', `${s.resolved} resolved forecasts · ${s.won} won · ${s.lost} lost · ${s.noBid} no bid`));
  $('learning').append(node('p', `${s.completed} reconciled wins · gross-sales mean absolute error: ${money(s.meanAbsoluteGrossError)}`));
  if (s.rows.length) { const last = s.rows.at(-1); $('learning').append(node('p', `Latest completed economic profit: ${money(last.actualEconomicProfit)}`)); }
}
for (const k of ['title', 'auctionUrl', 'notes']) $(k).addEventListener('input', () => { state.dossier[k] = $(k).value; update(); });
for (const k of ['capitalLimit', 'minimumProfit']) $(k).addEventListener('input', () => { state.dossier[k] = number($(k)); update(); });
$('taxBase').addEventListener('change', () => { state.dossier.taxBase = $('taxBase').value || null; update(); });
$('add-item').addEventListener('click', () => { if (state.dossier.items.length >= 200) return notify('Maximum 200 items.', true); state.dossier.items.push(emptyItem()); renderItems(); update(); });
$('new').addEventListener('click', () => { if (!confirm('Start an empty draft? Unsnapshotted draft edits will be replaced. Locked forecasts and outcomes stay.')) return; state.dossier = emptyDossier(); renderForm(); persist(); notify('New empty draft; history retained.'); });
$('lock').addEventListener('click', async () => {
  if (locking) return; locking = true; update(false);
  try {
    if (state.forecasts.length >= 1000) throw new Error('Export and archive this ledger before exceeding 1000 forecasts.');
    const snapshot = await lockLedgerForecast(state); state.forecasts.push(snapshot); renderHistory(); persist(); notify('Forecast locked. Future draft edits leave this snapshot unchanged.');
  } catch (e) { notify(e.message, true); } finally { locking = false; update(false); }
});
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = node('a'); a.href = URL.createObjectURL(blob); a.download = `nova-auctions-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  notify('Ledger exported. Treat it as private operational data.');
});
$('import').addEventListener('click', () => $('import-file').click());
$('appraisal-import').addEventListener('click', () => $('appraisal-file').click());
async function readJSON(file) { if (!file) return null; if (file.size > 5_000_000) throw new Error('File exceeds 5 MB limit.'); return JSON.parse(await file.text()); }
$('import-file').addEventListener('change', async e => {
  try {
    const value = await readJSON(e.target.files[0]); if (!value) return;
    const incoming = await validateState(value);
    if (!confirm('Replace this browser ledger with the validated import? Export your current ledger first.')) return;
    state = incoming; storageBlocked = false; renderForm(); persist(); notify('Ledger imported; stored forecast hashes and calculations checked. Sources remain unverified.');
  } catch (e) { notify(`Import rejected; current ledger unchanged. ${e.message}`, true); } finally { $('import-file').value = ''; }
});
$('appraisal-file').addEventListener('change', async e => {
  try {
    if (state.dossier.items.length >= 200) throw new Error('Maximum 200 items.');
    const value = await readJSON(e.target.files[0]); if (!value) return;
    state.dossier.items.push(appraisalToItem(value)); renderItems(); update(); notify('Appraisal imported as unverified input. Check identity, condition, sold evidence and proceeds before locking.');
  } catch (e) { notify(e.message, true); } finally { $('appraisal-file').value = ''; }
});
$('record-outcome').addEventListener('click', () => {
  try {
    if (state.outcomes.length >= 5000) throw new Error('Export and archive this ledger before exceeding 5000 outcomes.');
    const o = { id: uid(), recordedAt: new Date().toISOString(), forecastId: $('outcome-forecast').value,
      status: $('outcome-status').value, finalized: $('outcome-finalized').checked, notes: $('outcome-notes').value };
    for (const k of ['winningBid', 'grossSales', 'totalCashCost', 'ownerHours']) o[k] = number($(`outcome-${k}`));
    const errors = validateOutcome(o, state.forecasts, state.outcomes); if (errors.length) throw new Error(errors.join('; '));
    state.outcomes.push(o); renderHistory(); persist(); notify('Outcome appended. Earlier outcome records and forecasts are retained.');
  } catch (e) { notify(e.message, true); }
});
try {
  const saved = localStorage.getItem(KEY);
  if (saved) { if (saved.length > 5_000_000) throw new Error('Saved ledger exceeds 5 MB.'); state = await validateState(JSON.parse(saved)); }
  $('save-status').textContent = saved ? 'Saved ledger validated and restored' : 'Empty workspace · no assumptions';
} catch (e) { storageBlocked = true; $('save-status').textContent = 'Stored data untouched · autosave paused'; notify(`Stored ledger could not be loaded: ${e.message}. Import a valid backup; existing stored data will not be overwritten.`, true); }
renderForm();
