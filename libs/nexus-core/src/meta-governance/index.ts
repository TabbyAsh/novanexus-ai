/**
 * NOVA NEXUS META-GOVERNANCE PROTOCOL
 * ====================================
 * Constitutional layer that governs Nova itself.
 * Prevents silent drift, internal capture, and success-driven corruption.
 * 
 * AXIOM 5: Governance Is Above Capability
 * - No capability outranks constraint
 * - No system component may expand authority without evidence
 * - All power is revocable
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// CONSTITUTIONAL VERSIONING
// ============================================================================

export interface ConstitutionalArticle {
  id: string;
  number: number;
  title: string;
  content: string;
  rationale: string;
  
  /** Can this article be amended? */
  amendable: boolean;
  
  /** Requires human signature to modify */
  requiresHumanSignature: boolean;
  
  /** Minimum evidence threshold to modify (0-1) */
  evidenceThreshold: number;
  
  createdAt: number;
  lastAmended?: number;
  amendmentHistory: Amendment[];
}

export interface Amendment {
  id: string;
  articleId: string;
  proposedBy: string;
  proposedAt: number;
  
  previousContent: string;
  newContent: string;
  justification: string;
  evidence: Evidence[];
  
  status: 'proposed' | 'under_review' | 'ratified' | 'rejected' | 'rolled_back';
  
  signatures: Signature[];
  ratifiedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
}

export interface Evidence {
  id: string;
  type: 'performance_data' | 'safety_record' | 'user_feedback' | 'audit_result' | 'external_review';
  source: string;
  data: unknown;
  confidence: number;
  timestamp: number;
  verified: boolean;
}

export interface Signature {
  signerId: string;
  signerType: 'human' | 'system';
  timestamp: number;
  role: 'proposer' | 'reviewer' | 'approver' | 'veto';
  comment?: string;
}

// ============================================================================
// CAPABILITY GOVERNANCE
// ============================================================================

export enum CapabilityType {
  DATA_ACCESS = 'DATA_ACCESS',
  EXECUTION_AUTHORITY = 'EXECUTION_AUTHORITY',
  CAPITAL_CONTROL = 'CAPITAL_CONTROL',
  STRATEGY_MODIFICATION = 'STRATEGY_MODIFICATION',
  SYSTEM_CONFIGURATION = 'SYSTEM_CONFIGURATION',
  USER_INTERACTION = 'USER_INTERACTION',
  EXTERNAL_INTEGRATION = 'EXTERNAL_INTEGRATION',
}

export interface Capability {
  id: string;
  type: CapabilityType;
  name: string;
  description: string;
  
  /** Current authorization level */
  level: 'disabled' | 'restricted' | 'standard' | 'elevated' | 'full';
  
  /** Maximum allowed level */
  maxLevel: 'disabled' | 'restricted' | 'standard' | 'elevated' | 'full';
  
  /** Evidence required to upgrade */
  upgradeRequirements: {
    minPerformanceScore: number;
    minSafetyRecord: number;
    minOperationalDays: number;
    requiresHumanApproval: boolean;
  };
  
  /** Conditions that trigger automatic downgrade */
  downgradeConditions: {
    maxFailureRate: number;
    maxIncidentCount: number;
    maxDrawdown: number;
  };
  
  currentMetrics: {
    performanceScore: number;
    safetyRecord: number;
    operationalDays: number;
    failureRate: number;
    incidentCount: number;
  };
  
  lastEvaluated: number;
  history: CapabilityChange[];
}

export interface CapabilityChange {
  id: string;
  capabilityId: string;
  timestamp: number;
  
  fromLevel: string;
  toLevel: string;
  
  reason: string;
  evidence: Evidence[];
  
  automatic: boolean;
  approvedBy?: string;
  
  reversible: boolean;
  reversedAt?: number;
}

// ============================================================================
// ROLLBACK AUTHORITY
// ============================================================================

export interface RollbackPoint {
  id: string;
  timestamp: number;
  
  /** Type of state captured */
  type: 'constitution' | 'capability' | 'configuration' | 'full_system';
  
