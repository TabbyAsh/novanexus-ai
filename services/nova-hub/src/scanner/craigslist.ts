/**
 * Craigslist RSS Source
 * =====================
 * Fetches real marketplace listings from Craigslist's public RSS feeds.
 * No API key, no authentication, no external dependencies.
 *
 * Rate limiting: 800ms minimum between requests per subdomain.
 * Craigslist RSS is public, crawlable per their robots.txt.
 *
 * Strategy: search by BRAND NAME, not generic category.
 * "ps5" not "gaming". "macbook" not "laptop".
 * Brand names yield listings with known heuristic market values.
 */

import { createLogger } from '@nova/telemetry';

const logger = createLogger('scanner:craigslist');

// ─── Craigslist city subdomains ───────────────────────────────────────────────

export const CRAIGSLIST_CITIES: Record<string, string> = {
  miami:        'miami',
  chicago:      'chicago',
  losangeles:   'losangeles',
  newyork:      'newyork',
  houston:      'houston',
  dallas:       'dallas',
  atlanta:      'atlanta',
  seattle:      'seattle',
  denver:       'denver',
  phoenix:      'phoenix',
  boston:       'boston',
  sandiego:     'sandiego',
  lasvegas:     'lasvegas',
  nashville:    'nashville',
  austin:       'austin',
  portland:     'portland',
  minneapolis:  'minneapolis',
  philadelphia: 'philadelphia',
  sanfrancisco: 'sfbay',
  detroit:      'detroit',
};

// ─── Scan targets: brand queries proven to generate flip opportunities ─────────
// Ordered by expected margin density (highest yield categories first).

export interface ScanTarget {
  clCategory: string;   // Craigslist URL category code
  queries: string[];    // brand/model-specific search terms
  maxPrice: number;     // upper bound — skip obvious overpriced listings
  minPrice: number;     // lower bound — skip suspiciously cheap or broken
}

export const SCAN_TARGETS: ScanTarget[] = [
  // Gaming consoles — fast velocity, strong heuristic baseline, high demand
  {
    clCategory: 'vgm',
    queries: ['ps5', 'xbox series x', 'nintendo switch', 'steam deck', 'ps4 pro'],
    maxPrice: 700, minPrice: 50,
  },
  // Apple ecosystem — best heuristic data coverage, consistent demand
  {
    clCategory: 'ele',
    queries: ['iphone 14', 'iphone 15', 'ipad pro', 'macbook', 'airpods pro', 'apple watch'],
    maxPrice: 1000, minPrice: 40,
  },
  // Audio — Bose/Sony/JBL have tight price bands, easy to comp
  {
    clCategory: 'ele',
    queries: ['bose quietcomfort', 'sony wh1000', 'jbl charge', 'sonos speaker'],
    maxPrice: 400, minPrice: 30,
  },
  // Home appliances — Dyson/KitchenAid/Roomba are well-known resale brands
  {
    clCategory: 'app',
    queries: ['dyson vacuum', 'kitchenaid mixer', 'roomba', 'instant pot', 'nespresso', 'breville'],
    maxPrice: 500, minPrice: 25,
  },
  // Power tools — DeWalt/Milwaukee consistently over-asked locally
  {
    clCategory: 'tls',
    queries: ['dewalt drill', 'milwaukee drill', 'makita', 'dewalt saw', 'tool set'],
    maxPrice: 400, minPrice: 20,
  },
  // Fitness equipment — oversaturated market = lots of motivated sellers
  {
    clCategory: 'spo',
    queries: ['peloton bike', 'bowflex', 'nordictrack', 'treadmill', 'dumbbells set'],
    maxPrice: 1200, minPrice: 50,
  },
  // GPUs / computer parts — tight market pricing, arbitrage possible
  {
    clCategory: 'sys',
    queries: ['rtx 3080', 'rtx 4070', 'rx 6800', 'graphics card gpu', 'gaming pc'],
    maxPrice: 800, minPrice: 80,
  },
];

// ─── Raw listing shape ────────────────────────────────────────────────────────

export interface RawListing {
  title: string;
  cleanTitle: string;         // title with price stripped
  price: number | null;
  url: string;
  description: string;        // plain text from RSS description
  postedAt: string | null;
  city: string;               // city key (e.g. 'miami')
  source: 'craigslist';
  inferredCondition: string;  // guessed from description text
  query: string;              // which search query found this
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

const lastFetchByCity = new Map<string, number>();
const MIN_INTERVAL_MS = 800;

async function rateLimit(city: string): Promise<void> {
  const last = lastFetchByCity.get(city) ?? 0;
  const wait = MIN_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastFetchByCity.set(city, Date.now());
}

// ─── RSS XML parser (regex-based, no dependencies) ───────────────────────────

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

function extractCDATA(xml: string, tag: string): string {
  // <tag><![CDATA[ ... ]]></tag>
  const cdataRx = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const cdata = cdataRx.exec(xml);
  if (cdata) return cdata[1].trim();
  // <tag>plain text</tag>
  const plainRx = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'i');
  const plain = plainRx.exec(xml);
  return plain ? plain[1].trim() : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  // Match each <item>...</item> block
  const itemRx = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRx.exec(xml)) !== null) {
    const body = match[1];
    const title = stripHtml(extractCDATA(body, 'title'));
    const link = extractCDATA(body, 'link') || (() => {
      // Craigslist sometimes puts the link as plain text between tags
      const m = /<link\s*\/?>(https?:\/\/[^\s<]+)/i.exec(body);
      return m ? m[1] : '';
    })();
    const description = stripHtml(extractCDATA(body, 'description'));
    const pubDate = extractCDATA(body, 'pubDate');
    if (title && link) {
      items.push({ title, link: link.trim(), description, pubDate });
    }
  }
  return items;
}

