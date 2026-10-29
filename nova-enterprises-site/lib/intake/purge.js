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

module.exports = { purgeExpired };
