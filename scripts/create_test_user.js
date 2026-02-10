#!/usr/bin/env node

/**
 * Admin: Reset/recreate a test user in the target database.
 *
 * Usage:
 *   node scripts/create_test_user.js --email <email> --password <password> [--org "Org Name"] [--plan FREE|LITE|PRO] [--reset]
 *
 * Notes:
 * - Requires DATABASE_URL in environment.
 * - With --reset, deletes the existing user (and any orgs where they were the sole member).
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { reset: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--reset') {
      out.reset = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        out[key] = value;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function getFeatures(plan) {
  switch (plan) {
    case 'FREE':
      return ['basic_scanner', 'watchlist_1'];
    case 'LITE':
      return ['scanner', 'reports', 'alerts', 'watchlists', 'paper_trading', 'thesis_cards', 'csv_export'];
    case 'PRO':
      return ['scanner', 'reports', 'alerts', 'watchlists', 'paper_trading', 'thesis_cards', 'csv_export', 'pdf_export', 'api_access', 'priority_support'];
    default:
      return [];
  }
}

async function main() {
  const { email, password, org, plan = 'LITE', reset, 'password-env': passwordEnv } = parseArgs();
  const resolvedPassword = password || (passwordEnv ? process.env[passwordEnv] : process.env.TEST_USER_PASSWORD);

  if (!email || !resolvedPassword) {
    console.error('Usage: node scripts/create_test_user.js --email <email> --password <password> [--org "Org Name"] [--plan FREE|LITE|PRO] [--reset]');
    console.error('       or set TEST_USER_PASSWORD / use --password-env TEST_USER_PASSWORD');
    process.exit(1);
  }

  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  if (databaseUrl.includes('railway.internal') && process.env.RAILWAY_SERVICE_POSTGRES_URL) {
    try {
      const parsed = new URL(databaseUrl);
      const externalHost = String(process.env.RAILWAY_SERVICE_POSTGRES_URL || '').trim();
      if (externalHost) {
        parsed.hostname = externalHost;
        databaseUrl = parsed.toString();
      }
    } catch {}
  }

  const normalizedPlan = String(plan).toUpperCase();
  if (!['FREE', 'LITE', 'PRO'].includes(normalizedPlan)) {
    console.error(`Invalid plan: ${plan}. Use FREE, LITE, or PRO.`);
    process.exit(1);
  }

  const ssl = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false };

  const client = new Client({ connectionString: databaseUrl, ssl: ssl || undefined });

  try {
    await client.connect();
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existing.rows.length > 0) {
      if (!reset) {
        console.error(`User already exists: ${email}. Re-run with --reset to delete and recreate.`);
        await client.query('ROLLBACK');
        process.exit(1);
      }

      const userId = existing.rows[0].id;
      const orgs = await client.query(
        `SELECT om.org_id
         FROM org_members om
         GROUP BY om.org_id
         HAVING COUNT(*) = 1 AND SUM(CASE WHEN om.user_id = $1 THEN 1 ELSE 0 END) = 1`,
        [userId]
      );
      const orphanOrgIds = orgs.rows.map((r) => r.org_id);

      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      if (orphanOrgIds.length > 0) {
        await client.query('DELETE FROM orgs WHERE id = ANY($1::uuid[])', [orphanOrgIds]);
      }
    }

    const hashedPassword = await bcrypt.hash(resolvedPassword, BCRYPT_ROUNDS);
    const userResult = await client.query(
      `INSERT INTO users (email, hashed_pw, status)
       VALUES ($1, $2, 'ACTIVE')
       RETURNING id, email, status, created_at`,
      [email.toLowerCase(), hashedPassword]
    );
    const user = userResult.rows[0];

    const orgName = org || `${email.split('@')[0]}'s Organization`;
    const orgResult = await client.query(
      `INSERT INTO orgs (name) VALUES ($1) RETURNING id, name`,
      [orgName]
    );
    const orgRow = orgResult.rows[0];

    await client.query(
      `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [orgRow.id, user.id]
    );

    const policies = [
      { role: 'OWNER', action: '*', resource: '*', effect: 'ALLOW' },
      { role: 'ADMIN', action: 'trade.*', resource: '*', effect: 'ALLOW' },
      { role: 'ADMIN', action: 'store.*', resource: '*', effect: 'ALLOW' },
      { role: 'MEMBER', action: 'trade.read', resource: '*', effect: 'ALLOW' },
      { role: 'MEMBER', action: 'trade.paper.execute', resource: '*', effect: 'ALLOW' },
      { role: 'VIEWER', action: '*.read', resource: '*', effect: 'ALLOW' },
    ];

    for (const policy of policies) {
      await client.query(
        `INSERT INTO policies (org_id, subject_role, action, resource, effect)
         VALUES ($1, $2, $3, $4, $5)`,
        [orgRow.id, policy.role, policy.action, policy.resource, policy.effect]
      );
    }

    await client.query(
      `INSERT INTO entitlements (user_id, org_id, plan, status, features_json)
       VALUES ($1, $2, $3, 'ACTIVE', $4)
       ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status, features_json = EXCLUDED.features_json, updated_at = NOW()`,
      [user.id, orgRow.id, normalizedPlan, JSON.stringify(getFeatures(normalizedPlan))]
    );

    await client.query(
      `INSERT INTO usage_tracking (user_id, org_id, usage_date)
       VALUES ($1, $2, CURRENT_DATE)
       ON CONFLICT (user_id, usage_date) DO NOTHING`,
      [user.id, orgRow.id]
    );

    await client.query('COMMIT');

    console.log('✅ Test user ready');
    console.log(`   Email: ${user.email}`);
    console.log(`   Plan: ${normalizedPlan}`);
    console.log(`   Org: ${orgRow.name}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('❌ create_test_user failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
