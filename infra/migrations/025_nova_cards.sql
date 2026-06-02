-- ============================================
-- Nova Enterprises — The Universal Decision Card (Nova's Kernel)
-- Migration: 025_nova_cards
-- Doctrine: NVX-DOCTRINE-001 Sprint Zero, Task T2.
--
-- This is the canonical table for the universal DecisionCard contract
-- defined in libs/shared/src/types.ts (interface DecisionCard).
--
-- NOTE: A legacy `decision_cards` table (migration 007, stock-specific) and a
-- `nexus_decision_cards` table (migration 023) already exist and are in active
-- use. Per Technical Law 06 ("Do Not Rebuild What Works") and Law 05 ("The
-- Schema is the Contract"), we DO NOT repurpose or break those tables. The
-- universal kernel lives here, in `nova_cards`, mapping every field of the
-- DecisionCard schema to a column.
-- ============================================

CREATE TABLE IF NOT EXISTS nova_cards (
    -- Identity
    id            VARCHAR(26) PRIMARY KEY,            -- ulid() — sortable unique ID
    version       INTEGER     NOT NULL DEFAULT 1,     -- increments on each update
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Classification
    card_type     VARCHAR(20) NOT NULL
        CHECK (card_type IN ('TRADE', 'FLIP', 'PRICING', 'CONTENT', 'OPS', 'LIFE')),
    user_id       UUID        REFERENCES users(id) ON DELETE CASCADE,  -- NULL allowed for public/demo cards
    session_id    VARCHAR(64) NOT NULL DEFAULT '',

    -- The five core sections — stored as JSONB, validated by the shared schema
    observation     JSONB NOT NULL,   -- { source, raw_input, context, timestamp }
    analysis        JSONB NOT NULL,   -- { confidence, reasoning[], data_used[], missing[], warnings[] }
    recommendation  JSONB NOT NULL,   -- { action, summary, details, risk_level }
    metrics         JSONB,            -- TradeMetrics | FlipMetrics | PricingMetrics | ContentMetrics | null
    action_steps    JSONB NOT NULL DEFAULT '[]'::jsonb,
    governance      JSONB NOT NULL,   -- { mode, approved_by, approved_at, executed_at, kill_switch }
    outcome         JSONB NOT NULL,   -- { status, result, actual_vs_expected, lesson, logged_at }

    -- Event chain — links to the append-only event log (libs/eventing)
    event_hash    TEXT NOT NULL DEFAULT '',

    -- ---- Denormalized, generated columns for fast/honest querying ----
    -- These are derived from the JSONB above; they never drift because they
    -- are GENERATED ALWAYS. NULL confidence stays NULL (no fake numbers).
    confidence      NUMERIC GENERATED ALWAYS AS ((analysis->>'confidence')::NUMERIC) STORED,
    rec_action      VARCHAR(20) GENERATED ALWAYS AS (recommendation->>'action') STORED,
    risk_level      VARCHAR(10) GENERATED ALWAYS AS (recommendation->>'risk_level') STORED,
    governance_mode VARCHAR(20) GENERATED ALWAYS AS (governance->>'mode') STORED,
    outcome_status  VARCHAR(20) GENERATED ALWAYS AS (outcome->>'status') STORED
);

-- Indexes for the common access patterns
CREATE INDEX IF NOT EXISTS idx_nova_cards_user        ON nova_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_nova_cards_type        ON nova_cards(card_type);
CREATE INDEX IF NOT EXISTS idx_nova_cards_created     ON nova_cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nova_cards_confidence  ON nova_cards(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_nova_cards_action      ON nova_cards(rec_action);
CREATE INDEX IF NOT EXISTS idx_nova_cards_gov_mode    ON nova_cards(governance_mode);
CREATE INDEX IF NOT EXISTS idx_nova_cards_outcome     ON nova_cards(outcome_status);
-- Composite for the most common dashboard query: a user's cards of a type, newest first
CREATE INDEX IF NOT EXISTS idx_nova_cards_user_type_created ON nova_cards(user_id, card_type, created_at DESC);

-- Keep updated_at fresh (reuses the trigger function created in 001_initial_schema.sql)
DROP TRIGGER IF EXISTS update_nova_cards_updated_at ON nova_cards;
CREATE TRIGGER update_nova_cards_updated_at
  BEFORE UPDATE ON nova_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
