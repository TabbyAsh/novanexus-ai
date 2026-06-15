/**
 * Trend Radar — the demand-detection engine. (The "shovel.")
 *
 * The thesis: don't run a dropshipping store (capital + ops + platform-ban trap).
 * SELL THE SIGNAL. Detect what's heating up before it peaks, and sell that
 * intelligence to the thousands of resellers / e-com sellers who DO run the ops.
 *
 * Pipeline (all zero-cost, no gatekeeper):
 *   1. INGEST  — Google Trends live RSS (proven free, no API key, no approval)
 *   2. ENRICH  — the free AI router classifies raw trends into product opportunities
 *   3. SCORE   — velocity score from search traffic volume
 *   4. EMIT    — ranked Trend Opportunity Cards (the Decision Card engine, pointed at demand)
 *
 * This is the founder's exact edge: messy signal in → a clear decision out.
 * No inventory, no shipping, no chargebacks, no platform bans. Pure intelligence.
 */

import { query } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { generateCard } from './ai-router';

const logger = createLogger('trend-radar');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawTrend {
  term: string;
  /** Approx search volume e.g. "200K+", parsed to a number for scoring. */
  trafficLabel: string;
  traffic: number;
  /** Optional news context Google attaches to the trend. */
  context?: string;
  pubDate?: string;
  /** Which country feeds this term surfaced in (the proprietary cross-border signal). */
  regions?: string[];
  /** How many countries it's trending in at once. >1 = stronger, earlier signal. */
  regionCount?: number;
}

export interface TrendCard {
  term: string;
  /** AI verdict: is this a real product opportunity for a seller? */
  isProductOpportunity: boolean;
  /** What the sellable product actually is (AI-extracted). */
  product: string;
  category: string;
  /** Who buys this / who should sell it. */
  audience: string;
  /** Why it's rising right now. */
  whyNow: string;
  /** Where a seller would source it. */
  sourcing: string;
  /** 0-100 momentum score. */
  velocity: number;
  /** 'rising' | 'hot' | 'peaking' — lifecycle stage estimate. */
  stage: 'rising' | 'hot' | 'peaking';
  trafficLabel: string;
  /** Countries it's trending in (the proprietary cross-border early signal). */
  regions: string[];
  regionCount: number;
  provider: string;
}

// ── 1. INGEST — Google Trends live RSS (free, no key) ──────────────────────────

const TRENDS_URL = (geo: string) =>
  `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;

/** Parse "200K+" / "2M+" / "1,000+" style labels into an approximate number. */
function parseTraffic(label: string): number {
  if (!label) return 0;
  const m = label.replace(/[,+\s]/g, '').match(/^([\d.]+)([KMB]?)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toUpperCase();
  const mult = unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1;
  return Math.round(n * mult);
}

/** Minimal, dependency-free RSS field extractor for the Google Trends feed. */
function extractTag(block: string, tag: string): string {
  // Handles both <tag>..</tag> and namespaced <ns:tag>..</ns:tag>
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchGoogleTrends(geo = 'US'): Promise<RawTrend[]> {
  try {
    const res = await fetch(TRENDS_URL(geo), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NovaTrendRadar/1.0)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      logger.warn('Google Trends RSS non-OK', { status: res.status });
      return [];
    }
    const xml = await res.text();
    const items = xml.split(/<item>/i).slice(1).map((chunk) => {
      const block = chunk.split(/<\/item>/i)[0];
      const term = extractTag(block, 'title');
      const trafficLabel =
        extractTag(block, 'ht:approx_traffic') || extractTag(block, 'approx_traffic') || '';
      const context =
        extractTag(block, 'ht:news_item_title') || extractTag(block, 'description') || '';
      const pubDate = extractTag(block, 'pubDate');
      return {
        term,
        trafficLabel,
        traffic: parseTraffic(trafficLabel),
        context: context.slice(0, 240) || undefined,
        pubDate: pubDate || undefined,
      } as RawTrend;
    });
    return items.filter((t) => t.term);
  } catch (err) {
    logger.warn('Google Trends fetch failed', { error: (err as Error).message });
    return [];
  }
}

// ── Multi-region ingest — the proprietary cross-border signal ───────────────────

/** Which countries to scan for a given primary geo. US gets the English-market set
 *  so we catch products surging abroad *before* they hit the US. */
function regionsFor(geo: string): string[] {
  if (geo === 'US') return ['US', 'GB', 'CA', 'AU'];
  return [geo];
}

/** Fetch several countries' trends and merge: dedupe by term, keep the highest
 *  traffic, and count how many countries each term appears in (the early signal). */
export async function ingestMultiRegion(geo = 'US'): Promise<RawTrend[]> {
  const regions = regionsFor(geo);
  const settled = await Promise.all(regions.map((r) => fetchGoogleTrends(r).then((trends) => ({ r, trends }))));

  const merged = new Map<string, RawTrend>();
  for (const { r, trends } of settled) {
    for (const t of trends) {
      const key = t.term.toLowerCase().trim();
      const existing = merged.get(key);
      if (existing) {
        existing.traffic = Math.max(existing.traffic, t.traffic);
        if (t.traffic > parseTraffic(existing.trafficLabel)) existing.trafficLabel = t.trafficLabel;
        if (!existing.regions!.includes(r)) existing.regions!.push(r);
        existing.regionCount = existing.regions!.length;
        if (!existing.context && t.context) existing.context = t.context;
      } else {
        merged.set(key, { ...t, regions: [r], regionCount: 1 });
      }
    }
  }
  // Order: multi-region first (earliest/strongest), then by traffic.
  return Array.from(merged.values()).sort((a, b) => {
    if ((b.regionCount || 1) !== (a.regionCount || 1)) return (b.regionCount || 1) - (a.regionCount || 1);
    return b.traffic - a.traffic;
  });
}

// ── 3. SCORE — velocity from traffic volume + cross-border momentum ─────────────

function velocityScore(traffic: number, rank: number, total: number, regionCount = 1): number {
  // Traffic is the dominant signal (log-scaled), rank gives early-list a small boost.
  const trafficComponent = traffic > 0 ? Math.min(60, Math.log10(traffic) * 12) : 18;
  const rankComponent = total > 0 ? Math.round((1 - rank / total) * 22) : 0;
  // Proprietary: trending in multiple countries at once is a stronger, earlier signal.
  const crossBorderComponent = Math.min(18, (regionCount - 1) * 9);
  return Math.max(1, Math.min(100, Math.round(trafficComponent + rankComponent + crossBorderComponent)));
}

function stageFromScore(v: number): TrendCard['stage'] {
  if (v >= 75) return 'peaking';
  if (v >= 50) return 'hot';
  return 'rising';
}

// ── 2. ENRICH — free AI turns raw trends into product opportunity cards ─────────

const ENRICH_SYSTEM = `You are Nova's Trend Radar — a sharp product-opportunity analyst for online resellers, dropshippers, and print-on-demand sellers.
You are given raw trending search terms (Google Trends) with traffic. Your job is to find the SELLABLE ANGLE in as many as you reasonably can — a great seller monetizes attention, not just "products."

