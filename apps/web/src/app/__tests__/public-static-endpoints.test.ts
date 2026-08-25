import { GET as getFavicon } from '../favicon.ico/route';
import { GET as getSecurityText } from '../.well-known/security.txt/route';

describe('public static endpoints', () => {
  it('serves a cacheable branded favicon at the conventional path', async () => {
    const response = getFavicon();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(response.headers.get('cache-control')).toContain('max-age=86400');
    expect(await response.text()).toMatch(/<svg[\s\S]*#b9ef9a/i);
  });

  it('publishes a minimal RFC 9116 security contact without personal data', async () => {
    const response = getSecurityText();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(body).toContain('Contact: mailto:hello@novanexus-ai.com');
    expect(body).toContain('Expires: 2027-08-24T23:59:59.000Z');
    expect(body).toContain('Canonical: https://novanexus-ai.com/.well-known/security.txt');
    expect(body).not.toMatch(/phone|address|name:/i);
  });
});
