/**
 * NOVA NEXUS BLENDER
 * ==================
 * Cross-reality synthesis engine. Fuses non-correlated domains 
 * into opportunity vectors with clear expiration.
 */

import { v4 as uuidv4 } from 'uuid';
import { DataDomain, Feature } from '../data-engine';

// ============================================================================
// OPPORTUNITY VECTOR
// ============================================================================

export interface OpportunityVector {
  id: string;
  createdAt: number;
  
  /** What is happening */
  observation: {
    summary: string;
    domains: DataDomain[];
    keySignals: {
      domain: DataDomain;
      signal: string;
      strength: number;
      confidence: number;
    }[];
  };
  
  /** Why it matters */
  significance: {
    description: string;
    potentialImpact: 'low' | 'medium' | 'high' | 'critical';
    affectedAssets: string[];
    historicalPrecedent?: string;
  };
  
  /** When it expires */
  timing: {
    windowStart: number;
    windowEnd: number;
    peakProbability: number; // Timestamp of highest probability
    urgency: 'immediate' | 'today' | 'this_week' | 'extended';
    decayRate: number; // How fast the opportunity degrades (0-1 per hour)
  };
  
  /** What would disprove it */
  invalidation: {
    conditions: {
      condition: string;
      metric?: string;
      threshold?: number;
      currentValue?: number;
    }[];
    earlyWarnings: string[];
  };
  
  /** Overall assessment */
  assessment: {
    confidence: number;
    risk: number;
    reward: number;
    riskRewardRatio: number;
    recommendedAction: string;
  };
  
  /** Source features used */
  sourceFeatures: string[];
  
  /** Is this still valid */
  status: 'active' | 'executed' | 'expired' | 'invalidated';
}

// ============================================================================
// DOMAIN SIGNAL
// ============================================================================

export interface DomainSignal {
  domain: DataDomain;
  type: string;
  signal: string;
  strength: number; // -1 (bearish) to 1 (bullish)
  confidence: number;
  timestamp: number;
  features: string[];
}

// ============================================================================
// SYNTHESIS RULE
// ============================================================================

export interface SynthesisRule {
  id: string;
  name: string;
  description: string;
  
  /** Required domains for this synthesis */
  requiredDomains: DataDomain[];
  
  /** Minimum correlation threshold (lower = more independent = better) */
  maxCorrelation: number;
  
  /** Signal patterns that trigger this rule */
  patterns: {
    domain: DataDomain;
    signalType: string;
    direction: 'bullish' | 'bearish' | 'neutral' | 'any';
    minStrength: number;
  }[];
  
  /** How to weight signals from each domain */
  domainWeights: Record<DataDomain, number>;
  
  /** Opportunity window parameters */
  timing: {
    windowHours: number;
    urgencyThreshold: number;
    decayRate: number;
  };
}

// ============================================================================
// BLENDER
// ============================================================================

export class Blender {
  private signals: Map<DataDomain, DomainSignal[]> = new Map();
  private synthesisRules: Map<string, SynthesisRule> = new Map();
  private opportunities: Map<string, OpportunityVector> = new Map();
  private correlationMatrix: Map<string, number> = new Map();

  constructor() {
    // Initialize default synthesis rules
    this.registerDefaultRules();
  }

