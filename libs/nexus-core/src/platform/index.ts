/**
 * NOVA NEXUS PLATFORM LAYER
 * ==========================
 * The unified platform interface that ties all sectors together.
 * Third core sector: Nova Nexus Platform
 * 
 * Provides:
 * - Decision workflows with approval gates
 * - Decision journaling for replay and learning
 * - Guarded automation with tiered execution
 * - Cross-sector coordination
 * - User interface state management
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// WORKFLOW TYPES
// ============================================================================

export enum WorkflowType {
  // Investment workflows
  TRADE_DECISION = 'TRADE_DECISION',
  POSITION_MANAGEMENT = 'POSITION_MANAGEMENT',
  PORTFOLIO_REBALANCE = 'PORTFOLIO_REBALANCE',
  
  // Commerce workflows
  LISTING_DECISION = 'LISTING_DECISION',
  PRICING_DECISION = 'PRICING_DECISION',
  INVENTORY_MANAGEMENT = 'INVENTORY_MANAGEMENT',
  
  // Platform workflows
  AUTOMATION_RULE = 'AUTOMATION_RULE',
  ALERT_RESPONSE = 'ALERT_RESPONSE',
  CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE',
}

export enum WorkflowStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

// ============================================================================
// DECISION WORKFLOW
// ============================================================================

export interface DecisionWorkflow {
  id: string;
  type: WorkflowType;
  status: WorkflowStatus;
  
  /** What is being decided */
  subject: {
    type: string;
    id?: string;
    description: string;
  };
  
  /** Decision stages */
  stages: WorkflowStage[];
  
  /** Current stage index */
  currentStage: number;
  
  /** Final decision */
  decision?: {
    action: string;
    parameters: Record<string, unknown>;
    confidence: number;
  };
  
  /** Approval requirements */
  approvalRequirements: {
    autoApproveThreshold?: number;  // Auto-approve if confidence above
    requiresHuman: boolean;
    approvers?: string[];
  };
  
  /** Execution details */
  execution?: {
    startedAt: number;
    completedAt?: number;
    result?: unknown;
    error?: string;
  };
  
  /** Metadata */
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  
  /** Journal entry reference */
  journalEntryId?: string;
}

export interface WorkflowStage {
  id: string;
  name: string;
  type: 'analysis' | 'recommendation' | 'review' | 'approval' | 'execution' | 'confirmation';
  
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  
  /** Input to this stage */
  input?: unknown;
  
  /** Output from this stage */
  output?: unknown;
  
  /** Who/what is responsible */
  actor: 'system' | 'user' | 'automation';
  
  /** Time tracking */
  startedAt?: number;
  completedAt?: number;
  
  /** Notes */
  notes?: string;
}

// ============================================================================
// DECISION JOURNAL
// ============================================================================

export interface JournalEntry {
  id: string;
  timestamp: number;
  
  /** What type of decision */
  decisionType: WorkflowType;
  
  /** The decision made */
  decision: {
    action: string;
    rationale: string[];
    alternatives: string[];
    confidence: number;
  };
  
  /** Context at decision time */
  context: {
    marketState?: string;
    riskLevel?: number;
    regime?: string;
    portfolioState?: string;
    signals?: string[];
  };
  
  /** Outcome tracking */
  outcome?: {
    recordedAt: number;
    success: boolean;
    actualResult: string;
    expectedVsActual: string;
    lessonsLearned?: string[];
  };
  
  /** Tags for filtering */
  tags: string[];
  
  /** Reference IDs */
  references: {
    workflowId?: string;
    positionId?: string;
    signalIds?: string[];
  };
  
  /** For replay */
  replayable: boolean;
  snapshotId?: string;
}

// ============================================================================
// GUARDED AUTOMATION
// ============================================================================

export enum AutomationTier {
  DISABLED = 0,       // No automation
  NOTIFY_ONLY = 1,    // Generate alerts, no action
  SUGGEST = 2,        // Suggest with one-click approve
  SUPERVISED = 3,     // Execute with confirmation
  AUTONOMOUS = 4,     // Execute within constraints
  FULL = 5,           // Full autonomy (rarely granted)
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  
  /** What triggers this automation */
  trigger: {
    type: 'signal' | 'schedule' | 'threshold' | 'event';
    conditions: Record<string, unknown>;
  };
  
