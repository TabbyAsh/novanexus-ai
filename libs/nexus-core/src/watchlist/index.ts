/**
 * NOVA NEXUS WATCHLIST INTELLIGENCE
 * ==================================
 * Living watchlists with regime compatibility, attention trajectory,
 * thesis tracking, and dynamic readiness states.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// WATCHLIST TYPES
// ============================================================================

export enum WatchlistType {
  ACTIVE_OPPORTUNITY = 'ACTIVE_OPPORTUNITY',
  THESIS_TRACKING = 'THESIS_TRACKING',
  ATTENTION_SURGE = 'ATTENTION_SURGE',
  CATALYST_PENDING = 'CATALYST_PENDING',
  REGIME_FAVORABLE = 'REGIME_FAVORABLE',
  HISTORICAL = 'HISTORICAL',
}

export enum ReadinessState {
  NOT_READY = 'NOT_READY',
  WARMING_UP = 'WARMING_UP',
  READY = 'READY',
  OPTIMAL = 'OPTIMAL',
  COOLING_DOWN = 'COOLING_DOWN',
  MISSED = 'MISSED',
}

export enum ThesisStatus {
  FORMING = 'FORMING',
  VALIDATED = 'VALIDATED',
  ACTIVE = 'ACTIVE',
  CHALLENGED = 'CHALLENGED',
  INVALIDATED = 'INVALIDATED',
  COMPLETED = 'COMPLETED',
}

// ============================================================================
// WATCHLIST ITEM
// ============================================================================

export interface WatchlistItem {
  id: string;
  symbol: string;
  addedAt: number;
  updatedAt: number;
  
  /** Current watchlist type */
  watchlistType: WatchlistType;
  
  /** Item metadata */
  metadata: {
    name: string;
    sector?: string;
    marketCap?: number;
    avgVolume?: number;
    tags: string[];
  };
  
  /** Thesis */
  thesis: {
    status: ThesisStatus;
    summary: string;
    bullCase: string[];
    bearCase: string[];
    catalysts: Catalyst[];
    priceTargets: {
      bull: number;
      base: number;
      bear: number;
    };
    timeframe: 'short' | 'medium' | 'long';
    confidence: number;
    lastValidated: number;
  };
  
  /** Regime compatibility */
  regimeCompatibility: {
    currentRegime: string;
    compatibilityScore: number; // 0-1
    favorableRegimes: string[];
    unfavorableRegimes: string[];
    regimeHistory: Array<{
      regime: string;
      performance: number;
      timestamp: number;
    }>;
  };
  
  /** Attention tracking */
  attention: {
    currentScore: number;
    trajectory: 'rising' | 'falling' | 'stable';
    velocityChange: number;
    peakScore: number;
    peakTimestamp: number;
    attentionHistory: Array<{
      score: number;
      timestamp: number;
    }>;
  };
  
  /** Readiness state */
  readiness: {
    state: ReadinessState;
    score: number; // 0-1
    triggers: ReadinessTrigger[];
    blockers: ReadinessBlocker[];
    lastStateChange: number;
    optimalWindowStart?: number;
    optimalWindowEnd?: number;
  };
  
  /** Technical levels */
  technicals: {
    currentPrice: number;
    support: number[];
    resistance: number[];
    trend: 'bullish' | 'bearish' | 'neutral';
    rsi?: number;
    momentum: number;
    volatility: number;
  };
  
  /** Notes and alerts */
  notes: WatchlistNote[];
  alerts: WatchlistAlert[];
  
  /** Scoring */
  scores: {
    overall: number;
    fundamental: number;
    technical: number;
    sentiment: number;
    momentum: number;
    risk: number;
  };
}

export interface Catalyst {
  id: string;
  type: 'earnings' | 'product' | 'regulatory' | 'macro' | 'sector' | 'other';
  description: string;
  expectedDate?: number;
  impact: 'high' | 'medium' | 'low';
  direction: 'bullish' | 'bearish' | 'neutral';
  occurred: boolean;
  outcome?: string;
}

