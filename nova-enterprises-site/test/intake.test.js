const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, beforeEach, describe, test } = require('node:test');
const {
  handleHealth,
  handleIntake,
  handleOwnerExport,
  handleOwnerInquiries,
  handleOwnerMigrate,
  handleOwnerNotificationRetry,
  handleOwnerQueue,
  handlePurge,
} = require('../lib/intake/handlers');
const { applyPublicIntakeMigration, loadMigrationSql } = require('../lib/intake/migrate');
const { closePool, getPool } = require('../lib/intake/store');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://nova:nova_ci_password@127.0.0.1:5432/nova';
const OWNER_SECRET = 'test-owner-secret-16';

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload) {
      this.body = payload == null ? '' : String(payload);
    },
  };
}

async function invoke(handler, { method = 'GET', headers = {}, body, notifier, env, persistInquiry } = {}) {
  const req = { method, headers, body };
  const res = mockRes();
  await handler(req, res, { env: env || process.env, notifier, persistInquiry });
  let json;
  const type = String(res.headers['content-type'] || '');
  if (type.includes('application/json') && res.body) json = JSON.parse(res.body);
  return { ...res, json };
}

function buyer(overrides = {}) {
  return {
    inquiry_type: 'buyer_sourcing',
    request_id: crypto.randomUUID(),
    name: 'Avery Buyer',
    company: 'Example Retail',
    email: 'avery.buyer@example.com',
    phone: '812-555-0100',
    country: 'United States',
    product: 'Cotton terry towels',
    quantity: '200 towels',
    target_date: '2026-11-15',
    notes: 'White hotel bath towels.',
    ...overrides,
  };
}

async function counts() {
  const db = getPool(process.env.DATABASE_URL);
  const inquiries = await db.query('SELECT COUNT(*)::int AS n FROM public_inquiries');
  const outbox = await db.query('SELECT COUNT(*)::int AS n FROM inquiry_notification_outbox');
  return { inquiries: inquiries.rows[0].n, outbox: outbox.rows[0].n };
}

