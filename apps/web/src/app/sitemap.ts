import type { MetadataRoute } from 'next';

const SITE_URL = 'https://novanexus-ai.com';

/**
 * The public surface, ranked by what actually earns a stranger's attention.
 *
 * The two flip tools lead deliberately: they are the only pages that deliver
 * value to someone who has never heard of Nova, and "flip calculator" is a
 * term people already search. Everything gated, founder-only, or per-user is
 * absent here and disallowed in robots.ts.
 */
type Entry = { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] };

const PAGES: Entry[] = [
  // the value loops — what a stranger can finish without an account
  { path: '/check', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/flip-calculator', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/', priority: 0.9, changeFrequency: 'weekly' },

  // live public data
  { path: '/radar', priority: 0.7, changeFrequency: 'daily' },
  { path: '/deals', priority: 0.6, changeFrequency: 'daily' },

  // what Nova is / what it costs
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/studio', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/enterprise', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/services/back-office-os', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/services/local-admin', priority: 0.5, changeFrequency: 'monthly' },

  // the sectors — public doors by design (Two-Depths doctrine)
  { path: '/market', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/bazaar', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/forge', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/intelligence', priority: 0.5, changeFrequency: 'weekly' },

  // reference / trust
  { path: '/playbook', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/field-manual', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/decision-cards', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/careers', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/legal/risk-disclosure', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
