-- ============================================================================
-- Nova Enterprises — Business OS
-- Migration: 026_business_os
--
-- The productized "company-in-a-box": persistent CRM/pipeline for any
-- service business operator. This is what we built by hand for Apex,
-- generalized for every NovaNexus user.
--
-- Doctrine: turn a messy small business into a working operating system —
-- contacts, jobs, quotes, invoices, pipeline, and revenue tracking.
-- ============================================================================

-- Business profile — one per user (their company settings)
CREATE TABLE IF NOT EXISTS business_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    business_name VARCHAR(200),
    business_type VARCHAR(100),          -- 'pressure washing', 'cleaning', 'freelance', etc.
    owner_name VARCHAR(200),
    phone VARCHAR(40),
    email VARCHAR(200),
    service_area VARCHAR(200),           -- cities/region served
    payment_methods VARCHAR(300) DEFAULT 'Venmo, Cash App, Zelle, Cash, Check',
    services_json JSONB DEFAULT '[]',    -- [{ name, basePrice }]
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_user ON business_profiles(user_id);

-- Contacts — leads and customers
CREATE TABLE IF NOT EXISTS business_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(40),
    email VARCHAR(200),
    address TEXT,
    city VARCHAR(120),
    source VARCHAR(60) DEFAULT 'manual',  -- 'manual', 'field', 'website', 'referral'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_contacts_user ON business_contacts(user_id, created_at DESC);

-- Jobs — the pipeline. Every piece of work moves through these stages.
CREATE TABLE IF NOT EXISTS business_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES business_contacts(id) ON DELETE SET NULL,
    -- Denormalized contact info for quick display
    contact_name VARCHAR(200),
    contact_phone VARCHAR(40),
    service VARCHAR(200),
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'LEAD'
      CHECK (status IN ('LEAD', 'QUOTED', 'SCHEDULED', 'COMPLETED', 'PAID', 'LOST')),
    quoted_price DECIMAL(12,2),
    final_price DECIMAL(12,2),
    scheduled_date DATE,
    completed_date DATE,
    paid_date DATE,
    notes TEXT,
    -- Follow-up tracking — the money-saving feature
    last_contacted_at TIMESTAMPTZ,
    follow_up_due DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_jobs_user ON business_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_jobs_status ON business_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_business_jobs_followup ON business_jobs(user_id, follow_up_due)
  WHERE status IN ('LEAD', 'QUOTED');
