'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import GlassCard, { GradientText } from '@/components/ui/GlassCard';
import TrustPanel from '@/components/trading/TrustPanel';
import { api } from '@/lib/api';

interface BacktestResult {
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  netProfit: number;
  netProfitPercent: number;
}

interface MonteCarloResult {
  percentile5: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  percentile95: number;
  probabilityProfit: number;
  expectedValue: number;
}
function resolveDateInput(date: Date) {
  return date.toISOString().split('T')[0];
}


// Phase 6.1: Available conditions for strategy builder
const ENTRY_CONDITIONS = [
  'RSI < 30 (Oversold)',
  'RSI > 70 (Overbought)',
  'Price > SMA 20',
  'Price < SMA 20',
  'Price > SMA 50',
  'Price < SMA 50',
  'MACD Crossover (Bullish)',
  'MACD Crossover (Bearish)',
  'Volume > 1.5x Average',
  'Golden Cross (SMA 50 > 200)',
  'Death Cross (SMA 50 < 200)',
];

const EXIT_CONDITIONS = [
  'RSI > 70 (Overbought)',
  'RSI < 30 (Oversold)',
  'Price < SMA 20',
  'Price > SMA 20',
  'MACD Crossover (Opposite)',
  'Trailing Stop Hit',
  'Time-based Exit (5 days)',
  'Time-based Exit (10 days)',
  'Profit Target Reached',
  'Stop Loss Triggered',
];

