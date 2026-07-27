#!/usr/bin/env node
/**
 * Comp-selection tests.  Run:  node apps/extension/comps.test.js
 *
 * eBay 403s every automated client, so live pages cannot be used to verify
 * this. These fixtures reproduce the shape of a real sold-listings page —
 * the product, plus the cables, cases, manuals and broken units that always
 * ride along — including the case that produced a "$1.86 max buy" in the wild.
 */
const C = require('./comps.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`); }
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

console.log('\nmodel-number matching');
check('extracts a model number', C.modelTokens('DeWalt DCD771C2 20V Drill').includes('dcd771c2'));
check('extracts an alphanumeric model', C.modelTokens('Sony WH1000XM5 Headphones').includes('wh1000xm5'));
check('plain words are not models', C.modelTokens('Wooden Dining Chair').length === 0);

console.log('\nA. power tool whose sold page is full of batteries and cases');
{
  const source = 'DeWalt DCD771C2 20V MAX Cordless Drill Driver Kit';
  const rows = [
    { title: 'DeWalt DCD771C2 20V MAX Cordless Drill Driver Kit', price: 88 },
    { title: 'DEWALT DCD771C2 20V Drill Kit with Battery and Charger', price: 95 },
    { title: 'Dewalt DCD771C2 Cordless Drill 20V', price: 79 },
    { title: 'DeWalt DCD771C2 Drill/Driver Kit 20V MAX', price: 102 },
    { title: 'DeWalt DCD771C2 20V Drill', price: 91 },
    { title: 'DeWalt DCD771C2 drill driver', price: 84 },
    // the noise that always comes back with it
    { title: 'DeWalt DCB201 20V MAX Battery for DCD771C2', price: 18 },
    { title: 'DeWalt DCB112 Charger for DCD771C2 drill', price: 15 },
    { title: 'DeWalt DCD771C2 Drill CASE ONLY no tool', price: 9 },
    { title: 'DeWalt DCD771C2 instruction manual', price: 6 },
    { title: 'DeWalt DCD771C2 Drill FOR PARTS not working', price: 22 },
  ];
  const sel = C.selectComps(source, rows);
  const priced = C.rejectOutliers(sel.comps);
  check('keeps only the six real kits', sel.comps.length === 6, `kept ${sel.comps.length}: ${sel.comps}`);
  check('rejects battery, charger, case, manual', sel.reasons.accessory === 4, `accessory=${sel.reasons.accessory}`);
  check('rejects the for-parts unit', sel.reasons.broken === 1, `broken=${sel.reasons.broken}`);
  check('median lands in the real range', median(priced) >= 79 && median(priced) <= 102, `median=${median(priced)}`);
  check('coherent against a $45 asking price', C.assessCoherence(priced, 45).ok);
}

console.log('\nB. THE $1.86 CASE — no model number, accessories outnumber the product');
{
  const source = 'Nintendo Switch Pro Controller';
  const rows = [
    { title: 'Charging Cable for Nintendo Switch Pro Controller', price: 3.5 },
    { title: 'Nintendo Switch Pro Controller Skin Sticker Decal', price: 2.25 },
    { title: 'Nintendo Switch Pro Controller Case Travel Bag', price: 5 },
    { title: 'Replacement Joysticks for Nintendo Switch Pro Controller', price: 4 },
    { title: 'Nintendo Switch Pro Controller Screen Protector', price: 2 },
    { title: 'Nintendo Switch Pro Controller USB C Cable Cord', price: 3 },
    { title: 'Nintendo Switch Pro Controller', price: 45 },
    { title: 'Nintendo Switch Pro Controller Black', price: 52 },
    { title: 'Nintendo Switch Pro Controller genuine', price: 48 },
  ];
  const raw = rows.map((r) => r.price);
  const naive = C.rejectOutliers(raw);
  // Reproduce the bug: with junk in the majority, the median IS junk and the
  // outlier filter deletes the REAL controllers as the outliers.
  check('reproduces the failure — naive median is junk', median(naive) < 10, `naive median=${median(naive)}`);

  const sel = C.selectComps(source, rows);
  const priced = C.rejectOutliers(sel.comps);
  check('keeps only the three real controllers', sel.comps.length === 3, `kept ${sel.comps.length}: ${sel.comps}`);
  check('median is now the real price', median(priced) >= 45 && median(priced) <= 52, `median=${median(priced)}`);
  check('coherent against a $30 asking price', C.assessCoherence(priced, 30).ok);
}

console.log('\nC. the guard refuses rather than inventing a number');
{
  const thin = C.assessCoherence([50], 40);
  check('too few comps → no verdict', thin.ok === false);
  // Everything matched, but the matches are worth ~2% of the asking price:
  // something is wrong with the match, so we must not answer.
  const mismatched = C.assessCoherence([3, 4, 3.5, 2.75], 120);
  check('median far below asking → no verdict', mismatched.ok === false, JSON.stringify(mismatched));
  check('the refusal explains itself', /different product|not enough/i.test(mismatched.reason));
}

console.log('\nE. REAL capture from ebay.com/itm/185953427238 (the $1.86 report)');
{
  // Verbatim rows harvested from the live sold page, including eBay's
  // "Opens in a new window or tab" a11y suffix and its "Shop on eBay" filler.
  const source = 'Samsung Galaxy Watch Active 2 40mm Smartwatch';
  const rows = [
    { title: 'Shop on eBay', price: 20.0 },
    { title: 'Shop on eBay', price: 20.0 },
    { title: 'Samsung Galaxy Watch Active 2 40mm Smartwatch PinkOpens in a new window or tab', price: 25.0 },
    { title: 'Samsung Galaxy Watch Strap Silicone Sport Band 20mm 22mm Active 1 2 Gear 2Opens in a new window or tab', price: 6.25 },
    { title: 'For Samsung Galaxy Watch 3 41mm Active 2 40mm 44mm 20mm 22mm Band StrapOpens in a new window or tab', price: 5.45 },
    { title: 'Samsung Galaxy Watch Active2 (40mm) Aqua BlackOpens in a new window or tab', price: 36.05 },
    { title: 'Samsung Galaxy Watch Active2 SM-R820 44mm Bluetooth Smartwatch - Black SROpens in a new window or tab', price: 44.95 },
    { title: 'Silicone Watchband Strap Belt For Samsung Galaxy Watch Active 2 40mm 44mm PartsOpens in a new window or tab', price: 10.58 },
    { title: 'Stainless Steel Bracelet Band Strap For Samsung Galaxy Watch 3 4 41/45mm Active2Opens in a new window or tab', price: 9.49 },
    { title: 'Samsung Galaxy Watch Active2 40mm SM-R835U LTE Black Aluminum Smartwatch GPSOpens in a new window or tab', price: 39.97 },
    { title: 'Wireless Magnetic Charger Dock For Samsung Galaxy Watch pro/5/4/3/Active 2/1Opens in a new window or tab', price: 7.95 },
    { title: 'For Samsung Galaxy Watch 3 41mm Active 2 40mm 44mm Silicone 20mm Band StrapOpens in a new window or tab', price: 5.49 },
    { title: 'Samsung Galaxy Active 2 SM-R825U 44mm Rear Back Glass Plastic Cover (Black)Opens in a new window or tab', price: 33.07 },
    { title: 'EB-BR830ABY Battery For Samsung Galaxy Watch Active 2 SM-R830 SM-R835 40mmOpens in a new window or tab', price: 11.59 },
    { title: 'Watch Band Silicone Sport Strap For Samsung Galaxy Watch 5 6 Active 2 40 44 42Opens in a new window or tab', price: 7.99 },
  ];

  const naive = C.rejectOutliers(rows.map((r) => r.price));
  check('reproduces it — naive median is strap money', median(naive) < 15, `naive median=${median(naive)}`);

  const sel = C.selectComps(source, rows.filter((r) => !/^shop on ebay$/i.test(r.title)));
  const priced = C.rejectOutliers(sel.comps);
  check('keeps the three real 40mm watches', sel.comps.length === 3, `kept ${sel.comps.length}: ${sel.comps}`);
  check('median is a real watch price', median(priced) >= 25 && median(priced) <= 40, `median=${median(priced)}`);
  check('excludes the 44mm variants', !sel.comps.includes(44.95) && !sel.comps.includes(33.07));
  check('excludes every strap, band, dock and battery',
    ![6.25, 5.45, 10.58, 9.49, 7.95, 5.49, 11.59, 7.99].some((p) => sel.comps.includes(p)));
  check('a $30 asking price now reads as coherent', C.assessCoherence(priced, 30).ok);
}

console.log('\nD. selling the accessory itself still works');
{
  const source = 'DeWalt DCB201 20V MAX Battery Pack';
  const rows = [
    { title: 'DeWalt DCB201 20V MAX Battery', price: 18 },
    { title: 'DEWALT DCB201 20V Battery Pack Genuine', price: 22 },
    { title: 'Dewalt DCB201 battery 20v max lithium', price: 20 },
  ];
  const sel = C.selectComps(source, rows);
  check('an accessory listing is priced against accessories', sel.comps.length === 3, `kept ${sel.comps.length}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
