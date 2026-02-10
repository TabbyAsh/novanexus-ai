import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  BotClient,
  createBotConfig,
  createBotHealthRoutes,
  TaskDefinition,
  TaskContext,
  TaskResult,
} from '@nova/bot-sdk';
import { generateId, nowTimestamp, HTTP_STATUS } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { PricingEngine, Product as PricingProduct, PriceRecommendation } from './pricing-engine';
import { searchProducts, appraiseProduct, batchAppraise, ScrapedProduct, ProductAppraisal } from './product-scraper';

const PORT = parseInt(process.env.PORT || '3011', 10);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3002';

const logger = createLogger('storebot');
const app = express();
app.use(cors());
app.use(express.json());

// Initialize pricing engine
const pricingEngine = new PricingEngine(process.env.DATABASE_URL);

// ============================================================================
// Types
// ============================================================================

interface InventoryAlert {
  id: string;
  productId: string;
  sku: string;
  title: string;
  alertType: string;
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string;
}
async function checkInventory(): Promise<InventoryAlert[]> {
  try {
    const products = await pricingEngine.getProducts();
    if (!products.length) return [];

    const alerts: InventoryAlert[] = [];

    for (const product of products) {
      if (product.stock_quantity <= 0) {
        alerts.push({
          id: generateId(),
          productId: product.id,
          sku: product.sku,
          title: product.name,
          alertType: 'OUT_OF_STOCK',
          message: 'Product is out of stock',
          severity: 'HIGH',
          createdAt: nowTimestamp(),
        });
      } else if (product.reorder_point > 0 && product.stock_quantity <= product.reorder_point) {
        alerts.push({
          id: generateId(),
          productId: product.id,
          sku: product.sku,
          title: product.name,
          alertType: 'LOW_STOCK',
          message: `Low stock (${product.stock_quantity} units)`,
          severity: 'MEDIUM',
          createdAt: nowTimestamp(),
        });
      }
    }

    return alerts;
  } catch (error) {
    logger.error('Inventory check failed', error as Error);
    return [];
  }
}

async function analyzePricing(): Promise<PriceRecommendation[]> {
  try {
    return await pricingEngine.analyzeAllProducts();
  } catch (error) {
    logger.error('Pricing analysis failed', error as Error);
    return [];
  }
}

// ============================================================================
// Bot Setup
// ============================================================================

const botConfig = createBotConfig('storebot', [
  { name: 'inventory', version: '1.0.0', description: 'Inventory monitoring and alerts' },
  { name: 'pricing', version: '1.0.0', description: 'Dynamic pricing optimization' },
], { orchestratorUrl: ORCHESTRATOR_URL });

const bot = new BotClient(botConfig);

bot.registerTaskHandler('CHECK_INVENTORY', async (_task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.logger.info('Checking inventory levels');
  await ctx.reportProgress(50, 'Analyzing inventory...');
  
  const alerts = await checkInventory();
  
  for (const alert of alerts) {
    await ctx.emit('INVENTORY_ALERT', { ...alert });
  }
  
  return {
    success: true,
    output: { alerts, checkedAt: nowTimestamp() },
    metrics: { alertCount: alerts.length },
  };
});

bot.registerTaskHandler('ANALYZE_PRICING', async (_task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.logger.info('Analyzing pricing');
  await ctx.reportProgress(50, 'Computing recommendations...');
  
  const recommendations = await analyzePricing();
  
  return {
    success: true,
    output: { recommendations, analyzedAt: nowTimestamp() },
    metrics: { recommendationCount: recommendations.length },
  };
});

// ============================================================================
// Express Routes
// ============================================================================

const healthRoutes = createBotHealthRoutes({ bot });
app.get('/health', healthRoutes.healthHandler);
app.get('/ready', healthRoutes.readyHandler);
app.get('/metrics', healthRoutes.metricsHandler);

app.get('/api/products', async (_req: Request, res: Response) => {
  try {
    const products = await pricingEngine.getProducts();
    if (!products.length) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        error: { code: 'PRODUCTS_UNAVAILABLE', message: 'Products unavailable' },
      });
    }
    res.json({ success: true, data: { products } });
  } catch (err) {
    logger.error('Failed to load products', err as Error);
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'PRODUCTS_UNAVAILABLE', message: 'Products unavailable' },
    });
  }
});

