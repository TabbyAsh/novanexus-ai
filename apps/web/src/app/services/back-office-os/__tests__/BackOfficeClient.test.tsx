import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import BackOfficeClient from '../BackOfficeClient';

describe('Workflow Setup Pilot page', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BACK_OFFICE_STARTER_PAYMENT_URL;
  });

  it('presents one bounded human-delivered $150 offer with exactly five deliverables', () => {
    const markup = renderToStaticMarkup(<BackOfficeClient />);
    expect(markup).toContain('Workflow Setup Pilot');
    expect(markup).toContain('$150');
    expect(markup).toContain('one-time');
    expect(markup.match(/<li/g)).toHaveLength(5);
    expect(markup).toContain('seven business days after scope acceptance');
    expect(markup).toContain('Permissions are tested');
    expect(markup).toContain('walkthrough and client acceptance check');
    expect(markup).not.toContain('/month');
    expect(markup).not.toContain('Most popular');
  });

  it('does not reveal an env-configured hosted payment link before a durable receipt exists', () => {
    process.env.NEXT_PUBLIC_BACK_OFFICE_STARTER_PAYMENT_URL = 'https://buy.stripe.com/test_link';
    const markup = renderToStaticMarkup(<BackOfficeClient />);
    expect(markup).not.toContain('buy.stripe.com');
    expect(markup).not.toContain('Continue to hosted payment');
  });

  it('explains every minimum and keeps the submit control available for native validation', () => {
    const markup = renderToStaticMarkup(<BackOfficeClient />);
    expect(markup).toContain('All four fields are required');
    expect(markup).toContain('at least 2 characters for your name and business');
    expect(markup).toContain('a valid email address');
    expect(markup).toContain('at least 20 characters for the workflow description');
    expect(markup).toContain('The form identifies anything missing before an inquiry is sent');
    expect(markup).toContain('Minimum 20 characters');
    expect(markup).toContain('aria-describedby="pilot-intake-requirements"');
    expect(markup).toContain('aria-busy="false"');
    expect(markup).not.toContain('disabled=""');
  });

  it('submits the revenue inquiry through the same-origin backend proxy', () => {
    const source = readFileSync(path.resolve(__dirname, '..', 'BackOfficeClient.tsx'), 'utf8');
    expect(source).toContain("fetch('/api/proxy/v1/contact'");
    expect(source).not.toContain('NEXT_PUBLIC_API_URL');
    expect(source).not.toContain('up.railway.app');
  });
});
