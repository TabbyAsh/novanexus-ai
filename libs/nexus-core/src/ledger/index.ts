/**
 * NOVA NEXUS DECISION LEDGER
 * ==========================
 * An immutable, auditable, replayable record of every intent, decision, 
 * action, and outcome. Hash-chained for integrity verification.
 * 
 * This is the system's memory of truth - what actually happened.
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AutonomyTier, DecisionTrace } from '../constitution';
import { Intent } from '../mindspace';

// ============================================================================
// LEDGER ENTRY TYPES
// ============================================================================

export enum LedgerEntryType {
  INTENT_CREATED = 'INTENT_CREATED',
  INTENT_VALIDATED = 'INTENT_VALIDATED',
  INTENT_EXPIRED = 'INTENT_EXPIRED',
  INTENT_REJECTED = 'INTENT_REJECTED',
  
  DECISION_MADE = 'DECISION_MADE',
  DECISION_APPROVED = 'DECISION_APPROVED',
  DECISION_DENIED = 'DECISION_DENIED',
  
  ACTION_STARTED = 'ACTION_STARTED',
  ACTION_COMPLETED = 'ACTION_COMPLETED',
  ACTION_FAILED = 'ACTION_FAILED',
  ACTION_ROLLED_BACK = 'ACTION_ROLLED_BACK',
  
  OUTCOME_RECORDED = 'OUTCOME_RECORDED',
  OUTCOME_EVALUATED = 'OUTCOME_EVALUATED',
  
  TIER_CHANGED = 'TIER_CHANGED',
  CONSTRAINT_VIOLATED = 'CONSTRAINT_VIOLATED',
  DEGRADATION_TRIGGERED = 'DEGRADATION_TRIGGERED',
  
  HUMAN_OVERRIDE = 'HUMAN_OVERRIDE',
  SYSTEM_EVENT = 'SYSTEM_EVENT',
}

export interface LedgerEntry {
  /** Unique identifier for this entry */
  id: string;
  
  /** Sequence number in the ledger (monotonically increasing) */
  sequence: number;
  
  /** Type of entry */
  type: LedgerEntryType;
  
  /** Timestamp of when this entry was created */
  timestamp: number;
  
  /** Hash of the previous entry (for chain integrity) */
  prevHash: string;
  
  /** Hash of this entry */
  hash: string;
  
  /** The domain this entry relates to */
  domain: string;
  
  /** Actor who created this entry */
  actor: {
    type: 'system' | 'agent' | 'human' | 'external';
    id: string;
    name?: string;
  };
  
  /** The actual data payload */
  payload: Record<string, unknown>;
  
  /** Related entry IDs (for linking intents to outcomes) */
  relatedEntries: string[];
  
  /** Tags for filtering and searching */
  tags: string[];
  
  /** Current autonomy tier when entry was created */
  autonomyTier: AutonomyTier;
}

// ============================================================================
// INTENT RECORD - Full record of an intent's lifecycle
// ============================================================================

export interface IntentRecord {
  intentId: string;
  intent: Intent;
  
  lifecycle: {
    created: { timestamp: number; entryId: string };
    validated?: { timestamp: number; entryId: string; result: boolean };
    approved?: { timestamp: number; entryId: string; approvedBy: string };
    denied?: { timestamp: number; entryId: string; deniedBy: string; reason: string };
    executed?: { timestamp: number; entryId: string; actionId: string };
    expired?: { timestamp: number; entryId: string };
  };
  
  outcome?: {
    timestamp: number;
    entryId: string;
    success: boolean;
    metrics: Record<string, number>;
    learnings: string[];
  };
}

// ============================================================================
// DECISION LEDGER
// ============================================================================

export class DecisionLedger {
  private entries: LedgerEntry[] = [];
  private intentRecords: Map<string, IntentRecord> = new Map();
  private sequence: number = 0;
  private genesisHash: string;

  constructor() {
    // Create genesis entry
    this.genesisHash = this.computeHash({
      type: 'GENESIS',
      timestamp: Date.now(),
      message: 'Nova Nexus Decision Ledger Initialized',
    });
  }

