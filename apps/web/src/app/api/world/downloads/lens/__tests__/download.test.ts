jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/world/session.server', () => ({ readWorldSession: jest.fn() }));
import { createHash } from 'crypto';
import { readWorldSession } from '@/lib/world/session.server';
import { GET } from '../route';
const session = readWorldSession as jest.Mock;
describe('private Lens package', () => {
  it.each([401,403,503])('withholds all archive bytes when access fails (%s)', async status => {
    session.mockResolvedValue({ ok: false, status });
    const response = await GET();
    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.text()).not.toContain('UEsDB');
  });
  it('serves the exact ZIP bytes only after verification', async () => {
    session.mockResolvedValue({ ok: true, identity: { id: 'owner-1' } });
    const response = await GET();
    const data = Buffer.from(await response.arrayBuffer());
    expect(data.subarray(0,2).toString()).toBe('PK');
    expect(createHash('sha256').update(data).digest('hex')).toBe(response.headers.get('x-content-sha256'));
    expect(response.headers.get('content-disposition')).toContain('Nova-Lens-0.2.2.zip');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
