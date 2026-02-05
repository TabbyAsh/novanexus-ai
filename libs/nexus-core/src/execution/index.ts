/**
 * NOVA NEXUS EXECUTION FABRIC
 * ===========================
 * Governed execution layer. Idempotent commands, rate limiting,
 * rollback capability, and human override hooks at every level.
 */

import { v4 as uuidv4 } from 'uuid';
import { AutonomyTier } from '../constitution';
import { Intent } from '../mindspace';

// ============================================================================
// COMMAND TYPES
// ============================================================================

export enum CommandType {
  // Trading commands
  MARKET_BUY = 'MARKET_BUY',
  MARKET_SELL = 'MARKET_SELL',
  LIMIT_BUY = 'LIMIT_BUY',
  LIMIT_SELL = 'LIMIT_SELL',
  CANCEL_ORDER = 'CANCEL_ORDER',
  MODIFY_ORDER = 'MODIFY_ORDER',
  
  // Commerce commands
  LIST_PRODUCT = 'LIST_PRODUCT',
  UPDATE_PRICE = 'UPDATE_PRICE',
  PURCHASE_INVENTORY = 'PURCHASE_INVENTORY',
  DELIST_PRODUCT = 'DELIST_PRODUCT',
  
  // System commands
  ALERT_USER = 'ALERT_USER',
  UPDATE_CONFIG = 'UPDATE_CONFIG',
  SYNC_DATA = 'SYNC_DATA',
}

export enum CommandStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  APPROVED = 'APPROVED',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK',
  CANCELLED = 'CANCELLED',
  RATE_LIMITED = 'RATE_LIMITED',
}

// ============================================================================
// COMMAND
// ============================================================================

export interface Command {
  /** Unique command ID */
  id: string;
  
  /** Idempotency key - same key = same command, won't execute twice */
  idempotencyKey: string;
  
  /** Command type */
  type: CommandType;
  
  /** Status */
  status: CommandStatus;
  
  /** The intent this command fulfills */
  intentId?: string;
  
  /** Command parameters */
  parameters: Record<string, unknown>;
  
  /** Required autonomy tier */
  requiredTier: AutonomyTier;
  
  /** Needs human approval? */
  requiresApproval: boolean;
  
  /** Timestamps */
  createdAt: number;
  validatedAt?: number;
  approvedAt?: number;
  executedAt?: number;
  completedAt?: number;
  
  /** Execution result */
  result?: {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  };
  
  /** Rollback information */
  rollback?: {
    possible: boolean;
    command?: Command;
    executedAt?: number;
  };
  
  /** Retry information */
  retries: number;
  maxRetries: number;
  lastError?: string;
}

// ============================================================================
// RATE LIMITER
// ============================================================================

export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  
  /** Window size in milliseconds */
  windowMs: number;
  
  /** Cooldown after hitting limit */
  cooldownMs: number;
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(key: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    
    // Check cooldown
    const cooldownEnd = this.cooldowns.get(key);
    if (cooldownEnd && now < cooldownEnd) {
      return { allowed: false, retryAfter: cooldownEnd - now };
    }
    
    // Get request history
    const history = this.requests.get(key) ?? [];
    
    // Filter to current window
    const windowStart = now - this.config.windowMs;
    const recentRequests = history.filter(t => t >= windowStart);
    
    if (recentRequests.length >= this.config.maxRequests) {
      // Hit rate limit, start cooldown
      this.cooldowns.set(key, now + this.config.cooldownMs);
      return { allowed: false, retryAfter: this.config.cooldownMs };
    }
    
    return { allowed: true };
  }

  /**
   * Record a request
   */
  record(key: string): void {
    const history = this.requests.get(key) ?? [];
    history.push(Date.now());
    
    // Keep only recent history
    const windowStart = Date.now() - this.config.windowMs;
    this.requests.set(key, history.filter(t => t >= windowStart));
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
    this.cooldowns.delete(key);
  }
}

// ============================================================================
// HUMAN OVERRIDE INTERFACE
// ============================================================================

export interface HumanOverrideRequest {
  id: string;
  commandId: string;
  command: Command;
  reason: string;
  requestedAt: number;
  expiresAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  resolvedBy?: string;
  resolvedAt?: number;
  resolution?: string;
}

// ============================================================================
// EXECUTION FABRIC
// ============================================================================

export class ExecutionFabric {
  private commands: Map<string, Command> = new Map();
  private idempotencyIndex: Map<string, string> = new Map(); // idempotencyKey -> commandId
  private pendingApprovals: Map<string, HumanOverrideRequest> = new Map();
  private rateLimiters: Map<CommandType, RateLimiter> = new Map();
  private currentTier: AutonomyTier = AutonomyTier.OBSERVE;
  private halted: boolean = false;
  private haltReason?: string;
  
