/**
 * NOVA NEXUS APPRAISER
 * ====================
 * Universal valuation engine. Values both financial and commerce assets
 * using multiple lenses: narrative, technical, fundamental.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// VALUATION TYPES
// ============================================================================

export enum AssetType {
  EQUITY = 'EQUITY',
  CRYPTO = 'CRYPTO',
  COMMODITY = 'COMMODITY',
  PRODUCT = 'PRODUCT',
  SERVICE = 'SERVICE',
}

export interface ValuationBand {
  /** Lower bound of fair value range */
  low: number;
  
  /** Mid-point estimate */
  mid: number;
  
  /** Upper bound of fair value range */
  high: number;
  
  /** Confidence in this band */
  confidence: number;
  
  /** Methodology used */
  methodology: string;
}

// ============================================================================
// FINANCIAL ASSET VALUATION
// ============================================================================

export interface FinancialValuation {
  id: string;
  assetId: string;
  symbol: string;
  assetType: AssetType;
  timestamp: number;
  
  /** Current market price */
  currentPrice: number;
  
  /** Narrative-driven valuation (sentiment, social, story) */
  narrativeBand: ValuationBand;
  
  /** Technical analysis valuation (patterns, indicators) */
  technicalBand: ValuationBand;
  
  /** Fundamental valuation (earnings, cash flow, growth) */
  fundamentalBand: ValuationBand;
  
  /** Combined fair value range */
  fairValue: ValuationBand;
  
  /** Liquidity penalty - discount for illiquidity */
  liquidityPenalty: {
    score: number; // 0-1, where 1 is perfectly liquid
    discount: number; // Percentage discount to apply
    avgDailyVolume: number;
    bidAskSpread: number;
  };
  
  /** Final adjusted valuation */
  adjustedFairValue: ValuationBand;
  
  /** Position recommendation */
  recommendation: {
    action: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
    targetPrice: number;
    stopLoss: number;
    riskRewardRatio: number;
    timeHorizon: 'intraday' | 'swing' | 'position' | 'investment';
  };
}

// ============================================================================
// COMMERCE ASSET VALUATION
// ============================================================================

export interface CommerceValuation {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  timestamp: number;
  
  /** Current listed price */
  currentPrice: number;
  
  /** Fair price range based on market analysis */
  fairPriceRange: {
    low: number;
    mid: number;
    high: number;
    confidence: number;
  };
  
  /** Minimum margin floor */
  marginFloor: {
    costBasis: number;
    minAcceptableMargin: number;
    floorPrice: number;
  };
  
  /** Demand volatility metrics */
  demandVolatility: {
    currentDemand: number; // 0-100
    weekOverWeek: number; // Percentage change
    monthOverMonth: number;
    seasonalityFactor: number;
    trendDirection: 'rising' | 'stable' | 'falling';
  };
  
  /** Time to market saturation */
  saturationMetrics: {
    estimatedDaysToSaturation: number;
    competitorCount: number;
    competitorPriceRange: { low: number; high: number };
    marketShare: number;
  };
  
  /** Recommended pricing */
  recommendedPrice: {
    optimal: number;
    aggressive: number; // For quick sale
    premium: number; // For max margin
    reasoning: string[];
  };
  
  /** Inventory recommendation */
  inventoryRecommendation: {
    action: 'accumulate' | 'hold' | 'liquidate';
    targetQuantity: number;
    urgency: 'high' | 'medium' | 'low';
    reasoning: string;
  };
}

// ============================================================================
// APPRAISER
// ============================================================================

export class Appraiser {
  private financialValuations: Map<string, FinancialValuation[]> = new Map();
  private commerceValuations: Map<string, CommerceValuation[]> = new Map();
  
  // Weighting factors for combining bands
  private readonly bandWeights = {
    narrative: 0.25,
    technical: 0.35,
    fundamental: 0.40,
  };