function StrategyBuilder() {
  const [strategy, setStrategy] = useState({
    entryConditions: [] as string[],
    exitConditions: [] as string[],
    stopLoss: '',
    takeProfit: '',
    positionSize: '',
  });
  const [showEntryPicker, setShowEntryPicker] = useState(false);
  const [showExitPicker, setShowExitPicker] = useState(false);

  // Phase 6.1: Handlers for adding/removing conditions
  const addEntryCondition = (condition: string) => {
    if (!strategy.entryConditions.includes(condition)) {
      setStrategy({ ...strategy, entryConditions: [...strategy.entryConditions, condition] });
    }
    setShowEntryPicker(false);
  };

  const removeEntryCondition = (condition: string) => {
    setStrategy({ ...strategy, entryConditions: strategy.entryConditions.filter(c => c !== condition) });
  };

  const addExitCondition = (condition: string) => {
    if (!strategy.exitConditions.includes(condition)) {
      setStrategy({ ...strategy, exitConditions: [...strategy.exitConditions, condition] });
    }
    setShowExitPicker(false);
  };

  const removeExitCondition = (condition: string) => {
    setStrategy({ ...strategy, exitConditions: strategy.exitConditions.filter(c => c !== condition) });
  };

  return (
    <GlassCard hover={false} glowColor="cyan" className="h-full">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="text-cyan-400">⚙️</span> Strategy Builder
      </h3>
      
      <div className="space-y-4">
        <div className="relative">
          <label className="text-gray-400 text-sm mb-2 block">Entry Conditions</label>
          {strategy.entryConditions.length === 0 ? (
            <p className="text-gray-500 text-sm mb-2">No entry conditions set.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-2">
              {strategy.entryConditions.map((condition, i) => (
                <span 
                  key={i} 
                  className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm border border-green-500/30 flex items-center gap-2"
                >
                  {condition}
                  <button 
                    onClick={() => removeEntryCondition(condition)}
                    className="text-green-300 hover:text-red-400 transition"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <button 
            onClick={() => setShowEntryPicker(!showEntryPicker)}
            className="text-cyan-400 text-sm hover:text-cyan-300 transition"
          >
            + Add condition
          </button>
          {showEntryPicker && (
            <div className="absolute z-10 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {ENTRY_CONDITIONS.filter(c => !strategy.entryConditions.includes(c)).map(condition => (
                <button
                  key={condition}
                  onClick={() => addEntryCondition(condition)}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-green-500/20 hover:text-green-400 transition"
                >
                  {condition}
                </button>
              ))}
              {ENTRY_CONDITIONS.filter(c => !strategy.entryConditions.includes(c)).length === 0 && (
                <p className="px-4 py-2 text-sm text-gray-500">All conditions added</p>
              )}
            </div>
          )}
        </div>
        
        <div className="relative">
          <label className="text-gray-400 text-sm mb-2 block">Exit Conditions</label>
          {strategy.exitConditions.length === 0 ? (
            <p className="text-gray-500 text-sm mb-2">No exit conditions set.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-2">
              {strategy.exitConditions.map((condition, i) => (
                <span 
                  key={i} 
                  className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-sm border border-red-500/30 flex items-center gap-2"
                >
                  {condition}
                  <button 
                    onClick={() => removeExitCondition(condition)}
                    className="text-red-300 hover:text-white transition"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <button 
            onClick={() => setShowExitPicker(!showExitPicker)}
            className="text-cyan-400 text-sm hover:text-cyan-300 transition"
          >
            + Add condition
          </button>
          {showExitPicker && (
            <div className="absolute z-10 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {EXIT_CONDITIONS.filter(c => !strategy.exitConditions.includes(c)).map(condition => (
                <button
                  key={condition}
                  onClick={() => addExitCondition(condition)}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-red-500/20 hover:text-red-400 transition"
                >
                  {condition}
                </button>
              ))}
              {EXIT_CONDITIONS.filter(c => !strategy.exitConditions.includes(c)).length === 0 && (
                <p className="px-4 py-2 text-sm text-gray-500">All conditions added</p>
              )}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Stop Loss %</label>
            <input
              type="number"
              value={strategy.stopLoss}
              onChange={(e) => setStrategy({ ...strategy, stopLoss: e.target.value })}
              placeholder="e.g., 5"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Take Profit %</label>
            <input
              type="number"
              value={strategy.takeProfit}
              onChange={(e) => setStrategy({ ...strategy, takeProfit: e.target.value })}
              placeholder="e.g., 15"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Position Size %</label>
            <input
              type="number"
              value={strategy.positionSize}
              onChange={(e) => setStrategy({ ...strategy, positionSize: e.target.value })}
              placeholder="e.g., 10"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {/* Phase 6.1: Show strategy summary when conditions are set */}
        {(strategy.entryConditions.length > 0 || strategy.exitConditions.length > 0) && (
          <div className="mt-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
            <p className="text-cyan-400 text-xs font-medium mb-1">Strategy Ready</p>
            <p className="text-gray-400 text-xs">
              {strategy.entryConditions.length} entry condition(s), {strategy.exitConditions.length} exit condition(s)
              {strategy.stopLoss && `, ${strategy.stopLoss}% stop loss`}
              {strategy.takeProfit && `, ${strategy.takeProfit}% take profit`}
            </p>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function BacktestResults({ result }: { result: BacktestResult }) {
  return (
    <GlassCard hover={false} glowColor="purple">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="text-purple-400">📊</span> Backtest Results
      </h3>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 rounded-xl bg-white/5">
          <p className="text-3xl font-bold text-white">{result.totalTrades}</p>
          <p className="text-gray-400 text-sm">Total Trades</p>
        </div>
        <div className="text-center p-4 rounded-xl bg-white/5">
          <p className={`text-3xl font-bold ${result.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {result.winRate}%
          </p>
          <p className="text-gray-400 text-sm">Win Rate</p>
        </div>
        <div className="text-center p-4 rounded-xl bg-white/5">
          <p className={`text-3xl font-bold ${result.netProfitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {result.netProfitPercent >= 0 ? '+' : ''}{result.netProfitPercent}%
          </p>
          <p className="text-gray-400 text-sm">Net Profit</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="p-3 rounded-xl bg-white/5">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Profit Factor</span>
            <span className={`font-semibold ${result.profitFactor >= 1.5 ? 'text-green-400' : 'text-yellow-400'}`}>
              {result.profitFactor}
            </span>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-white/5">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Max Drawdown</span>
            <span className="text-red-400 font-semibold">-{result.maxDrawdown}%</span>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-white/5">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Sharpe Ratio</span>
            <span className={`font-semibold ${result.sharpeRatio >= 1.5 ? 'text-green-400' : 'text-yellow-400'}`}>
              {result.sharpeRatio}
            </span>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-white/5">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Avg Win/Loss</span>
            <span className="text-cyan-400 font-semibold">
              ${result.avgWin} / ${result.avgLoss}
            </span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function MonteCarloResults({ result }: { result: MonteCarloResult }) {
  return (
    <GlassCard hover={false} glowColor="pink">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="text-pink-400">🎲</span> Monte Carlo Simulation
      </h3>
      
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400 text-sm">Probability of Profit</span>
          <span className="text-green-400 font-bold text-xl">{result.probabilityProfit}%</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${result.probabilityProfit}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-green-500 to-cyan-500 rounded-full"
          />
        </div>
      </div>
      
      <div className="space-y-3">
        <p className="text-gray-400 text-sm mb-2">Return Distribution (1 Year)</p>
        
        <div className="flex items-center gap-4">
          <div className="w-20 text-gray-500 text-sm">Worst 5%</div>
          <div className="flex-1 h-2 bg-white/10 rounded-full">
            <div className="h-full w-[10%] bg-red-500 rounded-full" />
          </div>
          <div className="w-16 text-right text-red-400 font-medium">{result.percentile5}%</div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="w-20 text-gray-500 text-sm">25th %ile</div>
          <div className="flex-1 h-2 bg-white/10 rounded-full">
            <div className="h-full w-[25%] bg-yellow-500 rounded-full" />
          </div>
          <div className="w-16 text-right text-yellow-400 font-medium">+{result.percentile25}%</div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="w-20 text-gray-500 text-sm">Median</div>
          <div className="flex-1 h-2 bg-white/10 rounded-full">
            <div className="h-full w-[50%] bg-cyan-500 rounded-full" />
          </div>
          <div className="w-16 text-right text-cyan-400 font-medium">+{result.percentile50}%</div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="w-20 text-gray-500 text-sm">75th %ile</div>
          <div className="flex-1 h-2 bg-white/10 rounded-full">
            <div className="h-full w-[75%] bg-green-500 rounded-full" />
          </div>
          <div className="w-16 text-right text-green-400 font-medium">+{result.percentile75}%</div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="w-20 text-gray-500 text-sm">Best 5%</div>
          <div className="flex-1 h-2 bg-white/10 rounded-full">
            <div className="h-full w-[95%] bg-purple-500 rounded-full" />
          </div>
          <div className="w-16 text-right text-purple-400 font-medium">+{result.percentile95}%</div>
        </div>
      </div>
      
      <div className="mt-6 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
        <div className="flex items-center justify-between">
          <span className="text-cyan-400 font-medium">Expected Value (1 Year)</span>
          <span className="text-2xl font-bold text-white">+{result.expectedValue}%</span>
        </div>
      </div>
    </GlassCard>
  );
}


export default function SimulatorPage() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloResult | null>(null);
  const [fitness, setFitness] = useState<number | null>(null);
  const [strategyStatus, setStrategyStatus] = useState<string | null>(null);
  const [slippage, setSlippage] = useState<Array<{ slippageBps: number; totalReturnPct: number }> | null>(null);
  const [analyticsDepth, setAnalyticsDepth] = useState<number | null>(null);
  const [analyticsLocked, setAnalyticsLocked] = useState(false);
  const [strategySummary, setStrategySummary] = useState<{
    status?: string | null;
    fitnessScore?: number | null;
    expectancy?: number | null;
    analyticsLocked?: boolean;
    drift?: any;
    evaluatedAt?: string | null;
  } | null>(null);

  const now = new Date();
  const defaultStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const [symbol, setSymbol] = useState('SPY');
  const [strategyType, setStrategyType] = useState('sma_crossover');
  const [startDate, setStartDate] = useState(resolveDateInput(defaultStart));
  const [endDate, setEndDate] = useState(resolveDateInput(now));

  const runSimulation = async () => {
    setRunning(true);
    setError(null);

    try {
      const result = await api.runStrategySimulation({
        symbol,
        strategyType,
        startDate,
        endDate,
      });

      if (!result.success || !result.data?.simulation) {
        setBacktest(null);
        setMonteCarlo(null);
        setFitness(null);
        setStrategyStatus(null);
        setSlippage(null);
        setAnalyticsDepth(null);
        setAnalyticsLocked(false);
        setStrategySummary(null);
        setError(result.error?.message || 'Simulation failed.');
        return;
      }

      const simulation = result.data.simulation as any;
      const analytics = simulation.analytics || {};
      const locked = !!analytics.locked;
      setAnalyticsDepth(result.data.analyticsDepth ?? analytics.depth ?? null);
      setAnalyticsLocked(locked);
      const summary = simulation.backtest || {};
      setBacktest({
        totalTrades: summary.totalTrades ?? 0,
        winRate: summary.winRate ?? 0,
        avgWin: summary.avgWin ?? 0,
        avgLoss: summary.avgLoss ?? 0,
        profitFactor: summary.profitFactor ?? 0,
        maxDrawdown: summary.maxDrawdownPct ?? 0,
        sharpeRatio: summary.sharpeRatio ?? 0,
        netProfit: summary.totalReturn ?? 0,
        netProfitPercent: summary.totalReturnPct ?? 0,
      });
      setMonteCarlo(locked ? null : (simulation.monteCarlo || null));
      setFitness(simulation.fitnessScore ?? null);
      setStrategyStatus(simulation.status ?? null);
      setSlippage(locked ? null : (simulation.slippage || null));
      setStrategySummary({
        status: simulation.status ?? null,
        fitnessScore: simulation.fitnessScore ?? null,
        expectancy: simulation.expectancy ?? simulation.monteCarlo?.expectedValue ?? null,
        analyticsLocked: locked,
        drift: simulation.drift ?? null,
        evaluatedAt: simulation.evaluatedAt ?? null,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Strategy <GradientText>Simulator</GradientText>
            </h1>
            <p className="text-gray-400">
              Backtest strategies and run Monte Carlo simulations to understand risk
            </p>
          </div>

          <button
            onClick={runSimulation}
            disabled={running}
            className={`
              px-6 py-3 rounded-xl font-medium transition-all
              ${running
                ? 'bg-purple-500/30 text-purple-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:shadow-lg hover:shadow-purple-500/25'
              }
            `}
          >
            {running ? (
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Running Simulation...
              </span>
            ) : (
              '🚀 Run Simulation'
            )}
          </button>
        </motion.div>

        {error && (
          <div className="backdrop-blur-xl bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-4">
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Symbol</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Strategy</label>
            <select
              value={strategyType}
              onChange={(e) => setStrategyType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            >
              <option value="sma_crossover">SMA Crossover</option>
              <option value="mean_reversion">Mean Reversion</option>
              <option value="momentum">Momentum</option>
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {(fitness !== null || strategyStatus) && (
          <div className="grid md:grid-cols-3 gap-4">
            <GlassCard hover={false} glowColor="cyan">
              <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <span className="text-cyan-400">🧠</span> Strategy Fitness
              </h3>
              <div className="text-3xl font-bold text-white">{fitness ?? '—'}</div>
              <p className="text-gray-400 text-sm mt-2">Fitness score (0-100)</p>
            </GlassCard>
            <GlassCard hover={false} glowColor="purple">
              <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <span className="text-purple-400">🛡️</span> Strategy Status
              </h3>
              <div className={`text-2xl font-semibold ${strategyStatus === 'QUARANTINED' ? 'text-red-400' : 'text-emerald-400'}`}>
                {strategyStatus ?? '—'}
              </div>
              <p className="text-gray-400 text-sm mt-2">Auto quarantine if drift thresholds fail.</p>
            </GlassCard>
            <GlassCard hover={false} glowColor="pink">
              <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <span className="text-pink-400">⚖️</span> Slippage Sensitivity
              </h3>
              <div className="text-sm text-gray-300 space-y-1">
                {analyticsLocked ? (
                  <span className="text-xs text-yellow-300">Locked on your plan. Upgrade for full analytics.</span>
                ) : slippage?.length ? (
                  slippage.map((point) => (
                    <div key={point.slippageBps} className="flex items-center justify-between">
                      <span>{point.slippageBps} bps</span>
                      <span>{point.totalReturnPct}%</span>
                    </div>
                  ))
                ) : (
                  '—'
                )}
              </div>
            </GlassCard>
          </div>
        )}

        {(fitness !== null || strategyStatus || analyticsLocked) && (
          <TrustPanel
            title="Simulation Trust Panel"
            strategy={strategySummary}
            expectedValue={strategySummary?.expectancy ?? null}
            analyticsDepth={analyticsDepth}
            analyticsLocked={analyticsLocked}
          />
        )}

        {/* Strategy Builder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StrategyBuilder />
        </motion.div>

        {/* Results Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            {backtest ? (
              <BacktestResults result={backtest} />
            ) : (
              <GlassCard hover={false} glowColor="purple">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span className="text-purple-400">📊</span> Backtest Results
                </h3>
                <p className="text-gray-400 text-sm">
                  Run a simulation to see backtest results.
                </p>
              </GlassCard>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            {monteCarlo ? (
              <MonteCarloResults result={monteCarlo} />
            ) : analyticsLocked ? (
              <GlassCard hover={false} glowColor="pink">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span className="text-pink-400">🎲</span> Monte Carlo Simulation
                </h3>
                <p className="text-gray-400 text-sm">
                  Monte Carlo analytics are locked on your plan. Upgrade to unlock full distributions.
                </p>
              </GlassCard>
            ) : (
              <GlassCard hover={false} glowColor="pink">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span className="text-pink-400">🎲</span> Monte Carlo Simulation
                </h3>
                <p className="text-gray-400 text-sm">
                  Run a simulation to see Monte Carlo results.
                </p>
              </GlassCard>
            )}
          </motion.div>
        </div>

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="backdrop-blur-xl bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4"
        >
          <div className="flex items-start gap-3">
            <span className="text-cyan-400 text-xl">💡</span>
            <div>
              <p className="text-cyan-400 font-medium text-sm mb-1">Simulation discipline</p>
              <p className="text-gray-400 text-sm">
                This page will only display results generated from explicit simulation runs. When unavailable, it shows
                “Unavailable” states rather than fabricated numbers.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