// ─── Price extraction ─────────────────────────────────────────────────────────
// Craigslist titles follow patterns like:
//   "$250 / Xbox Series S — great condition"
//   "PS5 $450 - barely used"
//   "250 nintendo switch"

function extractPrice(title: string): number | null {
  // Dollar sign anywhere in title
  const dollar = /\$\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/.exec(title);
  if (dollar) {
    const v = parseFloat(dollar[1].replace(/,/g, ''));
    if (v > 0 && v < 50000) return v;
  }
  // Leading bare number before item name: "250 xbox series"
  const leading = /^(\d{2,5})\s+[a-z]/i.exec(title.trim());
  if (leading) {
    const v = parseFloat(leading[1]);
    if (v > 0 && v < 10000) return v;
  }
  return null;
}

function stripPrice(title: string): string {
  return title
    .replace(/\$\s*\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?\s*\/?/g, '')
    .replace(/^\d{2,5}\s+/, '')
    .replace(/\s*[-—|\/\\]\s*/g, ' ')
    .trim();
}

// ─── Condition inference ──────────────────────────────────────────────────────

function inferCondition(text: string): string {
  const t = text.toLowerCase();
  if (/like new|mint|never used|brand new|unopened|sealed|nib\b/.test(t)) return 'Like New';
  if (/\bnew\b/.test(t) && !/not new|no longer new|as new/.test(t)) return 'Like New';
  if (/crack|broken|doesn.t work|not working|dead|for parts|as.is|damaged|shattered/.test(t)) return 'Poor';
  if (/some scratch|minor (wear|damage|scratch)|light wear|small scratch|couple scratch/.test(t)) return 'Fair';
  if (/great condition|works (great|perfect|fine)|excellent|fully functional|no issue/.test(t)) return 'Like New';
  if (/good condition|good shape|works well|minor wear/.test(t)) return 'Good';
  return 'Good'; // safe default
}

// ─── Main fetch function ──────────────────────────────────────────────────────

interface FetchOptions {
  maxPriceOverride?: number;
  minPriceOverride?: number;
  maxResultsPerQuery?: number;
}

/**
 * Fetch listings from Craigslist RSS for one city + one scan target.
 */
async function fetchTargetForCity(
  city: string,
  target: ScanTarget,
  opts: FetchOptions = {},
): Promise<RawListing[]> {
  const maxPrice = opts.maxPriceOverride ?? target.maxPrice;
  const minPrice = opts.minPriceOverride ?? target.minPrice;
  const perQuery = opts.maxResultsPerQuery ?? 15;
  const results: RawListing[] = [];
  const seenUrls = new Set<string>();

  for (const query of target.queries) {
    await rateLimit(city);

    const params = new URLSearchParams({
      format:    'rss',
      query,
      max_price: String(maxPrice),
      min_price: String(minPrice),
      sort:      'date',
    });
    const url = `https://${city}.craigslist.org/search/${target.clCategory}?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NovaScanner/1.0)',
          'Accept':     'application/rss+xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        logger.warn(`CL ${city}/${target.clCategory} "${query}" → HTTP ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const items = parseRSSItems(xml);

      for (const item of items.slice(0, perQuery)) {
        if (seenUrls.has(item.link)) continue;
        seenUrls.add(item.link);

        const price = extractPrice(item.title);
        if (price === null || price < minPrice || price > maxPrice) continue;

        const cleanTitle = stripPrice(item.title);
        if (cleanTitle.length < 4) continue; // garbage title

        results.push({
          title: item.title,
          cleanTitle,
          price,
          url: item.link,
          description: item.description,
          postedAt: item.pubDate || null,
          city,
          source: 'craigslist',
          inferredCondition: inferCondition(item.title + ' ' + item.description),
          query,
        });
      }

      logger.info(`CL ${city}/${target.clCategory} "${query}" → ${items.length} items, ${results.length} kept`);
    } catch (err) {
      logger.warn(`CL fetch failed: ${city}/${target.clCategory} "${query}"`, {
        error: (err as Error).message,
      });
    }
  }

  return results;
}

/**
 * Fetch listings across multiple cities and scan targets.
 * Returns deduplicated results (by URL across all cities).
 */
export async function fetchCraigslistListings(
  cities: string[],
  targets: ScanTarget[] = SCAN_TARGETS,
  opts: FetchOptions = {},
): Promise<RawListing[]> {
  const allListings: RawListing[] = [];
  const globalSeenUrls = new Set<string>();

  for (const city of cities) {
    const subdomain = CRAIGSLIST_CITIES[city];
    if (!subdomain) {
      logger.warn(`Unknown CL city: "${city}" — skipping`);
      continue;
    }

    for (const target of targets) {
      const listings = await fetchTargetForCity(subdomain, target, opts);
      for (const listing of listings) {
        if (!globalSeenUrls.has(listing.url)) {
          globalSeenUrls.add(listing.url);
          allListings.push({ ...listing, city });
        }
      }
    }
  }

  logger.info(`CL scan complete: ${allListings.length} unique listings across ${cities.length} cities`);
  return allListings;
}
