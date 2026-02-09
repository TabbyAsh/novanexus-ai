-- ============================================
-- Phase 4 Gating & Usage Tracking
-- Migration: 009_phase4_gating
-- ============================================

-- Add decision card usage tracking
ALTER TABLE usage_tracking
  ADD COLUMN IF NOT EXISTS decision_cards_count INTEGER DEFAULT 0;

UPDATE usage_tracking
SET decision_cards_count = COALESCE(decision_cards_count, 0);

-- Ensure plan limits include decision card quotas + analytics depth
UPDATE plan_configs
SET limits_json = jsonb_set(
  jsonb_set(
    limits_json,
    '{daily_decision_cards}',
    CASE
      WHEN plan = 'FREE' THEN '3'::jsonb
      WHEN plan = 'LITE' THEN '25'::jsonb
      ELSE '-1'::jsonb
    END,
    true
  ),
  '{strategy_analytics_depth}',
  CASE
    WHEN plan = 'FREE' THEN '0'::jsonb
    ELSE '2'::jsonb
  END,
  true
);

