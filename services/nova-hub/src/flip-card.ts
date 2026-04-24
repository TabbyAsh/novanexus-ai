/**
 * Flip Card Engine
 * ================
 * The core decision engine behind the Flip Card product.
 *
 * Pipeline: input → comps lookup → resale estimate → fee calc → shipping est → profit calc → risk flags → verdict
 *
 * Data sources:
 *   - Primary: eBay sold listings (public HTML, no API key)
 *   - Cache: sold_comps table (proprietary data, grows over time)
 *   - Fallback: category heuristics (when scraping fails)
 *
 * All fee tables are deterministic facts, not estimates.
 * All assumptions are surfaced to the user.
 */

import { createHash } from 'crypto';
import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('flip-card');

// ============================================================================
// Types
// ============================================================================

export interface FlipCardInput {
  title: string;
  description?: string;
  buy_price: number;
  condition: 'New' | 'Like New' | 'Good' | 'Fair' | 'Poor' | 'For Parts';
  category?: string;
  shipping_or_pickup: 'shipping' | 'pickup';
  target_platform?: string;
  location?: string;
}

export interface FlipCardOutput {
  item_title: string;
  item_category: string;
  condition_assessment: string;
  buy_price: number;
  est_resale_low: number;
  est_resale_mid: number;
  est_resale_high: number;
  est_platform_fees: number;
  est_shipping_cost: number;
  est_net_profit_low: number;
  est_net_profit_mid: number;
  est_net_profit_high: number;
  confidence_score: number;
  risk_score: number;
  risk_flags: string[];
  roi_percent: number;
  est_days_to_sell: string;
  verdict: 'BUY' | 'NEGOTIATE LOWER' | 'PASS';
  rationale_summary: string;
  negotiation_target_price: number | null;
  assumptions: string[];
  comp_sources: {
    source: string;
    count: number;
    freshness: string;
  }[];
  generated_at: string;
}

interface SoldComp {
  item_title: string;
  sold_price: number;
  condition: string | null;
  sold_date: string | null;
  source: string;
  source_url: string | null;
}

// ============================================================================
// Platform Fee Tables (deterministic facts)
// ============================================================================

const PLATFORM_FEES: Record<string, { rate: number; fixed: number; name: string }> = {
  'ebay':                 { rate: 0.1325, fixed: 0.30, name: 'eBay' },
  'mercari':              { rate: 0.10,   fixed: 0,    name: 'Mercari' },
  'poshmark':             { rate: 0.20,   fixed: 0,    name: 'Poshmark' },
  'facebook_marketplace': { rate: 0.05,   fixed: 0.40, name: 'Facebook Marketplace (shipped)' },
  'facebook_local':       { rate: 0,      fixed: 0,    name: 'Facebook Marketplace (local)' },
  'offerup':              { rate: 0,      fixed: 0,    name: 'OfferUp (local)' },
  'craigslist':           { rate: 0,      fixed: 0,    name: 'Craigslist' },
  'general':              { rate: 0.10,   fixed: 0.30, name: 'Online marketplace (est.)' },
};

// ============================================================================
// Shipping Cost Heuristics by Category
// ============================================================================

const SHIPPING_COSTS: Record<string, { low: number; mid: number; high: number }> = {
  'electronics_small': { low: 6, mid: 10, high: 15 },
  'electronics_large': { low: 15, mid: 22, high: 35 },
  'phones':            { low: 5, mid: 8, high: 12 },
  'laptops':           { low: 12, mid: 18, high: 25 },
  'gaming':            { low: 10, mid: 15, high: 22 },
  'audio':             { low: 6, mid: 10, high: 16 },
  'clothing':          { low: 5, mid: 8, high: 12 },
  'shoes':             { low: 8, mid: 12, high: 16 },
  'tools':             { low: 10, mid: 18, high: 28 },
  'furniture':         { low: 40, mid: 75, high: 150 },
  'appliances_small':  { low: 10, mid: 16, high: 25 },
  'appliances_large':  { low: 30, mid: 60, high: 100 },
  'bikes':             { low: 30, mid: 50, high: 80 },
  'cameras':           { low: 8, mid: 12, high: 18 },
  'instruments':       { low: 15, mid: 25, high: 45 },
  'collectibles':      { low: 5, mid: 8, high: 14 },
  'toys':              { low: 6, mid: 10, high: 16 },
  'books':             { low: 3, mid: 5, high: 8 },
  'sports':            { low: 12, mid: 20, high: 35 },
  'baby':              { low: 10, mid: 16, high: 25 },
  'general':           { low: 8, mid: 14, high: 22 },
};

