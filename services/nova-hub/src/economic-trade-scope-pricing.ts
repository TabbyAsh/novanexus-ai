import { createHash } from 'node:crypto';
import { query, queryOne } from '@nova/shared';
import { getTrade0001, type EconomicTradeView } from './economic-trade-state';
import {
  getTradeEvidenceSummary,
  type ConditionEvidenceSubmission,
  type EvidenceSummary,
  type GeometryEvidenceSubmission,
} from './economic-trade-evidence';

export interface ScopeStructureView {
  label: string;
  lengthFt: number;
  widthFt: number;
  wallHeightFt: number;
  gableHeightFt: number | null;
  rectangularWallSqFt: number;
  gableSqFt: number;
  totalVerticalSqFt: number;
}

export interface TradeScopeView {
  id: string;
  version: number;
  totalWashableSqFt: number;
  structures: ScopeStructureView[];
  surfaces: ConditionEvidenceSubmission['surfaces'];
  inclusions: string[];
  exclusions: string[];
  evidenceIds: string[];
  contentHash: string;
  createdAt: string;
}

export interface PricingInput {
  benchmarkRatePerSqFt: number;
  benchmarkSourceRef: string;
  benchmarkObservedAt: string;
  laborHours: number;
  internalLaborCostPerHour: number;
  chemicalCost: number;
  travelCost: number;
  equipmentCost: number;
  contingencyPercent: number;
  targetGrossMargin: number;
  roundingIncrement: 1 | 5 | 10 | 25 | 50 | 100;
  notes?: string;
}

export interface TradePriceView {
  id: string;
  scopeId: string;
  totalWashableSqFt: number;
  benchmarkRatePerSqFt: number;
  marketBasePrice: number;
  laborCost: number;
  directCost: number;
  minimumPriceForMargin: number;
  contingencyPercent: number;
  preRoundedPrice: number;
  fixedPrice: number;
  expectedGrossProfit: number;
  expectedGrossMargin: number;
  benchmarkSourceRef: string;
  benchmarkObservedAt: string;
  contentHash: string;
  createdAt: string;
}

export interface ScopePricingSummary {
  scope: TradeScopeView | null;
  price: TradePriceView | null;
}

export interface ScopePricingCommandResult {
  reply: string;
  capabilityId:
    | 'economic.trade.scope.inspect'
    | 'economic.trade.scope.compose'
    | 'economic.trade.fixed_bid.calculate';
  source: string;
  trade: EconomicTradeView;
  scopePricingSummary: ScopePricingSummary;
  command: 'scope_pricing_inspected' | 'scope_composed' | 'fixed_bid_calculated';
}

interface ScopeRow {
  id: string;
  version: number;
  total_washable_sqft: string;
  structures_json: ScopeStructureView[] | string;
  surfaces_json: ConditionEvidenceSubmission['surfaces'] | string;
  inclusions_json: string[] | string;
  exclusions_json: string[] | string;
  evidence_ids: string[] | string;
  content_hash: string;
  created_at: string;
}

interface PriceRow {
  id: string;
  scope_id: string;
  total_washable_sqft: string;
  benchmark_rate_per_sqft: string;
  market_base_price: string;
  labor_cost: string;
  direct_cost: string;
  minimum_price_for_margin: string;
  contingency_percent: string;
  pre_rounded_price: string;
  fixed_price: string;
  expected_gross_profit: string;
  expected_gross_margin: string;
  benchmark_source_ref: string;
  benchmark_observed_at: string;
  content_hash: string;
  created_at: string;
}

const PRICING_ROUTES = [
  {
    id: 'founder_pricing_inputs',
    name: 'Founder operating and market inputs',
    providerType: 'HUMAN_TASK',
    status: 'AVAILABLE',
    authority: 'ASSIST',
    riskTier: 'R1',
    expectedConfidence: 0.9,
    expectedCostUsd: 0,
    blockingReason: null,
    description: 'Provide a sourced benchmark rate plus labor, chemical, travel, equipment, contingency, and target-margin inputs.',
  },
  {
    id: 'local_market_rate_research',
    name: 'Local market-rate research',
    providerType: 'EXTERNAL_DATA',
    status: 'RESERVED',
    authority: 'OBSERVE',
    riskTier: 'R0',
    expectedConfidence: 0.85,
    expectedCostUsd: null,
    blockingReason: 'A governed, citation-preserving commercial-cleaning market research adapter is not registered yet.',
    description: 'Collect current comparable rates and preserve source, date, scope differences, and locality.',
  },
];

