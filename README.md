# Nova Enterprises

**The AI-Orchestrated Universal Life-and-Business Operating System**

Nova is a platform that merges trading, e-commerce, and content distribution into a single system where every action produces data, every data point improves the AI, and every improved decision increases profitability.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (via Docker)

### Development Setup

```bash
# Clone and install dependencies
git clone <repo-url>
cd nova-enterprises
npm install

# Start infrastructure (Postgres, Redis, MinIO)
docker-compose up -d postgres redis minio

# Run database migrations
npm run db:migrate

# Start development servers
npm run dev
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

| Bot | Purpose | Port |
|-----|---------|------|
| TradeBot | Market scanning, backtesting, paper trading | 3010 |
| StoreBot | Product sourcing, pricing, order management | 3011 |
| SocialBot | Content planning, scheduling, analytics | 3012 |
| ResearchBot | Knowledge base, learning, proposals | 3013 |
| OpsBot | System health, deployments | 3014 |
| ForgeBot | Code improvement (gated) | 3015 |

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

**Nova Enterprises** - Where time becomes leverage.
