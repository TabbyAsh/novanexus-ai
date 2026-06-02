/**
 * CommerceData Service — the real commerce data layer (Layer 5 / "The Fuel").
 *
 * Wraps the official eBay Browse API and caches comps into the `sold_comps`
 * table so that, over time, this becomes Nova's proprietary pricing dataset.
 *
 * Doctrine: NVX-DOCTRINE-001 Sprint Zero, Task T3.
 *   GET /sold-listings?query=X  ->  real eBay comp data (or honest 503).
 */

import express, { Request, Response, NextFunction } from 'express';
import { randomUUID, createHash } from 'crypto';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS, query } from '@nova/shared';
import { searchItems, ebayConfigured, ebayMeta, EbayComp } from './ebay-client';

const app = express();
const logger = createLogger('commercedata-service');
const PORT = process.env.PORT || SERVICE_PORTS.COMMERCEDATA;

// How long a cached comp set is considered fresh (default 6h).
const CACHE_TTL_MS = Number(process.env.COMMERCEDATA_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const MIN_CACHE_SAMPLES = 3;

app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  if (req.path !== '/health') {
    logger.info(`${req.method} ${req.path}`, { requestId });
  }
  next();
});

// ============================================================================
// Statistics — computed from real comps only. Never estimated.
// ============================================================================

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * sortedAsc.length)));
  return sortedAsc[idx];
}

function median(sortedAsc: number[]): number | null {
  if (sortedAsc.length === 0) return null;
  const mid = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 === 0
    ? (sortedAsc[mid - 1] + sortedAsc[mid]) / 2
    : sortedAsc[mid];
}

interface CompStats {
  count: number;
  median: number | null;
  low: number | null;   // 20th percentile
  high: number | null;  // 80th percentile
  min: number | null;
  max: number | null;
}

function computeStats(comps: EbayComp[]): CompStats {
  const prices = comps.map((c) => c.price).sort((a, b) => a - b);
  return {
    count: prices.length,
    median: median(prices),
    low: percentile(prices, 0.2),
    high: percentile(prices, 0.8),
    min: prices.length ? prices[0] : null,
    max: prices.length ? prices[prices.length - 1] : null,
  };
}

const queryHash = (q: string): string =>
  createHash('md5').update(q.trim().toLowerCase()).digest('hex');

// ============================================================================
// Cache layer (sold_comps table from migration 022)
// ============================================================================

async function readCache(hash: string): Promise<EbayComp[] | null> {
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const result = await query<{
      item_title: string;
      sold_price: string;
      condition: string | null;
      source_url: string | null;
      raw_json: EbayComp | null;
      scraped_at: string;
    }>(
      `SELECT item_title, sold_price, condition, source_url, raw_json, scraped_at
       FROM sold_comps
       WHERE query_hash = $1 AND scraped_at >= $2
       ORDER BY scraped_at DESC
       LIMIT 50`,
      [hash, cutoff]
    );

    if (result.rows.length < MIN_CACHE_SAMPLES) return null;

    return result.rows.map((r) => {
      // Prefer the full raw_json snapshot; fall back to columns.
      if (r.raw_json && typeof r.raw_json === 'object') return r.raw_json;
      return {
        title: r.item_title,
        price: parseFloat(r.sold_price),
        currency: 'USD',
        condition: r.condition,
        itemUrl: r.source_url ?? '',
        imageUrl: null,
        seller: null,
        listingType: 'ACTIVE' as const,
        buyingOptions: [],
        legacyItemId: null,
        fetchedAt: r.scraped_at,
      };
    });
  } catch (error) {
    logger.warn('sold_comps cache read failed (continuing without cache)', {
      error: (error as Error).message,
    });
    return null;
  }
}

async function writeCache(hash: string, searchQuery: string, comps: EbayComp[]): Promise<void> {
  if (comps.length === 0) return;
  try {
    for (const c of comps) {
      await query(
        `INSERT INTO sold_comps
           (query_hash, search_query, item_title, sold_price, condition, source, source_url, raw_json)
         VALUES ($1, $2, $3, $4, $5, 'ebay-browse', $6, $7::jsonb)`,
        [hash, searchQuery, c.title, c.price, c.condition, c.itemUrl, JSON.stringify(c)]
      );
    }
  } catch (error) {
    // Caching is best-effort; a DB hiccup must not break the real result.
    logger.warn('sold_comps cache write failed (continuing)', {
      error: (error as Error).message,
    });
  }
}

// ============================================================================
// Routes
// ============================================================================

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: ebayConfigured ? 'ok' : 'degraded',
    service: 'commercedata',
    data_sources: [
      {
        name: 'eBay Browse API',
        status: ebayConfigured ? 'ok' : 'down',
        lastChecked: new Date().toISOString(),
        detail: ebayConfigured
          ? `${ebayMeta.env} / ${ebayMeta.marketplaceId}`
          : 'EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not configured',
      },
    ],
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /sold-listings?query=X&limit=20&condition=USED&fresh=true
 * Returns real eBay comps (active asking prices) + computed stats.
 * Honest 503 when the data source is not configured.
 */
app.get('/sold-listings', async (req: Request, res: Response) => {
  const q = (req.query.query as string)?.trim();
  if (!q) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'query parameter is required' },
    });
  }

  if (!ebayConfigured) {
    // No Fake Numbers: if we can't get real data, we say so.
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'COMMERCEDATA_UNAVAILABLE',
        message:
          'eBay data source not configured. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.',
      },
    });
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const conditions = (req.query.condition as string) || undefined;
  const forceFresh = req.query.fresh === 'true';
  const hash = queryHash(`${q}|${conditions ?? ''}`);

  let comps: EbayComp[] | null = forceFresh ? null : await readCache(hash);
  let fromCache = true;

  if (!comps) {
    fromCache = false;
    comps = await searchItems(q, { limit, conditions });
    if (comps.length > 0) {
      await writeCache(hash, q, comps);
    }
  }

  if (!comps || comps.length === 0) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'NO_COMPS_FOUND',
        message: `No eBay listings found for "${q}".`,
      },
      data: { query: q, listings: [], stats: computeStats([]) },
    });
  }

  res.json({
    success: true,
    data: {
      query: q,
      listings: comps,
      stats: computeStats(comps),
      provenance: {
        source: 'eBay Browse API',
        listingType: 'ACTIVE',
        note: 'Prices are current active-listing asking prices from the official eBay Browse API, not completed-sale prices.',
        fromCache,
        marketplace: ebayMeta.marketplaceId,
        fetchedAt: new Date().toISOString(),
      },
    },
  });
});

// ============================================================================
// Start
// ============================================================================

app.listen(PORT, () => {
  logger.info(`CommerceData service started on port ${PORT}`, {
    ebayConfigured,
    env: ebayMeta.env,
  });
});

export default app;
