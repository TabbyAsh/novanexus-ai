const crypto = require('crypto');
const { Pool } = require('pg');
const { ORG_ID, OWNER_EMAIL } = require('./constants');

const RECEIPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LIST_SQL = `
  SELECT inquiry_type AS type,
         receipt_id,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
         name,
         COALESCE(company, '') AS company,
         email,
         COALESCE(phone, '') AS phone,
         COALESCE(country, '') AS country,
         COALESCE(product_or_service, '') AS product_or_service,
         COALESCE(quantity_text, '') AS quantity_text,
         COALESCE(target_date::text, '') AS target_date,
         COALESCE(notes, '') AS notes,
         source,
         status
    FROM public_inquiries
   WHERE org_id = $1
   ORDER BY created_at DESC, receipt_id DESC
   LIMIT 500`;

let pool;
let poolUrl;

function sslFor(connectionString) {
  if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString)) return false;
  return { rejectUnauthorized: true };
}

function getPool(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  if (!pool || poolUrl !== connectionString) {
    if (pool) pool.end().catch(() => {});
    poolUrl = connectionString;
    pool = new Pool({
      connectionString,
      max: 4,
      ssl: sslFor(connectionString),
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 8000,
      statement_timeout: 8000,
      application_name: 'nova-intake',
    });
  }
  return pool;
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  poolUrl = undefined;
  await current.end();
}

function makeReceiptId(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const bytes = crypto.randomBytes(4);
  let suffix = '';
  for (let index = 0; index < 4; index += 1) suffix += RECEIPT_ALPHABET[bytes[index] % RECEIPT_ALPHABET.length];
  return `NOVA-${year}${month}${day}-${suffix}`;
}

function payloadHash(inquiry) {
  const canonical = {
    company: inquiry.company,
    country: inquiry.country,
    email: inquiry.email,
    inquiryType: inquiry.inquiryType,
    name: inquiry.name,
    notes: inquiry.notes,
    phone: inquiry.phone,
    productOrService: inquiry.productOrService,
    quantityText: inquiry.quantityText,
    source: inquiry.source,
    targetDate: inquiry.targetDate,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function ipHash(req, env) {
  const forwarded = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  const ip = forwarded || String((req.headers && req.headers['x-real-ip']) || 'unknown');
  const pepper = (env && env.INTAKE_IP_HASH_PEPPER) || 'nova-intake-v1';
  return crypto.createHash('sha256').update(`${pepper}|${ip}`).digest('hex');
}

async function consumeRateLimit(db, hash, limit) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO intake_rate_events (ip_hash) VALUES ($1)', [hash]);
    const count = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM intake_rate_events
        WHERE ip_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [hash],
    );
    await client.query(`DELETE FROM intake_rate_events WHERE created_at < NOW() - INTERVAL '2 days'`);
    await client.query('COMMIT');
    return count.rows[0].n <= limit;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* connection already failed */ }
    throw error;
  } finally {
    client.release();
  }
}

async function insertInquiry(client, inquiry, hash, now) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const receiptId = makeReceiptId(now);
    await client.query('SAVEPOINT receipt_insert');
    try {
      const inserted = await client.query(
        `INSERT INTO public_inquiries (
           org_id, receipt_id, request_id, payload_hash, inquiry_type, status,
           name, company, email, phone, country, product_or_service, quantity_text,
           target_date, notes, source, version
         ) VALUES (
           $1, $2, $3, $4, $5, 'new',
           $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, 1
         )
         ON CONFLICT (org_id, request_id) DO NOTHING
         RETURNING id, receipt_id`,
        [
          ORG_ID,
          receiptId,
          inquiry.requestId,
          hash,
          inquiry.inquiryType,
          inquiry.name,
          inquiry.company,
          inquiry.email,
          inquiry.phone,
          inquiry.country,
          inquiry.productOrService,
          inquiry.quantityText,
          inquiry.targetDate,
          inquiry.notes,
          inquiry.source,
        ],
      );
      await client.query('RELEASE SAVEPOINT receipt_insert');
      if (inserted.rowCount === 1) {
        return { id: inserted.rows[0].id, receiptId: inserted.rows[0].receipt_id };
      }
      const existing = await client.query(
        `SELECT receipt_id, payload_hash
           FROM public_inquiries
          WHERE org_id = $1 AND request_id = $2`,
        [ORG_ID, inquiry.requestId],
      );
      if (existing.rowCount !== 1) throw new Error('Idempotent inquiry insert could not be confirmed.');
      if (existing.rows[0].payload_hash !== hash) return { conflict: true };
      return { replay: true, receiptId: existing.rows[0].receipt_id };
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT receipt_insert');
      if (error.code === '23505' && /receipt/.test(String(error.constraint || ''))) continue;
      throw error;
    }
  }
  throw new Error('Could not allocate a receipt id.');
}

