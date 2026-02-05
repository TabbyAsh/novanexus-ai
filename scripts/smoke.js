#!/usr/bin/env node
/**
 * Nova Smoke Tests
 * Verifies core endpoints are responding
 */
const http = require('http');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const WEB_URL = process.env.WEB_URL || 'http://localhost:8080';
const TIMEOUT = 5000;

const tests = [
  { name: 'Gateway /health', url: `${GATEWAY_URL}/health` },
  { name: 'Web UI responds', url: WEB_URL },
];

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: TIMEOUT }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function runTests() {
  console.log('=== Nova Smoke Tests ===\n');
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const res = await httpGet(test.url);
      if (res.status >= 200 && res.status < 400) {
        console.log(`✓ ${test.name} (${res.status})`);
        passed++;
      } else {
        console.error(`✗ ${test.name} (${res.status})`);
        failed++;
      }
    } catch (err) {
      console.error(`✗ ${test.name} (${err.message})`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\n❌ Smoke tests failed');
    process.exit(1);
  }
  console.log('\n✓ Smoke tests passed');
}

// Wait a bit for services to be ready, then run
const delay = parseInt(process.env.SMOKE_DELAY || '3000', 10);
console.log(`Waiting ${delay}ms for services...\n`);
setTimeout(runTests, delay);
