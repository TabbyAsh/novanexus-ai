"use strict";
// ============================================
// Service Ports
// ============================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_CODES = exports.HTTP_STATUS = exports.DB_DEFAULTS = exports.CONTENT_DEFAULTS = exports.TRADING_DEFAULTS = exports.AUTOMATION_MODES = exports.RATE_LIMITS = exports.EVENT_TYPES = exports.SERVICE_PORTS = void 0;
exports.SERVICE_PORTS = {
    GATEWAY: 3000,
    AUTH: 3001,
    ORCHESTRATOR: 3002,
    EVENTBUS: 3003,
    AUDIT: 3004,
    NOTIFIER: 3005,
    BILLING: 3006,
    TRADEBOT: 3010,
    STOREBOT: 3011,
    SOCIALBOT: 3012,
    RESEARCHBOT: 3013,
    OPSBOT: 3014,
    FORGEBOT: 3015,
    MARKETDATA: 3020,
    CONTENTDATA: 3021,
    COMMERCEDATA: 3022,
};
// ============================================
// Event Types
// ============================================
exports.EVENT_TYPES = {
    // System events
    SYSTEM_STARTUP: 'system.startup',
    SYSTEM_SHUTDOWN: 'system.shutdown',
    KILL_SWITCH_ENABLED: 'system.killswitch.enabled',
    KILL_SWITCH_DISABLED: 'system.killswitch.disabled',
    // Auth events
    USER_CREATED: 'auth.user.created',
    USER_LOGIN: 'auth.user.login',
    USER_LOGOUT: 'auth.user.logout',
    POLICY_CREATED: 'auth.policy.created',
    POLICY_UPDATED: 'auth.policy.updated',
    // Goal/Task events
    GOAL_CREATED: 'orchestrator.goal.created',
    GOAL_UPDATED: 'orchestrator.goal.updated',
    GOAL_COMPLETED: 'orchestrator.goal.completed',
    TASK_CREATED: 'orchestrator.task.created',
    TASK_STARTED: 'orchestrator.task.started',
    TASK_COMPLETED: 'orchestrator.task.completed',
    TASK_FAILED: 'orchestrator.task.failed',
    APPROVAL_REQUESTED: 'orchestrator.approval.requested',
    APPROVAL_RESOLVED: 'orchestrator.approval.resolved',
    // Trade events
    SCAN_EXECUTED: 'trade.scan.executed',
    SIGNAL_GENERATED: 'trade.signal.generated',
    BACKTEST_RUN: 'trade.backtest.run',
    PAPER_TRADE_OPENED: 'trade.paper.opened',
    PAPER_TRADE_CLOSED: 'trade.paper.closed',
    LIVE_TRADE_OPENED: 'trade.live.opened',
    LIVE_TRADE_CLOSED: 'trade.live.closed',
    DECISION_CREATED: 'trade.decision.created',
    DECISION_EVENT_APPENDED: 'trade.decision.event.appended',
    DECISION_REPLAYED: 'trade.decision.replayed',
    BROKER_CONNECTED: 'trade.broker.connected',
    BROKER_DISCONNECTED: 'trade.broker.disconnected',
    BROKER_HISTORY_FETCHED: 'trade.broker.history.fetched',
    BROKER_ORDER_PLACED: 'trade.broker.order.placed',
    // Store events
    PRODUCT_CREATED: 'store.product.created',
    PRODUCT_UPDATED: 'store.product.updated',
    LISTING_PUBLISHED: 'store.listing.published',
    ORDER_RECEIVED: 'store.order.received',
    ORDER_SHIPPED: 'store.order.shipped',
    // Social events
    CONTENT_CREATED: 'social.content.created',
    CONTENT_SCHEDULED: 'social.content.scheduled',
    CONTENT_POSTED: 'social.content.posted',
    METRICS_INGESTED: 'social.metrics.ingested',
    // Research events
    KB_DOC_CREATED: 'research.kb.created',
    PROPOSAL_CREATED: 'research.proposal.created',
    PROPOSAL_APPROVED: 'research.proposal.approved',
    PROPOSAL_REJECTED: 'research.proposal.rejected',
    // Forge events
    PATCH_PROPOSED: 'forge.patch.proposed',
    PATCH_APPROVED: 'forge.patch.approved',
    PATCH_DEPLOYED: 'forge.patch.deployed',
    PATCH_ROLLED_BACK: 'forge.patch.rolledback',
    // Bot events
    BOT_TASK_RECEIVED: 'bot.task.received',
    BOT_TASK_COMPLETED: 'bot.task.completed',
    BOT_ERROR: 'bot.error',
};
// ============================================
// Rate Limits
// ============================================
exports.RATE_LIMITS = {
    // Per-user limits (requests per minute)
    API_REQUESTS_PER_MINUTE: 100,
    AUTH_ATTEMPTS_PER_MINUTE: 10,
    // Per-bot limits (tasks per minute)
    BOT_TASKS_PER_MINUTE: 30,
    BOT_MAX_FAILURES_PER_HOUR: 50,
    // External API limits
    MARKET_DATA_REQUESTS_PER_MINUTE: 60,
    SOCIAL_API_REQUESTS_PER_MINUTE: 30,
};
// ============================================
// Automation Modes
// ============================================
exports.AUTOMATION_MODES = {
    RECOMMEND: 'recommend', // AI suggests, user decides
    ASSIST: 'assist', // AI drafts, user confirms
    AUTOMATE: 'automate', // AI executes under policy
};
// ============================================
// Trading Defaults
// ============================================
exports.TRADING_DEFAULTS = {
    MAX_POSITION_SIZE_PERCENT: 5, // % of portfolio
    MAX_LOSS_PER_TRADE_PERCENT: 2, // % of position
    MAX_DAILY_LOSS_PERCENT: 6, // % of portfolio
    DEFAULT_STOP_LOSS_PERCENT: 5,
    MIN_SCORE_FOR_SIGNAL: 70, // 0-100
    BACKTEST_DEFAULT_DAYS: 90,
};
// ============================================
// Content Defaults
// ============================================
exports.CONTENT_DEFAULTS = {
    SHORT_FORM_MAX_DURATION: 60, // seconds
    LONG_FORM_MIN_DURATION: 300, // seconds
    SCHEDULE_LOOKAHEAD_DAYS: 14,
    MAX_POSTS_PER_DAY: 3,
};
// ============================================
// Database
// ============================================
exports.DB_DEFAULTS = {
    PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    EVENT_RETENTION_DAYS: 365,
};
// ============================================
// HTTP Status Codes
// ============================================
exports.HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
};
// ============================================
// Error Codes
// ============================================
exports.ERROR_CODES = {
    // Auth errors
    INVALID_CREDENTIALS: 'AUTH_001',
    TOKEN_EXPIRED: 'AUTH_002',
    INSUFFICIENT_PERMISSIONS: 'AUTH_003',
    // Validation errors
    VALIDATION_FAILED: 'VAL_001',
    INVALID_INPUT: 'VAL_002',
    // Resource errors
    NOT_FOUND: 'RES_001',
    ALREADY_EXISTS: 'RES_002',
    // Rate limiting
    RATE_LIMITED: 'RATE_001',
    // Kill switch
    AUTOMATION_DISABLED: 'KILL_001',
    // Bot errors
    BOT_EXECUTION_FAILED: 'BOT_001',
    BOT_APPROVAL_REQUIRED: 'BOT_002',
    // External API errors
    EXTERNAL_API_ERROR: 'EXT_001',
    EXTERNAL_API_TIMEOUT: 'EXT_002',
};
