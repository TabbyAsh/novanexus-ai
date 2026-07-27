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
  //
  // Prices are read together with the TITLE they belong to. Reading prices
  // alone is what produced a "$1.86 max buy" on a real listing: a sold page
  // returns the item's cables, cases and manuals too, and when those outnumber
  // the product they become the median. Selection is delegated to NovaComps
  // (comps.js) so it can be unit-tested without a live eBay page.
  async function harvestComps(title) {
    // trim to the meaningful head of the title for a tighter sold-search
    const q = title.split(/[\-–|,(]/)[0].split(/\s+/).slice(0, 8).join(' ');
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_ipg=60`;
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const rows = [];
      for (const li of doc.querySelectorAll('li.s-item, li.s-card')) {
        const t = li.querySelector('.s-item__title, .s-card__title');
        const p = li.querySelector('.s-item__price, .s-card__price');
        if (!t || !p) continue;
        // eBay glues "Opens in a new window or tab" onto titles with no space,
        // so match the filler row by prefix rather than exact equality.
        const text = t.textContent.replace(/opens in a new window or tab/gi, ' ').trim();
        if (!text || /^shop on ebay\b/i.test(text)) continue; // eBay's placeholder row
        // "$18.99 to $24.99" ranges are multi-variant listings, not one sale — skip
        if (/\bto\b/i.test(p.textContent)) continue;
        const m = p.textContent.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
        if (!m) continue;
        const price = parseFloat(m[1]);
        // What each seller charged to ship this exact item — real evidence of
        // what shipping costs, instead of a category guess.
        const ship = li.querySelector('.s-item__shipping, .s-card__shipping, .s-item__logisticsCost, .s-card__logisticsCost');
        const shipping = NovaComps.parseShipping(ship && ship.textContent);
        if (price > 0 && price < 100000) rows.push({ title: text, price, shipping });
        if (rows.length >= 60) break;
      }

      const sel = NovaComps.selectComps(title, rows);
      const comps = NovaComps.rejectOutliers(sel.comps);
      const ship = NovaComps.shippingEstimate(sel.kept);
      return { comps, soldUrl: url, query: q, scanned: rows.length, rejected: sel.rejected, reasons: sel.reasons, ship };
    } catch { return { comps: [], soldUrl: url, query: q, scanned: 0, rejected: 0, reasons: {}, ship: { value: null, basis: 'no_evidence', observed: 0 } }; }
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
      const link = state.soldUrl
        ? `<div class="nl-actions"><a class="nl-btn nl-link" href="${state.soldUrl}" target="_blank">See sold comps</a></div>`
        : '';
      el.innerHTML = `<div class="nl-head"><span class="nl-logo">N</span> Nova Lens<button class="nl-x" id="nl-close">×</button></div><div class="nl-body nl-dim">${state.error}</div>${link}`;
      const x = document.getElementById('nl-close');
      if (x) x.onclick = () => el.remove();
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
        <div><span>${L.shipping ? 'Costs you' : 'Asking'}</span><b>${money(L.price + (L.shipping || 0))}</b>${L.shipping ? `<i class="nl-note">${money(L.price)} + ${money(L.shipping)} ship</i>` : ''}</div>
        <div><span>Sold range</span><b>${money(a.expectedResaleLow)}–${money(a.expectedResaleHigh)}</b></div>
        <div><span>Fees + resale ship</span><b>${money(a.estimatedFees)} + ${money(a.estimatedShipping)}</b>${state.ship && state.ship.basis === 'observed' ? `<i class="nl-note">ship from ${state.ship.observed} real sale${state.ship.observed === 1 ? '' : 's'}</i>` : `<i class="nl-note">ship estimated by category</i>`}</div>
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
    if (!L.title || !Number.isFinite(L.price)) {
      // We are on an /itm/ page, so this IS a listing — failing to read it is a
      // real breakage (eBay changed its markup), not a quiet no-op. Say so:
      // silence would read as "the extension is broken" with nothing to report.
      render({ error: 'Could not read this listing’s title or price — eBay may have changed its layout. Nothing was guessed.' });
      return;
    }
    render({ loading: 'Reading listing + pulling real sold comps…' });
    const { comps, soldUrl, scanned, rejected, ship } = await harvestComps(L.title);

    // Refuse rather than invent. If the surviving comps are too few, or worth a
    // fraction of what is being asked, the match is wrong — and a confident
    // wrong number is worse than no number, because someone acts on it.
    const coherence = NovaComps.assessCoherence(comps, L.price);
    if (!coherence.ok) {
      render({
        error: `${coherence.reason} Checked ${scanned} sold listing${scanned === 1 ? '' : 's'}, ${rejected} were a different product. Open the sold comps and judge it yourself.`,
        soldUrl,
      });
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: 'appraise', title: L.title, price: L.price, condition: L.condition,
        shipping: L.shipping,                       // what YOU pay to receive it
        resaleShipping: ship && ship.value,         // what sellers of this item actually charge
        comps,
      },
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
          ship,
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
