-- ============================================
-- Strategy Performance (Phase 3)
-- Migration: 008_strategy_performance
-- ============================================

CREATE TABLE IF NOT EXISTS strategy_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    strategy_key TEXT NOT NULL UNIQUE,
    strategy_tag VARCHAR(100) NOT NULL,
    strategy_type VARCHAR(100),
    symbol VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'QUARANTINED', 'UNSUPPORTED')),
    fitness_score DECIMAL(6, 2),
    drift_json JSONB,
    metrics_json JSONB,
    evaluated_at TIMESTAMPTZ DEFAULT NOW(),
    quarantined_at TIMESTAMPTZ,
    quarantine_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_perf_tag ON strategy_performance(strategy_tag);
CREATE INDEX IF NOT EXISTS idx_strategy_perf_symbol ON strategy_performance(symbol);
CREATE INDEX IF NOT EXISTS idx_strategy_perf_status ON strategy_performance(status);
CREATE INDEX IF NOT EXISTS idx_strategy_perf_org ON strategy_performance(org_id);
CREATE INDEX IF NOT EXISTS idx_strategy_perf_updated ON strategy_performance(updated_at DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_strategy_performance_updated_at ON strategy_performance;
CREATE TRIGGER update_strategy_performance_updated_at
  BEFORE UPDATE ON strategy_performance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
