const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const LITE_FEATURES = JSON.stringify([
  'scanner', 'paper_trading', 'thesis_cards', 'decisions',
  'watchlists', 'alerts', 'basic_scanner', 'watchlist_1',
  'reports', 'csv_export', 'decision_replay'
]);

async function run() {
  await c.connect();
  
  // Find user columns
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`);
  console.log('users columns:', cols.rows.map(r => r.column_name).join(', '));
  
  // Find entitlements columns
  const ecols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'entitlements' ORDER BY ordinal_position`);
  console.log('entitlements columns:', ecols.rows.map(r => r.column_name).join(', '));
  
  // Find org for this user via entitlements of other users or organizations table
  const orgs = await c.query(`SELECT id FROM organizations LIMIT 5`);
  console.log('orgs:', orgs.rows.map(r => r.id));
  
  // Get the user's full row
  const u = await c.query(`SELECT * FROM users WHERE id = 'bbc99bc4-6b6b-4d36-adfd-82945040c8e8'`);
  console.log('user row keys:', Object.keys(u.rows[0] || {}));
  if (u.rows[0]) {
    // Find any field that looks like an org reference
    for (const [k, v] of Object.entries(u.rows[0])) {
      if (k !== 'id' && typeof v === 'string' && v.includes('-')) {
        console.log(`  ${k}: ${v}`);
      }
    }
  }
  
  // Try: get an existing entitlement's org_id to use as template
  const existing = await c.query(`SELECT org_id FROM entitlements LIMIT 1`);
  console.log('existing org_id from entitlements:', existing.rows[0]?.org_id);

  await c.end();
}
run().catch(e => { console.error(e.message); c.end(); });
