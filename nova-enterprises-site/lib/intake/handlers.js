const { createNotifier } = require('./notify');
const { cronOrOwnerAccepted, ownerAccepted, ownerAuthorized } = require('./auth');
const { applyPublicIntakeMigration, redactSecrets } = require('./migrate');
const { purgeExpired } = require('./purge');
const { normalizeInquiry } = require('./validate');
const { toCsv } = require('./csv');
const {
  DIRECT_CONTACT_MESSAGE,
  MAX_BODY_BYTES,
  SAVE_FAILED_MESSAGE,
} = require('./constants');
const {
  fallbackPage,
  honeypotPage,
  messagePage,
  ownerDeniedPage,
  ownerQueuePage,
  thankYouPage,
  validationPage,
} = require('./html');
const {
  RECEIPT_ID,
  closePool,
  consumeRateLimit,
  deleteInquiryByReceipt,
  getPool,
  intakeSalt,
  ipHash,
  listInquiries,
  persistInquiry,
  retryNotifications,
} = require('./store');

function header(req, name) {
  if (!req.headers) return '';
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : String(value);
  }
  return '';
}

function wantsJson(req) {
  const type = header(req, 'content-type');
  if (type.includes('application/json')) return true;
  const accept = header(req, 'accept');
  return accept.includes('application/json') && !accept.includes('text/html');
}

function isFormPost(req) {
  const type = header(req, 'content-type');
  return type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data');
}

function send(res, status, body, extra) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (extra) {
    for (const [key, value] of Object.entries(extra)) res.setHeader(key, value);
  }
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), { 'Content-Type': 'application/json; charset=utf-8' });
}

function sendHtml(res, status, html) {
  send(res, status, html, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' });
}

function respond(req, res, status, error, message, extra) {
  if (wantsJson(req)) {
    sendJson(res, status, { ok: false, error, message, ...extra });
    return;
  }
  if (error === 'intake_unavailable') {
    sendHtml(res, status, fallbackPage());
    return;
  }
  if (error === 'invalid' && extra && extra.fields) {
    sendHtml(res, status, validationPage(extra.fields));
    return;
  }
  sendHtml(res, status, messagePage({
    title: 'Inquiry not saved | Nova Enterprises LLC',
    heading: 'We did not save this inquiry.',
    message,
  }));
}

function readBody(req) {
  if (req.body == null) return { ok: true, value: {} };
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > MAX_BODY_BYTES) return { ok: false, status: 413 };
    try {
      return { ok: true, value: JSON.parse(req.body.toString('utf8')) };
    } catch {
      return { ok: false, status: 400, error: 'invalid_json' };
    }
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > MAX_BODY_BYTES) return { ok: false, status: 413 };
    if (header(req, 'content-type').includes('application/json')) {
      try {
        return { ok: true, value: JSON.parse(req.body) };
      } catch {
        return { ok: false, status: 400, error: 'invalid_json' };
      }
    }
    return { ok: false, status: 400, error: 'invalid_body' };
  }
  if (typeof req.body === 'object') {
    const serialized = JSON.stringify(req.body);
    if (serialized && Buffer.byteLength(serialized) > MAX_BODY_BYTES) return { ok: false, status: 413 };
    return { ok: true, value: req.body };
  }
  return { ok: false, status: 400, error: 'invalid_body' };
}

