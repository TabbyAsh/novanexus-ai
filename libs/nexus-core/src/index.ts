/**
 * NOVA NEXUS CORE
 * ===============
 * Temporal-Grade Intelligence Platform
 * A Cognitive Operating System for Value
 * 
 * This is not a trading bot. This is not an automation script.
 * This is a constitutional AI system with:
 * - Governed autonomy (4-tier progression)
 * - Persistent world model (MindSpace)
 * - Immutable decision records (Ledger)
 * - Truth-grounded evaluation
 * - Cross-domain intelligence synthesis
 * 
 * Power to the User.
 */

// Constitution Layer - Immutable rules
export {
  ConstitutionEnforcer,
  AutonomyTier,
  AUTONOMY_HIERARCHY,
  AUTONOMY_TRANSITION_RULES,
  DegradationLevel,
  DEGRADATION_POLICIES,
  DEFAULT_SURVIVABILITY_CONSTRAINTS,
  type AutonomyTransitionRule,
  type DecisionTrace,
  type SurvivabilityConstraints,
  type DegradationPolicy,
} from './constitution';

// MindSpace - Cognitive Core
export {
  MindSpace,
  IntentType,
  type MemoryEntry,
  type TemporalMemory,
  type Entity,
  type Relationship,
  type WorldStateGraph,
  type Intent,
  type Scenario,
  type AttentionFocus,
  type TimePoint,
} from './mindspace';

// Decision Ledger - Immutable Records
export {
  DecisionLedger,
  LedgerEntryType,
  type LedgerEntry,
  type IntentRecord,
} from './ledger';

// Data Engine - Unified Data Layer
export {
  DataEngine,
  FeatureStore,
  DataDomain,
  createUnifiedTimestamp,
  type UnifiedTimestamp,
  type RawDataRecord,
  type Feature,
} from './data-engine';

// Evaluator - Truth Authority
export {
  Evaluator,
  AuthorityAction,
  CORE_METRICS,
  type MetricDefinition,
  type MetricValue,
  type StrategyEvaluation,
  type AuthorityDecision,
} from './evaluator';

// Blender - Cross-Domain Synthesis
export {
  Blender,
  type OpportunityVector,
  type DomainSignal,
  type SynthesisRule,
} from './blender';

// Appraiser - Valuation Engine
export {
  Appraiser,
  AssetType,
  type ValuationBand,
  type FinancialValuation,
  type CommerceValuation,
} from './appraiser';

// Execution Fabric - Governed Execution
export {
  ExecutionFabric,
  RateLimiter,
  CommandType,
  CommandStatus,
  type Command,
  type RateLimitConfig,
  type HumanOverrideRequest,
} from './execution';

// ============================================================================
// NEXUS - The unified system
// ============================================================================

import { ConstitutionEnforcer, AutonomyTier } from './constitution';
import { MindSpace } from './mindspace';
import { DecisionLedger } from './ledger';
import { DataEngine } from './data-engine';
import { Evaluator } from './evaluator';
import { Blender } from './blender';
import { Appraiser } from './appraiser';
import { ExecutionFabric } from './execution';

/**
 * The Nova Nexus System - all components integrated
 */
export class NovaNexus {
  public readonly constitution: ConstitutionEnforcer;
  public readonly mind: MindSpace;
  public readonly ledger: DecisionLedger;
  public readonly data: DataEngine;
  public readonly evaluator: Evaluator;
  public readonly blender: Blender;
  public readonly appraiser: Appraiser;
  public readonly executor: ExecutionFabric;

  private initialized: boolean = false;

  constructor() {
    // Initialize all components
    this.constitution = new ConstitutionEnforcer();
    this.mind = new MindSpace();
    this.ledger = new DecisionLedger();
    this.data = new DataEngine();
    this.evaluator = new Evaluator();
    this.blender = new Blender();
    this.appraiser = new Appraiser();
    this.executor = new ExecutionFabric();
  }

  /**
   * Initialize the system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Set initial autonomy tier to OBSERVE
    this.executor.setAutonomyTier(AutonomyTier.OBSERVE);

    // Record system start in ledger
    this.ledger.append(
      'SYSTEM_EVENT' as any,
      'system',
      { type: 'system', id: 'nexus' },
      { event: 'initialized', timestamp: Date.now() },
      { tags: ['system', 'startup'] }
    );

    this.initialized = true;
    console.log('[NOVA NEXUS] System initialized at OBSERVE tier');
  }

  /**
   * Get system status
   */
  getStatus(): {
    initialized: boolean;
    constitution: ReturnType<ConstitutionEnforcer['getState']>;
    mind: ReturnType<MindSpace['getSummary']>;
    ledger: ReturnType<DecisionLedger['getStats']>;
    data: ReturnType<DataEngine['getStats']>;
    evaluator: ReturnType<Evaluator['getHealthSummary']>;
    blender: ReturnType<Blender['getStats']>;
    appraiser: ReturnType<Appraiser['getStats']>;
    executor: ReturnType<ExecutionFabric['getStats']>;
  } {
    return {
      initialized: this.initialized,
      constitution: this.constitution.getState(),
      mind: this.mind.getSummary(),
      ledger: this.ledger.getStats(),
      data: this.data.getStats(),
      evaluator: this.evaluator.getHealthSummary(),
      blender: this.blender.getStats(),
      appraiser: this.appraiser.getStats(),
      executor: this.executor.getStats(),
    };
  }

  /**
   * Export all state for persistence
   */
  exportState(): {
    mind: ReturnType<MindSpace['exportState']>;
    ledger: ReturnType<DecisionLedger['export']>;
    data: ReturnType<DataEngine['export']>;
  } {
    return {
      mind: this.mind.exportState(),
      ledger: this.ledger.export(),
      data: this.data.export(),
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: ReturnType<typeof this.exportState>): void {
    this.mind.importState(state.mind);
    this.ledger.import(state.ledger);
    this.data.import(state.data);
  }

  /**
   * Emergency halt
   */
  emergencyHalt(reason: string): void {
    this.executor.halt(reason);
    this.constitution.setDegradationLevel(
      require('./constitution').DegradationLevel.EMERGENCY
    );
    
    this.ledger.recordHumanOverride(
      'EMERGENCY_HALT',
      reason,
      'system',
      this.constitution.getState().tier
    );
    
    console.error(`[NOVA NEXUS] EMERGENCY HALT: ${reason}`);
  }

  /**
   * Resume from halt
   */
  resume(): void {
    this.executor.resume();
    this.constitution.setDegradationLevel(
      require('./constitution').DegradationLevel.NORMAL
    );
    
    console.log('[NOVA NEXUS] System resumed');
  }
}

// Export singleton factory
export function createNexus(): NovaNexus {
  return new NovaNexus();
}

export default NovaNexus;