  /**
   * Register default synthesis rules
   */
  private registerDefaultRules(): void {
    // Market + Social convergence
    this.registerRule({
      id: 'market_social_convergence',
      name: 'Market-Social Convergence',
      description: 'Technical setup confirmed by social momentum',
      requiredDomains: [DataDomain.MARKET, DataDomain.SOCIAL],
      maxCorrelation: 0.5,
      patterns: [
        { domain: DataDomain.MARKET, signalType: 'breakout', direction: 'bullish', minStrength: 0.6 },
        { domain: DataDomain.SOCIAL, signalType: 'attention_surge', direction: 'bullish', minStrength: 0.5 },
      ],
      domainWeights: { 
        [DataDomain.MARKET]: 0.6, 
        [DataDomain.SOCIAL]: 0.4,
        [DataDomain.MARKETPLACE]: 0,
        [DataDomain.NARRATIVE]: 0,
        [DataDomain.INTERNAL]: 0,
      },
      timing: { windowHours: 24, urgencyThreshold: 0.7, decayRate: 0.1 },
    });

    // Narrative shift detection
    this.registerRule({
      id: 'narrative_shift',
      name: 'Narrative Regime Shift',
      description: 'Major narrative change with market confirmation',
      requiredDomains: [DataDomain.NARRATIVE, DataDomain.MARKET],
      maxCorrelation: 0.4,
      patterns: [
        { domain: DataDomain.NARRATIVE, signalType: 'regime_change', direction: 'any', minStrength: 0.7 },
        { domain: DataDomain.MARKET, signalType: 'volume_spike', direction: 'any', minStrength: 0.5 },
      ],
      domainWeights: {
        [DataDomain.MARKET]: 0.4,
        [DataDomain.SOCIAL]: 0,
        [DataDomain.MARKETPLACE]: 0,
        [DataDomain.NARRATIVE]: 0.6,
        [DataDomain.INTERNAL]: 0,
      },
      timing: { windowHours: 72, urgencyThreshold: 0.5, decayRate: 0.05 },
    });

    // Commerce arbitrage
    this.registerRule({
      id: 'commerce_arbitrage',
      name: 'Commerce Arbitrage Opportunity',
      description: 'Marketplace inefficiency with demand signal',
      requiredDomains: [DataDomain.MARKETPLACE, DataDomain.SOCIAL],
      maxCorrelation: 0.3,
      patterns: [
        { domain: DataDomain.MARKETPLACE, signalType: 'price_gap', direction: 'bullish', minStrength: 0.6 },
        { domain: DataDomain.SOCIAL, signalType: 'demand_surge', direction: 'bullish', minStrength: 0.4 },
      ],
      domainWeights: {
        [DataDomain.MARKET]: 0,
        [DataDomain.SOCIAL]: 0.3,
        [DataDomain.MARKETPLACE]: 0.7,
        [DataDomain.NARRATIVE]: 0,
        [DataDomain.INTERNAL]: 0,
      },
      timing: { windowHours: 48, urgencyThreshold: 0.6, decayRate: 0.08 },
    });
  }

  /**
   * Register a synthesis rule
   */
  registerRule(rule: SynthesisRule): void {
    this.synthesisRules.set(rule.id, rule);
  }

  /**
   * Ingest a domain signal
   */
  ingestSignal(signal: DomainSignal): void {
    if (!this.signals.has(signal.domain)) {
      this.signals.set(signal.domain, []);
    }
    
    const domainSignals = this.signals.get(signal.domain)!;
    domainSignals.push(signal);
    
    // Keep only recent signals (last 1000)
    if (domainSignals.length > 1000) {
      domainSignals.shift();
    }

    // Attempt synthesis with new signal
    this.attemptSynthesis(signal);
  }

