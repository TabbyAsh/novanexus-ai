-- 035: MIND LATTICE v1 (Manifesto §VI, Phase 3)
-- The rebuildable cognitive map: nodes (mind-like fields), typed edges
-- (real relationships), snapshots (trajectories). Everything here is a
-- DERIVED structure — rebuildLattice() reconstructs it from the Vault,
-- the substrate, and the live tables. If these tables are dropped, Nova
-- loses navigation speed, not her life (§VII).

CREATE TABLE IF NOT EXISTS lattice_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(120) NOT NULL UNIQUE,        -- stable handle: 'founder', 'sector:market', 'agent:<uuid>'
    kind VARCHAR(40) NOT NULL,               -- person | intelligence | sector | agent | project | constraint | idea
    label VARCHAR(200) NOT NULL,
    state_json JSONB NOT NULL DEFAULT '{}'::jsonb,   -- the field: activity, beliefs, capabilities, pressures
    confidence REAL NOT NULL DEFAULT 0.5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lattice_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_key VARCHAR(120) NOT NULL,
    to_key VARCHAR(120) NOT NULL,
    relation VARCHAR(60) NOT NULL,           -- watches | wrote_to | blocked_by | works_with | produced | belongs_to
    weight REAL NOT NULL DEFAULT 1,
    evidence VARCHAR(300),                   -- where this edge comes from (a table, a count, a file)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (from_key, to_key, relation)
);

-- Trajectories: a mind is understood by how it is MOVING (§VI).
CREATE TABLE IF NOT EXISTS lattice_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_key VARCHAR(120) NOT NULL,
    state_json JSONB NOT NULL,
    taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lattice_snapshots ON lattice_snapshots(node_key, taken_at DESC);
