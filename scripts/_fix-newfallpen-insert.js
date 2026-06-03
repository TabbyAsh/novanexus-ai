const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await c.connect();

  await c.query(
    `INSERT INTO entitlements (user_id, org_id, plan, status, features_json, created_at, updated_at)
     VALUES ('bbc99bc4-6b6b-4d36-adfd-82945040c8e8', '6fc99e78-e073-4302-b607-dab39321ead8', 'FREE', 'ACTIVE',
       $1, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET plan='FREE', status='ACTIVE', features_json=$1, updated_at=NOW()`,
    [JSON.stringify(['scanner','paper_trading','thesis_cards','decisions','watchlists','alerts','basic_scanner','watchlist_1'])]
  );
  console.log('newfallpen@gmail.com -> FREE (real customer)');

  // Final verify ALL accounts
  const r = await c.query(
    `SELECT u.email, e.plan, e.status FROM users u JOIN entitlements e ON u.id=e.user_id
     WHERE u.email IN ('wyatt@novanexus-ai.com','kibblewyatt420@gmail.com','newfallpen@gmail.com')`
  );
  console.log('\n=== ALL ACCOUNTS ===');
  r.rows.forEach(row => console.log(JSON.stringify(row)));
  await c.end();
}
run().catch(e => { console.error(e.message); c.end(); });
