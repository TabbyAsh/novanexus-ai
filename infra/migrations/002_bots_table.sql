-- ============================================
-- Nova Enterprises - Bots Table Migration
-- Migration: 002_bots_table
-- ============================================

-- Bots registry table
CREATE TABLE IF NOT EXISTS bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_type VARCHAR(20) NOT NULL CHECK (bot_type IN ('tradebot', 'storebot', 'socialbot', 'researchbot', 'opsbot', 'forgebot')),
    instance_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'BUSY', 'ERROR')),
    capabilities_json JSONB NOT NULL DEFAULT '[]',
    permissions_json JSONB NOT NULL DEFAULT '[]',
    last_heartbeat TIMESTAMPTZ,
    metadata_json JSONB DEFAULT '{}',
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (bot_type, instance_id)
);

CREATE INDEX idx_bots_type ON bots(bot_type);
CREATE INDEX idx_bots_status ON bots(status);

-- Task runs table for tracking individual task executions
CREATE TABLE IF NOT EXISTS task_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    result_json JSONB,
    error_message TEXT,
    duration_ms INTEGER
);

CREATE INDEX idx_task_runs_task_id ON task_runs(task_id);
CREATE INDEX idx_task_runs_bot_id ON task_runs(bot_id);
CREATE INDEX idx_task_runs_status ON task_runs(status);

-- Trigger for bots updated_at
CREATE TRIGGER update_bots_updated_at BEFORE UPDATE ON bots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
