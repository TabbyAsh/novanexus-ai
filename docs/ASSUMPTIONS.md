# Assumptions

This document records assumptions made during development of Nova Hub.

## Runtime Environment

1. **Windows 10/11**: Primary target OS. PowerShell 5.1+ available.
2. **Python 3.11+**: Required for backend services.
3. **Node.js 18+**: Required for frontend build.
4. **Docker Desktop**: Optional, required only for `docker` mode.
5. **Ports**: 8000 (API) and 5173 (Web UI) are available. Scripts fail fast if occupied.

## Database

1. **SQLite** (nodocker mode): Single-file database, adequate for single-user/small-team use.
2. **PostgreSQL 15+** (docker mode): Used when Docker is available.
3. **Append-only enforcement**: Implemented via database triggers. Assumes trigger execution is synchronous and reliable.
4. **Advisory locks** (Postgres) / **lock table** (SQLite): Used for single-writer-per-org guarantee.

## Authentication & Security

1. **Single-tenant by default**: Phase 1 assumes one organization.
2. **Local deployment**: CORS locked to localhost origins.
3. **Server-side sessions**: Using HttpOnly cookies with CSRF protection (chosen over JWT for better security posture).
4. **Password hashing**: Using bcrypt with default work factor.
5. **No external auth providers**: Phase 1 uses local username/password only.

## Time & Determinism

1. **Clock abstraction**: All time-dependent code uses injectable clock. Tests freeze time.
2. **Org timezone**: Stored per-org; daily budget boundaries calculated in org timezone.
3. **UUIDv7**: Using `uuid7` package for time-ordered IDs. Seeded for deterministic tests.
4. **Random seeding**: All randomness (e.g., in simulations) uses seeded generators for reproducibility.

## External Services

1. **No real external APIs**: All external services (exchanges, payment processors, social platforms) are simulated locally.
2. **Simulators preserve interfaces**: Mock implementations match expected API contracts.
3. **Offline operation**: All functionality works without internet connectivity.

## Event Sourcing

1. **Canonical JSON**: Using RFC 8785 JCS-style canonicalization (sorted keys, no whitespace, UTF-8).
2. **Hash chain**: SHA-256 of `prev_hash + "\n" + canonical(header) + "\n" + canonical(payload)`.
3. **Decimal handling**: All financial amounts stored as string-formatted decimals (e.g., "123.45") to avoid float precision issues.
4. **No NaN/Infinity**: JSON payloads never contain these values.

## Governance

1. **Default-deny for real actions**: `no_real_money: true` and `automation_allowed: false` by default.
2. **Approval expiry**: All approvals have explicit expiry timestamps.
3. **ARM toggle**: Separate from approval; provides additional time-limited gate.
4. **Kill switch**: Global flag that immediately blocks all AUTOMATE mode tasks.

## Bots

1. **TradeBot**: Uses OHLCV CSV data. No real exchange connectivity. Paper trading only by default.
2. **StoreBot**: Simulates e-commerce operations. No real payment processing.
3. **SocialBot**: Content drafting and calendar. No real social media posting.
4. **OpsBot**: Database backup/restore. Operates on local data only.

## Testing

1. **Deterministic**: All tests use frozen time, seeded randomness, fixed IDs.
2. **Playwright preferred**: For UI smoke tests. Falls back to Vitest+RTL if Playwright unavailable.
3. **Offline**: All tests pass without network access.
4. **Secret scanning**: CI tests scan for accidental secret commits.

## Demo Data

1. **Fixed IDs**: Demo users/orgs have stable UUIDs documented in RUNBOOK.md.
2. **Demo credentials**: Documented and intended for local development only.
3. **Sample data**: Includes sample OHLCV data, products, content templates.

## Phase 2+ Features (Scaffolded Only)

1. **OIDC**: Interface defined but not implemented.
2. **Connectors**: Plugin architecture exists but no real connectors ship.
3. **Multi-tenancy**: Database schema supports it; API assumes single org.
4. **Swarm mode**: Task queue designed for distributed workers; ships with local worker only.

## Limitations Accepted

1. **No mobile optimization**: UI designed for desktop.
2. **English only**: No i18n in Phase 1.
3. **Single timezone per org**: Users see times in org timezone.
4. **No email notifications**: All notifications are in-app only.
