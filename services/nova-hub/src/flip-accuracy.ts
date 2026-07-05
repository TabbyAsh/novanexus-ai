/**
 * FLIP ACCURACY LOOP — Rebuild Phase 2. The Bazaar learns from real sales.
 *
 * record(sale) → compute error vs the appraisal → aggregate per category →
 * future category-model appraisals are shifted by the learned correction, and
 * the confidence becomes EARNED ("within 8% on your last 10 sales") instead of
 * modeled. Honest: no correction is applied until enough real sales exist.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('flip-accuracy');

const MIN_SALES_TO_CORRECT = 3; // below this, category-model band is used as-is

export async function recordSale(input: {
  userId?: string | null; visitorId?: string | null;
  category: string; itemTitle: string; estimatedMid: number; actualPrice: number;
}): Promise<{ ok: boolean; errorPct: number }> {
  if (!(input.estimatedMid > 0) || !(input.actualPrice >= 0)) return { ok: false, errorPct: 0 };
  const ratio = input.actualPrice / input.estimatedMid;
  try {
    await query(
      `INSERT INTO flip_sales (user_id, visitor_id, category, item_title, estimated_mid, actual_price, error_ratio)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.userId || null, input.visitorId || null, input.category || 'General',
       input.itemTitle.slice(0, 255), input.estimatedMid, input.actualPrice, ratio]
    );
    logger.info('Flip sale recorded', { category: input.category, ratio: +ratio.toFixed(2) });
    return { ok: true, errorPct: Math.abs(1 - ratio) * 100 };
  } catch (err) {
    logger.warn('Flip sale record failed', { error: (err as Error).message });
    return { ok: false, errorPct: 0 };
  }
}

export interface CategoryAccuracy {
  category: string;
  samples: number;
  correctionFactor: number;    // multiply category-model mid by this (1.0 if too few)
  medianAbsErrorPct: number | null;
  earned: boolean;             // enough real sales to trust the correction
}

// The learned correction for a category, from recent real sales.
export async function accuracyFor(category: string): Promise<CategoryAccuracy> {
  const rows = await query<{ error_ratio: string }>(
    `SELECT error_ratio FROM flip_sales WHERE category = $1 ORDER BY created_at DESC LIMIT 50`,
    [category]
  ).catch(() => ({ rows: [] as any[] }));

  const ratios = rows.rows.map(r => parseFloat(r.error_ratio)).filter(n => Number.isFinite(n) && n > 0);
  if (ratios.length < MIN_SALES_TO_CORRECT) {
    return { category, samples: ratios.length, correctionFactor: 1, medianAbsErrorPct: null, earned: false };
  }
  const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const absErrors = ratios.map(r => Math.abs(1 - r)).sort((a, b) => a - b);
  const medianAbsErrorPct = absErrors[Math.floor(absErrors.length / 2)] * 100;
  // Clamp the correction so a few weird sales can't wildly distort the band.
  const correctionFactor = Math.max(0.6, Math.min(1.6, mean));
  return { category, samples: ratios.length, correctionFactor: +correctionFactor.toFixed(3), medianAbsErrorPct: +medianAbsErrorPct.toFixed(1), earned: true };
}

// Apply the learned correction to a category-model resale band. No-op until earned.
export async function correctBand(category: string, low: number, mid: number, high: number): Promise<{
  low: number; mid: number; high: number; accuracy: CategoryAccuracy;
}> {
  const acc = await accuracyFor(category);
  if (!acc.earned) return { low, mid, high, accuracy: acc };
  const k = acc.correctionFactor;
  return { low: +(low * k).toFixed(2), mid: +(mid * k).toFixed(2), high: +(high * k).toFixed(2), accuracy: acc };
}
