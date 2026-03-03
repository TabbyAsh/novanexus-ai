-- ============================================
-- Nova Enterprises — Outcome Ledger
-- Migration: 017_outcome_ledger
-- Doctrine: A user should see measurable ROI within two weeks of adoption.
-- ============================================

-- Outcome events: every measurable result the platform produces
CREATE TABLE IF NOT EXISTS outcome_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    domain VARCHAR(30) NOT NULL,               -- stocks, marketplace, flipper, dropship, ops
    event_type VARCHAR(40) NOT NULL,           -- PROFIT, LOSS, TIME_SAVED, OPPORTUNITY_FOUND, FLIP_PROFIT, RISK_AVOIDED
    value DECIMAL(14,2) NOT NULL DEFAULT 0,    -- monetary or time value
    currency VARCHAR(3) DEFAULT 'USD',
    description TEXT,
    source_type VARCHAR(30),                   -- agent_run, manual, screener, appraiser
    source_id UUID,                            -- reference to agent_run, trade, flip_plan, etc.
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcome_events_user ON outcome_events(user_id);
CREATE INDEX IF NOT EXISTS idx_outcome_events_domain ON outcome_events(domain);
CREATE INDEX IF NOT EXISTS idx_outcome_events_type ON outcome_events(event_type);
CREATE INDEX IF NOT EXISTS idx_outcome_events_created ON outcome_events(created_at DESC);

-- Outcome summaries: materialized per-user rollups
CREATE TABLE IF NOT EXISTS outcome_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    period_type VARCHAR(10) NOT NULL           -- 'weekly', 'monthly'
      CHECK (period_type IN ('weekly', 'monthly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    -- Value metrics
    total_value DECIMAL(14,2) DEFAULT 0,       -- net value produced
    total_profit DECIMAL(14,2) DEFAULT 0,
    total_loss DECIMAL(14,2) DEFAULT 0,
    -- Activity metrics
    total_tasks INTEGER DEFAULT 0,             -- total agent runs + manual actions
    agent_runs INTEGER DEFAULT 0,
    scans_executed INTEGER DEFAULT 0,
    appraisals_executed INTEGER DEFAULT 0,
    trades_executed INTEGER DEFAULT 0,
    -- Quality metrics
    success_rate DECIMAL(5,2) DEFAULT 0,       -- % of profitable outcomes
    avg_confidence DECIMAL(5,2) DEFAULT 0,
    -- Time metrics
    estimated_time_saved_minutes INTEGER DEFAULT 0,
    -- Sector breakdown
    sector_breakdown JSONB DEFAULT '{}',       -- {"stocks": 500, "marketplace": 200, ...}
    -- Computed
    roi_estimate DECIMAL(8,2) DEFAULT 0,       -- (value - cost) / cost * 100
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_outcome_summaries_user ON outcome_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_outcome_summaries_period ON outcome_summaries(period_start DESC);
