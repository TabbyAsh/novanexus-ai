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
}

const QUOTA_COOLDOWN_MS = 30 * 60 * 1000; // a quota-dark provider rests 30 min before retry

const health: Record<ProviderName, ProviderHealth> = Object.fromEntries(
  (Object.keys(PROVIDER_CAPS) as ProviderName[]).map((n) => [
    n, { name: n, configured: false, available: false, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null, quotaExhaustedUntil: null },
  ])
) as Record<ProviderName, ProviderHealth>;

export function setConfigured(name: ProviderName, configured: boolean): void {
  health[name].configured = configured;
}

export function markSuccess(name: ProviderName): void {
  const h = health[name];
  h.configured = true;
  h.lastSuccessAt = new Date().toISOString();
  h.quotaExhaustedUntil = null;
  h.available = true;
}

export function markQuota(name: ProviderName): void {
  const h = health[name];
  h.configured = true;
  h.lastFailureAt = new Date().toISOString();
  h.lastFailureReason = 'quota_exhausted';
  h.quotaExhaustedUntil = new Date(Date.now() + QUOTA_COOLDOWN_MS).toISOString();
  h.available = false;
}

export function markFailure(name: ProviderName, reason: string): void {
  const h = health[name];
  h.configured = true;
  h.lastFailureAt = new Date().toISOString();
  h.lastFailureReason = reason.slice(0, 200);
  h.available = false;
}

export function isEligible(name: ProviderName): boolean {
  const h = health[name];
  if (!h.configured) return false;
  if (h.quotaExhaustedUntil && new Date(h.quotaExhaustedUntil).getTime() > Date.now()) return false;
  return true;
}

// test seam
export function _resetHealth(): void {
  for (const n of Object.keys(health) as ProviderName[]) {
    health[n] = { name: n, configured: false, available: false, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null, quotaExhaustedUntil: null };
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
  attempts: Array<{ name: ProviderName; outcome: ProviderOutcome['status'] }>;
}

/**
 * Run providers in order until one reasons. Quota → mark + cooldown + next.
 * Error → mark + next. Absent → skip. None succeed → providerUnavailable
 * with NO content. The caller must halt honestly; it must never fabricate.
 */
export async function runProviderChain(callers: ProviderCall[]): Promise<ChainResult> {
  const attempts: ChainResult['attempts'] = [];
  for (const c of callers) {
    if (!health[c.name].configured && !(await peekConfigured(c))) {
      attempts.push({ name: c.name, outcome: 'absent' });
      continue;
    }
    if (!isEligible(c.name)) {
      attempts.push({ name: c.name, outcome: 'quota' }); // in cooldown
      continue;
    }
    let outcome: ProviderOutcome;
    try { outcome = await c.call(); }
    catch (e) { outcome = { status: 'error', reason: (e as Error).message }; }

    attempts.push({ name: c.name, outcome: outcome.status });
    if (outcome.status === 'ok') { markSuccess(c.name); return { content: outcome.content, provider: c.name, providerUnavailable: false, attempts }; }
    if (outcome.status === 'quota') { markQuota(c.name); continue; }
    if (outcome.status === 'error') { markFailure(c.name, outcome.reason); continue; }
    // absent
  }
  return { content: null, provider: null, providerUnavailable: true, attempts };
}

// A caller can self-report absence by returning 'absent' on its first call;
// we treat configured=false personas as absent without calling.
async function peekConfigured(_c: ProviderCall): Promise<boolean> {
  return true; // callers report 'absent' themselves; this keeps runChain simple
}

// ── Tiered routing: pick the ordered candidate list for a task ─────────
export function orderFor(tier: TaskTier, opts: { prefer?: ProviderName; envOrder?: ProviderName[] } = {}): ProviderName[] {
  if (tier === 'deterministic') return []; // no LLM — the caller uses rules

  const all = Object.keys(PROVIDER_CAPS) as ProviderName[];
  // base: providers whose bestFor includes the tier, local first, then by capability
  const capKey: keyof ProviderCaps = tier === 'reasoning' ? 'reasoning' : tier === 'coding' ? 'coding' : 'reasoning';
  let candidates = all.filter((n) => PROVIDER_CAPS[n].bestFor.includes(tier));
  if (candidates.length === 0) candidates = [...all];

  candidates.sort((a, b) => {
    // local-first for privacy/sovereignty, then by capability score
    if (PROVIDER_CAPS[a].local !== PROVIDER_CAPS[b].local) return PROVIDER_CAPS[a].local ? -1 : 1;
    return (PROVIDER_CAPS[b][capKey] as number) - (PROVIDER_CAPS[a][capKey] as number);
  });

  // env fallback order wins if provided (explicit operator control)
  if (opts.envOrder && opts.envOrder.length) {
    const set = new Set(opts.envOrder);
    candidates = [...opts.envOrder.filter((n) => all.includes(n)), ...candidates.filter((n) => !set.has(n))];
  }
  // per-agent preference floats to the front
  if (opts.prefer) candidates = [opts.prefer, ...candidates.filter((n) => n !== opts.prefer)];
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
    .filter((n) => !PROVIDER_CAPS[n].local && health[n].configured).length;

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
  const providers = (Object.keys(health) as ProviderName[]).map((n) => ({ ...health[n] }));
  const capableOfLLM = providers.some((p) => p.configured && isEligible(p.name));
  return { providers, capableOfLLM, sovereignty: sovereignty(), fallbackOrder: orderFor('coding') };
}
