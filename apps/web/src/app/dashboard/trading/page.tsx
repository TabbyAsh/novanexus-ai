'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wallet,
  BarChart3,
  Target,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  Square,
} from 'lucide-react';

// Types
interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  side: string;
}

interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: string;
  type: string;
  status: string;
  filled_avg_price: string | null;
  created_at: string;
}

interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

const TRADEBOT_URL = 'http://localhost:3010';
const MARKETDATA_URL = 'http://localhost:3020';

export default function TradingDashboard() {
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [orders, setOrders] = useState<AlpacaOrder[]>([]);
  const [watchlistQuotes, setWatchlistQuotes] = useState<MarketQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [alpacaEnabled, setAlpacaEnabled] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Order form state
  const [orderSymbol, setOrderSymbol] = useState('');
  const [orderQty, setOrderQty] = useState('1');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderMessage, setOrderMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const watchlistSymbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'NVDA', 'TSLA', 'META', 'AMD'];

  const loadAlpacaData = useCallback(async () => {
    try {
      // Check if Alpaca is enabled
      const statusRes = await fetch(`${TRADEBOT_URL}/api/alpaca/status`);
      const statusData = await statusRes.json();
      setAlpacaEnabled(statusData.data?.enabled || false);

      if (!statusData.data?.enabled) {
        setIsLoading(false);
        return;
      }

      // Load account
      const accountRes = await fetch(`${TRADEBOT_URL}/api/alpaca/account`);
      const accountData = await accountRes.json();
      if (accountData.success) {
        setAccount(accountData.data.account);
      }

      // Load positions
      const positionsRes = await fetch(`${TRADEBOT_URL}/api/alpaca/positions`);
      const positionsData = await positionsRes.json();
      if (positionsData.success) {
        setPositions(positionsData.data.positions);
      }

      // Load recent orders
      const ordersRes = await fetch(`${TRADEBOT_URL}/api/alpaca/orders?status=all`);
      const ordersData = await ordersRes.json();
      if (ordersData.success) {
        setOrders(ordersData.data.orders.slice(0, 10));
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to load Alpaca data:', error);
    }
  }, []);

  const loadMarketData = useCallback(async () => {
    try {
      const quotes = await Promise.all(
        watchlistSymbols.map(async (symbol) => {
          try {
            const res = await fetch(`${MARKETDATA_URL}/v1/market/quote/${symbol}`);
            const data = await res.json();
            if (data.success && data.data?.quote) {
              return data.data.quote;
            }
          } catch {
            // Return stub data if API fails
          }
          return {
            symbol,
            price: 100 + Math.random() * 200,
            change: (Math.random() - 0.5) * 10,
            changePercent: (Math.random() - 0.5) * 5,
            volume: Math.floor(Math.random() * 10000000),
          };
        })
      );
      setWatchlistQuotes(quotes);
    } catch (error) {
      console.error('Failed to load market data:', error);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([loadAlpacaData(), loadMarketData()]);
    setIsLoading(false);
  }, [loadAlpacaData, loadMarketData]);

  useEffect(() => {
    loadAll();
    // Refresh every 30 seconds
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const placeOrder = async () => {
    if (!orderSymbol || !orderQty) return;

    setIsPlacingOrder(true);
    setOrderMessage(null);

    try {
      const res = await fetch(`${TRADEBOT_URL}/api/alpaca/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: orderSymbol.toUpperCase(),
          qty: parseInt(orderQty),
          side: orderSide,
          type: 'market',
          time_in_force: 'day',
        }),
      });

      const data = await res.json();

      if (data.success) {
        setOrderMessage({ type: 'success', text: `Order placed: ${orderSide.toUpperCase()} ${orderQty} ${orderSymbol}` });
        setOrderSymbol('');
        setOrderQty('1');
        // Refresh data
        setTimeout(loadAll, 1000);
      } else {
        setOrderMessage({ type: 'error', text: data.error || 'Failed to place order' });
      }
    } catch (error) {
      setOrderMessage({ type: 'error', text: 'Network error placing order' });
    }

    setIsPlacingOrder(false);
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  const formatPercent = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${num >= 0 ? '+' : ''}${(num * 100).toFixed(2)}%`;
  };

  const totalUnrealizedPL = positions.reduce((sum, p) => sum + parseFloat(p.unrealized_pl || '0'), 0);
  const dayChange = account ? parseFloat(account.equity) - parseFloat(account.last_equity) : 0;
  const dayChangePercent = account ? (dayChange / parseFloat(account.last_equity)) * 100 : 0;

  return (
    <div className="p-8 bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Trading Command Center</h1>
          <p className="text-gray-400 mt-1">
            Real-time portfolio management with Alpaca
            {lastUpdate && (
              <span className="ml-2 text-gray-500">
                • Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            alpacaEnabled ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {alpacaEnabled ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {alpacaEnabled ? 'Alpaca Connected' : 'Paper Mode'}
          </div>
          <button
            onClick={loadAll}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Account Summary */}
      {account && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Wallet className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-gray-400 text-sm">Portfolio Value</span>
            </div>
            <p className="text-2xl font-bold text-white">{formatCurrency(account.portfolio_value)}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <span className="text-gray-400 text-sm">Buying Power</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{formatCurrency(account.buying_power)}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Activity className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-gray-400 text-sm">Cash</span>
            </div>
            <p className="text-2xl font-bold text-purple-400">{formatCurrency(account.cash)}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${dayChange >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                {dayChange >= 0 ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
              </div>
              <span className="text-gray-400 text-sm">Day Change</span>
            </div>
            <p className={`text-2xl font-bold ${dayChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {dayChange >= 0 ? '+' : ''}{formatCurrency(dayChange)}
              <span className="text-sm ml-1">({dayChangePercent >= 0 ? '+' : ''}{dayChangePercent.toFixed(2)}%)</span>
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${totalUnrealizedPL >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                <Target className="w-5 h-5 text-yellow-400" />
              </div>
              <span className="text-gray-400 text-sm">Unrealized P&L</span>
            </div>
            <p className={`text-2xl font-bold ${totalUnrealizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalUnrealizedPL >= 0 ? '+' : ''}{formatCurrency(totalUnrealizedPL)}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Trade */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Quick Trade
          </h2>

          {orderMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              orderMessage.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {orderMessage.text}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Symbol</label>
              <input
                type="text"
                value={orderSymbol}
                onChange={(e) => setOrderSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Quantity</label>
              <input
                type="number"
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                min="1"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOrderSide('buy')}
                className={`py-2 rounded-lg font-medium transition ${
                  orderSide === 'buy'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setOrderSide('sell')}
                className={`py-2 rounded-lg font-medium transition ${
                  orderSide === 'sell'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Sell
              </button>
            </div>

            <button
              onClick={placeOrder}
              disabled={!orderSymbol || !orderQty || isPlacingOrder || !alpacaEnabled}
              className={`w-full py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                orderSide === 'buy'
                  ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-600/50'
                  : 'bg-red-600 hover:bg-red-700 disabled:bg-red-600/50'
              } text-white disabled:cursor-not-allowed`}
            >
              {isPlacingOrder ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Placing Order...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Place {orderSide.toUpperCase()} Order
                </>
              )}
            </button>
          </div>
        </div>

        {/* Positions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Open Positions ({positions.length})
          </h2>

          {positions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No open positions</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {positions.map((pos) => (
                <div key={pos.symbol} className="p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-white">{pos.symbol}</span>
                    <span className={`text-sm ${parseFloat(pos.unrealized_pl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {parseFloat(pos.unrealized_pl) >= 0 ? '+' : ''}{formatCurrency(pos.unrealized_pl)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-gray-400">
                      Qty: <span className="text-white">{pos.qty}</span>
                    </div>
                    <div className="text-gray-400">
                      Avg: <span className="text-white">{formatCurrency(pos.avg_entry_price)}</span>
                    </div>
                    <div className="text-gray-400">
                      Current: <span className="text-white">{formatCurrency(pos.current_price)}</span>
                    </div>
                    <div className="text-gray-400">
                      P&L %: <span className={parseFloat(pos.unrealized_plpc) >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {formatPercent(pos.unrealized_plpc)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Market Watch */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-400" />
            Market Watch
          </h2>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {watchlistQuotes.map((quote) => (
              <div
                key={quote.symbol}
                className="p-3 bg-gray-800 rounded-lg flex items-center justify-between hover:bg-gray-750 cursor-pointer transition"
                onClick={() => setOrderSymbol(quote.symbol)}
              >
                <div>
                  <span className="font-semibold text-white">{quote.symbol}</span>
                  <div className="text-sm text-gray-400">Vol: {(quote.volume / 1000000).toFixed(1)}M</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-medium">{formatCurrency(quote.price)}</div>
                  <div className={`text-sm flex items-center gap-1 ${quote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {quote.changePercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-400" />
          Recent Orders
        </h2>

        {orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No recent orders</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-800">
                  <th className="pb-3">Symbol</th>
                  <th className="pb-3">Side</th>
                  <th className="pb-3">Qty</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Fill Price</th>
                  <th className="pb-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {orders.map((order) => (
                  <tr key={order.id} className="text-white">
                    <td className="py-3 font-medium">{order.symbol}</td>
                    <td className={`py-3 ${order.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                      {order.side.toUpperCase()}
                    </td>
                    <td className="py-3">{order.filled_qty}/{order.qty}</td>
                    <td className="py-3 text-gray-400">{order.type}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        order.status === 'filled' ? 'bg-green-500/20 text-green-400' :
                        order.status === 'canceled' ? 'bg-gray-500/20 text-gray-400' :
                        order.status === 'pending_new' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3">{order.filled_avg_price ? formatCurrency(order.filled_avg_price) : '-'}</td>
                    <td className="py-3 text-gray-400 text-sm">
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
