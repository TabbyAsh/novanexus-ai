# Nova Data Contracts

## Event Taxonomy

All events follow this schema:

```typescript
interface NovaEvent {
  id: string;           // UUID v4
  orgId: string;        // Organization UUID
  actorType: 'USER' | 'BOT' | 'SYSTEM';
  actorId: string;      // User/Bot/System UUID
  type: string;         // Event type from taxonomy below
  ts: string;           // ISO 8601 timestamp
  requestId: string;    // Correlation ID from gateway
  payload: object;      // Event-specific data
  prevHash: string;     // SHA256 of previous event
  hash: string;         // SHA256(prevHash + canonical(payload) + type + ts + actorType + actorId)
}
```

### Event Types

#### System Events
- `system.startup` - Service started
- `system.shutdown` - Service stopped
- `system.killswitch.enabled` - Kill switch activated
- `system.killswitch.disabled` - Kill switch deactivated

#### Auth Events
- `auth.user.registered` - New user registration
- `auth.user.login` - User login
- `auth.user.logout` - User logout
- `auth.policy.created` - Policy created
- `auth.policy.updated` - Policy modified
- `auth.policy.deleted` - Policy removed

#### Orchestrator Events
- `orchestrator.goal.created` - Goal created
- `orchestrator.goal.updated` - Goal status changed
- `orchestrator.goal.completed` - Goal finished
- `orchestrator.task.created` - Task generated
- `orchestrator.task.started` - Task execution began
- `orchestrator.task.completed` - Task finished successfully
- `orchestrator.task.failed` - Task failed
- `orchestrator.approval.requested` - Approval needed
- `orchestrator.approval.approved` - Approval granted
- `orchestrator.approval.rejected` - Approval denied

#### Trade Events
- `trade.ohlcv.imported` - Market data imported
- `trade.scan.executed` - Scanner ran
- `trade.signal.generated` - Signal created with score
- `trade.backtest.started` - Backtest began
- `trade.backtest.completed` - Backtest finished
- `trade.paper.opened` - Paper trade opened
- `trade.paper.closed` - Paper trade closed

#### Store Events
- `store.product.created` - Product created
- `store.product.updated` - Product modified
- `store.listing.created` - Listing draft created
- `store.listing.exported` - Listing exported
- `store.order.imported` - Orders imported
- `store.pricing.recommended` - Pricing suggestion made

#### Social Events
- `social.plan.created` - Content plan generated
- `social.script.created` - Script generated
- `social.schedule.created` - Post scheduled
- `social.metrics.imported` - Metrics imported
- `social.postpack.exported` - Post pack exported

#### Research Events
- `research.proposal.created` - Proposal generated
- `research.proposal.accepted` - Proposal converted to goal
- `research.proposal.rejected` - Proposal declined

#### Ops Events
- `ops.health.checked` - Health check performed
- `ops.chain.verified` - Event chain verified
- `ops.data.exported` - Data export completed
- `ops.demo.reset` - Demo data reset

## Goal Schema

```typescript
interface Goal {
  id: string;
  orgId: string;
  createdBy: string;
  title: string;
  intent: string;          // What user wants to achieve
  constraints: {
    budget?: number;
    riskMax?: number;
    allowedActions?: string[];
    timeHorizon?: string;
  };
  status: 'NEW' | 'PLANNED' | 'EXECUTING' | 'REVIEW' | 'COMPLETE' | 'BLOCKED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}
```

## Task Schema

```typescript
interface Task {
  id: string;
  orgId: string;
  goalId: string;
  assignedToBot: 'tradebot' | 'storebot' | 'socialbot' | 'researchbot' | 'opsbot';
  type: string;
  status: 'QUEUED' | 'RUNNING' | 'NEEDS_APPROVAL' | 'DONE' | 'FAILED';
  input: object;
  output?: object;
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## Approval Schema

```typescript
interface Approval {
  id: string;
  orgId: string;
  taskId: string;
  requiredRole: 'OWNER' | 'ADMIN';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}
```

## Trade Signal Schema

```typescript
interface Signal {
  id: string;
  orgId: string;
  symbol: string;
  strategyVersion: string;
  score: number;           // 0-100
  rationale: {
    checklist: Array<{
      name: string;
      passed: boolean;
      value: number | string;
      threshold?: number | string;
      weight: number;
    }>;
    summary: string;
    confidence: number;
  };
  indicators: {
    rsi: number;
    adx: number;
    plusDI: number;
    minusDI: number;
    vwap: number;
    volumeSurge: number;
    volatility: number;
  };
  ts: string;
}
```

## Backtest Result Schema

```typescript
interface BacktestResult {
  id: string;
  orgId: string;
  strategyVersion: string;
  symbol: string;
  startDate: string;
  endDate: string;
  metrics: {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    avgWin: number;
    avgLoss: number;
    totalPnL: number;
  };
  trades: Array<{
    entryDate: string;
    exitDate: string;
    entryPrice: number;
    exitPrice: number;
    side: 'LONG' | 'SHORT';
    pnl: number;
    holdingDays: number;
  }>;
  createdAt: string;
}
```

## Paper Trade Schema

```typescript
interface PaperTrade {
  id: string;
  orgId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  entryTs: string;
  exitPrice?: number;
  exitTs?: string;
  pnl?: number;
  status: 'OPEN' | 'CLOSED';
  signalId?: string;        // Reference to generating signal
  notes?: string;
}
```

## Product Schema

```typescript
interface Product {
  id: string;
  orgId: string;
  sku: string;
  title: string;
  description?: string;
  cost?: number;
  suggestedPrice?: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  category?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}
```

## Order Schema

```typescript
interface Order {
  id: string;
  orgId: string;
  orderRef: string;
  channel: string;
  productId?: string;
  quantity: number;
  revenue: number;
  cost?: number;
  margin?: number;
  status: 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
  orderDate: string;
  importedAt: string;
}
```

## Content Item Schema

```typescript
interface ContentItem {
  id: string;
  orgId: string;
  title: string;
  hook?: string;
  script?: string;
  format: 'short' | 'long' | 'article';
  channel: string;
  status: 'IDEA' | 'DRAFTING' | 'READY' | 'SCHEDULED' | 'PUBLISHED';
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
}
```

## Content Metrics Schema

```typescript
interface ContentMetrics {
  id: string;
  orgId: string;
  contentId?: string;
  externalId: string;
  channel: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeSeconds?: number;
  ctr?: number;
  recordedAt: string;
  importedAt: string;
}
```

## Proposal Schema

```typescript
interface Proposal {
  id: string;
  orgId: string;
  createdByBot: string;
  title: string;
  description: string;
  expectedImpact: string;
  estimatedRoi?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  goalId?: string;          // Set when accepted
  createdAt: string;
  resolvedAt?: string;
}
```

## Validation

All API boundaries validate payloads using Zod schemas defined in `@nova/shared`.
Invalid payloads return HTTP 422 with detailed error messages.