let tablesReady = false;

function jsonValue<T>(value: T | string, fallback: T): T {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finiteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validSourceRef(value: string): boolean {
  return /^(attachment|file|evidence|photo|https?):\/\/.+/i.test(value);
}

async function ensureTables(): Promise<void> {
  if (tablesReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS economic_trade_scopes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      version INTEGER NOT NULL,
      total_washable_sqft NUMERIC NOT NULL,
      structures_json JSONB NOT NULL,
      surfaces_json JSONB NOT NULL,
      inclusions_json JSONB NOT NULL,
      exclusions_json JSONB NOT NULL,
      evidence_ids JSONB NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(trade_id, user_id, content_hash)
    )
  `, []);
  await query(`
    CREATE TABLE IF NOT EXISTS economic_trade_prices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      scope_id UUID NOT NULL REFERENCES economic_trade_scopes(id) ON DELETE RESTRICT,
      total_washable_sqft NUMERIC NOT NULL,
      benchmark_rate_per_sqft NUMERIC NOT NULL,
      market_base_price NUMERIC NOT NULL,
      labor_cost NUMERIC NOT NULL,
      direct_cost NUMERIC NOT NULL,
      minimum_price_for_margin NUMERIC NOT NULL,
      contingency_percent NUMERIC NOT NULL,
      pre_rounded_price NUMERIC NOT NULL,
      fixed_price NUMERIC NOT NULL,
      expected_gross_profit NUMERIC NOT NULL,
      expected_gross_margin NUMERIC NOT NULL,
      benchmark_source_ref TEXT NOT NULL,
      benchmark_observed_at TIMESTAMPTZ NOT NULL,
      input_json JSONB NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(trade_id, user_id, content_hash)
    )
  `, []);
  await query('CREATE INDEX IF NOT EXISTS idx_trade_scopes_trade_created ON economic_trade_scopes(trade_id, created_at DESC)', []);
  await query('CREATE INDEX IF NOT EXISTS idx_trade_prices_trade_created ON economic_trade_prices(trade_id, created_at DESC)', []);
  tablesReady = true;
}

export async function ensurePricingGap(userId: string): Promise<EconomicTradeView> {
  const trade = await getTrade0001(userId);
  await query(
    `INSERT INTO economic_trade_gaps (
       trade_id, code, title, description, status, blocking, severity,
       provenance_status, blocked_requirement, required_capability,
       required_confidence, routes_json
     ) VALUES ($1, 'pricing-and-operating-inputs', $2, $3, 'OPEN', true, 'HIGH',
               'SYSTEM_VERIFIED', $4, 'service.fixed_bid.calculate', 0.85, $5::jsonb)
     ON CONFLICT (trade_id, code) DO NOTHING`,
    [
      trade.id,
      'Sourced pricing and operating inputs',
      'A fixed bid requires a current benchmark rate, labor estimate, internal labor cost, chemical/travel/equipment costs, contingency, and target margin.',
      'A defensible exact fixed bid and expected gross profit.',
      JSON.stringify(PRICING_ROUTES),
    ],
  );
  return getTrade0001(userId);
}

function latestPassedEvidence<T>(summary: EvidenceSummary, gapCode: string, type: 'GEOMETRY_MEASUREMENT' | 'SURFACE_CONDITION'): { id: string; content: T } | null {
  const passed = summary.evaluations.find(item => item.gapCode === gapCode && item.passed);
  if (!passed) return null;
  const evidence = summary.evidence.find(item => item.id === passed.evidenceId && item.type === type);
  return evidence ? { id: evidence.id, content: evidence.content as T } : null;
}

export function calculateScope(
  geometry: GeometryEvidenceSubmission,
  condition: ConditionEvidenceSubmission,
): Omit<TradeScopeView, 'id' | 'version' | 'contentHash' | 'createdAt' | 'evidenceIds'> {
  const structures = geometry.structures.map(item => {
    const rectangularWallSqFt = 2 * (item.lengthFt + item.widthFt) * item.wallHeightFt;
    const gableSqFt = item.gableHeightFt ? item.widthFt * item.gableHeightFt : 0;
    return {
      label: item.label,
      lengthFt: item.lengthFt,
      widthFt: item.widthFt,
      wallHeightFt: item.wallHeightFt,
      gableHeightFt: item.gableHeightFt ?? null,
      rectangularWallSqFt: round2(rectangularWallSqFt),
      gableSqFt: round2(gableSqFt),
      totalVerticalSqFt: round2(rectangularWallSqFt + gableSqFt),
    };
  });
  const totalWashableSqFt = round2(structures.reduce((sum, item) => sum + item.totalVerticalSqFt, 0));
  return {
    totalWashableSqFt,
    structures,
    surfaces: condition.surfaces,
    inclusions: [
      'Measured exterior vertical wall surfaces for every accepted in-scope structure.',
      'Exterior-facing roll-up doors and ordinary trim contained within the measured wall planes.',
      'Normal surface dirt and organic growth documented in the accepted condition evidence.',
      'Ordinary low-pressure/soft-wash treatment appropriate to the documented materials.',
    ],
    exclusions: [
      'Roofs and roof coatings.',
      'Interior walls, interior drive aisles, and interior storage doors.',
      'Asphalt, gravel, vehicles, trailers, and movable equipment.',
      'Windows and specialty glass restoration unless separately listed.',
      'Oil, rust, oxidation, paint failure, graffiti, hazardous material, or restoration work not explicitly priced.',
      'Any structure or surface absent from the accepted evidence set.',
    ],
  };
}

export async function composeTradeScope(userId: string): Promise<{ trade: EconomicTradeView; summary: ScopePricingSummary }> {
  await ensureTables();
  let trade = await ensurePricingGap(userId);
  const evidence = await getTradeEvidenceSummary(userId, trade.id);
  const geometry = latestPassedEvidence<GeometryEvidenceSubmission>(evidence, 'geometry-and-parcel-membership', 'GEOMETRY_MEASUREMENT');
  const condition = latestPassedEvidence<ConditionEvidenceSubmission>(evidence, 'current-surface-condition', 'SURFACE_CONDITION');
  if (!geometry || !condition) {
    const missing = [!geometry ? 'accepted geometry evidence' : null, !condition ? 'accepted surface-condition evidence' : null].filter(Boolean).join(' and ');
    throw new Error(`Scope composition is blocked: ${missing} is missing.`);
  }

  const calculated = calculateScope(geometry.content, condition.content);
  const content = { ...calculated, evidenceIds: [geometry.id, condition.id] };
  const contentHash = hash(content);
  const versionRow = await queryOne<{ version: string }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS version
     FROM economic_trade_scopes WHERE trade_id = $1 AND user_id = $2`,
    [trade.id, userId],
  );
  const version = parseInt(versionRow?.version || '1', 10);
  await query(
    `INSERT INTO economic_trade_scopes (
       trade_id, user_id, version, total_washable_sqft, structures_json,
       surfaces_json, inclusions_json, exclusions_json, evidence_ids, content_hash
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10)
     ON CONFLICT (trade_id, user_id, content_hash) DO NOTHING`,
    [
      trade.id,
      userId,
      version,
      calculated.totalWashableSqFt,
      JSON.stringify(calculated.structures),
      JSON.stringify(calculated.surfaces),
      JSON.stringify(calculated.inclusions),
      JSON.stringify(calculated.exclusions),
      JSON.stringify([geometry.id, condition.id]),
      contentHash,
    ],
  );
  const persisted = await queryOne<{ id: string }>(
    `SELECT id FROM economic_trade_scopes
     WHERE trade_id = $1 AND user_id = $2 AND content_hash = $3`,
    [trade.id, userId, contentHash],
  );
  if (!persisted?.id) throw new Error('Scope could not be persisted.');

  await query(`UPDATE economic_trades SET stage = 'PRICING', updated_at = NOW() WHERE id = $1`, [trade.id]);
  await query(
    `INSERT INTO economic_trade_events (trade_id, user_id, event_type, payload_json)
     VALUES ($1, $2, 'SCOPE_COMPOSED', $3::jsonb)`,
    [trade.id, userId, JSON.stringify({ scopeId: persisted.id, contentHash, totalWashableSqFt: calculated.totalWashableSqFt, evidenceIds: [geometry.id, condition.id] })],
  );
  trade = await getTrade0001(userId);
  return { trade, summary: await getScopePricingSummary(userId, trade.id) };
}

