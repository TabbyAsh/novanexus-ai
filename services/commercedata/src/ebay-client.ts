/**
 * eBay Browse API client — the real commerce data layer.
 *
 * Uses the official eBay Browse API (OAuth 2.0 client-credentials flow).
 * This replaces fragile HTML scraping with a supported, rate-limited API.
 *
 * HONESTY NOTE (Technical Law 01 — No Fake Numbers):
 * The Browse API `item_summary/search` returns ACTIVE listings (asking
 * prices), not completed/sold prices. True sold comps require eBay's
 * restricted Marketplace Insights API. We therefore label every comp with
 * its real `listingType` ('ACTIVE') and never claim an asking price is a
 * sale price. When Marketplace Insights access is granted, set
 * EBAY_INSIGHTS=true and the sold endpoint can be swapped in here.
 */

import { createLogger } from '@nova/telemetry';

const logger = createLogger('commercedata-ebay');

const EBAY_ENV = (process.env.EBAY_ENV || 'production').toLowerCase();
const BASE_URL =
  EBAY_ENV === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

const CLIENT_ID = process.env.EBAY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || '';
const MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || 'EBAY_US';
const OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope';

/** True only when real credentials are present. Drives honest 503s elsewhere. */
export const ebayConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);

export interface EbayComp {
  title: string;
  price: number;
  currency: string;
  condition: string | null;
  itemUrl: string;
  imageUrl: string | null;
  seller: string | null;
  /** Always 'ACTIVE' for Browse API — these are asking prices, not sales. */
  listingType: 'ACTIVE' | 'SOLD';
  buyingOptions: string[];
  legacyItemId: string | null;
  fetchedAt: string;
}

interface TokenCache {
  token: string | null;
  expiresAt: number; // epoch ms
}

let tokenCache: TokenCache = { token: null, expiresAt: 0 };

/**
 * Get a cached application access token, minting a new one when needed.
 * Returns null if credentials are not configured or the mint fails.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!ebayConfigured) return null;

  // Reuse cached token with a 60s safety buffer
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  try {
    const response = await fetch(`${BASE_URL}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(OAUTH_SCOPE)}`,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      logger.error(`eBay OAuth token error ${response.status}`, undefined, { detail });
      return null;
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    logger.info('Minted new eBay application access token', { expiresIn: data.expires_in });
    return tokenCache.token;
  } catch (error) {
    logger.error('eBay OAuth token request failed', error as Error);
    return null;
  }
}

interface EbayItemSummary {
  title?: string;
  price?: { value?: string; currency?: string };
  condition?: string;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  seller?: { username?: string };
  buyingOptions?: string[];
  legacyItemId?: string;
}

export interface SearchOptions {
  limit?: number;
  /** eBay condition filter, e.g. 'NEW', 'USED'. Optional. */
  conditions?: string;
  /** Restrict to a category id. Optional. */
  categoryId?: string;
}

/**
 * Search active eBay listings for the given query via the Browse API.
 * Returns real comps (asking prices) or an empty array on failure.
 */
export async function searchItems(query: string, opts: SearchOptions = {}): Promise<EbayComp[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const params = new URLSearchParams({ q: query, limit: String(limit) });

  const filters: string[] = [];
  if (opts.conditions) filters.push(`conditions:{${opts.conditions}}`);
  if (filters.length > 0) params.set('filter', filters.join(','));
  if (opts.categoryId) params.set('category_ids', opts.categoryId);

  const url = `${BASE_URL}/buy/browse/v1/item_summary/search?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      logger.warn(`eBay Browse API error ${response.status} for "${query}"`, { detail });
      return [];
    }

    const data = (await response.json()) as { itemSummaries?: EbayItemSummary[] };
    const summaries = data.itemSummaries ?? [];
    const now = new Date().toISOString();

    const comps: EbayComp[] = [];
    for (const item of summaries) {
      const value = item.price?.value ? parseFloat(item.price.value) : NaN;
      if (!item.title || !Number.isFinite(value) || value <= 0) continue;

      comps.push({
        title: item.title,
        price: value,
        currency: item.price?.currency ?? 'USD',
        condition: item.condition ?? null,
        itemUrl: item.itemWebUrl ?? '',
        imageUrl: item.image?.imageUrl ?? null,
        seller: item.seller?.username ?? null,
        listingType: 'ACTIVE',
        buyingOptions: item.buyingOptions ?? [],
        legacyItemId: item.legacyItemId ?? null,
        fetchedAt: now,
      });
    }

    logger.info(`eBay Browse: ${comps.length} comps for "${query}"`);
    return comps;
  } catch (error) {
    logger.error(`eBay Browse search failed for "${query}"`, error as Error);
    return [];
  }
}

export const ebayMeta = {
  env: EBAY_ENV,
  baseUrl: BASE_URL,
  marketplaceId: MARKETPLACE_ID,
  configured: ebayConfigured,
};
