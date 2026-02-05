/**
 * NOVA NEXUS MINDSPACE
 * ====================
 * The cognitive core - a persistent world model that maintains context,
 * projects scenarios, and outputs INTENTS (not actions).
 * 
 * Key principle: MindSpace is NOT stateless. It maintains a rich, versioned
 * understanding of the world across time.
 */

import { v4 as uuidv4 } from 'uuid';
import { AutonomyTier } from '../constitution';

// ============================================================================
// TIME-INDEXED MEMORY
// ============================================================================

export interface TimePoint {
  timestamp: number;
  label: string; // e.g., "market_open", "fed_announcement", "earnings_release"
}

export interface MemoryEntry<T = unknown> {
  id: string;
  timestamp: number;
  domain: string;
  type: string;
  data: T;
  confidence: number;
  expiresAt?: number;
  supersededBy?: string; // ID of newer memory that invalidates this one
  tags: string[];
}

export interface TemporalMemory {
  /** Historical states - what happened */
  past: Map<string, MemoryEntry[]>;
  
  /** Current state - what's true now */
  present: Map<string, MemoryEntry>;
  
  /** Projected states - what we expect to happen */
  future: Map<string, MemoryEntry[]>;
  
  /** Key time points for reference */
  timePoints: TimePoint[];
}

// ============================================================================
// WORLD STATE GRAPH
// ============================================================================

export interface Entity {
  id: string;
  type: 'asset' | 'market' | 'indicator' | 'event' | 'thesis' | 'position' | 'agent';
  name: string;
  attributes: Record<string, unknown>;
  lastUpdated: number;
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string; // e.g., "correlates_with", "causes", "invalidates", "supports"
  strength: number; // -1 to 1
  confidence: number;
  validFrom: number;
  validUntil?: number;
}

export interface WorldStateGraph {
  version: number;
  timestamp: number;
  entities: Map<string, Entity>;
  relationships: Map<string, Relationship>;
  activeConstraints: string[];
}

// ============================================================================
// INTENT SYSTEM - MindSpace outputs INTENTS, not actions
// ============================================================================

export enum IntentType {
  OBSERVE = 'OBSERVE',
  ANALYZE = 'ANALYZE',
  RECOMMEND = 'RECOMMEND',
  EXECUTE = 'EXECUTE',
  HEDGE = 'HEDGE',
  EXIT = 'EXIT',
  WAIT = 'WAIT',
  ALERT = 'ALERT',
}

export interface Intent {
  id: string;
  type: IntentType;
  createdAt: number;
  
  /** What the intent aims to achieve */
  objective: string;
  
  /** The proposed action details */
  proposal: {
    action: string;
    target: string;
    parameters: Record<string, unknown>;
  };
  
  /** Confidence in this being the right action */
  confidence: number;
  
  /** Risk envelope - what could go wrong */
  riskEnvelope: {
    maxLoss: number;
    probability: number;
    worstCase: string;
    mitigations: string[];
  };
  
  /** When this intent expires if not acted upon */
  expiresAt: number;
  
  /** Conditions that would invalidate this intent */
  disqualifyingConditions: {
    condition: string;
    threshold?: number;
    currentValue?: number;
  }[];
  
  /** Required autonomy tier to execute */
  requiredTier: AutonomyTier;
  
  /** Supporting evidence */
  reasoning: string[];
  
  /** Related intents that conflict or support */
  relatedIntents: {
    intentId: string;
    relationship: 'supports' | 'conflicts' | 'depends_on';
  }[];
}

// ============================================================================
// SCENARIO FORKING - Counterfactual analysis
// ============================================================================

export interface Scenario {
  id: string;
  name: string;
  description: string;
  probability: number;
  
  /** The assumptions that define this scenario */
  assumptions: {
    variable: string;
    value: unknown;
    confidence: number;
  }[];
  
  /** Projected outcomes under this scenario */
  projectedOutcomes: {
    metric: string;
    value: number;
    timeframe: number; // ms from now
  }[];
  
  /** Actions that would be optimal in this scenario */
  optimalActions: string[];
  
  createdAt: number;
  expiresAt: number;
}

// ============================================================================
// ATTENTION ALLOCATION
// ============================================================================

export interface AttentionFocus {
  domain: string;
  entity?: string;
  weight: number; // 0-1, sum of all weights = 1
  reason: string;
  since: number;
  until?: number;
}

// ============================================================================
// MINDSPACE CORE
// ============================================================================

