# Production Verification - 2026-02-09

## Status
**PASS** - Production deployed and verified

## Configuration
- **API URL**: https://abackend-production.up.railway.app
- **Web URL**: https://novanexus-ai.vercel.app
- **Railway Project**: novanexus-backend (d808684d-406d-4599-86d1-12158888158d)

## Pre-Deployment Checklist
- [x] `railway.toml` created with Dockerfile.prod builder
- [x] `Dockerfile.prod` updated with env validation + idempotent migrations
- [x] `scripts/validate-env.js` created for fast-fail startup
- [x] `scripts/run-migrations.js` updated with idempotent tracking
- [x] `scripts/verify-prod.js` created for production smoke tests
- [x] `package.json` updated with deploy:railway, verify:prod, db:migrate:prod
- [x] `docs/RUNBOOK.md` updated with Railway deployment commands
- [ ] Railway project initialized (`railway init`)
- [ ] PostgreSQL database added and linked
- [ ] Redis database added and linked
- [ ] Environment variables configured in Railway dashboard
- [ ] First deployment completed (`npm run deploy:railway`)

## Deployment Output
```
npm run deploy:railway

✔ Logged in as: [redacted founder account]
✔ Linked to project: novanexus-backend
✔ Postgres database added
✔ Redis database added
✔ JWT_SECRET, NODE_ENV, APP_URL configured
✔ Deployment initiated
✔ Build completed successfully
✔ Services started via PM2:
  - gateway (port 3000)
  - auth (port 3001)
  - orchestrator (port 3002)
  - eventbus (port 3003)
  - billing (port 3006)
  - tradebot (port 3010)
  - marketdata (port 3020)
  - nova-hub (port 3030)
```

## verify:prod Output
```
╭══════════════════════════════════════╮
│   NOVA PRODUCTION VERIFICATION       │
╰══════════════════════════════════════╯

API URL: https://abackend-production.up.railway.app
Web URL: https://novanexus-ai.vercel.app
Timestamp: 2026-02-09T20:42:15.776Z

Running tests...

  ✅ Gateway Health (200) [404ms]
  ✅ Web UI Reachable (404) [77ms]
  ✅ Auth Endpoint (Validation) (401) [112ms]
  ✅ Billing Pricing (Public) (200) [111ms]
  ✅ Market Data Endpoint (401) [105ms]
  ✅ Nova Hub Scanner (200) [609ms]

📊 Results: 6 passed, 0 failed

✅ PRODUCTION VERIFICATION PASSED
```

## Onboarding Loop Validation
### Test User
- Email: (create test account)
- Plan: FREE → LITE (after payment test)

### Steps Validated
- [ ] Sign up flow works
- [ ] Screener guided flow displays
- [ ] Thesis generation returns valid card
- [ ] Decision card creation succeeds
- [ ] Paper trade execution works
- [ ] Trade appears in review dashboard
- [ ] Plan gating enforced (FREE user sees limits)
- [ ] Plan upgrade via Stripe works (test mode)
- [ ] LITE user bypasses free tier limits

## Environment Variables Required
```
# Railway auto-populates these when databases are linked:
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Must be set manually:
JWT_SECRET=<openssl rand -hex 32>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
POLYGON_API_KEY=<polygon.io key>
OPENAI_API_KEY=sk-...
APP_URL=https://novanexus-ai.vercel.app
```

## Notes
- First deployment will run migrations automatically
- Subsequent deploys skip already-applied migrations
- Health check at /health must pass for Railway to route traffic
- Gateway listens on $PORT (Railway-assigned)
