BEGIN;

-- Expansion phase only. Every new column is nullable or has a rollback-safe
-- default, so the previous binary can continue writing throughout a rolling
-- deploy and after an automatic rollback. A later migration may validate and
-- require backfilled authority only after the rollback window has closed.
ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS stripe_subscription_event_created BIGINT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_event_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_event_kind VARCHAR(32),
  ADD COLUMN IF NOT EXISTS stripe_subscription_event_rank SMALLINT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_terminal BOOLEAN NOT NULL DEFAULT FALSE;

-- Legacy cancellation writers cleared the subscription ID and had no tombstone
-- column. Preserve those terminal states before the new reader can see them.
UPDATE entitlements
SET stripe_subscription_terminal = TRUE
WHERE status = 'CANCELED'
  AND stripe_subscription_terminal IS DISTINCT FROM TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'entitlements'::regclass
      AND conname = 'entitlements_stripe_subscription_event_cursor_check'
  ) THEN
    ALTER TABLE entitlements
      ADD CONSTRAINT entitlements_stripe_subscription_event_cursor_check CHECK (
        (
          stripe_subscription_event_created IS NULL
          AND stripe_subscription_event_id IS NULL
          AND stripe_subscription_event_kind IS NULL
          AND stripe_subscription_event_rank IS NULL
        )
        OR
        (
          stripe_subscription_event_created > 0
          AND stripe_subscription_event_id IS NOT NULL
          AND stripe_subscription_event_kind IN (
            'CHECKOUT_COMPLETED', 'SUBSCRIPTION_UPDATED',
            'SUBSCRIPTION_DELETED', 'PAYMENT_FAILED'
          )
          AND stripe_subscription_event_rank IN (10, 30, 40)
        )
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE service_inquiries
  ADD COLUMN IF NOT EXISTS stripe_payment_link_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payment_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Populated authority must be complete and exact, but an all-null legacy row
-- remains valid for the old writer. The new binary dual-writes/backfills exact
-- authority. Requiring non-null authority for PAID/REFUNDED is intentionally a
-- later contraction after verification and rollback safety.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'service_inquiries'::regclass
      AND conname = 'service_inquiries_workflow_payment_authority_check'
  ) THEN
    ALTER TABLE service_inquiries
      ADD CONSTRAINT service_inquiries_workflow_payment_authority_check CHECK (
        (
          stripe_payment_link_id IS NULL
          AND stripe_price_id IS NULL
          AND stripe_product_id IS NULL
          AND payment_amount_cents IS NULL
          AND payment_currency IS NULL
        )
        OR
        (
          stripe_payment_link_id = 'plink_1U2B44IRGET1dbqSigapZksV'
          AND stripe_price_id = 'price_1U2B3oIRGET1dbqSTkV7QdAu'
          AND stripe_product_id = 'prod_V2FYOPIbc7KlKQ'
          AND payment_amount_cents = 15000
          AND payment_currency = 'USD'
        )
      ) NOT VALID;
  END IF;
END $$;

-- Hash-only delivery and exception ledger. Subsequent ALTER statements make
-- this safe to rerun even if an interrupted/manual attempt created a partial
-- table before the tracked migration ran.
CREATE TABLE IF NOT EXISTS service_payment_events (
  event_hash VARCHAR(64) PRIMARY KEY,
  source VARCHAR(24) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  stripe_created BIGINT,
  processing_status VARCHAR(24) NOT NULL DEFAULT 'PROCESSING',
  reason_code VARCHAR(100) NOT NULL DEFAULT 'PROCESSING',
  receipt_hash VARCHAR(64),
  checkout_session_hash VARCHAR(64),
  payment_intent_hash VARCHAR(64),
  operator_alert_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  operator_alert_attempts INTEGER NOT NULL DEFAULT 0,
  operator_alert_next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  operator_alert_lease_owner VARCHAR(100),
  operator_alert_lease_until TIMESTAMPTZ,
  processing_attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  alerted_at TIMESTAMPTZ
);

