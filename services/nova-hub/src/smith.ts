/**
 * THE SMITH — a code-writing agent. Spec v0.2 §3 made concrete.
 *
 * The Smith composes a self-contained solution to a stated problem, RUNS it,
 * reads its own failures, and iterates until the tests pass or the budget is
 * spent. This is the real "agents write code, run console commands, and build
 * on top of their own work" capability — bounded so it is safe to run
 * unattended.
 *
 * THE WALLS (non-negotiable, per rails 1–5 and v0.1 §6):
 *  - Execution happens in an ISOLATED temp workspace, never the repo.
 *  - The child process runs with a CLEARED environment — no secrets, no
 *    DATABASE_URL, no keys reach generated code.
 *  - Hard wall-clock timeout + output cap; the process is killed on overrun.
 *  - Node only, one file + one test, no package installs, no network reliance.
 *  - The Smith may NOT write to the repo, the Boundary, the gates, or its own
 *    limits. Its output is a PROPOSAL artifact. Promotion to the live codebase
 *    is a human commit — always. Unbounded self-modification stays prohibited;
 *    that prohibition is what makes the bounded loop safe.
 *
 * What this IS: recursive *self-improvement within a task* — the agent
 * measurably improves its own artifact across iterations against a real test
 * oracle, and the whole trajectory is on the immutable substrate.
 * What this is NOT: the system editing its own kernel. By design.
 */

import { spawn } from 'child_process';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createLogger } from '@nova/telemetry';
import { generateChat } from './ai-router';
import { writeArtifact } from './substrate';

const logger = createLogger('smith');

const MAX_ITERATIONS = 4;      // budget: attempts before honest surrender
const EXEC_TIMEOUT_MS = 10_000; // wall-clock per run
const MAX_OUTPUT = 8_000;       // captured stdout/stderr cap

export interface SmithResult {
  solved: boolean;
  iterations: number;
  finalCode: string;
  finalTestOutput: string;
  trajectory: Array<{ iteration: number; passed: boolean; error: string }>;
  artifactId: string | null;
}

// ── The sandbox: run generated code with no environment, no repo access ─
function runInSandbox(dir: string): Promise<{ passed: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['solution.test.js'], {
      cwd: dir,
      env: { PATH: process.env.PATH || '', NODE_OPTIONS: '' }, // CLEARED — no secrets cross the wall
      timeout: EXEC_TIMEOUT_MS,
      windowsHide: true,
    });
    let out = '';
    const cap = (d: Buffer) => { if (out.length < MAX_OUTPUT) out += d.toString(); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    child.on('error', (e) => resolve({ passed: false, output: `spawn error: ${e.message}` }));
    child.on('close', (code) => resolve({ passed: code === 0, output: out.slice(0, MAX_OUTPUT) || '(no output)' }));
  });
}

export const SMITH_SYSTEM = `You are the Smith — Nova's code-writing agent. You solve the problem by writing ONE self-contained Node.js solution and a test that proves it, then you fix your own failures.

Output EXACTLY two fenced code blocks, in this order, with these exact labels and nothing else between them:

===SOLUTION===
\`\`\`js
// solution.js — pure Node, standard library only, exports via module.exports
\`\`\`
===TEST===
\`\`\`js
// solution.test.js — require('./solution'), assert concrete expected values,
// console.log progress, call process.exit(1) on ANY failure, exit 0 only if ALL pass
\`\`\`

Rules:
- No network, no file writes, no external packages — standard library only.
- The test must be a real oracle: assert concrete expected values, exit nonzero on mismatch.
- When given a previous failure, diagnose it precisely and fix the actual cause. Do not just retry.
- Do not add prose outside the two labeled blocks.`;

// Extract the two code blocks robustly — LLMs emit multiline code that is not
// valid JSON, so we parse fenced blocks (with a JSON fallback for older prompts).
export function parseSmithOutput(raw: string): { solution: string; test: string } | null {
  // Preferred: ===SOLUTION=== ```...``` ===TEST=== ```...```
  const solM = raw.match(/===SOLUTION===\s*```(?:js|javascript)?\s*([\s\S]*?)```/i);
  const tstM = raw.match(/===TEST===\s*```(?:js|javascript)?\s*([\s\S]*?)```/i);
  if (solM && tstM) return { solution: solM[1].trim(), test: tstM[1].trim() };
  // Fallback: two bare fenced blocks in order
  const blocks = [...raw.matchAll(/```(?:js|javascript)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim());
  if (blocks.length >= 2) return { solution: blocks[0], test: blocks[1] };
  // Last resort: strict JSON (legacy)
  try {
    const j = JSON.parse(raw.replace(/```json?|```/g, '').trim());
    if (j.solution && j.test) return { solution: j.solution, test: j.test };
  } catch { /* give up honestly */ }
  return null;
}

// systemOverride lets the eval harness score alternate prompt versions of the
// Smith against the same benchmark — the mechanism behind gated self-improvement.
export async function runSmithTask(problem: string, systemOverride?: string): Promise<SmithResult | { error: string }> {
  const system = systemOverride || SMITH_SYSTEM;
  const trajectory: SmithResult['trajectory'] = [];
  let dir = '';
  let lastCode = '';
  let lastTest = '';
  let lastOutput = '';
  let solved = false;

  try {
    dir = await mkdtemp(join(tmpdir(), 'nova-smith-'));

    for (let i = 1; i <= MAX_ITERATIONS; i++) {
      const userMsg = i === 1
        ? `Problem: ${problem}`
        : `Problem: ${problem}\n\nYour previous solution FAILED its test. Fix the real cause.\n--- solution.js ---\n${lastCode}\n--- test output ---\n${lastOutput}`;

      const res = await generateChat({ system, user: userMsg.slice(0, 6000), maxTokens: 1500, temperature: 0.3 });
      if (!res) return { error: 'No mind available — the Smith will not fabricate code it cannot reason about.' };

      const parsed = parseSmithOutput(res.content);
      if (!parsed) { trajectory.push({ iteration: i, passed: false, error: 'unparseable code proposal' }); continue; }

      lastCode = parsed.solution || '';
      lastTest = parsed.test || '';
      await writeFile(join(dir, 'solution.js'), lastCode);
      await writeFile(join(dir, 'solution.test.js'), lastTest);

      const { passed, output } = await runInSandbox(dir);
      lastOutput = output;
      trajectory.push({ iteration: i, passed, error: passed ? '' : output.slice(0, 400) });
      logger.info('Smith iteration', { iteration: i, passed });

      if (passed) { solved = true; break; }
    }
  } catch (err) {
    return { error: `Smith failed: ${(err as Error).message}` };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {}); // the workspace is ephemeral
  }

  // The whole trajectory is a permanent, reviewable proposal — NOT auto-merged.
  const artifactId = await writeArtifact({
    kind: 'hypothesis',
    regime: 'EXPLORATION',
    authorType: 'agent',
    authorId: 'the-smith',
    payload: {
      claim: `Code solution for: ${problem.slice(0, 120)}`,
      explains: 'smith-task',
      solved,
      iterations: trajectory.length,
      solution: lastCode,
      test: lastTest,
      trajectory,
      status: 'PROPOSAL — human review + commit required before any use (rail 3).',
    },
  }).catch(() => null);

  return { solved, iterations: trajectory.length, finalCode: lastCode, finalTestOutput: lastOutput, trajectory, artifactId };
}
