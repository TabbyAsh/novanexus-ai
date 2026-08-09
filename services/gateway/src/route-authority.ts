import type { Scope } from '@nova/shared';

export type RouteScopeRule = { methods: string[]; path: string; scopes: Scope[] };

const READ = ['GET', 'HEAD', 'OPTIONS'];
const WRITE = ['POST', 'PUT', 'PATCH', 'DELETE'];

// These routes belong to the retired trade-only Nexus implementation. They
// operate on a shared ledger and are therefore platform controls, not tenant
// product APIs. Keep this list centralized so authentication, ownership, and
// scope enforcement cannot drift apart.
export const LEGACY_NEXUS_PLATFORM_ROUTES = [
  '/v1/nexus/status',
  '/v1/nexus/initialize',
  '/v1/nexus/analyze',
  '/v1/nexus/execute',
  '/v1/nexus/autonomous-scan',
  '/v1/nexus/ledger',
  '/v1/nexus/stop',
];

export const ROUTE_SCOPE_RULES: RouteScopeRule[] = [
  ...LEGACY_NEXUS_PLATFORM_ROUTES.map(path => ({
    methods: [...READ, ...WRITE],
    path,
    scopes: ['ops.admin'] as Scope[],
  })),
  { methods: ['POST'], path: '/v1/trade/backtest', scopes: ['trade.backtest'] },
  { methods: ['POST'], path: '/v1/trade/paper', scopes: ['trade.paper.execute'] },
  { methods: ['POST'], path: '/v1/trade/live', scopes: ['trade.live.execute'] },
  { methods: ['POST'], path: '/v1/trade/scan', scopes: ['trade.read'] },
  { methods: READ, path: '/v1/trade', scopes: ['trade.read'] },
  { methods: WRITE, path: '/v1/store/products', scopes: ['store.write'] },
  { methods: READ, path: '/v1/store/products', scopes: ['store.read'] },
  { methods: [...READ, ...WRITE], path: '/v1/store/orders', scopes: ['store.orders'] },
  { methods: WRITE, path: '/v1/store', scopes: ['store.write'] },
  { methods: READ, path: '/v1/store', scopes: ['store.read'] },
  { methods: ['POST'], path: '/v1/social/post', scopes: ['social.post'] },
  { methods: WRITE, path: '/v1/social/schedule', scopes: ['social.schedule'] },
  { methods: WRITE, path: '/v1/social', scopes: ['social.post'] },
  { methods: READ, path: '/v1/social', scopes: ['social.read'] },
  { methods: WRITE, path: '/v1/research/propose', scopes: ['research.propose'] },
  { methods: WRITE, path: '/v1/research', scopes: ['research.propose'] },
  { methods: READ, path: '/v1/research', scopes: ['research.read'] },
  { methods: WRITE, path: '/v1/agents/proposals/decide', scopes: ['forge.approve'] },
  { methods: WRITE, path: '/v1/agents/evals/promote', scopes: ['forge.approve'] },
  { methods: WRITE, path: '/v1/agents/evals', scopes: ['forge.propose'] },
  { methods: WRITE, path: '/v1/agents', scopes: ['forge.propose'] },
  { methods: READ, path: '/v1/agents', scopes: ['forge.read'] },
  { methods: WRITE, path: '/v1/smith', scopes: ['forge.propose'] },
  { methods: WRITE, path: '/v1/ignition', scopes: ['forge.propose'] },
  { methods: WRITE, path: '/v1/executor', scopes: ['research.propose'] },
  { methods: [...READ, ...WRITE], path: '/v1/kill-switch', scopes: ['admin.killswitch'] },
];

export function requiredScopesForRoute(method: string, requestPath: string): Scope[] {
  return ROUTE_SCOPE_RULES
    .filter(rule => rule.methods.includes(method.toUpperCase()) && (
      requestPath === rule.path || requestPath.startsWith(`${rule.path}/`)
    ))
    .sort((a, b) => b.path.length - a.path.length)[0]?.scopes || [];
}
