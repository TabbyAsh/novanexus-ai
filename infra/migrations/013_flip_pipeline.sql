-- ============================================
-- Nova Enterprises - Flip Pipeline
-- Migration: 013_flip_pipeline
-- ============================================

CREATE TABLE IF NOT EXISTS flip_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    org_id UUID REFERENCES orgs(id),

    -- Item info
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    source VARCHAR(100),          -- where acquired (e.g. 'thrift_store', 'garage_sale', 'ebay', 'facebook_marketplace')
    source_url TEXT,

    -- Financials
    purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    repair_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    listing_price DECIMAL(12,2),
    sold_price DECIMAL(12,2),
    shipping_cost DECIMAL(12,2) DEFAULT 0,
    platform_fees DECIMAL(12,2) DEFAULT 0,

    -- Lifecycle: SOURCED -> ACQUIRED -> REPAIRING -> LISTED -> SOLD -> ARCHIVED
    status VARCHAR(20) NOT NULL DEFAULT 'SOURCED'
      CHECK (status IN ('SOURCED', 'ACQUIRED', 'REPAIRING', 'LISTED', 'SOLD', 'ARCHIVED')),

    -- Dates
    acquired_at TIMESTAMPTZ,
    listed_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,

    -- Metadata
    notes TEXT,
    photos_json JSONB DEFAULT '[]'::jsonb,
    appraisal_json JSONB,         -- cached appraisal from product-scraper

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flip_plans_user ON flip_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_flip_plans_status ON flip_plans(status);