async function recordDelivery(db, inquiryId, delivery) {
  await db.query(
    `UPDATE inquiry_notification_outbox
        SET status = $2,
            attempt_count = attempt_count + 1,
            last_error = $3,
            updated_at = NOW()
      WHERE inquiry_id = $1 AND status = 'pending'`,
    [inquiryId, delivery.status, delivery.detail || null],
  );
}

function acceptedDelivery(delivery, fallback) {
  if (delivery && ['sent', 'skipped', 'failed'].includes(delivery.status)) return delivery;
  return { status: 'failed', detail: fallback };
}

/**
 * Insert the inquiry and its notification outbox row, commit, then notify.
 * The notifier is not invoked for an idempotent replay or a payload conflict.
 */
async function persistInquiry(db, inquiry, notifier, now = new Date()) {
  const client = await db.connect();
  let outcome;
  try {
    await client.query('BEGIN');
    const hash = payloadHash(inquiry);
    const inserted = await insertInquiry(client, inquiry, hash, now);
    if (inserted.conflict) {
      await client.query('ROLLBACK');
      outcome = { kind: 'conflict' };
    } else if (inserted.replay) {
      await client.query('COMMIT');
      outcome = { kind: 'replay', receiptId: inserted.receiptId };
    } else {
      await client.query(
        `INSERT INTO inquiry_notification_outbox (inquiry_id, org_id, channel, recipient, status)
         VALUES ($1, $2, 'email', $3, 'pending')`,
        [inserted.id, ORG_ID, OWNER_EMAIL],
      );
      await client.query('COMMIT');
      outcome = { kind: 'created', receiptId: inserted.receiptId, inquiryId: inserted.id };
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already aborted */ }
    throw error;
  } finally {
    client.release();
  }

  if (outcome.kind !== 'created') return outcome;

  let delivery;
  try {
    delivery = acceptedDelivery(
      await notifier.send({
        receiptId: outcome.receiptId,
        inquiryId: outcome.inquiryId,
        to: OWNER_EMAIL,
        inquiry,
      }),
      'Notifier returned an unknown status.',
    );
  } catch (error) {
    delivery = { status: 'failed', detail: String(error && error.message ? error.message : error).slice(0, 500) };
  }

  try {
    await recordDelivery(db, outcome.inquiryId, delivery);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'intake_outbox_update_failed',
      receipt_id: outcome.receiptId,
      message: error.message,
    }));
  }
  return { kind: 'created', receiptId: outcome.receiptId, notification: delivery.status };
}

async function listInquiries(db) {
  const result = await db.query(LIST_SQL, [ORG_ID]);
  return result.rows;
}

async function retryNotifications(db, notifier, limit = 25) {
  const pending = await db.query(
    `SELECT o.id, o.inquiry_id, i.receipt_id
       FROM inquiry_notification_outbox o
       JOIN public_inquiries i ON i.id = o.inquiry_id
      WHERE o.org_id = $1 AND o.status IN ('pending', 'failed')
      ORDER BY o.created_at ASC
      LIMIT $2`,
    [ORG_ID, limit],
  );
  const results = [];
  for (const row of pending.rows) {
    let delivery;
    try {
      delivery = acceptedDelivery(
        await notifier.send({
          receiptId: row.receipt_id,
          inquiryId: row.inquiry_id,
          to: OWNER_EMAIL,
          retry: true,
        }),
        'Notifier returned an unknown status.',
      );
    } catch (error) {
      delivery = { status: 'failed', detail: String(error && error.message ? error.message : error).slice(0, 500) };
    }
    await db.query(
      `UPDATE inquiry_notification_outbox
          SET status = $2,
              attempt_count = attempt_count + 1,
              last_error = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [row.id, delivery.status, delivery.detail || null],
    );
    results.push({ receipt_id: row.receipt_id, status: delivery.status });
  }
  return results;
}

module.exports = {
  ORG_ID,
  closePool,
  consumeRateLimit,
  getPool,
  ipHash,
  listInquiries,
  payloadHash,
  persistInquiry,
  retryNotifications,
};
