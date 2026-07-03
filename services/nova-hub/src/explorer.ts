/**
 * THE EXPLORATION BUDGET — Manifesto §2, build-order #6. The closing stone.
 *
 * "A fixed, protected slice of system resources is reserved for undirected
 * exploration with NO ROI question asked. This budget is a config constant,
 * not a discretionary choice, so it cannot be silently eaten by exploitation
 * pressure."
 *
 * The Explorer is a real agent. Each run it takes two REAL, unrelated
 * observations from the system's own world (a live trending term, a live
 * market fact, a random artifact from the substrate) and abduces one
 * hypothesis at their intersection. It is FORBIDDEN from projecting revenue
 * or scoring anything — it evaluates interestingness: what's novel, what
 * doors open, what's the cheapest discriminating test. Findings land as
 * EXPLORATION-regime hypothesis artifacts. Nobody asks what they're for.
 * That is the point. (§10: free from desire, it sees the mystery.)
 */

import { queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { generateChat } from './ai-router';
import { writeArtifact } from './substrate';
import { query } from '@nova/shared';

const logger = createLogger('explorer');

// ── THE BUDGET — a constant, not a knob (Manifesto §2) ─────────────────
// Changing this is a constitutional amendment: it requires a commit, a
// diff, and the owner's eyes. It cannot drift.
export const EXPLORATION_BUDGET = {
  RUNS_PER_DAY: 4,                     // protected agent-runs/day, both floor and ceiling
  NO_ROI_QUESTIONS_UNTIL: '2026-10-01' // before this date, no exploration artifact may be judged on ROI
} as const;

const EXPLORER_ID = 'the-explorer';
const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';

async function usedToday(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM artifacts
     WHERE author_id = $1 AND created_at > date_trunc('day', NOW())`,
    [EXPLORER_ID]
  ).catch(() => null);
  return parseInt(row?.count || '0', 10);
}

// ── Real observations only — the walk is undirected, the ground is real ─
async function gatherObservations(): Promise<string[]> {
  const obs: string[] = [];

  // a live market fact
  const symbols = ['SPY', 'QQQ', 'IWM', 'GLD', 'TLT', 'XLE', 'XLF'];
  const sym = symbols[Math.floor(Math.random() * symbols.length)];
  try {
    const r = await fetch(`${MARKETDATA_URL}/v1/market/quote/${sym}`, { signal: AbortSignal.timeout(6000) });
    const q = (await r.json() as any)?.data?.quote;
    if (q?.price) obs.push(`Live market: ${sym} at $${q.price}, ${q.changePercent ?? q.change_percent ?? 0}% today.`);
  } catch { /* darkness allowed */ }

  // a live trending term (the world's current attention)
  try {
    const { runTrendRadar } = await import('./trend-radar');
    const t = await runTrendRadar({ geo: 'US' });
    const cards = (t as any)?.cards || [];
    if (cards.length) {
      const c = cards[Math.floor(Math.random() * cards.length)];
      obs.push(`Trending now: "${c.term}"${c.category ? ` (${c.category})` : ''}.`);
    }
  } catch { /* darkness allowed */ }

  // a random memory from the substrate (the system's own past)
  const row = await queryOne<{ kind: string; payload: any; created_at: string }>(
    `SELECT kind, payload, created_at FROM artifacts
     WHERE author_id != $1 ORDER BY RANDOM() LIMIT 1`,
    [EXPLORER_ID]
  ).catch(() => null);
  if (row) {
    const gist = row.kind === 'decision_card'
      ? String(row.payload?.context || '').slice(0, 140)
      : String(row.payload?.finding || row.payload?.findings?.[0] || '').slice(0, 140);
    if (gist) obs.push(`From the substrate (${row.kind}, ${new Date(row.created_at).toISOString().slice(0, 10)}): ${gist}`);
  }

  return obs;
}

export async function runExploration(): Promise<boolean> {
  const used = await usedToday();
  if (used >= EXPLORATION_BUDGET.RUNS_PER_DAY) return false; // ceiling holds

  const obs = await gatherObservations();
  if (obs.length < 2) {
    logger.info('Exploration skipped — fewer than two real observations available');
    return false; // no fabricated inputs; the walk needs real ground
  }

  const result = await generateChat({
    system: `You are the Explorer — an agent whose job is undirected curiosity over REAL observations. You are in EXPLORATION regime (this is law): you may NOT project revenue, estimate market size, score, rank, or recommend. You abduce.

Given unrelated real observations, produce exactly:
CLAIM: one falsifiable hypothesis at an unexpected intersection of the observations (one sentence).
NOVEL_BECAUSE: why this differs from what an optimizer would look at (one sentence).
DOORS: what becomes possible or learnable if true (one sentence).
CHEAPEST_TEST: the smallest real-world action that discriminates whether the claim is true (one sentence, doable this week, under $20).`,
    user: obs.join('\n'),
    maxTokens: 300,
    temperature: 1.0, // the one place high temperature is policy
  });

  if (!result) {
    logger.info('Exploration skipped — no mind available; will not fabricate');
    return false;
  }

  await writeArtifact({
    kind: 'hypothesis',
    regime: 'EXPLORATION',
    authorType: 'agent',
    authorId: EXPLORER_ID,
    payload: {
      claim: result.content,
      explains: 'undirected-exploration',
      inputs: obs,
      provider: result.provider,
      budget: { used: used + 1, of: EXPLORATION_BUDGET.RUNS_PER_DAY, noRoiUntil: EXPLORATION_BUDGET.NO_ROI_QUESTIONS_UNTIL },
    },
  });
  logger.info('Exploration run complete', { used: used + 1, of: EXPLORATION_BUDGET.RUNS_PER_DAY });
  return true;
}

// The Explorer is a real agent in the world — visible, remaining.
export async function ensureExplorerExists(): Promise<void> {
  try {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM world_agents WHERE mission = 'EXPLORER' AND status = 'ACTIVE' LIMIT 1`
    );
    if (existing) return;
    await query(
      `INSERT INTO world_agents (visitor_id, name, mission, symbol, sector, state_json)
       VALUES (NULL, 'The Explorer', 'EXPLORER', NULL, 'core', '{}')`
    );
    logger.info('The Explorer deployed — the protected budget is live');
  } catch (err) {
    logger.warn('Explorer bootstrap failed', { error: (err as Error).message });
  }
}
