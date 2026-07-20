-- 034: THE LEDGER OF NON-ARRIVAL (Manifesto §XXI)
-- Conventional systems record what happened. Nova must also record what did
-- NOT reach the citizen: a provider failed and another route carried the work,
-- a quota expired without interrupting thought, a source was missing and Nova
-- refused to invent it. Append-only, factual, quiet — it lives on the same
-- immutable substrate as everything else. This migration only widens the
-- allowed artifact kinds; the immutability trigger from 028 already covers it.

ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_kind_check;
ALTER TABLE artifacts ADD CONSTRAINT artifacts_kind_check
  CHECK (kind IN ('decision_card', 'mission_report', 'anomaly', 'hypothesis',
                  'outcome', 'correction', 'audit', 'non_arrival'));