app.get('/api/inventory/alerts', async (_req: Request, res: Response) => {
  try {
    const products = await pricingEngine.getProducts();
    if (!products.length) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        error: { code: 'INVENTORY_UNAVAILABLE', message: 'Inventory unavailable' },
      });
    }

    const alerts: InventoryAlert[] = [];

    for (const product of products) {
      if (product.stock_quantity <= 0) {
        alerts.push({
          id: generateId(),
          productId: product.id,
          sku: product.sku,
          title: product.name,
          alertType: 'OUT_OF_STOCK',
          message: 'Product is out of stock',
          severity: 'HIGH',
          createdAt: nowTimestamp(),
        });
      } else if (product.reorder_point > 0 && product.stock_quantity <= product.reorder_point) {
        alerts.push({
          id: generateId(),
          productId: product.id,
          sku: product.sku,
          title: product.name,
          alertType: 'LOW_STOCK',
          message: `Low stock (${product.stock_quantity} units)`,
          severity: 'MEDIUM',
          createdAt: nowTimestamp(),
        });
      }
    }

    res.json({ success: true, data: { alerts } });
  } catch (err) {
    logger.error('Inventory check failed', err as Error);
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'INVENTORY_UNAVAILABLE', message: 'Inventory unavailable' },
    });
  }
});

app.get('/api/pricing/recommendations', async (_req: Request, res: Response) => {
  try {
    const recommendations = await pricingEngine.analyzeAllProducts();
    if (!recommendations.length) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        error: { code: 'PRICING_UNAVAILABLE', message: 'Pricing recommendations unavailable' },
      });
    }
    res.json({ success: true, data: { recommendations } });
  } catch (err) {
    logger.error('Pricing recommendations failed', err as Error);
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'PRICING_UNAVAILABLE', message: 'Pricing recommendations unavailable' },
    });
  }
});

// Advanced Pricing Engine API
app.get('/api/pricing/analyze', async (_req: Request, res: Response) => {
  try {
    const recommendations = await pricingEngine.analyzeAllProducts();
    res.json({ success: true, data: { recommendations, analyzedAt: nowTimestamp() } });
  } catch (err) {
    logger.error('Pricing analysis failed');
    res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});

app.post('/api/pricing/apply', async (req: Request, res: Response) => {
  try {
    const { productId, newPrice, reason } = req.body;
    const success = await pricingEngine.applyPrice(productId, newPrice, reason);
    res.json({ success, message: success ? 'Price updated' : 'Failed to update price' });
  } catch (err) {
    logger.error('Price application failed');
    res.status(500).json({ success: false, error: 'Failed to apply price' });
  }
});

app.get('/api/products/catalog', async (_req: Request, res: Response) => {
  try {
    const products = await pricingEngine.getProducts();
    res.json({ success: true, data: { products } });
  } catch (err) {
    logger.error('Failed to get catalog');
    res.status(500).json({ success: false, error: 'Failed to get catalog' });
  }
});

// ============================================================================
// Product Scraping & Appraisal API
// ============================================================================

// Search products across multiple e-commerce sources
app.get('/api/products/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
    }
    const results = await searchProducts(query);
    res.json({ success: true, data: results });
  } catch (err) {
    logger.error('Product search failed', err as Error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Appraise a single product (get pricing recommendations)
app.post('/api/products/appraise', async (req: Request, res: Response) => {
  try {
    const { query, name } = req.body;
    const searchQuery = query || name;
    if (!searchQuery) {
      return res.status(400).json({ success: false, error: 'Product query or name is required' });
    }
    const appraisal = await appraiseProduct(searchQuery);
    res.json({ success: true, data: { appraisal } });
  } catch (err) {
    logger.error('Product appraisal failed', err as Error);
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: 'Appraisal unavailable',
    });
  }
});

// Batch appraise multiple products
app.post('/api/products/appraise/batch', async (req: Request, res: Response) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, error: 'Products array is required' });
    }
    const queries = products.map(p => typeof p === 'string' ? p : p.name || p.title || p.query);
    const appraisals = await batchAppraise(queries.filter(Boolean));
    res.json({ success: true, data: { appraisals } });
  } catch (err) {
    logger.error('Batch appraisal failed', err as Error);
    res.status(500).json({ success: false, error: 'Batch appraisal failed' });
  }
});

// Quick price check for a product
app.get('/api/products/price-check/:query', async (req: Request, res: Response) => {
  try {
    const { query } = req.params;
    const appraisal = await appraiseProduct(decodeURIComponent(query));
    res.json({ 
      success: true, 
      data: {
        query: appraisal.query,
        recommendedPrice: appraisal.recommendedPrice,
        priceRange: appraisal.priceRange,
        marketDemand: appraisal.marketDemand,
        confidence: appraisal.confidence,
        sourceCount: appraisal.sources.length,
      }
    });
  } catch (err) {
    logger.error('Price check failed', err as Error);
    res.status(500).json({ success: false, error: 'Price check failed' });
  }
});

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  app.listen(PORT, () => logger.info(`StoreBot API started on port ${PORT}`));
  
  try {
    await bot.start();
    logger.info('StoreBot connected to orchestrator');
  } catch (error) {
    logger.warn('Running in standalone mode', { error });
  }
}

process.on('SIGTERM', async () => { await bot.stop(); process.exit(0); });
process.on('SIGINT', async () => { await bot.stop(); process.exit(0); });

main();
export default app;