  /**
   * Compute SHA-256 hash of data
   */
  private computeHash(data: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Get the hash of the last entry (or genesis hash if empty)
   */
  private getLastHash(): string {
    if (this.entries.length === 0) {
      return this.genesisHash;
    }
    return this.entries[this.entries.length - 1].hash;
  }

  /**
   * Append a new entry to the ledger
   */
  append(
    type: LedgerEntryType,
    domain: string,
    actor: LedgerEntry['actor'],
    payload: Record<string, unknown>,
    options: {
      relatedEntries?: string[];
      tags?: string[];
      autonomyTier?: AutonomyTier;
    } = {}
  ): LedgerEntry {
    const entry: Omit<LedgerEntry, 'hash'> = {
      id: uuidv4(),
      sequence: ++this.sequence,
      type,
      timestamp: Date.now(),
      prevHash: this.getLastHash(),
      domain,
      actor,
      payload,
      relatedEntries: options.relatedEntries ?? [],
      tags: options.tags ?? [],
      autonomyTier: options.autonomyTier ?? AutonomyTier.OBSERVE,
    };

    // Compute hash including all fields
    const hash = this.computeHash(entry);
    const fullEntry: LedgerEntry = { ...entry, hash };

    this.entries.push(fullEntry);
    return fullEntry;
  }

  // ==========================================================================
  // INTENT LIFECYCLE RECORDING
  // ==========================================================================

  /**
   * Record an intent creation
   */
  recordIntentCreated(
    intent: Intent,
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    const entry = this.append(
      LedgerEntryType.INTENT_CREATED,
      'mindspace',
      actor,
      { intent },
      { 
        tags: ['intent', intent.type],
        autonomyTier: tier,
      }
    );

    // Create intent record
    this.intentRecords.set(intent.id, {
      intentId: intent.id,
      intent,
      lifecycle: {
        created: { timestamp: entry.timestamp, entryId: entry.id },
      },
    });

    return entry;
  }

  /**
   * Record intent validation result
   */
  recordIntentValidated(
    intentId: string,
    valid: boolean,
    reasons: string[],
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    const record = this.intentRecords.get(intentId);
    const entry = this.append(
      LedgerEntryType.INTENT_VALIDATED,
      'mindspace',
      actor,
      { intentId, valid, reasons },
      {
        relatedEntries: record ? [record.lifecycle.created.entryId] : [],
        tags: ['intent', 'validation'],
        autonomyTier: tier,
      }
    );

    if (record) {
      record.lifecycle.validated = {
        timestamp: entry.timestamp,
        entryId: entry.id,
        result: valid,
      };
    }

    return entry;
  }

  /**
   * Record intent approval
   */
  recordIntentApproved(
    intentId: string,
    approvedBy: string,
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    const record = this.intentRecords.get(intentId);
    const entry = this.append(
      LedgerEntryType.DECISION_APPROVED,
      'mindspace',
      actor,
      { intentId, approvedBy },
      {
        relatedEntries: record ? [record.lifecycle.created.entryId] : [],
        tags: ['intent', 'approved'],
        autonomyTier: tier,
      }
    );

    if (record) {
      record.lifecycle.approved = {
        timestamp: entry.timestamp,
        entryId: entry.id,
        approvedBy,
      };
    }

    return entry;
  }

  /**
   * Record intent denial
   */
  recordIntentDenied(
    intentId: string,
    deniedBy: string,
    reason: string,
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    const record = this.intentRecords.get(intentId);
    const entry = this.append(
      LedgerEntryType.DECISION_DENIED,
      'mindspace',
      actor,
      { intentId, deniedBy, reason },
      {
        relatedEntries: record ? [record.lifecycle.created.entryId] : [],
        tags: ['intent', 'denied'],
        autonomyTier: tier,
      }
    );

    if (record) {
      record.lifecycle.denied = {
        timestamp: entry.timestamp,
        entryId: entry.id,
        deniedBy,
        reason,
      };
    }

    return entry;
  }

  // ==========================================================================
  // ACTION RECORDING
  // ==========================================================================

  /**
   * Record action started
   */
  recordActionStarted(
    actionId: string,
    intentId: string,
    actionType: string,
    parameters: Record<string, unknown>,
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    const record = this.intentRecords.get(intentId);
    return this.append(
      LedgerEntryType.ACTION_STARTED,
      'execution',
      actor,
      { actionId, intentId, actionType, parameters },
      {
        relatedEntries: record ? [record.lifecycle.created.entryId] : [],
        tags: ['action', 'started', actionType],
        autonomyTier: tier,
      }
    );
  }

  /**
   * Record action completed
   */
  recordActionCompleted(
    actionId: string,
    intentId: string,
    result: Record<string, unknown>,
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    const record = this.intentRecords.get(intentId);
    const entry = this.append(
      LedgerEntryType.ACTION_COMPLETED,
      'execution',
      actor,
      { actionId, intentId, result },
      {
        relatedEntries: record ? [record.lifecycle.created.entryId] : [],
        tags: ['action', 'completed'],
        autonomyTier: tier,
      }
    );

    if (record) {
      record.lifecycle.executed = {
        timestamp: entry.timestamp,
        entryId: entry.id,
        actionId,
      };
    }

    return entry;
  }

  /**
   * Record action failed
   */
  recordActionFailed(
    actionId: string,
    intentId: string,
    error: string,
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    return this.append(
      LedgerEntryType.ACTION_FAILED,
      'execution',
      actor,
      { actionId, intentId, error },
      {
        tags: ['action', 'failed', 'error'],
        autonomyTier: tier,
      }
    );
  }

  /**
   * Record action rollback
   */
  recordActionRolledBack(
    actionId: string,
    intentId: string,
    reason: string,
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    return this.append(
      LedgerEntryType.ACTION_ROLLED_BACK,
      'execution',
      actor,
      { actionId, intentId, reason },
      {
        tags: ['action', 'rollback'],
        autonomyTier: tier,
      }
    );
  }

  // ==========================================================================
  // OUTCOME RECORDING
  // ==========================================================================

  /**
   * Record outcome
   */
  recordOutcome(
    intentId: string,
    success: boolean,
    metrics: Record<string, number>,
    learnings: string[],
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    const record = this.intentRecords.get(intentId);
    const entry = this.append(
      LedgerEntryType.OUTCOME_RECORDED,
      'evaluator',
      actor,
      { intentId, success, metrics, learnings },
      {
        relatedEntries: record ? [record.lifecycle.created.entryId] : [],
        tags: ['outcome', success ? 'success' : 'failure'],
        autonomyTier: tier,
      }
    );

    if (record) {
      record.outcome = {
        timestamp: entry.timestamp,
        entryId: entry.id,
        success,
        metrics,
        learnings,
      };
    }

    return entry;
  }

  // ==========================================================================
  // SYSTEM EVENTS
  // ==========================================================================

  /**
   * Record tier change
   */
  recordTierChange(
    previousTier: AutonomyTier,
    newTier: AutonomyTier,
    reason: string,
    actor: LedgerEntry['actor']
  ): LedgerEntry {
    return this.append(
      LedgerEntryType.TIER_CHANGED,
      'constitution',
      actor,
      { previousTier, newTier, reason },
      {
        tags: ['tier', 'change'],
        autonomyTier: newTier,
      }
    );
  }

  /**
   * Record constraint violation
   */
  recordConstraintViolation(
    constraint: string,
    value: number,
    threshold: number,
    actor: LedgerEntry['actor'],
    tier: AutonomyTier
  ): LedgerEntry {
    return this.append(
      LedgerEntryType.CONSTRAINT_VIOLATED,
      'constitution',
      actor,
      { constraint, value, threshold },
      {
        tags: ['constraint', 'violation', 'alert'],
        autonomyTier: tier,
      }
    );
  }

  /**
   * Record human override
   */
  recordHumanOverride(
    action: string,
    reason: string,
    userId: string,
    tier: AutonomyTier
  ): LedgerEntry {
    return this.append(
      LedgerEntryType.HUMAN_OVERRIDE,
      'control',
      { type: 'human', id: userId },
      { action, reason },
      {
        tags: ['human', 'override'],
        autonomyTier: tier,
      }
    );
  }

  // ==========================================================================
  // CHAIN VERIFICATION
  // ==========================================================================

  /**
   * Verify the integrity of the ledger chain
   */
  verifyChain(): { 
    valid: boolean; 
    brokenAt?: number; 
    reason?: string;
    totalEntries: number;
  } {
    if (this.entries.length === 0) {
      return { valid: true, totalEntries: 0 };
    }

    // Verify first entry links to genesis
    if (this.entries[0].prevHash !== this.genesisHash) {
      return {
        valid: false,
        brokenAt: 0,
        reason: 'First entry does not link to genesis hash',
        totalEntries: this.entries.length,
      };
    }

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      // Verify hash
      const { hash, ...entryWithoutHash } = entry;
      const computedHash = this.computeHash(entryWithoutHash);
      
      if (computedHash !== hash) {
        return {
          valid: false,
          brokenAt: i,
          reason: `Entry ${i} hash mismatch - data may have been tampered`,
          totalEntries: this.entries.length,
        };
      }

      // Verify chain link (except first entry)
      if (i > 0 && entry.prevHash !== this.entries[i - 1].hash) {
        return {
          valid: false,
          brokenAt: i,
          reason: `Entry ${i} prevHash does not match previous entry hash`,
          totalEntries: this.entries.length,
        };
      }

      // Verify sequence
      if (entry.sequence !== i + 1) {
        return {
          valid: false,
          brokenAt: i,
          reason: `Entry ${i} has incorrect sequence number`,
          totalEntries: this.entries.length,
        };
      }
    }

    return { valid: true, totalEntries: this.entries.length };
  }

