const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const N = require('../../apps/extension/lens-core.js');
const now = Date.parse('2026-10-26T20:00:00Z');
const comp = (i, more = {}) => ({ id: `https://www.ebay.com/itm/12345678900${i}`, url: `https://www.ebay.com/itm/12345678900${i}`, title: 'SYNTHETIC TEST MODEL 100', price: 100 + i, shipping: 10, currency: 'USD', status: 'sold', soldAt: '2026-10-20T12:00:00Z', observedAt: '2026-10-26T19:00:00Z', exactPrice: true, matchConfirmed: true, matchFor: 'item-1', ...more });
const snapshot = (more = {}) => ({ id: 'https://bid13.com/node/100', url: 'https://bid13.com/node/100', title: 'SYNTHETIC UNIT', price: 25, currency: 'USD', deposit: 50, endsAt: '2026-10-27T23:00:00Z', pickupDays: 2, terms: 'SYNTHETIC terms', status: 'listed', method: 'open_tab', observedAt: '2026-10-26T19:00:00Z', provenance: 'Synthetic test only', ...more });
test('price parsing rejects ambiguous ranges, FX and excessive decimals', () => {
  for (const s of ['$10 to $20', 'C $25', 'AU $25', 'CAD 25', '£25', '$12.345', '', '$NaN']) assert.equal(N.money(s), null, s);
  assert.equal(N.money('US $1,234.56'), 1234.56); assert.equal(N.money('$0'), 0);
});
test('three distinct confirmed recent sold prices produce a descriptive range', () => { const a=N.appraisal([comp(1),comp(2),comp(3)],now); assert.deepEqual([a.low,a.mid,a.high],[101,102,103]); assert.equal(a.count,3); assert.equal(a.status,'evidence_range'); });
test('asking, offers, unknown currency and mismatched evidence cannot become value', () => {
  for(const change of [{status:'asking'},{exactPrice:false},{currency:'UNKNOWN'},{matchConfirmed:false},{soldAt:null},{soldAt:'2020-01-01'},{observedAt:'2020-01-01'},{soldAt:'2027-01-01'},{observedAt:'2027-01-01'},{price:null}]) { const a=N.appraisal([comp(1,change),comp(2),comp(3)],now); assert.equal(a.low,null,JSON.stringify(change)); assert.equal(a.count,2); }
});
test('duplicate item URLs with tracking strings do not inflate sample size', () => { const a=N.appraisal([comp(1),comp(1,{id:'changed',url:comp(1).url+'?tracking=1'}),comp(2)],now); assert.equal(a.low,null); assert.equal(a.count,2); });
test('source refresh cannot preserve confirmed matches when price or title changes', () => { const s=N.empty(); s.comps=[comp(1)]; N.mergeComps(s,[comp(1,{matchConfirmed:false})]); assert.equal(s.comps[0].matchConfirmed,true); assert.equal(s.comps[0].matchFor,'item-1'); N.mergeComps(s,[comp(1,{price:999})]); assert.equal(s.comps[0].matchConfirmed,false); assert.equal(s.comps[0].matchFor,null); });
test('unchanged observations refresh the timestamp without duplicating history', () => { const s=N.empty();N.observe(s,snapshot());N.observe(s,snapshot({observedAt:'2026-10-26T20:00:00Z'}));assert.equal(s.listings[snapshot().id].history.length,1);assert.equal(s.listings[snapshot().id].latest.observedAt,'2026-10-26T20:00:00Z'); });
test('watch retains bid, deposit and deadline changes and ceiling crossing events', () => { const s=N.empty(),r=N.observe(s,snapshot());r.watching=true;r.ceiling=30;N.observe(s,snapshot({price:40,deposit:75,endsAt:'2026-10-28T00:00:00Z'}));assert.equal(r.history.length,2);assert.equal(r.history[0].price,25);assert.equal(s.alerts.length,2);assert.match(s.alerts[0].message,/price.*endsAt.*deposit/);assert.match(s.alerts[1].message,/ceiling/); });
test('failed refresh is labeled and keeps old source facts',()=>{const s=N.empty(),r=N.observe(s,snapshot());r.lastError={message:'blocked'};assert.match(N.freshness(r,now),/REFRESH FAILED/);assert.equal(r.latest.price,25);});
test('foreign/private/unsafe URLs and invalid snapshots are rejected',()=>{for(const u of ['javascript:alert(1)','https://user:secret@ebay.com','file:///x'])assert.equal(N.sourceUrl(u),null);const s=N.empty();assert.throws(()=>N.observe(s,snapshot({price:NaN})));assert.throws(()=>N.validate({version:9}));});
const fixture='<h1>Unit TEST</h1><div id="high-bid-amount">$38</div><div data-expiry="1793156400"></div><p>Ohio</p><h3>Facility Terms and Conditions</h3><p>No dumpster.</p><p>After the auction has ended, this unit has a 2 days pickup timeline. $50 refundable cleaning deposit. Remove everything the same office day.</p><p>Note: Before you place a bid</p>';
test('public BID13 adapter reads source facts; never prices unseen goods',()=>{const s=N.parseBid13Html(fixture,'https://bid13.com/node/100','2026-10-26T20:00:00Z');assert.equal(s.price,38);assert.equal(s.status,'listed');assert.equal(s.deposit,50);assert.equal(s.pickupDays,2);assert.equal(s.endsAt,'2026-10-28T03:00:00.000Z');assert.match(s.terms,/same office day/);assert.equal(s.valuation,undefined);assert.throws(()=>N.parseBid13Html('<h1>Verify you are human</h1>','https://bid13.com/node/100'));});
async function worker(initial = {}, fetchImpl = null) {
  const db=initial, listeners={}, fetches=[];
  const context={ console, URL, Date, TextDecoder, Uint8Array, AbortSignal, setTimeout,
    fetch: async url=>{fetches.push(url);if(fetchImpl)return fetchImpl(url);throw new Error('Unexpected network');},
    chrome:{runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listeners.message=f},onInstalled:{addListener:f=>listeners.installed=f}},storage:{local:{get:async k=>({[k]:db[k]}),set:async obj=>Object.assign(db,structuredClone(obj))}},alarms:{create:()=>{},onAlarm:{addListener:f=>listeners.alarm=f}},tabs:{create:async()=>{}}}};
  vm.createContext(context);context.importScripts=()=>vm.runInContext(fs.readFileSync(require.resolve('../../apps/extension/lens-core.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../../apps/extension/background.js'),'utf8'),context);
  const message=(msg,sender={url:'chrome-extension://test/workspace.html'})=>new Promise(resolve=>listeners.message(msg,sender,resolve));
  return {db,listeners,fetches,message};
}
test('worker has no network activity without an explicit background watch',async()=>{const w=await worker();await w.listeners.alarm({name:'nova-lens-watch'});assert.equal(w.fetches.length,0);const r=await w.message({type:'lens:capture',data:{kind:'listing',snapshot:snapshot()}},{tab:{url:snapshot().url}});assert.equal(r.ok,true);await w.listeners.alarm({name:'nova-lens-watch'});assert.equal(w.fetches.length,0);});
test('capture cannot claim a different source tab',async()=>{const w=await worker();const r=await w.message({type:'lens:capture',data:{kind:'listing',snapshot:snapshot()}},{tab:{url:'https://bid13.com/node/999'}});assert.equal(r.ok,false);assert.match(r.error,/does not match/);});
test('parallel evidence updates are serialized instead of overwriting records',async()=>{const w=await worker();await Promise.all([1,2,3].map(i=>{const s=snapshot({id:'https://bid13.com/node/'+i,url:'https://bid13.com/node/'+i});return w.message({type:'lens:capture',data:{kind:'listing',snapshot:s}},{tab:{url:s.url}});}));assert.equal(Object.keys(w.db[N.KEY].listings).length,3);});
test('non-extension callers cannot enable background watching',async()=>{const w=await worker();const r=await w.message({type:'lens:watch',id:snapshot().id,watching:true,background:true},{tab:{url:snapshot().url}});assert.equal(r.ok,false);});


