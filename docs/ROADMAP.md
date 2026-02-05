# Nova Hub - Roadmap

## Phase 0: Baseline & Recovery
**Status:** In Progress
**Goal:** Clean, working development environment

### Tasks
- [x] Inspect repo structure and toolchain
- [x] Install dependencies
- [ ] Validate Docker Compose environment
- [ ] Run and fix lint/typecheck/test
- [ ] Create documentation structure

---

## Phase 1: Sellable MVP (Milestones 1-3)
**Status:** Pending
**Goal:** A paid, usable product that's reliable

### Milestone 1: Auth + Permissions + Audit Log
**Target:** Foundation for all features

**Acceptance Criteria:**
- [ ] Unit tests for auth + RBAC + audit write/read
- [ ] Database migrations run cleanly
- [ ] Seed script for local dev
- [ ] RUNBOOK Auth completed
- [ ] RUNBOOK DB completed
- [ ] Threat model notes

**Required Scripts:**
- `npm run db:migrate`
- `npm run db:seed`
- `npm run test`
- `npm run lint`
- `npm run typecheck`

### Milestone 2: Event Log ("Lattice") + Audit Chain ✅
**Target:** Core novelty - the event-sourced decision log
**Status:** COMPLETE

**Acceptance Criteria:**
- [x] PostgresEventStore with DB-backed append-only writes
- [x] Hash chain verification function
- [x] Tamper detection tests (11 tests passing)
- [x] Admin audit verification endpoint
- [x] Event filtering and pagination

### Milestone 3: Paid Product - "Nova Hub Lite"
**Target:** Worth paying for

**Features:**
1. Personal operating dashboard (goals, tasks, daily log)
2. Decision journaling using events
3. Export (PDF/CSV)
4. Notifications (email reminders)

**Monetization:**
- Stripe subscription (test mode)
- Free tier vs Pro tier
- Paywall: exports + advanced filters + weekly reports

**Acceptance Criteria:**
- [ ] Working checkout + customer portal
- [ ] Webhook handling
- [ ] Tests for billing gating
- [ ] Billing setup documented

---

## Phase 2: Income Engines (Milestones 4-6)
**Status:** Future
**Goal:** Real utility without fake promises

### Milestone 4: TradeBot (Analytics + Paper Trading)
- Market data ingestion
- Scanner based on user rules
- Paper trading simulator
- Trade thesis card generator

### Milestone 5: StoreBot (Digital Products)
- Product research notebook
- Simple storefront module
- Stripe checkout for digital products

### Milestone 6: SocialBot (Content Ops)
- Content calendar
- Script generator
- Post-performance tracker

---

## Phase 3: Dependability (Milestones 7-9)
**Status:** Future
**Goal:** Legacy-grade engineering

### Milestone 7: Observability + Reliability
- Structured logging
- Health checks
- Metrics endpoint
- Backups

### Milestone 8: CI/CD + Release Discipline
- GitHub Actions pipeline
- Versioning and changelog
- One-command deploy

### Milestone 9: Security Hardening
- Dependency scanning
- Rate limiting
- Input validation
- Secrets management
