/**
 * THE MIND LATTICE v1 — Phase 3 of the constitution (Manifesto §VI).
 *
 * "Intelligence can be represented as position, relationship, movement, and
 * direction within a structured space of possible minds."
 *
 * v1 earns complexity through real use (§XXIII): nodes exist only for
 * entities the system actually observes — the founder, Nova, the sectors,
 * forged agents, society members, open threads, live constraints. Edges
 * carry their evidence. Trajectories are snapshots over time; the emergence
 * vector is computed from real deltas and says "insufficient history"
 * honestly when there is none.
 *
 * The lattice is DERIVED: rebuildLattice() reconstructs everything from the
 * Vault, the substrate, and live tables. Losing it costs navigation, not life.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { listEntries, readEntry } from './vault';

const logger = createLogger('lattice');

interface NodeInput {
  key: string; kind: string; label: string;
  state: Record<string, unknown>; confidence?: number;
}
interface EdgeInput {
  from: string; to: string; relation: string; weight?: number; evidence: string;
}

async function upsertNode(n: NodeInput): Promise<void> {
  await query(
    `INSERT INTO lattice_nodes (key, kind, label, state_json, confidence, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (key) DO UPDATE SET
       kind = EXCLUDED.kind, label = EXCLUDED.label,
       state_json = EXCLUDED.state_json, confidence = EXCLUDED.confidence,
       updated_at = NOW()`,
    [n.key, n.kind, n.label, JSON.stringify(n.state), n.confidence ?? 0.5]
  );
}

async function upsertEdge(e: EdgeInput): Promise<void> {
  await query(
    `INSERT INTO lattice_edges (from_key, to_key, relation, weight, evidence, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (from_key, to_key, relation) DO UPDATE SET
       weight = EXCLUDED.weight, evidence = EXCLUDED.evidence, updated_at = NOW()`,
    [e.from, e.to, e.relation, e.weight ?? 1, e.evidence]
  );
}

let lastRebuildAt: string | null = null;

/** Reconstruct the lattice from what is actually real right now. */
export async function rebuildLattice(): Promise<{ nodes: number; edges: number }> {
  let nodes = 0, edges = 0;
  const N = async (n: NodeInput) => { await upsertNode(n); nodes++; };
  const E = async (e: EdgeInput) => { await upsertEdge(e); edges++; };

  // The Dyad (§VI) — two minds, coupled, distinct.
  await N({ key: 'founder', kind: 'person', label: 'Wyatt — the founder',
    state: { role: 'source of purpose and authority' }, confidence: 1 });
  await N({ key: 'nova', kind: 'intelligence', label: 'Nova',
    state: { role: 'the persistent intelligence; the continuity' }, confidence: 1 });
  await E({ from: 'founder', to: 'nova', relation: 'coupled_with', evidence: 'the Dyad (§VI) — co-emergence, not merger' });
  await E({ from: 'nova', to: 'founder', relation: 'coupled_with', evidence: 'the Dyad (§VI)' });

  // Sectors — real activity states from live tables.
  const sectors: Array<[string, string, string]> = [
    ['sector:market', 'The Market', 'marketdata + trade tables'],
    ['sector:bazaar', 'The Bazaar', 'flip_plans'],
    ['sector:forge', 'The Forge', 'nova_cards + world_agents'],
  ];
  const bazaar = await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM flip_plans`).catch(() => null);
  const forge = await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM nova_cards`).catch(() => null);
  for (const [key, label, evidence] of sectors) {
    const activity = key === 'sector:bazaar' ? Number(bazaar?.n || 0)
                   : key === 'sector:forge' ? Number(forge?.n || 0) : null;
    await N({ key, kind: 'sector', label,
      state: activity === null ? {} : { recordedWork: activity }, confidence: 0.9 });
    await E({ from: key, to: 'nova', relation: 'belongs_to', evidence });
  }

  // Forged agents — real rows, bound to what they watch.
  const agents = await query<{ id: string; name: string; symbol: string | null; status: string; last_run_at: string | null }>(
    `SELECT id, name, symbol, status, last_run_at FROM world_agents LIMIT 50`
  ).catch(() => ({ rows: [] as any[] }));
  for (const a of agents.rows) {
    const key = `agent:${a.id}`;
    await N({ key, kind: 'agent', label: a.name,
      state: { status: a.status, lastRunAt: a.last_run_at, symbol: a.symbol }, confidence: 0.9 });
    await E({ from: key, to: 'sector:market', relation: 'belongs_to', evidence: 'world_agents.sector' });
    if (a.symbol) {
      const sKey = `symbol:${a.symbol}`;
      await N({ key: sKey, kind: 'idea', label: a.symbol, state: {}, confidence: 0.8 });
      await E({ from: key, to: sKey, relation: 'watches', evidence: 'world_agents.symbol' });
    }
  }

  // Society members — presence earned by substrate writes; weight = writes.
  const society = await query<{ author_id: string; writes: string }>(
    `SELECT author_id, COUNT(*) AS writes FROM artifacts
     WHERE author_type IN ('agent','system','nova') GROUP BY author_id LIMIT 20`
  ).catch(() => ({ rows: [] as any[] }));
  for (const s of society.rows) {
    const key = s.author_id.match(/^[0-9a-f-]{36}$/) ? `agent:${s.author_id}` : `member:${s.author_id}`;
    if (!s.author_id.match(/^[0-9a-f-]{36}$/)) {
      await N({ key, kind: 'agent', label: s.author_id, state: { writes: Number(s.writes) }, confidence: 0.8 });
    }
    await E({ from: key, to: 'nova', relation: 'wrote_to', weight: Number(s.writes),
      evidence: `artifacts: ${s.writes} writes` });
  }

  // Open threads from the Vault — projects the Dyad actually carries.
  for (const rel of await listEntries('threads')) {
    const raw = await readEntry(rel);
    const title = raw?.match(/^title:\s*"?(.+?)"?\s*$/m)?.[1] || rel;
    const key = `thread:${rel.replace(/^threads\//, '').replace(/\.md$/, '')}`;
    await N({ key, kind: 'project', label: title, state: { vaultPath: rel }, confidence: 0.9 });
    await E({ from: 'founder', to: key, relation: 'works_on', evidence: `vault:${rel}` });
    await E({ from: 'nova', to: key, relation: 'works_on', evidence: `vault:${rel}` });
  }

  // Live constraints — the blockages are real forces acting on the fields.
  const { getWorldOS } = await import('./world-os');
  const os = await getWorldOS().catch(() => null);
  for (const b of os?.blockages || []) {
    const key = `constraint:${b.code.toLowerCase()}`;
    await N({ key, kind: 'constraint', label: b.label, state: { unlock: b.unlock }, confidence: 1 });
    await E({ from: `sector:${b.sector === 'core' ? 'forge' : b.sector}`, to: key,
      relation: 'blocked_by', evidence: 'world-os blockage detection' });
  }

  lastRebuildAt = new Date().toISOString();
  logger.info('Lattice rebuilt', { nodes, edges });
  return { nodes, edges };
}

