# NovaNexus AI - Runbook

> Local development setup, troubleshooting, and smoke testing.

## Quick Reference

| Action | Command |
|--------|--------|
| Start Full Stack (deterministic) | `npm run dev:all` |
| No-Docker Core Stack | `npm run dev:nodocker` |
| Wait for Readiness | `npm run stack:ready` |
| Verify | `npm run verify` |
| Start MVP Only | `npm run nova:mvp` |
| Stop Services | `npm run nova:down` |
| Stop + Delete Data | `npm run nova:mvp:down` |
| View Logs | `npm run nova:mvp:logs` |
| Smoke Test | `npm run nova:smoke` |
| Health Check | `curl http://localhost:3000/health` |
| Metrics | `curl http://localhost:3000/metrics` |

## Production Deployment (Railway)

### Prerequisites
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login
```

### Deploy Commands
| Action | Command |
|--------|--------|
| Deploy to Railway | `npm run deploy:railway` |
| Run Migrations (Prod) | `npm run db:migrate:prod` |
| Verify Production | `npm run verify:prod` |
| Build Prod Docker Image | `npm run docker:build:prod` |
| Validate Environment | `npm run validate:env` |

**Human Touch Required:** The deploy script opens a browser for Railway OAuth login. Click "Approve" once. This is the ONLY manual step.

### First-Time Setup
```bash
# 1. Initialize Railway project (in repo root)
railway init

# 2. Add PostgreSQL database
# In Railway dashboard: New → Database → PostgreSQL

# 3. Add Redis
# In Railway dashboard: New → Database → Redis

# 4. Set required environment variables in Railway dashboard:
#    DATABASE_URL - auto-filled if linked to PostgreSQL
#    REDIS_URL - auto-filled if linked to Redis
#    JWT_SECRET - generate with: openssl rand -hex 32
#    STRIPE_SECRET_KEY - from Stripe dashboard
#    POLYGON_API_KEY - for market data

# 5. Deploy
npm run deploy:railway

# 6. Verify production
npm run verify:prod
```

### Production Verification
```bash
# Default URLs (api.novanexus-ai.com)
npm run verify:prod

# Custom API URL
npm run verify:prod -- --url=https://your-app.railway.app

# Or via environment variable
PROD_API_URL=https://your-app.railway.app npm run verify:prod
```

### Onboarding Loop Validation (Production)
After deployment, manually verify the full user flow:
1. Sign up at https://novanexus-ai.vercel.app/signup
2. Complete screener guided flow
3. Generate thesis card
4. Create decision card
5. Execute paper trade
6. Review trade in dashboard
7. Verify plan gating (FREE user hits limits, LITE user bypasses)

## Required Environment Variables

```bash
# Required for production
DATABASE_URL=postgresql://user:pass@host:5432/nova
REDIS_URL=redis://host:6379
JWT_SECRET=your-256-bit-secret

# Stripe (required for billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_LITE_PRICE_MONTHLY=price_...
STRIPE_LITE_PRICE_YEARLY=price_...

# Market Data (optional - falls back to stub data)
POLYGON_API_KEY=your-polygon-api-key
```

## System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Gateway   │────▶│  Services   │
│  (UI:8080)  │     │   (:3000)   │     │             │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                    │
                    ┌──────▼──────┐      ┌──────▼──────┐
                    │    Redis    │      │  Postgres   │
                    │   (:6379)   │      │   (:5432)   │
                    └─────────────┘      └─────────────┘
```

## Startup Procedure

### Deterministic Local Boot (recommended)
```bash
npm run dev:all
npm run verify
```

`dev:all` bootstraps `.env.dev`, starts the MVP Docker stack, runs migrations, and waits for readiness. If readiness fails, `stack:ready` prints a status table with exact URLs, connection results, and likely causes.
Before starting Docker Compose, it verifies Docker Engine is reachable. If not, it exits with:
"Start Docker Desktop and wait until Engine is running."

