/* Local evidence store + bounded BID13 watch adapter. No paid services or bids. */
importScripts('lens-core.js');
const N = NovaLens;
let queue = Promise.resolve(), rules = null, refreshing = false;
const transact = fn => { const result = queue.then(async () => { const saved = await chrome.storage.local.get(N.KEY); const s = saved[N.KEY] ? N.validate(saved[N.KEY]) : N.empty(); const r = await fn(s); await chrome.storage.local.set({ [N.KEY]: s }); return r; }); queue = result.catch(() => {}); return result; };
const isWorkspace = sender => sender.url?.startsWith(chrome.runtime.getURL(''));
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg?.type?.startsWith('lens:')) return;
  (async () => {
    if (msg.type === 'lens:capture') {
      if (!sender.tab?.url || !['https:', 'http:'].includes(new URL(sender.tab.url).protocol)) throw new Error('Capture requires an actual source tab.');
      const source = N.sourceUrl(sender.tab.url), data = msg.data;
      return transact(s => {
        if (data.kind === 'listing') {
          if (data.snapshot.url !== source) throw new Error('Source URL does not match the capturing tab.');
          const r = N.observe(s, data.snapshot); if (msg.enableWatch === true) r.watching = true; return r;
        }
        if (data.kind === 'comps' && /(^|\.)ebay\.com$/.test(new URL(source).hostname)) { N.mergeComps(s, data.rows); return { captured: data.rows.length }; }
        throw new Error('Unsupported evidence package.');
      });
    }
    if (msg.type === 'lens:open') { await chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html') }); return true; }
    if (!isWorkspace(sender)) throw new Error('This action requires a Lens page.');
    if (msg.type === 'lens:get') return transact(s => s);
    if (msg.type === 'lens:watch') return transact(s => { const r = s.listings[msg.id]; if (!r) throw new Error('Capture a listing first.'); r.watching = msg.watching === true; r.background = r.watching && msg.background === true && new URL(r.latest.url).hostname === 'bid13.com'; r.ceiling = N.amount(msg.ceiling) ? msg.ceiling : null; return r; });
    if (msg.type === 'lens:match') return transact(s => { const c = s.comps.find(c => c.id === msg.id); if (!c || !s.listings[msg.listingId]) throw new Error('Unknown item or comparable.'); c.matchConfirmed = msg.confirmed === true; c.matchFor = msg.confirmed ? msg.listingId + '\n' + N.clean(msg.itemTitle) : null; return c; });
    if (msg.type === 'lens:ledger') return transact(s => { s.ledger = msg.ledger; return true; });
    if (msg.type === 'lens:import') return transact(s => { const candidate = N.validate(msg.state); Object.assign(s, candidate); return true; });
    if (msg.type === 'lens:refresh') return refresh(msg.id);
    if (msg.type === 'lens:open') { await chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html') }); return true; }
    throw new Error('Unknown Lens action.');
  })().then(data => reply({ ok: true, data }), e => reply({ ok: false, error: e.message }));
  return true;
});
async function publicText(url) {
  let current = url;
  for (let redirects = 0; redirects < 3; redirects++) {
    const u = new URL(current);
    if (u.protocol !== 'https:' || u.hostname !== 'bid13.com' || u.username || u.password || u.port || u.search || u.hash || !/^\/(?:robots\.txt|node\/\d+|storage-auctions\/[a-z0-9/_-]+)$/.test(u.pathname)) throw new Error('Only public BID13 auction paths are supported.');
    const r = await fetch(u.href, { credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (r.type === 'opaqueredirect') throw new Error('Source redirected; open its final auction URL and capture again.');
    if ([301, 302, 303, 307, 308].includes(r.status)) { current = new URL(r.headers.get('location'), u).href; continue; }
    if (!r.ok) throw new Error(`Source returned HTTP ${r.status}; no retry loop.`);
    const reader = r.body.getReader(), chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1e6) { await reader.cancel(); throw new Error('Source exceeds 1 MB limit.'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    return { text: new TextDecoder().decode(bytes), url: u.href };
  }
  throw new Error('Source redirect limit reached.');
}
function pathAllowed(robots, pathname) {
  let applies = false; const rules = [];
  for (const raw of robots.split('\n')) {
    const line = raw.split('#')[0].trim(), sep = line.indexOf(':'); if (sep < 0) continue;
    const key = line.slice(0, sep).toLowerCase(), value = line.slice(sep + 1).trim();
    if (key === 'user-agent') applies = value === '*' || /^novalens(?:\/|$)/i.test(value);
    if (applies && ['allow', 'disallow'].includes(key) && value) rules.push({ allow: key === 'allow', value });
  }
  const matched = rules.filter(r => pathname.startsWith(r.value.split('*')[0])).sort((a, b) => b.value.length - a.value.length || Number(b.allow) - Number(a.allow));
  return !matched.length || matched[0].allow;
}
async function refresh(id) {
  if (refreshing) throw new Error('Another source refresh is already running.');
  refreshing = true;
  try { return await refreshOne(id); } finally { refreshing = false; }
}
async function refreshOne(id) {
  const saved = await chrome.storage.local.get(N.KEY), s = saved[N.KEY], r = s?.listings?.[id];
  if (!r || !r.watching || !r.background || new URL(r.latest.url).hostname !== 'bid13.com') throw new Error('Enable BID13 background watching for this captured listing first.');
  const cursor = await chrome.storage.local.get('nova:lens:fetch-cursor');
  if (Date.now() - (cursor['nova:lens:fetch-cursor'] || 0) < 60000) throw new Error('Source refresh limited to one request per minute.');
  await chrome.storage.local.set({ 'nova:lens:fetch-cursor': Date.now() });
  try {
    if (!rules) rules = (await chrome.storage.local.get('nova:lens:robots'))['nova:lens:robots'] || null;
    if (!rules || Date.now() - rules.at > 24 * 3600e3) { const rob = await publicText('https://bid13.com/robots.txt'); rules = { text: rob.text, at: Date.now() }; await chrome.storage.local.set({ 'nova:lens:robots': rules }); return { note: 'Source crawl rules checked. The next watch tick can refresh this auction.' }; }
    if (!pathAllowed(rules.text, new URL(r.latest.url).pathname)) throw new Error('Source crawl rules prohibit this path; use open-page observation.');
    const raw = await publicText(r.latest.url), snap = N.parseBid13Html(raw.text, raw.url);
    if (snap.url !== r.latest.url) throw new Error('Canonical URL changed; capture the final page again.');
    return transact(s => N.observe(s, snap));
  } catch (e) {
    await transact(s => { const r = s.listings[id]; if (r) { r.lastError = { at: new Date().toISOString(), message: e.message }; if (/verification|prohibit|HTTP 40[13]|HTTP 429/.test(e.message)) { r.background = false; N.addAlert(s, id, 'Background watch stopped: ' + e.message); } } });
    throw e;
  }
}
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('nova-lens-watch', { periodInMinutes: 1 }));
chrome.runtime.onStartup?.addListener(() => chrome.alarms.create('nova-lens-watch', { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'nova-lens-watch') return;
  await transact(s => N.closingAlerts(s));
  const saved = await chrome.storage.local.get(N.KEY), s = saved[N.KEY];
  const due = Object.entries(s?.listings || {}).filter(([, r]) => r.watching && r.background && Date.now() - Math.max(Date.parse(r.latest.observedAt), Date.parse(r.lastError?.at) || 0) >= 5 * 60000).sort((a, b) => Date.parse(a[1].latest.observedAt) - Date.parse(b[1].latest.observedAt));
  if (due.length) try { await refresh(due[0][0]); } catch { /* retained failure is visible in Lens */ }
});
