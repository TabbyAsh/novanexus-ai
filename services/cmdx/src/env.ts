// ============================================================================
// Sandbox environment discipline.
//
// Rule: sandboxes get NOTHING by default. An agent may request env vars by
// name (envRefs); only names on SANDBOX_ENV_ALLOWLIST resolve. Every other
// request is stripped and recorded as a violation (auditable signal).
// Secrets therefore cannot pass through CmdX into a sandbox, full stop.
// ============================================================================

/** Mirrors sandbox_env_allowlist in nova.constraints.yaml (human-owned). */
export const SANDBOX_ENV_ALLOWLIST: readonly string[] = [
  'NODE_ENV',
  'CI',
  'TZ',
  'LANG',
  'NPM_CONFIG_REGISTRY',
  'SANDBOX_DATABASE_URL',
  'SANDBOX_REDIS_URL',
  'TURBO_TELEMETRY_DISABLED',
  'NEXT_TELEMETRY_DISABLED',
];

export interface SandboxEnvResult {
  /** The environment that may be injected into the sandbox. */
  env: Record<string, string>;
  /** Requested names that were refused (audited, surfaced on the record). */
  violations: string[];
}

export function buildSandboxEnv(
  envRefs: string[],
  resolve: (name: string) => string | undefined = (name) => process.env[name]
): SandboxEnvResult {
  const env: Record<string, string> = {};
  const violations: string[] = [];
  const allow = new Set(SANDBOX_ENV_ALLOWLIST);

  for (const name of envRefs) {
    if (!allow.has(name)) {
      violations.push(name);
      continue;
    }
    const value = resolve(name);
    if (value !== undefined && value !== '') {
      env[name] = value;
    }
  }
  return { env, violations };
}

/** Env-var NAMES considered secret-bearing for log redaction purposes. */
export const SECRET_NAME_PATTERN =
  /(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|API_KEY|_KEY$)/i;

const ALWAYS_REDACT_NAMES = new Set(['DATABASE_URL', 'REDIS_URL', 'FORGE_GIT_TOKEN']);

/**
 * Redact secret VALUES from arbitrary text (stdout/stderr/log lines) by
 * scanning the broker's own environment for secret-named vars and masking
 * their values wherever they appear.
 */
export function redactSecrets(
  text: string,
  envSource: Record<string, string | undefined> = process.env
): string {
  let out = text;
  for (const [name, value] of Object.entries(envSource)) {
    if (!value || value.length < 6) continue; // short values would over-redact
    if (SECRET_NAME_PATTERN.test(name) || ALWAYS_REDACT_NAMES.has(name)) {
      out = out.split(value).join(`[REDACTED:${name}]`);
    }
  }
  return out;
}
