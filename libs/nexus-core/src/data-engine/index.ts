/**
 * NOVA NEXUS DATA ENGINE
 * ======================
 * Unified data layer with time-aligned records, feature store,
 * and full lineage tracking. Immutable raw data with derived features.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// DATA DOMAINS
// ============================================================================

export enum DataDomain {
  /** Market microstructure - prices, volumes, order flow */
  MARKET = 'MARKET',
  
  /** Social attention - mentions, sentiment, velocity */
  SOCIAL = 'SOCIAL',
  
  /** Marketplace liquidity - inventory, demand, pricing */
  MARKETPLACE = 'MARKETPLACE',
  
  /** Narrative shifts - news, events, regime changes */
  NARRATIVE = 'NARRATIVE',
  
  /** Internal outcomes - our own trade results, predictions vs actuals */
  INTERNAL = 'INTERNAL',
}

// ============================================================================
// UNIFIED TIMESTAMP - All data aligned to this standard
// ============================================================================

export interface UnifiedTimestamp {
  /** Unix timestamp in milliseconds */
  ts: number;
  
  /** Timezone-aware ISO string */
  iso: string;
  
  /** Market session context */
  session?: 'pre' | 'regular' | 'after' | 'closed';
  
  /** Source timestamp (when the data was generated) */
  sourceTs?: number;
  
  /** Received timestamp (when we received it) */
  receivedTs: number;
}

export function createUnifiedTimestamp(sourceTs?: number): UnifiedTimestamp {
  const now = Date.now();
  return {
    ts: sourceTs ?? now,
    iso: new Date(sourceTs ?? now).toISOString(),
    receivedTs: now,
    sourceTs,
  };
}

// ============================================================================
// RAW DATA RECORD - Immutable
// ============================================================================

export interface RawDataRecord {
  /** Unique identifier */
  id: string;
  
  /** Data domain */
  domain: DataDomain;
  
  /** Data type within domain */
  type: string;
  
  /** Unified timestamp */
  timestamp: UnifiedTimestamp;
  
  /** Source of this data */
  source: {
    name: string;
    type: 'api' | 'websocket' | 'file' | 'manual' | 'computed';
    reliability: number; // 0-1
  };
  
  /** The actual raw data - NEVER modified after creation */
  data: Record<string, unknown>;
  
  /** Hash of the data for integrity */
  hash: string;
  
  /** Tags for filtering */
  tags: string[];
}

// ============================================================================
// FEATURE - Derived from raw data
// ============================================================================

export interface Feature {
  /** Unique identifier */
  id: string;
  
  /** Feature name */
  name: string;
  
  /** Feature value */
  value: number | string | boolean | number[];
  
  /** Timestamp this feature is valid for */
  timestamp: UnifiedTimestamp;
  
  /** Confidence in this feature value */
  confidence: number;
  
  /** Lineage - which raw records and features this was derived from */
  lineage: {
    rawRecordIds: string[];
    featureIds: string[];
    transformations: string[];
  };
  
  /** Time-to-live in milliseconds */
  ttl?: number;
  
  /** Whether this feature can be used in backtests */
  backtestSafe: boolean;
}

// ============================================================================
// FEATURE STORE
// ============================================================================

export class FeatureStore {
  private features: Map<string, Feature[]> = new Map();
  private latestFeatures: Map<string, Feature> = new Map();

  /**
   * Store a feature
   */
  store(feature: Feature): void {
    const key = feature.name;
    
    if (!this.features.has(key)) {
      this.features.set(key, []);
    }
    this.features.get(key)!.push(feature);
    this.latestFeatures.set(key, feature);
  }

  /**
   * Get latest value of a feature
   */
  getLatest(name: string): Feature | undefined {
    return this.latestFeatures.get(name);
  }

  /**
   * Get historical values of a feature
   */
  getHistory(name: string, since?: number, until?: number): Feature[] {
    const history = this.features.get(name) ?? [];
    return history.filter(f => {
      if (since && f.timestamp.ts < since) return false;
      if (until && f.timestamp.ts > until) return false;
      return true;
    });
  }

  /**
   * Get features at a specific point in time (for backtesting)
   */
  getAtTime(name: string, timestamp: number): Feature | undefined {
    const history = this.features.get(name) ?? [];
    // Find the most recent feature before the timestamp that is backtest-safe
    return [...history]
      .filter(f => f.backtestSafe && f.timestamp.ts <= timestamp)
      .sort((a, b) => b.timestamp.ts - a.timestamp.ts)[0];
  }

  /**
   * Get all feature names
   */
  getFeatureNames(): string[] {
    return Array.from(this.features.keys());
  }

  /**
   * Export for persistence
   */
  export(): { features: [string, Feature[]][]; latest: [string, Feature][] } {
    return {
      features: Array.from(this.features.entries()),
      latest: Array.from(this.latestFeatures.entries()),
    };
  }

  /**
   * Import from persistence
   */
  import(data: ReturnType<typeof this.export>): void {
    this.features = new Map(data.features);
    this.latestFeatures = new Map(data.latest);
  }
}

// ============================================================================
// DATA ENGINE
// ============================================================================

