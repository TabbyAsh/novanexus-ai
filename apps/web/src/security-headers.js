const BASE_SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), geolocation=(), browsing-topics=()',
  },
];

function publicDoorwayCsp(allowDevelopmentEval = false) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${allowDevelopmentEval ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join('; ');
}

const PUBLIC_DOORWAY_CSP = publicDoorwayCsp(false);

function securityHeaderRules(nodeEnv = process.env.NODE_ENV) {
  const contentSecurityPolicy = {
    key: 'Content-Security-Policy',
    value: publicDoorwayCsp(nodeEnv === 'development'),
  };

  return [
    { source: '/:path*', headers: BASE_SECURITY_HEADERS },
    { source: '/', headers: [contentSecurityPolicy] },
    { source: '/services/workflow-setup', headers: [contentSecurityPolicy] },
  ];
}

module.exports = {
  BASE_SECURITY_HEADERS,
  PUBLIC_DOORWAY_CSP,
  publicDoorwayCsp,
  securityHeaderRules,
};
