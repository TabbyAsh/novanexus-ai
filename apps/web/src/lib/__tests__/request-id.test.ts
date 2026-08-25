import { isSafeRequestId, requestIdFor } from '../request-id';

describe('first-party request correlation', () => {
  it('preserves a bounded opaque request id', () => {
    expect(isSafeRequestId('req_01HZX3M2QX9Y2K7P')).toBe(true);
    expect(requestIdFor('req_01HZX3M2QX9Y2K7P', () => 'generated')).toBe('req_01HZX3M2QX9Y2K7P');
  });

  it('replaces malformed or log-injection values without collecting user data', () => {
    expect(requestIdFor('bad\r\nforged-header: value', () => 'generated-opaque-id')).toBe('generated-opaque-id');
    expect(requestIdFor('short', () => 'generated-opaque-id')).toBe('generated-opaque-id');
    expect(requestIdFor(null, () => 'generated-opaque-id')).toBe('generated-opaque-id');
  });
});
