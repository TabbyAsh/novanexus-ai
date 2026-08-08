BEGIN;

CREATE TABLE IF NOT EXISTS economic_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  reference VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  seller TEXT NOT NULL,
  buyer TEXT NOT NULL,
  market TEXT NOT NULL,
  stage VARCHAR(40) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  expected_revenue NUMERIC,
  actual_revenue NUMERIC NOT NULL DEFAULT 0,
  provenance_status VARCHAR(32) NOT NULL DEFAULT 'USER_CONFIRMED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, reference),
  CONSTRAINT economic_trades_actual_revenue_nonnegative CHECK (actual_revenue >= 0)
);

CREATE TABLE IF NOT EXISTS economic_trade_gaps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  blocking BOOLEAN NOT NULL DEFAULT TRUE,
  severity VARCHAR(16) NOT NULL DEFAULT 'HIGH',
  provenance_status VARCHAR(32) NOT NULL DEFAULT 'USER_CONFIRMED',
  blocked_requirement TEXT NOT NULL,
  required_capability VARCHAR(160) NOT NULL,
  required_confidence NUMERIC,
  routes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(trade_id, code),
  CONSTRAINT economic_trade_gaps_status_check
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WAIVED')),
  CONSTRAINT economic_trade_gaps_severity_check
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT economic_trade_gaps_confidence_check
    CHECK (required_confidence IS NULL OR (required_confidence >= 0 AND required_confidence <= 1))
);

CREATE TABLE IF NOT EXISTS economic_trade_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  authority VARCHAR(16) NOT NULL,
  risk_tier VARCHAR(4) NOT NULL,
  idempotency_key VARCHAR(220) NOT NULL UNIQUE,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT economic_trade_actions_status_check
    CHECK (status IN ('QUEUED', 'AWAITING_HUMAN', 'RUNNING', 'EVIDENCE_SUBMITTED', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  CONSTRAINT economic_trade_actions_authority_check
    CHECK (authority IN ('OBSERVE', 'RECOMMEND', 'ASSIST', 'AUTOMATE')),
  CONSTRAINT economic_trade_actions_risk_check
    CHECK (risk_tier IN ('R0', 'R1', 'R2', 'R3', 'R4'))
);

CREATE TABLE IF NOT EXISTS economic_trade_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economic_trade_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  evidence_type VARCHAR(60) NOT NULL,
  provenance_status VARCHAR(32) NOT NULL,
  confidence NUMERIC NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  content_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trade_id, user_id, evidence_type, content_hash),
  CONSTRAINT economic_trade_evidence_type_check
    CHECK (evidence_type IN ('GEOMETRY_MEASUREMENT', 'SURFACE_CONDITION')),
  CONSTRAINT economic_trade_evidence_confidence_check
    CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE IF NOT EXISTS economic_trade_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
  gap_id UUID NOT NULL REFERENCES economic_trade_gaps(id) ON DELETE CASCADE,
  gap_code VARCHAR(80) NOT NULL,
  evidence_id UUID NOT NULL REFERENCES economic_trade_evidence(id) ON DELETE CASCADE,
  evaluator_type VARCHAR(32) NOT NULL,
  criteria_version VARCHAR(80) NOT NULL,
  passed BOOLEAN NOT NULL,
  score NUMERIC NOT NULL,
  findings_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(gap_id, evidence_id, criteria_version),
  CONSTRAINT economic_trade_evaluations_type_check
    CHECK (evaluator_type IN ('DETERMINISTIC', 'INDEPENDENT_SOURCE', 'HUMAN', 'MODEL_ASSISTED')),
  CONSTRAINT economic_trade_evaluations_score_check
    CHECK (score >= 0 AND score <= 1)
);

CREATE INDEX IF NOT EXISTS idx_economic_trades_user_ref
  ON economic_trades(user_id, reference);
CREATE INDEX IF NOT EXISTS idx_economic_trade_gaps_trade_status
  ON economic_trade_gaps(trade_id, status);
CREATE INDEX IF NOT EXISTS idx_economic_trade_actions_trade_created
  ON economic_trade_actions(trade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_economic_trade_events_trade_occurred
  ON economic_trade_events(trade_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_evidence_trade_created
  ON economic_trade_evidence(trade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_evaluations_trade_created
  ON economic_trade_evaluations(trade_id, created_at DESC);

COMMIT;
