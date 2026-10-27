BEGIN;

ALTER TABLE service_inquiries
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS request_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS idempotency_payload_hash CHAR(64);

-- Preserve every existing pilot receipt, status, payment link and delivery fact.
ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS service_inquiries_service_check;
ALTER TABLE service_inquiries ADD CONSTRAINT service_inquiries_service_check CHECK
  (service_code IN ('BACK_OFFICE_OS_STARTER','MERCHANDISE_SOURCING','WHOLESALE_TRADE','RETAIL_PRODUCT','SUPPLIER_PARTNERSHIP','RESEARCH_SERVICE','CATALOG_CLEANUP','SUPPORT_REQUEST','GENERAL_INQUIRY'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_inquiries_details_check' AND conrelid='service_inquiries'::regclass) THEN
    ALTER TABLE service_inquiries ADD CONSTRAINT service_inquiries_details_check CHECK
      (jsonb_typeof(details)='object' AND octet_length(details::text)<=8000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_inquiries_request_key_check' AND conrelid='service_inquiries'::regclass) THEN
    ALTER TABLE service_inquiries ADD CONSTRAINT service_inquiries_request_key_check CHECK
      (request_key IS NULL OR request_key ~ '^[A-Za-z0-9_-]{16,100}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_inquiries_payload_hash_check' AND conrelid='service_inquiries'::regclass) THEN
    ALTER TABLE service_inquiries ADD CONSTRAINT service_inquiries_payload_hash_check CHECK
      (idempotency_payload_hash IS NULL OR idempotency_payload_hash ~ '^[a-f0-9]{64}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_inquiries_service_request
  ON service_inquiries(service_code,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_inquiries_updated ON service_inquiries(updated_at DESC,receipt_id DESC);

COMMIT;
