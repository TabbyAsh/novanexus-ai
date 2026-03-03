-- ============================================
-- Migration 018: Referral System
-- Tycoon Engine: Viral growth loop
-- Each referral = $10 credit for both parties
-- ============================================

-- Referral codes: one per user
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  code VARCHAR(20) NOT NULL UNIQUE,
  reward_type VARCHAR(20) NOT NULL DEFAULT 'CREDIT',
  reward_value_cents INTEGER NOT NULL DEFAULT 1000,
  uses INTEGER NOT NULL DEFAULT 0,
  earnings_cents INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER DEFAULT NULL, -- NULL = unlimited
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

-- Referral rewards: tracks each redemption
CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES referral_codes(id),
  referred_user_id UUID NOT NULL REFERENCES users(id),
  reward_type VARCHAR(20) NOT NULL DEFAULT 'CREDIT',
  reward_value_cents INTEGER NOT NULL DEFAULT 1000,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_code ON referral_rewards(referral_code_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_unique ON referral_rewards(referral_code_id, referred_user_id);

-- Add run_count to agent_schedules if not exists
ALTER TABLE agent_schedules ADD COLUMN IF NOT EXISTS run_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_schedules ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
