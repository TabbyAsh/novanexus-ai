-- ============================================
-- Nova Enterprises - Universal Decision Cards + Mode Control + Calibration
-- Migration: 014_universal_cards_and_modes
-- ============================================

-- Phase 4: Add domain field to decision cards for multi-sector support
ALTER TABLE decision_cards ADD COLUMN IF NOT EXISTS domain VARCHAR(20) DEFAULT 'STOCKS';
-- domain: STOCKS | MARKETPLACE | DROPSHIP | SOCIAL | OPS

CREATE INDEX IF NOT EXISTS idx_decision_cards_domain ON decision_cards(domain);

-- Phase 5: Per-sector operational mode control
CREATE TABLE IF NOT EXISTS system_modes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    sector VARCHAR(30) NOT NULL,  -- 'stocks', 'marketplace', 'flipper', 'dropship', 'social'
    mode VARCHAR(20) NOT NULL DEFAULT 'RECOMMEND'
      CHECK (mode IN ('RECOMMEND', 'ASSIST', 'AUTOMATE')),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, sector)
);

-- Phase 5: Calibration records (confidence vs actual outcome)
CREATE TABLE IF NOT EXISTS calibration_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    domain VARCHAR(20) NOT NULL DEFAULT 'STOCKS',
    predicted_confidence DECIMAL(5,4) NOT NULL,  -- 0.0000 - 1.0000
    actual_outcome BOOLEAN NOT NULL,              -- true = correct prediction
    decision_card_id UUID REFERENCES decision_cards(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calibration_user ON calibration_records(user_id);
CREATE INDEX IF NOT EXISTS idx_calibration_domain ON calibration_records(domain);
