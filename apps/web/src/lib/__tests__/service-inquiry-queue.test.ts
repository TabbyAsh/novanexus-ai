jest.mock('server-only', () => ({}), { virtual: true });
import { readServiceInquiryQueue } from '../service-inquiry-queue.server';

const owner = { success: true, data: { user: { id: 'owner-test', email: 'owner@example.test', status: 'ACTIVE' }, scopes: ['ops.admin'] } };
const row = {
  receipt_id: 'svc_123456789012345678901234', service_code: 'MERCHANDISE_SOURCING',
  name: 'Example Buyer', email: 'buyer@example.test', business: 'Example Company',
  challenge: 'Please compare sources for an upcoming cotton shirt order.', status: 'RECEIVED',
  operator_email_status: 'PENDING', confirmation_email_status: 'PENDING', payment_status: 'NOT_STARTED',
  created_at: '2026-10-27T12:00:00Z', details: { quantity: '100 shirts' },
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('private service inquiry queue', () => {
  it('does not read records without a verified owner session', async () => {
    const request = jest.fn();
    expect(await readServiceInquiryQueue(undefined, 'https://backend.example', request)).toEqual({ ok: false, status: 401 });
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(response({ success: true, data: { ...owner.data, scopes: [] } }));
    expect(await readServiceInquiryQueue('ordinary-user', 'https://backend.example', request)).toEqual({ ok: false, status: 403 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('forwards only the existing owner token and disables caching for both reads', async () => {
    const request = jest.fn().mockResolvedValueOnce(response(owner)).mockResolvedValueOnce(response({ success: true, data: { inquiries: [row], count: 1 } }));
    expect(await readServiceInquiryQueue('owner-session', 'https://backend.example', request)).toEqual({ ok: true, inquiries: [row] });
    expect(String(request.mock.calls[1][0])).toBe('https://backend.example/v1/admin/service-inquiries?limit=50');
    for (const [, options] of request.mock.calls) expect(options).toMatchObject({ cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer owner-session' } });
  });
  it('keeps backend failure and malformed payloads distinct from an empty queue', async () => {
    for (const second of [response({}, 503), response({ success: true, data: {} }), response({ success: true, data: { inquiries: [{ ...row, details: { secret: { nested: true } } }] } })]) {
      const request = jest.fn().mockResolvedValueOnce(response(owner)).mockResolvedValueOnce(second);
      expect(await readServiceInquiryQueue('owner-session', 'https://backend.example', request)).toEqual({ ok: false, status: 503 });
    }
  });
});
