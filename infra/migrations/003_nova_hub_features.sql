-- ============================================
-- Nova Hub Features - Database Schema
-- Migration: 003_nova_hub_features
-- ============================================

-- ============================================
-- Trading Journal
-- ============================================

CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('BUY', 'SELL', 'LONG', 'SHORT')),
    entry_price DECIMAL(18, 8) NOT NULL,
    exit_price DECIMAL(18, 8),
    position_size DECIMAL(18, 8) NOT NULL,
    entry_date TIMESTAMPTZ NOT NULL,
    exit_date TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
    thesis TEXT,
    notes TEXT,
    strategy_tag VARCHAR(100),
    pnl DECIMAL(18, 8),
    pnl_percent DECIMAL(10, 4),
    fees DECIMAL(18, 8) DEFAULT 0,
    paper_trade_id UUID REFERENCES paper_trades(id) ON DELETE SET NULL,
    meta_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_org ON journal_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_symbol ON journal_entries(symbol);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);

-- ============================================
-- Backtesting
-- ============================================

CREATE TABLE IF NOT EXISTS backtest_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    strategy_type VARCHAR(100) NOT NULL,
    strategy_params JSONB NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    initial_capital DECIMAL(18, 2) NOT NULL DEFAULT 100000,
    final_capital DECIMAL(18, 2),
    total_return DECIMAL(10, 4),
    total_return_pct DECIMAL(10, 4),
    max_drawdown DECIMAL(10, 4),
    max_drawdown_pct DECIMAL(10, 4),
    sharpe_ratio DECIMAL(10, 4),
    win_rate DECIMAL(10, 4),
    total_trades INTEGER,
    winning_trades INTEGER,
    losing_trades INTEGER,
    avg_win DECIMAL(18, 8),
    avg_loss DECIMAL(18, 8),
    profit_factor DECIMAL(10, 4),
    trades_json JSONB,
    equity_curve_json JSONB,
    status VARCHAR(20) DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_results_user ON backtest_results(user_id);
CREATE INDEX IF NOT EXISTS idx_backtest_results_org ON backtest_results(org_id);
CREATE INDEX IF NOT EXISTS idx_backtest_results_created ON backtest_results(created_at DESC);

-- ============================================
-- User Alerts
-- ============================================

CREATE TABLE IF NOT EXISTS user_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('PRICE', 'TRADE', 'SYSTEM', 'QUOTA', 'CUSTOM')),
    symbol VARCHAR(20),
    condition VARCHAR(50),
    target_price DECIMAL(18, 8),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    triggered_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    meta_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_alerts_user ON user_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_alerts_active ON user_alerts(is_active, user_id);
CREATE INDEX IF NOT EXISTS idx_user_alerts_unread ON user_alerts(is_read, user_id);

-- ============================================
-- Trade Theses (AI-generated trade plans)
-- ============================================

CREATE TABLE IF NOT EXISTS trade_theses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
    entry_price DECIMAL(18, 8),
    target_price DECIMAL(18, 8),
    stop_loss DECIMAL(18, 8),
    position_size_recommendation DECIMAL(18, 8),
    risk_reward_ratio DECIMAL(10, 4),
    confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
    thesis_text TEXT NOT NULL,
    reasoning_json JSONB,
    market_context_json JSONB,
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_model VARCHAR(100),
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'EXECUTED', 'EXPIRED', 'CANCELLED')),
    executed_trade_id UUID,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_theses_user ON trade_theses(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_theses_status ON trade_theses(status);
CREATE INDEX IF NOT EXISTS idx_trade_theses_symbol ON trade_theses(symbol);

-- ============================================
-- User Portfolios (Virtual Trading)
-- ============================================

CREATE TABLE IF NOT EXISTS user_portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) DEFAULT 'Main Portfolio',
    initial_cash DECIMAL(18, 2) NOT NULL DEFAULT 100000,
    current_cash DECIMAL(18, 2) NOT NULL DEFAULT 100000,
    total_value DECIMAL(18, 2) NOT NULL DEFAULT 100000,
    total_pnl DECIMAL(18, 2) DEFAULT 0,
    total_pnl_pct DECIMAL(10, 4) DEFAULT 0,
    is_default BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_portfolios_user ON user_portfolios(user_id);

