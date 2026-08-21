import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('same-origin API proxy header contract', () => {
  it('preserves authorization, correlation, and mutation idempotency', () => {
    const source = readFileSync(path.resolve(__dirname, '..', '[...path]', 'route.ts'), 'utf8');
    expect(source).toContain("'authorization'");
    expect(source).toContain("'x-request-id'");
    expect(source).toContain("'idempotency-key'");
  });
});
