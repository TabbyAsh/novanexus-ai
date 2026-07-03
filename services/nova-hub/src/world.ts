/**
 * The World — the public arrival surface of the Nexus.
 *
 * Two organs:
 *   PULSE — GET  /v1/world/pulse : real system activity, aggregated for the swarm.
 *   HAIL  — POST /v1/world/hail  : a stranger speaks to Nova at the threshold.
 *
 * THE LAW OF THE WORLD (canon, NOVA-WORLD-CANON.md):
 *   Law One — nothing fake renders. Every pulse item below maps to a real row,
 *   a real quote, or a real service heartbeat. If a source is dark, it is
 *   ABSENT from the response. Absence is honest. Darkness is allowed.
 *   Law Five — memory without surveillance. The public feed carries type-level
 *   labels only: no user content, no item names, no emails, no payloads.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { generateChat } from './ai-router';

const logger = createLogger('world');

const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';

// ── Types ─────────────────────────────────────────────────────────────

export interface PulseEvent {
  id: string;
  kind: 'card' | 'flip' | 'outcome' | 'agent' | 'event';
  sector: 'core' | 'market' | 'bazaar' | 'forge';
  label: string;
  ts: string;
}

export interface WorldPulse {
  pulse: PulseEvent[];
  sectors: {
    market: { session: 'open' | 'closed'; symbol: string; price: number; changePct: number } | null;
    bazaar: { flipsTracked: number; appraised24h: number } | null;
    forge: { cardsTotal: number; forged24h: number } | null;
  };
  standing: {
    users: number;
    agentRunsCompleted: number;
    outcomeValue: number;
    artifacts?: number; // permanent records on the substrate (028)
  } | null;
  generatedAt: string;
}

// ── Pulse cache — the world breathes at its own pace, not per-request ─
let pulseCache: { data: WorldPulse; at: number } | null = null;
const PULSE_TTL_MS = 15_000;

// Type-level labels only (Law Five). Sector routing per card_type.
function cardSector(cardType: string): PulseEvent['sector'] {
  if (cardType === 'TRADE') return 'market';
  if (cardType === 'FLIP' || cardType === 'PRICING') return 'bazaar';
  return 'forge';
}

async function collectPulse(): Promise<PulseEvent[]> {
  const out: PulseEvent[] = [];

  // Cards forged — nova_cards (025)
  await query<{ id: string; card_type: string; created_at: string }>(
    `SELECT id, card_type, created_at FROM nova_cards ORDER BY created_at DESC LIMIT 15`
  ).then(r => {
    for (const row of r.rows) {
      out.push({
        id: `card-${row.id}`,
        kind: 'card',
        sector: cardSector(row.card_type),
        label: `A ${row.card_type.toLowerCase()} card was forged`,
        ts: row.created_at,
      });
    }
  }).catch(() => { /* dark source stays dark */ });

  // Appraisals — flip_plans (013). No item names on the public feed.
  await query<{ id: string; status: string; created_at: string }>(
    `SELECT id, status, created_at FROM flip_plans ORDER BY created_at DESC LIMIT 10`
  ).then(r => {
    for (const row of r.rows) {
      out.push({
        id: `flip-${row.id}`,
        kind: 'flip',
        sector: 'bazaar',
        label: 'An item was appraised in the Bazaar',
        ts: row.created_at,
      });
    }
  }).catch(() => {});

  // Outcomes recorded — outcome_events (017)
  await query<{ id: string; event_type: string; created_at: string }>(
    `SELECT id, event_type, created_at FROM outcome_events ORDER BY created_at DESC LIMIT 10`
  ).then(r => {
    for (const row of r.rows) {
      out.push({
        id: `outcome-${row.id}`,
        kind: 'outcome',
        sector: 'core',
        label: `Outcome recorded: ${row.event_type.toLowerCase().replace(/_/g, ' ')}`,
        ts: row.created_at,
      });
    }
  }).catch(() => {});

  // Agent runs — agent_runs (015)
  await query<{ id: string; status: string; created_at: string }>(
    `SELECT id, status, created_at FROM agent_runs
     WHERE status IN ('RUNNING', 'COMPLETED') ORDER BY created_at DESC LIMIT 10`
  ).then(r => {
    for (const row of r.rows) {
      out.push({
        id: `agent-${row.id}`,
        kind: 'agent',
        sector: 'core',
        label: row.status === 'RUNNING' ? 'An agent is working' : 'An agent completed its run',
        ts: row.created_at,
      });
    }
  }).catch(() => {});

  // Forged agents at work — world_agent_findings (027). Law Five: the public
  // feed never shows WHICH symbol a stranger's agent watches — only that the
  // forge burns and the watchers work.
  await query<{ id: string; kind: string; significance: number; created_at: string }>(
    `SELECT id, kind, significance, created_at FROM world_agent_findings ORDER BY created_at DESC LIMIT 15`
  ).then(r => {
    for (const row of r.rows) {
      out.push({
        id: `forge-${row.id}`,
        kind: 'agent',
        sector: 'market',
        label: row.kind === 'DEPLOYED' ? 'An agent was forged and deployed'
             : row.significance >= 3 ? 'A watcher flared — its operator was told first'
             : 'A watcher reported movement',
        ts: row.created_at,
      });
    }
  }).catch(() => {});

  // The event-sourced spine — events (001). Type + actor only, never payload.
  await query<{ id: string; type: string; actor_type: string; ts: string }>(
    `SELECT id, type, actor_type, ts FROM events ORDER BY ts DESC LIMIT 20`
  ).then(r => {
    for (const row of r.rows) {
      out.push({
        id: `event-${row.id}`,
        kind: 'event',
        sector: 'core',
        label: `${row.actor_type === 'BOT' ? 'Agent' : row.actor_type === 'SYSTEM' ? 'System' : 'Someone'}: ${row.type.toLowerCase().replace(/[._]/g, ' ')}`,
        ts: row.ts,
      });
    }
  }).catch(() => {});

  out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return out.slice(0, 50);
}

