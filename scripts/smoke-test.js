#!/usr/bin/env node
/**
 * Nova Enterprises - Smoke Test Script
 * Checks health endpoints for all services
 */

const http = require('http');
const https = require('https');
const { loadEnvFile, getServiceList } = require('./stack-config');

loadEnvFile();

const SERVICES = getServiceList({ mvpOnly: false });
const MVP_SERVICES = getServiceList({ mvpOnly: true });
const CORE_SERVICES = getServiceList({ profile: 'core', includeWeb: true });

const TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function summarizeCause(result) {
  if (result.status === 'healthy') return '';
  if (result.errorCode === 'ENOTFOUND') return 'DNS/host not resolved (wrong base URL or host)';
  if (result.errorCode === 'ECONNREFUSED') return 'Connection refused (service not started or port not published)';
  if (result.errorCode === 'EHOSTUNREACH' || result.errorCode === 'ENETUNREACH') {
    return 'Network unreachable (host/docker mismatch)';
  }
  if (result.errorCode === 'ETIMEDOUT' || result.status === 'timeout') return 'Timed out (service not ready yet)';
  if (result.statusCode === 404) return 'Health endpoint not found';
  if (result.statusCode === 503) return 'Service unhealthy or still starting';
  if (result.statusCode >= 500) return 'Service error (5xx)';
  return 'Unknown';
}

async function checkHealth(service) {
  return new Promise((resolve) => {
    const client = service.healthUrl.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      resolve({ service: service.name, status: 'timeout', statusCode: 0, url: service.healthUrl, errorCode: 'ETIMEDOUT' });
    }, TIMEOUT_MS);

    const req = client.get(service.healthUrl, (res) => {
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
            url: service.healthUrl,
          });
        } catch {
          resolve({
            service: service.name,
            status: res.statusCode === 200 ? 'healthy' : 'unhealthy',
            statusCode: res.statusCode,
            url: service.healthUrl,
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
        errorCode: err.code,
        url: service.healthUrl,
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

async function runSmokeTest(mvpOnly = false, coreOnly = false) {
  const services = coreOnly ? CORE_SERVICES : (mvpOnly ? MVP_SERVICES : SERVICES);
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
      const detail = result.error || result.errorCode || (result.statusCode ? `status ${result.statusCode}` : result.status);
      const cause = summarizeCause(result);
      console.log(`  ❌ ${service.name}: ${detail} (${result.url})${cause ? ` — ${cause}` : ''}`);
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
      .forEach(r => {
        const detail = r.error || r.errorCode || (r.statusCode ? `status ${r.statusCode}` : r.status);
        const cause = summarizeCause(r);
        console.log(`  - ${r.service}: ${detail} (${r.url})${cause ? ` — ${cause}` : ''}`);
      });
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
const coreOnly = args.includes('--core');
const waitForServices = args.includes('--wait') || args.includes('-w');

async function main() {
  if (waitForServices) {
    console.log('⏳ Waiting for services to start (30s)...');
    await sleep(30000);
  }

  await runSmokeTest(mvpOnly, coreOnly);
}

main().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