  /** What action to take */
  action: {
    type: string;
    parameters: Record<string, unknown>;
  };
  
  /** Constraints */
  constraints: {
    maxSize?: number;
    maxFrequency?: number;
    allowedHours?: { start: number; end: number };
    requiresRegime?: string[];
    maxRiskLevel?: number;
  };
  
  /** Current tier */
  tier: AutomationTier;
  
  /** History */
  history: Array<{
    timestamp: number;
    triggered: boolean;
    executed: boolean;
    result?: string;
  }>;
  
  /** Is this rule active? */
  active: boolean;
  
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// PLATFORM STATE
// ============================================================================

export interface PlatformState {
  /** Current session */
  session: {
    id: string;
    startedAt: number;
    userId: string;
  };
  
  /** Active workflows */
  activeWorkflows: number;
  pendingApprovals: number;
  
  /** Automation status */
  automation: {
    globalTier: AutomationTier;
    activeRules: number;
    pausedRules: number;
  };
  
  /** System health */
  health: {
    status: 'healthy' | 'degraded' | 'critical';
    components: Record<string, 'ok' | 'warning' | 'error'>;
    lastCheck: number;
  };
  
  /** Notifications */
  notifications: {
    unread: number;
    critical: number;
  };
}

// ============================================================================
// REPLAY SYSTEM
// ============================================================================

export interface ReplaySession {
  id: string;
  
  /** What we're replaying */
  target: {
    type: 'decision' | 'period' | 'workflow';
    id: string;
    description: string;
  };
  
  /** Time range for period replays */
  timeRange?: {
    start: number;
    end: number;
  };
  
  /** State at replay point */
  snapshot: {
    id: string;
    capturedAt: number;
    data: unknown;
  };
  
  /** Replay controls */
  status: 'preparing' | 'ready' | 'playing' | 'paused' | 'completed';
  currentPosition: number;
  totalSteps: number;
  
  /** Annotations */
  annotations: Array<{
    position: number;
    note: string;
    type: 'insight' | 'mistake' | 'success' | 'question';
  }>;
  
  createdAt: number;
  createdBy: string;
}

// ============================================================================
// NOVA NEXUS PLATFORM
// ============================================================================

export class NovaPlatform {
  private workflows: Map<string, DecisionWorkflow> = new Map();
  private journal: Map<string, JournalEntry> = new Map();
  private automationRules: Map<string, AutomationRule> = new Map();
  private replaySessions: Map<string, ReplaySession> = new Map();
  
  private state: PlatformState;
  private globalAutomationTier: AutomationTier = AutomationTier.NOTIFY_ONLY;

  constructor(userId: string = 'default') {
    this.state = {
      session: {
        id: uuidv4(),
        startedAt: Date.now(),
        userId,
      },
      activeWorkflows: 0,
      pendingApprovals: 0,
      automation: {
        globalTier: this.globalAutomationTier,
        activeRules: 0,
        pausedRules: 0,
      },
      health: {
        status: 'healthy',
        components: {},
        lastCheck: Date.now(),
      },
      notifications: {
        unread: 0,
        critical: 0,
      },
    };
  }

  // ==========================================================================
  // WORKFLOW MANAGEMENT
  // ==========================================================================