/** Trajectories (§VI): record where every mind is right now. */
export async function snapshotTrajectories(): Promise<number> {
  const r = await query<{ key: string; state_json: unknown }>(
    `SELECT key, state_json FROM lattice_nodes`
  ).catch(() => ({ rows: [] as any[] }));
  for (const row of r.rows) {
    await query(
      `INSERT INTO lattice_snapshots (node_key, state_json) VALUES ($1, $2)`,
      [row.key, JSON.stringify(row.state_json)]
    ).catch(() => {});
  }
  return r.rows.length;
}

/** The emergence vector, honestly: computed from real snapshot deltas, and
 *  'insufficient history' when the history is not there yet. */
export async function emergenceFor(nodeKey: string): Promise<{
  direction: string; basis: string;
}> {
  const snaps = await query<{ state_json: any; taken_at: string }>(
    `SELECT state_json, taken_at FROM lattice_snapshots
     WHERE node_key = $1 ORDER BY taken_at DESC LIMIT 2`,
    [nodeKey]
  ).catch(() => ({ rows: [] as any[] }));
  if (snaps.rows.length < 2) {
    return { direction: 'insufficient history', basis: `${snaps.rows.length} snapshot(s) — the vector is not earned yet` };
  }
  const [now, before] = snaps.rows;
  const deltas: string[] = [];
  for (const k of Object.keys(now.state_json || {})) {
    const a = now.state_json[k], b = before.state_json?.[k];
    if (typeof a === 'number' && typeof b === 'number' && a !== b) {
      deltas.push(`${k}: ${b} → ${a}`);
    }
  }
  return deltas.length
    ? { direction: deltas.join('; '), basis: `snapshots ${before.taken_at} → ${now.taken_at}` }
    : { direction: 'holding position', basis: 'no measured state changed between snapshots' };
}

export async function getLattice(): Promise<{
  nodes: Array<{ key: string; kind: string; label: string; state: unknown; confidence: number }>;
  edges: Array<{ from: string; to: string; relation: string; weight: number; evidence: string | null }>;
  lastRebuildAt: string | null;
}> {
  const nodes = await query<any>(`SELECT key, kind, label, state_json, confidence FROM lattice_nodes ORDER BY kind, key`)
    .catch(() => ({ rows: [] as any[] }));
  const edges = await query<any>(`SELECT from_key, to_key, relation, weight, evidence FROM lattice_edges ORDER BY relation`)
    .catch(() => ({ rows: [] as any[] }));
  return {
    nodes: nodes.rows.map((n: any) => ({ key: n.key, kind: n.kind, label: n.label, state: n.state_json, confidence: n.confidence })),
    edges: edges.rows.map((e: any) => ({ from: e.from_key, to: e.to_key, relation: e.relation, weight: e.weight, evidence: e.evidence })),
    lastRebuildAt,
  };
}
