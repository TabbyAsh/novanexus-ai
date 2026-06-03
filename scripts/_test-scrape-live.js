// Quick test: does eBay scraping actually work?
const url = 'https://www.ebay.com/sch/i.html?_nkw=sony+wh1000xm5&LH_Complete=1&LH_Sold=1&_sop=13';

fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
  },
}).then(async (res) => {
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML length:', html.length);

  // Check for blocks
  const blocks = html.split(/class="s-item__wrapper/g).slice(1, 30);
  console.log('Item blocks found:', blocks.length);

  // Extract prices from blocks
  let prices = [];
  for (const block of blocks) {
    const pm = block.match(/class="s-item__price"[^>]*>\s*\$?([\d,]+\.\d{2})/);
    if (pm) prices.push(parseFloat(pm[1].replace(/,/g, '')));
  }
  console.log('Prices from blocks:', prices.length, prices.slice(0, 8));

  // Fallback: raw price regex
  if (prices.length === 0) {
    const raw = [];
    const rx = /\$([\d,]+\.\d{2})/g;
    let m;
    while ((m = rx.exec(html)) && raw.length < 25) {
      raw.push(parseFloat(m[1].replace(/,/g, '')));
    }
    console.log('Raw prices (fallback):', raw.length, raw.slice(0, 10));
  }

  // Check if eBay is blocking (captcha/redirect)
  if (html.includes('captcha') || html.includes('robot')) {
    console.log('WARNING: eBay may be showing captcha/bot detection');
  }
  if (html.includes('To access this page, please solve the puzzle')) {
    console.log('BLOCKED: eBay is serving a captcha page');
  }
}).catch(err => {
  console.error('Fetch failed:', err.message);
});