  /**
   * Create a new decision workflow
   */
  createWorkflow(
    type: WorkflowType,
    subject: DecisionWorkflow['subject'],
    stages: Omit<WorkflowStage, 'id' | 'status'>[],
    options: {
      autoApproveThreshold?: number;
      requiresHuman?: boolean;
      approvers?: string[];
    } = {}
  ): DecisionWorkflow {
    const workflowStages: WorkflowStage[] = stages.map(s => ({
      ...s,
      id: uuidv4(),
      status: 'pending',
    }));

    const workflow: DecisionWorkflow = {
      id: uuidv4(),
      type,
      status: WorkflowStatus.DRAFT,
      subject,
      stages: workflowStages,
      currentStage: 0,
      approvalRequirements: {
        autoApproveThreshold: options.autoApproveThreshold,
        requiresHuman: options.requiresHuman ?? true,
        approvers: options.approvers,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: this.state.session.userId,
    };

    this.workflows.set(workflow.id, workflow);
    this.updateState();

    return workflow;
  }

  /**
   * Progress workflow to next stage
   */
  progressWorkflow(
    workflowId: string,
    stageOutput?: unknown,
    notes?: string
  ): DecisionWorkflow | null {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;

    const currentStage = workflow.stages[workflow.currentStage];
    if (!currentStage) return workflow;

    // Complete current stage
    currentStage.status = 'completed';
    currentStage.completedAt = Date.now();
    currentStage.output = stageOutput;
    if (notes) currentStage.notes = notes;

    // Move to next stage
    workflow.currentStage++;
    workflow.updatedAt = Date.now();

    // Update status based on progress
    if (workflow.currentStage >= workflow.stages.length) {
      workflow.status = WorkflowStatus.COMPLETED;
    } else {
      const nextStage = workflow.stages[workflow.currentStage];
      nextStage.status = 'in_progress';
      nextStage.startedAt = Date.now();

      if (nextStage.type === 'approval') {
        workflow.status = WorkflowStatus.PENDING_APPROVAL;
      } else if (nextStage.type === 'review') {
        workflow.status = WorkflowStatus.PENDING_REVIEW;
      }
    }

    this.updateState();
    return workflow;
  }

  /**
   * Approve a workflow
   */
  approveWorkflow(
    workflowId: string,
    approver: string,
    notes?: string
  ): DecisionWorkflow | null {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.status !== WorkflowStatus.PENDING_APPROVAL) {
      return null;
    }

    const currentStage = workflow.stages[workflow.currentStage];
    if (currentStage.type !== 'approval') return null;

    currentStage.notes = notes;
    workflow.status = WorkflowStatus.APPROVED;

    // Progress to next stage
    return this.progressWorkflow(workflowId, { approvedBy: approver, notes });
  }

  /**
   * Reject a workflow
   */
  rejectWorkflow(
    workflowId: string,
    reason: string
  ): DecisionWorkflow | null {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;

    workflow.status = WorkflowStatus.REJECTED;
    workflow.updatedAt = Date.now();

    const currentStage = workflow.stages[workflow.currentStage];
    if (currentStage) {
      currentStage.status = 'failed';
      currentStage.notes = reason;
    }

    this.updateState();
    return workflow;
  }

  /**
   * Execute workflow action
   */
  async executeWorkflow(
    workflowId: string,
    executor: (decision: DecisionWorkflow['decision']) => Promise<unknown>
  ): Promise<DecisionWorkflow | null> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.status !== WorkflowStatus.APPROVED || !workflow.decision) {
      return null;
    }

    workflow.status = WorkflowStatus.EXECUTING;
    workflow.execution = {
      startedAt: Date.now(),
    };
    workflow.updatedAt = Date.now();

    try {
      const result = await executor(workflow.decision);
      workflow.execution.completedAt = Date.now();
      workflow.execution.result = result;
      workflow.status = WorkflowStatus.COMPLETED;

      // Create journal entry
      this.createJournalEntry(workflow);
    } catch (error) {
      workflow.execution.completedAt = Date.now();
      workflow.execution.error = error instanceof Error ? error.message : String(error);
      workflow.status = WorkflowStatus.FAILED;
    }