function databaseUrl(env) {
  const value = env && env.DATABASE_URL;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function rateLimit(env) {
  const parsed = Number(env.INTAKE_RATE_LIMIT_PER_HOUR || 8);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

function requireOwner(req, res, env) {
  const decision = ownerAuthorized(req, env);
  if (decision.ok) return true;
  const json = wantsJson(req) || header(req, 'accept').includes('text/csv');
  if (decision.status === 503) {
    if (json) sendJson(res, 503, { ok: false, error: 'owner_not_configured', message: 'Owner access is not configured.' });
    else sendHtml(res, 503, ownerDeniedPage(503));
    return false;
  }
  const headers = { 'WWW-Authenticate': 'Basic realm="Nova owner", charset="UTF-8"' };
  if (json && !header(req, 'accept').includes('text/html')) {
    send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized', message: 'Owner sign-in is required.' }), {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
    });
  } else if (header(req, 'accept').includes('text/csv')) {
    send(res, 401, 'unauthorized\n', { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
  } else {
    send(res, 401, ownerDeniedPage(401), { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' });
  }
  return false;
}

async function handleIntake(req, res, deps = {}) {
  const env = deps.env || process.env;
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST.' });
    return;
  }
  const contentLength = Number(header(req, 'content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    respond(req, res, 413, 'too_large', `This inquiry is too large. ${DIRECT_CONTACT_MESSAGE}`);
    return;
  }
  const body = readBody(req);
  if (!body.ok) {
    const status = body.status || 400;
    respond(req, res, status, body.error || 'invalid', `The inquiry could not be read. ${DIRECT_CONTACT_MESSAGE}`);
    return;
  }

  const notifier = deps.notifier || createNotifier(env);
  const normalized = normalizeInquiry(body.value, {
    env,
    idempotencyKey: header(req, 'idempotency-key'),
    allowGeneratedRequestId: isFormPost(req),
  });
  if (normalized.honeypot) {
    if (wantsJson(req)) sendJson(res, 200, { ok: true, stored: false });
    else sendHtml(res, 200, honeypotPage());
    return;
  }
  if (!normalized.ok) {
    respond(req, res, 400, 'invalid', DIRECT_CONTACT_MESSAGE, { fields: normalized.errors });
    return;
  }

  const connectionString = databaseUrl(env);
  const addressHash = ipHash(req, env);
  if (!connectionString || !intakeSalt(env) || !addressHash) {
    respond(req, res, 503, 'intake_unavailable', SAVE_FAILED_MESSAGE);
    return;
  }

  try {
    const db = getPool(connectionString);
    const allowed = await consumeRateLimit(db, addressHash, rateLimit(env));
    if (!allowed) {
      respond(req, res, 429, 'rate_limited', `Too many inquiries were sent from this network in the last hour. ${DIRECT_CONTACT_MESSAGE}`);
      return;
    }
    const save = deps.persistInquiry || persistInquiry;
    const saved = await save(db, normalized.value, notifier);
    if (saved.kind === 'conflict') {
      respond(req, res, 422, 'idempotency_conflict', `This request id was already used with different details. Nothing new was stored. ${DIRECT_CONTACT_MESSAGE}`);
      return;
    }
    if (wantsJson(req)) {
      sendJson(res, 200, {
        ok: true,
        stored: true,
        receipt_id: saved.receiptId,
        replay: saved.kind === 'replay',
      });
      return;
    }
    sendHtml(res, 200, thankYouPage(saved.receiptId, saved.kind === 'replay'));
  } catch (error) {
    console.error(JSON.stringify({ event: 'intake_persist_failed', message: error.message }));
    respond(req, res, 503, 'intake_unavailable', SAVE_FAILED_MESSAGE);
  }
}

async function handleHealth(req, res, deps = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const env = deps.env || process.env;
  let database = 'not_configured';
  let tables = null;
  let persistence = null;
  const connectionString = databaseUrl(env);
  if (connectionString) {
    try {
      const found = await getPool(connectionString).query(
        `SELECT to_regclass('public.public_inquiries') AS relation`,
      );
      database = 'reachable';
      const relation = found.rows[0] && found.rows[0].relation;
      if (relation) {
        tables = 'present';
        persistence = String(relation);
      } else {
        tables = 'missing';
        persistence = null;
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'intake_health_db', message: redactSecrets(error.message) }));
      database = 'unreachable';
    }
  }
  const email = String(env.INTAKE_EMAIL_ENABLED || '').toLowerCase() === 'true'
    ? 'flag_set_provider_missing'
    : 'disabled';
  if (req.method === 'HEAD') {
    send(res, 200, '', { 'Content-Type': 'application/json; charset=utf-8' });
    return;
  }
  sendJson(res, 200, { ok: true, service: 'intake', database, email, tables, persistence });
}

async function handleOwnerQueue(req, res, deps = {}) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const env = deps.env || process.env;
  if (!requireOwner(req, res, env)) return;
  const connectionString = databaseUrl(env);
  if (!connectionString) {
    sendHtml(res, 503, messagePage({
      title: 'Inquiry queue unavailable | Nova Enterprises LLC',
      heading: 'The inquiry queue is unavailable.',
      message: 'DATABASE_URL is not set. No inquiries are shown.',
    }));
    return;
  }
  try {
    const rows = await listInquiries(getPool(connectionString));
    sendHtml(res, 200, ownerQueuePage(rows));
  } catch (error) {
    console.error(JSON.stringify({ event: 'owner_queue_failed', message: error.message }));
    sendHtml(res, 503, messagePage({
      title: 'Inquiry queue unavailable | Nova Enterprises LLC',
      heading: 'The inquiry queue is unavailable.',
      message: 'The inquiry records could not be read.',
    }));
  }
}

async function handleOwnerInquiries(req, res, deps = {}) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const env = deps.env || process.env;
  if (!requireOwner(req, res, env)) return;
  const connectionString = databaseUrl(env);
  if (!connectionString) {
    sendJson(res, 503, { ok: false, error: 'intake_unavailable', message: 'DATABASE_URL is not set.' });
    return;
  }
  try {
    const inquiries = await listInquiries(getPool(connectionString));
    sendJson(res, 200, { ok: true, inquiries });
  } catch (error) {
    console.error(JSON.stringify({ event: 'owner_inquiries_failed', message: error.message }));
    sendJson(res, 503, { ok: false, error: 'intake_unavailable', message: 'The inquiry records could not be read.' });
  }
}