  /**
   * Attempt to synthesize opportunity from new signal
   */
  private attemptSynthesis(triggerSignal: DomainSignal): OpportunityVector[] {
    const newOpportunities: OpportunityVector[] = [];
    const now = Date.now();
    const lookbackMs = 4 * 60 * 60 * 1000; // 4 hours

    for (const rule of this.synthesisRules.values()) {
      // Check if trigger signal matches any pattern
      const matchingPattern = rule.patterns.find(
        p => p.domain === triggerSignal.domain && 
             p.signalType === triggerSignal.type &&
             (p.direction === 'any' || this.matchesDirection(triggerSignal.strength, p.direction)) &&
             Math.abs(triggerSignal.strength) >= p.minStrength
      );

      if (!matchingPattern) continue;

      // Look for matching signals in other required domains
      const otherPatterns = rule.patterns.filter(p => p.domain !== triggerSignal.domain);
      const matchedSignals: DomainSignal[] = [triggerSignal];

      for (const pattern of otherPatterns) {
        const domainSignals = this.signals.get(pattern.domain) ?? [];
        const recentSignals = domainSignals.filter(s => 
          now - s.timestamp < lookbackMs &&
          s.type === pattern.signalType &&
          (pattern.direction === 'any' || this.matchesDirection(s.strength, pattern.direction)) &&
          Math.abs(s.strength) >= pattern.minStrength
        );

        if (recentSignals.length > 0) {
          // Use the strongest recent signal
          const strongest = recentSignals.reduce((a, b) => 
            Math.abs(a.strength) > Math.abs(b.strength) ? a : b
          );
          matchedSignals.push(strongest);
        }
      }

      // Check if all required patterns are satisfied
      if (matchedSignals.length === rule.patterns.length) {
        // Check correlation between signals
        const avgCorrelation = this.calculateCorrelation(matchedSignals);
        if (avgCorrelation <= rule.maxCorrelation) {
          const opportunity = this.createOpportunity(rule, matchedSignals);
          this.opportunities.set(opportunity.id, opportunity);
          newOpportunities.push(opportunity);
        }
      }
    }

    return newOpportunities;
  }

  /**
   * Check if signal strength matches expected direction
   */
  private matchesDirection(strength: number, direction: 'bullish' | 'bearish' | 'neutral' | 'any'): boolean {
    if (direction === 'any') return true;
    if (direction === 'bullish') return strength > 0;
    if (direction === 'bearish') return strength < 0;
    return Math.abs(strength) < 0.2; // neutral
  }

  /**
   * Calculate correlation between signals (simplified)
   */
  private calculateCorrelation(signals: DomainSignal[]): number {
    if (signals.length < 2) return 0;
    
    // Check if we have cached correlation
    const key = signals.map(s => `${s.domain}:${s.type}`).sort().join('|');
    if (this.correlationMatrix.has(key)) {
      return this.correlationMatrix.get(key)!;
    }

    // Simple correlation estimate based on domain overlap and timing
    let totalCorr = 0;
    let pairs = 0;
    
    for (let i = 0; i < signals.length; i++) {
      for (let j = i + 1; j < signals.length; j++) {
        const timeDiff = Math.abs(signals[i].timestamp - signals[j].timestamp);
        const timeCorr = Math.max(0, 1 - timeDiff / (60 * 60 * 1000)); // Decay over 1 hour
        const directionCorr = signals[i].strength * signals[j].strength > 0 ? 0.3 : 0;
        totalCorr += timeCorr * 0.5 + directionCorr;
        pairs++;
      }
    }

    const avgCorr = pairs > 0 ? totalCorr / pairs : 0;
    this.correlationMatrix.set(key, avgCorr);
    return avgCorr;
  }

