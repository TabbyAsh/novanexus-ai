# Dedicated Worker-Host Blueprint

**Why this exists:** Railway's single container cannot safely run nested
Docker-per-workspace command execution. The Smith's `child_process` sandbox
(cleared env, temp cwd, wall-clock timeout) is real and live for *single-file*
code+test loops — but the full builder-agent (clone a repo, `npm install`, run
the test suite, iterate across many files) needs an isolated host. This is the
implementation-ready design. **Nothing here is deployed yet — it is the spec.**

The command **policy** engine (`services/cmdx`) is already built and tested (61
tests): fail-closed, kill-switch → denylist → allowlist → grants → rate-limit →
mode-gate, T3 always human-approved. The worker host is the *executor* that asks
CmdX for every command and obeys the verdict.

---

## 1. Deployment target options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Fly.io Machines (Firecracker microVMs) | true VM isolation, per-job spin-up, cheap idle | cold starts | **MVP recommended** |
| Rented GPU box (Lambda/RunPod/vast.ai) | doubles as vLLM inference host | always-on cost | **hardened / when local model lands** |
| Dedicated bare metal / homelab | founder-owned, max sovereignty | ops burden | **long-term sovereign** |
| Kubernetes Job + gVisor/Kata | scalable, strong isolation | heavy to run solo | later, at scale |

## 2. Minimum viable worker host

- One small always-on VM (2 vCPU / 4 GB) running a **worker daemon**.
- Docker installed; each job runs in a **fresh container** from a pinned base
  image (`node:20-slim` + git). One container per subtask, destroyed after.
- Pulls jobs from the queue, reports results back to Nova over an authenticated
  callback. No inbound ports except the callback client.

## 3. Hardened worker host

Dedicated GPU box: vLLM inference (§ Sovereign Mind Layer) **and** the command
runner, sharing the machine. gVisor runtime (`runsc`) for kernel isolation,
per-job network namespace, read-only base FS + writable overlay, cgroup CPU/mem
caps, seccomp profile. Model registry + private dataset volume live here too.

## 4. Job queue contract

Table `forge_subtasks` (migration 030) already models the unit. The worker
consumes `status='QUEUED'` rows and honors this contract:

```
Job {
  subtaskId, taskId, persona_slug, mode: RECOMMEND|ASSIST|AUTOMATE,
  repo_remote, base_ref, branch (MUST match ^forge/),
  file_ownership: string[],      // paths this job may write
  budget: { max_tokens, max_commands, max_usd, wall_clock_s },
  validation: ValidationCheck[]  // how success is judged
}
Result {
  status: DONE|FAILED|NEEDS_APPROVAL,
  diff_ref, artifact_refs[], command_run_ids[], cost, error?
}
```

## 5. Sandbox lifecycle

`PROVISION` (spin container, shallow-clone repo at base_ref, checkout `forge/*`
branch) → `READY` → `ACTIVE` (agent loop: request command → CmdX verdict →
execute-if-ALLOWED → capture) → `HARVEST` (collect diff + artifacts) →
`DESTROY` (kill container, wipe overlay). `forge_workspaces` tracks state;
every workspace is ephemeral and idempotently destroyable.

## 6. Repo checkout strategy

Shallow clone (`--depth 1`) of the pinned `base_ref` into the container only.
Branch name enforced `^forge/` at the broker (rails already encode this;
`isForgeBranch` in agent-contracts). The worker holds a **read-only deploy
token scoped to clone + push `forge/*` only** — never write to `master`.

## 7. Command allowlist enforcement

Every command is submitted to CmdX `evaluateCommand` (already built) as an
`argv` array — never a shell string. `ALLOW` → run. `NEEDS_APPROVAL` → park the
job, open a `forge_approvals` row, notify the founder. `DENY` → refuse + audit.
The worker has **no shell**; it spawns argv directly (no `sh -c`).

## 8. Network isolation

Default **deny-all egress** inside the job container. An allowlist per persona
opens only what a task needs (e.g. npm registry for `research-agent`/installs).
No access to Nova's DB, secrets, or internal services from inside a job.

## 9. Filesystem isolation

Read-only base image + writable overlay scoped to the clone dir. File writes
outside `file_ownership` paths are rejected by the harvest step (diff is
filtered; out-of-scope changes fail the job). Overlay wiped on destroy.

## 10. Artifact storage

Diffs, logs, reports → object storage (S3/R2/MinIO), referenced by
`forge_artifacts.storage_ref` (already modeled). **Never inline** large output
in the DB. stdout/stderr streamed to a ref, tail kept in `command_runs.output_head`.

## 11. Log streaming

Worker streams structured events (command started/finished, iteration, test
result) to Nova over the callback; Forge Control's Command Logs / Build Logs
panels render them live. Every line is also persisted to the artifact ref.

## 12. Timeout limits

Per-command wall-clock (CmdX rate-limit + a hard `SIGKILL` at ceiling); per-job
wall-clock from `budget.wall_clock_s`; per-task token/command/USD budgets from
`forge_budgets` (hard stops, already modeled). Circuit breaker: N consecutive
failures opens the breaker and parks the job (CmdX already implements this).

## 13. Cost controls

`forge_budgets` + `forge_spend_ledger` (migration 030) are hard ceilings, not
suggestions. Token/command/USD debited per action; exceeding any → job pauses
for approval. External LLM spend flows through the same ledger.

## 14. Secrets policy

The job container inherits **no** Nova secrets. Env is cleared (as the Smith
already does). Deploy token is short-lived, `forge/*`-scoped, injected only for
the clone/push steps, never exposed to agent-run commands. No provider keys in
the workspace.

## 15. Rollback behavior

Nothing merges to `master` from a worker — ever. A rejected or failed job's
branch is deleted and its overlay wiped; the repo's protected branches are
untouched by construction. Rollback = "delete the forge/* branch," which costs
nothing because it was never merged.

## 16. Connection back to Nova

Authenticated worker→Nova callback (`/v1/forge/worker/*`, HMAC-signed job
token). Nova is the source of truth for job state; the worker is stateless
between jobs and can be killed/replaced at any time.

## 17. What must remain impossible without human approval

- Any push to `master`/`main` (only `forge/*`, and merge is a **human** action).
- Any T3 command (external/destructive) — CmdX forces NEEDS_APPROVAL.
- Provisioning anything that costs money (domains, hosting, paid APIs).
- Reading user data, secrets, billing, or production DB from inside a job.
- Modifying CmdX rules, the eval harness, budgets, or the worker itself
  (rails 2 — the system may not edit its own gates).
- Disabling the kill switch (drains queues, freezes all workers).

---

**Build order when a host exists:** worker daemon + queue consumer → single-job
container lifecycle → CmdX integration on every command → artifact/log streaming
→ approval parking → multi-subtask DAG execution. The policy, contracts, budgets,
and audit tables are already built and tested; this host is the last mile.
