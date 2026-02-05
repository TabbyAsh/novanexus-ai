# Nova Hub Security

## Security Posture

Nova Hub is designed with **safety-by-default**:

1. **No real money operations** enabled by default
2. **No automation** enabled by default  
3. **All actions logged** as immutable events
4. **Kill switch** for immediate halt

## Authentication

### Server-Side Sessions
- Session tokens: 32-byte random, stored as SHA-256 hash
- Cookies: HttpOnly, SameSite=Lax
- CSRF tokens: Required for all mutations
- Session expiry: 24 hours (configurable)

### Password Security
- Hashing: bcrypt with default cost factor
- Lockout: 5 failed attempts triggers 15-minute lockout
- Rate limiting: 10 attempts per minute per IP

## Authorization (RBAC)

| Role     | Capabilities |
|----------|-------------|
| admin    | Full access: kill switch, ARM, policy, approvals, tasks |
| operator | Create/manage tasks, view governance |
| viewer   | Read-only: view tasks, events, governance |

All authorization enforced server-side.

## Data Protection

### Events Table
- **Append-only**: Database triggers prevent UPDATE/DELETE
- **Hash chain**: Each event includes hash of previous event
- **Tamper-evident**: Chain verification available via API

### Secrets
- **No secrets in repo**: Use `.env` for configuration
- **Secret scanning**: CI tests scan for accidental commits
- **API keys**: External service keys are optional (all simulators)

## Governance Gates

Real financial actions require ALL gates:

```
Gate 1: NOVA_ALLOW_REAL_ACTIONS=true (environment)
Gate 2: no_real_money=false (policy)
Gate 3: Valid approval record (database)
Gate 4: ARM toggle enabled (time-limited)
Gate 5: Specific action code (implementation)
```

## Network Security

### CORS
- Locked to localhost in Phase 1
- Configurable via `CORS_ORIGINS` env var

### TLS
- Not included in development
- **Required for production** - use reverse proxy

## Reporting Vulnerabilities

Please report security issues to security@nova-enterprises.local (placeholder).

Do not create public issues for security vulnerabilities.
