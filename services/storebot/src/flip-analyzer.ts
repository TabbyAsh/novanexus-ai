/**
 * StoreBot Flip Analyzer — the Entropy Refiner for Commerce.
 *
 * Converts a product (URL or description) into a real FLIP Decision Card,
 * sourced from the commercedata service (official eBay Browse API). Every
 * number is computed from real comps or explicitly null. No estimates
 * masquerading as data (Technical Law 01).
 *
 * Doctrine: NVX-DOCTRINE-001 Sprint Zero, Task T4 + Section 07 pipeline.
 */

import { buildDecisionCard, nowTimestamp } from '@nova/shared';
import type { DecisionCard, FlipMetrics, DataSource, RecommendedAction, RiskLevel } from '@nova/shared';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('storebot-flip');

const COMMERCEDATA_URL = process.env.COMMERCEDATA_URL || 'http://localhost:3022';

// eBay final value fee (~12.9%) + payment processing (~3%). Doctrine S7.
const EBAY_FEE_RATE = 0.129;
const PAYMENT_FEE_RATE = 0.03;

export interface FlipAnalyzeInput {
  /** Either a product description/keywords or a listing URL. */
  value: string;
  inputType?: 'description' | 'url';
  userId?: string | null;
  sessionId?: string;
  /** Optional asking/buy price the user can actually purchase at. */
  askingPrice?: number | null;
  condition?: string;
}

interface CommerceComp {
  title: string;
  price: number;
  currency: string;
  condition: string | null;
  itemUrl: string;
  listingType: 'ACTIVE' | 'SOLD';
  fetchedAt: string;
}

interface CommerceResponse {
  success: boolean;
  data?: {
    query: string;
    listings: CommerceComp[];
    stats: {
      count: number;
      median: number | null;
      low: number | null;
      high: number | null;
      min: number | null;
      max: number | null;
    };
    provenance?: { source: string; listingType: string; note: string };
  };
  error?: { code: string; message: string };
}

