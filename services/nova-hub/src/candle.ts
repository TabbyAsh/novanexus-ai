/**
 * THE CANDLE — v0.1 carry-forward, completed. State-sensitivity for the mind.
 *
 * A compact, honest vector of what the system's world looks like RIGHT NOW,
 * computed from real signals only. Decisions become state-conditioned:
 * retrieval pulls prior artifacts matched to the current state and regime,
 * so the same question asked in a storm and in a calm gets different
 * context — demonstrably, loggably (P1 exit condition).
 */

import { queryOne, query } from '@nova/shared';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('candle');
const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';

export interface CandleState {
  ts: string;
  market: { session: 'open' | 'closed'; spyChangePct: number | null };
  activity: { artifacts24h: number; predictionsOpen: number; agentsActive: number };
  mindAvailable: boolean; // is any AI provider currently answering
  regimePressure: 'exploit-heavy' | 'explore-heavy' | 'balanced' | 'unknown';
}

function session(): 'open' | 'closed' {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const d = et.getDay(), m = et.getHours() * 60 + et.getMinutes();
  return d >= 1 && d <= 5 && m >= 570 && m < 960 ? 'open' : 'closed';
}

let lastMindOk = { ok: false, at: 0 };
export function reportMindHealth(ok: boolean): void { lastMindOk = { ok, at: Date.now() }; }

export async function computeCandle(): Promise<CandleState> {
  let spy: number | null = null;
  try {
    const r = await fetch(`${MARKETDATA_URL}/v1/market/quote/SPY`, { signal: AbortSignal.timeout(5000) });
    const q = (await r.json() as any)?.data?.quote;
    if (q) spy = q.changePercent ?? q.change_percent ?? null;
  } catch { /* dark is dark */ }

  const [arts, preds, agents, regimes] = await Promise.all([
    queryOne<{ c: string }>(`SELECT COUNT(*) c FROM artifacts WHERE created_at > NOW() - INTERVAL '24 hours'`).catch(() => null),
    queryOne<{ c: string }>(`SELECT COUNT(*) c FROM monitor_predictions WHERE resolved = FALSE`).catch(() => null),
    queryOne<{ c: string }>(`SELECT COUNT(*) c FROM world_agents WHERE status = 'ACTIVE'`).catch(() => null),
    queryOne<{ t: string; e: string }>(
      `SELECT COUNT(*) t, COUNT(*) FILTER (WHERE regime = 'EXPLOITATION') e
       FROM artifacts WHERE kind = 'decision_card' AND created_at > NOW() - INTERVAL '7 days'`
    ).catch(() => null),
  ]);

  const t = parseInt(regimes?.t || '0', 10), e = parseInt(regimes?.e || '0', 10);
  const share = t > 5 ? e / t : -1;

  return {
    ts: new Date().toISOString(),
    market: { session: session(), spyChangePct: spy },
    activity: {
      artifacts24h: parseInt(arts?.c || '0', 10),
      predictionsOpen: parseInt(preds?.c || '0', 10),
      agentsActive: parseInt(agents?.c || '0', 10),
    },
    mindAvailable: lastMindOk.ok && Date.now() - lastMindOk.at < 30 * 60 * 1000,
    regimePressure: share < 0 ? 'unknown' : share > 0.7 ? 'exploit-heavy' : share < 0.3 ? 'explore-heavy' : 'balanced',
  };
}

// State-conditioned retrieval: prior decisions matched to the current
// regime — the Library answering "what worked when the world looked like this."
export async function retrieveForState(regime: 'EXPLOITATION' | 'EXPLORATION', limit = 2): Promise<string[]> {
  const r = await query<{ payload: any }>(
    `SELECT payload FROM artifacts
     WHERE kind = 'decision_card' AND regime = $1
     ORDER BY created_at DESC LIMIT $2`,
    [regime, limit]
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows
    .map(row => String(row.payload?.context || '').slice(0, 160))
    .filter(s => s.length > 10);
}

export function candleToPromptLine(c: CandleState): string {
  return `SYSTEM STATE (the Candle): market session ${c.market.session}${c.market.spyChangePct !== null ? `, SPY ${c.market.spyChangePct >= 0 ? '+' : ''}${c.market.spyChangePct}%` : ''}; ${c.activity.agentsActive} agents active, ${c.activity.predictionsOpen} predictions open, ${c.activity.artifacts24h} records in 24h; recent decisions ${c.regimePressure}.`;
}
