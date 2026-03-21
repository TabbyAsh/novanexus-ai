# Nova Enterprises — System Status

> **Last verified**: 2026-03-21
> **Last verified commit**: 138deba (master)
> **Verified by**: Build audit + full turbo build (18/18 pass)

---

## Canonical Backend

**The TypeScript services are the production system.**

The Python layer (`services/api`, `services/core`, `services/bots`) is experimental
and not deployed. It is not wired into Docker Compose, the production Dockerfile,
or any deployment pipeline. Do not integrate it without an explicit decision to migrate.

---

## Production Services

These services are built, deployed, and required for the platform to function:

| Service | Package | Port | Build | Notes |
|---------|---------|------|-------|-------|
| Gateway | @nova/gateway-service | 3000 | tsc | API routing, auth, CORS, rate limiting |
| Auth | @nova/auth-service | 3001 | tsc | JWT, register/login, RBAC |
| Orchestrator | @nova/orchestrator-service | 3002 | tsc | Goals, tasks, kill switch |
| EventBus | @nova/eventbus-service | 3003 | tsc | Event sourcing, hash chain |
| Audit | @nova/audit-service | 3004 | tsc | Audit log, chain verification |
| Billing | @nova/billing-service | 3006 | tsc | Stripe, entitlements (FREE/LITE/PRO/FOUNDING) |
| TradeBot | @nova/tradebot | 3010 | esbuild | Paper trading, Alpaca, AI screener |
| StoreBot | @nova/storebot | 3011 | tsc | Pricing engine, product scraper |
| SocialBot | @nova/socialbot | 3012 | tsc | Content manager |
| MarketData | @nova/marketdata-service | 3020 | tsc | Quotes, candles (Alpaca/Polygon/Finnhub/Yahoo) |
| Nova Hub | @nova/nova-hub | 3030 | tsc | Core brain: journal, backtest, thesis, screener, decision cards |
| Web | @nova/web | 4000 | Next.js | Dashboard frontend (Vercel) |

---

## Non-Production / Frozen Services

These exist in the repo but are **not deployed, not tested, and not part of the critical path**.
Do not invest in them until the production services are hardened.

| Directory | Status | Reason |
|-----------|--------|--------|
| `services/researchbot` | FROZEN | Dockerfile exists, no TS implementation |
| `services/opsbot` | FROZEN | Dockerfile exists, no TS implementation |
| `services/forgebot` | FROZEN | src dir only, no package.json |
| `services/contentdata` | FROZEN | src dir only, no implementation |
| `services/commercedata` | FROZEN | src dir only, no implementation |
| `services/notifier` | FROZEN | Dockerfile exists, minimal implementation |
| `services/api` (Python) | EXPERIMENTAL | Full FastAPI app, not integrated |
| `services/core` (Python) | EXPERIMENTAL | Domain model, not integrated |
| `services/bots` (Python) | EXPERIMENTAL | Bot implementations, not integrated |
| `apps/admin` | FROZEN | Empty shell, no package.json |

---

## Deployment Topology

### Current
- **Frontend**: Vercel (`nova-enterprises.vercel.app`)
- **Backend**: Railway (`Dockerfile.prod` + PM2 ecosystem)
- **Domain**: `api.novanexus-ai.com`

### Infrastructure (Docker Compose local)
- PostgreSQL 16 (port 5432)
- Redis 7 (port 6379)
- MinIO (port 9000/9001) — not actively used

---

## Required Environment Variables

### Minimum (platform boots)
```
DATABASE_URL=postgresql://nova:nova_dev_password@localhost:5432/nova
REDIS_URL=redis://localhost:6379
JWT_SECRET=<strong random string>
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Full features
```
ALPACA_API_KEY=        # Market data + paper trading
ALPACA_SECRET_KEY=     # Market data + paper trading
POLYGON_API_KEY=       # Market data fallback
FINNHUB_API_KEY=       # Market data fallback
OPENAI_API_KEY=        # AI thesis generation
STRIPE_SECRET_KEY=     # Billing
STRIPE_WEBHOOK_SECRET= # Billing webhooks
```

---

## Known Issues (P0)

1. **No CI/CD pipeline** — no automated testing on push
2. **tradebot uses esbuild for build** — tsc fails due to type mismatches with nexus-core internal APIs. The production Dockerfile also uses esbuild. This is honest but not ideal — fix the types long-term.
3. **3 services have `strict: false`** — gateway, nova-hub, tradebot. These should eventually be strict.
4. **Windows workspace junctions** — all tsconfigs require explicit `paths` mappings because npm workspace symlinks don't traverse cleanly on Windows.

---

## Build Verification

```
npx turbo run build     # 18/18 packages must pass
npx turbo run typecheck # Run after build (needs .d.ts files from ^build)
```

---

## Gate Status

| Gate | Status | Notes |
|------|--------|-------|
| Build passes honestly | ✅ PASS | 18/18, no `\|\| true` anywhere |
| TypeScript paths resolve | ✅ PASS | All workspaces have explicit paths |
| Production Dockerfile | ✅ HARDENED | Fails on any broken bundle |
| One-command boot | ⬜ NOT VERIFIED | `npm run nova:mvp` — needs Docker Desktop running |
| Health endpoints respond | ⬜ NOT VERIFIED | Requires running stack |
| Smoke test green | ⬜ NOT VERIFIED | `npm run verify` |
| CI/CD pipeline | ❌ MISSING | No GitHub Actions |
| Railway deploy verified | ⬜ NOT VERIFIED | Config exists, not end-to-end tested |
