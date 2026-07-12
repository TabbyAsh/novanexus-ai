# Nexus / Nova — Founder Brief

> **Status**: Living document. Updated with each sprint.
> **Purpose**: Truthful summary of what is built, what is live, and what is next.
> **Audience**: Founder, advisors, potential early partners.

---

## Current Spearpoint

Nova is the realization of AI potential; Nexus is the company and interaction
engine through which humans direct and experience her. The current commercial
spearpoint is trader intelligence, led by the **Nova Daily Brief** — a
pre-market watchlist of structured stock setups with entry, stop, target,
confidence tier, and regime context, delivered to subscribers daily. This is a
revenue and learning wedge, not the definition of Nova.

## What Is Actually Live

### Product
- **AI Screener**: Scans 200+ symbols using multi-source data (Alpaca, Yahoo Finance, Polygon, Finnhub)
- **Daily Brief Generator**: Automated screener → brief → email delivery pipeline
- **Decision Cards**: Structured opportunity packets with entry/stop/target/R:R
- **Paper Trading Simulator**: Risk-free practice environment
- **Outcome Tracking**: Post-market classification of every setup (hit T1, hit T2, stopped out, no trigger)
- **Governance System**: Auto-classifies setup types by win rate, quarantines underperformers

### Infrastructure
- **13 TypeScript services** in a monorepo (Turborepo)
- **Frontend**: Next.js on Vercel (novanexus-ai.com)
- **Backend**: Express services on Railway with PM2 process management
- **Database**: PostgreSQL with 21 migrations (users, entitlements, events, outcomes, governance)
- **CI/CD**: GitHub Actions (build, strict typecheck, lint, test, esbuild bundle verification)
- **Scheduler**: Automated pre-market brief delivery (8:30 AM ET) + post-market outcome tracking (4:30 PM ET)
- **Health monitoring**: Every 5 minutes, all services checked, Discord alerts on failure

### Revenue System
- **Stripe billing**: FREE / LITE ($29/mo) / FOUNDING ($99/mo) / PRO ($149/mo) tiers
- **Founding member seats**: Limited to 50, tracked from real entitlements
- **Referral system**: $10 credit per referral, full generate/validate/redeem loop
- **Welcome email**: Sent automatically on new subscription via Resend API

### Founder Control
- **Command Center** at /admin: 16-section enterprise pulse (MRR, subscribers, outcomes, governance, economics, scheduler, threats, opportunities, conversion funnel, action audit)
- **Kill switch**: Disables all automation with one click
- **Governance overrides**: Manually promote/demote setup type eligibility
- **Cooldown-protected triggers**: Manual brief/outcome/health triggers with audit logging

## What Is Gated by Data

These features are built and deployed but become visible only when real data accumulates:

| Feature | Gate | Current State |
|---|---|---|
| Brief performance proof on pricing page | ≥10 resolved outcomes | Waiting for outcome tracking to accumulate |
| Governance panel in /admin | Outcome tracking must populate brief_outcomes | Empty until briefs are sent + outcomes tracked |
| Calibration metrics | Same as governance | Waiting |
| Conversion funnel in /admin | New subscribers must flow through Stripe | Shows zeros until first paid conversion |

## Known Blockers

| Blocker | Impact | Resolution |
|---|---|---|
| RESEND_API_KEY not set | Welcome + brief emails don't send | Set in Railway env |
| DISCORD_WEBHOOK_URL not set | No health alerts to Discord | Set in Railway env (optional) |
| Railway deployment | Backend must be deployed for API endpoints to work | Deploy via `railway up` or configure RAILWAY_TOKEN in GitHub |
| Production migrations | Tables 019-021 must exist for scheduler, command, governance | Run via `psql` against production DB |
| Tradebot typecheck | Pre-existing TS2339 type errors with nexus-core | Excluded from CI typecheck with documented reason |

## Metrics Available Today

The command center at /admin surfaces all of these from real database queries:

- MRR (gross and net)
- Subscriber count by plan (FREE/LITE/PRO/FOUNDING)
- User registration count (7d/30d)
- Brief delivery success rate
- Setup outcome breakdown (HIT_T1/HIT_T2/STOPPED_OUT/ACTIVE/NO_TRIGGER)
- Win rate (when resolved outcomes ≥1)
- Governance state by setup type
- Service health status
- Scheduler run history
- Command action audit trail
- Weekly review history

## What Is Not Built Yet

- Live trading (requires Alpaca with real capital — paper trading only)
- Social media automation (SocialBot exists as skeleton)
- E-commerce automation (StoreBot exists as skeleton)
- Advanced charting / trend visualization
- Customer support pipeline
- Content marketing automation
- Mobile app
- Team/multi-user collaboration

## Next Milestones

1. First 10 resolved outcomes → pricing page proof becomes visible
2. First paid subscriber → welcome email sends, conversion funnel populates
3. First week of daily briefs → governance auto-computes, calibration metrics populate
4. 20+ founding members → revenue meaningful for reinvestment
5. 90-day track record → credible performance data for marketing

---

*This document describes what is real, not what is planned. Update it when reality changes.*
