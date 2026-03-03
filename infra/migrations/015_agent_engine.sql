-- ============================================
-- Nova Enterprises — Autonomous Agent Engine
-- Migration: 015_agent_engine
-- Doctrine: Agents that execute tasks end-to-end, with human oversight where required.
-- ============================================

-- Agent definitions: predefined workflow templates
CREATE TABLE IF NOT EXISTS agent_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(80) NOT NULL UNIQUE,
    slug VARCHAR(40) NOT NULL UNIQUE,
    sector VARCHAR(30) NOT NULL,              -- stocks, marketplace, flipper, dropship, ops
    description TEXT,
    steps_template JSONB NOT NULL DEFAULT '[]', -- ordered step descriptors
    trigger_conditions JSONB DEFAULT '{}',     -- auto-trigger rules (cron, event)
    default_params JSONB DEFAULT '{}',
    risk_level VARCHAR(20) DEFAULT 'LOW'
      CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    requires_mode VARCHAR(20) DEFAULT 'RECOMMEND'
      CHECK (requires_mode IN ('RECOMMEND', 'ASSIST', 'AUTOMATE')),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent runs: each execution instance
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    agent_definition_id UUID NOT NULL REFERENCES agent_definitions(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_APPROVAL')),
    params JSONB DEFAULT '{}',
    result_summary JSONB,                     -- final output / outcome envelope
    outcome_value DECIMAL(14,2),              -- monetary value produced (if applicable)
    outcome_type VARCHAR(30),                 -- PROFIT, LOSS, OPPORTUNITY_FOUND, TIME_SAVED, etc.
    steps_completed INTEGER DEFAULT 0,
    steps_total INTEGER DEFAULT 0,
    error_message TEXT,
    governance_mode VARCHAR(20),              -- mode at time of execution
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_definition_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON agent_runs(created_at DESC);

-- Agent steps: individual actions within a run (full audit trail)
CREATE TABLE IF NOT EXISTS agent_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    step_name VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'AWAITING_APPROVAL')),
    input_json JSONB,                         -- what went in
    action VARCHAR(120),                      -- what was done
    output_json JSONB,                        -- what came out
    error_message TEXT,
    duration_ms INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id);

-- Agent schedules: recurring autonomous execution
CREATE TABLE IF NOT EXISTS agent_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    agent_definition_id UUID NOT NULL REFERENCES agent_definitions(id),
    cron_expression VARCHAR(60) NOT NULL,     -- e.g. '0 9 * * 1-5' (weekday 9am)
    params JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, agent_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_schedules_next ON agent_schedules(next_run_at) WHERE enabled = true;

-- Seed: built-in agent definitions
INSERT INTO agent_definitions (name, slug, sector, description, steps_template, risk_level, requires_mode)
VALUES
  ('Scanner Agent', 'scanner-agent', 'stocks',
   'Scans market universe for opportunities, ranks by confidence, generates decision cards for top picks.',
   '[{"name":"scan_universe","action":"screener/scan"},{"name":"rank_signals","action":"rank_by_confidence"},{"name":"generate_cards","action":"create_decision_cards"},{"name":"log_outcome","action":"record_outcome"}]',
   'LOW', 'RECOMMEND'),

  ('Flip Finder Agent', 'flip-finder-agent', 'marketplace',
   'Searches marketplace listings, appraises items by flip margin, creates flip plans for profitable deals.',
   '[{"name":"search_listings","action":"marketplace/search"},{"name":"appraise_batch","action":"marketplace/appraise"},{"name":"rank_flips","action":"rank_by_margin"},{"name":"create_plans","action":"create_flip_plans"},{"name":"log_outcome","action":"record_outcome"}]',
   'LOW', 'RECOMMEND'),

  ('Rebalance Agent', 'rebalance-agent', 'stocks',
   'Checks paper portfolio against current signals, identifies drift, suggests or executes rebalance trades.',
   '[{"name":"fetch_portfolio","action":"alpaca/positions"},{"name":"fetch_signals","action":"screener/scan"},{"name":"compute_drift","action":"compare_positions_vs_signals"},{"name":"generate_orders","action":"create_rebalance_orders"},{"name":"execute_or_recommend","action":"governance_gate"},{"name":"log_outcome","action":"record_outcome"}]',
   'HIGH', 'ASSIST'),

  ('Compliance Agent', 'compliance-agent', 'ops',
   'Audits recent user actions, checks risk limits, flags violations, produces compliance report.',
   '[{"name":"fetch_recent_actions","action":"audit/recent"},{"name":"check_risk_limits","action":"risk/evaluate"},{"name":"flag_violations","action":"compliance/flag"},{"name":"generate_report","action":"compliance/report"},{"name":"log_outcome","action":"record_outcome"}]',
   'LOW', 'RECOMMEND')
ON CONFLICT (slug) DO NOTHING;
