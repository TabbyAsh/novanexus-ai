BEGIN;

-- Canonical mission payload/envelope hashes are verified at the persistence
-- boundary. This kernel is experimental and is not itself an executor.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Immutable opportunity revisions. State changes create a new revision rather
-- than rewriting the evidence and assumptions that justified an opportunity.
CREATE TABLE IF NOT EXISTS nova_opportunity_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  card_key VARCHAR(120) NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  supersedes_card_id UUID REFERENCES nova_opportunity_cards(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL,
  title VARCHAR(200) NOT NULL,
  buyer TEXT NOT NULL,
  painful_job TEXT NOT NULL,
  proposed_value TEXT NOT NULL,
  evidence_json JSONB NOT NULL,
  assumptions_json JSONB NOT NULL,
  risks_json JSONB NOT NULL,
  required_capability_ids_json JSONB NOT NULL,
  minimum_authority VARCHAR(24) NOT NULL,
  next_test TEXT NOT NULL,
  estimate_json JSONB,
  created_by_actor_type VARCHAR(16) NOT NULL,
  created_by_actor_id VARCHAR(100) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(org_id, card_key, revision),
  UNIQUE(org_id, content_hash),
  CONSTRAINT nova_opportunity_cards_revision_check CHECK (revision > 0),
  CONSTRAINT nova_opportunity_cards_status_check CHECK (status IN ('PROPOSED', 'VALIDATED', 'REJECTED', 'EXPIRED', 'CONVERTED')),
  CONSTRAINT nova_opportunity_cards_actor_check CHECK (created_by_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  CONSTRAINT nova_opportunity_cards_authority_check CHECK (minimum_authority IN ('OBSERVE', 'CREATE', 'PREPARE', 'ACT_ONCE', 'OPERATE')),
  CONSTRAINT nova_opportunity_cards_json_check CHECK (
    jsonb_typeof(evidence_json) = 'array'
    AND jsonb_array_length(evidence_json) > 0
    AND jsonb_typeof(assumptions_json) = 'array'
    AND jsonb_array_length(assumptions_json) > 0
    AND jsonb_typeof(risks_json) = 'array'
    AND jsonb_array_length(risks_json) > 0
    AND jsonb_typeof(required_capability_ids_json) = 'array'
    AND jsonb_array_length(required_capability_ids_json) > 0
  ),
  CONSTRAINT nova_opportunity_cards_estimate_truth_check CHECK (
    estimate_json IS NULL
    OR (
      jsonb_typeof(estimate_json) = 'object'
      AND estimate_json ? 'classification'
      AND estimate_json ->> 'classification' = 'ESTIMATE'
    )
  ),
  CONSTRAINT nova_opportunity_cards_hash_check CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT nova_opportunity_cards_window_check CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS nova_missions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  opportunity_card_id UUID NOT NULL REFERENCES nova_opportunity_cards(id) ON DELETE RESTRICT,
  template_id VARCHAR(120),
  template_version INTEGER,
  state VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  capability_ids_json JSONB NOT NULL,
  open_action_count INTEGER NOT NULL DEFAULT 0,
  closeout_hash VARCHAR(64),
  version INTEGER NOT NULL DEFAULT 1,
  created_by_actor_type VARCHAR(16) NOT NULL,
  created_by_actor_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nova_missions_state_check CHECK (state IN ('DRAFT', 'READY', 'RUNNING', 'PAUSED', 'CLOSING', 'CLOSED')),
  CONSTRAINT nova_missions_actor_check CHECK (created_by_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  CONSTRAINT nova_missions_version_check CHECK (version > 0),
  CONSTRAINT nova_missions_actions_check CHECK (open_action_count >= 0),
  CONSTRAINT nova_missions_template_check CHECK (
    (template_id IS NULL AND template_version IS NULL)
    OR (template_id IS NOT NULL AND template_version IS NOT NULL AND template_version > 0)
  ),
  CONSTRAINT nova_missions_capabilities_check CHECK (
    jsonb_typeof(capability_ids_json) = 'array' AND jsonb_array_length(capability_ids_json) > 0
  ),
  CONSTRAINT nova_missions_closeout_hash_check CHECK (closeout_hash IS NULL OR closeout_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT nova_missions_terminal_check CHECK (
    (state = 'CLOSED' AND closeout_hash IS NOT NULL AND open_action_count = 0)
    OR state <> 'CLOSED'
  )
);

-- Mandates are immutable grants. Revocation is an immutable companion record,
-- so prior authority can be reconstructed without rewriting history.
CREATE TABLE IF NOT EXISTS nova_mission_mandates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES nova_missions(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  authority VARCHAR(24) NOT NULL,
  allowed_capability_ids_json JSONB NOT NULL,
  allowed_action_types_json JSONB NOT NULL,
  allowed_external_action_types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_external_target_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_action_hash VARCHAR(64),
  max_actions INTEGER NOT NULL,
  max_external_actions INTEGER NOT NULL DEFAULT 0,
  max_spend_cents BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL,
  issued_by_actor_id VARCHAR(100) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  not_before TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  mandate_hash VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mission_id, mandate_hash),
  CONSTRAINT nova_mission_mandates_authority_check CHECK (authority IN ('OBSERVE', 'CREATE', 'PREPARE', 'ACT_ONCE', 'OPERATE')),
  CONSTRAINT nova_mission_mandates_caps_check CHECK (
    max_actions > 0
    AND max_external_actions >= 0
    AND max_external_actions <= max_actions
    AND max_spend_cents >= 0
  ),
  CONSTRAINT nova_mission_mandates_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT nova_mission_mandates_json_check CHECK (
    jsonb_typeof(allowed_capability_ids_json) = 'array'
    AND jsonb_array_length(allowed_capability_ids_json) > 0
    AND jsonb_typeof(allowed_action_types_json) = 'array'
    AND jsonb_array_length(allowed_action_types_json) > 0
    AND jsonb_typeof(allowed_external_action_types_json) = 'array'
    AND jsonb_typeof(allowed_external_target_refs_json) = 'array'
  ),
  CONSTRAINT nova_mission_mandates_no_wildcards_check CHECK (
    NOT (allowed_action_types_json @> '["*"]'::jsonb)
    AND NOT (allowed_external_action_types_json @> '["*"]'::jsonb)
    AND NOT (allowed_external_target_refs_json @> '["*"]'::jsonb)
  ),
  CONSTRAINT nova_mission_mandates_external_bounds_check CHECK (
    (
      authority IN ('OBSERVE', 'CREATE', 'PREPARE')
      AND jsonb_array_length(allowed_external_action_types_json) = 0
      AND jsonb_array_length(allowed_external_target_refs_json) = 0
      AND approved_action_hash IS NULL
      AND max_external_actions = 0
      AND max_spend_cents = 0
    )
    OR
    (
      authority = 'ACT_ONCE'
      AND (
        (
          jsonb_array_length(allowed_external_action_types_json) = 0
          AND jsonb_array_length(allowed_external_target_refs_json) = 0
          AND approved_action_hash IS NULL
          AND max_external_actions = 0
          AND max_spend_cents = 0
        )
        OR (
          jsonb_array_length(allowed_external_action_types_json) = 1
          AND jsonb_array_length(allowed_external_target_refs_json) = 1
          AND approved_action_hash ~ '^[a-f0-9]{64}$'
          AND max_external_actions = 1
        )
      )
    )
    OR
    (
      authority = 'OPERATE'
      AND approved_action_hash IS NULL
      AND (
        (
          jsonb_array_length(allowed_external_action_types_json) = 0
          AND jsonb_array_length(allowed_external_target_refs_json) = 0
          AND max_external_actions = 0
          AND max_spend_cents = 0
        )
        OR (
          jsonb_array_length(allowed_external_action_types_json) > 0
          AND jsonb_array_length(allowed_external_target_refs_json) > 0
          AND max_external_actions > 0
        )
      )
    )
  ),
  CONSTRAINT nova_mission_mandates_window_check CHECK (
    not_before >= issued_at
    AND expires_at > not_before
    AND expires_at <= not_before + INTERVAL '30 days'
    AND (authority <> 'OPERATE' OR expires_at <= not_before + INTERVAL '7 days')
  ),
  CONSTRAINT nova_mission_mandates_hash_check CHECK (mandate_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS nova_mission_mandate_revocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mandate_id UUID NOT NULL UNIQUE REFERENCES nova_mission_mandates(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES nova_missions(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  revoked_by_actor_id VARCHAR(100) NOT NULL,
  reason TEXT NOT NULL,
  revocation_reference VARCHAR(500) NOT NULL,
  revocation_hash VARCHAR(64) NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nova_mission_revocations_hash_check CHECK (revocation_hash ~ '^[a-f0-9]{64}$')
);

-- Action effect and authority are server-owned policy, never request-owned
-- labels. Policies are append-only so an approval cannot change meaning later.
CREATE TABLE IF NOT EXISTS nova_mission_action_policies (
  action_type VARCHAR(120) PRIMARY KEY,
  capability_id VARCHAR(120) NOT NULL,
  effect VARCHAR(32) NOT NULL,
  minimum_authority VARCHAR(24) NOT NULL,
  policy_hash VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(action_type, capability_id),
  CONSTRAINT nova_mission_action_policies_effect_check CHECK (effect IN (
    'READ_ONLY', 'PRIVATE_ARTIFACT', 'STAGED_EXTERNAL_ACTION',
    'EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL'
  )),
  CONSTRAINT nova_mission_action_policies_authority_check CHECK (
    (effect = 'READ_ONLY' AND minimum_authority IN ('OBSERVE', 'CREATE', 'PREPARE', 'ACT_ONCE', 'OPERATE'))
    OR (effect = 'PRIVATE_ARTIFACT' AND minimum_authority IN ('CREATE', 'PREPARE', 'ACT_ONCE', 'OPERATE'))
    OR (effect = 'STAGED_EXTERNAL_ACTION' AND minimum_authority IN ('PREPARE', 'ACT_ONCE', 'OPERATE'))
    OR (effect IN ('EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL')
      AND minimum_authority IN ('ACT_ONCE', 'OPERATE'))
  ),
  CONSTRAINT nova_mission_action_policies_hash_check CHECK (policy_hash ~ '^[a-f0-9]{64}$')
);

INSERT INTO nova_mission_action_policies
  (action_type, capability_id, effect, minimum_authority, policy_hash)
VALUES
  (
    'draft_followup', 'communication_drafting', 'STAGED_EXTERNAL_ACTION', 'PREPARE',
    encode(digest(convert_to('draft_followup|communication_drafting|STAGED_EXTERNAL_ACTION|PREPARE', 'UTF8'), 'sha256'), 'hex')
  ),
  (
    'customer_followup_send', 'communication_drafting', 'EXTERNAL_COMMUNICATION', 'ACT_ONCE',
    encode(digest(convert_to('customer_followup_send|communication_drafting|EXTERNAL_COMMUNICATION|ACT_ONCE', 'UTF8'), 'sha256'), 'hex')
  )
ON CONFLICT (action_type) DO NOTHING;

-- Every mission starts fail-closed. A trusted control-plane operation must
-- explicitly disable this switch before an external action can be claimed.
CREATE TABLE IF NOT EXISTS nova_mission_kill_switches (
  mission_id UUID PRIMARY KEY REFERENCES nova_missions(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  state VARCHAR(16) NOT NULL DEFAULT 'ENABLED',
  version BIGINT NOT NULL DEFAULT 1,
  updated_by_actor_id VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nova_mission_kill_switches_state_check CHECK (state IN ('DISABLED', 'ENABLED')),
  CONSTRAINT nova_mission_kill_switches_version_check CHECK (version > 0)
);

-- Human approval binds one immutable canonical action envelope. Consumption is
-- recorded in a separate append-only table when dispatch is claimed.
CREATE TABLE IF NOT EXISTS nova_mission_action_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES nova_missions(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  mandate_id UUID NOT NULL REFERENCES nova_mission_mandates(id) ON DELETE RESTRICT,
  action_envelope_hash VARCHAR(64) NOT NULL,
  approved_by_actor_type VARCHAR(16) NOT NULL,
  approved_by_actor_id VARCHAR(100) NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nova_mission_action_approvals_actor_check CHECK (approved_by_actor_type = 'HUMAN'),
  CONSTRAINT nova_mission_action_approvals_hash_check CHECK (action_envelope_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT nova_mission_action_approvals_window_check CHECK (expires_at > approved_at)
);

-- The default preflight decision is DENY. Rows cannot enter execution states
-- unless a successful preflight recorded exact authority and effect context.
CREATE TABLE IF NOT EXISTS nova_mission_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES nova_missions(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  mandate_id UUID REFERENCES nova_mission_mandates(id) ON DELETE RESTRICT,
  action_type VARCHAR(120) NOT NULL,
  capability_id VARCHAR(120) NOT NULL,
  effect VARCHAR(32) NOT NULL,
  authority_used VARCHAR(24),
  target_reference VARCHAR(300),
  expected_spend_cents BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL,
  approval_id UUID REFERENCES nova_mission_action_approvals(id) ON DELETE RESTRICT,
  payload_json JSONB NOT NULL,
  payload_canonical_json TEXT NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  action_envelope_canonical_json TEXT NOT NULL,
  action_envelope_hash VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  kill_switch_state VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
  kill_switch_version BIGINT,
  preflight_decision VARCHAR(16) NOT NULL DEFAULT 'DENY',
  denial_code VARCHAR(100),
  mandate_hash VARCHAR(64),
  status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
  result_evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  dispatch_claim_hash VARCHAR(64),
  dispatch_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mission_id, idempotency_key),
  FOREIGN KEY (action_type, capability_id)
    REFERENCES nova_mission_action_policies(action_type, capability_id) ON DELETE RESTRICT,
  CONSTRAINT nova_mission_actions_effect_check CHECK (effect IN (
    'READ_ONLY', 'PRIVATE_ARTIFACT', 'STAGED_EXTERNAL_ACTION',
    'EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL'
  )),
  CONSTRAINT nova_mission_actions_authority_check CHECK (
    authority_used IS NULL OR authority_used IN ('OBSERVE', 'CREATE', 'PREPARE', 'ACT_ONCE', 'OPERATE')
  ),
  CONSTRAINT nova_mission_actions_authority_floor_check CHECK (
    preflight_decision <> 'ALLOW'
    OR (effect = 'READ_ONLY' AND authority_used IN ('OBSERVE', 'CREATE', 'PREPARE', 'ACT_ONCE', 'OPERATE'))
    OR (effect = 'PRIVATE_ARTIFACT' AND authority_used IN ('CREATE', 'PREPARE', 'ACT_ONCE', 'OPERATE'))
    OR (effect = 'STAGED_EXTERNAL_ACTION' AND authority_used IN ('PREPARE', 'ACT_ONCE', 'OPERATE'))
    OR (effect IN ('EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL') AND authority_used IN ('ACT_ONCE', 'OPERATE'))
  ),
  CONSTRAINT nova_mission_actions_spend_check CHECK (expected_spend_cents >= 0 AND currency ~ '^[A-Z]{3}$'),
  CONSTRAINT nova_mission_actions_kill_switch_check CHECK (
    kill_switch_state IN ('DISABLED', 'ENABLED', 'UNKNOWN')
    AND (kill_switch_version IS NULL OR kill_switch_version > 0)
  ),
  CONSTRAINT nova_mission_actions_decision_check CHECK (preflight_decision IN ('ALLOW', 'DENY')),
  CONSTRAINT nova_mission_actions_status_check CHECK (status IN (
    'REQUESTED', 'DENIED', 'APPROVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'
  )),
  CONSTRAINT nova_mission_actions_result_check CHECK (
    jsonb_typeof(result_evidence_json) = 'array'
    AND (status <> 'SUCCEEDED' OR jsonb_array_length(result_evidence_json) > 0)
    AND (status NOT IN ('REQUESTED', 'DENIED', 'APPROVED', 'RUNNING') OR jsonb_array_length(result_evidence_json) = 0)
  ),
  CONSTRAINT nova_mission_actions_idempotency_check CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{15,159}$'
  ),
  CONSTRAINT nova_mission_actions_mandate_hash_check CHECK (mandate_hash IS NULL OR mandate_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT nova_mission_actions_payload_integrity_check CHECK (
    jsonb_typeof(payload_json) = 'object'
    AND octet_length(payload_canonical_json) <= 131072
    AND payload_canonical_json::jsonb = payload_json
    AND payload_hash = encode(digest(convert_to(payload_canonical_json, 'UTF8'), 'sha256'), 'hex')
  ),
  CONSTRAINT nova_mission_actions_envelope_integrity_check CHECK (
    action_envelope_hash ~ '^[a-f0-9]{64}$'
    AND action_envelope_hash = encode(digest(convert_to(action_envelope_canonical_json, 'UTF8'), 'sha256'), 'hex')
    AND action_envelope_canonical_json::jsonb = jsonb_build_object(
      'schemaVersion', 1,
      'actionType', action_type,
      'capabilityId', capability_id,
      'effect', effect,
      'targetRef', target_reference,
      'expectedSpendCents', expected_spend_cents,
      'currency', currency,
      'payloadHash', payload_hash
    )
  ),
  CONSTRAINT nova_mission_actions_staged_envelope_check CHECK (
    effect <> 'STAGED_EXTERNAL_ACTION' OR preflight_decision <> 'ALLOW'
    OR (target_reference IS NOT NULL AND expected_spend_cents = 0)
  ),
  CONSTRAINT nova_mission_actions_denied_execution_check CHECK (
    (preflight_decision = 'DENY' AND status = 'DENIED' AND denial_code IS NOT NULL)
    OR (preflight_decision = 'ALLOW' AND denial_code IS NULL)
  ),
  CONSTRAINT nova_mission_actions_dispatch_claim_check CHECK (
    (dispatch_claim_hash IS NULL AND dispatch_claimed_at IS NULL AND status IN ('REQUESTED', 'DENIED', 'APPROVED', 'CANCELLED'))
    OR (dispatch_claim_hash ~ '^[a-f0-9]{64}$' AND dispatch_claimed_at IS NOT NULL
      AND status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'))
  ),
  CONSTRAINT nova_mission_actions_external_fail_closed_check CHECK (
    effect NOT IN ('EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL')
    OR preflight_decision <> 'ALLOW'
    OR (
      mandate_id IS NOT NULL
      AND mandate_hash IS NOT NULL
      AND authority_used IS NOT NULL
      AND authority_used IN ('ACT_ONCE', 'OPERATE')
      AND target_reference IS NOT NULL
      AND kill_switch_state = 'DISABLED'
      AND kill_switch_version IS NOT NULL
      AND (authority_used <> 'ACT_ONCE' OR approval_id IS NOT NULL)
      AND (effect <> 'DESTRUCTIVE_EXTERNAL' OR approval_id IS NOT NULL)
    )
  )
);

CREATE TABLE IF NOT EXISTS nova_mission_action_approval_uses (
  approval_id UUID PRIMARY KEY REFERENCES nova_mission_action_approvals(id) ON DELETE RESTRICT,
  action_id UUID NOT NULL UNIQUE REFERENCES nova_mission_actions(id) ON DELETE RESTRICT,
  mandate_id UUID NOT NULL REFERENCES nova_mission_mandates(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nova_mission_act_once_uses (
  mandate_id UUID PRIMARY KEY REFERENCES nova_mission_mandates(id) ON DELETE RESTRICT,
  action_id UUID NOT NULL UNIQUE REFERENCES nova_mission_actions(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nova_mission_closeouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL UNIQUE REFERENCES nova_missions(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  disposition VARCHAR(24) NOT NULL,
  outcome_verification VARCHAR(24) NOT NULL,
  outcome_summary TEXT NOT NULL,
  outcome_observed_at TIMESTAMPTZ NOT NULL,
  outcome_evidence_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome_unverified_reason TEXT,
  economics_verification VARCHAR(24) NOT NULL,
  economics_reason TEXT,
  currency VARCHAR(3),
  collected_revenue_cents BIGINT,
  refunds_cents BIGINT,
  direct_cost_cents BIGINT,
  external_spend_cents BIGINT,
  labor_minutes INTEGER,
  economics_source_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  settled_revenue_evidence_reference VARCHAR(500),
  realized_net_cents BIGINT,
  learning TEXT NOT NULL,
  closed_by_actor_id VARCHAR(100) NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  closeout_hash VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nova_mission_closeouts_disposition_check CHECK (disposition IN ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED')),
  CONSTRAINT nova_mission_closeouts_outcome_check CHECK (
    outcome_verification IN ('VERIFIED', 'UNVERIFIED')
    AND jsonb_typeof(outcome_evidence_refs_json) = 'array'
    AND (
      (outcome_verification = 'VERIFIED' AND jsonb_array_length(outcome_evidence_refs_json) > 0)
      OR (outcome_verification = 'UNVERIFIED' AND outcome_unverified_reason IS NOT NULL AND disposition <> 'SUCCEEDED')
    )
  ),
  CONSTRAINT nova_mission_closeouts_economics_check CHECK (
    jsonb_typeof(economics_source_refs_json) = 'array'
    AND (
      (
        economics_verification = 'VERIFIED'
        AND currency IS NOT NULL
        AND currency ~ '^[A-Z]{3}$'
        AND collected_revenue_cents IS NOT NULL
        AND refunds_cents IS NOT NULL
        AND direct_cost_cents IS NOT NULL
        AND external_spend_cents IS NOT NULL
        AND labor_minutes IS NOT NULL
        AND realized_net_cents IS NOT NULL
        AND collected_revenue_cents >= 0
        AND refunds_cents >= 0
        AND direct_cost_cents >= 0
        AND external_spend_cents >= 0
        AND labor_minutes >= 0
        AND jsonb_array_length(economics_source_refs_json) > 0
        AND realized_net_cents = collected_revenue_cents - refunds_cents - direct_cost_cents - external_spend_cents
        AND (collected_revenue_cents = 0 OR settled_revenue_evidence_reference IS NOT NULL)
      )
      OR
      (
        economics_verification IN ('UNVERIFIED', 'NOT_APPLICABLE')
        AND economics_reason IS NOT NULL
        AND currency IS NULL
        AND collected_revenue_cents IS NULL
        AND refunds_cents IS NULL
        AND direct_cost_cents IS NULL
        AND external_spend_cents IS NULL
        AND settled_revenue_evidence_reference IS NULL
        AND realized_net_cents IS NULL
        AND (labor_minutes IS NULL OR labor_minutes >= 0)
      )
    )
  ),
  CONSTRAINT nova_mission_closeouts_hash_check CHECK (closeout_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS nova_mission_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES nova_missions(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL,
  aggregate_version INTEGER NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  actor_type VARCHAR(16) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_hash VARCHAR(64) NOT NULL,
  event_hash VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mission_id, sequence),
  UNIQUE(mission_id, idempotency_key),
  CONSTRAINT nova_mission_events_sequence_check CHECK (sequence > 0 AND aggregate_version > 0),
  CONSTRAINT nova_mission_events_actor_check CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  CONSTRAINT nova_mission_events_payload_check CHECK (jsonb_typeof(payload_json) = 'object'),
  CONSTRAINT nova_mission_events_previous_hash_check CHECK (previous_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT nova_mission_events_hash_check CHECK (event_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_nova_opportunity_cards_org_status
  ON nova_opportunity_cards(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nova_missions_org_state
  ON nova_missions(org_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_nova_mission_mandates_active
  ON nova_mission_mandates(mission_id, not_before, expires_at);
CREATE INDEX IF NOT EXISTS idx_nova_mission_approvals_active
  ON nova_mission_action_approvals(mission_id, mandate_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_nova_mission_kill_switches_org
  ON nova_mission_kill_switches(org_id, state);
CREATE INDEX IF NOT EXISTS idx_nova_mission_actions_queue
  ON nova_mission_actions(mission_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_nova_mission_events_chain
  ON nova_mission_events(mission_id, sequence);

CREATE OR REPLACE FUNCTION reject_nova_mission_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Nova mission evidence, authority, closeout, and event records are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_opportunity_cards_immutable ON nova_opportunity_cards;
CREATE TRIGGER nova_opportunity_cards_immutable
  BEFORE UPDATE OR DELETE ON nova_opportunity_cards
  FOR EACH ROW EXECUTE FUNCTION reject_nova_mission_immutable_mutation();

DROP TRIGGER IF EXISTS nova_mission_mandates_immutable ON nova_mission_mandates;
CREATE TRIGGER nova_mission_mandates_immutable
  BEFORE UPDATE OR DELETE ON nova_mission_mandates
  FOR EACH ROW EXECUTE FUNCTION reject_nova_mission_immutable_mutation();

DROP TRIGGER IF EXISTS nova_mission_revocations_immutable ON nova_mission_mandate_revocations;
CREATE TRIGGER nova_mission_revocations_immutable
  BEFORE UPDATE OR DELETE ON nova_mission_mandate_revocations
  FOR EACH ROW EXECUTE FUNCTION reject_nova_mission_immutable_mutation();

DROP TRIGGER IF EXISTS nova_mission_action_policies_immutable ON nova_mission_action_policies;
CREATE TRIGGER nova_mission_action_policies_immutable
  BEFORE UPDATE OR DELETE ON nova_mission_action_policies
  FOR EACH ROW EXECUTE FUNCTION reject_nova_mission_immutable_mutation();

DROP TRIGGER IF EXISTS nova_mission_action_approvals_immutable ON nova_mission_action_approvals;
CREATE TRIGGER nova_mission_action_approvals_immutable
  BEFORE UPDATE OR DELETE ON nova_mission_action_approvals
  FOR EACH ROW EXECUTE FUNCTION reject_nova_mission_immutable_mutation();

DROP TRIGGER IF EXISTS nova_mission_approval_uses_immutable ON nova_mission_action_approval_uses;
CREATE TRIGGER nova_mission_approval_uses_immutable
  BEFORE UPDATE OR DELETE ON nova_mission_action_approval_uses
  FOR EACH ROW EXECUTE FUNCTION reject_nova_mission_immutable_mutation();

DROP TRIGGER IF EXISTS nova_mission_act_once_uses_immutable ON nova_mission_act_once_uses;
CREATE TRIGGER nova_mission_act_once_uses_immutable
  BEFORE UPDATE OR DELETE ON nova_mission_act_once_uses
  FOR EACH ROW EXECUTE FUNCTION reject_nova_mission_immutable_mutation();

DROP TRIGGER IF EXISTS nova_mission_closeouts_immutable ON nova_mission_closeouts;
CREATE TRIGGER nova_mission_closeouts_immutable
  BEFORE UPDATE OR DELETE ON nova_mission_closeouts
  FOR EACH ROW EXECUTE FUNCTION reject_nova_mission_immutable_mutation();

DROP TRIGGER IF EXISTS nova_mission_events_immutable ON nova_mission_events;
CREATE TRIGGER nova_mission_events_immutable
  BEFORE UPDATE OR DELETE ON nova_mission_events
  FOR EACH ROW EXECUTE FUNCTION reject_nova_mission_immutable_mutation();

CREATE OR REPLACE FUNCTION validate_nova_opportunity_card_insert()
RETURNS TRIGGER AS $$
DECLARE
  prior_card nova_opportunity_cards%ROWTYPE;
BEGIN
  IF NEW.supersedes_card_id IS NULL THEN
    IF NEW.revision <> 1 THEN
      RAISE EXCEPTION 'An initial Nova opportunity card must use revision 1';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO prior_card
    FROM nova_opportunity_cards
    WHERE id = NEW.supersedes_card_id;
  IF NOT FOUND
    OR prior_card.org_id <> NEW.org_id
    OR prior_card.card_key <> NEW.card_key
    OR NEW.revision <> prior_card.revision + 1 THEN
    RAISE EXCEPTION 'Nova opportunity revision must continue the same organization and card key';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_opportunity_cards_insert_guard ON nova_opportunity_cards;
CREATE TRIGGER nova_opportunity_cards_insert_guard
  BEFORE INSERT ON nova_opportunity_cards
  FOR EACH ROW EXECUTE FUNCTION validate_nova_opportunity_card_insert();

CREATE OR REPLACE FUNCTION validate_nova_mission_insert()
RETURNS TRIGGER AS $$
DECLARE
  card_org_id UUID;
BEGIN
  SELECT org_id INTO card_org_id
    FROM nova_opportunity_cards
    WHERE id = NEW.opportunity_card_id;
  IF NOT FOUND OR card_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Nova mission opportunity card must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_missions_insert_guard ON nova_missions;
CREATE TRIGGER nova_missions_insert_guard
  BEFORE INSERT ON nova_missions
  FOR EACH ROW EXECUTE FUNCTION validate_nova_mission_insert();

CREATE OR REPLACE FUNCTION initialize_nova_mission_kill_switch()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO nova_mission_kill_switches
    (mission_id, org_id, state, version, updated_by_actor_id, updated_at)
  VALUES
    (NEW.id, NEW.org_id, 'ENABLED', 1, NEW.created_by_actor_id, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_missions_kill_switch_init ON nova_missions;
CREATE TRIGGER nova_missions_kill_switch_init
  AFTER INSERT ON nova_missions
  FOR EACH ROW EXECUTE FUNCTION initialize_nova_mission_kill_switch();

CREATE OR REPLACE FUNCTION enforce_nova_mission_kill_switch_update()
RETURNS TRIGGER AS $$
DECLARE
  mission_org_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT org_id INTO mission_org_id FROM nova_missions WHERE id = NEW.mission_id;
    IF NOT FOUND OR mission_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Nova mission kill switch must match mission organization';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.mission_id IS DISTINCT FROM OLD.mission_id
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Nova mission kill-switch identity is immutable and version must increase exactly once';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_mission_kill_switch_guard ON nova_mission_kill_switches;
CREATE TRIGGER nova_mission_kill_switch_guard
  BEFORE INSERT OR UPDATE ON nova_mission_kill_switches
  FOR EACH ROW EXECUTE FUNCTION enforce_nova_mission_kill_switch_update();

CREATE OR REPLACE FUNCTION validate_nova_mission_mandate_insert()
RETURNS TRIGGER AS $$
DECLARE
  target_mission nova_missions%ROWTYPE;
BEGIN
  SELECT * INTO target_mission
    FROM nova_missions
    WHERE id = NEW.mission_id
    FOR UPDATE;
  IF NOT FOUND OR target_mission.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Nova mission mandate must belong to the same mission organization';
  END IF;
  IF target_mission.state IN ('CLOSING', 'CLOSED') THEN
    RAISE EXCEPTION 'Closing and closed Nova missions cannot receive new authority';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_mission_mandates_insert_guard ON nova_mission_mandates;
CREATE TRIGGER nova_mission_mandates_insert_guard
  BEFORE INSERT ON nova_mission_mandates
  FOR EACH ROW EXECUTE FUNCTION validate_nova_mission_mandate_insert();

CREATE OR REPLACE FUNCTION validate_nova_mission_revocation_insert()
RETURNS TRIGGER AS $$
DECLARE
  target_mandate nova_mission_mandates%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.mandate_id::TEXT, 0));
  SELECT * INTO target_mandate
    FROM nova_mission_mandates
    WHERE id = NEW.mandate_id;
  IF NOT FOUND
    OR target_mandate.mission_id <> NEW.mission_id
    OR target_mandate.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Nova mandate revocation must match the mandate mission and organization';
  END IF;
  IF NEW.revoked_at < target_mandate.issued_at THEN
    RAISE EXCEPTION 'Nova mandate cannot be revoked before it is issued';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_mission_revocations_insert_guard ON nova_mission_mandate_revocations;
CREATE TRIGGER nova_mission_revocations_insert_guard
  BEFORE INSERT ON nova_mission_mandate_revocations
  FOR EACH ROW EXECUTE FUNCTION validate_nova_mission_revocation_insert();

CREATE OR REPLACE FUNCTION validate_nova_mission_approval_insert()
RETURNS TRIGGER AS $$
DECLARE
  target_mandate nova_mission_mandates%ROWTYPE;
BEGIN
  SELECT * INTO target_mandate
    FROM nova_mission_mandates
    WHERE id = NEW.mandate_id;
  IF NOT FOUND
    OR target_mandate.mission_id <> NEW.mission_id
    OR target_mandate.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Nova mission approval must match mandate mission and organization';
  END IF;
  IF NEW.approved_at < target_mandate.issued_at OR NEW.approved_at >= target_mandate.expires_at THEN
    RAISE EXCEPTION 'Nova mission approval must be issued inside its mandate window';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_mission_approvals_insert_guard ON nova_mission_action_approvals;
CREATE TRIGGER nova_mission_approvals_insert_guard
  BEFORE INSERT ON nova_mission_action_approvals
  FOR EACH ROW EXECUTE FUNCTION validate_nova_mission_approval_insert();

CREATE OR REPLACE FUNCTION nova_mission_authority_rank(authority_value VARCHAR)
RETURNS INTEGER AS $$
  SELECT CASE authority_value
    WHEN 'OBSERVE' THEN 0
    WHEN 'CREATE' THEN 1
    WHEN 'PREPARE' THEN 2
    WHEN 'ACT_ONCE' THEN 3
    WHEN 'OPERATE' THEN 4
    ELSE -1
  END;
$$ LANGUAGE sql IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION validate_nova_mission_action_insert()
RETURNS TRIGGER AS $$
DECLARE
  target_mission nova_missions%ROWTYPE;
  target_mandate nova_mission_mandates%ROWTYPE;
  target_policy nova_mission_action_policies%ROWTYPE;
  target_approval nova_mission_action_approvals%ROWTYPE;
  target_kill_switch nova_mission_kill_switches%ROWTYPE;
  used_actions BIGINT;
  used_external_actions BIGINT;
  used_spend_cents NUMERIC;
  is_external BOOLEAN;
BEGIN
  SELECT * INTO target_mission
    FROM nova_missions
    WHERE id = NEW.mission_id
    FOR UPDATE;
  IF NOT FOUND OR target_mission.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Nova mission action must belong to the same mission organization';
  END IF;
  IF target_mission.state <> 'RUNNING' OR target_mission.closeout_hash IS NOT NULL THEN
    RAISE EXCEPTION 'Nova mission actions may be recorded only while the mission is running';
  END IF;

  SELECT * INTO target_policy
    FROM nova_mission_action_policies
    WHERE action_type = NEW.action_type;
  IF NOT FOUND OR target_policy.capability_id <> NEW.capability_id THEN
    RAISE EXCEPTION 'Nova mission action has no matching trusted action policy';
  END IF;
  -- Caller labels never decide effect. The immutable policy does.
  NEW.effect := target_policy.effect;

  IF NEW.mandate_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.mandate_id::TEXT, 0));
    SELECT * INTO target_mandate
      FROM nova_mission_mandates
      WHERE id = NEW.mandate_id;
    IF NOT FOUND
      OR target_mandate.mission_id <> NEW.mission_id
      OR target_mandate.org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Nova mission action mandate must match the mission and organization';
    END IF;
  END IF;

  IF NEW.preflight_decision <> 'ALLOW' THEN
    IF NEW.status <> 'DENIED' OR NEW.denial_code IS NULL THEN
      RAISE EXCEPTION 'Denied Nova mission actions must be terminal DENIED records with a denial code';
    END IF;
    NEW.authority_used := NULL;
    NEW.mandate_hash := NULL;
    NEW.kill_switch_state := 'UNKNOWN';
    NEW.kill_switch_version := NULL;
    RETURN NEW;
  END IF;
  IF NEW.mandate_id IS NULL THEN
    RAISE EXCEPTION 'Allowed Nova mission actions require an immutable mandate';
  END IF;
  IF NEW.status <> 'REQUESTED' OR NEW.denial_code IS NOT NULL
    OR NEW.dispatch_claim_hash IS NOT NULL OR NEW.dispatch_claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Allowed Nova mission actions must begin as an undispatched REQUESTED row';
  END IF;
  NEW.mandate_hash := target_mandate.mandate_hash;
  NEW.authority_used := target_mandate.authority;
  IF nova_mission_authority_rank(target_mandate.authority)
      < nova_mission_authority_rank(target_policy.minimum_authority) THEN
    RAISE EXCEPTION 'Nova mission action authority is below trusted policy minimum';
  END IF;
  IF NOT (target_mission.capability_ids_json @> to_jsonb(ARRAY[NEW.capability_id]::TEXT[]))
    OR NOT (target_mandate.allowed_capability_ids_json @> to_jsonb(ARRAY[NEW.capability_id]::TEXT[]))
    OR NOT (target_mandate.allowed_action_types_json @> to_jsonb(ARRAY[NEW.action_type]::TEXT[])) THEN
    RAISE EXCEPTION 'Nova mission action capability or type is outside mission or mandate scope';
  END IF;
  IF CURRENT_TIMESTAMP < target_mandate.not_before OR CURRENT_TIMESTAMP >= target_mandate.expires_at THEN
    RAISE EXCEPTION 'Nova mission action mandate is outside its active window';
  END IF;
  IF EXISTS (
    SELECT 1 FROM nova_mission_mandate_revocations revocation
      WHERE revocation.mandate_id = target_mandate.id
  ) THEN
    RAISE EXCEPTION 'Revoked Nova mission mandates grant no authority';
  END IF;

  SELECT COUNT(*) INTO used_actions
    FROM nova_mission_actions
    WHERE mandate_id = target_mandate.id AND preflight_decision = 'ALLOW';
  IF used_actions + 1 > target_mandate.max_actions THEN
    RAISE EXCEPTION 'Nova mission mandate action cap is exhausted';
  END IF;

  is_external := NEW.effect IN ('EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL');
  IF NOT is_external THEN
    IF NEW.expected_spend_cents <> 0 THEN
      RAISE EXCEPTION 'Internal Nova mission actions cannot spend externally';
    END IF;
    IF NEW.approval_id IS NOT NULL THEN
      RAISE EXCEPTION 'Internal Nova mission actions cannot consume external approval';
    END IF;
    IF NEW.effect = 'STAGED_EXTERNAL_ACTION' AND NEW.target_reference IS NULL THEN
      RAISE EXCEPTION 'Staged Nova mission actions require an exact target';
    END IF;
    NEW.kill_switch_state := 'UNKNOWN';
    NEW.kill_switch_version := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO target_kill_switch
    FROM nova_mission_kill_switches
    WHERE mission_id = NEW.mission_id
    FOR UPDATE;
  IF NOT FOUND OR target_kill_switch.org_id <> NEW.org_id OR target_kill_switch.state <> 'DISABLED' THEN
    RAISE EXCEPTION 'External Nova mission action requires the authoritative kill switch to be disabled';
  END IF;
  NEW.kill_switch_state := target_kill_switch.state;
  NEW.kill_switch_version := target_kill_switch.version;

  IF NEW.target_reference IS NULL
    OR NOT (target_mandate.allowed_external_action_types_json @> to_jsonb(ARRAY[NEW.action_type]::TEXT[]))
    OR NOT (target_mandate.allowed_external_target_refs_json @> to_jsonb(ARRAY[NEW.target_reference]::TEXT[]))
    OR NEW.currency <> target_mandate.currency THEN
    RAISE EXCEPTION 'External Nova mission action failed its closed-world authority checks';
  END IF;
  IF target_mandate.authority = 'ACT_ONCE'
    AND (NEW.approval_id IS NULL OR NEW.action_envelope_hash IS DISTINCT FROM target_mandate.approved_action_hash) THEN
    RAISE EXCEPTION 'ACT_ONCE requires the exact approved canonical action envelope';
  END IF;
  IF NEW.effect = 'DESTRUCTIVE_EXTERNAL' AND NEW.approval_id IS NULL THEN
    RAISE EXCEPTION 'Destructive external actions always require exact human approval';
  END IF;

  IF NEW.approval_id IS NOT NULL THEN
    SELECT * INTO target_approval
      FROM nova_mission_action_approvals
      WHERE id = NEW.approval_id;
    IF NOT FOUND
      OR target_approval.mission_id <> NEW.mission_id
      OR target_approval.org_id <> NEW.org_id
      OR target_approval.mandate_id <> NEW.mandate_id
      OR target_approval.action_envelope_hash <> NEW.action_envelope_hash
      OR target_approval.approved_by_actor_type <> 'HUMAN'
      OR CURRENT_TIMESTAMP < target_approval.approved_at
      OR CURRENT_TIMESTAMP >= target_approval.expires_at
      OR EXISTS (
        SELECT 1 FROM nova_mission_action_approval_uses approval_use
        WHERE approval_use.approval_id = target_approval.id
      ) THEN
      RAISE EXCEPTION 'Nova mission action approval is invalid, expired, consumed, or bound to another envelope';
    END IF;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(expected_spend_cents), 0)
    INTO used_external_actions, used_spend_cents
    FROM nova_mission_actions
    WHERE mandate_id = target_mandate.id
      AND preflight_decision = 'ALLOW'
      AND effect IN ('EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL');
  IF used_external_actions + 1 > target_mandate.max_external_actions
    OR used_spend_cents + NEW.expected_spend_cents > target_mandate.max_spend_cents THEN
    RAISE EXCEPTION 'Nova mission mandate external action or spend cap is exhausted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_mission_actions_insert_guard ON nova_mission_actions;
CREATE TRIGGER nova_mission_actions_insert_guard
  BEFORE INSERT ON nova_mission_actions
  FOR EACH ROW EXECUTE FUNCTION validate_nova_mission_action_insert();

CREATE OR REPLACE FUNCTION enforce_nova_mission_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.opportunity_card_id IS DISTINCT FROM OLD.opportunity_card_id
    OR NEW.created_by_actor_type IS DISTINCT FROM OLD.created_by_actor_type
    OR NEW.created_by_actor_id IS DISTINCT FROM OLD.created_by_actor_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Nova mission identity and organization are immutable';
  END IF;
  IF OLD.state = 'CLOSED' THEN
    RAISE EXCEPTION 'Closed Nova missions are terminal';
  END IF;
  IF NEW.version <= OLD.version THEN
    RAISE EXCEPTION 'Nova mission version must increase';
  END IF;
  IF NEW.state <> OLD.state AND NOT (
    (OLD.state = 'DRAFT' AND NEW.state IN ('READY', 'CLOSING'))
    OR (OLD.state = 'READY' AND NEW.state IN ('RUNNING', 'CLOSING'))
    OR (OLD.state = 'RUNNING' AND NEW.state IN ('PAUSED', 'CLOSING'))
    OR (OLD.state = 'PAUSED' AND NEW.state IN ('RUNNING', 'CLOSING'))
    OR (OLD.state = 'CLOSING' AND NEW.state = 'CLOSED')
  ) THEN
    RAISE EXCEPTION 'Invalid Nova mission transition from % to %', OLD.state, NEW.state;
  END IF;
  IF NEW.state = 'CLOSED' AND NOT EXISTS (
    SELECT 1
      FROM nova_mission_closeouts closeout
      WHERE closeout.mission_id = NEW.id
        AND closeout.org_id = NEW.org_id
        AND closeout.closeout_hash = NEW.closeout_hash
  ) THEN
    RAISE EXCEPTION 'A Nova mission can close only against its immutable closeout';
  END IF;
  IF NEW.state = 'CLOSED' AND EXISTS (
    SELECT 1 FROM nova_mission_actions action
    WHERE action.mission_id = NEW.id
      AND action.status IN ('REQUESTED', 'APPROVED', 'RUNNING')
  ) THEN
    RAISE EXCEPTION 'A Nova mission cannot close while an action remains non-terminal';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_missions_transition_guard ON nova_missions;
CREATE TRIGGER nova_missions_transition_guard
  BEFORE UPDATE ON nova_missions
  FOR EACH ROW EXECUTE FUNCTION enforce_nova_mission_transition();

CREATE OR REPLACE FUNCTION validate_nova_mission_closeout_insert()
RETURNS TRIGGER AS $$
DECLARE
  target_mission nova_missions%ROWTYPE;
BEGIN
  SELECT * INTO target_mission
    FROM nova_missions
    WHERE id = NEW.mission_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nova mission closeout target does not exist';
  END IF;
  IF target_mission.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Nova mission closeout organization does not match';
  END IF;
  IF target_mission.state <> 'CLOSING' OR target_mission.open_action_count <> 0 OR target_mission.closeout_hash IS NOT NULL THEN
    RAISE EXCEPTION 'Nova mission is not ready for terminal closeout';
  END IF;
  IF EXISTS (
    SELECT 1 FROM nova_mission_actions action
      WHERE action.mission_id = NEW.mission_id
        AND action.status IN ('REQUESTED', 'APPROVED', 'RUNNING')
  ) THEN
    RAISE EXCEPTION 'Nova mission cannot close while an action remains non-terminal';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_mission_closeouts_insert_guard ON nova_mission_closeouts;
CREATE TRIGGER nova_mission_closeouts_insert_guard
  BEFORE INSERT ON nova_mission_closeouts
  FOR EACH ROW EXECUTE FUNCTION validate_nova_mission_closeout_insert();

CREATE OR REPLACE FUNCTION enforce_nova_mission_action_terminal()
RETURNS TRIGGER AS $$
DECLARE
  target_mission nova_missions%ROWTYPE;
  target_mandate nova_mission_mandates%ROWTYPE;
  target_policy nova_mission_action_policies%ROWTYPE;
  target_approval nova_mission_action_approvals%ROWTYPE;
  target_kill_switch nova_mission_kill_switches%ROWTYPE;
  used_actions BIGINT;
  used_external_actions BIGINT;
  used_spend_cents NUMERIC;
  is_external BOOLEAN;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.mission_id IS DISTINCT FROM OLD.mission_id
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.mandate_id IS DISTINCT FROM OLD.mandate_id
    OR NEW.action_type IS DISTINCT FROM OLD.action_type
    OR NEW.capability_id IS DISTINCT FROM OLD.capability_id
    OR NEW.effect IS DISTINCT FROM OLD.effect
    OR NEW.authority_used IS DISTINCT FROM OLD.authority_used
    OR NEW.target_reference IS DISTINCT FROM OLD.target_reference
    OR NEW.expected_spend_cents IS DISTINCT FROM OLD.expected_spend_cents
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
    OR NEW.payload_json IS DISTINCT FROM OLD.payload_json
    OR NEW.payload_canonical_json IS DISTINCT FROM OLD.payload_canonical_json
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.action_envelope_canonical_json IS DISTINCT FROM OLD.action_envelope_canonical_json
    OR NEW.action_envelope_hash IS DISTINCT FROM OLD.action_envelope_hash
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.preflight_decision IS DISTINCT FROM OLD.preflight_decision
    OR NEW.denial_code IS DISTINCT FROM OLD.denial_code
    OR NEW.mandate_hash IS DISTINCT FROM OLD.mandate_hash
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Nova mission action authority and identity are immutable after preflight';
  END IF;
  IF OLD.status IN ('DENIED', 'SUCCEEDED', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Terminal Nova mission actions are immutable';
  END IF;

  IF NOT (
    (OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED', 'CANCELLED'))
    OR (OLD.status = 'APPROVED' AND NEW.status IN ('RUNNING', 'CANCELLED'))
    OR (OLD.status = 'RUNNING' AND NEW.status IN ('SUCCEEDED', 'FAILED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid Nova mission action transition from % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.status IN ('REQUESTED', 'APPROVED', 'RUNNING')
    AND jsonb_array_length(NEW.result_evidence_json) <> 0 THEN
    RAISE EXCEPTION 'Non-terminal Nova mission actions cannot claim result evidence';
  END IF;
  IF NEW.status = 'SUCCEEDED' AND jsonb_array_length(NEW.result_evidence_json) = 0 THEN
    RAISE EXCEPTION 'Successful Nova mission actions require result evidence';
  END IF;
  IF NEW.status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
    AND NEW.result_evidence_json IS DISTINCT FROM OLD.result_evidence_json THEN
    RAISE EXCEPTION 'Nova mission action result evidence may change only at terminal transition';
  END IF;

  IF NEW.status <> 'RUNNING' AND (
    NEW.kill_switch_state IS DISTINCT FROM OLD.kill_switch_state
    OR NEW.kill_switch_version IS DISTINCT FROM OLD.kill_switch_version
    OR NEW.dispatch_claim_hash IS DISTINCT FROM OLD.dispatch_claim_hash
    OR NEW.dispatch_claimed_at IS DISTINCT FROM OLD.dispatch_claimed_at
  ) THEN
    RAISE EXCEPTION 'Dispatch authority fields may change only during the APPROVED to RUNNING claim';
  END IF;

  IF NEW.status = 'RUNNING' THEN
    SELECT * INTO target_mission
      FROM nova_missions
      WHERE id = NEW.mission_id
      FOR UPDATE;
    IF NOT FOUND OR target_mission.org_id <> NEW.org_id
      OR target_mission.state <> 'RUNNING' OR target_mission.closeout_hash IS NOT NULL THEN
      RAISE EXCEPTION 'Nova mission stopped running before dispatch claim';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.mandate_id::TEXT, 0));
    SELECT * INTO target_mandate
      FROM nova_mission_mandates
      WHERE id = NEW.mandate_id;
    IF NOT FOUND
      OR target_mandate.mission_id <> NEW.mission_id
      OR target_mandate.org_id <> NEW.org_id
      OR target_mandate.mandate_hash <> NEW.mandate_hash
      OR target_mandate.authority <> NEW.authority_used THEN
      RAISE EXCEPTION 'Nova mission mandate no longer binds the dispatch claim';
    END IF;
    IF CURRENT_TIMESTAMP < target_mandate.not_before OR CURRENT_TIMESTAMP >= target_mandate.expires_at THEN
      RAISE EXCEPTION 'Nova mission mandate is inactive at dispatch claim';
    END IF;
    IF EXISTS (
      SELECT 1 FROM nova_mission_mandate_revocations revocation
      WHERE revocation.mandate_id = target_mandate.id
    ) THEN
      RAISE EXCEPTION 'Nova mission mandate was revoked before dispatch claim';
    END IF;

    SELECT * INTO target_policy
      FROM nova_mission_action_policies
      WHERE action_type = NEW.action_type;
    IF NOT FOUND
      OR target_policy.capability_id <> NEW.capability_id
      OR target_policy.effect <> NEW.effect
      OR nova_mission_authority_rank(target_mandate.authority)
        < nova_mission_authority_rank(target_policy.minimum_authority)
      OR NOT (target_mission.capability_ids_json @> to_jsonb(ARRAY[NEW.capability_id]::TEXT[]))
      OR NOT (target_mandate.allowed_capability_ids_json @> to_jsonb(ARRAY[NEW.capability_id]::TEXT[]))
      OR NOT (target_mandate.allowed_action_types_json @> to_jsonb(ARRAY[NEW.action_type]::TEXT[])) THEN
      RAISE EXCEPTION 'Trusted action policy, capability, or authority changed before dispatch claim';
    END IF;

    SELECT COUNT(*) INTO used_actions
      FROM nova_mission_actions
      WHERE mandate_id = target_mandate.id AND preflight_decision = 'ALLOW';
    IF used_actions > target_mandate.max_actions THEN
      RAISE EXCEPTION 'Nova mission total action cap is invalid at dispatch claim';
    END IF;

    is_external := NEW.effect IN ('EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL');
    IF is_external THEN
      SELECT * INTO target_kill_switch
        FROM nova_mission_kill_switches
        WHERE mission_id = NEW.mission_id
        FOR UPDATE;
      IF NOT FOUND OR target_kill_switch.org_id <> NEW.org_id OR target_kill_switch.state <> 'DISABLED' THEN
        RAISE EXCEPTION 'Authoritative Nova mission kill switch is closed at dispatch claim';
      END IF;
      NEW.kill_switch_state := target_kill_switch.state;
      NEW.kill_switch_version := target_kill_switch.version;

      IF NEW.target_reference IS NULL
        OR NOT (target_mandate.allowed_external_action_types_json @> to_jsonb(ARRAY[NEW.action_type]::TEXT[]))
        OR NOT (target_mandate.allowed_external_target_refs_json @> to_jsonb(ARRAY[NEW.target_reference]::TEXT[]))
        OR NEW.currency <> target_mandate.currency THEN
        RAISE EXCEPTION 'External Nova mission scope changed before dispatch claim';
      END IF;

      SELECT COUNT(*), COALESCE(SUM(expected_spend_cents), 0)
        INTO used_external_actions, used_spend_cents
        FROM nova_mission_actions
        WHERE mandate_id = target_mandate.id
          AND preflight_decision = 'ALLOW'
          AND effect IN ('EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL');
      IF used_external_actions > target_mandate.max_external_actions
        OR used_spend_cents > target_mandate.max_spend_cents THEN
        RAISE EXCEPTION 'Nova mission external action or spend cap is invalid at dispatch claim';
      END IF;

      IF target_mandate.authority = 'ACT_ONCE'
        AND (NEW.approval_id IS NULL OR NEW.action_envelope_hash <> target_mandate.approved_action_hash) THEN
        RAISE EXCEPTION 'ACT_ONCE dispatch does not bind its exact approved envelope';
      END IF;
      IF NEW.effect = 'DESTRUCTIVE_EXTERNAL' AND NEW.approval_id IS NULL THEN
        RAISE EXCEPTION 'Destructive dispatch requires exact human approval';
      END IF;

      IF NEW.approval_id IS NOT NULL THEN
        SELECT * INTO target_approval
          FROM nova_mission_action_approvals
          WHERE id = NEW.approval_id
          FOR UPDATE;
        IF NOT FOUND
          OR target_approval.mission_id <> NEW.mission_id
          OR target_approval.org_id <> NEW.org_id
          OR target_approval.mandate_id <> NEW.mandate_id
          OR target_approval.action_envelope_hash <> NEW.action_envelope_hash
          OR target_approval.approved_by_actor_type <> 'HUMAN'
          OR CURRENT_TIMESTAMP < target_approval.approved_at
          OR CURRENT_TIMESTAMP >= target_approval.expires_at
          OR EXISTS (
            SELECT 1 FROM nova_mission_action_approval_uses approval_use
            WHERE approval_use.approval_id = target_approval.id
          ) THEN
          RAISE EXCEPTION 'Nova mission approval is invalid, expired, or consumed at dispatch claim';
        END IF;
        INSERT INTO nova_mission_action_approval_uses
          (approval_id, action_id, mandate_id, org_id, used_at)
        VALUES
          (target_approval.id, NEW.id, target_mandate.id, NEW.org_id, CURRENT_TIMESTAMP);
      END IF;

      IF target_mandate.authority = 'ACT_ONCE' THEN
        IF EXISTS (
          SELECT 1 FROM nova_mission_act_once_uses act_once_use
          WHERE act_once_use.mandate_id = target_mandate.id
        ) THEN
          RAISE EXCEPTION 'ACT_ONCE authority was already consumed';
        END IF;
        INSERT INTO nova_mission_act_once_uses (mandate_id, action_id, org_id, used_at)
        VALUES (target_mandate.id, NEW.id, NEW.org_id, CURRENT_TIMESTAMP);
      END IF;
    ELSE
      NEW.kill_switch_state := 'UNKNOWN';
      NEW.kill_switch_version := NULL;
    END IF;

    NEW.dispatch_claimed_at := CURRENT_TIMESTAMP;
    NEW.dispatch_claim_hash := encode(digest(convert_to(
      concat_ws('|', NEW.id::TEXT, NEW.mission_id::TEXT, NEW.mandate_hash,
        NEW.action_envelope_hash, NEW.idempotency_key, COALESCE(NEW.kill_switch_version::TEXT, 'internal'),
        NEW.dispatch_claimed_at::TEXT),
      'UTF8'), 'sha256'), 'hex');
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_mission_actions_terminal_guard ON nova_mission_actions;
CREATE TRIGGER nova_mission_actions_terminal_guard
  BEFORE UPDATE ON nova_mission_actions
  FOR EACH ROW EXECUTE FUNCTION enforce_nova_mission_action_terminal();

CREATE OR REPLACE FUNCTION validate_nova_mission_event_append()
RETURNS TRIGGER AS $$
DECLARE
  prior nova_mission_events%ROWTYPE;
  mission_org_id UUID;
BEGIN
  -- Serialize each mission chain, including concurrent genesis attempts.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.mission_id::text, 0));
  SELECT org_id INTO mission_org_id
    FROM nova_missions
    WHERE id = NEW.mission_id;
  IF NOT FOUND OR mission_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Nova mission event must belong to the same mission organization';
  END IF;
  SELECT * INTO prior
    FROM nova_mission_events
    WHERE mission_id = NEW.mission_id
    ORDER BY sequence DESC
    LIMIT 1;

  IF NOT FOUND THEN
    IF NEW.sequence <> 1 OR NEW.aggregate_version <> 1 OR NEW.previous_hash <> repeat('0', 64) THEN
      RAISE EXCEPTION 'Nova mission event chain must begin at sequence/version 1 with the genesis hash';
    END IF;
  ELSE
    IF NEW.org_id <> prior.org_id THEN
      RAISE EXCEPTION 'Nova mission event organization cannot change inside a chain';
    END IF;
    IF NEW.sequence <> prior.sequence + 1
      OR NEW.aggregate_version <> prior.aggregate_version + 1
      OR NEW.previous_hash <> prior.event_hash
      OR NEW.occurred_at < prior.occurred_at THEN
      RAISE EXCEPTION 'Nova mission event does not continue the current hash chain';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nova_mission_events_chain_guard ON nova_mission_events;
CREATE TRIGGER nova_mission_events_chain_guard
  BEFORE INSERT ON nova_mission_events
  FOR EACH ROW EXECUTE FUNCTION validate_nova_mission_event_append();

COMMIT;
