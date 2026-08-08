/**
 * THE SOVEREIGN MIND LAYER — provider registry, health, tiered routing.
 *
 * Core law: Nova may RENT intelligence, but must not be OWNED by it. Every
 * hosted provider (Gemini, Groq, xAI, Claude, OpenAI) is an OPTIONAL
 * accelerator behind this registry. A local/self-hosted model is a
 * first-class backend. When all minds are dark, Nova halts honestly — it
 * never fabricates.
 *
 * This module is pure and injectable: callers are passed in, health is
 * module state that tests can reset. The routing decision is a function of
 * (task tier, per-agent preference, env fallback order, live health).
 */

export type ProviderName = 'local' | 'gemini' | 'groq' | 'grok' | 'claude' | 'openai';

export type TaskTier =
  | 'deterministic'  // no LLM at all — templates, rules, static analysis
  | 'small'          // summarize/classify — small local model suffices
  | 'coding'         // write/debug code — strong local or external
  | 'reasoning';     // high-stakes architecture — strongest available

// ── Capability registry (Model capability registry, spec §) ────────────
export interface ProviderCaps {
  reasoning: number;      // 0..1 subjective reasoning quality
  coding: number;         // 0..1 coding ability
  contextTokens: number;
  speed: 'fast' | 'medium' | 'slow';
  costPer1kUsd: number;   // 0 for free/local
  privacy: 'local' | 'external';
  local: boolean;
  quotaLimited: boolean;
  bestFor: TaskTier[];
}

export const PROVIDER_CAPS: Record<ProviderName, ProviderCaps> = {
  local:  { reasoning: 0.55, coding: 0.55, contextTokens: 8000,   speed: 'medium', costPer1kUsd: 0,      privacy: 'local',    local: true,  quotaLimited: false, bestFor: ['small', 'coding'] },
  gemini: { reasoning: 0.80, coding: 0.75, contextTokens: 1000000, speed: 'fast',   costPer1kUsd: 0,      privacy: 'external', local: false, quotaLimited: true,  bestFor: ['small', 'coding', 'reasoning'] },
  groq:   { reasoning: 0.72, coding: 0.70, contextTokens: 128000,  speed: 'fast',   costPer1kUsd: 0,      privacy: 'external', local: false, quotaLimited: true,  bestFor: ['small', 'coding'] },
  grok:   { reasoning: 0.85, coding: 0.82, contextTokens: 131072,  speed: 'medium', costPer1kUsd: 0.002,  privacy: 'external', local: false, quotaLimited: true,  bestFor: ['coding', 'reasoning'] },
  claude: { reasoning: 0.92, coding: 0.90, contextTokens: 200000,  speed: 'medium', costPer1kUsd: 0.003,  privacy: 'external', local: false, quotaLimited: true,  bestFor: ['coding', 'reasoning'] },
  openai: { reasoning: 0.88, coding: 0.86, contextTokens: 128000,  speed: 'medium', costPer1kUsd: 0.003,  privacy: 'external', local: false, quotaLimited: true,  bestFor: ['coding', 'reasoning'] },
};

// ── Live health state ──────────────────────────────────────────────────
export interface ProviderHealth {
  name: ProviderName;
  configured: boolean;
  available: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  quotaExhaustedUntil: string | null;
  lastLatencyMs: number | null;
  emaLatencyMs: number | null;
  successCount: number;
  failureCount: number;
}

const QUOTA_COOLDOWN_MS = 30 * 60 * 1000; // a quota-dark provider rests 30 min before retry
const DEFAULT_CHAIN_TIMEOUT_MS = 30_000;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 10_000;

function blankHealth(name: ProviderName): ProviderHealth {
  return {
    name,
    configured: false,
    available: false,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    quotaExhaustedUntil: null,
    lastLatencyMs: null,
    emaLatencyMs: null,
    successCount: 0,
    failureCount: 0,
  };
}

const health: Record<ProviderName, ProviderHealth> = Object.fromEntries(
  (Object.keys(PROVIDER_CAPS) as ProviderName[]).map(name => [name, blankHealth(name)]),
) as Record<ProviderName, ProviderHealth>;

export function setConfigured(name: ProviderName, configured: boolean): void {
  health[name].configured = configured;
}

export function markSuccess(name: ProviderName, latencyMs?: number): void {
  const provider = health[name];
  provider.configured = true;
  provider.lastSuccessAt = new Date().toISOString();
  provider.quotaExhaustedUntil = null;
  provider.available = true;
  provider.successCount += 1;
  if (typeof latencyMs === 'number' && Number.isFinite(latencyMs) && latencyMs >= 0) {
    provider.lastLatencyMs = Math.round(latencyMs);
    provider.emaLatencyMs = provider.emaLatencyMs == null
      ? provider.lastLatencyMs
      : Math.round(provider.emaLatencyMs * 0.8 + provider.lastLatencyMs * 0.2);
  }
}