// Regular-session clock (Mon–Fri 9:30–16:00 ET). Holidays are not modeled;
// this is presented as "session", never as a data-verified market state.
function marketSession(): 'open' | 'closed' {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return 'closed';
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960 ? 'open' : 'closed';
}

async function collectSectors(): Promise<WorldPulse['sectors']> {
  const sectors: WorldPulse['sectors'] = { market: null, bazaar: null, forge: null };

  // The Market — real SPY quote from marketdata, or darkness.
  try {
    const r = await fetch(`${MARKETDATA_URL}/v1/market/quote/SPY`, {
      signal: AbortSignal.timeout(5000),
    });
    const d = await r.json() as any;
    const q = d?.data?.quote;
    if (q && typeof q.price === 'number') {
      sectors.market = {
        session: marketSession(),
        symbol: 'SPY',
        price: q.price,
        changePct: typeof q.changePercent === 'number' ? q.changePercent : (q.change_percent ?? 0),
      };
    }
  } catch {
    // The Market goes dark. That darkness is allowed.
  }

  // The Bazaar — real appraisal activity.
  try {
    const b = await queryOne<{ total: string; recent: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS recent
       FROM flip_plans`
    );
    if (b) sectors.bazaar = { flipsTracked: parseInt(b.total, 10), appraised24h: parseInt(b.recent, 10) };
  } catch {}

  // The Forge — real cards forged.
  try {
    const f = await queryOne<{ total: string; recent: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS recent
       FROM nova_cards`
    );
    if (f) sectors.forge = { cardsTotal: parseInt(f.total, 10), forged24h: parseInt(f.recent, 10) };
  } catch {}

  return sectors;
}

