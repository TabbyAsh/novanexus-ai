/**
 * VLH Governance Engine
 * =====================
 * Reads loop policies from the database, evaluates them against a
 * Decision Card or Opportunity, and writes an auditable GovernanceCheck.
 *
 * Policy evaluation is explicit, transparent, and fail-closed:
 * - If any BLOCK policy fails  → result is 'block'
 * - If data is insufficient    → result is 'needs_more_data'
 * - If any WARN policy fails   → result is 'warn'
 * - All policies pass          → result is 'allow'
 *
 * The engine uses built-in fallback defaults when no DB policies exist,
 * so it works correctly even before the first migration.
 */

import type { VLHPersistenceAdapter } from './persistence';

// ─── Internal DB row shapes ──────────────────────────────────────────────────

interface PolicyRow {
  id: string;
  name: string;
  policy_type: string;
  loop_type_slugs_json: string | null;
  rules_json: string;
  enforcement_mode: string;
}

// ─── Public input / output types ─────────────────────────────────────────────

export type GovernanceEntityType =
  | 'opportunity'
  | 'decision_card'
  | 'action_plan'
  | 'execution_run';

export type GovernanceResultValue = 'allow' | 'warn' | 'block' | 'needs_more_data';
export type EnforcementModeValue = 'inform' | 'warn' | 'block';

export interface PolicyRuleSet {
  minConfidenceScore?: number;
  maxRiskScore?: number;
  minDataCompleteness?: string;
  maxCapitalAtRiskCents?: number;
  maxActiveExecutionsCount?: number;
  consecutiveLossLimit?: number;
  minExpectedRoiPct?: number;
  requiredFields?: string[];
  requiredEvidenceCount?: number;
  requiresApproval?: boolean;
  cooldownAfterLossMs?: number;
  custom?: Record<string, unknown>;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  policyType: string;
  loopTypeSlugs: string[] | null;
  rules: PolicyRuleSet;
  enforcementMode: EnforcementModeValue;
}

export interface PolicyCheckResult {
  policyId: string;
  policyName: string;
  passed: boolean;
  enforcementMode: EnforcementModeValue;
  reason: string;
  value?: number | string | null;
  threshold?: number | string | null;
}

export interface GovernanceCheckInput {
  entityType: GovernanceEntityType;
  entityId: string;
  orgId: string | null;
  userId: string | null;
  loopTypeSlug: string | null;
  /** 0–100, as stored in nexus_decision_cards.confidence_pct */
  confidencePct: number;
  /** 0–1 */
  riskScore: number | null;
  /** 'complete' | 'partial' | 'insufficient' | 'unavailable' */
  dataCompleteness: string;
  /** Expected ROI %, from financials */
  expectedRoiPct?: number | null;
  /** Capital required in cents */
  requiredCapitalCents?: number | null;
  /** Any fields that are missing/null that should trigger data-gap warnings */
  missingFields?: string[];
}

export interface GovernanceCheckOutput {
  result: GovernanceResultValue;
  summary: string;
  policyResults: PolicyCheckResult[];
  /** DB-persisted record ID (if persistCheck was called) */
  checkId?: string;
}

// ─── DATA_COMPLETENESS ordering ──────────────────────────────────────────────

const COMPLETENESS_RANK: Record<string, number> = {
  complete: 3,
  partial: 2,
  insufficient: 1,
  unavailable: 0,
};

function completenessAtLeast(actual: string, required: string): boolean {
  return (COMPLETENESS_RANK[actual] ?? 0) >= (COMPLETENESS_RANK[required] ?? 0);
}

// ─── Built-in fallback policies ───────────────────────────────────────────────
// Used when vlh_loop_policies has no rows (pre-seed or test environment).

const BUILTIN_POLICIES: PolicyDefinition[] = [
  {
    id: 'builtin-confidence-block',
    name: 'Minimum Confidence to Execute (built-in)',
    policyType: 'execution_safety',
    loopTypeSlugs: null,
    rules: { minConfidenceScore: 0.55 },
    enforcementMode: 'block',
  },
  {
    id: 'builtin-confidence-warn',
    name: 'Low Confidence Warning (built-in)',
    policyType: 'execution_safety',
    loopTypeSlugs: null,
    rules: { minConfidenceScore: 0.35 },
    enforcementMode: 'warn',
  },
  {
    id: 'builtin-data-block',
    name: 'Insufficient Data Block (built-in)',
    policyType: 'data_requirement',
    loopTypeSlugs: null,
    rules: { minDataCompleteness: 'partial' },
    enforcementMode: 'block',
  },
  {
    id: 'builtin-risk-warn',
    name: 'High Risk Score Warning (built-in)',
    policyType: 'risk_limit',
    loopTypeSlugs: null,
    rules: { maxRiskScore: 0.7 },
    enforcementMode: 'warn',
  },
  {
    id: 'builtin-risk-block',
    name: 'Critical Risk Score Block (built-in)',
    policyType: 'risk_limit',
    loopTypeSlugs: null,
    rules: { maxRiskScore: 0.85 },
    enforcementMode: 'block',
  },
];

