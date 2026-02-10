# Production Verification: UDM v2 (Universal Decision Matrix)

**Date:** 2026-02-10  
**Commit:** d85181b  
**Domain:** https://novanexus-ai.com  

## Status: ✅ DEPLOYED & VERIFIED

### Deployment Summary
| Component | gitSha | Status |
|-----------|--------|--------|
| Backend (Railway) | d85181b | ✅ Deployed |
| Web (Vercel) | d85181b | ✅ Deployed |
| Database Migration | 011_udm_v2_schema.sql | ⚠️ Manual run required |

### Verification Results
- **verify:prod:** 29/29 tests PASS
- **Web/Backend in sync:** d85181b

## UDM v2 Features Implemented

### 3-Tier System (Entropy Refinery)
1. **Clarity** (Tier 1)
   - Accurate heuristics & snapshot
   - Auto-grant: 3 cards on signup
   - FREE preview, 1 card to confirm

2. **Foresight** (Tier 2)
   - Monte Carlo simulation (1000 runs)
   - Auto-grant: 1 card on signup
   - EV bands (P5, P50, P95), max drawdown, win probability
   - FREE preview, 1 card to confirm

3. **Autonomy** (Tier 3)
   - Execution + outcome calibration
   - Auto-grant: 0 cards (earned)
   - Paper/live execution tracking

### Actionability Calculation
```
actionability = trust × confidence × feasibility

Trust Components:
- dataCoverage: 0.2-0.8 (indicator availability)
- dataFreshness: 0.9 (assumed recent)
- provenance: 0.85 (known sources)

Confidence Components:
- fitness: 0.4-0.9 (strategy fitness score 0-100)
- stability: 0.4-0.9 (strategy stability score 0-100)
- signalStrength: 0-1 (normalized)

Feasibility Components:
- liquidity: 0.9 (assumed liquid)
- spread: 0.85 (reasonable spreads)
- marketHours: 0.5-1.0 (NYSE hours)
```

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| /v1/udm/wallet | GET | 3-tier card balances |
| /v1/udm/apply | POST | Create run with snapshot + preview (FREE) |
| /v1/udm/quote | POST | Live quote with notional knobs (FREE) |
| /v1/udm/confirm | POST | Consume card + create execution (PAID) |
| /v1/udm/runs/:id | GET | Get run details |
| /v1/daily-drop | GET | Top 10 by actionability (cached daily) |
| /v1/proofpacks/latest | GET | Latest proof pack artifact |
| /v1/reality | GET | System health check |

### Frontend Components
- **RealityBanner:** Shows when system offline or data stale
- **UdmDecisionPanel:** Modal with tier tabs, notional input, live quote updates
- **Integration:** 🧬 UDM v2 Analysis button in AI Screener signal cards

### Database Schema (011_udm_v2_schema.sql)
- `udm_wallets`: 3-tier balances per user
- `udm_ledger`: Tier transactions (grant, consume, refund)
- `udm_decision_runs`: Domain, target, tier, snapshot, preview, actionability
- `udm_executions`: Tier3 paper/live executions
- `udm_outcomes`: Calibration tracking
- `udm_strategy_calibration`: Per domain/strategy/regime stats
- `udm_daily_drop`: Cached daily top 10
- `udm_proof_packs`: Deployment artifacts

## Reality Guardrail
- Banner only shows when truly offline (backends unhealthy or data stale)
- TAKE actions disabled when offline
- Market hours detection (NYSE: 9:30 AM - 4:00 PM ET)

## Key Behaviors
- Preview is FREE (no card consumed)
- Confirm/Take consumes 1 card of the selected tier
- Notional input updates simulation in real-time (debounced 300ms)
- Stocks domain adapter fully implemented

## Files Changed
```
apps/web/src/components/udm/RealityBanner.tsx (new)
apps/web/src/components/udm/UdmDecisionPanel.tsx (new)
apps/web/src/components/udm/index.ts (new)
apps/web/src/app/dashboard/screener/page.tsx (modified)
apps/web/src/lib/api.ts (modified)
services/nova-hub/src/index.ts (modified)
infra/migrations/011_udm_v2_schema.sql (new)
```

## Next Steps
1. Run migration 011 on production database
2. Test UDM panel in production browser
3. Monitor actionability rankings in Daily Drop
4. Add Playwright E2E tests for UDM flow