  // Callbacks for external integrations
  private onApprovalNeeded?: (request: HumanOverrideRequest) => void;
  private onExecute?: (command: Command) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;

  constructor() {
    // Initialize default rate limiters
    this.initializeRateLimiters();
  }

  /**
   * Initialize rate limiters for different command types
   */
  private initializeRateLimiters(): void {
    // Trading: 10 orders per minute
    const tradingLimiter = new RateLimiter({
      maxRequests: 10,
      windowMs: 60 * 1000,
      cooldownMs: 30 * 1000,
    });
    
    [CommandType.MARKET_BUY, CommandType.MARKET_SELL, 
     CommandType.LIMIT_BUY, CommandType.LIMIT_SELL].forEach(type => {
      this.rateLimiters.set(type, tradingLimiter);
    });
    
    // Commerce: 100 updates per minute
    const commerceLimiter = new RateLimiter({
      maxRequests: 100,
      windowMs: 60 * 1000,
      cooldownMs: 10 * 1000,
    });
    
    [CommandType.UPDATE_PRICE, CommandType.LIST_PRODUCT].forEach(type => {
      this.rateLimiters.set(type, commerceLimiter);
    });
  }

  /**
   * Set the current autonomy tier
   */
  setAutonomyTier(tier: AutonomyTier): void {
    this.currentTier = tier;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: {
    onApprovalNeeded?: (request: HumanOverrideRequest) => void;
    onExecute?: (command: Command) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;
  }): void {
    if (callbacks.onApprovalNeeded) this.onApprovalNeeded = callbacks.onApprovalNeeded;
    if (callbacks.onExecute) this.onExecute = callbacks.onExecute;
  }

  /**
   * Submit a command for execution
   */
  async submit(
    type: CommandType,
    parameters: Record<string, unknown>,
    options: {
      idempotencyKey?: string;
      intentId?: string;
      requiredTier?: AutonomyTier;
      requiresApproval?: boolean;
      maxRetries?: number;
    } = {}
  ): Promise<Command> {
    // Generate idempotency key if not provided
    const idempotencyKey = options.idempotencyKey ?? 
      `${type}:${JSON.stringify(parameters)}:${Date.now()}`;
    
    // Check for existing command with same idempotency key
    const existingId = this.idempotencyIndex.get(idempotencyKey);
    if (existingId) {
      const existing = this.commands.get(existingId);
      if (existing) {
        return existing; // Return existing command - idempotent behavior
      }
    }
    
    // Determine required tier
    const requiredTier = options.requiredTier ?? this.getDefaultTierForCommand(type);
    
    // Determine if approval is needed
    const requiresApproval = options.requiresApproval ?? 
      this.shouldRequireApproval(type, requiredTier);
    
    // Create command
    const command: Command = {
      id: uuidv4(),
      idempotencyKey,
      type,
      status: CommandStatus.PENDING,
      intentId: options.intentId,
      parameters,
      requiredTier,
      requiresApproval,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: options.maxRetries ?? 3,
    };
    
    // Store command
    this.commands.set(command.id, command);
    this.idempotencyIndex.set(idempotencyKey, command.id);
    
    // Process command
    await this.processCommand(command);
    
    return command;
  }

  /**
   * Process a command through the execution pipeline
   */
  private async processCommand(command: Command): Promise<void> {
    // Check if system is halted
    if (this.halted) {
      command.status = CommandStatus.CANCELLED;
      command.lastError = `System halted: ${this.haltReason}`;
      return;
    }
    
    // Validate command
    const validation = this.validateCommand(command);
    if (!validation.valid) {
      command.status = CommandStatus.FAILED;
      command.lastError = validation.reason;
      return;
    }
    command.status = CommandStatus.VALIDATED;
    command.validatedAt = Date.now();
    
    // Check rate limits
    const rateLimiter = this.rateLimiters.get(command.type);
    if (rateLimiter) {
      const limitCheck = rateLimiter.isAllowed(command.type);
      if (!limitCheck.allowed) {
        command.status = CommandStatus.RATE_LIMITED;
        command.lastError = `Rate limited. Retry after ${limitCheck.retryAfter}ms`;
        return;
      }
    }
    
    // Check if approval is needed
    if (command.requiresApproval) {
      this.requestApproval(command);
      command.status = CommandStatus.AWAITING_APPROVAL;
      return;
    }
    
    // Execute command
    await this.executeCommand(command);
  }

