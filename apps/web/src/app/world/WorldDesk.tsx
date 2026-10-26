'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { queueReview } from '@/lib/world/review-handoff';
import { normalizeResources, type WorldResources } from '@/lib/world/resources';
import { sources, sourceSearch, signalBrief, validSourceUrl, validNote, type SignalNote } from '@/lib/world/signals';
import { api } from '@/lib/api';
const blank = { title: '', url: '', thesis: '', demand: '', costs: '', deadline: '', next: '' };
function External({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  if (!href) return <span className="world-unconfigured">{children} <small>connect in Tools</small></span>;
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span></a>;
}
export default function WorldDesk({ identity, resources: initialResources }: { identity: string; resources: WorldResources }) {
  const router = useRouter();
  const [r, setResources] = useState(initialResources);
  const [deskUrl, setDeskUrl] = useState(initialResources.desk);
  const [atlasUrl, setAtlasUrl] = useState(initialResources.atlas);
  const [view, setView] = useState('Focus');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [notes, setNotes] = useState<SignalNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [notice, setNotice] = useState('');
  const key = 'nova:world:signals:v1:' + identity;
  useEffect(() => {
    try { const data = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(data)) setNotes(data.filter(validNote).slice(0,100)); } catch { setNotice('Saved notes could not be read. Export a backup before clearing browser data.'); }
    try {
      const stored = localStorage.getItem(key + ':spaces');
      if (stored) { const links = normalizeResources(JSON.parse(stored)); setResources(links); setDeskUrl(links.desk); setAtlasUrl(links.atlas); }
    } catch { setNotice('Workspace links could not be read. Reconnect them in Tools.'); }
    setLoaded(true);
  }, [key]);
  function saveSpaces(input: unknown) {
    try {
      const links = normalizeResources(input);
      if (!links.desk && !links.atlas && !links.archives.length) throw new Error('Add a valid https workspace link.');
      localStorage.setItem(key + ':spaces', JSON.stringify(links)); setResources(links); setDeskUrl(links.desk); setAtlasUrl(links.atlas);
      setNotice('Private workspace links connected in this browser. Their existing sign-ins still apply.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not save workspace links.'); }
  }
  async function importSpaces(file: File | undefined) {
    if (!file) return;
    try { if (file.size > 64000) throw new Error('Use a workspace links file under 64 KB.'); saveSpaces(JSON.parse(await file.text())); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not read workspace links.'); }
  }
  function save(e: React.FormEvent) {
    e.preventDefault(); const url = validSourceUrl(draft.url);
    if (!url || !draft.title.trim()) { setNotice('Add a title and a public http(s) source URL.'); return; }
    const next = [{ ...draft, title: draft.title.trim(), url, id: crypto.randomUUID(), observedAt: new Date().toISOString() }, ...notes].slice(0,100);
    try { localStorage.setItem(key, JSON.stringify(next)); setNotes(next); setDraft(blank); setNotice('Observation saved in this browser. Evidence is still yours to verify.'); } catch { setNotice('Browser storage is full or unavailable. Your draft has been kept on screen.'); }
  }
  async function copy(n: SignalNote) {
    try { await navigator.clipboard.writeText(signalBrief(n)); setNotice('Review brief copied. Open Nova and paste it to start the source check.'); } catch { setNotice('Clipboard unavailable. Use Export notes to keep the source record.'); }
  }
  function review(n: SignalNote) {
    try { router.push(queueReview(sessionStorage, identity, signalBrief(n))); }
    catch { setNotice('Could not prepare the assistant draft. Use Copy review brief instead.'); }
  }
  function exportNotes() {
    const u = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = u; a.download = 'Nova-opportunity-notes.json'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  async function lock() {
    try { const response = await fetch('/api/world/session', { method: 'DELETE' }); if (!response.ok) throw new Error(); api.clearTokens(); window.location.replace('/world'); } catch { setNotice('Could not lock the server session. Try again before leaving this device.'); }
  }
  return <main className="world-office">
    <header className="world-top"><Link href="/world" className="world-wordmark">NOVA<span>YOUR WORLD</span></Link><span className="world-private"><i/> PRIVATE SESSION</span><button className="world-quiet" onClick={() => void lock()}>Lock workspace</button></header>
    <div className="world-frame"><aside className="world-rail"><span className="world-eyebrow">WORKSPACE</span><nav aria-label="Workspace">{['Focus','Find','Notes','Tools'].map(v => <button key={v} aria-current={view === v ? 'page' : undefined} onClick={() => { setView(v); setNotice(''); }}>{v}<span>{v === 'Notes' ? notes.length : '↗'}</span></button>)}</nav><div className="world-rail-bottom"><p>Observe.<br/>Understand.<br/>Choose the move.</p><External href={r.atlas}>Open Atlas</External><Link href="/">Company website ↗</Link></div></aside>
    <div className="world-main">
      <div className="world-kicker"><span>THE DESK / {view.toUpperCase()}</span><span>Evidence before action</span></div>
      {notice && <p className="world-notice" role="status">{notice}</p>}
      {view === 'Focus' && <>
        <section className="world-heading"><span className="world-eyebrow">ROOM TO THINK. A PLACE TO ACT.</span><h1>See the opening.<br/><em>Know what makes it real.</em></h1><p>Price is one signal. Demand, timing, total cost and your ability to deliver decide whether there is an opportunity.</p></section>
        <div className="world-primary-grid"><article className="world-feature"><span className="world-eyebrow">01 / DISCOVER & DECIDE</span><h2>Find your next opportunity.</h2><p>Auction lots, surplus, resale demand, buyer requirements and market filings. Start with a source. Build the case.</p><button onClick={() => setView('Find')}>Find sources →</button><External href={r.auctions} className="world-inline">Open saved auctions</External></article><article className="world-feature world-feature-alt"><span className="world-eyebrow">02 / WORK WITH NOVA</span><h2>Bring the evidence<br/>into the conversation.</h2><p>Use a Lens export or a review brief. Ask what is supported, what is missing and what would change the decision.</p><Link className="world-button" href="/dashboard/nova">Open Nova →</Link><p className="world-fine">Uses your existing Nova account. Provider and tools must be available in that session; a link does not prove they are connected.</p></article></div>
        <div className="world-row-links"><External href={r.pipeline}>Deal pipeline</External><External href={r.desk}>Command desk</External><External href={r.transport}>Transport & training</External><button onClick={() => setView('Tools')}>Recovered tools & code →</button></div>
        <section className="world-section"><div className="world-section-title"><h2>The decision test</h2><span className="world-eyebrow">HOW / WHY / NOW</span></div><div className="world-test-grid">{[['Demand','Who is already paying, for exactly what, in what condition?'],['Economics','What remains after acquisition, fees, transport, shipping, disposal and your time?'],['Timing','Which dated change or deadline creates the opening? What could invalidate it?'],['Execution','Can you collect, store, deliver and get paid within the actual requirements?']].map(([t,d]) => <article key={t}><h3>{t}</h3><p>{d}</p></article>)}</div></section>
      </>}
      {view === 'Find' && <>
        <section className="world-heading"><span className="world-eyebrow">MULTI-SOURCE DISCOVERY</span><h1>Follow the signal.</h1><p>Search across the sources below, then capture the actual listing or buyer requirement. Coverage is shown for each source.</p></section>
        <label className="world-search">Item, model, buyer need or location<input value={query} maxLength={200} onChange={e => setQuery(e.target.value)} placeholder="e.g. label printer Indianapolis"/></label>
        <div className="world-filters" aria-label="Source category">{['All','Auctions','Demand','Business','Markets'].map(g => <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}</div>
        <p className="world-fine">Keywords open indexed web results for the chosen site; eBay opens sold results directly. These links do not ingest a live feed. Coverage reviewed October 26, 2026. Search results and old bids need a fresh source check.</p>
        <div className="world-source-grid">{sources.filter(s => group === 'All' || s.group === group).map(s => <article className="world-source" key={s.name}><span className="world-eyebrow">{s.group}</span><h2>{s.name}</h2><span className="world-coverage">{s.coverage}</span><p>{s.signal}</p><div><External href={sourceSearch(s,query)}>{query.trim() ? 'Search this source' : 'Open source'}</External><button className="world-quiet" onClick={() => { setDraft({ ...blank, url: s.url }); setView('Notes'); }}>Capture a finding →</button></div></article>)}</div>
      </>}
      {view === 'Notes' && <>
        <section className="world-heading"><span className="world-eyebrow">CAPTURE / CHALLENGE / VERIFY</span><h1>Keep the reason<br/><em>beside the source.</em></h1><p>Record what you saw and the claim it supports. Copy a brief into Nova for a fresh appraisal. Notes stay in this browser, scoped to your account; export a backup.</p></section>
        <form className="world-note-form" onSubmit={save}>
          <label>Opportunity / exact item<input required maxLength={500} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Exact lot, model or buyer requirement"/></label>
          <label>Original listing or requirement URL<input required type="url" maxLength={2000} value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="https://…"/></label>
          {([['thesis','Why might this be an opening?'],['demand','Evidence of demand / exact sold comparisons'],['costs','Full costs, logistics and explicit unknowns'],['deadline','Deadline and timezone / what changes next'],['next','Next verification before a decision']] as const).map(([k,t]) => <label key={k}>{t}<textarea maxLength={4000} value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} placeholder="Unknown until supported by a dated source"/></label>)}
          <button disabled={!loaded}>Save observation →</button>
        </form>
        <section className="world-section"><div className="world-section-title"><h2>{notes.length} saved observations</h2><button className="world-quiet" disabled={!notes.length} onClick={exportNotes}>Export notes</button></div>{notes.length === 0 ? <p>No observations yet. Nothing has been priced or recommended from an empty source.</p> : notes.map(n => <article className="world-note" key={n.id}><span className="world-eyebrow">OPERATOR NOTE / {new Date(n.observedAt).toLocaleString()}</span><h3>{n.title}</h3><p>{n.thesis || 'Thesis unrecorded.'}</p><p className="world-fine">{n.next || 'Next: check the source, demand and full costs.'}</p><External href={n.url}>Original source</External><button className="world-quiet" onClick={() => void copy(n)}>Copy review brief</button><button className="world-quiet" onClick={() => review(n)}>Review with Nova →</button></article>)}</section>
      </>}
      {view === 'Tools' && <>
        <section className="world-heading"><span className="world-eyebrow">YOUR WORK / WITH A WAY BACK IN</span><h1>Your tools.<br/><em>Within reach.</em></h1><p>Open the working tools or recover the original source packages. Each entry says what it is and where verification is still needed.</p></section>
        <article className="world-lens"><div><span className="world-eyebrow">NOVA LENS / 0.2.1</span><h2>Appraise what you can verify.<br/>Watch what can change.</h2><p>Captures visible eBay sold rows and BID13 evidence, keeps source history and uses the complete Auction Desk cost engine. Generic product pages can be scanned manually when they expose supported product data.</p><a className="world-button" href="/api/world/downloads/lens">Download Lens 0.2.1 ↓</a></div><div><h3>Install in Chrome</h3><ol><li>Download and extract the ZIP.</li><li>Open <code>chrome://extensions</code> and enable Developer mode.</li><li>Choose Load unpacked, then the extracted <b>Nova-Lens</b> folder.</li><li>Pin Lens, reload your listing, then use Scan current page.</li></ol><p className="world-fine">Open-tab observations while visible; BID13 background watch requires opt-in and a running browser. No all-market feed, cloud monitoring, automatic valuation of unseen contents or automatic bids.</p><External href="https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked">Official Chrome instructions</External></div></article>
        <section className="world-section"><h2>Working spaces</h2><div className="world-row-links"><External href={r.auctions}>Auction finder & all-in costs</External><External href={r.pipeline}>Opportunities & pipeline</External><External href={r.atlas}>Atlas</External><Link href="/dashboard/flip-card">Flip Card</Link><Link href="/dashboard/market">Markets</Link><Link href="/world/lab">World lab</Link><Link href="/tools/novaclean">NovaClean</Link></div><p className="world-fine">Desk and Atlas retain their existing ChatGPT access checks. Account tools need a working backend and data providers. No automatic cross-workspace sync is implied.</p></section>
        <section className="world-section"><h2>Connect your private spaces</h2><p className="world-fine">Paste existing workspace links once, or import your private workspace links file. These settings stay in this browser, scoped to your account. Exported files and each space keep their own access permissions.</p><form className="world-note-form" onSubmit={e => { e.preventDefault(); saveSpaces({ desk: deskUrl, atlas: atlasUrl, archives: r.archives }); }}><label>Private Deal Desk URL<input type="url" value={deskUrl} onChange={e => setDeskUrl(e.target.value)} placeholder="https://…"/></label><label>Private Atlas URL<input type="url" value={atlasUrl} onChange={e => setAtlasUrl(e.target.value)} placeholder="https://…"/></label><button>Save workspace links</button><label>Import workspace links<input type="file" accept=".json,application/json" onChange={e => void importSpaces(e.target.files?.[0])}/></label></form></section>
        <section className="world-section"><h2>Recovered archive</h2>{!r.archives.length && <p className="world-fine">Import your private links file to open recovered project archives here.</p>}{r.archives.map(a => <article className="world-archive" key={a.name}><div><span className="world-eyebrow">{a.kind}</span><h3>{a.name}</h3><p>{a.detail}</p></div><External href={a.href}>Open</External></article>)}<p className="world-fine">Extension source, tests and packaging script are preserved in the website repository under apps/extension, tests/lens and scripts/build-nova-lens-extension.mjs.</p></section>
      </>}
      <footer className="world-foot"><span>Private workspace · company website stays public</span><span>Money, bids and outbound messages need your decision.</span></footer>
    </div></div>
  </main>;
}