// ============================================================================
// Condition Multipliers
// ============================================================================

const CONDITION_MULTIPLIERS: Record<string, number> = {
  'New': 1.0,
  'Like New': 0.90,
  'Good': 0.75,
  'Fair': 0.60,
  'Poor': 0.40,
  'For Parts': 0.25,
};

// ============================================================================
// Category Detection
// ============================================================================

const CATEGORY_PATTERNS: { pattern: RegExp; category: string; shippingKey: string }[] = [
  { pattern: /iphone|ipad|samsung galaxy|pixel phone|android phone/i, category: 'Phones & Tablets', shippingKey: 'phones' },
  { pattern: /macbook|laptop|chromebook|thinkpad|dell xps|surface pro/i, category: 'Laptops', shippingKey: 'laptops' },
  { pattern: /ps[45]|playstation|xbox|nintendo|switch|game\s*boy|sega|wii/i, category: 'Gaming', shippingKey: 'gaming' },
  { pattern: /headphones|earbuds|airpods|speaker|soundbar|bose|sonos|jbl|beats|sony wh/i, category: 'Audio', shippingKey: 'audio' },
  { pattern: /tv|television|monitor|oled|qled/i, category: 'Electronics (Large)', shippingKey: 'electronics_large' },
  { pattern: /camera|canon|nikon|gopro|lens|dslr|mirrorless/i, category: 'Cameras', shippingKey: 'cameras' },
  { pattern: /guitar|keyboard|piano|drum|amplifier|amp|violin|ukulele/i, category: 'Instruments', shippingKey: 'instruments' },
  { pattern: /nike|jordan|adidas|yeezy|new balance|sneaker|shoe|boots/i, category: 'Shoes', shippingKey: 'shoes' },
  { pattern: /jacket|coat|dress|shirt|jeans|pants|supreme|vintage clothing/i, category: 'Clothing', shippingKey: 'clothing' },
  { pattern: /drill|saw|dewalt|milwaukee|makita|wrench|tool\s*set/i, category: 'Tools', shippingKey: 'tools' },
  { pattern: /sofa|couch|chair|desk|table|dresser|bookshelf|cabinet|bed frame/i, category: 'Furniture', shippingKey: 'furniture' },
  { pattern: /dyson|roomba|vacuum|instant pot|kitchenaid|air fryer|blender|mixer/i, category: 'Small Appliances', shippingKey: 'appliances_small' },
  { pattern: /washer|dryer|refrigerator|dishwasher|stove|oven/i, category: 'Large Appliances', shippingKey: 'appliances_large' },
  { pattern: /bike|bicycle|mountain bike|road bike/i, category: 'Bikes', shippingKey: 'bikes' },
  { pattern: /lego|pokemon|trading card|funko|hot wheels|vintage toy/i, category: 'Collectibles', shippingKey: 'collectibles' },
  { pattern: /stroller|crib|car seat|baby/i, category: 'Baby', shippingKey: 'baby' },
  { pattern: /kayak|surfboard|ski|snowboard|golf|tennis|treadmill|peloton|dumbbell/i, category: 'Sports & Fitness', shippingKey: 'sports' },
  { pattern: /apple watch|fitbit|garmin|smart\s*watch/i, category: 'Electronics (Small)', shippingKey: 'electronics_small' },
  { pattern: /kindle|tablet|e-reader/i, category: 'Electronics (Small)', shippingKey: 'electronics_small' },
  { pattern: /router|modem|hard drive|ssd|ram|gpu|graphics card|cpu|processor/i, category: 'Computer Parts', shippingKey: 'electronics_small' },
];

function detectCategory(title: string, userCategory?: string): { category: string; shippingKey: string } {
  if (userCategory) {
    const lower = userCategory.toLowerCase();
    for (const cp of CATEGORY_PATTERNS) {
      if (cp.category.toLowerCase().includes(lower) || lower.includes(cp.category.toLowerCase())) {
        return { category: cp.category, shippingKey: cp.shippingKey };
      }
    }
  }
  for (const cp of CATEGORY_PATTERNS) {
    if (cp.pattern.test(title)) {
      return { category: cp.category, shippingKey: cp.shippingKey };
    }
  }
  return { category: userCategory || 'General', shippingKey: 'general' };
}

