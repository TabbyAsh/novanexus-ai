# Auth Service Runbook

## Service Overview

The Auth service handles authentication, authorization, and policy management for Nova Hub.

**Port:** 3001
**Container:** nova-auth
**Dependencies:** PostgreSQL, Redis

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/auth/register | Register new user + org |
| POST | /v1/auth/login | Authenticate user |
| POST | /v1/auth/logout | Logout (event only) |
| POST | /v1/auth/refresh | Refresh access token |
| GET | /v1/me | Get current user info |
| GET | /v1/policies | List org policies |
| POST | /v1/policies | Create policy |
| POST | /internal/verify-token | Service-to-service token verification |
| POST | /internal/check-policy | Service-to-service policy check |
| GET | /health | Health check |

## Authentication Flow

### Registration
1. Validate email format and password strength
2. Check for existing user
3. Hash password with bcrypt (12 rounds)
4. Create user in transaction
5. Create organization
6. Assign OWNER role to user
7. Create default policies
8. Generate JWT token pair
9. Emit USER_CREATED event

### Login
1. Validate credentials
2. Check user status (must be ACTIVE)
3. Verify password
4. Get user's org membership
5. Generate JWT token pair
6. Emit USER_LOGIN event

## Token Management

**Access Token:** 15 minutes expiry
**Refresh Token:** 7 days expiry

Tokens contain:
- userId
- orgId
- role
- scopes
- type (access/refresh)

## Role Hierarchy

| Role | Description | Default Scopes |
|------|-------------|----------------|
| OWNER | Full access | * |
| ADMIN | Manage org | trade.*, store.*, admin.users |
| MEMBER | Standard user | trade.read, trade.paper.execute |
| VIEWER | Read-only | *.read |
| BOT | System automation | Varies by bot |

## Default Policies

Created on registration:
- OWNER: Allow * on *
- ADMIN: Allow trade.* on *
- ADMIN: Allow store.* on *
- MEMBER: Allow trade.read on *
- MEMBER: Allow trade.paper.execute on *
- VIEWER: Allow *.read on *

## Common Issues

### Issue: Token verification failing
**Symptoms:** 401 errors on authenticated endpoints
**Diagnosis:**
```bash
# Check if user exists and is active
psql $DATABASE_URL -c "SELECT id, email, status FROM users WHERE id = '<user_id>';"
```
**Resolution:** Check token expiry, verify JWT_SECRET matches

### Issue: Registration fails with conflict
**Symptoms:** 409 error on register
**Diagnosis:**
```bash
psql $DATABASE_URL -c "SELECT id, email FROM users WHERE LOWER(email) = LOWER('<email>');"
```
**Resolution:** User already exists, use login instead

### Issue: Policy check denying valid action
**Symptoms:** 403 errors despite having role
**Diagnosis:**
```bash
psql $DATABASE_URL -c "SELECT * FROM policies WHERE org_id = '<org_id>' AND subject_role = '<role>';"
```
**Resolution:** Verify policy exists with correct action pattern

## Monitoring

### Health Check
```bash
curl http://localhost:3001/health
```

### Key Metrics to Watch
- Login latency (p95 should be < 500ms)
- Registration success rate
- Token refresh frequency
- Failed auth attempts (rate limit threshold: 5/minute)

## Incident Response

### Kill Switch Activation
If auth service is compromised:
```sql
UPDATE system_state SET value_json = '{"enabled": true}' WHERE key = 'kill_switch';
```

### Rotate JWT Secret
1. Update JWT_SECRET in environment
2. All existing tokens will be invalidated
3. Users will need to re-authenticate

### Lock Specific User
```sql
UPDATE users SET status = 'SUSPENDED' WHERE id = '<user_id>';
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| JWT_SECRET | Yes | Secret for signing JWTs |
| REDIS_URL | No | Redis connection for sessions |
| PORT | No | Service port (default: 3001) |
