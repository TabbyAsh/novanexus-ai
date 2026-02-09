#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { SERVICE_PORTS } = require('../libs/shared/src/constants.js');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env.dev');

function loadEnvFile(envPath = ENV_PATH) {
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

function resolveNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function resolveStackSettings() {
  const mode = process.env.STACK_MODE || 'host';
  const protocol = process.env.STACK_PROTOCOL || 'http';
  const host = process.env.STACK_HOST || 'localhost';
  return { mode, protocol, host };
}

const SERVICE_DEFS = {
  gateway: { env: 'GATEWAY_URL', portEnv: 'GATEWAY_PORT', port: SERVICE_PORTS.GATEWAY, dockerHost: 'gateway', healthPath: '/health' },
  auth: { env: 'AUTH_SERVICE_URL', portEnv: 'AUTH_PORT', port: SERVICE_PORTS.AUTH, dockerHost: 'auth', healthPath: '/health' },
  orchestrator: { env: 'ORCHESTRATOR_URL', portEnv: 'ORCHESTRATOR_PORT', port: SERVICE_PORTS.ORCHESTRATOR, dockerHost: 'orchestrator', healthPath: '/health' },
  eventbus: { env: 'EVENTBUS_URL', portEnv: 'EVENTBUS_PORT', port: SERVICE_PORTS.EVENTBUS, dockerHost: 'eventbus', healthPath: '/health' },
  audit: { env: 'AUDIT_URL', portEnv: 'AUDIT_PORT', port: SERVICE_PORTS.AUDIT, dockerHost: 'audit', healthPath: '/health' },
  notifier: { env: 'NOTIFIER_URL', portEnv: 'NOTIFIER_PORT', port: SERVICE_PORTS.NOTIFIER, dockerHost: 'notifier', healthPath: '/health' },
  billing: { env: 'BILLING_URL', portEnv: 'BILLING_PORT', port: SERVICE_PORTS.BILLING, dockerHost: 'billing', healthPath: '/health' },
  marketdata: { env: 'MARKETDATA_URL', portEnv: 'MARKETDATA_PORT', port: SERVICE_PORTS.MARKETDATA, dockerHost: 'marketdata', healthPath: '/health' },
  tradebot: { env: 'TRADEBOT_URL', portEnv: 'TRADEBOT_PORT', port: SERVICE_PORTS.TRADEBOT, dockerHost: 'tradebot', healthPath: '/health' },
  storebot: { env: 'STOREBOT_URL', portEnv: 'STOREBOT_PORT', port: SERVICE_PORTS.STOREBOT, dockerHost: 'storebot', healthPath: '/health' },
  socialbot: { env: 'SOCIALBOT_URL', portEnv: 'SOCIALBOT_PORT', port: SERVICE_PORTS.SOCIALBOT, dockerHost: 'socialbot', healthPath: '/health' },
  novaHub: { env: 'NOVA_HUB_URL', portEnv: 'NOVA_HUB_PORT', port: 3030, dockerHost: 'nova-hub', healthPath: '/health' },
  web: { env: 'WEB_URL', portEnv: 'WEB_PORT', port: 8080, dockerHost: 'web', healthPath: '/' },
};

const REQUIRED_SERVICE_KEYS = [
  'gateway',
  'auth',
  'orchestrator',
  'eventbus',
  'billing',
  'marketdata',
  'tradebot',
  'novaHub',
];

const CORE_SERVICE_KEYS = [
  'gateway',
  'tradebot',
  'novaHub',
  'web',
];

function buildServiceTarget(key) {
  const def = SERVICE_DEFS[key];
  if (!def) return null;
  const explicit = process.env[def.env];
  const { mode, protocol, host } = resolveStackSettings();
  const resolvedHost = mode === 'docker' ? def.dockerHost : host;
  const port = resolveNumber(process.env[def.portEnv], def.port);
  const baseUrl = explicit || `${protocol}://${resolvedHost}:${port}`;
  return {
    key,
    name: key === 'novaHub' ? 'nova-hub' : key,
    type: 'http',
    baseUrl,
    healthUrl: `${baseUrl}${def.healthPath}`,
  };
}

function parseUrl(input, fallbackPort) {
  if (!input) return { host: 'localhost', port: fallbackPort };
  try {
    const parsed = new URL(input);
    return {
      host: parsed.hostname,
      port: resolveNumber(parsed.port, fallbackPort),
    };
  } catch {
    return { host: 'localhost', port: fallbackPort };
  }
}

function getInfraTargets() {
  const database = parseUrl(process.env.DATABASE_URL, 5432);
  const redis = parseUrl(process.env.REDIS_URL || 'redis://localhost:6379', 6379);
  return [
    { key: 'postgres', name: 'postgres', type: 'tcp', host: database.host, port: database.port },
    { key: 'redis', name: 'redis', type: 'tcp', host: redis.host, port: redis.port },
  ];
}

function getServiceList({ mvpOnly = false, includeWeb = false, profile } = {}) {
  let keys = Object.keys(SERVICE_DEFS);
  if (profile === 'core') {
    keys = CORE_SERVICE_KEYS.slice();
  } else if (profile === 'mvp' || mvpOnly) {
    keys = REQUIRED_SERVICE_KEYS.slice();
  }
  const filtered = includeWeb ? keys : keys.filter((key) => key !== 'web');
  return filtered.map(buildServiceTarget).filter(Boolean);
}

function getStackConfig({ mvpOnly = false, includeWeb = false, profile } = {}) {
  loadEnvFile();
  const services = {};
  for (const key of Object.keys(SERVICE_DEFS)) {
    const target = buildServiceTarget(key);
    if (target) services[key] = target;
  }
  return {
    settings: resolveStackSettings(),
    services,
    requiredServices: getServiceList({ mvpOnly, includeWeb, profile }),
    infra: getInfraTargets(),
  };
}

module.exports = {
  ROOT,
  ENV_PATH,
  loadEnvFile,
  getStackConfig,
  getServiceList,
  getInfraTargets,
  REQUIRED_SERVICE_KEYS,
  CORE_SERVICE_KEYS,
};