// ─── GovernanceEngine ─────────────────────────────────────────────────────────

export class GovernanceEngine {
  constructor(private readonly db: VLHPersistenceAdapter) {}

  // ─── Policy loading ─────────────────────────────────────────────────────────

  /**
   * Load applicable policies from DB for the given org and loop type.
   * Falls back to built-in defaults if no DB policies are found.
   */
  async loadPolicies(
    orgId: string | null,
    loopTypeSlug: string | null,
  ): Promise<PolicyDefinition[]> {
    try {
      const rows = await this.db.queryRows<PolicyRow>(
        `SELECT id, name, policy_type, loop_type_slugs_json, rules_json, enforcement_mode
         FROM vlh_loop_policies
         WHERE status = 'active'
           AND (org_id IS NULL OR org_id = $1)
         ORDER BY org_id NULLS LAST, id`,
        [orgId ?? null],
      );

      if (rows.length === 0) {
        return BUILTIN_POLICIES;
      }

      const parsed: PolicyDefinition[] = rows
        .map((row) => {
          let rules: PolicyRuleSet = {};
          let slugs: string[] | null = null;
          try {
            rules = JSON.parse(row.rules_json) as PolicyRuleSet;
          } catch {
            // ignore malformed rules
          }
          try {
            if (row.loop_type_slugs_json) {
              slugs = JSON.parse(row.loop_type_slugs_json) as string[];
            }
          } catch {
            // ignore
          }
          return {
            id: row.id,
            name: row.name,
            policyType: row.policy_type,
            loopTypeSlugs: slugs,
            rules,
            enforcementMode: row.enforcement_mode as EnforcementModeValue,
          };
        })
        .filter((p) => {
          // Filter to policies that apply to this loop type (or all loops)
          if (!p.loopTypeSlugs || p.loopTypeSlugs.length === 0) return true;
          if (!loopTypeSlug) return true;
          return p.loopTypeSlugs.includes(loopTypeSlug);
        });

      return parsed.length > 0 ? parsed : BUILTIN_POLICIES;
    } catch {
      // DB unavailable — use built-ins to fail closed safely
      return BUILTIN_POLICIES;
    }
  }

  // ─── Policy evaluation ──────────────────────────────────────────────────────

  /**
   * Evaluate a single policy against card/opportunity data.
   */
  private evaluatePolicy(
    policy: PolicyDefinition,
    input: GovernanceCheckInput,
  ): PolicyCheckResult {
    const r = policy.rules;
    // Confidence check (rules store 0–1; input is 0–100)
    const confidenceNorm = input.confidencePct / 100;

    if (r.minConfidenceScore !== undefined) {
      if (confidenceNorm < r.minConfidenceScore) {
        return {
          policyId: policy.id,
          policyName: policy.name,
          passed: false,
          enforcementMode: policy.enforcementMode,
          reason: `Confidence ${input.confidencePct.toFixed(0)}% is below required ${(r.minConfidenceScore * 100).toFixed(0)}%.`,
          value: confidenceNorm,
          threshold: r.minConfidenceScore,
        };
      }
    }

    if (r.maxRiskScore !== undefined && input.riskScore !== null && input.riskScore !== undefined) {
      if (input.riskScore > r.maxRiskScore) {
        return {
          policyId: policy.id,
          policyName: policy.name,
          passed: false,
          enforcementMode: policy.enforcementMode,
          reason: `Risk score ${input.riskScore.toFixed(2)} exceeds limit ${r.maxRiskScore.toFixed(2)}.`,
          value: input.riskScore,
          threshold: r.maxRiskScore,
        };
      }
    }

    if (r.minDataCompleteness !== undefined) {
      if (!completenessAtLeast(input.dataCompleteness, r.minDataCompleteness)) {
        return {
          policyId: policy.id,
          policyName: policy.name,
          passed: false,
          enforcementMode: policy.enforcementMode,
          reason: `Data completeness '${input.dataCompleteness}' does not meet required level '${r.minDataCompleteness}'.`,
          value: input.dataCompleteness,
          threshold: r.minDataCompleteness,
        };
      }
    }

    if (
      r.minExpectedRoiPct !== undefined &&
      input.expectedRoiPct !== null &&
      input.expectedRoiPct !== undefined
    ) {
      if (input.expectedRoiPct < r.minExpectedRoiPct) {
        return {
          policyId: policy.id,
          policyName: policy.name,
          passed: false,
          enforcementMode: policy.enforcementMode,
          reason: `Expected ROI ${input.expectedRoiPct.toFixed(1)}% is below minimum ${r.minExpectedRoiPct}%.`,
          value: input.expectedRoiPct,
          threshold: r.minExpectedRoiPct,
        };
      }
    }

    if (
      r.maxCapitalAtRiskCents !== undefined &&
      input.requiredCapitalCents !== null &&
      input.requiredCapitalCents !== undefined
    ) {
      if (input.requiredCapitalCents > r.maxCapitalAtRiskCents) {
        return {
          policyId: policy.id,
          policyName: policy.name,
          passed: false,
          enforcementMode: policy.enforcementMode,
          reason: `Capital at risk $${(input.requiredCapitalCents / 100).toFixed(2)} exceeds limit $${(r.maxCapitalAtRiskCents / 100).toFixed(2)}.`,
          value: input.requiredCapitalCents,
          threshold: r.maxCapitalAtRiskCents,
        };
      }
    }

    if (r.requiredFields && input.missingFields) {
      const missingRequired = r.requiredFields.filter((f) =>
        input.missingFields!.includes(f),
      );
      if (missingRequired.length > 0) {
        return {
          policyId: policy.id,
          policyName: policy.name,
          passed: false,
          enforcementMode: policy.enforcementMode,
          reason: `Required fields missing: ${missingRequired.join(', ')}.`,
          value: missingRequired.join(', '),
          threshold: r.requiredFields.join(', '),
        };
      }
    }

    return {
      policyId: policy.id,
      policyName: policy.name,
      passed: true,
      enforcementMode: policy.enforcementMode,
      reason: 'Policy passed.',
    };
  }

