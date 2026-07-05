import { z } from 'zod';

// ============================================================================
// @nova/agent-contracts — typed contracts for the Nova Forge agent layer.
//
// Design rules (Phase 0, "fake nothing"):
// - Every payload that crosses a service boundary has a schema here.
// - Schemas are strict(): unknown keys are rejected, so nothing can smuggle
//   a `shell: true` or `cmd: "..."` past the broker.
// - Commands are argv arrays only. There is intentionally NO schema that
//   accepts a raw shell string.
// ============================================================================

// ============================================
// Risk tiers
// ============================================

export const RiskTierSchema = z.enum(['T0', 'T1', 'T2', 'T3']);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const RISK_TIER_ORDER: Record<RiskTier, number> = {
  T0: 0, // read-only
  T1: 1, // workspace-write
  T2: 2, // stateful-in-sandbox (installs, sandbox services)
  T3: 3, // external / destructive — always human-approved
};

export function riskTierAtMost(tier: RiskTier, max: RiskTier): boolean {
  return RISK_TIER_ORDER[tier] <= RISK_TIER_ORDER[max];
}

// ============================================
// Automation modes (mirror of @nova/shared AUTOMATION_MODES, uppercase)
// ============================================

export const ForgeModeSchema = z.enum(['RECOMMEND', 'ASSIST', 'AUTOMATE']);
export type ForgeMode = z.infer<typeof ForgeModeSchema>;

// ============================================
// Personas (the agent roster)
// ============================================

export const PersonaSlugSchema = z.enum([
  'intake-agent',
  'architect-agent',
  'repo-analyst-agent',
  'coder-agent',
  'test-agent',
  'debug-agent',
  'refactor-agent',
  'research-agent',
  'product-agent',
  'docs-agent',
  'reviewer-agent',
  'toolsmith-agent',
  'release-agent',
]);
export type PersonaSlug = z.infer<typeof PersonaSlugSchema>;

export const PersonaCategorySchema = z.enum(['read_only', 'builder', 'gated']);
export type PersonaCategory = z.infer<typeof PersonaCategorySchema>;

export const PersonaSchema = z
  .object({
    slug: PersonaSlugSchema,
    name: z.string().min(1).max(80),
    category: PersonaCategorySchema,
    description: z.string().max(2000).default(''),
    // Highest tier this persona may be auto-granted. T3 is never auto-granted
    // to anyone; a T3 maxAutoTier is rejected at the schema level.
    maxAutoTier: z.enum(['T0', 'T1', 'T2']),
    enabled: z.boolean().default(true),
  })
  .strict();
export type Persona = z.infer<typeof PersonaSchema>;

export const PromptVersionStatusSchema = z.enum([
  'draft',
  'candidate',
  'canary',
  'active',
  'retired',
]);
export type PromptVersionStatus = z.infer<typeof PromptVersionStatusSchema>;

export const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const PromptVersionSchema = z
  .object({
    personaSlug: PersonaSlugSchema,
    semver: z.string().regex(SEMVER_REGEX, 'must be semver x.y.z'),
    promptText: z.string().min(1),
    changelog: z.string().max(4000).default(''),
    authorType: z.enum(['human', 'agent']),
    status: PromptVersionStatusSchema.default('draft'),
  })
  .strict();
export type PromptVersion = z.infer<typeof PromptVersionSchema>;

// ============================================
// Branch namespace
// ============================================

export const FORGE_BRANCH_PREFIX = 'forge/';

export function isForgeBranch(branch: string): boolean {
  return branch.startsWith(FORGE_BRANCH_PREFIX) && branch.length > FORGE_BRANCH_PREFIX.length;
}

export const ForgeBranchSchema = z
  .string()
  .min(FORGE_BRANCH_PREFIX.length + 1)
  .max(200)
  .refine(isForgeBranch, { message: `branch must start with '${FORGE_BRANCH_PREFIX}'` });

// ============================================
// Budgets
// ============================================

export const BudgetSchema = z
  .object({
    maxTokens: z.number().int().positive().max(10_000_000).default(250_000),
    maxCommands: z.number().int().positive().max(2_000).default(200),
    maxUsd: z.number().positive().max(500).default(5),
    maxWallClockMs: z
      .number()
      .int()
      .positive()
      .max(6 * 60 * 60 * 1000)
      .default(30 * 60 * 1000),
  })
  .strict();
export type Budget = z.infer<typeof BudgetSchema>;

// ============================================
// Command broker (CmdX) contracts
// ============================================