export class MindSpace {
  private memory: TemporalMemory;
  private worldState: WorldStateGraph;
  private scenarios: Map<string, Scenario>;
  private activeIntents: Map<string, Intent>;
  private attention: AttentionFocus[];
  private stateHistory: WorldStateGraph[];
  private maxHistorySize: number = 1000;

  constructor() {
    this.memory = {
      past: new Map(),
      present: new Map(),
      future: new Map(),
      timePoints: [],
    };
    
    this.worldState = {
      version: 0,
      timestamp: Date.now(),
      entities: new Map(),
      relationships: new Map(),
      activeConstraints: [],
    };
    
    this.scenarios = new Map();
    this.activeIntents = new Map();
    this.attention = [];
    this.stateHistory = [];
  }

  // ==========================================================================
  // MEMORY OPERATIONS
  // ==========================================================================

  /**
   * Store a new memory entry
   */
  remember<T>(
    domain: string,
    type: string,
    data: T,
    options: {
      confidence?: number;
      expiresIn?: number;
      tags?: string[];
      isCurrent?: boolean;
    } = {}
  ): MemoryEntry<T> {
    const entry: MemoryEntry<T> = {
      id: uuidv4(),
      timestamp: Date.now(),
      domain,
      type,
      data,
      confidence: options.confidence ?? 1.0,
      expiresAt: options.expiresIn ? Date.now() + options.expiresIn : undefined,
      tags: options.tags ?? [],
    };

    // Add to past memories
    const pastKey = `${domain}:${type}`;
    if (!this.memory.past.has(pastKey)) {
      this.memory.past.set(pastKey, []);
    }
    this.memory.past.get(pastKey)!.push(entry);

    // If this is current state, update present
    if (options.isCurrent !== false) {
      const existing = this.memory.present.get(pastKey);
      if (existing) {
        existing.supersededBy = entry.id;
      }
      this.memory.present.set(pastKey, entry);
    }

    return entry;
  }

  /**
   * Retrieve memories matching criteria
   */
  recall(
    domain: string,
    type?: string,
    options: {
      since?: number;
      until?: number;
      minConfidence?: number;
      tags?: string[];
      limit?: number;
    } = {}
  ): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    
    for (const [key, entries] of this.memory.past) {
      if (!key.startsWith(domain)) continue;
      if (type && !key.endsWith(`:${type}`)) continue;
      
      for (const entry of entries) {
        if (options.since && entry.timestamp < options.since) continue;
        if (options.until && entry.timestamp > options.until) continue;
        if (options.minConfidence && entry.confidence < options.minConfidence) continue;
        if (options.tags && !options.tags.some(t => entry.tags.includes(t))) continue;
        
        results.push(entry);
      }
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    return options.limit ? results.slice(0, options.limit) : results;
  }

  /**
   * Get current state for a domain/type
   */
  getCurrentState<T>(domain: string, type: string): MemoryEntry<T> | undefined {
    return this.memory.present.get(`${domain}:${type}`) as MemoryEntry<T> | undefined;
  }

  /**
   * Project a future state
   */
  project<T>(
    domain: string,
    type: string,
    data: T,
    timeframe: number,
    confidence: number,
    tags: string[] = []
  ): MemoryEntry<T> {
    const entry: MemoryEntry<T> = {
      id: uuidv4(),
      timestamp: Date.now() + timeframe,
      domain,
      type,
      data,
      confidence,
      tags,
    };

    const key = `${domain}:${type}`;
    if (!this.memory.future.has(key)) {
      this.memory.future.set(key, []);
    }
    this.memory.future.get(key)!.push(entry);

    return entry;
  }

  // ==========================================================================
  // WORLD STATE OPERATIONS
  // ==========================================================================

  /**
   * Add or update an entity in the world state
   */
  upsertEntity(entity: Omit<Entity, 'lastUpdated'>): Entity {
    const existing = this.worldState.entities.get(entity.id);
    const updated: Entity = {
      ...entity,
      lastUpdated: Date.now(),
      attributes: existing 
        ? { ...existing.attributes, ...entity.attributes }
        : entity.attributes,
    };
    
    this.worldState.entities.set(entity.id, updated);
    this.bumpWorldVersion();
    
    return updated;
  }

  /**
   * Create a relationship between entities
   */
  relate(
    sourceId: string,
    targetId: string,
    type: string,
    strength: number,
    confidence: number,
    validUntil?: number
  ): Relationship {
    const relationship: Relationship = {
      id: uuidv4(),
      sourceId,
      targetId,
      type,
      strength,
      confidence,
      validFrom: Date.now(),
      validUntil,
    };
    
    this.worldState.relationships.set(relationship.id, relationship);
    this.bumpWorldVersion();
    
    return relationship;
  }

