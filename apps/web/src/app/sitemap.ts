import type { MetadataRoute } from 'next';

const canonicalOrigin = 'https://novanexus-ai.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: canonicalOrigin, changeFrequency: 'weekly', priority: 1 },
    { url: `${canonicalOrigin}/loop`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${canonicalOrigin}/services/workflow-setup`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${canonicalOrigin}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${canonicalOrigin}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
