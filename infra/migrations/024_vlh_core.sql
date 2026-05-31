-- ============================================================================
-- Migration 024: Value Loop Hub Core
-- Purpose: Persistent layer for the VLH architecture.
--   - Value loop type catalog + templates
--   - User loop enrollments
--   - VLH columns on nexus_opportunities and nexus_decision_cards
--   - Action plans + steps (execution tracking)
--   - DB-backed loop policies (replaces hardcoded ConstitutionEnforcer/RiskEngine)
--   - Governance check records (auditable policy evaluations)
-- ============================================================================

-- ─── Value Loop Type Catalog ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vlh_value_loop_types (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug                        VARCHAR(60)  NOT NULL UNIQUE,
    name                        VARCHAR(100) NOT NULL,
    description                 TEXT,
    capital_required_min_cents  INTEGER      NOT NULL DEFAULT 0,
    capital_required_max_cents  INTEGER,
    time_required_min_hours     NUMERIC(6,2) NOT NULL DEFAULT 0,
    time_required_max_hours     NUMERIC(6,2),
    skill_required              VARCHAR(20)  NOT NULL DEFAULT 'beginner'
        CHECK (skill_required IN ('beginner', 'intermediate', 'advanced')),
    risk_level                  VARCHAR(20)  NOT NULL DEFAULT 'medium'
        CHECK (risk_level IN ('low', 'medium', 'high')),
    speed_to_first_result       VARCHAR(20)  NOT NULL DEFAULT 'medium'
        CHECK (speed_to_first_result IN ('fast', 'medium', 'slow')),
    status                      VARCHAR(20)  NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'deprecated')),
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlh_loop_types_slug   ON vlh_value_loop_types(slug);
CREATE INDEX IF NOT EXISTS idx_vlh_loop_types_status ON vlh_value_loop_types(status);

-- ─── Value Loop Templates (guided execution paths) ──────────────────────────

CREATE TABLE IF NOT EXISTS vlh_value_loop_templates (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    value_loop_type_id   UUID        NOT NULL REFERENCES vlh_value_loop_types(id) ON DELETE CASCADE,
    name                 VARCHAR(150) NOT NULL,
    description          TEXT,
    target_skill_level   VARCHAR(20)  NOT NULL DEFAULT 'beginner'
        CHECK (target_skill_level IN ('beginner', 'intermediate', 'advanced')),
    -- array of { order, title, description, stepType, requiredBeforeExecution }
    default_steps_json   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    required_tools_json  JSONB        NOT NULL DEFAULT '[]'::jsonb,
    success_metrics_json JSONB        NOT NULL DEFAULT '{}'::jsonb,
    risk_warnings_json   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    status               VARCHAR(20)  NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'archived')),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlh_templates_loop_type ON vlh_value_loop_templates(value_loop_type_id);
CREATE INDEX IF NOT EXISTS idx_vlh_templates_status    ON vlh_value_loop_templates(status);

-- ─── User Loop Enrollments ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vlh_user_loop_enrollments (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id              UUID        REFERENCES orgs(id) ON DELETE CASCADE,
    value_loop_type_id  UUID        NOT NULL REFERENCES vlh_value_loop_types(id) ON DELETE CASCADE,
    status              VARCHAR(20) NOT NULL DEFAULT 'exploring'
        CHECK (status IN ('exploring', 'active', 'paused', 'completed', 'abandoned')),
    current_stage       VARCHAR(60),
    reason_selected     TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, value_loop_type_id)
);

CREATE INDEX IF NOT EXISTS idx_vlh_enrollments_user      ON vlh_user_loop_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_vlh_enrollments_loop_type ON vlh_user_loop_enrollments(value_loop_type_id);
CREATE INDEX IF NOT EXISTS idx_vlh_enrollments_status    ON vlh_user_loop_enrollments(status);

-- ─── Extend nexus_opportunities with VLH fields ───────────────────────────────

ALTER TABLE nexus_opportunities
    ADD COLUMN IF NOT EXISTS value_loop_type_id         UUID        REFERENCES vlh_value_loop_types(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS title                       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS description                 TEXT,
    ADD COLUMN IF NOT EXISTS status                      VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'scored', 'selected', 'rejected', 'archived')),
    ADD COLUMN IF NOT EXISTS fit_score                   NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS confidence_score            NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS data_completeness           VARCHAR(20) DEFAULT 'partial'
        CHECK (data_completeness IN ('complete', 'partial', 'insufficient', 'unavailable')),
    ADD COLUMN IF NOT EXISTS estimated_revenue_min_cents INTEGER,
    ADD COLUMN IF NOT EXISTS estimated_revenue_max_cents INTEGER,
    ADD COLUMN IF NOT EXISTS required_capital_cents      INTEGER;