  /**
   * Appraise a financial asset
   */
  appraiseFinancial(
    symbol: string,
    assetType: AssetType,
    currentPrice: number,
    data: {
      narrative?: { sentiment: number; momentum: number; newsScore: number };
      technical?: { support: number; resistance: number; trend: number; rsi: number };
      fundamental?: { peRatio?: number; revenueGrowth?: number; fcfYield?: number };
      liquidity?: { volume: number; spread: number };
    }
  ): FinancialValuation {
    // Calculate narrative band
    const narrativeBand = this.calculateNarrativeBand(currentPrice, data.narrative);
    
    // Calculate technical band
    const technicalBand = this.calculateTechnicalBand(currentPrice, data.technical);
    
    // Calculate fundamental band
    const fundamentalBand = this.calculateFundamentalBand(currentPrice, data.fundamental);
    
    // Combine bands into fair value
    const fairValue = this.combineBands(narrativeBand, technicalBand, fundamentalBand);
    
    // Calculate liquidity penalty
    const liquidityPenalty = this.calculateLiquidityPenalty(data.liquidity);
    
    // Apply liquidity adjustment
    const adjustedFairValue: ValuationBand = {
      low: fairValue.low * (1 - liquidityPenalty.discount / 100),
      mid: fairValue.mid * (1 - liquidityPenalty.discount / 200),
      high: fairValue.high,
      confidence: fairValue.confidence * liquidityPenalty.score,
      methodology: 'Combined + Liquidity Adjusted',
    };
    
    // Generate recommendation
    const recommendation = this.generateFinancialRecommendation(
      currentPrice,
      adjustedFairValue,
      data.technical?.trend ?? 0
    );
    
    const valuation: FinancialValuation = {
      id: uuidv4(),
      assetId: symbol,
      symbol,
      assetType,
      timestamp: Date.now(),
      currentPrice,
      narrativeBand,
      technicalBand,
      fundamentalBand,
      fairValue,
      liquidityPenalty,
      adjustedFairValue,
      recommendation,
    };
    
    // Store valuation
    if (!this.financialValuations.has(symbol)) {
      this.financialValuations.set(symbol, []);
    }
    this.financialValuations.get(symbol)!.push(valuation);
    
    return valuation;
  }

  /**
   * Calculate narrative-driven valuation band
   */
  private calculateNarrativeBand(
    currentPrice: number,
    data?: { sentiment: number; momentum: number; newsScore: number }
  ): ValuationBand {
    if (!data) {
      return {
        low: currentPrice * 0.9,
        mid: currentPrice,
        high: currentPrice * 1.1,
        confidence: 0.3,
        methodology: 'Narrative (No Data)',
      };
    }
    
    // Sentiment ranges from -1 to 1, scale to price impact
    const sentimentImpact = data.sentiment * 0.15; // +/-15% max from sentiment
    const momentumImpact = data.momentum * 0.1; // +/-10% from momentum
    const newsImpact = data.newsScore * 0.1; // +/-10% from news
    
    const totalImpact = sentimentImpact + momentumImpact + newsImpact;
    
    return {
      low: currentPrice * (1 + totalImpact - 0.1),
      mid: currentPrice * (1 + totalImpact),
      high: currentPrice * (1 + totalImpact + 0.1),
      confidence: Math.min(0.9, 0.5 + Math.abs(data.sentiment) * 0.3),
      methodology: 'Narrative (Sentiment + Momentum + News)',
    };
  }

  /**
   * Calculate technical valuation band
   */
  private calculateTechnicalBand(
    currentPrice: number,
    data?: { support: number; resistance: number; trend: number; rsi: number }
  ): ValuationBand {
    if (!data) {
      return {
        low: currentPrice * 0.95,
        mid: currentPrice,
        high: currentPrice * 1.05,
        confidence: 0.3,
        methodology: 'Technical (No Data)',
      };
    }
    
    // Use support/resistance as natural bounds
    const { support, resistance, trend, rsi } = data;
    
    // RSI adjustment (overbought/oversold)
    let rsiAdjustment = 0;
    if (rsi > 70) rsiAdjustment = -0.05; // Overbought, expect pullback
    else if (rsi < 30) rsiAdjustment = 0.05; // Oversold, expect bounce
    
    // Trend adjustment
    const trendAdjustment = trend * 0.1;
    
    return {
      low: Math.min(support, currentPrice * 0.9),
      mid: currentPrice * (1 + trendAdjustment + rsiAdjustment),
      high: Math.max(resistance, currentPrice * 1.1),
      confidence: 0.7,
      methodology: 'Technical (Support/Resistance + RSI + Trend)',
    };
  }

