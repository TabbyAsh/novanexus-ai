import { query, queryOne, transaction } from '@nova/shared';
import {
  createSharedDbAdapter,
  GovernanceEngine,
  LearningEngine,
  ActionPlanBuilder,
  type VLHPersistenceAdapter,
} from '@nova/nexus-core';
import type { FlipOpportunityInput } from './decision-infrastructure';

// ─── VLH Persistence Adapter (nova-hub singleton) ─────────────────────────────
// Wire @nova/shared DB helpers to the VLHPersistenceAdapter interface.

export const vlhDb: VLHPersistenceAdapter = createSharedDbAdapter({
  query: query as (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  queryOne: queryOne as (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null>,
  transaction,
});

/** Singleton VLH services — construct once, use everywhere in nova-hub. */
export const vlhGovernance = new GovernanceEngine(vlhDb);
export const vlhLearning = new LearningEngine(vlhDb);
export const vlhActionPlanBuilder = new ActionPlanBuilder(vlhDb);

// ─── Opportunity persistence ──────────────────────────────────────────────────

interface PersistOpportunityParams {
  userId: string | null;
  orgId: string | null;
  title: string;
  rawInput: unknown;
  loopTypeSlug?: string | null;
  confidenceScore?: number | null;
  dataCompleteness?: string | null;
  estimatedRevenueMinCents?: number | null;
  estimatedRevenueMaxCents?: number | null;
  requiredCapitalCents?: number | null;
  sourceType?: string;
  sourceUrl?: string | null;
}

/**
 * Persist an ingested flip opportunity to nexus_opportunities.
 * Looks up value_loop_type_id from slug; defaults to marketplace_flipping.
 * Returns the created opportunity ID or null on failure.
 */
export async function persistOpportunity(
  params: PersistOpportunityParams,
): Promise<string | null> {
  try {
    const slug = params.loopTypeSlug ?? 'marketplace_flipping';
    const loopType = await queryOne<{ id: string }>(
      `SELECT id FROM vlh_value_loop_types WHERE slug = $1 AND status = 'active' LIMIT 1`,
      [slug],
    );

    const row = await queryOne<{ id: string }>(
      `INSERT INTO nexus_opportunities
         (user_id, org_id, source_type, source_url, raw_input_json,
          title, value_loop_type_id, confidence_score, data_completeness,
          estimated_revenue_min_cents, estimated_revenue_max_cents,
          required_capital_cents, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'new')
       RETURNING id`,
      [
        params.userId,
        params.orgId,
        params.sourceType ?? 'marketplace_listing',
        params.sourceUrl ?? null,
        JSON.stringify(params.rawInput),
        params.title,
        loopType?.id ?? null,
        params.confidenceScore ?? null,
        params.dataCompleteness ?? 'partial',
        params.estimatedRevenueMinCents ?? null,
        params.estimatedRevenueMaxCents ?? null,
        params.requiredCapitalCents ?? null,
      ],
    );

    return row?.id ?? null;
  } catch {
    return null;
  }
}

type IngestionError = {
  code: string;
  field: string;
  message: string;
};

type IngestionSuccess = {
  ok: true;
  opportunity: FlipOpportunityInput;
  rawInput: unknown;
  ingestion: {
    version: 'nexus.ingest.v2';
    source: 'structured' | 'raw_text' | 'hybrid';
    derivedFields: string[];
    warnings: string[];
  };
};

type IngestionFailure = {
  ok: false;
  errors: IngestionError[];
};

export type FlipOpportunityIngestionResult = IngestionSuccess | IngestionFailure;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[$,]/g, '').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseComparableList(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asFiniteNumber(entry))
      .filter((entry): entry is number => entry !== undefined && entry > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\s|;/]+/)
      .map((entry) => asFiniteNumber(entry))
      .filter((entry): entry is number => entry !== undefined && entry > 0);
  }
  return [];
}

