-- ============================================
-- Decisions & Replay (Value Loop #1)
-- Migration: 005_decisions
-- ============================================

-- Decision artifacts
CREATE TABLE IF NOT EXISTS decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'BUY', 'SELL')),
    intent TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'EXECUTED', 'CANCELLED', 'ARCHIVED')),
    source VARCHAR(50) DEFAULT 'MANUAL',
    constraints_json JSONB,
    rationale_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_user_id ON decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_decisions_org_id ON decisions(org_id);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at DESC);

-- Append-only decision events (for replay)
CREATE TABLE IF NOT EXISTS decision_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    seq INTEGER NOT NULL,
    ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_events_decision_seq ON decision_events(decision_id, seq);
CREATE INDEX IF NOT EXISTS idx_decision_events_decision_id ON decision_events(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_events_org_id ON decision_events(org_id);
CREATE INDEX IF NOT EXISTS idx_decision_events_user_id ON decision_events(user_id);
CREATE INDEX IF NOT EXISTS idx_decision_events_ts ON decision_events(ts DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_decisions_updated_at ON decisions;
CREATE TRIGGER update_decisions_updated_at BEFORE UPDATE ON decisions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add decision features to plan configs (LITE/PRO)
UPDATE plan_configs
SET features_json = (
    SELECT jsonb_agg(DISTINCT value)
    FROM (
        SELECT jsonb_array_elements_text(features_json) AS value
        UNION SELECT 'decisions'
        UNION SELECT 'decision_replay'
    ) s
)
WHERE plan IN ('LITE', 'PRO');

-- Backfill entitlements with decision features for paid plans
UPDATE entitlements
SET features_json = (
    SELECT jsonb_agg(DISTINCT value)
    FROM (
        SELECT jsonb_array_elements_text(features_json) AS value
        UNION SELECT 'decisions'
        UNION SELECT 'decision_replay'
    ) s
)
WHERE plan IN ('LITE', 'PRO') AND features_json IS NOT NULL;
