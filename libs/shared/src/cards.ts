/**
 * The Decision Card kernel — shared construction & persistence helpers.
 *
 * Every Nova module produces a DecisionCard (libs/shared/src/types.ts) and
 * persists it to the `nova_cards` table (infra/migrations/025_nova_cards.sql).
 * These helpers guarantee every card is well-formed and mapped consistently,
 * so the schema truly is the universal contract (Technical Law 05).
 */

import { ulid, nowTimestamp } from './utils';
import type {
  DecisionCard,
  CardType,
  RecommendedAction,
  RiskLevel,
  GovernanceMode,
  DataSource,
  ActionStep,
  TradeMetrics,
  FlipMetrics,
  PricingMetrics,
  ContentMetricsCard,
} from './types';

type CardMetrics = TradeMetrics | FlipMetrics | PricingMetrics | ContentMetricsCard | null;

export interface BuildCardInput {
  card_type: CardType;
  user_id?: string | null;
  session_id?: string;

  observation: {
    source: string;
    raw_input: unknown;
    context?: Record<string, unknown>;
    timestamp?: string;
  };

  analysis: {
    confidence: number | null; // NEVER fake. null when unknown.
    reasoning?: string[];
    data_used?: DataSource[];
    missing?: string[];
    warnings?: string[];
  };

  recommendation: {
    action: RecommendedAction;
    summary: string;
    details?: string;
    risk_level?: RiskLevel;
  };

  metrics?: CardMetrics;
  action_steps?: ActionStep[];

  governance?: {
    mode?: GovernanceMode;
    approved_by?: string | null;
    approved_at?: string | null;
    executed_at?: string | null;
    kill_switch?: boolean;
  };

  event_hash?: string;
}

/**
 * Construct a fully-formed DecisionCard from a partial input.
 * Fills identity, timestamps, governance defaults, and a PENDING outcome.
 * Defaults to the safest governance mode: RECOMMEND (never executes).
 */
export function buildDecisionCard(input: BuildCardInput): DecisionCard {
  const now = nowTimestamp();

  return {
    // Identity
    id: ulid(),
    version: 1,
    created_at: now,
    updated_at: now,

    // Classification
    card_type: input.card_type,
    user_id: input.user_id ?? '',
    session_id: input.session_id ?? '',

    // Observation
    observation: {
      source: input.observation.source,
      raw_input: input.observation.raw_input,
      context: input.observation.context ?? {},
      timestamp: input.observation.timestamp ?? now,
    },

    // Analysis — confidence is passed through verbatim (null stays null)
    analysis: {
      confidence: input.analysis.confidence,
      reasoning: input.analysis.reasoning ?? [],
      data_used: input.analysis.data_used ?? [],
      missing: input.analysis.missing ?? [],
      warnings: input.analysis.warnings ?? [],
    },

    // Recommendation
    recommendation: {
      action: input.recommendation.action,
      summary: input.recommendation.summary,
      details: input.recommendation.details ?? '',
      risk_level: input.recommendation.risk_level ?? 'MEDIUM',
    },

    // Numbers
    metrics: input.metrics ?? null,

    // Action steps
    action_steps: input.action_steps ?? [],

    // Governance — defaults to RECOMMEND (the autonomy ladder starts at the bottom)
    governance: {
      mode: input.governance?.mode ?? 'RECOMMEND',
      approved_by: input.governance?.approved_by ?? null,
      approved_at: input.governance?.approved_at ?? null,
      executed_at: input.governance?.executed_at ?? null,
      kill_switch: input.governance?.kill_switch ?? false,
    },

    // Outcome — always starts PENDING; filled in after execution
    outcome: {
      status: 'PENDING',
      result: null,
      actual_vs_expected: null,
      lesson: null,
      logged_at: null,
    },

    // Event chain
    event_hash: input.event_hash ?? '',
  };
}

/** Column shape for the nova_cards table (snake_case JSONB columns). */
export interface NovaCardRow {
  id: string;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
  card_type: CardType;
  user_id: string | null;
  session_id: string;
  observation: DecisionCard['observation'];
  analysis: DecisionCard['analysis'];
  recommendation: DecisionCard['recommendation'];
  metrics: CardMetrics;
  action_steps: ActionStep[];
  governance: DecisionCard['governance'];
  outcome: DecisionCard['outcome'];
  event_hash: string;
}

const toIso = (v: string | Date): string =>
  v instanceof Date ? v.toISOString() : v;

/** Map a nova_cards DB row back into a DecisionCard. */
export function novaCardFromRow(row: NovaCardRow): DecisionCard {
  return {
    id: row.id,
    version: row.version,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    card_type: row.card_type,
    user_id: row.user_id ?? '',
    session_id: row.session_id ?? '',
    observation: row.observation,
    analysis: row.analysis,
    recommendation: row.recommendation,
    metrics: row.metrics ?? null,
    action_steps: row.action_steps ?? [],
    governance: row.governance,
    outcome: row.outcome,
    event_hash: row.event_hash ?? '',
  };
}

/**
 * Parameterized INSERT for a DecisionCard into nova_cards.
 * Returns { text, values } ready for pg's pool.query(text, values).
 * Generated columns (confidence, rec_action, ...) are derived by Postgres.
 */
export function novaCardInsert(card: DecisionCard): { text: string; values: unknown[] } {
  const text = `
    INSERT INTO nova_cards (
      id, version, created_at, updated_at, card_type, user_id, session_id,
      observation, analysis, recommendation, metrics, action_steps,
      governance, outcome, event_hash
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb,
      $13::jsonb, $14::jsonb, $15
    )
    RETURNING *`;

  const values = [
    card.id,
    card.version,
    card.created_at,
    card.updated_at,
    card.card_type,
    card.user_id || null,
    card.session_id,
    JSON.stringify(card.observation),
    JSON.stringify(card.analysis),
    JSON.stringify(card.recommendation),
    card.metrics === null ? null : JSON.stringify(card.metrics),
    JSON.stringify(card.action_steps),
    JSON.stringify(card.governance),
    JSON.stringify(card.outcome),
    card.event_hash,
  ];

  return { text, values };
}
