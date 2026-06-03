const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ALL_FEATURES = JSON.stringify([
  'scanner', 'paper_trading', 'thesis_cards', 'decisions',
  'watchlists', 'alerts', 'basic_scanner', 'watchlist_1',
  'reports', 'csv_export', 'pdf_export', 'api_access', 'priority_support',
  'decision_replay', 'founding_badge', 'concierge_onboarding', 'early_access',
  'flip_pipeline', 'deal_cards', 'mode_control', 'advanced_analytics'
]);

const LITE_FEATURES = JSON.stringify([
  'scanner', 'paper_trading', 'thesis_cards', 'decisions',
  'watchlists', 'alerts', 'basic_scanner', 'watchlist_1',
  'reports', 'csv_export', 'decision_replay'
]);

const FREE_FEATURES = JSON.stringify([
  'scanner', 'paper_trading', 'thesis_cards', 'decisions',
  'watchlists', 'alerts', 'basic_scanner', 'watchlist_1'
]);

async function run() {
  await c.connect();

  // 1. wyatt@novanexus-ai.com -> FOUNDING (dev account, full unrestricted)
  await c.query(
    `UPDATE entitlements SET plan='FOUNDING', status='ACTIVE', features_json=$1, updated_at=NOW()
     WHERE user_id='cd2d8cc4-cc61-4508-ace4-35c40aab78b4'`,
    [ALL_FEATURES]
  );
  console.log('wyatt@novanexus-ai.com -> FOUNDING (full access)');

  // 2. kibblewyatt420@gmail.com -> LITE (your paid test account)
  await c.query(
    `UPDATE entitlements SET plan='LITE', status='ACTIVE', features_json=$1, updated_at=NOW()
     WHERE user_id='48e06182-677c-43dd-bd9b-389e1ef36b55'`,
    [LITE_FEATURES]
  );
  console.log('kibblewyatt420@gmail.com -> LITE (paid subscriber)');

  // 3. newfallpen@gmail.com -> needs an entitlement row. Find their org first.
  const orgRow = await c.query(`SELECT org_id FROM orgs_users WHERE user_id='bbc99bc4-6b6b-4d36-adfd-82945040c8e8' LIMIT 1`);
  let orgId = orgRow.rows[0]?.org_id;

  if (!orgId) {
    // Try: maybe orgs are created alongside users, check orgs table for any matching
    const orgsAll = await c.query(`SELECT id FROM orgs ORDER BY created_at DESC LIMIT 10`);
    console.log('Available orgs:', orgsAll.rows.map(r => r.id));
    // Check if there's a user->org mapping via a different pattern
    const altOrg = await c.query(`SELECT id FROM orgs WHERE owner_id='bbc99bc4-6b6b-4d36-adfd-82945040c8e8' LIMIT 1`);
    orgId = altOrg.rows[0]?.id;
  }

  if (!orgId) {
    // Last resort: check all orgs columns
    const orgCols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='orgs'`);
    console.log('orgs columns:', orgCols.rows.map(r => r.column_name));
    // Just get the most recent org
    const recent = await c.query(`SELECT id FROM orgs ORDER BY created_at DESC LIMIT 1`);
    orgId = recent.rows[0]?.id;
    console.log('Using most recent org:', orgId);
  }

  if (orgId) {
    await c.query(
      `INSERT INTO entitlements (user_id, org_id, plan, status, features_json, created_at, updated_at)
       VALUES ('bbc99bc4-6b6b-4d36-adfd-82945040c8e8', $1, 'FREE', 'ACTIVE', $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET plan='FREE', status='ACTIVE', features_json=$2, updated_at=NOW()`,
      [orgId, FREE_FEATURES]
    );
    console.log('newfallpen@gmail.com -> FREE (real customer, 3/day limit)');
  } else {
    console.log('SKIP: could not find org_id for newfallpen');
  }

  // Verify
  const r = await c.query(
    `SELECT u.email, e.plan, e.status FROM users u JOIN entitlements e ON u.id=e.user_id
     WHERE u.email IN ('wyatt@novanexus-ai.com','kibblewyatt420@gmail.com','newfallpen@gmail.com')`
  );
  console.log('\n=== VERIFIED ===');
  r.rows.forEach(row => console.log(JSON.stringify(row)));

  await c.end();
}
run().catch(e => { console.error(e.message); c.end(); });