CREATE INDEX IF NOT EXISTS idx_nexus_opps_loop_type ON nexus_opportunities(value_loop_type_id);
CREATE INDEX IF NOT EXISTS idx_nexus_opps_status    ON nexus_opportunities(status);

-- ─── Extend nexus_decision_cards with VLH fields ─────────────────────────────
-- Adds: loop-type link, recommendation enum, data quality signals,
--       human approval tracking, and freeform decision question.

ALTER TABLE nexus_decision_cards
    ADD COLUMN IF NOT EXISTS value_loop_type_id   UUID        REFERENCES vlh_value_loop_types(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS title                VARCHAR(255),
    ADD COLUMN IF NOT EXISTS decision_question    TEXT,
    -- recommendation is the VLH-layer verdict; decision_action retains the domain-level action (BUY/SKIP/etc.)
    ADD COLUMN IF NOT EXISTS recommendation       VARCHAR(30) DEFAULT 'gather_more_data'
        CHECK (recommendation IN ('execute', 'wait', 'pass', 'gather_more_data', 'blocked')),
    ADD COLUMN IF NOT EXISTS reasoning_summary    TEXT,
    ADD COLUMN IF NOT EXISTS risk_score           NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS data_completeness    VARCHAR(20) DEFAULT 'partial'
        CHECK (data_completeness IN ('complete', 'partial', 'insufficient', 'unavailable')),
    ADD COLUMN IF NOT EXISTS truth_state          VARCHAR(20) DEFAULT 'estimated'
        CHECK (truth_state IN ('verified', 'estimated', 'uncertain', 'unavailable')),
    ADD COLUMN IF NOT EXISTS approved_by_user_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_nexus_dc_loop_type      ON nexus_decision_cards(value_loop_type_id);
CREATE INDEX IF NOT EXISTS idx_nexus_dc_recommendation ON nexus_decision_cards(recommendation);
CREATE INDEX IF NOT EXISTS idx_nexus_dc_truth_state    ON nexus_decision_cards(truth_state);

-- ─── Action Plans (generated from approved Decision Cards) ────────────────────

CREATE TABLE IF NOT EXISTS vlh_action_plans (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_card_id      UUID        NOT NULL REFERENCES nexus_decision_cards(id) ON DELETE CASCADE,
    user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id                UUID        REFERENCES orgs(id) ON DELETE CASCADE,
    title                 VARCHAR(255) NOT NULL,
    summary               TEXT,
    status                VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'ready', 'active', 'completed', 'cancelled', 'blocked')),
    estimated_time_hours  NUMERIC(6,2),
    estimated_cost_cents  INTEGER,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlh_action_plans_card   ON vlh_action_plans(decision_card_id);
CREATE INDEX IF NOT EXISTS idx_vlh_action_plans_user   ON vlh_action_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_vlh_action_plans_status ON vlh_action_plans(status);