  /**
   * Calculate fundamental valuation band
   */
  private calculateFundamentalBand(
    currentPrice: number,
    data?: { peRatio?: number; revenueGrowth?: number; fcfYield?: number }
  ): ValuationBand {
    if (!data) {
      return {
        low: currentPrice * 0.85,
        mid: currentPrice,
        high: currentPrice * 1.15,
        confidence: 0.3,
        methodology: 'Fundamental (No Data)',
      };
    }
    
    let adjustment = 0;
    let confidenceBoost = 0;
    
    // P/E ratio analysis (assuming market avg of 20)
    if (data.peRatio) {
      if (data.peRatio < 15) adjustment += 0.1; // Undervalued
      else if (data.peRatio > 30) adjustment -= 0.1; // Overvalued
      confidenceBoost += 0.1;
    }
    
    // Revenue growth
    if (data.revenueGrowth) {
      adjustment += data.revenueGrowth * 0.5; // Growth drives value
      confidenceBoost += 0.1;
    }
    
    // Free cash flow yield
    if (data.fcfYield) {
      if (data.fcfYield > 0.08) adjustment += 0.1; // Strong FCF
      else if (data.fcfYield < 0.02) adjustment -= 0.05;
      confidenceBoost += 0.1;
    }
    
    return {
      low: currentPrice * (1 + adjustment - 0.15),
      mid: currentPrice * (1 + adjustment),
      high: currentPrice * (1 + adjustment + 0.15),
      confidence: Math.min(0.9, 0.4 + confidenceBoost),
      methodology: 'Fundamental (P/E + Growth + FCF)',
    };
  }

  /**
   * Combine valuation bands
   */
  private combineBands(
    narrative: ValuationBand,
    technical: ValuationBand,
    fundamental: ValuationBand
  ): ValuationBand {
    const { bandWeights } = this;
    
    // Weight by confidence and assigned weights
    const totalWeight = 
      narrative.confidence * bandWeights.narrative +
      technical.confidence * bandWeights.technical +
      fundamental.confidence * bandWeights.fundamental;
    
    const weightedMid = (
      narrative.mid * narrative.confidence * bandWeights.narrative +
      technical.mid * technical.confidence * bandWeights.technical +
      fundamental.mid * fundamental.confidence * bandWeights.fundamental
    ) / totalWeight;
    
    return {
      low: Math.min(narrative.low, technical.low, fundamental.low),
      mid: weightedMid,
      high: Math.max(narrative.high, technical.high, fundamental.high),
      confidence: (narrative.confidence + technical.confidence + fundamental.confidence) / 3,
      methodology: 'Combined (Narrative + Technical + Fundamental)',
    };
  }

  /**
   * Calculate liquidity penalty
   */
  private calculateLiquidityPenalty(
    data?: { volume: number; spread: number }
  ): FinancialValuation['liquidityPenalty'] {
    if (!data) {
      return {
        score: 0.5,
        discount: 5,
        avgDailyVolume: 0,
        bidAskSpread: 0.01,
      };
    }
    
    // Higher volume = more liquid = higher score
    const volumeScore = Math.min(1, data.volume / 1000000);
    
    // Lower spread = more liquid = higher score
    const spreadScore = Math.max(0, 1 - data.spread * 10);
    
    const score = (volumeScore + spreadScore) / 2;
    const discount = (1 - score) * 10; // Up to 10% discount for illiquidity
    
    return {
      score,
      discount,
      avgDailyVolume: data.volume,
      bidAskSpread: data.spread,
    };
  }

  /**
   * Generate financial recommendation
   */
  private generateFinancialRecommendation(
    currentPrice: number,
    fairValue: ValuationBand,
    trend: number
  ): FinancialValuation['recommendation'] {
    const upside = (fairValue.mid - currentPrice) / currentPrice;
    const downside = (currentPrice - fairValue.low) / currentPrice;
    const riskReward = Math.abs(upside / (downside || 0.01));
    
    let action: FinancialValuation['recommendation']['action'] = 'hold';
    let timeHorizon: FinancialValuation['recommendation']['timeHorizon'] = 'swing';
    
    if (upside > 0.2 && riskReward > 2) {
      action = 'strong_buy';
      timeHorizon = trend > 0.5 ? 'swing' : 'position';
    } else if (upside > 0.1 && riskReward > 1.5) {
      action = 'buy';
      timeHorizon = 'swing';
    } else if (upside < -0.15) {
      action = 'strong_sell';
    } else if (upside < -0.05) {
      action = 'sell';
    }
    
    return {
      action,
      targetPrice: fairValue.mid,
      stopLoss: fairValue.low * 0.95,
      riskRewardRatio: riskReward,
      timeHorizon,
    };
  }

