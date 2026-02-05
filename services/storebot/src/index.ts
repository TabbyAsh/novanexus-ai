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
import { generateId, nowTimestamp } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { PricingEngine, Product as PricingProduct, PriceRecommendation } from './pricing-engine';

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

interface Product {
  id: string;
  sku: string;
  title: string;
  status: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface PricingRecommendation {
  id: string;
  productId: string;
  sku: string;
  title: string;
  currentPrice: number;
  recommendedPrice: number;
  reason: string;
  confidence: number;
  createdAt: string;
}

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

// ============================================================================
// Stub Data
// ============================================================================

const products: Product[] = [
  { id: 'p1', sku: 'WIDGET-001', title: 'Premium Widget', status: 'ACTIVE', meta: { price: 29.99, inventory: 150, category: 'Widgets' }, createdAt: nowTimestamp() },
  { id: 'p2', sku: 'GADGET-002', title: 'Smart Gadget', status: 'ACTIVE', meta: { price: 89.99, inventory: 25, category: 'Electronics' }, createdAt: nowTimestamp() },
  { id: 'p3', sku: 'TOOL-003', title: 'Pro Tool Set', status: 'OUT_OF_STOCK', meta: { price: 149.99, inventory: 0, category: 'Tools' }, createdAt: nowTimestamp() },
  { id: 'p4', sku: 'SUPPLY-004', title: 'Office Supplies', status: 'ACTIVE', meta: { price: 19.99, inventory: 500, category: 'Office' }, createdAt: nowTimestamp() },
  { id: 'p5', sku: 'TECH-005', title: 'Wireless Charger', status: 'DRAFT', meta: { price: 39.99, inventory: 75, category: 'Electronics' }, createdAt: nowTimestamp() },
];

// ============================================================================
// Business Logic
// ============================================================================

function checkInventory(): InventoryAlert[] {
  return [
    { id: 'ia1', productId: 'p3', sku: 'TOOL-003', title: 'Pro Tool Set', alertType: 'OUT_OF_STOCK', message: 'Product is out of stock - urgent reorder needed', severity: 'HIGH', createdAt: nowTimestamp() },
    { id: 'ia2', productId: 'p2', sku: 'GADGET-002', title: 'Smart Gadget', alertType: 'LOW_STOCK', message: 'Only 25 units remaining, below minimum threshold of 30', severity: 'MEDIUM', createdAt: nowTimestamp() },
  ];
}

function analyzePricing(): PricingRecommendation[] {
  return [
    { id: 'pr1', productId: 'p1', sku: 'WIDGET-001', title: 'Premium Widget', currentPrice: 29.99, recommendedPrice: 34.99, reason: 'Strong demand and healthy inventory - opportunity to increase margin', confidence: 85, createdAt: nowTimestamp() },
    { id: 'pr2', productId: 'p4', sku: 'SUPPLY-004', title: 'Office Supplies', currentPrice: 19.99, recommendedPrice: 17.99, reason: 'High inventory levels - promotional pricing recommended', confidence: 72, createdAt: nowTimestamp() },
  ];
}

// ============================================================================
// Bot Setup
// ============================================================================

const botConfig = createBotConfig('STORE', [
  { name: 'inventory', version: '1.0.0', description: 'Inventory monitoring and alerts' },
  { name: 'pricing', version: '1.0.0', description: 'Dynamic pricing optimization' },
], { orchestratorUrl: ORCHESTRATOR_URL });

const bot = new BotClient(botConfig);

bot.registerTaskHandler('CHECK_INVENTORY', async (_task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.logger.info('Checking inventory levels');
  await ctx.reportProgress(50, 'Analyzing inventory...');
  
  const alerts = checkInventory();
  
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
  
  const recommendations = analyzePricing();
  
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

app.get('/api/products', (_req: Request, res: Response) => {
  res.json({ success: true, data: { products } });
});

app.get('/api/inventory/alerts', (_req: Request, res: Response) => {
  res.json({ success: true, data: { alerts: checkInventory() } });
});

app.get('/api/pricing/recommendations', (_req: Request, res: Response) => {
  res.json({ success: true, data: { recommendations: analyzePricing() } });
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
