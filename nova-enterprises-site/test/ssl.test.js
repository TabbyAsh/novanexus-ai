const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { normalizeConnectionString, poolConfig } = require('../lib/intake/store');

const REMOTE = 'postgresql://user:secret@ep-example.neon.tech/nova?sslmode=require&channel_binding=require';

test('sslmode=require is rewritten only on the driver config', () => {
  const original = REMOTE;
  const config = poolConfig(original);
  assert.equal(original, REMOTE);
  assert.equal(
    config.connectionString,
    'postgresql://user:secret@ep-example.neon.tech/nova?sslmode=verify-full&channel_binding=require',
  );
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(
    normalizeConnectionString('postgresql://user:secret@ep-example.neon.tech/nova?sslmode=REQUIRE'),
    'postgresql://user:secret@ep-example.neon.tech/nova?sslmode=verify-full',
  );
  assert.equal(
    normalizeConnectionString('postgresql://user:secret@ep-example.neon.tech/nova?application_name=nova&sslmode=require'),
    'postgresql://user:secret@ep-example.neon.tech/nova?application_name=nova&sslmode=verify-full',
  );

  const localUrl = 'postgresql://nova:nova_ci_password@127.0.0.1:5432/nova';
  const local = poolConfig(localUrl);
  assert.equal(local.connectionString, localUrl);
  assert.equal(local.ssl, false);
});

test('an explicit ssl object does not silence sslmode=require', () => {
  const script = `
    const warnings = [];
    process.emitWarning = (warning) => {
      warnings.push(String(warning && warning.message ? warning.message : warning));
    };
    const { Client } = require('pg');
    const client = new Client({
      connectionString: ${JSON.stringify(REMOTE)},
      ssl: { rejectUnauthorized: true },
    });
    client.end();
    if (!warnings.some((warning) => warning.includes('SECURITY WARNING') && warning.includes('sslmode=verify-full'))) {
      console.error(warnings.join('\\n') || 'no warning');
      process.exit(2);
    }
    console.log('warned');
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /warned/);
});

test('opening the pool with a require URL does not emit the pg sslmode warning', () => {
  const store = path.join(__dirname, '../lib/intake/store.js');
  const script = `
    const { poolConfig } = require(${JSON.stringify(store)});
    const warnings = [];
    process.emitWarning = (warning) => {
      warnings.push(String(warning && warning.message ? warning.message : warning));
    };
    const { Client } = require('pg');
    const original = ${JSON.stringify(REMOTE)};
    const config = poolConfig(original);
    const client = new Client(config);
    client.end();
    if (original !== ${JSON.stringify(REMOTE)}) {
      console.error('env string changed');
      process.exit(2);
    }
    if (warnings.length) {
      console.error(warnings.join('\\n'));
      process.exit(3);
    }
    console.log('quiet');
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /quiet/);
});