export function validatePricingInput(input: PricingInput): string[] {
  const findings: string[] = [];
  if (!finiteInRange(input.benchmarkRatePerSqFt, 0.01, 10)) findings.push('Benchmark rate must be between $0.01 and $10.00 per square foot.');
  if (!String(input.benchmarkSourceRef || '').trim() || !validSourceRef(input.benchmarkSourceRef)) findings.push('Benchmark source must be a supported attachment/file/evidence/photo/URL reference.');
  if (!input.benchmarkObservedAt || Number.isNaN(new Date(input.benchmarkObservedAt).getTime())) findings.push('Benchmark observation date/time is invalid.');
  if (!finiteInRange(input.laborHours, 0.1, 2000)) findings.push('Labor hours must be between 0.1 and 2,000.');
  if (!finiteInRange(input.internalLaborCostPerHour, 0, 500)) findings.push('Internal labor cost must be between $0 and $500 per hour.');
  for (const [label, value] of [
    ['Chemical cost', input.chemicalCost],
    ['Travel cost', input.travelCost],
    ['Equipment cost', input.equipmentCost],
  ] as const) {
    if (!finiteInRange(value, 0, 100000)) findings.push(`${label} must be between $0 and $100,000.`);
  }
  if (!finiteInRange(input.contingencyPercent, 0, 0.5)) findings.push('Contingency must be between 0% and 50%.');
  if (!finiteInRange(input.targetGrossMargin, 0.01, 0.9)) findings.push('Target gross margin must be between 1% and 90%.');
  if (![1, 5, 10, 25, 50, 100].includes(input.roundingIncrement)) findings.push('Rounding increment is invalid.');
  return findings;
}

