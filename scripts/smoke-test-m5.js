#!/usr/bin/env node
/**
 * Milestone 5 Smoke Test
 * 
 * Verifies end-to-end workflow:
 * 1. Creates a scan task
 * 2. Waits for completion
 * 3. Fetches resulting thesis cards
 * 4. Creates a paper trade task
 * 5. Confirms PnL entry exists
 * 
 * Usage: node scripts/smoke-test-m5.js [--api-url=http://localhost:3000]
 */

const API_URL = process.env.API_URL || process.argv.find(a => a.startsWith('--api-url='))?.split('=')[1] || 'http://localhost:3000';
const TRADEBOT_URL = process.env.TRADEBOT_URL || 'http://localhost:3010';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const log = (level, msg, data = {}) => {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${msg}${dataStr}`);
};

const info = (msg, data) => log('info', msg, data);
const success = (msg, data) => log('success', msg, data);
const error = (msg, data) => log('error', msg, data);
const step = (n, msg) => console.log(`\n${'='.repeat(60)}\nSTEP ${n}: ${msg}\n${'='.repeat(60)}`);

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

async function waitForCondition(checkFn, maxAttempts = 30, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await checkFn();
    if (result.done) return result;
    await sleep(intervalMs);
  }
  return { done: false, error: 'Timeout waiting for condition' };
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('MILESTONE 5 SMOKE TEST');
  console.log('='.repeat(60));
  info('API URL:', { url: API_URL });
  info('TradeBot URL:', { url: TRADEBOT_URL });

  let testUser = null;
  let accessToken = null;
  let goalId = null;
  let thesisId = null;
  let tradeId = null;

  try {
    // =========================================
    // Step 1: Check services are healthy
    // =========================================
    step(1, 'Health Check');

    const services = [
      { name: 'Gateway', url: `${API_URL}/health` },
      { name: 'TradeBot', url: `${TRADEBOT_URL}/health` },
    ];

    for (const service of services) {
      const result = await fetchJson(service.url);
      if (!result.ok) {
        error(`${service.name} health check failed`, { url: service.url, status: result.status });
        throw new Error(`${service.name} is not healthy`);
      }
      success(`${service.name} is healthy`, result.data);
    }

    // =========================================
    // Step 2: Register/Login test user
    // =========================================
    step(2, 'Authentication');

    const testEmail = `smoke-test-${Date.now()}@nova.test`;
    const testPassword = 'TestPassword123!';

    info('Registering test user', { email: testEmail });
    const registerResult = await fetchJson(`${API_URL}/v1/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: testPassword, orgName: 'Smoke Test Org' }),
    });

    if (!registerResult.ok || !registerResult.data?.success) {
      error('Registration failed', registerResult.data);
      throw new Error('Failed to register test user');
    }

    accessToken = registerResult.data.data.accessToken;
    testUser = registerResult.data.data.user;
    success('Test user registered', { userId: testUser.id });

    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    // =========================================
    // Step 3: Create a goal
    // =========================================
    step(3, 'Create Goal');

    const createGoalResult = await fetchJson(`${API_URL}/v1/goals`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Smoke Test Trading Goal',
        intent: 'Test the trade workflow end-to-end',
      }),
    });

    if (!createGoalResult.ok || !createGoalResult.data?.success) {
      error('Failed to create goal', createGoalResult.data);
      throw new Error('Failed to create goal');
    }

    goalId = createGoalResult.data.data.goal.id;
    success('Goal created', { goalId });

    // =========================================
    // Step 4: Run market scan via TradeBot API
    // =========================================
    step(4, 'Run Market Scan');

    const scanResult = await fetchJson(`${TRADEBOT_URL}/api/scan`, {
      method: 'POST',
      body: JSON.stringify({ watchlistId: 'default' }),
    });

    if (!scanResult.ok || !scanResult.data?.success) {
      error('Market scan failed', scanResult.data);
      throw new Error('Market scan failed');
    }

    const scanResults = scanResult.data.data.results;
    success('Market scan completed', { 
      symbolsScanned: scanResults.length,
      buySignals: scanResults.filter(r => r.signal === 'BUY').length,
      sellSignals: scanResults.filter(r => r.signal === 'SELL').length,
    });

    if (scanResults.length === 0) {
      error('No scan results returned');
      throw new Error('Scan returned no results');
    }

    // Pick top result
    const topSignal = scanResults[0];
    info('Top signal', { symbol: topSignal.symbol, signal: topSignal.signal, score: topSignal.score });

    // =========================================
    // Step 5: Generate thesis card
    // =========================================
    step(5, 'Generate Thesis Card');

    const thesisResult = await fetchJson(`${TRADEBOT_URL}/api/theses`, {
      method: 'POST',
      body: JSON.stringify({ symbol: topSignal.symbol }),
    });

    if (!thesisResult.ok || !thesisResult.data?.success) {
      error('Thesis generation failed', thesisResult.data);
      throw new Error('Thesis generation failed');
    }

    const thesis = thesisResult.data.data.thesis;
    thesisId = thesis.id;
    success('Thesis generated', {
      thesisId,
      symbol: thesis.symbol,
      signal: thesis.signal,
      entryPrice: thesis.entryPrice,
      targetPrice: thesis.targetPrice,
      stopLoss: thesis.stopLoss,
      confidence: Math.round(thesis.confidence),
    });

    // =========================================
    // Step 6: Fetch thesis cards list
    // =========================================
    step(6, 'Verify Thesis Cards List');

    const thesesListResult = await fetchJson(`${TRADEBOT_URL}/api/theses`);

    if (!thesesListResult.ok || !thesesListResult.data?.success) {
      error('Failed to fetch theses list', thesesListResult.data);
      throw new Error('Failed to fetch theses list');
    }

    const thesesList = thesesListResult.data.data.theses;
    success('Theses list fetched', { count: thesesList.length });

    const ourThesis = thesesList.find(t => t.id === thesisId);
    if (!ourThesis) {
      error('Created thesis not found in list', { thesisId });
      throw new Error('Thesis not found in list');
    }
    success('Verified thesis exists in list');

    // =========================================
    // Step 7: Create paper trade
    // =========================================
    step(7, 'Create Paper Trade');

    const paperTradeResult = await fetchJson(`${TRADEBOT_URL}/api/trades`, {
      method: 'POST',
      body: JSON.stringify({ thesisId, quantity: 10 }),
    });

    if (!paperTradeResult.ok || !paperTradeResult.data?.success) {
      error('Paper trade creation failed', paperTradeResult.data);
      throw new Error('Paper trade creation failed');
    }

    const trade = paperTradeResult.data.data.trade;
    tradeId = trade.id;
    success('Paper trade created', {
      tradeId,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      status: trade.status,
    });

    // =========================================
    // Step 8: Verify PnL tracking
    // =========================================
    step(8, 'Verify PnL Tracking');

    const tradesListResult = await fetchJson(`${TRADEBOT_URL}/api/trades`);

    if (!tradesListResult.ok || !tradesListResult.data?.success) {
      error('Failed to fetch trades list', tradesListResult.data);
      throw new Error('Failed to fetch trades list');
    }

    const tradesData = tradesListResult.data.data;
    success('Trades data fetched', {
      totalTrades: tradesData.stats.totalTrades,
      openTrades: tradesData.stats.openTrades,
      closedTrades: tradesData.stats.closedTrades,
      portfolioValue: tradesData.stats.portfolioValue,
    });

    const ourTrade = tradesData.trades.find(t => t.id === tradeId);
    if (!ourTrade) {
      error('Created trade not found in list', { tradeId });
      throw new Error('Trade not found in list');
    }
    success('Verified trade exists in list', { status: ourTrade.status });

    // =========================================
    // Step 9: Close the paper trade
    // =========================================
    step(9, 'Close Paper Trade');

    const closeTradeResult = await fetchJson(`${TRADEBOT_URL}/api/trades/${tradeId}/close`, {
      method: 'POST',
    });

    if (!closeTradeResult.ok || !closeTradeResult.data?.success) {
      error('Failed to close trade', closeTradeResult.data);
      throw new Error('Failed to close trade');
    }

    const closedTrade = closeTradeResult.data.data.trade;
    success('Trade closed', {
      tradeId: closedTrade.id,
      status: closedTrade.status,
      pnl: closedTrade.pnl,
      pnlPercent: closedTrade.pnlPercent,
    });

    // =========================================
    // Step 10: Final verification
    // =========================================
    step(10, 'Final Verification');

    const finalTradesResult = await fetchJson(`${TRADEBOT_URL}/api/trades`);

    if (!finalTradesResult.ok) {
      throw new Error('Failed final verification');
    }

    const finalStats = finalTradesResult.data.data.stats;
    success('Final stats', {
      totalTrades: finalStats.totalTrades,
      closedTrades: finalStats.closedTrades,
      winRate: `${finalStats.winRate}%`,
      totalPnl: finalStats.totalPnl,
      portfolioValue: finalStats.portfolioValue,
    });

    // =========================================
    // SUCCESS
    // =========================================
    console.log('\n' + '='.repeat(60));
    console.log('✅ MILESTONE 5 SMOKE TEST PASSED');
    console.log('='.repeat(60));
    console.log('\nVerified:');
    console.log('  ✓ Services are healthy (Gateway, TradeBot)');
    console.log('  ✓ User registration and authentication');
    console.log('  ✓ Goal creation');
    console.log('  ✓ Market scan execution');
    console.log('  ✓ Thesis card generation');
    console.log('  ✓ Thesis cards list retrieval');
    console.log('  ✓ Paper trade creation');
    console.log('  ✓ PnL tracking verification');
    console.log('  ✓ Trade closure and final PnL');
    console.log('\n');

    process.exit(0);

  } catch (err) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ MILESTONE 5 SMOKE TEST FAILED');
    console.log('='.repeat(60));
    error('Test failed', { message: err.message });
    console.log('\n');
    process.exit(1);
  }
}

main();
