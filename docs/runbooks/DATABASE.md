# Database Runbook

## Overview

Nova Hub uses PostgreSQL 16 as the primary database, running in Docker Compose.

**Container:** nova-postgres
**Port:** 5432
**Default Database:** nova
**Default User:** nova

## Schema Overview

### Identity & Permissions
- `users` - User accounts
- `orgs` - Organizations
- `org_members` - User-org membership with roles
- `policies` - RBAC policies
- `api_keys` - API key storage

### Event Sourcing
- `events` - Immutable event log with hash chain
- `subscriptions` - Event consumers tracking

### Orchestrator
- `goals` - User goals/intents
- `tasks` - Bot tasks
- `approvals` - Human-in-the-loop approvals

### Domain Tables
- Trading: `watchlists`, `watchlist_items`, `signals`, `paper_trades`, `strategies`
- Store: `products`, `listings`, `orders`, `order_events`
- Social: `content_items`, `content_schedule`, `content_metrics`
- Research: `kb_docs`, `proposals`

### System
- `system_state` - Global config (kill switch, etc.)

## Connection

### Local Development
```bash
# Via Docker
docker exec -it nova-postgres psql -U nova

# Via psql
psql postgresql://nova:nova_dev_password@localhost:5432/nova
```

### Connection String Format
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

## Migrations

### Run Migrations
```bash
npm run db:migrate
```

### Migration Files Location
```
infra/migrations/
├── 001_initial_schema.sql
└── ...
```

### Create New Migration
```bash
# Naming convention: NNN_description.sql
touch infra/migrations/002_add_billing_tables.sql
```

## Common Operations

### Backup
```bash
# Full backup
docker exec nova-postgres pg_dump -U nova nova > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
docker exec nova-postgres pg_dump -U nova -Fc nova > backup.dump
```

### Restore
```bash
# From SQL file
docker exec -i nova-postgres psql -U nova nova < backup.sql

# From dump file
docker exec -i nova-postgres pg_restore -U nova -d nova < backup.dump
```

### Reset Database
```bash
# Stop containers, remove volumes, restart
docker compose down -v
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

## Useful Queries

### Check User Count
```sql
SELECT COUNT(*) FROM users;
```

### List Recent Events
```sql
SELECT id, type, actor_type, ts 
FROM events 
ORDER BY ts DESC 
LIMIT 20;
```

### Verify Event Chain Integrity
```sql
WITH chain AS (
  SELECT 
    id, 
    hash, 
    prev_hash,
    LAG(hash) OVER (PARTITION BY org_id ORDER BY ts) as expected_prev
  FROM events
)
SELECT * FROM chain WHERE prev_hash != expected_prev AND expected_prev IS NOT NULL;
```

### Check Kill Switch Status
```sql
SELECT value_json FROM system_state WHERE key = 'kill_switch';
```

### List Policies for Org
```sql
SELECT subject_role, action, resource, effect 
FROM policies 
WHERE org_id = '<org_id>';
```

## Performance

### Key Indexes
- `idx_events_org_id` - Event queries by org
- `idx_events_type` - Event filtering by type
- `idx_events_ts` - Timeline queries
- `idx_events_actor` - Actor-based queries
- `idx_signals_symbol` - Trading signal lookups

### Monitor Slow Queries
```sql
-- Enable logging (in postgresql.conf or via command)
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();
```

### Connection Pool Settings
Recommended for production:
- min: 2
- max: 10
- idleTimeoutMillis: 30000

## Incident Response

### Database Unreachable
1. Check container status: `docker ps | grep postgres`
2. Check logs: `docker logs nova-postgres`
3. Restart: `docker compose restart postgres`

### High CPU/Memory
1. Check active connections: `SELECT count(*) FROM pg_stat_activity;`
2. Kill long-running queries:
```sql
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE duration > interval '5 minutes';
```

### Data Corruption Suspected
1. Activate kill switch immediately
2. Stop write operations
3. Take backup before investigation
4. Verify event chain integrity (query above)

## Environment Variables

| Variable | Example | Description |
|----------|---------|-------------|
| POSTGRES_USER | nova | Database user |
| POSTGRES_PASSWORD | nova_dev_password | Database password |
| POSTGRES_DB | nova | Database name |

## Maintenance

### Vacuum (run weekly)
```sql
VACUUM ANALYZE;
```

### Check Table Sizes
```sql
SELECT 
  relname as table,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```
