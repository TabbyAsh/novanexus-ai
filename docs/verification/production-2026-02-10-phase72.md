# Production Verification - Phase 7.2 (Screener Method Drift Hotfix)

**Date:** 2026-02-10
**Commit:** `7c7c6c28fd7553c56c96d7b98a466669b027e99c`
**Backend URL:** https://abackend-production.up.railway.app
**Web URL:** https://web-nine-sigma-92.vercel.app

## Problem Statement

Production console showed:
```
TypeError: d.api.runScreener is not a function
```

This was a client contract drift issue where the production UI bundle was calling methods that didn't exist.

## Root Cause Analysis

The methods (`runScreener`, `getDecisionCards`, `getAlpacaHistory`, etc.) ARE properly defined in `apps/web/src/lib/api.ts`. The issue was previously a stale deployment, now addressed in Phase 7.1.

Phase 7.2 adds **contract verification** to prevent this from happening again.

## Changes Implemented

### 1. API Contract Verification Endpoint
- **File:** `apps/web/src/app/api/contract/route.ts` (new)
- Introspects the `api` client at runtime
- Returns list of required methods and their existence status
- Returns `success: false` if any required method is missing

### 2. Contract Test in verify:prod
- **File:** `scripts/verify-prod.js`
- Added "Web API Contract (Phase 7.2)" test
- **FAILS** if any required method is missing from the API client
- Catches method drift before users hit it

### 3. Playwright UI Smoke Tests
- **File:** `apps/web/e2e/screener.spec.ts` (new)
- Tests for screener, decision-cards, analytics, dashboard pages
- **FAILS** on any `TypeError` or `is not a function` console error
- Tests that screener renders results or typed error message

### 4. Required Methods List
```typescript
const REQUIRED_METHODS = [
  'runScreener',
  'runAIScreener',
  'getDecisionCards',
  'getAlpacaHistory',
  'getAlpacaStatus',
  'getAlpacaAccount',
  'getPaperTrades',
  'createPaperTrade',
  'getUsage',
  'startGuidedFlow',
  'createThesis',
  'generateThesis',
  'getMarketQuote',
  'saveScreenerReport',
];
```

## Verification Results

```
╔══════════════════════════════════════╗
║   NOVA PRODUCTION VERIFICATION       ║
╚══════════════════════════════════════╝

📊 Results: 29 passed, 0 failed

✅ PRODUCTION VERIFICATION PASSED

✅ Backend gitSha matches local HEAD: 7c7c6c2
✅ Web gitSha: 7c7c6c2
✅ Web gitSha matches local HEAD
✅ Web and Backend in sync: 7c7c6c2
```

## Evidence

### /api/contract Response
```json
{
  "success": true,
  "contract": {
    "required": 14,
    "present": 14,
    "missing": []
  },
  "methods": {
    "runScreener": true,
    "runAIScreener": true,
    "getDecisionCards": true,
    "getAlpacaHistory": true,
    "getAlpacaStatus": true,
    "getAlpacaAccount": true,
    "getPaperTrades": true,
    "createPaperTrade": true,
    "getUsage": true,
    "startGuidedFlow": true,
    "createThesis": true,
    "generateThesis": true,
    "getMarketQuote": true,
    "saveScreenerReport": true
  },
  "error": null
}
```

### /api/version Response
```json
{
  "service": "web",
  "gitSha": "7c7c6c28fd7553c56c96d7b98a466669b027e99c",
  "buildTime": "2026-02-10T04:10:54.925Z",
  "buildId": "cli-7c7c6c2-1770696654926"
}
```

## Exit Criteria Status

| Criteria | Status |
|----------|--------|
| runScreener exists at runtime | ✅ 14/14 methods present |
| verify:prod fails if method missing | ✅ Contract test added |
| Playwright UI smoke tests | ✅ 5 tests for TypeError detection |
| No "is not a function" in prod | ✅ All methods verified |
| Web and backend in sync | ✅ Both at 7c7c6c2 |

## Commits

- `7c7c6c2` - Phase 7.2: API contract verification + Playwright UI smoke tests
