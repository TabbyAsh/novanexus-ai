const url = 'https://www.ebay.com/sch/i.html?_nkw=sony+wh1000xm5&LH_Complete=1&LH_Sold=1&_sop=13';
fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  },
}).then(async (res) => {
  const html = await res.text();
  console.log('Status:', res.status, '| HTML:', html.length, 'bytes');

  // Strategy 1: New eBay HTML (s-card__price)
  const comps = [];
  const cardPriceRegex = /su-styled-text positive bold[^"]*s-card__price">\$?([\d,]+\.\d{2})/g;
  let m;
  while ((m = cardPriceRegex.exec(html)) && comps.length < 30) {
    const price = parseFloat(m[1].replace(/,/g, ''));
    if (price >= 5 && price < 100000) comps.push(price);
  }
  console.log('\nStrategy 1 (s-card__price):', comps.length, 'prices');
  console.log('  Prices:', comps);

  // Filter out promo junk
  if (comps.length > 5) {
    const sorted = [...comps].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const filtered = comps.filter(p => p >= p25 * 0.3);
    console.log('  After filtering (p25 =', p25, '):', filtered.length, 'prices');
    console.log('  Filtered:', filtered);

    const prices = filtered.sort((a, b) => a - b);
    const low = prices[Math.floor(prices.length * 0.25)];
    const mid = prices[Math.floor(prices.length * 0.5)];
    const high = prices[Math.floor(prices.length * 0.75)];
    console.log('\n  Resale range: $' + low + ' / $' + mid + ' / $' + high);
    console.log('  (These should look like real Sony WH-1000XM5 sold prices: ~$120-$250)');
  }
}).catch(err => console.error(err));
