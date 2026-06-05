#!/usr/bin/env node
/**
 * Removes automated test accounts from the database.
 * Keeps: real user emails only (non-test, non-example.com, non-test.io, non-test.com)
 * Dry run by default. Pass --execute to actually delete.
 *
 * Run via: railway run node scripts/clean-test-accounts.js
 * Execute: railway run node scripts/clean-test-accounts.js --execute
 */

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_PATTERNS = [
  '@example.com',
  '@test.com',
  '@test.io',
  'ops-test+',
  'testuser@',
  'qa+',
  'final1780',
  'e2e1780',
  'verify1780',
  'test_probe@',
];

function isTestAccount(email) {
  return TEST_PATTERNS.some(p => email.includes(p));
}

async function run() {
  const isDryRun = !process.argv.includes('--execute');
  const client = await pool.connect();

  try {
    const { rows: users } = await client.query(
      'SELECT id, email, created_at FROM users ORDER BY created_at ASC'
    );

    const testAccounts = users.filter(u => isTestAccount(u.email));
    const realAccounts = users.filter(u => !isTestAccount(u.email));

    console.log(`\nTotal accounts: ${users.length}`);
    console.log(`Real accounts:  ${realAccounts.length}`);
    console.log(`Test accounts:  ${testAccounts.length}`);

    console.log('\n--- REAL ACCOUNTS (keeping) ---');
    realAccounts.forEach(u => console.log(`  ✓ ${u.email} (joined ${u.created_at.toISOString().split('T')[0]})`));

    console.log('\n--- TEST ACCOUNTS (deleting) ---');
    testAccounts.forEach(u => console.log(`  ✗ ${u.email}`));

    if (isDryRun) {
      console.log('\n[DRY RUN] No changes made. Run with --execute to delete test accounts.');
      return;
    }

    // Delete in dependency order
    const testIds = testAccounts.map(u => u.id);
    if (testIds.length === 0) {
      console.log('\nNothing to delete.');
      return;
    }

    const idList = testIds.map((_, i) => `$${i + 1}`).join(',');

    await client.query('BEGIN');

    // Delete dependent records first
    for (const table of [
      'outcome_events', 'outcome_summaries', 'user_alerts', 'user_api_keys',
      'user_screener_configs', 'udm_wallets', 'referral_codes', 'referral_rewards',
      'entitlements', 'api_keys', 'broker_connections', 'org_members',
    ]) {
      try {
        const r = await client.query(
          `DELETE FROM ${table} WHERE user_id IN (${idList})`, testIds
        );
        if (r.rowCount > 0) console.log(`  Deleted ${r.rowCount} rows from ${table}`);
      } catch { /* table may not exist */ }
    }

    // Delete the users themselves
    const result = await client.query(
      `DELETE FROM users WHERE id IN (${idList})`, testIds
    );
    await client.query('COMMIT');

    console.log(`\n✅ Deleted ${result.rowCount} test accounts.`);
    console.log(`   ${realAccounts.length} real accounts remain.`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