export function calculateFixedBid(scope: TradeScopeView, input: PricingInput): Omit<TradePriceView, 'id' | 'scopeId' | 'contentHash' | 'createdAt'> {
  const laborCost = input.laborHours * input.internalLaborCostPerHour;
  const directCost = laborCost + input.chemicalCost + input.travelCost + input.equipmentCost;
  const marketBasePrice = scope.totalWashableSqFt * input.benchmarkRatePerSqFt;
  const minimumPriceForMargin = directCost / (1 - input.targetGrossMargin);
  const priceFloor = Math.max(marketBasePrice, minimumPriceForMargin);
  const preRoundedPrice = priceFloor * (1 + input.contingencyPercent);
  const fixedPrice = Math.ceil(preRoundedPrice / input.roundingIncrement) * input.roundingIncrement;
  const expectedGrossProfit = fixedPrice - directCost;
  const expectedGrossMargin = fixedPrice > 0 ? expectedGrossProfit / fixedPrice : 0;
  return {
    totalWashableSqFt: round2(scope.totalWashableSqFt),
    benchmarkRatePerSqFt: round2(input.benchmarkRatePerSqFt),
    marketBasePrice: round2(marketBasePrice),
    laborCost: round2(laborCost),
    directCost: round2(directCost),
    minimumPriceForMargin: round2(minimumPriceForMargin),
    contingencyPercent: round2(input.contingencyPercent),
    preRoundedPrice: round2(preRoundedPrice),
    fixedPrice: round2(fixedPrice),
    expectedGrossProfit: round2(expectedGrossProfit),
    expectedGrossMargin: round2(expectedGrossMargin),
    benchmarkSourceRef: input.benchmarkSourceRef,
    benchmarkObservedAt: new Date(input.benchmarkObservedAt).toISOString(),
  };
}