export class DataEngine {
  private rawData: Map<string, RawDataRecord[]> = new Map();
  private featureStore: FeatureStore = new FeatureStore();
  private transformations: Map<string, (inputs: RawDataRecord[]) => Feature[]> = new Map();

  /**
   * Compute hash of data
   */
  private computeHash(data: unknown): string {
    // Simple hash for demo - use crypto in production
    return Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 32);
  }

  /**
   * Ingest raw data
   */
  ingest(
    domain: DataDomain,
    type: string,
    data: Record<string, unknown>,
    source: RawDataRecord['source'],
    options: {
      sourceTimestamp?: number;
      tags?: string[];
    } = {}
  ): RawDataRecord {
    const record: RawDataRecord = {
      id: uuidv4(),
      domain,
      type,
      timestamp: createUnifiedTimestamp(options.sourceTimestamp),
      source,
      data,
      hash: this.computeHash(data),
      tags: options.tags ?? [],
    };

    const key = `${domain}:${type}`;
    if (!this.rawData.has(key)) {
      this.rawData.set(key, []);
    }
    this.rawData.get(key)!.push(record);

    // Trigger any registered transformations
    this.runTransformations(domain, type, record);

    return record;
  }

  /**
   * Register a transformation that converts raw data to features
   */
  registerTransformation(
    domain: DataDomain,
    type: string,
    name: string,
    transform: (inputs: RawDataRecord[]) => Feature[]
  ): void {
    const key = `${domain}:${type}:${name}`;
    this.transformations.set(key, transform);
  }

  /**
   * Run transformations for new data
   */
  private runTransformations(domain: DataDomain, type: string, newRecord: RawDataRecord): void {
    const key = `${domain}:${type}`;
    const recentRecords = (this.rawData.get(key) ?? []).slice(-100);

    for (const [transformKey, transform] of this.transformations.entries()) {
      if (transformKey.startsWith(`${domain}:${type}:`)) {
        try {
          const features = transform(recentRecords);
          features.forEach(f => this.featureStore.store(f));
        } catch (error) {
          console.error(`Transformation ${transformKey} failed:`, error);
        }
      }
    }
  }

  /**
   * Query raw data
   */
  queryRaw(
    domain: DataDomain,
    type: string,
    options: {
      since?: number;
      until?: number;
      limit?: number;
      tags?: string[];
    } = {}
  ): RawDataRecord[] {
    const key = `${domain}:${type}`;
    let records = this.rawData.get(key) ?? [];

    if (options.since) {
      records = records.filter(r => r.timestamp.ts >= options.since!);
    }
    if (options.until) {
      records = records.filter(r => r.timestamp.ts <= options.until!);
    }
    if (options.tags && options.tags.length > 0) {
      records = records.filter(r => options.tags!.some(t => r.tags.includes(t)));
    }

    records = records.sort((a, b) => b.timestamp.ts - a.timestamp.ts);

    return options.limit ? records.slice(0, options.limit) : records;
  }

  /**
   * Get feature store
   */
  getFeatureStore(): FeatureStore {
    return this.featureStore;
  }

  /**
   * Get feature value
   */
  getFeature(name: string): Feature | undefined {
    return this.featureStore.getLatest(name);
  }

  /**
   * Get feature at time (for backtesting)
   */
  getFeatureAt(name: string, timestamp: number): Feature | undefined {
    return this.featureStore.getAtTime(name, timestamp);
  }

  /**
   * Create a derived feature
   */
  createFeature(
    name: string,
    value: Feature['value'],
    lineage: Feature['lineage'],
    options: {
      confidence?: number;
      ttl?: number;
      backtestSafe?: boolean;
    } = {}
  ): Feature {
    const feature: Feature = {
      id: uuidv4(),
      name,
      value,
      timestamp: createUnifiedTimestamp(),
      confidence: options.confidence ?? 1.0,
      lineage,
      ttl: options.ttl,
      backtestSafe: options.backtestSafe ?? true,
    };

    this.featureStore.store(feature);
    return feature;
  }

  /**
   * Get data statistics
   */
  getStats(): {
    rawRecordCount: number;
    recordsByDomain: Record<string, number>;
    featureCount: number;
    transformationCount: number;
  } {
    const recordsByDomain: Record<string, number> = {};
    let totalRecords = 0;

    for (const [key, records] of this.rawData.entries()) {
      const domain = key.split(':')[0];
      recordsByDomain[domain] = (recordsByDomain[domain] || 0) + records.length;
      totalRecords += records.length;
    }

    return {
      rawRecordCount: totalRecords,
      recordsByDomain,
      featureCount: this.featureStore.getFeatureNames().length,
      transformationCount: this.transformations.size,
    };
  }

  /**
   * Export for persistence
   */
  export(): {
    rawData: [string, RawDataRecord[]][];
    features: ReturnType<FeatureStore['export']>;
  } {
    return {
      rawData: Array.from(this.rawData.entries()),
      features: this.featureStore.export(),
    };
  }

  /**
   * Import from persistence
   */
  import(data: ReturnType<typeof this.export>): void {
    this.rawData = new Map(data.rawData);
    this.featureStore.import(data.features);
  }
}

export default DataEngine;
