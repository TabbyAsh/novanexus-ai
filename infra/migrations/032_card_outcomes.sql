-- 032: THE DECISION CARD OUTCOME LOOP (Rebuild Phase 1 — the trunk).
-- A card that gives advice and never learns if it was right is a faucet, not
-- a loop. Every intake card now persists with an id; the person can later mark
-- what happened; and Nova builds a real, per-domain track record. This is the
-- loop the whole company thesis rests on: "decisions today differ from 30 days
-- ago, traceably."

CREATE TABLE IF NOT EXISTS intake_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    visitor_id VARCHAR(64),                 -- anonymous continuity (localStorage)
    context TEXT NOT NULL DEFAULT '',
    haves TEXT[] NOT NULL DEFAULT '{}',
    wants TEXT[] NOT NULL DEFAULT '{}',
    regime VARCHAR(12),                     -- EXPLOITATION | EXPLORATION
    domain VARCHAR(24),                     -- collections | pricing | skill | community | knowledge | general
    provider VARCHAR(40),                   -- which mind wrote it (or 'deterministic')
    content TEXT NOT NULL,
    -- the outcome, filled later — the second half of the loop
    outcome VARCHAR(12) CHECK (outcome IN ('worked', 'partial', 'failed')),
    outcome_note TEXT,
    outcome_value NUMERIC,                  -- $ realized, if any
    outcome_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intake_cards_visitor ON intake_cards(visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_cards_user ON intake_cards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_cards_domain ON intake_cards(domain, outcome);
