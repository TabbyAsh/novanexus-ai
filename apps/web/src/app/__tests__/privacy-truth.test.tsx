import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
});
