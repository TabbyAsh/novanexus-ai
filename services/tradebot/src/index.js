"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bot_sdk_1 = require("@nova/bot-sdk");
const shared_1 = require("@nova/shared");
const telemetry_1 = require("@nova/telemetry");
const PORT = parseInt(process.env.PORT || '3010', 10);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3002';
const logger = (0, telemetry_1.createLogger)('tradebot');
const app = (0, express_1.default)();
app.use(express_1.default.json());
// ============================================================================
// Stubbed Market Data Provider
// ============================================================================
class StubMarketDataProvider {
    baseQuotes = {
        AAPL: 185.50,
        GOOGL: 141.25,
        MSFT: 378.90,
        AMZN: 178.30,
        NVDA: 495.75,
        TSLA: 248.60,
        META: 505.20,
        JPM: 195.40,
        V: 275.80,
        BRK_B: 365.10,
    };
    getQuote(symbol) {
        const basePrice = this.baseQuotes[symbol] || 100 + Math.random() * 200;
        const change = (Math.random() - 0.5) * 10;
        const price = basePrice + change;
        return {
            symbol,
            price: Math.round(price * 100) / 100,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round((change / basePrice) * 10000) / 100,
            volume: Math.floor(Math.random() * 10000000) + 100000,
            timestamp: (0, shared_1.nowTimestamp)(),
        };
    }
    getQuotes(symbols) {
        return symbols.map((s) => this.getQuote(s));
    }
}
// ============================================================================
// Scanner Engine
// ============================================================================
class ScannerEngine {
    marketData;
    constructor(marketData) {
        this.marketData = marketData;
    }
    scan(symbols, filters) {
        const results = [];
        for (const symbol of symbols) {
            const quote = this.marketData.getQuote(symbol);
            const rsi = 30 + Math.random() * 40; // 30-70 range
            const macd = (Math.random() - 0.5) * 2;
            const momentum = (Math.random() - 0.5) * 10;
            const volumeSpike = Math.random() > 0.7;
            // Calculate score based on indicators
            let score = 50;
            if (rsi < 35)
                score += 15; // Oversold
            if (rsi > 65)
                score -= 15; // Overbought
            if (macd > 0.5)
                score += 10;
            if (macd < -0.5)
                score -= 10;
            if (momentum > 3)
                score += 10;
            if (volumeSpike)
                score += 5;
            if (quote.changePercent > 2)
                score += 10;
            if (quote.changePercent < -2)
                score -= 10;
            // Determine signal
            let signal = 'HOLD';
            if (score >= 65)
                signal = 'BUY';
            else if (score <= 35)
                signal = 'SELL';
            const result = {
                symbol,
                signal,
                score: Math.min(100, Math.max(0, Math.round(score))),
                indicators: { rsi: Math.round(rsi * 10) / 10, macd, momentum, volumeSpike },
                quote,
            };
            // Apply filters
            if (filters?.minScore && result.score < filters.minScore)
                continue;
            if (filters?.signals && !filters.signals.includes(result.signal))
                continue;
            results.push(result);
        }
        return results.sort((a, b) => b.score - a.score);
    }
}
// ============================================================================
// Thesis Generator
// ============================================================================
class ThesisGenerator {
    generate(scanResult) {
        const isLong = scanResult.signal === 'BUY';
        const entryPrice = scanResult.quote.price;
        const targetPercent = isLong ? 0.05 + Math.random() * 0.1 : -(0.05 + Math.random() * 0.1);
        const stopPercent = isLong ? -(0.02 + Math.random() * 0.03) : 0.02 + Math.random() * 0.03;
        const targetPrice = Math.round(entryPrice * (1 + targetPercent) * 100) / 100;
        const stopLoss = Math.round(entryPrice * (1 + stopPercent) * 100) / 100;
        const potentialGain = Math.abs(targetPrice - entryPrice);
        const potentialLoss = Math.abs(stopLoss - entryPrice);
        const riskRewardRatio = Math.round((potentialGain / potentialLoss) * 100) / 100;
        const reasoning = [];
        if (scanResult.indicators.rsi !== undefined) {
            if (scanResult.indicators.rsi < 35)
                reasoning.push('RSI indicates oversold conditions');
            if (scanResult.indicators.rsi > 65)
                reasoning.push('RSI indicates overbought conditions');
        }
        if (scanResult.indicators.macd && scanResult.indicators.macd > 0.5) {
            reasoning.push('MACD showing bullish momentum');
        }
        if (scanResult.indicators.volumeSpike) {
            reasoning.push('Volume spike detected, potential breakout');
        }
        if (scanResult.quote.changePercent > 2) {
            reasoning.push('Strong intraday momentum');
        }
        reasoning.push(`Technical score: ${scanResult.score}/100`);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        return {
            id: (0, shared_1.generateId)(),
            symbol: scanResult.symbol,
            signal: isLong ? 'LONG' : 'SHORT',
            entryPrice,
            targetPrice,
            stopLoss,
            riskRewardRatio,
            confidence: Math.min(100, scanResult.score + Math.random() * 10),
            reasoning,
            createdAt: (0, shared_1.nowTimestamp)(),
            expiresAt,
        };
    }
}
// ============================================================================
// Paper Trading Simulator
// ============================================================================
class PaperTradingSimulator {
    trades = new Map();
    portfolio = {
        cash: 100000,
        positions: {},
    };
    marketData;
    constructor(marketData) {
        this.marketData = marketData;
    }
    openTrade(thesis, quantity) {
        const cost = thesis.entryPrice * quantity;
        if (cost > this.portfolio.cash) {
            throw new Error('Insufficient funds');
        }
        const trade = {
            id: (0, shared_1.generateId)(),
            thesisId: thesis.id,
            symbol: thesis.symbol,
            side: thesis.signal === 'LONG' ? 'BUY' : 'SELL',
            quantity,
            entryPrice: thesis.entryPrice,
            currentPrice: thesis.entryPrice,
            status: 'OPEN',
            openedAt: (0, shared_1.nowTimestamp)(),
        };
        this.trades.set(trade.id, trade);
        this.portfolio.cash -= cost;
        this.portfolio.positions[thesis.symbol] = (this.portfolio.positions[thesis.symbol] || 0) + quantity;
        return trade;
    }
    closeTrade(tradeId, exitPrice) {
        const trade = this.trades.get(tradeId);
        if (!trade)
            throw new Error('Trade not found');
        if (trade.status !== 'OPEN')
            throw new Error('Trade already closed');
        const quote = this.marketData.getQuote(trade.symbol);
        trade.exitPrice = exitPrice ?? quote.price;
        trade.currentPrice = trade.exitPrice;
        const priceDiff = trade.side === 'BUY'
            ? trade.exitPrice - trade.entryPrice
            : trade.entryPrice - trade.exitPrice;
        trade.pnl = Math.round(priceDiff * trade.quantity * 100) / 100;
        trade.pnlPercent = Math.round((priceDiff / trade.entryPrice) * 10000) / 100;
        trade.status = 'CLOSED';
        trade.closedAt = (0, shared_1.nowTimestamp)();
        this.portfolio.cash += trade.exitPrice * trade.quantity;
        this.portfolio.positions[trade.symbol] -= trade.quantity;
        return trade;
    }
    updateTrade(tradeId, thesis) {
        const trade = this.trades.get(tradeId);
        if (!trade)
            throw new Error('Trade not found');
        if (trade.status !== 'OPEN')
            return trade;
        const quote = this.marketData.getQuote(trade.symbol);
        trade.currentPrice = quote.price;
        // Check stop loss / target if thesis provided
        if (thesis) {
            if (trade.side === 'BUY') {
                if (quote.price <= thesis.stopLoss) {
                    return this.closeTrade(tradeId, thesis.stopLoss);
                }
                if (quote.price >= thesis.targetPrice) {
                    return this.closeTrade(tradeId, thesis.targetPrice);
                }
            }
            else {
                if (quote.price >= thesis.stopLoss) {
                    return this.closeTrade(tradeId, thesis.stopLoss);
                }
                if (quote.price <= thesis.targetPrice) {
                    return this.closeTrade(tradeId, thesis.targetPrice);
                }
            }
        }
        return trade;
    }
    getOpenTrades() {
        return Array.from(this.trades.values()).filter((t) => t.status === 'OPEN');
    }
    getAllTrades() {
        return Array.from(this.trades.values());
    }
    getPortfolio() {
        return { ...this.portfolio };
    }
    getStats() {
        const trades = this.getAllTrades();
        const closed = trades.filter((t) => t.status === 'CLOSED');
        const wins = closed.filter((t) => (t.pnl || 0) > 0);
        const totalPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const positionsValue = Object.entries(this.portfolio.positions).reduce((sum, [symbol, qty]) => {
            const quote = this.marketData.getQuote(symbol);
            return sum + quote.price * qty;
        }, 0);
        return {
            totalTrades: trades.length,
            openTrades: trades.filter((t) => t.status === 'OPEN').length,
            closedTrades: closed.length,
            winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0,
            totalPnl: Math.round(totalPnl * 100) / 100,
            portfolioValue: Math.round((this.portfolio.cash + positionsValue) * 100) / 100,
        };
    }
}
// ============================================================================
// Watchlist Manager
// ============================================================================
class WatchlistManager {
    watchlists = new Map();
    constructor() {
        // Initialize with default watchlist
        const defaultList = {
            id: 'default',
            name: 'Default Watchlist',
            symbols: ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'V', 'BRK_B'],
            createdAt: (0, shared_1.nowTimestamp)(),
            updatedAt: (0, shared_1.nowTimestamp)(),
        };
        this.watchlists.set(defaultList.id, defaultList);
    }
    create(name, symbols) {
        const watchlist = {
            id: (0, shared_1.generateId)(),
            name,
            symbols,
            createdAt: (0, shared_1.nowTimestamp)(),
            updatedAt: (0, shared_1.nowTimestamp)(),
        };
        this.watchlists.set(watchlist.id, watchlist);
        return watchlist;
    }
    get(id) {
        return this.watchlists.get(id);
    }
    getAll() {
        return Array.from(this.watchlists.values());
    }
    addSymbol(id, symbol) {
        const watchlist = this.watchlists.get(id);
        if (!watchlist)
            return undefined;
        if (!watchlist.symbols.includes(symbol)) {
            watchlist.symbols.push(symbol);
            watchlist.updatedAt = (0, shared_1.nowTimestamp)();
        }
        return watchlist;
    }
    removeSymbol(id, symbol) {
        const watchlist = this.watchlists.get(id);
        if (!watchlist)
            return undefined;
        watchlist.symbols = watchlist.symbols.filter((s) => s !== symbol);
        watchlist.updatedAt = (0, shared_1.nowTimestamp)();
        return watchlist;
    }
}
// ============================================================================
// Initialize Components
// ============================================================================
const marketData = new StubMarketDataProvider();
const scanner = new ScannerEngine(marketData);
const thesisGenerator = new ThesisGenerator();
const paperTrader = new PaperTradingSimulator(marketData);
const watchlistManager = new WatchlistManager();
// Active theses storage
const activeTheses = new Map();
// ============================================================================
// Bot Client Setup
// ============================================================================
const botConfig = (0, bot_sdk_1.createBotConfig)('TRADE', [
    { name: 'scanner', version: '1.0.0', description: 'Market scanner with technical indicators' },
    { name: 'thesis', version: '1.0.0', description: 'Thesis card generator' },
    { name: 'paper-trading', version: '1.0.0', description: 'Paper trading simulator' },
    { name: 'watchlist', version: '1.0.0', description: 'Watchlist management' },
], { orchestratorUrl: ORCHESTRATOR_URL });
const bot = new bot_sdk_1.BotClient(botConfig);
// Register task handlers
bot.registerTaskHandler('SCAN_WATCHLIST', async (task, ctx) => {
    const { watchlistId, filters } = task.inputJson;
    const watchlist = watchlistManager.get(watchlistId || 'default');
    if (!watchlist) {
        return { success: false, error: 'Watchlist not found' };
    }
    ctx.logger.info('Scanning watchlist', { watchlistId: watchlist.id, symbols: watchlist.symbols.length });
    await ctx.reportProgress(10, 'Starting scan...');
    const results = scanner.scan(watchlist.symbols, filters);
    await ctx.reportProgress(100, 'Scan complete');
    return {
        success: true,
        output: { watchlistId: watchlist.id, results, scannedAt: (0, shared_1.nowTimestamp)() },
        metrics: { symbolsScanned: watchlist.symbols.length, signalsFound: results.length },
    };
});
bot.registerTaskHandler('GENERATE_THESIS', async (task, ctx) => {
    const { symbol, watchlistId } = task.inputJson;
    let symbolToAnalyze = symbol;
    if (!symbolToAnalyze && watchlistId) {
        // Get top signal from watchlist scan
        const watchlist = watchlistManager.get(watchlistId);
        if (watchlist) {
            const results = scanner.scan(watchlist.symbols, { minScore: 60 });
            if (results.length > 0) {
                symbolToAnalyze = results[0].symbol;
            }
        }
    }
    if (!symbolToAnalyze) {
        return { success: false, error: 'No symbol specified or found' };
    }
    ctx.logger.info('Generating thesis', { symbol: symbolToAnalyze });
    await ctx.reportProgress(20, 'Analyzing symbol...');
    const scanResults = scanner.scan([symbolToAnalyze]);
    if (scanResults.length === 0) {
        return { success: false, error: 'Could not analyze symbol' };
    }
    await ctx.reportProgress(60, 'Generating thesis card...');
    const thesis = thesisGenerator.generate(scanResults[0]);
    activeTheses.set(thesis.id, thesis);
    await ctx.reportProgress(100, 'Thesis generated');
    await ctx.emit('THESIS_GENERATED', { thesisId: thesis.id, symbol: thesis.symbol });
    return {
        success: true,
        output: { thesis },
        metrics: { confidence: thesis.confidence },
    };
});
bot.registerTaskHandler('EXECUTE_PAPER_TRADE', async (task, ctx) => {
    const { thesisId, quantity } = task.inputJson;
    const thesis = activeTheses.get(thesisId);
    if (!thesis) {
        return { success: false, error: 'Thesis not found' };
    }
    ctx.logger.info('Executing paper trade', { thesisId, symbol: thesis.symbol });
    try {
        const trade = paperTrader.openTrade(thesis, quantity || 10);
        await ctx.emit('PAPER_TRADE_OPENED', { tradeId: trade.id, thesisId, symbol: trade.symbol });
        return {
            success: true,
            output: { trade, portfolio: paperTrader.getPortfolio() },
        };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
bot.registerTaskHandler('UPDATE_PAPER_TRADES', async (task, ctx) => {
    ctx.logger.info('Updating open paper trades');
    const openTrades = paperTrader.getOpenTrades();
    const updated = [];
    for (const trade of openTrades) {
        const thesis = activeTheses.get(trade.thesisId);
        const updatedTrade = paperTrader.updateTrade(trade.id, thesis);
        updated.push(updatedTrade);
        if (updatedTrade.status === 'CLOSED') {
            await ctx.emit('PAPER_TRADE_CLOSED', {
                tradeId: trade.id,
                pnl: updatedTrade.pnl,
                pnlPercent: updatedTrade.pnlPercent,
            });
        }
    }
    return {
        success: true,
        output: { updatedTrades: updated, stats: paperTrader.getStats() },
        metrics: { tradesUpdated: updated.length },
    };
});
// ============================================================================
// Express Routes - Health & API
// ============================================================================
const healthRoutes = (0, bot_sdk_1.createBotHealthRoutes)({ bot });
app.get('/health', healthRoutes.healthHandler);
app.get('/ready', healthRoutes.readyHandler);
app.get('/metrics', healthRoutes.metricsHandler);
// Watchlist API
app.get('/api/watchlists', (_req, res) => {
    res.json({ success: true, data: { watchlists: watchlistManager.getAll() } });
});
app.get('/api/watchlists/:id', (req, res) => {
    const watchlist = watchlistManager.get(req.params.id);
    if (!watchlist) {
        return res.status(404).json({ success: false, error: 'Watchlist not found' });
    }
    res.json({ success: true, data: { watchlist } });
});
app.post('/api/watchlists', (req, res) => {
    const { name, symbols } = req.body;
    const watchlist = watchlistManager.create(name, symbols || []);
    res.status(201).json({ success: true, data: { watchlist } });
});
// Scanner API
app.post('/api/scan', (req, res) => {
    const { watchlistId, symbols, filters } = req.body;
    let symbolsToScan;
    if (symbols) {
        symbolsToScan = symbols;
    }
    else {
        const watchlist = watchlistManager.get(watchlistId || 'default');
        if (!watchlist) {
            return res.status(404).json({ success: false, error: 'Watchlist not found' });
        }
        symbolsToScan = watchlist.symbols;
    }
    const results = scanner.scan(symbolsToScan, filters);
    res.json({ success: true, data: { results, scannedAt: (0, shared_1.nowTimestamp)() } });
});
// Thesis API
app.get('/api/theses', (_req, res) => {
    res.json({ success: true, data: { theses: Array.from(activeTheses.values()) } });
});
app.post('/api/theses', (req, res) => {
    const { symbol } = req.body;
    const scanResults = scanner.scan([symbol]);
    if (scanResults.length === 0) {
        return res.status(400).json({ success: false, error: 'Could not analyze symbol' });
    }
    const thesis = thesisGenerator.generate(scanResults[0]);
    activeTheses.set(thesis.id, thesis);
    res.status(201).json({ success: true, data: { thesis } });
});
// Paper Trading API
app.get('/api/trades', (_req, res) => {
    res.json({
        success: true,
        data: {
            trades: paperTrader.getAllTrades(),
            stats: paperTrader.getStats(),
            portfolio: paperTrader.getPortfolio(),
        },
    });
});
app.post('/api/trades', (req, res) => {
    const { thesisId, quantity } = req.body;
    const thesis = activeTheses.get(thesisId);
    if (!thesis) {
        return res.status(404).json({ success: false, error: 'Thesis not found' });
    }
    try {
        const trade = paperTrader.openTrade(thesis, quantity || 10);
        res.status(201).json({ success: true, data: { trade } });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
app.post('/api/trades/:id/close', (req, res) => {
    try {
        const trade = paperTrader.closeTrade(req.params.id);
        res.json({ success: true, data: { trade } });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
// Market Data API
app.get('/api/quotes/:symbol', (req, res) => {
    const quote = marketData.getQuote(req.params.symbol);
    res.json({ success: true, data: { quote } });
});
// ============================================================================
// Start Server
// ============================================================================
async function main() {
    try {
        // Start Express server first
        app.listen(PORT, () => {
            logger.info(`TradeBot API server started on port ${PORT}`);
        });
        // Try to connect to orchestrator (graceful if not available)
        try {
            await bot.start();
            logger.info('TradeBot connected to orchestrator');
        }
        catch (error) {
            logger.warn('Could not connect to orchestrator, running in standalone mode', { error });
        }
    }
    catch (error) {
        logger.error('Failed to start TradeBot', error);
        process.exit(1);
    }
}
// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await bot.stop();
    process.exit(0);
});
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await bot.stop();
    process.exit(0);
});
main();
exports.default = app;
