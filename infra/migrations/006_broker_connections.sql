-- ============================================
-- Broker Connections (Alpaca) - Value Loop #3
-- Migration: 006_broker_connections
-- ============================================

CREATE TABLE IF NOT EXISTS broker_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('ALPACA')),
    api_key_enc TEXT NOT NULL,
    api_secret_enc TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    environment VARCHAR(20) NOT NULL CHECK (environment IN ('paper', 'live')),
    key_last4 VARCHAR(4),
    last_verified_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_broker_connections_user ON broker_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_connections_org ON broker_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_broker_connections_provider ON broker_connections(provider);

DROP TRIGGER IF EXISTS update_broker_connections_updated_at ON broker_connections;
CREATE TRIGGER update_broker_connections_updated_at BEFORE UPDATE ON broker_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
