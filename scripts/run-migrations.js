#!/usr/bin/env node
/**
 * Idempotent database migrations with a fail-closed maintenance boundary.
 *
 * Files containing `-- nova:maintenance-required` are never applied by the
 * normal Docker/Railway startup path. They require an exact one-off opt-in after
 * the old monolith has been stopped; the SQL migration independently checks the
 * database heartbeat grace before changing schema.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const MAINTENANCE_MARKER = '-- nova:maintenance-required';
const MAINTENANCE_ACK = 'stop-old-monolith-confirmed';

function isMaintenanceMigration(sql) {
  return sql.includes(MAINTENANCE_MARKER);
}

function assertMaintenanceAuthorized(file, sql, env = process.env) {
  if (!isMaintenanceMigration(sql)) return;

  if (env.NOVA_ROLLING_STARTUP === '1') {
    throw new Error(
      `Pending maintenance migration ${file} cannot run during rolling startup; `
      + 'stop the old monolith and use the maintenance runbook',
    );
  }
  if (env.NOVA_MAINTENANCE_MIGRATION !== file || env.NOVA_MAINTENANCE_ACK !== MAINTENANCE_ACK) {
    throw new Error(
      `Pending maintenance migration ${file} requires NOVA_MAINTENANCE_MIGRATION=${file} `
      + `and NOVA_MAINTENANCE_ACK=${MAINTENANCE_ACK} after the old monolith is stopped`,
    );
  }
}

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  console.log('Connecting to database...');
  const sslEnv = (process.env.DATABASE_SSL || '').toLowerCase();
  const sslDisabled = ['false', '0', 'no', 'off'].includes(sslEnv);
  let isLocal = false;
  try {
    const host = new URL(databaseUrl).hostname;
    isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host);
  } catch {
    isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
  }
  const useSsl = !sslDisabled && !isLocal;
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const appliedResult = await pool.query('SELECT name FROM _migrations');
    const applied = new Set(appliedResult.rows.map(row => row.name));
    const migrationsDir = path.join(__dirname, '..', 'infra', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();

    let newMigrations = 0;
    let skipped = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`⏭ ${file} (already applied)`);
        skipped += 1;
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const maintenance = isMaintenanceMigration(sql);
      assertMaintenanceAuthorized(file, sql);
      console.log(`Running migration: ${file}${maintenance ? ' (maintenance)' : ''}`);

      const client = await pool.connect();
      try {
        if (maintenance) {
          await client.query("SELECT set_config('nova.maintenance_mode', 'on', false)");
        }
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [file],
        );
        console.log(`✓ ${file} completed`);
        newMigrations += 1;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (!maintenance && error.message.includes('already exists')) {
          console.log(`⚠ ${file} (schema already exists, marking as applied)`);
          await client.query(
            'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
            [file],
          );
          skipped += 1;
        } else {
          throw error;
        }
      } finally {
        if (maintenance) {
          await client.query('RESET nova.maintenance_mode').catch(() => undefined);
        }
        client.release();
      }
    }

    console.log(`\n✓ Migrations complete: ${newMigrations} applied, ${skipped} skipped`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch(error => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  MAINTENANCE_ACK,
  MAINTENANCE_MARKER,
  assertMaintenanceAuthorized,
  isMaintenanceMigration,
  runMigrations,
};
