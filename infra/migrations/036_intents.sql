-- 036: INTENTS (Manifesto §VIII, §XI, Phase 5)
-- A decision produces an Intent, not direct execution. The Intent states
-- what, why, under what authority, with what limits, what evidence counts
-- as completion, and what halts it. Intelligence proposes; it NEVER flips
-- its own status to authorized — that transition belongs to a person (or a
-- pre-authorized narrow automation rule enforced in code, outside the model).

CREATE TABLE IF NOT EXISTS intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_ref VARCHAR(120),                    -- the decision artifact this came from
    what TEXT NOT NULL,
    why TEXT,
    authority_mode VARCHAR(20) NOT NULL DEFAULT 'recommend'
      CHECK (authority_mode IN ('recommend', 'assist', 'automate')),
    authority_boundary TEXT,                  -- where authority ends, in words
    limits_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    completion_evidence TEXT,                 -- what would prove the action occurred
    halt_conditions TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'proposed'
      CHECK (status IN ('proposed', 'authorized', 'declined', 'executing', 'verified', 'failed', 'halted')),
    decided_by VARCHAR(120),                  -- who moved it past proposed (human:founder, rule:<name>)
    decided_at TIMESTAMPTZ,
    verified_evidence TEXT,                   -- what reality showed afterward
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status, created_at DESC);
