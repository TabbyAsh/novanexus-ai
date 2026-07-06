// Nova Lens — content script. Runs ON the eBay listing you're viewing.
// 1. Reads the REAL listing (JSON-LD first, DOM fallbacks) — no typing.
// 2. Harvests REAL sold comps from eBay's own sold-listings search, fetched
//    same-origin as you (your browser, your view — no server scraping).
// 3. Sends both to Nova → renders a literal card with the verdict.
(() => {
  if (window.__novaLens) return; window.__novaLens = true;

  // ── 1. Read the listing ────────────────────────────────────────────────
  function readListing() {
    let title = '', price = NaN, condition = 'Good', shipping = undefined;
    // JSON-LD Product schema — the most stable source on eBay pages
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent);
        const items = Array.isArray(j) ? j : [j];
        for (const it of items) {
          if (it['@type'] === 'Product' || (Array.isArray(it['@type']) && it['@type'].includes('Product'))) {
            title = title || it.name || '';
            const offer = Array.isArray(it.offers) ? it.offers[0] : it.offers;
            if (offer && offer.price) price = parseFloat(offer.price);
            if (it.itemCondition) condition = /new/i.test(String(it.itemCondition)) ? 'New' : 'Good';
          }
        }
      } catch { /* next block */ }
    }
    // DOM fallbacks (selectors current as of 2026; multiple candidates)
    if (!title) title = (document.querySelector('h1.x-item-title__mainTitle span, h1[itemprop="name"], .x-item-title__mainTitle')?.textContent || document.title.replace(/\s*\|\s*eBay.*$/i, '')).trim();
    if (!Number.isFinite(price)) {
      const t = document.querySelector('.x-price-primary span, [itemprop="price"], .x-bin-price__content span')?.textContent || '';
      const m = t.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
      if (m) price = parseFloat(m[1]);
    }
    const shipT = document.querySelector('.ux-labels-values--shipping .ux-textspans--BOLD, [data-testid="ux-labels-values-shipping"]')?.textContent || '';
    if (/free/i.test(shipT)) shipping = 0;
    else { const m = shipT.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/); if (m) shipping = parseFloat(m[1]); }
    return { title: title.slice(0, 140), price, condition, shipping };
  }

  // ── 2. Harvest real sold comps (same-origin fetch, your own session) ──
  async function harvestComps(title) {
    // trim to the meaningful head of the title for a tighter sold-search
    const q = title.split(/[\-–|,(]/)[0].split(/\s+/).slice(0, 8).join(' ');
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_ipg=60`;
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const prices = [];
      for (const el of doc.querySelectorAll('.s-item__price, .s-card__price')) {
        const m = el.textContent.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
        if (m) { const p = parseFloat(m[1]); if (p > 0 && p < 100000) prices.push(p); }
      }
      // drop the first (often a promoted placeholder) and cap at 25
      const clean = prices.slice(1, 26);
      return { comps: clean, soldUrl: url, query: q };
    } catch { return { comps: [], soldUrl: url, query: q }; }
  }

  // ── 3. The card ────────────────────────────────────────────────────────
  function money(n) { return typeof n === 'number' && Number.isFinite(n) ? '$' + n.toFixed(2) : '—'; }
  function render(state) {
    let el = document.getElementById('nova-lens-card');
    if (!el) { el = document.createElement('div'); el.id = 'nova-lens-card'; document.body.appendChild(el); }
    if (state.loading) {
      el.innerHTML = `<div class="nl-head"><span class="nl-logo">N</span> Nova Lens</div><div class="nl-body nl-dim">${state.loading}</div>`;
      return;
    }
    if (state.error) {
      el.innerHTML = `<div class="nl-head"><span class="nl-logo">N</span> Nova Lens</div><div class="nl-body nl-dim">${state.error}</div>`;
      return;
    }
    const a = state.appraisal, L = state.listing;
    const v = a.decision || 'WATCH';
    const cls = v === 'BUY' ? 'nl-buy' : v === 'NEGOTIATE' ? 'nl-neg' : v === 'PASS' ? 'nl-pass' : 'nl-watch';
    el.innerHTML = `
      <div class="nl-head"><span class="nl-logo">N</span> Nova Lens
        <span class="nl-basis">${state.compCount ? state.compCount + ' real sold comps' : 'no comps found'}</span>
        <button class="nl-x" id="nl-close">×</button></div>
      <div class="nl-verdict ${cls}">${v}${a.maxBuyPrice ? ` · max buy ${money(a.maxBuyPrice)}` : ''}</div>
      <div class="nl-grid">
        <div><span>Asking</span><b>${money(L.price)}</b></div>
        <div><span>Sold range</span><b>${money(a.expectedResaleLow)}–${money(a.expectedResaleHigh)}</b></div>
        <div><span>Fees + ship</span><b>${money(a.estimatedFees)} + ${money(a.estimatedShipping)}</b></div>
        <div><span>Net if resold</span><b>${money(a.expectedNetProfitLow)} to ${money(a.expectedNetProfitHigh)}</b></div>
        <div><span>Est. sale time</span><b>${state.days || '—'}</b></div>
        <div><span>Confidence</span><b>${Math.round((a.confidence || 0) * 100)}%</b></div>
      </div>
      <div class="nl-actions">
        <button class="nl-btn" id="nl-offer">Copy offer message</button>
        <a class="nl-btn nl-link" href="${state.soldUrl}" target="_blank">See sold comps</a>
      </div>
      <div class="nl-foot">Decision support, not a guarantee. Comps pulled from your own eBay view.</div>`;
    document.getElementById('nl-close').onclick = () => el.remove();
    document.getElementById('nl-offer').onclick = () => {
      navigator.clipboard.writeText(a.negotiationScript || `Would you take ${money(a.maxBuyPrice)}? I can buy today.`);
      document.getElementById('nl-offer').textContent = 'Copied ✓';
    };
  }

  // ── main ───────────────────────────────────────────────────────────────
  async function main() {
    const L = readListing();
    if (!L.title || !Number.isFinite(L.price)) return; // not a parsable listing — stay silent
    render({ loading: 'Reading listing + pulling real sold comps…' });
    const { comps, soldUrl } = await harvestComps(L.title);
    chrome.runtime.sendMessage(
      { type: 'appraise', title: L.title, price: L.price, condition: L.condition, shipping: L.shipping, comps },
      (resp) => {
        if (!resp || !resp.ok || !resp.data?.appraisal) {
          render({ error: (resp && resp.error) || 'Nova unreachable — try again in a minute.' });
          return;
        }
        render({
          appraisal: resp.data.appraisal,
          listing: L,
          compCount: comps.length,
          soldUrl,
          days: resp.data.est_days_to_sell || resp.data.appraisal?.est_days_to_sell,
        });
      }
    );
  }
  // eBay is a SPA — run on load and again on in-page navigation to a new item
  main();
  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref && /\/itm\//.test(location.href)) {
      lastHref = location.href; window.__novaLens = true; setTimeout(main, 1200);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
