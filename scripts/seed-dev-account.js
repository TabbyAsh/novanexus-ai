#!/usr/bin/env node
/**
 * seed-dev-account.js — Create or upgrade the developer/founder account
 *
 * Usage:
 *   DATABASE_URL=postgres://... DEV_ACCOUNT_PASSWORD=YourSecurePass1 node scripts/seed-dev-account.js
 *
 * Environment variables:
 *   DATABASE_URL            — Required. Postgres connection string.
 *   DEV_ACCOUNT_EMAIL       — Optional. Default: wyatt@novanexus-ai.com
 *   DEV_ACCOUNT_PASSWORD    — Required. Must meet auth policy (8+ chars, upper, lower, digit).
 *   DEV_ACCOUNT_ORG_NAME    — Optional. Default: "Nova Enterprises HQ"
 *
 * Behaviour:
 *   - If the user already exists, upgrades their entitlement to PRO.
 *   - If the user does not exist, creates user + org + policies + PRO entitlement.
 *   - Fully idempotent — safe to run multiple times.
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL;
const EMAIL = (process.env.DEV_ACCOUNT_EMAIL || 'wyatt@novanexus-ai.com').toLowerCase();
const PASSWORD = process.env.DEV_ACCOUNT_PASSWORD;
const ORG_NAME = process.env.DEV_ACCOUNT_ORG_NAME || 'Nova Enterprises HQ';
const BCRYPT_ROUNDS = 12;

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL is required');
  process.exit(1);
}

if (!PASSWORD) {
  console.error('❌  DEV_ACCOUNT_PASSWORD is required');
  process.exit(1);
}

// Validate password policy (matches auth service)
if (PASSWORD.length < 8 || !/[A-Z]/.test(PASSWORD) || !/[a-z]/.test(PASSWORD) || !/[0-9]/.test(PASSWORD)) {
  console.error('❌  Password must be ≥8 chars with at least one uppercase, lowercase, and digit');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   NOVA DEV ACCOUNT SEEDER            ║');
  console.log('╚══════════════════════════════════════╝');
  console.log();
  console.log(`Email:   ${EMAIL}`);
  console.log(`Org:     ${ORG_NAME}`);
  console.log(`Plan:    PRO (unlimited)`);
  console.log();

  // Check if user already exists
  const existing = await pool.query(
    'SELECT u.id, om.org_id FROM users u LEFT JOIN org_members om ON om.user_id = u.id WHERE LOWER(u.email) = $1 LIMIT 1',
    [EMAIL]
  );

  if (existing.rows.length > 0) {
    const userId = existing.rows[0].id;
    const orgId = existing.rows[0].org_id;
    console.log(`✅ User already exists (${userId.substring(0, 8)}…)`);

    if (orgId) {
      await pool.query(
        `INSERT INTO entitlements (user_id, org_id, plan, status)
         VALUES ($1, $2, 'PRO', 'ACTIVE')
         ON CONFLICT (user_id) DO UPDATE SET plan = 'PRO', status = 'ACTIVE', updated_at = NOW()`,
        [userId, orgId]
      );
      console.log('✅ Entitlement upgraded to PRO');
    } else {
      console.warn('⚠️  User has no org membership — creating org...');
      const orgRes = await pool.query(`INSERT INTO orgs (name) VALUES ($1) RETURNING id`, [ORG_NAME]);
      const newOrgId = orgRes.rows[0].id;
      await pool.query(`INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [newOrgId, userId]);
      await pool.query(
        `INSERT INTO entitlements (user_id, org_id, plan, status) VALUES ($1, $2, 'PRO', 'ACTIVE')
         ON CONFLICT (user_id) DO UPDATE SET plan = 'PRO', status = 'ACTIVE', org_id = $2, updated_at = NOW()`,
        [userId, newOrgId]
      );
      console.log(`✅ Org created & entitlement set to PRO`);
    }

    // Optionally update password
    const hashedPw = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET hashed_pw = $1, updated_at = NOW() WHERE id = $2', [hashedPw, userId]);
    console.log('✅ Password updated');

    await finish();
    return;
  }

  // ── Create new user ──
  console.log('Creating new dev account…');
  const hashedPw = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // User
    const userRes = await client.query(
      `INSERT INTO users (email, hashed_pw, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [EMAIL, hashedPw]
    );
    const userId = userRes.rows[0].id;

    // Org
    const orgRes = await client.query(
      `INSERT INTO orgs (name) VALUES ($1) RETURNING id`,
      [ORG_NAME]
    );
    const orgId = orgRes.rows[0].id;

    // Membership
    await client.query(
      `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [orgId, userId]
    );

    // Policies (OWNER gets wildcard)
    const policies = [
      { role: 'OWNER', action: '*', resource: '*', effect: 'ALLOW' },
      { role: 'ADMIN', action: 'trade.*', resource: '*', effect: 'ALLOW' },
      { role: 'ADMIN', action: 'store.*', resource: '*', effect: 'ALLOW' },
      { role: 'MEMBER', action: 'trade.read', resource: '*', effect: 'ALLOW' },
      { role: 'MEMBER', action: 'trade.paper.execute', resource: '*', effect: 'ALLOW' },
      { role: 'VIEWER', action: '*.read', resource: '*', effect: 'ALLOW' },
    ];
    for (const p of policies) {
      await client.query(
        `INSERT INTO policies (org_id, subject_role, action, resource, effect) VALUES ($1, $2, $3, $4, $5)`,
        [orgId, p.role, p.action, p.resource, p.effect]
      );
    }

    // Entitlement — PRO plan (all limits -1 = unlimited)
    await client.query(
      `INSERT INTO entitlements (user_id, org_id, plan, status) VALUES ($1, $2, 'PRO', 'ACTIVE')`,
      [userId, orgId]
    );

    await client.query('COMMIT');

    console.log(`✅ User created:    ${userId}`);
    console.log(`✅ Org created:     ${orgId}`);
    console.log(`✅ Role:            OWNER`);
    console.log(`✅ Plan:            PRO (unlimited)`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await finish();
}

async function finish() {
  console.log();
  console.log('──────────────────────────────────────');
  console.log('🎉 Dev account ready. Log in at your frontend with:');
  console.log(`   Email:    ${EMAIL}`);
  console.log(`   Password: (the one you provided via DEV_ACCOUNT_PASSWORD)`);
  console.log();
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  pool.end();
  process.exit(1);
});
