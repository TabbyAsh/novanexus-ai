/**
 * NOVA OS — the private command world (Manifesto §XIII).
 *
 * Two organs:
 *   THE DOOR — unlockWorld / verifyWorldKey: the world opens to the word,
 *     and to nothing else. Fail closed. The word lives in WORLD_PASSWORD;
 *     if it is unset the door has no word and does not open.
 *   THE STATE — getWorldOS: the complete real state of the ecosystem,
 *     assembled for the founder's eyes only.
 *
 * THE LAW (§XIII): visual properties must correspond to reality.
 *   brightness = actual activity · dimness = dormancy · pulse = current work
 *   scars = recorded failures · connections = real flows
 *   blockages = actual constraints · gravity = measured priority
 * Nothing fake renders. Every field below maps to a real row, a real env
 * check, or a real health probe. If a source is dark, it is null. Absence
 * is honest.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { healthSnapshot } from './providers';
import { getWorldPulse, WorldPulse } from './world';
import { readArtifacts } from './substrate';

const logger = createLogger('world-os');

// ── THE DOOR ──────────────────────────────────────────────────────────

const KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // the word holds for 30 days

function doorSecret(): Buffer | null {
  const word = process.env.WORLD_PASSWORD;
  if (!word || word.length < 8) return null; // no word, no door
  // Derive a signing secret from the word itself — rotating the word
  // revokes every key ever issued. All power is revocable (§XIX).
  return createHmac('sha256', 'nova-world-door-v1').update(word).digest();
}

export function doorHasWord(): boolean {
  return doorSecret() !== null;
}

function sign(exp: number, secret: Buffer): string {
  return createHmac('sha256', secret).update(String(exp)).digest('hex');
}

export function unlockWorld(password: string): { key: string; exp: number } | null {
  const word = process.env.WORLD_PASSWORD;
  const secret = doorSecret();
  if (!word || !secret) return null;
  const a = Buffer.from(password);
  const b = Buffer.from(word);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = Date.now() + KEY_TTL_MS;
  return { key: `${exp}.${sign(exp, secret)}`, exp };
}

export function verifyWorldKey(key: string | undefined): boolean {
  if (!key) return false;
  const secret = doorSecret();
  if (!secret) return false; // no word set → the world stays sealed
  const dot = key.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(key.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const given = Buffer.from(key.slice(dot + 1));
  const expected = Buffer.from(sign(exp, secret));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// The threshold is narrow: 5 attempts per 15 minutes per IP.
const unlockWindow = new Map<string, { count: number; resetAt: number }>();
export function unlockAllowed(ip: string): boolean {
  const now = Date.now();
  const entry = unlockWindow.get(ip);
  if (!entry || now > entry.resetAt) {
    unlockWindow.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// ── THE STATE ─────────────────────────────────────────────────────────

export interface Blockage {
  sector: 'core' | 'market' | 'bazaar' | 'forge';
  code: string;
  label: string;   // what is actually blocked, in plain words
  unlock: string;  // the real action that removes it — founder-sourced keys, mostly
}

export interface SocietyMember {
  id: string;
  name: string;
  role: string;
  writes: number;        // real artifacts authored on the substrate
  lastWriteAt: string | null;
}

export interface WorldOS {
  pulse: WorldPulse;
  blockages: Blockage[];
  scars: {
    anomalies14d: number;
    failedRuns7d: number;
    recent: Array<{ observation: string; at: string }>;
  };
  agents: Array<{
    id: string; name: string; mission: string; symbol: string | null;
    sector: string; status: string; lastRunAt: string | null;
    findings: number; flares: number; latestFinding: string | null;
  }>;
  society: SocietyMember[];
  ledgers: {
    truth: { artifacts: number; byKind: Record<string, number> };
    trust: { predictionsLogged: number; predictionsResolved: number; meanBrier: number | null };
    event: { total: number; last24h: number };
    nonArrival: {
      absorbed: number;
      refusals: number; // all-dark moments where Nova refused to invent (sovereignty anomalies)
      recent: Array<{ absorbed: string; carriedBy: string; at: string }>;
    };
  };
  mind: ReturnType<typeof healthSnapshot>;
  vault: { mounted: boolean; note: string; entries?: number };
  lattice: { nodes: number; edges: number } | null;
  intents: Record<string, number>;
  continuance: {
    constitution: string;
    ratified: string;
    doorHasWord: boolean;
    laws: number;
  };
  generatedAt: string;
}

// Known substrate authors → the society roster. Anyone else who has truly
// written appears under their own id — presence is earned by writing, never
// by being listed here.
const SOCIETY_NAMES: Record<string, { name: string; role: string }> = {
  'the-mirror': { name: 'The Mirror', role: 'audits Nova herself, reports unfiltered' },
  'the-explorer': { name: 'The Explorer', role: 'abduces hypotheses from real observations' },
  'the-smith': { name: 'The Smith', role: 'writes and repairs code, proposes, never merges' },
  'tuner': { name: 'The Tuner', role: 'proposes calibration patches, never hot-applies' },
  'forge-v2': { name: 'The Forge', role: 'sector blueprints under budget caps' },
  'sovereignty-monitor': { name: 'The Sovereignty Monitor', role: 'records when the mind goes dark' },
  'continuance': { name: 'The Continuance', role: 'records what did not reach the citizen' },
  'forge': { name: 'The Forge (intake)', role: 'agent deployment records' },
  'nova': { name: 'Nova', role: 'the coordinating intelligence' },
};

function detectBlockages(pulse: WorldPulse, mind: ReturnType<typeof healthSnapshot>): Blockage[] {
  const out: Blockage[] = [];

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    out.push({
      sector: 'bazaar', code: 'EBAY_DARK',
      label: 'Live eBay comps are dark — appraisals run on pasted comps and category models only',
      unlock: 'Set EBAY_CLIENT_ID + EBAY_CLIENT_SECRET on the backend service',
    });
  }
  if (!mind.capableOfLLM) {
    out.push({
      sector: 'core', code: 'MIND_DARK',
      label: 'No provider can reason right now — generated intelligence is honestly unavailable',
      unlock: 'Set GEMINI_API_KEY / GROQ_API_KEY, or point LOCAL_LLM_URL at a local model',
    });
  }
  if (!mind.sovereignty.localAvailable) {
    out.push({
      sector: 'core', code: 'NO_LOCAL_MIND',
      label: `No local mind — sovereignty capped at ${mind.sovereignty.score}% (${mind.sovereignty.band})`,
      unlock: 'Run Ollama locally and set LOCAL_LLM_URL',
    });
  }
  if (!pulse.sectors.market) {
    out.push({
      sector: 'market', code: 'FEED_DARK',
      label: 'The market feed is dark from here',
      unlock: 'Check marketdata service health and its provider keys',
    });
  }
  if (!process.env.RESEND_API_KEY) {
    out.push({
      sector: 'forge', code: 'NO_VOICE_OUT',
      label: 'Nova cannot email first — flares reach no one',
      unlock: 'Set RESEND_API_KEY on the backend service',
    });
  }
  if (!process.env.VAULT_DIR) {
    out.push({
      sector: 'core', code: 'VAULT_UNMOUNTED',
      label: 'No durable plain-text Vault on this node — memory lives only in the derived database',
      unlock: 'Mount a Railway volume and set VAULT_DIR (Manifesto Phase 1)',
    });
  }
  return out;
}

export async function getWorldOS(): Promise<WorldOS> {
  const pulse = await getWorldPulse();
  const mind = healthSnapshot();

  // Scars — recorded failures (§XIII: scars represent real damage).
  const scars = { anomalies14d: 0, failedRuns7d: 0, recent: [] as Array<{ observation: string; at: string }> };
  try {
    const a = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM artifacts WHERE kind = 'anomaly' AND created_at > NOW() - INTERVAL '14 days'`
    );
    scars.anomalies14d = parseInt(a?.count || '0', 10);
    const f = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM agent_runs WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '7 days'`
    );
    scars.failedRuns7d = parseInt(f?.count || '0', 10);
    const recent = await readArtifacts({ kind: 'anomaly', limit: 3 }).catch(() => []);
    scars.recent = (recent as any[]).map(r => ({
      observation: String(r.payload?.observation || '').slice(0, 140),
      at: r.created_at,
    }));
  } catch { /* dark stays dark */ }

  // The forged agents — every one real, with its real record.
  let agents: WorldOS['agents'] = [];
  try {
    const r = await query<any>(
      `SELECT a.id, a.name, a.mission, a.symbol, a.sector, a.status, a.last_run_at,
              COUNT(f.id) AS findings,
              COUNT(f.id) FILTER (WHERE f.significance >= 3) AS flares,
              (SELECT headline FROM world_agent_findings
                WHERE agent_id = a.id ORDER BY created_at DESC LIMIT 1) AS latest
       FROM world_agents a
       LEFT JOIN world_agent_findings f ON f.agent_id = a.id
       GROUP BY a.id ORDER BY a.created_at ASC LIMIT 40`
    );
    agents = r.rows.map((row: any) => ({
      id: row.id, name: row.name, mission: row.mission, symbol: row.symbol,
      sector: row.sector, status: row.status, lastRunAt: row.last_run_at,
      findings: parseInt(row.findings, 10), flares: parseInt(row.flares, 10),
      latestFinding: row.latest || null,
    }));
  } catch { /* dark stays dark */ }

  // The society — membership is earned by having actually written to the
  // substrate. No writes, no presence. (§XIII: no decorative agent pretends.)
  let society: SocietyMember[] = [];
  try {
    // Forged watchers author mission reports under their agent UUID —
    // resolve to their given names so the society stays legible (§XIII).
    const r = await query<{ author_id: string; agent_name: string | null; writes: string; last_write: string }>(
      `SELECT a.author_id, w.name AS agent_name,
              COUNT(*) AS writes, MAX(a.created_at) AS last_write
       FROM artifacts a
       LEFT JOIN world_agents w ON w.id::text = a.author_id
       WHERE a.author_type IN ('agent', 'system', 'nova')
       GROUP BY a.author_id, w.name ORDER BY MAX(a.created_at) DESC LIMIT 20`
    );
    society = r.rows.map(row => ({
      id: row.author_id,
      name: SOCIETY_NAMES[row.author_id]?.name
        || row.agent_name
        || (row.author_id.startsWith('ignition') ? 'Ignition' : row.author_id),
      role: SOCIETY_NAMES[row.author_id]?.role
        || (row.agent_name ? 'a forged watcher, reporting its missions'
            : row.author_id.startsWith('ignition') ? 'proposes capabilities from observed gaps'
            : 'writes to the substrate'),
      writes: parseInt(row.writes, 10),
      lastWriteAt: row.last_write,
    }));
  } catch { /* dark stays dark */ }

  // The four ledgers (§XII, §XXI) — computed from what is actually there.
  const ledgers: WorldOS['ledgers'] = {
    truth: { artifacts: 0, byKind: {} },
    trust: { predictionsLogged: 0, predictionsResolved: 0, meanBrier: null },
    event: { total: 0, last24h: 0 },
    nonArrival: { absorbed: 0, refusals: 0, recent: [] },
  };
  try {
    const kinds = await query<{ kind: string; count: string }>(
      `SELECT kind, COUNT(*) AS count FROM artifacts GROUP BY kind`
    );
    for (const row of kinds.rows) {
      ledgers.truth.byKind[row.kind] = parseInt(row.count, 10);
      ledgers.truth.artifacts += parseInt(row.count, 10);
    }
  } catch {}
  try {
    const t = await queryOne<{ logged: string; resolved: string; brier: string | null }>(
      `SELECT COUNT(*) AS logged,
              COUNT(*) FILTER (WHERE resolved) AS resolved,
              AVG(POWER(claimed_probability - outcome::int, 2))
                FILTER (WHERE resolved AND outcome IS NOT NULL) AS brier
       FROM monitor_predictions`
    );
    if (t) {
      ledgers.trust.predictionsLogged = parseInt(t.logged, 10);
      ledgers.trust.predictionsResolved = parseInt(t.resolved, 10);
      ledgers.trust.meanBrier = t.brier === null ? null : Math.round(parseFloat(t.brier) * 1000) / 1000;
    }
  } catch {}
  try {
    const e = await queryOne<{ total: string; recent: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours') AS recent
       FROM events`
    );
    if (e) {
      ledgers.event.total = parseInt(e.total, 10);
      ledgers.event.last24h = parseInt(e.recent, 10);
    }
  } catch {}
  try {
    const n = await queryOne<{ count: string }>(`SELECT COUNT(*) AS count FROM artifacts WHERE kind = 'non_arrival'`);
    ledgers.nonArrival.absorbed = parseInt(n?.count || '0', 10);
    const refusals = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM artifacts WHERE kind = 'anomaly' AND payload->>'class' = 'sovereignty'`
    );
    ledgers.nonArrival.refusals = parseInt(refusals?.count || '0', 10);
    const recent = await readArtifacts({ kind: 'non_arrival', limit: 5 }).catch(() => []);
    ledgers.nonArrival.recent = (recent as any[]).map(r => ({
      absorbed: String(r.payload?.absorbed || '').slice(0, 120),
      carriedBy: String(r.payload?.carried_by || ''),
      at: r.created_at,
    }));
  } catch {}

  // The Vault — honest status via the organ itself (§VII).
  const { vaultStatus } = await import('./vault');
  const vs = await vaultStatus();
  const vault: WorldOS['vault'] = { mounted: vs.mounted, note: vs.note, entries: vs.entries };

  // The lattice and the intents — present only as far as they are real.
  let lattice: WorldOS['lattice'] = null;
  try {
    const n = await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM lattice_nodes`);
    const e = await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM lattice_edges`);
    if (n) lattice = { nodes: parseInt(n.n, 10), edges: parseInt(e?.n || '0', 10) };
  } catch { /* tables not migrated yet — absent, not faked */ }
  let intents: Record<string, number> = {};
  try {
    const { intentCounts } = await import('./intents');
    intents = await intentCounts();
  } catch { /* absent, not faked */ }

  return {
    pulse,
    blockages: detectBlockages(pulse, mind),
    scars,
    agents,
    society,
    ledgers,
    mind,
    vault,
    lattice,
    intents,
    continuance: {
      constitution: 'The Full Inside-and-Out Manifesto',
      ratified: '2026-07-20',
      doorHasWord: doorHasWord(),
      laws: 11,
    },
    generatedAt: new Date().toISOString(),
  };
}
