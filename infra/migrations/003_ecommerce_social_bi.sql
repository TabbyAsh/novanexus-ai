-- Nova Enterprises: E-Commerce, Social, and Business Intelligence Schema
-- Migration 003

-- Enable required extensions
-- gen_random_uuid() is provided by pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- E-COMMERCE: Products & Inventory
-- ============================================

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    sku VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    brand VARCHAR(100),
    
    -- Pricing
    cost_price DECIMAL(12,2),
    retail_price DECIMAL(12,2) NOT NULL,
    min_price DECIMAL(12,2),
    max_price DECIMAL(12,2),
    current_margin DECIMAL(5,2),
    
    -- Inventory
    quantity_on_hand INTEGER DEFAULT 0,
    quantity_reserved INTEGER DEFAULT 0,
    reorder_point INTEGER DEFAULT 10,
    reorder_quantity INTEGER DEFAULT 50,
    
    -- Sourcing
    supplier_id UUID,
    supplier_sku VARCHAR(100),
    supplier_cost DECIMAL(12,2),
    lead_time_days INTEGER,
    
    -- Marketplace listings
    listed_on JSONB DEFAULT '[]'::jsonb,  -- [{platform, listing_id, url, price}]
    
    -- Analytics
    total_sold INTEGER DEFAULT 0,
    total_revenue DECIMAL(14,2) DEFAULT 0,
    avg_days_to_sell DECIMAL(8,2),
    velocity_score DECIMAL(5,2),  -- Sales velocity rating
    
    -- Status
    status VARCHAR(50) DEFAULT 'DRAFT',  -- DRAFT, ACTIVE, LOW_STOCK, OUT_OF_STOCK, DISCONTINUED
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(org_id, sku)
);

