/**
 * EXECUTOR AGENTS — Spec v0.2 §1 (Layer A), bounded and honest.
 *
 * The grammar is hardcoded: the tool registry, step limits, the deliverable
 * schema. The sentences are generated: which tools, in what order, and what
 * the synthesis says. Nova composes; she does not select from templates.
 *
 * v1 toolset = the system's own REAL capabilities (no brittle web scraping,
 * no fabricated gaps): live quotes, the flip engine, the trend radar, the
 * substrate. When the planner needs a tool that doesn't exist, that is not
 * a failure — it is a structured capability_gap (§3) and the founder hears
 * about it first (§4, the proactive loop).
 *
 * Every deliverable: {answer, evidence[], assumptions[], confidence,
 * cost_of_task} — never a bare answer. Confidence is labeled UNCALIBRATED
 * until executor outcomes accumulate (rail 4 applies to executors too).
 */

import { createLogger } from '@nova/telemetry';
import type { NexusAuthorityMode, NexusCapabilityDescriptor, NexusCapabilityStatus, NexusSector } from '@nova/shared';
import { generateChat } from './ai-router';
import { writeArtifact } from './substrate';

const logger = createLogger('executor');

const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';

const MAX_STEPS = 6; // the sandbox limit — grammar, not vibes

// ── The tool registry (hardcoded grammar) ──────────────────────────────
interface ToolResult { ok: boolean; summary: string; source: string }

interface RegisteredTool {
  description: string;
  sector: NexusSector;
  authority: NexusAuthorityMode;
  status?: NexusCapabilityStatus;
  requires: string[];
  run: (args: any) => Promise<ToolResult>;
}

const TOOLS: Record<string, RegisteredTool> = {
  market_quote: {
    description: 'Live quote for a stock symbol. args: {symbol}',
    sector: 'market', authority: 'observe', requires: ['marketdata'],
    run: async (args) => {
      const r = await fetch(`${MARKETDATA_URL}/v1/market/quote/${String(args.symbol || '').toUpperCase()}`, { signal: AbortSignal.timeout(8000) });
      const q = (await r.json() as any)?.data?.quote;
      if (!q?.price) return { ok: false, summary: `No live data for ${args.symbol}.`, source: 'marketdata' };
      return { ok: true, summary: `${args.symbol}: $${q.price} (${q.changePercent ?? q.change_percent ?? 0}% today)`, source: `marketdata:quote/${args.symbol}` };
    },
  },
  flip_appraise: {
    description: 'Resale appraisal for an item at a price. args: {title, buy_price}',
    sector: 'commerce', authority: 'recommend', requires: ['commercedata or supplied sold comps'],
    run: async (args) => {
      const title = String(args.title || '').trim();
      const buyPrice = Number(args.buy_price);
      if (!title || !(buyPrice > 0)) {
        return { ok: false, summary: 'Flip appraisal requires an item title and positive purchase price.', source: 'nexus:required-input' };
      }
      const { computeFlipCard } = await import('./flip-card');
      const card = await computeFlipCard({ title, buy_price: buyPrice, condition: 'Good', shipping_or_pickup: 'shipping' });
      const hasLiveComps = (card.comp_sources?.[0]?.count ?? 0) > 0;
      return { ok: true, summary: `${title} @ $${buyPrice}: verdict ${card.verdict}, est. resale $${card.est_resale_low}–$${card.est_resale_high}, net mid $${card.est_net_profit_mid}, confidence ${card.confidence_score}% (${hasLiveComps ? 'live comps' : 'category model; no live comps'})`, source: hasLiveComps ? 'flip-engine:live-comps' : 'flip-engine:category-model' };
    },
  },
  trend_scan: {
    description: 'Current live demand trends and product opportunities. args: {}',
    sector: 'commerce', authority: 'observe', requires: ['live trend sources'],
    run: async () => {
      const { getTrendRadar } = await import('./trend-radar');
      const t = await getTrendRadar('US');
      const top = t.cards.slice(0, 5).map(c => `${c.term}${c.isProductOpportunity ? ' [product]' : ''}`).join('; ');
      return { ok: true, summary: `${t.scanned} live trends, ${t.productOpportunities} product opportunities. Top: ${top}`, source: 'trend-radar' };
    },
  },
  substrate_search: {
    description: 'Search tenant-scoped permanent records by kind (temporarily unavailable until artifact ownership is enforced).',
    sector: 'memory', authority: 'observe', requires: ['postgres artifacts'],
    status: 'degraded',
    run: async (args) => {
      void args;
      return { ok: false, summary: 'Memory search is paused until artifact reads are tenant-scoped.', source: 'substrate:scope-gate' };
    },
  },
};

export function listExecutorCapabilities(): NexusCapabilityDescriptor[] {
  return Object.entries(TOOLS).map(([id, tool]) => ({
    id: `executor.${id}`,
    name: id.split('_').map(part => part[0].toUpperCase() + part.slice(1)).join(' '),
    sector: tool.sector,
    description: tool.description,
    status: tool.status || 'available',
    authority: tool.authority,
    entrypoint: '/v1/executor/run',
    sideEffects: [],
    requires: tool.requires,
  }));
}