  /** Serialized state */
  state: unknown;
  
  /** What triggered this checkpoint */
  trigger: 'scheduled' | 'pre_change' | 'manual' | 'incident';
  
  /** Can this point still be restored? */
  valid: boolean;
  invalidatedAt?: number;
  invalidationReason?: string;
}

export interface RollbackRequest {
  id: string;
  targetPointId: string;
  requestedBy: string;
  requestedAt: number;
  
  reason: string;
  urgency: 'routine' | 'elevated' | 'emergency';
  
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'rejected';
  
  signatures: Signature[];
  executedAt?: number;
  result?: {
    success: boolean;
    error?: string;
    affectedComponents: string[];
  };
}

// ============================================================================
// PROPOSAL SYSTEM
// ============================================================================

export interface Proposal {
  id: string;
  type: 'amendment' | 'capability_upgrade' | 'new_capability' | 'configuration_change' | 'rollback';
  
  title: string;
  description: string;
  justification: string;
  
  proposedBy: string;
  proposedAt: number;
  
  /** Required evidence */
  evidence: Evidence[];
  
  /** Review period in hours */
  reviewPeriod: number;
  
  /** Signatures required for ratification */
  requiredSignatures: {
    human: number;
    system: number;
  };
  
  /** Current signatures */
  signatures: Signature[];
  
  status: 'draft' | 'submitted' | 'under_review' | 'voting' | 'ratified' | 'rejected' | 'expired';
  
  reviewDeadline?: number;
  ratifiedAt?: number;
  rejectedAt?: number;
  
  /** Implementation details */
  implementation?: {
    changes: Array<{
      component: string;
      before: unknown;
      after: unknown;
    }>;
    rollbackPlan: string;
  };
}

// ============================================================================
// META-GOVERNANCE ENGINE
// ============================================================================

export class MetaGovernance {
  private constitution: Map<string, ConstitutionalArticle> = new Map();
  private capabilities: Map<string, Capability> = new Map();
  private proposals: Map<string, Proposal> = new Map();
  private rollbackPoints: Map<string, RollbackPoint> = new Map();
  private rollbackRequests: Map<string, RollbackRequest> = new Map();
  
  private constitutionVersion: number = 1;
  private lastCheckpoint: number = Date.now();

  constructor() {
    this.initializeConstitution();
    this.initializeCapabilities();
    this.createCheckpoint('full_system', 'scheduled');
  }

  // ==========================================================================
  // CONSTITUTION MANAGEMENT
  // ==========================================================================

