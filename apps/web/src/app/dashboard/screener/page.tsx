'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import GlassCard, { GradientText } from '@/components/ui/GlassCard';
import { api } from '@/lib/api';

interface Signal {
  symbol: string;
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  pattern: string;
  confidence: number;
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  reasoning: string;
  timeframe: string;
  indicators?: {
    rsi: number;
    sma20: number;
    sma50: number;
    priceVsSma20: number;
    priceVsSma50: number;
  };
  timestamp: string;
}

interface ScanStatus {
  scanning: boolean;
  progress: number;
  scannedCount: number;
  totalCount: number;
  foundSignals: number;
}

// Signal Card Component with enhanced visuals
function SignalCard({ signal, index }: { signal: Signal; index: number }) {
  const [expanded, setExpanded] = useState(false);
  
  const typeColors = {
    bullish: { 
      bg: 'from-green-500/20 via-green-500/10 to-emerald-500/5', 
      border: 'border-green-500/40 hover:border-green-400/60', 
      text: 'text-green-400', 
      badge: 'bg-green-500/30',
      glow: 'hover:shadow-[0_0_30px_rgba(34,197,94,0.3)]',
      icon: '📈'
    },
    bearish: { 
      bg: 'from-red-500/20 via-red-500/10 to-rose-500/5', 
      border: 'border-red-500/40 hover:border-red-400/60', 
      text: 'text-red-400', 
      badge: 'bg-red-500/30',
      glow: 'hover:shadow-[0_0_30px_rgba(239,68,68,0.3)]',
      icon: '📉'
    },
    neutral: { 
      bg: 'from-yellow-500/20 via-yellow-500/10 to-amber-500/5', 
      border: 'border-yellow-500/40 hover:border-yellow-400/60', 
      text: 'text-yellow-400', 
      badge: 'bg-yellow-500/30',
      glow: 'hover:shadow-[0_0_30px_rgba(234,179,8,0.3)]',
      icon: '➡️'
    },
  };
  
  const colors = typeColors[signal.type];
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.1, type: 'spring', stiffness: 100 }}
      whileHover={{ scale: 1.01, y: -2 }}
      className={`
        relative backdrop-blur-xl bg-gradient-to-br ${colors.bg}
        border-2 ${colors.border}
        rounded-2xl overflow-hidden
        transition-all duration-300
        ${colors.glow}
      `}
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer" />
      
      <div 
        className="p-6 cursor-pointer relative z-10"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <motion.div 
              className={`w-14 h-14 rounded-2xl ${colors.badge} flex items-center justify-center border ${colors.border}`}
              animate={{ rotate: signal.type === 'bullish' ? [0, 5, 0] : signal.type === 'bearish' ? [0, -5, 0] : 0 }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-2xl">{colors.icon}</span>
            </motion.div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-white">{signal.symbol}</span>
                <motion.span 
                  className={`text-xs px-3 py-1 rounded-full ${colors.badge} ${colors.text} font-semibold border ${colors.border}`}
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {signal.type.toUpperCase()}
                </motion.span>
              </div>
              <p className="text-gray-400 text-sm mt-1">{signal.name}</p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-gray-400 text-sm">AI Confidence</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-3 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full rounded-full ${signal.confidence >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : signal.confidence >= 60 ? 'bg-gradient-to-r from-yellow-500 to-amber-400' : 'bg-gradient-to-r from-red-500 to-rose-400'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${signal.confidence}%` }}
                  transition={{ duration: 1, delay: index * 0.1 + 0.3 }}
                />
              </div>
              <span className={`text-xl font-bold ${signal.confidence >= 80 ? 'text-green-400' : signal.confidence >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {signal.confidence}%
              </span>
            </div>
            <p className="text-gray-500 text-xs mt-2 font-medium">{signal.pattern}</p>
          </div>
        </div>
        
        {/* Price targets with visual bars */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-gray-500 text-xs mb-1 uppercase tracking-wide">Entry</p>
            <p className="text-white font-bold text-lg">${signal.entry.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30">
            <p className="text-green-400 text-xs mb-1 uppercase tracking-wide">Target</p>
            <p className="text-green-400 font-bold text-lg">${signal.target.toFixed(2)}</p>
            <p className="text-green-400/60 text-xs">+{((signal.target - signal.entry) / signal.entry * 100).toFixed(1)}%</p>
          </div>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
            <p className="text-red-400 text-xs mb-1 uppercase tracking-wide">Stop Loss</p>
            <p className="text-red-400 font-bold text-lg">${signal.stopLoss.toFixed(2)}</p>
            <p className="text-red-400/60 text-xs">{((signal.stopLoss - signal.entry) / signal.entry * 100).toFixed(1)}%</p>
          </div>
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
            <p className="text-cyan-400 text-xs mb-1 uppercase tracking-wide">Risk/Reward</p>
            <p className="text-cyan-400 font-bold text-lg">{signal.riskReward.toFixed(2)}:1</p>
            <p className="text-cyan-400/60 text-xs">{signal.riskReward >= 2 ? 'Excellent' : signal.riskReward >= 1.5 ? 'Good' : 'Fair'}</p>
          </div>
        </div>
        
        {/* Indicators if available */}
        {signal.indicators && (
          <div className="flex gap-4 mb-4 text-xs">
            <div className={`px-3 py-1 rounded-full ${signal.indicators.rsi < 30 ? 'bg-green-500/20 text-green-400' : signal.indicators.rsi > 70 ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
              RSI: {signal.indicators.rsi.toFixed(1)}
            </div>
            <div className={`px-3 py-1 rounded-full ${signal.indicators.priceVsSma20 > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              vs SMA20: {signal.indicators.priceVsSma20 > 0 ? '+' : ''}{signal.indicators.priceVsSma20.toFixed(1)}%
            </div>
            <div className={`px-3 py-1 rounded-full ${signal.indicators.priceVsSma50 > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              vs SMA50: {signal.indicators.priceVsSma50 > 0 ? '+' : ''}{signal.indicators.priceVsSma50.toFixed(1)}%
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">⏱️ Timeframe: {signal.timeframe}</span>
          <motion.span 
            className={`${colors.text} flex items-center gap-1 font-medium`}
            animate={{ x: expanded ? 0 : [0, 3, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {expanded ? '▲ Hide Analysis' : '▼ Show AI Analysis'}
          </motion.span>
        </div>
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t-2 border-white/10 overflow-hidden"
          >
            <div className="p-6 bg-gradient-to-br from-cyan-500/10 to-purple-500/10">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🧠</span>
                </div>
                <div className="flex-1">
                  <p className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 font-bold text-lg mb-2">AI Analysis</p>
                  <p className="text-gray-300 leading-relaxed text-sm">{signal.reasoning}</p>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                >
                  📋 Add to Watchlist
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-green-500/30 transition-all"
                >
                  📊 Paper Trade
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Scanning progress component
function ScanProgress({ status }: { status: ScanStatus }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent"
          />
          <div>
            <p className="text-white font-semibold">AI Scanning Markets...</p>
            <p className="text-gray-400 text-sm">Analyzing {status.totalCount} stocks with OpenAI</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-cyan-400 font-bold text-2xl">{status.foundSignals}</p>
          <p className="text-gray-400 text-xs">Signals Found</p>
        </div>
      </div>
      
      <div className="relative h-4 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full"
          initial={{ width: '0%' }}
          animate={{ width: `${status.progress}%` }}
          transition={{ duration: 0.5 }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
      </div>
      
      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>Scanned: {status.scannedCount}/{status.totalCount}</span>
        <span>{status.progress.toFixed(0)}% Complete</span>
      </div>
    </motion.div>
  );
}

export default function ScreenerPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [scanStatus, setScanStatus] = useState<ScanStatus>({
    scanning: false,
    progress: 0,
    scannedCount: 0,
    totalCount: 0,
    foundSignals: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    maxStocks: 50,
    minConfidence: 65,
    signalType: 'all' as 'all' | 'bullish' | 'bearish',
  });

  // Fetch real signals from the backend
  const runScan = useCallback(async () => {
    setScanStatus(s => ({ ...s, scanning: true, progress: 0, scannedCount: 0, foundSignals: 0, totalCount: settings.maxStocks }));
    setError(null);
    
    // Simulate progress while scanning
    const progressInterval = setInterval(() => {
      setScanStatus(s => {
        if (s.progress >= 95) return s;
        const increment = Math.random() * 10;
        return { 
          ...s, 
          progress: Math.min(95, s.progress + increment),
          scannedCount: Math.floor((s.progress + increment) / 100 * s.totalCount),
        };
      });
    }, 500);

    try {
      const data = await api.runAIScreener(settings);
      
      clearInterval(progressInterval);
      
      if (data.success && data.data?.signals) {
        setSignals(data.data.signals);
        setLastScan(new Date().toISOString());
        setScanStatus(s => ({ 
          ...s, 
          scanning: false, 
          progress: 100, 
          scannedCount: s.totalCount,
          foundSignals: data.data!.signals.length 
        }));
      } else {
        throw new Error(data.error?.message || 'Unknown error');
      }
    } catch (err) {
      clearInterval(progressInterval);
      setError((err as Error).message);
      setScanStatus(s => ({ ...s, scanning: false, progress: 0 }));
      
      // Load demo data on error
      setSignals([
        {
          symbol: 'NVDA',
          name: 'NVIDIA Corporation',
          type: 'bullish',
          pattern: 'Bull Flag Breakout',
          confidence: 87,
          entry: 875.50,
          target: 950.00,
          stopLoss: 840.00,
          riskReward: 2.1,
          reasoning: 'Strong momentum with AI sector tailwinds. Volume confirming breakout above consolidation. RSI showing strength without overbought conditions.',
          timeframe: '1-2 weeks',
          indicators: { rsi: 62, sma20: 850, sma50: 820, priceVsSma20: 3.0, priceVsSma50: 6.8 },
          timestamp: new Date().toISOString(),
        },
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'bullish',
          pattern: 'Cup and Handle',
          confidence: 72,
          entry: 182.30,
          target: 195.00,
          stopLoss: 175.00,
          riskReward: 1.74,
          reasoning: 'Classic cup and handle formation completing. Services revenue growth supporting valuation. Institutional accumulation evident.',
          timeframe: '2-4 weeks',
          indicators: { rsi: 55, sma20: 180, sma50: 175, priceVsSma20: 1.3, priceVsSma50: 4.2 },
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [settings]);

  // Initial load
  useEffect(() => {
    runScan();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-start justify-between gap-4"
        >
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              AI Market <GradientText>Screener</GradientText>
            </h1>
            <p className="text-gray-400">
              Real-time pattern recognition scanning {settings.maxStocks}+ stocks with OpenAI-powered analysis
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {error && (
              <span className="text-yellow-400 text-sm">⚠️ Demo Mode</span>
            )}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-cyan-400 text-sm font-medium">Real-Time AI Analysis</span>
            </div>
          </div>
        </motion.div>
        
        {/* Scan Controls */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Stocks to Scan</label>
              <select 
                value={settings.maxStocks}
                onChange={(e) => setSettings(s => ({ ...s, maxStocks: Number(e.target.value) }))}
                className="bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
              >
                <option value={20}>20 Stocks</option>
                <option value={50}>50 Stocks</option>
                <option value={100}>100 Stocks</option>
                <option value={200}>200 Stocks</option>
              </select>
            </div>
            
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Min Confidence</label>
              <select 
                value={settings.minConfidence}
                onChange={(e) => setSettings(s => ({ ...s, minConfidence: Number(e.target.value) }))}
                className="bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
              >
                <option value={50}>50%+</option>
                <option value={65}>65%+</option>
                <option value={75}>75%+</option>
                <option value={85}>85%+</option>
              </select>
            </div>
            
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Signal Type</label>
              <select 
                value={settings.signalType}
                onChange={(e) => setSettings(s => ({ ...s, signalType: e.target.value as 'all' | 'bullish' | 'bearish' }))}
                className="bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
              >
                <option value="all">All Signals</option>
                <option value="bullish">Bullish Only</option>
                <option value="bearish">Bearish Only</option>
              </select>
            </div>
            
            <motion.button 
              onClick={runScan}
              disabled={scanStatus.scanning}
              whileHover={{ scale: scanStatus.scanning ? 1 : 1.02 }}
              whileTap={{ scale: scanStatus.scanning ? 1 : 0.98 }}
              className={`
                px-8 py-3 rounded-xl font-semibold text-sm transition-all ml-auto
                ${scanStatus.scanning 
                  ? 'bg-cyan-500/30 text-cyan-300 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:shadow-lg hover:shadow-cyan-500/30'
                }
              `}
            >
              {scanStatus.scanning ? (
                <span className="flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >⟳</motion.span>
                  Scanning...
                </span>
              ) : (
                '🧠 Run AI Scan'
              )}
            </motion.button>
          </div>
        </motion.div>
        
        {/* Scan Progress */}
        {scanStatus.scanning && <ScanProgress status={scanStatus} />}
        
        {/* Signals */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              Signals <span className="text-cyan-400">({signals.length})</span>
            </h2>
            {lastScan && (
              <span className="text-gray-500 text-sm">
                Last scan: {new Date(lastScan).toLocaleTimeString()}
              </span>
            )}
          </div>
          
          {signals.length === 0 && !scanStatus.scanning ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-4">🔍</p>
              <p>No signals found. Try adjusting your filters or run a new scan.</p>
            </div>
          ) : (
            signals.map((signal, i) => (
              <SignalCard key={`${signal.symbol}-${i}`} signal={signal} index={i} />
            ))
          )}
        </div>
        
        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="backdrop-blur-xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-6"
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl">⚠️</span>
            <div>
              <p className="text-yellow-400 font-bold text-lg mb-2">Not Financial Advice</p>
              <p className="text-gray-400 text-sm leading-relaxed">
                AI signals are for educational and informational purposes only. NovaNexus AI is not a registered investment advisor. 
                Always do your own research, consult with a qualified financial advisor, and never invest more than you can afford to lose. 
                Past performance does not guarantee future results. Trading involves substantial risk of loss.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
      
      <style jsx global>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </DashboardLayout>
  );
}
