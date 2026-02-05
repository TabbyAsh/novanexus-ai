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
// INVESTMENT SECTOR MODULES
// ============================================================================

// Signal Ingestion - Universal signal capture
export {
  SignalIngestion,
  SignalCategory,
  MarketSignalType,
  AttentionSignalType,
  StructuralSignalType,
  type Signal,
  type MarketSignal,
  type AttentionSignal,
  type StructuralSignal,
  type TranslatedSignal,
  type ConfidenceScore,
  type TemporalRelevance,
  type FailureCondition,
} from './signal-ingestion';

// Strategy Engine - Conditional strategy families
export {
  StrategyEngine,
  StrategyFamily,
  MarketRegime,
  TimeHorizon,
  type Strategy,
  type StrategySignal,
  type EntryCondition,
  type ExitCondition,
} from './strategy-engine';

// Simulation Engine - Pre-execution simulation
export {
  SimulationEngine,
  type SimulationResult,
  type SimulationScenario,
  type DrawdownDistribution,
  type TailRiskMetrics,
  type OpportunityCost,
  type MonteCarloConfig,
} from './simulation-engine';

// Capital Allocator - Dynamic pool management
export {
  CapitalAllocator,
  PoolType,
  type CapitalPool,
  type PoolPosition,
  type AllocationRule,
  type AllocationRequest,
  type AllocationResult,
} from './capital-allocator';

// Watchlist Intelligence - Living watchlists
export {
  WatchlistIntelligence,
  WatchlistType,
  ReadinessState,
  ThesisStatus,
  type Watchlist,
  type WatchlistItem,
  type Catalyst,
  type ReadinessTrigger,
  type ReadinessBlocker,
} from './watchlist';

// ============================================================================
// INTELLIGENCE EMPIRE MODULES
// ============================================================================

// Meta-Governance - Constitutional layer governing Nova itself
export {
  MetaGovernance,
  CapabilityType,
  type ConstitutionalArticle,
  type Amendment,
  type Evidence,
  type Signature,
  type Capability,
  type CapabilityChange,
  type RollbackPoint,
  type RollbackRequest,
  type Proposal,
} from './meta-governance';

// State Lattice - Time-indexed world state graph
export {
  StateLattice,
  NodeType,
  EdgeType,
  type LatticeNode,
  type LatticeEdge,
  type StateSnapshot,
  type LatticeQuery,
  type LatticeQueryResult,
} from './lattice';

// Regime Engine - Environment classification
export {
  RegimeEngine,
  RegimeType,
  RegimeCategory,
  type RegimeIndicator,
  type RegimeEvidence,
  type RegimeState,
  type RegimeTransition,
  type RegimeHistoryEntry,
} from './regime-engine';

// Risk Engine - Survivability constraints
export {
  RiskEngine,
  ConstraintType,
  RiskEventType,
  type Constraint,
  type RiskEnvelope,
  type RiskEvent,
  type PositionRequest,
  type RiskCheckResult,
  type PortfolioRiskState,
} from './risk-engine';

// Trust Ledger - User memory separate from truth
export {
  TrustLedger,
  InteractionType,
  type Explanation,
  type Override,
  type FrictionStep,
  type TrustScore,
  type UserPreferences,
} from './trust-ledger';

// Inaction Artifacts - Restraint as billable value
export {
  InactionEngine,
  InactionType,
  InactionOutcome,
  type InactionArtifact,
  type AvoidedLossReport,
  type RestraintMetrics,
} from './inaction';

// Commerce Intelligence - Marketplace sector
export {
  CommerceIntelligence,
  MarketType,
  DemandState,
  SaturationLevel,
  type ProductAnalysis,
  type TimingWindow,
  type PricingRecommendation,
  type ListingOptimization,
  type CommerceSignal,
} from './commerce';

// Nova Platform - Unified platform layer
export {
  NovaPlatform,
  WorkflowType,
  WorkflowStatus,
  AutomationTier,
  type DecisionWorkflow,
  type WorkflowStage,
  type JournalEntry,
  type AutomationRule,
  type PlatformState,
  type ReplaySession,
} from './platform';

// ============================================================================
// NEXUS - The unified system
// ============================================================================

import { ConstitutionEnforcer, AutonomyTier, DegradationLevel } from './constitution';
import { MindSpace } from './mindspace';
import { DecisionLedger, LedgerEntryType } from './ledger';
import { DataEngine } from './data-engine';
import { Evaluator } from './evaluator';
import { Blender } from './blender';
import { Appraiser } from './appraiser';
import { ExecutionFabric } from './execution';
import { SignalIngestion } from './signal-ingestion';
import { StrategyEngine } from './strategy-engine';
import { SimulationEngine } from './simulation-engine';
import { CapitalAllocator } from './capital-allocator';
import { WatchlistIntelligence } from './watchlist';

// Intelligence Empire modules
import { MetaGovernance } from './meta-governance';
import { StateLattice } from './lattice';
import { RegimeEngine } from './regime-engine';
import { RiskEngine } from './risk-engine';
import { TrustLedger } from './trust-ledger';
import { InactionEngine } from './inaction';
import { CommerceIntelligence } from './commerce';
import { NovaPlatform } from './platform';

/**
 * The Nova Nexus System - Complete Intelligence Empire
 * 
 * 5 SYSTEM AXIOMS:
 * 1. Everything Must Ground - concepts resolve to data, logic, artifact, action, output, or value
 * 2. Intelligence Never Executes - intelligence proposes, execution obeys constraints
 * 3. Decisions Are The Atomic Unit - optimize decisions, not models
 * 4. Memory Is Sacred - nothing overwritten, everything replayable
 * 5. Governance Is Above Capability - no capability outranks constraint
 * 
 * 3 CORE SECTORS:
 * - Investment & Capital Intelligence
 * - Marketplace & Commerce Intelligence
 * - Nova Nexus Platform
 */
