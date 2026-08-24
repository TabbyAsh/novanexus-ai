import robots from '../robots';
import sitemap from '../sitemap';

describe('public discovery metadata', () => {
  it('advertises only the canonical apex sitemap and keeps private surfaces out of search', () => {
    const policy = robots();
    expect(policy.host).toBe('https://novanexus-ai.com');
    expect(policy.sitemap).toBe('https://novanexus-ai.com/sitemap.xml');
    expect(policy.rules).toEqual(expect.objectContaining({
      allow: '/',
      disallow: expect.arrayContaining(['/api/', '/dashboard/', '/ops/', '/world/']),
    }));
  });

  it('lists the working loop, paid pilot, and legal pages without private application routes', () => {
    const urls = sitemap().map(entry => entry.url);
    expect(urls).toEqual([
      'https://novanexus-ai.com',
      'https://novanexus-ai.com/loop',
      'https://novanexus-ai.com/services/workflow-setup',
      'https://novanexus-ai.com/privacy',
      'https://novanexus-ai.com/terms',
    ]);
    expect(urls.join('\n')).not.toMatch(/dashboard|ops|world|api/);
  });
});
