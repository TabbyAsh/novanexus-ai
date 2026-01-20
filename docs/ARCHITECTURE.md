# Nova Platform Architecture

## Overview

Nova is an AI-orchestrated platform that unifies trading, e-commerce, and content creation into a single system. The architecture follows a microservices pattern with an event-sourced backbone.

## System Layers

### 1. User Layer (Nova Hub)
- **Web App**: Next.js dashboard for user interaction
- **Admin Console**: Policy management and kill switch controls

### 2. AI Orchestration Layer (NovaCore)
The brain of the platform that:
- Routes goals to specialized bots
- Maintains priorities and constraints
- Tracks outcomes and updates playbooks
- Enforces safety and kill-switch

### 3. Specialized Bot Layer
Each bot is a service with its own tools, memory, KPIs, and permissions:
- **TradeBot**: Scanning, backtesting, alerts, paper/live trading
- **StoreBot**: Product sourcing, listing optimization, pricing
- **SocialBot**: Content generation, scheduling, engagement
- **ResearchBot**: Knowledge base, learning, proposals
- **OpsBot**: System health, deployments, monitoring
- **ForgeBot**: Code improvement proposals (gated)

### 4. Data Layer
- **Operational DB**: Postgres for users, settings, state
- **Event Stream**: Append-only event log with hash chain
- **Time-series**: Market candles and metrics
- **Object Storage**: Media, reports, exports (MinIO/S3)
- **Vector Store**: Knowledge and memory retrieval

### 5. Execution Layer
Three automation modes:
- **Recommend**: AI suggests, user decides (default)
- **Assist**: AI drafts, user confirms
- **Automate**: AI executes under policy

### 6. Governance Layer
- Risk limits and permissions
- Audit trails (immutable)
- Human override and kill-switch
- Versioned strategy approval pipeline

## Service Architecture

```
                    ┌─────────────────┐
                    │    Gateway      │
                    │   (Port 3000)   │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌─────▼─────┐       ┌────▼────┐
    │  Auth   │        │Orchestrator│       │EventBus │
    │ (3001)  │        │  (3002)   │       │ (3003)  │
    └─────────┘        └─────┬─────┘       └─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌─────▼─────┐       ┌────▼────┐
    │TradeBot │        │ StoreBot  │       │SocialBot│
    │ (3010)  │        │  (3011)   │       │ (3012)  │
    └─────────┘        └───────────┘       └─────────┘
```

## Data Flow

### Goal Execution Flow
1. User creates goal via Hub
2. Gateway routes to Orchestrator
3. Orchestrator generates task plan
4. Tasks dispatched to appropriate bots
5. Bots emit events to EventBus
6. Results aggregated and returned

### Event Chain
All actions produce immutable events with cryptographic hash chain:
```
Event N: hash = SHA256(prev_hash + payload + type + ts + actor)
```

## Key Design Principles

1. **Event-sourced by default**: Every action emits an immutable event
2. **Permissioned autonomy**: AI executes only via explicit policy
3. **Auditability**: Every decision is explainable from logs
4. **Safety first**: Global kill-switch halts all automation
5. **Version everything**: Strategies, prompts, models, code patches

## Security Model

- Zero-trust authentication with JWT
- Token scopes per action
- Append-only audit logs
- Policy engine for fine-grained access
- Secrets vault for credentials
- Circuit breakers per bot

## Infrastructure

### Development
- Docker Compose for local development
- Postgres, Redis, MinIO

### Production (Future)
- Kubernetes/ECS deployment
- Managed Postgres (RDS/Cloud SQL)
- Redis Cluster
- S3 for object storage