-- ─── Action Steps ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vlh_action_steps (
    id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_plan_id              UUID        NOT NULL REFERENCES vlh_action_plans(id) ON DELETE CASCADE,
    step_order                  INTEGER     NOT NULL,
    title                       VARCHAR(255) NOT NULL,
    description                 TEXT,
    step_type                   VARCHAR(30) NOT NULL DEFAULT 'research'
        CHECK (step_type IN ('research', 'message', 'purchase', 'listing', 'content', 'analysis', 'wait', 'log', 'review')),
    status                      VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked', 'failed')),
    required_before_execution   BOOLEAN     NOT NULL DEFAULT false,
    expected_output             TEXT,
    completed_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (action_plan_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_vlh_action_steps_plan   ON vlh_action_steps(action_plan_id);
CREATE INDEX IF NOT EXISTS idx_vlh_action_steps_status ON vlh_action_steps(status);

-- ─── Loop Policies (DB-backed; replaces hardcoded ConstitutionEnforcer/RiskEngine) ──

CREATE TABLE IF NOT EXISTS vlh_loop_policies (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- NULL org_id = global policy applied to every workspace
    org_id               UUID        REFERENCES orgs(id) ON DELETE CASCADE,
    name                 VARCHAR(100) NOT NULL,
    policy_type          VARCHAR(40) NOT NULL
        CHECK (policy_type IN (
            'risk_limit', 'data_requirement', 'financial_limit',
            'content_claim', 'execution_safety', 'platform_compliance'
        )),
    -- NULL = applies to all loop types; otherwise a JSON array of slugs
    loop_type_slugs_json JSONB,
    -- machine-readable rules; structure depends on policy_type
    rules_json           JSONB       NOT NULL DEFAULT '{}'::jsonb,
    enforcement_mode     VARCHAR(20) NOT NULL DEFAULT 'warn'
        CHECK (enforcement_mode IN ('inform', 'warn', 'block')),
    status               VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlh_policies_org    ON vlh_loop_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_vlh_policies_type   ON vlh_loop_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_vlh_policies_status ON vlh_loop_policies(status);

-- ─── Governance Checks (auditable policy evaluation records) ──────────────────

CREATE TABLE IF NOT EXISTS vlh_governance_checks (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id              UUID        REFERENCES orgs(id) ON DELETE CASCADE,
    user_id             UUID        REFERENCES users(id) ON DELETE CASCADE,
    entity_type         VARCHAR(40) NOT NULL
        CHECK (entity_type IN ('opportunity', 'decision_card', 'action_plan', 'execution_run')),
    entity_id           UUID        NOT NULL,
    result              VARCHAR(20) NOT NULL
        CHECK (result IN ('allow', 'warn', 'block', 'needs_more_data')),
    summary             TEXT,
    -- array of { policyId, policyName, passed, enforcementMode, reason, value?, threshold? }
    policy_results_json JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlh_gov_checks_entity  ON vlh_governance_checks(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_vlh_gov_checks_user    ON vlh_governance_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_vlh_gov_checks_result  ON vlh_governance_checks(result);
CREATE INDEX IF NOT EXISTS idx_vlh_gov_checks_created ON vlh_governance_checks(created_at DESC);

-- ─── Triggers ─────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS upd_vlh_loop_types_ts     ON vlh_value_loop_types;
DROP TRIGGER IF EXISTS upd_vlh_templates_ts      ON vlh_value_loop_templates;
DROP TRIGGER IF EXISTS upd_vlh_enrollments_ts    ON vlh_user_loop_enrollments;
DROP TRIGGER IF EXISTS upd_vlh_action_plans_ts   ON vlh_action_plans;
DROP TRIGGER IF EXISTS upd_vlh_policies_ts       ON vlh_loop_policies;

CREATE TRIGGER upd_vlh_loop_types_ts
  BEFORE UPDATE ON vlh_value_loop_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER upd_vlh_templates_ts
  BEFORE UPDATE ON vlh_value_loop_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER upd_vlh_enrollments_ts
  BEFORE UPDATE ON vlh_user_loop_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER upd_vlh_action_plans_ts
  BEFORE UPDATE ON vlh_action_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER upd_vlh_policies_ts
  BEFORE UPDATE ON vlh_loop_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Seed: canonical value loop type catalog ──────────────────────────────────

INSERT INTO vlh_value_loop_types
    (slug, name, description,
     capital_required_min_cents, capital_required_max_cents,
     time_required_min_hours, time_required_max_hours,
     skill_required, risk_level, speed_to_first_result, status)
VALUES
  ('marketplace_flipping',
   'Marketplace Flipping',
   'Buy undervalued items locally and resell at a profit through online marketplaces.',
   2000, 50000, 2, 20, 'beginner', 'medium', 'fast', 'active'),

  ('reselling',
   'Reselling',
   'Source products at wholesale or discount prices and resell through online or local channels.',
   10000, 200000, 5, 30, 'beginner', 'medium', 'medium', 'active'),

  ('affiliate_content',
   'Affiliate Content',
   'Create content that earns commission through affiliate links and referral programs.',
   0, 5000, 5, 40, 'beginner', 'low', 'slow', 'active'),

  ('digital_product',
   'Digital Products',
   'Create and sell digital goods: templates, guides, tools, or courses.',
   0, 20000, 10, 100, 'intermediate', 'low', 'slow', 'active'),

  ('service_arbitrage',
   'Service Arbitrage',
   'Package and resell skills or services at a margin through platforms or direct outreach.',
   0, 10000, 5, 20, 'intermediate', 'low', 'fast', 'active'),

  ('paper_trading_education',
   'Paper Trading Education',
   'Learn trading strategies using simulated capital with real market data. No real capital at risk.',
   0, 0, 2, 10, 'beginner', 'low', 'medium', 'active'),

  ('tool_aggregation',
   'Tool Aggregation',
   'Curate, bundle, and resell access to tools with added context or workflow value.',
   5000, 50000, 10, 40, 'intermediate', 'medium', 'slow', 'active')
ON CONFLICT (slug) DO NOTHING;

-- ─── Seed: marketplace_flipping beginner template ─────────────────────────────

INSERT INTO vlh_value_loop_templates
    (value_loop_type_id, name, description, target_skill_level,
     default_steps_json, required_tools_json, success_metrics_json,
     risk_warnings_json, status)
SELECT
    t.id,
    'Beginner Marketplace Flip',
    'A guided path for your first flip: find, evaluate, negotiate, list, sell, and log.',
    'beginner',
    '[
      {"order":1,"title":"Find the item","description":"Locate item on Facebook Marketplace, OfferUp, or Craigslist. Screenshot listing.","stepType":"research","requiredBeforeExecution":true},
      {"order":2,"title":"Run a Decision Card","description":"Enter title, asking price, and condition into the Flip Engine to get a structured verdict.","stepType":"analysis","requiredBeforeExecution":true},
      {"order":3,"title":"Verify condition questions","description":"Message the seller with condition questions from the negotiation script.","stepType":"message","requiredBeforeExecution":true},
      {"order":4,"title":"Negotiate or buy","description":"Execute the suggested offer price or buy at asking if BUY verdict.","stepType":"purchase","requiredBeforeExecution":false},
      {"order":5,"title":"Create listing","description":"List the item using the generated title and description on the target platform.","stepType":"listing","requiredBeforeExecution":false},
      {"order":6,"title":"Log the outcome","description":"After sale (or pass), record the actual sale price, costs, and time spent.","stepType":"log","requiredBeforeExecution":false}
    ]'::jsonb,
    '["Facebook Marketplace","OfferUp","eBay (for comps)"]'::jsonb,
    '{"firstSale":"Complete at least one buy-sell cycle","profitTarget":"Net profit >= $10 on first flip","timeToFirstSale":"< 30 days"}'::jsonb,
    '["Do not spend more than you can afford to lose","Verify item condition in person before purchasing","Understand platform fees before committing to a buy price","Do not buy items you cannot physically inspect if value > $50"]'::jsonb,
    'active'
FROM vlh_value_loop_types t
WHERE t.slug = 'marketplace_flipping'
ON CONFLICT DO NOTHING;

-- ─── Seed: global built-in policies (mirrors hardcoded ConstitutionEnforcer defaults) ───

INSERT INTO vlh_loop_policies
    (org_id, name, policy_type, loop_type_slugs_json, rules_json, enforcement_mode, status)
VALUES
  -- Execution gate: minimum confidence to allow execution
  (NULL,
   'Minimum Confidence to Execute',
   'execution_safety',
   NULL,
   '{"minConfidenceScore": 0.55}'::jsonb,
   'block',
   'active'),

  -- Execution gate: warn if confidence is low but not blocking
  (NULL,
   'Low Confidence Warning',
   'execution_safety',
   NULL,
   '{"minConfidenceScore": 0.35}'::jsonb,
   'warn',
   'active'),

  -- Data requirement: block execution if data is insufficient
  (NULL,
   'Insufficient Data Block',
   'data_requirement',
   NULL,
   '{"minDataCompleteness": "partial"}'::jsonb,
   'block',
   'active'),

  -- Risk limit: warn if risk score is high
  (NULL,
   'High Risk Score Warning',
   'risk_limit',
   NULL,
   '{"maxRiskScore": 0.7}'::jsonb,
   'warn',
   'active'),

  -- Risk limit: block if risk score is critical
  (NULL,
   'Critical Risk Score Block',
   'risk_limit',
   NULL,
   '{"maxRiskScore": 0.85}'::jsonb,
   'block',
   'active'),

  -- Resale-specific: minimum ROI for marketplace flipping
  (NULL,
   'Flip Minimum ROI',
   'risk_limit',
   '["marketplace_flipping", "reselling"]'::jsonb,
   '{"minExpectedRoiPct": 15}'::jsonb,
   'warn',
   'active')

ON CONFLICT DO NOTHING;
