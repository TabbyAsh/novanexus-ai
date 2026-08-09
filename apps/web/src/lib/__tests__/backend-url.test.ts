import { resolveBackendUrl } from '../backend-url';

describe('backend environment isolation', () => {
  it('uses an explicitly configured backend and normalizes trailing slashes', () => {
    expect(resolveBackendUrl({ backendUrl: 'https://api.example.test///', nodeEnv: 'production' }))
      .toBe('https://api.example.test');
  });

  it('uses localhost only for local development', () => {
    expect(resolveBackendUrl({ backendUrl: '', nodeEnv: 'development' }))
      .toBe('http://localhost:3000');
  });

  it('fails closed for an unconfigured deployed environment', () => {
    expect(resolveBackendUrl({ backendUrl: '', nodeEnv: 'production' })).toBeNull();
    expect(resolveBackendUrl({ backendUrl: '', nodeEnv: 'test' })).toBeNull();
  });
});
