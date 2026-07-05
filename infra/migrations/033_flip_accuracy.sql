-- 033: THE FLIP ACCURACY LOOP (Rebuild Phase 2).
-- The Bazaar guessed forever instead of learning. Now every real sale teaches
-- it: the appraisal estimate is compared to what the item ACTUALLY sold for,
-- the error is recorded per category, and future appraisals in that category
-- are shifted by the learned correction. Category-model → earned.

CREATE TABLE IF NOT EXISTS flip_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    visitor_id VARCHAR(64),
    category VARCHAR(40) NOT NULL DEFAULT 'General',
    item_title VARCHAR(255) NOT NULL DEFAULT '',
    estimated_mid NUMERIC NOT NULL,          -- Nova's appraisal at buy time
    actual_price NUMERIC NOT NULL,           -- what it really sold for
    error_ratio NUMERIC NOT NULL,            -- actual / estimated (1.0 = perfect)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flip_sales_category ON flip_sales(category, created_at DESC);
