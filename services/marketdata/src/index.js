"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const telemetry_1 = require("@nova/telemetry");
const shared_1 = require("@nova/shared");
const app = (0, express_1.default)();
const logger = (0, telemetry_1.createLogger)('marketdata-service');
const PORT = process.env.PORT || shared_1.SERVICE_PORTS.MARKETDATA;
app.use(express_1.default.json());
app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
});
app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', service: 'marketdata', timestamp: new Date().toISOString() });
});
// GET /v1/market/quote/:symbol - Get quote
app.get('/v1/market/quote/:symbol', async (req, res) => {
    const { symbol } = req.params;
    // Stub data
    const quote = {
        symbol,
        price: 185.50 + Math.random() * 10,
        change: (Math.random() - 0.5) * 5,
        volume: Math.floor(Math.random() * 50000000),
        bid: 185.45,
        ask: 185.55,
        timestamp: new Date().toISOString(),
    };
    res.json({ success: true, data: { quote } });
});
// GET /v1/market/candles/:symbol - Get historical candles
app.get('/v1/market/candles/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const { interval = '1d', limit = 30 } = req.query;
    // Generate stub candles
    const candles = [];
    let price = 180;
    const now = Date.now();
    for (let i = Number(limit) - 1; i >= 0; i--) {
        const open = price;
        const change = (Math.random() - 0.48) * 5;
        const close = price + change;
        const high = Math.max(open, close) + Math.random() * 2;
        const low = Math.min(open, close) - Math.random() * 2;
        candles.push({
            timestamp: new Date(now - i * 86400000).toISOString(),
            open,
            high,
            low,
            close,
            volume: Math.floor(Math.random() * 50000000),
        });
        price = close;
    }
    res.json({ success: true, data: { symbol, interval, candles } });
});
// GET /v1/market/fundamentals/:symbol - Get fundamental data
app.get('/v1/market/fundamentals/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const fundamentals = {
        symbol,
        marketCap: 2850000000000,
        pe: 28.5,
        eps: 6.52,
        sharesOutstanding: 15400000000,
        float: 15200000000,
        shortInterest: 0.085,
        beta: 1.25,
        dividendYield: 0.005,
    };
    res.json({ success: true, data: { fundamentals } });
});
// GET /v1/market/indicators/:symbol - Get technical indicators
app.get('/v1/market/indicators/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const indicators = {
        symbol,
        rsi: 58.5,
        adx: 32,
        plusDI: 28,
        minusDI: 18,
        macd: { value: 2.5, signal: 1.8, histogram: 0.7 },
        vwap: 184.25,
        sma20: 182.50,
        sma50: 178.30,
        sma200: 165.80,
    };
    res.json({ success: true, data: { indicators } });
});
// POST /v1/market/ingest - Ingest market data (for CSV import)
app.post('/v1/market/ingest', async (req, res) => {
    const { source, data } = req.body;
    logger.info('Market data ingested', { source, records: data?.length || 0 });
    res.json({ success: true, data: { ingested: data?.length || 0 } });
});
app.listen(PORT, () => {
    logger.info(`MarketData service started on port ${PORT}`);
});
exports.default = app;
