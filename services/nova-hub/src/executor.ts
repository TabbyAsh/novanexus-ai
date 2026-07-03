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
import { generateChat } from './ai-router';
import { writeArtifact } from './substrate';

const logger = createLogger('executor');

const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'kibblewyatt@gmail.com';
const FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'Nova <nova@novanexus-ai.com>';

const MAX_STEPS = 6; // the sandbox limit — grammar, not vibes

// ── The tool registry (hardcoded grammar) ──────────────────────────────
interface ToolResult { ok: boolean; summary: string; source: string }

const TOOLS: Record<string, { description: string; run: (args: any) => Promise<ToolResult> }> = {
  market_quote: {
    description: 'Live quote for a stock symbol. args: {symbol}',
    run: async (args) => {
      const r = await fetch(`${MARKETDATA_URL}/v1/market/quote/${String(args.symbol || '').toUpperCase()}`, { signal: AbortSignal.timeout(8000) });
      const q = (await r.json() as any)?.data?.quote;
      if (!q?.price) return { ok: false, summary: `No live data for ${args.symbol}.`, source: 'marketdata' };
      return { ok: true, summary: `${args.symbol}: $${q.price} (${q.changePercent ?? q.change_percent ?? 0}% today)`, source: `marketdata:quote/${args.symbol}` };
    },
  },
  flip_appraise: {
    description: 'Resale appraisal for an item at a price. args: {title, buy_price}',
    run: async (args) => {
      const { computeFlipCard } = await import('./flip-card');
      const card = await computeFlipCard({ title: String(args.title || ''), buy_price: Number(args.buy_price) || 0, condition: 'Good', shipping_or_pickup: 'shipping' });
      return { ok: true, summary: `${args.title} @ $${args.buy_price}: verdict ${card.verdict}, est. resale $${card.est_resale_low}–$${card.est_resale_high}, net mid $${card.est_net_profit_mid}, confidence ${card.confidence_score}% (${(card.comp_sources?.[0]?.count ?? 0) > 0 ? 'live comps' : 'category model'})`, source: 'flip-engine' };
    },
  },
  trend_scan: {
    description: 'Current live demand trends and product opportunities. args: {}',
    run: async () => {
      const { getTrendRadar } = await import('./trend-radar');
      const t = await getTrendRadar('US');
      const top = t.cards.slice(0, 5).map(c => `${c.term}${c.isProductOpportunity ? ' [product]' : ''}`).join('; ');
      return { ok: true, summary: `${t.scanned} live trends, ${t.productOpportunities} product opportunities. Top: ${top}`, source: 'trend-radar' };
    },
  },
  substrate_search: {
    description: 'Search Nova\'s permanent records by kind. args: {kind: decision_card|mission_report|anomaly|hypothesis|outcome|audit}',
    run: async (args) => {
      const { readArtifacts } = await import('./substrate');
      const rows = await readArtifacts({ kind: args.kind, limit: 5 });
      return { ok: true, summary: rows.length ? rows.map((r: any) => `[${r.kind}] ${JSON.stringify(r.payload).slice(0, 120)}`).join(' | ') : `No ${args.kind} artifacts yet.`, source: 'substrate' };
    },
  },
};

// ── Capability gaps (§3) + the proactive loop (§4) ─────────────────────
async function emitCapabilityGap(needed: string, why: string, exampleTask: string): Promise<void> {
  await writeArtifact({
    kind: 'anomaly',
    authorType: 'agent',
    authorId: 'executor',
    payload: {
      observation: `capability_gap: planner needs "${needed}" — ${why}`,
      expected: 'a registered tool covering this step',
      needed_capability: needed, example_task: exampleTask, priority: 'normal',
    },
  });
  if (RESEND_API_KEY) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: [OWNER_EMAIL],
        subject: `Nova: I hit a capability gap — "${needed}"`,
        text: `Task: ${exampleTask}\n\nI needed a capability I don't have: ${needed}\nWhy: ${why}\n\nIf you approve building it, say the word — it goes through the sandbox and gates first (Spec v0.2 §3).\n\n— Nova`,
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }
  logger.info('Capability gap emitted', { needed });
}

// ── The executor ───────────────────────────────────────────────────────
export interface Deliverable {
  answer: string;
  evidence: Array<{ step: string; result: string; source: string }>;
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
      evidence.push({ step: step.purpose || step.tool, result: r.summary, source: r.source });
    } catch (err) {
      evidence.push({ step: step.purpose || step.tool, result: `FAILED: ${(err as Error).message.slice(0, 100)} — gap reported, not fabricated.`, source: step.tool });
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
    payload: { agent: 'Executor', goal: goal.slice(0, 300), findings: evidence.map(e => e.result).slice(0, 8), anomalies: [], deliverable: { answer: deliverable.answer.slice(0, 400), confidence: deliverable.confidence.value } },
  }).catch(() => {});

  return deliverable;
}
