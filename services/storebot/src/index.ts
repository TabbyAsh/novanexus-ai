import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS } from '@nova/shared';
import type { Product, Listing, Order, BotRunInput, BotRunOutput, ProductStatus, ListingStatus, OrderStatus } from '@nova/shared';

const app = express();
const logger = createLogger('storebot-service');
const PORT = process.env.PORT || SERVICE_PORTS.STOREBOT;

// In-memory stores
const products: Map<string, Product> = new Map();
const listings: Map<string, Listing> = new Map();
const orders: Map<string, Order> = new Map();

app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'storebot', timestamp: new Date().toISOString() });
});

// Bot standard interface
app.post('/internal/bot/run', async (req: Request, res: Response) => {
  const input: BotRunInput = req.body;
  logger.info('StoreBot task received', { taskId: input.taskId, type: input.type });
  
  const output: BotRunOutput = {
    status: 'DONE',
    output: { message: `Processed ${input.type}` },
    events: [{ type: `store.${input.type}.completed`, payload: input.input }],
  };
  
  res.json(output);
});

// POST /v1/store/products - Create product
app.post('/v1/store/products', async (req: Request, res: Response) => {
  const product: Product = {
    id: crypto.randomUUID(),
    orgId: req.headers['x-org-id'] as string || 'default-org',
    sku: req.body.sku || `SKU-${Date.now()}`,
    title: req.body.title,
    status: 'DRAFT' as ProductStatus,
    meta: req.body.meta || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  products.set(product.id, product);
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { product } });
});

// GET /v1/store/products - List products
app.get('/v1/store/products', async (req: Request, res: Response) => {
  res.json({ success: true, data: { products: Array.from(products.values()) } });
});

// POST /v1/store/listings/publish - Publish listing
app.post('/v1/store/listings/publish', async (req: Request, res: Response) => {
  const listing: Listing = {
    id: crypto.randomUUID(),
    orgId: req.headers['x-org-id'] as string || 'default-org',
    productId: req.body.productId,
    channel: req.body.channel || 'shopify',
    price: req.body.price,
    status: 'PENDING' as ListingStatus,
    meta: req.body.meta || {},
  };
  
  listings.set(listing.id, listing);
  
  // Simulate async publish
  setTimeout(() => {
    listing.status = 'ACTIVE';
  }, 1000);
  
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { listing } });
});

// GET /v1/store/listings - List listings
app.get('/v1/store/listings', async (req: Request, res: Response) => {
  res.json({ success: true, data: { listings: Array.from(listings.values()) } });
});

// POST /v1/store/orders/sync - Sync orders
app.post('/v1/store/orders/sync', async (req: Request, res: Response) => {
  const { channel } = req.body;
  
  // Stub: simulate synced orders
  const syncedOrders = [
    { orderRef: `ORD-${Date.now()}`, status: 'PAID', total: 99.99, channel },
  ];
  
  res.json({ success: true, data: { synced: syncedOrders.length, orders: syncedOrders } });
});

// POST /v1/store/pricing/recommend - Get pricing recommendations
app.post('/v1/store/pricing/recommend', async (req: Request, res: Response) => {
  const { productId, cost } = req.body;
  
  const recommendation = {
    productId,
    cost,
    suggestedPrice: cost * 2.5,
    margin: 0.6,
    competitorRange: { low: cost * 2, high: cost * 3 },
    confidence: 0.75,
  };
  
  res.json({ success: true, data: { recommendation } });
});

// GET /v1/store/orders - List orders
app.get('/v1/store/orders', async (req: Request, res: Response) => {
  res.json({ success: true, data: { orders: Array.from(orders.values()) } });
});

app.listen(PORT, () => {
  logger.info(`StoreBot service started on port ${PORT}`);
});

export default app;
