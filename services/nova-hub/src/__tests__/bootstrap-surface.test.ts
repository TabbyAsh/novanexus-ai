import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('administrative bootstrap surface', () => {
  it('does not expose the retired founder-grant route through Hub or Gateway', () => {
    const hubSource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const gatewaySource = readFileSync(
      resolve(__dirname, '..', '..', '..', 'gateway', 'src', 'index.ts'),
      'utf8',
    );

    expect(hubSource).not.toContain('/v1/bootstrap/admin');
    expect(hubSource).not.toContain('BOOTSTRAP_SECRET');
    expect(gatewaySource).not.toContain("'/v1/bootstrap/'");
    expect(gatewaySource).not.toContain("app.all('/v1/bootstrap/*'");
  });
});
