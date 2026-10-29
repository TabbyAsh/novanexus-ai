# Stage 0 backlog

Ordered from the architecture brief §22. This list is the queue. It is not permission to merge, promote, buy, or email.

## Now (this preview branch)

- [x] Inventory, ownership map, ADR-001, ADR-002, ADR-003.
- [x] Durable intake for three public paths: buyer/sourcing, supplier, services (research and data, software and AI).
- [x] Persist first, receipt `NOVA-YYYYMMDD-XXXX`, idempotent `request_id`, owner notify behind a disabled interface.
- [x] Owner queue and ledger-shaped CSV, server-checked secret, formula-safe export.
- [x] Homepage states Nova Enterprises LLC (Terre Haute) and the three divisions without the removed sourcing claims.
- [x] `/privacy`. Production smoke workflow updated in git. It still runs from `master` until that file is on the default branch. Do not merge it there as part of this work.

## Owner must do before intake is live on a deployment

- [ ] Create the free Neon Postgres (approved) and attach `DATABASE_URL` to the Vercel project. Preview and production can be separate databases.
- [ ] Run `infra/migrations/037_public_intake.sql` against that database (command in `nova-enterprises-site/README.md`).
- [ ] Set `OWNER_ACCESS_SECRET` (16+ characters) on the Vercel environment that should show `/owner`.
- [ ] Set `INTAKE_IP_SALT` (a long random string). Intake stores nothing if it is missing. There is no built-in default.
- [ ] Leave `INTAKE_EMAIL_ENABLED` unset. The Resend idea in `docs/stage0/owner-alert-proposal.md` is a proposal only: no account, no DNS change, and no mail.
- [ ] Decide Vercel Hobby vs Pro for a commercial site (ADR-002). Do not upgrade from this backlog item alone.
- [ ] Promote a preview only after checking it. Production DNS stays as it is.

## Next, not in this branch

- [ ] Stage 1 finish: owner status changes (`new` → `reviewing` → …) as versioned commands with `expected_version`. Same table.
- [ ] Real owner email behind `lib/intake/notify.js`, retried from the outbox, still after commit.
- [ ] Stage 2: one sourcing workflow (qualify, written quote, approval, delivery, compensation) with evidence. No claim of completed deals until one exists.
- [ ] Stage 3: one workflow engine (Temporal is the candidate in ADR-003) for work that lasts longer than a request. Retire extra schedulers only after listing them.
- [ ] Stage 4: Atlas at `/atlas` per ADR-004. Blocked until intake is real. Passkeys, not a second database.
- [ ] Ledger: Postgres remains the inquiry authority. Nova Operations Lead keeps `deal-ledger.csv`. Export only, until a later ADR moves the ledger.
- [ ] Fix or retire Railway after a dashboard check. Do not delete it blind.
- [ ] `service_inquiries` (035/036): leave it until a named migration maps any real pilot rows. Do not dual-write.
- [ ] Privacy review of the committed dev credentials listed by path in `docs/stage0/inventory.md`.
- [ ] Stages 5–8 (estate, more ventures, self-improvement, hardware) stay later. No purchases from this list.

## Explicitly not approved

Production merge, Vercel production promotion, DNS edits, new paid services, new third-party accounts, email sends, and submitting the live `novanexus-ai.com` form.