export class NovaNexus {
  // Core Components (Foundation Layer)
  public readonly constitution: ConstitutionEnforcer;
  public readonly mind: MindSpace;
  public readonly ledger: DecisionLedger;
  public readonly data: DataEngine;
  public readonly evaluator: Evaluator;
  public readonly blender: Blender;
  public readonly appraiser: Appraiser;
  public readonly executor: ExecutionFabric;
  
  // Investment Sector Components
  public readonly signals: SignalIngestion;
  public readonly strategies: StrategyEngine;
  public readonly simulator: SimulationEngine;
  public readonly capital: CapitalAllocator;
  public readonly watchlist: WatchlistIntelligence;

  // Intelligence Empire Components
  public readonly governance: MetaGovernance;     // Layer 0: Meta-Governance
  public readonly lattice: StateLattice;          // Layer 3: State & Lattice
  public readonly regime: RegimeEngine;           // Layer 4: Intelligence Engines
  public readonly risk: RiskEngine;               // Layer 4: Intelligence Engines
  public readonly trust: TrustLedger;             // Layer 7: Trust Ledger
  public readonly inaction: InactionEngine;       // Inaction as first-class output
  public readonly commerce: CommerceIntelligence; // Sector 2: Commerce
  public readonly platform: NovaPlatform;         // Sector 3: Platform

  private initialized: boolean = false;

  constructor(initialCapital: number = 100000) {
    // Initialize core components
    this.constitution = new ConstitutionEnforcer();
    this.mind = new MindSpace();
    this.ledger = new DecisionLedger();
    this.data = new DataEngine();
    this.evaluator = new Evaluator();
    this.blender = new Blender();
    this.appraiser = new Appraiser();
    this.executor = new ExecutionFabric();
    
    // Initialize Investment Sector components
    this.signals = new SignalIngestion();
    this.strategies = new StrategyEngine();
    this.simulator = new SimulationEngine();
    this.capital = new CapitalAllocator(initialCapital);
    this.watchlist = new WatchlistIntelligence();

    // Initialize Intelligence Empire components
    this.governance = new MetaGovernance();
    this.lattice = new StateLattice();
    this.regime = new RegimeEngine();
    this.risk = new RiskEngine(initialCapital);
    this.trust = new TrustLedger();
    this.inaction = new InactionEngine();
    this.commerce = new CommerceIntelligence();
    this.platform = new NovaPlatform();
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
      LedgerEntryType.SYSTEM_EVENT,
      'system',
      { type: 'system', id: 'nexus' },
      { event: 'initialized', timestamp: Date.now() },
      { tags: ['system', 'startup'] }
    );

    this.initialized = true;
    console.log('[NOVA NEXUS] System initialized at OBSERVE tier');
  }

  /**
   * Get system status - Complete Empire Status
   */
  getStatus(): {
    initialized: boolean;
    // Core
    constitution: ReturnType<ConstitutionEnforcer['getState']>;
    mind: ReturnType<MindSpace['getSummary']>;
    ledger: ReturnType<DecisionLedger['getStats']>;
    data: ReturnType<DataEngine['getStats']>;
    evaluator: ReturnType<Evaluator['getHealthSummary']>;
    blender: ReturnType<Blender['getStats']>;
    appraiser: ReturnType<Appraiser['getStats']>;
    executor: ReturnType<ExecutionFabric['getStats']>;
    // Investment Sector
    signals: ReturnType<SignalIngestion['getStats']>;
    strategies: ReturnType<StrategyEngine['getStats']>;
    simulator: ReturnType<SimulationEngine['getStats']>;
    capital: ReturnType<CapitalAllocator['getStats']>;
    watchlist: ReturnType<WatchlistIntelligence['getStats']>;
    // Intelligence Empire
    governance: ReturnType<MetaGovernance['getStats']>;
    lattice: ReturnType<StateLattice['getStats']>;
    regime: ReturnType<RegimeEngine['getStats']>;
    risk: ReturnType<RiskEngine['getStats']>;
    trust: ReturnType<TrustLedger['getStats']>;
    inaction: ReturnType<InactionEngine['getStats']>;
    commerce: ReturnType<CommerceIntelligence['getStats']>;
    platform: ReturnType<NovaPlatform['getStats']>;
  } {
    return {
      initialized: this.initialized,
      // Core
      constitution: this.constitution.getState(),
      mind: this.mind.getSummary(),
      ledger: this.ledger.getStats(),
      data: this.data.getStats(),
      evaluator: this.evaluator.getHealthSummary(),
      blender: this.blender.getStats(),
      appraiser: this.appraiser.getStats(),
      executor: this.executor.getStats(),
      // Investment Sector
      signals: this.signals.getStats(),
      strategies: this.strategies.getStats(),
      simulator: this.simulator.getStats(),
      capital: this.capital.getStats(),
      watchlist: this.watchlist.getStats(),
      // Intelligence Empire
      governance: this.governance.getStats(),
      lattice: this.lattice.getStats(),
      regime: this.regime.getStats(),
      risk: this.risk.getStats(),
      trust: this.trust.getStats(),
      inaction: this.inaction.getStats(),
      commerce: this.commerce.getStats(),
      platform: this.platform.getStats(),
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
    this.constitution.setDegradationLevel(DegradationLevel.EMERGENCY);
    
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
    this.constitution.setDegradationLevel(DegradationLevel.NORMAL);
    
    console.log('[NOVA NEXUS] System resumed');
  }
}

// Export singleton factory
export function createNexus(): NovaNexus {
  return new NovaNexus();
}

export default NovaNexus;