test('closing alerts deduplicate and do not claim an auction sold',()=>{const s=N.empty(),r=N.observe(s,snapshot());r.watching=true;const end=Date.parse(r.latest.endsAt);N.closingAlerts(s,end-30*60000);N.closingAlerts(s,end-29*60000);assert.equal(s.alerts.length,1);N.closingAlerts(s,end+1000);assert.equal(s.alerts.length,2);assert.match(s.alerts[1].message,/outcome unconfirmed/);});
test('background rule cache survives service-worker restart and can refresh source',async()=>{
 const w=await worker({},url=>new Response(url.endsWith('robots.txt')?'User-agent: *\nCrawl-delay: 5\nDisallow: /admin/':fixture));
 await w.message({type:'lens:capture',data:{kind:'listing',snapshot:snapshot()}},{tab:{url:snapshot().url}});
 await w.message({type:'lens:watch',id:snapshot().id,watching:true,background:true});
 const first=await w.message({type:'lens:refresh',id:snapshot().id});assert.equal(first.ok,true);assert.equal(w.fetches[0],'https://bid13.com/robots.txt');
 w.db['nova:lens:fetch-cursor']=Date.now()-61000;
 const second=await worker(w.db,url=>new Response(fixture));const r=await second.message({type:'lens:refresh',id:snapshot().id});assert.equal(r.ok,true);assert.deepEqual(second.fetches,[snapshot().url]);assert.equal(second.db[N.KEY].listings[snapshot().id].latest.price,38);
});
test('verification challenge stops background watch and preserves old price',async()=>{
 const db={'nova:lens:robots':{at:Date.now(),text:'User-agent: *\nAllow: /'}};
 const w=await worker(db,()=>new Response('<h1>Verify you are human</h1>'));
 await w.message({type:'lens:capture',data:{kind:'listing',snapshot:snapshot()}},{tab:{url:snapshot().url}});await w.message({type:'lens:watch',id:snapshot().id,watching:true,background:true});
 const r=await w.message({type:'lens:refresh',id:snapshot().id});assert.equal(r.ok,false);assert.equal(db[N.KEY].listings[snapshot().id].background,false);assert.equal(db[N.KEY].listings[snapshot().id].latest.price,25);assert.match(db[N.KEY].listings[snapshot().id].lastError.message,/verification/);
});

test('generic source identity keeps meaningful query IDs and removes only trackers',()=>{
 assert.equal(N.sourceUrl('https://example.test/lot?id=123&utm_source=x#photos'),'https://example.test/lot?id=123');
 assert.notEqual(N.sourceUrl('https://example.test/lot?id=123'),N.sourceUrl('https://example.test/lot?id=456'));
});
test('assistant source brief excludes personal ceilings, credentials and private ledger',()=>{
 const snap=snapshot({ceiling:98765,token:'SECRET_TEST_ONLY',ledger:{capitalLimit:45678}});
 const brief=N.sourceBrief(snap,[]);
 assert.match(brief,/Source:/);assert.match(brief,/Observed:/);assert.match(brief,/unseen contents stay unpriced/i);
 assert.doesNotMatch(brief,/98765|45678|SECRET_TEST_ONLY/);assert.throws(()=>N.sourceBrief(null));
});