export async function calculateTradeFixedBid(userId: string, input: PricingInput): Promise<{ trade: EconomicTradeView; summary: ScopePricingSummary }> {
  await ensureTables();
  let trade = await ensurePricingGap(userId);
  const findings = validatePricingInput(input);
  if (findings.length) throw new Error(`Fixed-bid inputs failed validation: ${findings.join(' ')}`);
  const summary = await getScopePricingSummary(userId, trade.id);
  if (!summary.scope) throw new Error('Fixed-bid calculation is blocked: no accepted measured scope exists.');

  const calculated = calculateFixedBid(summary.scope, input);
  const content = { scopeId: summary.scope.id, input, calculated };
  const contentHash = hash(content);
  await query(
    `INSERT INTO economic_trade_prices (
       trade_id, user_id, scope_id, total_washable_sqft, benchmark_rate_per_sqft,
       market_base_price, labor_cost, direct_cost, minimum_price_for_margin,
       contingency_percent, pre_rounded_price, fixed_price, expected_gross_profit,
       expected_gross_margin, benchmark_source_ref, benchmark_observed_at,
       input_json, content_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18)
     ON CONFLICT (trade_id, user_id, content_hash) DO NOTHING`,
    [
      trade.id,
      userId,
      summary.scope.id,
      calculated.totalWashableSqFt,
      calculated.benchmarkRatePerSqFt,
      calculated.marketBasePrice,
      calculated.laborCost,
      calculated.directCost,
      calculated.minimumPriceForMargin,
      calculated.contingencyPercent,
      calculated.preRoundedPrice,
      calculated.fixedPrice,
      calculated.expectedGrossProfit,
      calculated.expectedGrossMargin,
      calculated.benchmarkSourceRef,
      calculated.benchmarkObservedAt,
      JSON.stringify(input),
      contentHash,
    ],
  );
  const price = await queryOne<{ id: string }>(
    `SELECT id FROM economic_trade_prices
     WHERE trade_id = $1 AND user_id = $2 AND content_hash = $3`,
    [trade.id, userId, contentHash],
  );
  if (!price?.id) throw new Error('Fixed bid could not be persisted.');

  await query(
    `UPDATE economic_trade_gaps
     SET status = 'RESOLVED', provenance_status = 'USER_CONFIRMED', updated_at = NOW(), resolved_at = NOW()
     WHERE trade_id = $1 AND code = 'pricing-and-operating-inputs'`,
    [trade.id],
  );
  await query(
    `UPDATE economic_trades
     SET expected_revenue = $1, stage = 'READY_TO_QUOTE', updated_at = NOW()
     WHERE id = $2`,
    [calculated.fixedPrice, trade.id],
  );
  await query(
    `INSERT INTO economic_trade_events (trade_id, user_id, event_type, payload_json)
     VALUES ($1, $2, 'FIXED_BID_CALCULATED', $3::jsonb)`,
    [trade.id, userId, JSON.stringify({ priceId: price.id, scopeId: summary.scope.id, fixedPrice: calculated.fixedPrice, contentHash, benchmarkSourceRef: input.benchmarkSourceRef })],
  );
  trade = await getTrade0001(userId);
  return { trade, summary: await getScopePricingSummary(userId, trade.id) };
}

export async function getScopePricingSummary(userId: string, tradeId: string): Promise<ScopePricingSummary> {
  await ensureTables();
  const [scope, price] = await Promise.all([
    queryOne<ScopeRow>(
      `SELECT id, version, total_washable_sqft, structures_json, surfaces_json,
              inclusions_json, exclusions_json, evidence_ids, content_hash, created_at
       FROM economic_trade_scopes
       WHERE trade_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [tradeId, userId],
    ),
    queryOne<PriceRow>(
      `SELECT id, scope_id, total_washable_sqft, benchmark_rate_per_sqft,
              market_base_price, labor_cost, direct_cost, minimum_price_for_margin,
              contingency_percent, pre_rounded_price, fixed_price,
              expected_gross_profit, expected_gross_margin, benchmark_source_ref,
              benchmark_observed_at, content_hash, created_at
       FROM economic_trade_prices
       WHERE trade_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [tradeId, userId],
    ),
  ]);

  return {
    scope: scope ? {
      id: scope.id,
      version: Number(scope.version),
      totalWashableSqFt: Number(scope.total_washable_sqft),
      structures: jsonValue(scope.structures_json, []),
      surfaces: jsonValue(scope.surfaces_json, []),
      inclusions: jsonValue(scope.inclusions_json, []),
      exclusions: jsonValue(scope.exclusions_json, []),
      evidenceIds: jsonValue(scope.evidence_ids, []),
      contentHash: scope.content_hash,
      createdAt: scope.created_at,
    } : null,
    price: price ? {
      id: price.id,
      scopeId: price.scope_id,
      totalWashableSqFt: Number(price.total_washable_sqft),
      benchmarkRatePerSqFt: Number(price.benchmark_rate_per_sqft),
      marketBasePrice: Number(price.market_base_price),
      laborCost: Number(price.labor_cost),
      directCost: Number(price.direct_cost),
      minimumPriceForMargin: Number(price.minimum_price_for_margin),
      contingencyPercent: Number(price.contingency_percent),
      preRoundedPrice: Number(price.pre_rounded_price),
      fixedPrice: Number(price.fixed_price),
      expectedGrossProfit: Number(price.expected_gross_profit),
      expectedGrossMargin: Number(price.expected_gross_margin),
      benchmarkSourceRef: price.benchmark_source_ref,
      benchmarkObservedAt: price.benchmark_observed_at,
      contentHash: price.content_hash,
      createdAt: price.created_at,
    } : null,
  };
}

