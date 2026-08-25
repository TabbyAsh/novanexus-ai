import { createHash, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool, PoolClient } from 'pg';
import {
  WORKFLOW_PILOT_PAYMENT_AUTHORITY,
  failClosedEntitlementProjection,
  type ServicePaymentReference,
} from '../billing-contract';
import {
  acquireServiceReconciliationLease,
  advanceServiceReconciliationCursor,
  applyInvoicePaymentFailureEvent,
  applyServicePayment,
  applySubscriptionEvent,
  claimServicePaymentAlerts,
  completeServicePaymentAlert,
  finishServicePaymentEvent,
  registerServicePaymentEvent,
  releaseServiceReconciliationLease,
  servicePaymentEventMayRetry,
} from '../revenue-store';

const postgresEnabled = process.env.BILLING_POSTGRES_TESTS === 'true' && Boolean(process.env.DATABASE_URL);
const describePostgres = postgresEnabled ? describe : describe.skip;
const migrationSql = readFileSync(
  resolve(__dirname, '..', '..', '..', '..', 'infra', 'migrations', '036_billing_revenue_safety.sql'),
  'utf8',
);

let pool: Pool;

async function createBaseSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE entitlements (
      user_id UUID PRIMARY KEY,
      org_id UUID NOT NULL,
      plan VARCHAR(20) NOT NULL DEFAULT 'FREE',
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      stripe_customer_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      current_period_end TIMESTAMPTZ,
      features_json JSONB DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE service_inquiries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      receipt_id VARCHAR(40) NOT NULL UNIQUE,
      service_code VARCHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'RECEIVED',
      payment_status VARCHAR(24) NOT NULL DEFAULT 'NOT_STARTED',
      stripe_checkout_session_id VARCHAR(255) UNIQUE,
      stripe_payment_intent_id VARCHAR(255),
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX service_inquiries_payment_intent_unique
      ON service_inquiries(stripe_payment_intent_id)
      WHERE stripe_payment_intent_id IS NOT NULL;
    CREATE TABLE audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID,
      action VARCHAR(100) NOT NULL,
      resource VARCHAR(100) NOT NULL,
      details_json JSONB,
      ip VARCHAR(45),
      ts TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function withSchema(
  run: (client: PoolClient, schema: string) => Promise<void>,
  options: { partialRevenueTables?: boolean } = {},
): Promise<void> {
  const schema = `billing_safety_${randomBytes(8).toString('hex')}`;
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, public`);
    await createBaseSchema(client);
    if (options.partialRevenueTables) {
      await client.query(`
        CREATE TABLE service_payment_events (event_hash VARCHAR(64));
        CREATE TABLE service_payment_reconciliation_runs (id UUID);
        CREATE TABLE service_payment_reconciliation_state (name VARCHAR(64));
        INSERT INTO service_payment_reconciliation_runs DEFAULT VALUES;
      `);
    }
    await run(client, schema);
  } finally {
    await client.query('SET search_path TO public').catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
    client.release();
  }
}

async function connectToSchema(schema: string): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query(`SET search_path TO ${schema}, public`);
  return client;
}

function payment(
  receiptId: string,
  overrides: Partial<ServicePaymentReference> = {},
): ServicePaymentReference {
  return {
    receiptId,
    checkoutSessionId: 'cs_concurrency_payment_12345678',
    paymentIntentId: 'pi_concurrency_payment',
    fullyRefunded: false,
    paidAt: '2026-08-25T12:00:00.000Z',
    refundedAt: null,
    ...overrides,
  };
}

describePostgres('billing revenue safety on PostgreSQL 16', () => {
  jest.setTimeout(120_000);

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('is expansion-only for existing paid/refunded rows and rolling old/new/rollback writers', async () => {
    await withSchema(async client => {
      const paidReceipt = `svc_${'P'.repeat(24)}`;
      const refundedReceipt = `svc_${'R'.repeat(24)}`;
      const oldWriterReceipt = `svc_${'O'.repeat(24)}`;
      const newWriterReceipt = `svc_${'N'.repeat(24)}`;
      await client.query(
        `INSERT INTO service_inquiries (receipt_id, service_code, payment_status)
         VALUES ($1, 'BACK_OFFICE_OS_STARTER', 'PAID'),
                ($2, 'BACK_OFFICE_OS_STARTER', 'REFUNDED'),
                ($3, 'BACK_OFFICE_OS_STARTER', 'NOT_STARTED'),
                ($4, 'BACK_OFFICE_OS_STARTER', 'NOT_STARTED')`,
        [paidReceipt, refundedReceipt, oldWriterReceipt, newWriterReceipt],
      );

      await client.query(migrationSql);
      await client.query(migrationSql);

      // Previous/rolled-back binary writes only legacy identifiers.
      await client.query(
        `UPDATE service_inquiries
         SET payment_status = 'PAID', stripe_checkout_session_id = 'cs_old_writer',
             stripe_payment_intent_id = 'pi_old_writer', paid_at = NOW()
         WHERE receipt_id = $1`,
        [oldWriterReceipt],
      );

      // New binary dual-writes exact authority.
      await client.query(
        `UPDATE service_inquiries
         SET payment_status = 'PAID', stripe_checkout_session_id = 'cs_new_writer',
             stripe_payment_intent_id = 'pi_new_writer',
             stripe_payment_link_id = $2, stripe_price_id = $3,
             stripe_product_id = $4, payment_amount_cents = $5,
             payment_currency = 'USD'
         WHERE receipt_id = $1`,
        [
          newWriterReceipt,
          WORKFLOW_PILOT_PAYMENT_AUTHORITY.paymentLinkId,
          WORKFLOW_PILOT_PAYMENT_AUTHORITY.priceId,
          WORKFLOW_PILOT_PAYMENT_AUTHORITY.productId,
          WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount,
        ],
      );

      await expect(client.query(
        `UPDATE service_inquiries SET stripe_payment_link_id = 'plink_wrong' WHERE receipt_id = $1`,
        [newWriterReceipt],
      )).rejects.toMatchObject({ code: '23514' });
      const legacy = await client.query(
        `SELECT payment_status, stripe_payment_link_id
         FROM service_inquiries WHERE receipt_id IN ($1, $2, $3) ORDER BY receipt_id`,
        [paidReceipt, refundedReceipt, oldWriterReceipt],
      );
      expect(legacy.rows).toHaveLength(3);
      expect(legacy.rows.every(row => row.stripe_payment_link_id === null)).toBe(true);
    });
  });

  it('repairs a partial schema and remains repeatable', async () => {
    await withSchema(async client => {
      await client.query(migrationSql);
      await client.query(migrationSql);
      const columns = await client.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND (table_name, column_name) IN (
             ('service_payment_events', 'operator_alert_next_attempt_at'),
             ('service_payment_reconciliation_runs', 'status'),
             ('service_payment_reconciliation_state', 'lease_expires_at')
           )`,
      );
      expect(columns.rows).toHaveLength(3);
      const repaired = await client.query(
        `SELECT id, status, sessions_checked, started_at
         FROM service_payment_reconciliation_runs
         ORDER BY started_at`,
      );
      expect(repaired.rows).toHaveLength(1);
      expect(repaired.rows[0]).toEqual(expect.objectContaining({
        id: expect.any(String),
        status: 'RUNNING',
        sessions_checked: 0,
        started_at: expect.any(Date),
      }));
      const inserted = await client.query(
        `INSERT INTO service_payment_reconciliation_runs DEFAULT VALUES
         RETURNING id, status, sessions_checked, recent_sessions_checked, started_at`,
      );
      expect(inserted.rows[0]).toEqual(expect.objectContaining({
        id: expect.any(String),
        status: 'RUNNING',
        sessions_checked: 0,
        recent_sessions_checked: 0,
        started_at: expect.any(Date),
      }));
    }, { partialRevenueTables: true });
  });

  it('allows an exact trusted checkout to bind a normal nonterminal entitlement initially', async () => {
    await withSchema(async client => {
      await client.query(migrationSql);
      const userId = '00000000-0000-4000-8000-000000000091';
      const orgId = '00000000-0000-4000-8000-000000000092';
      await client.query(
        `INSERT INTO entitlements (
           user_id, org_id, plan, status, stripe_customer_id,
           stripe_subscription_id, features_json
         ) VALUES ($1, $2, 'FREE', 'ACTIVE', 'cus_initial', NULL, '["free"]')`,
        [userId, orgId],
      );
      expect(await applySubscriptionEvent(client, {
        eventId: 'evt_initial_checkout', eventCreated: 50, eventKind: 'CHECKOUT_COMPLETED',
        subscriptionId: 'sub_initial', customerId: 'cus_initial',
        metadataUserId: userId, metadataOrgId: orgId,
        candidate: {
          status: 'ACTIVE', currentPeriodEnd: '2027-01-01T00:00:00.000Z', reason: 'ACCESS',
        },
        detectedPlan: 'LITE', accessFeatures: ['paid'], freeFeatures: ['free'],
      })).toMatchObject({ kind: 'APPLIED', status: 'ACTIVE', plan: 'LITE', terminal: false });
      const row = await client.query(
        `SELECT plan, stripe_subscription_id, stripe_subscription_terminal
         FROM entitlements WHERE user_id = $1`,
        [userId],
      );
      expect(row.rows[0]).toMatchObject({
        plan: 'LITE', stripe_subscription_id: 'sub_initial', stripe_subscription_terminal: false,
      });
    });
  });

  it('repairs a rolling old-writer checkout with the same ID but keeps a freshly canceled candidate terminal', async () => {
    await withSchema(async client => {
      const activeUserId = '00000000-0000-4000-8000-000000000093';
      const canceledUserId = '00000000-0000-4000-8000-000000000094';
      const orgId = '00000000-0000-4000-8000-000000000095';
      await client.query(
        `INSERT INTO entitlements (
           user_id, org_id, plan, status, stripe_customer_id,
           stripe_subscription_id, features_json
         ) VALUES
           ($1, $3, 'FREE', 'CANCELED', 'cus_rolling_active', NULL, '["free"]'),
           ($2, $3, 'FREE', 'CANCELED', 'cus_rolling_canceled', 'sub_still_canceled', '["free"]')`,
        [activeUserId, canceledUserId, orgId],
      );
      await client.query(migrationSql);

      const migrated = await client.query(
        `SELECT user_id::text, stripe_subscription_terminal
         FROM entitlements ORDER BY user_id`,
      );
      expect(migrated.rows).toEqual([
        { user_id: activeUserId, stripe_subscription_terminal: true },
        { user_id: canceledUserId, stripe_subscription_terminal: true },
      ]);

      // During a rolling deploy/rollback, the old binary can complete the
      // legitimate checkout but cannot clear the newly added tombstone.
      await client.query(
        `UPDATE entitlements
         SET status = 'ACTIVE', plan = 'LITE',
             stripe_subscription_id = 'sub_rolling_fresh', features_json = '["paid"]'
         WHERE user_id = $1`,
        [activeUserId],
      );
      const beforeRetry = await client.query(
        `SELECT status, stripe_subscription_id, stripe_subscription_terminal
         FROM entitlements WHERE user_id = $1`,
        [activeUserId],
      );
      expect(beforeRetry.rows[0]).toMatchObject({
        status: 'ACTIVE',
        stripe_subscription_id: 'sub_rolling_fresh',
        stripe_subscription_terminal: true,
      });

      const repaired = await applySubscriptionEvent(client, {
        eventId: 'evt_rolling_retry_active', eventCreated: 500, eventKind: 'CHECKOUT_COMPLETED',
        subscriptionId: 'sub_rolling_fresh', customerId: 'cus_rolling_active',
        metadataUserId: activeUserId, metadataOrgId: orgId,
        candidate: {
          status: 'ACTIVE', currentPeriodEnd: '2027-03-01T00:00:00.000Z', reason: 'ACCESS',
        },
        detectedPlan: 'LITE', accessFeatures: ['paid'], freeFeatures: ['free'],
      });
      expect(repaired).toMatchObject({ kind: 'APPLIED', status: 'ACTIVE', terminal: false });
      expect((await client.query(
        `SELECT status, plan, stripe_subscription_terminal
         FROM entitlements WHERE user_id = $1`,
        [activeUserId],
      )).rows[0]).toMatchObject({ status: 'ACTIVE', plan: 'LITE', stripe_subscription_terminal: false });

      const deleted = await applySubscriptionEvent(client, {
        eventId: 'evt_rolling_deleted', eventCreated: 600, eventKind: 'SUBSCRIPTION_DELETED',
        subscriptionId: 'sub_rolling_fresh', customerId: 'cus_rolling_active',
        metadataUserId: activeUserId, metadataOrgId: orgId,
        candidate: { status: 'CANCELED', currentPeriodEnd: null, reason: 'CANCELED' },
        detectedPlan: null, accessFeatures: [], freeFeatures: ['free'],
      });
      expect(deleted).toMatchObject({ kind: 'APPLIED', status: 'CANCELED', terminal: true });
      const delayedCheckout = await applySubscriptionEvent(client, {
        eventId: 'evt_rolling_delayed_checkout', eventCreated: 550, eventKind: 'CHECKOUT_COMPLETED',
        subscriptionId: 'sub_rolling_fresh', customerId: 'cus_rolling_active',
        metadataUserId: activeUserId, metadataOrgId: orgId,
        candidate: {
          status: 'ACTIVE', currentPeriodEnd: '2027-03-01T00:00:00.000Z', reason: 'ACCESS',
        },
        detectedPlan: 'LITE', accessFeatures: ['paid'], freeFeatures: ['free'],
      });
      expect(delayedCheckout).toMatchObject({ kind: 'IGNORED', reason: 'STALE_EVENT' });

      const stillCanceled = await applySubscriptionEvent(client, {
        eventId: 'evt_rolling_retry_canceled', eventCreated: 500, eventKind: 'CHECKOUT_COMPLETED',
        subscriptionId: 'sub_still_canceled', customerId: 'cus_rolling_canceled',
        metadataUserId: canceledUserId, metadataOrgId: orgId,
        candidate: { status: 'CANCELED', currentPeriodEnd: null, reason: 'CANCELED' },
        detectedPlan: null, accessFeatures: [], freeFeatures: ['free'],
      });
      expect(stillCanceled).toMatchObject({ kind: 'APPLIED', status: 'CANCELED', terminal: true });

      const finalRows = await client.query(
        `SELECT user_id::text, status, plan, stripe_subscription_terminal
         FROM entitlements ORDER BY user_id`,
      );
      expect(finalRows.rows).toEqual([
        { user_id: activeUserId, status: 'CANCELED', plan: 'FREE', stripe_subscription_terminal: true },
        { user_id: canceledUserId, status: 'CANCELED', plan: 'FREE', stripe_subscription_terminal: true },
      ]);
    });
  });

  it('keeps delete tombstones monotonic across delayed checkout/update and identity failure', async () => {
    await withSchema(async client => {
      await client.query(migrationSql);
      const userId = '00000000-0000-4000-8000-000000000101';
      const orgId = '00000000-0000-4000-8000-000000000102';
      await client.query(
        `INSERT INTO entitlements (
           user_id, org_id, plan, status, stripe_customer_id,
           stripe_subscription_id, features_json
         ) VALUES ($1, $2, 'LITE', 'ACTIVE', 'cus_safety', 'sub_safety', '["base"]')`,
        [userId, orgId],
      );
      const activeCandidate = {
        status: 'ACTIVE' as const,
        currentPeriodEnd: '2027-01-01T00:00:00.000Z',
        reason: 'ACCESS' as const,
      };

      const deleted = await applySubscriptionEvent(client, {
        eventId: 'evt_delete_200', eventCreated: 200, eventKind: 'SUBSCRIPTION_DELETED',
        subscriptionId: 'sub_safety', customerId: 'cus_safety',
        metadataUserId: userId, metadataOrgId: orgId,
        candidate: { status: 'CANCELED', currentPeriodEnd: null, reason: 'CANCELED' },
        detectedPlan: null, accessFeatures: [], freeFeatures: [],
      });
      expect(deleted.kind).toBe('APPLIED');

      for (const [eventKind, eventId] of [
        ['SUBSCRIPTION_UPDATED', 'evt_update_150'],
        ['CHECKOUT_COMPLETED', 'evt_checkout_175'],
      ] as const) {
        const delayed = await applySubscriptionEvent(client, {
          eventId, eventCreated: eventKind === 'SUBSCRIPTION_UPDATED' ? 150 : 175, eventKind,
          subscriptionId: 'sub_safety', customerId: 'cus_safety',
          metadataUserId: userId, metadataOrgId: orgId,
          candidate: activeCandidate, detectedPlan: 'LITE', accessFeatures: ['access'], freeFeatures: [],
        });
        expect(delayed).toMatchObject({ kind: 'IGNORED', reason: 'STALE_EVENT' });
      }

      const finalRow = await client.query(
        `SELECT status, stripe_subscription_id, stripe_subscription_terminal,
                stripe_subscription_event_created
         FROM entitlements WHERE user_id = $1`,
        [userId],
      );
      expect(finalRow.rows[0]).toMatchObject({
        status: 'CANCELED',
        stripe_subscription_id: 'sub_safety',
        stripe_subscription_terminal: true,
        stripe_subscription_event_created: '200',
      });

      const secondUser = '00000000-0000-4000-8000-000000000103';
      await client.query(
        `INSERT INTO entitlements (
           user_id, org_id, plan, status, stripe_customer_id,
           stripe_subscription_id, features_json
         ) VALUES ($1, $2, 'LITE', 'ACTIVE', 'cus_identity', 'sub_identity', '["base"]')`,
        [secondUser, orgId],
      );
      const identityFailure = await applySubscriptionEvent(client, {
        eventId: 'evt_identity_250', eventCreated: 250, eventKind: 'SUBSCRIPTION_UPDATED',
        subscriptionId: 'sub_identity', customerId: 'cus_identity',
        metadataUserId: null, metadataOrgId: null,
        candidate: activeCandidate, detectedPlan: 'LITE', accessFeatures: ['access'], freeFeatures: [],
      });
      expect(identityFailure).toMatchObject({ kind: 'FAIL_CLOSED', status: 'PAST_DUE' });
      const mismatchedIdentity = await applySubscriptionEvent(client, {
        eventId: 'evt_identity_260', eventCreated: 260, eventKind: 'SUBSCRIPTION_UPDATED',
        subscriptionId: 'sub_identity', customerId: 'cus_identity',
        metadataUserId: '00000000-0000-4000-8000-000000000999', metadataOrgId: orgId,
        candidate: activeCandidate, detectedPlan: 'LITE', accessFeatures: ['access'], freeFeatures: [],
      });
      expect(mismatchedIdentity).toMatchObject({ kind: 'FAIL_CLOSED', status: 'PAST_DUE' });
    });
  });

  it('preserves legacy/old-writer cancellation, permits only trusted replacement, and denies terminal access', async () => {
    await withSchema(async client => {
      const userId = '00000000-0000-4000-8000-000000000111';
      const orgId = '00000000-0000-4000-8000-000000000112';
      await client.query(
        `INSERT INTO entitlements (
           user_id, org_id, plan, status, stripe_customer_id,
           stripe_subscription_id, features_json
         ) VALUES ($1, $2, 'LITE', 'CANCELED', 'cus_legacy', NULL, '["paid"]')`,
        [userId, orgId],
      );

      await client.query(migrationSql);
      let row = await client.query(
        `SELECT status, stripe_subscription_id, stripe_subscription_terminal
         FROM entitlements WHERE user_id = $1`,
        [userId],
      );
      expect(row.rows[0]).toMatchObject({
        status: 'CANCELED', stripe_subscription_id: null, stripe_subscription_terminal: true,
      });

      const activeCandidate = {
        status: 'ACTIVE' as const,
        currentPeriodEnd: '2027-02-01T00:00:00.000Z',
        reason: 'ACCESS' as const,
      };
      const delayed = await applySubscriptionEvent(client, {
        eventId: 'evt_legacy_delayed', eventCreated: 100, eventKind: 'SUBSCRIPTION_UPDATED',
        subscriptionId: 'sub_legacy_old', customerId: 'cus_legacy',
        metadataUserId: userId, metadataOrgId: orgId,
        candidate: activeCandidate, detectedPlan: 'LITE', accessFeatures: ['paid'], freeFeatures: ['free'],
      });
      expect(delayed.kind).toBe('IGNORED');

      const checkout = await applySubscriptionEvent(client, {
        eventId: 'evt_trusted_checkout', eventCreated: 200, eventKind: 'CHECKOUT_COMPLETED',
        subscriptionId: 'sub_trusted_new', customerId: 'cus_legacy',
        metadataUserId: userId, metadataOrgId: orgId,
        candidate: activeCandidate, detectedPlan: 'LITE', accessFeatures: ['paid'], freeFeatures: ['free'],
      });
      expect(checkout).toMatchObject({ kind: 'APPLIED', status: 'ACTIVE', terminal: false });
      row = await client.query(
        `SELECT status, stripe_subscription_id, stripe_subscription_terminal
         FROM entitlements WHERE user_id = $1`,
        [userId],
      );
      expect(row.rows[0]).toMatchObject({
        status: 'ACTIVE', stripe_subscription_id: 'sub_trusted_new', stripe_subscription_terminal: false,
      });

      // Simulate a rolled-back/old writer that cannot set the new tombstone.
      await client.query(
        `UPDATE entitlements
         SET status = 'CANCELED', stripe_subscription_id = NULL,
             stripe_subscription_terminal = FALSE
         WHERE user_id = $1`,
        [userId],
      );
      const afterOldWriter = await applySubscriptionEvent(client, {
        eventId: 'evt_after_old_writer', eventCreated: 300, eventKind: 'SUBSCRIPTION_UPDATED',
        subscriptionId: 'sub_trusted_new', customerId: 'cus_legacy',
        metadataUserId: userId, metadataOrgId: orgId,
        candidate: activeCandidate, detectedPlan: 'LITE', accessFeatures: ['paid'], freeFeatures: ['free'],
      });
      expect(afterOldWriter.kind).toBe('IGNORED');

      // Even an inconsistent active row is projected as terminal/free.
      await client.query(
        `UPDATE entitlements
         SET status = 'ACTIVE', plan = 'LITE', features_json = '["paid"]',
             stripe_subscription_id = 'sub_trusted_new',
             stripe_subscription_terminal = TRUE
         WHERE user_id = $1`,
        [userId],
      );
      expect(await applyInvoicePaymentFailureEvent(client, {
        eventId: 'evt_terminal_invoice_failure', eventCreated: 400,
        subscriptionId: 'sub_trusted_new', customerId: 'cus_legacy',
        metadataUserId: null, metadataOrgId: null,
        candidate: { status: 'PAST_DUE', currentPeriodEnd: null, reason: 'NON_ACCESS_STATUS' },
        detectedPlan: null, accessFeatures: [], freeFeatures: ['free'],
        eventHash: 'f'.repeat(64), auditTimestamp: '2026-08-25T12:00:00.000Z',
      })).toMatchObject({ kind: 'IGNORED', reason: 'TERMINAL_TOMBSTONE' });
      const inconsistent = await client.query(
        `SELECT plan, status, current_period_end, features_json,
                stripe_subscription_terminal
         FROM entitlements WHERE user_id = $1`,
        [userId],
      );
      expect(failClosedEntitlementProjection({
        plan: inconsistent.rows[0].plan,
        status: inconsistent.rows[0].status,
        currentPeriodEnd: inconsistent.rows[0].current_period_end,
        features: inconsistent.rows[0].features_json,
        terminal: inconsistent.rows[0].stripe_subscription_terminal,
        freeFeatures: ['free'],
      })).toEqual({
        plan: 'FREE', status: 'CANCELED', currentPeriodEnd: null,
        features: ['free'], terminal: true,
      });
    });
  });

  it('serializes webhook/reconciliation binding and never double-binds identifiers', async () => {
    await withSchema(async (client, schema) => {
      await client.query(migrationSql);
      const receipts = [`svc_${'A'.repeat(24)}`, `svc_${'B'.repeat(24)}`];
      await client.query(
        `INSERT INTO service_inquiries (receipt_id, service_code, status, payment_status)
         VALUES ($1, 'BACK_OFFICE_OS_STARTER', 'SCOPE_ACCEPTED', 'NOT_STARTED'),
                ($2, 'BACK_OFFICE_OS_STARTER', 'SCOPE_ACCEPTED', 'NOT_STARTED')`,
        receipts,
      );
      const workers = await Promise.all([connectToSchema(schema), connectToSchema(schema)]);
      try {
        const results = await Promise.all(workers.map(async (worker, index) => {
          await worker.query('BEGIN');
          try {
            const result = await applyServicePayment(worker, payment(receipts[index]));
            await worker.query('COMMIT');
            return result;
          } catch (error) {
            await worker.query('ROLLBACK');
            throw error;
          }
        }));
        expect(results.filter(result => result.kind === 'RECORD_PAID')).toHaveLength(1);
        expect(results.filter(result => result.kind === 'EXCEPTION')).toHaveLength(1);
        const bound = await client.query(
          `SELECT receipt_id, payment_status FROM service_inquiries
           WHERE stripe_payment_intent_id = 'pi_concurrency_payment'`,
        );
        expect(bound.rows).toHaveLength(1);
        expect(bound.rows[0].payment_status).toBe('PAID');
      } finally {
        workers.forEach(worker => worker.release());
      }
    });
  });

  it('retries an operator-correctable exception once and converges idempotently to PAID', async () => {
    await withSchema(async client => {
      await client.query(migrationSql);
      const receiptId = `svc_${'E'.repeat(24)}`;
      const eventHash = 'e'.repeat(64);
      const reference = payment(receiptId, {
        checkoutSessionId: 'cs_corrected_payment_12345678',
        paymentIntentId: 'pi_corrected_payment',
      });
      const hash = (value: string) => createHash('sha256').update(value).digest('hex');
      const claimInput = {
        eventHash,
        source: 'WEBHOOK' as const,
        eventType: 'checkout.session.completed',
        stripeCreated: 1_777_000_000,
        receiptHash: hash(receiptId),
        checkoutSessionHash: hash(reference.checkoutSessionId),
        paymentIntentHash: hash(reference.paymentIntentId),
      };

      expect(await registerServicePaymentEvent(client, claimInput)).toBe(true);
      const first = await applyServicePayment(client, reference);
      expect(first).toEqual({ kind: 'EXCEPTION', reason: 'UNKNOWN_RECEIPT' });
      if (first.kind !== 'EXCEPTION') throw new Error('fixture must begin as an exception');
      await finishServicePaymentEvent(client, eventHash, 'EXCEPTION', first.reason);

      await client.query(
        `INSERT INTO service_inquiries (receipt_id, service_code, status, payment_status)
         VALUES ($1, 'BACK_OFFICE_OS_STARTER', 'SCOPE_ACCEPTED', 'NOT_STARTED')`,
        [receiptId],
      );
      await client.query(
        `UPDATE service_payment_events
         SET last_attempt_at = NOW() - INTERVAL '31 seconds'
         WHERE event_hash = $1`,
        [eventHash],
      );
      expect(await servicePaymentEventMayRetry(client, eventHash)).toBe(true);
      expect(await registerServicePaymentEvent(client, claimInput)).toBe(true);

      const corrected = await applyServicePayment(client, reference);
      expect(corrected.kind).toBe('RECORD_PAID');
      await finishServicePaymentEvent(client, eventHash, 'PROCESSED', 'PAYMENT_RECORDED');
      expect(await registerServicePaymentEvent(client, claimInput)).toBe(false);

      const state = await client.query(
        `SELECT processing_status, reason_code, processing_attempts, operator_alert_status
         FROM service_payment_events WHERE event_hash = $1`,
        [eventHash],
      );
      expect(state.rows[0]).toMatchObject({
        processing_status: 'PROCESSED',
        reason_code: 'PAYMENT_RECORDED',
        processing_attempts: 2,
        operator_alert_status: 'NOT_REQUIRED',
      });
      const inquiry = await client.query(
        `SELECT payment_status FROM service_inquiries WHERE receipt_id = $1`,
        [receiptId],
      );
      expect(inquiry.rows[0].payment_status).toBe('PAID');
    });
  });

  it('requires the exact invoice subscription and writes its audit atomically', async () => {
    await withSchema(async client => {
      await client.query(migrationSql);
      const userId = '00000000-0000-4000-8000-000000000121';
      const orgId = '00000000-0000-4000-8000-000000000122';
      await client.query(
        `INSERT INTO entitlements (
           user_id, org_id, plan, status, stripe_customer_id,
           stripe_subscription_id, features_json
         ) VALUES ($1, $2, 'LITE', 'ACTIVE', 'cus_shared', 'sub_exact', '["paid"]')`,
        [userId, orgId],
      );
      const base = {
        eventCreated: 400,
        customerId: 'cus_shared',
        metadataUserId: null,
        metadataOrgId: null,
        candidate: { status: 'PAST_DUE' as const, currentPeriodEnd: null, reason: 'NON_ACCESS_STATUS' as const },
        detectedPlan: null,
        accessFeatures: [],
        freeFeatures: ['free'],
        auditTimestamp: '2026-08-25T12:00:00.000Z',
      };
      expect(await applyInvoicePaymentFailureEvent(client, {
        ...base,
        eventId: 'evt_invoice_without_subscription',
        eventHash: 'a'.repeat(64),
        subscriptionId: null,
      })).toMatchObject({ kind: 'UNRESOLVED', reason: 'SUBSCRIPTION_ID_MISSING' });
      expect((await client.query(`SELECT status FROM entitlements WHERE user_id = $1`, [userId])).rows[0].status)
        .toBe('ACTIVE');
      expect((await client.query(`SELECT COUNT(*)::int AS count FROM audit_logs`)).rows[0].count).toBe(0);

      expect(await applyInvoicePaymentFailureEvent(client, {
        ...base,
        eventId: 'evt_invoice_exact_subscription',
        eventHash: 'b'.repeat(64),
        subscriptionId: 'sub_exact',
      })).toMatchObject({ kind: 'APPLIED', status: 'PAST_DUE' });
      const audit = await client.query(
        `SELECT user_id::text, action, details_json FROM audit_logs`,
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        user_id: userId,
        action: 'INVOICE_PAYMENT_FAILED',
        details_json: expect.objectContaining({ eventHash: 'b'.repeat(64), status: 'PAST_DUE' }),
      });
    });
  });

  it('converges paid, partial-to-full, and refund-before-checkout observations to REFUNDED', async () => {
    await withSchema(async client => {
      await client.query(migrationSql);
      const paidReceipt = `svc_${'C'.repeat(24)}`;
      const refundFirstReceipt = `svc_${'D'.repeat(24)}`;
      await client.query(
        `INSERT INTO service_inquiries (receipt_id, service_code, status, payment_status)
         VALUES ($1, 'BACK_OFFICE_OS_STARTER', 'SCOPE_ACCEPTED', 'NOT_STARTED'),
                ($2, 'BACK_OFFICE_OS_STARTER', 'SCOPE_ACCEPTED', 'NOT_STARTED')`,
        [paidReceipt, refundFirstReceipt],
      );

      expect((await applyServicePayment(client, payment(paidReceipt))).kind).toBe('RECORD_PAID');
      await client.query(
        `INSERT INTO service_payment_events (
           event_hash, source, event_type, processing_status, reason_code,
           payment_intent_hash, operator_alert_status
         ) VALUES ($1, 'RECONCILIATION', 'checkout.session.reconciliation', 'EXCEPTION',
                   'PAYMENT_INTENT_PARTIALLY_REFUNDED', $2, 'PENDING')`,
        ['c'.repeat(64), 'd'.repeat(64)],
      );
      expect((await applyServicePayment(client, payment(paidReceipt, {
        fullyRefunded: true,
        refundedAt: '2026-08-25T13:00:00.000Z',
      }))).kind).toBe('RECORD_REFUNDED');

      await client.query(
        `INSERT INTO service_payment_events (
           event_hash, source, event_type, processing_status, reason_code,
           payment_intent_hash, operator_alert_status
         ) VALUES ($1, 'WEBHOOK', 'charge.refunded', 'EXCEPTION',
                   'UNKNOWN_PAYMENT_INTENT', $2, 'PENDING')`,
        ['a'.repeat(64), 'b'.repeat(64)],
      );
      expect((await applyServicePayment(client, payment(refundFirstReceipt, {
        checkoutSessionId: 'cs_refund_first_12345678',
        paymentIntentId: 'pi_refund_first',
        fullyRefunded: true,
        refundedAt: '2026-08-25T13:05:00.000Z',
      }))).kind).toBe('RECORD_REFUNDED');

      const rows = await client.query(
        `SELECT receipt_id, payment_status, paid_at, refunded_at
         FROM service_inquiries ORDER BY receipt_id`,
      );
      expect(rows.rows.map(row => row.payment_status)).toEqual(['REFUNDED', 'REFUNDED']);
      expect(rows.rows.every(row => row.paid_at && row.refunded_at)).toBe(true);
    });
  });

  it('shares one durable lease and hands the cursor past 1,000 sessions', async () => {
    await withSchema(async (client, schema) => {
      await client.query(migrationSql);
      const workers = await Promise.all([connectToSchema(schema), connectToSchema(schema)]);
      try {
        const claims = await Promise.all([
          acquireServiceReconciliationLease(workers[0], 'replica-one', 600),
          acquireServiceReconciliationLease(workers[1], 'replica-two', 600),
        ]);
        expect(claims.filter(Boolean)).toHaveLength(1);
        const winner = claims[0] ? 'replica-one' : 'replica-two';
        const winnerClient = claims[0] ? workers[0] : workers[1];
        expect(await advanceServiceReconciliationCursor(winnerClient, winner, 'cs_session_1000', 600)).toBe(true);
        expect(await releaseServiceReconciliationLease(winnerClient, winner, false)).toBe(true);

        const next = await acquireServiceReconciliationLease(client, 'next-run', 600);
        expect(next?.startingAfter).toBe('cs_session_1000');
        expect(await advanceServiceReconciliationCursor(client, 'next-run', 'cs_session_1001', 600)).toBe(true);
        expect(await releaseServiceReconciliationLease(client, 'next-run', true)).toBe(true);
        const state = await client.query(
          `SELECT starting_after, lease_owner FROM service_payment_reconciliation_state
           WHERE name = 'WORKFLOW_PILOT'`,
        );
        expect(state.rows[0]).toEqual(expect.objectContaining({ starting_after: null, lease_owner: null }));
      } finally {
        workers.forEach(worker => worker.release());
      }
    });
  });

  it('claims alerts with SKIP LOCKED, timeout/backoff state, and fairness beyond 20 failures', async () => {
    await withSchema(async client => {
      await client.query(migrationSql);
      const values: any[] = [];
      const rows: string[] = [];
      for (let index = 0; index < 21; index += 1) {
        values.push(index.toString(16).padStart(64, '0'));
        rows.push(`($${index + 1}, 'RECONCILIATION', 'test.exception', 'EXCEPTION', 'TEST_FAILURE', 'PENDING')`);
      }
      await client.query(
        `INSERT INTO service_payment_events (
           event_hash, source, event_type, processing_status, reason_code, operator_alert_status
         ) VALUES ${rows.join(',')}`,
        values,
      );
      const first = await claimServicePaymentAlerts(client, 'alert-worker-one', 20, 120);
      expect(first).toHaveLength(20);
      for (const claim of first) {
        expect(await completeServicePaymentAlert(client, claim, 'alert-worker-one', 'FAILED')).toBe(true);
      }
      const second = await claimServicePaymentAlerts(client, 'alert-worker-two', 20, 120);
      expect(second).toHaveLength(1);
      const state = await client.query(
        `SELECT operator_alert_attempts, operator_alert_next_attempt_at
         FROM service_payment_events WHERE event_hash = $1`,
        [first[0].event_hash],
      );
      expect(state.rows[0].operator_alert_attempts).toBe(1);
      expect(state.rows[0].operator_alert_next_attempt_at).toBeTruthy();
    });
  });
});
