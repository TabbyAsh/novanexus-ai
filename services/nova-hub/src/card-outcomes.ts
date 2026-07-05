/**
 * DECISION CARD OUTCOME LOOP — Rebuild Phase 1. The trunk.
 *
 * persist(card) → the person later marks what happened → Nova computes a real,
 * per-domain track record and (eventually) conditions future advice on it.
 * Honest by construction: no track record is shown until real outcomes exist.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { writeArtifact } from './substrate';

const logger = createLogger('card-outcomes');

// Classify a card into a coarse domain for track-record grouping.
export function domainOf(context: string, haves: string[] = []): string {
  const t = (context + ' ' + haves.join(' ')).toLowerCase();
  if (/hasn.?t paid|owes|unpaid|invoice|collect/.test(t)) return 'collections';
  if (/price|pricing|charge|quote|underprice/.test(t)) return 'pricing';
  if (/skill|craft|freelance|service/.test(t)) return 'skill';
  if (/follower|community|audience|discord/.test(t)) return 'community';
  if (/know|expert|deep|niche|course/.test(t)) return 'knowledge';
  return 'general';
}

export async function persistCard(input: {
  userId?: string | null; visitorId?: string | null;
  context: string; haves: string[]; wants: string[];
  regime: string; provider: string; content: string;
}): Promise<string | null> {
  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO intake_cards (user_id, visitor_id, context, haves, wants, regime, domain, provider, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [input.userId || null, input.visitorId || null, input.context, input.haves, input.wants,
       input.regime, domainOf(input.context, input.haves), input.provider, input.content]
    );
    return row?.id || null;
  } catch (err) {
    logger.warn('Card persist failed', { error: (err as Error).message });
    return null;
  }
}

export async function markOutcome(
  cardId: string,
  outcome: 'worked' | 'partial' | 'failed',
  note: string,
  value: number | null
): Promise<{ ok: boolean; domain?: string }> {
  const card = await queryOne<{ domain: string; regime: string; user_id: string | null }>(
    `SELECT domain, regime, user_id FROM intake_cards WHERE id = $1`, [cardId]
  ).catch(() => null);
  if (!card) return { ok: false };

  await query(
    `UPDATE intake_cards SET outcome = $2, outcome_note = $3, outcome_value = $4, outcome_at = NOW() WHERE id = $1`,
    [cardId, outcome, note.slice(0, 2000), value]
  ).catch(() => {});

  // The outcome is a permanent, immutable record referencing the decision
  // (substrate §4: the score is disposable, the record is permanent).
  await writeArtifact({
    kind: 'outcome', authorType: 'human', authorId: card.user_id || 'visitor',
    refs: [], // intake_cards id lives in payload; substrate refs are artifact-ids
    payload: { kind: 'decision_card_outcome', cardId, domain: card.domain, regime: card.regime, outcome, note: note.slice(0, 400), value },
  }).catch(() => {});

  // Also write to the outcome ledger so platform value + calibration see it.
  if (value && value > 0) {
    await query(
      `INSERT INTO outcome_events (user_id, event_type, source_type, value)
       VALUES ($1, $2, 'decision_card', $3)`,
      [card.user_id || null, outcome === 'worked' ? 'PROFIT' : 'OPPORTUNITY_FOUND', value]
    ).catch(() => {});
  }
  logger.info('Card outcome marked', { cardId, outcome, domain: card.domain });
  return { ok: true, domain: card.domain };
}

// The track record — honest. Returns per-domain worked-rate over RESOLVED cards.
export async function calibration(scope?: { userId?: string; visitorId?: string }): Promise<{
  overall: { resolved: number; worked: number; workedRate: number | null };
  byDomain: Array<{ domain: string; resolved: number; worked: number; workedRate: number }>;
}> {
  const where: string[] = ['outcome IS NOT NULL'];
  const params: any[] = [];
  if (scope?.userId) { params.push(scope.userId); where.push(`user_id = $${params.length}`); }
  else if (scope?.visitorId) { params.push(scope.visitorId); where.push(`visitor_id = $${params.length}`); }

  const rows = await query<{ domain: string; outcome: string }>(
    `SELECT domain, outcome FROM intake_cards WHERE ${where.join(' AND ')}`, params
  ).catch(() => ({ rows: [] as any[] }));

  const all = rows.rows;
  const worked = all.filter(r => r.outcome === 'worked').length;
  const byDomainMap = new Map<string, { resolved: number; worked: number }>();
  for (const r of all) {
    const d = byDomainMap.get(r.domain) || { resolved: 0, worked: 0 };
    d.resolved++; if (r.outcome === 'worked') d.worked++;
    byDomainMap.set(r.domain, d);
  }
  return {
    overall: { resolved: all.length, worked, workedRate: all.length ? worked / all.length : null },
    byDomain: [...byDomainMap.entries()].map(([domain, v]) => ({ domain, ...v, workedRate: v.worked / v.resolved })),
  };
}

// List a visitor's/user's own cards (for the "mark what happened" surface).
export async function listCards(scope: { userId?: string; visitorId?: string }, limit = 20): Promise<any[]> {
  const where: string[] = [];
  const params: any[] = [];
  if (scope.userId) { params.push(scope.userId); where.push(`user_id = $${params.length}`); }
  else if (scope.visitorId) { params.push(scope.visitorId); where.push(`visitor_id = $${params.length}`); }
  else return [];
  const r = await query<any>(
    `SELECT id, domain, regime, outcome, outcome_at, LEFT(content, 200) AS preview, created_at
     FROM intake_cards WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${limit}`, params
  ).catch(() => ({ rows: [] }));
  return r.rows;
}
