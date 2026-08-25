import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  BotClient,
  createBotConfig,
  createBotHealthRoutes,
  installBotShutdownHandlers,
  startRegisteredBotHttpService,
  TaskDefinition,
  TaskContext,
  TaskResult,
} from '@nova/bot-sdk';
import { generateId, nowTimestamp, HTTP_STATUS, query, queryOne, novaCardInsert } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { PricingEngine, Product as PricingProduct, PriceRecommendation } from './pricing-engine';
import { searchProducts, appraiseProduct, batchAppraise, ScrapedProduct, ProductAppraisal } from './product-scraper';
import { analyzeFlip } from './flip-analyzer';

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
  ctx.throwIfCancelled();
  ctx.logger.info('Checking inventory levels');
  await ctx.reportProgress(50, 'Analyzing inventory...');
  ctx.throwIfCancelled();

  const alerts = await checkInventory();
  ctx.throwIfCancelled();

  for (const alert of alerts) {
    ctx.throwIfCancelled();
    await ctx.emit('INVENTORY_ALERT', { ...alert });
  }
  
  return {
    success: true,
    output: { alerts, checkedAt: nowTimestamp() },
    metrics: { alertCount: alerts.length },
  };
});

bot.registerTaskHandler('ANALYZE_PRICING', async (_task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.throwIfCancelled();
  ctx.logger.info('Analyzing pricing');
  await ctx.reportProgress(50, 'Computing recommendations...');
  ctx.throwIfCancelled();

  const recommendations = await analyzePricing();
  ctx.throwIfCancelled();

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
// Flip Card Analysis — the real Decision Card (Sprint Zero T4)
// ============================================================================

// POST /api/flips/analyze
// Body: { value: string, inputType?: 'description'|'url', askingPrice?: number, condition?: string }
// Produces a real FLIP DecisionCard from live eBay comps and (best-effort) persists it.
app.post('/api/flips/analyze', async (req: Request, res: Response) => {
  const { value, inputType, askingPrice, condition, sessionId } = req.body || {};
  if (!value || typeof value !== 'string') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'value (product description or URL) is required' },
    });
  }

  const userId = (req.headers['x-user-id'] as string) || null;

  try {
    const card = await analyzeFlip({
      value,
      inputType: inputType === 'url' ? 'url' : 'description',
      askingPrice: typeof askingPrice === 'number' ? askingPrice : null,
      condition: typeof condition === 'string' ? condition : undefined,
      userId,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    });

    // Persist to the universal nova_cards table (best-effort — never block the result).
    let persisted = false;
    try {
      const { text, values } = novaCardInsert(card);
      await query(text, values);
      persisted = true;
    } catch (err) {
      logger.warn('Flip card persistence failed (returning card anyway)', {
        error: (err as Error).message,
      });
    }

    res.json({ success: true, data: { card, persisted } });
  } catch (err) {
    logger.error('Flip analysis failed', err as Error);
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'FLIP_ANALYSIS_FAILED', message: 'Flip analysis unavailable' },
    });
  }
});

// ============================================================================
// Flip Pipeline CRUD
// ============================================================================

const FLIP_STATUSES = ['SOURCED', 'ACQUIRED', 'REPAIRING', 'LISTED', 'SOLD', 'ARCHIVED'] as const;

// List flips for a user (user_id passed via header from gateway)
app.get('/api/flips', async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const status = req.query.status as string | undefined;
  let sql = 'SELECT * FROM flip_plans WHERE user_id = $1';
  const params: (string)[] = [userId];
  if (status && FLIP_STATUSES.includes(status as any)) {
    sql += ' AND status = $2';
    params.push(status);
  }
  sql += ' ORDER BY updated_at DESC LIMIT 100';

  try {
    const result = await query<any>(sql, params);
    const flips = result.rows.map(formatFlip);
    // Compute summary
    const totalInvested = flips.reduce((s: number, f: any) => s + (f.purchasePrice || 0) + (f.repairCost || 0), 0);
    const totalRevenue = flips.filter((f: any) => f.status === 'SOLD').reduce((s: number, f: any) => s + (f.soldPrice || 0), 0);
    const totalFees = flips.filter((f: any) => f.status === 'SOLD').reduce((s: number, f: any) => s + (f.shippingCost || 0) + (f.platformFees || 0), 0);
    res.json({ success: true, data: { flips, summary: { totalInvested, totalRevenue, totalFees, netProfit: totalRevenue - totalInvested - totalFees, count: flips.length } } });
  } catch (err) {
    logger.error('Failed to list flips', err as Error);
    res.status(500).json({ success: false, error: 'Failed to list flips' });
  }
});

