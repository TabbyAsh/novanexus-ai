/* DOM-only adapter test. Does not prove native Chrome extension integration. */
const { test }=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const N=require('../../apps/extension/lens-core.js');const {webcrypto}=require('node:crypto');
const domPath=process.env.NOVA_LENS_DOM_MODULE;
let parseHTML,DOMParser;if(domPath)({parseHTML,DOMParser}=require(domPath));
const assets=path.resolve(__dirname,'../../apps/extension');
test('DOM adapter captures individual sold links, dates and hidden-price uncertainty',{skip:!domPath},()=>{
 const c={NovaLens:N};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(assets,'capture.js'),'utf8'),c);
 const doc=new DOMParser().parseFromString('<html><body><div class="s-item"><a href="https://www.ebay.com/itm/123456789001"><h3 class="s-item__title">TEST MODEL</h3></a><span class="s-item__price">US $50</span> Sold Oct 20, 2026 <span class="s-item__shipping">Free shipping</span></div><div class="s-card"><a href="https://www.ebay.com/itm/123456789002"><h3 class="s-card__title">TEST MODEL</h3></a><span class="s-card__price">$60</span> Sold Oct 19, 2026 Best offer accepted</div></body></html>','text/html');
 c.URL=URL;
 const a=c.NovaLensCapture.capture(doc,'https://www.ebay.com/sch/i.html?LH_Sold=1');assert.equal(a.rows.length,2);assert.equal(a.rows[0].status,'sold');assert.equal(a.rows[0].shipping,0);assert.equal(a.rows[0].exactPrice,true);assert.equal(a.rows[1].exactPrice,false);assert.equal(c.NovaLensCapture.capture(doc,'https://www.ebay.com/sch/i.html').rows[0].status,'asking');
});
test('DOM adapter preserves unknown generic prices instead of converting null to zero',{skip:!domPath},()=>{
 const c={NovaLens:N,URL};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(assets,'capture.js'),'utf8'),c);
 const d=new DOMParser().parseFromString('<html><head><title>TEST</title></head><body><h1>Item</h1><script type="application/ld+json">{"@type":"Product","name":"TEST","offers":{"priceCurrency":"USD","price":null}}</script></body></html>','text/html');
 const s=c.NovaLensCapture.capture(d,'https://example.test/item','manual_page').snapshot;assert.equal(s.price,null);assert.equal(s.currency,'UNKNOWN');
});
test('workspace DOM flow uses evidence, preserves unknown costs and blocks changed source facts',{skip:!domPath},async()=>{
 const core=await import('../../apps/web/public/tools/auction-desk/core.mjs');
 const {window}=parseHTML(fs.readFileSync(path.join(assets,'workspace.html'),'utf8'));
 const now=Date.now(),at=new Date(now).toISOString(),id='https://bid13.com/node/100';let db=N.empty();
 N.observe(db,{id,url:id,title:'SYNTHETIC TEST UNIT',source:'bid13.com',price:25,currency:'USD',deposit:50,endsAt:new Date(now+864e5).toISOString(),pickupDays:2,terms:'SYNTHETIC no dumpster.',status:'listed',method:'open_tab',observedAt:at,provenance:'SYNTHETIC TEST ONLY'});
 db.comps=[1,2,3].map(i=>({id:'https://www.ebay.com/itm/12345678900'+i,url:'https://www.ebay.com/itm/12345678900'+i,title:'SYNTHETIC MODEL-X',price:100+i,shipping:10,currency:'USD',status:'sold',soldAt:new Date(now-864e5).toISOString(),observedAt:at,exactPrice:true,matchConfirmed:false,condition:'synthetic',provenance:'SYNTHETIC TEST ONLY'}));
 const callbacks=[];
 const chrome={storage:{onChanged:{addListener:f=>callbacks.push(f)}},runtime:{sendMessage:async msg=>{
  if(msg.type==='lens:get')return {ok:true,data:structuredClone(db)};
  if(msg.type==='lens:ledger')db.ledger=structuredClone(msg.ledger);
  if(msg.type==='lens:match'){const c=db.comps.find(c=>c.id===msg.id);c.matchConfirmed=msg.confirmed;c.matchFor=msg.listingId+'\n'+msg.itemTitle;}
  if(msg.type==='lens:watch'){const r=db.listings[msg.id];r.watching=msg.watching;r.background=msg.background;r.ceiling=msg.ceiling;}
  return {ok:true,data:true};
 }}};
 // linkedom lacks the native select setter; this adapter only supplies that DOM property.
 for(const select of window.document.querySelectorAll('select')){let value='';Object.defineProperty(select,'value',{get:()=>value,set:v=>value=v});}
 const c={window,document:window.document,NovaLens:N,chrome,console,Date,URL,Blob,TextEncoder,crypto:webcrypto,structuredClone,setTimeout,setInterval:()=>0,...core};vm.createContext(c);
 let code=fs.readFileSync(path.join(assets,'workspace.mjs'),'utf8').replace(/^import[^\n]+\n/,'');
 await vm.runInContext('(async()=>{'+code+'})()',c);
 const $=id=>window.document.getElementById(id);
 assert.equal($('selected-title').textContent,'SYNTHETIC TEST UNIT');assert.match($('appraisal').textContent,/Value unestablished/);
 $('item-title').value='SYNTHETIC MODEL-X <img src=x onerror="window.pwned=1">';$('item-title').oninput();$('item-evidence').value='photo:test-visible';$('item-evidence').oninput();
 await $('use-source').onclick();assert.equal($('cost-bid').value,'25');assert.equal($('cost-refundableDeposit').value,'50');assert.equal($('cost-transport').value,'');
 for(let i=0;i<3;i++){const input=window.document.querySelectorAll('#comparables input')[i];input.checked=true;await input.onchange();}
 assert.equal($('use-appraisal').disabled,false);await $('use-appraisal').onclick();assert.equal(db.ledger.dossier.items.length,1);assert.equal(window.document.querySelectorAll('#ledger-items img').length,0);
 for(const input of window.document.querySelectorAll('#cost-fields input[type=number]')){input.value='0';await input.oninput();}
 for(const [id,value]of [['cost-bid','25'],['cost-refundableDeposit','50'],['capitalLimit','1000'],['minimumProfit','20'],['taxBase','bid']]){$(id).value=value;await $(id).oninput();}
 assert.match($('decision').textContent,/Conditional ceiling \$81.00/);assert.equal($('lock').disabled,false);
 await $('lock').onclick();assert.equal(db.ledger.forecasts.length,1);assert.equal(db.ledger.forecasts[0].input.items[0].lensComps.length,3);assert.equal(await core.verifyForecast(db.ledger.forecasts[0]),true);
 db.listings[id].latest.terms='CHANGED TERMS';for(const f of callbacks)f({[N.KEY]:{newValue:structuredClone(db)}},'local');
 await new Promise(r=>setTimeout(r,25));assert.match($('decision').textContent,/Source changed/);assert.equal($('lock').disabled,true);assert.equal(db.ledger.forecasts.length,1);
});
