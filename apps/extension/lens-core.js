/* Nova Lens shared evidence rules. No network, model calls or money actions. */
(function (root) {
  'use strict';
  const KEY = 'nova:lens:v2';
  const clean = v => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 4000) : '';
  const normalizeTerms = v => clean(v).replace(/\s+([.,;:!?])/g, '$1');
  const amount = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e6 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  function safeUrl(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
  }
  function sourceUrl(value) {
    if (!safeUrl(value)) return null;
    const u = new URL(value); u.hash = '';
    // Keep identifiers in query strings on generic sources. Strip tracking only.
    for (const key of [...u.searchParams.keys()]) if (/^utm_|^(?:fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
    const id = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})(?:\/|$)/)?.[1];
    if (/(^|\.)ebay\.com$/.test(u.hostname) && id) return `https://www.ebay.com/itm/${id}`;
    return u.href;
  }
  function money(text) {
    const s = clean(text);
    if (!s || /(?:C|AU|CA|NZ|HK|SG)\s*\$|CAD|AUD|GBP|EUR|€|£|\bto\b|\d\s*[-–]\s*\d/i.test(s)) return null;
    const m = s.match(/(?:US\s*\$|USD\s*|\$)\s*(\d[\d,]*(?:\.\d{1,2})?)(?![\d.])/i);
    const n = m ? Number(m[1].replace(/,/g, '')) : null;
    return amount(n) ? n : null;
  }
  function empty() { return { version: 2, listings: {}, comps: [], alerts: [], ledger: null }; }
  function validate(s) {
    if (!s || s.version !== 2 || !s.listings || typeof s.listings !== 'object' || Array.isArray(s.listings) || !Array.isArray(s.comps) || !Array.isArray(s.alerts)) throw new Error('Invalid Lens evidence workspace.');
    if (Object.keys(s.listings).length > 300 || s.comps.length > 1000 || s.alerts.length > 500) throw new Error('Workspace size limit exceeded.');
    for (const r of Object.values(s.listings)) {
      if (!r || !r.latest || !safeUrl(r.latest.url) || !validSnapshot(r.latest) || !Array.isArray(r.history) || r.history.length > 200 || !r.history.every(validSnapshot)) throw new Error('Invalid source snapshot.');
    }
    if (!s.comps.every(validComp)) throw new Error('Invalid comparable evidence.');
    return JSON.parse(JSON.stringify(s));
  }
  function validSnapshot(s) {
    return !!s && typeof s.id === 'string' && s.id.length < 2000 && typeof s.title === 'string' && s.title.length <= 4000 && safeUrl(s.url) && ['USD', 'UNKNOWN'].includes(s.currency) && (s.price === null || amount(s.price)) && (s.deposit === null || amount(s.deposit)) && Number.isFinite(Date.parse(s.observedAt)) && typeof s.provenance === 'string' && ['open_tab', 'public_page_refresh', 'manual_page'].includes(s.method);
  }
  function validComp(c) {
    return !!c && typeof c.id === 'string' && safeUrl(c.url) && typeof c.title === 'string' && ['sold', 'asking'].includes(c.status) && ['USD', 'UNKNOWN'].includes(c.currency) && (c.price === null || amount(c.price)) && (c.shipping === null || amount(c.shipping)) && Number.isFinite(Date.parse(c.observedAt)) && typeof c.exactPrice === 'boolean';
  }
  function observe(s, snap) {
    if (!validSnapshot(snap)) throw new Error('Source did not yield a valid snapshot.');
    let r = s.listings[snap.id];
    if (!r) {
      if (Object.keys(s.listings).length >= 300) throw new Error('Export a backup before exceeding 300 listings.');
      r = s.listings[snap.id] = { latest: snap, history: [], watching: false, background: false, ceiling: null, lastError: null };
    }
    const prev = r.latest;
    const fields = ['price', 'endsAt', 'deposit', 'pickupDays', 'terms', 'status', 'currency', 'title', 'photos'];
    const changed = fields.filter(k => JSON.stringify(prev[k]) !== JSON.stringify(snap[k]));
    if (!r.history.length || changed.length) r.history = [...r.history, snap].slice(-200);
    r.latest = snap; r.lastError = null;
    if (r.watching && changed.length) addAlert(s, snap.id, `Changed: ${changed.join(', ')}`, snap.observedAt);
    if (r.watching && amount(r.ceiling) && amount(snap.price) && snap.price > r.ceiling && (!amount(prev.price) || prev.price <= r.ceiling)) addAlert(s, snap.id, 'Bid exceeded your ceiling', snap.observedAt);
    return r;
  }
  function addAlert(s, id, message, at = new Date().toISOString()) {
    const last = s.alerts.at(-1);
    if (last?.listingId === id && last?.message === message && last?.at === at) return;
    s.alerts = [...s.alerts, { listingId: id, message, at }].slice(-500);
  }
  function mergeComps(s, rows) {
    const map = new Map(s.comps.map(c => [c.id, c]));
    for (const c of rows) {
      if (!validComp(c)) throw new Error('Malformed comparable; old evidence retained.');
      const old = map.get(c.id);
      const same = old && ['title', 'price', 'shipping', 'currency', 'status', 'soldAt', 'exactPrice', 'condition'].every(k => old[k] === c[k]);
      map.set(c.id, { ...c, matchConfirmed: same && old.matchConfirmed === true, matchFor: same ? old.matchFor || null : null });
    }
    s.comps = [...map.values()].slice(-1000);
  }
  function appraisal(comps, now = Date.now()) {
    const excluded = [], accepted = [], seen = new Set();
    for (const c of comps) {
      let reason = null;
      const key = sourceUrl(c.url);
      if (!validComp(c)) reason = 'Invalid record';
      else if (seen.has(key)) reason = 'Duplicate source item';
      else if (c.status !== 'sold') reason = 'Asking price, not a sale';
      else if (c.currency !== 'USD') reason = 'No USD price';
      else if (!c.exactPrice || !amount(c.price)) reason = 'Sale amount undisclosed or ambiguous';
      else if (!c.matchConfirmed) reason = 'Identity, lot size and condition not confirmed comparable';
      else if (!Number.isFinite(Date.parse(c.soldAt)) || Date.parse(c.soldAt) > now || now - Date.parse(c.soldAt) > 90 * 864e5) reason = 'Missing, future or over-90-day sale date';
      else if (Date.parse(c.observedAt) > now + 60000 || now - Date.parse(c.observedAt) > 7 * 864e5) reason = 'Capture must be checked within 7 days';
      if (reason) excluded.push({ id: c.id, reason });
      else { seen.add(key); accepted.push(c); }
    }
    const prices = accepted.map(c => c.price).sort((a, b) => a - b);
    if (prices.length < 3) return { status: 'needs_evidence', count: prices.length, low: null, mid: null, high: null, accepted, excluded, basis: 'Need 3 distinct recent sold items with confirmed comparability.' };
    const mid = prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
    return { status: 'evidence_range', count: prices.length, low: prices[0], mid: Math.round(mid * 100) / 100, high: prices.at(-1), accepted, excluded, basis: 'Observed item-price minimum / median / maximum. Not predicted sale probabilities; buyer shipping excluded.' };
  }
  function freshness(r, now = Date.now()) {
    const age = now - Date.parse(r.latest.observedAt);
    if (r.lastError) return 'REFRESH FAILED — older evidence retained';
    if (age < -60000) return 'CLOCK MISMATCH';
    if (age <= 30000 && r.latest.method === 'open_tab') return 'LIVE PAGE OBSERVATION';
    if (age <= 6 * 60000) return 'RECENT SNAPSHOT';
    return 'STALE — recheck source';
  }
  function closingAlerts(s, now = Date.now()) {
    for (const [id, r] of Object.entries(s.listings)) {
      if (!r.watching || !Number.isFinite(Date.parse(r.latest.endsAt))) continue;
      const remaining = Date.parse(r.latest.endsAt) - now;
      const window = remaining <= 0 ? 'passed' : remaining <= 15 * 60000 ? '15m' : remaining <= 60 * 60000 ? '1h' : null;
      if (!window) continue;
      const key = r.latest.endsAt + ':' + window;
      r.closingNotices ||= [];
      if (r.closingNotices.includes(key)) continue;
      r.closingNotices = [...r.closingNotices, key].slice(-30);
      addAlert(s, id, window === 'passed' ? 'Last observed closing time passed; outcome unconfirmed' : 'Last observed closing time is within ' + (window === '15m' ? '15 minutes' : '1 hour') + '; recheck source', new Date(now).toISOString());
    }
  }
  function sourceBrief(snapshot, comps = []) {
    if (!validSnapshot(snapshot)) throw new Error('Select a captured source first.');
    const rows = comps.filter(validComp).slice(0, 30).map(c => [
      clean(c.title), c.url, 'Observed: ' + c.observedAt,
      'Status: ' + c.status + '; USD item price: ' + (c.exactPrice && c.currency === 'USD' && amount(c.price) ? c.price : 'unknown / unqualified'),
      'Sale date: ' + (c.soldAt || 'unknown') + '; buyer shipping: ' + (amount(c.shipping) ? c.shipping : 'unknown'),
      'Operator match confirmed: ' + (c.matchConfirmed === true ? 'yes — still verify condition and quantity' : 'no'),
    ].join(' | '));
    return [
      'NOVA SOURCE REVIEW — refresh and verify; no execution authorized', clean(snapshot.title),
      'Source: ' + snapshot.url, 'Observed: ' + snapshot.observedAt + '; method: ' + snapshot.method,
      'Current / asking price: ' + (snapshot.currency === 'USD' && amount(snapshot.price) ? '$' + snapshot.price : 'unknown'),
      'Refundable deposit (tied-up cash): ' + (amount(snapshot.deposit) ? '$' + snapshot.deposit : 'unknown'),
      'Last observed close: ' + (snapshot.endsAt || 'unknown'), 'Source status: ' + (snapshot.status || 'unconfirmed'),
      'Pickup / terms to verify: ' + (clean(snapshot.terms) || 'unknown'),
      'Source photos (contents not automatically identified): ' + (snapshot.photos || []).filter(safeUrl).slice(0, 15).join(' '),
      'Comparable records to verify (not guaranteed resale proceeds):', ...rows,
      'Identify only visible items. Unseen contents stay unpriced. Separate source facts, operator assumptions and missing information. Include premium, tax, rental, fuel, transport, storage, disposal, selling fees, shipping, packaging and labor. Keep refundable deposits separate. Give pursue / watch / pass and unresolved facts; do not bid, buy or send messages.',
    ].join('\n\n');
  }
  const api = { sourceBrief, KEY, clean, normalizeTerms, amount, safeUrl, sourceUrl, money, empty, validate, validSnapshot, validComp, observe, mergeComps, appraisal, freshness, addAlert, closingAlerts };
  root.NovaLens = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);

