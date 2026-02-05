/**
 * NOVA NEXUS COMMERCE INTELLIGENCE
 * ==================================
 * Marketplace & Commerce Intelligence Sector
 * 
 * The second of three core sectors (Investment, Commerce, Platform).
 * Applies the same grounded intelligence framework to commerce decisions:
 * - Demand forecasting
 * - Saturation detection
 * - Pricing optimization
 * - Timing windows
 * - Listing strategies
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// MARKET TYPES
// ============================================================================

export enum MarketType {
  ECOMMERCE = 'ECOMMERCE',
  RESALE = 'RESALE',
  COLLECTIBLES = 'COLLECTIBLES',
  DIGITAL_GOODS = 'DIGITAL_GOODS',
  SERVICES = 'SERVICES',
  LOCAL = 'LOCAL',
}

export enum DemandState {
  RISING = 'RISING',
  PEAK = 'PEAK',
  DECLINING = 'DECLINING',
  TROUGH = 'TROUGH',
  STABLE = 'STABLE',
  VOLATILE = 'VOLATILE',
}

export enum SaturationLevel {
  UNDERSUPPLIED = 'UNDERSUPPLIED',   // Demand exceeds supply
  BALANCED = 'BALANCED',              // Supply meets demand
  OVERSATURATED = 'OVERSATURATED',    // Supply exceeds demand
  FLOODED = 'FLOODED',                // Severe oversupply
}

// ============================================================================
// PRODUCT/LISTING INTELLIGENCE
// ============================================================================

export interface ProductAnalysis {
  id: string;
  productId: string;
  productName: string;
  category: string;
  market: MarketType;
  analyzedAt: number;
  
  /** Demand analysis */
  demand: {
    state: DemandState;
    score: number;              // 0-100
    trend: 'up' | 'down' | 'flat';
    velocity: number;           // Rate of change
    seasonality?: {
      peak: string[];           // Peak months/periods
      trough: string[];         // Low periods
      currentPosition: string;
    };
    drivers: string[];          // What's driving demand
  };
  
  /** Supply/saturation analysis */
  saturation: {
    level: SaturationLevel;
    competitorCount: number;
    avgDaysOnMarket: number;
    newListingsRate: number;    // Per day
    absorptionRate: number;     // Sales per listing
  };
  
  /** Pricing intelligence */
  pricing: {
    marketPrice: number;
    priceRange: { low: number; high: number; median: number };
    priceElasticity: number;    // How price-sensitive is demand
    optimalPrice?: number;
    priceTrend: 'rising' | 'falling' | 'stable';
  };
  
  /** Timing analysis */
  timing: {
    optimalListDay?: string;
    optimalListTime?: string;
    urgency: 'immediate' | 'soon' | 'wait' | 'avoid';
    windowsOpen: TimingWindow[];
  };
  
  /** Confidence */
  confidence: number;
  dataQuality: 'high' | 'medium' | 'low';
}

export interface TimingWindow {
  id: string;
  type: 'seasonal' | 'event' | 'trend' | 'cyclical';
  description: string;
  starts: number;
  ends: number;
  expectedDemandMultiplier: number;
  confidence: number;
}

// ============================================================================
// PRICING RECOMMENDATIONS
// ============================================================================

export interface PricingRecommendation {
  id: string;
  productId: string;
  recommendedAt: number;
  
  /** Price points */
  prices: {
    aggressive: number;         // Quick sale, lower margin
    optimal: number;            // Best balance
    premium: number;            // Higher margin, slower sale
    market: number;             // Current market rate
  };
  
  /** Strategy */
  strategy: {
    recommended: 'aggressive' | 'optimal' | 'premium';
    reasoning: string[];
    expectedTimeToSale: {
      aggressive: number;       // Days
      optimal: number;
      premium: number;
    };
  };
  
  /** Dynamic pricing rules */
  dynamicRules?: {
    decreaseAfterDays: number;
    decreasePercent: number;
    floorPrice: number;
    increaseOnDemandSpike: boolean;
  };
  
  confidence: number;
}

