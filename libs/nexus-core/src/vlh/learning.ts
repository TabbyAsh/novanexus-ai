/**
 * VLH Learning Engine
 * ===================
 * Two responsibilities:
 *
 * 1. LearningEngine: persists outcome learning snapshots and aggregates
 *    calibration profiles that feed back into future Decision Card scoring.
 *    This closes the Observe→Decide→Execute→Log→Learn→Improve loop.
 *
 * 2. ActionPlanBuilder: converts a DecisionCardComputation's execution
 *    section into a structured VLHActionPlanInput ready for DB insertion.
 */

import type { VLHPersistenceAdapter } from './persistence';

// ─── Snapshot row shape from nexus_learning_snapshots ────────────────────────

interface LearningSnapshotRow {
  calibration_error_pct: string | number;
  predicted_json: string;
  actual_json: string;
  learning_json: string;
  created_at: string;
}

interface CalibrationAggRow {
  sample_size: string | number;
  mean_prediction_bias_pct: string | number;
  mean_calibration_error_pct: string | number;
  mean_confidence_delta_pct: string | number;
  last_computed_at: string;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LearningOutcomeInput {
  orgId: string | null;
  userId: string | null;
  decisionCardId: string;
  /** Values from the Decision Card computation at time of decision */
  predicted: {
    netProfitMid: number;
    expectedRoiPct: number;
    confidencePct: number;
    riskScore: number | null;
  };
  /** Values from the actual outcome logged by the user */
  actual: {
    realizedNetProfit: number;
    holdDays?: number;
  };
}

export interface LearningResult {
  predictionError: number;
  absoluteError: number;
  calibrationErrorPct: number;
  confidenceDeltaPct: number;
  summary: string[];
}

export interface CalibrationProfile {
  sampleSize: number;
  meanPredictionBiasPct: number;
  meanCalibrationErrorPct: number;
  meanConfidenceDeltaPct: number;
  lastComputedAt: string;
}

export interface ActionPlanInput {
  decisionCardId: string;
  userId: string;
  orgId: string | null;
  title: string;
  summary: string | null;
  estimatedTimeHours: number | null;
  estimatedCostCents: number | null;
  steps: ActionStepInput[];
}

export interface ActionStepInput {
  stepOrder: number;
  title: string;
  description: string | null;
  stepType: string;
  requiredBeforeExecution: boolean;
  expectedOutput: string | null;
}

// ─── Execution section of DecisionCardComputation (from decision-infrastructure.ts) ──

interface DecisionExecution {
  suggestedOffer: number | null;
  negotiationScript: string;
  listingTitle: string;
  listingDescription: string;
  bestPlatform: string;
  repricingRule: string;
  stopLossRule: string;
}

interface DecisionFinancials {
  askingPrice: number;
  expectedRoiPct: number;
  expectedTotalCost: number;
}

interface DecisionCard {
  decision: { action: string; rationale: string[] };
  execution: DecisionExecution;
  financials: DecisionFinancials;
  confidence: { confidencePct: number; missingInformation: string[] };
  opportunity: { title: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── LearningEngine ───────────────────────────────────────────────────────────

export class LearningEngine {
  constructor(private readonly db: VLHPersistenceAdapter) {}

  // ─── Compute learning from outcome ──────────────────────────────────────────

  computeLearning(input: LearningOutcomeInput): LearningResult {
    const predicted = input.predicted.netProfitMid;
    const realized = input.actual.realizedNetProfit;

    const predictionError = round2(realized - predicted);
    const absoluteError = Math.abs(predictionError);
    const denom = Math.max(1, Math.abs(predicted));
    const calibrationErrorPct = round2((absoluteError / denom) * 100);

    const holdDays = input.actual.holdDays ?? 14;
    const realizedDir = realized >= 0 ? 1 : -1;
    const predictedDir = predicted >= 0 ? 1 : -1;
    const confidenceDeltaPct = round2(
      (realizedDir === predictedDir ? 1 : -1) * clamp(calibrationErrorPct, 0, 100),
    );

    const biasPct = round2((predictionError / denom) * 100);
    const directionMatch = realizedDir === predictedDir;

    const summary: string[] = [
      `Predicted net ${predicted.toFixed(2)} vs realized ${realized.toFixed(2)}.`,
      `Prediction error ${predictionError >= 0 ? '+' : ''}${predictionError.toFixed(2)} (${calibrationErrorPct.toFixed(1)}% of predicted).`,
      `Hold duration ${holdDays} day${holdDays !== 1 ? 's' : ''}.`,
      directionMatch
        ? `Direction correct (${predicted >= 0 ? 'profit' : 'loss'} predicted, ${realized >= 0 ? 'profit' : 'loss'} realized).`
        : `Direction incorrect — system predicted ${predicted >= 0 ? 'profit' : 'loss'} but outcome was ${realized >= 0 ? 'profit' : 'loss'}.`,
      `Confidence delta: ${biasPct >= 0 ? '+' : ''}${biasPct.toFixed(1)}%.`,
    ];

    return { predictionError, absoluteError, calibrationErrorPct, confidenceDeltaPct, summary };
  }

  // ─── Persist learning snapshot ──────────────────────────────────────────────

  async recordLearning(input: LearningOutcomeInput): Promise<string> {
    const learning = this.computeLearning(input);

    const predicted: Record<string, unknown> = {
      netProfitMid: input.predicted.netProfitMid,
      expectedRoiPct: input.predicted.expectedRoiPct,
      confidencePct: input.predicted.confidencePct,
      riskScore: input.predicted.riskScore,
    };

    const actual: Record<string, unknown> = {
      realizedNetProfit: input.actual.realizedNetProfit,
      holdDays: input.actual.holdDays ?? null,
    };

    const learningPayload: Record<string, unknown> = {
      predictionError: learning.predictionError,
      absoluteError: learning.absoluteError,
      calibrationErrorPct: learning.calibrationErrorPct,
      confidenceDeltaPct: learning.confidenceDeltaPct,
      summary: learning.summary,
    };

    try {
      const row = await this.db.queryOne<{ id: string }>(
        `INSERT INTO nexus_learning_snapshots
           (org_id, user_id, decision_card_id,
            predicted_json, actual_json, learning_json, calibration_error_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          input.orgId,
          input.userId,
          input.decisionCardId,
          JSON.stringify(predicted),
          JSON.stringify(actual),
          JSON.stringify(learningPayload),
          learning.calibrationErrorPct,
        ],
      );
      return row?.id ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // ─── Aggregate calibration profile ──────────────────────────────────────────

  /**
   * Compute the calibration profile for a user from their last N outcomes.
   * Returns null if fewer than 3 outcomes exist (not enough signal).
   */
  async getCalibrationProfile(
    userId: string,
    orgId: string | null,
    limit = 50,
  ): Promise<CalibrationProfile | null> {
    try {
      const row = await this.db.queryOne<CalibrationAggRow>(
        `SELECT
           COUNT(*) AS sample_size,
           AVG((learning_json->>'predictionError')::numeric /
               NULLIF(ABS((predicted_json->>'netProfitMid')::numeric), 0) * 100
           ) AS mean_prediction_bias_pct,
           AVG((learning_json->>'calibrationErrorPct')::numeric) AS mean_calibration_error_pct,
           AVG((learning_json->>'confidenceDeltaPct')::numeric) AS mean_confidence_delta_pct,
           MAX(created_at) AS last_computed_at
         FROM (
           SELECT learning_json, predicted_json, actual_json, created_at
           FROM nexus_learning_snapshots
           WHERE user_id = $1
             AND ($2::uuid IS NULL OR org_id = $2)
           ORDER BY created_at DESC
           LIMIT $3
         ) sub`,
        [userId, orgId, limit],
      );

      if (!row) return null;

      const sampleSize = Number(row.sample_size ?? 0);
      if (sampleSize < 3) return null;

      return {
        sampleSize,
        meanPredictionBiasPct: round2(Number(row.mean_prediction_bias_pct ?? 0)),
        meanCalibrationErrorPct: round2(Number(row.mean_calibration_error_pct ?? 0)),
        meanConfidenceDeltaPct: round2(Number(row.mean_confidence_delta_pct ?? 0)),
        lastComputedAt: row.last_computed_at ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  // ─── Recent outcomes for context ────────────────────────────────────────────

  async getRecentOutcomes(
    userId: string,
    limit = 10,
  ): Promise<{ calibrationErrorPct: number; createdAt: string }[]> {
    try {
      const rows = await this.db.queryRows<LearningSnapshotRow>(
        `SELECT calibration_error_pct, created_at
         FROM nexus_learning_snapshots
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit],
      );

      return rows.map((r) => ({
        calibrationErrorPct: Number(r.calibration_error_pct),
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  }
}

// ─── ActionPlanBuilder ────────────────────────────────────────────────────────

/**
 * Converts a DecisionCardComputation's `execution` section into a
 * structured ActionPlanInput ready for DB insertion.
 *
 * The execution steps from decision-infrastructure.ts are mapped to
 * vlh_action_steps with appropriate step types.
 */
export class ActionPlanBuilder {
  constructor(private readonly db: VLHPersistenceAdapter) {}

  /**
   * Build and persist an ActionPlan from a flip DecisionCardComputation.
   * Returns the created action plan ID.
   */
  async createFromFlipCard(
    decisionCardId: string,
    userId: string,
    orgId: string | null,
    card: DecisionCard,
  ): Promise<string> {
    const plan = this.buildPlan(decisionCardId, userId, orgId, card);

    return this.db.transaction(async (client) => {
      const planRow = await client.query<{ id: string }>(
        `INSERT INTO vlh_action_plans
           (decision_card_id, user_id, org_id, title, summary,
            status, estimated_cost_cents)
         VALUES ($1, $2, $3, $4, $5, 'ready', $6)
         RETURNING id`,
        [
          plan.decisionCardId,
          plan.userId,
          plan.orgId,
          plan.title,
          plan.summary,
          plan.estimatedCostCents,
        ],
      );

      const planId = planRow.rows[0]?.id;
      if (!planId) throw new Error('Failed to insert action plan');

      for (const step of plan.steps) {
        await client.query(
          `INSERT INTO vlh_action_steps
             (action_plan_id, step_order, title, description,
              step_type, required_before_execution, expected_output)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            planId,
            step.stepOrder,
            step.title,
            step.description,
            step.stepType,
            step.requiredBeforeExecution,
            step.expectedOutput,
          ],
        );
      }

      return planId;
    });
  }

  private buildPlan(
    decisionCardId: string,
    userId: string,
    orgId: string | null,
    card: DecisionCard,
  ): ActionPlanInput {
    const { execution, financials, decision, opportunity } = card;
    const askingPriceDollars = (financials.askingPrice ?? 0).toFixed(2);
    const estimatedCostCents = Math.round((financials.expectedTotalCost ?? 0) * 100);

    const steps: ActionStepInput[] = [];
    let order = 1;

    // Step 1: Verify the item
    steps.push({
      stepOrder: order++,
      title: 'Verify item condition',
      description: execution.negotiationScript
        ? `Message seller: "${execution.negotiationScript}"`
        : 'Contact seller to verify condition before committing.',
      stepType: 'message',
      requiredBeforeExecution: true,
      expectedOutput: 'Confirmed condition, seller response.',
    });

    // Step 2: Negotiate or buy
    const offerStep = execution.suggestedOffer
      ? `Make an offer of $${execution.suggestedOffer.toFixed(2)}. If accepted, proceed. If asking $${askingPriceDollars} is fair per card analysis, buy at asking.`
      : `Buy at asking price of $${askingPriceDollars} per the Decision Card analysis.`;
    steps.push({
      stepOrder: order++,
      title: decision.action === 'OFFER' ? 'Negotiate and purchase' : 'Purchase item',
      description: offerStep,
      stepType: 'purchase',
      requiredBeforeExecution: false,
      expectedOutput: 'Item acquired at agreed price. Receipt or screenshot.',
    });

    // Step 3: Create listing
    steps.push({
      stepOrder: order++,
      title: 'Create listing',
      description: [
        `Platform: ${execution.bestPlatform}.`,
        `Title: ${execution.listingTitle}.`,
        execution.listingDescription
          ? `Description: ${execution.listingDescription}`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      stepType: 'listing',
      requiredBeforeExecution: false,
      expectedOutput: 'Listing published with title, photos, and price.',
    });

    // Step 4: Monitor and reprice
    steps.push({
      stepOrder: order++,
      title: 'Monitor and reprice if needed',
      description: execution.repricingRule,
      stepType: 'review',
      requiredBeforeExecution: false,
      expectedOutput: 'Item sold, or repriced per reprice rule.',
    });

    // Step 5: Stop-loss check
    steps.push({
      stepOrder: order++,
      title: 'Apply stop-loss rule',
      description: execution.stopLossRule,
      stepType: 'review',
      requiredBeforeExecution: false,
      expectedOutput: 'Resolved: sold or decision to hold/abandon.',
    });

    // Step 6: Log outcome
    steps.push({
      stepOrder: order++,
      title: 'Log outcome',
      description: 'Record actual sale price, total costs, time spent, and any notes. This feeds the learning loop.',
      stepType: 'log',
      requiredBeforeExecution: false,
      expectedOutput: 'Outcome logged with realized profit/loss.',
    });

    const rationaleText = Array.isArray(decision.rationale)
      ? decision.rationale.join(' ')
      : '';

    return {
      decisionCardId,
      userId,
      orgId,
      title: `${decision.action === 'BUY' ? 'Buy' : decision.action === 'OFFER' ? 'Negotiate & Buy' : 'Execute'}: ${opportunity.title}`.slice(0, 255),
      summary: rationaleText.slice(0, 500) || null,
      estimatedTimeHours: null, // User will fill in
      estimatedCostCents,
      steps,
    };
  }
}
