import { computeEventHash, nowTimestamp, query, queryOne, EVENT_TYPES } from '@nova/shared';
import type { CommandEvaluation, CommandRequest, ExecutionStatus } from '@nova/agent-contracts';

// ============================================================================
// Audit discipline: every command request/decision becomes
//   (a) a forge_command_requests row (queryable), and
//   (b) a hash-chained event in the shared events table (tamper-evident).
// Same chain idiom as services/orchestrator emitEvent.
// ============================================================================

/** Stable synthetic actor for the broker itself (events.actor_id is NOT NULL). */
export const CMDX_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

/** Org used for platform-level events until Forge is org-scoped (Phase 6). */
export function forgeOrgId(): string {
  return process.env.FORGE_ORG_ID || CMDX_ACTOR_ID;
}

export async function emitForgeEvent(
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const orgId = forgeOrgId();
    const lastEvent = await queryOne<{ hash: string }>(
      'SELECT hash FROM events WHERE org_id = $1 ORDER BY ts DESC LIMIT 1',
      [orgId]
    );
    const prevHash = lastEvent?.hash || '0'.repeat(64);
    const ts = nowTimestamp();
    const hash = computeEventHash(prevHash, payload, type, ts, 'BOT', CMDX_ACTOR_ID);
    await query(
      `INSERT INTO events (org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, 'BOT', CMDX_ACTOR_ID, type, ts, JSON.stringify(payload), prevHash, hash]
    );
  } catch (error) {
    // Audit failures are loud but must not turn a DENY into an execution.
    // eslint-disable-next-line no-console
    console.error('cmdx: failed to emit forge event', error);
  }
}

export interface PersistedDecision {
  id: string;
}

export async function recordCommandDecision(
  request: CommandRequest,
  evaluation: CommandEvaluation,
  envViolations: string[],
  executionStatus: ExecutionStatus
): Promise<PersistedDecision | null> {
  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO forge_command_requests
         (workspace_id, subtask_id, task_id, persona_slug, argv, cwd, env_refs, env_violations,
          requested_tier, resolved_tier, decision, decision_reasons, rule_id, dry_run,
          execution_status, decided_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
       RETURNING id`,
      [
        request.workspaceId ?? null,
        request.subtaskId ?? null,
        request.taskId ?? null,
        request.personaSlug,
        JSON.stringify(request.argv),
        request.cwd,
        JSON.stringify(request.envRefs),
        JSON.stringify(envViolations),
        request.riskTierRequested,
        evaluation.resolvedTier,
        evaluation.decision,
        JSON.stringify(evaluation.reasons),
        evaluation.ruleId,
        request.dryRun,
        executionStatus,
      ]
    );

    await emitForgeEvent(EVENT_TYPES.FORGE_CMD_DECIDED, {
      commandRequestId: row?.id ?? null,
      personaSlug: request.personaSlug,
      argv: request.argv,
      decision: evaluation.decision,
      resolvedTier: evaluation.resolvedTier,
      ruleId: evaluation.ruleId,
      reasons: evaluation.reasons,
      envViolations,
      executionStatus,
    });

    return row ? { id: row.id } : null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('cmdx: failed to persist command decision', error);
    return null;
  }
}

export async function recordApprovalRequest(
  commandRequestId: string,
  request: CommandRequest,
  evaluation: CommandEvaluation
): Promise<void> {
  try {
    await query(
      `INSERT INTO forge_approvals
         (kind, task_id, subtask_id, command_request_id, requested_by_persona, summary, payload_json)
       VALUES ('COMMAND', $1, $2, $3, $4, $5, $6)`,
      [
        request.taskId ?? null,
        request.subtaskId ?? null,
        commandRequestId,
        request.personaSlug,
        `[${evaluation.resolvedTier}] ${request.argv.join(' ')}`,
        JSON.stringify({ argv: request.argv, cwd: request.cwd, reasons: evaluation.reasons }),
      ]
    );
    await emitForgeEvent(EVENT_TYPES.FORGE_APPROVAL_REQUESTED, {
      commandRequestId,
      personaSlug: request.personaSlug,
      resolvedTier: evaluation.resolvedTier,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('cmdx: failed to create approval request', error);
  }
}