// ============================================================================
// LISTING OPTIMIZATION
// ============================================================================

export interface ListingOptimization {
  id: string;
  productId: string;
  optimizedAt: number;
  
  /** Title optimization */
  title: {
    current?: string;
    optimized: string;
    keywords: string[];
    score: number;
  };
  
  /** Description optimization */
  description: {
    highlights: string[];
    keywords: string[];
    tone: 'professional' | 'casual' | 'urgent' | 'premium';
  };
  
  /** Visual recommendations */
  visuals: {
    recommendedImages: number;
    angles: string[];
    tips: string[];
  };
  
  /** Platform-specific */
  platformTips: Record<string, string[]>;
  
  /** Expected impact */
  expectedImpact: {
    viewsIncrease: number;      // Percentage
    conversionIncrease: number; // Percentage
    timeToSaleReduction: number; // Days
  };
  
  confidence: number;
}

// ============================================================================
// COMMERCE SIGNALS
// ============================================================================

export interface CommerceSignal {
  id: string;
  timestamp: number;
  
  type: 'opportunity' | 'warning' | 'trend' | 'event';
  category: string;
  
  signal: {
    title: string;
    description: string;
    actionable: boolean;
    urgency: 'immediate' | 'soon' | 'informational';
  };
  
  impact: {
    potentialValue: number;
    riskLevel: number;
    confidence: number;
  };
  
  recommendations: string[];
  expiresAt?: number;
}

// ============================================================================
// COMMERCE INTELLIGENCE ENGINE
// ============================================================================

export class CommerceIntelligence {
  private analyses: Map<string, ProductAnalysis> = new Map();
  private recommendations: Map<string, PricingRecommendation> = new Map();
  private optimizations: Map<string, ListingOptimization> = new Map();
  private signals: Map<string, CommerceSignal> = new Map();
  
  /** Market data cache */
  private marketData: Map<string, {
    avgPrice: number;
    volume: number;
    trend: string;
    lastUpdated: number;
  }> = new Map();

  constructor() {}

  // ==========================================================================
  // PRODUCT ANALYSIS
  // ==========================================================================

  /**
   * Analyze a product for commerce intelligence
   */
  analyzeProduct(
    productId: string,
    productName: string,
    category: string,
    market: MarketType,
    data: {
      currentPrice?: number;
      competitorPrices?: number[];
      salesHistory?: Array<{ date: number; price: number }>;
      listingAge?: number;
      competitorCount?: number;
    }
  ): ProductAnalysis {
    // Analyze demand
    const demand = this.analyzeDemand(category, data.salesHistory);
    
    // Analyze saturation
    const saturation = this.analyzeSaturation(category, {
      competitorCount: data.competitorCount ?? 0,
      listingAge: data.listingAge ?? 0,
    });
    
    // Analyze pricing
    const pricing = this.analyzePricing(
      data.currentPrice ?? 0,
      data.competitorPrices ?? []
    );
    
    // Analyze timing
    const timing = this.analyzeTiming(category, demand, saturation);
    
    // Calculate overall confidence
    const confidence = this.calculateAnalysisConfidence(data);

    const analysis: ProductAnalysis = {
      id: uuidv4(),
      productId,
      productName,
      category,
      market,
      analyzedAt: Date.now(),
      demand,
      saturation,
      pricing,
      timing,
      confidence,
      dataQuality: confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low',
    };

    this.analyses.set(analysis.id, analysis);
    return analysis;
  }

