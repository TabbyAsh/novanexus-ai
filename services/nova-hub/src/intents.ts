/**
 * INTENTS — Phase 5, the authority half (Manifesto §VIII, §XI).
 *
 * Intelligence Never Executes: this module can CREATE intents (proposed) and
 * RECORD decisions about them, but the authorize transition requires a named
 * human decider. There is deliberately no execute() here — an executor may
 * only act on an intent whose status is already 'authorized', and that check
 * lives in code, outside any model's reach.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('intents');

export interface IntentInput {
  cardRef?: string | null;
  what: string;
  why?: string;
  authorityMode?: 'recommend' | 'assist' | 'automate';
  authorityBoundary?: string;
  limits?: Record<string, unknown>;
  completionEvidence?: string;
  haltConditions?: string;
}

export async function issueIntent(i: IntentInput): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO intents (card_ref, what, why, authority_mode, authority_boundary,
                          limits_json, completion_evidence, halt_conditions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [i.cardRef || null, i.what, i.why || null, i.authorityMode || 'recommend',
     i.authorityBoundary || null, JSON.stringify(i.limits || {}),
     i.completionEvidence || null, i.haltConditions || null]
  ).catch(err => { logger.warn('Intent insert failed', { error: (err as Error).message }); return null; });
  if (row) logger.info('Intent issued (proposed)', { id: row.id });
  return row?.id || null;
}

/** The authority boundary, enforced here and only here. `decidedBy` must be
 *  a human handle — models and agents cannot pass this door. */
export async function decideIntent(
  id: string, decision: 'authorized' | 'declined', decidedBy: string
): Promise<{ ok: boolean; error?: string }> {
  if (!decidedBy.startsWith('human:')) {
    return { ok: false, error: 'Only a human may move an intent past proposed (§XI). Prefix: human:<name>' };
  }
  const r = await queryOne<{ id: string }>(
    `UPDATE intents SET status = $2, decided_by = $3, decided_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'proposed' RETURNING id`,
    [id, decision, decidedBy]
  ).catch(() => null);
  if (!r) return { ok: false, error: 'Intent not found or not in proposed state' };
  logger.info('Intent decided', { id, decision, decidedBy });
  return { ok: true };
}

/** Verification is a separate organ from execution (§XI): recording what
 *  reality showed. Failed stays failed; partial stays partial. */
export async function recordIntentOutcome(
  id: string, outcome: 'verified' | 'failed' | 'halted', evidence: string
): Promise<{ ok: boolean; error?: string }> {
  const r = await queryOne<{ id: string }>(
    `UPDATE intents SET status = $2, verified_evidence = $3, updated_at = NOW()
     WHERE id = $1 AND status IN ('authorized', 'executing') RETURNING id`,
    [id, outcome, evidence]
  ).catch(() => null);
  if (!r) return { ok: false, error: 'Intent not found or not in an executable state' };
  return { ok: true };
}

export async function listIntents(limit = 30): Promise<any[]> {
  const r = await query<any>(
    `SELECT id, card_ref, what, why, authority_mode, authority_boundary,
            completion_evidence, halt_conditions, status, decided_by, decided_at,
            verified_evidence, created_at
     FROM intents ORDER BY created_at DESC LIMIT $1`, [limit]
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows;
}

export async function intentCounts(): Promise<Record<string, number>> {
  const r = await query<{ status: string; n: string }>(
    `SELECT status, COUNT(*) AS n FROM intents GROUP BY status`
  ).catch(() => ({ rows: [] as any[] }));
  const out: Record<string, number> = {};
  for (const row of r.rows) out[row.status] = parseInt(row.n, 10);
  return out;
}
