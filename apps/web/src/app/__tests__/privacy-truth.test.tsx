import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import PrivacyPage from '../privacy/page';

describe('Nexus privacy disclosure', () => {
  const markup = renderToStaticMarkup(<PrivacyPage />);

  it('states what chat content is stored and externally processed', () => {
    expect(markup).toContain('full messages, Nova replies, and conversation-derived titles');
    expect(markup).toContain('up to ten recent stored messages');
    expect(markup).toContain('Google Gemini');
    expect(markup).toContain('OpenAI');
    expect(markup).toContain('do not promise zero retention');
  });

  it('distinguishes redacted receipts from raw conversation storage', () => {
    expect(markup).toContain('Content-redacted interaction receipts');
    expect(markup).toContain('associated conversation is not content-free');
  });

  it('truthfully discloses cookie-free aggregate analytics without lead tracking', () => {
    expect(markup).toContain('Vercel Web Analytics');
    expect(markup).toContain('anonymized, aggregate page views');
    expect(markup).toContain('does not use cookies or track visitors across websites');
    expect(markup).toContain('do not send form or lead contents or custom events');
    expect(markup).toContain('href="https://vercel.com/docs/analytics/privacy-policy"');
    expect(markup).toContain('Last updated: August 25, 2026');
  });

  it('mounts the official analytics component exactly once without custom events', () => {
    const layoutSource = readFileSync(path.resolve(__dirname, '..', 'layout.tsx'), 'utf8');
    expect(layoutSource).toContain("from '@vercel/analytics/next'");
    expect(layoutSource.match(/<Analytics\s*\/>/g)).toHaveLength(1);
    expect(layoutSource).not.toMatch(/\btrack\s*\(/);
  });
});