-- Ensure legacy products table has required columns before indexes
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_price DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS current_margin DECIMAL(5,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_on_hand INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_reserved INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 10;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_quantity INTEGER DEFAULT 50;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_sku VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_cost DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS listed_on JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_sold INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(14,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_days_to_sell DECIMAL(8,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS velocity_score DECIMAL(5,2);

CREATE INDEX IF NOT EXISTS idx_products_org_status ON products(org_id, status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(org_id, category);

-- ============================================
-- E-COMMERCE: Suppliers
-- ============================================

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    website VARCHAR(500),
    
    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    
    -- Terms
    payment_terms VARCHAR(100),  -- NET30, NET60, etc.
    min_order_amount DECIMAL(12,2),
    shipping_method VARCHAR(100),
    
    -- Performance
    avg_lead_time_days DECIMAL(5,1),
    on_time_delivery_rate DECIMAL(5,2),
    quality_rating DECIMAL(3,1),
    
    status VARCHAR(50) DEFAULT 'ACTIVE',
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- E-COMMERCE: Orders
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    order_number VARCHAR(50) NOT NULL,
    
    -- Source
    marketplace VARCHAR(50),  -- SHOPIFY, EBAY, AMAZON, DIRECT
    marketplace_order_id VARCHAR(100),
    
    -- Customer
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    shipping_address JSONB,
    
    -- Financials
    subtotal DECIMAL(12,2) NOT NULL,
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    
    -- Costs
    product_cost DECIMAL(12,2),
    shipping_paid DECIMAL(10,2),
    marketplace_fees DECIMAL(10,2),
    profit DECIMAL(12,2),
    profit_margin DECIMAL(5,2),
    
    -- Status
    status VARCHAR(50) DEFAULT 'PENDING',  -- PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED, REFUNDED
    payment_status VARCHAR(50) DEFAULT 'PENDING',
    fulfillment_status VARCHAR(50) DEFAULT 'UNFULFILLED',
    
    -- Shipping
    carrier VARCHAR(50),
    tracking_number VARCHAR(100),
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    
    order_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(org_id, order_number)
);

-- Ensure legacy orders table has required columns before indexes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS marketplace VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS marketplace_order_id VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_cost DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_paid DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS marketplace_fees DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(5,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_orders_org_status ON orders(org_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(org_id, order_date DESC);

-- ============================================
-- E-COMMERCE: Order Items
-- ============================================

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    
    sku VARCHAR(100),
    title VARCHAR(500),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    unit_cost DECIMAL(12,2),
    total_price DECIMAL(12,2) NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- E-COMMERCE: Price History & Optimization
-- ============================================

CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    old_price DECIMAL(12,2),
    new_price DECIMAL(12,2) NOT NULL,
    change_reason VARCHAR(255),  -- MANUAL, ALGORITHM, COMPETITOR, SALE
    
    -- Context at time of change
    competitor_low_price DECIMAL(12,2),
    inventory_level INTEGER,
    sales_velocity DECIMAL(5,2),
    
    changed_by VARCHAR(100),  -- USER or SYSTEM
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    name VARCHAR(255) NOT NULL,
    
    -- Conditions
    applies_to JSONB,  -- {categories: [], skus: [], all: true}
    
    -- Rules
    min_margin_percent DECIMAL(5,2) DEFAULT 20,
    target_margin_percent DECIMAL(5,2) DEFAULT 35,
    max_margin_percent DECIMAL(5,2) DEFAULT 60,
    
    -- Competitor pricing
    match_competitor BOOLEAN DEFAULT false,
    competitor_offset_percent DECIMAL(5,2),  -- -5 means 5% below competitor
    
    -- Dynamic pricing
    increase_price_low_stock BOOLEAN DEFAULT true,
    decrease_price_overstock BOOLEAN DEFAULT true,
    
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SOCIAL: Content Management
-- ============================================

CREATE TABLE IF NOT EXISTS content_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    created_by UUID REFERENCES users(id),
    
    -- Content
    title VARCHAR(500) NOT NULL,
    body TEXT,
    media_urls JSONB DEFAULT '[]'::jsonb,
    hashtags JSONB DEFAULT '[]'::jsonb,
    
    -- Targeting
    target_platforms JSONB DEFAULT '[]'::jsonb,  -- [youtube, twitter, tiktok, instagram, linkedin]
    
    -- Scheduling
    status VARCHAR(50) DEFAULT 'DRAFT',  -- DRAFT, SCHEDULED, PUBLISHING, PUBLISHED, FAILED
    scheduled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    
    -- Publishing results per platform
    publish_results JSONB DEFAULT '{}'::jsonb,  -- {platform: {id, url, status, error}}
    
    -- Content type
    content_type VARCHAR(50) DEFAULT 'POST',  -- POST, VIDEO, STORY, REEL, THREAD
    
    -- AI assistance
    ai_generated BOOLEAN DEFAULT false,
    ai_prompt TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_posts_org_status ON content_posts(org_id, status);
CREATE INDEX IF NOT EXISTS idx_content_posts_scheduled ON content_posts(scheduled_at) WHERE status = 'SCHEDULED';

-- ============================================
-- SOCIAL: Analytics
-- ============================================

CREATE TABLE IF NOT EXISTS social_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    post_id UUID REFERENCES content_posts(id),
    
    platform VARCHAR(50) NOT NULL,
    platform_post_id VARCHAR(255),
    
    -- Metrics
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    
    -- Engagement
    engagement_rate DECIMAL(5,2),
    reach INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    
    -- Audience
    new_followers INTEGER DEFAULT 0,
    
    -- Calculated
    cost_per_engagement DECIMAL(10,4),
    
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(post_id, platform, recorded_at)
);

CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    
    platform VARCHAR(50) NOT NULL,  -- youtube, twitter, tiktok, instagram, linkedin
    account_id VARCHAR(255) NOT NULL,
    account_name VARCHAR(255),
    account_url VARCHAR(500),
    
    -- OAuth tokens (encrypted in production)
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    
    -- Account stats
    followers INTEGER DEFAULT 0,
    following INTEGER DEFAULT 0,
    total_posts INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(org_id, platform, account_id)
);

-- ============================================
-- TRADING: Enhanced Journal & Analytics
-- ============================================

CREATE TABLE IF NOT EXISTS trade_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Trade details
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,  -- BUY, SELL
    quantity DECIMAL(18,8) NOT NULL,
    entry_price DECIMAL(18,8) NOT NULL,
    exit_price DECIMAL(18,8),
    
    -- Execution
    broker VARCHAR(50),  -- ALPACA, PAPER
    order_id VARCHAR(100),
    
    -- P&L
    realized_pnl DECIMAL(18,2),
    realized_pnl_percent DECIMAL(8,2),
    fees DECIMAL(10,2) DEFAULT 0,
    
    -- Analysis
    thesis_id UUID,
    setup_type VARCHAR(100),  -- BREAKOUT, REVERSAL, MOMENTUM, etc.
    timeframe VARCHAR(20),
    
    -- Notes
    entry_notes TEXT,
    exit_notes TEXT,
    lessons_learned TEXT,
    
    -- Tags
    tags JSONB DEFAULT '[]'::jsonb,
    
    -- Timestamps
    entered_at TIMESTAMPTZ,
    exited_at TIMESTAMPTZ,
    
    status VARCHAR(50) DEFAULT 'OPEN',  -- OPEN, CLOSED, CANCELLED
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_journal_user ON trade_journal(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_journal_symbol ON trade_journal(symbol, entered_at);

-- ============================================
-- BUSINESS INTELLIGENCE: Financial Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    
    -- Classification
    type VARCHAR(50) NOT NULL,  -- REVENUE, EXPENSE, TRANSFER
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    
    -- Details
    description VARCHAR(500),
    amount DECIMAL(14,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Source
    source VARCHAR(50),  -- TRADING, ECOMMERCE, SOCIAL, MANUAL
    source_id UUID,  -- Reference to order_id, trade_id, etc.
    
    -- For reconciliation
    external_ref VARCHAR(255),
    
    transaction_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_trans_org_date ON financial_transactions(org_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_financial_trans_category ON financial_transactions(org_id, category);

CREATE TABLE IF NOT EXISTS financial_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    
    report_type VARCHAR(50) NOT NULL,  -- DAILY, WEEKLY, MONTHLY, QUARTERLY, ANNUAL
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Summary figures
    total_revenue DECIMAL(14,2),
    total_expenses DECIMAL(14,2),
    net_profit DECIMAL(14,2),
    profit_margin DECIMAL(5,2),
    
    -- Breakdown
    revenue_by_source JSONB,
    expenses_by_category JSONB,
    
    -- Trading specific
    trading_pnl DECIMAL(14,2),
    trading_win_rate DECIMAL(5,2),
    
    -- E-commerce specific
    ecommerce_revenue DECIMAL(14,2),
    ecommerce_orders INTEGER,
    avg_order_value DECIMAL(10,2),
    
    -- Social specific
    content_posts INTEGER,
    total_engagement INTEGER,
    follower_growth INTEGER,
    
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(org_id, report_type, period_start)
);

-- ============================================
-- SYSTEM: Automation Rules
-- ============================================

CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Trigger
    trigger_type VARCHAR(50) NOT NULL,  -- SCHEDULE, EVENT, CONDITION
    trigger_config JSONB NOT NULL,
    
    -- Action
    action_type VARCHAR(50) NOT NULL,  -- REORDER, REPRICE, POST, ALERT, TRADE
    action_config JSONB NOT NULL,
    
    -- Constraints
    requires_approval BOOLEAN DEFAULT false,
    max_daily_executions INTEGER,
    cooldown_minutes INTEGER,
    
    -- State
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    total_executions INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Seed some default pricing rules
-- ============================================

-- This will be populated per-organization when they onboard
