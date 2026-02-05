"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProposalStatusSchema = exports.ContentStatusSchema = exports.OrderStatusSchema = exports.ListingStatusSchema = exports.ProductStatusSchema = exports.TradeSideSchema = exports.ActorTypeSchema = exports.ApprovalStatusSchema = exports.BotTypeSchema = exports.TaskStatusSchema = exports.GoalStatusSchema = exports.PolicyEffectSchema = exports.ScopeSchema = exports.UserStatusSchema = exports.UserRoleSchema = void 0;
const zod_1 = require("zod");
// ============================================
// User & Auth Types
// ============================================
exports.UserRoleSchema = zod_1.z.enum([
    'OWNER',
    'ADMIN',
    'MEMBER',
    'VIEWER',
    'BOT',
]);
exports.UserStatusSchema = zod_1.z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']);
// ============================================
// Scopes & Permissions
// ============================================
exports.ScopeSchema = zod_1.z.enum([
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
exports.PolicyEffectSchema = zod_1.z.enum(['ALLOW', 'DENY']);
// ============================================
// Goals & Tasks (Orchestrator)
// ============================================
exports.GoalStatusSchema = zod_1.z.enum([
    'NEW',
    'PLANNED',
    'EXECUTING',
    'REVIEW',
    'COMPLETE',
    'BLOCKED',
    'CANCELLED',
]);
exports.TaskStatusSchema = zod_1.z.enum([
    'QUEUED',
    'RUNNING',
    'NEEDS_APPROVAL',
    'DONE',
    'FAILED',
    'RETRYING',
]);
exports.BotTypeSchema = zod_1.z.enum([
    'tradebot',
    'storebot',
    'socialbot',
    'researchbot',
    'opsbot',
    'forgebot',
]);
exports.ApprovalStatusSchema = zod_1.z.enum([
    'PENDING',
    'APPROVED',
    'REJECTED',
]);
// ============================================
// Events
// ============================================
exports.ActorTypeSchema = zod_1.z.enum(['USER', 'BOT', 'SYSTEM']);
exports.TradeSideSchema = zod_1.z.enum(['LONG', 'SHORT']);
// ============================================
// Store Types
// ============================================
exports.ProductStatusSchema = zod_1.z.enum([
    'DRAFT',
    'ACTIVE',
    'ARCHIVED',
    'OUT_OF_STOCK',
]);
exports.ListingStatusSchema = zod_1.z.enum([
    'DRAFT',
    'PENDING',
    'ACTIVE',
    'PAUSED',
    'REMOVED',
]);
exports.OrderStatusSchema = zod_1.z.enum([
    'PENDING',
    'PAID',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED',
]);
// ============================================
// Social Types
// ============================================
exports.ContentStatusSchema = zod_1.z.enum([
    'IDEA',
    'DRAFTING',
    'READY',
    'SCHEDULED',
    'PUBLISHED',
    'ARCHIVED',
]);
exports.ProposalStatusSchema = zod_1.z.enum([
    'DRAFT',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'IMPLEMENTED',
]);
