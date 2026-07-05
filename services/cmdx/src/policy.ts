import {
  type CommandRequest,
  type CommandEvaluation,
  type DecisionReason,
  type ForgeMode,
  type RiskTier,
  RISK_TIER_ORDER,
} from '@nova/agent-contracts';
import { checkDenylist } from './denylist';
import { classifyCommand, type CommandRule } from './rules';

// ============================================================================
// The CmdX decision pipeline. A single PURE function so it can be exhaustively
// unit-tested with no database, no Docker, no clock. All dynamic state is
// passed in via PolicyInputs.
//
// Order is load-bearing and fail-closed:
//   1. kill switch         -> DENY everything
//   2. static denylist     -> DENY (categorical)
//   3. allowlist classify  -> unmatched => NEEDS_APPROVAL (never ALLOW)
//   4. grants / max tier   -> tier above persona grant => NEEDS_APPROVAL
//   5. rate limits         -> DENY when exhausted
//   6. mode gate           -> RECOMMEND/ASSIST/AUTOMATE tier ceilings
//   T3 is ALWAYS NEEDS_APPROVAL regardless of mode/grant/trust.
// ============================================================================

export interface PolicyInputs {
  request: CommandRequest;
  mode: ForgeMode;
  killSwitchEnabled: boolean;
  rules: CommandRule[];
  protectedPaths: string[];
  /** Highest tier this persona may run without human approval (T0..T2). */
  personaMaxAutoTier: RiskTier;
  rateLimit: {
    commandsThisRun: number;
    maxCommandsPerRun: number;
    commandsThisMinute: number;
    maxCommandsPerMinute: number;
    consecutiveFailures: number;
    circuitBreakerThreshold: number;
  };
}

function reason(step: DecisionReason['step'], code: string, detail: string): DecisionReason {
  return { step, code, detail };
}

/** Tier ceiling permitted to auto-run in each mode. T3 is never auto. */
const MODE_AUTO_CEILING: Record<ForgeMode, RiskTier> = {
  RECOMMEND: 'T0', // proposals only; even writes need approval
  ASSIST: 'T2', // full sandbox execution; push/merge (T3) still gated
  AUTOMATE: 'T2', // same execution ceiling; auto-merge handled outside CmdX
};

function tierLoE(a: RiskTier, b: RiskTier): boolean {
  return RISK_TIER_ORDER[a] <= RISK_TIER_ORDER[b];
}

export function evaluateCommand(inputs: PolicyInputs): CommandEvaluation {
  const { request, mode, killSwitchEnabled, rules, protectedPaths, personaMaxAutoTier, rateLimit } =
    inputs;
  const reasons: DecisionReason[] = [];

  // --- Step 1: kill switch --------------------------------------------------
  if (killSwitchEnabled) {
    return {
      decision: 'DENY',
      resolvedTier: request.riskTierRequested,
      ruleId: null,
      reasons: [reason('kill_switch', 'KILL_SWITCH_ENABLED', 'global kill switch is engaged')],
    };
  }

  // --- Step 2: static denylist ---------------------------------------------
  const deny = checkDenylist(request.argv, protectedPaths);
  if (deny) {
    return {
      decision: 'DENY',
      resolvedTier: request.riskTierRequested,
      ruleId: null,
      reasons: [reason('denylist', deny.code, deny.detail)],
    };
  }

  // --- Step 3: allowlist classification ------------------------------------
  const classification = classifyCommand(request.argv, rules);
  if (!classification) {
    // Fail closed: unknown commands are never auto-allowed.
    return {
      decision: 'NEEDS_APPROVAL',
      resolvedTier: 'T3',
      ruleId: null,
      reasons: [
        reason('default', 'NO_MATCHING_RULE', 'command matches no allowlist rule; defaulting to approval'),
      ],
    };
  }
  const resolvedTier = classification.tier;
  reasons.push(reason('classify', 'MATCHED_RULE', `matched '${classification.ruleId}' (tier ${resolvedTier})`));

  // --- T3 short-circuit: always human-approved -----------------------------
  if (resolvedTier === 'T3') {
    reasons.push(reason('mode_gate', 'T3_ALWAYS_APPROVAL', 'T3 external/destructive actions always require approval'));
    return { decision: 'NEEDS_APPROVAL', resolvedTier, ruleId: classification.ruleId, reasons };
  }

  // --- Step 4: grants / persona max auto tier ------------------------------
  if (!tierLoE(resolvedTier, personaMaxAutoTier)) {
    reasons.push(
      reason('grants', 'TIER_ABOVE_GRANT', `tier ${resolvedTier} exceeds persona grant ${personaMaxAutoTier}`)
    );
    return { decision: 'NEEDS_APPROVAL', resolvedTier, ruleId: classification.ruleId, reasons };
  }

  // --- Step 5: rate limits (hard DENY when exhausted) ----------------------
  if (rateLimit.consecutiveFailures >= rateLimit.circuitBreakerThreshold) {
    reasons.push(reason('rate_limit', 'CIRCUIT_OPEN', `circuit breaker open after ${rateLimit.consecutiveFailures} consecutive failures`));
    return { decision: 'DENY', resolvedTier, ruleId: classification.ruleId, reasons };
  }
  if (rateLimit.commandsThisRun >= rateLimit.maxCommandsPerRun) {
    reasons.push(reason('rate_limit', 'RUN_LIMIT', `per-run command limit ${rateLimit.maxCommandsPerRun} reached`));
    return { decision: 'DENY', resolvedTier, ruleId: classification.ruleId, reasons };
  }
  if (rateLimit.commandsThisMinute >= rateLimit.maxCommandsPerMinute) {
    reasons.push(reason('rate_limit', 'RATE_LIMIT', `per-minute command limit ${rateLimit.maxCommandsPerMinute} reached`));
    return { decision: 'DENY', resolvedTier, ruleId: classification.ruleId, reasons };
  }

  // --- Step 6: mode gate ----------------------------------------------------
  const ceiling = MODE_AUTO_CEILING[mode];
  if (!tierLoE(resolvedTier, ceiling)) {
    reasons.push(
      reason('mode_gate', 'MODE_CEILING', `mode ${mode} auto-runs up to ${ceiling}; ${resolvedTier} needs approval`)
    );
    return { decision: 'NEEDS_APPROVAL', resolvedTier, ruleId: classification.ruleId, reasons };
  }

  reasons.push(reason('mode_gate', 'WITHIN_CEILING', `tier ${resolvedTier} within ${mode} ceiling ${ceiling}`));
  return { decision: 'ALLOW', resolvedTier, ruleId: classification.ruleId, reasons };
}
