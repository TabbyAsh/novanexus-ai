-- Public website intake (buyer/sourcing, supplier, services).
-- Authority for novanexus-ai.com forms. Does not alter service_inquiries (035/036).
-- Safe on an empty database and safe after 001–036. Uses gen_random_uuid() (Postgres 13+).

BEGIN;

CREATE TABLE IF NOT EXISTS public_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'nova-enterprises-llc',
  receipt_id VARCHAR(32) NOT NULL,
  request_id VARCHAR(100) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  inquiry_type VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'new',
  name VARCHAR(120) NOT NULL,
  company VARCHAR(160),
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(40),
  country VARCHAR(80),
  product_or_service VARCHAR(200),
  quantity_text VARCHAR(120),
  target_date DATE,
  notes TEXT,
  source VARCHAR(40) NOT NULL DEFAULT 'website',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_inquiries_receipt_check CHECK (receipt_id ~ '^NOVA-[0-9]{8}-[A-Z0-9]{4}$'),
  CONSTRAINT public_inquiries_request_check CHECK (request_id ~ '^[A-Za-z0-9_-]{16,100}$'),
  CONSTRAINT public_inquiries_hash_check CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT public_inquiries_type_check CHECK (inquiry_type IN ('buyer_sourcing', 'supplier', 'services')),
  CONSTRAINT public_inquiries_status_check CHECK (status IN ('new', 'reviewing', 'qualified', 'quoted', 'won', 'lost', 'spam', 'archived')),
  CONSTRAINT public_inquiries_source_check CHECK (source IN ('website', 'website-preview', 'website-test', 'sourcing-landing')),
  CONSTRAINT public_inquiries_notes_check CHECK (notes IS NULL OR char_length(notes) <= 5000),
  CONSTRAINT public_inquiries_version_check CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_inquiries_receipt
  ON public_inquiries (receipt_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_inquiries_org_request
  ON public_inquiries (org_id, request_id);
CREATE INDEX IF NOT EXISTS idx_public_inquiries_created
  ON public_inquiries (org_id, created_at DESC);

-- Existing databases already created this table. Widen the check in place.
ALTER TABLE public_inquiries DROP CONSTRAINT IF EXISTS public_inquiries_source_check;
ALTER TABLE public_inquiries ADD CONSTRAINT public_inquiries_source_check
  CHECK (source IN ('website', 'website-preview', 'website-test', 'sourcing-landing'));

CREATE TABLE IF NOT EXISTS inquiry_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public_inquiries (id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  channel VARCHAR(24) NOT NULL DEFAULT 'email',
  recipient VARCHAR(254) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inquiry_notification_channel_check CHECK (channel IN ('email')),
  CONSTRAINT inquiry_notification_status_check CHECK (status IN ('pending', 'skipped', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_inquiry_notifications_status
  ON inquiry_notification_outbox (org_id, status, created_at);

CREATE TABLE IF NOT EXISTS intake_rate_events (
  id BIGSERIAL PRIMARY KEY,
  ip_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intake_rate_events_hash_check CHECK (ip_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_intake_rate_events_ip_time
  ON intake_rate_events (ip_hash, created_at DESC);

COMMIT;
