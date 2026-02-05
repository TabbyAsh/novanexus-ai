/**
 * Nova Enterprises - Intelligent Pricing Engine
 * Analyzes market trends, competitor pricing, and demand to optimize margins
 */

import { Pool } from 'pg';

// Types
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  base_cost: number;
  current_price: number;
  min_price: number;
  max_price: number;
  stock_quantity: number;
  reorder_point: number;
}

export interface PricingRule {
  id: string;
  name: string;
  rule_type: 'margin' | 'competitor' | 'demand' | 'time_based' | 'inventory';
  conditions: Record<string, unknown>;
  adjustments: Record<string, unknown>;
  priority: number;
  is_active: boolean;
}

export interface PriceRecommendation {
  product_id: string;
  current_price: number;
  recommended_price: number;
  reason: string;
  confidence: number;
  projected_margin: number;
  projected_revenue_change: number;
}

export interface MarketAnalysis {
  category: string;
  avg_market_price: number;
  price_trend: 'rising' | 'falling' | 'stable';
  demand_level: 'high' | 'medium' | 'low';
  competition_intensity: 'high' | 'medium' | 'low';
}

// Configuration
const DEFAULT_TARGET_MARGIN = 0.30; // 30% target margin
const DEMAND_MULTIPLIERS = {
  high: 1.15,
  medium: 1.0,
  low: 0.90,
};
const INVENTORY_THRESHOLDS = {
  overstock: 2.0, // 2x reorder point = overstock
  lowstock: 0.5,  // 0.5x reorder point = low stock
};

export class PricingEngine {
  private pool: Pool | null = null;

  constructor(connectionString?: string) {
    if (connectionString) {
      this.pool = new Pool({ connectionString });
    }
  }

  /**
   * Analyze a product and generate pricing recommendation
   */
  async analyzeProduct(product: Product, marketData?: MarketAnalysis): Promise<PriceRecommendation> {
    const rules = await this.getActiveRules();
    let recommendedPrice = product.current_price;
    const reasons: string[] = [];
    let totalConfidence = 0;
    let ruleCount = 0;

    // Apply each pricing rule
    for (const rule of rules) {
      const adjustment = this.applyRule(rule, product, marketData);
      if (adjustment) {
        recommendedPrice = this.adjustPrice(recommendedPrice, adjustment);
        reasons.push(adjustment.reason);
        totalConfidence += adjustment.confidence;
        ruleCount++;
      }
    }

    // Ensure price is within bounds
    recommendedPrice = Math.max(product.min_price, Math.min(product.max_price, recommendedPrice));

    // Calculate projected metrics
    const projectedMargin = (recommendedPrice - product.base_cost) / recommendedPrice;
    const priceChange = recommendedPrice - product.current_price;
    const projectedRevenueChange = priceChange * this.estimateDemandElasticity(product, priceChange);

    return {
      product_id: product.id,
      current_price: product.current_price,
      recommended_price: Math.round(recommendedPrice * 100) / 100,
      reason: reasons.join('; ') || 'No adjustments needed',
      confidence: ruleCount > 0 ? totalConfidence / ruleCount : 0.5,
      projected_margin: Math.round(projectedMargin * 10000) / 100,
      projected_revenue_change: Math.round(projectedRevenueChange * 100) / 100,
    };
  }

  /**
   * Bulk analyze all products
   */
  async analyzeAllProducts(): Promise<PriceRecommendation[]> {
    const products = await this.getProducts();
    const recommendations: PriceRecommendation[] = [];

    for (const product of products) {
      const marketData = await this.getMarketAnalysis(product.category);
      const recommendation = await this.analyzeProduct(product, marketData);
      recommendations.push(recommendation);
    }

    return recommendations;
  }

  /**
   * Apply a specific pricing rule
   */
  private applyRule(
    rule: PricingRule,
    product: Product,
    marketData?: MarketAnalysis
  ): { multiplier?: number; fixed?: number; reason: string; confidence: number } | null {
    switch (rule.rule_type) {
      case 'margin':
        return this.applyMarginRule(rule, product);
      case 'demand':
        return this.applyDemandRule(rule, product, marketData);
      case 'inventory':
        return this.applyInventoryRule(rule, product);
      case 'time_based':
        return this.applyTimeBasedRule(rule, product);
      case 'competitor':
        return this.applyCompetitorRule(rule, product, marketData);
      default:
        return null;
    }
  }

  /**
   * Margin-based pricing rule
   */
  private applyMarginRule(
    rule: PricingRule,
    product: Product
  ): { multiplier?: number; fixed?: number; reason: string; confidence: number } | null {
    const targetMargin = (rule.conditions as { target_margin?: number }).target_margin || DEFAULT_TARGET_MARGIN;
    const currentMargin = (product.current_price - product.base_cost) / product.current_price;

    if (Math.abs(currentMargin - targetMargin) > 0.05) {
      const targetPrice = product.base_cost / (1 - targetMargin);
      const multiplier = targetPrice / product.current_price;

      return {
        multiplier,
        reason: `Adjusting to target ${(targetMargin * 100).toFixed(0)}% margin`,
        confidence: 0.9,
      };
    }

    return null;
  }

