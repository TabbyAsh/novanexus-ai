-- ============================================
-- Decision Cards (Phase 2)
-- Migration: 007_decision_cards
-- ============================================

CREATE TABLE IF NOT EXISTS decision_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    strategy_tag VARCHAR(80),
    confidence_score NUMERIC(6,4),
    source_type VARCHAR(30),
    latency_class VARCHAR(30),
    regime VARCHAR(40),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ,
    card_hash TEXT NOT NULL,
    card_json JSONB NOT NULL,
    score_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_cards_symbol ON decision_cards(symbol);
CREATE INDEX IF NOT EXISTS idx_decision_cards_strategy ON decision_cards(strategy_tag);
CREATE INDEX IF NOT EXISTS idx_decision_cards_confidence ON decision_cards(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_decision_cards_source_type ON decision_cards(source_type);
CREATE INDEX IF NOT EXISTS idx_decision_cards_latency ON decision_cards(latency_class);
CREATE INDEX IF NOT EXISTS idx_decision_cards_regime ON decision_cards(regime);
CREATE INDEX IF NOT EXISTS idx_decision_cards_status ON decision_cards(status);
CREATE INDEX IF NOT EXISTS idx_decision_cards_created_at ON decision_cards(created_at DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_decision_cards_updated_at ON decision_cards;
CREATE TRIGGER update_decision_cards_updated_at
  BEFORE UPDATE ON decision_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