Think like an operator:
- A viral GADGET/TOY/BEAUTY/HOME item → sell the item (AliExpress, wholesale, Amazon FBA).
- A PERSON, TEAM, SHOW, GAME, MOVIE, or MEME blowing up → sell print-on-demand merch (shirts, posters, stickers, mugs, hats) tied to it. This is huge and low-risk — no inventory.
- An EVENT, HOLIDAY, SEASON, or ANNIVERSARY → sell themed/seasonal products and decor.
- A NEWS topic with a hobby/interest behind it (e.g. "world war 2" → history buffs) → sell books, models, memorabilia, collectibles.
Only mark isProductOpportunity=false when there is genuinely NO honest way to sell something tied to it (e.g. a tragedy, a generic weather event, a pure breaking-news headline).

For EACH input term return a JSON object with EXACTLY these fields:
{
  "term": "<the input term>",
  "isProductOpportunity": <true|false>,
  "product": "<the concrete sellable product/angle, or '' if none>",
  "category": "<Apparel, Print-on-Demand, Gadgets, Home, Toys, Beauty, Collectible, Seasonal, Digital, Books, or 'None'>",
  "audience": "<who buys it, in plain words, or ''>",
  "whyNow": "<one tight sentence on why it's surging RIGHT NOW, or ''>",
  "sourcing": "<exactly where/how a seller gets it cheaply: Printful/print-on-demand, AliExpress, wholesale, Amazon, thrift, local, etc., or ''>"
}
Be specific and real — no filler. Return ONLY a JSON array, same order as input. No prose, no markdown fences.`;

interface EnrichResult {
  term: string;
  isProductOpportunity: boolean;
  product: string;
  category: string;
  audience: string;
  whyNow: string;
  sourcing: string;
}

function safeParseEnrichment(content: string): EnrichResult[] {
  // Strip markdown fences and grab the JSON array.
  const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const arr = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(arr) && arr.length) return arr;
    } catch { /* fall through to object salvage */ }
  }
  // Salvage: the array was truncated (token limit). Parse each flat {...} object we can.
  const objects = cleaned.match(/\{[^{}]*\}/g) || [];
  const results: EnrichResult[] = [];
  for (const obj of objects) {
    try {
      const parsed = JSON.parse(obj);
      if (parsed && typeof parsed.term === 'string') results.push(parsed);
    } catch { /* skip the partial/last object */ }
  }
  return results;
}

async function enrichTrends(raw: RawTrend[]): Promise<{ results: EnrichResult[]; provider: string }> {
  if (raw.length === 0) return { results: [], provider: 'none' };
  const userPayload = raw
    .map((t, i) => `${i + 1}. "${t.term}" (traffic: ${t.trafficLabel || 'n/a'}${t.context ? `, context: ${t.context}` : ''})`)
    .join('\n');

  const ai = await generateCard({
    system: ENRICH_SYSTEM,
    user: `Classify these ${raw.length} trending terms:\n${userPayload}`,
    maxTokens: 3600,
    temperature: 0.4,
  });

  const results = safeParseEnrichment(ai.content);
  return { results, provider: ai.provider };
}

// ── 4. EMIT — the public entry point: ranked Trend Opportunity Cards ────────────

export interface TrendRadarResult {
  cards: TrendCard[];
  scanned: number;
  productOpportunities: number;
  provider: string;
  source: string;
  geo: string;
  generatedAt: string;
}

export async function runTrendRadar(opts: { geo?: string; productsOnly?: boolean } = {}): Promise<TrendRadarResult> {
  const geo = opts.geo || 'US';
  // Cap to the strongest signals (multi-region first) so the AI batch fits its token budget.
  const raw = (await ingestMultiRegion(geo)).slice(0, 28);
  const generatedAt = new Date().toISOString();

  if (raw.length === 0) {
    return { cards: [], scanned: 0, productOpportunities: 0, provider: 'none', source: 'google-trends', geo, generatedAt };
  }

  const { results, provider } = await enrichTrends(raw);
  const enrichByTerm = new Map(results.map((r) => [r.term.toLowerCase().trim(), r]));

  const cards: TrendCard[] = raw.map((t, i) => {
    const e = enrichByTerm.get(t.term.toLowerCase().trim());
    const regionCount = t.regionCount || 1;
    const velocity = velocityScore(t.traffic, i, raw.length, regionCount);
    return {
      term: t.term,
      isProductOpportunity: e?.isProductOpportunity ?? false,
      product: e?.product || '',
      category: e?.category || 'Unknown',
      audience: e?.audience || '',
      whyNow: e?.whyNow || t.context || '',
      sourcing: e?.sourcing || '',
      velocity,
      stage: stageFromScore(velocity),
      trafficLabel: t.trafficLabel || '',
      regions: t.regions || [geo],
      regionCount,
      provider,
    };
  });

  // Rank: product opportunities first, then by velocity.
  cards.sort((a, b) => {
    if (a.isProductOpportunity !== b.isProductOpportunity) return a.isProductOpportunity ? -1 : 1;
    return b.velocity - a.velocity;
  });

  // Dedupe product opportunities by product name (highest-velocity wins — already first after sort).
  const seenProduct = new Set<string>();
  const deduped = cards.filter((c) => {
    if (!c.isProductOpportunity) return true;
    const key = (c.product || c.term).toLowerCase().trim();
    if (seenProduct.has(key)) return false;
    seenProduct.add(key);
    return true;
  });

  const finalCards = opts.productsOnly ? deduped.filter((c) => c.isProductOpportunity) : deduped;
  const productOpportunities = deduped.filter((c) => c.isProductOpportunity).length;

  // Persist the scan (best-effort) for history + future ML on what actually sold.
  await persistScan(finalCards, geo).catch((err) =>
    logger.warn('Trend scan persist failed', { error: (err as Error).message })
  );

  return {
    cards: finalCards,
    scanned: raw.length,
    productOpportunities,
    provider,
    source: 'google-trends',
    geo,
    generatedAt,
  };
}

// ── Cache — Google Trends + AI enrichment is shared across all users ────────────

let cache: { at: number; geo: string; result: TrendRadarResult } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — trends don't move faster than this

/** Cached radar run. Returns the full (unfiltered) result; callers slice/filter. */
export async function getTrendRadar(geo = 'US', force = false): Promise<TrendRadarResult> {
  if (!force && cache && cache.geo === geo && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.result;
  }
  const result = await runTrendRadar({ geo, productsOnly: false });
  if (result.cards.length > 0) cache = { at: Date.now(), geo, result };
  return result;
}

// ── Persistence — the feedback loop (what we flagged, to later learn what sold) ──

let tableEnsured = false;
async function ensureTrendTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS trend_scans (
        id BIGSERIAL PRIMARY KEY,
        term TEXT NOT NULL,
        is_product BOOLEAN DEFAULT FALSE,
        product TEXT,
        category TEXT,
        velocity INT,
        stage TEXT,
        geo TEXT,
        scanned_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      []
    );
    await query(`CREATE INDEX IF NOT EXISTS idx_trend_scans_time ON trend_scans(scanned_at DESC)`, []);
    tableEnsured = true;
  } catch (err) {
    logger.warn('ensureTrendTable failed', { error: (err as Error).message });
  }
}

async function persistScan(cards: TrendCard[], geo: string): Promise<void> {
  await ensureTrendTable();
  for (const c of cards) {
    await query(
      `INSERT INTO trend_scans (term, is_product, product, category, velocity, stage, geo)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [c.term, c.isProductOpportunity, c.product || null, c.category, c.velocity, c.stage, geo]
    );
  }
}
