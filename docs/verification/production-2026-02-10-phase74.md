# Phase 7.4 — Decision Cards V1 Verification

**Date:** 2026-02-10
**Web:** https://novanexus-ai.com
**API:** https://abackend-production.up.railway.app
**GitSha:** `1ac4e5e` (web + backend in sync)

## Goal

From production /dashboard: User sees "Cards" balance in header (free users start with 3 cards). User runs AI Scan → sees candidates. User clicks "Apply Decision Card" on any candidate. Card opens prefilled with snapshot values, simulation summary, opportunity cost. User clicks Confirm: Card is consumed (balance -1), paper execution record created.

## Implementation

### Database Tables (migration 010)
- `card_wallets` - per-user card balance with auto-grant of 3 cards
- `card_ledger` - audit log of GRANT, CONSUME, PURCHASE, REFUND
- `decision_card_runs` - tracks card lifecycle (DRAFT → CONFIRMED)
- `paper_executions` - paper trade records from confirmed cards

### API Endpoints (nova-hub)
- `GET /v1/cards/wallet` - returns balance, auto-creates wallet with 3 cards on first access
- `GET /v1/cards/ledger` - transaction history
- `POST /v1/cards/apply` - creates draft run with snapshot + deterministic simulation
- `POST /v1/cards/confirm` - atomic: consume card, update run, create paper execution
- `GET /v1/cards/executions` - list paper executions

### Frontend Components
- Card balance badge in screener header (🎴 X Cards)
- "Apply Decision Card" button on each signal (shows balance)
- DecisionCardModal with:
  - Snapshot summary (price, strategy, fitness, trust, reasons)
  - Simulation summary (expected return, win probability, drawdown, backtest)
  - Costs & tradeoffs (1 card required, risk flags)
  - Confirm & Execute button
- Error toast for failures

### Deterministic Simulation
- Seeded random from `userId + symbol + strategyId + date`
- Strategy-specific parameters (base win rate, return, volatility)
- RSI-adjusted win probability
- Produces: expectedReturn (low/mid/high), drawdownEstimate, winProbability, timeInTrade, backtest stats

## Verification

### verify:prod (29/29 pass)
```
📊 Results: 29 passed, 0 failed
✅ PRODUCTION VERIFICATION PASSED
Backend gitSha: 1ac4e5e
Web gitSha: 1ac4e5e
Web and Backend in sync: 1ac4e5e
```

### Playwright E2E Tests (4/4 pass)
```
Running 4 tests using 2 workers

ok 1 › screener page loads without card-related TypeErrors (4.3s)
ok 2 › signal card shows Apply Decision Card button (9.3s)
ok 3 › screener loads without card-related errors (6.0s)
ok 4 › card endpoints respond correctly (via network) (6.0s)

4 passed (17.7s)
```

## Non-Negotiable Rules ✅

- [x] No manual symbol entry — auto-filled from screener signal
- [x] No freeform forms for the card — prefilled snapshot
- [x] Card cannot confirm unless simulation summary present
- [x] If anything fails, show typed actionable error + TRACE excerpt (error toast)

## Files Changed

- `services/nova-hub/src/index.ts` — Decision Cards API (~300 lines)
- `infra/migrations/010_card_wallets_and_executions.sql` — 4 tables
- `apps/web/src/app/dashboard/screener/page.tsx` — UI components
- `apps/web/src/lib/api.ts` — API methods
- `apps/web/e2e/decision-cards-v1.spec.ts` — Playwright tests
- `apps/web/playwright.config.ts` — Updated base URL

## Commits

1. `1ac4e5e` — Phase 7.4: Decision Cards V1 - Wallet + Apply + Confirm + Paper Execution
2. `92d4ff8` — Phase 7.4: Add Playwright E2E tests for Decision Cards V1
