-- ============================================
-- Nova Enterprises - Nova Hub Lite Tables
-- Migration: 004_nova_hub_lite_tables
-- ============================================

-- Watchlists table
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    symbols JSONB NOT NULL DEFAULT '[]',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watchlists_user_id ON watchlists(user_id);

-- Alerts table for price/score notifications
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('PRICE_ABOVE', 'PRICE_BELOW', 'SCORE_ABOVE', 'RSI_ABOVE', 'RSI_BELOW')),
    threshold DECIMAL(12,4) NOT NULL,
    is_triggered BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_symbol ON alerts(symbol);
CREATE INDEX idx_alerts_active ON alerts(is_active) WHERE is_active = TRUE;

-- Paper trades history
CREATE TABLE IF NOT EXISTS paper_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thesis_id UUID,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    quantity INTEGER NOT NULL,
    entry_price DECIMAL(12,4) NOT NULL,
    exit_price DECIMAL(12,4),
    current_price DECIMAL(12,4),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'STOPPED')),
    pnl DECIMAL(12,4),
    pnl_percent DECIMAL(8,4),
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX idx_paper_trades_user_id ON paper_trades(user_id);
CREATE INDEX idx_paper_trades_status ON paper_trades(status);

-- Thesis cards history
CREATE TABLE IF NOT EXISTS thesis_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    signal VARCHAR(10) NOT NULL CHECK (signal IN ('LONG', 'SHORT')),
    entry_price DECIMAL(12,4) NOT NULL,
    target_price DECIMAL(12,4) NOT NULL,
    stop_loss DECIMAL(12,4) NOT NULL,
    risk_reward_ratio DECIMAL(6,2) NOT NULL,
    confidence DECIMAL(5,2) NOT NULL,
    reasoning JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_thesis_cards_user_id ON thesis_cards(user_id);
CREATE INDEX idx_thesis_cards_symbol ON thesis_cards(symbol);

-- Scanner reports (saved scans)
CREATE TABLE IF NOT EXISTS scanner_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    watchlist_id UUID REFERENCES watchlists(id) ON DELETE SET NULL,
    name VARCHAR(100),
    results JSONB NOT NULL,
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scanner_reports_user_id ON scanner_reports(user_id);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_watchlists_updated_at ON watchlists;
DROP TRIGGER IF EXISTS update_alerts_updated_at ON alerts;
CREATE TRIGGER update_watchlists_updated_at BEFORE UPDATE ON watchlists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
