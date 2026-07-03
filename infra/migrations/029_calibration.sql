-- 029: CALIBRATION — Spec v0.2 §2. The difference between an ecosystem
-- and a slot machine that texts you. Every claim a monitor WOULD make is
-- logged as a prediction (including below-threshold ones), resolved against
-- reality when its horizon expires, and scored. A monitor may not attach
-- confidence numbers to alerts until it demonstrates calibration.

CREATE TABLE IF NOT EXISTS monitor_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES world_agents(id) ON DELETE CASCADE,
    signal VARCHAR(80) NOT NULL,             -- e.g. 'move_continuation'
    symbol VARCHAR(12),
    claimed_probability REAL NOT NULL CHECK (claimed_probability > 0 AND claimed_probability < 1),
    baseline_price NUMERIC,
    target_condition JSONB NOT NULL,         -- {direction, threshold_pct}
    horizon_minutes INT NOT NULL,
    resolves_at TIMESTAMPTZ NOT NULL,
    fired_alert BOOLEAN NOT NULL DEFAULT FALSE,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    outcome BOOLEAN,
    resolve_price NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mp_due ON monitor_predictions(resolved, resolves_at);
CREATE INDEX IF NOT EXISTS idx_mp_agent ON monitor_predictions(agent_id, created_at DESC);
