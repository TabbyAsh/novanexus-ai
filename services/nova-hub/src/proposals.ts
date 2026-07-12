/**
 * APPROVAL-AS-TRAINING LOOP — Rebuild Phase 3.
 *
 * The agents (Smith, Ignition, Forge-v2, Executor) write PROPOSALS to the
 * substrate. Nothing merges without a human. Here the human's accept/reject
 * — WITH a reason — becomes a permanent, immutable decision artifact
 * referencing the proposal. Those decisions are (a) the audit trail, (b) the
 * training labels for prompt improvement, (c) the corpus of accepted work.
 *
 * Substrate-native: a decision is an 'outcome' (accept) or 'correction'
 * (reject) artifact with refs:[proposalId]. "Pending" = a proposal with no
 * decision artifact pointing at it. No new table — the blackboard IS the state.
 */

import { createLogger } from '@nova/telemetry';
import { transaction } from '@nova/shared';
import { createHash } from 'node:crypto';
import { readArtifacts } from './substrate';

const logger = createLogger('proposals');

function humanAuthorRef(id: string): string {
  return `forge-human:${createHash('sha256').update(id).digest('hex')}`;
}

const PROPOSAL_AUTHORS = ['the-smith', 'forge-v2', 'executor'];
function isProposalArtifact(a: any): boolean {
  const status = String(a?.payload?.status || '');
  const author = String(a?.author_id || '');
  return (
    /PROPOSAL|AWAITING/i.test(status) ||
    author.startsWith('ignition:') ||
    PROPOSAL_AUTHORS.includes(author)
  );
}

export async function listPendingProposals(limit = 20): Promise<any[]> {
  const candidates = await readArtifacts({ kind: 'hypothesis', limit: 60 }).catch(() => []);
  const proposals = candidates.filter(isProposalArtifact);
  const pending: any[] = [];
  for (const p of proposals) {
    const decisions = await readArtifacts({ ref: p.id, limit: 1 }).catch(() => []);
    const decided = decisions.some((d: any) => d.kind === 'outcome' || d.kind === 'correction');
    if (!decided) {
      pending.push({
        id: p.id,
        author: p.author_id,
        claim: p.payload?.claim || p.payload?.status || 'proposal',
        summary: JSON.stringify(p.payload).slice(0, 300),
        created_at: p.created_at,
      });
    }
    if (pending.length >= limit) break;
  }
  return pending;
}

export async function decideProposal(
  proposalId: string,
  decision: 'accept' | 'reject',
  reason: string,
  by: string
): Promise<{ ok: boolean; conflict?: boolean }> {
  const result = await transaction(async client => {
    // Lock the proposal itself so concurrent human decisions serialize. The
    // second transaction observes the first decision after the lock releases.
    const proposalResult = await client.query(
      `SELECT id, author_id, payload FROM artifacts
       WHERE id = $1 AND kind = 'hypothesis'
       FOR UPDATE`,
      [proposalId],
    );
    const proposal = proposalResult.rows[0];
    if (!proposal || !isProposalArtifact(proposal)) return { status: 'not_found' as const };

    const prior = await client.query<{ id: string }>(
      `SELECT id FROM artifacts
       WHERE kind IN ('outcome', 'correction') AND $1 = ANY(refs)
       LIMIT 1`,
      [proposalId],
    );
    if (prior.rows[0]?.id) return { status: 'conflict' as const };

    const payload = {
      kind: 'proposal_decision',
      result: decision,
      decision,
      reason: (reason || (decision === 'accept' ? 'accepted' : 'rejected')).slice(0, 800),
      proposalAuthor: proposal.author_id,
      corpus: decision === 'accept',
    };
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO artifacts (kind, regime, author_type, author_id, mission_id, refs, payload)
       VALUES ($1, NULL, 'human', $2, NULL, $3, $4) RETURNING id`,
      [decision === 'accept' ? 'outcome' : 'correction', humanAuthorRef(by || 'founder'), [proposalId], JSON.stringify(payload)],
    );
    return inserted.rows[0]?.id ? { status: 'created' as const } : { status: 'failed' as const };
  }).catch(() => ({ status: 'failed' as const }));

  if (result.status === 'conflict') return { ok: false, conflict: true };
  if (result.status !== 'created') return { ok: false };
  logger.info('Proposal decided', { proposalId, decision, by });
  return { ok: true };
}

// The human decisions, as training signal — read by the improvement loop.
export async function decisionsForTraining(limit = 30): Promise<Array<{ decision: string; reason: string; author: string }>> {
  const outs = await readArtifacts({ kind: 'outcome', limit: 40 }).catch(() => []);
  const corrs = await readArtifacts({ kind: 'correction', limit: 40 }).catch(() => []);
  return [...outs, ...corrs]
    .filter((a: any) => a.payload?.kind === 'proposal_decision')
    .slice(0, limit)
    .map((a: any) => ({ decision: a.payload.decision, reason: a.payload.reason, author: a.payload.proposalAuthor }));
}