  /**
   * Validate a command
   */
  private validateCommand(command: Command): { valid: boolean; reason?: string } {
    // Check autonomy tier
    const currentTierIndex = this.getTierIndex(this.currentTier);
    const requiredTierIndex = this.getTierIndex(command.requiredTier);
    
    if (currentTierIndex < requiredTierIndex) {
      return { 
        valid: false, 
        reason: `Insufficient autonomy tier. Current: ${this.currentTier}, Required: ${command.requiredTier}` 
      };
    }
    
    // Validate parameters based on command type
    switch (command.type) {
      case CommandType.MARKET_BUY:
      case CommandType.MARKET_SELL:
        if (!command.parameters.symbol || !command.parameters.quantity) {
          return { valid: false, reason: 'Missing required parameters: symbol, quantity' };
        }
        break;
      case CommandType.UPDATE_PRICE:
        if (!command.parameters.productId || command.parameters.price === undefined) {
          return { valid: false, reason: 'Missing required parameters: productId, price' };
        }
        break;
    }
    
    return { valid: true };
  }

  /**
   * Request human approval
   */
  private requestApproval(command: Command): HumanOverrideRequest {
    const request: HumanOverrideRequest = {
      id: uuidv4(),
      commandId: command.id,
      command,
      reason: `Command ${command.type} requires human approval`,
      requestedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hour expiry
      status: 'pending',
    };
    
    this.pendingApprovals.set(request.id, request);
    
    // Trigger callback if set
    if (this.onApprovalNeeded) {
      this.onApprovalNeeded(request);
    }
    
    return request;
  }

  /**
   * Execute a command
   */
  private async executeCommand(command: Command): Promise<void> {
    command.status = CommandStatus.EXECUTING;
    command.executedAt = Date.now();
    
    // Record rate limit
    const rateLimiter = this.rateLimiters.get(command.type);
    if (rateLimiter) {
      rateLimiter.record(command.type);
    }
    
    try {
      // Execute via callback or simulate
      let result: { success: boolean; data?: Record<string, unknown>; error?: string };
      
      if (this.onExecute) {
        result = await this.onExecute(command);
      } else {
        // Simulate execution
        result = { success: true, data: { simulated: true } };
      }
      
      command.result = result;
      
      if (result.success) {
        command.status = CommandStatus.COMPLETED;
        command.completedAt = Date.now();
        
        // Set up rollback info
        command.rollback = {
          possible: this.isRollbackPossible(command),
        };
      } else {
        // Handle failure with retries
        if (command.retries < command.maxRetries) {
          command.retries++;
          command.lastError = result.error;
          command.status = CommandStatus.PENDING;
          
          // Retry with backoff
          setTimeout(() => this.processCommand(command), 1000 * Math.pow(2, command.retries));
        } else {
          command.status = CommandStatus.FAILED;
          command.lastError = result.error;
        }
      }
    } catch (error) {
      command.status = CommandStatus.FAILED;
      command.lastError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  /**
   * Approve a pending request
   */
  async approve(requestId: string, approvedBy: string): Promise<boolean> {
    const request = this.pendingApprovals.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }
    
    request.status = 'approved';
    request.resolvedBy = approvedBy;
    request.resolvedAt = Date.now();
    
    // Update command and execute
    const command = this.commands.get(request.commandId);
    if (command) {
      command.status = CommandStatus.APPROVED;
      command.approvedAt = Date.now();
      await this.executeCommand(command);
    }
    
    return true;
  }

  /**
   * Reject a pending request
   */
  reject(requestId: string, rejectedBy: string, reason: string): boolean {
    const request = this.pendingApprovals.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }
    
    request.status = 'rejected';
    request.resolvedBy = rejectedBy;
    request.resolvedAt = Date.now();
    request.resolution = reason;
    
    // Update command
    const command = this.commands.get(request.commandId);
    if (command) {
      command.status = CommandStatus.CANCELLED;
      command.lastError = `Rejected by ${rejectedBy}: ${reason}`;
    }
    
    return true;
  }

  /**
   * Rollback a command
   */
  async rollback(commandId: string): Promise<{ success: boolean; error?: string }> {
    const command = this.commands.get(commandId);
    if (!command) {
      return { success: false, error: 'Command not found' };
    }
    
    if (!command.rollback?.possible) {
      return { success: false, error: 'Rollback not possible for this command' };
    }
    
    // Generate rollback command
    const rollbackCommand = this.generateRollbackCommand(command);
    if (!rollbackCommand) {
      return { success: false, error: 'Could not generate rollback command' };
    }
    
    // Execute rollback
    await this.executeCommand(rollbackCommand);
    
    if (rollbackCommand.status === CommandStatus.COMPLETED) {
      command.status = CommandStatus.ROLLED_BACK;
      command.rollback.executedAt = Date.now();
      command.rollback.command = rollbackCommand;
      return { success: true };
    }
    
    return { success: false, error: rollbackCommand.lastError };
  }