  /**
   * Demand-based pricing rule
   */
  private applyDemandRule(
    rule: PricingRule,
    product: Product,
    marketData?: MarketAnalysis
  ): { multiplier?: number; fixed?: number; reason: string; confidence: number } | null {
    if (!marketData) return null;

    const demandLevel = marketData.demand_level;
    const multiplier = DEMAND_MULTIPLIERS[demandLevel];

    if (multiplier !== 1.0) {
      return {
        multiplier,
        reason: `${demandLevel} demand in ${product.category}`,
        confidence: 0.75,
      };
    }

    return null;
  }

  /**
   * Inventory-based pricing rule
   */
  private applyInventoryRule(
    rule: PricingRule,
    product: Product
  ): { multiplier?: number; fixed?: number; reason: string; confidence: number } | null {
    const stockRatio = product.stock_quantity / product.reorder_point;

    if (stockRatio >= INVENTORY_THRESHOLDS.overstock) {
      // Overstock - reduce price to move inventory
      return {
        multiplier: 0.90,
        reason: `Overstock clearance (${product.stock_quantity} units)`,
        confidence: 0.85,
      };
    } else if (stockRatio <= INVENTORY_THRESHOLDS.lowstock) {
      // Low stock - increase price
      return {
        multiplier: 1.10,
        reason: `Low inventory premium (${product.stock_quantity} units)`,
        confidence: 0.80,
      };
    }

    return null;
  }

