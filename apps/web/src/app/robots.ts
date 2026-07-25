import type { MetadataRoute } from 'next';

const SITE_URL = 'https://novanexus-ai.com';

/**
 * Until now the site served no robots.txt at all (it 404'd), and no sitemap.
 * With zero inbound links, a sitemap is effectively the only way Google finds
 * these pages — so this file and sitemap.ts are the discovery layer.
 *
 * Everything behind a login, everything founder-only, and every per-user result
 * page is excluded: indexing a stranger's appraisal result would be both
 * useless to searchers and a privacy problem.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/admin',
          '/world',        // founder-only; the page is noindex too
          '/result/',      // per-appraisal pages — not search results
          '/billing/',
          '/settings/',
          '/login',
          '/register',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
