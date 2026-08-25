# Task claim safety contract

Bot tasks are delivered with a unique claim token and a monotonically increasing
generation. A worker must acknowledge that identity before starting and must send
the same identity with progress and completion. Heartbeats renew only the one
acknowledged task currently executing. A `409 TASK_CLAIM_STALE` means ownership
was lost: stop work immediately and do not publish a result.
The SDK also treats the authoritative lease expiry returned by acknowledgement
and heartbeat responses as a hard deadline, aborting the handler and failing
readiness before an unconfirmed lease can be reclaimed by another worker.
Once cancellation or lease loss is declared, heartbeats omit the task identity
even if a buggy handler ignores its abort signal. The abandoned lease can then
expire and be reclaimed; it is never resurrected by a recovered network.

Task handlers receive two controls from `TaskContext`:

- Call `throwIfCancelled()` before and after every network call and immediately
  before each side effect. Long-running libraries should also receive `signal`
  when they support `AbortSignal`.
- Pass `idempotencyKey` to every external write. The key is stable across all
  claim attempts for the logical task and prevents a retry or stale worker from
  duplicating the side effect. Use `claimId` separately for attempt-level audit
  correlation. Persist the idempotency key with the destination record or use
  the provider's native idempotency-key feature; an in-memory cache is not
  sufficient across replicas.

Database fencing prevents a stale worker from changing task state, but it cannot
undo an unfenced external write. External effects therefore remain at-least-once
unless the consumer follows both rules above.

This release does **not** claim durable exactly-once provider effects. Broker
writes are hard-disabled in TradeBot; task handlers are limited to analysis,
paper execution, and reversible/internal state. `TaskContext.emit` is audit
telemetry, not an authorization or durable provider-effect receipt. Do not
enable an irreversible provider integration until it has persistent destination
idempotency plus approval fencing and waits for durable acknowledgement.

## Deployment order

The claim protocol is intentionally fail-closed and is not compatible with an
older SDK worker. `034_task_claim_leases_maintenance.sql` cannot run during the
Docker/Railway rolling-startup path. A pending copy makes that startup fail
before PM2 starts, preserving the old deployment rather than mutating its task
protocol underneath it.

Follow `infra/runbooks/task-claim-maintenance.md`: configure Railway's outer
termination grace to at least 15 seconds, stop the **entire old monolith**, wait
until every bot heartbeat is older than two minutes, explicitly run the guarded
maintenance migration, and only then deploy/start the new monolith. Do not run
old and new worker protocols together. Railway's gateway health is aggregate and
remains 503 unless Orchestrator, TradeBot, StoreBot, and SocialBot are healthy.
Use `infra/runbooks/rollback-task-claim-leases.sql` before deploying the previous
orchestrator/SDK during a rollback.
