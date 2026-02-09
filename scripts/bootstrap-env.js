#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env.dev');

const REQUIRED_KEYS = [
  { key: 'POSTGRES_USER', value: 'nova' },
  { key: 'POSTGRES_PASSWORD', value: 'nova_dev_password' },
  { key: 'POSTGRES_DB', value: 'nova' },
  { key: 'REDIS_URL', value: 'redis://localhost:6379' },
  { key: 'JWT_SECRET', generator: () => crypto.randomBytes(32).toString('hex') },
  { key: 'INTERNAL_VERIFY_ENABLED', value: 'true' },
  { key: 'INTERNAL_VERIFY_TOKEN', generator: () => crypto.randomBytes(24).toString('hex') },
  { key: 'INTERNAL_DECISION_CARDS_TOKEN', generator: () => crypto.randomBytes(24).toString('hex') },
  { key: 'INTERNAL_VERIFY_SYMBOL', value: 'SPY' },
  { key: 'INTERNAL_VERIFY_DAYS', value: '10' },
  { key: 'DATABASE_SSL', value: 'false' },
  { key: 'STACK_MODE', value: 'host' },
  { key: 'STACK_PROTOCOL', value: 'http' },
  { key: 'STACK_HOST', value: 'localhost' },
  { key: 'STACK_READY_TIMEOUT_MS', value: '180000' },
  { key: 'STACK_PROFILE', value: 'mvp' },
  { key: 'NO_DOCKER', value: 'false' },
  { key: 'GATEWAY_PORT', value: '3000' },
  { key: 'AUTH_PORT', value: '3001' },
  { key: 'ORCHESTRATOR_PORT', value: '3002' },
  { key: 'EVENTBUS_PORT', value: '3003' },
  { key: 'AUDIT_PORT', value: '3004' },
  { key: 'NOTIFIER_PORT', value: '3005' },
  { key: 'BILLING_PORT', value: '3006' },
  { key: 'TRADEBOT_PORT', value: '3010' },
  { key: 'STOREBOT_PORT', value: '3011' },
  { key: 'SOCIALBOT_PORT', value: '3012' },
  { key: 'MARKETDATA_PORT', value: '3020' },
  { key: 'NOVA_HUB_PORT', value: '3030' },
  { key: 'WEB_PORT', value: '8080' },
];

function readLines() {
  if (!fs.existsSync(ENV_PATH)) return [];
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  return raw.split(/\r?\n/);
}

function parseLine(line) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!match) return null;
  return { key: match[1], value: match[2] };
}

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed === '""' || trimmed === "''") return true;
  return false;
}

function ensureDatabaseUrl(lines, indexMap) {
  const user = resolveValue(lines, indexMap, 'POSTGRES_USER') || 'nova';
  const pass = resolveValue(lines, indexMap, 'POSTGRES_PASSWORD') || 'nova_dev_password';
  const db = resolveValue(lines, indexMap, 'POSTGRES_DB') || 'nova';
  const url = `postgresql://${user}:${pass}@localhost:5432/${db}`;
  upsertLine(lines, indexMap, 'DATABASE_URL', url);
}

function resolveValue(lines, indexMap, key) {
  if (!indexMap.has(key)) return '';
  const line = lines[indexMap.get(key)];
  const parsed = parseLine(line);
  return parsed ? parsed.value : '';
}

function upsertLine(lines, indexMap, key, value) {
  if (indexMap.has(key)) {
    const idx = indexMap.get(key);
    const current = parseLine(lines[idx]);
    if (current && !isEmptyValue(current.value)) return;
    lines[idx] = `${key}=${value}`;
    return;
  }
  lines.push(`${key}=${value}`);
  indexMap.set(key, lines.length - 1);
}

function bootstrapEnv() {
  const lines = readLines();
  const indexMap = new Map();
  lines.forEach((line, idx) => {
    const parsed = parseLine(line);
    if (parsed) indexMap.set(parsed.key, idx);
  });

  for (const item of REQUIRED_KEYS) {
    const value = item.generator ? item.generator() : item.value;
    upsertLine(lines, indexMap, item.key, value);
  }

  ensureDatabaseUrl(lines, indexMap);

  const output = lines.filter((line, idx) => idx === 0 || line !== '').join('\n').trim();
  fs.writeFileSync(ENV_PATH, output + '\n');
  console.log(`✓ Environment ready at ${ENV_PATH}`);
}

bootstrapEnv();
