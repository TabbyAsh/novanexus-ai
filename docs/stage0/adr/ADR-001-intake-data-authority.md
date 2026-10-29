# ADR-001: Intake data authority

- **Status:** Accepted for Stage 1 (2026-10-29).
- **Owner:** Engineering. **Approver:** Wyatt Kirby (preview only; production promotion is a separate decision).
- **Related:** Architecture brief §§9–12, 19, 21.1, 21.6. ADR-004 (Atlas) stays a draft and is not built here.

## Context

The live quote form posts to FormSubmit and stores nothing in a system Nova controls. FormSubmit was not a reliable path at inventory time. Older code already persists a different product: `service_inquiries` (migrations 035 and 036) for the Next.js workflow-setup pilot, with Stripe fields and `svc_…` receipts. That table is the authority for that pilot only. The estate notes mention SQLite. Google Sheets and the deal-ledger CSV are files a person edits. None of these is the public website's record of a sourcing, supplier, or services inquiry.

## Decision

1. **Postgres is the authority** for public website inquiries. The table is `public_inquiries` in the database `DATABASE_URL` points at (a Neon database the owner attaches to the existing Vercel project). Migration: `infra/migrations/037_public_intake.sql`. It does not alter `service_inquiries`.
2. **One writer:** the Vercel intake function (`POST /api/intake`). The browser, FormSubmit, Railway, and the CSV export do not write this table.
3. **Write order:** validate, then insert the inquiry and an `inquiry_notification_outbox` row in **one transaction**, commit, then notify. Notification failure updates the outbox and leaves the inquiry in place.
4. **Identity:** every row has `org_id = nova-enterprises-llc`, a `receipt_id` (`NOVA-YYYYMMDD-XXXX`), and `version` starting at 1. Timestamps are `timestamptz` (UTC).
5. **Idempotency:** client `request_id` is unique per org. The same id and the same payload hash return the original receipt and do not notify again. The same id with a different hash is rejected (422). A form posted with JavaScript disabled may omit `request_id`; the server then assigns one so the inquiry is still saved. A second click without an id can create a second row. The confirmation page always shows the receipt or a visible error.
6. **The CSV is an export**, not a store. Spreadsheet formulas are neutralized. The deal-ledger file is not written by this code.
7. **`service_inquiries` stays** the legacy pilot authority until someone migrates those rows on purpose. This ADR does not do that.

## Alternatives

- **Keep FormSubmit.** Rejected. Nova does not hold the record, and the provider was not accepting a reliable delivery path.
- **Reuse `service_inquiries`.** Rejected as the public authority. Its required challenge text, service-code check, and payment columns describe a different offer. The idempotency and "persist, then notify" ideas are reused.
- **SQLite, Sheets, or the ledger CSV as the store.** Rejected. A second writer would split the inquiry from the receipt the visitor sees.
- **Railway / nova-hub as the only writer.** Rejected for Stage 1. The live site does not reach that process (ADR-002).

## Consequences

- Preview and production must not share one database if test submissions should stay out of the owner queue. The row's `source` is `website` in production and `website-preview` when `VERCEL_ENV=preview`.
- Atlas (ADR-004), when built, reads this same Postgres. It does not create another inquiry table.
- Applying 001–036 to the new Neon database is unnecessary. 037 is safe on an empty database and safe after the historical migrations.

## Validation

Tests insert with a real Postgres, read the row back from a second connection before treating notification as done, and reject a second payload for the same `request_id`. Unauthorized reads return no rows.
