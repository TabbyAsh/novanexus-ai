import { z } from 'zod';
import type { UUID, Timestamp } from './types';

// ============================================================================
// Value Loop Catalog Types
// ============================================================================

export const ValueLoopSlugSchema = z.enum([
  'marketplace_flipping',
  'reselling',
  'affiliate_content',
  'digital_product',
  'service_arbitrage',
  'paper_trading_education',
  'tool_aggregation',
]);
export type ValueLoopSlug = z.infer<typeof ValueLoopSlugSchema>;

export const SkillLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type SkillLevel = z.infer<typeof SkillLevelSchema>;

export const LoopRiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type LoopRiskLevel = z.infer<typeof LoopRiskLevelSchema>;

export const SpeedToResultSchema = z.enum(['fast', 'medium', 'slow']);
export type SpeedToResult = z.infer<typeof SpeedToResultSchema>;

export interface VLHValueLoopType {
  id: UUID;
  slug: ValueLoopSlug;
  name: string;
  description: string | null;
  capitalRequiredMinCents: number;
  capitalRequiredMaxCents: number | null;
  timeRequiredMinHours: number;
  timeRequiredMaxHours: number | null;
  skillRequired: SkillLevel;
  riskLevel: LoopRiskLevel;
  speedToFirstResult: SpeedToResult;
  status: 'draft' | 'active' | 'deprecated';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VLHTemplateStep {
  order: number;
  title: string;
  description: string;
  stepType: ActionStepType;
  requiredBeforeExecution: boolean;
}

export interface VLHValueLoopTemplate {
  id: UUID;
  valueLoopTypeId: UUID;
  name: string;
  description: string | null;
  targetSkillLevel: SkillLevel;
  defaultSteps: VLHTemplateStep[];
  requiredTools: string[];
  successMetrics: Record<string, string>;
  riskWarnings: string[];
  status: 'draft' | 'active' | 'archived';
}

export const EnrollmentStatusSchema = z.enum([
  'exploring', 'active', 'paused', 'completed', 'abandoned',
]);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatusSchema>;

export interface VLHUserLoopEnrollment {
  id: UUID;
  userId: UUID;
  orgId: UUID | null;
  valueLoopTypeId: UUID;
  status: EnrollmentStatus;
  currentStage: string | null;
  reasonSelected: string | null;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// Decision Card VLH Extensions
// ============================================================================

export const DataCompletenessSchema = z.enum([
  'complete', 'partial', 'insufficient', 'unavailable',
]);
export type DataCompleteness = z.infer<typeof DataCompletenessSchema>;

/** Ordinal ordering: complete > partial > insufficient > unavailable */
export const DATA_COMPLETENESS_RANK: Record<DataCompleteness, number> = {
  complete: 3,
  partial: 2,
  insufficient: 1,
  unavailable: 0,
};

export function dataCompletenessAtLeast(
  actual: DataCompleteness,
  required: DataCompleteness,
): boolean {
  return DATA_COMPLETENESS_RANK[actual] >= DATA_COMPLETENESS_RANK[required];
}

export const TruthStateSchema = z.enum([
  'verified', 'estimated', 'uncertain', 'unavailable',
]);
export type TruthState = z.infer<typeof TruthStateSchema>;

export const VLHRecommendationSchema = z.enum([
  'execute', 'wait', 'pass', 'gather_more_data', 'blocked',
]);
export type VLHRecommendation = z.infer<typeof VLHRecommendationSchema>;

/** Maps the domain-level flip action to the VLH recommendation layer */
export function mapFlipActionToRecommendation(
  action: string,
  confidencePct: number,
): VLHRecommendation {
  if (action === 'BUY') return 'execute';
  if (action === 'OFFER') return confidencePct >= 55 ? 'execute' : 'wait';
  if (action === 'WAIT') return 'wait';
  if (action === 'SELL') return 'execute';
  return 'pass';
}

// ============================================================================
// Action Plan Types
// ============================================================================

export const ActionStepTypeSchema = z.enum([
  'research', 'message', 'purchase', 'listing', 'content',
  'analysis', 'wait', 'log', 'review',
]);
export type ActionStepType = z.infer<typeof ActionStepTypeSchema>;

export const ActionPlanStatusSchema = z.enum([
  'draft', 'ready', 'active', 'completed', 'cancelled', 'blocked',
]);
export type ActionPlanStatus = z.infer<typeof ActionPlanStatusSchema>;

export const ActionStepStatusSchema = z.enum([
  'pending', 'in_progress', 'completed', 'skipped', 'blocked', 'failed',
]);
export type ActionStepStatus = z.infer<typeof ActionStepStatusSchema>;

export interface VLHActionPlan {
  id: UUID;
  decisionCardId: UUID;
  userId: UUID;
  orgId: UUID | null;
  title: string;
  summary: string | null;
  status: ActionPlanStatus;
  estimatedTimeHours: number | null;
  estimatedCostCents: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  steps?: VLHActionStep[];
}

export interface VLHActionStep {
  id: UUID;
  actionPlanId: UUID;
  stepOrder: number;
  title: string;
  description: string | null;
  stepType: ActionStepType;
  status: ActionStepStatus;
  requiredBeforeExecution: boolean;
  expectedOutput: string | null;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
}

/** Input shape for creating a new action plan from a decision card computation */
export interface VLHActionPlanInput {
  decisionCardId: UUID;
  userId: UUID;
  orgId: UUID | null;
  title: string;
  summary: string | null;
  estimatedTimeHours: number | null;
  estimatedCostCents: number | null;
  steps: Omit<VLHActionStep, 'id' | 'actionPlanId' | 'status' | 'completedAt' | 'createdAt'>[];
}

// ============================================================================
// Policy & Governance Types
// ============================================================================

export const PolicyTypeSchema = z.enum([
  'risk_limit', 'data_requirement', 'financial_limit',
  'content_claim', 'execution_safety', 'platform_compliance',
]);
export type PolicyType = z.infer<typeof PolicyTypeSchema>;

export const EnforcementModeSchema = z.enum(['inform', 'warn', 'block']);
export type EnforcementMode = z.infer<typeof EnforcementModeSchema>;

/**
 * Structured policy rules stored in `vlh_loop_policies.rules_json`.
 * Each policy type uses a subset of these fields.
 */
export interface VLHPolicyRules {
  // execution_safety / risk_limit
  minConfidenceScore?: number;      // 0–1; block/warn if card.confidencePct < threshold
  maxRiskScore?: number;            // 0–1; block/warn if card.riskScore > threshold
  minDataCompleteness?: DataCompleteness;
  // financial_limit
  maxCapitalAtRiskCents?: number;
  maxActiveExecutionsCount?: number;
  consecutiveLossLimit?: number;
  // risk_limit (flip-specific)
  minExpectedRoiPct?: number;       // block/warn if expectedRoiPct < threshold
  // data_requirement
  requiredFields?: string[];
  requiredEvidenceCount?: number;
  // execution_safety
  requiresApproval?: boolean;
  cooldownAfterLossMs?: number;
  // arbitrary custom rules
  custom?: Record<string, unknown>;
}

export interface VLHLoopPolicy {
  id: UUID;
  orgId: UUID | null;
  name: string;
  policyType: PolicyType;
  /** null = applies to all loop types */
  loopTypeSlugs: ValueLoopSlug[] | null;
  rules: VLHPolicyRules;
  enforcementMode: EnforcementMode;
  status: 'active' | 'inactive' | 'archived';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const GovernanceResultSchema = z.enum([
  'allow', 'warn', 'block', 'needs_more_data',
]);
export type GovernanceResult = z.infer<typeof GovernanceResultSchema>;

export interface VLHPolicyResult {
  policyId: string;
  policyName: string;
  passed: boolean;
  enforcementMode: EnforcementMode;
  reason: string;
  value?: number | string | null;
  threshold?: number | string | null;
}

export interface VLHGovernanceCheck {
  id: UUID;
  orgId: UUID | null;
  userId: UUID | null;
  entityType: 'opportunity' | 'decision_card' | 'action_plan' | 'execution_run';
  entityId: UUID;
  result: GovernanceResult;
  summary: string | null;
  policyResults: VLHPolicyResult[];
  createdAt: Timestamp;
}

// ============================================================================
// Learning & Calibration Types
// ============================================================================

export interface VLHCalibrationProfile {
  sampleSize: number;
  meanPredictionBiasPct: number;
  meanCalibrationErrorPct: number;
  meanConfidenceDeltaPct: number;
  lastComputedAt: Timestamp;
}

export interface VLHLearningSnapshotInput {
  orgId: UUID | null;
  userId: UUID | null;
  decisionCardId: UUID;
  predicted: Record<string, unknown>;
  actual: Record<string, unknown>;
  learning: {
    predictionError: number;
    absoluteError: number;
    calibrationErrorPct: number;
    confidenceDeltaPct: number;
    summary: string[];
  };
}

export interface VLHLearningSnapshot extends VLHLearningSnapshotInput {
  id: UUID;
  calibrationErrorPct: number;
  createdAt: Timestamp;
}

// ============================================================================
// Opportunity VLH Extension
// ============================================================================

export interface VLHOpportunityExtension {
  valueLoopTypeId: UUID | null;
  title: string | null;
  description: string | null;
  status: 'new' | 'scored' | 'selected' | 'rejected' | 'archived';
  fitScore: number | null;
  confidenceScore: number | null;
  dataCompleteness: DataCompleteness;
  estimatedRevenueMinCents: number | null;
  estimatedRevenueMaxCents: number | null;
  requiredCapitalCents: number | null;
}
