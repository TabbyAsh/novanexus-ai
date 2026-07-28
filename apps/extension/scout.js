/**
 * NOVA SCOUT — sourcing, not judging.
 *
 * Nova Lens answers "is this one worth buying?" about an item you already
 * found. Scout answers the question that actually makes money: "which of these
 * sixty listings is underpriced right now?"
 *
 * It runs on an eBay SEARCH page, reads every result, and for each candidate
 * pulls that item's own sold comps from your session — then ranks by expected
 * profit. eBay blocks servers and automated browsers, but not you, which is why
 * this has to live here rather than in a scanner we run ourselves.
 *
 * Discipline, because a sourcing tool that is wrong is worse than none:
 *  - comps come from SOLD listings only, never from what other sellers ask
 *  - the same relevance filtering as Lens (comps.js) — a battery is not a drill
 *  - anything that fails the coherence guard is dropped, not shown with a caveat
 *  - lookups are throttled and capped; this is your session, not a crawler
 */
(() => {
  if (window.__novaScout) return; window.__novaScout = true;

  const MAX_LOOKUPS = 25;        // comps fetches per scan
  const DELAY_MS = 700;          // spacing between fetches
  const MIN_PROFIT = 12;         // don't surface noise
  const MIN_MARGIN = 0.22;       // profit as a share of the buy price

  const money = (n) => (Number.isFinite(n) ? '$' + n.toFixed(2) : '—');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const compsCache = new Map();

  // ── read the search results ────────────────────────────────────────────
  function readResults() {
    const rows = [];
    for (const li of document.querySelectorAll('li.s-item, li.s-card')) {
      const t = li.querySelector('.s-item__title, .s-card__title');
      const p = li.querySelector('.s-item__price, .s-card__price');
      const a = li.querySelector('a.s-item__link, a.s-card__link, a[href*="/itm/"]');
      if (!t || !p || !a) continue;
      const title = t.textContent.replace(/opens in a new window or tab/gi, ' ').trim();
      if (!title || /^shop on ebay\b/i.test(title)) continue;
      if (/\bto\b/i.test(p.textContent)) continue;        // variant price range
      const m = p.textContent.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
      if (!m) continue;
      const price = parseFloat(m[1]);
      if (!(price > 0)) continue;
      const shipEl = li.querySelector('.s-item__shipping, .s-card__shipping, .s-item__logisticsCost');
      const shipping = NovaComps.parseShipping(shipEl && shipEl.textContent);
      rows.push({ title, price, shipping: shipping || 0, url: a.href.split('?')[0] });
    }
    return rows;
  }

  async function fetchComps(title) {
    const q = title.split(/[\-–|,(]/)[0].split(/\s+/).slice(0, 8).join(' ');
    if (compsCache.has(q)) return compsCache.get(q);
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_ipg=60`;
    let result = { comps: [], ship: { value: null }, soldUrl: url, scanned: 0 };
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const rows = [];
      for (const li of doc.querySelectorAll('li.s-item, li.s-card')) {
        const t = li.querySelector('.s-item__title, .s-card__title');
        const p = li.querySelector('.s-item__price, .s-card__price');
        if (!t || !p) continue;
        const text = t.textContent.replace(/opens in a new window or tab/gi, ' ').trim();
        if (!text || /^shop on ebay\b/i.test(text)) continue;
        if (/\bto\b/i.test(p.textContent)) continue;
        const m = p.textContent.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
        if (!m) continue;
        const price = parseFloat(m[1]);
        const shipEl = li.querySelector('.s-item__shipping, .s-card__shipping, .s-item__logisticsCost');
        rows.push({ title: text, price, shipping: NovaComps.parseShipping(shipEl && shipEl.textContent) });
        if (rows.length >= 60) break;
      }
      const sel = NovaComps.selectComps(title, rows);
      result = {
        comps: NovaComps.rejectOutliers(sel.comps),
        ship: NovaComps.shippingEstimate(sel.kept),
        soldUrl: url,
        scanned: rows.length,
      };
    } catch { /* leave the empty result */ }
    compsCache.set(q, result);
    return result;
  }

  function appraise(listing, comps, resaleShip) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'appraise',
          title: listing.title,
          price: listing.price,
          shipping: listing.shipping,
          resaleShipping: resaleShip,
          condition: 'Good',
          comps,
        },
        (resp) => resolve(resp && resp.ok && resp.data ? resp.data.appraisal : null)
      );
    });
  }

  // ── the panel ──────────────────────────────────────────────────────────
  function panel() {
    let el = document.getElementById('nova-scout');
    if (!el) { el = document.createElement('div'); el.id = 'nova-scout'; document.body.appendChild(el); }
    return el;
  }

  function renderProgress(done, total, hits) {
    panel().innerHTML = `
      <div class="ns-head"><span class="ns-logo">N</span> Nova Scout
        <button class="ns-x" id="ns-close">×</button></div>
      <div class="ns-body">Checking sold comps… ${done}/${total}${hits ? ` · ${hits} worth a look` : ''}</div>
      <div class="ns-bar"><i style="width:${total ? Math.round((done / total) * 100) : 0}%"></i></div>`;
    const x = document.getElementById('ns-close');
    if (x) x.onclick = () => panel().remove();
  }

  function renderResults(found, checked) {
    const rows = found.map((f) => `
      <a class="ns-row" href="${f.listing.url}" target="_blank">
        <div class="ns-row-top">
          <b>${money(f.profit)}</b> profit
          <span class="ns-roi">${Math.round(f.margin * 100)}% margin</span>
          <span class="ns-conf">${Math.round((f.a.confidence || 0) * 100)}% conf</span>
        </div>
        <div class="ns-title">${f.listing.title.slice(0, 88)}</div>
        <div class="ns-nums">buy ${money(f.cost)} → sells ${money(f.a.expectedResaleLow)}–${money(f.a.expectedResaleHigh)}
          · ${f.compCount} sold comps</div>
      </a>`).join('');

    panel().innerHTML = `
      <div class="ns-head"><span class="ns-logo">N</span> Nova Scout
        <span class="ns-basis">${found.length} of ${checked} checked</span>
        <button class="ns-x" id="ns-close">×</button></div>
      ${found.length ? rows : `<div class="ns-body">Nothing on this page clears the bar — every listing is priced at or above what it actually sells for. That is the normal answer on a picked-over search, and it is worth more than a made-up opportunity.</div>`}
      <div class="ns-foot">Profit is after eBay fees and shipping, from SOLD comps only. Decision support, not a guarantee.</div>`;
    const x = document.getElementById('ns-close');
    if (x) x.onclick = () => panel().remove();
  }

  // ── main ───────────────────────────────────────────────────────────────
  async function scan() {
    const all = readResults();
    if (all.length === 0) return;
    const candidates = NovaComps.prioritiseListings(all, MAX_LOOKUPS);
    if (candidates.length === 0) {
      renderResults([], 0);
      return;
    }

    const found = [];
    for (let i = 0; i < candidates.length; i++) {
      renderProgress(i, candidates.length, found.length);
      const listing = candidates[i];
      const { comps, ship } = await fetchComps(listing.title);

      const coherence = NovaComps.assessCoherence(comps, listing.price);
      if (!coherence.ok) { await sleep(DELAY_MS); continue; }

      const a = await appraise(listing, comps, ship.value);
      if (!a) { await sleep(DELAY_MS); continue; }

      const cost = listing.price + (listing.shipping || 0);
      const profit = a.expectedNetProfitMid;
      const margin = cost > 0 ? profit / cost : 0;
      if (NovaComps.clearsBar({ profit, cost, decision: a.decision }, { minProfit: MIN_PROFIT, minMargin: MIN_MARGIN })) {
        found.push({ listing, a, profit, margin, cost, compCount: comps.length });
        found.sort((x, y) => y.profit - x.profit);
      }
      await sleep(DELAY_MS);
    }

    renderResults(found, candidates.length);
  }

  // eBay search pages are single-page-app navigations, so rescan on change.
  scan();
  let last = location.href;
  new MutationObserver(() => {
    if (location.href !== last && /\/sch\//.test(location.href)) {
      last = location.href;
      compsCache.clear();
      setTimeout(scan, 1500);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
