"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bot_sdk_1 = require("@nova/bot-sdk");
const shared_1 = require("@nova/shared");
const telemetry_1 = require("@nova/telemetry");
const PORT = parseInt(process.env.PORT || '3011', 10);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3002';
const logger = (0, telemetry_1.createLogger)('storebot');
const app = (0, express_1.default)();
app.use(express_1.default.json());
// ============================================================================
// Stub Data
// ============================================================================
const products = new Map([
    ['p1', { id: 'p1', sku: 'WIDGET-001', name: 'Premium Widget', category: 'Widgets', price: 29.99, cost: 12.00, inventory: 150, minStock: 50, status: 'ACTIVE' }],
    ['p2', { id: 'p2', sku: 'GADGET-002', name: 'Smart Gadget', category: 'Electronics', price: 89.99, cost: 45.00, inventory: 25, minStock: 30, status: 'LOW_STOCK' }],
    ['p3', { id: 'p3', sku: 'TOOL-003', name: 'Pro Tool Set', category: 'Tools', price: 149.99, cost: 75.00, inventory: 0, minStock: 10, status: 'OUT_OF_STOCK' }],
    ['p4', { id: 'p4', sku: 'SUPPLY-004', name: 'Office Supplies', category: 'Office', price: 19.99, cost: 8.00, inventory: 500, minStock: 100, status: 'ACTIVE' }],
]);
// ============================================================================
// Business Logic
// ============================================================================
function checkInventory() {
    const alerts = [];
    for (const product of products.values()) {
        if (product.inventory === 0) {
            alerts.push({
                productId: product.id,
                type: 'OUT_OF_STOCK',
                currentLevel: 0,
                threshold: product.minStock,
                recommendation: `Urgent: Reorder ${product.name} (${product.sku})`,
            });
        }
        else if (product.inventory < product.minStock) {
            alerts.push({
                productId: product.id,
                type: 'LOW_STOCK',
                currentLevel: product.inventory,
                threshold: product.minStock,
                recommendation: `Reorder ${product.minStock - product.inventory + 20} units of ${product.name}`,
            });
        }
        else if (product.inventory > product.minStock * 5) {
            alerts.push({
                productId: product.id,
                type: 'OVERSTOCK',
                currentLevel: product.inventory,
                threshold: product.minStock * 5,
                recommendation: `Consider promotional pricing for ${product.name}`,
            });
        }
    }
    return alerts;
}
function analyzePricing() {
    const recommendations = [];
    for (const product of products.values()) {
        const margin = (product.price - product.cost) / product.price;
        const targetMargin = 0.45;
        if (margin < 0.30) {
            const newPrice = Math.round((product.cost / (1 - targetMargin)) * 100) / 100;
            recommendations.push({
                productId: product.id,
                currentPrice: product.price,
                recommendedPrice: newPrice,
                reason: `Low margin (${(margin * 100).toFixed(1)}%). Increase to target ${(targetMargin * 100).toFixed(1)}%`,
                expectedImpact: {
                    revenue: (newPrice - product.price) * product.inventory * 0.8,
                    margin: targetMargin - margin,
                },
            });
        }
        if (product.status === 'LOW_STOCK' && margin > 0.40) {
            const newPrice = Math.round(product.price * 1.05 * 100) / 100;
            recommendations.push({
                productId: product.id,
                currentPrice: product.price,
                recommendedPrice: newPrice,
                reason: 'Low stock with healthy margin - optimize revenue',
                expectedImpact: {
                    revenue: (newPrice - product.price) * product.inventory,
                    margin: 0.02,
                },
            });
        }
    }
    return recommendations;
}
// ============================================================================
// Bot Setup
// ============================================================================
const botConfig = (0, bot_sdk_1.createBotConfig)('STORE', [
    { name: 'inventory', version: '1.0.0', description: 'Inventory monitoring and alerts' },
    { name: 'pricing', version: '1.0.0', description: 'Dynamic pricing optimization' },
], { orchestratorUrl: ORCHESTRATOR_URL });
const bot = new bot_sdk_1.BotClient(botConfig);
bot.registerTaskHandler('CHECK_INVENTORY', async (_task, ctx) => {
    ctx.logger.info('Checking inventory levels');
    await ctx.reportProgress(50, 'Analyzing inventory...');
    const alerts = checkInventory();
    for (const alert of alerts) {
        await ctx.emit('INVENTORY_ALERT', { ...alert });
    }
    return {
        success: true,
        output: { alerts, checkedAt: (0, shared_1.nowTimestamp)() },
        metrics: { alertCount: alerts.length },
    };
});
bot.registerTaskHandler('ANALYZE_PRICING', async (_task, ctx) => {
    ctx.logger.info('Analyzing pricing');
    await ctx.reportProgress(50, 'Computing recommendations...');
    const recommendations = analyzePricing();
    return {
        success: true,
        output: { recommendations, analyzedAt: (0, shared_1.nowTimestamp)() },
        metrics: { recommendationCount: recommendations.length },
    };
});
// ============================================================================
// Express Routes
// ============================================================================
const healthRoutes = (0, bot_sdk_1.createBotHealthRoutes)({ bot });
app.get('/health', healthRoutes.healthHandler);
app.get('/ready', healthRoutes.readyHandler);
app.get('/metrics', healthRoutes.metricsHandler);
app.get('/api/products', (_req, res) => {
    res.json({ success: true, data: { products: Array.from(products.values()) } });
});
app.get('/api/inventory/alerts', (_req, res) => {
    res.json({ success: true, data: { alerts: checkInventory() } });
});
app.get('/api/pricing/recommendations', (_req, res) => {
    res.json({ success: true, data: { recommendations: analyzePricing() } });
});
// ============================================================================
// Start Server
// ============================================================================
async function main() {
    app.listen(PORT, () => logger.info(`StoreBot API started on port ${PORT}`));
    try {
        await bot.start();
        logger.info('StoreBot connected to orchestrator');
    }
    catch (error) {
        logger.warn('Running in standalone mode', { error });
    }
}
process.on('SIGTERM', async () => { await bot.stop(); process.exit(0); });
process.on('SIGINT', async () => { await bot.stop(); process.exit(0); });
main();
exports.default = app;
