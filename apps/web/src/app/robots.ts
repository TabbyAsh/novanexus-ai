import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/office', '/connections', '/admin/', '/dashboard/', '/nexus/', '/ops/', '/result/', '/world/'],
    },
    sitemap: 'https://novanexus-ai.com/sitemap.xml',
    host: 'https://novanexus-ai.com',
  };
}