  /**
   * Generate a rollback command
   */
  private generateRollbackCommand(original: Command): Command | null {
    const rollbackParams: Record<string, unknown> = { ...original.parameters };
    let rollbackType: CommandType;
    
    switch (original.type) {
      case CommandType.MARKET_BUY:
        rollbackType = CommandType.MARKET_SELL;
        break;
      case CommandType.MARKET_SELL:
        rollbackType = CommandType.MARKET_BUY;
        break;
      case CommandType.LIST_PRODUCT:
        rollbackType = CommandType.DELIST_PRODUCT;
        break;
      default:
        return null; // No rollback available
    }
    
    return {
      id: uuidv4(),
      idempotencyKey: `rollback:${original.id}`,
      type: rollbackType,
      status: CommandStatus.PENDING,
      intentId: original.intentId,
      parameters: rollbackParams,
      requiredTier: original.requiredTier,
      requiresApproval: true, // Rollbacks always need approval
      createdAt: Date.now(),
      retries: 0,
      maxRetries: 1,
    };
  }

  /**
   * Halt all execution
   */
  halt(reason: string): void {
    this.halted = true;
    this.haltReason = reason;
    
    // Cancel all pending commands
    for (const command of this.commands.values()) {
      if (command.status === CommandStatus.PENDING || 
          command.status === CommandStatus.VALIDATED ||
          command.status === CommandStatus.AWAITING_APPROVAL) {
        command.status = CommandStatus.CANCELLED;
        command.lastError = `System halted: ${reason}`;
      }
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    this.halted = false;
    this.haltReason = undefined;
  }

  /**
   * Get default tier for command type
   */
  private getDefaultTierForCommand(type: CommandType): AutonomyTier {
    switch (type) {
      case CommandType.MARKET_BUY:
      case CommandType.MARKET_SELL:
        return AutonomyTier.GUARDED_AUTONOMOUS;
      case CommandType.LIMIT_BUY:
      case CommandType.LIMIT_SELL:
        return AutonomyTier.RECOMMEND;
      case CommandType.UPDATE_PRICE:
      case CommandType.LIST_PRODUCT:
        return AutonomyTier.RECOMMEND;
      case CommandType.ALERT_USER:
      case CommandType.SYNC_DATA:
        return AutonomyTier.OBSERVE;
      default:
        return AutonomyTier.RECOMMEND;
    }
  }

  /**
   * Check if approval should be required
   */
  private shouldRequireApproval(type: CommandType, tier: AutonomyTier): boolean {
    // Market orders always need approval unless at FULL_AUTONOMOUS
    if ((type === CommandType.MARKET_BUY || type === CommandType.MARKET_SELL) &&
        this.currentTier !== AutonomyTier.FULL_AUTONOMOUS) {
      return true;
    }
    
    // If required tier is higher than current, need approval
    return this.getTierIndex(tier) > this.getTierIndex(this.currentTier);
  }

  /**
   * Check if rollback is possible
   */
  private isRollbackPossible(command: Command): boolean {
    // Trading commands can be rolled back (sell what was bought)
    if ([CommandType.MARKET_BUY, CommandType.MARKET_SELL].includes(command.type)) {
      return true;
    }
    
    // Listing can be delisted
    if (command.type === CommandType.LIST_PRODUCT) {
      return true;
    }
    
    return false;
  }

  /**
   * Get tier index for comparison
   */
  private getTierIndex(tier: AutonomyTier): number {
    const tiers = [
      AutonomyTier.OBSERVE,
      AutonomyTier.RECOMMEND,
      AutonomyTier.GUARDED_AUTONOMOUS,
      AutonomyTier.FULL_AUTONOMOUS,
    ];
    return tiers.indexOf(tier);
  }

  /**
   * Get command by ID
   */
  getCommand(commandId: string): Command | undefined {
    return this.commands.get(commandId);
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals(): HumanOverrideRequest[] {
    const now = Date.now();
    const pending: HumanOverrideRequest[] = [];
    
    for (const request of this.pendingApprovals.values()) {
      if (request.status === 'pending') {
        if (request.expiresAt < now) {
          request.status = 'expired';
        } else {
          pending.push(request);
        }
      }
    }
    
    return pending;
  }

  /**
   * Get recent commands
   */
  getRecentCommands(limit: number = 50): Command[] {
    return Array.from(this.commands.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalCommands: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    pendingApprovals: number;
    halted: boolean;
    currentTier: AutonomyTier;
  } {
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    
    for (const command of this.commands.values()) {
      byStatus[command.status] = (byStatus[command.status] || 0) + 1;
      byType[command.type] = (byType[command.type] || 0) + 1;
    }
    
    return {
      totalCommands: this.commands.size,
      byStatus,
      byType,
      pendingApprovals: this.getPendingApprovals().length,
      halted: this.halted,
      currentTier: this.currentTier,
    };
  }
}

export default ExecutionFabric;
