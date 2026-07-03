/**
 * CALIBRATION — Spec v0.2 §2, rail 4.
 *
 * "Confidence > 40%" is meaningless unless calibrated. The mechanism:
 *  1. Every claim a monitor WOULD make is logged (below-threshold included).
 *  2. When the horizon expires, the outcome is resolved against real data.
 *  3. Brier score + reliability buckets per monitor.
 *  4. THE GATE: no confidence numbers in founder-facing alerts until the
 *     monitor has MIN_SCORED resolved predictions within tolerance.
 *
 * Monitors observe and alert on facts freely; probability claims are the
 * thing that must be earned.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('calibration');

const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';

// The gate constants — config, not vibes (Spec §2).
export const CALIBRATION_GATE = {
  MIN_SCORED: 20,          // resolved predictions before any confidence claim
  MAX_BRIER: 0.25,         // worse than coin-flip-with-honesty fails
  MAX_BUCKET_DEVIATION: 0.2, // |claimed - observed| averaged over buckets
} as const;

export interface PredictionInput {
  agentId: string;
  signal: string;
  symbol: string;
  claimedProbability: number;   // the monitor's honest claim, 0..1 exclusive
  baselinePrice: number;
  direction: 'up' | 'down';
  thresholdPct: number;         // condition: move ≥ this % in direction
  horizonMinutes: number;
}

export async function logPrediction(p: PredictionInput): Promise<string | null> {
  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO monitor_predictions
         (agent_id, signal, symbol, claimed_probability, baseline_price,
          target_condition, horizon_minutes, resolves_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() + ($7 || ' minutes')::interval)
       RETURNING id`,
      [p.agentId, p.signal, p.symbol, p.claimedProbability, p.baselinePrice,
       JSON.stringify({ direction: p.direction, threshold_pct: p.thresholdPct }),
       p.horizonMinutes]
    );
    return row?.id || null;
  } catch (err) {
    logger.warn('Prediction log failed', { error: (err as Error).message });
    return null;
  }
}

// ── Resolution — reality grades the claims ─────────────────────────────
export async function resolveDuePredictions(): Promise<number> {
  const due = await query<{
    id: string; symbol: string; baseline_price: string; target_condition: any;
  }>(
    `SELECT id, symbol, baseline_price, target_condition
     FROM monitor_predictions
     WHERE resolved = FALSE AND resolves_at < NOW()
     LIMIT 25`
  ).catch(() => ({ rows: [] as any[] }));

  let resolvedCount = 0;
  for (const p of due.rows) {
    try {
      const r = await fetch(`${MARKETDATA_URL}/v1/market/quote/${p.symbol}`, { signal: AbortSignal.timeout(8000) });
      const q = (await r.json() as any)?.data?.quote;
      if (!q || typeof q.price !== 'number') continue; // stays open; retried next pass

      const baseline = parseFloat(p.baseline_price);
      const movePct = baseline > 0 ? ((q.price - baseline) / baseline) * 100 : 0;
      const cond = p.target_condition || {};
      const outcome = cond.direction === 'up'
        ? movePct >= (cond.threshold_pct ?? 0)
        : movePct <= -(cond.threshold_pct ?? 0);

      await query(
        `UPDATE monitor_predictions
         SET resolved = TRUE, outcome = $2, resolve_price = $3 WHERE id = $1`,
        [p.id, outcome, q.price]
      );
      resolvedCount++;
    } catch { /* stays open; retried next pass */ }
  }
  if (resolvedCount > 0) logger.info('Predictions resolved', { count: resolvedCount });
  return resolvedCount;
}

// ── Scoring — Brier + reliability buckets ──────────────────────────────
export interface CalibrationProfile {
  agentId: string;
  scored: number;
  pending: number;
  brier: number | null;
  buckets: Array<{ range: string; claimed: number; observed: number; n: number }>;
  calibrated: boolean;
  reason: string;
}

export async function calibrationFor(agentId: string): Promise<CalibrationProfile> {
  const rows = await query<{ claimed_probability: number; outcome: boolean; resolved: boolean }>(
    `SELECT claimed_probability, outcome, resolved FROM monitor_predictions WHERE agent_id = $1`,
    [agentId]
  ).catch(() => ({ rows: [] as any[] }));

  const scored = rows.rows.filter(r => r.resolved);
  const pending = rows.rows.length - scored.length;

  if (scored.length === 0) {
    return { agentId, scored: 0, pending, brier: null, buckets: [], calibrated: false,
      reason: `No resolved predictions yet. Gate requires ${CALIBRATION_GATE.MIN_SCORED}.` };
  }

  const brier = scored.reduce((s, r) => s + Math.pow(r.claimed_probability - (r.outcome ? 1 : 0), 2), 0) / scored.length;

  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const buckets = [] as CalibrationProfile['buckets'];
  let bucketDev = 0, bucketCount = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    const inB = scored.filter(r => r.claimed_probability >= edges[i] && r.claimed_probability < edges[i + 1]);
    if (inB.length === 0) continue;
    const claimed = inB.reduce((s, r) => s + r.claimed_probability, 0) / inB.length;
    const observed = inB.filter(r => r.outcome).length / inB.length;
    buckets.push({ range: `${edges[i]}–${edges[i + 1]}`, claimed: +claimed.toFixed(2), observed: +observed.toFixed(2), n: inB.length });
    bucketDev += Math.abs(claimed - observed); bucketCount++;
  }
  const avgDev = bucketCount ? bucketDev / bucketCount : 1;

  const calibrated =
    scored.length >= CALIBRATION_GATE.MIN_SCORED &&
    brier <= CALIBRATION_GATE.MAX_BRIER &&
    avgDev <= CALIBRATION_GATE.MAX_BUCKET_DEVIATION;

  return {
    agentId, scored: scored.length, pending, brier: +brier.toFixed(4), buckets, calibrated,
    reason: calibrated
      ? `Calibrated over ${scored.length} scored predictions (Brier ${brier.toFixed(3)}).`
      : scored.length < CALIBRATION_GATE.MIN_SCORED
        ? `${scored.length}/${CALIBRATION_GATE.MIN_SCORED} scored predictions — still earning the right to claim confidence.`
        : `Mis-calibrated (Brier ${brier.toFixed(3)}, bucket deviation ${avgDev.toFixed(2)}). Claims stay muted.`,
  };
}

// THE GATE (rail 4): may this monitor attach probability claims to alerts?
export async function mayClaimConfidence(agentId: string): Promise<boolean> {
  return (await calibrationFor(agentId)).calibrated;
}