ALTER TABLE service_payment_events
  ADD COLUMN IF NOT EXISTS event_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS source VARCHAR(24),
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS stripe_created BIGINT,
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(24) DEFAULT 'PROCESSING',
  ADD COLUMN IF NOT EXISTS reason_code VARCHAR(100) DEFAULT 'PROCESSING',
  ADD COLUMN IF NOT EXISTS receipt_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS checkout_session_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS payment_intent_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS operator_alert_status VARCHAR(24) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS operator_alert_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operator_alert_next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS operator_alert_lease_owner VARCHAR(100),
  ADD COLUMN IF NOT EXISTS operator_alert_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_attempts INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ;

-- ADD COLUMN IF NOT EXISTS does not repair a default on a column left by an
-- interrupted/manual attempt. Set the writer-facing defaults explicitly.
ALTER TABLE service_payment_events
  ALTER COLUMN processing_status SET DEFAULT 'PROCESSING',
  ALTER COLUMN reason_code SET DEFAULT 'PROCESSING',
  ALTER COLUMN operator_alert_status SET DEFAULT 'PENDING',
  ALTER COLUMN operator_alert_attempts SET DEFAULT 0,
  ALTER COLUMN operator_alert_next_attempt_at SET DEFAULT NOW(),
  ALTER COLUMN processing_attempts SET DEFAULT 1,
  ALTER COLUMN last_attempt_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET DEFAULT NOW();

