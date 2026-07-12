import { getDefaultScopes } from '@nova/shared';
import type { Scope, UserRole } from '@nova/shared';

const PLATFORM_SCOPES = new Set<Scope>([
  'forge.read', 'forge.propose', 'forge.approve',
  'forge.cmd.t0', 'forge.cmd.t1', 'forge.cmd.t2', 'forge.cmd.t3',
  'ops.read', 'ops.deploy', 'ops.admin',
  'admin.users', 'admin.billing', 'admin.killswitch', 'admin.audit',
]);

export function configuredPlatformOwnerEmails(): Set<string> {
  return new Set(
    [process.env.PLATFORM_OWNER_EMAILS, process.env.OWNER_EMAIL]
      .filter(Boolean)
      .flatMap(value => String(value).split(','))
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function scopesForIdentity(
  role: UserRole,
  email: string,
  platformOwnerEmails = configuredPlatformOwnerEmails(),
): Scope[] {
  const defaults = getDefaultScopes(role);
  if (platformOwnerEmails.has(email.trim().toLowerCase())) return defaults;
  return defaults.filter(scope => !PLATFORM_SCOPES.has(scope));
}
