#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { getStackConfig } = require('./stack-config');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.dev');

function loadEnvFile(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    env[key] = value;
    if (!process.env[key]) process.env[key] = value;
  }
  return env;
}

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

async function verifyInternal(env) {
  const token = env.INTERNAL_VERIFY_TOKEN || '';
  const symbol = env.INTERNAL_VERIFY_SYMBOL || 'SPY';
  const days = env.INTERNAL_VERIFY_DAYS || '10';
  const { services } = getStackConfig();
  const baseUrl = services.novaHub?.baseUrl || 'http://localhost:3030';
  const url = `${baseUrl}/internal/verify?symbol=${encodeURIComponent(symbol)}&days=${encodeURIComponent(days)}`;
  const headers = token ? { 'x-internal-verify-token': token } : {};

  console.log(`Internal verify URL: ${url}`);
  const res = await fetch(url, { headers });
  const payload = await res.json().catch(() => null);

  if (!res.ok || !payload?.data?.status) {
    throw new Error(payload?.error?.message || `Internal verify failed (HTTP ${res.status})`);
  }

  if (payload.data.status !== 'PASS') {
    const summary = Array.isArray(payload.data.checks)
      ? payload.data.checks.map((c) => `${c.name}:${c.status}`).join(', ')
      : 'checks unavailable';
    throw new Error(`Internal verify reported ${payload.data.status} (${summary})`);
  }

  console.log('✓ Internal verification passed');
}

async function main() {
  console.log('=== Nova Verify ===');
  run(`node ${path.join(__dirname, 'bootstrap-env.js')}`);
  const env = loadEnvFile(ENV_FILE);

  try {
    const timeout = env.STACK_READY_TIMEOUT_MS || '180000';
    const profile = (env.STACK_PROFILE || '').toLowerCase() === 'core' || env.NO_DOCKER === 'true' ? 'core' : 'mvp';
    const readyFlag = profile === 'core' ? '--core' : '--mvp';
    run(`node ${path.join(__dirname, 'stack-ready.js')} ${readyFlag} --timeout ${timeout}`);
    run(`node ${path.join(__dirname, 'smoke-test.js')} ${readyFlag}`);
    run(`node ${path.join(__dirname, 'smoke.js')}`);
    console.log('✓ Health checks passed');
  } catch (error) {
    console.error('\nFAIL: Health checks failed.');
    process.exit(1);
  }

  try {
    await verifyInternal(env);
  } catch (error) {
    console.error(`\nFAIL: ${(error && error.message) || 'Internal verify failed.'}`);
    process.exit(1);
  }

  console.log('\nPASS: Verification complete.');
}

main().catch((error) => {
  console.error(`\nFAIL: ${(error && error.message) || 'Verification failed.'}`);
  process.exit(1);
});
