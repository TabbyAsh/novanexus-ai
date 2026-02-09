export type CandleIntegrity = {
  source_type: string;
  source_identifier: string;
  latency_class: string;
  confidence_score: number;
  timestamp_range: {
    start: string;
    end: string;
    expected: number;
    actual: number;
    missing: number;
    gapFill?: boolean;
    gapFillCount?: number;
  };
  note?: string;
};

export type ExecutionMode = 'live' | 'paper' | 'blocked';

export type ExecutionGateResult = {
  mode: ExecutionMode;
  reasons: string[];
  signalConfidence: number;
  dataConfidence?: number;
  latencyClass?: string;
  sourceType?: string;
};

export type GuidedSignalInput = {
  symbol: string;
  type?: 'bullish' | 'bearish' | 'neutral';
  direction?: 'LONG' | 'SHORT' | 'BUY' | 'SELL';
  entry?: number;
  target?: number;
  stopLoss?: number;
  confidence?: number;
  indicators?: Record<string, unknown>;
  reasoning?: string | string[];
  pattern?: string;
  timeframe?: string;
  strategyTag?: string;
};

export type GuidedThesis = {
  id: string;
  symbol: string;
  signal: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  confidence: number;
  reasoning: string[];
  indicators: Record<string, unknown>;
  dataIntegrity?: CandleIntegrity | null;
  createdAt: string;
  expiresAt: string;
};

const LIVE_TRADE_MIN_CONFIDENCE = Number(process.env.LIVE_TRADE_MIN_CONFIDENCE || 0.7);
const PAPER_TRADE_MIN_CONFIDENCE = Number(process.env.PAPER_TRADE_MIN_CONFIDENCE || 0.3);
const LIVE_TRADE_MIN_DATA_CONFIDENCE = Number(process.env.LIVE_TRADE_MIN_DATA_CONFIDENCE || 0.7);
const LIVE_TRADE_ALLOWED_SOURCE_TYPES = (process.env.LIVE_TRADE_ALLOWED_SOURCE_TYPES || 'primary')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const LIVE_TRADE_MAX_LATENCY_CLASS = (process.env.LIVE_TRADE_MAX_LATENCY_CLASS || 'medium').toLowerCase();

const LATENCY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, stale: 3 };

function normalizeSignalConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function hasIntegrityFields(integrity?: CandleIntegrity | null): integrity is CandleIntegrity {
  return Boolean(
    integrity &&
      typeof integrity.source_type === 'string' &&
      typeof integrity.source_identifier === 'string' &&
      typeof integrity.latency_class === 'string' &&
      Number.isFinite(integrity.confidence_score) &&
      integrity.timestamp_range &&
      typeof integrity.timestamp_range.start === 'string' &&
      typeof integrity.timestamp_range.end === 'string'
  );
}

export function evaluateExecutionGate(params: {
  signalConfidence: number;
  integrity?: CandleIntegrity | null;
}): ExecutionGateResult {
  const signalConfidence = normalizeSignalConfidence(params.signalConfidence);
  const reasons: string[] = [];

  if (!Number.isFinite(signalConfidence) || signalConfidence <= 0) {
    reasons.push('signal_confidence_missing');
  }

  const integrity = params.integrity ?? null;
  const hasIntegrity = hasIntegrityFields(integrity);

  if (!hasIntegrity) {
    reasons.push('integrity_missing');
  } else {
    const sourceType = integrity.source_type;
    const latencyClass = integrity.latency_class.toLowerCase();
    const latencyRank = LATENCY_RANK[latencyClass] ?? LATENCY_RANK.high;

    if (!LIVE_TRADE_ALLOWED_SOURCE_TYPES.includes(sourceType)) {
      reasons.push(`source_type_${sourceType}`);
    }

    if (latencyRank > (LATENCY_RANK[LIVE_TRADE_MAX_LATENCY_CLASS] ?? LATENCY_RANK.medium)) {
      reasons.push(`latency_${integrity.latency_class}`);
    }

    if (integrity.confidence_score < LIVE_TRADE_MIN_DATA_CONFIDENCE) {
      reasons.push('data_confidence_low');
    }
  }

  if (signalConfidence < LIVE_TRADE_MIN_CONFIDENCE) {
    reasons.push('signal_confidence_low');
  }

  let mode: ExecutionMode = reasons.length === 0 ? 'live' : 'paper';
  if (signalConfidence < PAPER_TRADE_MIN_CONFIDENCE) {
    mode = 'blocked';
    reasons.push('paper_confidence_low');
  }

  return {
    mode,
    reasons,
    signalConfidence,
    dataConfidence: integrity?.confidence_score,
    latencyClass: integrity?.latency_class,
    sourceType: integrity?.source_type,
  };
}

