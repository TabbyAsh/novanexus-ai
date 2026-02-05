# ADR 0001: Technology Stack Selection

**Status:** Accepted
**Date:** 2026-01-20
**Decision Makers:** Engineering Team

## Context

Nova Hub requires a technology stack that supports:
- Event-sourced architecture with immutable audit logs
- Microservices for domain separation (trading, store, social, etc.)
- Real-time capabilities
- Rapid development with type safety
- Single-machine deployment first, cloud-ready later

## Decision

### Web Framework: Next.js 14
**Rationale:**
- Full-stack capabilities with API routes
- Server components for performance
- Large ecosystem and community
- TypeScript-first

### API Services: Express.js
**Rationale:**
- Lightweight and flexible
- Well-suited for microservices
- Easy integration with existing Node.js ecosystem
- Fast development cycle

### Database: PostgreSQL 16
**Rationale:**
- ACID compliance for financial data
- JSONB for flexible event payloads
- Excellent indexing for event queries
- Mature and battle-tested

### Cache/Pub-Sub: Redis 7
**Rationale:**
- Fast session storage
- Pub/sub for real-time events
- Rate limiting support
- Simple deployment

### Authentication: JWT + bcrypt
**Rationale:**
- Stateless authentication for microservices
- Industry-standard security
- Simple implementation
- No external auth service dependency

### Build System: Turborepo
**Rationale:**
- Monorepo management
- Build caching
- Parallel execution
- Native npm workspace support

### Infrastructure: Docker Compose
**Rationale:**
- Single-machine deployment
- Reproducible environments
- Easy local development
- Foundation for Kubernetes migration later

## Alternatives Considered

### Database: MongoDB
**Rejected because:** ACID compliance needed for financial operations

### Auth: Auth0/Clerk
**Rejected because:** Cost at scale, vendor lock-in, want full control of auth data

### Framework: NestJS
**Rejected because:** More boilerplate, existing Express services work well

## Consequences

### Positive
- Type safety across the stack
- Fast development iteration
- Easy local development
- Clear service boundaries

### Negative
- Manual microservice orchestration
- No built-in distributed tracing (added via telemetry lib)
- Requires Docker for full environment

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Event Sourcing Patterns](https://www.postgresql.org/docs/)
