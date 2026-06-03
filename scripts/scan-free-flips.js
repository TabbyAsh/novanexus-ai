#!/usr/bin/env node
/**
 * Nova Free Flip Scanner
 * ======================
 * Scans Craigslist free section for items with resale value.
 * Cost: $0. Sell on eBay/FB Marketplace. Pure profit minus time.
 *
 * Usage:
 *   node scripts/scan-free-flips.js
 *   node scripts/scan-free-flips.js --city newyork
 *   node scripts/scan-free-flips.js --city losangeles
 */

const CITIES = [
  'newyork', 'losangeles', 'chicago', 'houston', 'phoenix',
  'philadelphia', 'sanantonio', 'sandiego', 'dallas', 'sfbay',
  'seattle', 'denver', 'boston', 'atlanta', 'miami',
  'detroit', 'minneapolis', 'portland', 'stlouis', 'tampa',
];

// Items worth flipping from the free section
const VALUABLE_PATTERNS = [
  { pattern: /iphone|ipad|macbook|apple watch/i, minValue: 50, category: 'apple' },
  { pattern: /samsung|galaxy|pixel/i, minValue: 30, category: 'phones' },
  { pattern: /laptop|chromebook|computer|desktop|pc/i, minValue: 40, category: 'computers' },
  { pattern: /tv|television|monitor|4k|oled/i, minValue: 30, category: 'tvs' },
  { pattern: /ps[45]|playstation|xbox|nintendo|switch/i, minValue: 40, category: 'gaming' },
  { pattern: /dyson|roomba|vacuum|robot vacuum/i, minValue: 30, category: 'appliances' },
  { pattern: /bike|bicycle|mountain bike|road bike/i, minValue: 40, category: 'bikes' },
  { pattern: /drill|saw|dewalt|milwaukee|makita|tool/i, minValue: 25, category: 'tools' },
  { pattern: /couch|sofa|chair|desk|table|dresser|bookshelf/i, minValue: 20, category: 'furniture' },
  { pattern: /airpods|headphones|speaker|bose|sonos/i, minValue: 20, category: 'audio' },
  { pattern: /camera|canon|nikon|gopro/i, minValue: 30, category: 'cameras' },
  { pattern: /guitar|keyboard|piano|amplifier|amp/i, minValue: 30, category: 'instruments' },
  { pattern: /kitchenaid|mixer|blender|instant pot|air fryer/i, minValue: 20, category: 'kitchen' },
  { pattern: /washer|dryer|refrigerator|dishwasher/i, minValue: 40, category: 'major-appliance' },
  { pattern: /lego|pokemon|trading card|vintage/i, minValue: 15, category: 'collectibles' },
  { pattern: /jordan|nike|yeezy|sneaker/i, minValue: 20, category: 'sneakers' },
  { pattern: /treadmill|elliptical|weight|dumbbell|peloton/i, minValue: 30, category: 'fitness' },
  { pattern: /stroller|crib|car seat/i, minValue: 20, category: 'baby' },
  { pattern: /lawn mower|snow blower|chainsaw/i, minValue: 30, category: 'outdoor-power' },
  { pattern: /kayak|surfboard|ski|snowboard/i, minValue: 30, category: 'sports' },
];

// Rough resale estimates by category (conservative — what you'd actually get on FB/eBay)
const RESALE_ESTIMATES = {
  'apple': { low: 50, mid: 150, high: 400 },
  'phones': { low: 30, mid: 80, high: 200 },
  'computers': { low: 40, mid: 100, high: 300 },
  'tvs': { low: 30, mid: 75, high: 200 },
  'gaming': { low: 40, mid: 100, high: 250 },
  'appliances': { low: 30, mid: 60, high: 150 },
  'bikes': { low: 40, mid: 100, high: 300 },
  'tools': { low: 25, mid: 50, high: 150 },
  'furniture': { low: 20, mid: 50, high: 200 },
  'audio': { low: 20, mid: 50, high: 150 },
  'cameras': { low: 30, mid: 80, high: 300 },
  'instruments': { low: 30, mid: 100, high: 400 },
  'kitchen': { low: 20, mid: 40, high: 100 },
  'major-appliance': { low: 40, mid: 100, high: 300 },
  'collectibles': { low: 15, mid: 40, high: 200 },
  'sneakers': { low: 20, mid: 50, high: 150 },
  'fitness': { low: 30, mid: 80, high: 300 },
  'baby': { low: 20, mid: 40, high: 100 },
  'outdoor-power': { low: 30, mid: 75, high: 200 },
  'sports': { low: 30, mid: 80, high: 250 },
};

