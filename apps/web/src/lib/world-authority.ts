export const WORLD_CONTROL_SCOPE = 'ops.admin';

export function hasWorldAuthority(scopes: readonly string[] | null | undefined): boolean {
  return Boolean(scopes?.includes(WORLD_CONTROL_SCOPE));
}
