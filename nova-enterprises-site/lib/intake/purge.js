const PURGE_MARKER_DDL = `CREATE TABLE IF NOT EXISTS intake_purge_runs (
  id SMALLINT PRIMARY KEY,
  last_purge_at TIMESTAMPTZ NOT NULL,
  last_purge_status TEXT NOT NULL,
  CONSTRAINT intake_purge_runs_id_check CHECK (id = 1),
  CONSTRAINT intake_purge_runs_status_check CHECK (last_purge_status IN ('success', 'failed'))
);`;

function purgeTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

async function writePurgeMarker(client, status) {
  await client.query(PURGE_MARKER_DDL);
  await client.query(
    `INSERT INTO intake_purge_runs (id, last_purge_at, last_purge_status)
     VALUES (1, NOW(), $1)
     ON CONFLICT (id) DO UPDATE
       SET last_purge_at = EXCLUDED.last_purge_at,
           last_purge_status = EXCLUDED.last_purge_status`,
    [status],
  );
}

async function purgeExpired(db) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const outbox = await client.query(
      `DELETE FROM inquiry_notification_outbox
        WHERE inquiry_id IN (
          SELECT id FROM public_inquiries
          WHERE created_at < NOW() - INTERVAL '24 months'
        )`,
    );
    const inquiries = await client.query(
      `DELETE FROM public_inquiries
        WHERE created_at < NOW() - INTERVAL '24 months'`,
    );
    const rateEvents = await client.query(
      `DELETE FROM intake_rate_events
        WHERE created_at < NOW() - INTERVAL '90 days'`,
    );
    // Same transaction as the deletes, so a committed success matches a finished purge.
    await writePurgeMarker(client, 'success');
    await client.query('COMMIT');
    return {
      inquiries: inquiries.rowCount,
      outbox: outbox.rowCount,
      rate_events: rateEvents.rowCount,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already aborted */ }
    throw error;
  } finally {
    client.release();
  }
}

// Called only after purgeExpired has rolled back, on a fresh connection.
async function recordPurgeFailure(db) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await writePurgeMarker(client, 'failed');
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already aborted */ }
    throw error;
  } finally {
    client.release();
  }
}

async function readLastPurgeRun(db) {
  const found = await db.query(`SELECT to_regclass('public.intake_purge_runs') AS relation`);
  if (!found.rows[0] || !found.rows[0].relation) {
    return { lastPurgeAt: null, lastPurgeStatus: null };
  }
  const row = await db.query(
    `SELECT last_purge_at, last_purge_status
       FROM intake_purge_runs
      WHERE id = 1`,
  );
  if (!row.rowCount) return { lastPurgeAt: null, lastPurgeStatus: null };
  const status = row.rows[0].last_purge_status;
  return {
    lastPurgeAt: purgeTimestamp(row.rows[0].last_purge_at),
    lastPurgeStatus: status === 'success' || status === 'failed' ? status : null,
  };
}

module.exports = {
  PURGE_MARKER_DDL,
  purgeExpired,
  readLastPurgeRun,
  recordPurgeFailure,
};