export interface ReadinessTrigger {
  id: string;
  condition: string;
  met: boolean;
  weight: number;
  lastChecked: number;
}

export interface ReadinessBlocker {
  id: string;
  reason: string;
  severity: 'hard' | 'soft';
  resolvedAt?: number;
}

export interface WatchlistNote {
  id: string;
  content: string;
  createdAt: number;
  type: 'observation' | 'thesis_update' | 'risk' | 'catalyst' | 'general';
}

export interface WatchlistAlert {
  id: string;
  type: 'price' | 'volume' | 'attention' | 'catalyst' | 'readiness' | 'regime';
  condition: string;
  threshold?: number;
  triggered: boolean;
  triggeredAt?: number;
  createdAt: number;
}

// ============================================================================
// WATCHLIST
// ============================================================================

export interface Watchlist {
  id: string;
  name: string;
  type: WatchlistType;
  description: string;
  items: Map<string, WatchlistItem>;
  createdAt: number;
  updatedAt: number;
  sortBy: 'readiness' | 'attention' | 'score' | 'added' | 'updated';
  filters: {
    minScore?: number;
    readinessStates?: ReadinessState[];
    tags?: string[];
  };
}

// ============================================================================
// WATCHLIST INTELLIGENCE ENGINE
// ============================================================================

export class WatchlistIntelligence {
  private watchlists: Map<string, Watchlist> = new Map();
  private allItems: Map<string, WatchlistItem> = new Map();
  private currentRegime: string = 'neutral';

  constructor() {
    // Initialize default watchlists
    this.initializeDefaultWatchlists();
  }

  /**
   * Initialize default watchlists
   */
  private initializeDefaultWatchlists(): void {
    const defaults: Array<{
      name: string;
      type: WatchlistType;
      description: string;
    }> = [
      {
        name: 'Active Opportunities',
        type: WatchlistType.ACTIVE_OPPORTUNITY,
        description: 'High-conviction setups ready for execution',
      },
      {
        name: 'Thesis Tracking',
        type: WatchlistType.THESIS_TRACKING,
        description: 'Long-term investment theses being validated',
      },
      {
        name: 'Attention Surge',
        type: WatchlistType.ATTENTION_SURGE,
        description: 'Symbols experiencing unusual attention',
      },
      {
        name: 'Catalyst Pending',
        type: WatchlistType.CATALYST_PENDING,
        description: 'Awaiting known catalysts',
      },
      {
        name: 'Regime Favorable',
        type: WatchlistType.REGIME_FAVORABLE,
        description: 'Positioned for current market regime',
      },
    ];

    for (const def of defaults) {
      this.createWatchlist(def.name, def.type, def.description);
    }
  }

  // ==========================================================================
  // WATCHLIST MANAGEMENT
  // ==========================================================================

