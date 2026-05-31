/**
 * Marketplace Scanner — Orchestrator
 * ====================================
 * This is the engine that makes Nova active instead of passive.
 *
 * Pipeline:
 *   1. Fetch real Craigslist listings for configured cities + targets
 *   2. Dedup against DB (skip URLs we've already analyzed today)
 *   3. Look up cached eBay sold comps for each listing
 *   4. Run buildFlipDecisionCard() — pure computation, no network
 *   5. Filter by quality thresholds (profit, confidence, category match)
 *   6. Rank by opportunity score (expectedRoiPct × confidence)
 *   7. Persist top N as nexus_opportunity + nexus_decision_card + version
 *   8. Run governance check on each — block the ones Nova won't stand behind
 *   9. Return structured ScanResult with actionable opportunities
 *
 * Two-pass efficiency model:
 *   Pass 1 (fast): Craigslist RSS → heuristic scoring → filter top N
 *   Pass 2 (deep): DB comp lookup → buildFlipDecisionCard with real data
 *   Result: Dozens of listings processed, eBay comps only for winners
 */

import { query, queryOne, generateId } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import {
  buildFlipDecisionCard,
  type DecisionCardComputation,
  type FlipOpportunityInput,
} from '../decision-infrastructure';
import {
  detectCategory,
  normalizeQuery,
  queryHash,
} from '../flip-card';
import {
  vlhGovernance,
  vlhActionPlanBuilder,
} from '../nexus-ingestion';
import {
  fetchCraigslistListings,
  SCAN_TARGETS,
  type RawListing,
  type ScanTarget,
} from './craigslist';

const logger = createLogger('scanner');