`dev:nodocker` starts a reduced core stack (gateway, nova-hub, tradebot, web) via local processes and sets `STACK_PROFILE=core`
for verification. It requires local Postgres + Redis (and `psql`) and does not start optional services like auth, billing, or marketdata.

### Manual Step-by-Step (advanced)

### 1. Prerequisites Check
```bash
# Verify Docker is running
docker info

# Verify Node.js version
node --version  # Requires 18+

# Verify npm
npm --version
```

### 2. Environment Setup
```bash
# Copy environment template if not exists
cp .env.example .env

# Edit .env with your settings (optional for local dev)
```

### 3. Start Infrastructure
```bash
# Start Postgres, Redis, MinIO
docker compose up -d postgres redis minio

# Wait for healthy status
docker compose ps
```

### 4. Run Migrations
```bash
npm run db:migrate
```

### 5. Start Services
```bash
npm run nova
```

### 6. Verify Health
```bash
curl http://localhost:3000/health
# Expected: {"status":"healthy","services":{...}}
```

## Shutdown Procedure

### Graceful Shutdown
```bash
# Stop services (Ctrl+C if running in foreground)
# Then stop infrastructure
docker compose down
```

### Emergency Stop (Kill Switch)
```bash
# Via API
curl -X POST http://localhost:3000/v1/safety/kill-switch/enable \
  -H "Authorization: Bearer <token>"

# Via UI
# Navigate to Safety > Kill Switch > Enable
```

## Monitoring

### Service Health
Each service exposes `/health`:
- Gateway: http://localhost:3000/health
- Auth: http://localhost:3001/health
- Orchestrator: http://localhost:3002/health
- EventBus: http://localhost:3003/health
- TradeBot: http://localhost:3010/health
- StoreBot: http://localhost:3011/health
- SocialBot: http://localhost:3012/health

### Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f gateway

# With timestamps
docker compose logs -f --timestamps
```

### Event Chain Verification
```bash
curl http://localhost:3000/v1/events/chain/verify
# Expected: {"valid":true,"eventCount":N}
```

## Internal Verification (Phase 1)
System-level verification (no user auth) for:
- Market candles return non-null data with integrity tagging
- Alpaca history returns data and enforces plan windows (informational)
- Marketdata provider health snapshot (informational)

### Enable (time-boxed)
Set these environment variables on **nova-hub**:
```
INTERNAL_VERIFY_ENABLED=true
INTERNAL_VERIFY_TOKEN=your-secure-token
INTERNAL_VERIFY_USER_ID=optional-user-id-with-alpaca-connection
INTERNAL_VERIFY_SYMBOL=SPY
INTERNAL_VERIFY_DAYS=10
INTERNAL_VERIFY_PLAN=FREE|LITE|PRO (optional override)
INTERNAL_VERIFY_ALPACA_KEY=optional-service-key
INTERNAL_VERIFY_ALPACA_SECRET=optional-service-secret
INTERNAL_VERIFY_ALPACA_ENDPOINT=optional-endpoint
```

### Run
```
curl -H "x-internal-verify-token: $INTERNAL_VERIFY_TOKEN" \
  "http://localhost:3030/internal/verify"
