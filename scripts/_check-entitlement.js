const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query("SELECT plan, status, stripe_customer_id, stripe_subscription_id FROM entitlements WHERE user_id = 'b1e7a0c9-29e6-483a-b3b3-aa9d24aa9850'"))
  .then(r => { console.log('Entitlement:', JSON.stringify(r.rows[0], null, 2)); c.end(); })
  .catch(e => { console.error(e.message); c.end(); });
