import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

describe('canonical host proxy', () => {
  it('redirects www to the HTTPS apex while preserving path and query', () => {
    const response = proxy(new NextRequest('https://www.novanexus-ai.com/services/workflow-setup?source=pilot'));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://novanexus-ai.com/services/workflow-setup?source=pilot');
  });

  it('does not redirect the apex host', () => {
    const response = proxy(new NextRequest('https://novanexus-ai.com/loop'));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