describe('public intake', { concurrency: 1 }, () => {
  before(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.OWNER_ACCESS_SECRET = OWNER_SECRET;
    process.env.INTAKE_IP_SALT = 'test-intake-ip-salt';
    process.env.INTAKE_EMAIL_ENABLED = 'false';
    delete process.env.VERCEL_ENV;
    const sql = fs.readFileSync(path.join(__dirname, '../../infra/migrations/037_public_intake.sql'), 'utf8');
    await getPool(DATABASE_URL).query(sql);
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.OWNER_ACCESS_SECRET = OWNER_SECRET;
    process.env.INTAKE_IP_SALT = 'test-intake-ip-salt';
    process.env.INTAKE_RATE_LIMIT_PER_HOUR = '30';
    await getPool(DATABASE_URL).query('TRUNCATE public_inquiries, intake_rate_events RESTART IDENTITY CASCADE');
  });

  after(async () => {
    await closePool();
  });

  test('persists the inquiry before notification and keeps it when notification throws', async () => {
    const calls = [];
    const notifier = {
      async send(message) {
        const seen = await getPool(DATABASE_URL).query(
          `SELECT i.receipt_id, o.status
             FROM public_inquiries i
             JOIN inquiry_notification_outbox o ON o.inquiry_id = i.id
            WHERE i.receipt_id = $1`,
          [message.receiptId],
        );
        calls.push(seen.rows[0] || null);
        throw new Error('smtp down');
      },
    };
    const payload = buyer({ email: 'notify-fail@example.com', name: 'Notify Fail' });
    const response = await invoke(handleIntake, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: payload,
      notifier,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.stored, true);
    assert.match(response.json.receipt_id, /^NOVA-\d{8}-[A-Z0-9]{4}$/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, 'pending');
    assert.equal(calls[0].receipt_id, response.json.receipt_id);
    const stored = await getPool(DATABASE_URL).query(
      `SELECT i.receipt_id, i.created_at, o.status, o.attempt_count
         FROM public_inquiries i
         JOIN inquiry_notification_outbox o ON o.inquiry_id = i.id
        WHERE i.email = $1`,
      ['notify-fail@example.com'],
    );
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].status, 'failed');
    assert.equal(stored.rows[0].attempt_count, 1);
    assert.equal(stored.rows[0].created_at.toISOString().endsWith('Z'), true);

    const retryNotifier = {
      async send() {
        return { status: 'sent', detail: 'test provider accepted' };
      },
    };
    const retry = await invoke(handleOwnerNotificationRetry, {
      method: 'POST',
      headers: { accept: 'application/json', authorization: `Bearer ${OWNER_SECRET}` },
      notifier: retryNotifier,
    });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json.results[0].status, 'sent');
    const afterRetry = await getPool(DATABASE_URL).query(
      `SELECT status FROM inquiry_notification_outbox WHERE inquiry_id = (
         SELECT id FROM public_inquiries WHERE email = 'notify-fail@example.com'
       )`,
    );
    assert.equal(afterRetry.rows[0].status, 'sent');
  });

  test('returns the same receipt for a duplicate request id and does not notify twice', async () => {
    let sends = 0;
    const notifier = {
      async send() {
        sends += 1;
        return { status: 'skipped', detail: 'test' };
      },
    };
    const payload = buyer({ request_id: 'req-duplicate-0001', email: 'dup@example.com' });
    const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.11' };
    const first = await invoke(handleIntake, { method: 'POST', headers, body: payload, notifier });
    const second = await invoke(handleIntake, { method: 'POST', headers, body: { ...payload }, notifier });
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(second.json.replay, true);
    assert.equal(second.json.receipt_id, first.json.receipt_id);
    assert.equal(sends, 1);
    const tally = await counts();
    assert.equal(tally.inquiries, 1);
    assert.equal(tally.outbox, 1);
  });

  test('rejects the same request id when the payload differs', async () => {
    const payload = buyer({ request_id: 'req-conflict-00001', email: 'first@example.com' });
    const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.12' };
    const first = await invoke(handleIntake, { method: 'POST', headers, body: payload });
    const second = await invoke(handleIntake, {
      method: 'POST',
      headers,
      body: { ...payload, email: 'second@example.com' },
    });
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 422);
    assert.equal(second.json.error, 'idempotency_conflict');
    const rows = await getPool(DATABASE_URL).query('SELECT email FROM public_inquiries');
    assert.deepEqual(rows.rows.map(row => row.email), ['first@example.com']);
  });

  test('rejects invalid inquiries without storing them or notifying', async () => {
    let sends = 0;
    const notifier = { async send() { sends += 1; return { status: 'skipped', detail: 'test' }; } };
    const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.13' };
    const badEmail = await invoke(handleIntake, {
      method: 'POST',
      headers,
      body: buyer({ email: 'not-an-email', request_id: 'req-invalid-email1' }),
      notifier,
    });
    const missingQuantity = await invoke(handleIntake, {
      method: 'POST',
      headers,
      body: buyer({ quantity: '', request_id: 'req-invalid-qty0001' }),
      notifier,
    });
    assert.equal(badEmail.statusCode, 400);
    assert.equal(badEmail.json.fields.email.includes('valid email'), true);
    assert.match(badEmail.json.message, /wkirby592@gmail.com/);
    assert.equal(missingQuantity.statusCode, 400);
    assert.equal(missingQuantity.json.fields.quantity.includes('quantity'), true);
    assert.equal(sends, 0);
    assert.deepEqual(await counts(), { inquiries: 0, outbox: 0 });
  });

  test('does not store a honeypot submission', async () => {
    const response = await invoke(handleIntake, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.14' },
      body: buyer({ company_website: 'https://spam.example' }),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.stored, false);
    assert.equal(response.json.receipt_id, undefined);
    assert.deepEqual(await counts(), { inquiries: 0, outbox: 0 });
  });

  test('saves buyer, supplier, and services inquiries with UTC timestamps', async () => {
    const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.15' };
    const sourcing = await invoke(handleIntake, { method: 'POST', headers, body: buyer({ email: 'buyer@example.com' }) });
    const supplier = await invoke(handleIntake, {
      method: 'POST',
      headers,
      body: {
        inquiry_type: 'supplier',
        request_id: crypto.randomUUID(),
        name: 'Mill Contact',
        company: 'Example Mill',
        email: 'mill@example.com',
        phone: '+90 555 123 4567',
        country: 'Turkey',
        product: 'Cotton terry towels',
        supplier_role: 'manufacturer',
        contact_permission: 'yes',
        notes: 'Lead time about 30 days.',
      },
    });
    const services = await invoke(handleIntake, {
      method: 'POST',
      headers,
      body: {
        inquiry_type: 'services',
        request_id: crypto.randomUUID(),
        name: 'Research Buyer',
        email: 'research@example.com',
        service_line: 'research_government_bids',
        notes: 'Please outline county bid research before any work starts.',
      },
    });
    const software = await invoke(handleIntake, {
      method: 'POST',
      headers,
      body: {
        inquiry_type: 'services',
        request_id: crypto.randomUUID(),
        name: 'Future Software',
        email: 'software@example.com',
        service_line: 'software_ai',
        notes: 'Asking what is in development. Not an order.',
      },
    });
    for (const response of [sourcing, supplier, services, software]) {
      assert.equal(response.statusCode, 200);
      assert.match(response.json.receipt_id, /^NOVA-\d{8}-[A-Z0-9]{4}$/);
    }
    const rows = await getPool(DATABASE_URL).query(
      `SELECT inquiry_type, product_or_service, status,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
         FROM public_inquiries
        ORDER BY email`,
    );
    assert.equal(rows.rowCount, 4);
    assert.equal(rows.rows.every(row => row.status === 'new' && row.created_at.endsWith('Z')), true);
    const byType = Object.fromEntries(rows.rows.map(row => [row.inquiry_type, row.product_or_service]));
    assert.equal(byType.buyer_sourcing, 'Cotton terry towels');
    assert.equal(byType.supplier, 'Cotton terry towels');
    assert.equal(rows.rows.find(row => row.inquiry_type === 'services' && row.product_or_service.includes('Government bid')).product_or_service, 'Government bid research');
    const leads = await invoke(handleIntake, {
      method: 'POST',
      headers,
      body: {
        inquiry_type: 'services',
        request_id: crypto.randomUUID(),
        name: 'List Buyer',
        email: 'leads@example.com',
        service_line: 'research_b2b_leads',
        notes: 'Please research contacts published on company websites.',
      },
    });
    assert.equal(leads.statusCode, 200);
    const leadRow = await getPool(DATABASE_URL).query(
      `SELECT product_or_service FROM public_inquiries WHERE email = 'leads@example.com'`,
    );
    assert.equal(leadRow.rows[0].product_or_service, 'Researched B2B lead lists (contacts published on company websites)');
    assert.equal(rows.rows.some(row => row.product_or_service.includes('in development')), true);
    const outbox = await getPool(DATABASE_URL).query(`SELECT status, last_error FROM inquiry_notification_outbox`);
    assert.equal(outbox.rows.every(row => row.status === 'skipped' && row.last_error.includes('Nothing was sent')), true);
  });

  test('returns a visible fallback when DATABASE_URL or INTAKE_IP_SALT is missing', async () => {
    const fallback = "We couldn't save your request. Please email wkirby592@gmail.com or call 812-263-1586.";
    const previousUrl = process.env.DATABASE_URL;
    const previousSalt = process.env.INTAKE_IP_SALT;
    try {
      const missingDatabase = await invoke(handleIntake, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: buyer(),
        env: { ...process.env, DATABASE_URL: '' },
      });
      assert.equal(missingDatabase.statusCode, 503);
      assert.equal(missingDatabase.json.error, 'intake_unavailable');
      assert.equal(missingDatabase.json.message, fallback);
      assert.equal(missingDatabase.json.receipt_id, undefined);

      const missingSalt = await invoke(handleIntake, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: buyer(),
        env: { ...process.env, INTAKE_IP_SALT: '   ' },
      });
      assert.equal(missingSalt.statusCode, 503);
      assert.equal(missingSalt.json.message, fallback);

      const form = await invoke(handleIntake, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
        body: buyer(),
        env: { ...process.env, DATABASE_URL: '' },
      });
      assert.equal(form.statusCode, 503);
      assert.match(form.body, /We couldn't save your request\. Please email/);
      assert.match(form.body, /href="mailto:wkirby592@gmail.com"/);
      assert.match(form.body, /href="tel:\+18122631586"/);
      assert.match(form.body, /812-263-1586/);
      assert.equal(form.body.includes('NOVA-'), false);
    } finally {
      process.env.DATABASE_URL = previousUrl;
      process.env.INTAKE_IP_SALT = previousSalt;
    }
    assert.deepEqual(await counts(), { inquiries: 0, outbox: 0 });
  });

  test('shows the fallback page when the insert fails and stores nothing', async () => {
    const headers = {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html',
      'x-forwarded-for': '203.0.113.77',
    };
    const response = await invoke(handleIntake, {
      method: 'POST',
      headers,
      body: buyer({ email: 'insert-fail@example.com' }),
      persistInquiry: async () => {
        throw new Error('insert failed');
      },
    });
    assert.equal(response.statusCode, 503);
    assert.match(response.body, /We couldn't save your request\. Please email/);
    assert.match(response.body, /href="mailto:wkirby592@gmail.com"/);
    assert.match(response.body, /href="tel:\+18122631586"/);
    assert.equal(response.body.includes('NOVA-'), false);
    const json = await invoke(handleIntake, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.78' },
      body: buyer({ email: 'insert-fail-json@example.com' }),
      persistInquiry: async () => {
        throw new Error('insert failed');
      },
    });
    assert.equal(json.statusCode, 503);
    assert.equal(json.json.message, "We couldn't save your request. Please email wkirby592@gmail.com or call 812-263-1586.");
    const stored = await getPool(DATABASE_URL).query(
      `SELECT COUNT(*)::int AS n FROM public_inquiries WHERE email IN ('insert-fail@example.com', 'insert-fail-json@example.com')`,
    );
    assert.equal(stored.rows[0].n, 0);
  });

  test('deletes network-address hashes older than 90 days when an inquiry is saved', async () => {
    const stale = 'a'.repeat(64);
    const recent = 'b'.repeat(64);
    await getPool(DATABASE_URL).query(
      `INSERT INTO intake_rate_events (ip_hash, created_at)
       VALUES ($1, NOW() - INTERVAL '91 days'), ($2, NOW() - INTERVAL '89 days')`,
      [stale, recent],
    );
    const response = await invoke(handleIntake, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.90' },
      body: buyer({ email: 'purge@example.com' }),
    });
    assert.equal(response.statusCode, 200);
    const left = await getPool(DATABASE_URL).query(
      `SELECT ip_hash FROM intake_rate_events WHERE ip_hash IN ($1, $2) ORDER BY ip_hash`,
      [stale, recent],
    );
    assert.deepEqual(left.rows.map(row => row.ip_hash), [recent]);
  });

  test('shows the receipt on an HTML form response without a client request id', async () => {
    const response = await invoke(handleIntake, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'text/html',
        'x-forwarded-for': '203.0.113.16',
      },
      body: { ...buyer({ request_id: '' }), request_id: '' },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<strong>NOVA-\d{8}-[A-Z0-9]{4}<\/strong>/);
    assert.match(response.body, /wkirby592@gmail.com/);
    assert.equal((await counts()).inquiries, 1);
  });

  test('rate limits repeated posts from one address', async () => {
    process.env.INTAKE_RATE_LIMIT_PER_HOUR = '2';
    const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '198.51.100.20' };
    const first = await invoke(handleIntake, { method: 'POST', headers, body: buyer() });
    const second = await invoke(handleIntake, { method: 'POST', headers, body: buyer() });
    const third = await invoke(handleIntake, { method: 'POST', headers, body: buyer() });
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(third.statusCode, 429);
    assert.match(third.json.message, /wkirby592@gmail.com/);
    assert.equal((await counts()).inquiries, 2);
  });

  test('blocks owner queue, JSON, CSV, and notification retry without the owner secret', async () => {
    const planted = await invoke(handleIntake, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.40' },
      body: buyer({
        email: 'ledger-check@example.com',
        name: '=1+1',
        notes: '@cmd',
      }),
    });
    assert.equal(planted.statusCode, 200);
    const routes = [
      [handleOwnerQueue, { method: 'GET', headers: { accept: 'text/html' } }],
      [handleOwnerInquiries, { method: 'GET', headers: { accept: 'application/json' } }],
      [handleOwnerExport, { method: 'GET', headers: { accept: 'text/csv' } }],
      [handleOwnerNotificationRetry, { method: 'POST', headers: { accept: 'application/json' } }],
      [handleOwnerMigrate, { method: 'POST', headers: { accept: 'application/json' } }],
      [handlePurge, { method: 'GET', headers: { accept: 'application/json' } }],
    ];
    for (const [handler, options] of routes) {
      const response = await invoke(handler, options);
      assert.equal(response.statusCode, 401, handler.name);
      assert.match(response.headers['www-authenticate'], /Basic realm="Nova owner"/);
      assert.equal(response.body.includes('ledger-check@example.com'), false);
      assert.equal(response.body.includes(planted.json.receipt_id), false);
      assert.equal(response.body.includes('=1+1'), false);
    }
    const wrong = await invoke(handleOwnerExport, {
      method: 'GET',
      headers: { accept: 'text/csv', authorization: 'Bearer not-the-secret-value' },
    });
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.body.includes('ledger-check@example.com'), false);
    const missing = await invoke(handleOwnerInquiries, {
      method: 'GET',
      headers: { accept: 'application/json' },
      env: { ...process.env, OWNER_ACCESS_SECRET: '' },
    });
    assert.equal(missing.statusCode, 503);
    assert.equal(missing.body.includes('ledger-check@example.com'), false);
  });

  test('owner CSV is ledger-shaped and neutralizes spreadsheet formulas', async () => {
    const saved = await invoke(handleIntake, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.41' },
      body: buyer({
        email: 'ledger-check@example.com',
        name: '=HYPERLINK("http://evil.test","x")',
        company: '+1+1',
        notes: '@cmd',
        quantity: '-2 towels',
      }),
    });
    const basic = Buffer.from(`owner:${OWNER_SECRET}`).toString('base64');
    const queue = await invoke(handleOwnerQueue, {
      method: 'GET',
      headers: { accept: 'text/html', authorization: `Basic ${basic}` },
    });
    assert.equal(queue.statusCode, 200);
    assert.match(queue.body, new RegExp(saved.json.receipt_id));
    assert.match(queue.body, /&quot;http:\/\/evil\.test&quot;/);
    assert.equal(queue.body.includes('"http://evil.test"'), false);
    const exported = await invoke(handleOwnerExport, {
      method: 'GET',
      headers: { accept: 'text/csv', authorization: `Bearer ${OWNER_SECRET}` },
    });
    assert.equal(exported.statusCode, 200);
    assert.match(exported.headers['content-type'], /text\/csv/);
    const csv = exported.body.replace(/^\uFEFF/, '');
    const [header, line] = csv.trim().split(/\r\n/);
    assert.equal(header, 'type,receipt_id,created_at UTC,name,company,email,phone,country,product/service,quantity+unit,target_date,notes,source,status');
    assert.match(line, new RegExp(saved.json.receipt_id));
    assert.match(line, /'=HYPERLINK/);
    assert.match(line, /'\+1\+1/);
    assert.match(line, /'@cmd/);
    assert.match(line, /'-2 towels/);
    assert.match(line, /2026-11-15/);
    assert.match(line, /,new$/);
    assert.match(line, /buyer_sourcing/);
  });

  test('health reports the intake service without secrets', async () => {
    const healthy = await invoke(handleHealth, { method: 'GET' });
    assert.equal(healthy.statusCode, 200);
    assert.equal(healthy.json.ok, true);
    assert.equal(healthy.json.service, 'intake');
    assert.equal(healthy.json.database, 'reachable');
    assert.equal(healthy.json.email, 'disabled');
    assert.equal(JSON.stringify(healthy.json).includes(DATABASE_URL), false);
    const unconfigured = await invoke(handleHealth, {
      method: 'GET',
      env: { INTAKE_EMAIL_ENABLED: 'true' },
    });
    assert.equal(unconfigured.json.database, 'not_configured');
    assert.equal(unconfigured.json.email, 'flag_set_provider_missing');
    assert.equal(unconfigured.json.ok, true);
  });

  test('owner migration rejects missing or wrong secrets and GET', async () => {
    const headers = { accept: 'application/json' };
    const missing = await invoke(handleOwnerMigrate, { method: 'POST', headers });
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.json.error, 'unauthorized');
    const wrong = await invoke(handleOwnerMigrate, {
      method: 'POST',
      headers: { ...headers, authorization: 'Bearer not-the-owner-secret' },
    });
    assert.equal(wrong.statusCode, 401);
    const unconfigured = await invoke(handleOwnerMigrate, {
      method: 'POST',
      headers: { ...headers, authorization: `Bearer ${OWNER_SECRET}` },
      env: { ...process.env, OWNER_ACCESS_SECRET: '' },
    });
    assert.equal(unconfigured.statusCode, 401);
    const get = await invoke(handleOwnerMigrate, {
      method: 'GET',
      headers: { ...headers, authorization: `Bearer ${OWNER_SECRET}` },
    });
    assert.equal(get.statusCode, 405);
    assert.equal(get.body.includes(DATABASE_URL), false);
  });

  test('owner migration applies 037 and a second run does not duplicate the record', async () => {
    const bundled = loadMigrationSql();
    const source = fs.readFileSync(path.join(__dirname, '../../infra/migrations/037_public_intake.sql'), 'utf8');
    assert.equal(bundled, source);
    const db = getPool(DATABASE_URL);
    await db.query('DROP TABLE IF EXISTS inquiry_notification_outbox, public_inquiries, intake_rate_events, schema_migrations CASCADE');
    try {
      const auth = { accept: 'application/json', authorization: `Bearer ${OWNER_SECRET}` };
      const first = await invoke(handleOwnerMigrate, { method: 'POST', headers: auth });
      assert.equal(first.statusCode, 200);
      assert.equal(first.json.ok, true);
      assert.deepEqual(first.json.tables, [
        'inquiry_notification_outbox',
        'intake_rate_events',
        'public_inquiries',
      ]);
      assert.equal(first.body.includes('postgresql://'), false);
      const second = await invoke(handleOwnerMigrate, { method: 'POST', headers: auth });
      assert.equal(second.statusCode, 200);
      assert.deepEqual(second.json.tables, first.json.tables);
      const recorded = await db.query(`SELECT COUNT(*)::int AS n FROM schema_migrations WHERE version = '037'`);
      assert.equal(recorded.rows[0].n, 1);
    } finally {
      await applyPublicIntakeMigration(db);
    }
  });

  test('purge deletes inquiries older than 24 months and rate hashes older than 90 days', async () => {
    const db = getPool(DATABASE_URL);
    const oldInquiry = await db.query(
      `INSERT INTO public_inquiries
         (receipt_id, request_id, payload_hash, inquiry_type, name, email, source, created_at)
       VALUES ('NOVA-20240101-OLD1', 'purge-old-request001', $1, 'buyer_sourcing', 'Old Buyer',
               'old-purge@example.com', 'website', NOW() - INTERVAL '25 months')
       RETURNING id`,
      ['a'.repeat(64)],
    );
    const keptInquiry = await db.query(
      `INSERT INTO public_inquiries
         (receipt_id, request_id, payload_hash, inquiry_type, name, email, source, created_at)
       VALUES ('NOVA-20251001-KEEP', 'purge-new-request001', $1, 'buyer_sourcing', 'Kept Buyer',
               'kept-purge@example.com', 'website', NOW() - INTERVAL '23 months')
       RETURNING id`,
      ['b'.repeat(64)],
    );
    await db.query(
      `INSERT INTO inquiry_notification_outbox (inquiry_id, org_id, recipient)
       VALUES ($1, 'nova-enterprises-llc', 'wkirby592@gmail.com'),
              ($2, 'nova-enterprises-llc', 'wkirby592@gmail.com')`,
      [oldInquiry.rows[0].id, keptInquiry.rows[0].id],
    );
    await db.query(
      `INSERT INTO intake_rate_events (ip_hash, created_at)
       VALUES ($1, NOW() - INTERVAL '91 days'), ($2, NOW() - INTERVAL '89 days')`,
      ['c'.repeat(64), 'd'.repeat(64)],
    );
    const denied = await invoke(handlePurge, { method: 'GET', headers: { accept: 'application/json' } });
    assert.equal(denied.statusCode, 401);
    const wrongCron = await invoke(handlePurge, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: 'Bearer wrong-cron-secret-value' },
      env: { ...process.env, CRON_SECRET: 'expected-cron-secret' },
    });
    assert.equal(wrongCron.statusCode, 401);
    const post = await invoke(handlePurge, {
      method: 'POST',
      headers: { authorization: `Bearer ${OWNER_SECRET}` },
    });
    assert.equal(post.statusCode, 405);

    const byOwner = await invoke(handlePurge, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${OWNER_SECRET}` },
      env: { ...process.env, CRON_SECRET: 'expected-cron-secret' },
    });
    assert.equal(byOwner.statusCode, 200);
    assert.equal(byOwner.json.ok, true);
    assert.equal(byOwner.json.inquiries, 1);
    assert.equal(byOwner.json.outbox, 1);
    assert.equal(byOwner.json.rate_events, 1);

    const again = await invoke(handlePurge, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: 'Bearer expected-cron-secret' },
      env: { ...process.env, CRON_SECRET: 'expected-cron-secret' },
    });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json.inquiries, 0);
    assert.equal(again.json.outbox, 0);
    assert.equal(again.json.rate_events, 0);

    const left = await db.query(
      `SELECT email FROM public_inquiries WHERE email IN ('old-purge@example.com', 'kept-purge@example.com') ORDER BY email`,
    );
    assert.deepEqual(left.rows.map(row => row.email), ['kept-purge@example.com']);
    const outbox = await db.query(
      `SELECT COUNT(*)::int AS n FROM inquiry_notification_outbox WHERE inquiry_id = $1`,
      [keptInquiry.rows[0].id],
    );
    assert.equal(outbox.rows[0].n, 1);
    const hashes = await db.query(
      `SELECT ip_hash FROM intake_rate_events WHERE ip_hash IN ($1, $2)`,
      ['c'.repeat(64), 'd'.repeat(64)],
    );
    assert.deepEqual(hashes.rows.map(row => row.ip_hash), ['d'.repeat(64)]);
  });
});