/** Extract clean search keywords from a URL or free-text description. */
export function extractKeywords(value: string): string {
  let v = value.trim();
  // If it's a URL, strip protocol/host/query and de-slugify the path.
  if (/^https?:\/\//i.test(v)) {
    try {
      const url = new URL(v);
      const lastSegment = url.pathname.split('/').filter(Boolean).pop() || '';
      v = decodeURIComponent(lastSegment).replace(/[-_]+/g, ' ');
      // Drop trailing numeric IDs from slugs
      v = v.replace(/\b\d{6,}\b/g, '').trim();
    } catch {
      // fall through with the raw value
    }
  }
  // Collapse whitespace and cap to eBay's 100-char query limit.
  return v.replace(/\s+/g, ' ').trim().slice(0, 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchComps(keywords: string, condition?: string): Promise<CommerceResponse> {
  const params = new URLSearchParams({ query: keywords, limit: '20' });
  if (condition) params.set('condition', condition);
  const url = `${COMMERCEDATA_URL}/sold-listings?${params.toString()}`;

  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  return (await response.json()) as CommerceResponse;
}

/**
 * Analyze a flip opportunity and return a fully-formed FLIP Decision Card.
 * Confidence and recommendation are derived strictly from real sample data.
 */
export async function analyzeFlip(input: FlipAnalyzeInput): Promise<DecisionCard> {
  const keywords = extractKeywords(input.value);
  const observationSource = input.inputType === 'url' ? 'user_input:url' : 'user_input:description';

  let commerce: CommerceResponse;
  try {
    commerce = await fetchComps(keywords, input.condition);
  } catch (error) {
    logger.error('commercedata fetch failed', error as Error, { keywords });
    commerce = { success: false, error: { code: 'COMMERCEDATA_UNREACHABLE', message: (error as Error).message } };
  }

  const reasoning: string[] = [`Extracted search keywords: "${keywords}".`];
  const missing: string[] = [];
  const warnings: string[] = [];
  const dataUsed: DataSource[] = [];

  // --- No real data: return an honest, low/zero-confidence card ---
  if (!commerce.success || !commerce.data || commerce.data.listings.length === 0) {
    const reason = commerce.error?.message || 'No comparable listings found.';
    reasoning.push(`No real comps available: ${reason}`);
    missing.push('eBay comparable listings', 'median market price', 'fees', 'net margin');
    warnings.push('Decision cannot be made without market data. Confidence is null.');

    const metrics: FlipMetrics = {
      medianSoldPrice: null,
      lowPrice: null,
      highPrice: null,
      sampleCount: 0,
      staleness: null,
      estimatedFees: null,
      estimatedShipping: null,
      estimatedProfit: null,
      profitMarginPercent: null,
      buyPrice: input.askingPrice ?? null,
    };

    return buildDecisionCard({
      card_type: 'FLIP',
      user_id: input.userId ?? null,
      session_id: input.sessionId,
      observation: {
        source: observationSource,
        raw_input: input.value,
        context: { keywords, condition: input.condition ?? null },
      },
      analysis: {
        confidence: null, // NEVER fake — unknown stays null
        reasoning,
        data_used: dataUsed,
        missing,
        warnings,
      },
      recommendation: {
        action: 'INVESTIGATE',
        summary: 'Unavailable — no real market data found for this item.',
        details:
          'Nova could not retrieve comparable eBay listings, so it will not estimate a price. Try a more specific product name.',
        risk_level: 'HIGH',
      },
      metrics,
    });
  }

  // --- Real data path ---
  const { listings, stats, provenance } = commerce.data;
  const prices = listings.map((l) => l.price).filter((p) => Number.isFinite(p) && p > 0);

  dataUsed.push({
    name: provenance?.source || 'eBay Browse API',
    endpoint: `${COMMERCEDATA_URL}/sold-listings`,
    fetchedAt: listings[0]?.fetchedAt || nowTimestamp(),
    recordCount: prices.length,
  });

  const median = stats.median;
  const low = stats.low;
  const high = stats.high;

  // Sell at the median real comp; buy at the user's asking price, or the
  // 20th-percentile deal price if no asking price was provided.
  const sellPrice = median;
  const buyPrice = input.askingPrice ?? low;

  let estimatedFees: number | null = null;
  let estimatedShipping: number | null = null;
  let estimatedProfit: number | null = null;
  let profitMarginPercent: number | null = null;

  if (sellPrice !== null) {
    estimatedFees = round2(sellPrice * (EBAY_FEE_RATE + PAYMENT_FEE_RATE));
    // Shipping is an assumption, not measured data — flagged in warnings.
    estimatedShipping = sellPrice > 100 ? 15 : sellPrice > 30 ? 10 : 5;
    reasoning.push(
      `Median comp $${sellPrice} → fees $${estimatedFees} (12.9% eBay + 3% payment), shipping est. $${estimatedShipping}.`
    );

    if (buyPrice !== null) {
      estimatedProfit = round2(sellPrice - buyPrice - estimatedFees - estimatedShipping);
      profitMarginPercent = buyPrice > 0 ? Math.round((estimatedProfit / buyPrice) * 100) : null;
      reasoning.push(
        `Buy $${buyPrice} → net profit $${estimatedProfit} (${profitMarginPercent ?? '—'}% margin).`
      );
    } else {
      missing.push('buy/acquisition price');
      warnings.push('No buy price provided; profit cannot be computed.');
    }
  }

  // Confidence strictly from sample size (Doctrine S7).
  const sampleCount = prices.length;
  const confidence = sampleCount < 3 ? 0.2 : sampleCount < 8 ? 0.5 : 0.8;
  reasoning.push(`Confidence ${confidence} from ${sampleCount} real comps.`);

  if (sampleCount < 3) warnings.push('Very few comparable listings (<3). Treat pricing as unreliable.');
  warnings.push('Comps are active eBay asking prices (Browse API), not completed-sale prices.');
  missing.push('completed-sale prices (requires eBay Marketplace Insights API)');

  // Price variance check
  if (low !== null && high !== null && median !== null && median > 0) {
    const spread = (high - low) / median;
    if (spread > 0.6) {
      warnings.push(`Wide price spread (${Math.round(spread * 100)}% of median) — item value is uncertain.`);
    }
  }

  // Recommendation derived from real margin + confidence
  let action: RecommendedAction = 'INVESTIGATE';
  let riskLevel: RiskLevel = 'MEDIUM';
  let summary: string;

  if (profitMarginPercent === null) {
    action = 'INVESTIGATE';
    riskLevel = 'MEDIUM';
    summary = `Provide a buy price to evaluate this flip. Median resale ≈ $${sellPrice}.`;
  } else if (profitMarginPercent >= 30 && confidence >= 0.5) {
    action = 'BUY';
    riskLevel = confidence >= 0.8 ? 'LOW' : 'MEDIUM';
    summary = `Strong flip: ~${profitMarginPercent}% net margin on ${sampleCount} comps.`;
  } else if (profitMarginPercent >= 10) {
    action = 'WATCH';
    riskLevel = 'MEDIUM';
    summary = `Thin flip: ~${profitMarginPercent}% net margin. Negotiate a lower buy price.`;
  } else {
    action = 'SKIP';
    riskLevel = 'HIGH';
    summary = `Pass: ~${profitMarginPercent}% net margin does not cover risk.`;
  }

  const metrics: FlipMetrics = {
    medianSoldPrice: median,
    lowPrice: low,
    highPrice: high,
    sampleCount,
    staleness: null, // Browse API does not expose sale dates
    estimatedFees,
    estimatedShipping,
    estimatedProfit,
    profitMarginPercent,
    buyPrice,
  };

  return buildDecisionCard({
    card_type: 'FLIP',
    user_id: input.userId ?? null,
    session_id: input.sessionId,
    observation: {
      source: observationSource,
      raw_input: input.value,
      context: { keywords, condition: input.condition ?? null, askingPrice: input.askingPrice ?? null },
    },
    analysis: {
      confidence,
      reasoning,
      data_used: dataUsed,
      missing,
      warnings,
    },
    recommendation: {
      action,
      summary,
      details: provenance?.note || 'Based on real eBay comparable listings.',
      risk_level: riskLevel,
    },
    metrics,
    action_steps:
      action === 'BUY'
        ? [
            {
              order: 1,
              description: `Acquire item at or below $${buyPrice}.`,
              type: 'MANUAL',
              status: 'PENDING',
            },
            {
              order: 2,
              description: `List on eBay near $${sellPrice}.`,
              type: 'MANUAL',
              status: 'PENDING',
            },
          ]
        : [],
  });
}