  /**
   * Initialize the foundational constitution
   */
  private initializeConstitution(): void {
    const articles: Array<Omit<ConstitutionalArticle, 'id' | 'createdAt' | 'amendmentHistory'>> = [
      {
        number: 1,
        title: 'Axiom of Grounding',
        content: 'Every concept must resolve into at least one of: data structure, deterministic logic, decision artifact, executable action, user-visible output, or billable value. If it does not, it is deleted.',
        rationale: 'Prevents abstract concepts from accumulating without practical value.',
        amendable: false,
        requiresHumanSignature: true,
        evidenceThreshold: 1.0,
      },
      {
        number: 2,
        title: 'Axiom of Intelligence Constraint',
        content: 'Intelligence proposes. Execution obeys constraints. Execution never decides. This prevents runaway systems.',
        rationale: 'Maintains clear separation between recommendation and action.',
        amendable: false,
        requiresHumanSignature: true,
        evidenceThreshold: 1.0,
      },
      {
        number: 3,
        title: 'Axiom of Decision Primacy',
        content: 'Nova does not optimize models, indicators, or signals. Nova optimizes decisions over time.',
        rationale: 'Focuses improvement on what matters: decision quality.',
        amendable: false,
        requiresHumanSignature: true,
        evidenceThreshold: 1.0,
      },
      {
        number: 4,
        title: 'Axiom of Sacred Memory',
        content: 'Nothing is overwritten. Everything is replayable. Improvement is measurable. Without this, nothing compounds.',
        rationale: 'Ensures learning and accountability through complete history.',
        amendable: false,
        requiresHumanSignature: true,
        evidenceThreshold: 1.0,
      },
      {
        number: 5,
        title: 'Axiom of Governance Supremacy',
        content: 'No capability outranks constraint. No system component may expand authority without evidence. All power is revocable. Nova is allowed to grow only under governance.',
        rationale: 'Prevents capability from escaping control.',
        amendable: false,
        requiresHumanSignature: true,
        evidenceThreshold: 1.0,
      },
      {
        number: 6,
        title: 'Inaction as Value',
        content: 'Restraint is a first-class output. No-trade decisions, deferred entries, and avoided losses are visible, explainable, and billable.',
        rationale: 'Discipline is a product, not absence of action.',
        amendable: true,
        requiresHumanSignature: true,
        evidenceThreshold: 0.9,
      },
      {
        number: 7,
        title: 'Capability Expansion Protocol',
        content: 'System capabilities may only be expanded through: (1) documented evidence of safe operation, (2) explicit proposal, (3) review period, (4) required signatures, (5) reversibility plan.',
        rationale: 'Structured growth prevents silent authority creep.',
        amendable: true,
        requiresHumanSignature: true,
        evidenceThreshold: 0.85,
      },
      {
        number: 8,
        title: 'Automatic Downgrade Authority',
        content: 'The system shall automatically reduce capability levels when: failure rate exceeds threshold, incidents occur, or drawdown limits are breached. No override is permitted during automatic downgrade.',
        rationale: 'Safety responses cannot be blocked by optimism.',
        amendable: true,
        requiresHumanSignature: true,
        evidenceThreshold: 0.9,
      },
    ];

    for (const article of articles) {
      const full: ConstitutionalArticle = {
        id: uuidv4(),
        ...article,
        createdAt: Date.now(),
        amendmentHistory: [],
      };
      this.constitution.set(full.id, full);
    }
  }

  /**
   * Initialize capability governance
   */
  private initializeCapabilities(): void {
    const capabilityConfigs: Array<Omit<Capability, 'id' | 'lastEvaluated' | 'history'>> = [
      {
        type: CapabilityType.DATA_ACCESS,
        name: 'Data Access',
        description: 'Access to market data, social data, and internal metrics',
        level: 'standard',
        maxLevel: 'full',
        upgradeRequirements: { minPerformanceScore: 0.7, minSafetyRecord: 0.9, minOperationalDays: 30, requiresHumanApproval: false },
        downgradeConditions: { maxFailureRate: 0.1, maxIncidentCount: 5, maxDrawdown: 0.2 },
        currentMetrics: { performanceScore: 0.8, safetyRecord: 1.0, operationalDays: 0, failureRate: 0, incidentCount: 0 },
      },
      {
        type: CapabilityType.EXECUTION_AUTHORITY,
        name: 'Execution Authority',
        description: 'Ability to execute trades and actions',
        level: 'restricted',
        maxLevel: 'elevated',
        upgradeRequirements: { minPerformanceScore: 0.8, minSafetyRecord: 0.95, minOperationalDays: 90, requiresHumanApproval: true },
        downgradeConditions: { maxFailureRate: 0.05, maxIncidentCount: 2, maxDrawdown: 0.1 },
        currentMetrics: { performanceScore: 0, safetyRecord: 1.0, operationalDays: 0, failureRate: 0, incidentCount: 0 },
      },
      {
        type: CapabilityType.CAPITAL_CONTROL,
        name: 'Capital Control',
        description: 'Authority over capital allocation and sizing',
        level: 'restricted',
        maxLevel: 'standard',
        upgradeRequirements: { minPerformanceScore: 0.85, minSafetyRecord: 0.98, minOperationalDays: 180, requiresHumanApproval: true },
        downgradeConditions: { maxFailureRate: 0.03, maxIncidentCount: 1, maxDrawdown: 0.08 },
        currentMetrics: { performanceScore: 0, safetyRecord: 1.0, operationalDays: 0, failureRate: 0, incidentCount: 0 },
      },
      {
        type: CapabilityType.STRATEGY_MODIFICATION,
        name: 'Strategy Modification',
        description: 'Ability to adjust strategy parameters and weights',
        level: 'disabled',
        maxLevel: 'restricted',
        upgradeRequirements: { minPerformanceScore: 0.9, minSafetyRecord: 0.99, minOperationalDays: 365, requiresHumanApproval: true },
        downgradeConditions: { maxFailureRate: 0.02, maxIncidentCount: 1, maxDrawdown: 0.05 },
        currentMetrics: { performanceScore: 0, safetyRecord: 1.0, operationalDays: 0, failureRate: 0, incidentCount: 0 },
      },
      {
        type: CapabilityType.SYSTEM_CONFIGURATION,
        name: 'System Configuration',
        description: 'Ability to modify system parameters',
        level: 'disabled',
        maxLevel: 'restricted',
        upgradeRequirements: { minPerformanceScore: 0.95, minSafetyRecord: 1.0, minOperationalDays: 365, requiresHumanApproval: true },
        downgradeConditions: { maxFailureRate: 0.01, maxIncidentCount: 0, maxDrawdown: 0.03 },
        currentMetrics: { performanceScore: 0, safetyRecord: 1.0, operationalDays: 0, failureRate: 0, incidentCount: 0 },
      },
    ];

    for (const config of capabilityConfigs) {
      const capability: Capability = {
        id: uuidv4(),
        ...config,
        lastEvaluated: Date.now(),
        history: [],
      };
      this.capabilities.set(capability.id, capability);
    }
  }