UPDATE service_payment_events
SET processing_status = COALESCE(processing_status, 'PROCESSING'),
    reason_code = COALESCE(reason_code, 'PROCESSING'),
    operator_alert_status = COALESCE(operator_alert_status, 'PENDING'),
    operator_alert_attempts = COALESCE(operator_alert_attempts, 0),
    operator_alert_next_attempt_at = COALESCE(operator_alert_next_attempt_at, NOW()),
    processing_attempts = COALESCE(processing_attempts, 1),
    last_attempt_at = COALESCE(last_attempt_at, created_at, NOW()),
    created_at = COALESCE(created_at, NOW());

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_payment_events_event_hash_unique
  ON service_payment_events(event_hash);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'service_payment_events'::regclass
      AND conname = 'service_payment_events_values_check'
  ) THEN
    ALTER TABLE service_payment_events
      ADD CONSTRAINT service_payment_events_values_check CHECK (
        (source IS NULL OR source IN ('WEBHOOK', 'RECONCILIATION'))
        AND (processing_status IS NULL OR processing_status IN ('PROCESSING', 'PROCESSED', 'EXCEPTION', 'IGNORED'))
        AND (operator_alert_status IS NULL OR operator_alert_status IN ('PENDING', 'PROVIDER_ACCEPTED', 'FAILED', 'NOT_CONFIGURED', 'NOT_REQUIRED'))
        AND (operator_alert_attempts IS NULL OR operator_alert_attempts >= 0)
        AND (processing_attempts IS NULL OR processing_attempts BETWEEN 1 AND 5)
        AND (event_hash IS NULL OR event_hash ~ '^[a-f0-9]{64}$')
        AND (receipt_hash IS NULL OR receipt_hash ~ '^[a-f0-9]{64}$')
        AND (checkout_session_hash IS NULL OR checkout_session_hash ~ '^[a-f0-9]{64}$')
        AND (payment_intent_hash IS NULL OR payment_intent_hash ~ '^[a-f0-9]{64}$')
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_payment_events_exceptions
  ON service_payment_events(created_at DESC)
  WHERE processing_status = 'EXCEPTION';

CREATE INDEX IF NOT EXISTS idx_service_payment_events_alert_queue
  ON service_payment_events(operator_alert_next_attempt_at, created_at, event_hash)
  WHERE processing_status = 'EXCEPTION'
    AND operator_alert_status IN ('PENDING', 'FAILED', 'NOT_CONFIGURED');

CREATE TABLE IF NOT EXISTS service_payment_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
  sessions_checked INTEGER NOT NULL DEFAULT 0,
  recent_sessions_checked INTEGER NOT NULL DEFAULT 0,
  payments_recorded INTEGER NOT NULL DEFAULT 0,
  refunds_recorded INTEGER NOT NULL DEFAULT 0,
  exceptions_recorded INTEGER NOT NULL DEFAULT 0,
  duplicates_seen INTEGER NOT NULL DEFAULT 0,
  error_code VARCHAR(100),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

ALTER TABLE service_payment_reconciliation_runs
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4(),
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'RUNNING',
  ADD COLUMN IF NOT EXISTS sessions_checked INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recent_sessions_checked INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payments_recorded INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunds_recorded INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exceptions_recorded INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicates_seen INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

ALTER TABLE service_payment_reconciliation_runs
  ALTER COLUMN id SET DEFAULT uuid_generate_v4(),
  ALTER COLUMN status SET DEFAULT 'RUNNING',
  ALTER COLUMN sessions_checked SET DEFAULT 0,
  ALTER COLUMN recent_sessions_checked SET DEFAULT 0,
  ALTER COLUMN payments_recorded SET DEFAULT 0,
  ALTER COLUMN refunds_recorded SET DEFAULT 0,
  ALTER COLUMN exceptions_recorded SET DEFAULT 0,
  ALTER COLUMN duplicates_seen SET DEFAULT 0,
  ALTER COLUMN started_at SET DEFAULT NOW();

UPDATE service_payment_reconciliation_runs
SET id = COALESCE(id, uuid_generate_v4()),
    status = COALESCE(status, 'RUNNING'),
    sessions_checked = COALESCE(sessions_checked, 0),
    recent_sessions_checked = COALESCE(recent_sessions_checked, 0),
    payments_recorded = COALESCE(payments_recorded, 0),
    refunds_recorded = COALESCE(refunds_recorded, 0),
    exceptions_recorded = COALESCE(exceptions_recorded, 0),
    duplicates_seen = COALESCE(duplicates_seen, 0),
    started_at = COALESCE(started_at, NOW());

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_payment_reconciliation_runs_id_unique
  ON service_payment_reconciliation_runs(id);
CREATE INDEX IF NOT EXISTS idx_service_payment_reconciliation_runs_started
  ON service_payment_reconciliation_runs(started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'service_payment_reconciliation_runs'::regclass
      AND conname = 'service_payment_reconciliation_runs_values_check'
  ) THEN
    ALTER TABLE service_payment_reconciliation_runs
      ADD CONSTRAINT service_payment_reconciliation_runs_values_check CHECK (
        (status IS NULL OR status IN ('RUNNING', 'SUCCEEDED', 'FAILED'))
        AND COALESCE(sessions_checked, 0) >= 0
        AND COALESCE(recent_sessions_checked, 0) >= 0
        AND COALESCE(payments_recorded, 0) >= 0
        AND COALESCE(refunds_recorded, 0) >= 0
        AND COALESCE(exceptions_recorded, 0) >= 0
        AND COALESCE(duplicates_seen, 0) >= 0
      ) NOT VALID;
  END IF;
END $$;

-- One durable cursor and expiring lease is shared by every replica/deploy.
CREATE TABLE IF NOT EXISTS service_payment_reconciliation_state (
  name VARCHAR(64) PRIMARY KEY,
  starting_after VARCHAR(255),
  lease_owner VARCHAR(100),
  lease_expires_at TIMESTAMPTZ,
  last_run_started_at TIMESTAMPTZ,
  last_recent_scan_at TIMESTAMPTZ,
  last_recent_sessions_checked INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_error_code VARCHAR(100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE service_payment_reconciliation_state
  ADD COLUMN IF NOT EXISTS name VARCHAR(64),
  ADD COLUMN IF NOT EXISTS starting_after VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(100),
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_recent_scan_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_recent_sessions_checked INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE service_payment_reconciliation_state
  ALTER COLUMN last_recent_sessions_checked SET DEFAULT 0,
  ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE service_payment_reconciliation_state
SET last_recent_sessions_checked = COALESCE(last_recent_sessions_checked, 0),
    updated_at = COALESCE(updated_at, NOW());

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_payment_reconciliation_state_name_unique
  ON service_payment_reconciliation_state(name);

INSERT INTO service_payment_reconciliation_state (name)
VALUES ('WORKFLOW_PILOT')
ON CONFLICT (name) DO NOTHING;

COMMIT;
