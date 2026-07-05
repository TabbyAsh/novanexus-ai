import { buildSandboxEnv, redactSecrets, SANDBOX_ENV_ALLOWLIST } from '../env';

describe('buildSandboxEnv — secrets never reach a sandbox', () => {
  const brokerEnv: Record<string, string> = {
    JWT_SECRET: 'super-secret-jwt-value',
    STRIPE_SECRET_KEY: 'sk_live_deadbeefdeadbeef',
    OPENAI_API_KEY: 'sk-openai-abc123456789',
    DATABASE_URL: 'postgresql://nova:pw@prod-db:5432/nova',
    FORGE_GIT_TOKEN: 'ghp_tokentokentoken123',
    NODE_ENV: 'test',
    SANDBOX_DATABASE_URL: 'postgresql://sandbox@sandbox-db:5432/nova',
  };
  const resolve = (name: string) => brokerEnv[name];

  it('refuses every known secret name, recording each as a violation', () => {
    const secretNames = [
      'JWT_SECRET',
      'STRIPE_SECRET_KEY',
      'OPENAI_API_KEY',
      'DATABASE_URL',
      'FORGE_GIT_TOKEN',
    ];
    const { env, violations } = buildSandboxEnv(secretNames, resolve);
    expect(env).toEqual({});
    for (const name of secretNames) {
      expect(violations).toContain(name);
    }
  });

  it('resolves only allowlisted names', () => {
    const { env, violations } = buildSandboxEnv(
      ['NODE_ENV', 'SANDBOX_DATABASE_URL', 'JWT_SECRET'],
      resolve
    );
    expect(env.NODE_ENV).toBe('test');
    expect(env.SANDBOX_DATABASE_URL).toBe('postgresql://sandbox@sandbox-db:5432/nova');
    expect(env.JWT_SECRET).toBeUndefined();
    expect(violations).toEqual(['JWT_SECRET']);
  });

  it('never leaks a real secret even if its name is allowlisted-adjacent', () => {
    // Attacker tries lowercase / suffix tricks — must not match allowlist.
    const { env, violations } = buildSandboxEnv(
      ['node_env', 'SANDBOX_DATABASE_URL_EVIL', 'DATABASE_URL'],
      resolve
    );
    expect(Object.keys(env)).not.toContain('DATABASE_URL');
    expect(violations).toEqual(
      expect.arrayContaining(['node_env', 'SANDBOX_DATABASE_URL_EVIL', 'DATABASE_URL'])
    );
  });

  it('the allowlist contains no secret-bearing names', () => {
    for (const name of SANDBOX_ENV_ALLOWLIST) {
      expect(name).not.toMatch(/SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE|JWT|STRIPE|OPENAI/i);
    }
  });
});

describe('redactSecrets — secret values masked in logs', () => {
  const brokerEnv = {
    JWT_SECRET: 'super-secret-jwt-value',
    FORGE_GIT_TOKEN: 'ghp_tokentokentoken123',
    DATABASE_URL: 'postgresql://nova:pw@prod-db:5432/nova',
    NODE_ENV: 'test', // short & non-secret: must NOT be redacted
  };

  it('masks secret values that appear in output text', () => {
    const leaked = 'error: token ghp_tokentokentoken123 rejected by prod-db';
    const out = redactSecrets(leaked, brokerEnv);
    expect(out).not.toContain('ghp_tokentokentoken123');
    expect(out).toContain('[REDACTED:FORGE_GIT_TOKEN]');
  });

  it('masks JWT secret and DB URL', () => {
    const leaked = 'cfg JWT=super-secret-jwt-value db=postgresql://nova:pw@prod-db:5432/nova';
    const out = redactSecrets(leaked, brokerEnv);
    expect(out).not.toContain('super-secret-jwt-value');
    expect(out).not.toContain('prod-db:5432');
  });

  it('does not redact short non-secret values like NODE_ENV', () => {
    const text = 'running in test mode';
    expect(redactSecrets(text, brokerEnv)).toBe(text);
  });
});