```

Optional overrides:
```
http://localhost:3030/internal/verify?symbol=SPY&days=10&alpacaPeriod=all&alpacaTimeframe=1D
```

### Output (PASS/FAIL)
Example:
```json
{
  "success": true,
  "data": {
    "status": "PASS",
    "checks": [
      { "name": "market_candles", "status": "PASS" },
      { "name": "alpaca_history", "status": "PASS" },
      { "name": "alpaca_plan_window", "status": "PASS" }
    ]
  }
}
```

Overall status is `PASS` when `market_candles` passes; other checks are informational-only.
Market candles verification requires integrity tags: `source_type`, `source_identifier`, `latency_class`, `confidence_score`, and `timestamp_range`. Synthetic fallback is allowed but must be tagged.

### Disable (after green)
Unset or set:
```
INTERNAL_VERIFY_ENABLED=false
```

## Common Issues

### Database Connection Failed
```
Error: Connection refused to localhost:5432
```
**Solution**: Ensure Postgres is running
```bash
docker compose up -d postgres
docker compose logs postgres
```

### Redis Connection Failed
```
Error: Connection refused to localhost:6379
```
**Solution**: Ensure Redis is running
```bash
docker compose up -d redis
docker compose logs redis
```

### Migration Failed
```
Error: relation "users" already exists
```
**Solution**: Migrations are idempotent. If schema exists, this is expected.
For fresh start:
```bash
docker compose down -v  # WARNING: Deletes all data
docker compose up -d postgres
npm run db:migrate
```

### Port Already in Use
```
Error: EADDRINUSE: address already in use :::3000
```
**Solution**: Find and kill the process
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Linux/Mac
lsof -i :3000
kill -9 <pid>
```

## Backup & Recovery

### Database Backup
```bash
# Create backup
docker compose exec postgres pg_dump -U nova nova > backup.sql

# Restore backup
docker compose exec -T postgres psql -U nova nova < backup.sql
```

### Data Export (User-Initiated)
Users can export their data via:
- UI: Settings > Export Data
- API: `GET /v1/export/my-data`

### Demo Reset (OWNER only)
```bash
# Via API
curl -X POST http://localhost:3000/v1/ops/demo/reset \
  -H "Authorization: Bearer <owner_token>"

# Via UI
# Navigate to Ops > Reset Demo Data
```

## Admin Utilities

### Create/Reset Test User (Production)
Use the Railway CLI to run the admin script against the production database (pulls `DATABASE_URL` from the linked service):
```bash
npx railway run -- node scripts/create_test_user.js \
  --email qa+prod@novanexus-ai.com \
  --password-env TEST_USER_PASSWORD \
  --org "QA/Prod Test Org" \
  --plan LITE \
  --reset
```
Notes:
- `--reset` deletes the existing user (and any orgs where they are the sole member) before recreating.
- Set `--plan` to `PRO` if you need unrestricted access for QA.

## Nova Hub Lite API Endpoints

### Public Endpoints
- `GET /health` - Health check
- `GET /metrics` - Service metrics
- `GET /v1/billing/pricing` - Pricing info
- `POST /v1/auth/register` - Register user
- `POST /v1/auth/login` - Login

### Protected Endpoints (require auth)
- `POST /v1/trade/scan` - Run market scanner
- `GET /v1/trade/theses` - Get thesis cards
- `POST /v1/trade/theses` - Generate thesis
- `GET /v1/trade/paper-trades` - Get paper trades
- `POST /v1/trade/paper-trades` - Open paper trade
- `POST /v1/trade/paper-trades/:id/close` - Close trade
- `GET /v1/alerts` - Get alerts
- `POST /v1/alerts` - Create alert
- `POST /v1/alerts/check` - Check alerts
- `GET /v1/export/trades.csv` - Export trades
- `GET /v1/export/scan.csv` - Export scan results
- `GET /v1/export/theses.csv` - Export theses

### Billing Endpoints
- `POST /v1/billing/checkout-session` - Start Stripe checkout
- `POST /v1/billing/portal` - Customer portal
- `POST /billing/webhook` - Stripe webhook

## Security Checklist

### Before Production
- [ ] Change default database password
- [ ] Set strong JWT_SECRET (256-bit minimum)
- [ ] Configure Stripe live keys
- [ ] Enable HTTPS (reverse proxy / Cloudflare)
- [ ] Review and restrict CORS origins
- [ ] Enable rate limiting (already implemented)
- [ ] Test kill switch
- [ ] Verify audit trail
- [ ] Read and understand Risk Disclosure page

### Regular Checks
- [ ] Verify event chain integrity weekly
- [ ] Review approval queue daily
- [ ] Check service health hourly (automated)
- [ ] Backup database daily