export const CommandDecisionSchema = z.enum(['ALLOW', 'DENY', 'NEEDS_APPROVAL']);
export type CommandDecision = z.infer<typeof CommandDecisionSchema>;

/**
 * A request to run one command inside a sandbox workspace.
 * argv-only by construction: there is no field that accepts a shell string,
 * and unknown fields (e.g. `shell`, `cmd`, `script`) are rejected by strict().
 */
export const CommandRequestSchema = z
  .object({
    workspaceId: z.string().uuid().nullish(),
    subtaskId: z.string().uuid().nullish(),
    taskId: z.string().uuid().nullish(),
    personaSlug: PersonaSlugSchema,
    argv: z.array(z.string().min(1).max(4096)).min(1).max(64),
    cwd: z.string().min(1).max(1024).default('.'),
    timeoutMs: z
      .number()
      .int()
      .min(100)
      .max(30 * 60 * 1000)
      .default(120_000),
    riskTierRequested: RiskTierSchema.default('T0'),
    expectedEffects: z.array(z.string().max(300)).max(20).default([]),
    /** Names of env vars requested for the sandbox. Resolved broker-side
     *  against a hard allowlist; secrets never pass through. */
    envRefs: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).max(32).default([]),
    dryRun: z.boolean().default(false),
  })
  .strict();
export type CommandRequest = z.infer<typeof CommandRequestSchema>;

export const PolicyStepSchema = z.enum([
  'kill_switch',
  'denylist',
  'classify',
  'grants',
  'org_policy',
  'rate_limit',
  'mode_gate',
  'default',
]);
export type PolicyStep = z.infer<typeof PolicyStepSchema>;

export const DecisionReasonSchema = z
  .object({
    step: PolicyStepSchema,
    code: z.string().min(1).max(80),
    detail: z.string().max(1000),
  })
  .strict();
export type DecisionReason = z.infer<typeof DecisionReasonSchema>;

export const CommandEvaluationSchema = z
  .object({
    decision: CommandDecisionSchema,
    resolvedTier: RiskTierSchema,
    ruleId: z.string().max(120).nullable(),
    reasons: z.array(DecisionReasonSchema).min(1),
  })
  .strict();
export type CommandEvaluation = z.infer<typeof CommandEvaluationSchema>;

export const ExecutionStatusSchema = z.enum([
  'NOT_EXECUTED', // denied / awaiting approval
  'DEFERRED', // allowed, but execution is disabled (Phase 0) or queued
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
  'KILLED',
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const CommandRecordSchema = z
  .object({
    id: z.string().uuid(),
    request: CommandRequestSchema,
    evaluation: CommandEvaluationSchema,
    execution: z
      .object({
        status: ExecutionStatusSchema,
        exitCode: z.number().int().nullable().default(null),
        stdoutRef: z.string().max(500).nullable().default(null),
        stderrRef: z.string().max(500).nullable().default(null),
        durationMs: z.number().int().nonnegative().nullable().default(null),
      })
      .strict(),
    createdAt: z.string(),
    decidedAt: z.string().nullable().default(null),
    executedAt: z.string().nullable().default(null),
  })
  .strict();
export type CommandRecord = z.infer<typeof CommandRecordSchema>;

// ============================================
// Task / plan / subtask contracts
// ============================================

export const TaskSpecSchema = z
  .object({
    title: z.string().min(1).max(255),
    goal: z.string().min(1).max(8000),
    acceptanceCriteria: z.array(z.string().min(1).max(1000)).min(1).max(50),
    constraints: z.array(z.string().max(1000)).max(50).default([]),
    nonGoals: z.array(z.string().max(1000)).max(50).default([]),
    mode: ForgeModeSchema.default('ASSIST'),
    budget: BudgetSchema.default({}),
    repo: z
      .object({
        remote: z.string().min(1).max(500),
        baseRef: z.string().min(1).max(200).default('master'),
      })
      .strict(),
  })
  .strict();
export type TaskSpec = z.infer<typeof TaskSpecSchema>;

export const ValidationCheckSchema = z
  .object({
    name: z.enum(['build', 'test', 'lint', 'typecheck', 'custom']),
    /** argv for `custom` checks; standard checks use repo scripts. */
    argv: z.array(z.string().min(1)).max(64).optional(),
    required: z.boolean().default(true),
  })
  .strict();
export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;

export const SubtaskSpecSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'kebab-case names only'),
    personaSlug: PersonaSlugSchema,
    description: z.string().min(1).max(4000),
    dependsOn: z.array(z.string().min(1).max(80)).max(32).default([]),
    /** Glob ownership boundaries; parallel subtasks must not overlap. */
    fileOwnership: z.array(z.string().min(1).max(300)).max(64).default([]),
    validation: z.array(ValidationCheckSchema).max(16).default([]),
    budget: BudgetSchema.partial().default({}),
  })
  .strict();
