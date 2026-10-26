/* Isolated native Chromium test with an explicitly mocked extension API.
   Proves DOM extraction/workspace flows, not installed-extension permissions. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const root = path.resolve(__dirname, '../..');
const assets = path.join(root, 'apps/extension');
let browser, server, base;
test.before(async () => {
  server = http.createServer((req, res) => {
    const rel = new URL(req.url, 'http://localhost').pathname.slice(1) || 'workspace.html';
    const file = rel === 'auction-core.mjs' ? path.join(root, 'apps/web/public/tools/auction-desk/core.mjs') : path.resolve(assets, rel);
    if (!file.startsWith(assets) && !file.endsWith('/auction-desk/core.mjs')) {res.writeHead(403);return res.end();}
    try { const data = fs.readFileSync(file);res.setHeader('content-type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');res.end(data); } catch {res.writeHead(404);res.end();}
  }); await new Promise(r => server.listen(0, '127.0.0.1', r));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
test.after(async () => {await browser?.close();if(server)await new Promise(r=>server.close(r));});
test('native DOM adapters distinguish real sold rows, hidden offers and active prices',async()=>{
  const p=await browser.newPage();await p.goto(base+'/popup.html');
  await p.addScriptTag({path:path.join(assets,'lens-core.js')});await p.addScriptTag({path:path.join(assets,'capture.js')});
  const rows=await p.evaluate(()=>{
    const d=new DOMParser().parseFromString(`<div class="s-item"><a href="https://www.ebay.com/itm/123456789001"><h3 class="s-item__title">TEST MODEL</h3></a><span class="s-item__price">US $50</span> Sold Oct 20, 2026 <span class="s-item__shipping">Free shipping</span></div><div class="s-card"><a href="https://www.ebay.com/itm/123456789002"><h3 class="s-card__title">TEST MODEL</h3></a><span class="s-card__price">$60</span> Sold Oct 19, 2026 Best offer accepted</div>`,'text/html');
    return {sold:NovaLensCapture.capture(d,'https://www.ebay.com/sch/i.html?LH_Sold=1').rows,active:NovaLensCapture.capture(d,'https://www.ebay.com/sch/i.html').rows};
  });
  assert.equal(rows.sold[0].status,'sold');assert.equal(rows.sold[0].price,50);assert.equal(rows.sold[0].shipping,0);assert.equal(rows.sold[0].exactPrice,true);assert.equal(rows.sold[1].exactPrice,false);assert.equal(rows.active[0].status,'asking');
  const m10='<html><body><h1>Unit M10</h1><div id="high-bid-amount">$38</div><div data-expiry="1793156400"></div><p>Ohio</p><h2>Facility Terms and Conditions</h2><p>This unit has a 2 days pickup timeline. $50 refundable cleaning deposit. Remove everything by the end of that office day.</p></body></html>'; // SYNTHETIC adapter fixture, not a live source fetch.
  const actual=await p.evaluate(html=>NovaLensCapture.capture(new DOMParser().parseFromString(html,'text/html'),'https://bid13.com/node/331270'),m10);
  assert.equal(actual.snapshot.title,'Unit M10');assert.equal(actual.snapshot.price,38);assert.equal(actual.snapshot.deposit,50);assert.equal(actual.snapshot.pickupDays,2);assert.match(actual.snapshot.terms,/same.*office day|end of that office day/);assert.equal(actual.snapshot.currency,'USD');
  await p.close();
});
test('workspace appraises supported evidence, keeps costs unknown, locks provenance and invalidates changed terms',async()=>{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];p.on('pageerror',e=>errors.push(e.message));
  const N=require('../../apps/extension/lens-core.js'),s=N.empty(),now=Date.now(),at=new Date(now).toISOString(),id='https://bid13.com/node/100';
  N.observe(s,{id,url:id,title:'SYNTHETIC TEST Unit',source:'bid13.com',price:25,currency:'USD',deposit:50,endsAt:new Date(now+864e5).toISOString(),pickupDays:2,terms:'SYNTHETIC same-day cleanout; no dumpster.',status:'listed',method:'open_tab',observedAt:at,provenance:'SYNTHETIC SOFTWARE FIXTURE — NOT MARKET EVIDENCE'});
  s.comps=[1,2,3].map(i=>({id:'https://www.ebay.com/itm/12345678900'+i,url:'https://www.ebay.com/itm/12345678900'+i,title:'SYNTHETIC TEST drill MODEL-X',price:100+i,shipping:10,currency:'USD',status:'sold',soldAt:new Date(now-864e5).toISOString(),observedAt:at,exactPrice:true,matchConfirmed:false,condition:'synthetic',provenance:'SYNTHETIC TEST ONLY'}));
  await p.addInitScript(seed=>{
    let db=seed;window.__lensTestState=()=>db;window.__replaceLensTestState=s=>{db=s;emit();};const callbacks=[];
    function emit(){for(const f of callbacks)f({'nova:lens:v2':{newValue:structuredClone(db)}},'local');}
    window.chrome={storage:{onChanged:{addListener:f=>callbacks.push(f)}},runtime:{sendMessage:async msg=>{
      const N=window.NovaLens;
      if(msg.type==='lens:get')return {ok:true,data:structuredClone(db)};
      if(msg.type==='lens:ledger')db.ledger=structuredClone(msg.ledger);
      if(msg.type==='lens:match'){const c=db.comps.find(c=>c.id===msg.id);c.matchConfirmed=msg.confirmed;c.matchFor=msg.listingId+'\n'+msg.itemTitle;}
      if(msg.type==='lens:watch'){const r=db.listings[msg.id];r.watching=msg.watching;r.background=msg.background;r.ceiling=msg.ceiling;}
      emit();return {ok:true,data:true};}}};
  },s);
  await p.goto(base+'/workspace.html');await p.getByRole('heading',{name:'SYNTHETIC TEST Unit'}).waitFor();
  assert.match(await p.locator('#appraisal').innerText(),/Value unestablished/);assert.equal(await p.locator('#use-appraisal').isDisabled(),true);
  await p.locator('#item-title').fill('SYNTHETIC drill MODEL-X <img src=x onerror="window.pwned=1">');await p.locator('#item-evidence').fill('photo:test-visible-drill');
  await p.locator('#use-source').click();assert.equal(await p.locator('#cost-bid').inputValue(),'25');assert.equal(await p.locator('#cost-refundableDeposit').inputValue(),'50');assert.equal(await p.locator('#cost-transport').inputValue(),'');
  for(const check of await p.locator('#comparables input[type=checkbox]').all())await check.check();
  await p.locator('#use-appraisal').click();assert.match(await p.locator('#ledger-items').innerText(),/MODEL-X/);assert.equal(await p.evaluate(()=>window.pwned),undefined);
  for(const input of await p.locator('#cost-fields input[type=number]').all())await input.fill('0');
  await p.locator('#cost-bid').fill('25');await p.locator('#cost-refundableDeposit').fill('50');await p.locator('#capitalLimit').fill('1000');await p.locator('#minimumProfit').fill('20');await p.locator('#taxBase').selectOption('bid');
  assert.match(await p.locator('#decision').innerText(),/Conditional ceiling \$81.00/);assert.equal(await p.locator('#lock').isDisabled(),false);
  await p.locator('#lock').click();await p.waitForFunction(()=>window.__lensTestState().ledger.forecasts.length===1);
  const stored=await p.evaluate(()=>window.__lensTestState());assert.equal(stored.ledger.forecasts[0].input.items[0].lensComps.length,3);assert.equal(stored.ledger.forecasts[0].input.lensEvidence.sourceId,id);
  await p.screenshot({path:'/workspace/scratch/843677420308/lens-desktop-test.png',fullPage:true});
  await p.evaluate(()=>{const s=structuredClone(window.__lensTestState());Object.values(s.listings)[0].latest.terms='CHANGED TERMS';window.__replaceLensTestState(s);});
  await p.waitForFunction(()=>document.querySelector('#decision').textContent.includes('Source changed'));
  assert.equal(await p.locator('#lock').isDisabled(),true);assert.equal((await p.evaluate(()=>window.__lensTestState())).ledger.forecasts.length,1);
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:'/workspace/scratch/843677420308/lens-mobile-test.png',fullPage:true});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await p.close();
});
