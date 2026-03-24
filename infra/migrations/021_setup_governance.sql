-- ============================================================================
-- Migration 021: Setup Type Governance
-- Purpose: Track eligibility state per setup type (eligible/watch/quarantine).
--          The Brain's quality control layer — prunes signal quality over time.
--          Fails closed: unknown setup types default to 'watch', not 'eligible'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS setup_governance (
    id              BIGSERIAL PRIMARY KEY,
    setup_type      VARCHAR(50) NOT NULL UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'watch' CHECK (status IN ('eligible', 'watch', 'quarantine')),
    reason          TEXT,
    total_setups    INTEGER NOT NULL DEFAULT 0,
    triggered       INTEGER NOT NULL DEFAULT 0,
    hit_t1          INTEGER NOT NULL DEFAULT 0,
    hit_t2          INTEGER NOT NULL DEFAULT 0,
    stopped_out     INTEGER NOT NULL DEFAULT 0,
    win_rate        NUMERIC(5,2),
    avg_pnl         NUMERIC(8,2),
    auto_status     VARCHAR(20) CHECK (auto_status IN ('eligible', 'watch', 'quarantine')),
    manual_override BOOLEAN NOT NULL DEFAULT false,
    changed_by      VARCHAR(100),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_setup_governance_status ON setup_governance(status);
CREATE INDEX IF NOT EXISTS idx_setup_governance_type ON setup_governance(setup_type);