  /**
   * Time-based pricing rule (day of week, time of day, seasonality)
   */
  private applyTimeBasedRule(
    rule: PricingRule,
    product: Product
  ): { multiplier?: number; fixed?: number; reason: string; confidence: number } | null {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    const month = now.getMonth();

    // Weekend premium
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        multiplier: 1.05,
        reason: 'Weekend pricing',
        confidence: 0.70,
      };
    }

    // Holiday season (Nov-Dec)
    if (month === 10 || month === 11) {
      return {
        multiplier: 1.10,
        reason: 'Holiday season demand',
        confidence: 0.80,
      };
    }

    // Prime shopping hours (6PM - 10PM)
    if (hour >= 18 && hour <= 22) {
      return {
        multiplier: 1.03,
        reason: 'Peak shopping hours',
        confidence: 0.60,
      };
    }

    return null;
  }

  /**
   * Competitor-based pricing rule
   */
  private applyCompetitorRule(
    rule: PricingRule,
    product: Product,
    marketData?: MarketAnalysis
  ): { multiplier?: number; fixed?: number; reason: string; confidence: number } | null {
    if (!marketData) return null;

    const priceDiff = product.current_price - marketData.avg_market_price;
    const priceDiffPercent = priceDiff / marketData.avg_market_price;

    // If we're significantly higher than market, consider reducing
    if (priceDiffPercent > 0.15) {
      return {
        multiplier: 0.95,
        reason: 'Competitor price alignment',
        confidence: 0.70,
      };
    }

    // If market is rising, we can raise prices
    if (marketData.price_trend === 'rising' && priceDiffPercent < 0.10) {
      return {
        multiplier: 1.05,
        reason: 'Market trend following',
        confidence: 0.65,
      };
    }

    return null;
  }

  /**
   * Apply price adjustment
   */
  private adjustPrice(
    currentPrice: number,
    adjustment: { multiplier?: number; fixed?: number }
  ): number {
    if (adjustment.multiplier) {
      return currentPrice * adjustment.multiplier;
    }
    if (adjustment.fixed) {
      return currentPrice + adjustment.fixed;
    }
    return currentPrice;
  }

  /**
   * Estimate demand elasticity for a product
   */
  private estimateDemandElasticity(product: Product, priceChange: number): number {
    // Simple elasticity model: -1.5 elasticity means 1% price increase = 1.5% demand decrease
    const elasticity = -1.5;
    const priceChangePercent = priceChange / product.current_price;
    const demandChangePercent = priceChangePercent * elasticity;
    
    // Estimate base demand from stock/reorder ratio
    const baseDemand = product.reorder_point * 2;
    return baseDemand * (1 + demandChangePercent);
  }

  /**
   * Get all products from database
   */
  async getProducts(): Promise<Product[]> {
    if (!this.pool) {
      return this.getStubProducts();
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM products WHERE is_active = true ORDER BY category, name'
      );
      return result.rows;
    } catch (error) {
      console.error('Failed to get products:', error);
      return this.getStubProducts();
    }
  }

  /**
   * Get active pricing rules
   */
  async getActiveRules(): Promise<PricingRule[]> {
    if (!this.pool) {
      return this.getStubRules();
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM pricing_rules WHERE is_active = true ORDER BY priority DESC'
      );
      return result.rows;
    } catch (error) {
      console.error('Failed to get pricing rules:', error);
      return this.getStubRules();
    }
  }

  /**
   * Get market analysis for a category
   */
  async getMarketAnalysis(category: string): Promise<MarketAnalysis> {
    // In production, this would pull from market data APIs
    // For now, return simulated data
    return {
      category,
      avg_market_price: 50 + Math.random() * 100,
      price_trend: ['rising', 'falling', 'stable'][Math.floor(Math.random() * 3)] as 'rising' | 'falling' | 'stable',
      demand_level: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)] as 'high' | 'medium' | 'low',
      competition_intensity: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)] as 'high' | 'medium' | 'low',
    };
  }

  /**
   * Save price history
   */
  async savePriceHistory(
    productId: string,
    oldPrice: number,
    newPrice: number,
    reason: string
  ): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.query(
        `INSERT INTO price_history (product_id, old_price, new_price, change_reason, changed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [productId, oldPrice, newPrice, reason]
      );
    } catch (error) {
      console.error('Failed to save price history:', error);
    }
  }

  /**
   * Apply recommended price
   */
  async applyPrice(productId: string, newPrice: number, reason: string): Promise<boolean> {
    if (!this.pool) return false;

    try {
      // Get current price
      const current = await this.pool.query(
        'SELECT current_price FROM products WHERE id = $1',
        [productId]
      );

      if (current.rows.length === 0) return false;

      const oldPrice = current.rows[0].current_price;

      // Update price
      await this.pool.query(
        'UPDATE products SET current_price = $1, updated_at = NOW() WHERE id = $2',
        [newPrice, productId]
      );

      // Save history
      await this.savePriceHistory(productId, oldPrice, newPrice, reason);

      return true;
    } catch (error) {
      console.error('Failed to apply price:', error);
      return false;
    }
  }

  /**
   * Stub products for testing
   */
  private getStubProducts(): Product[] {
    return [
      {
        id: '1',
        sku: 'NOVA-001',
        name: 'Nova Smart Hub Pro',
        description: 'AI-powered home automation hub',
        category: 'Electronics',
        base_cost: 75,
        current_price: 149.99,
        min_price: 99.99,
        max_price: 199.99,
        stock_quantity: 150,
        reorder_point: 50,
      },
      {
        id: '2',
        sku: 'NOVA-002',
        name: 'Nova Wireless Earbuds',
        description: 'Premium noise-cancelling earbuds',
        category: 'Electronics',
        base_cost: 35,
        current_price: 79.99,
        min_price: 59.99,
        max_price: 99.99,
        stock_quantity: 300,
        reorder_point: 100,
      },
      {
        id: '3',
        sku: 'NOVA-003',
        name: 'Nova Fitness Tracker',
        description: 'Advanced health monitoring wearable',
        category: 'Wearables',
        base_cost: 45,
        current_price: 129.99,
        min_price: 89.99,
        max_price: 149.99,
        stock_quantity: 25,
        reorder_point: 75,
      },
      {
        id: '4',
        sku: 'NOVA-004',
        name: 'Nova Portable Charger 20K',
        description: '20000mAh fast charging power bank',
        category: 'Accessories',
        base_cost: 20,
        current_price: 49.99,
        min_price: 34.99,
        max_price: 69.99,
        stock_quantity: 500,
        reorder_point: 150,
      },
      {
        id: '5',
        sku: 'NOVA-005',
        name: 'Nova USB-C Hub 7-in-1',
        description: 'Premium aluminum multiport adapter',
        category: 'Accessories',
        base_cost: 25,
        current_price: 59.99,
        min_price: 44.99,
        max_price: 79.99,
        stock_quantity: 200,
        reorder_point: 80,
      },
    ];
  }

  /**
   * Stub pricing rules for testing
   */
  private getStubRules(): PricingRule[] {
    return [
      {
        id: '1',
        name: 'Target Margin Rule',
        rule_type: 'margin',
        conditions: { target_margin: 0.35 },
        adjustments: {},
        priority: 100,
        is_active: true,
      },
      {
        id: '2',
        name: 'Inventory Management',
        rule_type: 'inventory',
        conditions: {},
        adjustments: {},
        priority: 90,
        is_active: true,
      },
      {
        id: '3',
        name: 'Demand Pricing',
        rule_type: 'demand',
        conditions: {},
        adjustments: {},
        priority: 80,
        is_active: true,
      },
      {
        id: '4',
        name: 'Time-Based Pricing',
        rule_type: 'time_based',
        conditions: {},
        adjustments: {},
        priority: 70,
        is_active: true,
      },
    ];
  }
}

// Export singleton instance
export const pricingEngine = new PricingEngine(process.env.DATABASE_URL);
