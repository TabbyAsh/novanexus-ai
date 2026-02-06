# NovaNexus AI - Runbook

> Local development setup, troubleshooting, and smoke testing.

## Quick Reference

| Action | Command |
|--------|--------|
| Start Full Stack | `docker compose up -d` |
| Start MVP Only | `npm run nova:mvp:up` |
| Stop Services | `docker compose down` |
| Stop + Delete Data | `docker compose down -v` |
| View Logs | `docker compose logs -f` |
| Smoke Test | `npm run nova:smoke` |
| Health Check | `curl http://localhost:3000/health` |
| Metrics | `curl http://localhost:3000/metrics` |

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