function parsePricingInput(message: string): PricingInput | null {
  const marker = 'PRICING_EVIDENCE:';
  const index = message.indexOf(marker);
  if (index < 0) return null;
  try {
    return JSON.parse(message.slice(index + marker.length).trim()) as PricingInput;
  } catch {
    return null;
  }
}

export function targetsScopePricingCommand(message: string): boolean {
  return message.includes('SCOPE_STATE') || message.includes('COMPOSE_SCOPE') || message.includes('PRICING_EVIDENCE:');
}

export async function handleScopePricingCommand(userId: string, message: string): Promise<ScopePricingCommandResult | null> {
  if (!targetsScopePricingCommand(message)) return null;
  let trade = await ensurePricingGap(userId);

  if (message.includes('COMPOSE_SCOPE')) {
    const result = await composeTradeScope(userId);
    return {
      reply: `Measured scope ${result.summary.scope?.id} was composed from accepted evidence. Total washable vertical area: ${result.summary.scope?.totalWashableSqFt.toLocaleString()} sq ft. Trade stage: ${result.trade.stage}.`,
      capabilityId: 'economic.trade.scope.compose',
      source: 'postgres:economic_trade_scopes+accepted_evidence',
      trade: result.trade,
      scopePricingSummary: result.summary,
      command: 'scope_composed',
    };
  }

  if (message.includes('PRICING_EVIDENCE:')) {
    const input = parsePricingInput(message);
    if (!input) throw new Error('Pricing evidence JSON is missing or invalid.');
    const result = await calculateTradeFixedBid(userId, input);
    return {
      reply: `Fixed bid calculated and persisted: $${result.summary.price?.fixedPrice.toLocaleString()}. Expected direct cost: $${result.summary.price?.directCost.toLocaleString()}; expected gross profit: $${result.summary.price?.expectedGrossProfit.toLocaleString()}; expected gross margin: ${Math.round((result.summary.price?.expectedGrossMargin || 0) * 100)}%. Trade stage: ${result.trade.stage}.`,
      capabilityId: 'economic.trade.fixed_bid.calculate',
      source: 'postgres:economic_trade_prices+scope+pricing_evidence',
      trade: result.trade,
      scopePricingSummary: result.summary,
      command: 'fixed_bid_calculated',
    };
  }

  trade = await getTrade0001(userId);
  return {
    reply: `Scope/pricing state loaded. Scope: ${trade.stage === 'SCOPING' || trade.stage === 'READY_FOR_SCOPE' ? 'not yet composed' : 'available or in pricing'}. Fixed bid: ${trade.expectedRevenue == null ? 'UNKNOWN' : `$${trade.expectedRevenue.toLocaleString()}`}.`,
    capabilityId: 'economic.trade.scope.inspect',
    source: 'postgres:economic_trade_scopes+economic_trade_prices',
    trade,
    scopePricingSummary: await getScopePricingSummary(userId, trade.id),
    command: 'scope_pricing_inspected',
  };
}
