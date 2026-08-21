BEGIN;

ALTER TABLE service_inquiries
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES orgs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due_at DATE,
  ADD COLUMN IF NOT EXISTS active_scope_version INTEGER,
  ADD COLUMN IF NOT EXISTS access_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS outcome_json JSONB,
  ADD COLUMN IF NOT EXISTS learning TEXT,
  ADD COLUMN IF NOT EXISTS risk_code VARCHAR(64),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_scope_hash VARCHAR(64);

ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS service_inquiries_status_check;
ALTER TABLE service_inquiries ADD CONSTRAINT service_inquiries_status_check
  CHECK (status IN ('RECEIVED', 'IN_REVIEW', 'SCOPE_ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'CLOSED', 'CANCELLED'));

ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS service_inquiries_outcome_status_check;
ALTER TABLE service_inquiries ADD CONSTRAINT service_inquiries_outcome_status_check
  CHECK (outcome_status IN ('PENDING', 'VERIFIED', 'UNVERIFIED'));

ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS service_inquiries_version_check;
ALTER TABLE service_inquiries ADD CONSTRAINT service_inquiries_version_check CHECK (version > 0);

ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS service_inquiries_scope_version_check;
ALTER TABLE service_inquiries ADD CONSTRAINT service_inquiries_scope_version_check
  CHECK (active_scope_version IS NULL OR active_scope_version > 0);

CREATE TABLE IF NOT EXISTS service_case_scopes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inquiry_id UUID NOT NULL REFERENCES service_inquiries(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  target_result TEXT NOT NULL,
  deliverables_json JSONB NOT NULL,
  exclusions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_access_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_target_business_days INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  acceptance_channel VARCHAR(32) NOT NULL,
  acceptance_reference VARCHAR(500) NOT NULL,
  accepted_by VARCHAR(160) NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  scope_hash VARCHAR(64) NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inquiry_id, version),
  UNIQUE(inquiry_id, scope_hash),
  CONSTRAINT service_case_scopes_version_check CHECK (version > 0),
  CONSTRAINT service_case_scopes_price_check CHECK (amount_cents = 15000 AND currency = 'USD'),
  CONSTRAINT service_case_scopes_days_check CHECK (delivery_target_business_days BETWEEN 1 AND 30),
  CONSTRAINT service_case_scopes_channel_check CHECK (acceptance_channel IN ('EMAIL', 'SIGNED_DOCUMENT', 'RECORDED_CALL')),
  CONSTRAINT service_case_scopes_hash_check CHECK (scope_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS service_case_deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inquiry_id UUID NOT NULL REFERENCES service_inquiries(id) ON DELETE RESTRICT,
  scope_id UUID NOT NULL REFERENCES service_case_scopes(id) ON DELETE RESTRICT,
  code VARCHAR(40) NOT NULL,
  label TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  evidence_reference VARCHAR(500),
  evidence_hash VARCHAR(64),
  completed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inquiry_id, code),
  CONSTRAINT service_case_deliverables_code_check CHECK (code IN (
    'WORKFLOW_MAP', 'CLIENT_WORKSPACE', 'ESTIMATE_INVOICE', 'INTAKE_FOLLOWUP', 'EXPENSE_OPEN_WORK'
  )),
  CONSTRAINT service_case_deliverables_status_check CHECK (status IN ('OPEN', 'COMPLETE')),
  CONSTRAINT service_case_deliverables_evidence_check CHECK (
    (status = 'OPEN' AND evidence_reference IS NULL AND evidence_hash IS NULL AND completed_at IS NULL)
    OR
    (status = 'COMPLETE' AND evidence_reference IS NOT NULL AND evidence_hash ~ '^[a-f0-9]{64}$' AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS service_case_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inquiry_id UUID NOT NULL REFERENCES service_inquiries(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL,
  aggregate_version INTEGER NOT NULL,
  actor_type VARCHAR(16) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  from_state VARCHAR(24),
  to_state VARCHAR(24),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key VARCHAR(160) NOT NULL,
  request_id VARCHAR(160),
  previous_hash VARCHAR(64) NOT NULL,
  event_hash VARCHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inquiry_id, sequence),
  UNIQUE(inquiry_id, idempotency_key),
  CONSTRAINT service_case_events_sequence_check CHECK (sequence > 0 AND aggregate_version > 0),
  CONSTRAINT service_case_events_actor_check CHECK (actor_type IN ('USER', 'SYSTEM')),
  CONSTRAINT service_case_events_state_check CHECK (
    (from_state IS NULL OR from_state IN ('RECEIVED', 'IN_REVIEW', 'SCOPE_ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'CLOSED', 'CANCELLED'))
    AND
    (to_state IS NULL OR to_state IN ('RECEIVED', 'IN_REVIEW', 'SCOPE_ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'CLOSED', 'CANCELLED'))
  ),
  CONSTRAINT service_case_events_previous_hash_check CHECK (previous_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT service_case_events_hash_check CHECK (event_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS service_case_webhook_events (
  stripe_event_id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  receipt_id VARCHAR(40),
  processing_status VARCHAR(24) NOT NULL,
  reason VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_case_webhook_status_check CHECK (processing_status IN ('PROCESSED', 'IGNORED', 'FAILED')),
  CONSTRAINT service_case_webhook_hash_check CHECK (payload_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_service_inquiries_proof_queue
  ON service_inquiries(status, next_action_due_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_inquiries_proof_org
  ON service_inquiries(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_case_scopes_inquiry
  ON service_case_scopes(inquiry_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_service_case_deliverables_inquiry
  ON service_case_deliverables(inquiry_id, status, code);
CREATE INDEX IF NOT EXISTS idx_service_case_events_inquiry
  ON service_case_events(inquiry_id, sequence);

CREATE OR REPLACE FUNCTION reject_service_case_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Proof Desk audit and scope records are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_case_events_immutable ON service_case_events;
CREATE TRIGGER service_case_events_immutable
  BEFORE UPDATE OR DELETE ON service_case_events
  FOR EACH ROW EXECUTE FUNCTION reject_service_case_immutable_mutation();

DROP TRIGGER IF EXISTS service_case_scopes_immutable ON service_case_scopes;
CREATE TRIGGER service_case_scopes_immutable
  BEFORE UPDATE OR DELETE ON service_case_scopes
  FOR EACH ROW EXECUTE FUNCTION reject_service_case_immutable_mutation();

CREATE OR REPLACE FUNCTION enforce_service_inquiry_proof_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.active_scope_version IS NOT NULL
    AND NEW.active_scope_version IS DISTINCT FROM OLD.active_scope_version THEN
    RAISE EXCEPTION 'An accepted Proof Desk scope cannot be replaced';
  END IF;
  IF OLD.outcome_status <> 'PENDING'
    AND (
      NEW.outcome_status IS DISTINCT FROM OLD.outcome_status
      OR NEW.outcome_json IS DISTINCT FROM OLD.outcome_json
    ) THEN
    RAISE EXCEPTION 'Recorded Proof Desk outcome evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_inquiries_proof_immutable ON service_inquiries;
CREATE TRIGGER service_inquiries_proof_immutable
  BEFORE UPDATE ON service_inquiries
  FOR EACH ROW EXECUTE FUNCTION enforce_service_inquiry_proof_immutability();

COMMIT;
