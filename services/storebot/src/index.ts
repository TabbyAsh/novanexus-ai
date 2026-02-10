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
// Phase 7: Dropshipping MVP - Listing Draft + Export (Keyless)
// ============================================================================

interface ListingDraft {
  id: string;
  productIdea: string;
  title: string;
  description: string;
  category: string;
  suggestedPrice: number;
  priceRange: { min: number; max: number };
  imageRequirements: string[];
  keywords: string[];
  targetMarketplace: string;
  profitMargin: number;
  confidence: number;
  createdAt: string;
}

// In-memory store for listing drafts (would be DB in production)
const listingDrafts: Map<string, ListingDraft> = new Map();

/**
 * Generate a listing draft from a product idea
 */
function generateListingDraft(productIdea: string, niche?: string): ListingDraft {
  const id = `listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Detect category and pricing
  const q = productIdea.toLowerCase();
  let category = niche || 'general';
  let basePrice = 29.99;
  let margin = 0.30;
  
  if (/phone|electronic|gadget|tech/.test(q)) {
    category = 'electronics';
    basePrice = 49.99;
    margin = 0.25;
  } else if (/fashion|clothing|apparel|shirt|dress/.test(q)) {
    category = 'fashion';
    basePrice = 34.99;
    margin = 0.40;
  } else if (/home|kitchen|decor|furniture/.test(q)) {
    category = 'home-garden';
    basePrice = 39.99;
    margin = 0.35;
  } else if (/beauty|skincare|makeup|cosmetic/.test(q)) {
    category = 'beauty';
    basePrice = 24.99;
    margin = 0.45;
  } else if (/pet|dog|cat|animal/.test(q)) {
    category = 'pet-supplies';
    basePrice = 19.99;
    margin = 0.40;
  } else if (/toy|game|kids|children/.test(q)) {
    category = 'toys';
    basePrice = 24.99;
    margin = 0.35;
  }
  
  // Generate title variations
  const titleWords = productIdea.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const title = `Premium ${titleWords.join(' ')} - High Quality ${category.charAt(0).toUpperCase() + category.slice(1)} Product`;
  
  // Generate description
  const description = `Introducing our ${productIdea}! ` +
    `This premium quality product is perfect for ${category === 'fashion' ? 'style-conscious shoppers' : category === 'home-garden' ? 'home enthusiasts' : 'discerning customers'}. ` +
    `Features include durable construction, modern design, and excellent value. ` +
    `Order now and experience the difference quality makes!\n\n` +
    `KEY FEATURES:\n` +
    `• Premium materials for long-lasting durability\n` +
    `• Modern, sleek design\n` +
    `• Easy to use and maintain\n` +
    `• Fast shipping available\n` +
    `• 30-day satisfaction guarantee`;
  
  // Generate keywords
  const keywords = [
    ...productIdea.toLowerCase().split(' ').filter(w => w.length > 2),
    category,
    'best seller',
    'top rated',
    'premium quality',
    'fast shipping',
  ];
  
  // Image requirements
  const imageRequirements = [
    'Main product image on white background (1000x1000px)',
    'Lifestyle shot showing product in use',
    'Close-up of product details/features',
    'Size comparison or scale reference',
    'Packaging/unboxing photo',
  ];
  
  const draft: ListingDraft = {
    id,
    productIdea,
    title,
    description,
    category,
    suggestedPrice: basePrice,
    priceRange: { min: basePrice * 0.8, max: basePrice * 1.5 },
    imageRequirements,
    keywords,
    targetMarketplace: 'shopify',
    profitMargin: margin,
    confidence: 70,
    createdAt: nowTimestamp(),
  };
  
  listingDrafts.set(id, draft);
  return draft;
}

// Generate listing draft from product idea
app.post('/api/dropship/generate', (req: Request, res: Response) => {
  const { productIdea, niche } = req.body;
  
  if (!productIdea) {
    return res.status(400).json({ success: false, error: 'productIdea is required' });
  }
  
  const draft = generateListingDraft(productIdea, niche);
  
  res.json({
    success: true,
    data: {
      draft,
      message: 'Listing draft generated successfully. Use /api/dropship/export/:id for CSV export.',
    },
  });
});

// List all drafts
app.get('/api/dropship/drafts', (_req: Request, res: Response) => {
  const drafts = Array.from(listingDrafts.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ success: true, data: { drafts, count: drafts.length } });
});

// Get single draft
app.get('/api/dropship/drafts/:id', (req: Request, res: Response) => {
  const draft = listingDrafts.get(req.params.id);
  if (!draft) {
    return res.status(404).json({ success: false, error: 'Draft not found' });
  }
  res.json({ success: true, data: { draft } });
});

// Export draft as CSV (Shopify/WooCommerce compatible)
app.get('/api/dropship/export/:id', (req: Request, res: Response) => {
  const draft = listingDrafts.get(req.params.id);
  if (!draft) {
    return res.status(404).json({ success: false, error: 'Draft not found' });
  }
  
  const format = req.query.format || 'shopify';
  
  // Shopify CSV format
  const csvHeaders = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type',
    'Tags', 'Published', 'Variant SKU', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Image Src', 'Image Position',
  ];
  
  const handle = draft.productIdea.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const sku = `NOVA-${draft.id.split('_')[1]}`;
  
  const csvRow = [
    handle,
    `"${draft.title.replace(/"/g, '""')}"`,
    `"${draft.description.replace(/"/g, '""').replace(/\n/g, '<br>')}"`,
    'Nova Dropship',
    draft.category,
    draft.category,
    `"${draft.keywords.join(', ')}"`,
    'TRUE',
    sku,
    draft.suggestedPrice.toFixed(2),
    (draft.suggestedPrice * 1.3).toFixed(2),
    'TRUE',
    'TRUE',
    '', // Image placeholder
    '1',
  ];
  
  const csv = csvHeaders.join(',') + '\n' + csvRow.join(',');
  
  if (req.query.download === 'true') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${handle}.csv"`);
    return res.send(csv);
  }
  
  res.json({
    success: true,
    data: {
      format,
      csv,
      draft,
      downloadUrl: `/api/dropship/export/${draft.id}?download=true`,
    },
  });
});

// Batch export all drafts
app.get('/api/dropship/export', (_req: Request, res: Response) => {
  const drafts = Array.from(listingDrafts.values());
  
  if (drafts.length === 0) {
    return res.status(404).json({ success: false, error: 'No drafts to export' });
  }
  
  const csvHeaders = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type',
    'Tags', 'Published', 'Variant SKU', 'Variant Price', 'Variant Compare At Price',
  ];
  
  const csvRows = drafts.map(draft => {
    const handle = draft.productIdea.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sku = `NOVA-${draft.id.split('_')[1]}`;
    return [
      handle,
      `"${draft.title.replace(/"/g, '""')}"`,
      `"${draft.description.replace(/"/g, '""').replace(/\n/g, '<br>')}"`,
      'Nova Dropship',
      draft.category,
      draft.category,
      `"${draft.keywords.join(', ')}"`,
      'TRUE',
      sku,
      draft.suggestedPrice.toFixed(2),
      (draft.suggestedPrice * 1.3).toFixed(2),
    ].join(',');
  });
  
  const csv = csvHeaders.join(',') + '\n' + csvRows.join('\n');
  
  res.json({
    success: true,
    data: {
      csv,
      count: drafts.length,
      message: `Exported ${drafts.length} listing drafts`,
    },
  });
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
