BEGIN;

CREATE TABLE IF NOT EXISTS service_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id VARCHAR(40) NOT NULL UNIQUE,
  service_code VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  business VARCHAR(160) NOT NULL,
  challenge TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'RECEIVED',
  operator_email_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  operator_email_provider_id VARCHAR(255),
  confirmation_email_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  confirmation_email_provider_id VARCHAR(255),
  delivery_updated_at TIMESTAMPTZ,
  payment_status VARCHAR(24) NOT NULL DEFAULT 'NOT_STARTED',
  stripe_checkout_session_id VARCHAR(255) UNIQUE,
  stripe_payment_intent_id VARCHAR(255),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_inquiries_service_check CHECK (service_code IN ('BACK_OFFICE_OS_STARTER')),
  CONSTRAINT service_inquiries_status_check CHECK (status IN ('RECEIVED', 'IN_REVIEW', 'SCOPE_ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED')),
  CONSTRAINT service_inquiries_operator_email_check CHECK (operator_email_status IN ('PENDING', 'PROVIDER_ACCEPTED', 'FAILED', 'NOT_CONFIGURED')),
  CONSTRAINT service_inquiries_confirmation_email_check CHECK (confirmation_email_status IN ('PENDING', 'PROVIDER_ACCEPTED', 'FAILED', 'NOT_CONFIGURED', 'SKIPPED')),
  CONSTRAINT service_inquiries_payment_check CHECK (payment_status IN ('NOT_STARTED', 'PAID', 'REFUNDED')),
  CONSTRAINT service_inquiries_challenge_length_check CHECK (char_length(challenge) BETWEEN 20 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_service_inquiries_status_created
  ON service_inquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_inquiries_email_created
  ON service_inquiries(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_inquiries_payment_created
  ON service_inquiries(payment_status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_inquiries_payment_intent_unique
  ON service_inquiries(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMIT;
