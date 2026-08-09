import fs from 'node:fs';
import path from 'node:path';

describe('economic Trade provenance', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'economic-trade-state.ts'), 'utf8');

  it('does not auto-seed a supposedly user-confirmed case on read', () => {
    expect(source).not.toContain('seedTrade0001');
    expect(source).not.toContain('founder-confirmed project state');
    expect(source).not.toContain("VALUES ($1, '0001'");
    expect(source).toContain('Explicit case creation and provenance confirmation are required');
  });
});
