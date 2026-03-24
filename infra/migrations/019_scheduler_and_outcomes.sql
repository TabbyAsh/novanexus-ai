-- ============================================================================
-- Migration 019: Scheduler Runs + Brief Outcomes
-- Purpose: Persistent logging for the scheduler service (The Heart)
--          and structured outcome tracking for the Daily Brief feedback loop.
-- ============================================================================

-- Scheduler run log — tracks every automated job execution
CREATE TABLE IF NOT EXISTS scheduler_runs (
    id              BIGSERIAL PRIMARY KEY,
    job_name        VARCHAR(100) NOT NULL,
    status          VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failure', 'alert', 'skipped')),
    duration_ms     INTEGER,
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_job_name ON scheduler_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_created_at ON scheduler_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_status ON scheduler_runs(status);

-- Brief delivery log — tracks each brief delivery event
CREATE TABLE IF NOT EXISTS brief_deliveries (
    id              BIGSERIAL PRIMARY KEY,
    brief_date      DATE NOT NULL,
    signal_count    INTEGER NOT NULL DEFAULT 0,
    priority_count  INTEGER NOT NULL DEFAULT 0,
    supporting_count INTEGER NOT NULL DEFAULT 0,
    regime          VARCHAR(50),
    recipient_count INTEGER NOT NULL DEFAULT 0,
    sent_count      INTEGER NOT NULL DEFAULT 0,
    failed_count    INTEGER NOT NULL DEFAULT 0,
    brief_json_path VARCHAR(500),
    generated_at    TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brief_deliveries_date ON brief_deliveries(brief_date DESC);

-- Brief outcomes — tracks what happened to each setup after the brief was sent
CREATE TABLE IF NOT EXISTS brief_outcomes (
    id              BIGSERIAL PRIMARY KEY,
    brief_date      DATE NOT NULL,
    symbol          VARCHAR(10) NOT NULL,
    setup_type      VARCHAR(50),
    confidence      SMALLINT,
    tier            VARCHAR(10),
    entry_price     NUMERIC(12,4),
    stop_price      NUMERIC(12,4),
    target1_price   NUMERIC(12,4),
    target2_price   NUMERIC(12,4),
    outcome_status  VARCHAR(20) NOT NULL CHECK (outcome_status IN (
        'HIT_T1', 'HIT_T2', 'STOPPED_OUT', 'ACTIVE', 'NO_TRIGGER', 'NO_QUOTE', 'NO_ENTRY'
    )),
    current_price   NUMERIC(12,4),
    pnl_percent     NUMERIC(8,2),
    detail          TEXT,
    evaluated_at    TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brief_outcomes_date ON brief_outcomes(brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_brief_outcomes_symbol ON brief_outcomes(symbol);
CREATE INDEX IF NOT EXISTS idx_brief_outcomes_status ON brief_outcomes(outcome_status);

-- Calibration metrics — aggregated accuracy tracking per setup type
CREATE TABLE IF NOT EXISTS calibration_metrics (
    id              BIGSERIAL PRIMARY KEY,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    setup_type      VARCHAR(50) NOT NULL,
    total_setups    INTEGER NOT NULL DEFAULT 0,
    triggered       INTEGER NOT NULL DEFAULT 0,
    hit_t1          INTEGER NOT NULL DEFAULT 0,
    hit_t2          INTEGER NOT NULL DEFAULT 0,
    stopped_out     INTEGER NOT NULL DEFAULT 0,
    win_rate        NUMERIC(5,2),
    avg_pnl_percent NUMERIC(8,2),
    brier_score     NUMERIC(8,4),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(period_start, period_end, setup_type)
);

CREATE INDEX IF NOT EXISTS idx_calibration_period ON calibration_metrics(period_start DESC, period_end DESC);

-- Service health snapshots — periodic health check results
CREATE TABLE IF NOT EXISTS service_health_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    service_name    VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'unhealthy', 'unreachable')),
    response_time_ms INTEGER,
    status_code     SMALLINT,
    error           TEXT,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_snapshots_service ON service_health_snapshots(service_name, checked_at DESC);

-- Partitioning hint: For high-volume tables, consider range partitioning by created_at in future.
