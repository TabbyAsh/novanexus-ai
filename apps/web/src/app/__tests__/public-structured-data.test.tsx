import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkflowSetupPage, { metadata as workflowMetadata } from '../services/workflow-setup/page';
import {
  organizationStructuredData,
  serializeStructuredData,
  workflowSetupStructuredData,
} from '@/lib/public-structured-data';

describe('public structured data', () => {
  it('identifies the real operator without invented ratings, locations, or social profiles', () => {
    expect(organizationStructuredData).toEqual(expect.objectContaining({
      '@type': 'Organization',
      '@id': 'https://novanexus-ai.com/#organization',
      name: 'Nova Enterprises',
      url: 'https://novanexus-ai.com',
      email: 'hello@novanexus-ai.com',
    }));
    expect(JSON.stringify(organizationStructuredData)).not.toMatch(/rating|review|sameAs|address/i);
  });

  it('describes exactly one $150 one-time human service offer', () => {
    expect(workflowSetupStructuredData).toEqual(expect.objectContaining({
      '@type': 'Service',
      name: 'Workflow Setup Pilot',
      serviceType: 'Human-delivered workflow setup',
      offers: expect.objectContaining({
        '@type': 'Offer',
        price: '150.00',
        priceCurrency: 'USD',
        category: 'One-time human-delivered service',
      }),
    }));
    const encoded = serializeStructuredData(workflowSetupStructuredData);
    const markup = renderToStaticMarkup(<WorkflowSetupPage />);
    expect(markup).toContain('id="workflow-setup-structured-data"');
    expect(markup).toContain(encoded);
    expect(encoded).toContain('No subscription');
    expect(encoded).not.toMatch(/aggregateRating|review|priceValidUntil/i);
  });

  it('publishes canonical and share metadata for the offer page', () => {
    expect(workflowMetadata.alternates).toEqual({ canonical: '/services/workflow-setup' });
    expect(workflowMetadata.openGraph).toEqual(expect.objectContaining({
      url: '/services/workflow-setup',
      title: 'Workflow Setup Pilot — Nova',
    }));
  });

  it('escapes less-than signs before JSON is placed in an inline script', () => {
    expect(serializeStructuredData({ value: '</script>' })).toBe('{"value":"\\u003c/script>"}');
  });
});