  /**
   * Create opportunity vector from matched signals
   */
  private createOpportunity(rule: SynthesisRule, signals: DomainSignal[]): OpportunityVector {
    const now = Date.now();
    
    // Calculate weighted confidence and strength
    let totalWeight = 0;
    let weightedStrength = 0;
    let weightedConfidence = 0;

    for (const signal of signals) {
      const weight = rule.domainWeights[signal.domain] || 0;
      totalWeight += weight;
      weightedStrength += signal.strength * weight;
      weightedConfidence += signal.confidence * weight;
    }

    const avgStrength = totalWeight > 0 ? weightedStrength / totalWeight : 0;
    const avgConfidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0;

    // Determine urgency
    let urgency: OpportunityVector['timing']['urgency'] = 'extended';
    if (rule.timing.windowHours <= 6) urgency = 'immediate';
    else if (rule.timing.windowHours <= 24) urgency = 'today';
    else if (rule.timing.windowHours <= 168) urgency = 'this_week';

    return {
      id: uuidv4(),
      createdAt: now,
      
      observation: {
        summary: `${rule.name}: ${signals.map(s => s.signal).join(' + ')}`,
        domains: signals.map(s => s.domain),
        keySignals: signals.map(s => ({
          domain: s.domain,
          signal: s.signal,
          strength: s.strength,
          confidence: s.confidence,
        })),
      },
      
      significance: {
        description: rule.description,
        potentialImpact: Math.abs(avgStrength) > 0.7 ? 'high' : Math.abs(avgStrength) > 0.4 ? 'medium' : 'low',
        affectedAssets: [], // Would be populated based on signal context
      },
      
      timing: {
        windowStart: now,
        windowEnd: now + rule.timing.windowHours * 60 * 60 * 1000,
        peakProbability: now + (rule.timing.windowHours * 60 * 60 * 1000 * 0.3),
        urgency,
        decayRate: rule.timing.decayRate,
      },
      
      invalidation: {
        conditions: [
          {
            condition: 'Signal strength drops below threshold',
            metric: 'signal_strength',
            threshold: 0.3,
            currentValue: Math.abs(avgStrength),
          },
        ],
        earlyWarnings: [
          'Counter-signal emerging',
          'Volume declining',
          'Correlation increasing between domains',
        ],
      },
      
      assessment: {
        confidence: avgConfidence,
        risk: 1 - avgConfidence,
        reward: Math.abs(avgStrength),
        riskRewardRatio: Math.abs(avgStrength) / (1 - avgConfidence + 0.1),
        recommendedAction: avgStrength > 0.5 ? 'Execute' : avgStrength > 0.3 ? 'Monitor' : 'Wait',
      },
      
      sourceFeatures: signals.flatMap(s => s.features),
      status: 'active',
    };
  }

  /**
   * Get active opportunities
   */
  getActiveOpportunities(): OpportunityVector[] {
    const now = Date.now();
    const active: OpportunityVector[] = [];

    for (const opp of this.opportunities.values()) {
      // Check if expired
      if (opp.timing.windowEnd < now) {
        opp.status = 'expired';
        continue;
      }

      // Check decay
      const elapsed = now - opp.createdAt;
      const hoursElapsed = elapsed / (60 * 60 * 1000);
      const decay = opp.timing.decayRate * hoursElapsed;
      
      if (opp.assessment.confidence - decay <= 0.1) {
        opp.status = 'expired';
        continue;
      }

      if (opp.status === 'active') {
        // Apply decay to confidence
        const decayedOpp = {
          ...opp,
          assessment: {
            ...opp.assessment,
            confidence: Math.max(0.1, opp.assessment.confidence - decay),
          },
        };
        active.push(decayedOpp);
      }
    }

    return active.sort((a, b) => b.assessment.riskRewardRatio - a.assessment.riskRewardRatio);
  }

  /**
   * Mark opportunity as executed
   */
  markExecuted(opportunityId: string): void {
    const opp = this.opportunities.get(opportunityId);
    if (opp) {
      opp.status = 'executed';
    }
  }

  /**
   * Invalidate opportunity
   */
  invalidate(opportunityId: string, reason: string): void {
    const opp = this.opportunities.get(opportunityId);
    if (opp) {
      opp.status = 'invalidated';
      opp.invalidation.conditions.push({ condition: reason });
    }
  }

  /**
   * Get recent signals by domain
   */
  getRecentSignals(domain: DataDomain, limit: number = 20): DomainSignal[] {
    return (this.signals.get(domain) ?? []).slice(-limit);
  }

  /**
   * Get synthesis stats
   */
  getStats(): {
    totalOpportunities: number;
    activeOpportunities: number;
    executedOpportunities: number;
    signalsByDomain: Record<string, number>;
    rulesCount: number;
  } {
    const signalsByDomain: Record<string, number> = {};
    for (const [domain, signals] of this.signals) {
      signalsByDomain[domain] = signals.length;
    }

    const opps = Array.from(this.opportunities.values());

    return {
      totalOpportunities: opps.length,
      activeOpportunities: opps.filter(o => o.status === 'active').length,
      executedOpportunities: opps.filter(o => o.status === 'executed').length,
      signalsByDomain,
      rulesCount: this.synthesisRules.size,
    };
  }
}

export default Blender;
