const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const LITE_FEATURES = JSON.stringify([
  'scanner', 'paper_trading', 'thesis_cards', 'decisions',
  'watchlists', 'alerts', 'basic_scanner', 'watchlist_1',
  'reports', 'csv_export', 'decision_replay'
]);

async function run() {
  await c.connect();

  // See what org_ids existing entitlements use
  const existing = await c.query(`SELECT user_id, org_id FROM entitlements LIMIT 5`);
  console.log('existing entitlements:', existing.rows);

  // Check FK constraint definition
  const fk = await c.query(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c
    WHERE conrelid = 'entitlements'::regclass AND contype = 'f' AND conname LIKE '%org%'
  `);
  console.log('FK constraint:', fk.rows);

  await c.end();
}
run().catch(e => { console.error(e.message); c.end(); });
