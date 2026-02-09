#!/usr/bin/env node
/**
 * Production Startup Entrypoint
 * 1. Validates environment variables (fail fast)
 * 2. Runs database migrations (idempotent)
 * 3. Starts all services concurrently
 */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

// Service definitions with their dist paths and internal ports
const SERVICES = [
  { name: 'gateway', port: 3000, dist: 'services/gateway/dist/index.js', expose: true },
  { name: 'auth', port: 3001, dist: 'services/auth/dist/index.js' },
  { name: 'orchestrator', port: 3002, dist: 'services/orchestrator/dist/index.js' },
  { name: 'eventbus', port: 3003, dist: 'services/eventbus/dist/index.js' },
  { name: 'billing', port: 3006, dist: 'services/billing/dist/index.js' },
  { name: 'tradebot', port: 3010, dist: 'services/tradebot/dist/index.js' },
  { name: 'marketdata', port: 3020, dist: 'services/marketdata/dist/index.js' },
  { name: 'novaHub', port: 3030, dist: 'services/nova-hub/dist/index.js' },
];

async function validateEnv() {
  console.log('=== Validating Environment ===');
  const { validateEnv: validate } = require('./validate-env');
  return validate({ exitOnError: true });
}

async function runMigrations() {
  console.log('\n=== Running Migrations ===');
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [path.join(__dirname, 'run-migrations.js')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Migrations failed with code ${code}`));
    });
    proc.on('error', reject);
  });
}

function startService(service) {
  const distPath = path.join(ROOT, service.dist);
  
  // Set service-specific port
  const env = {
    ...process.env,
    PORT: service.expose ? PORT : service.port,
    NODE_ENV: 'production',
    // Internal service URLs (localhost in same container)
    AUTH_SERVICE_URL: 'http://localhost:3001',
    ORCHESTRATOR_URL: 'http://localhost:3002',
    EVENTBUS_URL: 'http://localhost:3003',
    BILLING_URL: 'http://localhost:3006',
    TRADEBOT_URL: 'http://localhost:3010',
    MARKETDATA_URL: 'http://localhost:3020',
    NOVA_HUB_URL: 'http://localhost:3030',
  };

  console.log(`Starting ${service.name} on port ${service.expose ? PORT : service.port}`);
  
  const proc = spawn('node', [distPath], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  proc.stdout.on('data', (data) => {
    process.stdout.write(`[${service.name}] ${data}`);
  });

  proc.stderr.on('data', (data) => {
    process.stderr.write(`[${service.name}] ${data}`);
  });

  proc.on('error', (err) => {
    console.error(`[${service.name}] Error: ${err.message}`);
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error(`[${service.name}] Exited with code ${code}`);
    }
  });

  return proc;
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   NOVA ENTERPRISES PRODUCTION START  ║');
  console.log('╚══════════════════════════════════════╝\n');

  try {
    // Step 1: Validate environment
    await validateEnv();

    // Step 2: Run migrations
    await runMigrations();

    // Step 3: Start all services
    console.log('\n=== Starting Services ===');
    const processes = SERVICES.map(startService);

    // Handle shutdown gracefully
    const shutdown = () => {
      console.log('\nShutting down services...');
      processes.forEach(p => p.kill('SIGTERM'));
      setTimeout(() => process.exit(0), 5000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Keep process alive
    console.log(`\n✓ All services started. Gateway exposed on port ${PORT}`);
    
  } catch (error) {
    console.error(`\n❌ Startup failed: ${error.message}`);
    process.exit(1);
  }
}

main();
