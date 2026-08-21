import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_NEXUS_PLATFORM_ROUTES, requiredScopesForRoute } from '../route-authority';

describe('method-aware gateway authority', () => {
  it('does not let a read scope authorize a write to the same resource family', () => {
    expect(requiredScopesForRoute('GET', '/v1/store/products')).toEqual(['store.read']);
    expect(requiredScopesForRoute('POST', '/v1/store/products')).toEqual(['store.write']);
  });

  it('uses the narrow execution scope instead of a broad route prefix', () => {
    expect(requiredScopesForRoute('POST', '/v1/trade/live/order')).toEqual(['trade.live.execute']);
    expect(requiredScopesForRoute('GET', '/v1/trade/live/order')).toEqual(['trade.read']);
  });

  it('requires approval authority for proposal decisions', () => {
    expect(requiredScopesForRoute('POST', '/v1/agents/proposals/decide/proposal-1')).toEqual(['forge.approve']);
    expect(requiredScopesForRoute('GET', '/v1/agents')).toEqual(['forge.read']);
  });

  it('keeps Proof Desk behind platform authority for reads and writes', () => {
    expect(requiredScopesForRoute('GET', '/v1/ops/proofs')).toEqual(['ops.admin']);
    expect(requiredScopesForRoute('POST', '/v1/ops/proofs/svc_123/commands')).toEqual(['ops.admin']);
    expect(requiredScopesForRoute('POST', '/v1/billing/service-checkout')).toEqual(['ops.admin']);
  });

  it('keeps every legacy trade-only Nexus route behind platform authority', () => {
    expect(LEGACY_NEXUS_PLATFORM_ROUTES).toEqual(expect.arrayContaining([
      '/v1/nexus/status',
      '/v1/nexus/initialize',
      '/v1/nexus/analyze',
      '/v1/nexus/execute',
      '/v1/nexus/autonomous-scan',
      '/v1/nexus/ledger',
      '/v1/nexus/stop',
    ]));

    for (const route of LEGACY_NEXUS_PLATFORM_ROUTES) {
      expect(requiredScopesForRoute('GET', route)).toEqual(['ops.admin']);
      expect(requiredScopesForRoute('POST', route)).toEqual(['ops.admin']);
    }
  });

  it('preserves idempotency keys across the service boundary', () => {
    const gatewaySource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
    const proxyRequestStart = gatewaySource.indexOf('async function proxyRequest(');
    const routeHandlersStart = gatewaySource.indexOf('// Route Handlers', proxyRequestStart);
    const proxyRequestSource = gatewaySource.slice(proxyRequestStart, routeHandlersStart);

    expect(proxyRequestStart).toBeGreaterThan(-1);
    expect(routeHandlersStart).toBeGreaterThan(proxyRequestStart);
    expect(proxyRequestSource).toContain("typeof req.headers['idempotency-key'] === 'string'");
    expect(proxyRequestSource).toContain("headers['Idempotency-Key'] = req.headers['idempotency-key']");
  });

  it('rate-limits only after bearer authentication can establish a verified identity', () => {
    const gatewaySource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
    const authenticationMiddleware = gatewaySource.indexOf('// Authentication middleware');
    const rateLimitMiddleware = gatewaySource.indexOf('// Rate limiting middleware');

    expect(authenticationMiddleware).toBeGreaterThan(-1);
    expect(rateLimitMiddleware).toBeGreaterThan(authenticationMiddleware);
    expect(gatewaySource).not.toContain('authorization.substring');
  });

  it('bounds invalid bearer verification by network identity before authentication', () => {
    const gatewaySource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
    const preAuthLimiter = gatewaySource.indexOf('// Bound JWT verification work before authentication');
    const authenticationMiddleware = gatewaySource.indexOf('// Authentication middleware');
    const preAuthSource = gatewaySource.slice(preAuthLimiter, authenticationMiddleware);

    expect(preAuthLimiter).toBeGreaterThan(-1);
    expect(authenticationMiddleware).toBeGreaterThan(preAuthLimiter);
    expect(preAuthSource).toContain('`preauth:${requestRateLimitKey(req)}`');
    expect(preAuthSource).not.toContain('substring');
  });

  it('never declares a legacy Nexus platform control as a public route', () => {
    const gatewaySource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
    const publicRoutes = gatewaySource.match(/const PUBLIC_ROUTES = \[([\s\S]*?)\n\];/)?.[1] ?? '';

    for (const route of LEGACY_NEXUS_PLATFORM_ROUTES) {
      expect(publicRoutes).not.toContain(`'${route}'`);
    }
  });

  it('keeps World ownership and provider diagnostics out of the public prefix list', () => {
    const gatewaySource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
    const publicRoutes = gatewaySource.match(/const PUBLIC_ROUTES = \[([\s\S]*?)\n\];/)?.[1] ?? '';
    const platformRoutes = gatewaySource.match(/const PLATFORM_CONTROL_ROUTES = \[([\s\S]*?)\n\];/)?.[1] ?? '';

    expect(publicRoutes).toContain("'/v1/world/pulse'");
    expect(publicRoutes).toContain("'/v1/world/hail'");
    expect(publicRoutes).not.toContain("'/v1/world/'");
    expect(publicRoutes).not.toContain("'/v1/agents/providers'");
    expect(platformRoutes).toContain("'/v1/agents/providers'");
  });

  it('keeps operator-issued service checkout behind the platform-owner boundary', () => {
    const gatewaySource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
    const publicRoutes = gatewaySource.match(/const PUBLIC_ROUTES = \[([\s\S]*?)\n\];/)?.[1] ?? '';
    const platformRoutes = gatewaySource.match(/const PLATFORM_CONTROL_ROUTES = \[([\s\S]*?)\n\];/)?.[1] ?? '';

    expect(publicRoutes).not.toContain("'/v1/billing/service-checkout'");
    expect(platformRoutes).toContain("'/v1/billing/service-checkout'");
  });
});