  /**
   * Appraise a commerce product
   */
  appraiseCommerce(
    productId: string,
    sku: string,
    productName: string,
    currentPrice: number,
    data: {
      costBasis: number;
      competitors?: { prices: number[]; count: number };
      demand?: { current: number; weekChange: number; monthChange: number };
      inventory?: { onHand: number; salesVelocity: number };
    }
  ): CommerceValuation {
    // Calculate fair price range
    const fairPriceRange = this.calculateCommerceFairPrice(currentPrice, data);
    
    // Calculate margin floor
    const marginFloor = {
      costBasis: data.costBasis,
      minAcceptableMargin: 0.15, // 15% minimum
      floorPrice: data.costBasis * 1.15,
    };
    
    // Calculate demand volatility
    const demandVolatility = this.calculateDemandVolatility(data.demand);
    
    // Calculate saturation metrics
    const saturationMetrics = this.calculateSaturationMetrics(data.competitors, data.inventory);
    
    // Generate recommended price
    const recommendedPrice = this.generatePriceRecommendation(
      fairPriceRange,
      marginFloor,
      demandVolatility,
      saturationMetrics
    );
    
    // Generate inventory recommendation
    const inventoryRecommendation = this.generateInventoryRecommendation(
      demandVolatility,
      saturationMetrics,
      data.inventory
    );
    
    const valuation: CommerceValuation = {
      id: uuidv4(),
      productId,
      sku,
      productName,
      timestamp: Date.now(),
      currentPrice,
      fairPriceRange,
      marginFloor,
      demandVolatility,
      saturationMetrics,
      recommendedPrice,
      inventoryRecommendation,
    };
    
    // Store valuation
    if (!this.commerceValuations.has(productId)) {
      this.commerceValuations.set(productId, []);
    }
    this.commerceValuations.get(productId)!.push(valuation);
    
    return valuation;
  }

  /**
   * Calculate fair price for commerce product
   */
  private calculateCommerceFairPrice(
    currentPrice: number,
    data: { competitors?: { prices: number[]; count: number } }
  ): CommerceValuation['fairPriceRange'] {
    if (!data.competitors || data.competitors.prices.length === 0) {
      return {
        low: currentPrice * 0.85,
        mid: currentPrice,
        high: currentPrice * 1.15,
        confidence: 0.4,
      };
    }
    
    const prices = data.competitors.prices;
    const sorted = [...prices].sort((a, b) => a - b);
    
    return {
      low: sorted[0],
      mid: sorted[Math.floor(sorted.length / 2)],
      high: sorted[sorted.length - 1],
      confidence: Math.min(0.9, 0.5 + data.competitors.count * 0.05),
    };
  }

  /**
   * Calculate demand volatility
   */
  private calculateDemandVolatility(
    data?: { current: number; weekChange: number; monthChange: number }
  ): CommerceValuation['demandVolatility'] {
    if (!data) {
      return {
        currentDemand: 50,
        weekOverWeek: 0,
        monthOverMonth: 0,
        seasonalityFactor: 1,
        trendDirection: 'stable',
      };
    }
    
    let trendDirection: CommerceValuation['demandVolatility']['trendDirection'] = 'stable';
    if (data.weekChange > 5 && data.monthChange > 10) trendDirection = 'rising';
    else if (data.weekChange < -5 && data.monthChange < -10) trendDirection = 'falling';
    
    return {
      currentDemand: data.current,
      weekOverWeek: data.weekChange,
      monthOverMonth: data.monthChange,
      seasonalityFactor: 1, // Would be calculated from historical data
      trendDirection,
    };
  }

