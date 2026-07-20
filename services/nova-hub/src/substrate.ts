/**
 * THE SUBSTRATE — Manifesto §4. One canonical blackboard.
 *
 * Agents coordinate stigmergically: they read and write artifacts here,
 * never message each other. Every artifact is schema-validated, attributed,
 * and immutable (DB trigger enforces it — corrections are new artifacts
 * referencing the old). The outcome-annotation pathway exists from day one:
 * a card without a closable feedback loop is decoration.
 *
 * Quietly, this table is also NovaMind's future training corpus.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('substrate');

export type ArtifactKind =
  | 'decision_card' | 'mission_report' | 'anomaly'
  | 'hypothesis' | 'outcome' | 'correction' | 'audit'
  | 'non_arrival';

export interface ArtifactInput {
  kind: ArtifactKind;
  regime?: 'EXPLOITATION' | 'EXPLORATION' | null;
  authorType: 'agent' | 'human' | 'system' | 'nova';
  authorId: string;
  missionId?: string | null;
  refs?: string[];
  payload: Record<string, unknown>;
}

// ── Schema validation per kind — boring language or it doesn't exist ──
const VALIDATORS: Record<ArtifactKind, (p: Record<string, unknown>) => string | null> = {
  decision_card: p => (!p.content ? 'decision_card requires payload.content' : null),
  mission_report: p => {
    if (!p.agent) return 'mission_report requires payload.agent';
    if (!Array.isArray(p.findings)) return 'mission_report requires payload.findings[]';
    if (!Array.isArray(p.anomalies)) return 'mission_report requires payload.anomalies[] (empty is allowed — and is itself data)';
    return null;
  },
  anomaly: p => (!p.observation || !p.expected ? 'anomaly requires payload.observation and payload.expected' : null),
  hypothesis: p => (!p.explains || !p.claim ? 'hypothesis requires payload.claim and payload.explains (anomaly ref)' : null),
  outcome: p => (p.result === undefined ? 'outcome requires payload.result' : null),
  correction: p => (!p.reason ? 'correction requires payload.reason' : null),
  audit: p => (!p.finding ? 'audit requires payload.finding' : null),
  // §XXI — what did not reach the citizen, and what carried the work instead.
  non_arrival: p =>
    (!p.absorbed || !p.carried_by
      ? 'non_arrival requires payload.absorbed (what failed silently) and payload.carried_by (what carried the work)'
      : null),
};

export async function writeArtifact(a: ArtifactInput): Promise<string | null> {
  const invalid = VALIDATORS[a.kind]?.(a.payload);
  if (invalid) {
    logger.warn('Artifact rejected by schema', { kind: a.kind, invalid });
    return null;
  }
  // outcome/correction artifacts must reference what they annotate
  if ((a.kind === 'outcome' || a.kind === 'correction') && (!a.refs || a.refs.length === 0)) {
    logger.warn('Artifact rejected: outcome/correction without refs', { kind: a.kind });
    return null;
  }
  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO artifacts (kind, regime, author_type, author_id, mission_id, refs, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [a.kind, a.regime || null, a.authorType, a.authorId, a.missionId || null, a.refs || [], JSON.stringify(a.payload)]
    );
    return row?.id || null;
  } catch (err) {
    logger.warn('Artifact write failed', { error: (err as Error).message });
    return null;
  }
}

export async function annotateOutcome(
  targetArtifactId: string,
  result: unknown,
  authorType: ArtifactInput['authorType'],
  authorId: string
): Promise<string | null> {
  return writeArtifact({
    kind: 'outcome',
    authorType,
    authorId,
    refs: [targetArtifactId],
    payload: { result },
  });
}

export async function readArtifacts(opts: {
  kind?: ArtifactKind; ref?: string; limit?: number;
}): Promise<any[]> {
  const limit = Math.min(opts.limit || 50, 200);
  const where: string[] = [];
  const params: any[] = [];
  if (opts.kind) { params.push(opts.kind); where.push(`kind = $${params.length}`); }
  if (opts.ref) { params.push(opts.ref); where.push(`$${params.length} = ANY(refs)`); }
  const r = await query(
    `SELECT * FROM artifacts ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY created_at DESC LIMIT ${limit}`,
    params
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows;
}
