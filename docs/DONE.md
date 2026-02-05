# Nova Enterprises - Gate Checklist

## Gate 0 — Foundation
- [x] BLUEPRINT.md exists with layers/flywheels/modes
- [x] CONTRACTS.md exists with all schemas
- [x] RUNBOOK.md exists with start/stop/migrations
- [x] DONE.md exists (this file)
- [ ] scripts/preflight passes (banned words + types)
- [ ] scripts/smoke passes (health endpoints)
- [ ] One-command boot works: `npm run nova:mvp`

## Gate 1 — Boot + Auth + UI
- [ ] Cold start boots reliably
- [ ] Auth: register/login/logout works
- [ ] Dashboard page wired
- [ ] Logbook page wired
- [ ] Approvals page wired
- [ ] Safety page wired
- [ ] Settings page wired
- [ ] All /health endpoints respond

## Gate 2 — Persistence + Flight Recorder
- [ ] Auth persists to Postgres
- [ ] Orchestrator persists to Postgres
- [ ] EventBus persists events to Postgres
- [ ] Event chain is append-only + tamper-evident
- [ ] GET /events?limit=N works
- [ ] GET /events/verify works
- [ ] Goal → Tasks → Events flow works
- [ ] RBAC enforced in API
- [ ] Approvals model works
- [ ] Kill-switch stored in DB and blocks endpoints
- [ ] Modes stored in DB

## Gate 3 — TradeBot v1 (Paper)
- [ ] CSV OHLCV import (UI + backend)
- [ ] Indicators computed: RSI, ADX, DI+/DI-, VWAP, volume surge, volatility
- [ ] Scanner + scoring produces Signal Cards
- [ ] Backtester v1 runs and persists results
- [ ] Paper trading: open/close/PnL/stats
- [ ] Risk manager for paper trading

## Gate 4 — Bots v1
- [ ] StoreBot: products + pricing + listings + orders
- [ ] SocialBot: plans + scripts + metrics + export
- [ ] ResearchBot: proposals → goals
- [ ] OpsBot: health + export + demo reset

## Gate 5 — Nova Assistant
- [ ] Assistant panel in UI
- [ ] Grounded in DB (no hallucinations)
- [ ] Can summarize with citations
- [ ] Can propose goals (not execute)

## Gate 6 — Release Hardening
- [ ] Production build works
- [ ] Structured logs
- [ ] Metrics endpoint
- [ ] Backup/restore scripts
- [ ] Security basics (rate limits, CORS, CSRF)
- [ ] Demo mode seeded data
- [ ] License + docs