  /**
   * Analyze demand for a category
   */
  private analyzeDemand(
    category: string,
    salesHistory?: Array<{ date: number; price: number }>
  ): ProductAnalysis['demand'] {
    // Simplified demand analysis
    let score = 50; // Neutral
    let state: DemandState = DemandState.STABLE;
    let trend: 'up' | 'down' | 'flat' = 'flat';
    let velocity = 0;

    if (salesHistory && salesHistory.length > 0) {
      // Calculate trend from sales history
      const recentSales = salesHistory.filter(s => s.date > Date.now() - 30 * 86400000);
      const olderSales = salesHistory.filter(s => 
        s.date <= Date.now() - 30 * 86400000 && s.date > Date.now() - 60 * 86400000
      );

      if (recentSales.length > olderSales.length * 1.2) {
        trend = 'up';
        state = DemandState.RISING;
        score = 70;
        velocity = (recentSales.length - olderSales.length) / Math.max(1, olderSales.length);
      } else if (recentSales.length < olderSales.length * 0.8) {
        trend = 'down';
        state = DemandState.DECLINING;
        score = 30;
        velocity = (recentSales.length - olderSales.length) / Math.max(1, olderSales.length);
      }
    }

    // Seasonal patterns (simplified)
    const month = new Date().getMonth();
    const seasonality = this.getSeasonality(category, month);

    return {
      state,
      score,
      trend,
      velocity,
      seasonality,
      drivers: this.getDemandDrivers(category, state),
    };
  }

  /**
   * Get seasonality for category
   */
  private getSeasonality(category: string, currentMonth: number): ProductAnalysis['demand']['seasonality'] {
    // Simplified seasonality rules
    const patterns: Record<string, { peak: number[]; trough: number[] }> = {
      electronics: { peak: [10, 11], trough: [1, 2] }, // Holiday peak
      clothing: { peak: [8, 9, 2, 3], trough: [6, 7] }, // Back to school, spring
      collectibles: { peak: [11, 12], trough: [1, 2] },
      outdoor: { peak: [4, 5, 6], trough: [11, 12, 1] },
    };

    const pattern = patterns[category.toLowerCase()] ?? { peak: [], trough: [] };
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let currentPosition = 'normal';
    if (pattern.peak.includes(currentMonth)) currentPosition = 'peak';
    if (pattern.trough.includes(currentMonth)) currentPosition = 'trough';

    return {
      peak: pattern.peak.map(m => monthNames[m]),
      trough: pattern.trough.map(m => monthNames[m]),
      currentPosition,
    };
  }

  /**
   * Get demand drivers
   */
  private getDemandDrivers(category: string, state: DemandState): string[] {
    const drivers: string[] = [];
    
    if (state === DemandState.RISING) {
      drivers.push('Increasing search volume');
      drivers.push('Positive market sentiment');
    } else if (state === DemandState.DECLINING) {
      drivers.push('Market saturation');
      drivers.push('Seasonal decline');
    }
    
    return drivers;
  }

  /**
   * Analyze market saturation
   */
  private analyzeSaturation(
    category: string,
    data: { competitorCount: number; listingAge: number }
  ): ProductAnalysis['saturation'] {
    let level: SaturationLevel = SaturationLevel.BALANCED;
    
    // Simple saturation rules
    if (data.competitorCount > 100) {
      level = SaturationLevel.FLOODED;
    } else if (data.competitorCount > 50) {
      level = SaturationLevel.OVERSATURATED;
    } else if (data.competitorCount < 10) {
      level = SaturationLevel.UNDERSUPPLIED;
    }

    // Estimate rates (would use real data in production)
    const avgDaysOnMarket = level === SaturationLevel.FLOODED ? 45 
      : level === SaturationLevel.OVERSATURATED ? 21 
      : level === SaturationLevel.UNDERSUPPLIED ? 3 
      : 14;

    return {
      level,
      competitorCount: data.competitorCount,
      avgDaysOnMarket,
      newListingsRate: data.competitorCount / 30, // Simplified
      absorptionRate: 1 / avgDaysOnMarket,
    };
  }

  /**
   * Analyze pricing
   */
  private analyzePricing(
    currentPrice: number,
    competitorPrices: number[]
  ): ProductAnalysis['pricing'] {
    if (competitorPrices.length === 0) {
      return {
        marketPrice: currentPrice,
        priceRange: { low: currentPrice * 0.8, high: currentPrice * 1.2, median: currentPrice },
        priceElasticity: 1.0,
        priceTrend: 'stable',
      };
    }

    const sorted = [...competitorPrices].sort((a, b) => a - b);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];
    const avg = competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length;

    // Estimate optimal price (slightly below average for competitive positioning)
    const optimalPrice = avg * 0.95;