## Rollback Procedure

### Service Rollback
1. Stop current services
2. Checkout previous version: `git checkout <previous-tag>`
3. Rebuild: `npm install && npm run build`
4. Restart: `npm run nova`

### Database Rollback
1. Stop services
2. Restore backup: `psql ... < backup.sql`
3. Restart services

### Emergency Contacts
- System Owner: [Configure in .env]
- On-Call: [Configure in .env]

## Smoke Test Checklist

Run this after setup to verify everything works end-to-end:

### 1. Health Checks

```bash
# All should return {"status": "healthy", ...}
curl http://localhost:3000/health  # Gateway
curl http://localhost:3001/health  # Auth
curl http://localhost:3020/health  # MarketData
curl http://localhost:3030/health  # Nova Hub
curl http://localhost:3006/health  # Billing
```

### 2. User Registration

```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","orgName":"Test Org"}'
```

Expected: `{"success":true,"data":{"user":{...},"accessToken":"..."}}`

### 3. User Login

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'
```

Expected: `{"success":true,"data":{"accessToken":"...","refreshToken":"..."}}`

### 4. Get Current User

```bash
# Replace TOKEN with accessToken from login
curl http://localhost:3000/v1/me \
  -H "Authorization: Bearer TOKEN"
```

Expected: `{"success":true,"data":{"user":{...},"org":{...}}}`

### 5. Market Quote (requires API key)

```bash
curl http://localhost:3000/v1/market/quote/AAPL \
  -H "Authorization: Bearer TOKEN"
```

Expected (with API key): `{"success":true,"data":{"quote":{"symbol":"AAPL","price":...}}}`

Expected (without): `{"success":false,"error":{"code":"MARKETDATA_NOT_CONFIGURED",...}}`

### 6. Create Journal Entry

```bash
curl -X POST http://localhost:3000/v1/journal \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol":"AAPL",
    "direction":"BUY",
    "entryPrice":185.50,
    "positionSize":10,
    "entryDate":"2026-02-06T10:00:00Z",
    "thesis":"Testing the journal feature"
  }'
```

Expected: `{"success":true,"data":{"entry":{...}}}`

### 7. Run Backtest

```bash
curl -X POST http://localhost:3000/v1/backtest \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol":"SPY",
    "strategyType":"sma_crossover",
    "startDate":"2025-01-01",
    "endDate":"2025-12-31",
    "name":"Test Backtest"
  }'
```

Expected: `{"success":true,"data":{"result":{...},"disclaimer":"..."}}`

### 8. Pricing Plans

```bash
curl http://localhost:3000/v1/billing/pricing
```

Expected: `{"success":true,"data":{"plans":[...]}}`

### 9. Logout

```bash
curl -X POST http://localhost:3000/v1/auth/logout \
  -H "Authorization: Bearer TOKEN"
```

Expected: `{"success":true,"data":{"message":"Logged out successfully"}}`

### Automated Smoke Test

```bash
npm run nova:smoke
# Or with wait for services:
npm run nova:smoke:wait
```

### Frontend Verification

1. Open http://localhost:8080 (or :3100 for dev mode)
2. Click "Login" or "Sign Up"
3. Register a new account
4. Verify redirect to dashboard
5. Check that "Systems Online" appears in header
6. Navigate to Journal, Backtest, Settings
7. Verify no JavaScript errors in console

## Production Smoke Test

Repeat the same tests against production:

```bash
# Replace with production URL
API_URL=https://api.novanexus-ai.com

curl $API_URL/health
curl -X POST $API_URL/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"YourPass123!"}'
```

Verify:
- No "Network request failed" errors
- Real market data displays (not mock)
- Journal entries persist after refresh
- Backtest uses real historical data
- No 404s on any pages

## Version History

See `/VERSION` for current version.
See `CHANGELOG.md` for change history.
