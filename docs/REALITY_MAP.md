# NovaNexus AI - Reality Map

> Generated: February 2026  
> Purpose: Document what exists, how it connects, what works, and what's broken.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│  ┌─────────────────────────┐       ┌──────────────────────────────┐    │
│  │ Vercel (apps/web)       │       │ Admin Dashboard (apps/admin)  │    │
│  │ nova-enterprises.vercel.app     │       [not deployed]           │    │
│  └──────────────┬──────────┘       └──────────────────────────────┘    │
└─────────────────┼───────────────────────────────────────────────────────┘
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY (port 3000)                          │
│  services/gateway - Express.js                                          │
│  - JWT validation, CORS, rate limiting                                  │
│  - Routes traffic to backend services                                   │
│  - Production: api.novanexus-ai.com (via Cloudflare Tunnel)             │
└──────────┬──────────────────────────────────────────────────────────────┘
           │
           ├──────────────┬──────────────┬──────────────┬─────────────────┐
           ▼              ▼              ▼              ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Auth Service │  │ Nova Hub     │  │ MarketData   │  │ Billing      │  │ TradeBot     │
│ (port 3001)  │  │ (port 3030)  │  │ (port 3020)  │  │ (port 3006)  │  │ (port 3010)  │
│              │  │              │  │              │  │              │  │              │
│ - Register   │  │ - Journal    │  │ - Quotes     │  │ - Stripe     │  │ - Watchlists │
│ - Login      │  │ - Backtest   │  │ - Candles    │  │ - Plans      │  │ - Paper      │
│ - Refresh    │  │ - Thesis     │  │ - Indicators │  │ - Entitlem.  │  │   Trading    │
│ - Policies   │  │ - Portfolio  │  │              │  │              │  │ - Nexus AI   │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
           │              │              │              │                 │
           └──────────────┴──────────────┴──────────────┴─────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────┐
                          │ PostgreSQL (port 5432)   │
                          │ Redis (port 6379)        │
                          │ MinIO (port 9000/9001)   │
                          └──────────────────────────┘
```

## Service Inventory

### Core Services (Required for MVP)

| Service | Port | Purpose | DB Required | Status |
|---------|------|---------|-------------|--------|
| **gateway** | 3000 | API routing, auth, rate limiting | Yes (Redis) | ✅ Implemented |
| **auth** | 3001 | User auth, JWT tokens, policies | Yes (PG) | ✅ Implemented |
| **nova-hub** | 3030 | Journal, Backtest, Thesis, Portfolio | Yes (PG) | ✅ Implemented |
| **marketdata** | 3020 | Real market quotes/candles | Yes (Redis cache) | ✅ Implemented |
| **billing** | 3006 | Stripe integration, entitlements | Yes (PG) | ✅ Implemented |

### Secondary Services (Can run without for MVP)

| Service | Port | Purpose | Status |
|---------|------|---------|--------|
| **tradebot** | 3010 | Watchlists, paper trading, AI screener | ✅ Implemented |
| **orchestrator** | 3002 | Goals, Tasks, Kill switch | ✅ Implemented |
| **eventbus** | 3003 | Event sourcing | ✅ Implemented |
| **storebot** | 3011 | E-commerce automation | ✅ Implemented |
| **socialbot** | 3012 | Social media automation | ✅ Implemented |
| **researchbot** | 3013 | Research automation | ✅ Implemented |
| **opsbot** | 3014 | Operations automation | ✅ Implemented |
| **forgebot** | 3015 | Content creation | ✅ Implemented |
| **audit** | 3004 | Audit logging | ✅ Implemented |
| **notifier** | 3005 | Notifications | ✅ Implemented |

### Infrastructure

| Component | Port | Purpose |
|-----------|------|---------|
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching, rate limiting, sessions |
| MinIO | 9000/9001 | Object storage (S3-compatible) |

## Database Schema Status

All tables are defined in `infra/migrations/`:

```
001_initial_schema.sql     - Core tables: users, orgs, events, goals, tasks, etc.
002_bots_table.sql         - Bot registry
003_billing_tables.sql     - entitlements, audit_logs
003_nova_hub_features.sql  - journal_entries, backtest_results, trade_theses, user_portfolios, etc.
004_nova_hub_lite_tables.sql - watchlists, alerts, paper_trades, thesis_cards
```

## Current Deployment State

### Production URLs
- **Frontend**: `https://nova-enterprises.vercel.app` (Vercel)
- **API**: `https://api.novanexus-ai.com` (Cloudflare Tunnel → localhost:3000)

### Local Development
- **Frontend**: `http://localhost:8080` (Docker) or `http://localhost:3100` (npm run dev)
- **API Gateway**: `http://localhost:3000`

## Truth Pipeline (Market Data)

The system uses a **no-mock-data policy**. Market data flows:

```
Polygon API ──┐
              ├──▶ MarketData Service ──▶ Gateway ──▶ Frontend
Finnhub API ──┘     (caches in RAM)
```

### Configuration
- `POLYGON_API_KEY` - Primary provider (5 req/min free tier)
- `FINNHUB_API_KEY` - Fallback provider (30 req/min free tier)

