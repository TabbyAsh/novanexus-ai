#!/usr/bin/env node
/**
 * seed-prod.js - Idempotent production seeding for reproducible backtest/Monte Carlo results
 * 
 * Usage: npm run seed:prod
 * 
 * Creates deterministic seeded results that can be verified via /v1/sim/seeded
 */

const API_URL = process.env.API_URL || 'https://abackend-production.up.railway.app';
const SEED_TOKEN = process.env.SEED_TOKEN || process.env.JWT_SECRET || '';

// Deterministic seed configurations
const SEED_CONFIGS = [
  {
    strategyTag: 'seeded_sma_spy_v1',
    symbol: 'SPY',
    strategyType: 'sma_crossover',
    seed: 42,
    startDate: '2025-01-01',
    endDate: '2025-06-30',
  },
  {
    strategyTag: 'seeded_momentum_qqq_v1',
    symbol: 'QQQ',
    strategyType: 'momentum',
    seed: 123,
    startDate: '2025-01-01',
    endDate: '2025-06-30',
  },
  {
    strategyTag: 'seeded_mean_reversion_iwm_v1',
    symbol: 'IWM',
    strategyType: 'mean_reversion',
    seed: 456,
    startDate: '2025-01-01',
    endDate: '2025-06-30',
  },
];

async function getAuthToken() {
  // Try to get a test user token for seeding
  // In production, this would use a service account
  const testEmail = process.env.SEED_EMAIL || 'test@novanexus.ai';
  const testPassword = process.env.SEED_PASSWORD || 'testpass123';

  try {
    const res = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    const data = await res.json();
    if (data.success && data.data?.accessToken) {
      return data.data.accessToken;
    }
  } catch (e) {
    console.warn('Auth failed, trying without token');
  }

  return null;
}

async function runSeedSimulation(config, token) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    // Run via /v1/strategy-simulator which stores results in strategy_performance
    const res = await fetch(`${API_URL}/v1/strategy-simulator`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        symbol: config.symbol,
        strategyType: config.strategyType,
        strategyTag: config.strategyTag,
        startDate: config.startDate,
        endDate: config.endDate,
        initialCapital: 100000,
        params: { seed: config.seed },
      }),
    });

    const data = await res.json();

    if (data.success) {
      console.log(`  ✅ ${config.strategyTag}: Seeded successfully`);
      console.log(`     Symbol: ${config.symbol}, Strategy: ${config.strategyType}`);
      if (data.data?.simulation?.backtest) {
        const bt = data.data.simulation.backtest;
        console.log(`     Win Rate: ${bt.winRate}%, Sharpe: ${bt.sharpeRatio}, Fitness: ${data.data.simulation.fitnessScore || 'N/A'}`);
      }
      if (data.data?.simulation?.monteCarlo) {
        const mc = data.data.simulation.monteCarlo;
        console.log(`     Monte Carlo P50: ${mc.percentile50}%, Expected: ${mc.expectedValue}%`);
      }
      return true;
    } else {
      console.log(`  ⚠️  ${config.strategyTag}: ${data.error?.message || 'Failed'}`);
      return false;
    }
  } catch (e) {
    console.log(`  ❌ ${config.strategyTag}: Network error - ${e.message}`);
    return false;
  }
}

async function checkSeededExists() {
  try {
    const res = await fetch(`${API_URL}/v1/sim/health`);
    const data = await res.json();
    return data.success && data.data?.status === 'healthy';
  } catch {
    return false;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   NOVA PRODUCTION SEEDING            ║');
  console.log('╚══════════════════════════════════════╝');
  console.log();
  console.log(`API URL: ${API_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log();

  // Check sim health first
  console.log('Checking simulator health...');
  const simHealthy = await checkSeededExists();
  if (!simHealthy) {
    console.log('⚠️  Simulator not healthy, seeding may fail');
  } else {
    console.log('✅ Simulator healthy');
  }
  console.log();

  // Get auth token
  console.log('Authenticating...');
  const token = await getAuthToken();
  if (token) {
    console.log('✅ Authenticated');
  } else {
    console.log('⚠️  No auth token - some operations may fail');
  }
  console.log();

  // Run seeds
  console.log('Running deterministic seed simulations...');
  console.log();

  let successCount = 0;
  for (const config of SEED_CONFIGS) {
    const success = await runSeedSimulation(config, token);
    if (success) successCount++;
    console.log();
  }

  console.log('──────────────────────────────────────────────────');
  console.log();
  console.log(`📊 Results: ${successCount}/${SEED_CONFIGS.length} seeded successfully`);
  console.log();

  if (successCount === SEED_CONFIGS.length) {
    console.log('✅ SEEDING COMPLETE');
    process.exit(0);
  } else if (successCount > 0) {
    console.log('⚠️  PARTIAL SEEDING (some simulations failed)');
    process.exit(0); // Still exit 0 for partial success
  } else {
    console.log('❌ SEEDING FAILED');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
