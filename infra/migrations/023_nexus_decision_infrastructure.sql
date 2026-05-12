-- ============================================
-- Nova Nexus Decision Infrastructure (Phases 1-3)
-- Migration: 023_nexus_decision_infrastructure
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_type VARCHAR(60) NOT NULL DEFAULT 'marketplace_listing',
    source_url TEXT,
    raw_input_json JSONB NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexus_opportunities_org ON nexus_opportunities(org_id);
CREATE INDEX IF NOT EXISTS idx_nexus_opportunities_user ON nexus_opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_nexus_opportunities_observed ON nexus_opportunities(observed_at DESC);

CREATE TABLE IF NOT EXISTS nexus_decision_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES nexus_opportunities(id) ON DELETE CASCADE,
    vertical VARCHAR(40) NOT NULL DEFAULT 'flip_cards',
    decision_action VARCHAR(12) NOT NULL CHECK (decision_action IN ('BUY', 'SELL', 'SKIP', 'WAIT', 'OFFER')),
    confidence_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
    volatility_level VARCHAR(12) NOT NULL DEFAULT 'MEDIUM' CHECK (volatility_level IN ('LOW', 'MEDIUM', 'HIGH')),
    latest_version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'EXECUTING', 'CLOSED', 'ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexus_decision_cards_org ON nexus_decision_cards(org_id);
CREATE INDEX IF NOT EXISTS idx_nexus_decision_cards_user ON nexus_decision_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_nexus_decision_cards_vertical ON nexus_decision_cards(vertical);
CREATE INDEX IF NOT EXISTS idx_nexus_decision_cards_status ON nexus_decision_cards(status);
CREATE INDEX IF NOT EXISTS idx_nexus_decision_cards_created ON nexus_decision_cards(created_at DESC);

CREATE TABLE IF NOT EXISTS nexus_decision_card_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_card_id UUID NOT NULL REFERENCES nexus_decision_cards(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    card_json JSONB NOT NULL,
    assumptions_json JSONB,
    uncertainty_json JSONB,
    financial_json JSONB,
    execution_json JSONB,
    model_tag VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (decision_card_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_nexus_decision_versions_card ON nexus_decision_card_versions(decision_card_id);

CREATE TABLE IF NOT EXISTS nexus_decision_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_card_id UUID NOT NULL REFERENCES nexus_decision_cards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(12) NOT NULL CHECK (action IN ('BUY', 'SELL', 'SKIP', 'WAIT', 'OFFER')),
    offer_price NUMERIC(12,2),
    execution_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'EXECUTED' CHECK (status IN ('PLANNED', 'EXECUTED', 'FAILED', 'CANCELLED')),
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexus_decision_executions_card ON nexus_decision_executions(decision_card_id);
CREATE INDEX IF NOT EXISTS idx_nexus_decision_executions_user ON nexus_decision_executions(user_id);

CREATE TABLE IF NOT EXISTS nexus_decision_outcomes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_card_id UUID NOT NULL REFERENCES nexus_decision_cards(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES nexus_decision_executions(id) ON DELETE SET NULL,
    outcome_status VARCHAR(20) NOT NULL CHECK (outcome_status IN ('PROFIT', 'LOSS', 'BREAKEVEN', 'ABANDONED')),
    realized_sale_price NUMERIC(12,2),
    realized_total_cost NUMERIC(12,2),
    realized_net_profit NUMERIC(12,2),
    realized_hold_days INTEGER,
    notes TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexus_decision_outcomes_card ON nexus_decision_outcomes(decision_card_id);
CREATE INDEX IF NOT EXISTS idx_nexus_decision_outcomes_logged ON nexus_decision_outcomes(logged_at DESC);

CREATE TABLE IF NOT EXISTS nexus_learning_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    decision_card_id UUID NOT NULL REFERENCES nexus_decision_cards(id) ON DELETE CASCADE,
    predicted_json JSONB NOT NULL,
    actual_json JSONB NOT NULL,
    learning_json JSONB NOT NULL,
    calibration_error_pct NUMERIC(8,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexus_learning_card ON nexus_learning_snapshots(decision_card_id);
CREATE INDEX IF NOT EXISTS idx_nexus_learning_org ON nexus_learning_snapshots(org_id);
CREATE INDEX IF NOT EXISTS idx_nexus_learning_created ON nexus_learning_snapshots(created_at DESC);

DROP TRIGGER IF EXISTS update_nexus_decision_cards_updated_at ON nexus_decision_cards;
CREATE TRIGGER update_nexus_decision_cards_updated_at
  BEFORE UPDATE ON nexus_decision_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