  // ==========================================================================
  // QUERYING
  // ==========================================================================

  /**
   * Get entries by type
   */
  getByType(type: LedgerEntryType, limit?: number): LedgerEntry[] {
    const results = this.entries.filter(e => e.type === type);
    return limit ? results.slice(-limit) : results;
  }

  /**
   * Get entries by domain
   */
  getByDomain(domain: string, limit?: number): LedgerEntry[] {
    const results = this.entries.filter(e => e.domain === domain);
    return limit ? results.slice(-limit) : results;
  }

  /**
   * Get entries by tag
   */
  getByTag(tag: string, limit?: number): LedgerEntry[] {
    const results = this.entries.filter(e => e.tags.includes(tag));
    return limit ? results.slice(-limit) : results;
  }

  /**
   * Get entries in time range
   */
  getInTimeRange(start: number, end: number): LedgerEntry[] {
    return this.entries.filter(e => e.timestamp >= start && e.timestamp <= end);
  }

  /**
   * Get intent record by ID
   */
  getIntentRecord(intentId: string): IntentRecord | undefined {
    return this.intentRecords.get(intentId);
  }

  /**
   * Get all intent records with outcomes
   */
  getCompletedIntentRecords(): IntentRecord[] {
    return Array.from(this.intentRecords.values())
      .filter(r => r.outcome !== undefined);
  }

