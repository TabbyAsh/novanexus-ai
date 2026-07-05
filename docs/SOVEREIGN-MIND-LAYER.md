# The Sovereign Mind Layer

**Principle:** Nova can *rent* intelligence, but must not be *owned* by rented
intelligence. Every hosted provider is an optional accelerator behind a router.
When all minds go dark, Nova halts honestly — it never fabricates.

**Status legend:** ✅ built & tested · 🟡 built, needs a provider/host to prove ·
⬜ designed, not yet built.

---

## 1. What is live now (`services/nova-hub/src/providers.ts`, `ai-router.ts`)

- ✅ **Provider registry** — `local, gemini, groq, grok, claude, openai`, each with
  a capability record (reasoning, coding, context, speed, cost, privacy,
  local/external, quota-limited, best-for tiers).
- ✅ **Health tracking** — per provider: configured, available, lastSuccessAt,
  lastFailureAt, lastFailureReason, quotaExhaustedUntil (30-min cooldown).
- ✅ **429 → quota detection + failover** — a quota-dark provider is marked and
  skipped; the chain advances to the next eligible provider.
- ✅ **No-fabrication contract** — all providers unavailable ⇒ `providerUnavailable`
  with `content: null`. Callers halt honestly. (Proven: `providers.test.ts`.)
- ✅ **Tiered routing** (`orderFor`): `deterministic` (no LLM) · `small` · `coding`
  · `reasoning`. Local-first ordering; env fallback order (`AI_FALLBACK_ORDER`)
  and per-agent `prefer` honored.
- ✅ **Sovereignty score** — 25% deterministic floor · 40% external-only · 75%
  local available · 100% local-only. Exposed at `/v1/agents/providers` and in
  Forge Control.
- ✅ **Failure memory** — provider-unavailable events recorded as immutable
  substrate anomalies tagged `class: sovereignty` (`failure-memory.ts`).
- 🟡 **Local backend** (`LOCAL_LLM_URL`) — first-class OpenAI-compatible caller
  wired into the chain; needs an actual Ollama/vLLM endpoint to light up.

## 2. Tiered intelligence routing (the policy, not vibes)

| Tier | Example work | Backend preference |
|------|-------------|--------------------|
| `deterministic` | Decision-card templates, rule appraisals, command-policy checks, migration lint | **No LLM.** Pure code. Always available. |
| `small` | Summarize, classify, tag | small local model → fast external |
| `coding` | Smith build/repair, card generation | strong local → gemini/grok/claude |
| `reasoning` | Ignition blueprints, architecture | strongest available (claude/grok/gemini) → local fallback |

Degrade, never go dark: if the preferred tier's providers fail, the chain falls
through to any eligible provider; if none, deterministic tiers still return real
output and LLM tiers halt honestly.

## 3. Local-first critical workflows (the sovereignty floor — already true)

These run with **zero hosted calls** today:
deterministic Decision-card templates · rule-based flip appraisals · the CmdX
command-policy engine · migration reserved-word lint · benchmark oracles (the
Smith's own generated tests) · repo maps (planned, static) · every product
dashboard · failure-memory retrieval.

That is why the floor is 25% and never 0.

## 4. Train/fine-tune later, orchestrate now — the realistic path

- **Phase A — ✅ orchestrate open/hosted:** router + local backend interface exist.
- **Phase B — 🟡 collect traces:** every agent run already writes immutable
  artifacts (task, plan, files, commands, errors, repairs, proposal, approval,
  benchmark, provider used). The corpus is accumulating now on the substrate.
- **Phase C — ⬜ build eval datasets:** export accepted proposals + benchmark
  results into a held-out eval set (script over the `artifacts` + `eval_runs`
  tables).
- **Phase D — ⬜ LoRA/fine-tune small models** on Nova-specific tasks (card
  generation, regime classification, flip verdicts) once corpus volume warrants.
- **Phase E — ⬜ distill** common workflows into cheap local models.
- **Phase F — ⬜ reserve external providers** for rare high-complexity reasoning
  only. Sovereignty ≥ 75%.

## 5. The data flywheel (already turning)

Each agent run → substrate artifact(s) carrying: prompt, plan, files changed,
commands run, errors, repair attempts, final proposal, human decision, benchmark
result, failure-memory entry, provider used. This is Nova's *private* improvement
corpus — the thing a competitor copying the UI can never obtain.

## 6. Infrastructure

**Minimum viable (this week, ~$0):** one open-weight model via Ollama
(`ollama run llama3.1`) on the founder's box or a small always-on machine, set
`LOCAL_LLM_URL=http://<host>:11434/v1`. It immediately becomes first-choice for
`small`/`coding`, used for low-risk tasks first, with **no production authority**.
Sovereignty jumps to 75%.

**Hardened future:** dedicated/rented GPU box running vLLM; model registry;
benchmark suite; LoRA fine-tuning pipeline; private dataset storage; cost/perf
monitoring; the same router as the seam. See `WORKER-HOST-BLUEPRINT.md` — the
inference host and the command-runner host can be the same machine.

## 7. Forge Control shows (live)

active provider · local availability · external health · quota status · fallback
order · sovereignty score · which workflows can run local · which still need
external · recommended next move to reduce dependency.
