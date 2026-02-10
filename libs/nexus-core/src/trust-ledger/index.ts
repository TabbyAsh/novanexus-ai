/**
 * NOVA NEXUS TRUST LEDGER
 * ========================
 * Bifurcated Memory: User trust memory separate from system truth.
 * 
 * The Truth Ledger records what actually happened.
 * The Trust Ledger records what was explained, accepted, overridden, and learned.
 * 
 * AXIOM 4: Memory Is Sacred
 * - Nothing is overwritten
 * - Everything is replayable
 * - User experience is tracked separately from system state
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// USER INTERACTION TYPES
// ============================================================================

export enum InteractionType {
  // Explanation events
  EXPLANATION_SHOWN = 'EXPLANATION_SHOWN',
  EXPLANATION_ACCEPTED = 'EXPLANATION_ACCEPTED',
  EXPLANATION_QUESTIONED = 'EXPLANATION_QUESTIONED',
  EXPLANATION_REJECTED = 'EXPLANATION_REJECTED',
  
  // Decision events
  RECOMMENDATION_PRESENTED = 'RECOMMENDATION_PRESENTED',
  RECOMMENDATION_ACCEPTED = 'RECOMMENDATION_ACCEPTED',
  RECOMMENDATION_MODIFIED = 'RECOMMENDATION_MODIFIED',
  RECOMMENDATION_REJECTED = 'RECOMMENDATION_REJECTED',
  
  // Override events
  USER_OVERRIDE = 'USER_OVERRIDE',
  OVERRIDE_SUCCEEDED = 'OVERRIDE_SUCCEEDED',
  OVERRIDE_FAILED = 'OVERRIDE_FAILED',
  
  // Friction events
  FRICTION_TRIGGERED = 'FRICTION_TRIGGERED',
  FRICTION_COMPLETED = 'FRICTION_COMPLETED',
  FRICTION_ABANDONED = 'FRICTION_ABANDONED',
  
  // Learning events
  FEEDBACK_PROVIDED = 'FEEDBACK_PROVIDED',
  CORRECTION_SUBMITTED = 'CORRECTION_SUBMITTED',
  PREFERENCE_UPDATED = 'PREFERENCE_UPDATED',
  
  // Trust events
  TRUST_INCREASED = 'TRUST_INCREASED',
  TRUST_DECREASED = 'TRUST_DECREASED',
  TRUST_CALIBRATED = 'TRUST_CALIBRATED',
}

// ============================================================================
// EXPLANATION RECORDS
// ============================================================================

export interface Explanation {
  id: string;
  timestamp: number;
  
  /** What was being explained */
  subject: {
    type: 'decision' | 'recommendation' | 'signal' | 'risk' | 'action' | 'inaction';
    id: string;
    summary: string;
  };
  
  /** The explanation content */
  content: {
    summary: string;
    reasoning: string[];
    evidence: Array<{
      type: string;
      description: string;
      weight: number;
    }>;
    alternatives: string[];
    caveats: string[];
  };
  
  /** Confidence in the explanation */
  confidence: number;
  
  /** Complexity level of explanation */
  complexity: 'simple' | 'standard' | 'detailed' | 'technical';
  
  /** User response */
  response?: {
    type: 'accepted' | 'questioned' | 'rejected' | 'no_response';
    timestamp: number;
    feedback?: string;
    questions?: string[];
  };
  
  /** Was this explanation accurate? (determined after evaluation) */
  accuracy?: {
    score: number;
    determinedAt: number;
    actualOutcome: string;
  };
}

// ============================================================================
// USER OVERRIDE RECORDS
// ============================================================================

export interface Override {
  id: string;
  timestamp: number;
  
  /** What was overridden */
  target: {
    type: 'recommendation' | 'constraint' | 'strategy' | 'position' | 'allocation';
    id: string;
    originalValue: unknown;
  };
  
  /** Override details */
  override: {
    newValue: unknown;
    reason: string;
    userJustification?: string;
  };
  
  /** Friction applied */
  friction: {
    level: 'none' | 'low' | 'medium' | 'high' | 'critical';
    steps: FrictionStep[];
    completed: boolean;
    abandonedAt?: number;
  };
  
  /** Outcome */
  outcome?: {
    success: boolean;
    result: unknown;
    measuredAt: number;
    wasUserRight: boolean;
    impactOnTrust: number;
  };
}

export interface FrictionStep {
  id: string;
  type: 'acknowledgment' | 'confirmation' | 'justification' | 'delay' | 'review' | 'approval';
  required: boolean;
  completed: boolean;
  completedAt?: number;
  