export function markQuota(name: ProviderName): void {
  const provider = health[name];
  provider.configured = true;
  provider.lastFailureAt = new Date().toISOString();
  provider.lastFailureReason = 'quota_exhausted';
  provider.quotaExhaustedUntil = new Date(Date.now() + QUOTA_COOLDOWN_MS).toISOString();
  provider.available = false;
  provider.failureCount += 1;
}

export function markFailure(name: ProviderName, reason: string): void {
  const provider = health[name];
  provider.configured = true;
  provider.lastFailureAt = new Date().toISOString();
  provider.lastFailureReason = reason.slice(0, 200);
  provider.available = false;
  provider.failureCount += 1;
}

export function isEligible(name: ProviderName): boolean {
  const provider = health[name];
  if (!provider.configured) return false;
  if (provider.quotaExhaustedUntil && new Date(provider.quotaExhaustedUntil).getTime() > Date.now()) return false;
  return true;
}

// test seam
export function _resetHealth(): void {
  for (const name of Object.keys(health) as ProviderName[]) {
    health[name] = blankHealth(name);
  }
}

// ── The caller contract ────────────────────────────────────────────────
export type ProviderOutcome =
  | { status: 'ok'; content: string }
  | { status: 'quota' }
  | { status: 'error'; reason: string }
  | { status: 'absent' }; // not configured

export interface ProviderCall {
  name: ProviderName;
  call: () => Promise<ProviderOutcome>;
}

export interface ChainResult {
  content: string | null;
  provider: ProviderName | null;
  providerUnavailable: boolean;
  attempts: Array<{ name: ProviderName; outcome: ProviderOutcome['status']; latencyMs?: number }>;
  elapsedMs: number;
  deadlineExceeded: boolean;
}

export interface ProviderChainOptions {
  totalTimeoutMs?: number;
  maxAttemptMs?: number;
}

