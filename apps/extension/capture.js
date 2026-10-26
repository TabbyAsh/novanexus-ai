/* Read only the rendered page or an explicitly supplied public HTML document. */
(function (root) {
  'use strict';
  const N = root.NovaLens;
  const text = (doc, selector) => N.clean(doc.querySelector(selector)?.textContent || '');
  function capture(doc, href, method = 'open_tab', at = new Date().toISOString()) {
    const u = new URL(href), host = u.hostname.replace(/^www\./, ''), url = N.sourceUrl(href);
    if (!url) throw new Error('Unsupported page URL.');
    if (host === 'ebay.com' && u.pathname.startsWith('/sch/')) return { kind: 'comps', rows: ebayComps(doc, href, at) };
    const body = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
    if (/verify you are human|checking your browser|unusual traffic|captcha challenge/i.test(doc.title + ' ' + body.slice(0, 1000))) throw new Error('Source requires verification; no data inferred.');
    const snap = { id: url, url, title: text(doc, 'h1') || N.clean(doc.title), source: host, method, observedAt: at, currency: 'UNKNOWN', price: null, endsAt: null, deposit: null, pickupDays: null, terms: '', status: 'unknown', photos: [], provenance: 'Rendered page; uninspected goods remain unpriced.' };
    if (host === 'bid13.com') {
      snap.title = text(doc, 'h1');
      snap.price = N.money(text(doc, '#high-bid-amount'));
      // This adapter covers US listings only. Canadian auctions remain unpriced.
      if (/\/storage-auctions\/[a-z]{2}\//.test(u.pathname) && !/\/storage-auctions\/(?:on|bc|qc|ab|mb|sk|ns|nb|nl|pe|nt|nu|yt)\//.test(u.pathname) || /\b(?:Ohio|OH|Indiana|IN)\b/.test(text(doc, '.auction-location, .field-name-field-location') || body)) snap.currency = 'USD';
      if (snap.currency !== 'USD') snap.price = null;
      const epoch = doc.querySelector('[data-expiry]')?.getAttribute('data-expiry');
      if (epoch && /^\d{10}$/.test(epoch)) snap.endsAt = new Date(Number(epoch) * 1000).toISOString();
      const dep = body.match(/\$([\d,.]+) refundable cleaning deposit/i)?.[1];
      snap.deposit = snap.currency === 'USD' && dep ? N.money('$' + dep) : null;
      const days = body.match(/(\d+) days? pickup timeline/i)?.[1];
      snap.pickupDays = days ? Number(days) : null;
      // Preserve operational clauses without retaining other bidders' identities.
      const start = body.indexOf('Facility Terms and Conditions'), end = body.indexOf('Note: Before you place a bid', start);
      snap.terms = start >= 0 ? N.normalizeTerms(body.slice(start, end > start ? end : start + 3300).slice(0, 3300)) : '';
      snap.photos = [...doc.querySelectorAll('img[src]')].map(i => i.getAttribute('src')).filter(v => /^https:\/\/uccdn\.bid13\.com\/thumbs\//.test(v)).slice(0, 12);
      snap.status = /auction (?:has ended|is closed|cancelled|canceled)/i.test(start < 0 ? body : body.slice(0, start)) ? 'closed_or_cancelled' : 'listed';
      snap.provenance = 'BID13 page: #high-bid-amount; [data-expiry]; published cleanout/deposit clauses. Current bid is not a winning bid or resale value.';
      if (!snap.title || snap.price === null) throw new Error('BID13 page format or currency not supported; previous snapshot retained.');
    } else {
      // JSON-LD is page evidence, not proof of authenticity, condition or value.
      for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const raw = JSON.parse(script.textContent); const roots = Array.isArray(raw) ? raw : [raw];
          for (const x of roots.flatMap(x => x['@graph'] || [x])) {
            if (![x['@type']].flat().includes('Product')) continue;
            snap.title = N.clean(x.name) || snap.title;
            const offer = Array.isArray(x.offers) ? x.offers[0] : x.offers;
            if (offer?.priceCurrency === 'USD' && N.amount(Number(offer.price)) && offer.price !== '' && offer.price != null) { snap.currency = 'USD'; snap.price = Number(offer.price); }
          }
        } catch { /* malformed structured data remains unknown */ }
      }
      if (host === 'ebay.com') {
        snap.title = text(doc, 'h1.x-item-title__mainTitle, h1[itemprop="name"], h1') || snap.title;
        const p = N.money(text(doc, '.x-price-primary, [itemprop="price"], .x-bin-price__content'));
        if (p !== null) { snap.currency = 'USD'; snap.price = p; }
        snap.status = /this listing (?:sold|ended)|this item (?:sold|is no longer available)/i.test(body) ? 'ended_unconfirmed_sale' : 'listed';
        snap.provenance = 'eBay rendered item page / Product JSON-LD. Displayed price is asking/current-bid context, not a sold comparable.';
      } else snap.provenance = 'Manual page scan: Product JSON-LD / visible heading. Unsupported fields remain unknown.';
    }
    return { kind: 'listing', snapshot: snap };
  }
  function ebayComps(doc, href, at) {
    const soldFilter = new URL(href).searchParams.get('LH_Sold') === '1';
    const rows = [];
    for (const row of doc.querySelectorAll('.s-item, .s-card')) {
      const a = row.querySelector('a[href*="/itm/"]'), url = N.sourceUrl(a?.href || a?.getAttribute('href'));
      if (!url || !/\/itm\/\d{9,15}$/.test(new URL(url).pathname)) continue;
      const title = text(row, '.s-item__title, .s-card__title, h3');
      if (!title || /shop on ebay/i.test(title)) continue;
      const all = N.clean(row.textContent), priceText = text(row, '.s-item__price, .s-card__price');
      const date = all.match(/Sold\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2})/i)?.[1];
      const dateMs = date ? Date.parse(date + ' 12:00:00 GMT') : NaN;
      const exactPrice = !/best offer accepted|accepted best offer|price undisclosed/i.test(all) && N.money(priceText) !== null;
      const ship = text(row, '.s-item__shipping, .s-card__shipping');
      rows.push({ id: url, url, title, source: 'ebay.com', status: soldFilter && date ? 'sold' : 'asking', price: N.money(priceText), currency: N.money(priceText) === null ? 'UNKNOWN' : 'USD', shipping: /free/i.test(ship) ? 0 : N.money(ship), soldAt: Number.isFinite(dateMs) ? new Date(dateMs).toISOString() : null, observedAt: at, exactPrice, matchConfirmed: false, condition: text(row, '.SECONDARY_INFO, .s-card__subtitle'), provenance: 'Visible result row captured on ' + N.sourceUrl(href) + '; confirm model, condition, quantity and final sale amount.' });
    }
    return rows.slice(0, 100);
  }
  root.NovaLensCapture = { capture, ebayComps };
  if (typeof module !== 'undefined') module.exports = root.NovaLensCapture;
})(globalThis);
