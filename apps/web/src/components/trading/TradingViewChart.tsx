'use client';

/**
 * TradingView Chart Widget — free embed, no API key required.
 * Professional-grade charting with real-time data via TradingView's
 * public widget library.
 */

import { useEffect, useRef } from 'react';

interface TradingViewChartProps {
  symbol?: string;       // e.g. "NASDAQ:AAPL", "BINANCE:BTCUSDT"
  interval?: string;     // "D", "W", "60", "15", "5", "1"
  height?: number;
  theme?: 'dark' | 'light';
  showToolbar?: boolean;
  allowSymbolChange?: boolean;
  studies?: string[];    // e.g. ["RSI@tv-basicstudies", "MACD@tv-basicstudies"]
}

export default function TradingViewChart({
  symbol = 'NASDAQ:AAPL',
  interval = 'D',
  height = 450,
  theme = 'dark',
  showToolbar = true,
  allowSymbolChange = true,
  studies = ['RSI@tv-basicstudies', 'Volume@tv-basicstudies'],
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (!(window as any).TradingView || !container) return;
      widgetRef.current = new (window as any).TradingView.widget({
        autosize: true,
        symbol,
        interval,
        timezone: 'America/New_York',
        theme,
        style: '1',
        locale: 'en',
        toolbar_bg: '#0d0d14',
        enable_publishing: false,
        allow_symbol_change: allowSymbolChange,
        container_id: container.id,
        hide_top_toolbar: !showToolbar,
        hide_legend: false,
        save_image: false,
        studies,
        withdateranges: true,
        details: false,
        hotlist: false,
        calendar: false,
        show_popup_button: true,
        popup_width: '1000',
        popup_height: '650',
      });
    };

    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, [symbol, interval, theme, showToolbar, allowSymbolChange]);

  const id = `tv_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}_${interval}`;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-800 bg-[#0d0d14]">
      <div
        id={id}
        ref={containerRef}
        style={{ height }}
        className="w-full"
      />
    </div>
  );
}

// ─── Mini ticker widget ───────────────────────────────────────────────────────

export function TradingViewTicker({ symbols }: { symbols?: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: (symbols || ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'BTCUSD', 'ETHUSD', 'EURUSD']).map(s => ({
        proName: s.includes(':') ? s : `NASDAQ:${s}`,
        title: s.split(':').pop(),
      })),
      showSymbolLogo: true,
      colorTheme: 'dark',
      isTransparent: true,
      displayMode: 'adaptive',
      locale: 'en',
    });
    container.appendChild(script);
  }, [symbols]);

  return (
    <div className="tradingview-widget-container" ref={containerRef}>
      <div className="tradingview-widget-container__widget" />
    </div>
  );
}

// ─── Mini symbol overview ─────────────────────────────────────────────────────

interface MiniChartProps {
  symbol: string;
  width?: number | string;
  height?: number;
}

export function TradingViewMiniChart({ symbol, width = '100%', height = 220 }: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: symbol.includes(':') ? symbol : `NASDAQ:${symbol}`,
      width,
      height,
      locale: 'en',
      dateRange: '3M',
      colorTheme: 'dark',
      isTransparent: true,
      autosize: false,
      largeChartUrl: '',
    });
    container.appendChild(script);
  }, [symbol, height, width]);

  return (
    <div className="tradingview-widget-container rounded-xl overflow-hidden border border-gray-800 bg-[#0d0d14]"
      style={{ height }} ref={containerRef}>
      <div className="tradingview-widget-container__widget" />
    </div>
  );
}
