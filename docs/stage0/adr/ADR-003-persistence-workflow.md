# ADR-003: Persistence and workflow baseline

- **Status:** Accepted for Stage 1 (2026-10-29). Revisit before Stage 3 (Nova Core).
- **Related:** Brief §§10–12, 16, 17. ADR-001 for which database. ADR-004 for later owner commands.

## Context

The brief names PostgreSQL plus a transactional outbox as the enterprise baseline, and Temporal as the candidate durable-workflow engine. This repository has Postgres migrations and no running Temporal cluster, no workflow worker on the live site, and no approved email provider. Stage 1's workflow is short: save an inquiry, give the visitor a receipt, and tell the owner later.

## Decision

1. **Persistence** is a single Postgres transaction: `public_inquiries` plus `inquiry_notification_outbox` (`pending`). Commit, then call the notifier. The notifier is an interface in `nova-enterprises-site/lib/intake/notify.js`.
2. **Email is disabled.** `INTAKE_EMAIL_ENABLED` is off unless set to the string `true`. Even then, no provider is implemented, nothing is sent, and the outbox is marked `skipped` with a logged reason. The inquiry remains. A failed send is stored as `failed` and can be retried by an authenticated `POST /api/owner/notifications/retry`. There is no second scheduler and no Temporal process in Stage 1.
3. **Workflow state** for an inquiry is the `status` column: `new`, `reviewing`, `qualified`, `quoted`, `won`, `lost`, `spam`, `archived`. Stage 1 only writes `new`. Later status changes belong to the owner app and must be versioned commands (ADR-004). This ADR does not add those commands.
4. **Task state and notification state are different.** The inquiry can exist while the outbox is `pending`, `skipped`, or `failed`.
5. **Time** is stored in UTC. The owner queue and the CSV print UTC. `America/Indianapolis` is the owner's display zone for a later UI, not a second stored clock.
6. **Temporal** stays the proposed engine for Stage 3 work that must survive for days (approvals, supplier follow-up, delivery). It is not introduced now, because a notification row does not justify a new cluster or a new vendor account.
7. **Retries of external effects** stop at the outbox. Stage 1 has no payment, bid, or purchase to reconcile.

## Alternatives

- **Send mail inside the insert transaction.** Rejected. A slow or failed provider would roll back the only copy of the inquiry.
- **Temporal or a Railway worker for email.** Rejected for Stage 1. No cluster is running, and email is not approved.
- **In-memory "we will email later" with no outbox.** Rejected. A crashed function would lose the intent to notify even though the brief asks for an independent retry.

## Consequences

- Owner email to `wkirby592@gmail.com` does not start until Wyatt approves a provider and an implementation is added behind the existing interface. The flag alone does not send mail.
- Operators run `037_public_intake.sql` once per database. Vercel does not run it on deploy. Steps are in `nova-enterprises-site/README.md`.
- Stage 3 can subscribe to the same rows. It should not replace `public_inquiries` with a second queue.

## Validation

A test notifier runs only after another database connection can see the new receipt. If that notifier throws, the receipt is still returned and the outbox row is `failed`. A repeat of the same `request_id` does not call the notifier again.
