-- 031: EVAL RUNS — the objective gate for recursive self-improvement (Phase 5).
-- Every benchmark run of an agent prompt (incumbent or candidate) is scored
-- and recorded. Promotion of a self-authored prompt requires beating the
-- incumbent here; the record is the proof a change earned its place.

CREATE TABLE IF NOT EXISTS eval_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent VARCHAR(40) NOT NULL,
    prompt_version INT NOT NULL DEFAULT 0,
    suite VARCHAR(60) NOT NULL,
    passed INT NOT NULL DEFAULT 0,
    total INT NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eval_runs_agent ON eval_runs(agent, created_at DESC);