    this.updateState();
    return workflow;
  }

  // ==========================================================================
  // DECISION JOURNAL
  // ==========================================================================

  /**
   * Create journal entry from workflow
   */
  private createJournalEntry(workflow: DecisionWorkflow): JournalEntry {
    const entry: JournalEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      decisionType: workflow.type,
      decision: {
        action: workflow.decision?.action ?? 'unknown',
        rationale: workflow.stages
          .filter(s => s.type === 'analysis' || s.type === 'recommendation')
          .map(s => s.notes ?? '')
          .filter(n => n),
        alternatives: [],
        confidence: workflow.decision?.confidence ?? 0,
      },
      context: {},
      tags: [workflow.type, workflow.status],
      references: {
        workflowId: workflow.id,
      },
      replayable: true,
    };

    this.journal.set(entry.id, entry);
    workflow.journalEntryId = entry.id;

    return entry;
  }

  /**
   * Record manual journal entry
   */
  recordJournalEntry(
    decisionType: WorkflowType,
    decision: JournalEntry['decision'],
    context: JournalEntry['context'],
    tags: string[] = []
  ): JournalEntry {
    const entry: JournalEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      decisionType,
      decision,
      context,
      tags,
      references: {},
      replayable: true,
    };

    this.journal.set(entry.id, entry);
    return entry;
  }

  /**
   * Record outcome for journal entry
   */
  recordOutcome(
    entryId: string,
    success: boolean,
    actualResult: string,
    expectedVsActual: string,
    lessonsLearned?: string[]
  ): void {
    const entry = this.journal.get(entryId);
    if (!entry) return;

    entry.outcome = {
      recordedAt: Date.now(),
      success,
      actualResult,
      expectedVsActual,
      lessonsLearned,
    };
  }

  // ==========================================================================
  // AUTOMATION MANAGEMENT
  // ==========================================================================

  /**
   * Create automation rule
   */
  createAutomationRule(
    name: string,
    description: string,
    trigger: AutomationRule['trigger'],
    action: AutomationRule['action'],
    constraints: AutomationRule['constraints'],
    tier: AutomationTier = AutomationTier.NOTIFY_ONLY
  ): AutomationRule {
    const rule: AutomationRule = {
      id: uuidv4(),
      name,
      description,
      trigger,
      action,
      constraints,
      tier: Math.min(tier, this.globalAutomationTier), // Can't exceed global
      history: [],
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.automationRules.set(rule.id, rule);
    this.updateState();

    return rule;
  }

  /**
   * Check if automation should execute
   */
  shouldExecuteAutomation(ruleId: string): {
    shouldExecute: boolean;
    reason: string;
    tier: AutomationTier;
  } {
    const rule = this.automationRules.get(ruleId);
    if (!rule || !rule.active) {
      return { shouldExecute: false, reason: 'Rule not found or inactive', tier: AutomationTier.DISABLED };
    }

    // Check global tier
    if (this.globalAutomationTier < rule.tier) {
      return { 
        shouldExecute: false, 
        reason: `Global tier (${this.globalAutomationTier}) below rule tier (${rule.tier})`,
        tier: this.globalAutomationTier,
      };
    }

    // Check constraints
    if (rule.constraints.allowedHours) {
      const hour = new Date().getHours();
      if (hour < rule.constraints.allowedHours.start || hour > rule.constraints.allowedHours.end) {
        return { shouldExecute: false, reason: 'Outside allowed hours', tier: rule.tier };
      }
    }

    // Check frequency
    if (rule.constraints.maxFrequency) {
      const recentExecutions = rule.history.filter(h => 
        h.executed && h.timestamp > Date.now() - 3600000
      );
      if (recentExecutions.length >= rule.constraints.maxFrequency) {
        return { shouldExecute: false, reason: 'Frequency limit reached', tier: rule.tier };
      }
    }

    // Determine if should execute based on tier
    const shouldExecute = rule.tier >= AutomationTier.SUPERVISED;

    return { 
      shouldExecute, 
      reason: shouldExecute ? 'Conditions met' : 'Tier requires manual approval',
      tier: rule.tier,
    };
  }

  /**
   * Record automation execution
   */
  recordAutomationExecution(
    ruleId: string,
    triggered: boolean,
    executed: boolean,
    result?: string
  ): void {
    const rule = this.automationRules.get(ruleId);
    if (!rule) return;

    rule.history.push({
      timestamp: Date.now(),
      triggered,
      executed,
      result,
    });

    // Keep last 100 entries
    if (rule.history.length > 100) {
      rule.history = rule.history.slice(-100);
    }

    rule.updatedAt = Date.now();
  }

  /**
   * Set global automation tier
   */
  setGlobalAutomationTier(tier: AutomationTier): void {
    this.globalAutomationTier = tier;
    this.state.automation.globalTier = tier;

    // Downgrade any rules above new global tier
    for (const rule of this.automationRules.values()) {
      if (rule.tier > tier) {
        rule.tier = tier;
        rule.updatedAt = Date.now();
      }
    }

    this.updateState();
  }

  // ==========================================================================
  // REPLAY SYSTEM
  // ==========================================================================

  /**
   * Create replay session for a decision
   */
  createReplaySession(
    targetType: 'decision' | 'period' | 'workflow',
    targetId: string,
    description: string,
    snapshot: unknown,
    timeRange?: { start: number; end: number }
  ): ReplaySession {
    const session: ReplaySession = {
      id: uuidv4(),
      target: {
        type: targetType,
        id: targetId,
        description,
      },
      timeRange,
      snapshot: {
        id: uuidv4(),
        capturedAt: Date.now(),
        data: snapshot,
      },
      status: 'preparing',
      currentPosition: 0,
      totalSteps: 1,
      annotations: [],
      createdAt: Date.now(),
      createdBy: this.state.session.userId,
    };

    this.replaySessions.set(session.id, session);
    return session;
  }

  /**
   * Add annotation to replay
   */
  addReplayAnnotation(
    sessionId: string,
    position: number,
    note: string,
    type: 'insight' | 'mistake' | 'success' | 'question'
  ): void {
    const session = this.replaySessions.get(sessionId);
    if (!session) return;

    session.annotations.push({ position, note, type });
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  private updateState(): void {
    const workflows = Array.from(this.workflows.values());
    const rules = Array.from(this.automationRules.values());

    this.state.activeWorkflows = workflows.filter(w => 
      w.status === WorkflowStatus.DRAFT ||
      w.status === WorkflowStatus.PENDING_REVIEW ||
      w.status === WorkflowStatus.PENDING_APPROVAL ||
      w.status === WorkflowStatus.EXECUTING
    ).length;

    this.state.pendingApprovals = workflows.filter(w => 
      w.status === WorkflowStatus.PENDING_APPROVAL
    ).length;

    this.state.automation.activeRules = rules.filter(r => r.active).length;
    this.state.automation.pausedRules = rules.filter(r => !r.active).length;
  }

  /**
   * Update component health
   */
  updateComponentHealth(component: string, status: 'ok' | 'warning' | 'error'): void {
    this.state.health.components[component] = status;
    this.state.health.lastCheck = Date.now();

    // Update overall status
    const statuses = Object.values(this.state.health.components);
    if (statuses.includes('error')) {
      this.state.health.status = 'critical';
    } else if (statuses.includes('warning')) {
      this.state.health.status = 'degraded';
    } else {
      this.state.health.status = 'healthy';
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): DecisionWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get pending workflows
   */
  getPendingWorkflows(): DecisionWorkflow[] {
    return Array.from(this.workflows.values())
      .filter(w => 
        w.status === WorkflowStatus.PENDING_REVIEW ||
        w.status === WorkflowStatus.PENDING_APPROVAL
      )
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Get journal entries
   */
  getJournalEntries(
    options: {
      type?: WorkflowType;
      tags?: string[];
      limit?: number;
      withOutcome?: boolean;
    } = {}
  ): JournalEntry[] {
    let entries = Array.from(this.journal.values());

    if (options.type) {
      entries = entries.filter(e => e.decisionType === options.type);
    }

    if (options.tags && options.tags.length > 0) {
      entries = entries.filter(e => options.tags!.some(t => e.tags.includes(t)));
    }

    if (options.withOutcome !== undefined) {
      entries = entries.filter(e => !!e.outcome === options.withOutcome);
    }

    entries = entries.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get automation rules
   */
  getAutomationRules(activeOnly: boolean = false): AutomationRule[] {
    let rules = Array.from(this.automationRules.values());
    if (activeOnly) {
      rules = rules.filter(r => r.active);
    }
    return rules;
  }

  /**
   * Get platform state
   */
  getState(): PlatformState {
    return { ...this.state };
  }

  /**
   * Get stats
   */
  getStats(): {
    totalWorkflows: number;
    completedWorkflows: number;
    pendingApprovals: number;
    journalEntries: number;
    entriesWithOutcome: number;
    automationRules: number;
    activeRules: number;
    globalTier: AutomationTier;
    healthStatus: string;
  } {
    const workflows = Array.from(this.workflows.values());
    const journal = Array.from(this.journal.values());
    const rules = Array.from(this.automationRules.values());

    return {
      totalWorkflows: workflows.length,
      completedWorkflows: workflows.filter(w => w.status === WorkflowStatus.COMPLETED).length,
      pendingApprovals: workflows.filter(w => w.status === WorkflowStatus.PENDING_APPROVAL).length,
      journalEntries: journal.length,
      entriesWithOutcome: journal.filter(e => e.outcome).length,
      automationRules: rules.length,
      activeRules: rules.filter(r => r.active).length,
      globalTier: this.globalAutomationTier,
      healthStatus: this.state.health.status,
    };
  }
}

export default NovaPlatform;