  /** For justification type */
  justification?: string;
  
  /** For delay type */
  delaySeconds?: number;
  
  /** For approval type */
  approvedBy?: string;
}

// ============================================================================
// TRUST SCORE
// ============================================================================

export interface TrustScore {
  /** Overall trust score (0-100) */
  overall: number;
  
  /** Component scores */
  components: {
    /** How well system explains itself */
    explanationQuality: number;
    
    /** How accurate past explanations were */
    explanationAccuracy: number;
    
    /** User's acceptance rate of recommendations */
    acceptanceRate: number;
    
    /** Override success rate */
    overrideSuccessRate: number;
    
    /** System reliability (did it do what it said) */
    reliability: number;
    
    /** Calibration (is confidence accurate) */
    calibration: number;
  };
  
  /** Trust trend */
  trend: 'improving' | 'stable' | 'declining';
  
  /** Recent events affecting trust */
  recentEvents: Array<{
    timestamp: number;
    event: string;
    impact: number;
  }>;
  
  lastUpdated: number;
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

export interface UserPreferences {
  id: string;
  userId: string;
  
  /** Communication preferences */
  communication: {
    explanationDepth: 'minimal' | 'standard' | 'detailed';
    notificationLevel: 'critical_only' | 'important' | 'all';
    preferredFormat: 'text' | 'visual' | 'data';
  };
  
  /** Risk preferences (user-stated) */
  riskPreferences: {
    statedRiskTolerance: 'conservative' | 'moderate' | 'aggressive';
    actualRiskTolerance?: number; // Calculated from behavior
    maxDrawdownTolerance: number;
    preferredVolatility: number;
  };
  
  /** Autonomy preferences */
  autonomy: {
    defaultAutonomyLevel: number; // 1-5
    requireApprovalAbove: number; // Position size threshold
    allowAutoExecute: boolean;
    frictionPreference: 'minimal' | 'standard' | 'maximum';
  };
  
  /** Historical preferences learned from behavior */
  learned: {
    preferredHoldingPeriod?: number;
    favoriteSectors?: string[];
    avoidedSectors?: string[];
    tradingTimes?: Array<{ start: number; end: number }>;
    overridePatterns?: string[];
  };
  
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// TRUST LEDGER ENGINE
// ============================================================================

export class TrustLedger {
  private explanations: Map<string, Explanation> = new Map();
  private overrides: Map<string, Override> = new Map();
  private interactions: Array<{ id: string; type: InteractionType; timestamp: number; data: unknown }> = [];
  private preferences: Map<string, UserPreferences> = new Map();
  private trustScores: Map<string, TrustScore> = new Map();
  
  /** Default user ID for single-user mode */
  private defaultUserId: string = 'default';

