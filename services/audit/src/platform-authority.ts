interface AuditIdentity {
  role?: string;
  scopes?: readonly string[];
}

export function hasCrossOrgAuditAuthority(identity: AuditIdentity | null | undefined): boolean {
  return Boolean(identity?.scopes?.includes('ops.admin'));
}
