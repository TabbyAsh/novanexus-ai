/**
 * FAILURE MEMORY — Nova remembers how she failed, not just that she did.
 *
 * A provider-unavailable event is not a mere API blip; per the sovereignty
 * doctrine it is an ARCHITECTURAL failure — single-provider dependence can
 * disable the Smith, Ignition, the executor, and non-template Decision Cards
 * all at once. This module records those events as immutable substrate
 * artifacts (kind 'anomaly', so The Mirror and future training see them) and
 * exposes a recall surface for Forge Control.
 *
 * Rate-limited: one sovereignty-failure record per hour, so a quota-dark
 * stretch produces one lesson, not a flood.
 */

import { createLogger } from '@nova/telemetry';
import { writeArtifact, readArtifacts } from './substrate';

const logger = createLogger('failure-memory');

let lastSovereigntyRecord = 0;
const SOVEREIGNTY_COOLDOWN_MS = 60 * 60 * 1000;

export async function recordProviderUnavailable(tier: string, attempts: Array<{ name: string; outcome: string }>): Promise<void> {
  const now = Date.now();
  if (now - lastSovereigntyRecord < SOVEREIGNTY_COOLDOWN_MS) return;
  lastSovereigntyRecord = now;

  const quotaDark = attempts.filter(a => a.outcome === 'quota').map(a => a.name);
  await writeArtifact({
    kind: 'anomaly',
    authorType: 'system',
    authorId: 'sovereignty-monitor',
    payload: {
      observation: `SOVEREIGNTY FAILURE: all providers unavailable for a '${tier}' task. Quota-dark: ${quotaDark.join(', ') || 'none'}. Attempts: ${JSON.stringify(attempts)}.`,
      expected: 'at least one eligible provider (local or external) can reason',
      lesson: 'Single-provider dependence can disable Smith, Ignition, executor, and non-template Decision Cards simultaneously. A local model or a second external provider must exist before any agent workflow is marked production-operational.',
      class: 'sovereignty',
      tier, quotaDark,
    },
  }).catch(() => {});
  logger.warn('Sovereignty failure recorded', { tier, quotaDark });
}

// ── THE LEDGER OF NON-ARRIVAL (Manifesto §XXI) ────────────────────────
// Records what did NOT reach the citizen: a provider failed and another
// route carried the work. Quiet and factual — one entry per failure
// signature per hour, so a flaky provider produces a record, not a flood.

const nonArrivalSeen = new Map<string, number>();
const NON_ARRIVAL_COOLDOWN_MS = 60 * 60 * 1000;

export async function recordAbsorbedFailover(
  tier: string,
  attempts: Array<{ name: string; outcome: string }>,
  carriedBy: string
): Promise<void> {
  // Only real absorbed failures count — 'absent' (unconfigured) is not a failure.
  const failed = attempts.filter(a => a.name !== carriedBy && (a.outcome === 'quota' || a.outcome === 'error'));
  if (failed.length === 0) return;

  const signature = `${failed.map(f => `${f.name}:${f.outcome}`).sort().join(',')}→${carriedBy}`;
  const now = Date.now();
  const last = nonArrivalSeen.get(signature) || 0;
  if (now - last < NON_ARRIVAL_COOLDOWN_MS) return;
  nonArrivalSeen.set(signature, now);

  await writeArtifact({
    kind: 'non_arrival',
    authorType: 'system',
    authorId: 'continuance',
    payload: {
      absorbed: `Provider failure on a '${tier}' task: ${failed.map(f => `${f.name} (${f.outcome})`).join(', ')}.`,
      carried_by: carriedBy,
      note: 'The work arrived. The failure did not reach the citizen.',
      tier,
    },
  }).catch(() => {});
  logger.info('Non-arrival recorded', { signature });
}

// Seed the founding lesson explicitly (idempotent-ish; called once on boot).
export async function seedQuotaLesson(): Promise<void> {
  const existing = await readArtifacts({ kind: 'anomaly', limit: 50 }).catch(() => []);
  if (existing.some((a: any) => a.payload?.class === 'sovereignty' && a.payload?.seed)) return;
  await writeArtifact({
    kind: 'anomaly',
    authorType: 'system',
    authorId: 'sovereignty-monitor',
    payload: {
      observation: 'FOUNDING LESSON (2026-07-05): Nova went agent-dark repeatedly because a single free Gemini key was the only configured mind. Its daily quota reset gate silenced the Smith, Ignition, the executor, and non-template Decision Cards together.',
      expected: 'core workflows survive a single provider going quota-dark',
      lesson: 'Provider fallback (a second external provider AND a path to local inference) is a precondition for marking any agent system production-operational. All agent demos must report provider status before execution.',
      class: 'sovereignty', seed: true,
    },
  }).catch(() => {});
  logger.info('Quota sovereignty lesson seeded');
}

export async function recallFailureMemory(limit = 10): Promise<any[]> {
  const rows = await readArtifacts({ kind: 'anomaly', limit: 50 }).catch(() => []);
  return rows
    .filter((a: any) => a.payload?.class === 'sovereignty')
    .slice(0, limit)
    .map((a: any) => ({ observation: a.payload.observation, lesson: a.payload.lesson, at: a.created_at }));
}
