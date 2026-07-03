-- 028: THE SUBSTRATE — Manifesto §4, build-order #1.
-- One canonical blackboard. Artifacts are schema-validated, timestamped,
-- attributed, and IMMUTABLE once written (enforced at the database level —
-- corrections are new artifacts referencing old ones). The score is
-- disposable; the record is permanent. This is also NovaMind's corpus.

CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind VARCHAR(40) NOT NULL
      CHECK (kind IN ('decision_card', 'mission_report', 'anomaly', 'hypothesis', 'outcome', 'correction', 'audit')),
    schema_version INT NOT NULL DEFAULT 1,
    regime VARCHAR(12) CHECK (regime IN ('EXPLOITATION', 'EXPLORATION')),
    author_type VARCHAR(20) NOT NULL CHECK (author_type IN ('agent', 'human', 'system', 'nova')),
    author_id VARCHAR(80) NOT NULL,
    mission_id UUID,
    refs UUID[] NOT NULL DEFAULT '{}',
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_artifacts_kind ON artifacts(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_refs ON artifacts USING GIN(refs);

-- Immutability is physics here, not policy.
CREATE OR REPLACE FUNCTION artifacts_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'artifacts are immutable — write a correction/outcome artifact referencing %', OLD.id;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_artifacts_immutable ON artifacts;
CREATE TRIGGER trg_artifacts_immutable BEFORE UPDATE OR DELETE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION artifacts_immutable();
