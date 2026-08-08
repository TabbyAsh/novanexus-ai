/**
 * THE TUNER — v0.1 Phase 3 / v0.2 P5. Staged, never hot-applied (rail 3).
 *
 * Reads REAL outcomes (resolved predictions, annotated cards) and PROPOSES
 * weight patches as immutable hypothesis artifacts + a founder email.
 * It has no write access to any live parameter — promotion is a human
 * commit. The Tuner may never modify the Boundary, the eval harness, or
 * its own gates; structurally enforced: it only writes artifacts.
 */

import { query } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { writeArtifact } from './substrate';

const logger = createLogger('tuner');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const OWNER_EMAIL = process.env.OWNER_EMAIL || '';
const FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'Nova <nova@novanexus-ai.com>';

const MIN_OUTCOMES_TO_TUNE = 30; // entry condition (P5): outcome volume first

export async function runTunerPass(): Promise<{ proposed: boolean; reason: string }> {
  // Evidence base: resolved monitor predictions grouped by signal
  const sig = await query<{ signal: string; n: string; hit_rate: string; avg_claim: string }>(
    `SELECT signal, COUNT(*) n,
            AVG(CASE WHEN outcome THEN 1.0 ELSE 0.0 END) hit_rate,
            AVG(claimed_probability) avg_claim
     FROM monitor_predictions WHERE resolved = TRUE
     GROUP BY signal HAVING COUNT(*) >= ${MIN_OUTCOMES_TO_TUNE}`
  ).catch(() => ({ rows: [] as any[] }));

  if (sig.rows.length === 0) {
    return { proposed: false, reason: `Insufficient outcome volume (need ${MIN_OUTCOMES_TO_TUNE} resolved per signal). Accumulating.` };
  }

  const patches = sig.rows
    .map(r => {
      const hit = parseFloat(r.hit_rate), claim = parseFloat(r.avg_claim);
      const drift = hit - claim;
      if (Math.abs(drift) < 0.08) return null; // within tolerance — no patch
      return {
        signal: r.signal,
        evidence: { resolved: parseInt(r.n, 10), observed_hit_rate: +hit.toFixed(3), avg_claimed: +claim.toFixed(3) },
        patch: { parameter: 'claimed_probability_base', direction: drift > 0 ? 'raise' : 'lower', suggested_delta: +drift.toFixed(3) },
      };
    })
    .filter(Boolean) as any[];

  if (patches.length === 0) return { proposed: false, reason: 'All signals within calibration tolerance — no patch warranted.' };

  await writeArtifact({
    kind: 'hypothesis',
    regime: 'EXPLOITATION',
    authorType: 'agent',
    authorId: 'tuner',
    payload: {
      claim: `Weight patch proposal: ${patches.map(p => `${p.signal} ${p.patch.direction} by ${p.patch.suggested_delta}`).join('; ')}`,
      explains: 'observed-vs-claimed drift in resolved predictions',
      patches,
      status: 'STAGED — requires human commit (rail 3). Never hot-applied.',
    },
  });

  if (RESEND_API_KEY && OWNER_EMAIL) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: [OWNER_EMAIL],
        subject: 'Nova Tuner: staged weight patch awaiting your commit',
        text: `Evidence-based patch proposal (never auto-applied):\n\n${patches.map(p => `${p.signal}: observed ${p.evidence.observed_hit_rate} vs claimed ${p.evidence.avg_claimed} over ${p.evidence.resolved} resolved → ${p.patch.direction} by ${p.patch.suggested_delta}`).join('\n')}\n\nFull record on the substrate. Apply = a code change you review.\n\n— Nova`,
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }
  logger.info('Tuner patch proposed', { signals: patches.length });
  return { proposed: true, reason: `${patches.length} patch(es) staged for review.` };
}