/* Strict public BID13 adapter for the watch worker; never executes page scripts. */
(function (root) {
  const N = root.NovaLens;
  function parseBid13Html(html, url, at = new Date().toISOString()) {
    const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (/verify you are human|checking your browser|unusual traffic|captcha challenge/i.test(text.slice(0, 2000))) throw new Error('Source verification required; refresh stopped.');
    const priceText = html.match(/id=["']high-bid-amount["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]?.replace(/<[^>]+>/g, ' ');
    const price = N.money(priceText), title = N.clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' '));
    const expiry = html.match(/data-expiry=["'](\d{10})["']/)?.[1];
    const deposit = text.match(/\$([\d,.]+) refundable cleaning deposit/i)?.[1];
    const days = text.match(/(\d+) days? pickup timeline/i)?.[1];
    const state = new URL(url).pathname.match(/\/storage-auctions\/([a-z]{2})\//)?.[1];
    const states = 'al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'.split(' ');
    const usd = states.includes(state) || /\b(?:Ohio|Indiana)\b/.test(text);
    if (!title || price === null || !usd) throw new Error('Unsupported BID13 format or unconfirmed USD currency.');
    const start = text.indexOf('Facility Terms and Conditions'), end = text.indexOf('Note: Before you place a bid', start);
    const photos = [...html.matchAll(/<img\b[^>]*\bsrc=["'](https:\/\/uccdn\.bid13\.com\/thumbs\/[^"']+)["']/gi)].map(m => m[1]).slice(0, 12);
    return { id: N.sourceUrl(url), url: N.sourceUrl(url), title, source: 'bid13.com', method: 'public_page_refresh', observedAt: at, price, currency: 'USD', endsAt: expiry ? new Date(Number(expiry) * 1000).toISOString() : null, deposit: deposit ? N.money('$' + deposit) : null, pickupDays: days ? Number(days) : null, terms: start < 0 ? '' : N.normalizeTerms(text.slice(start, end > start ? end : start + 3300).slice(0, 3300)), status: /auction (?:has ended|is closed|cancelled|canceled)/i.test(start < 0 ? text : text.slice(0, start)) ? 'closed_or_cancelled' : 'listed', photos, provenance: 'Public BID13 HTML: #high-bid-amount, data-expiry, published terms. Refreshed without account cookies; no inferred inventory or final sale.' };
  }
  N.parseBid13Html = parseBid13Html;
})(globalThis);