export type ThesisValidationError = {
  code: string;
  message: string;
  field: string;
  details?: Record<string, unknown>;
};

export type BuildThesisResult = 
  | { ok: true; thesis: GuidedThesis; warnings: string[] }
  | { ok: false; errors: ThesisValidationError[] };

export function buildGuidedThesis(input: GuidedSignalInput, integrity?: CandleIntegrity | null): BuildThesisResult {
  const errors: ThesisValidationError[] = [];
  const warnings: string[] = [];
  
  const directionRaw = (input.direction || '').toUpperCase();
  const direction = directionRaw === 'SHORT' || directionRaw === 'SELL' || input.type === 'bearish' ? 'SHORT' : 'LONG';
  const signal: 'LONG' | 'SHORT' = direction === 'SHORT' ? 'SHORT' : 'LONG';

  const entry = Number(input.entry ?? 0);
  const target = Number(input.target ?? 0);
  const stop = Number(input.stopLoss ?? 0);

  // Validate required price inputs
  if (!Number.isFinite(entry) || entry <= 0) {
    errors.push({ code: 'MISSING_ENTRY', message: 'Entry price is required', field: 'entry' });
  }
  if (!Number.isFinite(target) || target <= 0) {
    errors.push({ code: 'MISSING_TARGET', message: 'Target price is required', field: 'target' });
  }
  if (!Number.isFinite(stop) || stop <= 0) {
    errors.push({ code: 'MISSING_STOP', message: 'Stop loss is required', field: 'stopLoss' });
  }

  const rrDenom = Math.abs(entry - stop);
  const rr = rrDenom > 0 ? Math.abs(target - entry) / rrDenom : 0;
  
  // CRITICAL: Confidence MUST be computed, never default to neutral (50%)
  // If confidence is not provided, this is an error - NO NEUTRAL FALLBACKS
  const confidenceRaw = input.confidence;
  if (confidenceRaw === undefined || confidenceRaw === null) {
    errors.push({ 
      code: 'CONFIDENCE_MISSING', 
      message: 'Confidence score is required. Cannot default to neutral (50%). Either compute confidence or provide explicit value.', 
      field: 'confidence',
      details: { reason: 'no_neutral_fallback_policy' }
    });
  }
  const confidenceValue = typeof confidenceRaw === 'number' ? confidenceRaw : 0;
  const confidence = Math.max(0, Math.min(100, confidenceValue <= 1 ? Math.round(confidenceValue * 100) : Math.round(confidenceValue)));
  
  // Warn but don't error on low confidence
  if (confidence > 0 && confidence < 30) {
    warnings.push(`Low confidence (${confidence}%) - signal may not be actionable`);
  }
  
  // Return errors if any required fields are missing
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const reasoning: string[] = [];
  if (input.pattern) reasoning.push(`Pattern: ${input.pattern}`);
  if (input.timeframe) reasoning.push(`Timeframe: ${input.timeframe}`);
  if (Array.isArray(input.reasoning)) reasoning.push(...input.reasoning);
  if (typeof input.reasoning === 'string') reasoning.push(input.reasoning);

  const now = Date.now();
  const thesis: GuidedThesis = {
    id: `guided-${now}`,
    symbol: input.symbol.toUpperCase(),
    signal,
    entryPrice: entry,
    targetPrice: target,
    stopLoss: stop,
    riskRewardRatio: Number.isFinite(rr) ? Math.round(rr * 100) / 100 : 0,
    confidence,
    reasoning,
    indicators: input.indicators || {},
    dataIntegrity: integrity ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
  };
  
  return { ok: true, thesis, warnings };
}

export function pruneStrategyAnalytics(strategy: Record<string, any> | null | undefined, depth: number) {
  if (!strategy || depth > 0) return strategy;
  const expectancy = typeof strategy?.monteCarlo?.expectedValue === 'number'
    ? strategy.monteCarlo.expectedValue
    : typeof strategy?.expectancy === 'number'
      ? strategy.expectancy
      : null;
  return {
    status: strategy.status ?? null,
    fitnessScore: strategy.fitnessScore ?? null,
    drift: strategy.drift ?? null,
    evaluatedAt: strategy.evaluatedAt ?? null,
    expectancy,
    analyticsLocked: true,
  };
}

