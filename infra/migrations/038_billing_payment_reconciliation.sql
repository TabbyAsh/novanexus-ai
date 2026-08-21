BEGIN;

-- A checkout idempotency key must always resolve to the exact Stripe session
-- and aggregate version first returned for that key. The inquiry row retains
-- only the currently active session, so it cannot serve as replay history.
CREATE TABLE IF NOT EXISTS service_checkout_attempts (
  inquiry_id UUID NOT NULL REFERENCES service_inquiries(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(160) NOT NULL,
  command_hash VARCHAR(64) NOT NULL,
  scope_hash VARCHAR(64) NOT NULL,
  stripe_checkout_session_id VARCHAR(255) NOT NULL,
  aggregate_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (inquiry_id, idempotency_key),
  CONSTRAINT service_checkout_attempts_command_hash_check CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT service_checkout_attempts_scope_hash_check CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT service_checkout_attempts_version_check CHECK (aggregate_version > 0)
);

CREATE INDEX IF NOT EXISTS idx_service_checkout_attempts_session
  ON service_checkout_attempts(stripe_checkout_session_id);

-- Stripe webhook delivery is not ordered. A full refund can arrive before the
-- checkout completion that binds its PaymentIntent to an inquiry. Keep that
-- refund durable until checkout completion can reconcile it.
CREATE TABLE IF NOT EXISTS service_case_pending_refunds (
  payment_intent_id VARCHAR(255) PRIMARY KEY,
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  receipt_id VARCHAR(40),
  payload_hash VARCHAR(64) NOT NULL,
  resolved_inquiry_id UUID REFERENCES service_inquiries(id) ON DELETE RESTRICT,
  resolution_reason VARCHAR(160),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_case_pending_refunds_hash_check CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT service_case_pending_refunds_resolution_check CHECK (
    (resolved_at IS NULL AND resolved_inquiry_id IS NULL AND resolution_reason IS NULL)
    OR
    (resolved_at IS NOT NULL AND resolved_inquiry_id IS NOT NULL AND resolution_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_service_case_pending_refunds_unresolved
  ON service_case_pending_refunds(created_at)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION reject_service_checkout_attempt_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Service checkout attempt bindings are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_checkout_attempts_immutable ON service_checkout_attempts;
CREATE TRIGGER service_checkout_attempts_immutable
  BEFORE UPDATE OR DELETE ON service_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION reject_service_checkout_attempt_mutation();

CREATE OR REPLACE FUNCTION enforce_pending_refund_terminal_resolution()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pending refund evidence cannot be deleted or changed after resolution';
  END IF;
  IF NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id
    OR NEW.stripe_event_id IS DISTINCT FROM OLD.stripe_event_id
    OR NEW.receipt_id IS DISTINCT FROM OLD.receipt_id
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.resolved_at IS NULL THEN
    RAISE EXCEPTION 'Pending refund evidence may only transition once to a resolved state';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_case_pending_refunds_terminal ON service_case_pending_refunds;
CREATE TRIGGER service_case_pending_refunds_terminal
  BEFORE UPDATE OR DELETE ON service_case_pending_refunds
  FOR EACH ROW EXECUTE FUNCTION enforce_pending_refund_terminal_resolution();

COMMIT;
