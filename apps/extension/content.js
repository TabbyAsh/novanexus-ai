/* On-page Lens: observe actual DOM changes while this source tab remains open. */
(() => {
  if (window.__novaLensV2) return; window.__novaLensV2 = true;
  const N = NovaLens; let watching = false, dismissed = false, lastUrl = location.href;
  const send = msg => chrome.runtime.sendMessage(msg);
  const money = n => n === null ? 'Unknown' : '$' + n.toFixed(2);
  const node = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  async function scan(save = false, manual = false, enableWatch = false) {
    const data = NovaLensCapture.capture(document, location.href, manual ? 'manual_page' : 'open_tab');
    if (save) { const reply = await send({ type: 'lens:capture', data, enableWatch }); if (!reply.ok) throw new Error(reply.error); }
    return data;
  }
  function card(data) {
    if (dismissed) return;
    let el = document.getElementById('nova-lens-card');
    if (!el) { el = node('aside'); el.id = 'nova-lens-card'; document.body.append(el); }
    el.replaceChildren();
    const head = node('div', 'Nova Lens', 'nl-head'), close = node('button', '×', 'nl-x'); close.title = 'Hide Lens card'; close.onclick = () => { dismissed = true; el.remove(); }; head.append(close); el.append(head);
    if (data.kind === 'listing') {
      const s = data.snapshot; el.append(node('div', s.title, 'nl-body'), node('div', `${money(s.price)} · ${s.currency} · ${s.status}`, 'nl-verdict nl-watch'));
      el.append(node('div', `Source observed ${new Date(s.observedAt).toLocaleTimeString()}${s.endsAt ? ' · closes ' + new Date(s.endsAt).toLocaleString() : ''}`, 'nl-body nl-dim'));
      const btn = node('button', watching ? 'Watching this open page' : 'Capture and watch this page', 'nl-btn');
      btn.onclick = async () => {
        try { watching = true; await scan(true, false, true); btn.textContent = 'Watching this open page'; } catch (e) { watching = false; btn.textContent = e.message; }
      };
      el.append(btn);
    } else {
      el.append(node('div', `${data.rows.length} source-linked result rows visible. Sold status, dates and price uncertainty are retained.`, 'nl-body'));
      const btn = node('button', 'Capture visible comparisons', 'nl-btn'); btn.onclick = async () => { try { await scan(true); btn.textContent = 'Captured — review matches in Lens'; } catch (e) { btn.textContent = e.message; } }; el.append(btn);
    }
    const open = node('button', 'Open Lens workspace', 'nl-btn'); open.onclick = () => chrome.runtime.sendMessage({ type: 'lens:open' }); el.append(open, node('div', 'Current page evidence. Appraisals require matched sold comparisons and complete costs.', 'nl-foot'));
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type !== 'lens:scan') return;
    scan(true, true).then(data => { card(data); reply({ ok: true, data }); }, e => reply({ ok: false, error: e.message })); return true;
  });
  try { card(NovaLensCapture.capture(document, location.href)); } catch { /* unsupported source, no invented card */ }
  chrome.storage.local.get(N.KEY).then(saved => { watching = saved[N.KEY]?.listings?.[N.sourceUrl(location.href)]?.watching === true; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[N.KEY]) watching = changes[N.KEY].newValue?.listings?.[N.sourceUrl(location.href)]?.watching === true;
  });
  setInterval(async () => {
    if (lastUrl !== location.href) { lastUrl = location.href; watching = false; dismissed = false; }
    if (!watching || document.visibilityState === 'hidden') return;
    try { card(await scan(true)); } catch (e) { const el = document.querySelector('#nova-lens-card .nl-foot'); if (el) el.textContent = 'Observation failed: ' + e.message; }
  }, 5000);
})();
