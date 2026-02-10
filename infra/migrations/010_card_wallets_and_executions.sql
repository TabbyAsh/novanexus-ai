-- ============================================
-- Card Wallets and Paper Executions (Phase 7.4)
-- Migration: 010_card_wallets_and_executions
-- ============================================

-- Card Wallets: stores user card balance
CREATE TABLE IF NOT EXISTS card_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_wallets_user_id ON card_wallets(user_id);

-- Card Ledger: audit log of card transactions
CREATE TABLE IF NOT EXISTS card_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- GRANT, CONSUME, PURCHASE, REFUND
    amount INTEGER NOT NULL,
    reason VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_ledger_user_id ON card_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_card_ledger_created_at ON card_ledger(created_at DESC);

-- Decision Card Runs: tracks card application lifecycle
CREATE TABLE IF NOT EXISTS decision_card_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_type VARCHAR(20) NOT NULL DEFAULT 'stock',
    symbol VARCHAR(20) NOT NULL,
    strategy_id VARCHAR(50) NOT NULL,
    snapshot_json JSONB NOT NULL,
    sim_json JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, CONFIRMED, EXPIRED, CANCELLED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_decision_card_runs_user_id ON decision_card_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_decision_card_runs_status ON decision_card_runs(status);
CREATE INDEX IF NOT EXISTS idx_decision_card_runs_symbol ON decision_card_runs(symbol);
CREATE INDEX IF NOT EXISTS idx_decision_card_runs_created_at ON decision_card_runs(created_at DESC);

-- Paper Executions: paper trade records created from confirmed cards
CREATE TABLE IF NOT EXISTS paper_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    strategy_id VARCHAR(50) NOT NULL,
    entry_plan_json JSONB NOT NULL,
    exit_plan_json JSONB NOT NULL,
    risk_json JSONB,
    source_decision_card_run_id UUID REFERENCES decision_card_runs(id),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, CLOSED, CANCELLED
    closed_at TIMESTAMPTZ,
    result_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_executions_user_id ON paper_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_paper_executions_symbol ON paper_executions(symbol);
CREATE INDEX IF NOT EXISTS idx_paper_executions_status ON paper_executions(status);
CREATE INDEX IF NOT EXISTS idx_paper_executions_created_at ON paper_executions(created_at DESC);
