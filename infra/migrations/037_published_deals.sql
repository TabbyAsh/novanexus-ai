-- 037: PUBLISHED DEALS — the local scanner's verified finds, made public.
--
-- eBay 403s datacenter IPs, so the scan can only run from a residential
-- machine. The finds are published here so strangers see real, dated,
-- comps-backed flips without needing to scrape anything themselves.
--
-- Each row is one find. A publish replaces the live set (marked by batch).

CREATE TABLE IF NOT EXISTS published_deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch UUID NOT NULL,                     -- one scan = one batch
    title VARCHAR(200) NOT NULL,
    asking_price NUMERIC NOT NULL,
    resale_median NUMERIC NOT NULL,
    resale_low NUMERIC,
    resale_high NUMERIC,
    comps_count INT NOT NULL,                -- how many RELEVANT sold listings backed it
    shipping NUMERIC NOT NULL,
    net_profit NUMERIC NOT NULL,
    roi_pct INT NOT NULL,
    region VARCHAR(40),
    listing_url TEXT,
    query_used VARCHAR(120),                 -- exactly what was searched on eBay
    scanned_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_published_deals_batch ON published_deals(created_at DESC);
