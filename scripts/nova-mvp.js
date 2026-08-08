#!/usr/bin/env node
/**
 * Nova MVP Launcher
 * One-command boot: preflight → infra → migrate → services → smoke
 */
const { execSync, spawn } = require('child_process');
const path = require('path');
const { getStackConfig } = require('./stack-config');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE_FILE = path.join(ROOT, 'docker-compose.mvp.yml');
const ENV_FILE = path.join(ROOT, '.env.dev');

function loadEnvFile(envPath) {
  const fs = require('fs');
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

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  try {
    execSync(cmd, { 
      cwd: ROOT, 
      stdio: 'inherit',
      ...opts 
    });
    return true;
  } catch (e) {
    return false;
  }
}

function wait(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function setEnvFileValues(envPath, values) {
  const fs = require('fs');
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  const indexMap = new Map();
  lines.forEach((line, idx) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) indexMap.set(match[1], idx);
  });

  for (const [key, value] of Object.entries(values)) {
    const entry = `${key}=${value}`;
    if (indexMap.has(key)) {
      lines[indexMap.get(key)] = entry;
    } else {
      lines.push(entry);
    }
  }

  const output = lines.filter((line, idx) => idx === 0 || line !== '').join('\n').trim();
  fs.writeFileSync(envPath, output + '\n');
}

function checkDockerEngine() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    console.error('\n✗ Docker Engine not reachable.');
    console.error('Start Docker Desktop and wait until Engine is running.');
    return false;
  }
}

function startNoDockerServices() {
  console.log('\n[3/5] Starting services (no-docker mode)...');
  const filters = [
    '--filter=@nova/gateway-service',
    '--filter=@nova/nova-hub',
    '--filter=@nova/tradebot',
    '--filter=@nova/web',
  ];
  const child = spawn('npm', ['run', 'dev', '--', ...filters], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env },
  });
  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
  return child;
}


async function main() {
  const args = process.argv.slice(2);
  const noDocker = args.includes('--no-docker') || args.includes('--nodocker');
  console.log('╔══════════════════════════════════════╗');
  console.log('║     NOVA ENTERPRISES MVP LAUNCHER    ║');
  console.log('╚══════════════════════════════════════╝');

  // Step 1: Preflight
  console.log('\n[1/5] Running preflight checks...');
  if (!run(`node ${path.join(__dirname, 'preflight.js')}`)) {
    console.error('\n✗ Preflight failed. Fix issues before continuing.');
    process.exit(1);
  }

  // Step 2: Environment bootstrap
  console.log('\n[2/5] Bootstrapping local environment...');
  if (!run(`node ${path.join(__dirname, 'bootstrap-env.js')}`)) {
    console.error('\n✗ Environment bootstrap failed.');
    process.exit(1);
  }
  loadEnvFile(ENV_FILE);
  if (noDocker) {
    setEnvFileValues(ENV_FILE, {
      STACK_PROFILE: 'core',
      NO_DOCKER: 'true',
      WEB_PORT: '4000',
      WEB_URL: 'http://localhost:4000',
    });
    process.env.STACK_PROFILE = 'core';
    process.env.NO_DOCKER = 'true';
    process.env.WEB_PORT = '4000';
    process.env.WEB_URL = 'http://localhost:4000';
    process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    startNoDockerServices();
  } else {
    setEnvFileValues(ENV_FILE, {
      STACK_PROFILE: 'mvp',
      NO_DOCKER: 'false',
      WEB_PORT: '8080',
    });
    process.env.STACK_PROFILE = 'mvp';
    process.env.NO_DOCKER = 'false';

    if (!checkDockerEngine()) {
      process.exit(1);
    }

    // Step 3: Start services
    console.log('\n[3/5] Starting services...');
    const composeBase = `docker-compose --env-file \"${ENV_FILE}\" -f \"${COMPOSE_FILE}\"`;
    let servicesStarted = run(`${composeBase} up -d --build`);
    for (let attempt = 1; !servicesStarted && attempt <= 3; attempt += 1) {
      console.log(`\nService health gates were slow; retrying without rebuilding images (${attempt}/3)...`);
      wait(15_000);
      servicesStarted = run(`${composeBase} up -d --no-build`);
    }
    if (!servicesStarted) {
      console.error('\n✗ Failed to start services.');
      process.exit(1);
    }
  }

  // Step 4: Run migrations
  console.log('\n[4/5] Running migrations...');
  if (!run(`node ${path.join(__dirname, 'run-migrations.js')}`)) {
    console.error('\n✗ Migrations failed.');
    process.exit(1);
  }

  // Step 5: Wait for health
  console.log('\n[5/5] Waiting for services to be healthy...');
  const timeout = process.env.STACK_READY_TIMEOUT_MS || '180000';
  const readyFlag = process.env.STACK_PROFILE === 'core' ? '--core' : '--mvp';
  if (!run(`node ${path.join(__dirname, 'stack-ready.js')} ${readyFlag} --timeout ${timeout}`)) {
    console.error('\n✗ Some services failed health checks. Check logs with: npm run nova:mvp:logs');
    process.exit(1);
  }

  // Smoke tests
  console.log('\nRunning smoke tests...');
  const smokeFlag = process.env.STACK_PROFILE === 'core' ? '--core' : '--mvp';
  if (!run(`node ${path.join(__dirname, 'smoke-test.js')} ${smokeFlag}`)) {
    console.error('\n✗ Smoke tests failed.');
    process.exit(1);
  }
  if (!run(`node ${path.join(__dirname, 'smoke.js')}`)) {
    console.error('\n✗ Web smoke tests failed.');
    process.exit(1);
  }

  const { services } = getStackConfig({ includeWeb: true });
  const gatewayUrl = services.gateway?.baseUrl || 'http://localhost:3000';
  const webUrl = services.web?.baseUrl || 'http://localhost:8080';
  const formatUrl = (value, width = 24) => {
    if (value.length > width) return `${value.slice(0, width - 1)}…`;
    return value.padEnd(width);
  };

  console.log('\\n╔══════════════════════════════════════╗');
  console.log('║         ✓ NOVA MVP READY             ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Gateway:      ${formatUrl(gatewayUrl)}║`);
  console.log(`║  Web UI:       ${formatUrl(webUrl)}║`);
  console.log('║                                      ║');
  console.log('║  Logs: npm run nova:mvp:logs         ║');
  console.log('║  Stop: npm run nova:mvp:down         ║');
  console.log('╚══════════════════════════════════════╝');
}

main().catch(err => {
  console.error('Launcher error:', err);
  process.exit(1);
});