  // ==========================================================================
  // PROPOSAL MANAGEMENT
  // ==========================================================================

  /**
   * Submit a new proposal
   */
  submitProposal(
    type: Proposal['type'],
    title: string,
    description: string,
    justification: string,
    proposedBy: string,
    evidence: Evidence[],
    implementation?: Proposal['implementation']
  ): Proposal {
    // Determine review period based on type
    let reviewPeriod = 24; // hours
    let requiredSignatures = { human: 1, system: 1 };

    switch (type) {
      case 'amendment':
        reviewPeriod = 168; // 1 week
        requiredSignatures = { human: 2, system: 1 };
        break;
      case 'capability_upgrade':
        reviewPeriod = 72; // 3 days
        requiredSignatures = { human: 1, system: 2 };
        break;
      case 'rollback':
        reviewPeriod = 1; // Emergency can be fast
        requiredSignatures = { human: 1, system: 1 };
        break;
    }

    const proposal: Proposal = {
      id: uuidv4(),
      type,
      title,
      description,
      justification,
      proposedBy,
      proposedAt: Date.now(),
      evidence,
      reviewPeriod,
      requiredSignatures,
      signatures: [],
      status: 'submitted',
      reviewDeadline: Date.now() + reviewPeriod * 60 * 60 * 1000,
      implementation,
    };

    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  /**
   * Sign a proposal
   */
  signProposal(
    proposalId: string,
    signerId: string,
    signerType: 'human' | 'system',
    role: Signature['role'],
    comment?: string
  ): { success: boolean; error?: string } {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { success: false, error: 'Proposal not found' };
    }

    if (proposal.status !== 'submitted' && proposal.status !== 'under_review' && proposal.status !== 'voting') {
      return { success: false, error: `Proposal is ${proposal.status}, cannot sign` };
    }

    // Check for existing signature
    if (proposal.signatures.find(s => s.signerId === signerId)) {
      return { success: false, error: 'Already signed' };
    }

    const signature: Signature = {
      signerId,
      signerType,
      timestamp: Date.now(),
      role,
      comment,
    };

    proposal.signatures.push(signature);

    // Handle veto
    if (role === 'veto') {
      proposal.status = 'rejected';
      proposal.rejectedAt = Date.now();
      return { success: true };
    }

    // Check if ratification requirements met
    const humanApprovals = proposal.signatures.filter(s => s.signerType === 'human' && s.role === 'approver').length;
    const systemApprovals = proposal.signatures.filter(s => s.signerType === 'system' && s.role === 'approver').length;

    if (humanApprovals >= proposal.requiredSignatures.human && 
        systemApprovals >= proposal.requiredSignatures.system) {
      proposal.status = 'ratified';
      proposal.ratifiedAt = Date.now();
    } else {
      proposal.status = 'voting';
    }

    return { success: true };
  }

