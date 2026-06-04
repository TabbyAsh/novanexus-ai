#!/usr/bin/env node
/**
 * One-time admin account setup.
 * Run via: railway run node scripts/fix-admin-account.js
 *
 * Sets wyatt@novanexus-ai.com to:
 * - Role: OWNER
 * - Plan: FOUNDING
 * - Status: ACTIVE
 * - Entitlements: unlimited / all features
 * - Rate limits: bypassed for admin
 */

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ADMIN_EMAIL = 'wyatt@novanexus-ai.com';

const ALL_FEATURES = [
  // Core
  'scanner', 'watchlists', 'alerts', 'basic_scanner', 'watchlist_1', 'paper_trading',
  'thesis_cards', 'decisions',
  // Lite+
  'reports', 'csv_export', 'decision_replay',
  // Pro+
  'pdf_export', 'api_access', 'priority_support',
  // Founding
  'founding_badge', 'concierge_onboarding', 'early_access', 'flip_pipeline',
  'deal_cards', 'mode_control', 'advanced_analytics',
  // Admin
  'admin_access', 'unlimited_usage', 'rate_limit_bypass',
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Find the user
    const userResult = await client.query(
      'SELECT id, email, status FROM users WHERE email = $1',
      [ADMIN_EMAIL]
    );

    if (userResult.rows.length === 0) {
      console.error(`❌ User not found: ${ADMIN_EMAIL}`);
      console.log('   Make sure you have registered at novanexus-ai.com first.');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`✅ Found user: ${user.email} (id: ${user.id})`);

    // 2. Ensure user is ACTIVE
    await client.query(
      `UPDATE users SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
      [user.id]
    );
    console.log('✅ User status: ACTIVE');

    // 3. Find the org this user belongs to
    const orgResult = await client.query(
      `SELECT org_id, role FROM org_members WHERE user_id = $1 ORDER BY joined_at ASC LIMIT 1`,
      [user.id]
    );

    let orgId;
    if (orgResult.rows.length === 0) {
      // Create an org if none exists
      const newOrg = await client.query(
        `INSERT INTO orgs (name, created_at) VALUES ($1, NOW()) RETURNING id`,
        ['Nova Admin Org']
      );
      orgId = newOrg.rows[0].id;
      await client.query(
        `INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES ($1, $2, 'OWNER', NOW())`,
        [orgId, user.id]
      );
      console.log(`✅ Created org and set role: OWNER`);
    } else {
      orgId = orgResult.rows[0].id;
      // Upgrade role to OWNER
      await client.query(
        `UPDATE org_members SET role = 'OWNER' WHERE user_id = $1 AND org_id = $2`,
        [user.id, orgId]
      );
      console.log(`✅ Role set to OWNER (org: ${orgId})`);
    }

    // 4. Upsert entitlement to FOUNDING with all features + no expiry
    const entitlementResult = await client.query(
      `SELECT id FROM entitlements WHERE user_id = $1`,
      [user.id]
    );

    if (entitlementResult.rows.length === 0) {
      await client.query(
        `INSERT INTO entitlements (user_id, org_id, plan, status, features_json, current_period_end)
         VALUES ($1, $2, 'FOUNDING', 'ACTIVE', $3, '2099-12-31T00:00:00Z')`,
        [user.id, orgId, JSON.stringify(ALL_FEATURES)]
      );
      console.log('✅ Entitlement created: FOUNDING / ACTIVE / all features / no expiry');
    } else {
      await client.query(
        `UPDATE entitlements
         SET plan = 'FOUNDING',
             status = 'ACTIVE',
             features_json = $2,
             current_period_end = '2099-12-31T00:00:00Z',
             updated_at = NOW()
         WHERE user_id = $1`,
        [user.id, JSON.stringify(ALL_FEATURES)]
      );
      console.log('✅ Entitlement updated: FOUNDING / ACTIVE / all features / no expiry');
    }

    // 5. Remove ALL rate limits for this user (set generous UDM wallet)
    try {
      await client.query(
        `INSERT INTO udm_wallets (user_id, balance_clarity, balance_foresight, balance_autonomy)
         VALUES ($1, 99999, 99999, 99999)
         ON CONFLICT (user_id) DO UPDATE SET
           balance_clarity = 99999,
           balance_foresight = 99999,
           balance_autonomy = 99999,
           updated_at = NOW()`,
        [user.id]
      );
      console.log('✅ UDM wallet: unlimited (99999 on all tiers)');
    } catch {
      console.log('ℹ️  UDM wallet update skipped (table may not exist)');
    }

    // 6. Set governance mode to AUTOMATE for all sectors
    const sectors = ['stocks', 'marketplace', 'flipper', 'dropship', 'social'];
    for (const sector of sectors) {
      try {
        await client.query(
          `INSERT INTO system_modes (user_id, sector, mode, updated_at)
           VALUES ($1, $2, 'AUTOMATE', NOW())
           ON CONFLICT (user_id, sector) DO UPDATE SET mode = 'AUTOMATE', updated_at = NOW()`,
          [user.id, sector]
        );
      } catch { /* skip if table doesn't exist */ }
    }
    console.log('✅ Governance mode: AUTOMATE on all sectors');

    // 7. Add to admin scopes via policy
    try {
      await client.query(
        `INSERT INTO policies (org_id, subject_role, action, resource, effect)
         VALUES ($1, 'OWNER', 'admin.users', '*', 'ALLOW')
         ON CONFLICT DO NOTHING`,
        [orgId]
      );
      await client.query(
        `INSERT INTO policies (org_id, subject_role, action, resource, effect)
         VALUES ($1, 'OWNER', 'ops.admin', '*', 'ALLOW')
         ON CONFLICT DO NOTHING`,
        [orgId]
      );
      await client.query(
        `INSERT INTO policies (org_id, subject_role, action, resource, effect)
         VALUES ($1, 'OWNER', 'admin.killswitch', '*', 'ALLOW')
         ON CONFLICT DO NOTHING`,
        [orgId]
      );
    } catch { /* skip if policies already exist */ }
    console.log('✅ Admin policies: ops.admin + admin.users + admin.killswitch');

    await client.query('COMMIT');

    console.log('\n═══════════════════════════════════════════════');
    console.log('✅ ADMIN ACCOUNT SETUP COMPLETE');
    console.log('═══════════════════════════════════════════════');
    console.log(`Email:    ${ADMIN_EMAIL}`);
    console.log('Plan:     FOUNDING');
    console.log('Role:     OWNER');
    console.log('Status:   ACTIVE');
    console.log('Expires:  2099-12-31 (effectively never)');
    console.log('Features: ALL (including admin + unlimited usage)');
    console.log('Modes:    AUTOMATE on all sectors');
    console.log('═══════════════════════════════════════════════');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
