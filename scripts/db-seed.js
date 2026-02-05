#!/usr/bin/env node

/**
 * Database Seed Script for Nova Hub
 * 
 * Creates a demo user, organization, and sample data for local development.
 * 
 * Usage: npm run db:seed
 * 
 * Requirements:
 * - PostgreSQL running on localhost:5432
 * - DATABASE_URL set or using default connection
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://nova:nova_dev_password@localhost:5432/nova';
const BCRYPT_ROUNDS = 12;

async function seed() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('🔌 Connected to database');

    // Check if seed data already exists
    const existingUser = await client.query(
      "SELECT id FROM users WHERE email = 'demo@novahub.io'"
    );
    
    if (existingUser.rows.length > 0) {
      console.log('⚠️  Seed data already exists. Skipping...');
      return;
    }

    console.log('🌱 Seeding database...');

    // Create demo user
    const hashedPassword = await bcrypt.hash('Demo123!', BCRYPT_ROUNDS);
    const userResult = await client.query(
      `INSERT INTO users (email, hashed_pw, status)
       VALUES ('demo@novahub.io', $1, 'ACTIVE')
       RETURNING id`,
      [hashedPassword]
    );
    const userId = userResult.rows[0].id;
    console.log(`✅ Created demo user: demo@novahub.io (password: Demo123!)`);

    // Create demo organization
    const orgResult = await client.query(
      `INSERT INTO orgs (name) VALUES ('Demo Organization') RETURNING id`
    );
    const orgId = orgResult.rows[0].id;
    console.log(`✅ Created demo organization: Demo Organization`);

    // Add user to org as OWNER
    await client.query(
      `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [orgId, userId]
    );
    console.log('✅ Added user to organization as OWNER');

    // Create default policies
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
        [orgId, policy.role, policy.action, policy.resource, policy.effect]
      );
    }
    console.log('✅ Created default policies');

    // Create sample goal
    const goalResult = await client.query(
      `INSERT INTO goals (org_id, created_by, title, intent, status)
       VALUES ($1, $2, 'Setup Trading Dashboard', 'Configure paper trading watchlist and alerts', 'NEW')
       RETURNING id`,
      [orgId, userId]
    );
    const goalId = goalResult.rows[0].id;
    console.log('✅ Created sample goal');

    // Create sample watchlist
    const watchlistResult = await client.query(
      `INSERT INTO watchlists (org_id, name) VALUES ($1, 'Demo Watchlist') RETURNING id`,
      [orgId]
    );
    const watchlistId = watchlistResult.rows[0].id;

    // Add sample symbols
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA'];
    for (const symbol of symbols) {
      await client.query(
        `INSERT INTO watchlist_items (watchlist_id, symbol) VALUES ($1, $2)`,
        [watchlistId, symbol]
      );
    }
    console.log('✅ Created sample watchlist with symbols');

    // Create sample event
    const ts = new Date().toISOString();
    const payload = JSON.stringify({ userId, email: 'demo@novahub.io', orgId });
    const prevHash = '0'.repeat(64);
    const hashInput = `${prevHash}:${payload}:auth.user.created:${ts}:USER:${userId}`;
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

    await client.query(
      `INSERT INTO events (org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash)
       VALUES ($1, 'USER', $2, 'auth.user.created', $3, $4, $5, $6)`,
      [orgId, userId, ts, payload, prevHash, hash]
    );
    console.log('✅ Created sample event');

    // Create sample content item
    await client.query(
      `INSERT INTO content_items (org_id, channel, title, script, status)
       VALUES ($1, 'youtube', 'Getting Started with Nova Hub', 
               'Introduction to Nova Hub features and capabilities...', 'IDEA')`,
      [orgId]
    );
    console.log('✅ Created sample content item');

    console.log('');
    console.log('🎉 Seed complete!');
    console.log('');
    console.log('📋 Demo Credentials:');
    console.log('   Email:    demo@novahub.io');
    console.log('   Password: Demo123!');
    console.log('');

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Disconnected from database');
  }
}

seed();