  /**
   * Calculate saturation metrics
   */
  private calculateSaturationMetrics(
    competitors?: { prices: number[]; count: number },
    inventory?: { onHand: number; salesVelocity: number }
  ): CommerceValuation['saturationMetrics'] {
    const competitorCount = competitors?.count ?? 5;
    const prices = competitors?.prices ?? [];
    
    // Estimate days to saturation based on competitor growth
    const daysToSaturation = Math.max(30, 365 / (competitorCount + 1));
    
    return {
      estimatedDaysToSaturation: daysToSaturation,
      competitorCount,
      competitorPriceRange: {
        low: prices.length > 0 ? Math.min(...prices) : 0,
        high: prices.length > 0 ? Math.max(...prices) : 0,
      },
      marketShare: competitorCount > 0 ? 1 / (competitorCount + 1) : 0.5,
    };
  }

  /**
   * Generate price recommendation
   */
  private generatePriceRecommendation(
    fairPrice: CommerceValuation['fairPriceRange'],
    marginFloor: CommerceValuation['marginFloor'],
    demand: CommerceValuation['demandVolatility'],
    saturation: CommerceValuation['saturationMetrics']
  ): CommerceValuation['recommendedPrice'] {
    const reasoning: string[] = [];
    
    // Start with fair price mid
    let optimal = fairPrice.mid;
    
    // Adjust for demand
    if (demand.trendDirection === 'rising') {
      optimal *= 1.05;
      reasoning.push('Demand rising - price premium justified');
    } else if (demand.trendDirection === 'falling') {
      optimal *= 0.95;
      reasoning.push('Demand falling - competitive pricing needed');
    }
    
    // Adjust for saturation timeline
    if (saturation.estimatedDaysToSaturation < 60) {
      reasoning.push('Market saturation approaching - price aggressively');
    }
    
    // Ensure above margin floor
    optimal = Math.max(optimal, marginFloor.floorPrice);
    
    return {
      optimal,
      aggressive: Math.max(marginFloor.floorPrice, optimal * 0.9),
      premium: optimal * 1.15,
      reasoning,
    };
  }

  /**
   * Generate inventory recommendation
   */
  private generateInventoryRecommendation(
    demand: CommerceValuation['demandVolatility'],
    saturation: CommerceValuation['saturationMetrics'],
    inventory?: { onHand: number; salesVelocity: number }
  ): CommerceValuation['inventoryRecommendation'] {
    const velocity = inventory?.salesVelocity ?? 1;
    const onHand = inventory?.onHand ?? 0;
    const daysOfStock = velocity > 0 ? onHand / velocity : 999;
    
    if (demand.trendDirection === 'rising' && saturation.estimatedDaysToSaturation > 90) {
      return {
        action: 'accumulate',
        targetQuantity: Math.ceil(velocity * 30), // 30 days of stock
        urgency: 'high',
        reasoning: 'Rising demand with runway - build inventory',
      };
    }
    
    if (saturation.estimatedDaysToSaturation < 30 || demand.trendDirection === 'falling') {
      return {
        action: 'liquidate',
        targetQuantity: Math.ceil(velocity * 7), // 7 days max
        urgency: 'high',
        reasoning: 'Market saturating or demand falling - reduce exposure',
      };
    }
    
    return {
      action: 'hold',
      targetQuantity: Math.ceil(velocity * 14), // 14 days
      urgency: 'low',
      reasoning: 'Stable conditions - maintain current levels',
    };
  }

  /**
   * Get latest financial valuation
   */
  getLatestFinancial(symbol: string): FinancialValuation | undefined {
    const valuations = this.financialValuations.get(symbol);
    return valuations?.[valuations.length - 1];
  }

  /**
   * Get latest commerce valuation
   */
  getLatestCommerce(productId: string): CommerceValuation | undefined {
    const valuations = this.commerceValuations.get(productId);
    return valuations?.[valuations.length - 1];
  }

  /**
   * Get valuation history
   */
  getFinancialHistory(symbol: string, limit?: number): FinancialValuation[] {
    const valuations = this.financialValuations.get(symbol) ?? [];
    return limit ? valuations.slice(-limit) : valuations;
  }

  /**
   * Get stats
   */
  getStats(): {
    financialAssets: number;
    commerceProducts: number;
    totalValuations: number;
  } {
    let totalValuations = 0;
    for (const vals of this.financialValuations.values()) {
      totalValuations += vals.length;
    }
    for (const vals of this.commerceValuations.values()) {
      totalValuations += vals.length;
    }
    
    return {
      financialAssets: this.financialValuations.size,
      commerceProducts: this.commerceValuations.size,
      totalValuations,
    };
  }
}

export default Appraiser;
