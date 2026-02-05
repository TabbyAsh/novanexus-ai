'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import GlassCard, { GradientText } from '@/components/ui/GlassCard';
import StatCard from '@/components/dashboard/StatCard';

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

const mockBacktestResult: BacktestResult = {
  totalTrades: 247,
  winRate: 62.3,
  avgWin: 342.50,
  avgLoss: -198.75,
  profitFactor: 1.87,
  maxDrawdown: 8.4,
  sharpeRatio: 1.92,
  netProfit: 34250,
  netProfitPercent: 34.25,
};

const mockMonteCarloResult: MonteCarloResult = {
  percentile5: -12.5,
  percentile25: 8.2,
  percentile50: 22.4,
  percentile75: 38.7,
  percentile95: 68.3,
  probabilityProfit: 78.4,
  expectedValue: 24.6,
};

function StrategyBuilder() {
  const [strategy, setStrategy] = useState({
    entryConditions: ['RSI < 30', 'Price > 50 SMA'],
    exitConditions: ['RSI > 70', 'Price < 20 SMA'],
    stopLoss: 5,
    takeProfit: 15,
    positionSize: 10,
  });

  return (
    <GlassCard hover={false} glowColor="cyan" className="h-full">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="text-cyan-400">⚙️</span> Strategy Builder
      </h3>
      
      <div className="space-y-4">
        <div>
          <label className="text-gray-400 text-sm mb-2 block">Entry Conditions</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {strategy.entryConditions.map((condition, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm border border-green-500/30">
                {condition}
              </span>
            ))}
          </div>
          <button className="text-cyan-400 text-sm hover:text-cyan-300">+ Add condition</button>
        </div>
        
        <div>
          <label className="text-gray-400 text-sm mb-2 block">Exit Conditions</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {strategy.exitConditions.map((condition, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-sm border border-red-500/30">
                {condition}
              </span>
            ))}
          </div>
          <button className="text-cyan-400 text-sm hover:text-cyan-300">+ Add condition</button>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Stop Loss %</label>
            <input
              type="number"
              value={strategy.stopLoss}
              onChange={(e) => setStrategy({ ...strategy, stopLoss: Number(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Take Profit %</label>
            <input
              type="number"
              value={strategy.takeProfit}
              onChange={(e) => setStrategy({ ...strategy, takeProfit: Number(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Position Size %</label>
            <input
              type="number"
              value={strategy.positionSize}
              onChange={(e) => setStrategy({ ...strategy, positionSize: Number(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>
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
        <span className="text-gray-500 text-xs font-normal">(10,000 runs)</span>
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

function EquityCurve() {
  // Mock equity curve data points
  const dataPoints = [
    100, 102, 98, 105, 108, 103, 110, 115, 112, 118,
    122, 119, 125, 130, 128, 134, 138, 135, 142, 148
  ];
  
  const max = Math.max(...dataPoints);
  const min = Math.min(...dataPoints);
  const range = max - min;
  
  return (
    <GlassCard hover={false} glowColor="green">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="text-green-400">📈</span> Equity Curve
      </h3>
      
      <div className="h-48 flex items-end gap-1">
        {dataPoints.map((point, i) => {
          const height = ((point - min) / range) * 100 + 20;
          const isUp = i > 0 && point >= dataPoints[i - 1];
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className={`flex-1 rounded-t ${isUp ? 'bg-green-500' : 'bg-red-500'}`}
            />
          );
        })}
      </div>
      
      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-gray-400">Jan 2025</span>
        <span className="text-gray-400">Present</span>
      </div>
    </GlassCard>
  );
}

export default function SimulatorPage() {
  const [running, setRunning] = useState(false);
  
  const runSimulation = () => {
    setRunning(true);
    setTimeout(() => setRunning(false), 3000);
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
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Running Simulation...
              </span>
            ) : (
              '🚀 Run Simulation'
            )}
          </button>
        </motion.div>
        
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
            <BacktestResults result={mockBacktestResult} />
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <MonteCarloResults result={mockMonteCarloResult} />
          </motion.div>
        </div>
        
        {/* Equity Curve */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <EquityCurve />
        </motion.div>
        
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
              <p className="text-cyan-400 font-medium text-sm mb-1">Pro Tip</p>
              <p className="text-gray-400 text-sm">
                A strategy with a Sharpe Ratio above 1.5 and win rate above 55% typically indicates a robust edge. 
                Always consider the maximum drawdown—can you psychologically handle a {mockBacktestResult.maxDrawdown}% drawdown?
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
