#!/usr/bin/env node
/**
 * Nova MVP Launcher
 * One-command boot: preflight → infra → migrate → services → smoke
 */
const { execSync, spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE_FILE = path.join(ROOT, 'docker-compose.mvp.yml');

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

async function waitForHealth(url, name, maxAttempts = 30) {
  const http = require('http');
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      console.log(`  ✓ ${name} healthy`);
      return true;
    } catch {
      if (i === maxAttempts) {
        console.error(`  ✗ ${name} not healthy after ${maxAttempts} attempts`);
        return false;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     NOVA ENTERPRISES MVP LAUNCHER    ║');
  console.log('╚══════════════════════════════════════╝');

  // Step 1: Preflight
  console.log('\n[1/4] Running preflight checks...');
  if (!run(`node ${path.join(__dirname, 'preflight.js')}`)) {
    console.error('\n✗ Preflight failed. Fix issues before continuing.');
    process.exit(1);
  }

  // Step 2: Start services
  console.log('\n[2/4] Starting services...');
  if (!run(`docker-compose -f "${COMPOSE_FILE}" up -d --build`)) {
    console.error('\n✗ Failed to start services.');
    process.exit(1);
  }

  // Step 3: Wait for health
  console.log('\n[3/4] Waiting for services to be healthy...');
  const services = [
    { name: 'Gateway', url: 'http://localhost:3000/health' },
    { name: 'Auth', url: 'http://localhost:3001/health' },
    { name: 'Orchestrator', url: 'http://localhost:3002/health' },
    { name: 'EventBus', url: 'http://localhost:3003/health' },
  ];

  let allHealthy = true;
  for (const svc of services) {
    const healthy = await waitForHealth(svc.url, svc.name);
    if (!healthy) allHealthy = false;
  }

  if (!allHealthy) {
    console.error('\n✗ Some services failed health checks. Check logs with: npm run nova:mvp:logs');
    process.exit(1);
  }

  // Step 4: Smoke tests
  console.log('\n[4/4] Running smoke tests...');
  if (!run(`node ${path.join(__dirname, 'smoke.js')}`)) {
    console.error('\n✗ Smoke tests failed.');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║         ✓ NOVA MVP READY             ║');
  console.log('╠══════════════════════════════════════╣');
  console.log('║  Gateway:      http://localhost:3000 ║');
  console.log('║  Web UI:       http://localhost:8080 ║');
  console.log('║                                      ║');
  console.log('║  Logs: npm run nova:mvp:logs         ║');
  console.log('║  Stop: npm run nova:mvp:down         ║');
  console.log('╚══════════════════════════════════════╝');
}

main().catch(err => {
  console.error('Launcher error:', err);
  process.exit(1);
});
