-- ============================================
-- UDM v2 Schema Migration
-- Universal Decision Matrix + 3-Tier Wallet
-- ============================================

-- Domain enum for universal decision matrix
DO $$ BEGIN
  CREATE TYPE udm_domain AS ENUM ('stocks', 'marketplace', 'dropship', 'shopping');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tier enum
DO $$ BEGIN
  CREATE TYPE udm_tier AS ENUM ('clarity', 'foresight', 'autonomy');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Run status enum
DO $$ BEGIN
  CREATE TYPE udm_run_status AS ENUM ('DRAFT', 'QUOTED', 'CONFIRMED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Execution mode enum
DO $$ BEGIN
  CREATE TYPE udm_exec_mode AS ENUM ('paper', 'live');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Ledger reason enum
DO $$ BEGIN
  CREATE TYPE udm_ledger_reason AS ENUM (
    'signup_bonus', 'monthly_grant', 'purchase', 'refund',
    'confirm_clarity', 'confirm_foresight', 'confirm_autonomy',
    'admin_adjustment'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 3-Tier Wallets (replaces single-balance card_wallets)
-- ============================================
CREATE TABLE IF NOT EXISTS udm_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    balance_clarity INTEGER NOT NULL DEFAULT 3,
    balance_foresight INTEGER NOT NULL DEFAULT 1,
    balance_autonomy INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_udm_wallets_user_id ON udm_wallets(user_id);

-- ============================================
-- UDM Ledger (tracks all tier transactions)
-- ============================================
CREATE TABLE IF NOT EXISTS udm_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_tier udm_tier NOT NULL,
    delta_int INTEGER NOT NULL,
    reason udm_ledger_reason NOT NULL,
    metadata_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_udm_ledger_user_id ON udm_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_udm_ledger_tier ON udm_ledger(card_tier);
CREATE INDEX IF NOT EXISTS idx_udm_ledger_created_at ON udm_ledger(created_at DESC);

-- ============================================
-- Decision Runs (universal across domains)
-- ============================================
CREATE TABLE IF NOT EXISTS udm_decision_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain udm_domain NOT NULL,
    target_id VARCHAR(100) NOT NULL,  -- symbol for stocks, listing_id for marketplace, etc.
    tier udm_tier NOT NULL,
    
    -- Immutable snapshot (captured at apply time)
    snapshot_json JSONB NOT NULL,
    
    -- Preview (free to view)
    decision_preview_json JSONB,
    
    -- Final decision (after quote with knobs)
    decision_final_json JSONB,
    
    -- Simulation data (tier2+)
    sim_json JSONB,
    
    -- Actionability metrics
    actionability_json JSONB,
    
    -- Status tracking
    status udm_run_status NOT NULL DEFAULT 'DRAFT',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    quoted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    
    -- Latest quote ID for confirm validation
    latest_quote_id UUID
);

CREATE INDEX IF NOT EXISTS idx_udm_runs_user_id ON udm_decision_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_udm_runs_domain ON udm_decision_runs(domain);
CREATE INDEX IF NOT EXISTS idx_udm_runs_status ON udm_decision_runs(status);
CREATE INDEX IF NOT EXISTS idx_udm_runs_target ON udm_decision_runs(target_id);
CREATE INDEX IF NOT EXISTS idx_udm_runs_created_at ON udm_decision_runs(created_at DESC);

-- ============================================
-- Executions (tier3 only - actual paper/live trades)
-- ============================================
CREATE TABLE IF NOT EXISTS udm_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain udm_domain NOT NULL,
    decision_run_id UUID NOT NULL REFERENCES udm_decision_runs(id),
    mode udm_exec_mode NOT NULL DEFAULT 'paper',
    
    -- Execution details
    execution_json JSONB NOT NULL,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_udm_executions_user_id ON udm_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_udm_executions_run_id ON udm_executions(decision_run_id);
CREATE INDEX IF NOT EXISTS idx_udm_executions_status ON udm_executions(status);

-- ============================================
-- Outcomes (for calibration)
-- ============================================
CREATE TABLE IF NOT EXISTS udm_outcomes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID NOT NULL REFERENCES udm_executions(id),
    
    -- Realized metrics
    metrics_json JSONB NOT NULL,
    
    -- Timestamps
    captured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_udm_outcomes_execution_id ON udm_outcomes(execution_id);

-- ============================================
-- Strategy Calibration (per domain/strategy/regime)
-- ============================================
CREATE TABLE IF NOT EXISTS udm_strategy_calibration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain udm_domain NOT NULL,
    strategy_id VARCHAR(50) NOT NULL,
    regime VARCHAR(30) NOT NULL DEFAULT 'default',
    
    -- Calibrated weights
    weights_json JSONB NOT NULL DEFAULT '{"winRateAdj": 0, "slippageAdj": 0, "confidenceAdj": 0}',
    
    -- Sample size for confidence
    sample_count INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(domain, strategy_id, regime)
);

CREATE INDEX IF NOT EXISTS idx_udm_calibration_domain ON udm_strategy_calibration(domain);
CREATE INDEX IF NOT EXISTS idx_udm_calibration_strategy ON udm_strategy_calibration(strategy_id);

-- ============================================
-- Daily Drop Cache
-- ============================================
CREATE TABLE IF NOT EXISTS udm_daily_drop (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain udm_domain NOT NULL,
    tier udm_tier NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Cached top 10 results
    results_json JSONB NOT NULL,
    
    -- Computation metadata
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(domain, tier, date)
);

CREATE INDEX IF NOT EXISTS idx_udm_daily_drop_lookup ON udm_daily_drop(domain, tier, date);

-- ============================================
-- Proof Packs (deployment artifacts)
-- ============================================
CREATE TABLE IF NOT EXISTS udm_proof_packs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    git_sha VARCHAR(40) NOT NULL,
    
    -- Pack contents
    pack_json JSONB NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_udm_proof_packs_sha ON udm_proof_packs(git_sha);
CREATE INDEX IF NOT EXISTS idx_udm_proof_packs_created_at ON udm_proof_packs(created_at DESC);
