-- ============================================================================
-- Migration 020: Command Actions Audit Trail
-- Purpose: Every manual action taken through the Command Center is logged.
--          This is the Spine's governance audit layer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS command_actions (
    id              BIGSERIAL PRIMARY KEY,
    actor_id        VARCHAR(100) NOT NULL,
    action_type     VARCHAR(50) NOT NULL,
    target          VARCHAR(100),
    result          VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure', 'pending', 'rejected')),
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_actions_actor ON command_actions(actor_id);
CREATE INDEX IF NOT EXISTS idx_command_actions_type ON command_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_command_actions_created ON command_actions(created_at DESC);

-- Add FOUNDING to entitlements plan constraint if not already there
-- (original migration only had FREE/LITE/PRO)
ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS entitlements_plan_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_plan_check
    CHECK (plan IN ('FREE', 'LITE', 'PRO', 'FOUNDING'));
