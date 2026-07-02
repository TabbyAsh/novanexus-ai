-- 027: THE FORGE — persistent world agents (deploy-an-agent E2E)
-- An agent is forged from the Nexus window ("watch TSLA"), runs real scans,
-- REMAINS across visits (canon §I), and its findings flow into the pulse.
-- Bound to a visitor token (no login wall) and/or a user when authenticated.

CREATE TABLE IF NOT EXISTS world_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visitor_id VARCHAR(64),                -- anonymous continuity (localStorage token)
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255),                    -- where Nova prompts YOU first (optional)
    name VARCHAR(60) NOT NULL,             -- e.g. "TSLA Watcher"
    mission VARCHAR(40) NOT NULL DEFAULT 'WATCH_TICKER',
    symbol VARCHAR(12),                    -- the thing it is bound to
    sector VARCHAR(20) NOT NULL DEFAULT 'market',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE', 'PAUSED', 'RETIRED')),
    state_json JSONB NOT NULL DEFAULT '{}'::jsonb,  -- last price, baselines
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_world_agents_visitor ON world_agents(visitor_id);
CREATE INDEX IF NOT EXISTS idx_world_agents_status ON world_agents(status);

CREATE TABLE IF NOT EXISTS world_agent_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES world_agents(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL,             -- MOVE, LEVEL_BREAK, VOLUME, HEARTBEAT
    headline VARCHAR(200) NOT NULL,        -- human-readable, no invented numbers
    detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    significance INT NOT NULL DEFAULT 1,   -- 1 ambient, 2 notable, 3 flare (email)
    notified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_waf_agent ON world_agent_findings(agent_id, created_at DESC);