// Create flip
app.post('/api/flips', async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const orgId = req.headers['x-org-id'] as string || null;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { itemName, category, source, sourceUrl, purchasePrice, repairCost, listingPrice, notes } = req.body;
  if (!itemName) return res.status(400).json({ success: false, error: 'itemName is required' });

  try {
    const row = await queryOne<any>(
      `INSERT INTO flip_plans (user_id, org_id, item_name, category, source, source_url, purchase_price, repair_cost, listing_price, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [userId, orgId, itemName, category || null, source || null, sourceUrl || null, purchasePrice || 0, repairCost || 0, listingPrice || null, notes || null]
    );
    res.status(201).json({ success: true, data: { flip: formatFlip(row) } });
  } catch (err) {
    logger.error('Failed to create flip', err as Error);
    res.status(500).json({ success: false, error: 'Failed to create flip' });
  }
});

// Get single flip
app.get('/api/flips/:id', async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const row = await queryOne<any>('SELECT * FROM flip_plans WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (!row) return res.status(404).json({ success: false, error: 'Flip not found' });
    res.json({ success: true, data: { flip: formatFlip(row) } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to get flip' });
  }
});

// Update flip (status transitions, price updates, notes)
app.put('/api/flips/:id', async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { status, listingPrice, soldPrice, shippingCost, platformFees, repairCost, notes } = req.body;

  const sets: string[] = ['updated_at = NOW()'];
  const vals: any[] = [];
  let i = 1;

  if (status && FLIP_STATUSES.includes(status)) { sets.push(`status = $${i++}`); vals.push(status); }
  if (listingPrice !== undefined) { sets.push(`listing_price = $${i++}`); vals.push(listingPrice); }
  if (soldPrice !== undefined) { sets.push(`sold_price = $${i++}`); vals.push(soldPrice); }
  if (shippingCost !== undefined) { sets.push(`shipping_cost = $${i++}`); vals.push(shippingCost); }
  if (platformFees !== undefined) { sets.push(`platform_fees = $${i++}`); vals.push(platformFees); }
  if (repairCost !== undefined) { sets.push(`repair_cost = $${i++}`); vals.push(repairCost); }
  if (notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(notes); }

  // Auto-set date columns on status transitions
  if (status === 'ACQUIRED') { sets.push(`acquired_at = COALESCE(acquired_at, NOW())`); }
  if (status === 'LISTED') { sets.push(`listed_at = COALESCE(listed_at, NOW())`); }
  if (status === 'SOLD') { sets.push(`sold_at = COALESCE(sold_at, NOW())`); }

  vals.push(req.params.id, userId);

  try {
    const row = await queryOne<any>(
      `UPDATE flip_plans SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ success: false, error: 'Flip not found' });
    res.json({ success: true, data: { flip: formatFlip(row) } });
  } catch (err) {
    logger.error('Failed to update flip', err as Error);
    res.status(500).json({ success: false, error: 'Failed to update flip' });
  }
});

// Delete flip
app.delete('/api/flips/:id', async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const row = await queryOne<any>('DELETE FROM flip_plans WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, userId]);
    if (!row) return res.status(404).json({ success: false, error: 'Flip not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete flip' });
  }
});

function formatFlip(row: any) {
  return {
    id: row.id,
    itemName: row.item_name,
    category: row.category,
    source: row.source,
    sourceUrl: row.source_url,
    purchasePrice: row.purchase_price ? parseFloat(row.purchase_price) : 0,
    repairCost: row.repair_cost ? parseFloat(row.repair_cost) : 0,
    listingPrice: row.listing_price ? parseFloat(row.listing_price) : null,
    soldPrice: row.sold_price ? parseFloat(row.sold_price) : null,
    shippingCost: row.shipping_cost ? parseFloat(row.shipping_cost) : 0,
    platformFees: row.platform_fees ? parseFloat(row.platform_fees) : 0,
    status: row.status,
    notes: row.notes,
    acquiredAt: row.acquired_at,
    listedAt: row.listed_at,
    soldAt: row.sold_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roi: row.sold_price ? (() => {
      const cost = parseFloat(row.purchase_price || '0') + parseFloat(row.repair_cost || '0') + parseFloat(row.shipping_cost || '0') + parseFloat(row.platform_fees || '0');
      const revenue = parseFloat(row.sold_price);
      return cost > 0 ? Math.round(((revenue - cost) / cost) * 10000) / 100 : null;
    })() : null,
  };
}

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  // Do not expose a listener or notify PM2 until registration succeeds.
  await startRegisteredBotHttpService(bot, () => new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(PORT);
    httpServer.once('error', reject);
    httpServer.once('listening', () => resolve());
  }));
  logger.info(`StoreBot API started on port ${PORT}`);
  logger.info('StoreBot connected to orchestrator');
}

installBotShutdownHandlers(bot, { logger });

if (process.env.NODE_ENV !== 'test') {
  void main().catch(async error => {
    logger.error('StoreBot startup failed', error as Error);
    await bot.stop().catch(stopError => logger.warn('StoreBot startup cleanup failed', { error: stopError }));
    process.exit(1);
  });
}
export default app;