  constructor() {
    this.initializeDefaultPreferences();
    this.initializeDefaultTrustScore();
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  private initializeDefaultPreferences(): void {
    const defaultPrefs: UserPreferences = {
      id: uuidv4(),
      userId: this.defaultUserId,
      communication: {
        explanationDepth: 'standard',
        notificationLevel: 'important',
        preferredFormat: 'text',
      },
      riskPreferences: {
        statedRiskTolerance: 'moderate',
        maxDrawdownTolerance: 15,
        preferredVolatility: 15,
      },
      autonomy: {
        defaultAutonomyLevel: 2,
        requireApprovalAbove: 5000,
        allowAutoExecute: false,
        frictionPreference: 'standard',
      },
      learned: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.preferences.set(this.defaultUserId, defaultPrefs);
  }

  private initializeDefaultTrustScore(): void {
    const defaultScore: TrustScore = {
      overall: 50, // Start neutral
      components: {
        explanationQuality: 50,
        explanationAccuracy: 50,
        acceptanceRate: 50,
        overrideSuccessRate: 50,
        reliability: 50,
        calibration: 50,
      },
      trend: 'stable',
      recentEvents: [],
      lastUpdated: Date.now(),
    };

    this.trustScores.set(this.defaultUserId, defaultScore);
  }

  // ==========================================================================
  // EXPLANATION MANAGEMENT
  // ==========================================================================

  /**
   * Record an explanation shown to user
   */
  recordExplanation(
    subject: Explanation['subject'],
    content: Explanation['content'],
    confidence: number,
    complexity: Explanation['complexity'] = 'standard'
  ): Explanation {
    const explanation: Explanation = {
      id: uuidv4(),
      timestamp: Date.now(),
      subject,
      content,
      confidence,
      complexity,
    };

    this.explanations.set(explanation.id, explanation);
    this.recordInteraction(InteractionType.EXPLANATION_SHOWN, { explanationId: explanation.id });

    return explanation;
  }

  /**
   * Record user response to explanation
   */
  recordExplanationResponse(
    explanationId: string,
    responseType: 'accepted' | 'questioned' | 'rejected',
    feedback?: string,
    questions?: string[]
  ): void {
    const explanation = this.explanations.get(explanationId);
    if (!explanation) return;

    explanation.response = {
      type: responseType,
      timestamp: Date.now(),
      feedback,
      questions,
    };

    // Record interaction and update trust
    const interactionType = responseType === 'accepted' 
      ? InteractionType.EXPLANATION_ACCEPTED
      : responseType === 'questioned'
        ? InteractionType.EXPLANATION_QUESTIONED
        : InteractionType.EXPLANATION_REJECTED;

    this.recordInteraction(interactionType, { explanationId, feedback, questions });

    // Update trust based on response
    const trustImpact = responseType === 'accepted' ? 1 
      : responseType === 'questioned' ? 0 
      : -2;
    this.updateTrustScore(trustImpact, `Explanation ${responseType}`);
  }

  /**
   * Update explanation accuracy after outcome is known
   */
  updateExplanationAccuracy(
    explanationId: string,
    accuracyScore: number,
    actualOutcome: string
  ): void {
    const explanation = this.explanations.get(explanationId);
    if (!explanation) return;

    explanation.accuracy = {
      score: accuracyScore,
      determinedAt: Date.now(),
      actualOutcome,
    };

    // Update trust based on accuracy
    const trustImpact = (accuracyScore - 0.5) * 10; // -5 to +5
    this.updateTrustScore(trustImpact, `Explanation accuracy: ${(accuracyScore * 100).toFixed(0)}%`);
  }

  // ==========================================================================
  // OVERRIDE MANAGEMENT
  // ==========================================================================

  /**
   * Initiate a user override with appropriate friction
   */
  initiateOverride(
    target: Override['target'],
    newValue: unknown,
    reason: string
  ): Override {
    // Determine friction level based on override type and current trust
    const frictionLevel = this.determineFrictionLevel(target, newValue);
    const frictionSteps = this.generateFrictionSteps(frictionLevel);

    const override: Override = {
      id: uuidv4(),
      timestamp: Date.now(),
      target,
      override: {
        newValue,
        reason,
      },
      friction: {
        level: frictionLevel,
        steps: frictionSteps,
        completed: frictionLevel === 'none',
      },
    };

    this.overrides.set(override.id, override);
    this.recordInteraction(InteractionType.USER_OVERRIDE, { overrideId: override.id });

    if (frictionLevel !== 'none') {
      this.recordInteraction(InteractionType.FRICTION_TRIGGERED, { 
        overrideId: override.id, 
        level: frictionLevel 
      });
    }

    return override;
  }

  /**
   * Complete a friction step
   */
  completeFrictionStep(
    overrideId: string,
    stepId: string,
    data?: { justification?: string; approvedBy?: string }
  ): boolean {
    const override = this.overrides.get(overrideId);
    if (!override) return false;

    const step = override.friction.steps.find(s => s.id === stepId);
    if (!step || step.completed) return false;

    step.completed = true;
    step.completedAt = Date.now();
    
    if (data?.justification) {
      step.justification = data.justification;
      override.override.userJustification = data.justification;
    }
    if (data?.approvedBy) {
      step.approvedBy = data.approvedBy;
    }

    // Check if all required steps completed
    const allRequired = override.friction.steps.filter(s => s.required);
    const allCompleted = allRequired.every(s => s.completed);
    
    if (allCompleted) {
      override.friction.completed = true;
      this.recordInteraction(InteractionType.FRICTION_COMPLETED, { overrideId });
    }

    return allCompleted;
  }

  /**
   * Record override outcome
   */
  recordOverrideOutcome(
    overrideId: string,
    success: boolean,
    result: unknown,
    wasUserRight: boolean
  ): void {
    const override = this.overrides.get(overrideId);
    if (!override) return;

    const impactOnTrust = wasUserRight ? 5 : -3;

    override.outcome = {
      success,
      result,
      measuredAt: Date.now(),
      wasUserRight,
      impactOnTrust,
    };

    const interactionType = success 
      ? InteractionType.OVERRIDE_SUCCEEDED 
      : InteractionType.OVERRIDE_FAILED;
    
    this.recordInteraction(interactionType, { overrideId, wasUserRight });
    this.updateTrustScore(impactOnTrust, `Override ${wasUserRight ? 'correct' : 'incorrect'}`);
  }

  /**
   * Determine appropriate friction level
   */
  private determineFrictionLevel(
    target: Override['target'],
    newValue: unknown
  ): Override['friction']['level'] {
    const preferences = this.preferences.get(this.defaultUserId);
    const trustScore = this.trustScores.get(this.defaultUserId);
    
    // Base friction on target type
    let baseFriction: number;
    switch (target.type) {
      case 'constraint':
        baseFriction = 4; // High - constraints are protective
        break;
      case 'position':
        baseFriction = 2;
        break;
      case 'recommendation':
        baseFriction = 1;
        break;
      default:
        baseFriction = 2;
    }

    // Adjust based on trust score
    if (trustScore) {
      if (trustScore.overall > 70) {
        baseFriction = Math.max(0, baseFriction - 1);
      } else if (trustScore.overall < 30) {
        baseFriction = Math.min(4, baseFriction + 1);
      }
    }

    // Adjust based on user preference
    if (preferences?.autonomy.frictionPreference === 'minimal') {
      baseFriction = Math.max(0, baseFriction - 1);
    } else if (preferences?.autonomy.frictionPreference === 'maximum') {
      baseFriction = Math.min(4, baseFriction + 1);
    }

    const levels: Override['friction']['level'][] = ['none', 'low', 'medium', 'high', 'critical'];
    return levels[baseFriction];
  }

  /**
   * Generate friction steps based on level
   */
  private generateFrictionSteps(level: Override['friction']['level']): FrictionStep[] {
    const steps: FrictionStep[] = [];

    if (level === 'none') return steps;

    // Low: Simple acknowledgment
    if (level === 'low' || level === 'medium' || level === 'high' || level === 'critical') {
      steps.push({
        id: uuidv4(),
        type: 'acknowledgment',
        required: true,
        completed: false,
      });
    }

    // Medium: Add confirmation
    if (level === 'medium' || level === 'high' || level === 'critical') {
      steps.push({
        id: uuidv4(),
        type: 'confirmation',
        required: true,
        completed: false,
      });
    }

    // High: Add justification
    if (level === 'high' || level === 'critical') {
      steps.push({
        id: uuidv4(),
        type: 'justification',
        required: true,
        completed: false,
      });
    }

    // Critical: Add delay and review
    if (level === 'critical') {
      steps.push({
        id: uuidv4(),
        type: 'delay',
        required: true,
        completed: false,
        delaySeconds: 60,
      });
      steps.push({
        id: uuidv4(),
        type: 'review',
        required: true,
        completed: false,
      });
    }

    return steps;
  }

  // ==========================================================================
  // TRUST SCORE MANAGEMENT
  // ==========================================================================

  /**
   * Update trust score
   */
  private updateTrustScore(impact: number, reason: string): void {
    const score = this.trustScores.get(this.defaultUserId);
    if (!score) return;

    // Update overall score
    score.overall = Math.max(0, Math.min(100, score.overall + impact));

    // Record event
    score.recentEvents.push({
      timestamp: Date.now(),
      event: reason,
      impact,
    });

    // Keep only last 50 events
    if (score.recentEvents.length > 50) {
      score.recentEvents = score.recentEvents.slice(-50);
    }

    // Calculate trend
    const recentImpacts = score.recentEvents
      .filter(e => e.timestamp > Date.now() - 86400000 * 7) // Last 7 days
      .map(e => e.impact);
    
    const avgImpact = recentImpacts.length > 0 
      ? recentImpacts.reduce((a, b) => a + b, 0) / recentImpacts.length 
      : 0;

    score.trend = avgImpact > 0.5 ? 'improving' 
      : avgImpact < -0.5 ? 'declining' 
      : 'stable';

    score.lastUpdated = Date.now();
  }

  /**
   * Recalculate component scores
   */
  recalculateComponentScores(): void {
    const score = this.trustScores.get(this.defaultUserId);
    if (!score) return;

    // Explanation quality - based on acceptance rate
    const explanations = Array.from(this.explanations.values());
    const respondedExplanations = explanations.filter(e => e.response);
    const acceptedCount = respondedExplanations.filter(e => e.response?.type === 'accepted').length;
    score.components.explanationQuality = respondedExplanations.length > 0
      ? (acceptedCount / respondedExplanations.length) * 100
      : 50;

    // Explanation accuracy - based on accuracy scores
    const scoredExplanations = explanations.filter(e => e.accuracy);
    score.components.explanationAccuracy = scoredExplanations.length > 0
      ? (scoredExplanations.reduce((sum, e) => sum + (e.accuracy?.score ?? 0), 0) / scoredExplanations.length) * 100
      : 50;

    // Override success rate
    const overrides = Array.from(this.overrides.values()).filter(o => o.outcome);
    const successfulOverrides = overrides.filter(o => o.outcome?.wasUserRight);
    score.components.overrideSuccessRate = overrides.length > 0
      ? (successfulOverrides.length / overrides.length) * 100
      : 50;

    // Recalculate overall as weighted average
    const weights = {
      explanationQuality: 0.2,
      explanationAccuracy: 0.25,
      acceptanceRate: 0.15,
      overrideSuccessRate: 0.15,
      reliability: 0.15,
      calibration: 0.1,
    };

    score.overall = Object.entries(score.components).reduce((sum, [key, value]) => {
      const weight = weights[key as keyof typeof weights] ?? 0.1;
      return sum + value * weight;
    }, 0);

    score.lastUpdated = Date.now();
  }

  // ==========================================================================
  // INTERACTION RECORDING
  // ==========================================================================

  private recordInteraction(
    type: InteractionType,
    data: unknown
  ): void {
    this.interactions.push({
      id: uuidv4(),
      type,
      timestamp: Date.now(),
      data,
    });

    // Keep last 10000 interactions
    if (this.interactions.length > 10000) {
      this.interactions = this.interactions.slice(-10000);
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get user preferences
   */
  getPreferences(userId?: string): UserPreferences | undefined {
    return this.preferences.get(userId ?? this.defaultUserId);
  }

  /**
   * Update user preferences
   */
  updatePreferences(updates: Partial<UserPreferences>, userId?: string): void {
    const prefs = this.preferences.get(userId ?? this.defaultUserId);
    if (!prefs) return;

    if (updates.communication) {
      prefs.communication = { ...prefs.communication, ...updates.communication };
    }
    if (updates.riskPreferences) {
      prefs.riskPreferences = { ...prefs.riskPreferences, ...updates.riskPreferences };
    }
    if (updates.autonomy) {
      prefs.autonomy = { ...prefs.autonomy, ...updates.autonomy };
    }
    if (updates.learned) {
      prefs.learned = { ...prefs.learned, ...updates.learned };
    }
    prefs.updatedAt = Date.now();

    this.recordInteraction(InteractionType.PREFERENCE_UPDATED, updates);
  }

  /**
   * Get trust score
   */
  getTrustScore(userId?: string): TrustScore | undefined {
    return this.trustScores.get(userId ?? this.defaultUserId);
  }

  /**
   * Get explanation by ID
   */
  getExplanation(explanationId: string): Explanation | undefined {
    return this.explanations.get(explanationId);
  }

  /**
   * Get recent explanations
   */
  getRecentExplanations(limit: number = 20): Explanation[] {
    return Array.from(this.explanations.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get override by ID
   */
  getOverride(overrideId: string): Override | undefined {
    return this.overrides.get(overrideId);
  }

  /**
   * Get pending overrides (friction not completed)
   */
  getPendingOverrides(): Override[] {
    return Array.from(this.overrides.values())
      .filter(o => !o.friction.completed && !o.friction.abandonedAt);
  }

  /**
   * Get interaction history
   */
  getInteractionHistory(
    types?: InteractionType[],
    limit: number = 100
  ): Array<{ id: string; type: InteractionType; timestamp: number; data: unknown }> {
    let history = [...this.interactions].reverse();
    
    if (types && types.length > 0) {
      history = history.filter(i => types.includes(i.type));
    }
    
    return history.slice(0, limit);
  }

  /**
   * Get stats
   */
  getStats(): {
    trustScore: number;
    trustTrend: string;
    totalExplanations: number;
    acceptedExplanations: number;
    totalOverrides: number;
    pendingOverrides: number;
    successfulOverrides: number;
    interactionCount: number;
  } {
    const trustScore = this.trustScores.get(this.defaultUserId);
    const explanations = Array.from(this.explanations.values());
    const overrides = Array.from(this.overrides.values());

    return {
      trustScore: trustScore?.overall ?? 50,
      trustTrend: trustScore?.trend ?? 'stable',
      totalExplanations: explanations.length,
      acceptedExplanations: explanations.filter(e => e.response?.type === 'accepted').length,
      totalOverrides: overrides.length,
      pendingOverrides: overrides.filter(o => !o.friction.completed && !o.friction.abandonedAt).length,
      successfulOverrides: overrides.filter(o => o.outcome?.wasUserRight).length,
      interactionCount: this.interactions.length,
    };
  }
}

export default TrustLedger;
