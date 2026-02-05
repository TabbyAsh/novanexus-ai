'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  BarChart3,
  PieChart,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Target,
  Wallet,
  Package,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';

// Types
interface RevenueData {
  period: string;
  revenue: number;
  costs: number;
  profit: number;
}

interface KPICard {
  title: string;
  value: string | number;
  change: number;
  changeLabel: string;
  icon: typeof DollarSign;
  color: string;
}

interface DivisionPerformance {
  name: string;
  revenue: number;
  profit: number;
  margin: number;
  trend: 'up' | 'down' | 'stable';
}

// Use API client for production/dev environment switching

export default function AnalyticsDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [tradingData, setTradingData] = useState<{ portfolioValue: number; dayChange: number; totalTrades: number } | null>(null);
  const [storeData, setStoreData] = useState<{ inventoryValue: number; products: number; alerts: number } | null>(null);
  const [socialData, setSocialData] = useState<{ followers: number; engagement: number; posts: number } | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'ytd'>('30d');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch trading data
      const alpacaData = await api.getAlpacaAccount();
      if (alpacaData.success && alpacaData.data?.account) {
        const account = alpacaData.data.account;
        setTradingData({
          portfolioValue: parseFloat(account.portfolio_value),
          dayChange: parseFloat(account.equity) - parseFloat(account.last_equity),
          totalTrades: 0, // Would come from orders history
        });
      }

      // Store and Social data - use stub data for now (services not yet deployed)
      // TODO: Add store/social bot integration when available
      setStoreData({
        inventoryValue: 52500,
        products: 5,
        alerts: 0,
      });
      setSocialData({
        followers: 12500,
        engagement: 4.2,
        posts: 45,
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Calculate totals
  const totalAssets = (tradingData?.portfolioValue || 0) + (storeData?.inventoryValue || 0);
  const totalDayChange = tradingData?.dayChange || 0;
  const dayChangePercent = tradingData && tradingData.portfolioValue > 0 
    ? (totalDayChange / tradingData.portfolioValue) * 100 
    : 0;

  // Generate revenue chart data (simulated)
  const revenueData: RevenueData[] = [
    { period: 'Week 1', revenue: 12500, costs: 8200, profit: 4300 },
    { period: 'Week 2', revenue: 15800, costs: 9100, profit: 6700 },
    { period: 'Week 3', revenue: 14200, costs: 8800, profit: 5400 },
    { period: 'Week 4', revenue: 18900, costs: 10200, profit: 8700 },
  ];

  const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
  const totalCosts = revenueData.reduce((sum, d) => sum + d.costs, 0);
  const totalProfit = totalRevenue - totalCosts;
  const profitMargin = (totalProfit / totalRevenue) * 100;

  // Division performance
  const divisions: DivisionPerformance[] = [
    { name: 'Trading Division', revenue: tradingData?.portfolioValue || 100000, profit: tradingData?.dayChange || 0, margin: dayChangePercent, trend: totalDayChange >= 0 ? 'up' : 'down' },
    { name: 'E-Commerce Division', revenue: storeData?.inventoryValue || 50000, profit: (storeData?.inventoryValue || 50000) * 0.35, margin: 35, trend: 'up' },
    { name: 'Social Media Division', revenue: (socialData?.followers || 0) * 0.05, profit: (socialData?.followers || 0) * 0.02, margin: 40, trend: socialData && socialData.engagement > 4 ? 'up' : 'stable' },
  ];

  const kpis: KPICard[] = [
    { title: 'Total Assets', value: formatCurrency(totalAssets), change: dayChangePercent, changeLabel: 'vs yesterday', icon: Wallet, color: 'blue' },
    { title: 'Monthly Revenue', value: formatCurrency(totalRevenue), change: 12.5, changeLabel: 'vs last month', icon: DollarSign, color: 'green' },
    { title: 'Profit Margin', value: `${profitMargin.toFixed(1)}%`, change: 2.3, changeLabel: 'vs last month', icon: Target, color: 'purple' },
    { title: 'Active Products', value: storeData?.products || 5, change: 0, changeLabel: 'this month', icon: Package, color: 'orange' },
    { title: 'Social Reach', value: formatNumber(socialData?.followers || 0), change: 8.2, changeLabel: 'growth rate', icon: Users, color: 'pink' },
    { title: 'Engagement Rate', value: `${(socialData?.engagement || 0).toFixed(1)}%`, change: 1.5, changeLabel: 'vs avg', icon: Activity, color: 'cyan' },
  ];

  return (
    <div className="p-8 bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Business Intelligence</h1>
          <p className="text-gray-400 mt-1">
            Unified analytics across all Nova Enterprises divisions
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-900 rounded-lg p-1">
            {(['7d', '30d', '90d', 'ytd'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded text-sm transition ${
                  timeRange === range
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 bg-${kpi.color}-500/20 rounded-lg`}>
                <kpi.icon className={`w-5 h-5 text-${kpi.color}-400`} />
              </div>
              {kpi.change !== 0 && (
                <div className={`flex items-center gap-1 text-sm ${
                  kpi.change > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {kpi.change > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {Math.abs(kpi.change).toFixed(1)}%
                </div>
              )}
            </div>
            <p className="text-gray-400 text-xs mb-1">{kpi.title}</p>
            <p className="text-xl font-bold text-white">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Revenue & Profit Analysis
          </h2>
          
          <div className="space-y-4">
            {revenueData.map((data, idx) => (
              <div key={idx} className="p-4 bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">{data.period}</span>
                  <span className="text-green-400 font-medium">{formatCurrency(data.profit)} profit</span>
                </div>
                <div className="relative h-6 bg-gray-700 rounded overflow-hidden">
                  <div 
                    className="absolute h-full bg-blue-500 rounded-l"
                    style={{ width: `${(data.revenue / 20000) * 100}%` }}
                  />
                  <div 
                    className="absolute h-full bg-red-500/50"
                    style={{ width: `${(data.costs / 20000) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-400">
                  <span>Revenue: {formatCurrency(data.revenue)}</span>
                  <span>Costs: {formatCurrency(data.costs)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-700 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-gray-400 text-sm">Total Revenue</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm">Total Costs</p>
              <p className="text-xl font-bold text-red-400">{formatCurrency(totalCosts)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm">Net Profit</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(totalProfit)}</p>
            </div>
          </div>
        </div>

        {/* Division Performance */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-purple-400" />
            Division Performance
          </h2>

          <div className="space-y-4">
            {divisions.map((div, idx) => (
              <div key={idx} className="p-4 bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">{div.name}</span>
                  <div className={`flex items-center gap-1 ${
                    div.trend === 'up' ? 'text-green-400' : div.trend === 'down' ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {div.trend === 'up' ? <TrendingUp className="w-4 h-4" /> : 
                     div.trend === 'down' ? <TrendingDown className="w-4 h-4" /> : null}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-gray-500">Revenue</p>
                    <p className="text-white">{formatCurrency(div.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Margin</p>
                    <p className={div.margin >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {div.margin.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* P&L Summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-400" />
          Profit & Loss Summary ({timeRange.toUpperCase()})
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b border-gray-800">
                <th className="pb-3">Category</th>
                <th className="pb-3 text-right">Amount</th>
                <th className="pb-3 text-right">% of Revenue</th>
                <th className="pb-3 text-right">vs Previous</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              <tr className="text-white">
                <td className="py-3 font-medium">Gross Revenue</td>
                <td className="py-3 text-right">{formatCurrency(totalRevenue)}</td>
                <td className="py-3 text-right">100%</td>
                <td className="py-3 text-right text-green-400">+12.5%</td>
              </tr>
              <tr className="text-white">
                <td className="py-3">Cost of Goods Sold</td>
                <td className="py-3 text-right text-red-400">({formatCurrency(totalCosts * 0.6)})</td>
                <td className="py-3 text-right">{((totalCosts * 0.6 / totalRevenue) * 100).toFixed(1)}%</td>
                <td className="py-3 text-right text-red-400">+8.2%</td>
              </tr>
              <tr className="text-white">
                <td className="py-3 font-medium">Gross Profit</td>
                <td className="py-3 text-right">{formatCurrency(totalRevenue - totalCosts * 0.6)}</td>
                <td className="py-3 text-right">{((1 - totalCosts * 0.6 / totalRevenue) * 100).toFixed(1)}%</td>
                <td className="py-3 text-right text-green-400">+15.3%</td>
              </tr>
              <tr className="text-white">
                <td className="py-3">Operating Expenses</td>
                <td className="py-3 text-right text-red-400">({formatCurrency(totalCosts * 0.4)})</td>
                <td className="py-3 text-right">{((totalCosts * 0.4 / totalRevenue) * 100).toFixed(1)}%</td>
                <td className="py-3 text-right text-green-400">-3.1%</td>
              </tr>
              <tr className="text-white bg-gray-800/50">
                <td className="py-3 font-bold">Net Income</td>
                <td className="py-3 text-right font-bold text-green-400">{formatCurrency(totalProfit)}</td>
                <td className="py-3 text-right font-bold">{profitMargin.toFixed(1)}%</td>
                <td className="py-3 text-right text-green-400 font-bold">+22.8%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
