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
    if (products.length === 0) {
      return [];
    }
    const recommendations: PriceRecommendation[] = [];

    for (const product of products) {
      const marketData = await this.getMarketAnalysis(product.category);
      const recommendation = await this.analyzeProduct(product, marketData || undefined);
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
      throw new Error('DATABASE_URL not configured');
    }

    try {
      const result = await this.pool.query(
        `SELECT 
          id,
          sku,
          title AS name,
          COALESCE(description, '') AS description,
          COALESCE(category, 'Uncategorized') AS category,
          COALESCE(cost_price, 0) AS base_cost,
          COALESCE(retail_price, 0) AS current_price,
          COALESCE(min_price, 0) AS min_price,
          COALESCE(max_price, 0) AS max_price,
          COALESCE(quantity_on_hand, 0) AS stock_quantity,
          COALESCE(reorder_point, 0) AS reorder_point
         FROM products
         WHERE status IS NULL OR status NOT IN ('ARCHIVED')
         ORDER BY category, title`
      );
      return result.rows as Product[];
    } catch (error) {
      console.error('Failed to get products:', error);
      return [];
    }
  }

  /**
   * Get active pricing rules
   */
  async getActiveRules(): Promise<PricingRule[]> {
    if (!this.pool) {
      return [];
    }

    try {
      const result = await this.pool.query(
        `SELECT id, name, min_margin_percent, target_margin_percent, max_margin_percent, 
                match_competitor, competitor_offset_percent, increase_price_low_stock, 
                decrease_price_overstock, is_active, priority
         FROM pricing_rules WHERE is_active = true ORDER BY priority DESC`
      );

      const rules: PricingRule[] = [];

      for (const row of result.rows) {
        const targetMargin = Number(row.target_margin_percent ?? 35) / 100;
        rules.push({
          id: row.id,
          name: row.name,
          rule_type: 'margin',
          conditions: { target_margin: targetMargin },
          adjustments: {},
          priority: row.priority ?? 0,
          is_active: row.is_active,
        });

        if (row.increase_price_low_stock || row.decrease_price_overstock) {
          rules.push({
            id: `${row.id}-inventory`,
            name: `${row.name} (Inventory)`,
            rule_type: 'inventory',
            conditions: {},
            adjustments: {},
            priority: row.priority ?? 0,
            is_active: row.is_active,
          });
        }
      }

      return rules;
    } catch (error) {
      console.error('Failed to get pricing rules:', error);
      return [];
    }
  }

  /**
   * Get market analysis for a category
   */
  async getMarketAnalysis(_category: string): Promise<MarketAnalysis | null> {
    // Market analysis requires external data sources. If not configured, return null.
    return null;
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
        `INSERT INTO price_history (product_id, old_price, new_price, change_reason, created_at)
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
        'SELECT retail_price FROM products WHERE id = $1',
        [productId]
      );

      if (current.rows.length === 0) return false;

      const oldPrice = current.rows[0].retail_price;

      // Update price
      await this.pool.query(
        'UPDATE products SET retail_price = $1, updated_at = NOW() WHERE id = $2',
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
  }
}

// Export singleton instance
export const pricingEngine = new PricingEngine(process.env.DATABASE_URL);
