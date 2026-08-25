const securityText = [
  'Contact: mailto:hello@novanexus-ai.com',
  'Expires: 2027-08-24T23:59:59.000Z',
  'Preferred-Languages: en',
  'Canonical: https://novanexus-ai.com/.well-known/security.txt',
  '',
].join('\n');

export const dynamic = 'force-static';

export function GET() {
  return new Response(securityText, {
    headers: {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