// ── Capability gaps (§3) + the proactive loop (§4) ─────────────────────
async function emitCapabilityGap(needed: string, why: string, exampleTask: string): Promise<void> {
  // The substrate is not yet tenant-scoped. Persist and email the capability
  // class, never the user's raw task or planner explanation.
  void why;
  void exampleTask;
  const lower = needed.toLowerCase();
  const gapClass = [
    'web-search', 'browser', 'citation-verification', 'email-delivery',
    'file-generation', 'database-access', 'market-data', 'commerce-data',
    'social-publishing', 'code-execution', 'human-approval',
  ].find(value => lower.includes(value.replace('-', ' ')) || lower.includes(value)) || 'unclassified-capability';
  await writeArtifact({
    kind: 'anomaly',
    authorType: 'agent',
    authorId: 'executor',
    payload: {
      observation: `capability_gap: planner needs "${gapClass}"`,
      expected: 'a registered tool covering this step',
      needed_capability: gapClass, task_redacted: true, priority: 'normal',
    },
  });
  // Notifications are deliberately absent from the request path. A governed
  // Forge review/digest may later surface the redacted gap with explicit policy.
  logger.info('Capability gap emitted', { needed: gapClass });
}

// ── The executor ───────────────────────────────────────────────────────
export interface Deliverable {
  answer: string;
  evidence: Array<{ capabilityId: string; step: string; result: string; source: string }>;
  assumptions: string[];
  confidence: { value: number; calibrated: false; note: string };
  cost_of_task: { ai_calls: number; tool_calls: number };
  gaps: string[];
}

export async function runExecutorTask(goal: string): Promise<Deliverable | { error: string }> {
  let aiCalls = 0;

  // PLAN — generated per request, constrained to the registry (grammar vs sentences)
  const toolList = Object.entries(TOOLS).map(([k, v]) => `- ${k}: ${v.description}`).join('\n');
  const planRes = await generateChat({
    system: `You are Nova's planner. Decompose the goal into at most ${MAX_STEPS} steps using ONLY these tools:\n${toolList}\n\nReturn STRICT JSON: {"steps":[{"tool":"<name>","args":{...},"purpose":"<one line>"}],"missing":[{"needed":"<capability>","why":"<one line>"}]}\nIf a step would need a tool not in the registry, put it in "missing" instead of inventing one. No prose.`,
    user: goal.slice(0, 1500),
    maxTokens: 600,
    temperature: 0.3,
  });
  aiCalls++;
  if (!planRes) return { error: 'No mind available to plan. I will not fabricate a plan.' };

  let plan: { steps: Array<{ tool: string; args: any; purpose: string }>; missing?: Array<{ needed: string; why: string }> };
  try {
    plan = JSON.parse(planRes.content.replace(/```json?|```/g, '').trim());
  } catch {
    return { error: 'Planner produced an unparseable plan. Task aborted honestly rather than guessed.' };
  }

  const gaps: string[] = [];
  for (const m of plan.missing || []) {
    gaps.push(m.needed);
    await emitCapabilityGap(m.needed, m.why, goal);
  }

  // EXECUTE — bounded, evidence-linked, degrades gracefully
  const evidence: Deliverable['evidence'] = [];
  let toolCalls = 0;
  for (const step of (plan.steps || []).slice(0, MAX_STEPS)) {
    const tool = TOOLS[step.tool];
    if (!tool) { gaps.push(step.tool); await emitCapabilityGap(step.tool, 'planner referenced unregistered tool', goal); continue; }
    try {
      const r = await tool.run(step.args || {});
      toolCalls++;
      if (r.ok) {
        evidence.push({ capabilityId: `executor.${step.tool}`, step: step.purpose || step.tool, result: r.summary, source: r.source });
      } else {
        gaps.push(step.tool);
        evidence.push({ capabilityId: `executor.${step.tool}`, step: step.purpose || step.tool, result: `FAILED: ${r.summary}`, source: r.source });
      }
    } catch (err) {
      evidence.push({ capabilityId: `executor.${step.tool}`, step: step.purpose || step.tool, result: `FAILED: ${(err as Error).message.slice(0, 100)} — gap reported, not fabricated.`, source: step.tool });
    }
  }

  // SYNTHESIZE — the analyst writes the deliverable from evidence only
  const synthRes = await generateChat({
    system: `You are Nova's analyst. Write a decisive answer to the goal using ONLY the evidence provided — never invent numbers absent from evidence. Then list assumptions you had to make. Keep under 200 words. Format:\nANSWER: ...\nASSUMPTIONS:\n- ...`,
    user: `GOAL: ${goal}\n\nEVIDENCE:\n${evidence.map(e => `- [${e.source}] ${e.result}`).join('\n') || '(none gathered)'}`,
    maxTokens: 400,
    temperature: 0.4,
  });
  aiCalls++;

  const answerText = synthRes?.content || 'Synthesis unavailable — raw evidence attached; I will not fabricate a conclusion.';
  const assumptions = (answerText.match(/ASSUMPTIONS:([\s\S]*)/)?.[1] || '')
    .split('\n').map(s => s.replace(/^[-\s]+/, '').trim()).filter(Boolean).slice(0, 6);

  const deliverable: Deliverable = {
    answer: answerText.replace(/ASSUMPTIONS:[\s\S]*/, '').replace(/^ANSWER:\s*/i, '').trim(),
    evidence,
    assumptions,
    confidence: {
      value: evidence.filter(e => !e.result.startsWith('FAILED')).length / Math.max(1, evidence.length),
      calibrated: false,
      note: 'Share of steps that returned real data. NOT a calibrated probability — executor outcomes are not yet scored (rail 4).',
    },
    cost_of_task: { ai_calls: aiCalls, tool_calls: toolCalls },
    gaps,
  };

  // Every executed task is a permanent record (§4 of the manifesto still rules)
  await writeArtifact({
    kind: 'mission_report',
    regime: 'EXPLOITATION',
    authorType: 'agent',
    authorId: 'executor',
    payload: {
      agent: 'Executor',
      goal_redacted: true,
      findings: evidence.map(e => `${e.capabilityId} used`).slice(0, 8),
      anomalies: gaps.map(() => 'capability gap recorded'),
      deliverable: { evidenceCount: evidence.length, confidence: deliverable.confidence.value },
    },
  }).catch(() => {});

  return deliverable;
}
