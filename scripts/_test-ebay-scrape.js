#!/usr/bin/env node
// Quick test: can we scrape eBay sold listings without an API key?

async function test() {
  const query = 'sony wh-1000xm5';
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&_sop=13`;
  
  console.log(`Fetching: ${url}\n`);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    
    // Try to extract sold prices
    // eBay sold listings show prices in spans with class s-item__price
    const priceRegex = /class="s-item__price"[^>]*>\s*\$?([\d,]+\.\d{2})/g;
    const prices = [];
    let m;
    while ((m = priceRegex.exec(html)) && prices.length < 15) {
      prices.push(parseFloat(m[1].replace(',', '')));
    }
    
    // Also try POSITIVE status (sold indicator)
    const soldCount = (html.match(/POSITIVE/g) || []).length;
    
    // Try another pattern for prices
    const altPriceRegex = /\$(\d{1,3}(?:,\d{3})*\.\d{2})/g;
    const altPrices = [];
    while ((m = altPriceRegex.exec(html)) && altPrices.length < 30) {
      altPrices.push(parseFloat(m[1].replace(',', '')));
    }
    
    console.log(`\nFound ${prices.length} prices via s-item__price`);
    console.log(`Found ${altPrices.length} price patterns total`);
    console.log(`POSITIVE matches: ${soldCount}`);
    
    if (prices.length > 0) {
      console.log('\nExtracted sold prices:', prices);
      console.log(`Low: $${Math.min(...prices)} | High: $${Math.max(...prices)} | Median: $${prices.sort((a,b) => a-b)[Math.floor(prices.length/2)]}`);
    } else if (altPrices.length > 0) {
      // Filter to reasonable range for this item ($50-$500)
      const filtered = altPrices.filter(p => p >= 50 && p <= 500);
      console.log('\nFiltered price patterns ($50-$500):', filtered);
      if (filtered.length > 0) {
        console.log(`Low: $${Math.min(...filtered)} | High: $${Math.max(...filtered)} | Median: $${filtered.sort((a,b) => a-b)[Math.floor(filtered.length/2)]}`);
      }
    }
    
    // Check if we got blocked
    if (html.includes('captcha') || html.includes('robot')) {
      console.log('\n⚠️  CAPTCHA/bot detection triggered');
    }
    if (html.includes('s-item__title')) {
      console.log('\n✅ Item listings detected in HTML');
      // Extract a few titles
      const titleRegex = /class="s-item__title"[^>]*>.*?<span[^>]*>([^<]+)</g;
      const titles = [];
      while ((m = titleRegex.exec(html)) && titles.length < 5) {
        titles.push(m[1].trim());
      }
      if (titles.length) console.log('Sample titles:', titles);
    }
    
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

// Also test Mercari
async function testMercari() {
  const query = 'sony wh-1000xm5';
  const url = `https://www.mercari.com/search/?keyword=${encodeURIComponent(query)}&status=sold_out`;
  
  console.log(`\n---\nMercari: ${url}\n`);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    
    const priceMatches = html.match(/\$\d+/g) || [];
    console.log(`Price patterns found: ${priceMatches.length}`);
    if (priceMatches.length > 0) console.log('Sample:', priceMatches.slice(0, 10));
    
    if (html.includes('captcha') || html.includes('robot')) {
      console.log('⚠️  Bot detection triggered');
    }
  } catch (err) {
    console.error('Mercari failed:', err.message);
  }
}

async function main() {
  console.log('=== DATA SOURCE VIABILITY TEST ===\n');
  await test();
  await testMercari();
  console.log('\n=== DONE ===');
}

main();
