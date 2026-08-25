-- Task-claim rollback runbook.
--
-- 1. Stop the entire old monolith with at least 15 seconds of Railway outer
--    termination grace, then wait until the two-minute heartbeat guard below
--    is clear.
-- 2. Run this file with psql -X -v ON_ERROR_STOP=1.
-- 3. Deploy the previous orchestrator/SDK build.
--
-- The guard aborts if a bot has heartbeated recently. Do not bypass it: an old
-- worker still performing side effects could otherwise race the requeued task.

BEGIN;

-- Serialize with heartbeats already in flight so the guard cannot inspect a
-- stale snapshot while a worker is concurrently proving it is alive.
LOCK TABLE bots IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE tasks IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM bots
    WHERE last_heartbeat > NOW() - INTERVAL '2 minutes'
  ) THEN
    RAISE EXCEPTION 'Task-claim rollback refused: recent bot heartbeat still exists';
  END IF;
END
$$;

UPDATE tasks
SET status = 'QUEUED',
    claimed_by_bot_id = NULL,
    claim_token = NULL,
    claim_acknowledged_at = NULL,
    lease_expires_at = NULL,
    claim_available_at = NOW(),
    started_at = NULL,
    completed_at = NULL,
    updated_at = NOW()
WHERE status = 'RUNNING'
  AND claim_generation > 0;

-- The previous orchestrator creates RUNNING work without claim metadata.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_running_claim_required;

COMMIT;
