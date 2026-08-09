import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../page';

describe('public doorway', () => {
  const markup = renderToStaticMarkup(<HomePage />);

  it('sends visitors only to clear, real destinations', () => {
    expect(markup).toContain('href="#product"');
    expect(markup).toContain('href="#method"');
    expect(markup).toContain('href="/loop"');
    expect(markup).toContain('href="/services/workflow-setup"');
    expect(markup).toContain('href="/register"');
    expect(markup).toContain('href="/login"');

    expect(markup).not.toContain('href="/world"');
    expect(markup).not.toContain('href="#markets"');
    expect(markup).not.toContain('href="/dashboard');
    expect(markup).not.toContain('href="/nexus"');
  });

  it('explains one coherent Nova product and method', () => {
    expect(markup.match(/data-primary-action/g)).toHaveLength(1);
    expect(markup).toContain('Decision support for changing work');
    expect(markup).toContain('The world keeps inventing problems');
    expect(markup).toContain('Try the Nova Loop');
    expect(markup).toContain('Notice');
    expect(markup).toContain('Frame');
    expect(markup).toContain('Commit');
    expect(markup).toContain('Verify');
    expect(markup).toContain('Adapt');
  });

  it('contains no private case study or unsupported product claims', () => {
    expect(markup).not.toMatch(/\bTrade\s+#\d+\b/i);
    expect(markup).not.toContain('Webull');
    expect(markup).not.toContain('live trading');
    expect(markup).not.toContain('subscription plans');
    expect(markup).not.toContain('The Economic Operating System');
    expect(markup).not.toContain('AI frontier');
    expect(markup).not.toContain('Humanity');
    expect(markup).not.toContain('Nexus protocol');
    expect(markup).not.toContain('North star');
    expect(markup).not.toContain('Apex');

    expect(markup).toContain('$150 one-time');
    expect(markup).toContain('No subscription');
    expect(markup).toContain('No software access is sold');
  });
});
