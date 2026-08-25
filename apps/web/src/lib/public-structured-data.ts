const canonicalOrigin = 'https://novanexus-ai.com';

export const organizationStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${canonicalOrigin}/#organization`,
  name: 'Nova Enterprises',
  url: canonicalOrigin,
  email: 'hello@novanexus-ai.com',
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'hello@novanexus-ai.com',
  },
} as const;

export const workflowSetupStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': `${canonicalOrigin}/services/workflow-setup#service`,
  name: 'Workflow Setup Pilot',
  serviceType: 'Human-delivered workflow setup',
  description:
    'One bounded workflow setup with five defined deliverables for a one-time price of $150. No subscription or software access is included.',
  url: `${canonicalOrigin}/services/workflow-setup`,
  provider: {
    '@id': `${canonicalOrigin}/#organization`,
  },
  audience: {
    '@type': 'BusinessAudience',
    audienceType: 'Small operators',
  },
  termsOfService: `${canonicalOrigin}/terms`,
  offers: {
    '@type': 'Offer',
    '@id': `${canonicalOrigin}/services/workflow-setup#offer`,
    url: `${canonicalOrigin}/services/workflow-setup`,
    price: '150.00',
    priceCurrency: 'USD',
    category: 'One-time human-delivered service',
    seller: {
      '@id': `${canonicalOrigin}/#organization`,
    },
  },
} as const;

export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