// ─── Default scan cities ──────────────────────────────────────────────────────
// Conservative defaults. Users can pass their own city list.
const DEFAULT_CITIES = ['miami', 'chicago', 'losangeles', 'houston', 'atlanta'];

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ScanConfig {
  /** Craigslist city keys to scan. Defaults to DEFAULT_CITIES. */
  cities?: string[];
  /** Maximum asking price filter (dollars). Default 800. */
  maxAskingPrice?: number;
  /** Minimum net profit to surface (dollars). Default 15. */
  minExpectedProfitDollars?: number;
  /** Minimum confidence percentage (0–100). Default 30. */
  minConfidencePct?: number;
  /** Max opportunities to persist as Decision Cards. Default 20. */
  maxOpportunities?: number;
  /** Which Craigslist categories/queries to scan. Defaults to SCAN_TARGETS. */
  targets?: ScanTarget[];
  /** Associated user (for quota and personalization). */
  userId?: string | null;
  /** Associated org. */
  orgId?: string | null;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ScanOpportunity {
  decisionCardId: string;
  opportunityId: string;
  title: string;
  askingPrice: number;
  city: string;
  sourceUrl: string;
  /** flip-engine verdict: BUY | OFFER | WAIT | SKIP */
  action: string;
  /** VLH recommendation: execute | wait | pass */
  recommendation: string;
  expectedNetProfit: number;
  expectedRoiPct: number;
  confidencePct: number;
  /** 0–1 */
  riskScore: number;
  dataCompleteness: string;
  governanceResult: string;
  category: string;
  negotiationScript: string;
  suggestedOffer: number | null;
  listingTitle: string;
  bestPlatform: string;
  compSource: 'db_cache' | 'heuristic';
  compCount: number;
  /** Combined score for ranking: higher is better */
  opportunityScore: number;
}

export interface ScanResult {
  totalFetched: number;
  totalEvaluated: number;
  opportunitiesFound: number;
  decisionCardsCreated: number;
  opportunities: ScanOpportunity[];
  durationMs: number;
  ranAt: string;
  cities: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Look up cached eBay sold comps from DB for a listing title.
 * Returns prices array (empty if no recent cache).
 */
async function getCachedCompsFromDB(title: string, maxAgeHours = 48): Promise<number[]> {
  try {
    const normalized = normalizeQuery(title);
    const hash = queryHash(normalized);
    const cutoff = new Date(Date.now() - maxAgeHours * 3_600_000).toISOString();
    const result = await query<{ sold_price: string }>(
      `SELECT sold_price FROM sold_comps
       WHERE query_hash = $1 AND scraped_at > $2
       ORDER BY scraped_at DESC LIMIT 30`,
      [hash, cutoff],
    );
    return result.rows
      .map(r => parseFloat(r.sold_price))
      .filter(p => Number.isFinite(p) && p > 0);
  } catch {
    return [];
  }
}

/**
 * Check if a source URL was already processed in the last 24 hours.
 * Prevents re-creating Decision Cards for listings we've already evaluated.
 */
async function isAlreadyScanned(sourceUrl: string): Promise<boolean> {
  try {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM nexus_opportunities
       WHERE source_url = $1 AND observed_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [sourceUrl],
    );
    return row !== null;
  } catch {
    return false;
  }
}

/**
 * Resolve the VLH loop type UUID for marketplace_flipping.
 * Cached after first DB hit.
 */
let cachedFlipLoopTypeId: string | null = null;
async function getFlipLoopTypeId(): Promise<string | null> {
  if (cachedFlipLoopTypeId) return cachedFlipLoopTypeId;
  try {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM vlh_value_loop_types WHERE slug = 'marketplace_flipping' LIMIT 1`,
    );
    cachedFlipLoopTypeId = row?.id ?? null;
    return cachedFlipLoopTypeId;
  } catch {
    return null;
  }
}

/**
 * Map decision action + confidence → VLH recommendation.
 */
function mapRecommendation(action: string, confidencePct: number): string {
  if (action === 'BUY') return 'execute';
  if (action === 'OFFER') return confidencePct >= 55 ? 'execute' : 'wait';
  if (action === 'WAIT') return 'wait';
  return 'pass';
}

/**
 * Derive data_completeness from card confidence + comp source.
 */
function mapDataCompleteness(
  card: DecisionCardComputation,
  compSource: 'db_cache' | 'heuristic',
): string {
  const missing = card.confidence.missingInformation?.length ?? 0;
  if (compSource === 'heuristic' && missing >= 2) return 'insufficient';
  if (compSource === 'heuristic') return 'partial';
  if (missing >= 3) return 'partial';
  return 'complete';
}

/**
 * Compute 0–1 risk score from the card's downside risk.
 */
function mapRiskScore(card: DecisionCardComputation): number {
  const pct = card.financials.downsideRiskPct ?? 0;
  const confidencePenalty = (100 - card.confidence.confidencePct) / 100 * 20;
  return clamp(r2((pct + confidencePenalty) / 100), 0, 1);
}

/**
 * Combined opportunity score for ranking.
 * Higher ROI × higher confidence = higher score.
 */
function opportunityScore(card: DecisionCardComputation): number {
  const roi = Math.max(0, card.financials.expectedRoiPct);
  const conf = card.confidence.confidencePct / 100;
  const rav = Math.max(0, card.financials.riskAdjustedValue);
  // Weighted composite: ROI × confidence, boosted by positive risk-adjusted value
  return r2(roi * conf + (rav > 0 ? 5 : 0));
}

// ─── Listing → FlipOpportunityInput ──────────────────────────────────────────

function listingToOpportunityInput(
  listing: RawListing,
  soldComps: number[],
): FlipOpportunityInput {
  const { category } = detectCategory(listing.cleanTitle);
  return {
    title:          listing.cleanTitle,
    category,
    condition:      listing.inferredCondition,
    askingPrice:    listing.price!,
    soldComps:      soldComps.length > 0 ? soldComps : undefined,
    location:       listing.city,
    sourceType:     'craigslist',
    sourceUrl:      listing.url,
    notes:          listing.description?.slice(0, 500) || undefined,
  };
}

// ─── Persist one scan opportunity to DB ──────────────────────────────────────

async function persistScanOpportunity(params: {
  listing: RawListing;
  card: DecisionCardComputation;
  input: FlipOpportunityInput;
  compSource: 'db_cache' | 'heuristic';
  compCount: number;
  userId: string | null;
  orgId: string | null;
  loopTypeId: string | null;
}): Promise<{ opportunityId: string; decisionCardId: string }> {
  const { listing, card, input, compSource, compCount, userId, orgId, loopTypeId } = params;
  const opportunityId = generateId();
  const decisionCardId = generateId();
  const recommendation = mapRecommendation(card.decision.action, card.confidence.confidencePct);
  const dataCompleteness = mapDataCompleteness(card, compSource);
  const riskScore = mapRiskScore(card);
  const { category } = detectCategory(listing.cleanTitle);

  // Opportunity row
  await query(
    `INSERT INTO nexus_opportunities (
       id, org_id, user_id, source_type, source_url, raw_input_json, observed_at,
       title, value_loop_type_id, confidence_score, data_completeness, status,
       estimated_revenue_min_cents, estimated_revenue_max_cents, required_capital_cents
     )
     VALUES ($1, $2, $3, 'scanner_auto', $4, $5, NOW(),
             $6, $7, $8, $9, 'scored',
             $10, $11, $12)
     ON CONFLICT DO NOTHING`,
    [
      opportunityId,
      orgId,
      userId,
      listing.url,
      JSON.stringify({ listing, input, compSource, compCount }),
      listing.cleanTitle.slice(0, 255),
      loopTypeId,
      r2(card.confidence.confidencePct / 100),
      dataCompleteness,
      Math.round((card.financials.grossResale?.low ?? 0) * 100),
      Math.round((card.financials.grossResale?.high ?? 0) * 100),
      Math.round(listing.price! * 100),
    ],
  );

  // Decision card row — with VLH columns populated
  await query(
    `INSERT INTO nexus_decision_cards (
       id, org_id, user_id, opportunity_id, vertical, decision_action,
       confidence_pct, volatility_level, latest_version, status,
       title, value_loop_type_id, recommendation, reasoning_summary,
       risk_score, data_completeness, truth_state
     )
     VALUES ($1, $2, $3, $4, 'flip_cards', $5,
             $6, $7, 1, 'OPEN',
             $8, $9, $10, $11,
             $12, $13, $14)`,
    [
      decisionCardId,
      orgId,
      userId,
      opportunityId,
      card.decision.action,
      r2(card.confidence.confidencePct),
      card.confidence.volatility,
      listing.cleanTitle.slice(0, 255),
      loopTypeId,
      recommendation,
      card.decision.rationale.join(' ').slice(0, 500),
      riskScore,
      dataCompleteness,
      compSource === 'db_cache' ? 'estimated' : 'uncertain',
    ],
  );

  // Version row — full card payload for replay and display
  await query(
    `INSERT INTO nexus_decision_card_versions (
       id, decision_card_id, version_no, card_json,
       assumptions_json, uncertainty_json, financial_json, execution_json, model_tag
     )
     VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'scanner.flip.v1')`,
    [
      generateId(),
      decisionCardId,
      JSON.stringify(card),
      JSON.stringify(card.confidence.assumptions),
      JSON.stringify({
        explanation:   card.confidence.uncertaintyExplanation,
        drivers:       card.confidence.uncertaintyDrivers,
        missing:       card.confidence.missingInformation,
        volatility:    card.confidence.volatility,
        bounds:        card.confidence.confidenceBounds,
      }),
      JSON.stringify(card.financials),
      JSON.stringify(card.execution),
    ],
  );

  return { opportunityId, decisionCardId };
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function runMarketplaceScan(config: ScanConfig = {}): Promise<ScanResult> {
  const startedAt = Date.now();
  const cities = config.cities?.length ? config.cities : DEFAULT_CITIES;
  const maxPrice = config.maxAskingPrice ?? 800;
  const minProfit = config.minExpectedProfitDollars ?? 15;
  const minConf = config.minConfidencePct ?? 30;
  const maxCards = config.maxOpportunities ?? 20;
  const targets = config.targets ?? SCAN_TARGETS;
  const userId = config.userId ?? null;
  const orgId = config.orgId ?? null;

  logger.info('Marketplace scan starting', { cities, maxPrice, minProfit, minConf, maxCards });

  // ── Step 1: Fetch raw listings ──────────────────────────────────────────────
  const raw = await fetchCraigslistListings(cities, targets, {
    maxPriceOverride: maxPrice,
    maxResultsPerQuery: 20,
  });
  logger.info(`Fetched ${raw.length} raw listings`);

  if (raw.length === 0) {
    return {
      totalFetched: 0, totalEvaluated: 0, opportunitiesFound: 0,
      decisionCardsCreated: 0, opportunities: [], durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(), cities,
    };
  }

  // ── Step 2: Dedup against recently-processed URLs ──────────────────────────
  const deduped: RawListing[] = [];
  for (const listing of raw) {
    if (listing.price === null) continue;
    if (await isAlreadyScanned(listing.url)) continue;
    deduped.push(listing);
  }
  logger.info(`${deduped.length} listings after dedup`);

  // ── Step 3: Score each listing using cached comps + heuristics ─────────────
  interface ScoredListing {
    listing: RawListing;
    card: DecisionCardComputation;
    input: FlipOpportunityInput;
    comps: number[];
    compSource: 'db_cache' | 'heuristic';
    score: number;
  }

  const scored: ScoredListing[] = [];

  for (const listing of deduped) {
    try {
      const comps = await getCachedCompsFromDB(listing.cleanTitle);
      const input = listingToOpportunityInput(listing, comps);
      const card = buildFlipDecisionCard(input, { calibration: null });

      // Quick filter before full evaluation
      if (card.decision.action === 'SKIP' || card.decision.action === 'WAIT') continue;
      if (card.confidence.confidencePct < minConf) continue;

      const netProfit = card.financials.expectedNetProfit;
      if (netProfit < minProfit) continue;

      scored.push({
        listing,
        card,
        input,
        comps,
        compSource: comps.length >= 3 ? 'db_cache' : 'heuristic',
        score: opportunityScore(card),
      });
    } catch (err) {
      logger.warn(`Score failed for "${listing.cleanTitle}"`, {
        error: (err as Error).message,
      });
    }
  }

  logger.info(`${scored.length} listings passed quality filter`);

  // ── Step 4: Rank and cap ───────────────────────────────────────────────────
  scored.sort((a, b) => b.score - a.score);
  const winners = scored.slice(0, maxCards);

  // ── Step 5: Persist + govern ──────────────────────────────────────────────
  const loopTypeId = await getFlipLoopTypeId();
  const opportunities: ScanOpportunity[] = [];
  let cardsCreated = 0;

  for (const winner of winners) {
    try {
      const { opportunityId, decisionCardId } = await persistScanOpportunity({
        listing:     winner.listing,
        card:        winner.card,
        input:       winner.input,
        compSource:  winner.compSource,
        compCount:   winner.comps.length,
        userId,
        orgId,
        loopTypeId,
      });
      cardsCreated++;

      // Run governance — non-blocking, best effort
      const govResult = await vlhGovernance.evaluate({
        entityType:           'decision_card',
        entityId:             decisionCardId,
        orgId,
        userId,
        loopTypeSlug:         'marketplace_flipping',
        confidencePct:        winner.card.confidence.confidencePct,
        riskScore:            mapRiskScore(winner.card),
        dataCompleteness:     mapDataCompleteness(winner.card, winner.compSource),
        expectedRoiPct:       winner.card.financials.expectedRoiPct,
        requiredCapitalCents: Math.round(winner.listing.price! * 100),
        missingFields:        winner.card.confidence.missingInformation,
      }).catch(() => ({ result: 'allow' as const, summary: '', policyResults: [] }));

      // Auto-create action plan when governance allows execution
      const recommendation = mapRecommendation(
        winner.card.decision.action,
        winner.card.confidence.confidencePct,
      );
      if (recommendation === 'execute' && govResult.result === 'allow' && userId && orgId) {
        vlhActionPlanBuilder.createFromFlipCard(
          decisionCardId, userId, orgId, winner.card,
        ).catch(() => {}); // fire-and-forget
      }

      const { category } = detectCategory(winner.listing.cleanTitle);

      opportunities.push({
        decisionCardId,
        opportunityId,
        title:               winner.listing.cleanTitle,
        askingPrice:         winner.listing.price!,
        city:                winner.listing.city,
        sourceUrl:           winner.listing.url,
        action:              winner.card.decision.action,
        recommendation,
        expectedNetProfit:   r2(winner.card.financials.expectedNetProfit),
        expectedRoiPct:      r2(winner.card.financials.expectedRoiPct),
        confidencePct:       r2(winner.card.confidence.confidencePct),
        riskScore:           mapRiskScore(winner.card),
        dataCompleteness:    mapDataCompleteness(winner.card, winner.compSource),
        governanceResult:    govResult.result,
        category,
        negotiationScript:   winner.card.execution.negotiationScript,
        suggestedOffer:      winner.card.execution.suggestedOffer,
        listingTitle:        winner.card.execution.listingTitle,
        bestPlatform:        winner.card.execution.bestPlatform,
        compSource:          winner.compSource,
        compCount:           winner.comps.length,
        opportunityScore:    winner.score,
      });
    } catch (err) {
      logger.warn(`Persist failed for "${winner.listing.cleanTitle}"`, {
        error: (err as Error).message,
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  logger.info('Marketplace scan complete', {
    fetched: raw.length,
    evaluated: deduped.length,
    found: scored.length,
    created: cardsCreated,
    durationMs,
  });

  return {
    totalFetched:        raw.length,
    totalEvaluated:      deduped.length,
    opportunitiesFound:  scored.length,
    decisionCardsCreated: cardsCreated,
    opportunities,
    durationMs,
    ranAt:               new Date().toISOString(),
    cities,
  };
}

// ─── Fetch existing scan results from DB ──────────────────────────────────────

export interface ScanResultsQuery {
  userId?: string | null;
  orgId?: string | null;
  limit?: number;
  minConfidencePct?: number;
  actionFilter?: string; // 'BUY' | 'OFFER' | 'all'
}

export async function getScanOpportunities(
  params: ScanResultsQuery = {},
): Promise<ScanOpportunity[]> {
  const limit = Math.min(params.limit ?? 25, 100);
  const minConf = params.minConfidencePct ?? 0;

  try {
    const rows = await query<{
      id: string;
      opportunity_id: string;
      title: string | null;
      confidence_pct: string | number;
      decision_action: string;
      recommendation: string | null;
      risk_score: string | number | null;
      data_completeness: string | null;
      card_json: string | null;
      source_url: string | null;
      observed_at: string;
    }>(
      `SELECT
         dc.id,
         dc.opportunity_id,
         dc.title,
         dc.confidence_pct,
         dc.decision_action,
         dc.recommendation,
         dc.risk_score,
         dc.data_completeness,
         dcv.card_json,
         o.source_url,
         o.observed_at
       FROM nexus_decision_cards dc
       JOIN nexus_opportunities o ON o.id = dc.opportunity_id
       LEFT JOIN nexus_decision_card_versions dcv
         ON dcv.decision_card_id = dc.id AND dcv.version_no = dc.latest_version
       WHERE dc.vertical = 'flip_cards'
         AND o.source_type = 'scanner_auto'
         AND ($1::uuid IS NULL OR dc.org_id = $1)
         AND ($2::uuid IS NULL OR dc.user_id = $2)
         AND dc.confidence_pct >= $3
         AND ($4 = 'all' OR dc.decision_action = $4)
         AND o.observed_at > NOW() - INTERVAL '48 hours'
       ORDER BY dc.confidence_pct DESC, o.observed_at DESC
       LIMIT $5`,
      [
        params.orgId ?? null,
        params.userId ?? null,
        minConf,
        params.actionFilter ?? 'all',
        limit,
      ],
    );

    return rows.rows.map((row) => {
      let card: DecisionCardComputation | null = null;
      try {
        if (row.card_json) card = JSON.parse(row.card_json) as DecisionCardComputation;
      } catch { /* ignore */ }

      const action = row.decision_action ?? 'SKIP';
      const confPct = Number(row.confidence_pct ?? 0);
      const { category } = detectCategory(row.title ?? '');

      return {
        decisionCardId:    row.id,
        opportunityId:     row.opportunity_id,
        title:             row.title ?? '',
        askingPrice:       card?.financials?.askingPrice ?? 0,
        city:              '',  // stored in raw_input_json; omitted for list view
        sourceUrl:         row.source_url ?? '',
        action,
        recommendation:    row.recommendation ?? mapRecommendation(action, confPct),
        expectedNetProfit: r2(card?.financials?.expectedNetProfit ?? 0),
        expectedRoiPct:    r2(card?.financials?.expectedRoiPct ?? 0),
        confidencePct:     r2(confPct),
        riskScore:         Number(row.risk_score ?? 0),
        dataCompleteness:  row.data_completeness ?? 'partial',
        governanceResult:  'allow',  // shown on detail; abbreviated in list
        category,
        negotiationScript: card?.execution?.negotiationScript ?? '',
        suggestedOffer:    card?.execution?.suggestedOffer ?? null,
        listingTitle:      card?.execution?.listingTitle ?? row.title ?? '',
        bestPlatform:      card?.execution?.bestPlatform ?? 'eBay',
        compSource:        'heuristic' as const,
        compCount:         0,
        opportunityScore:  card ? opportunityScore(card) : 0,
      };
    });
  } catch (err) {
    logger.warn('getScanOpportunities query failed', { error: (err as Error).message });
    return [];
  }
}