  /**
   * Get all relationships for an entity
   */
  getRelationships(entityId: string, type?: string): Relationship[] {
    const now = Date.now();
    const results: Relationship[] = [];
    
    for (const rel of this.worldState.relationships.values()) {
      if (rel.sourceId !== entityId && rel.targetId !== entityId) continue;
      if (type && rel.type !== type) continue;
      if (rel.validUntil && rel.validUntil < now) continue;
      
      results.push(rel);
    }
    
    return results;
  }

  /**
   * Save current world state to history
   */
  private bumpWorldVersion(): void {
    this.worldState.version++;
    this.worldState.timestamp = Date.now();
    
    // Store snapshot in history
    if (this.stateHistory.length >= this.maxHistorySize) {
      this.stateHistory.shift();
    }
    
    this.stateHistory.push({
      ...this.worldState,
      entities: new Map(this.worldState.entities),
      relationships: new Map(this.worldState.relationships),
    });
  }

  /**
   * Get world state at a specific version or time
   */
  getHistoricalState(versionOrTime: number, byVersion = true): WorldStateGraph | undefined {
    if (byVersion) {
      return this.stateHistory.find(s => s.version === versionOrTime);
    }
    // Find closest state before the given timestamp
    return [...this.stateHistory]
      .reverse()
      .find(s => s.timestamp <= versionOrTime);
  }

  // ==========================================================================
  // INTENT GENERATION
  // ==========================================================================

  /**
   * Generate a new intent
   */
  createIntent(
    type: IntentType,
    objective: string,
    proposal: Intent['proposal'],
    options: {
      confidence?: number;
      riskEnvelope?: Partial<Intent['riskEnvelope']>;
      expiresIn?: number;
      disqualifyingConditions?: Intent['disqualifyingConditions'];
      requiredTier?: AutonomyTier;
      reasoning?: string[];
    } = {}
  ): Intent {
    const intent: Intent = {
      id: uuidv4(),
      type,
      createdAt: Date.now(),
      objective,
      proposal,
      confidence: options.confidence ?? 0.5,
      riskEnvelope: {
        maxLoss: options.riskEnvelope?.maxLoss ?? 0,
        probability: options.riskEnvelope?.probability ?? 0,
        worstCase: options.riskEnvelope?.worstCase ?? 'Unknown',
        mitigations: options.riskEnvelope?.mitigations ?? [],
      },
      expiresAt: Date.now() + (options.expiresIn ?? 60 * 60 * 1000), // 1 hour default
      disqualifyingConditions: options.disqualifyingConditions ?? [],
      requiredTier: options.requiredTier ?? AutonomyTier.RECOMMEND,
      reasoning: options.reasoning ?? [],
      relatedIntents: [],
    };

    this.activeIntents.set(intent.id, intent);
    return intent;
  }

  /**
   * Check if an intent is still valid
   */
  validateIntent(intentId: string): { valid: boolean; reasons: string[] } {
    const intent = this.activeIntents.get(intentId);
    if (!intent) {
      return { valid: false, reasons: ['Intent not found'] };
    }

    const reasons: string[] = [];
    const now = Date.now();

    // Check expiration
    if (intent.expiresAt < now) {
      reasons.push('Intent has expired');
    }

    // Check disqualifying conditions
    for (const condition of intent.disqualifyingConditions) {
      if (condition.currentValue !== undefined && condition.threshold !== undefined) {
        // This is a simplified check - real implementation would evaluate condition
        if (condition.currentValue > condition.threshold) {
          reasons.push(`Disqualifying condition met: ${condition.condition}`);
        }
      }
    }

    return { valid: reasons.length === 0, reasons };
  }

