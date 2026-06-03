const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query("UPDATE entitlements SET stripe_customer_id = 'cus_U49x8MS5JPxlZm' WHERE user_id = 'b1e7a0c9-29e6-483a-b3b3-aa9d24aa9850'"))
  .then(r => { console.log('Restored live customer ID. Rows:', r.rowCount); c.end(); })
  .catch(e => { console.error(e.message); c.end(); });
