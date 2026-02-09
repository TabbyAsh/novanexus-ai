#!/usr/bin/env node
/**
 * Idempotent Database Migrations
 * Tracks applied migrations in _migrations table.
 * Handles "already exists" errors gracefully.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  
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
  const pool = new Pool({ connectionString: databaseUrl, ssl: useSsl ? { rejectUnauthorized: false } : false });
  
  try {
    // Create migrations tracking table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get list of already applied migrations
    const appliedResult = await pool.query('SELECT name FROM _migrations');
    const applied = new Set(appliedResult.rows.map(r => r.name));

    const migrationsDir = path.join(__dirname, '..', 'infra', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    
    let newMigrations = 0;
    let skipped = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`⏭ ${file} (already applied)`);
        skipped++;
        continue;
      }

      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      try {
        await pool.query(sql);
        // Record successful migration
        await pool.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [file]);
        console.log(`✓ ${file} completed`);
        newMigrations++;
      } catch (error) {
        // Handle "already exists" errors gracefully
        if (error.message.includes('already exists')) {
          console.log(`⚠ ${file} (schema already exists, marking as applied)`);
          await pool.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [file]);
          skipped++;
        } else {
          throw error;
        }
      }
    }
    
    console.log(`\n✓ Migrations complete: ${newMigrations} applied, ${skipped} skipped`);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
