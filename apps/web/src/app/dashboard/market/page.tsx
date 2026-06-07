'use client';

/**
 * Market — the charting + analysis branch.
 *
 * Full candlestick charting (TradingView — tick-level, all timeframes, indicators),
 * real-time quotes (Finnhub/Alpaca), watchlist, and one-tap Nova analysis.
 * This is the Webull-grade experience, built on the industry-standard charting engine.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import TradingViewChart, { TradingViewTicker } from '@/components/trading/TradingViewChart';
import { Search, Star, TrendingUp, TrendingDown, MessageSquare, ArrowRight } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';

const WATCHLIST_KEY = 'nova_market_watchlist';
const loadWatchlist = (): string[] => {
  if (typeof window === 'undefined') return ['AAPL', 'NVDA', 'TSLA'];
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '["AAPL","NVDA","TSLA"]'); } catch { return ['AAPL', 'NVDA', 'TSLA']; }
};
const saveWatchlist = (l: string[]) => { if (typeof window !== 'undefined') localStorage.setItem(WATCHLIST_KEY, JSON.stringify(l)); };

interface Quote { price: number; change: number | null; changePercent: number | null; source: string; }

const TIMEFRAMES = [
  { label: '1m', value: '1' }, { label: '5m', value: '5' }, { label: '15m', value: '15' },
  { label: '1H', value: '60' }, { label: '1D', value: 'D' }, { label: '1W', value: 'W' },
];

export default function MarketPage() {
  const [symbol, setSymbol] = useState('AAPL');
  const [searchInput, setSearchInput] = useState('');
  const [interval, setInterval] = useState('D');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);

  useEffect(() => { setWatchlist(loadWatchlist()); }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchQuote = async () => {
      try {
        const r = await fetch(`${API}/v1/market/quote/${symbol}`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const d = await r.json();
        if (!cancelled && d.success && d.data?.quote) setQuote(d.data.quote);
        else if (!cancelled) setQuote(null);
      } catch { if (!cancelled) setQuote(null); }
    };
    fetchQuote();
    const t = window.setInterval(fetchQuote, 30_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [symbol]);

  const search = () => {
    const s = searchInput.trim().toUpperCase();
    if (s) { setSymbol(s); setSearchInput(''); }
  };

  const inWatchlist = watchlist.includes(symbol);
  const toggleWatch = () => {
    const next = inWatchlist ? watchlist.filter(s => s !== symbol) : [...watchlist, symbol];
    setWatchlist(next); saveWatchlist(next);
  };

  return (
    <DashboardLayout>
      {/* Live ticker */}
      <TradingViewTicker symbols={watchlist.length ? watchlist : ['SPY', 'QQQ', 'AAPL', 'NVDA']} />

      <div className="p-6 max-w-6xl mx-auto space-y-5">
        {/* Header + search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Market</h1>
            <p className="text-gray-500 text-sm mt-0.5">Live charts, real quotes, and Nova analysis. Research only — not financial advice.</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Symbol (e.g. NVDA)"
                className="w-44 bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50 uppercase" />
            </div>
            <button onClick={search} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm font-semibold text-white transition">Load</button>
          </div>
        </div>

        {/* Symbol bar + quote */}
        <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-white">{symbol}</span>
            <button onClick={toggleWatch}
              className={`p-1.5 rounded-lg transition ${inWatchlist ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'}`}>
              <Star className="w-4 h-4" fill={inWatchlist ? 'currentColor' : 'none'} />
            </button>
          </div>
          {quote ? (
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold text-white">${quote.price.toFixed(2)}</span>
              {quote.changePercent != null && (
                <span className={`flex items-center gap-1 text-sm font-semibold ${quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {quote.changePercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                </span>
              )}
              <span className="text-xs text-gray-600">via {quote.source}</span>
            </div>
          ) : (
            <span className="text-sm text-gray-600">Quote loading…</span>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1.5">
          {TIMEFRAMES.map(tf => (
            <button key={tf.value} onClick={() => setInterval(tf.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                interval === tf.value ? 'bg-white text-black' : 'bg-gray-900/50 border border-gray-800 text-gray-400 hover:text-white'
              }`}>
              {tf.label}
            </button>
          ))}
        </div>

        {/* The chart — full candlestick, tick-level, indicators */}
        <TradingViewChart
          symbol={symbol.includes(':') ? symbol : `NASDAQ:${symbol}`}
          interval={interval}
          height={500}
          studies={['RSI@tv-basicstudies', 'MACD@tv-basicstudies', 'Volume@tv-basicstudies']}
        />

        {/* Actions */}
        <div className="grid sm:grid-cols-3 gap-3">
          <Link href={`/dashboard/nova`}
            className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 hover:bg-emerald-500/10 transition group">
            <MessageSquare className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-emerald-400">Ask Nova about {symbol}</div>
              <div className="text-xs text-gray-500">Get a read on this setup</div>
            </div>
            <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition shrink-0" />
          </Link>
          <Link href="/dashboard/screener"
            className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-4 hover:border-gray-600 transition group">
            <TrendingUp className="w-5 h-5 text-violet-400 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Stock Screener</div>
              <div className="text-xs text-gray-500">Find momentum setups across 500+</div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition shrink-0" />
          </Link>
          <Link href="/dashboard/thesis"
            className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-4 hover:border-gray-600 transition group">
            <Star className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Trade Thesis</div>
              <div className="text-xs text-gray-500">Structured entry/target/stop research</div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition shrink-0" />
          </Link>
        </div>

        {/* Watchlist */}
        {watchlist.length > 0 && (
          <div>
            <div className="text-xs text-gray-600 uppercase tracking-widest mb-2">Watchlist</div>
            <div className="flex flex-wrap gap-2">
              {watchlist.map(s => (
                <button key={s} onClick={() => setSymbol(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    s === symbol ? 'bg-cyan-600 text-white' : 'bg-gray-900/50 border border-gray-800 text-gray-400 hover:text-white'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-700 text-center pt-2">
          Charts and quotes are real market data. Nothing here is financial advice. Research and paper-trade before risking capital.
        </p>
      </div>
    </DashboardLayout>
  );
}