async function scanCity(city) {
  const url = `https://${city}.craigslist.org/search/zip`; // zip = free section
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseListings(html, city);
  } catch (err) {
    return [];
  }
}

function parseListings(html, city) {
  const listings = [];

  // Parse gallery cards (new CL format)
  const cards = html.split(/class="cl-static-search-result"/g).slice(1, 100);
  for (const card of cards) {
    try {
      const titleMatch = card.match(/title="([^"]+)"/);
      const linkMatch = card.match(/href="(https?:\/\/[^"]+)"/);
      const title = titleMatch?.[1]?.trim() || '';
      const link = linkMatch?.[1] || '';
      if (title.length < 5) continue;
      listings.push({ title, link, city });
    } catch {}
  }

  // Fallback: older CL format
  if (listings.length === 0) {
    const rows = html.split(/class="result-row"/g).slice(1, 100);
    for (const row of rows) {
      try {
        const titleMatch = row.match(/class="result-title[^"]*"[^>]*>([^<]+)</);
        const linkMatch = row.match(/href="(https?:\/\/[^"]+\.html)"/);
        const title = titleMatch?.[1]?.trim() || '';
        const link = linkMatch?.[1] || '';
        if (title.length < 5) continue;
        listings.push({ title, link, city });
      } catch {}
    }
  }

  // Another fallback: li.cl-static-search-result with inner div
  if (listings.length === 0) {
    const titleRegex = /class="titlestring">([^<]+)</g;
    const linkRegex = /href="(https:\/\/[^"]*\.craigslist\.org\/[^"]+)"/g;
    const titles = [];
    const links = [];
    let m;
    while ((m = titleRegex.exec(html)) && titles.length < 50) titles.push(m[1].trim());
    while ((m = linkRegex.exec(html)) && links.length < 50) links.push(m[1]);
    for (let i = 0; i < Math.min(titles.length, links.length); i++) {
      listings.push({ title: titles[i], link: links[i], city });
    }
  }

  return listings;
}

function evaluateListing(listing) {
  for (const vp of VALUABLE_PATTERNS) {
    if (vp.pattern.test(listing.title)) {
      const est = RESALE_ESTIMATES[vp.category] || { low: 15, mid: 40, high: 100 };
      return {
        ...listing,
        category: vp.category,
        estimatedValue: `$${est.low}-${est.high}`,
        midValue: est.mid,
        verdict: est.mid >= 50 ? 'GRAB IT' : est.mid >= 25 ? 'WORTH A LOOK' : 'MAYBE',
      };
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const cityArg = args.find(a => a.startsWith('--city='))?.split('=')[1]
    || args[args.indexOf('--city') + 1];

  const citiesToScan = cityArg ? [cityArg] : CITIES.slice(0, 5); // Default: top 5

  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   NOVA FREE FLIP SCANNER                  ║');
  console.log('║   Cost: $0 → Sell for profit              ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');

  const allOpportunities = [];

  for (const city of citiesToScan) {
    process.stdout.write(`Scanning ${city}...`);
    const listings = await scanCity(city);
    console.log(` ${listings.length} free listings`);

    for (const listing of listings) {
      const opp = evaluateListing(listing);
      if (opp) allOpportunities.push(opp);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Sort by estimated value
  allOpportunities.sort((a, b) => b.midValue - a.midValue);

  console.log('');
  if (allOpportunities.length === 0) {
    console.log('No high-value free items found right now. Try different cities or check back later.');
  } else {
    console.log(`═══ ${allOpportunities.length} FLIP OPPORTUNITIES ═══`);
    console.log('');
    for (const opp of allOpportunities.slice(0, 20)) {
      const icon = opp.verdict === 'GRAB IT' ? '🔥' : opp.verdict === 'WORTH A LOOK' ? '👀' : '·';
      console.log(`${icon} [${opp.verdict}] ${opp.title}`);
      console.log(`  Category: ${opp.category} | Est. resale: ${opp.estimatedValue} | City: ${opp.city}`);
      console.log(`  Link: ${opp.link}`);
      console.log('');
    }
  }

  console.log('');
  console.log('How to profit:');
  console.log('1. Click the link → contact poster → pick up for FREE');
  console.log('2. Clean it up, test it, take good photos');
  console.log('3. List on Facebook Marketplace or eBay');
  console.log('4. Pocket the difference');
  console.log('');
}

main();
