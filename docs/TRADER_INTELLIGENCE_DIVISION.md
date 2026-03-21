# Nova Trader Intelligence — Division Blueprint

> **Status**: Active commercial division
> **Doctrine**: Sell the output, not the machine.

---

## 1. The Offer (One Sentence)

**Nova delivers a daily curated breakout watchlist with structured setup logic
for active retail traders who want filtered opportunities, not raw noise.**

---

## 2. Customer-Facing Positioning

### Who this is for
- Active retail traders (swing and momentum, 1–10 day holds)
- People who trade stocks, not crypto (initially)
- Traders who already know what a breakout, pullback, or mean-reversion setup is
- People who are drowning in scanners and want structured filtering done for them

### Who this is NOT for
- Complete beginners who don't know what RSI means
- Passive investors looking for "set and forget"
- People expecting trade signals with guaranteed returns

### The value proposition
> You open your inbox. You see 5–12 names. Each one has a setup type, entry
> logic, invalidation level, and confidence tier. You didn't scan for 2 hours.
> You didn't miss the one that was sitting right there. You decide what to act
> on. Nova did the filtering. You do the trading.

### Positioning language (for landing page / pitch)
- "Structured breakout intelligence, delivered daily."
- "Nova scans 200+ names so you don't have to."
- "Not signals. Not tips. Structured setups with logic you can verify."
- "The watchlist you'd build if you had 3 hours every morning."

---

## 3. The Exact Deliverable

### Report name
**Nova Daily Brief**

### Delivery cadence
- Daily, pre-market (before 9:00 AM ET)
- Optional mid-week update for active setups

### Report structure

```
═══════════════════════════════════════════════════
NOVA DAILY BRIEF — [Date]
Market Regime: [TRENDING / RANGING / HIGH VOL / TRANSITIONAL]
═══════════════════════════════════════════════════

── PRIORITY SETUPS (3–5 names) ──────────────────

[1] AAPL — Breakout Long
    Setup:     Consolidation squeeze near 52wk high, volume building
    Entry:     Above $192.50 (break of resistance)
    Stop:      $187.20 (below 20 SMA)
    Target 1:  $198.00 (+2.9%)
    Target 2:  $204.00 (+6.0%)
    R:R:       1:2.4
    Confidence: ●●●○ (B-tier)
    Regime fit: Trending regime favors breakout continuation
    Caution:   Earnings in 12 days — position size accordingly
    Invalidation: Close below $186, or failed breakout on declining volume

[2] NVDA — Trend Pullback
    Setup:     Pulled back to rising 20 SMA in strong uptrend (ADX 32)
    Entry:     $875–880 zone (bounce confirmation from SMA)
    Stop:      $858 (below 50 SMA)
    Target 1:  $910 (+3.8%)
    Target 2:  $940 (+7.2%)
    R:R:       1:2.1
    Confidence: ●●●● (A-tier)
    Regime fit: Strong trend + pullback to support = high-probability
    Caution:   Sector rotation risk — watch SOX index
    Invalidation: Closes below 50 SMA on heavy volume

[...more setups...]

── SUPPORTING SETUPS (4–7 names) ────────────────

  These are developing or lower-confidence. Watch, don't chase.

  MSFT  — Building base near $420, needs volume catalyst
  AMD   — Mean reversion candidate, RSI 28, but no bottom signal yet
  META  — Squeeze forming, Bollinger width at 90-day low
  [...]

── WATCH ONLY ───────────────────────────────────

  Names on radar but not actionable today:
  TSLA, AMZN, GOOGL — ranging, no clean setup

── REGIME CONTEXT ───────────────────────────────

  SPY:  Above all major MAs, ADX 24 (borderline trend)
  VIX:  14.2 — low vol regime, favors directional plays
  QQQ:  Slight bearish divergence on RSI — watch for stall
  Note: Fed minutes Wednesday — reduce size into event

═══════════════════════════════════════════════════
Nova Trader Intelligence — novanexus-ai.com
Not financial advice. Trade your own plan.
═══════════════════════════════════════════════════
```

### Key design rules for the report
1. **Every name has a setup type** — no vague "looks interesting"
2. **Every name has entry, stop, target, R:R** — the trader can act or discard immediately
3. **Every name has an invalidation** — know when the thesis is dead
4. **Confidence is tiered** — A/B/C or ●●●● scale, not fake precision percentages
5. **Regime context is mandatory** — the environment shapes which setups work
6. **Caution flags are explicit** — earnings, FOMC, sector risk
7. **"Watch only" section exists** — prevents FOMO on names that aren't ready

---

## 4. Commercial Framing

### Pricing tiers

**Founding Member** — $29/month (locked for life)
- Daily Brief (pre-market)
- Full setup logic on every name
- Mid-week update
- Limited to first 50 members

**Standard** — $49/month (after founding closes)
- Daily Brief (pre-market)
- Full setup logic on every name
- Mid-week update

