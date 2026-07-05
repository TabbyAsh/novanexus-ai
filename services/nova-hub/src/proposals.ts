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
import { writeArtifact, readArtifacts } from './substrate';

const logger = createLogger('proposals');

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
): Promise<{ ok: boolean }> {
  // Verify the proposal exists (read by ref would miss it; read recent set).
  const recent = await readArtifacts({ kind: 'hypothesis', limit: 60 }).catch(() => []);
  const proposal = recent.find((a: any) => a.id === proposalId);
  if (!proposal) return { ok: false };

  const id = await writeArtifact({
    kind: decision === 'accept' ? 'outcome' : 'correction',
    authorType: 'human',
    authorId: by || 'founder',
    refs: [proposalId],
    payload: {
      kind: 'proposal_decision',
      decision,
      // reason is the training label — the human teaching the agent WHY.
      reason: (reason || (decision === 'accept' ? 'accepted' : 'rejected')).slice(0, 800),
      proposalAuthor: proposal.author_id,
      // accepted proposals are tagged into the corpus for future fine-tuning.
      corpus: decision === 'accept',
    },
  }).catch(() => null);

  if (!id) return { ok: false };
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
