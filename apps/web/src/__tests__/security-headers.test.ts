const {
  BASE_SECURITY_HEADERS,
  PUBLIC_DOORWAY_CSP,
  securityHeaderRules,
} = require('../security-headers');

describe('production web security headers', () => {
  it('sets compatible baseline headers for every route', () => {
    const rules = securityHeaderRules('production');
    const globalRule = rules.find((rule: { source: string }) => rule.source === '/:path*');
    expect(globalRule.headers).toEqual(expect.arrayContaining([
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ]));
    expect(globalRule.headers).toEqual(BASE_SECURITY_HEADERS);
  });

  it('limits the strict CSP to the public conversion doorway', () => {
    const rules = securityHeaderRules('production');
    const cspRoutes = rules
      .filter((rule: { headers: Array<{ key: string }> }) =>
        rule.headers.some(header => header.key === 'Content-Security-Policy'))
      .map((rule: { source: string }) => rule.source);
    expect(cspRoutes).toEqual(['/', '/services/workflow-setup']);
    expect(PUBLIC_DOORWAY_CSP).toContain("object-src 'none'");
    expect(PUBLIC_DOORWAY_CSP).toContain("form-action 'self'");
    expect(PUBLIC_DOORWAY_CSP).not.toContain("'unsafe-eval'");
    expect(PUBLIC_DOORWAY_CSP).not.toMatch(/google-analytics|googletagmanager|facebook|segment/i);
  });

  it('permits Next development evaluation only in the development policy', () => {
    const development = securityHeaderRules('development');
    const csp = development.find((rule: { source: string }) => rule.source === '/')
      .headers.find((header: { key: string }) => header.key === 'Content-Security-Policy').value;
    expect(csp).toContain("'unsafe-eval'");
  });
});
