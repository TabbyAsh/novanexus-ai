const { Client } = require('pg');
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
const LITE_FEATURES = JSON.stringify([
  'scanner', 'paper_trading', 'thesis_cards', 'decisions',
  'watchlists', 'alerts', 'basic_scanner', 'watchlist_1',
  'reports', 'csv_export', 'decision_replay'
]);

async function run() {
  await c.connect();

  // Upgrade wyatt@novanexus-ai.com
  await c.query(
    `UPDATE entitlements SET plan='LITE', status='ACTIVE', features_json=$1, updated_at=NOW() WHERE user_id='cd2d8cc4-cc61-4508-ace4-35c40aab78b4'`,
    [LITE_FEATURES]
  );
  console.log('Updated wyatt@novanexus-ai.com -> LITE');

  // Upgrade kibblewyatt420@gmail.com
  await c.query(
    `UPDATE entitlements SET plan='LITE', status='ACTIVE', features_json=$1, updated_at=NOW() WHERE user_id='48e06182-677c-43dd-bd9b-389e1ef36b55'`,
    [LITE_FEATURES]
  );
  console.log('Updated kibblewyatt420@gmail.com -> LITE');

  // Create entitlement for newfallpen@gmail.com (may not have one)
  await c.query(
    `INSERT INTO entitlements (user_id, org_id, plan, status, features_json, created_at, updated_at)
     VALUES ('bbc99bc4-6b6b-4d36-adfd-82945040c8e8', 'bbc99bc4-6b6b-4d36-adfd-82945040c8e8', 'LITE', 'ACTIVE', $1, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET plan='LITE', status='ACTIVE', features_json=$1, updated_at=NOW()`,
    [LITE_FEATURES]
  );
  console.log('Created/updated newfallpen@gmail.com -> LITE');

  // Verify
  const r = await c.query(
    `SELECT u.email, e.plan, e.status FROM users u JOIN entitlements e ON u.id=e.user_id
     WHERE u.email IN ('wyatt@novanexus-ai.com','kibblewyatt420@gmail.com','newfallpen@gmail.com')`
  );
  r.rows.forEach(row => console.log('VERIFIED:', JSON.stringify(row)));

  await c.end();
}

run().catch(e => { console.error(e.message); c.end(); process.exit(1); });