-- ============================================
-- Plan Quotas and Usage Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS plan_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan VARCHAR(20) NOT NULL UNIQUE CHECK (plan IN ('FREE', 'LITE', 'PRO')),
    display_name VARCHAR(100) NOT NULL,
    limits_json JSONB NOT NULL,
    features_json JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plan configurations
INSERT INTO plan_configs (plan, display_name, limits_json, features_json) VALUES
('FREE', 'Free Plan', '{
    "daily_journal_entries": 3,
    "daily_backtests": 1,
    "max_watchlists": 1,
    "max_alerts": 5,
    "max_paper_trades": 10,
    "ai_thesis_daily": 0,
    "csv_export": false,
    "pdf_reports": false
}', '["basic_scanner", "watchlist_1", "limited_journal"]'),
('LITE', 'Nova Hub Lite', '{
    "daily_journal_entries": 100,
    "daily_backtests": 10,
    "max_watchlists": 10,
    "max_alerts": 50,
    "max_paper_trades": 100,
    "ai_thesis_daily": 10,
    "csv_export": true,
    "pdf_reports": true
}', '["scanner", "reports", "alerts", "watchlists", "paper_trading", "thesis_cards", "csv_export", "pdf_export", "journal_full"]'),
('PRO', 'Nova Hub Pro', '{
    "daily_journal_entries": -1,
    "daily_backtests": -1,
    "max_watchlists": -1,
    "max_alerts": -1,
    "max_paper_trades": -1,
    "ai_thesis_daily": -1,
    "csv_export": true,
    "pdf_reports": true,
    "api_access": true
}', '["scanner", "reports", "alerts", "watchlists", "paper_trading", "thesis_cards", "csv_export", "pdf_export", "api_access", "priority_support", "journal_full", "advanced_analytics"]')
ON CONFLICT (plan) DO NOTHING;

CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    journal_entries_count INTEGER DEFAULT 0,
    backtests_count INTEGER DEFAULT 0,
    ai_thesis_count INTEGER DEFAULT 0,
    api_calls_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_date ON usage_tracking(user_id, usage_date);

-- ============================================
-- Audit Logs (for billing and admin)
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    details_json JSONB,
    ip VARCHAR(45),
    ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ts ON audit_logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================
-- Entitlements table (if not exists from billing)
-- ============================================

CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    plan VARCHAR(20) DEFAULT 'FREE' CHECK (plan IN ('FREE', 'LITE', 'PRO')),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELED', 'PAST_DUE', 'TRIALING')),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    current_period_end TIMESTAMPTZ,
    features_json JSONB,
    tos_accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_stripe ON entitlements(stripe_customer_id);

-- ============================================
-- User Streaks (gamification)
-- ============================================

CREATE TABLE IF NOT EXISTS user_streaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    journal_streak INTEGER DEFAULT 0,
    last_journal_date DATE,
    longest_streak INTEGER DEFAULT 0,
    total_journal_days INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_journal_entries_updated_at 
    BEFORE UPDATE ON journal_entries 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trade_theses_updated_at 
    BEFORE UPDATE ON trade_theses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_portfolios_updated_at 
    BEFORE UPDATE ON user_portfolios 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plan_configs_updated_at 
    BEFORE UPDATE ON plan_configs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_tracking_updated_at 
    BEFORE UPDATE ON usage_tracking 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_entitlements_updated_at ON entitlements;
CREATE TRIGGER update_entitlements_updated_at 
    BEFORE UPDATE ON entitlements 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
