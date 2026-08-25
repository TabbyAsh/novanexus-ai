# Billing revenue-safety deployment and recovery

This runbook covers migration `036_billing_revenue_safety.sql`, Workflow Setup
Pilot payment reconciliation, subscription tombstones, and operator recovery.
It does not authorize changing Stripe objects or manually marking an inquiry
paid without a verified Stripe observation.

## Required configuration

Configure these values in the billing service before deployment:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY` in valid `re_...` form
- `SERVICE_INQUIRY_OPERATOR_EMAIL`
- `SERVICE_PAYMENT_RESOLVER_TOKEN`

The gateway and billing service must receive the exact same
`SERVICE_PAYMENT_RESOLVER_TOKEN`. It must be 32-128 base64url characters and
must not be a repeated-character placeholder. Generate it with a cryptographic
random generator; for example, Node's `randomBytes(32).toString('base64url')`.
Do not paste the token into tickets, logs, URLs, or this repository.

Keep `SERVICE_PAYMENT_RECONCILIATION_DISABLED` unset or `false`. Configure
`BILLING_URL` in the gateway when billing is not reachable at the localhost
default.

## Deployment sequence

1. Back up the production database using the normal platform procedure.
2. Apply migration `036_billing_revenue_safety.sql` before starting the new
   billing binary. The migration is expansion/rollback compatible and backfills
   legacy `CANCELED` entitlements as terminal.
3. Deploy gateway and billing with the same resolver token. A rolling old
   binary may still write legacy columns; the new reader treats `CANCELED` or a
   tombstone as terminal. A fresh, identity-matched active checkout can clear
   that tombstone even when the old writer already stored the same subscription
   ID. A freshly retrieved canceled subscription cannot clear it.
4. Verify billing `/health`. Database liveness remains independent of revenue
   configuration, but the response must show `paymentOperationsReady: true`.
5. Verify billing `/ready` returns HTTP 200. It intentionally returns 503 when
   Stripe, webhook signing, alert delivery, operator email, or the resolver
   credential is not ready. Railway currently probes `/health`, not `/ready`,
   so the platform healthcheck does not enforce this revenue gate. Treat the
   manual `/ready` 200 response as a required deployment hold point.
6. Verify the gateway resolver requires an authenticated `ops.admin` token and
   that successful responses include `Cache-Control: private, no-store`.
7. Monitor `service_payment_reconciliation_state.last_recent_scan_at`,
   `last_recent_sessions_checked`, `last_success_at`, and `last_error_code`.
   The recent 25 sessions are checked independently of the durable historical
   cursor.

`customer.subscription.updated` remains disabled. Do not enable it as part of
this deployment.

## Resolve a payment exception

1. Start from the redacted 64-character `eventHash` in the operator alert.
2. Obtain a candidate Checkout Session ID from the Stripe dashboard. Do not put
   it in logs or a query string.
3. Call the gateway endpoint with an authenticated `ops.admin` bearer token:

   ```text
   POST /v1/admin/billing/payment-exceptions/{eventHash}/resolve
   Content-Type: application/json

   {"checkoutSessionId":"cs_live_..."}
   ```

   The gateway replaces the operator credential with the internal resolver
   token, performs one bounded lookup, and compares the candidate to stored
   hashes. A 404 means the candidate did not match; do not bypass it.
4. Correct only the underlying inquiry defect identified by the reason code.
   Typical operator-correctable reasons are `UNKNOWN_RECEIPT` and
   `INQUIRY_NOT_ELIGIBLE`. Confirm the inquiry has the exact receipt, service
   code, and an accepted status. Never directly set `payment_status = 'PAID'`.
5. Allow normal reconciliation to retry. Correctable exceptions have a
   30-second cooldown and at most five controlled processing attempts. New
   sessions are covered by the recent pass; older sessions follow the durable
   historical cursor.
6. Confirm the ledger becomes `PROCESSED`, the inquiry becomes `PAID` or
   `REFUNDED`, exact Link/Price/Product/amount/currency authority is populated,
   and no new exception alert remains pending.

Provider-authority failures such as a wrong Link, Price, Product, amount,
currency, or metadata are not operator-retryable. Investigate them; do not
re-arm or override them.

## Exhausted retry recovery

Use this only after the hash-side resolver matched the candidate, the inquiry
was corrected, and `processing_attempts` reached five for an allowed reason.
The operation only re-arms one hashed ledger row; it does not grant access or
mark a payment paid. Use `psql` variables so the hash is passed as a value:

```sql
\set event_hash 'replace_with_64_lowercase_hex_event_hash'
BEGIN;

SELECT event_hash, source, reason_code, processing_status, processing_attempts
FROM service_payment_events
WHERE event_hash = :'event_hash'
  AND :'event_hash' ~ '^[a-f0-9]{64}$'
FOR UPDATE;

UPDATE service_payment_events
SET processing_attempts = 4,
    last_attempt_at = NOW() - INTERVAL '31 seconds',
    operator_alert_status = 'PENDING',
    operator_alert_next_attempt_at = NOW(),
    operator_alert_lease_owner = NULL,
    operator_alert_lease_until = NULL
WHERE event_hash = :'event_hash'
  AND :'event_hash' ~ '^[a-f0-9]{64}$'
  AND processing_status = 'EXCEPTION'
  AND reason_code IN ('UNKNOWN_RECEIPT', 'INQUIRY_NOT_ELIGIBLE', 'REFUND_OUT_OF_SEQUENCE')
  AND processing_attempts >= 5
RETURNING event_hash, reason_code, processing_attempts, last_attempt_at;

-- COMMIT only when exactly one expected row was returned; otherwise ROLLBACK.
COMMIT;
```

After committing, follow the row's `source`:

- A `RECONCILIATION` row uses the deterministic observation hash and will be
  consumed by the scheduled reconciliation pass when that Session is scanned.
- A `WEBHOOK` row uses the Stripe event hash. Re-arming it does not make the
  reconciliation scheduler consume that row; the exact Stripe event must be
  safely resent through the signed webhook path. Reconciliation may still
  create and process its own distinct observation for the same verified
  Session.

Verify the resulting ledger and inquiry state. If the update returns no row,
rollback and investigate rather than broadening the predicate.

## Rollback

Application rollback does not require dropping the new columns or tables. The
previous binary can continue writing legacy inquiry and entitlement fields.
Keep migration 036 applied, keep the subscription-update webhook disabled, and
retain alert/reconciliation monitoring while the rollback is active.
