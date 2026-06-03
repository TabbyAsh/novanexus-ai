const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await c.connect();

  // What does the orgs table look like?
  const orgCols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='orgs'`);
  console.log('orgs columns:', orgCols.rows.map(r => r.column_name).join(', '));

  // List all orgs
  const orgs = await c.query(`SELECT * FROM orgs ORDER BY created_at DESC LIMIT 10`);
  orgs.rows.forEach(r => console.log('org:', JSON.stringify(r)));

  await c.end();
}
run().catch(e => { console.error(e.message); c.end(); });