    // Determine price trend (simplified)
    let priceTrend: 'rising' | 'falling' | 'stable' = 'stable';
    if (currentPrice && currentPrice > avg * 1.1) {
      priceTrend = 'rising';
    } else if (currentPrice && currentPrice < avg * 0.9) {
      priceTrend = 'falling';
    }

    return {
      marketPrice: avg,
      priceRange: { low, high, median },
      priceElasticity: 1.2, // Simplified
      optimalPrice,
      priceTrend,
    };
  }

  /**
   * Analyze timing
   */
  private analyzeTiming(
    category: string,
    demand: ProductAnalysis['demand'],
    saturation: ProductAnalysis['saturation']
  ): ProductAnalysis['timing'] {
    const windows: TimingWindow[] = [];
    let urgency: 'immediate' | 'soon' | 'wait' | 'avoid' = 'soon';

    // Determine urgency based on demand and saturation
    if (demand.state === DemandState.RISING && saturation.level === SaturationLevel.UNDERSUPPLIED) {
      urgency = 'immediate';
    } else if (demand.state === DemandState.DECLINING && saturation.level === SaturationLevel.FLOODED) {
      urgency = 'avoid';
    } else if (demand.state === DemandState.PEAK) {
      urgency = 'immediate';
    } else if (demand.state === DemandState.TROUGH) {
      urgency = 'wait';
    }

    // Add seasonal window if applicable
    if (demand.seasonality?.currentPosition === 'peak') {
      windows.push({
        id: uuidv4(),
        type: 'seasonal',
        description: 'Peak season - high demand period',
        starts: Date.now(),
        ends: Date.now() + 30 * 86400000,
        expectedDemandMultiplier: 1.5,
        confidence: 0.7,
      });
    }

    // Best listing times (general patterns)
    const optimalListDay = 'Sunday';
    const optimalListTime = '7:00 PM';

    return {
      optimalListDay,
      optimalListTime,
      urgency,
      windowsOpen: windows,
    };
  }

  /**
   * Calculate analysis confidence
   */
  private calculateAnalysisConfidence(data: {
    salesHistory?: Array<{ date: number; price: number }>;
    competitorPrices?: number[];
    competitorCount?: number;
  }): number {
    let confidence = 0.3; // Base confidence

    if (data.salesHistory && data.salesHistory.length > 10) {
      confidence += 0.3;
    } else if (data.salesHistory && data.salesHistory.length > 5) {
      confidence += 0.15;
    }

    if (data.competitorPrices && data.competitorPrices.length > 5) {
      confidence += 0.2;
    }

    if (data.competitorCount !== undefined) {
      confidence += 0.2;
    }

    return Math.min(1, confidence);
  }

  // ==========================================================================
  // PRICING RECOMMENDATIONS
  // ==========================================================================

  /**
   * Generate pricing recommendation
   */
  generatePricingRecommendation(
    productId: string,
    analysis: ProductAnalysis,
    costBasis?: number
  ): PricingRecommendation {
    const marketPrice = analysis.pricing.marketPrice;
    const optimalPrice = analysis.pricing.optimalPrice ?? marketPrice;

    // Calculate price points
    const aggressive = optimalPrice * 0.85; // 15% below optimal
    const premium = optimalPrice * 1.15;    // 15% above optimal
    
    // Ensure floor price if cost basis provided
    const minPrice = costBasis ? costBasis * 1.1 : aggressive * 0.8;

    // Determine recommended strategy
    let recommended: 'aggressive' | 'optimal' | 'premium' = 'optimal';
    const reasoning: string[] = [];

    if (analysis.saturation.level === SaturationLevel.FLOODED) {
      recommended = 'aggressive';
      reasoning.push('High competition requires competitive pricing');
    } else if (analysis.saturation.level === SaturationLevel.UNDERSUPPLIED) {
      recommended = 'premium';
      reasoning.push('Low competition allows premium positioning');
    }

    if (analysis.demand.state === DemandState.DECLINING) {
      recommended = 'aggressive';
      reasoning.push('Declining demand suggests faster sale priority');
    } else if (analysis.demand.state === DemandState.RISING) {
      reasoning.push('Rising demand supports optimal/premium pricing');
    }

    const recommendation: PricingRecommendation = {
      id: uuidv4(),
      productId,
      recommendedAt: Date.now(),
      prices: {
        aggressive: Math.max(minPrice, aggressive),
        optimal: Math.max(minPrice, optimalPrice),
        premium: Math.max(minPrice, premium),
        market: marketPrice,
      },
      strategy: {
        recommended,
        reasoning,
        expectedTimeToSale: {
          aggressive: Math.max(1, analysis.saturation.avgDaysOnMarket * 0.5),
          optimal: analysis.saturation.avgDaysOnMarket,
          premium: analysis.saturation.avgDaysOnMarket * 1.5,
        },
      },
      dynamicRules: {
        decreaseAfterDays: 7,
        decreasePercent: 5,
        floorPrice: minPrice,
        increaseOnDemandSpike: true,
      },
      confidence: analysis.confidence,
    };

    this.recommendations.set(recommendation.id, recommendation);
    return recommendation;
  }

  // ==========================================================================
  // LISTING OPTIMIZATION
  // ==========================================================================

  /**
   * Optimize a listing
   */
  optimizeListing(
    productId: string,
    currentTitle?: string,
    category?: string
  ): ListingOptimization {
    // Generate optimized title
    const keywords = this.extractKeywords(currentTitle ?? '', category ?? '');
    const optimizedTitle = this.generateOptimizedTitle(currentTitle ?? '', keywords);

    const optimization: ListingOptimization = {
      id: uuidv4(),
      productId,
      optimizedAt: Date.now(),
      title: {
        current: currentTitle,
        optimized: optimizedTitle,
        keywords,
        score: this.scoreListing(optimizedTitle, keywords),
      },
      description: {
        highlights: this.generateHighlights(category ?? ''),
        keywords,
        tone: 'professional',
      },
      visuals: {
        recommendedImages: 5,
        angles: ['Front', 'Back', 'Side', 'Detail', 'Scale'],
        tips: [
          'Use natural lighting',
          'Show item in use',
          'Include measurements',
          'Highlight unique features',
        ],
      },
      platformTips: {
        ebay: ['Use item specifics', 'Enable best offer'],
        amazon: ['Optimize bullet points', 'Use A+ content'],
        etsy: ['Use all 13 tags', 'Add materials'],
      },
      expectedImpact: {
        viewsIncrease: 25,
        conversionIncrease: 15,
        timeToSaleReduction: 3,
      },
      confidence: 0.7,
    };

    this.optimizations.set(optimization.id, optimization);
    return optimization;
  }

  /**
   * Extract keywords from title and category
   */
  private extractKeywords(title: string, category: string): string[] {
    const words = (title + ' ' + category).toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);
    
    // Remove common words
    const stopWords = ['the', 'and', 'for', 'with', 'this', 'that', 'from'];
    return [...new Set(words.filter(w => !stopWords.includes(w)))];
  }

  /**
   * Generate optimized title
   */
  private generateOptimizedTitle(currentTitle: string, keywords: string[]): string {
    if (!currentTitle) {
      return keywords.slice(0, 5).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(' ');
    }
    
    // Add top keywords if not present
    let optimized = currentTitle;
    for (const keyword of keywords.slice(0, 3)) {
      if (!optimized.toLowerCase().includes(keyword)) {
        optimized += ` ${keyword}`;
      }
    }
    
    return optimized.slice(0, 80); // Typical title limit
  }

  /**
   * Score a listing
   */
  private scoreListing(title: string, keywords: string[]): number {
    let score = 50;
    
    // Length score
    if (title.length > 40 && title.length < 80) score += 20;
    
    // Keyword density
    const keywordCount = keywords.filter(k => title.toLowerCase().includes(k)).length;
    score += Math.min(30, keywordCount * 10);
    
    return Math.min(100, score);
  }

  /**
   * Generate description highlights
   */
  private generateHighlights(category: string): string[] {
    const baseHighlights = [
      'Excellent condition',
      'Fast shipping',
      'Satisfaction guaranteed',
    ];
    
    // Add category-specific highlights
    const categoryHighlights: Record<string, string[]> = {
      electronics: ['Fully tested', 'Original accessories included'],
      clothing: ['True to size', 'Smoke-free home'],
      collectibles: ['Authentic', 'Carefully stored'],
    };
    
    return [...baseHighlights, ...(categoryHighlights[category.toLowerCase()] ?? [])];
  }

  // ==========================================================================
  // SIGNALS
  // ==========================================================================

  /**
   * Generate commerce signal
   */
  generateSignal(
    type: CommerceSignal['type'],
    category: string,
    title: string,
    description: string,
    impact: CommerceSignal['impact'],
    recommendations: string[]
  ): CommerceSignal {
    const signal: CommerceSignal = {
      id: uuidv4(),
      timestamp: Date.now(),
      type,
      category,
      signal: {
        title,
        description,
        actionable: recommendations.length > 0,
        urgency: impact.potentialValue > 100 ? 'immediate' : impact.potentialValue > 50 ? 'soon' : 'informational',
      },
      impact,
      recommendations,
      expiresAt: Date.now() + 7 * 86400000, // 7 days
    };

    this.signals.set(signal.id, signal);
    return signal;
  }

  /**
   * Check for market opportunities
   */
  scanForOpportunities(category: string): CommerceSignal[] {
    const opportunities: CommerceSignal[] = [];
    
    // Check for undersupplied markets
    const analyses = Array.from(this.analyses.values())
      .filter(a => a.category === category);
    
    const undersupplied = analyses.filter(a => 
      a.saturation.level === SaturationLevel.UNDERSUPPLIED
    );
    
    if (undersupplied.length > 0) {
      opportunities.push(this.generateSignal(
        'opportunity',
        category,
        'Undersupplied Market Detected',
        `${undersupplied.length} products in ${category} show undersupplied conditions`,
        { potentialValue: 100, riskLevel: 30, confidence: 0.7 },
        ['Consider listing in this category', 'Monitor competitor entries']
      ));
    }

    return opportunities;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get analysis by ID
   */
  getAnalysis(analysisId: string): ProductAnalysis | undefined {
    return this.analyses.get(analysisId);
  }

  /**
   * Get analyses for product
   */
  getAnalysesForProduct(productId: string): ProductAnalysis[] {
    return Array.from(this.analyses.values())
      .filter(a => a.productId === productId)
      .sort((a, b) => b.analyzedAt - a.analyzedAt);
  }

  /**
   * Get recommendation by ID
   */
  getRecommendation(recommendationId: string): PricingRecommendation | undefined {
    return this.recommendations.get(recommendationId);
  }

  /**
   * Get optimization by ID
   */
  getOptimization(optimizationId: string): ListingOptimization | undefined {
    return this.optimizations.get(optimizationId);
  }

  /**
   * Get active signals
   */
  getActiveSignals(category?: string): CommerceSignal[] {
    const now = Date.now();
    let signals = Array.from(this.signals.values())
      .filter(s => !s.expiresAt || s.expiresAt > now);
    
    if (category) {
      signals = signals.filter(s => s.category === category);
    }
    
    return signals.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get stats
   */
  getStats(): {
    totalAnalyses: number;
    totalRecommendations: number;
    totalOptimizations: number;
    activeSignals: number;
    avgConfidence: number;
    marketsAnalyzed: string[];
  } {
    const analyses = Array.from(this.analyses.values());
    const signals = Array.from(this.signals.values());
    const now = Date.now();

    return {
      totalAnalyses: analyses.length,
      totalRecommendations: this.recommendations.size,
      totalOptimizations: this.optimizations.size,
      activeSignals: signals.filter(s => !s.expiresAt || s.expiresAt > now).length,
      avgConfidence: analyses.length > 0
        ? analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length
        : 0,
      marketsAnalyzed: [...new Set(analyses.map(a => a.market))],
    };
  }
}

export default CommerceIntelligence;