**Pro** — $99/month (future)
- Everything in Standard
- Dashboard access (when live)
- Decision card interface
- Journal + outcome tracking
- Weekly performance review

### Why founding pricing works
- Creates urgency (limited seats)
- Rewards early trust
- Locks in recurring revenue at lower CAC
- Generates testimonials and feedback loop

### Payment path
- Stripe checkout (already implemented in billing service)
- Simple landing page → pricing → checkout → access
- No platform login required for initial delivery (email/Discord/Telegram)
- Platform login required for Pro tier (dashboard access)

---

## 5. Delivery Channels (Phase II)

### Primary: Email
- Formatted HTML email with the report structure above
- Sent via simple SMTP or service (SendGrid, Resend, Postmark)
- No app download required

### Secondary: Discord / Telegram
- Private channel for founding members
- Same content as email, formatted for chat
- Enables community without building it from scratch

### Future: Dashboard (Phase IV)
- Logged-in experience on novanexus-ai.com
- Interactive decision cards
- Journal integration
- Historical watchlist archive
- This is the productization layer — comes after manual delivery proves value

---

## 6. Internal Production Workflow

How Nova produces the Daily Brief:

```
Step 1: DATA GATHER (automated)
  └─ Run screener engine against 200+ symbols
  └─ Fetch quotes (Alpaca → Yahoo fallback)
  └─ Compute full indicators (RSI, SMA, MACD, ADX, Bollinger, ATR, etc.)
  └─ Detect regime (trending/ranging/high-vol/low-vol)

Step 2: SIGNAL GENERATION (automated)
  └─ Build trade cards with setup classification
  └─ Classify into boards (breakout, pullback, mean-revert, short)
  └─ Score by confidence and regime fit
  └─ Sort by expected value

Step 3: CURATION (human-assisted)
  └─ Review top 20 trade cards
  └─ Apply discretionary filters (earnings dates, sector context, news)
  └─ Select 3–5 priority + 4–7 supporting
  └─ Write the entry/stop/target/invalidation for each
  └─ Add regime context paragraph

Step 4: PACKAGE (semi-automated)
  └─ Format into Daily Brief template
  └─ Generate email/Discord/Telegram versions

Step 5: DELIVER
  └─ Send to subscribers
  └─ Log what was sent

Step 6: LEARN (post-market)
  └─ Track which setups triggered
  └─ Track which hit T1, T2, or stopped out
  └─ Feed results back into confidence calibration
```

Steps 1–2 are what the existing Nova codebase already does.
Steps 3–4 are the human layer that makes the output trustworthy.
Steps 5–6 close the feedback loop.

---

## 7. What Already Exists in Nova for This

| Capability | Status | Used for |
|-----------|--------|----------|
| Screener engine (200+ symbols) | ✅ Built | Step 1 |
| Multi-source market data (Alpaca/Yahoo/Polygon) | ✅ Built | Step 1 |
| Full technical indicators | ✅ Built | Step 1 |
| Regime detection | ✅ Built | Step 1 |
| Trade card builder with board classification | ✅ Built | Step 2 |
| Confidence scoring | ✅ Built | Step 2 |
| Setup type classification (breakout/pullback/mean-revert/short) | ✅ Built | Step 2 |
| Decision card storage | ✅ Built | Step 2 |
| Stripe billing + entitlements | ✅ Built | Payment path |
| Auth + user management | ✅ Built | Future dashboard |
| Journal + outcome tracking | ✅ Built | Step 6 |
| Calibration (Brier score) | ✅ Built | Step 6 |

**The intelligence engine exists. The commercial wrapper does not yet.**
That is the gap Phase II closes.

---

## 8. First Proof Artifacts Needed

Before launching to anyone:

1. **3 sample Daily Briefs** — real dates, real data, full structure
2. **Landing page copy** — one page, clear offer, pricing, checkout link
3. **Email template** — HTML formatted Daily Brief
4. **Founding member signup flow** — Stripe checkout → access confirmation

These are not planning documents. They are the first artifacts of a live division.

---

## 9. Risk Disclosure (Required)

Every output must include:
- "Not financial advice"
- "Past setups do not predict future performance"
- "Trade at your own risk with your own plan"
- "Nova provides structured analysis, not trade recommendations"

Legal pages already exist at `apps/web/src/app/terms`, `apps/web/src/app/privacy`,
and `docs/legal/RISK_DISCLOSURE.md`.

---

## 10. Success Metrics

| Metric | Target (90 days) |
|--------|-------------------|
| Founding members | 20–50 |
| MRR | $580–$1,450 |
| Daily Brief delivery rate | 95%+ (weekdays) |
| Setup accuracy tracking | Active logging |
| Customer retention (month 2) | >60% |
| Sample outputs produced | 3+ before launch |

---

*This document is the operating definition of Nova's first commercial division.
It replaces speculation with specification.*
