-- ============================================
-- Nova Enterprises - Sold Comps Cache
-- Migration: 022_sold_comps
-- ============================================
-- Stores scraped sold/completed listing data from public sources.
-- This is the proprietary data layer: every comp we find gets cached here.
-- Over time this becomes the primary pricing data source.

CREATE TABLE IF NOT EXISTS sold_comps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Cache lookup key: MD5 of normalized search query
    query_hash VARCHAR(32) NOT NULL,
    search_query VARCHAR(500) NOT NULL,

    -- Comp data
    item_title VARCHAR(500) NOT NULL,
    sold_price DECIMAL(12,2) NOT NULL,
    condition VARCHAR(50),
    sold_date DATE,

    -- Source tracking
    source VARCHAR(50) NOT NULL DEFAULT 'ebay',  -- ebay, mercari, poshmark, etc
    source_url TEXT,
    category VARCHAR(100),

    -- Metadata
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_json JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast cache lookups: find comps for a query, most recent first
CREATE INDEX IF NOT EXISTS idx_sold_comps_query_hash ON sold_comps(query_hash, scraped_at DESC);

-- Category analysis
CREATE INDEX IF NOT EXISTS idx_sold_comps_category ON sold_comps(category);

-- Source tracking
CREATE INDEX IF NOT EXISTS idx_sold_comps_source ON sold_comps(source, scraped_at DESC);