async function handleOwnerExport(req, res, deps = {}) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const env = deps.env || process.env;
  if (!requireOwner(req, res, env)) return;
  const connectionString = databaseUrl(env);
  if (!connectionString) {
    send(res, 503, 'DATABASE_URL is not set.\n', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }
  try {
    const csv = toCsv(await listInquiries(getPool(connectionString)));
    send(res, 200, csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="nova-inquiries.csv"',
      'X-Robots-Tag': 'noindex',
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'owner_export_failed', message: error.message }));
    send(res, 503, 'The inquiry export could not be read.\n', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

async function handleOwnerNotificationRetry(req, res, deps = {}) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const env = deps.env || process.env;
  if (!requireOwner(req, res, env)) return;
  const connectionString = databaseUrl(env);
  if (!connectionString) {
    sendJson(res, 503, { ok: false, error: 'intake_unavailable', message: 'DATABASE_URL is not set.' });
    return;
  }
  try {
    const notifier = deps.notifier || createNotifier(env);
    const results = await retryNotifications(getPool(connectionString), notifier);
    sendJson(res, 200, { ok: true, results });
  } catch (error) {
    console.error(JSON.stringify({ event: 'owner_retry_failed', message: error.message }));
    sendJson(res, 503, { ok: false, error: 'intake_unavailable', message: 'Notification retry could not run.' });
  }
}

function rejectOwner(res) {
  send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized' }), {
    'Content-Type': 'application/json; charset=utf-8',
    'WWW-Authenticate': 'Basic realm="Nova owner", charset="UTF-8"',
  });
}

async function handleOwnerInquiryDelete(req, res, deps = {}) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const env = deps.env || process.env;
  if (!ownerAccepted(req, env)) {
    rejectOwner(res);
    return;
  }
  const body = readBody(req);
  const receipt = body.ok && body.value && typeof body.value.receipt_id === 'string'
    ? body.value.receipt_id.trim()
    : '';
  if (!RECEIPT_ID.test(receipt)) {
    sendJson(res, 400, { ok: false, error: 'invalid_receipt' });
    return;
  }
  const connectionString = databaseUrl(env);
  if (!connectionString) {
    console.error(JSON.stringify({ event: 'owner_delete_failed', message: 'Database is not configured.' }));
    sendJson(res, 500, { ok: false, error: 'delete_failed' });
    return;
  }
  try {
    const result = await deleteInquiryByReceipt(getPool(connectionString), receipt);
    if (!result.deleted) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    sendJson(res, 200, { ok: true, deleted: result.deleted });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'owner_delete_failed',
      message: redactSecrets(error && error.message),
    }));
    sendJson(res, 500, { ok: false, error: 'delete_failed' });
  }
}

async function handleOwnerMigrate(req, res, deps = {}) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const env = deps.env || process.env;
  if (!ownerAccepted(req, env)) {
    rejectOwner(res);
    return;
  }
  const connectionString = databaseUrl(env);
  if (!connectionString) {
    console.error(JSON.stringify({ event: 'owner_migrate_failed', message: 'Database is not configured.' }));
    sendJson(res, 500, { ok: false, error: 'migration_failed' });
    return;
  }
  try {
    const tables = await applyPublicIntakeMigration(getPool(connectionString));
    sendJson(res, 200, { ok: true, tables });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'owner_migrate_failed',
      message: redactSecrets(error && error.message),
    }));
    sendJson(res, 500, { ok: false, error: 'migration_failed' });
  }
}

async function handlePurge(req, res, deps = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const env = deps.env || process.env;
  if (!cronOrOwnerAccepted(req, env)) {
    rejectOwner(res);
    return;
  }
  const connectionString = databaseUrl(env);
  if (!connectionString) {
    console.error(JSON.stringify({ event: 'intake_purge_failed', message: 'Database is not configured.' }));
    sendJson(res, 500, { ok: false, error: 'purge_failed' });
    return;
  }
  try {
    const counts = await purgeExpired(getPool(connectionString));
    if (req.method === 'HEAD') {
      send(res, 200, '', { 'Content-Type': 'application/json; charset=utf-8' });
      return;
    }
    sendJson(res, 200, { ok: true, ...counts });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'intake_purge_failed',
      message: redactSecrets(error && error.message),
    }));
    sendJson(res, 500, { ok: false, error: 'purge_failed' });
  }
}

module.exports = {
  closePool,
  handleHealth,
  handleIntake,
  handleOwnerExport,
  handleOwnerInquiries,
  handleOwnerInquiryDelete,
  handleOwnerMigrate,
  handleOwnerNotificationRetry,
  handleOwnerQueue,
  handlePurge,
};
