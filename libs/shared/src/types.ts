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