async function callWithBudget(call: () => Promise<ProviderOutcome>, timeoutMs: number): Promise<ProviderOutcome> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      call(),
      new Promise<ProviderOutcome>(resolve => {
        timer = setTimeout(
          () => resolve({ status: 'error', reason: 'provider_attempt_timeout' }),
          Math.max(1, timeoutMs),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run providers in order until one reasons. The chain has a hard wall-clock
 * deadline and each provider has a smaller attempt budget, so a slow local
 * model or dead endpoint cannot consume every fallback window serially.
 *
 * Quota → mark + cooldown + next. Error/timeout → mark + next. Absent → skip.
 * None succeed → providerUnavailable with NO content. The caller must halt
 * honestly; it must never fabricate.
 */
export async function runProviderChain(
  callers: ProviderCall[],
  options: ProviderChainOptions = {},
): Promise<ChainResult> {
  const attempts: ChainResult['attempts'] = [];
  const startedAt = Date.now();
  const totalTimeoutMs = Math.max(1, options.totalTimeoutMs ?? DEFAULT_CHAIN_TIMEOUT_MS);
  const maxAttemptMs = Math.max(1, options.maxAttemptMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS);
  let deadlineExceeded = false;

  for (const caller of callers) {
    const elapsedBefore = Date.now() - startedAt;
    const remainingMs = totalTimeoutMs - elapsedBefore;
    if (remainingMs <= 0) {
      deadlineExceeded = true;
      break;
    }

    if (!health[caller.name].configured && !(await peekConfigured(caller))) {
      attempts.push({ name: caller.name, outcome: 'absent', latencyMs: 0 });
      continue;
    }
    if (!isEligible(caller.name)) {
      attempts.push({ name: caller.name, outcome: 'quota', latencyMs: 0 });
      continue;
    }

    const attemptStartedAt = Date.now();
    let outcome: ProviderOutcome;
    try {
      outcome = await callWithBudget(caller.call, Math.min(maxAttemptMs, remainingMs));
    } catch (error) {
      outcome = { status: 'error', reason: (error as Error).message };
    }
    const latencyMs = Date.now() - attemptStartedAt;
    attempts.push({ name: caller.name, outcome: outcome.status, latencyMs });

    if (outcome.status === 'ok') {
      markSuccess(caller.name, latencyMs);
      return {
        content: outcome.content,
        provider: caller.name,
        providerUnavailable: false,
        attempts,
        elapsedMs: Date.now() - startedAt,
        deadlineExceeded: false,
      };
    }
    if (outcome.status === 'quota') {
      markQuota(caller.name);
      continue;
    }
    if (outcome.status === 'error') {
      markFailure(caller.name, outcome.reason);
      if (outcome.reason === 'provider_attempt_timeout' && Date.now() - startedAt >= totalTimeoutMs) {
        deadlineExceeded = true;
        break;
      }
    }
  }

  if (Date.now() - startedAt >= totalTimeoutMs) deadlineExceeded = true;
  return {
    content: null,
    provider: null,
    providerUnavailable: true,
    attempts,
    elapsedMs: Date.now() - startedAt,
    deadlineExceeded,
  };
}

// A caller can self-report absence by returning 'absent' on its first call;
// we treat configured=false personas as absent without calling.
async function peekConfigured(_call: ProviderCall): Promise<boolean> {
  return true; // callers report 'absent' themselves; this keeps runChain simple
}

// ── Tiered routing: pick the ordered candidate list for a task ─────────
export function orderFor(tier: TaskTier, opts: { prefer?: ProviderName; envOrder?: ProviderName[] } = {}): ProviderName[] {
  if (tier === 'deterministic') return []; // no LLM — the caller uses rules

  const all = Object.keys(PROVIDER_CAPS) as ProviderName[];
  // base: providers whose bestFor includes the tier, local first, then by capability
  const capKey: keyof ProviderCaps = tier === 'reasoning' ? 'reasoning' : tier === 'coding' ? 'coding' : 'reasoning';
  let candidates = all.filter(name => PROVIDER_CAPS[name].bestFor.includes(tier));
  if (candidates.length === 0) candidates = [...all];

  candidates.sort((a, b) => {
    // local-first for privacy/sovereignty, then by capability score
    if (PROVIDER_CAPS[a].local !== PROVIDER_CAPS[b].local) return PROVIDER_CAPS[a].local ? -1 : 1;
    return (PROVIDER_CAPS[b][capKey] as number) - (PROVIDER_CAPS[a][capKey] as number);
  });

  // env fallback order wins if provided (explicit operator control)
  if (opts.envOrder && opts.envOrder.length) {
    const set = new Set(opts.envOrder);
    candidates = [...opts.envOrder.filter(name => all.includes(name)), ...candidates.filter(name => !set.has(name))];
  }
  // per-agent preference floats to the front
  if (opts.prefer) candidates = [opts.prefer, ...candidates.filter(name => name !== opts.prefer)];
  return candidates;
}

// ── Sovereignty score: how independent is Nova of rented minds? ────────
export interface Sovereignty {
  score: number; // 0..100
  band: string;
  localAvailable: boolean;
  externalConfigured: number;
  rationale: string;
}

export function sovereignty(): Sovereignty {
  const localUp = health.local.configured;
  const externalConfigured = (Object.keys(PROVIDER_CAPS) as ProviderName[])
    .filter(name => !PROVIDER_CAPS[name].local && health[name].configured).length;

  // Deterministic workflows ALWAYS survive (templates, rules, policy) → 25% floor.
  let score = 25;
  let rationale = 'Deterministic cards, rule appraisals, command policy, and migration lint run with no LLM at all.';
  if (localUp) { score = 75; rationale = 'A local model handles cards, summaries, repo analysis, and most coding-agent tasks; external providers are fallback only.'; }
  if (localUp && externalConfigured === 0) { score = 100; rationale = 'Core agent workflows run entirely on local intelligence — no third-party dependency.'; }
  if (!localUp && externalConfigured > 0) { score = 40; rationale = 'Deterministic workflows survive offline, but LLM tasks depend entirely on external providers. Add a local model to cross 75%.'; }
  if (!localUp && externalConfigured === 0) { score = 25; }

  const band = score >= 100 ? 'sovereign' : score >= 75 ? 'mostly-sovereign' : score >= 50 ? 'hybrid' : score >= 40 ? 'external-dependent' : 'deterministic-only';
  return { score, band, localAvailable: localUp, externalConfigured, rationale };
}

export function healthSnapshot(): {
  providers: ProviderHealth[];
  capableOfLLM: boolean;
  sovereignty: Sovereignty;
  fallbackOrder: ProviderName[];
} {
  const providers = (Object.keys(health) as ProviderName[]).map(name => ({ ...health[name] }));
  const capableOfLLM = providers.some(provider => provider.configured && isEligible(provider.name));
  return { providers, capableOfLLM, sovereignty: sovereignty(), fallbackOrder: orderFor('coding') };
}