  /**
   * Get recent entries
   */
  getRecent(count: number): LedgerEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Get entry by ID
   */
  getEntry(id: string): LedgerEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalEntries: number;
    entriesByType: Record<string, number>;
    entriesByDomain: Record<string, number>;
    intentRecords: number;
    completedIntents: number;
    successfulIntents: number;
    chainValid: boolean;
  } {
    const entriesByType: Record<string, number> = {};
    const entriesByDomain: Record<string, number> = {};

    for (const entry of this.entries) {
      entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1;
      entriesByDomain[entry.domain] = (entriesByDomain[entry.domain] || 0) + 1;
    }

    const completed = this.getCompletedIntentRecords();

    return {
      totalEntries: this.entries.length,
      entriesByType,
      entriesByDomain,
      intentRecords: this.intentRecords.size,
      completedIntents: completed.length,
      successfulIntents: completed.filter(r => r.outcome?.success).length,
      chainValid: this.verifyChain().valid,
    };
  }

  // ==========================================================================
  // REPLAY SUPPORT
  // ==========================================================================

  /**
   * Export ledger for persistence
   */
  export(): {
    genesisHash: string;
    entries: LedgerEntry[];
    intentRecords: [string, IntentRecord][];
  } {
    return {
      genesisHash: this.genesisHash,
      entries: [...this.entries],
      intentRecords: Array.from(this.intentRecords.entries()),
    };
  }

  /**
   * Import ledger from persistence
   */
  import(data: ReturnType<typeof this.export>): { success: boolean; error?: string } {
    // Verify the imported chain
    const tempLedger = new DecisionLedger();
    tempLedger.genesisHash = data.genesisHash;
    tempLedger.entries = data.entries;
    tempLedger.sequence = data.entries.length;

    const verification = tempLedger.verifyChain();
    if (!verification.valid) {
      return { success: false, error: verification.reason };
    }

    // Import if valid
    this.genesisHash = data.genesisHash;
    this.entries = data.entries;
    this.sequence = data.entries.length;
    this.intentRecords = new Map(data.intentRecords);

    return { success: true };
  }

  /**
   * Replay entries to a specific point in time
   */
  replayTo(timestamp: number): LedgerEntry[] {
    return this.entries.filter(e => e.timestamp <= timestamp);
  }
}

export default DecisionLedger;