  // ─── Aggregate result ───────────────────────────────────────────────────────

  private aggregateResult(
    policyResults: PolicyCheckResult[],
    dataCompleteness: string,
  ): GovernanceResultValue {
    const failed = policyResults.filter((r) => !r.passed);

    // Data insufficient always becomes needs_more_data regardless of enforcement
    if (
      dataCompleteness === 'insufficient' ||
      dataCompleteness === 'unavailable'
    ) {
      return 'needs_more_data';
    }

    if (failed.some((r) => r.enforcementMode === 'block')) {
      return 'block';
    }

    // needs_more_data from policy rules
    const missingDataFailures = failed.filter(
      (r) => r.policyName.toLowerCase().includes('data') || r.reason.toLowerCase().includes('missing'),
    );
    if (missingDataFailures.length > 0 && !failed.some((r) => r.enforcementMode === 'block')) {
      return 'needs_more_data';
    }

    if (failed.some((r) => r.enforcementMode === 'warn')) {
      return 'warn';
    }

    return 'allow';
  }

  // ─── Persist check ──────────────────────────────────────────────────────────

  /**
   * Write the completed governance check to the database.
   * Returns the inserted row ID.
   */
  async persistCheck(
    input: GovernanceCheckInput,
    result: GovernanceResultValue,
    summary: string,
    policyResults: PolicyCheckResult[],
  ): Promise<string> {
    try {
      const row = await this.db.queryOne<{ id: string }>(
        `INSERT INTO vlh_governance_checks
           (org_id, user_id, entity_type, entity_id, result, summary, policy_results_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          input.orgId,
          input.userId,
          input.entityType,
          input.entityId,
          result,
          summary,
          JSON.stringify(policyResults),
        ],
      );
      return row?.id ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // ─── Main entry point ───────────────────────────────────────────────────────

  /**
   * Evaluate all applicable policies for the given entity and persist the check.
   *
   * @returns GovernanceCheckOutput with result, summary, and per-policy results.
   */
  async evaluate(input: GovernanceCheckInput): Promise<GovernanceCheckOutput> {
    const policies = await this.loadPolicies(input.orgId, input.loopTypeSlug);
    const policyResults: PolicyCheckResult[] = policies.map((p) =>
      this.evaluatePolicy(p, input),
    );

    const result = this.aggregateResult(policyResults, input.dataCompleteness);

    const failedNames = policyResults
      .filter((r) => !r.passed)
      .map((r) => r.policyName);

    const summary =
      result === 'allow'
        ? 'All governance checks passed.'
        : result === 'needs_more_data'
        ? 'Insufficient data to evaluate this decision safely.'
        : result === 'block'
        ? `Execution blocked. Failed: ${failedNames.join('; ')}.`
        : `Warnings present. Review before executing: ${failedNames.join('; ')}.`;

    const checkId = await this.persistCheck(input, result, summary, policyResults);

    return { result, summary, policyResults, checkId };
  }

  /**
   * Evaluate without persisting — useful for pre-flight checks during card creation.
   */
  async evaluateDry(input: GovernanceCheckInput): Promise<GovernanceCheckOutput> {
    const policies = await this.loadPolicies(input.orgId, input.loopTypeSlug);
    const policyResults = policies.map((p) => this.evaluatePolicy(p, input));
    const result = this.aggregateResult(policyResults, input.dataCompleteness);

    const failedNames = policyResults
      .filter((r) => !r.passed)
      .map((r) => r.policyName);

    const summary =
      result === 'allow'
        ? 'All governance checks passed.'
        : result === 'needs_more_data'
        ? 'Insufficient data to evaluate this decision safely.'
        : result === 'block'
        ? `Execution blocked. Failed: ${failedNames.join('; ')}.`
        : `Warnings present. Review before executing: ${failedNames.join('; ')}.`;

    return { result, summary, policyResults };
  }
}
