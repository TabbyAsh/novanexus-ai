import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../page';

describe('public doorway', () => {
  const markup = renderToStaticMarkup(<HomePage />);

  it('sends visitors only to clear, real destinations', () => {
    expect(markup).toContain('href="#system"');
    expect(markup).toContain('href="#protocol"');
    expect(markup).toContain('href="/loop"');
    expect(markup).toContain('href="/services/back-office-os"');
    expect(markup).toContain('href="/nexus"');

    expect(markup).not.toContain('href="/world"');
    expect(markup).not.toContain('href="#markets"');
    expect(markup).not.toContain('href="/dashboard');
  });

  it('explains one coherent Nova product and method', () => {
    expect(markup.match(/data-primary-action/g)).toHaveLength(1);
    expect(markup).toContain('The Economic Operating System for Humanity™');
    expect(markup).toContain('Interaction engine for the edge of the AI frontier');
    expect(markup).toContain('Run the public Nova Loop');
    expect(markup).toContain('Humanity');
    expect(markup).toContain('Nexus');
    expect(markup).toContain('Reality');
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

    expect(markup).toContain('$150 guided pilot');
    expect(markup).toContain('human work');
    expect(markup).toContain('not a software subscription');
    expect(markup).toContain('North star · not present scale');
    expect(markup).toContain('Frontier · not available');
  });
});