export type SubtaskSpec = z.infer<typeof SubtaskSpecSchema>;

function findDagError(subtasks: SubtaskSpec[]): string | null {
  const names = new Set(subtasks.map((s) => s.name));
  if (names.size !== subtasks.length) return 'duplicate subtask names';
  for (const s of subtasks) {
    for (const dep of s.dependsOn) {
      if (dep === s.name) return `subtask '${s.name}' depends on itself`;
      if (!names.has(dep)) return `subtask '${s.name}' depends on unknown '${dep}'`;
    }
  }
  // Kahn's algorithm: detect cycles.
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const s of subtasks) {
    indegree.set(s.name, s.dependsOn.length);
    for (const dep of s.dependsOn) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), s.name]);
    }
  }
  const queue = subtasks.filter((s) => s.dependsOn.length === 0).map((s) => s.name);
  let visited = 0;
  while (queue.length > 0) {
    const n = queue.shift() as string;
    visited += 1;
    for (const m of dependents.get(n) ?? []) {
      const d = (indegree.get(m) ?? 0) - 1;
      indegree.set(m, d);
      if (d === 0) queue.push(m);
    }
  }
  if (visited !== subtasks.length) return 'dependency cycle detected';
  return null;
}

export const PlanSchema = z
  .object({
    version: z.number().int().positive().default(1),
    notes: z.string().max(8000).default(''),
    subtasks: z.array(SubtaskSpecSchema).min(1).max(64),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const err = findDagError(plan.subtasks);
    if (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ['subtasks'] });
    }
  });
export type Plan = z.infer<typeof PlanSchema>;

// ============================================
// Workspaces, artifacts, approvals
// ============================================

export const WorkspaceStatusSchema = z.enum([
  'PROVISIONING',
  'READY',
  'ACTIVE',
  'DESTROYED',
]);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const WorkspaceSchema = z
  .object({
    id: z.string().uuid(),
    taskId: z.string().uuid().nullish(),
    subtaskId: z.string().uuid().nullish(),
    branch: ForgeBranchSchema,
    baseRef: z.string().min(1).max(200),
    containerId: z.string().max(128).nullable().default(null),
    status: WorkspaceStatusSchema,
  })
  .strict();
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ArtifactKindSchema = z.enum(['DIFF', 'REPORT', 'BRIEF', 'LOG', 'FILE', 'PLAN']);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ArtifactSchema = z
  .object({
    id: z.string().uuid(),
    taskId: z.string().uuid().nullish(),
    subtaskId: z.string().uuid().nullish(),
    kind: ArtifactKindSchema,
    /** Storage locator, e.g. minio://forge-artifacts/<key> */
    storageRef: z.string().min(1).max(500),
    meta: z.record(z.unknown()).default({}),
  })
  .strict();
export type Artifact = z.infer<typeof ArtifactSchema>;

export const ApprovalKindSchema = z.enum([
  'PLAN',
  'DIFF',
  'COMMAND',
  'PROMOTION',
  'BUDGET',
  'TOOL_GRANT',
]);
export type ApprovalKind = z.infer<typeof ApprovalKindSchema>;

export const ApprovalStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
export type ForgeApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z
  .object({
    kind: ApprovalKindSchema,
    taskId: z.string().uuid().nullish(),
    subtaskId: z.string().uuid().nullish(),
    commandRequestId: z.string().uuid().nullish(),
    requestedByPersona: PersonaSlugSchema,
    summary: z.string().min(1).max(2000),
    payload: z.record(z.unknown()).default({}),
  })
  .strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

// ============================================
// Forge task lifecycle (mirrors orchestrator vocabulary)
// ============================================

export const ForgeTaskStatusSchema = z.enum([
  'NEW',
  'PLANNED',
  'EXECUTING',
  'REVIEW',
  'COMPLETE',
  'BLOCKED',
  'CANCELLED',
]);
export type ForgeTaskStatus = z.infer<typeof ForgeTaskStatusSchema>;

export const ForgeSubtaskStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'NEEDS_APPROVAL',
  'DONE',
  'FAILED',
  'RETRYING',
]);
export type ForgeSubtaskStatus = z.infer<typeof ForgeSubtaskStatusSchema>;