  /**
   * Get active proposals
   */
  getActiveProposals(): Proposal[] {
    const now = Date.now();
    return Array.from(this.proposals.values())
      .filter(p => 
        p.status === 'submitted' || 
        p.status === 'under_review' || 
        p.status === 'voting'
      )
      .filter(p => !p.reviewDeadline || p.reviewDeadline > now);
  }

  // ==========================================================================
  // CAPABILITY GOVERNANCE
  // ==========================================================================

  /**
   * Evaluate and update capability levels
   */
  evaluateCapabilities(): CapabilityChange[] {
    const changes: CapabilityChange[] = [];

    for (const capability of this.capabilities.values()) {
      const { currentMetrics, downgradeConditions, upgradeRequirements } = capability;

      // Check for automatic downgrade
      const needsDowngrade = 
        currentMetrics.failureRate > downgradeConditions.maxFailureRate ||
        currentMetrics.incidentCount > downgradeConditions.maxIncidentCount;

      if (needsDowngrade && capability.level !== 'disabled') {
        const change = this.downgradeCapability(capability, 'Automatic downgrade due to exceeded thresholds');
        if (change) changes.push(change);
        continue;
      }

      // Check for potential upgrade (requires proposal)
      const meetsUpgradeRequirements =
        currentMetrics.performanceScore >= upgradeRequirements.minPerformanceScore &&
        currentMetrics.safetyRecord >= upgradeRequirements.minSafetyRecord &&
        currentMetrics.operationalDays >= upgradeRequirements.minOperationalDays;

      if (meetsUpgradeRequirements && this.canUpgrade(capability.level, capability.maxLevel)) {
        // Flag for potential upgrade (requires proposal)
        console.log(`[MetaGovernance] Capability ${capability.name} eligible for upgrade proposal`);
      }

      capability.lastEvaluated = Date.now();
    }

    return changes;
  }

  /**
   * Downgrade a capability
   */
  private downgradeCapability(capability: Capability, reason: string): CapabilityChange | null {
    const levels = ['disabled', 'restricted', 'standard', 'elevated', 'full'];
    const currentIndex = levels.indexOf(capability.level);
    
    if (currentIndex <= 0) return null;

    const newLevel = levels[currentIndex - 1] as Capability['level'];
    
    const change: CapabilityChange = {
      id: uuidv4(),
      capabilityId: capability.id,
      timestamp: Date.now(),
      fromLevel: capability.level,
      toLevel: newLevel,
      reason,
      evidence: [],
      automatic: true,
      reversible: true,
    };

    capability.level = newLevel;
    capability.history.push(change);

    console.log(`[MetaGovernance] DOWNGRADE: ${capability.name} ${change.fromLevel} -> ${change.toLevel}`);
    return change;
  }

  /**
   * Check if upgrade is possible
   */
  private canUpgrade(current: string, max: string): boolean {
    const levels = ['disabled', 'restricted', 'standard', 'elevated', 'full'];
    return levels.indexOf(current) < levels.indexOf(max);
  }

  /**
   * Get capability by type
   */
  getCapability(type: CapabilityType): Capability | undefined {
    return Array.from(this.capabilities.values()).find(c => c.type === type);
  }

  /**
   * Check if capability level is sufficient
   */
  hasCapability(type: CapabilityType, requiredLevel: Capability['level']): boolean {
    const capability = this.getCapability(type);
    if (!capability) return false;

    const levels = ['disabled', 'restricted', 'standard', 'elevated', 'full'];
    return levels.indexOf(capability.level) >= levels.indexOf(requiredLevel);
  }

  // ==========================================================================
  // ROLLBACK MANAGEMENT
  // ==========================================================================

