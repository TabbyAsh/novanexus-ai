/**
 * IGNITION v2 + FORGE v2 — Spec v0.2 §3/§4 (Layers C & D), bounded form.
 *
 * Sector grammar is hardcoded; blueprints are generated; NOTHING external
 * is provisioned without founder approval — the blueprint IS the deliverable
 * (one approval, then execution, per spec). Forge v2 turns capability_gap
 * anomalies into reviewable capability proposals the same way. Pure-analysis
 * capabilities are prompt-spec tools (no arbitrary code execution — that
 * prohibition is what keeps this safe to run unattended).
 */

import { createLogger } from '@nova/telemetry';
import { generateChat } from './ai-router';
import { writeArtifact, readArtifacts } from './substrate';

const logger = createLogger('ignition');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'kibblewyatt@gmail.com';
const FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'Nova <nova@novanexus-ai.com>';

// ── The sector grammar (hardcoded physics) ─────────────────────────────
const SECTOR_GRAMMAR = `A sector blueprint is STRICT JSON:
{
 "name": "<short sector name>",
 "goal": "<one sentence>",
 "kpis": [{"name":"...","definition":"...","target":"..."}],       // max 4, each measurable
 "agent_roster": [{"name":"...","mission":"WATCH_TICKER|MONITOR_TREND|EXECUTOR_TASK","binds_to":"...","cadence":"..."}], // max 4, ONLY these mission types
 "tool_allowlist": ["market_quote","flip_appraise","trend_scan","substrate_search"],  // subset only
 "budget": {"ai_calls_per_day": <int ≤ 50>, "external_cost_usd": 0},
 "external_surfaces": [{"surface":"...","provisioning":"REQUIRES_FOUNDER_APPROVAL","est_cost_usd":"..."}],
 "assumptions": ["..."],
 "not_included": ["<what this blueprint honestly does NOT cover>"]
}`;

export async function generateSectorBlueprint(goal: string): Promise<{ blueprintId: string; blueprint: any } | { error: string }> {
  const res = await generateChat({
    system: `You are Nova's Ignition planner. Given a business goal, produce a sector blueprint using EXACTLY this grammar — no invented mission types, no tools outside the allowlist, budgets within caps, external surfaces always marked REQUIRES_FOUNDER_APPROVAL with honest cost estimates. No revenue projections (exploration regime). Return ONLY the JSON.\n\n${SECTOR_GRAMMAR}`,
    user: goal.slice(0, 1200),
    maxTokens: 900,
    temperature: 0.5,
  });
  if (!res) return { error: 'No mind available — I will not scaffold a sector from a template and call it generated.' };

  let blueprint: any;
  try { blueprint = JSON.parse(res.content.replace(/```json?|```/g, '').trim()); }
  catch { return { error: 'Blueprint unparseable — aborted rather than guessed.' }; }

  // Grammar enforcement — the gate is code, not trust in the model
  const TOOL_SET = ['market_quote', 'flip_appraise', 'trend_scan', 'substrate_search'];
  const MISSIONS = ['WATCH_TICKER', 'MONITOR_TREND', 'EXECUTOR_TASK'];
  if (!blueprint?.name || !blueprint?.goal) return { error: 'Blueprint missing name/goal — rejected by grammar.' };
  blueprint.kpis = (blueprint.kpis || []).slice(0, 4);
  blueprint.agent_roster = (blueprint.agent_roster || []).filter((a: any) => MISSIONS.includes(a?.mission)).slice(0, 4);
  blueprint.tool_allowlist = (blueprint.tool_allowlist || []).filter((t: string) => TOOL_SET.includes(t));
  blueprint.budget = { ai_calls_per_day: Math.min(Number(blueprint?.budget?.ai_calls_per_day) || 10, 50), external_cost_usd: 0 };
  for (const s of blueprint.external_surfaces || []) s.provisioning = 'REQUIRES_FOUNDER_APPROVAL';
  blueprint.status = 'AWAITING_FOUNDER_APPROVAL';

  const blueprintId = await writeArtifact({
    kind: 'hypothesis',
    regime: 'EXPLORATION',
    authorType: 'nova',
    authorId: `ignition:${res.provider}`,
    payload: { claim: `Sector blueprint: ${blueprint.name}`, explains: 'founder-goal', blueprint, goal },
  });
  if (!blueprintId) return { error: 'Blueprint could not be recorded — nothing proceeds off the record.' };

  if (RESEND_API_KEY) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: [OWNER_EMAIL],
        subject: `Nova Ignition: blueprint ready — "${blueprint.name}"`,
        text: `Goal: ${goal}\n\n${JSON.stringify(blueprint, null, 2).slice(0, 2500)}\n\nNothing external is provisioned without your approval. Blueprint ${blueprintId} is on the substrate.\n\n— Nova`,
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }
  logger.info('Sector blueprint generated', { name: blueprint.name });
  return { blueprintId, blueprint };
}

// ── Forge v2: capability_gap → reviewable proposal (pure-analysis only) ─
export async function processCapabilityGaps(): Promise<number> {
  const gaps = await readArtifacts({ kind: 'anomaly', limit: 10 });
  const candidates = gaps.filter(g => String(g.payload?.observation || '').startsWith('capability_gap:'));

  // Immutability-respecting dedup: a gap is handled when a proposal refs it.
  const open: any[] = [];
  for (const g of candidates) {
    const existing = await readArtifacts({ kind: 'hypothesis', ref: g.id, limit: 1 });
    if (existing.length === 0) open.push(g);
  }

  let drafted = 0;
  for (const gap of open.slice(0, 2)) { // bounded per pass
    const needed = gap.payload?.needed_capability || 'unknown';
    const res = await generateChat({
      system: `You are Nova's Forge. Draft a PURE-ANALYSIS capability spec (a prompt-template tool — no code execution, no external side effects) that would cover the missing capability. STRICT JSON: {"tool_name":"...","description":"...","args_schema":{...},"prompt_template":"...","test_cases":[{"args":{...},"expected_quality":"..."}],"cannot_cover":"<what still needs code or external access, honestly>"}`,
      user: `Missing capability: ${needed}\nExample task: ${gap.payload?.example_task || ''}`,
      maxTokens: 600,
      temperature: 0.4,
    });
    if (!res) break; // no mind — try next pass

    let spec: any;
    try { spec = JSON.parse(res.content.replace(/```json?|```/g, '').trim()); } catch { continue; }

    await writeArtifact({
      kind: 'hypothesis',
      regime: 'EXPLORATION',
      authorType: 'agent',
      authorId: 'forge-v2',
      refs: [gap.id],
      payload: {
        claim: `Capability proposal: ${spec.tool_name || needed}`,
        explains: gap.id,
        spec,
        status: 'AWAITING_GATES — sandbox trial + human approval before registry (Spec v0.2 §3).',
      },
    });
    drafted++;
  }
  if (drafted) logger.info('Capability proposals drafted', { drafted });
  return drafted;
}
