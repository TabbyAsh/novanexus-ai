/**
 * THE RECURSIVE IMPROVEMENT LOOP — Phase 5, made falsifiable.
 *
 * "Recursive self-improvement" here is NOT AGI. It is a bounded engineering
 * loop with a hard, objective gate:
 *   1. A benchmark suite of tasks with machine-checkable oracles.
 *   2. The incumbent (active) prompt is scored on it.
 *   3. Nova proposes an improved prompt, informed by REAL past failures on
 *      the substrate.
 *   4. The candidate is scored on the SAME suite.
 *   5. PROMOTION RULE: the candidate replaces the incumbent ONLY if it beats
 *      it by a margin on the benchmark. Otherwise it is archived with its
 *      score. No vibes, no self-congratulation — the test oracle decides.
 *
 * The agent improves its own instructions over time, but every step is
 * measured against reality and every version is on the immutable record.
 * Prompts are DATA (prompt_versions, migration 030); the gate is code.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { generateChat } from './ai-router';
import { runSmithTask, SMITH_SYSTEM } from './smith';
import { writeArtifact, readArtifacts } from './substrate';

const logger = createLogger('agent-evals');

const PROMOTION_MARGIN = 0.15; // candidate must beat incumbent by ≥15% to promote

// ── Benchmark suites: objective tasks with checkable oracles ───────────
// The Smith's benchmark = small coding problems whose own generated test is
// the oracle (solved === all asserts passed in the sandbox).
const BENCHMARKS: Record<string, Array<{ id: string; problem: string }>> = {
  'coder-agent': [
    { id: 'fizzbuzz', problem: 'Export function fizzbuzz(n) returning an array 1..n where multiples of 3 are "Fizz", of 5 "Buzz", of both "FizzBuzz", else the number.' },
    { id: 'dedupe', problem: 'Export function uniqueSorted(arr) returning the array of unique numbers sorted ascending.' },
    { id: 'balanced', problem: 'Export function isBalanced(s) returning true iff the brackets ()[]{} in s are correctly balanced and nested.' },
    { id: 'romans', problem: 'Export function toRoman(n) converting an integer 1..3999 to a Roman numeral string.' },
  ],
};

export interface EvalResult {
  agent: string; suite: string; promptLabel: string;
  passed: number; total: number; score: number;
  details: Array<{ id: string; solved: boolean; iterations: number }>;
}

export async function runBenchmark(agent: string, systemOverride?: string, label = 'incumbent'): Promise<EvalResult> {
  const suite = BENCHMARKS[agent] || [];
  const details: EvalResult['details'] = [];
  let passed = 0;
  for (const task of suite) {
    const r = await runSmithTask(task.problem, systemOverride);
    const solved = 'solved' in r ? r.solved : false;
    const iterations = 'iterations' in r ? r.iterations : 0;
    if (solved) passed++;
    details.push({ id: task.id, solved, iterations });
  }
  const total = suite.length || 1;
  const result: EvalResult = { agent, suite: 'default', promptLabel: label, passed, total, score: passed / total, details };

  await query(
    `INSERT INTO eval_runs (agent, prompt_version, suite, passed, total, score, details) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [agent, 0, `default:${label}`, passed, total, result.score, JSON.stringify(details)]
  ).catch(() => {});
  logger.info('Benchmark run', { agent, label, score: result.score });
  return result;
}

// ── The gated self-improvement pass ────────────────────────────────────
export async function proposeAndGate(agent = 'coder-agent'): Promise<{ promoted: boolean; incumbent: number; candidate: number; reason: string }> {
  if (!BENCHMARKS[agent]) return { promoted: false, incumbent: 0, candidate: 0, reason: `No benchmark suite for ${agent}.` };

  // Current active prompt (or the code default if none promoted yet)
  const active = await queryOne<{ prompt_text: string; semver: string }>(
    `SELECT pv.prompt_text, pv.semver FROM prompt_versions pv
     JOIN agent_personas p ON p.id = pv.persona_id
     WHERE p.slug = $1 AND pv.status = 'active' LIMIT 1`,
    [agent]
  ).catch(() => null);
  const incumbentPrompt = active?.prompt_text || SMITH_SYSTEM;

  // Score the incumbent
  const incEval = await runBenchmark(agent, active ? incumbentPrompt : undefined, 'incumbent');

  // Nova drafts an improvement, grounded in REAL past failures
  const failures = (await readArtifacts({ kind: 'hypothesis', limit: 20 }))
    .filter((a: any) => a.author_id === 'the-smith' && a.payload?.solved === false)
    .slice(0, 4)
    .map((a: any) => (a.payload?.trajectory || []).map((t: any) => t.error).filter(Boolean).join(' | '))
    .filter(Boolean);

  // PHASE 3: the human's accept/reject reasons are training labels — fold
  // them into the improvement so the agent learns what the operator values.
  let humanSignal = '';
  try {
    const { decisionsForTraining } = await import('./proposals');
    const decisions = await decisionsForTraining(10);
    if (decisions.length) {
      humanSignal = '\n\nHUMAN DECISIONS ON PAST PROPOSALS (learn what the operator accepts/rejects and why):\n'
        + decisions.map(d => `- ${d.decision.toUpperCase()}: ${d.reason}`).join('\n');
    }
  } catch { /* improvement still runs on failures alone */ }

  const draft = await generateChat({
    system: `You improve the SYSTEM PROMPT of a code-writing agent. Return ONLY the improved prompt text — no commentary. Keep its output contract intact. Make it more likely to produce correct, well-tested Node.js on the FIRST try, and more aligned with what the human operator accepts.`,
    user: `CURRENT PROMPT:\n${incumbentPrompt}\n\nRECENT REAL FAILURES:\n${failures.join('\n') || '(none recorded yet)'}${humanSignal}\n\nReturn the improved prompt.`,
    maxTokens: 900, temperature: 0.6,
  });
  if (!draft) return { promoted: false, incumbent: incEval.score, candidate: 0, reason: 'No mind available to draft an improvement.' };

  const candidatePrompt = draft.content.trim();
  const candEval = await runBenchmark(agent, candidatePrompt, 'candidate');

  const beats = candEval.score >= incEval.score + PROMOTION_MARGIN;

  // Record the candidate as a version regardless — the record is permanent
  const persona = await queryOne<{ id: string }>(`SELECT id FROM agent_personas WHERE slug = $1`, [agent]).catch(() => null);
  if (persona) {
    const nextV = await queryOne<{ n: string }>(
      `SELECT COALESCE(MAX(CAST(split_part(semver,'.',2) AS INT)),0)+1 n FROM prompt_versions WHERE persona_id = $1`, [persona.id]
    ).catch(() => ({ n: '1' }));
    const semver = `0.${nextV?.n || '1'}.0`;
    if (beats) {
      // demote incumbent, promote candidate — atomic-ish
      await query(`UPDATE prompt_versions SET status = 'retired' WHERE persona_id = $1 AND status = 'active'`, [persona.id]).catch(() => {});
    }
    await query(
      `INSERT INTO prompt_versions (persona_id, semver, prompt_text, changelog, author_type, status)
       VALUES ($1,$2,$3,$4,'agent',$5) ON CONFLICT (persona_id, semver) DO NOTHING`,
      [persona.id, semver, candidatePrompt, `self-improvement pass; benchmark ${candEval.score.toFixed(2)} vs incumbent ${incEval.score.toFixed(2)}`, beats ? 'active' : 'retired']
    ).catch(() => {});
  }

  await writeArtifact({
    kind: 'hypothesis', regime: 'EXPLOITATION', authorType: 'agent', authorId: 'agent-evals',
    payload: {
      claim: `Self-improvement pass for ${agent}: ${beats ? 'PROMOTED' : 'rejected'}`,
      explains: 'recursive-improvement-loop',
      incumbent_score: incEval.score, candidate_score: candEval.score,
      promotion_margin: PROMOTION_MARGIN, promoted: beats,
      incumbent_detail: incEval.details, candidate_detail: candEval.details,
    },
  }).catch(() => {});

  logger.info('Self-improvement pass', { agent, incumbent: incEval.score, candidate: candEval.score, promoted: beats });
  return {
    promoted: beats,
    incumbent: incEval.score,
    candidate: candEval.score,
    reason: beats
      ? `Promoted: candidate ${candEval.score.toFixed(2)} beat incumbent ${incEval.score.toFixed(2)} by ≥${PROMOTION_MARGIN}.`
      : `Rejected: candidate ${candEval.score.toFixed(2)} did not beat incumbent ${incEval.score.toFixed(2)} by the required margin. The oracle decides, not the agent.`,
  };
}