function parseAskingPriceFromText(rawText?: string): number | undefined {
  if (!rawText) return undefined;
  const keywordMatch = rawText.match(/(?:ask|asking|price|for)\s*\$?\s*(\d{1,6}(?:\.\d{1,2})?)/i);
  if (keywordMatch?.[1]) {
    const parsed = asFiniteNumber(keywordMatch[1]);
    if (parsed !== undefined) return parsed;
  }
  const moneyMatch = rawText.match(/\$\s*(\d{1,6}(?:\.\d{1,2})?)/);
  if (moneyMatch?.[1]) {
    const parsed = asFiniteNumber(moneyMatch[1]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function parseSoldCompsFromText(rawText?: string): number[] {
  if (!rawText) return [];
  const compsSegment =
    rawText.match(/(?:sold comps?|comps?)\s*[:=-]?\s*([0-9$.,\s|/;-]+)/i)?.[1] ||
    rawText.match(/(?:sold|resold)\s*(?:for)?\s*([0-9$.,\s|/;-]{5,})/i)?.[1];
  if (!compsSegment) return [];
  return parseComparableList(compsSegment);
}

function inferCondition(rawText?: string): string | undefined {
  if (!rawText) return undefined;
  if (/\blike new\b/i.test(rawText)) return 'Like New';
  if (/\bnew\b/i.test(rawText)) return 'New';
  if (/\bgood\b/i.test(rawText)) return 'Good';
  if (/\bfair\b/i.test(rawText)) return 'Fair';
  if (/\bpoor\b/i.test(rawText)) return 'Poor';
  return undefined;
}

function inferSourceTypeFromUrl(sourceUrl?: string): string | undefined {
  if (!sourceUrl) return undefined;
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    if (host.includes('facebook')) return 'facebook_marketplace';
    if (host.includes('offerup')) return 'offerup';
    if (host.includes('craigslist')) return 'craigslist';
    if (host.includes('ebay')) return 'ebay';
  } catch {
    return undefined;
  }
  return undefined;
}

function deriveTitle(input: Record<string, unknown>, rawText?: string): string | undefined {
  const directTitle =
    asNonEmptyString(input.title) ||
    asNonEmptyString(input.name) ||
    asNonEmptyString(input.itemName);
  if (directTitle) return directTitle;
  if (!rawText) return undefined;
  const segment = rawText.split(/(?:\.\s+|\n|,)/)[0]?.trim();
  if (!segment) return undefined;
  return segment.slice(0, 120);
}

export function ingestFlipOpportunityInput(rawInput: unknown): FlipOpportunityIngestionResult {
  const input = asObject(rawInput);
  const warnings: string[] = [];
  const derivedFields: string[] = [];

  const rawText =
    asNonEmptyString(input.rawText) ||
    asNonEmptyString(input.description) ||
    asNonEmptyString(input.notes) ||
    asNonEmptyString(input.inputText);

  const title = deriveTitle(input, rawText);
  const askingPrice =
    asFiniteNumber(input.askingPrice) ??
    asFiniteNumber(input.price) ??
    asFiniteNumber(input.ask) ??
    parseAskingPriceFromText(rawText);
  if (askingPrice !== undefined && !asFiniteNumber(input.askingPrice)) {
    derivedFields.push('askingPrice');
  }

  const soldCompsDirect =
    parseComparableList(input.soldComps).length > 0
      ? parseComparableList(input.soldComps)
      : parseComparableList(input.comps);
  const soldCompsFromText = parseSoldCompsFromText(rawText);
  const soldComps = soldCompsDirect.length > 0 ? soldCompsDirect : soldCompsFromText;
  if (soldComps.length > 0 && soldCompsDirect.length === 0) {
    derivedFields.push('soldComps');
  }

  const sourceUrl = asNonEmptyString(input.sourceUrl) || asNonEmptyString(input.url) || asNonEmptyString(input.link);
  const sourceType = asNonEmptyString(input.sourceType) || inferSourceTypeFromUrl(sourceUrl) || 'marketplace_listing';
  if (!asNonEmptyString(input.sourceType) && sourceType !== 'marketplace_listing') {
    derivedFields.push('sourceType');
  }

  const category = asNonEmptyString(input.category) || asNonEmptyString(input.type) || 'General Resale';
  if (!asNonEmptyString(input.category)) {
    derivedFields.push('category');
  }

  const condition = asNonEmptyString(input.condition) || inferCondition(rawText) || 'Unknown';
  if (!asNonEmptyString(input.condition)) {
    derivedFields.push('condition');
  }

  const expectedHoldDays =
    asFiniteNumber(input.expectedHoldDays) ??
    asFiniteNumber(input.holdDays) ??
    asFiniteNumber(input.daysToSell);
  const estimatedFees =
    asFiniteNumber(input.estimatedFees) ??
    asFiniteNumber(input.fees);
  const estimatedShipping =
    asFiniteNumber(input.estimatedShipping) ??
    asFiniteNumber(input.shipping);
  const estimatedRefurbishment =
    asFiniteNumber(input.estimatedRefurbishment) ??
    asFiniteNumber(input.repairCost);
  const estimatedStorage =
    asFiniteNumber(input.estimatedStorage) ??
    asFiniteNumber(input.storageCost);

  const errors: IngestionError[] = [];
  if (!title) {
    errors.push({
      code: 'TITLE_REQUIRED',
      field: 'title',
      message: 'A title or parseable rawText description is required.',
    });
  }
  if (askingPrice === undefined || askingPrice <= 0) {
    errors.push({
      code: 'ASKING_PRICE_REQUIRED',
      field: 'askingPrice',
      message: 'A positive askingPrice (or parseable price in rawText) is required.',
    });
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (!rawText && soldComps.length < 3) {
    warnings.push('Comparable sales are sparse; confidence will likely be reduced.');
  }

  const opportunity: FlipOpportunityInput = {
    title: title!,
    category,
    condition,
    askingPrice: askingPrice!,
    estimatedFees,
    estimatedShipping,
    estimatedRefurbishment,
    estimatedStorage,
    expectedHoldDays,
    soldComps: soldComps.length > 0 ? soldComps : undefined,
    location: asNonEmptyString(input.location) || asNonEmptyString(input.city),
    sourceType,
    sourceUrl,
    notes: asNonEmptyString(input.notes) || rawText,
  };

  const source: 'structured' | 'raw_text' | 'hybrid' =
    rawText && (derivedFields.length > 0 || !asNonEmptyString(input.title) || !asFiniteNumber(input.askingPrice))
      ? derivedFields.length > 0
        ? 'hybrid'
        : 'raw_text'
      : 'structured';

  return {
    ok: true,
    opportunity,
    rawInput,
    ingestion: {
      version: 'nexus.ingest.v2',
      source,
      derivedFields,
      warnings,
    },
  };
}
