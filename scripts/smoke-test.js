#!/usr/bin/env node
/**
 * Nova Enterprises - Smoke Test Script
 * Checks health endpoints for all services
 */

const http = require('http');
const https = require('https');

// Service health endpoints
const SERVICES = [
  { name: 'gateway', url: 'http://localhost:3000/health' },
  { name: 'auth', url: 'http://localhost:3001/health' },
  { name: 'orchestrator', url: 'http://localhost:3002/health' },
  { name: 'eventbus', url: 'http://localhost:3003/health' },
  { name: 'audit', url: 'http://localhost:3004/health' },
  { name: 'notifier', url: 'http://localhost:3005/health' },
  { name: 'billing', url: 'http://localhost:3006/health' },
  { name: 'tradebot', url: 'http://localhost:3010/health' },
  { name: 'storebot', url: 'http://localhost:3011/health' },
  { name: 'socialbot', url: 'http://localhost:3012/health' },
  { name: 'marketdata', url: 'http://localhost:3020/health' },
];

// MVP core services (subset for quick check)
const MVP_SERVICES = [
  { name: 'gateway', url: 'http://localhost:3000/health' },
  { name: 'auth', url: 'http://localhost:3001/health' },
  { name: 'orchestrator', url: 'http://localhost:3002/health' },
  { name: 'eventbus', url: 'http://localhost:3003/health' },
  { name: 'billing', url: 'http://localhost:3006/health' },
];

const TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkHealth(service) {
  return new Promise((resolve) => {
    const client = service.url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      resolve({ service: service.name, status: 'timeout', statusCode: 0 });
    }, TIMEOUT_MS);

    const req = client.get(service.url, (res) => {
      clearTimeout(timeout);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            service: service.name,
            status: res.statusCode === 200 ? 'healthy' : 'unhealthy',
            statusCode: res.statusCode,
            response: json,
          });
        } catch {
          resolve({
            service: service.name,
            status: res.statusCode === 200 ? 'healthy' : 'unhealthy',
            statusCode: res.statusCode,
          });
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        service: service.name,
        status: 'error',
        statusCode: 0,
        error: err.message,
      });
    });
  });
}

async function checkHealthWithRetry(service, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await checkHealth(service);
    if (result.status === 'healthy') {
      return result;
    }
    if (attempt < retries) {
      console.log(`  ⏳ ${service.name}: retrying (${attempt}/${retries})...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  return await checkHealth(service);
}

async function runSmokeTest(mvpOnly = false) {
  const services = mvpOnly ? MVP_SERVICES : SERVICES;
  console.log(`\n🔍 Nova Smoke Test - Checking ${services.length} services...\n`);
  
  const results = [];
  let passed = 0;
  let failed = 0;

  for (const service of services) {
    const result = await checkHealthWithRetry(service);
    results.push(result);
    
    if (result.status === 'healthy') {
      console.log(`  ✅ ${service.name}: healthy`);
      passed++;
    } else {
      console.log(`  ❌ ${service.name}: ${result.status} (${result.error || 'status ' + result.statusCode})`);
      failed++;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('❌ SMOKE TEST FAILED\n');
    console.log('Failed services:');
    results
      .filter(r => r.status !== 'healthy')
      .forEach(r => console.log(`  - ${r.service}: ${r.error || 'unhealthy'}`));
    console.log('\nTroubleshooting:');
    console.log('  1. Check if containers are running: docker compose ps');
    console.log('  2. Check container logs: docker compose logs <service>');
    console.log('  3. Ensure DB migrations ran: npm run db:migrate');
    process.exit(1);
  }

  console.log('✅ SMOKE TEST PASSED\n');
  return results;
}

// Parse args
const args = process.argv.slice(2);
const mvpOnly = args.includes('--mvp') || args.includes('-m');
const waitForServices = args.includes('--wait') || args.includes('-w');

async function main() {
  if (waitForServices) {
    console.log('⏳ Waiting for services to start (30s)...');
    await sleep(30000);
  }
  
  await runSmokeTest(mvpOnly);
}

main().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
