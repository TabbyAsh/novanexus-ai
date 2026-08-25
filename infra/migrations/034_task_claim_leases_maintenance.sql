-- nova:maintenance-required
-- Atomic task claims, explicit acknowledgement, and fenced renewable leases.
--
-- This migration is intentionally incompatible with legacy workers, which can
-- select QUEUED work without recording ownership. It may run only after the old
-- monolith is stopped and its heartbeat grace has elapsed. The normal Docker
-- startup path is forbidden from opting into maintenance migrations.

BEGIN;

DO $$
BEGIN
  IF current_setting('nova.maintenance_mode', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Task-claim migration requires explicit maintenance mode';
  END IF;
END
$$;

-- Serialize with any heartbeat already in flight, then reject every recently
-- heartbeating worker regardless of its reported status.
LOCK TABLE bots IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM bots
    WHERE last_heartbeat > NOW() - INTERVAL '2 minutes'
  ) THEN
    RAISE EXCEPTION 'Task-claim migration refused: bot workers heartbeated within 2 minutes';
  END IF;
END
$$;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS claimed_by_bot_id UUID,
  ADD COLUMN IF NOT EXISTS claim_generation BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS claim_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_available_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE task_runs
  ADD COLUMN IF NOT EXISTS claim_generation BIGINT;

UPDATE tasks SET claim_generation = 0 WHERE claim_generation IS NULL;
ALTER TABLE tasks
  ALTER COLUMN claim_generation SET DEFAULT 0,
  ALTER COLUMN claim_generation SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_claimed_by_bot_id_fkey'
      AND conrelid = 'tasks'::regclass
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_claimed_by_bot_id_fkey
      FOREIGN KEY (claimed_by_bot_id) REFERENCES bots(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Legacy RUNNING rows have no trustworthy ownership. Requeue them only after
-- the maintenance guard proves the legacy monolith has been stopped, and retain
-- one additional grace window before they become claimable.
UPDATE tasks
SET status = 'QUEUED',
    claimed_by_bot_id = NULL,
    claim_token = NULL,
    claim_acknowledged_at = NULL,
    lease_expires_at = NULL,
    claim_available_at = NOW() + INTERVAL '90 seconds',
    updated_at = NOW()
WHERE status = 'RUNNING'
  AND (
    claimed_by_bot_id IS NULL
    OR claim_token IS NULL
    OR lease_expires_at IS NULL
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_running_claim_required'
      AND conrelid = 'tasks'::regclass
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_running_claim_required
      CHECK (
        status <> 'RUNNING'
        OR (
          claimed_by_bot_id IS NOT NULL
          AND claim_generation > 0
          AND claim_token IS NOT NULL
          AND lease_expires_at IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tasks_claimable
  ON tasks (assigned_to_bot, status, claim_available_at, lease_expires_at, created_at, id)
  WHERE status IN ('QUEUED', 'RUNNING');

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_runs_claim_generation
  ON task_runs (task_id, claim_generation);

COMMIT;
