-- ============================================
-- Nova Enterprises - Founding Member Plan
-- Migration: 012_founding_plan
-- ============================================

-- Widen CHECK constraints to allow FOUNDING plan type
ALTER TABLE plan_configs DROP CONSTRAINT IF EXISTS plan_configs_plan_check;
ALTER TABLE plan_configs ADD CONSTRAINT plan_configs_plan_check
  CHECK (plan IN ('FREE', 'LITE', 'PRO', 'FOUNDING'));

ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS entitlements_plan_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_plan_check
  CHECK (plan IN ('FREE', 'LITE', 'PRO', 'FOUNDING'));

-- Insert FOUNDING plan config (all limits unlimited, all features)
INSERT INTO plan_configs (plan, display_name, limits_json, features_json) VALUES
('FOUNDING', 'Founding Member', '{
    "daily_journal_entries": -1,
    "daily_backtests": -1,
    "daily_decision_cards": -1,
    "max_watchlists": -1,
    "max_alerts": -1,
    "max_paper_trades": -1,
    "ai_thesis_daily": -1,
    "strategy_analytics_depth": -1,
    "csv_export": true,
    "pdf_reports": true,
    "api_access": true,
    "founding_badge": true,
    "priority_support": true,
    "concierge_onboarding": true,
    "early_access": true
}', '["scanner", "reports", "alerts", "watchlists", "paper_trading", "thesis_cards", "csv_export", "pdf_export", "api_access", "priority_support", "journal_full", "advanced_analytics", "decision_replay", "founding_badge", "concierge_onboarding", "early_access", "flip_pipeline", "deal_cards", "mode_control"]')
ON CONFLICT (plan) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  limits_json = EXCLUDED.limits_json,
  features_json = EXCLUDED.features_json,
  updated_at = NOW();

-- Track founding member seat count
CREATE TABLE IF NOT EXISTS founding_seats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    max_seats INTEGER NOT NULL DEFAULT 50,
    note VARCHAR(255) DEFAULT 'Nova Founding Members — limited seats',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the seat limit (idempotent)
INSERT INTO founding_seats (max_seats, note)
SELECT 50, 'Nova Founding Members — limited seats'
WHERE NOT EXISTS (SELECT 1 FROM founding_seats);
