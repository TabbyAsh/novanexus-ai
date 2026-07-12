import { z } from 'zod';

// ============================================
// Base Types
// ============================================

export type UUID = string;
export type Timestamp = string; // ISO 8601

// ============================================
// User & Auth Types
// ============================================

export const UserRoleSchema = z.enum([
  'OWNER',
  'ADMIN',
  'MEMBER',
  'VIEWER',
  'BOT',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export interface User {
  id: UUID;
  email: string;
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Org {
  id: UUID;
  name: string;
  createdAt: Timestamp;
}

export interface OrgMember {
  orgId: UUID;
  userId: UUID;
  role: UserRole;
  joinedAt: Timestamp;
}

// ============================================
// Scopes & Permissions
// ============================================

export const ScopeSchema = z.enum([
  // Trade scopes
  'trade.read',
  'trade.paper.execute',
  'trade.live.execute',
  'trade.backtest',
  // Store scopes
  'store.read',
  'store.write',
  'store.pricing',
  'store.orders',
  // Social scopes
  'social.read',
  'social.schedule',
  'social.post',
  // Research scopes
  'research.read',
  'research.write',
  'research.propose',
  // Forge scopes
  'forge.read',
  'forge.propose',
  'forge.approve',
  // Forge command-broker risk-tier scopes (CmdX)
  'forge.cmd.t0',
  'forge.cmd.t1',
  'forge.cmd.t2',
  'forge.cmd.t3',
  // Ops scopes
  'ops.read',
  'ops.deploy',
  'ops.admin',
  // Admin scopes
  'admin.users',
  'admin.billing',
  'admin.killswitch',
  'admin.audit',
]);
export type Scope = z.infer<typeof ScopeSchema>;

export const PolicyEffectSchema = z.enum(['ALLOW', 'DENY']);
export type PolicyEffect = z.infer<typeof PolicyEffectSchema>;

export interface Policy {
  id: UUID;
  orgId: UUID;
  subjectRole: UserRole;
  action: Scope;
  resource: string;
  effect: PolicyEffect;
  conditions?: Record<string, unknown>;
}

// ============================================
// Goals & Tasks (Orchestrator)
// ============================================

export const GoalStatusSchema = z.enum([
  'NEW',
  'PLANNED',
  'EXECUTING',
  'REVIEW',
  'COMPLETE',
  'BLOCKED',
  'CANCELLED',
]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const TaskStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'NEEDS_APPROVAL',
  'DONE',
  'FAILED',
  'RETRYING',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const BotTypeSchema = z.enum([
  'tradebot',
  'storebot',
  'socialbot',
  'researchbot',
  'opsbot',
  'forgebot',
]);
export type BotType = z.infer<typeof BotTypeSchema>;

export interface Goal {
  id: UUID;
  orgId: UUID;
  createdBy: UUID;
  title: string;
  intent: string;
  constraints: GoalConstraints;
  status: GoalStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GoalConstraints {
  budget?: number;
  riskMax?: number;
  allowedActions?: Scope[];
  timeHorizon?: string;
}

export interface Task {
  id: UUID;
  orgId: UUID;
  goalId: UUID;
  assignedToBot: BotType;
  type: string;
  status: TaskStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const ApprovalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export interface Approval {
  id: UUID;
  orgId: UUID;
  taskId: UUID;
  requiredRole: UserRole;
  status: ApprovalStatus;
  requestedAt: Timestamp;
  resolvedAt?: Timestamp;
  resolution?: Record<string, unknown>;
}

// ============================================
// Events
// ============================================

export const ActorTypeSchema = z.enum(['USER', 'BOT', 'SYSTEM']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export interface NovaEvent {
  id: UUID;
  orgId: UUID;
  actorType: ActorType;
  actorId: UUID;
  type: string;
  ts: Timestamp;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

// ============================================
// Trading Types
// ============================================

export interface Watchlist {
  id: UUID;
  orgId: UUID;
  name: string;
  createdAt: Timestamp;
}

export interface WatchlistItem {
  watchlistId: UUID;
  symbol: string;
  addedAt: Timestamp;
}

export interface Signal {
  id: UUID;
  orgId: UUID;
  symbol: string;
  strategyVersion: string;
  score: number;
  rationale: SignalRationale;
  ts: Timestamp;
}

export interface SignalRationale {
  checklist: ChecklistItem[];
  summary: string;
  confidence: number;
}

export interface ChecklistItem {
  name: string;
  passed: boolean;
  value?: number | string;
  threshold?: number | string;
  weight: number;
}

export const TradeSideSchema = z.enum(['LONG', 'SHORT']);
export type TradeSide = z.infer<typeof TradeSideSchema>;

export interface PaperTrade {
  id: UUID;
  orgId: UUID;
  symbol: string;
  side: TradeSide;
  qty: number;
  entryPrice: number;
  entryTs: Timestamp;
  exitPrice?: number;
  exitTs?: Timestamp;
  pnl?: number;
  meta?: Record<string, unknown>;
}

export interface Strategy {
  id: UUID;
  orgId: UUID;
  name: string;
  version: string;
  rules: StrategyRules;
  createdAt: Timestamp;
}

export interface StrategyRules {
  scannerFilters: ScannerFilter[];
  entryConditions: Condition[];
  exitConditions: Condition[];
  riskParams: RiskParams;
}

export interface ScannerFilter {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
  value: number | [number, number];
}

export interface Condition {
  indicator: string;
  operator: string;
  value: number | string;
}

export interface RiskParams {
  maxPositionSize: number;
  maxLossPerTrade: number;
  maxDailyLoss: number;
  stopLossPercent: number;
}

// ============================================
// Store Types
// ============================================

export const ProductStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'ARCHIVED',
  'OUT_OF_STOCK',
]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export interface Product {
  id: UUID;
  orgId: UUID;
  sku: string;
  title: string;
  status: ProductStatus;
  meta: ProductMeta;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductMeta {
  description?: string;
  images?: string[];
  variants?: ProductVariant[];
  cost?: number;
  category?: string;
  tags?: string[];
}

export interface ProductVariant {
  sku: string;
  name: string;
  price: number;
  inventory: number;
}

export const ListingStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'REMOVED',
]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

export interface Listing {
  id: UUID;
  orgId: UUID;
  productId: UUID;
  channel: string;
  price: number;
  status: ListingStatus;
  meta: Record<string, unknown>;
}

export const OrderStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export interface Order {
  id: UUID;
  orgId: UUID;
  channel: string;
  orderRef: string;
  status: OrderStatus;
  totals: OrderTotals;
  meta: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrderTotals {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
}

// ============================================
// Social Types
// ============================================

export const ContentStatusSchema = z.enum([
  'IDEA',
  'DRAFTING',
  'READY',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export interface ContentItem {
  id: UUID;
  orgId: UUID;
  channel: string;
  title: string;
  script: string;
  status: ContentStatus;
  meta: ContentMeta;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ContentMeta {
  hook?: string;
  thumbnailUrl?: string;
  tags?: string[];
  duration?: number;
  format?: 'short' | 'long' | 'article';
}

export interface ContentSchedule {
  id: UUID;
  contentId: UUID;
  scheduledTs: Timestamp;
  status: 'PENDING' | 'POSTED' | 'FAILED';
}

export interface ContentMetrics {
  id: UUID;
  contentId: UUID;
  ts: Timestamp;
  metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    watchTime?: number;
    ctr?: number;
  };
}

// ============================================
// Research Types
// ============================================

export interface KBDoc {
  id: UUID;
  orgId: UUID;
  title: string;
  bodyMd: string;
  tags: string[];
  sourceMeta: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const ProposalStatusSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'IMPLEMENTED',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export interface Proposal {
  id: UUID;
  orgId: UUID;
  createdByBot: BotType;
  title: string;
  expectedImpact: string;
  patchRef?: string;
  status: ProposalStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Bot Interface Types
// ============================================

export interface BotRunInput {
  orgId: UUID;
  taskId: UUID;
  type: string;
  input: Record<string, unknown>;
  constraints: GoalConstraints;
  policySnapshot: Policy[];
}

export interface BotRunOutput {
  status: 'DONE' | 'NEEDS_APPROVAL' | 'FAILED';
  output: Record<string, unknown>;
  events: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
  requiredApproval?: {
    role: UserRole;
    reason: string;
  };
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================
// Kill Switch
// ============================================

export interface KillSwitchState {
  enabled: boolean;
  enabledAt?: Timestamp;
  enabledBy?: UUID;
  reason?: string;
}

// ============================================
// Nova Nexus Decision Infrastructure (Legacy)
// ============================================

export const NexusDecisionActionSchema = z.enum(['BUY', 'SELL', 'SKIP', 'WAIT', 'OFFER']);
export type NexusDecisionAction = z.infer<typeof NexusDecisionActionSchema>;

export const NexusVolatilitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type NexusVolatility = z.infer<typeof NexusVolatilitySchema>;

export interface NexusOpportunity {
  id: UUID;
  orgId?: UUID | null;
  userId?: UUID | null;
  sourceType: string;
  sourceUrl?: string | null;
  rawInput: Record<string, unknown>;
  observedAt: Timestamp;
}

export interface NexusDecisionCard {
  id: UUID;
  opportunityId: UUID;
  vertical: string;
  action: NexusDecisionAction;
  confidencePct: number;
  volatility: NexusVolatility;
  status: 'OPEN' | 'EXECUTING' | 'CLOSED' | 'ARCHIVED';
  latestVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface NexusDecisionOutcome {
  id: UUID;
  decisionCardId: UUID;
  executionId?: UUID | null;
  outcomeStatus: 'PROFIT' | 'LOSS' | 'BREAKEVEN' | 'ABANDONED';
  realizedSalePrice?: number | null;
  realizedTotalCost?: number | null;
  realizedNetProfit?: number | null;
  realizedHoldDays?: number | null;
  notes?: string | null;
  loggedAt: Timestamp;
}

// ============================================
// THE NOVA DECISION CARD — Universal Contract
// Core schema. Every module must produce this.
// Immutable once shipped. Add optional fields
// in sub-types only. Never remove/rename core.
// ============================================

/** The six card types — every Decision Card is one of these */
export const CardTypeSchema = z.enum([
  'TRADE',    // Stock/asset analysis
  'FLIP',     // Resale opportunity
  'PRICING',  // Business quote pricing
  'CONTENT',  // Content decision
  'OPS',      // Operational task
  'LIFE',     // Personal decision
]);
export type CardType = z.infer<typeof CardTypeSchema>;

/** Recommended action from analysis */
export const RecommendedActionSchema = z.enum([
  'BUY',
  'SELL',
  'WATCH',
  'SKIP',
  'INVESTIGATE',
]);
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

/** Risk level classification */
export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/** Governance execution mode */
export const GovernanceModeSchema = z.enum(['RECOMMEND', 'ASSIST', 'AUTOMATE']);
export type GovernanceMode = z.infer<typeof GovernanceModeSchema>;

/** Outcome status after card execution */
export const CardOutcomeStatusSchema = z.enum(['PENDING', 'EXECUTED', 'SKIPPED', 'CANCELLED']);
export type CardOutcomeStatus = z.infer<typeof CardOutcomeStatusSchema>;

/** Data source citation — every source used in analysis */
export interface DataSource {
  name: string;           // e.g. "eBay Browse API", "Alpaca Markets"
  endpoint?: string;      // API endpoint called
  fetchedAt: Timestamp;   // when data was retrieved
  recordCount?: number;   // how many records used
  staleness?: number;     // seconds since data was fresh
}

/** Concrete next step from a card */
export interface ActionStep {
  order: number;
  description: string;
  type: 'MANUAL' | 'ASSISTED' | 'AUTOMATED';
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';
  assignedTo?: string;    // user_id or bot_id
  dueBy?: Timestamp;
}

// ---- Type-specific metrics ----

export interface TradeMetrics {
  symbol: string;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  riskRewardRatio: number | null;
  positionSize: number | null;
  rsi: number | null;
  adx: number | null;
  adxRising: boolean | null;
  vwap: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  volume: number | null;
  avgVolume: number | null;
  float: number | null;
  shortPercent: number | null;
  eps: number | null;
  pe: number | null;
}

export interface FlipMetrics {
  medianSoldPrice: number | null;
  lowPrice: number | null;      // 20th percentile
  highPrice: number | null;     // 80th percentile
  sampleCount: number;
  staleness: number | null;     // days since oldest comp
  estimatedFees: number | null; // platform + payment fees
  estimatedShipping: number | null;
  estimatedProfit: number | null;
  profitMarginPercent: number | null;
  buyPrice: number | null;
}

export interface PricingMetrics {
  jobType: string;
  variables: Record<string, unknown>;
  suggestedPrice: number | null;
  costBasis: number | null;
  marginPercent: number | null;
  competitorRange: { low: number; high: number } | null;
}

export interface ContentMetricsCard {
  topic: string;
  format: string;
  hook: string | null;
  expectedReach: number | null;
  bestPostTime: Timestamp | null;
  platform: string;
}

/** THE NOVA DECISION CARD — Core contract */
export interface DecisionCard {
  // Identity
  id: string;               // ulid() — sortable unique ID
  version: number;           // increments on each update
  created_at: Timestamp;
  updated_at: Timestamp;

  // Classification
  card_type: CardType;
  user_id: string;
  session_id: string;

  // The Observation — what triggered this card
  observation: {
    source: string;          // "market_scan" | "user_input" | "bot_alert"
    raw_input: unknown;      // the original data, unmodified
    context: Record<string, unknown>;
    timestamp: Timestamp;
  };

  // The Analysis — what Nova computed
  analysis: {
    confidence: number | null; // 0–1. NEVER fake. If unknown: null.
    reasoning: string[];       // bullet chain of logic
    data_used: DataSource[];   // every source cited
    missing: string[];         // what data was unavailable
    warnings: string[];        // risk flags
  };

  // The Recommendation — what Nova suggests
  recommendation: {
    action: RecommendedAction;
    summary: string;           // one sentence plain-language
    details: string;
    risk_level: RiskLevel;
  };

  // The Numbers — type-specific financial data
  metrics: TradeMetrics | FlipMetrics | PricingMetrics | ContentMetricsCard | null;

  // The Action Steps — concrete next moves
  action_steps: ActionStep[];

  // Governance — execution mode and approval state
  governance: {
    mode: GovernanceMode;
    approved_by: string | null;
    approved_at: Timestamp | null;
    executed_at: Timestamp | null;
    kill_switch: boolean;
  };

  // The Outcome — filled in after execution
  outcome: {
    status: CardOutcomeStatus;
    result: unknown | null;
    actual_vs_expected: string | null;
    lesson: string | null;     // what Nova learns from this
    logged_at: Timestamp | null;
  };

  // Event chain — links to the append-only event log
  event_hash: string;
}

/** Execution decision from the orchestrator */
export interface ExecutionDecision {
  allowed: boolean;
  reason: string;
  show_to_user?: boolean;
}

/** Bot manifest — what a bot can do */
export interface BotManifest {
  bot_type: BotType;
  card_types: CardType[];
  data_sources: string[];
  execution_modes: GovernanceMode[];
  required_permissions: Scope[];
}

/** Data source health status */
export interface DataSourceStatus {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  lastChecked: Timestamp;
  latencyMs?: number;
}

/** Bot health response */
export interface BotHealthResponse {
  status: 'ok' | 'degraded';
  data_sources: DataSourceStatus[];
}

// ============================================
// NEXUS INTERACTION ENGINE
// Nexus is the governed relationship between human intent and Nova's
// extensible capabilities. Every interaction returns an inspectable receipt.
// ============================================

export type NexusSector = 'decision' | 'market' | 'commerce' | 'business' | 'social' | 'research' | 'forge' | 'world' | 'ops' | 'memory';
export type NexusAuthorityMode = 'observe' | 'recommend' | 'assist' | 'automate';
export type NexusCapabilityStatus = 'available' | 'degraded' | 'gated' | 'reserved';
export type NexusExecutionMode = 'reasoning' | 'direct' | 'composed';

export interface NexusCapabilityDescriptor {
  id: string;
  name: string;
  sector: NexusSector;
  description: string;
  status: NexusCapabilityStatus;
  authority: NexusAuthorityMode;
  entrypoint: string | null;
  sideEffects: string[];
  requires: string[];
}

export interface NexusEvidence {
  capabilityId: string;
  summary: string;
  source: string;
}

export interface NexusInteractionEnvelope {
  interactionId: string;
  conversationId: string;
  createdAt: Timestamp;
  intent: {
    primary: string;
    route: { label: string; href: string; description: string } | null;
  };
  execution: {
    mode: NexusExecutionMode;
    capabilities: string[];
    evidence: NexusEvidence[];
    gaps: string[];
    cost: { aiCalls: number; toolCalls: number };
  };
  authority: {
    mode: NexusAuthorityMode;
    externalSideEffectsPerformed: boolean;
    humanApprovalRequiredForSideEffects: boolean;
  };
  nova: {
    reply: string;
    provider: string;
  };
  memory: {
    persisted: boolean;
    artifactId: string | null;
    outcomeClosable: boolean;
  };
  action: unknown | null;
}
