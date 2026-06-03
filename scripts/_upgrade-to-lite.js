const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
const features = JSON.stringify([
  'scanner', 'paper_trading', 'thesis_cards', 'decisions',
  'watchlists', 'alerts', 'basic_scanner', 'watchlist_1',
  'reports', 'csv_export', 'decision_replay'
]);
c.connect()
  .then(() => c.query(
    "UPDATE entitlements SET plan = 'LITE', status = 'ACTIVE', features_json = $1, updated_at = NOW() WHERE user_id = 'b1e7a0c9-29e6-483a-b3b3-aa9d24aa9850'",
    [features]
  ))
  .then(r => { console.log('Upgraded to LITE. Rows:', r.rowCount); c.end(); })
  .catch(e => { console.error(e.message); c.end(); });
