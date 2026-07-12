#!/usr/bin/env node

/**
 * Production contract verification.
 *
 * Nova's production topology is intentionally compact: Railway builds the
 * backend services into one image and PM2 starts those same services. This
 * guard prevents a service from being built but never started (or started
 * without a bundle), and protects the public Decision Card learning loop from
 * silently losing one of its Gateway routes.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile.prod'), 'utf8');
const gateway = fs.readFileSync(path.join(root, 'services/gateway/src/index.ts'), 'utf8');
const ecosystem = require(path.join(root, 'ecosystem.config.js'));

const productionServices = [
  'gateway',
  'auth',
  'orchestrator',
  'eventbus',
  'billing',
  'tradebot',
  'marketdata',
  'nova-hub',
  'socialbot',
  'storebot',
  'commercedata',
  'scheduler',
  'opsbot',
];

const pm2Names = new Set((ecosystem.apps || []).map((app) => app.name));
const bundledServices = new Set(
  [...dockerfile.matchAll(/services\/([^/\s]+)\/dist\/index\.js/g)].map((match) => match[1])
);
const failures = [];

for (const service of productionServices) {
  const bundlePath = `services/${service}/dist/index.js`;
  if (!dockerfile.includes(bundlePath)) {
    failures.push(`${service}: missing production bundle in Dockerfile.prod`);
  }
  if (!pm2Names.has(service)) {
    failures.push(`${service}: bundled but not started by ecosystem.config.js`);
  }
}

for (const app of ecosystem.apps || []) {
  if (!productionServices.includes(app.name)) {
    failures.push(`${app.name}: PM2 starts a service absent from the production contract`);
  }
}

for (const service of bundledServices) {
  if (!productionServices.includes(service)) {
    failures.push(`${service}: Dockerfile bundles a service absent from the production contract`);
  }
}

const gatewayTargetNames = new Set(
  [...gateway.matchAll(/proxyRequest(?:Rewrite)?\(\s*SERVICE_URLS\.(\w+)/g)].map((match) => match[1])
);
const targetToService = { novaHub: 'nova-hub' };
for (const target of gatewayTargetNames) {
  const service = targetToService[target] || target;
  if (!productionServices.includes(service)) {
    failures.push(`${target}: Gateway proxies a target absent from the production contract`);
  }
}

const publicCardLoop = [
  '/v1/cards/intake*',
  '/v1/cards/outcome*',
  '/v1/cards/calibration*',
  '/v1/cards/mine*',
];
for (const route of publicCardLoop) {
  if (!gateway.includes(`'${route}'`)) {
    failures.push(`Gateway does not forward ${route}`);
  }
}

const nexusInteractionRoutes = [
  '/v1/nexus/interact',
  '/v1/nexus/capabilities',
  '/v1/nexus/interactions*',
  '/v1/nexus/conversations*',
];
for (const route of nexusInteractionRoutes) {
  if (!gateway.includes(`'${route}'`)) {
    failures.push(`Gateway does not forward canonical Nexus route ${route}`);
  }
}

// A reserved-but-empty service must fail honestly at the Gateway. This guards
// against phantom routes that proxy to a port production never starts.
if (gateway.includes('proxyRequest(SERVICE_URLS.researchbot')) {
  failures.push('Gateway proxies ResearchBot even though production does not build or start it');
}
if (!gateway.includes("code: 'RESEARCHBOT_NOT_IMPLEMENTED'")) {
  failures.push('Gateway does not expose ResearchBot as an explicit unavailable capability');
}

if (failures.length) {
  console.error('Production contract verification failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS: ${productionServices.length} production services are built and started.`);
console.log(`PASS: ${publicCardLoop.length} Decision Card loop routes are forwarded.`);
console.log(`PASS: ${nexusInteractionRoutes.length} Nexus Interaction Engine routes are forwarded.`);
console.log('PASS: reserved ResearchBot routes fail explicitly instead of proxying to a phantom service.');
