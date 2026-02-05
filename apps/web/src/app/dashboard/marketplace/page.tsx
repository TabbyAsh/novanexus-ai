'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Package,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShoppingCart,
  RefreshCw,
  CheckCircle,
  Zap,
  ArrowUp,
  ArrowDown,
  Tag,
  Boxes,
  BarChart3,
  Target,
} from 'lucide-react';

// Types
interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  base_cost: number;
  current_price: number;
  min_price: number;
  max_price: number;
  stock_quantity: number;
  reorder_point: number;
}

interface PriceRecommendation {
  product_id: string;
  current_price: number;
  recommended_price: number;
  reason: string;
  confidence: number;
  projected_margin: number;
  projected_revenue_change: number;
}

interface InventoryAlert {
  id: string;
  productId: string;
  sku: string;
  title: string;
  alertType: string;
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

const STOREBOT_URL = 'http://localhost:3011';

export default function MarketplaceDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [recommendations, setRecommendations] = useState<PriceRecommendation[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'products' | 'pricing' | 'inventory'>('products');
  const [applyingPrice, setApplyingPrice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [productsRes, recommendationsRes, alertsRes] = await Promise.all([
        fetch(`${STOREBOT_URL}/api/products/catalog`),
        fetch(`${STOREBOT_URL}/api/pricing/recommendations`),
        fetch(`${STOREBOT_URL}/api/inventory/alerts`),
      ]);

      const [productsData, recommendationsData, alertsData] = await Promise.all([
        productsRes.json(),
        recommendationsRes.json(),
        alertsRes.json(),
      ]);

      if (productsData.success) setProducts(productsData.data.products);
      if (recommendationsData.success) setRecommendations(recommendationsData.data.recommendations);
      if (alertsData.success) setAlerts(alertsData.data.alerts);
    } catch (error) {
      console.error('Failed to load store data:', error);
    }
    setIsLoading(false);
  }, []);

  const runPricingAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${STOREBOT_URL}/api/pricing/analyze`);
      const data = await res.json();
      if (data.success) {
        setRecommendations(data.data.recommendations);
      }
    } catch (error) {
      console.error('Failed to run analysis:', error);
    }
    setIsAnalyzing(false);
  };

  const applyPrice = async (productId: string, newPrice: number, reason: string) => {
    setApplyingPrice(productId);
    try {
      await fetch(`${STOREBOT_URL}/api/pricing/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, newPrice, reason }),
      });
      // Refresh data after applying
      await loadData();
    } catch (error) {
      console.error('Failed to apply price:', error);
    }
    setApplyingPrice(null);
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  // Calculate totals
  const totalProducts = products.length;
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.current_price * p.stock_quantity), 0);
  const lowStockProducts = products.filter(p => p.stock_quantity <= p.reorder_point).length;
  const avgMargin = products.length > 0
    ? products.reduce((sum, p) => sum + ((p.current_price - p.base_cost) / p.current_price), 0) / products.length * 100
    : 0;

  // Match recommendations to products
  const productRecommendations = recommendations.map(rec => {
    const product = products.find(p => p.id === rec.product_id);
    return { ...rec, product };
  });

  const actionableRecommendations = productRecommendations.filter(
    rec => Math.abs(rec.recommended_price - rec.current_price) > 1
  );

  return (
    <div className="p-8 bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Marketplace Hub</h1>
          <p className="text-gray-400 mt-1">
            AI-powered pricing optimization and inventory management
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={runPricingAnalysis}
            disabled={isAnalyzing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition flex items-center gap-2"
          >
            <Zap className={`w-4 h-4 ${isAnalyzing ? 'animate-pulse' : ''}`} />
            {isAnalyzing ? 'Analyzing...' : 'Run AI Analysis'}
          </button>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-gray-400 text-sm">Total Products</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalProducts}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-gray-400 text-sm">Inventory Value</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(totalInventoryValue)}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Target className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-gray-400 text-sm">Avg Margin</span>
          </div>
          <p className="text-2xl font-bold text-purple-400">{avgMargin.toFixed(1)}%</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 ${lowStockProducts > 0 ? 'bg-yellow-500/20' : 'bg-gray-500/20'} rounded-lg`}>
              <AlertTriangle className={`w-5 h-5 ${lowStockProducts > 0 ? 'text-yellow-400' : 'text-gray-400'}`} />
            </div>
            <span className="text-gray-400 text-sm">Low Stock</span>
          </div>
          <p className={`text-2xl font-bold ${lowStockProducts > 0 ? 'text-yellow-400' : 'text-white'}`}>
            {lowStockProducts}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-gray-400 text-sm">Price Actions</span>
          </div>
          <p className="text-2xl font-bold text-cyan-400">{actionableRecommendations.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'products', label: 'Products', icon: Package },
          { id: 'pricing', label: 'Pricing AI', icon: TrendingUp },
          { id: 'inventory', label: 'Inventory', icon: Boxes },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'products' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            Product Catalog
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-800">
                  <th className="pb-3">SKU</th>
                  <th className="pb-3">Product</th>
                  <th className="pb-3">Category</th>
                  <th className="pb-3">Cost</th>
                  <th className="pb-3">Price</th>
                  <th className="pb-3">Margin</th>
                  <th className="pb-3">Stock</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {products.map((product) => {
                  const margin = ((product.current_price - product.base_cost) / product.current_price) * 100;
                  const isLowStock = product.stock_quantity <= product.reorder_point;

                  return (
                    <tr key={product.id} className="text-white">
                      <td className="py-3 font-mono text-sm text-gray-400">{product.sku}</td>
                      <td className="py-3">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-gray-500 text-xs">{product.description}</p>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-1 bg-gray-800 rounded text-sm">{product.category}</span>
                      </td>
                      <td className="py-3 text-gray-400">{formatCurrency(product.base_cost)}</td>
                      <td className="py-3 font-medium text-green-400">{formatCurrency(product.current_price)}</td>
                      <td className="py-3">
                        <span className={`${margin >= 30 ? 'text-green-400' : margin >= 20 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3">{product.stock_quantity}</td>
                      <td className="py-3">
                        {isLowStock ? (
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded flex items-center gap-1 w-fit">
                            <AlertTriangle className="w-3 h-3" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded flex items-center gap-1 w-fit">
                            <CheckCircle className="w-3 h-3" />
                            In Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'pricing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Price Recommendations */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              AI Price Recommendations
            </h2>

            <div className="space-y-4">
              {productRecommendations.map((rec) => {
                const priceDiff = rec.recommended_price - rec.current_price;
                const isIncrease = priceDiff > 0;
                const showAction = Math.abs(priceDiff) > 1;

                return (
                  <div key={rec.product_id} className="p-4 bg-gray-800 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-white font-medium">{rec.product?.name || rec.product_id}</p>
                        <p className="text-gray-500 text-xs">{rec.product?.sku}</p>
                      </div>
                      <div className={`flex items-center gap-1 px-2 py-1 rounded text-sm ${
                        isIncrease ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {isIncrease ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(priceDiff).toFixed(2)}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-gray-500 text-xs">Current</p>
                        <p className="text-white font-medium">{formatCurrency(rec.current_price)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Recommended</p>
                        <p className={`font-medium ${isIncrease ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(rec.recommended_price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Proj. Margin</p>
                        <p className="text-purple-400 font-medium">{rec.projected_margin}%</p>
                      </div>
                    </div>

                    <p className="text-gray-400 text-sm mb-3">{rec.reason}</p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${rec.confidence}%` }}
                          />
                        </div>
                        <span className="text-gray-500 text-xs">{rec.confidence}% confidence</span>
                      </div>

                      {showAction && (
                        <button
                          onClick={() => applyPrice(rec.product_id, rec.recommended_price, rec.reason)}
                          disabled={applyingPrice === rec.product_id}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white text-sm rounded-lg transition flex items-center gap-1"
                        >
                          {applyingPrice === rec.product_id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          Apply
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pricing Rules */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              Active Pricing Rules
            </h2>

            <div className="space-y-3">
              {[
                { name: 'Target Margin Rule', type: 'margin', status: 'active', description: 'Maintains 35% target profit margin' },
                { name: 'Inventory Management', type: 'inventory', status: 'active', description: 'Adjusts prices based on stock levels' },
                { name: 'Demand Pricing', type: 'demand', status: 'active', description: 'Responds to market demand signals' },
                { name: 'Time-Based Pricing', type: 'time_based', status: 'active', description: 'Seasonal and time-of-day adjustments' },
              ].map((rule, idx) => (
                <div key={idx} className="p-4 bg-gray-800 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Tag className="w-4 h-4 text-gray-400" />
                      <p className="text-white font-medium">{rule.name}</p>
                    </div>
                    <p className="text-gray-500 text-sm">{rule.description}</p>
                  </div>
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                    Active
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inventory Alerts */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Inventory Alerts
            </h2>

            {alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No inventory alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div key={alert.id} className={`p-4 rounded-lg border ${
                    alert.severity === 'HIGH' 
                      ? 'bg-red-500/10 border-red-500/30' 
                      : alert.severity === 'MEDIUM'
                      ? 'bg-yellow-500/10 border-yellow-500/30'
                      : 'bg-blue-500/10 border-blue-500/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        alert.severity === 'HIGH' 
                          ? 'bg-red-500/20 text-red-400' 
                          : alert.severity === 'MEDIUM'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {alert.severity}
                      </span>
                      <span className="text-gray-400 text-xs">{alert.alertType}</span>
                    </div>
                    <p className="text-white font-medium">{alert.title}</p>
                    <p className="text-gray-400 text-sm mt-1">{alert.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stock Overview */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Boxes className="w-5 h-5 text-purple-400" />
              Stock Overview
            </h2>

            <div className="space-y-4">
              {products.map((product) => {
                const stockPercent = Math.min((product.stock_quantity / (product.reorder_point * 3)) * 100, 100);
                const isLow = product.stock_quantity <= product.reorder_point;
                const isOut = product.stock_quantity === 0;

                return (
                  <div key={product.id} className="p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-white font-medium text-sm">{product.name}</p>
                        <p className="text-gray-500 text-xs">{product.sku}</p>
                      </div>
                      <span className={`text-sm font-medium ${
                        isOut ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {product.stock_quantity} units
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          isOut ? 'bg-red-500' : isLow ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${stockPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-gray-500">
                      <span>Reorder at: {product.reorder_point}</span>
                      <span>Range: {formatCurrency(product.min_price)} - {formatCurrency(product.max_price)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