// ============================================================================
// eBay Sold Listings Scraper
// ============================================================================

let lastEbayFetch = 0;
const EBAY_MIN_INTERVAL_MS = 3000;
let tableEnsured = false;
let eventsTableEnsured = false;
let analysesTableEnsured = false;

// ─── User-Agent Rotation Pool ────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
];
function randomUA(): string { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

async function ensureSoldCompsTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sold_comps (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        query_hash VARCHAR(32) NOT NULL,
        search_query VARCHAR(500) NOT NULL,
        item_title VARCHAR(500) NOT NULL,
        sold_price DECIMAL(12,2) NOT NULL,
        condition VARCHAR(50),
        sold_date DATE,
        source VARCHAR(50) NOT NULL DEFAULT 'ebay',
        source_url TEXT,
        category VARCHAR(100),
        scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        raw_json JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`, []);
    await query(`CREATE INDEX IF NOT EXISTS idx_sold_comps_query_hash ON sold_comps(query_hash, scraped_at DESC)`, []);
    tableEnsured = true;
    logger.info('sold_comps table ensured');
  } catch (err) {
    logger.warn('Could not ensure sold_comps table, cache will be skipped', { error: (err as Error).message });
  }
}

function normalizeQuery(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function queryHash(normalized: string): string {
  return createHash('md5').update(normalized).digest('hex');
}

async function getCachedComps(hash: string, maxAgeHours = 24): Promise<SoldComp[]> {
  try {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
    const result = await query<any>(
      `SELECT item_title, sold_price, condition, sold_date, source, source_url
       FROM sold_comps WHERE query_hash = $1 AND scraped_at > $2
       ORDER BY scraped_at DESC LIMIT 50`,
      [hash, cutoff]
    );
    return result.rows.map(r => ({
      item_title: r.item_title,
      sold_price: parseFloat(r.sold_price),
      condition: r.condition,
      sold_date: r.sold_date,
      source: r.source,
      source_url: r.source_url,
    }));
  } catch (err) {
    logger.warn('Cache lookup failed, proceeding without cache', { error: (err as Error).message });
    return [];
  }
}

async function cacheComps(hash: string, searchQuery: string, comps: SoldComp[], category: string): Promise<void> {
  try {
    for (const comp of comps) {
      await query(
        `INSERT INTO sold_comps (query_hash, search_query, item_title, sold_price, condition, sold_date, source, source_url, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [hash, searchQuery, comp.item_title, comp.sold_price, comp.condition, comp.sold_date, comp.source, comp.source_url, category]
      );
    }
  } catch (err) {
    logger.warn('Cache write failed', { error: (err as Error).message });
  }
}

