/**
 * DECISION CARD OUTCOME LOOP — Rebuild Phase 1. The trunk.
 *
 * persist(card) → the person later marks what happened → Nova computes a real,
 * per-domain track record and (eventually) conditions future advice on it.
 * Honest by construction: no track record is shown until real outcomes exist.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { createHash } from 'node:crypto';
import { writeArtifact } from './substrate';

const logger = createLogger('card-outcomes');

function artifactOwnerRef(id: string): string {
  return `intake-owner:${createHash('sha256').update(id).digest('hex')}`;
}

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
  value: number | null,
  scope: { userId?: string | null; visitorId?: string | null } = {},
): Promise<{ ok: boolean; forbidden?: boolean; conflict?: boolean; domain?: string }> {
  const card = await queryOne<{
    domain: string;
    regime: string;
    user_id: string | null;
    visitor_id: string | null;
    context: string;
    haves: string[];
    wants: string[];
    provider: string;
    content: string;
    outcome: 'worked' | 'partial' | 'failed' | null;
  }>(
    `SELECT domain, regime, user_id, visitor_id, context, haves, wants, provider, content, outcome
     FROM intake_cards WHERE id = $1`, [cardId]
  );
  if (!card) return { ok: false };

  // A browser's visitor id is continuity, not authentication, but it prevents
  // one visitor from rewriting another visitor's learning record. Authenticated
  // cards are bound to the user identity forwarded by the Gateway. Cards made
  // before ownership was persisted retain the UUID capability fallback.
  if (card.user_id && card.user_id !== scope.userId) return { ok: false, forbidden: true };
  if (!card.user_id && card.visitor_id && card.visitor_id !== scope.visitorId) {
    return { ok: false, forbidden: true };
  }
  if (card.outcome) return { ok: false, conflict: true, domain: card.domain };

  // This write is the loop-closing fact. Do not report success if it did not
  // reach durable storage; secondary artifacts may degrade, the outcome may not.
  const updated = await query(
    `UPDATE intake_cards SET outcome = $2, outcome_note = $3, outcome_value = $4, outcome_at = NOW()
     WHERE id = $1 AND outcome IS NULL RETURNING id`,
    [cardId, outcome, note.slice(0, 2000), value]
  );
  if (!updated.rowCount) return { ok: false, conflict: true, domain: card.domain };

  // The outcome is a permanent, immutable artifact referencing the original
  // decision. Legacy cards pre-dating cardId linkage get a decision artifact
  // created here before the outcome is appended.
  try {
    let decisionArtifact = await queryOne<{ id: string }>(
      `SELECT id FROM artifacts
       WHERE kind = 'decision_card' AND payload->>'cardId' = $1
       ORDER BY created_at DESC LIMIT 1`,
      [cardId]
    );
    if (!decisionArtifact?.id) {
      const decisionId = await writeArtifact({
        kind: 'decision_card',
        regime: card.regime as 'EXPLOITATION' | 'EXPLORATION' | null,
        authorType: 'nova',
        authorId: `intake:${card.provider || 'unknown'}`,
        payload: {
          cardId,
          content: `intake_card:${cardId}`,
          contentRedacted: true,
          ownerScope: card.user_id ? 'authenticated' : 'visitor',
          provider: card.provider,
        },
      });
      decisionArtifact = decisionId ? { id: decisionId } : null;
    }
    if (decisionArtifact?.id) {
      await writeArtifact({
        kind: 'outcome',
        authorType: 'human',
        authorId: artifactOwnerRef(card.user_id || card.visitor_id || 'visitor'),
        refs: [decisionArtifact.id],
        payload: {
          result: outcome,
          kind: 'decision_card_outcome',
          cardId,
          domain: card.domain,
          regime: card.regime,
          detailsRedacted: true,
          detailsStoredIn: 'intake_cards',
        },
      });
    }
  } catch (err) {
    logger.warn('Outcome artifact append failed', { cardId, error: (err as Error).message });
  }

  // Also write to the outcome ledger so platform value + calibration see it.
  if (card.user_id && value && value > 0) {
    await query(
      `INSERT INTO outcome_events
         (user_id, domain, event_type, source_type, value, description, metadata)
       VALUES ($1, $2, $3, 'decision_card', $4, $5, $6)`,
      [
        card.user_id,
        card.domain,
        outcome === 'worked' ? 'OPPORTUNITY_FOUND' : 'ATTEMPT_FAILED',
        value,
        note.slice(0, 400) || `Decision card marked ${outcome}`,
        JSON.stringify({ cardId, outcome, realization: 'user_reported' }),
      ]
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
  );

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
  );
  return r.rows;
}
