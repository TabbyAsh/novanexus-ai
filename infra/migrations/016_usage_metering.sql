-- ============================================
-- Nova Enterprises — Usage-Based Metering
-- Migration: 016_usage_metering
-- Doctrine: Price by task/outcome volume, not by "access."
-- ============================================

-- Pricing tiers: usage-based pricing configuration
CREATE TABLE IF NOT EXISTS pricing_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    pricing_model VARCHAR(20) NOT NULL DEFAULT 'USAGE'
      CHECK (pricing_model IN ('FLAT', 'USAGE', 'HYBRID')),
    base_price_cents INTEGER DEFAULT 0,       -- monthly base (0 for pure usage)
    included_units JSONB NOT NULL DEFAULT '{}', -- {"SCAN": 50, "APPRAISE": 100, "AGENT_RUN": 20, ...}
    overage_rates JSONB NOT NULL DEFAULT '{}',  -- {"SCAN": 10, "APPRAISE": 5, ...} cents per unit
    features JSONB DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage meters: per-user cumulative counters per billing period
CREATE TABLE IF NOT EXISTS usage_meters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    meter_type VARCHAR(40) NOT NULL,           -- SCAN, APPRAISE, AGENT_RUN, TRADE, DECISION_CARD
    period_start DATE NOT NULL,                -- billing period start
    period_end DATE NOT NULL,                  -- billing period end
    units_consumed DECIMAL(12,2) DEFAULT 0,
    units_included DECIMAL(12,2) DEFAULT 0,    -- from tier
    overage_units DECIMAL(12,2) DEFAULT 0,
    overage_cost_cents INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, meter_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_meters_user ON usage_meters(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_meters_period ON usage_meters(period_start, period_end);

-- Usage events: append-only log of every billable action
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    event_type VARCHAR(40) NOT NULL,           -- matches meter_type
    units DECIMAL(8,2) NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}',               -- context: agent_run_id, symbol, query, etc.
    idempotency_key VARCHAR(120),              -- prevent double-counting
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_events_idempotency
  ON usage_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Extend entitlements with usage-based pricing
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(20) DEFAULT 'FLAT'
  CHECK (pricing_model IN ('FLAT', 'USAGE', 'HYBRID'));
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS usage_tier_id UUID REFERENCES pricing_tiers(id);

-- Seed: default pricing tiers
INSERT INTO pricing_tiers (slug, name, pricing_model, base_price_cents, included_units, overage_rates, sort_order)
VALUES
  ('starter', 'Starter', 'USAGE', 0,
   '{"SCAN": 10, "APPRAISE": 20, "AGENT_RUN": 5, "TRADE": 10, "DECISION_CARD": 10}',
   '{"SCAN": 25, "APPRAISE": 10, "AGENT_RUN": 50, "TRADE": 15, "DECISION_CARD": 15}',
   1),
  ('growth', 'Growth', 'HYBRID', 4900,
   '{"SCAN": 100, "APPRAISE": 500, "AGENT_RUN": 50, "TRADE": 100, "DECISION_CARD": 100}',
   '{"SCAN": 15, "APPRAISE": 5, "AGENT_RUN": 30, "TRADE": 10, "DECISION_CARD": 10}',
   2),
  ('tycoon', 'Tycoon', 'HYBRID', 9900,
   '{"SCAN": -1, "APPRAISE": -1, "AGENT_RUN": -1, "TRADE": -1, "DECISION_CARD": -1}',
   '{"SCAN": 0, "APPRAISE": 0, "AGENT_RUN": 0, "TRADE": 0, "DECISION_CARD": 0}',
   3),
  ('founding', 'Founding Member', 'HYBRID', 9900,
   '{"SCAN": -1, "APPRAISE": -1, "AGENT_RUN": -1, "TRADE": -1, "DECISION_CARD": -1}',
   '{"SCAN": 0, "APPRAISE": 0, "AGENT_RUN": 0, "TRADE": 0, "DECISION_CARD": 0}',
   0)
ON CONFLICT (slug) DO NOTHING;
