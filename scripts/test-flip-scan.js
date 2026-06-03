#!/usr/bin/env node
/**
 * Quick flip opportunity scanner — tests real eBay scraping
 */

const QUERIES = [
  'airpods pro 2',
  'nintendo switch oled',
  'dyson v15',
  'iphone 14 pro',
  'ps5 console',
];

async function scrapeEbay(query, type = 'active') {
  const encoded = encodeURIComponent(query);
  const soldParam = type === 'sold' ? '&LH_Complete=1&LH_Sold=1' : '&LH_BIN=1';
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encoded}${soldParam}&_sop=12&_ipg=60`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];

  const html = await res.text();
  const prices = [];

  // Try JSON-LD first
  const jsonBlocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  if (jsonBlocks) {
    for (const block of jsonBlocks) {
      try {
        const data = JSON.parse(block.replace(/<\/?script[^>]*>/g, ''));
        if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
          for (const item of data.itemListElement.slice(0, 20)) {
            const p = parseFloat(item.item?.offers?.price);
            if (p > 5 && p < 10000) prices.push(p);
          }
        }
      } catch {}
    }
  }

  // Fallback to HTML parsing
  if (prices.length === 0) {
    const blocks = html.split(/class="s-item\s/g).slice(1, 25);
    for (const block of blocks) {
      const m = block.match(/class="s-item__price"[^>]*>\s*\$?([\d,]+\.?\d*)/);
      if (m) {
        const p = parseFloat(m[1].replace(/,/g, ''));
        if (p > 5 && p < 10000) prices.push(p);
      }
    }
  }

  return prices;
}

async function analyzeFlip(query) {
  const [activePrices, soldPrices] = await Promise.all([
    scrapeEbay(query, 'active'),
    scrapeEbay(query, 'sold'),
  ]);

  if (activePrices.length === 0 && soldPrices.length === 0) {
    return { query, status: 'NO_DATA' };
  }

  activePrices.sort((a, b) => a - b);
  soldPrices.sort((a, b) => a - b);

  const buyPrice = activePrices.length > 0 ? activePrices[Math.floor(activePrices.length * 0.2)] : null;
  const sellPrice = soldPrices.length > 0
    ? soldPrices[Math.floor(soldPrices.length * 0.7)]
    : activePrices[Math.floor(activePrices.length * 0.7)];

  if (!buyPrice || !sellPrice) return { query, status: 'INSUFFICIENT_DATA' };

  const ebayFee = sellPrice * 0.13;
  const shipping = sellPrice > 100 ? 15 : 10;
  const profit = sellPrice - buyPrice - ebayFee - shipping;
  const margin = buyPrice > 0 ? (profit / buyPrice * 100) : 0;

  return {
    query,
    status: profit > 5 ? 'OPPORTUNITY' : 'PASS',
    activePrices: activePrices.length,
    soldPrices: soldPrices.length,
    buyAt: buyPrice.toFixed(2),
    sellAt: sellPrice.toFixed(2),
    fees: ebayFee.toFixed(2),
    shipping,
    profit: profit.toFixed(2),
    margin: margin.toFixed(1) + '%',
    verdict: margin >= 30 ? 'STRONG BUY' : margin >= 15 ? 'BUY' : margin >= 5 ? 'HOLD' : 'PASS',
  };
}

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   NOVA FLIP SCANNER — Real eBay Data      ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');

  for (const query of QUERIES) {
    process.stdout.write(`Scanning "${query}"...`);
    try {
      const result = await analyzeFlip(query);
      if (result.status === 'OPPORTUNITY') {
        console.log(` ✓ ${result.verdict}`);
        console.log(`  Buy: $${result.buyAt} → Sell: $${result.sellAt} → Profit: $${result.profit} (${result.margin})`);
        console.log(`  Data: ${result.activePrices} active + ${result.soldPrices} sold listings`);
      } else if (result.status === 'PASS') {
        console.log(` · PASS — margin too thin ($${result.profit}, ${result.margin})`);
      } else {
        console.log(` ✕ ${result.status}`);
      }
    } catch (err) {
      console.log(` ✕ Error: ${err.message}`);
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('');
  console.log('Done.');
}

main();
