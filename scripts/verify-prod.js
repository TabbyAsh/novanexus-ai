#!/usr/bin/env node
/**
 * Production Verification Script
 * Runs production-safe smoke tests against deployed URLs.
 * 
 * Usage:
 *   npm run verify:prod
 *   npm run verify:prod -- --url https://api.novanexus-ai.com
 *   PROD_API_URL=https://api.example.com npm run verify:prod
 */
const https = require('https');
const http = require('http');

// Configuration
const API_URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1]
  || process.env.PROD_API_URL
  || 'https://abackend-production.up.railway.app';

const WEB_URL = process.env.PROD_WEB_URL || 'https://novanexus-ai.com';
const TIMEOUT = 15000;

// Test definitions
const TESTS = [
  {
    name: 'Gateway Health',
    url: `${API_URL}/health`,
    method: 'GET',
    expect: { status: 200 },
  },
  {
    name: 'Web UI Reachable',
    url: WEB_URL,
    method: 'GET',
    expect: { status: [200, 301, 302, 307, 308, 404] }, // 404 ok if frontend not deployed
    optional: true, // Frontend deployment is separate from backend
  },
  {
    name: 'Auth Endpoint (Validation)',
    url: `${API_URL}/v1/auth/login`,
    method: 'POST',
    body: JSON.stringify({ email: 'test@invalid', password: 'x' }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [400, 401] }, // Bad request or unauthorized, NOT 500/502
  },
  {
    name: 'Billing Pricing (Public)',
    url: `${API_URL}/v1/billing/pricing`,
    method: 'GET',
    expect: { status: 200, json: true },
  },
  {
    name: 'Market Data Endpoint',
    url: `${API_URL}/v1/market/quote?symbol=SPY`,
    method: 'GET',
    expect: { status: [200, 401, 403] }, // 200 if public, 401/403 if gated
  },
  {
    name: 'Nova Hub Scanner',
    url: `${API_URL}/v1/trade/scan`,
    method: 'POST',
    body: JSON.stringify({ symbols: ['SPY'] }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [200, 401, 403] }, // 200 if demo allowed, 401/403 if gated
  },
  // Phase 5.3: Simulator checks
  {
    name: 'Simulator Health',
    url: `${API_URL}/v1/sim/health`,
    method: 'GET',
    expect: { status: 200, json: true },
  },
  // Phase 5.3: Marketplace/Appraisal checks
  {
    name: 'Marketplace Health',
    url: `${API_URL}/v1/marketplace/health`,
    method: 'GET',
    expect: { status: 200, json: true },
  },
  {
    name: 'Marketplace Appraisal',
    url: `${API_URL}/v1/marketplace/appraise`,
    method: 'POST',
    body: JSON.stringify({ query: 'iPhone 15 Pro' }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: 200, json: true },
  },
  // Progressive Broker: Server-managed Alpaca checks
  {
    name: 'Alpaca Status (Server-Managed)',
    url: `${API_URL}/v1/alpaca/status`,
    method: 'GET',
    expect: { status: [200, 401] }, // 200 with mode, 401 if auth required
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      try {
        const data = JSON.parse(res.body);
        if (!data.success) return { ok: false, error: 'Response not successful' };
        const mode = data.data?.mode;
        if (!mode) return { ok: false, error: 'No mode in response' };
        if (mode === 'server') return { ok: true, note: 'Server-managed mode active' };
        if (mode === 'user') return { ok: true, note: 'User mode (user has connection)' };
        if (mode === 'none') return { ok: true, note: 'No broker configured (env vars missing)' };
        return { ok: false, error: `Unknown mode: ${mode}` };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  {
    name: 'Alpaca Account (Server-Managed)',
    url: `${API_URL}/v1/alpaca/account`,
    method: 'GET',
    expect: { status: [200, 400, 401] }, // 200 if configured, 400 if not, 401 if auth
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 400) {
        try {
          const data = JSON.parse(res.body);
          if (data.error?.code === 'ALPACA_NOT_CONFIGURED') {
            return { ok: true, note: 'Server-managed not configured (env vars missing)' };
          }
        } catch {}
        return { ok: true, note: 'Broker not available' };
      }
      try {
        const data = JSON.parse(res.body);
        if (data.success && data.data?.account) {
          const mode = data.data.mode;
          return { ok: true, note: `Account loaded (mode: ${mode || 'unknown'})` };
        }
        return { ok: false, error: 'No account data' };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  {
    name: 'Alpaca History (Server-Managed)',
    url: `${API_URL}/v1/alpaca/history?timeframe=1D`,
    method: 'GET',
    expect: { status: [200, 400, 401, 503] }, // 200 if working, 400/503 if issues, 401 if auth
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 400 || res.status === 503) {
        return { ok: true, note: 'History not available (broker issue or not configured)' };
      }
      try {
        const data = JSON.parse(res.body);
        if (data.success && Array.isArray(data.data?.history)) {
          const count = data.data.history.length;
          const mode = data.data.mode;
          return { ok: true, note: `${count} history points (mode: ${mode || 'unknown'})` };
        }
        return { ok: false, error: 'No history data' };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
];

// HTTP request helper
function request(options) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const client = url.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: TIMEOUT,
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Run a single test
async function runTest(test) {
  const startTime = Date.now();
  try {
    const res = await request({
      url: test.url,
      method: test.method,
      headers: test.headers,
      body: test.body,
    });

    const duration = Date.now() - startTime;
    const expectedStatus = Array.isArray(test.expect.status)
      ? test.expect.status
      : [test.expect.status];

    // Check status
    if (!expectedStatus.includes(res.status)) {
      return {
        name: test.name,
        passed: false,
        duration,
        error: `Expected status ${expectedStatus.join('|')}, got ${res.status}`,
        optional: test.optional,
      };
    }

    // Check if JSON expected
    if (test.expect.json) {
      try {
        JSON.parse(res.body);
      } catch {
        return {
          name: test.name,
          passed: false,
          duration,
          error: 'Expected valid JSON response',
        };
      }
    }

    // Run custom check if present
    if (test.customCheck) {
      const checkResult = test.customCheck(res);
      return {
        name: test.name,
        passed: checkResult.ok,
        duration,
        status: res.status,
        note: checkResult.note,
        error: checkResult.error,
      };
    }

    return {
      name: test.name,
      passed: true,
      duration,
      status: res.status,
    };
  } catch (error) {
    return {
      name: test.name,
      passed: false,
      duration: Date.now() - startTime,
      error: error.message,
    };
  }
}

// Main execution
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   NOVA PRODUCTION VERIFICATION       ║');
  console.log('╚══════════════════════════════════════╝\n');

  console.log(`API URL: ${API_URL}`);
  console.log(`Web URL: ${WEB_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  console.log('Running tests...\n');

  const results = [];
  for (const test of TESTS) {
    const result = await runTest(test);
    results.push(result);

    const icon = result.passed ? '✅' : '❌';
    const statusText = result.passed 
      ? `(${result.status})${result.note ? ` - ${result.note}` : ''}`
      : `- ${result.error}`;
    const time = `${result.duration}ms`;
    console.log(`  ${icon} ${result.name} ${statusText} [${time}]`);
  }

  console.log('\n──────────────────────────────────────────────────\n');

  const passed = results.filter(r => r.passed).length;
  const requiredFailed = results.filter(r => !r.passed && !r.optional).length;
  const optionalFailed = results.filter(r => !r.passed && r.optional).length;

  const summary = `${passed} passed, ${requiredFailed} failed${optionalFailed ? `, ${optionalFailed} optional skipped` : ''}`;
  console.log(`📊 Results: ${summary}\n`);

  if (requiredFailed > 0) {
    console.log('❌ PRODUCTION VERIFICATION FAILED\n');
    console.log('Failed tests:');
    results.filter(r => !r.passed && !r.optional).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    if (optionalFailed > 0) {
      console.log('\nOptional tests skipped:');
      results.filter(r => !r.passed && r.optional).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }
    console.log('\nTroubleshooting:');
    console.log('  1. Check service logs in Railway dashboard');
    console.log('  2. Verify DATABASE_URL and REDIS_URL are set');
    console.log('  3. Ensure health check is passing');
    process.exit(1);
  }

  console.log('✅ PRODUCTION VERIFICATION PASSED\n');

  // Output summary for documentation
  console.log('=== Summary for docs/verification/ ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`API: ${API_URL}`);
  console.log(`Web: ${WEB_URL}`);
  console.log(`Tests: ${passed}/${TESTS.length} passed`);
  results.forEach(r => {
    console.log(`  - ${r.name}: ${r.passed ? 'PASS' : 'FAIL'} (${r.duration}ms)`);
  });
}

main().catch(err => {
  console.error(`\n❌ Verification error: ${err.message}`);
  process.exit(1);
});