  /**
   * Get active intents, optionally filtered
   */
  getActiveIntents(filter?: {
    type?: IntentType;
    minConfidence?: number;
    maxTier?: AutonomyTier;
  }): Intent[] {
    const now = Date.now();
    const results: Intent[] = [];

    for (const intent of this.activeIntents.values()) {
      if (intent.expiresAt < now) continue;
      if (filter?.type && intent.type !== filter.type) continue;
      if (filter?.minConfidence && intent.confidence < filter.minConfidence) continue;
      
      results.push(intent);
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Retire an intent (mark as no longer active)
   */
  retireIntent(intentId: string, reason: string): void {
    const intent = this.activeIntents.get(intentId);
    if (intent) {
      // Store in memory before removing
      this.remember('mindspace', 'retired_intent', { intent, reason }, {
        tags: ['intent', 'retired'],
      });
      this.activeIntents.delete(intentId);
    }
  }

  // ==========================================================================
  // SCENARIO FORKING
  // ==========================================================================

  /**
   * Create a new scenario fork
   */
  forkScenario(
    name: string,
    description: string,
    assumptions: Scenario['assumptions'],
    probability: number,
    expiresIn: number = 24 * 60 * 60 * 1000 // 24 hours
  ): Scenario {
    const scenario: Scenario = {
      id: uuidv4(),
      name,
      description,
      probability,
      assumptions,
      projectedOutcomes: [],
      optimalActions: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresIn,
    };

    this.scenarios.set(scenario.id, scenario);
    return scenario;
  }

  /**
   * Add projected outcomes to a scenario
   */
  projectOutcome(
    scenarioId: string,
    metric: string,
    value: number,
    timeframe: number
  ): void {
    const scenario = this.scenarios.get(scenarioId);
    if (scenario) {
      scenario.projectedOutcomes.push({ metric, value, timeframe });
    }
  }

  /**
   * Get all active scenarios
   */
  getScenarios(): Scenario[] {
    const now = Date.now();
    return Array.from(this.scenarios.values())
      .filter(s => s.expiresAt > now)
      .sort((a, b) => b.probability - a.probability);
  }

  // ==========================================================================
  // ATTENTION ALLOCATION
  // ==========================================================================

  /**
   * Set attention focus
   */
  focus(domain: string, weight: number, reason: string, entity?: string): void {
    // Normalize weights
    const totalOtherWeight = this.attention
      .filter(a => a.domain !== domain || a.entity !== entity)
      .reduce((sum, a) => sum + a.weight, 0);
    
    const scaleFactor = totalOtherWeight > 0 ? (1 - weight) / totalOtherWeight : 1;
    
    // Scale existing attention
    this.attention = this.attention
      .filter(a => a.domain !== domain || a.entity !== entity)
      .map(a => ({ ...a, weight: a.weight * scaleFactor }));
    
    // Add new focus
    this.attention.push({
      domain,
      entity,
      weight,
      reason,
      since: Date.now(),
    });
  }

  /**
   * Get current attention allocation
   */
  getAttention(): AttentionFocus[] {
    return [...this.attention].sort((a, b) => b.weight - a.weight);
  }

  // ==========================================================================
  // STATE EXPORT/IMPORT
  // ==========================================================================

  /**
   * Export current state for persistence
   */
  exportState(): {
    memory: { past: [string, MemoryEntry[]][]; present: [string, MemoryEntry][]; };
    worldState: { entities: [string, Entity][]; relationships: [string, Relationship][]; };
    scenarios: [string, Scenario][];
    intents: [string, Intent][];
    attention: AttentionFocus[];
  } {
    return {
      memory: {
        past: Array.from(this.memory.past.entries()),
        present: Array.from(this.memory.present.entries()),
      },
      worldState: {
        entities: Array.from(this.worldState.entities.entries()),
        relationships: Array.from(this.worldState.relationships.entries()),
      },
      scenarios: Array.from(this.scenarios.entries()),
      intents: Array.from(this.activeIntents.entries()),
      attention: this.attention,
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: ReturnType<typeof this.exportState>): void {
    this.memory.past = new Map(state.memory.past);
    this.memory.present = new Map(state.memory.present);
    this.worldState.entities = new Map(state.worldState.entities);
    this.worldState.relationships = new Map(state.worldState.relationships);
    this.scenarios = new Map(state.scenarios);
    this.activeIntents = new Map(state.intents);
    this.attention = state.attention;
  }

  /**
   * Get a summary of current cognitive state
   */
  getSummary(): {
    memoryCount: { past: number; present: number; future: number };
    entityCount: number;
    relationshipCount: number;
    activeIntentCount: number;
    scenarioCount: number;
    topAttention: AttentionFocus[];
    worldVersion: number;
  } {
    return {
      memoryCount: {
        past: Array.from(this.memory.past.values()).reduce((sum, arr) => sum + arr.length, 0),
        present: this.memory.present.size,
        future: Array.from(this.memory.future.values()).reduce((sum, arr) => sum + arr.length, 0),
      },
      entityCount: this.worldState.entities.size,
      relationshipCount: this.worldState.relationships.size,
      activeIntentCount: this.activeIntents.size,
      scenarioCount: this.scenarios.size,
      topAttention: this.attention.slice(0, 3),
      worldVersion: this.worldState.version,
    };
  }
}

export default MindSpace;