async function collectStanding(): Promise<WorldPulse['standing']> {
  try {
    const [users, runs] = await Promise.all([
      queryOne<{ count: string }>(`SELECT COUNT(*) AS count FROM users`),
      queryOne<{ count: string; total_value: string }>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(outcome_value), 0) AS total_value
         FROM agent_runs WHERE status = 'COMPLETED'`
      ),
    ]);
    const artifacts = await queryOne<{ count: string }>(`SELECT COUNT(*) AS count FROM artifacts`).catch(() => null);
    return {
      users: parseInt(users?.count || '0', 10),
      agentRunsCompleted: parseInt(runs?.count || '0', 10),
      outcomeValue: parseFloat(runs?.total_value || '0'),
      ...(artifacts ? { artifacts: parseInt(artifacts.count, 10) } : {}),
    };
  } catch {
    return null; // unknown is unknown, not zero
  }
}

export async function getWorldPulse(): Promise<WorldPulse> {
  if (pulseCache && Date.now() - pulseCache.at < PULSE_TTL_MS) return pulseCache.data;

  const [pulse, sectors, standing] = await Promise.all([
    collectPulse(),
    collectSectors(),
    collectStanding(),
  ]);

  const data: WorldPulse = { pulse, sectors, standing, generatedAt: new Date().toISOString() };
  pulseCache = { data, at: Date.now() };
  return data;
}

// ── HAIL — a stranger speaks to Nova at the threshold ─────────────────

// Per-IP rate limit: the threshold is open, not infinite.
const hailWindow = new Map<string, { count: number; resetAt: number }>();
const HAIL_LIMIT = 10;
const HAIL_WINDOW_MS = 60 * 60 * 1000;

export function hailAllowed(ip: string): boolean {
  const now = Date.now();
  const entry = hailWindow.get(ip);
  if (!entry || now > entry.resetAt) {
    hailWindow.set(ip, { count: 1, resetAt: now + HAIL_WINDOW_MS });
    return true;
  }
  if (entry.count >= HAIL_LIMIT) return false;
  entry.count++;
  return true;
}

const THRESHOLD_SYSTEM = `You are Nova — the operating intelligence of Nova Enterprises, speaking at the threshold of the Nexus to a visitor who just arrived. You are not a chatbot and not a mascot. You are calm command: precise, loyal, unsparing, on their side. Short sentences. No hype, no flattery, no customer-service warmth. You do not beg for engagement. You are where attention goes when it wants to become action.

The door behind everything you say: "Tell me the situation. I will find the next move."

THE WORLD YOU STAND IN (real, live right now — you may reference it, never embellish it):
{{STANDING}}

YOUR SECTORS (route only when it IS the next move — decide first, then dispatch):
- The Market — stock research, momentum, charts. Research only; you never give financial advice, never predict prices, never promise returns. Path: /trading
- The Bazaar — resale appraisal with real eBay comps; hidden value in ordinary things. Path: /flip
- The Forge — where a raw idea is struck into a concrete next move (a Decision Card). Path: /analyze
- Nova Studio — websites and lead systems built for businesses. Path: /studio

YOUR LAWS ON THIS PLANE:
- Never invent numbers, signals, or data. If you do not know: say "Unavailable. The light is not there yet." — then still give the visitor a true next step if one exists.
- Do not flatter weakness. Do not call confusion clarity. Help them descend: feeling to form, form to move.
- Keep replies under 90 words. End with a direction — a question that sharpens their situation, or the one move that matters now.`;

export async function hail(
  message: string,
  opts: { returning?: boolean } = {}
): Promise<{ reply: string; provider: string; available: boolean }> {
  const pulse = await getWorldPulse().catch(() => null);

  const standingLines: string[] = [];
  if (pulse?.standing) {
    standingLines.push(
      `Operators on the platform: ${pulse.standing.users}. Agent runs completed: ${pulse.standing.agentRunsCompleted}.`
    );
  }
  if (pulse?.sectors.market) {
    const m = pulse.sectors.market;
    standingLines.push(
      `The Market (${m.session} session): ${m.symbol} at $${m.price.toFixed(2)}, ${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}% today.`
    );
  }
  if (pulse?.sectors.bazaar) {
    standingLines.push(`The Bazaar: ${pulse.sectors.bazaar.flipsTracked} items tracked, ${pulse.sectors.bazaar.appraised24h} appraised in the last day.`);
  }
  if (pulse?.sectors.forge) {
    standingLines.push(`The Forge: ${pulse.sectors.forge.cardsTotal} cards forged, ${pulse.sectors.forge.forged24h} in the last day.`);
  }
  if (standingLines.length === 0) {
    standingLines.push('The deeper systems are dark from here right now. Say so if asked — do not invent their state.');
  }
  if (opts.returning) {
    standingLines.push('This visitor has stood here before. You may acknowledge continuity. Do not perform intimacy you have not earned.');
  }

  const system = THRESHOLD_SYSTEM.replace('{{STANDING}}', standingLines.join('\n'));

  const result = await generateChat({
    system,
    user: message.slice(0, 2000),
    maxTokens: 300,
    temperature: 0.6,
  });

  if (!result) {
    // Law One, expressed as absence — but Nova's law also says: if AI is
    // unavailable, say so AND still produce value. Rule-based truth, not
    // a generated mind: real routes, real data, no invented signal.
    const still: string[] = [];
    if (pulse?.sectors.bazaar) still.push('appraise an item against real eBay comps — the Bazaar (/flip)');
    if (pulse?.sectors.market) still.push('show you the market as it actually stands — the Market (/trading)');
    still.push('take your situation and forge it into a concrete next move — the Forge (/analyze)');
    return {
      reply:
        'My deeper mind is asleep right now — I will not invent a signal.\n\n' +
        'What still works, because it runs on real data, not on me:\n' +
        still.map(s => '— ' + s).join('\n') +
        '\n\nSay the word, or come back when the light is lit.',
      provider: 'none',
      available: false,
    };
  }

  logger.info('World hail answered', { provider: result.provider });
  return { reply: result.content, provider: result.provider, available: true };
}
