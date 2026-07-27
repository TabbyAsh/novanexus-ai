// Nova Lens — background worker. The content script (on ebay.com) sends the
// listing + harvested sold comps here; we call Nova's appraisal API (cross-
// origin needs host_permissions, which the worker has) and return the card.
const API = 'https://abackend-production.up.railway.app/v1/flip/appraise';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'appraise') return;
  (async () => {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: msg.title,
          // What it actually costs to acquire: the price PLUS what you pay to
          // have it shipped to you.
          buy_price: Number((msg.price + (Number.isFinite(msg.shipping) ? msg.shipping : 0)).toFixed(2)),
          condition: msg.condition || 'Good',
          shipping_or_pickup: 'shipping',
          target_platform: 'eBay',
          // estimatedShipping is deliberately NOT sent. The API subtracts it
          // from RESALE proceeds — it is the cost of shipping the item to your
          // buyer, a different quantity from the listing's inbound shipping.
          // Passing the listing's value meant every "free shipping" item was
          // appraised as though reselling it cost nothing to ship, inflating
          // max buy by ~$8 on a watch. Omitting it lets the API apply its own
          // category estimate.
          manualComps: Array.isArray(msg.comps) && msg.comps.length ? msg.comps : undefined,
        }),
      });
      const d = await r.json();
      sendResponse({ ok: !!d?.success, data: d?.data || null, error: d?.error?.message || null });
    } catch (e) {
      sendResponse({ ok: false, data: null, error: String(e && e.message || e) });
    }
  })();
  return true; // async sendResponse
});
