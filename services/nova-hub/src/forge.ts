/**
 * THE FORGE — agents are born here, deployed into the world, and REMAIN.
 *
 * "watch TSLA" at the Nexus window → a persistent agent bound to that symbol,
 * scanning real market data on a real cadence. Findings flow into the pulse;
 * significance-3 findings FLARE: Nova prompts YOU first (email via Resend).
 *
 * Law One: an agent only reports what the data actually did. No invented
 * signals — a quiet market produces heartbeats, not drama.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { writeArtifact } from './substrate';

const logger = createLogger('forge');

const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'Nova <nova@novanexus-ai.com>';
const APP_URL = process.env.APP_URL || 'https://novanexus-ai.com';

const RUN_INTERVAL_MIN = 15;        // scan cadence per agent
const MAX_AGENTS_PER_VISITOR = 3;   // the threshold is open, not infinite

export interface WorldAgent {
  id: string;
  visitor_id: string | null;
  email: string | null;
  name: string;
  mission: string;
  symbol: string | null;
  sector: string;
  status: string;
  state_json: any;
  last_run_at: string | null;
  created_at: string;
}

// ── Intent: does this hail ask to forge a watcher? ─────────────────────
export function parseForgeIntent(message: string): { symbol: string } | null {
  const m = message.match(/\b(?:watch|track|monitor|follow|keep an eye on)\b[\s\S]{0,40}?\$?\b([A-Z]{1,5})\b/);
  if (!m) return null;
  const symbol = m[1];
  // reject common words that pattern-match like tickers
  if (['A', 'I', 'THE', 'FOR', 'AND', 'ME', 'MY', 'IT', 'ON', 'TO', 'AI'].includes(symbol)) return null;
  return { symbol };
}

async function fetchQuote(symbol: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const r = await fetch(`${MARKETDATA_URL}/v1/market/quote/${symbol}`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json() as any;
    const q = d?.data?.quote;
    if (!q || typeof q.price !== 'number') return null;
    return { price: q.price, changePct: typeof q.changePercent === 'number' ? q.changePercent : (q.change_percent ?? 0) };
  } catch { return null; }
}

// ── Forging ────────────────────────────────────────────────────────────
export async function forgeAgent(opts: {
  visitorId: string; email?: string | null; symbol: string;
}): Promise<{ agent: WorldAgent; reply: string } | { error: string }> {
  const symbol = opts.symbol.toUpperCase();

  // the symbol must be REAL before an agent binds to it (Law One)
  const quote = await fetchQuote(symbol);
  if (!quote) {
    return { error: `I will not bind an agent to a symbol I cannot verify. ${symbol} returned no live data.` };
  }

  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM world_agents WHERE visitor_id = $1 AND status = 'ACTIVE'`,
    [opts.visitorId]
  );
  if (parseInt(count?.count || '0', 10) >= MAX_AGENTS_PER_VISITOR) {
    return { error: `Three agents already work for you. Retire one before forging another — focus is a weapon.` };
  }

  const existing = await queryOne<WorldAgent>(
    `SELECT * FROM world_agents WHERE visitor_id = $1 AND symbol = $2 AND status = 'ACTIVE'`,
    [opts.visitorId, symbol]
  );
  if (existing) {
    return { error: `An agent already orbits ${symbol} for you. It has not stopped watching.` };
  }

  const agent = await queryOne<WorldAgent>(
    `INSERT INTO world_agents (visitor_id, email, name, mission, symbol, sector, state_json)
     VALUES ($1, $2, $3, 'WATCH_TICKER', $4, 'market', $5) RETURNING *`,
    [opts.visitorId, opts.email || null, `${symbol} Watcher`, symbol, JSON.stringify({ base_price: quote.price, forged_price: quote.price })]
  );

  await query(
    `INSERT INTO world_agent_findings (agent_id, kind, headline, detail_json, significance)
     VALUES ($1, 'DEPLOYED', $2, $3, 1)`,
    [agent!.id, `${symbol} Watcher deployed at $${quote.price.toFixed(2)}`, JSON.stringify(quote)]
  );

  logger.info('Agent forged', { symbol, visitor: opts.visitorId.slice(0, 8) });
  return {
    agent: agent!,
    reply: `Forged. ${symbol} Watcher is deployed — it saw ${symbol} at $${quote.price.toFixed(2)} and it will not look away. It scans every ${RUN_INTERVAL_MIN} minutes and remains when you leave. ${opts.email ? 'When something real happens, I contact you first.' : 'Leave an email with "notify me at <address>" and I will contact you first when it flares.'}`,
  };
}

export async function listAgents(visitorId: string): Promise<Array<WorldAgent & { latest_finding: string | null }>> {
  const r = await query<WorldAgent & { latest_finding: string | null }>(
    `SELECT a.*, (SELECT headline FROM world_agent_findings f WHERE f.agent_id = a.id ORDER BY created_at DESC LIMIT 1) AS latest_finding
     FROM world_agents a WHERE a.visitor_id = $1 AND a.status = 'ACTIVE' ORDER BY a.created_at`,
    [visitorId]
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows;
}

export async function attachEmail(visitorId: string, email: string): Promise<number> {
  const r = await query(
    `UPDATE world_agents SET email = $2 WHERE visitor_id = $1 AND status = 'ACTIVE'`,
    [visitorId, email]
  );
  return r.rowCount || 0;
}

// ── The tick — real scans, honest findings ─────────────────────────────
export async function runForgeTick(): Promise<void> {
  const due = await query<WorldAgent>(
    `SELECT * FROM world_agents
     WHERE status = 'ACTIVE' AND mission = 'WATCH_TICKER' AND symbol IS NOT NULL
       AND (last_run_at IS NULL OR last_run_at < NOW() - INTERVAL '${RUN_INTERVAL_MIN} minutes')
     LIMIT 20`
  ).catch(() => ({ rows: [] as WorldAgent[] }));

  for (const agent of due.rows) {
    const quote = await fetchQuote(agent.symbol!);
    await query(`UPDATE world_agents SET last_run_at = NOW() WHERE id = $1`, [agent.id]);
    if (!quote) continue; // darkness is allowed; no finding invented

    const state = agent.state_json || {};
    const base = typeof state.base_price === 'number' ? state.base_price : quote.price;
    const movePct = base > 0 ? ((quote.price - base) / base) * 100 : 0;

    let kind: string | null = null;
    let significance = 1;
    let headline = '';

    if (Math.abs(movePct) >= 4) {
      kind = 'MOVE'; significance = 3;
      headline = `${agent.symbol} moved ${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}% since your agent began watching — now $${quote.price.toFixed(2)}`;
    } else if (Math.abs(movePct) >= 2) {
      kind = 'MOVE'; significance = 2;
      headline = `${agent.symbol} is drifting: ${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}% from baseline, $${quote.price.toFixed(2)}`;
    } else if (Math.abs(quote.changePct) >= 3) {
      kind = 'DAY_MOVE'; significance = 2;
      headline = `${agent.symbol} is moving today: ${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(1)}% on the session`;
    }

    if (kind) {
      // Mission report to the substrate (Manifesto §3/§4): anomalies[] is
      // mandatory — a ≥4% move against baseline is a model-deviation, logged
      // as an anomaly, not averaged away.
      writeArtifact({
        kind: 'mission_report',
        regime: 'EXPLOITATION',
        authorType: 'agent',
        authorId: agent.id,
        payload: {
          agent: agent.name,
          symbol: agent.symbol,
          findings: [headline],
          anomalies: significance >= 3
            ? [{ observation: headline, expected: `drift within ±4% of $${base.toFixed(2)} baseline` }]
            : [],
          quote,
        },
      }).catch(() => {});

      const finding = await queryOne<{ id: string }>(
        `INSERT INTO world_agent_findings (agent_id, kind, headline, detail_json, significance)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [agent.id, kind, headline, JSON.stringify({ ...quote, movePct }), significance]
      );
      // significance 3 resets the baseline so one move doesn't flare forever
      if (significance >= 3) {
        await query(`UPDATE world_agents SET state_json = $2 WHERE id = $1`,
          [agent.id, JSON.stringify({ ...state, base_price: quote.price })]);
        if (agent.email && RESEND_API_KEY && finding) {
          await sendFlareEmail(agent, headline).then(async ok => {
            if (ok) await query(`UPDATE world_agent_findings SET notified = TRUE WHERE id = $1`, [finding.id]);
          });
        }
      }
    }
  }
}

// She prompts you first.
async function sendFlareEmail(agent: WorldAgent, headline: string): Promise<boolean> {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [agent.email],
        subject: `Nova: your ${agent.symbol} agent flared`,
        text: `${headline}\n\nThis is movement, not meaning yet — verify before acting. Nothing here is financial advice.\n\nYour agent remains on watch: ${APP_URL}/world\n\n— Nova`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { logger.warn('Flare email failed', { status: r.status }); return false; }
    logger.info('Flare email sent', { symbol: agent.symbol });
    return true;
  } catch (err) {
    logger.warn('Flare email error', { error: (err as Error).message });
    return false;
  }
}