async function scrapeEbaySoldComps(searchQuery: string): Promise<SoldComp[]> {
  // Rate limit
  const now = Date.now();
  const wait = EBAY_MIN_INTERVAL_MS - (now - lastEbayFetch);
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  lastEbayFetch = Date.now();

  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}&LH_Complete=1&LH_Sold=1&_sop=13`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      logger.warn('eBay returned non-200', { status: res.status });
      return [];
    }

    const html = await res.text();
    const comps: SoldComp[] = [];

    // ── Strategy 1: New eBay HTML (2025+) ── s-card__price based ──
    // eBay now uses su-styled-text with s-card__price class
    // "positive bold" = sold price, "positive strikethrough" = original price (skip)
    const cardPriceRegex = /su-styled-text positive bold[^"]*s-card__price">\$?([\d,]+\.\d{2})/g;
    let cpm;
    while ((cpm = cardPriceRegex.exec(html)) && comps.length < 30) {
      const price = parseFloat(cpm[1].replace(/,/g, ''));
      // Filter out promo card prices (typically < $25 for "Shop on eBay" cards)
      if (price >= 5 && price < 100000) {
        comps.push({
          item_title: searchQuery,
          sold_price: price,
          condition: null,
          sold_date: null,
          source: 'ebay',
          source_url: null,
        });
      }
    }

    // ── Strategy 2: Legacy eBay HTML ── s-item blocks ──
    if (comps.length === 0) {
      const itemBlocks = html.split(/class="s-item__wrapper/g).slice(1, 30);
      for (const block of itemBlocks) {
        try {
          const titleMatch = block.match(/class="s-item__title"[^>]*>(?:<span[^>]*>)?([^<]+)/);
          const title = titleMatch?.[1]?.trim();
          if (!title || title === 'Shop on eBay' || title.length < 5) continue;

          const priceMatch = block.match(/class="s-item__price"[^>]*>\s*\$?([\d,]+\.\d{2})/);
          if (!priceMatch) continue;
          const price = parseFloat(priceMatch[1].replace(/,/g, ''));
          if (price <= 0 || price > 100000) continue;

          const linkMatch = block.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/);
          const condMatch = block.match(/SECONDARY_INFO"[^>]*>([^<]+)/);

          comps.push({
            item_title: title,
            sold_price: price,
            condition: condMatch?.[1]?.trim() || null,
            sold_date: null,
            source: 'ebay',
            source_url: linkMatch?.[1] || null,
          });
        } catch { /* skip malformed block */ }
      }
    }

    // ── Strategy 3: Raw price extraction ── last resort ──
    if (comps.length === 0) {
      const priceRegex = /\$([\d,]+\.\d{2})/g;
      const rawPrices: number[] = [];
      let m;
      while ((m = priceRegex.exec(html)) && rawPrices.length < 40) {
        const p = parseFloat(m[1].replace(/,/g, ''));
        if (p > 5 && p < 100000) rawPrices.push(p);
      }

      if (rawPrices.length >= 3) {
        // Remove outliers: filter to within 2x of median
        const sorted = rawPrices.sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const relevant = sorted.filter(p => p >= median * 0.3 && p <= median * 2.5);
        for (const p of relevant.slice(0, 20)) {
          comps.push({
            item_title: searchQuery,
            sold_price: p,
            condition: null,
            sold_date: null,
            source: 'ebay',
            source_url: null,
          });
        }
      }
    }

    // Filter out obvious promo/junk prices: accessories, promo cards, unrelated items
    if (comps.length > 5) {
      const prices = comps.map(c => c.sold_price).sort((a, b) => a - b);
      const median = prices[Math.floor(prices.length / 2)];
      // Remove anything below 25% of median (likely accessories or promo junk)
      // and anything above 3x median (likely bundles or wrong items)
      const filtered = comps.filter(c => c.sold_price >= median * 0.25 && c.sold_price <= median * 3);
      if (filtered.length >= 3) {
        comps.length = 0;
        comps.push(...filtered);
      }
    }

    if (comps.length === 0) {
      logger.warn('eBay scrape: 0 comps extracted — HTML structure may have changed', {
        query: searchQuery,
        htmlLength: html.length,
        hasCardPrice: html.includes('s-card__price'),
        hasItemWrapper: html.includes('s-item__wrapper'),
      });
    } else {
      logger.info(`eBay scrape: ${comps.length} comps for "${searchQuery}"`);
    }
    return comps;
  } catch (err) {
    logger.warn('eBay scrape failed', { error: (err as Error).message, query: searchQuery });
    return [];
  }
}

// ============================================================================
// Event Logging (funnel instrumentation)
// ============================================================================

async function ensureEventsTable(): Promise<void> {
  if (eventsTableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS flip_events (
        id SERIAL PRIMARY KEY,
        event VARCHAR(50) NOT NULL,
        ip VARCHAR(50),
        user_id VARCHAR(100),
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`, []);
    eventsTableEnsured = true;
  } catch { /* best effort */ }
}

export async function logFlipEvent(event: string, ip?: string, userId?: string, details?: Record<string, unknown>): Promise<void> {
  await ensureEventsTable();
  try {
    await query(
      'INSERT INTO flip_events (event, ip, user_id, details) VALUES ($1, $2, $3, $4)',
      [event, ip || null, userId || null, details ? JSON.stringify(details) : null]
    );
  } catch { /* best effort */ }
}

export async function getFlipStats(): Promise<{ totalAnalyses: number; todayAnalyses: number }> {
  await ensureEventsTable();
  try {
    const total = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM flip_events WHERE event = 'analyzed'"
    );
    const today = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM flip_events WHERE event = 'analyzed' AND created_at > CURRENT_DATE"
    );
    return {
      totalAnalyses: parseInt(total?.count || '0', 10),
      todayAnalyses: parseInt(today?.count || '0', 10),
    };
  } catch {
    return { totalAnalyses: 0, todayAnalyses: 0 };
  }
}

