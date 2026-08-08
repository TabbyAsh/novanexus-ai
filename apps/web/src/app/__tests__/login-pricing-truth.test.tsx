import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from '../login/page';
import PricingPage from '../pricing/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ login: jest.fn(), isAuthenticated: false }),
}));

describe('login legal links', () => {
  const markup = renderToStaticMarkup(<LoginPage />);

  it('links to the Terms and Privacy pages without unsupported security claims', () => {
    expect(markup).toContain('href="/terms"');
    expect(markup).toContain('Terms of Service');
    expect(markup).toContain('href="/privacy"');
    expect(markup).toContain('Privacy Policy');
    expect(markup).not.toContain('256-bit encrypted');
    expect(markup).not.toContain('enterprise-grade security');
  });
});

describe('pricing offer', () => {
  const markup = renderToStaticMarkup(<PricingPage />);

  it('presents the real one-time service without a free-account detour', () => {
    expect(markup).toContain('Back Office OS Starter Pilot');
    expect(markup).toContain('$150 one-time');
    expect(markup).toContain('not a self-serve software subscription');
    expect(markup).toContain('href="/services/back-office-os"');
    expect(markup).not.toContain('href="/register"');
    expect(markup).not.toContain('Create a free account');
    expect(markup).not.toContain('href="/#services"');
  });
});
