#!/usr/bin/env node
/**
 * Web route smoke check (Rollout Slice 1A)
 * - Starts @nova/web (next start -p 4000)
 * - Verifies key routes do not 404
 * - Verifies /settings/billing redirects to /dashboard/settings
 * - Shuts the server down
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_BASE_URL = process.env.WEB_URL || 'http://localhost:4000';

// Next dev will compile pages on-demand; first-request compiles can easily exceed 5s.
const TIMEOUT_MS = 30000;
const STARTUP_TIMEOUT_MS = 60000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpRequest(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, timeout: TIMEOUT_MS }, (res) => {
      // Consume response to avoid hanging sockets
      res.resume();
      resolve({
        status: res.statusCode || 0,
        location: typeof res.headers.location === 'string' ? res.headers.location : null,
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    req.end();
  });
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await httpRequest(baseUrl, 'GET');
      if (res.status > 0) return;
    } catch {
      // ignore until deadline
    }
    await sleep(500);
  }
  throw new Error(`Web server did not become ready within ${STARTUP_TIMEOUT_MS}ms at ${baseUrl}`);
}

function normalizeLocation(location) {
  if (!location) return null;
  try {
    // If location is absolute, return pathname
    const u = new URL(location);
    return u.pathname;
  } catch {
    // If location is relative, strip any query/hash
    return location.split('?')[0].split('#')[0];
  }
}

async function killProcessTree(proc) {
  if (!proc || typeof proc.pid !== 'number') return;

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('close', resolve);
      killer.on('error', resolve);
    });
    return;
  }

  try {
    proc.kill('SIGTERM');
  } catch {
    // ignore
  }
}

async function main() {
  const baseUrl = DEFAULT_BASE_URL.replace(/\/$/, '');

  const webDir = path.join(process.cwd(), 'apps', 'web');

  let port = '4000';
  try {
    const u = new URL(baseUrl);
    port = u.port || port;
  } catch {
    // ignore
  }

  const nextCli = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  console.log(
    `[smoke-web-routes] Starting Next.js dev server via ${nextCli} (cwd=${webDir}, port=${port})...`
  );

  // NOTE: We intentionally use `next dev` here. This repo uses output: 'standalone' which makes `next start`
  // incompatible, and the standalone runtime is sensitive to node_modules layout.
  const server = spawn('node', [nextCli, 'dev', '-p', port], {
    cwd: webDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let shuttingDown = false;
  let serverExited = false;
  server.on('exit', (code) => {
    serverExited = true;
    if (!shuttingDown && code !== 0) {
      console.error(`[smoke-web-routes] Web server exited early with code ${code}`);
    }
  });

  // Only print server output if it exits early (keep noise down).
  let stdoutBuf = '';
  let stderrBuf = '';
  server.stdout.on('data', (d) => { stdoutBuf += d.toString(); });
  server.stderr.on('data', (d) => { stderrBuf += d.toString(); });

  try {
    await waitForServer(baseUrl);

    const ok200 = (r) => r.status >= 200 && r.status < 400;

    const checks = [
      { path: '/privacy', ok: ok200 },
      { path: '/terms', ok: ok200 },
      { path: '/dashboard/settings', ok: ok200 },
      { path: '/billing/success', ok: ok200 },
      { path: '/billing/cancel', ok: ok200 },
      {
        path: '/settings/billing',
        ok: (r) => {
          const loc = normalizeLocation(r.location);
          return (r.status === 301 || r.status === 302 || r.status === 307 || r.status === 308) && loc === '/dashboard/settings';
        },
      },

      // Slice 1B smoke: ensure key dashboards compile and do not 404
      { path: '/dashboard/screener', ok: ok200 },
      { path: '/dashboard/trading', ok: ok200 },
      { path: '/dashboard/nexus', ok: ok200 },
      { path: '/dashboard/backtest', ok: ok200 },
      { path: '/dashboard/simulator', ok: ok200 },
      { path: '/dashboard/marketplace', ok: ok200 },
      { path: '/dashboard/social', ok: ok200 },
      { path: '/dashboard/social-hub', ok: ok200 },
      { path: '/dashboard/analytics', ok: ok200 },
      { path: '/dashboard/journal', ok: ok200 },
    ];

    console.log(`[smoke-web-routes] Checking routes against ${baseUrl}...`);

    let failed = 0;
    for (const c of checks) {
      const url = `${baseUrl}${c.path}`;
      let res;
      try {
        res = await httpRequest(url, 'GET');
      } catch (err) {
        failed++;
        console.log(`  ✗ ${c.path} -> error (${err.message})`);
        continue;
      }

      const extra = res.location ? ` location=${res.location}` : '';
      if (c.ok(res)) {
        console.log(`  ✓ ${c.path} -> ${res.status}${extra}`);
      } else {
        failed++;
        console.log(`  ✗ ${c.path} -> ${res.status}${extra}`);
      }
    }

    if (failed > 0) {
      throw new Error(`${failed} route check(s) failed`);
    }

    console.log('[smoke-web-routes] PASS');
  } catch (err) {
    // If server exited early or something went wrong, dump output for debugging.
    if (serverExited || (stdoutBuf || stderrBuf)) {
      const out = stdoutBuf.trim();
      const eout = stderrBuf.trim();
      if (out) console.error(`\n[web stdout]\n${out}`);
      if (eout) console.error(`\n[web stderr]\n${eout}`);
    }
    console.error(`[smoke-web-routes] FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    shuttingDown = true;
    await killProcessTree(server);
  }
}

main().catch((err) => {
  console.error('[smoke-web-routes] Unhandled error:', err);
  process.exit(1);
});
