const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const LITE_FEATURES = JSON.stringify([
  'scanner', 'paper_trading', 'thesis_cards', 'decisions',
  'watchlists', 'alerts', 'basic_scanner', 'watchlist_1',
  'reports', 'csv_export', 'decision_replay'
]);

async function run() {
  await c.connect();
  
  // Find org_id
  const orgResult = await c.query(`SELECT org_id FROM users WHERE id = 'bbc99bc4-6b6b-4d36-adfd-82945040c8e8'`);
  const orgId = orgResult.rows[0]?.org_id;
  console.log('org_id:', orgId);
  
  if (orgId) {
    await c.query(
      `INSERT INTO entitlements (user_id, org_id, plan, status, features_json, created_at, updated_at)
       VALUES ('bbc99bc4-6b6b-4d36-adfd-82945040c8e8', $1, 'LITE', 'ACTIVE', $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET plan='LITE', status='ACTIVE', features_json=$2, updated_at=NOW()`,
      [orgId, LITE_FEATURES]
    );
    console.log('Fixed newfallpen@gmail.com -> LITE');
  }

  // Final verify all 3
  const r = await c.query(
    `SELECT u.email, e.plan, e.status FROM users u JOIN entitlements e ON u.id=e.user_id
     WHERE u.email IN ('wyatt@novanexus-ai.com','kibblewyatt420@gmail.com','newfallpen@gmail.com')`
  );
  r.rows.forEach(row => console.log('VERIFIED:', JSON.stringify(row)));
  await c.end();
}
run().catch(e => { console.error(e.message); c.end(); });
