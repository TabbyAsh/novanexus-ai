import fs from 'node:fs';
import path from 'node:path';

describe('private Nexus truth', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'dashboard', 'nova', 'page.tsx'), 'utf8');

  it('uses the environment-isolated same-origin backend proxy', () => {
    expect(source).toContain("const API = '/api/proxy'");
    expect(source).not.toContain('NEXT_PUBLIC_API_URL');
    expect(source).not.toContain('abackend-production');
  });

  it('distinguishes saved chat from verified operating memory', () => {
    expect(source).toContain('not verified operating memory');
    expect(source).toContain('original Nexus receipts, evidence, and outcome state are not reloaded');
    expect(source).toContain('Content-redacted interaction receipt saved');
  });

  it('discloses storage and external AI provider processing beside the input', () => {
    expect(source).toContain('stored with your account');
    expect(source).toContain('recent chat context');
    expect(source).toContain('one or more configured AI providers');
    expect(source).toContain('href="/privacy"');
  });
});
