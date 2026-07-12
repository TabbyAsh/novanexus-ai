# Nova / Nexus

![CI](https://github.com/TabbyAsh/novanexus-ai/actions/workflows/ci.yml/badge.svg)

**The interaction company for the realization of AI potential**

**Nova** is the cumulative realization of useful AI potential: intelligence,
tools, agents, income engines, research, memory, and their composition into new
capabilities. **Nexus** is the company and interaction engine through which
humans express intent, grant authority, access Nova, understand results, and
return outcomes. Market, Bazaar, Social, Forge, World, and future sectors are
manifestations of Nova through Nexus.

Start with the [Nova operating model](docs/NOVA_OPERATING_MODEL.md) for the
canonical ontology, the [Nexus Interaction Engine](docs/NEXUS_INTERACTION_ENGINE.md)
for the executable human-to-Nova contract, and [system status](SYSTEM_STATUS.md)
for the verified runtime boundary.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (via Docker)

### Development Setup

```bash
# Clone and install dependencies
git clone https://github.com/TabbyAsh/novanexus-ai.git
cd nova-enterprises
npm install

# Start full stack (deterministic, no manual steps)
npm run dev:all

# Or via Makefile
make dev

# No-docker fallback (development only)
npm run dev:nodocker
# or
npm run dev:all -- --no-docker
```

`dev:all` bootstraps `.env.dev`, starts the MVP Docker stack, runs migrations, and waits for readiness.
Before starting Docker Compose, it verifies Docker Engine is reachable. If not, it exits with:
"Start Docker Desktop and wait until Engine is running."

`dev:nodocker` starts a reduced core stack (gateway, nova-hub, tradebot, web) via local processes and sets
`STACK_PROFILE=core` for verification. This requires local Postgres + Redis (and `psql`) to be running.

Expected output includes:

```
✓ NOVA MVP READY
```

### Verification (Deterministic)

```bash
# Run health + internal verification checks (includes readiness wait)
npm run verify

# Or via Makefile
make verify
```

If readiness fails, a status table lists exact URLs, connection results, and likely causes.

Expected output includes:

```
PASS: Verification complete.
```

### Environment Configuration

Copy `.env.example` to `.env` and configure your settings:

```bash
cp .env.example .env
```

## 📁 Project Structure

```
nova/
├── apps/
│   └── web/                 # Next.js dashboard
├── services/
│   ├── gateway/             # API gateway
│   ├── auth/                # Authentication
│   ├── orchestrator/        # NovaCore brain
│   ├── eventbus/            # Event sourcing
│   ├── tradebot/            # Trading bot
│   ├── storebot/            # E-commerce bot
│   ├── socialbot/           # Content bot
│   └── marketdata/          # Market data service
├── libs/
│   ├── shared/              # Shared types & utils
│   ├── policy/              # Permission engine
│   ├── eventing/            # Event contracts
│   └── telemetry/           # Logging & tracing
├── infra/
│   ├── migrations/          # Database schemas
│   └── terraform/           # IaC (future)
└── docs/
    ├── ARCHITECTURE.md
    └── ADRs/
```

## 🤖 Platform Components

### Specialized Bots

| Bot | Purpose | Port | Runtime status |
|-----|---------|------|----------------|
| TradeBot | Market scanning, backtesting, paper trading | 3010 | Production contract |
| StoreBot | Product sourcing, pricing, order management | 3011 | Production contract |
| SocialBot | Content planning, scheduling, analytics | 3012 | Production contract |
| ResearchBot | Knowledge base, learning, proposals | 3013 | Reserved; not implemented |
| OpsBot | System health and operational visibility | 3014 | Production contract |
| ForgeBot | Code improvement (gated) | 3015 | Control-plane work; not in Railway runtime |

### Core Services

| Service | Purpose | Port |
|---------|---------|------|
| Gateway | API routing, rate limiting | 3000 |
| Auth | Authentication, policies | 3001 |
| Orchestrator | Goal → task routing | 3002 |
| EventBus | Event sourcing | 3003 |

## 🔐 Safety & Governance

- **Kill Switch**: Instantly disable all automation
- **Approval Gates**: Human oversight for critical actions
- **Audit Trail**: Immutable event log with hash chain
- **Policy Engine**: Fine-grained permission control

## 📊 Automation Modes

1. **Recommend** (default): AI suggests, user decides
2. **Assist**: AI drafts, user confirms
3. **Automate**: AI executes under policy constraints

## 🧪 Development

```bash
# Run tests
npm run test

# Lint code
npm run lint

# Build all packages
npm run build
```

## 🚢 Deployment

```bash
# Build Docker images
make docker-build

# Deploy with Docker Compose
make docker-up

# View logs
make docker-logs
```

## 📚 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](docs/api/)
- [Architecture Decision Records](docs/ADRs/)

## 🎯 Vision

Use profits and platform credibility to build:
1. Failure Analysis / Reliability capability
2. Chip and advanced compute R&D
3. Hardware embodiments (watch/AR assistant, edge bots)

---

**Nexus** — where human purpose and Nova's potential become reality.
