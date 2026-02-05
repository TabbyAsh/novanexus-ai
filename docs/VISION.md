# Nova Enterprises Vision

## The Governed Automation OS ("Company-in-a-Box")

Nova Enterprises is a platform for building, operating, and iterating on **governed automation workflows**. It transforms manual, repetitive business tasks into measurable, auditable, improvable processes.

## Core Philosophy

### Generate Income via Repeatable Workflows
- **No promises of profit** - we provide tools, not guarantees
- Build workflows that can be measured, exported, and improved
- Start with paper trading, simulated orders, draft content
- Graduate to real actions only with explicit governance gates

### Turn Actions → Data → Improvements
Every action in Nova produces structured events:
- What was attempted
- What inputs were used
- What the outcome was
- How long it took
- What governance checks were applied

This data enables:
- Backtesting strategies against historical data
- A/B testing workflow variations
- Identifying bottlenecks and failure modes
- Continuous improvement cycles

### Compounding Capability
Each iteration improves the system:
- Better indicators from historical analysis
- Refined policies from observed outcomes
- Improved templates from successful patterns
- Accumulated institutional knowledge in events

## Ethos: Teach / Guide / Unite

### Teach
- Every action is explainable
- Decisions show their reasoning (thesis, checklist, scoring)
- New users learn by observing governed automation

### Guide
- Start in RECOMMEND mode (suggestions only)
- Graduate to ASSIST mode (human approves each action)
- Only AUTOMATE after proven track record
- Kill switch always available

### Unite
- Single source of truth (event log)
- Shared policies across team
- Audit trail for compliance
- Export/replay for knowledge transfer

## Scaling Path

### Phase 1: Single PC (Ships Now)
- Nova Hub UI for one user/team
- Local SQLite or Docker Postgres
- 4 core bots: Trade, Store, Social, Ops
- Full governance and audit

### Phase 2: SaaS (Scaffolded)
- Multi-tenant cloud deployment
- OIDC authentication
- Team collaboration features
- Connector marketplace

### Phase 3: Swarm/Hardware (Future)
- Distributed worker pools
- Hardware integrations (fulfillment, IoT)
- Cross-organization collaboration
- Federated event sharing

## Safety by Design

### No Real Spend by Default
- `no_real_money: true` is the default policy
- Paper trading, order simulation, draft content
- Real actions require: env flag + policy + approval + ARM toggle

### Defense in Depth
1. **Environment**: `NOVA_ALLOW_REAL_ACTIONS=false` default
2. **Policy**: Org-level rules with version history
3. **Approval**: Human sign-off with expiry
4. **ARM Toggle**: Time-limited enablement (expires)
5. **Kill Switch**: Instant global halt

### Audit Everything
- Append-only event log (enforced at DB level)
- Tamper-evident hash chain
- Export and verify externally
- Replay into clean DB for validation

## What Nova Hub Is NOT

- **Not a black box**: Every decision is traceable
- **Not autonomous AI**: Human governance at every level
- **Not financial advice**: Tools for your own strategy
- **Not a get-rich-quick scheme**: Infrastructure for disciplined operation

## Success Metrics

Users should measure their own success by:
- Workflow completion rates
- Time saved vs manual processes
- Error rates before/after automation
- Governance compliance (denials logged)
- Knowledge captured in events

Nova provides the instrumentation. Users provide the strategy and judgment.