  /**
   * Create a rollback checkpoint
   */
  createCheckpoint(
    type: RollbackPoint['type'],
    trigger: RollbackPoint['trigger']
  ): RollbackPoint {
    const state = this.captureState(type);

    const point: RollbackPoint = {
      id: uuidv4(),
      timestamp: Date.now(),
      type,
      state,
      trigger,
      valid: true,
    };

    this.rollbackPoints.set(point.id, point);
    this.lastCheckpoint = Date.now();

    // Keep only last 100 checkpoints
    const points = Array.from(this.rollbackPoints.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (points.length > 100) {
      for (let i = 100; i < points.length; i++) {
        this.rollbackPoints.delete(points[i].id);
      }
    }

    return point;
  }

  /**
   * Capture current state for rollback
   */
  private captureState(type: RollbackPoint['type']): unknown {
    switch (type) {
      case 'constitution':
        return Array.from(this.constitution.entries());
      case 'capability':
        return Array.from(this.capabilities.entries());
      case 'full_system':
        return {
          constitution: Array.from(this.constitution.entries()),
          capabilities: Array.from(this.capabilities.entries()),
          constitutionVersion: this.constitutionVersion,
        };
      default:
        return null;
    }
  }

  /**
   * Request a rollback
   */
  requestRollback(
    targetPointId: string,
    requestedBy: string,
    reason: string,
    urgency: RollbackRequest['urgency']
  ): RollbackRequest | null {
    const point = this.rollbackPoints.get(targetPointId);
    if (!point || !point.valid) {
      return null;
    }

    const request: RollbackRequest = {
      id: uuidv4(),
      targetPointId,
      requestedBy,
      requestedAt: Date.now(),
      reason,
      urgency,
      status: 'pending',
      signatures: [],
    };

    this.rollbackRequests.set(request.id, request);
    return request;
  }

  /**
   * Get available rollback points
   */
  getValidRollbackPoints(): RollbackPoint[] {
    return Array.from(this.rollbackPoints.values())
      .filter(p => p.valid)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get constitution articles
   */
  getConstitution(): ConstitutionalArticle[] {
    return Array.from(this.constitution.values())
      .sort((a, b) => a.number - b.number);
  }

  /**
   * Get all capabilities
   */
  getAllCapabilities(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get governance status
   */
  getStatus(): {
    constitutionVersion: number;
    articleCount: number;
    capabilityCount: number;
    activeProposals: number;
    rollbackPoints: number;
    lastCheckpoint: number;
    capabilityLevels: Record<CapabilityType, string>;
  } {
    const capabilityLevels: Record<CapabilityType, string> = {} as Record<CapabilityType, string>;
    for (const cap of this.capabilities.values()) {
      capabilityLevels[cap.type] = cap.level;
    }

    return {
      constitutionVersion: this.constitutionVersion,
      articleCount: this.constitution.size,
      capabilityCount: this.capabilities.size,
      activeProposals: this.getActiveProposals().length,
      rollbackPoints: Array.from(this.rollbackPoints.values()).filter(p => p.valid).length,
      lastCheckpoint: this.lastCheckpoint,
      capabilityLevels,
    };
  }

  /**
   * Get stats
   */
  getStats(): {
    constitutionVersion: number;
    totalArticles: number;
    amendableArticles: number;
    totalCapabilities: number;
    disabledCapabilities: number;
    totalProposals: number;
    ratifiedProposals: number;
    totalRollbackPoints: number;
  } {
    const articles = Array.from(this.constitution.values());
    const capabilities = Array.from(this.capabilities.values());
    const proposals = Array.from(this.proposals.values());

    return {
      constitutionVersion: this.constitutionVersion,
      totalArticles: articles.length,
      amendableArticles: articles.filter(a => a.amendable).length,
      totalCapabilities: capabilities.length,
      disabledCapabilities: capabilities.filter(c => c.level === 'disabled').length,
      totalProposals: proposals.length,
      ratifiedProposals: proposals.filter(p => p.status === 'ratified').length,
      totalRollbackPoints: this.rollbackPoints.size,
    };
  }
}

export default MetaGovernance;