// ============================================================================
// Stored Analyses (for shareable results)
// ============================================================================

async function ensureAnalysesTable(): Promise<void> {
  if (analysesTableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS flip_analyses (
        id VARCHAR(20) PRIMARY KEY,
        input_json JSONB NOT NULL,
        result_json JSONB NOT NULL,
        ip VARCHAR(50),
        user_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`, []);
    analysesTableEnsured = true;
  } catch { /* best effort */ }
}

export async function storeAnalysis(id: string, input: FlipCardInput, result: FlipCardOutput, ip?: string, userId?: string): Promise<void> {
  await ensureAnalysesTable();
  try {
    await query(
      'INSERT INTO flip_analyses (id, input_json, result_json, ip, user_id) VALUES ($1, $2, $3, $4, $5)',
      [id, JSON.stringify(input), JSON.stringify(result), ip || null, userId || null]
    );
  } catch (err) {
    logger.warn('Failed to store analysis', { error: (err as Error).message });
  }
}

export async function getStoredAnalysis(id: string): Promise<{ input: FlipCardInput; result: FlipCardOutput; createdAt: string } | null> {
  await ensureAnalysesTable();
  try {
    const row = await queryOne<{ input_json: string; result_json: string; created_at: string }>(
      'SELECT input_json, result_json, created_at FROM flip_analyses WHERE id = $1',
      [id]
    );
    if (!row) return null;
    return {
      input: JSON.parse(row.input_json),
      result: JSON.parse(row.result_json),
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Heuristic Fallback (when scraping fails)
// ============================================================================

const HEURISTIC_BASELINES: { pattern: RegExp; low: number; mid: number; high: number }[] = [
  { pattern: /iphone\s*1[5-6]/i, low: 400, mid: 600, high: 850 },
  { pattern: /iphone\s*1[3-4]/i, low: 250, mid: 400, high: 600 },
  { pattern: /iphone/i, low: 150, mid: 300, high: 500 },
  { pattern: /ipad pro/i, low: 350, mid: 550, high: 800 },
  { pattern: /ipad/i, low: 150, mid: 280, high: 450 },
  { pattern: /macbook pro/i, low: 600, mid: 1000, high: 1500 },
  { pattern: /macbook/i, low: 350, mid: 600, high: 900 },
  { pattern: /airpods pro/i, low: 80, mid: 130, high: 180 },
  { pattern: /airpods/i, low: 40, mid: 80, high: 130 },
  { pattern: /ps5/i, low: 300, mid: 380, high: 450 },
  { pattern: /xbox series x/i, low: 280, mid: 350, high: 420 },
  { pattern: /nintendo switch/i, low: 180, mid: 250, high: 320 },
  { pattern: /sony wh.?1000/i, low: 120, mid: 180, high: 260 },
  { pattern: /bose.*700|bose.*qc/i, low: 100, mid: 160, high: 230 },
  { pattern: /dyson/i, low: 100, mid: 200, high: 350 },
  { pattern: /roomba/i, low: 60, mid: 120, high: 220 },
  { pattern: /kitchenaid/i, low: 80, mid: 150, high: 250 },
  { pattern: /jordan\s*\d/i, low: 80, mid: 150, high: 300 },
  { pattern: /yeezy/i, low: 100, mid: 200, high: 350 },
  { pattern: /lego/i, low: 20, mid: 60, high: 200 },
  { pattern: /dewalt|milwaukee/i, low: 40, mid: 80, high: 160 },
  { pattern: /peloton/i, low: 200, mid: 500, high: 900 },
  { pattern: /gopro/i, low: 80, mid: 150, high: 280 },
  { pattern: /canon|nikon/i, low: 100, mid: 250, high: 500 },
  { pattern: /gpu|graphics card|rtx|rx\s*\d/i, low: 100, mid: 250, high: 600 },
];

function getHeuristicResale(title: string): { low: number; mid: number; high: number } | null {
  for (const h of HEURISTIC_BASELINES) {
    if (h.pattern.test(title)) return { low: h.low, mid: h.mid, high: h.high };
  }
  return null;
}

// ============================================================================
// Main Flip Card Computation
// ============================================================================

export async function computeFlipCard(input: FlipCardInput): Promise<FlipCardOutput> {
  const { title, buy_price, condition, shipping_or_pickup, target_platform, description } = input;
  const searchText = description ? `${title} ${description}` : title;

  // 0. Ensure table exists (no-op after first call)
  await ensureSoldCompsTable();

  // 1. Detect category
  const { category, shippingKey } = detectCategory(searchText, input.category);

  // 2. Get comps (cache → scrape → heuristic)
  const normalized = normalizeQuery(title);
  const hash = queryHash(normalized);
  let comps = await getCachedComps(hash);
  let compSource = 'cache';
  let compFreshness = 'cached (< 24h)';

  if (comps.length < 3) {
    const scraped = await scrapeEbaySoldComps(title);
    if (scraped.length > 0) {
      await cacheComps(hash, normalized, scraped, category);
      comps = scraped;
      compSource = 'ebay-live';
      compFreshness = 'live scrape';
    }
  }

  // 3. Compute resale range
  let resaleLow: number, resaleMid: number, resaleHigh: number;
  let confidenceBase: number;
  const assumptions: string[] = [];
  const compSources: FlipCardOutput['comp_sources'] = [];

  if (comps.length >= 3) {
    const prices = comps.map(c => c.sold_price).sort((a, b) => a - b);
    resaleLow = prices[Math.floor(prices.length * 0.25)];
    resaleMid = prices[Math.floor(prices.length * 0.5)];
    resaleHigh = prices[Math.floor(prices.length * 0.75)];
    confidenceBase = Math.min(85, 50 + comps.length * 3);
    assumptions.push(`Resale estimates based on ${comps.length} recently sold comparable items on eBay`);
    compSources.push({ source: 'eBay Sold Listings', count: comps.length, freshness: compFreshness });
  } else {
    // Heuristic fallback
    const heuristic = getHeuristicResale(title);
    if (heuristic) {
      resaleLow = heuristic.low;
      resaleMid = heuristic.mid;
      resaleHigh = heuristic.high;
      confidenceBase = 40;
      assumptions.push('Resale estimates based on category averages — no live sold data available for this exact item');
    } else {
      // Very rough fallback
      resaleLow = buy_price * 0.8;
      resaleMid = buy_price * 1.3;
      resaleHigh = buy_price * 2.0;
      confidenceBase = 20;
      assumptions.push('Resale estimates are rough category averages — no comparable sold data found. Treat with caution.');
    }
    compSources.push({ source: 'Category heuristics', count: 0, freshness: 'n/a' });
  }

  // 4. Apply condition adjustment
  // Only apply condition penalty when using heuristics (no real comp data).
  // When we have real comps, the sold prices already reflect real-world condition mix.
  // "Good" is the most common condition on eBay — no adjustment needed.
  const condMultiplier = CONDITION_MULTIPLIERS[condition] || 0.75;
  const hasRealComps = comps.length >= 3;
  if (!hasRealComps && condition !== 'New' && condition !== 'Like New') {
    // Heuristic-only: apply a softer penalty (sqrt blend — less aggressive)
    const softMultiplier = Math.sqrt(condMultiplier); // Good: 0.75 → 0.87, Fair: 0.60 → 0.77
    resaleLow = Math.round(resaleLow * softMultiplier * 100) / 100;
    resaleMid = Math.round(resaleMid * softMultiplier * 100) / 100;
    resaleHigh = Math.round(resaleHigh * softMultiplier * 100) / 100;
    assumptions.push(`Resale adjusted for "${condition}" condition (${Math.round(softMultiplier * 100)}% of typical price)`);
  } else if (hasRealComps && (condition === 'Poor' || condition === 'For Parts')) {
    // Only penalize Poor/For Parts even with real comps — these are genuinely below market
    resaleLow = Math.round(resaleLow * 0.65 * 100) / 100;
    resaleMid = Math.round(resaleMid * 0.65 * 100) / 100;
    resaleHigh = Math.round(resaleHigh * 0.65 * 100) / 100;
    assumptions.push(`Resale adjusted for "${condition}" condition (65% of sold comps price)`);
  } else if (hasRealComps && condition !== 'New' && condition !== 'Like New') {
    assumptions.push(`Sold comps reflect real market conditions — no additional adjustment for "${condition}"`);
  }

  // 5. Compute platform fees
  const platformKey = normalizePlatformKey(target_platform, shipping_or_pickup);
  const feeTable = PLATFORM_FEES[platformKey] || PLATFORM_FEES['general'];
  const estFees = Math.round((resaleMid * feeTable.rate + feeTable.fixed) * 100) / 100;
  assumptions.push(`${feeTable.name} fees: ${(feeTable.rate * 100).toFixed(1)}%${feeTable.fixed > 0 ? ` + $${feeTable.fixed.toFixed(2)}` : ''}`);

  // 6. Compute shipping
  let estShipping = 0;
  if (shipping_or_pickup === 'shipping') {
    const shippingTable = SHIPPING_COSTS[shippingKey] || SHIPPING_COSTS['general'];
    estShipping = shippingTable.mid;
    assumptions.push(`Shipping estimated at $${estShipping} for ${category} items (range: $${shippingTable.low}-$${shippingTable.high})`);
  } else {
    assumptions.push('Local pickup — no shipping cost');
  }

  // 7. Compute net profit range
  const netLow = Math.round((resaleLow - buy_price - (resaleLow * feeTable.rate + feeTable.fixed) - estShipping) * 100) / 100;
  const netMid = Math.round((resaleMid - buy_price - estFees - estShipping) * 100) / 100;
  const netHigh = Math.round((resaleHigh - buy_price - (resaleHigh * feeTable.rate + feeTable.fixed) - estShipping) * 100) / 100;

  // 8. Risk flags
  const riskFlags: string[] = [];
  if (netMid <= 0) riskFlags.push('Expected profit is negative or break-even');
  if (netMid > 0 && netMid < buy_price * 0.15) riskFlags.push('Thin margin — may not be worth the effort');
  if (comps.length < 3) riskFlags.push('Low comparable data — resale estimate is uncertain');
  if (comps.length >= 3 && comps.length < 8) riskFlags.push('Limited comps — price range may be wider than shown');
  if (confidenceBase < 40) riskFlags.push('Low confidence — treat estimates with caution');
  if (condition === 'Fair' || condition === 'Poor' || condition === 'For Parts') {
    riskFlags.push(`"${condition}" condition may reduce buyer interest and final sale price`);
  }
  if (shipping_or_pickup === 'shipping' && shippingKey === 'furniture') {
    riskFlags.push('Furniture shipping is expensive and risky — consider local sale only');
  }
  if (shipping_or_pickup === 'shipping' && shippingKey === 'appliances_large') {
    riskFlags.push('Large appliances are costly to ship — local pickup strongly recommended');
  }
  if (resaleHigh - resaleLow > resaleMid * 0.8) {
    riskFlags.push('Wide price range — actual resale value is highly variable');
  }

  // 9. Risk score (0-100, higher = riskier)
  let riskScore = 0;
  riskScore += Math.max(0, 30 - confidenceBase / 3);
  if (netMid <= 0) riskScore += 40;
  else if (netMid < buy_price * 0.15) riskScore += 20;
  if (comps.length < 3) riskScore += 15;
  if (condition === 'Poor' || condition === 'For Parts') riskScore += 15;
  else if (condition === 'Fair') riskScore += 8;
  riskScore = Math.min(100, Math.round(riskScore));

  // 10. Confidence score
  let confidence = confidenceBase;
  if (condition === 'New' || condition === 'Like New') confidence += 5;
  if (condition === 'Poor' || condition === 'For Parts') confidence -= 10;
  if (shipping_or_pickup === 'pickup') confidence += 3; // No shipping uncertainty
  confidence = Math.max(5, Math.min(95, Math.round(confidence)));

  // 11. Verdict
  // Thresholds: BUY if 15%+ ROI with decent confidence, NEGOTIATE if any profit potential
  let verdict: FlipCardOutput['verdict'];
  if (netMid > buy_price * 0.15 && confidence >= 35) {
    verdict = 'BUY';
  } else if (netMid > 0 || netHigh > buy_price * 0.10) {
    verdict = 'NEGOTIATE LOWER';
  } else {
    verdict = 'PASS';
  }

  // 12. Negotiation target
  let negotiationTarget: number | null = null;
  if (verdict === 'NEGOTIATE LOWER') {
    // Target price that would make this a BUY (20% margin on mid)
    const targetBuy = Math.round((resaleMid - estFees - estShipping) / 1.20 * 100) / 100;
    if (targetBuy > 0 && targetBuy < buy_price) {
      negotiationTarget = targetBuy;
    }
  }

  // 13. ROI + sell time
  const roiPercent = buy_price > 0 ? Math.round((netMid / buy_price) * 100) : 0;
  const estDaysToSell = estimateSellTime(shippingKey, category);

  // 14. Rationale
  const rationale = generateRationale(verdict, buy_price, resaleMid, netMid, estFees, estShipping, confidence, comps.length, condition, feeTable.name, negotiationTarget);

  return {
    item_title: title,
    item_category: category,
    condition_assessment: condition,
    buy_price,
    est_resale_low: resaleLow,
    est_resale_mid: resaleMid,
    est_resale_high: resaleHigh,
    est_platform_fees: estFees,
    est_shipping_cost: estShipping,
    est_net_profit_low: netLow,
    est_net_profit_mid: netMid,
    est_net_profit_high: netHigh,
    confidence_score: confidence,
    risk_score: riskScore,
    risk_flags: riskFlags,
    roi_percent: roiPercent,
    est_days_to_sell: estDaysToSell,
    verdict,
    rationale_summary: rationale,
    negotiation_target_price: negotiationTarget,
    assumptions,
    comp_sources: compSources,
    generated_at: new Date().toISOString(),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function estimateSellTime(shippingKey: string, _category: string): string {
  const sellTimes: Record<string, string> = {
    phones: '1–5 days', laptops: '3–10 days', gaming: '2–7 days',
    audio: '3–10 days', electronics_small: '3–10 days', electronics_large: '7–21 days',
    cameras: '5–14 days', shoes: '3–14 days', clothing: '7–21 days',
    tools: '5–14 days', furniture: '7–30 days', appliances_small: '5–14 days',
    appliances_large: '14–30 days', bikes: '7–21 days', instruments: '7–21 days',
    collectibles: '3–14 days', sports: '7–21 days', baby: '5–14 days',
    general: '5–14 days',
  };
  return sellTimes[shippingKey] || sellTimes['general'];
}

function normalizePlatformKey(platform?: string, shippingOrPickup?: string): string {
  const p = (platform || 'general').toLowerCase().replace(/\s+/g, '_');
  if (p.includes('ebay')) return 'ebay';
  if (p.includes('mercari')) return 'mercari';
  if (p.includes('poshmark')) return 'poshmark';
  if (p.includes('facebook') || p.includes('fb')) {
    return shippingOrPickup === 'pickup' ? 'facebook_local' : 'facebook_marketplace';
  }
  if (p.includes('offerup') || p.includes('offer_up')) return 'offerup';
  if (p.includes('craigslist')) return 'craigslist';
  return 'general';
}

function generateRationale(
  verdict: string, buyPrice: number, resaleMid: number, netMid: number,
  fees: number, shipping: number, confidence: number, compCount: number,
  condition: string, platformName: string, negotiationTarget: number | null,
): string {
  const parts: string[] = [];

  if (verdict === 'BUY') {
    parts.push(`At $${buyPrice}, this looks like a solid flip opportunity.`);
    parts.push(`Based on ${compCount > 0 ? compCount + ' recent sold comps' : 'category estimates'}, the expected resale is around $${resaleMid}.`);
    parts.push(`After ${platformName} fees (~$${fees}) and shipping (~$${shipping}), your estimated net profit is $${netMid}.`);
    if (confidence < 60) {
      parts.push(`Confidence is moderate (${confidence}%) — verify condition carefully before committing.`);
    }
  } else if (verdict === 'NEGOTIATE LOWER') {
    parts.push(`At $${buyPrice}, the margin is too thin to recommend buying outright.`);
    parts.push(`The expected resale is around $${resaleMid}, but after fees (~$${fees}) and shipping (~$${shipping}), net profit is only $${netMid}.`);
    if (negotiationTarget) {
      parts.push(`If you can negotiate down to ~$${negotiationTarget}, this becomes a worthwhile flip.`);
    } else {
      parts.push(`Try to negotiate a lower buy price to improve the margin.`);
    }
  } else {
    parts.push(`At $${buyPrice}, this does not appear to be a profitable flip.`);
    if (netMid < 0) {
      parts.push(`Expected resale (~$${resaleMid}) minus fees and shipping would result in a loss of ~$${Math.abs(netMid)}.`);
    } else {
      parts.push(`The margin is too thin to justify the time and risk.`);
    }
    if (condition === 'Poor' || condition === 'For Parts') {
      parts.push(`The "${condition}" condition significantly limits resale value.`);
    }
  }

  return parts.join(' ');
}
