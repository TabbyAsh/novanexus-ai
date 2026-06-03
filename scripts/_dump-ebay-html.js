const url = 'https://www.ebay.com/sch/i.html?_nkw=sony+wh1000xm5&LH_Complete=1&LH_Sold=1&_sop=13';
fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  },
}).then(async (res) => {
  const html = await res.text();
  
  // Find all class names that might be item-related
  const classPatterns = [
    /class="[^"]*item[^"]*"/gi,
    /class="[^"]*listing[^"]*"/gi,
    /class="[^"]*result[^"]*"/gi,
    /class="[^"]*price[^"]*"/gi,
    /class="[^"]*title[^"]*"/gi,
  ];
  
  const found = new Set();
  for (const pat of classPatterns) {
    let m;
    while ((m = pat.exec(html))) {
      const cls = m[0];
      if (cls.length < 120) found.add(cls);
    }
  }
  
  console.log('=== Item/listing/result/price/title classes found ===');
  const sorted = [...found].sort();
  sorted.forEach(c => console.log(c));
  
  // Also look for price-like patterns near dollar signs
  console.log('\n=== Context around $ prices ===');
  const dollarRx = /(.{0,80})\$(\d[\d,]*\.\d{2})(.{0,40})/g;
  let dm;
  let count = 0;
  while ((dm = dollarRx.exec(html)) && count < 15) {
    console.log(`  ...${dm[1].slice(-60)}$${dm[2]}${dm[3].slice(0,30)}...`);
    count++;
  }
}).catch(err => console.error(err));
