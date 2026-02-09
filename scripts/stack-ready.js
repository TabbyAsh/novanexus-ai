#!/usr/bin/env node
const http = require('http');
const https = require('https');
const net = require('net');
const { loadEnvFile, getServiceList, getInfraTargets } = require('./stack-config');

function parseArg(name, fallback) {
  const args = process.argv.slice(2);
  const key = `--${name}`;
  const index = args.indexOf(key);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const withEquals = args.find((arg) => arg.startsWith(`${key}=`));
  if (withEquals) return withEquals.split('=').slice(1).join('=');
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function checkHttp(target, timeoutMs) {
  return new Promise((resolve) => {
    const client = target.healthUrl.startsWith('https') ? https : http;
    const start = Date.now();
    const timeout = setTimeout(() => {
      resolve({
        name: target.name,
        type: 'http',
        url: target.healthUrl,
        status: 'timeout',
        statusCode: 0,
        latencyMs: Date.now() - start,
      });
    }, timeoutMs);

    const req = client.get(target.healthUrl, (res) => {
      clearTimeout(timeout);
      res.resume();
      resolve({
        name: target.name,
        type: 'http',
        url: target.healthUrl,
        status: res.statusCode === 200 ? 'healthy' : 'unhealthy',
        statusCode: res.statusCode,
        latencyMs: Date.now() - start,
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        name: target.name,
        type: 'http',
        url: target.healthUrl,
        status: 'error',
        statusCode: 0,
        latencyMs: Date.now() - start,
        error: err.message,
        errorCode: err.code,
      });
    });
  });
}

async function checkTcp(target, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.connect({ host: target.host, port: target.port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({
        name: target.name,
        type: 'tcp',
        host: target.host,
        port: target.port,
        status: 'timeout',
        latencyMs: Date.now() - start,
      });
    }, timeoutMs);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve({
        name: target.name,
        type: 'tcp',
        host: target.host,
        port: target.port,
        status: 'healthy',
        latencyMs: Date.now() - start,
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        name: target.name,
        type: 'tcp',
        host: target.host,
        port: target.port,
        status: 'error',
        latencyMs: Date.now() - start,
        error: err.message,
        errorCode: err.code,
      });
    });
  });
}

function formatTarget(result) {
  if (result.type === 'http') return result.url;
  return `${result.host}:${result.port}`;
}

async function checkTargets(targets, timeoutMs) {
  const checks = targets.map((target) => {
    if (target.type === 'tcp') return checkTcp(target, timeoutMs);
    return checkHttp(target, timeoutMs);
  });
  return Promise.all(checks);
}

async function waitForStack() {
  loadEnvFile();
  const timeoutMs = parseInt(parseArg('timeout', process.env.STACK_READY_TIMEOUT_MS || '180000'), 10);
  const intervalMs = parseInt(parseArg('interval', '3000'), 10);
  const profile = hasFlag('core')
    ? 'core'
    : hasFlag('mvp')
      ? 'mvp'
      : parseArg('profile', process.env.STACK_PROFILE || '') || undefined;
  const mvpOnly = profile ? profile === 'mvp' : hasFlag('mvp');
  const includeInfra = !hasFlag('no-infra');

  const includeWeb = profile === 'core';
  const targets = [
    ...getServiceList({ mvpOnly, profile, includeWeb }),
    ...(includeInfra ? getInfraTargets() : []),
  ];

  if (!targets.length) {
    console.error('No targets configured for readiness checks.');
    process.exit(1);
  }

  const start = Date.now();
  let attempt = 1;
  console.log(`⏳ Waiting for stack readiness (${targets.length} targets, timeout ${(timeoutMs / 1000).toFixed(0)}s)...`);

  while (true) {
    const results = await checkTargets(targets, Math.min(5000, intervalMs));
    const pending = results.filter((r) => r.status !== 'healthy');
    if (pending.length === 0) {
      console.log('✅ Stack ready');
      return;
    }

    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      console.error(`\n❌ Stack not ready after ${(timeoutMs / 1000).toFixed(0)}s`);
      const rows = results.map((r) => ({
        Service: r.name,
        Target: formatTarget(r),
        Status: r.status,
        Detail: r.statusCode ? `HTTP ${r.statusCode}` : (r.errorCode || r.error || ''),
        Cause: summarizeCause(r),
      }));
      console.table(rows);
      process.exit(1);
    }

    const remaining = Math.max(0, timeoutMs - elapsed);
    console.log(`  ⏳ attempt ${attempt} — ${pending.length} pending, ${(remaining / 1000).toFixed(0)}s left`);
    attempt += 1;
    await sleep(intervalMs);
  }
}

waitForStack().catch((error) => {
  console.error(`Stack readiness error: ${error.message || error}`);
  process.exit(1);
});