### Behavior
- If BOTH keys are missing: Returns `503 MARKETDATA_NOT_CONFIGURED`
- If providers fail: Returns `503 MARKETDATA_UNAVAILABLE`
- Never returns mock/fake data

## Authentication Flow

```
1. POST /v1/auth/register or /v1/auth/login
   └─▶ Returns { accessToken, refreshToken, expiresIn }

2. All authenticated requests:
   └─▶ Authorization: Bearer <accessToken>

3. Token refresh (when 401):
   └─▶ POST /v1/auth/refresh { refreshToken }
   └─▶ Returns new token pair

4. Logout:
   └─▶ POST /v1/auth/logout
   └─▶ Client clears localStorage
```

### Token Storage (Frontend)
- `localStorage.setItem('nova_access_token', ...)`
- `localStorage.setItem('nova_refresh_token', ...)`

## Known Issues & Failure Points

### 1. "Network request failed" in Production
**Cause**: Frontend can't reach backend API  
**Solution**: Backend must be deployed and reachable. Currently requires:
- Cloudflare Tunnel running locally, OR
- Backend deployed to Railway/Render/Fly.io

### 2. CORS Issues
**Status**: ✅ FIXED in gateway  
**Allowed Origins**:
- `http://localhost:*`
- `https://novanexus-ai.com`
- `https://*.vercel.app`

### 3. Missing API Keys
**Impact**: MarketData service returns 503 errors  
**Solution**: Set `POLYGON_API_KEY` and/or `FINNHUB_API_KEY`

### 4. Database Not Initialized
**Impact**: All services return 500 errors  
**Solution**: Run migrations via `docker compose up` (auto-runs on postgres init)

## Feature Completeness

### ✅ Fully Working
- User registration/login/logout
- JWT token refresh
- Journal CRUD operations
- Backtest execution (3 strategies: SMA Crossover, Mean Reversion, Momentum)
- Trade thesis generation (basic + AI with OpenAI)
- Paper trading
- Portfolio tracking
- Real market data (with valid API keys)
- Stripe billing integration
- Feature gating (Free/Lite/Pro)

### ⚠️ Needs API Keys
- AI Thesis Generation: Needs `OPENAI_API_KEY`
- Market Data: Needs `POLYGON_API_KEY` or `FINNHUB_API_KEY`
- Stripe Billing: Needs `STRIPE_SECRET_KEY`

### 📋 Not Implemented / Placeholder
- Live trading (requires Alpaca with real money)
- Social posting automation (needs platform API keys)
- E-commerce sync (needs platform API keys)

## Revenue Path

### Current State
Stripe billing is **fully implemented** with 3 tiers:

| Plan | Price | Key Features |
|------|-------|--------------|
| **FREE** | $0 | 3 journal entries/day, 1 backtest/day, 1 watchlist |
| **LITE** | $29/mo | 100 entries/day, 10 backtests/day, AI thesis, CSV export |
| **PRO** | $99/mo | Unlimited, API access, priority support |

### To Enable Charging
1. Create Stripe products/prices in Stripe Dashboard
2. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
3. Configure webhook URL in Stripe: `https://api.novanexus-ai.com/billing/webhook`

## File Structure (Key Directories)

```
nova-enterprises/
├── apps/
│   └── web/                # Next.js frontend
│       └── src/
│           ├── app/        # Pages (App Router)
│           ├── components/ # React components
│           └── lib/
│               ├── api.ts  # API client (single source of truth)
│               └── store.ts # Zustand state
├── services/
│   ├── gateway/            # API gateway
│   ├── auth/               # Authentication
│   ├── nova-hub/           # Journal, Backtest, Thesis
│   ├── marketdata/         # Market data provider
│   ├── billing/            # Stripe integration
│   └── tradebot/           # Trading features
├── libs/
│   ├── shared/             # Shared utilities, DB, JWT
│   └── nexus-core/         # Intelligence Empire (core logic)
├── infra/
│   └── migrations/         # PostgreSQL schemas
└── docker-compose.yml      # Full stack orchestration
```

## Environment Variables Summary

### Required for Operation
```env
# Database
DATABASE_URL=postgresql://nova:nova_dev_password@localhost:5432/nova

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<strong-random-string>

# Frontend API URL (production)
NEXT_PUBLIC_API_URL=https://api.novanexus-ai.com
```

### Required for Full Features
```env
# Market Data (at least one)
POLYGON_API_KEY=<your-key>
FINNHUB_API_KEY=<your-key>

# AI Features
OPENAI_API_KEY=<your-key>

# Billing
STRIPE_SECRET_KEY=<your-key>
STRIPE_WEBHOOK_SECRET=<your-key>
```

## Health Check Endpoints

All services expose `/health`:

| Service | Endpoint |
|---------|----------|
| Gateway | `GET /health` |
| Auth | `GET /health` |
| MarketData | `GET /health` |
| Nova Hub | `GET /health` |
| Billing | `GET /health` |

Response format:
```json
{
  "status": "healthy",
  "service": "<service-name>",
  "timestamp": "2026-02-06T21:00:00.000Z"
}
```

## Conclusion

The NovaNexus system is **architecturally complete** but requires:
1. Backend deployment for production use
2. API keys for market data and AI features
3. Stripe configuration for monetization

See `RUNBOOK.md` for local development and `DEPLOYMENT.md` for production deployment.