  /**
   * Create a new watchlist
   */
  createWatchlist(name: string, type: WatchlistType, description: string): Watchlist {
    const watchlist: Watchlist = {
      id: uuidv4(),
      name,
      type,
      description,
      items: new Map(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sortBy: 'readiness',
      filters: {},
    };

    this.watchlists.set(watchlist.id, watchlist);
    return watchlist;
  }

  /**
   * Get watchlist by ID
   */
  getWatchlist(id: string): Watchlist | undefined {
    return this.watchlists.get(id);
  }

  /**
   * Get watchlist by type
   */
  getWatchlistByType(type: WatchlistType): Watchlist | undefined {
    for (const watchlist of this.watchlists.values()) {
      if (watchlist.type === type) return watchlist;
    }
    return undefined;
  }

  /**
   * Get all watchlists
   */
  getAllWatchlists(): Watchlist[] {
    return Array.from(this.watchlists.values());
  }

  // ==========================================================================
  // ITEM MANAGEMENT
  // ==========================================================================

  /**
   * Add item to watchlist
   */
  addItem(
    watchlistId: string,
    symbol: string,
    metadata: WatchlistItem['metadata'],
    thesis?: Partial<WatchlistItem['thesis']>
  ): WatchlistItem | null {
    const watchlist = this.watchlists.get(watchlistId);
    if (!watchlist) return null;

    const item: WatchlistItem = {
      id: uuidv4(),
      symbol,
      addedAt: Date.now(),
      updatedAt: Date.now(),
      watchlistType: watchlist.type,
      metadata,
      thesis: {
        status: thesis?.status ?? ThesisStatus.FORMING,
        summary: thesis?.summary ?? '',
        bullCase: thesis?.bullCase ?? [],
        bearCase: thesis?.bearCase ?? [],
        catalysts: thesis?.catalysts ?? [],
        priceTargets: thesis?.priceTargets ?? { bull: 0, base: 0, bear: 0 },
        timeframe: thesis?.timeframe ?? 'medium',
        confidence: thesis?.confidence ?? 0.5,
        lastValidated: Date.now(),
      },
      regimeCompatibility: {
        currentRegime: this.currentRegime,
        compatibilityScore: 0.5,
        favorableRegimes: [],
        unfavorableRegimes: [],
        regimeHistory: [],
      },
      attention: {
        currentScore: 0,
        trajectory: 'stable',
        velocityChange: 0,
        peakScore: 0,
        peakTimestamp: Date.now(),
        attentionHistory: [],
      },
      readiness: {
        state: ReadinessState.NOT_READY,
        score: 0,
        triggers: [],
        blockers: [],
        lastStateChange: Date.now(),
      },
      technicals: {
        currentPrice: 0,
        support: [],
        resistance: [],
        trend: 'neutral',
        momentum: 0,
        volatility: 0,
      },
      notes: [],
      alerts: [],
      scores: {
        overall: 0,
        fundamental: 0,
        technical: 0,
        sentiment: 0,
        momentum: 0,
        risk: 0.5,
      },
    };

    watchlist.items.set(symbol, item);
    this.allItems.set(symbol, item);
    watchlist.updatedAt = Date.now();

    return item;
  }

  /**
   * Get item by symbol
   */
  getItem(symbol: string): WatchlistItem | undefined {
    return this.allItems.get(symbol);
  }

  /**
   * Remove item from watchlist
   */
  removeItem(watchlistId: string, symbol: string): boolean {
    const watchlist = this.watchlists.get(watchlistId);
    if (!watchlist) return false;

    const deleted = watchlist.items.delete(symbol);
    if (deleted) {
      this.allItems.delete(symbol);
      watchlist.updatedAt = Date.now();
    }
    return deleted;
  }

  /**
   * Move item between watchlists
   */
  moveItem(symbol: string, fromWatchlistId: string, toWatchlistId: string): boolean {
    const fromWatchlist = this.watchlists.get(fromWatchlistId);
    const toWatchlist = this.watchlists.get(toWatchlistId);
    
    if (!fromWatchlist || !toWatchlist) return false;
    
    const item = fromWatchlist.items.get(symbol);
    if (!item) return false;

    fromWatchlist.items.delete(symbol);
    item.watchlistType = toWatchlist.type;
    item.updatedAt = Date.now();
    toWatchlist.items.set(symbol, item);

    fromWatchlist.updatedAt = Date.now();
    toWatchlist.updatedAt = Date.now();

    return true;
  }

  // ==========================================================================
  // ITEM UPDATES
  // ==========================================================================

  /**
   * Update item technicals
   */
  updateTechnicals(
    symbol: string,
    technicals: Partial<WatchlistItem['technicals']>
  ): void {
    const item = this.allItems.get(symbol);
    if (!item) return;

    item.technicals = { ...item.technicals, ...technicals };
    item.updatedAt = Date.now();

    // Recalculate readiness
    this.recalculateReadiness(item);
    this.recalculateScores(item);
  }

  /**
   * Update item attention
   */
  updateAttention(
    symbol: string,
    attentionScore: number
  ): void {
    const item = this.allItems.get(symbol);
    if (!item) return;

    const prev = item.attention.currentScore;
    const velocity = attentionScore - prev;
    
    item.attention.attentionHistory.push({
      score: attentionScore,
      timestamp: Date.now(),
    });

    // Keep last 100 entries
    if (item.attention.attentionHistory.length > 100) {
      item.attention.attentionHistory.shift();
    }

    item.attention.currentScore = attentionScore;
    item.attention.velocityChange = velocity;
    item.attention.trajectory = velocity > 0.05 ? 'rising' : velocity < -0.05 ? 'falling' : 'stable';

    if (attentionScore > item.attention.peakScore) {
      item.attention.peakScore = attentionScore;
      item.attention.peakTimestamp = Date.now();
    }

    item.updatedAt = Date.now();
    this.recalculateReadiness(item);
    this.recalculateScores(item);

    // Auto-move to attention surge if warranted
    if (attentionScore > 0.7 && item.attention.trajectory === 'rising') {
      const attentionWatchlist = this.getWatchlistByType(WatchlistType.ATTENTION_SURGE);
      if (attentionWatchlist && !attentionWatchlist.items.has(symbol)) {
        attentionWatchlist.items.set(symbol, item);
      }
    }
  }

  /**
   * Update thesis
   */
  updateThesis(
    symbol: string,
    thesis: Partial<WatchlistItem['thesis']>
  ): void {
    const item = this.allItems.get(symbol);
    if (!item) return;

    item.thesis = { ...item.thesis, ...thesis, lastValidated: Date.now() };
    item.updatedAt = Date.now();

    this.recalculateScores(item);
  }

  /**
   * Add catalyst
   */
  addCatalyst(symbol: string, catalyst: Omit<Catalyst, 'id' | 'occurred'>): void {
    const item = this.allItems.get(symbol);
    if (!item) return;

    item.thesis.catalysts.push({
      id: uuidv4(),
      ...catalyst,
      occurred: false,
    });
    item.updatedAt = Date.now();

    // Move to catalyst pending if has upcoming catalyst
    if (catalyst.expectedDate && catalyst.expectedDate > Date.now()) {
      const catalystWatchlist = this.getWatchlistByType(WatchlistType.CATALYST_PENDING);
      if (catalystWatchlist && !catalystWatchlist.items.has(symbol)) {
        catalystWatchlist.items.set(symbol, item);
      }
    }
  }

  /**
   * Mark catalyst occurred
   */
  markCatalystOccurred(symbol: string, catalystId: string, outcome: string): void {
    const item = this.allItems.get(symbol);
    if (!item) return;

    const catalyst = item.thesis.catalysts.find(c => c.id === catalystId);
    if (catalyst) {
      catalyst.occurred = true;
      catalyst.outcome = outcome;
      item.updatedAt = Date.now();
    }
  }

  /**
   * Add note
   */
  addNote(symbol: string, content: string, type: WatchlistNote['type']): void {
    const item = this.allItems.get(symbol);
    if (!item) return;

    item.notes.unshift({
      id: uuidv4(),
      content,
      createdAt: Date.now(),
      type,
    });

    // Keep last 50 notes
    if (item.notes.length > 50) {
      item.notes.pop();
    }

    item.updatedAt = Date.now();
  }

  /**
   * Set alert
   */
  setAlert(
    symbol: string,
    type: WatchlistAlert['type'],
    condition: string,
    threshold?: number
  ): WatchlistAlert {
    const item = this.allItems.get(symbol);
    if (!item) throw new Error('Item not found');

    const alert: WatchlistAlert = {
      id: uuidv4(),
      type,
      condition,
      threshold,
      triggered: false,
      createdAt: Date.now(),
    };

    item.alerts.push(alert);
    item.updatedAt = Date.now();

    return alert;
  }

  // ==========================================================================
  // REGIME MANAGEMENT
  // ==========================================================================

  /**
   * Update market regime
   */
  setRegime(regime: string): void {
    this.currentRegime = regime;

    // Update all items
    for (const item of this.allItems.values()) {
      item.regimeCompatibility.currentRegime = regime;
      
      // Calculate compatibility
      if (item.regimeCompatibility.favorableRegimes.includes(regime)) {
        item.regimeCompatibility.compatibilityScore = 0.9;
      } else if (item.regimeCompatibility.unfavorableRegimes.includes(regime)) {
        item.regimeCompatibility.compatibilityScore = 0.2;
      } else {
        item.regimeCompatibility.compatibilityScore = 0.5;
      }

      // Record regime history
      item.regimeCompatibility.regimeHistory.push({
        regime,
        performance: 0, // Would be calculated from actual performance
        timestamp: Date.now(),
      });

      this.recalculateReadiness(item);
    }

    // Update regime favorable watchlist
    const regimeWatchlist = this.getWatchlistByType(WatchlistType.REGIME_FAVORABLE);
    if (regimeWatchlist) {
      regimeWatchlist.items.clear();
      for (const item of this.allItems.values()) {
        if (item.regimeCompatibility.compatibilityScore > 0.7) {
          regimeWatchlist.items.set(item.symbol, item);
        }
      }
    }
  }

  // ==========================================================================
  // READINESS CALCULATION
  // ==========================================================================

  /**
   * Recalculate readiness state
   */
  private recalculateReadiness(item: WatchlistItem): void {
    const triggers: ReadinessTrigger[] = [
      {
        id: 'regime_compatible',
        condition: 'Market regime is favorable',
        met: item.regimeCompatibility.compatibilityScore > 0.6,
        weight: 0.2,
        lastChecked: Date.now(),
      },
      {
        id: 'attention_rising',
        condition: 'Social attention is rising',
        met: item.attention.trajectory === 'rising' && item.attention.currentScore > 0.3,
        weight: 0.15,
        lastChecked: Date.now(),
      },
      {
        id: 'technical_bullish',
        condition: 'Technical trend is bullish',
        met: item.technicals.trend === 'bullish',
        weight: 0.2,
        lastChecked: Date.now(),
      },
      {
        id: 'near_support',
        condition: 'Price near support level',
        met: item.technicals.support.length > 0 && 
             item.technicals.currentPrice > 0 &&
             (item.technicals.currentPrice - item.technicals.support[0]) / item.technicals.currentPrice < 0.03,
        weight: 0.15,
        lastChecked: Date.now(),
      },
      {
        id: 'thesis_validated',
        condition: 'Investment thesis validated',
        met: item.thesis.status === ThesisStatus.VALIDATED || item.thesis.status === ThesisStatus.ACTIVE,
        weight: 0.2,
        lastChecked: Date.now(),
      },
      {
        id: 'rsi_oversold',
        condition: 'RSI indicates oversold',
        met: item.technicals.rsi !== undefined && item.technicals.rsi < 35,
        weight: 0.1,
        lastChecked: Date.now(),
      },
    ];

    item.readiness.triggers = triggers;

    // Check blockers
    const blockers: ReadinessBlocker[] = [];
    
    if (item.regimeCompatibility.compatibilityScore < 0.3) {
      blockers.push({
        id: 'regime_unfavorable',
        reason: 'Current market regime is unfavorable',
        severity: 'hard',
      });
    }
    
    if (item.thesis.status === ThesisStatus.INVALIDATED) {
      blockers.push({
        id: 'thesis_invalidated',
        reason: 'Investment thesis has been invalidated',
        severity: 'hard',
      });
    }
    
    if (item.technicals.volatility > 0.5) {
      blockers.push({
        id: 'high_volatility',
        reason: 'Volatility is too high',
        severity: 'soft',
      });
    }

    item.readiness.blockers = blockers;

    // Calculate readiness score
    const triggerScore = triggers.reduce((sum, t) => sum + (t.met ? t.weight : 0), 0);
    const hardBlockers = blockers.filter(b => b.severity === 'hard').length;
    const softBlockers = blockers.filter(b => b.severity === 'soft').length;

    let score = triggerScore;
    if (hardBlockers > 0) score *= 0.2;
    else if (softBlockers > 0) score *= 0.7;

    item.readiness.score = Math.min(1, score);

    // Determine state
    const prevState = item.readiness.state;
    let newState: ReadinessState;

    if (hardBlockers > 0) {
      newState = ReadinessState.NOT_READY;
    } else if (score >= 0.8) {
      newState = ReadinessState.OPTIMAL;
    } else if (score >= 0.6) {
      newState = ReadinessState.READY;
    } else if (score >= 0.4) {
      newState = ReadinessState.WARMING_UP;
    } else if (prevState === ReadinessState.OPTIMAL || prevState === ReadinessState.READY) {
      newState = ReadinessState.COOLING_DOWN;
    } else {
      newState = ReadinessState.NOT_READY;
    }

    if (newState !== prevState) {
      item.readiness.state = newState;
      item.readiness.lastStateChange = Date.now();

      // Set optimal window for OPTIMAL state
      if (newState === ReadinessState.OPTIMAL) {
        item.readiness.optimalWindowStart = Date.now();
        item.readiness.optimalWindowEnd = Date.now() + 24 * 60 * 60 * 1000; // 24h window
      }
    }
  }

  /**
   * Recalculate overall scores
   */
  private recalculateScores(item: WatchlistItem): void {
    // Technical score
    let technical = 0.5;
    if (item.technicals.trend === 'bullish') technical += 0.3;
    if (item.technicals.trend === 'bearish') technical -= 0.3;
    if (item.technicals.rsi && item.technicals.rsi < 30) technical += 0.1;
    if (item.technicals.rsi && item.technicals.rsi > 70) technical -= 0.1;
    item.scores.technical = Math.max(0, Math.min(1, technical));

    // Sentiment score (from attention)
    item.scores.sentiment = item.attention.currentScore;

    // Momentum score
    item.scores.momentum = Math.max(0, Math.min(1, 0.5 + item.technicals.momentum));

    // Fundamental score (from thesis confidence)
    item.scores.fundamental = item.thesis.confidence;

    // Risk score (inverse - higher is riskier)
    item.scores.risk = Math.max(0, Math.min(1, item.technicals.volatility * 2));

    // Overall score
    item.scores.overall = (
      item.scores.technical * 0.25 +
      item.scores.sentiment * 0.15 +
      item.scores.momentum * 0.20 +
      item.scores.fundamental * 0.25 +
      (1 - item.scores.risk) * 0.15 +
      item.readiness.score * 0.1
    );
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get ready items
   */
  getReadyItems(): WatchlistItem[] {
    return Array.from(this.allItems.values())
      .filter(item => 
        item.readiness.state === ReadinessState.READY || 
        item.readiness.state === ReadinessState.OPTIMAL
      )
      .sort((a, b) => b.readiness.score - a.readiness.score);
  }

  /**
   * Get items by readiness state
   */
  getItemsByReadiness(state: ReadinessState): WatchlistItem[] {
    return Array.from(this.allItems.values())
      .filter(item => item.readiness.state === state)
      .sort((a, b) => b.scores.overall - a.scores.overall);
  }

  /**
   * Get attention surge items
   */
  getAttentionSurge(minScore: number = 0.5): WatchlistItem[] {
    return Array.from(this.allItems.values())
      .filter(item => 
        item.attention.currentScore >= minScore && 
        item.attention.trajectory === 'rising'
      )
      .sort((a, b) => b.attention.currentScore - a.attention.currentScore);
  }

  /**
   * Get items with pending catalysts
   */
  getPendingCatalysts(withinDays: number = 30): WatchlistItem[] {
    const cutoff = Date.now() + withinDays * 24 * 60 * 60 * 1000;
    
    return Array.from(this.allItems.values())
      .filter(item => 
        item.thesis.catalysts.some(c => 
          !c.occurred && 
          c.expectedDate && 
          c.expectedDate <= cutoff
        )
      )
      .sort((a, b) => {
        const aNext = Math.min(...a.thesis.catalysts.filter(c => !c.occurred && c.expectedDate).map(c => c.expectedDate!));
        const bNext = Math.min(...b.thesis.catalysts.filter(c => !c.occurred && c.expectedDate).map(c => c.expectedDate!));
        return aNext - bNext;
      });
  }

  /**
   * Get regime compatible items
   */
  getRegimeCompatible(minScore: number = 0.6): WatchlistItem[] {
    return Array.from(this.allItems.values())
      .filter(item => item.regimeCompatibility.compatibilityScore >= minScore)
      .sort((a, b) => b.regimeCompatibility.compatibilityScore - a.regimeCompatibility.compatibilityScore);
  }

  /**
   * Get top scored items
   */
  getTopScored(limit: number = 10): WatchlistItem[] {
    return Array.from(this.allItems.values())
      .sort((a, b) => b.scores.overall - a.scores.overall)
      .slice(0, limit);
  }

  /**
   * Search items
   */
  search(query: string): WatchlistItem[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.allItems.values())
      .filter(item =>
        item.symbol.toLowerCase().includes(lowerQuery) ||
        item.metadata.name.toLowerCase().includes(lowerQuery) ||
        item.metadata.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
        item.thesis.summary.toLowerCase().includes(lowerQuery)
      );
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get stats
   */
  getStats(): {
    totalItems: number;
    watchlistCount: number;
    byReadiness: Record<ReadinessState, number>;
    byThesisStatus: Record<ThesisStatus, number>;
    avgReadinessScore: number;
    avgOverallScore: number;
    attentionSurgeCount: number;
    pendingCatalysts: number;
  } {
    const items = Array.from(this.allItems.values());
    
    const byReadiness: Record<ReadinessState, number> = {
      [ReadinessState.NOT_READY]: 0,
      [ReadinessState.WARMING_UP]: 0,
      [ReadinessState.READY]: 0,
      [ReadinessState.OPTIMAL]: 0,
      [ReadinessState.COOLING_DOWN]: 0,
      [ReadinessState.MISSED]: 0,
    };

    const byThesisStatus: Record<ThesisStatus, number> = {
      [ThesisStatus.FORMING]: 0,
      [ThesisStatus.VALIDATED]: 0,
      [ThesisStatus.ACTIVE]: 0,
      [ThesisStatus.CHALLENGED]: 0,
      [ThesisStatus.INVALIDATED]: 0,
      [ThesisStatus.COMPLETED]: 0,
    };

    let totalReadiness = 0;
    let totalScore = 0;
    let attentionSurge = 0;
    let pendingCatalysts = 0;

    for (const item of items) {
      byReadiness[item.readiness.state]++;
      byThesisStatus[item.thesis.status]++;
      totalReadiness += item.readiness.score;
      totalScore += item.scores.overall;
      
      if (item.attention.currentScore > 0.5 && item.attention.trajectory === 'rising') {
        attentionSurge++;
      }
      
      if (item.thesis.catalysts.some(c => !c.occurred && c.expectedDate && c.expectedDate > Date.now())) {
        pendingCatalysts++;
      }
    }

    return {
      totalItems: items.length,
      watchlistCount: this.watchlists.size,
      byReadiness,
      byThesisStatus,
      avgReadinessScore: items.length > 0 ? totalReadiness / items.length : 0,
      avgOverallScore: items.length > 0 ? totalScore / items.length : 0,
      attentionSurgeCount: attentionSurge,
      pendingCatalysts,
    };
  }
}

export default WatchlistIntelligence;
