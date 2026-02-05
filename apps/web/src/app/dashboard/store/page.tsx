'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Archive,
  CheckCircle,
} from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  title: string;
  status: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface InventoryAlert {
  id: string;
  productId: string;
  sku: string;
  title: string;
  alertType: string;
  message: string;
  severity: string;
  createdAt: string;
}

interface PricingRecommendation {
  id: string;
  productId: string;
  sku: string;
  title: string;
  currentPrice: number;
  recommendedPrice: number;
  reason: string;
  confidence: number;
  createdAt: string;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'ACTIVE': return 'text-green-400 bg-green-500/20';
    case 'DRAFT': return 'text-gray-400 bg-gray-500/20';
    case 'OUT_OF_STOCK': return 'text-red-400 bg-red-500/20';
    case 'ARCHIVED': return 'text-gray-500 bg-gray-600/20';
    default: return 'text-gray-400 bg-gray-500/20';
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'HIGH': return 'text-red-400 bg-red-500/20 border-red-500/30';
    case 'MEDIUM': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    case 'LOW': return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
  }
}

export default function StorePage() {
  const [activeTab, setActiveTab] = useState<'products' | 'alerts' | 'pricing'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [recommendations, setRecommendations] = useState<PricingRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    const result = await api.getProducts();
    if (result.success && result.data?.products) {
      setProducts(result.data.products);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    const result = await api.getInventoryAlerts();
    if (result.success && result.data?.alerts) {
      setAlerts(result.data.alerts);
    }
  }, []);

  const loadRecommendations = useCallback(async () => {
    const result = await api.getPricingRecommendations();
    if (result.success && result.data?.recommendations) {
      setRecommendations(result.data.recommendations);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([loadProducts(), loadAlerts(), loadRecommendations()]);
    setIsLoading(false);
  }, [loadProducts, loadAlerts, loadRecommendations]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const activeProducts = products.filter(p => p.status === 'ACTIVE').length;
  const highAlerts = alerts.filter(a => a.severity === 'HIGH').length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Store</h1>
          <p className="text-gray-400 mt-1">Products, inventory alerts, and pricing recommendations</p>
        </div>
        <button
          onClick={loadAll}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{products.length}</p>
              <p className="text-sm text-gray-400">Total Products</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{activeProducts}</p>
              <p className="text-sm text-gray-400">Active</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{highAlerts}</p>
              <p className="text-sm text-gray-400">High Alerts</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <DollarSign className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-400">{recommendations.length}</p>
              <p className="text-sm text-gray-400">Price Suggestions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'products' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <Package className="w-4 h-4" />
          Products ({products.length})
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'alerts' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Alerts ({alerts.length})
        </button>
        <button
          onClick={() => setActiveTab('pricing')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'pricing' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Pricing ({recommendations.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'products' && (
        <div>
          {isLoading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              Loading products...
            </div>
          ) : products.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No products yet</p>
              <p className="text-sm mt-1">Products will appear here once added</p>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">SKU</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Title</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-sm font-mono text-gray-300">{product.sku}</td>
                      <td className="px-4 py-3 text-sm text-white">{product.title}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${getStatusColor(product.status)}`}>
                          {product.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {new Date(product.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div>
          {alerts.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No inventory alerts</p>
              <p className="text-sm mt-1">All inventory levels are healthy</p>
            </div>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-gray-900 border rounded-xl p-4 ${getSeverityColor(alert.severity)}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      alert.severity === 'HIGH' ? 'bg-red-500/20' :
                      alert.severity === 'MEDIUM' ? 'bg-yellow-500/20' :
                      'bg-blue-500/20'
                    }`}>
                      <AlertTriangle className={`w-5 h-5 ${
                        alert.severity === 'HIGH' ? 'text-red-400' :
                        alert.severity === 'MEDIUM' ? 'text-yellow-400' :
                        'text-blue-400'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{alert.title}</span>
                        <span className="text-xs text-gray-400 font-mono">({alert.sku})</span>
                      </div>
                      <p className="text-sm text-gray-300">{alert.message}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>{alert.alertType}</span>
                        <span>{new Date(alert.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'pricing' && (
        <div>
          {recommendations.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No pricing recommendations</p>
              <p className="text-sm mt-1">Recommendations will appear as market conditions change</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec) => (
                <div key={rec.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="font-medium text-white">{rec.title}</span>
                      <span className="ml-2 text-xs text-gray-400 font-mono">({rec.sku})</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">Confidence</div>
                      <div className="text-lg font-bold text-blue-400">{rec.confidence}%</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <div className="text-xs text-gray-400 mb-1">Current Price</div>
                      <div className="text-white font-medium">{formatCurrency(rec.currentPrice)}</div>
                    </div>
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <div className="text-xs text-gray-400 mb-1">Recommended</div>
                      <div className={`font-medium flex items-center gap-1 ${
                        rec.recommendedPrice > rec.currentPrice ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {rec.recommendedPrice > rec.currentPrice ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {formatCurrency(rec.recommendedPrice)}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <div className="text-xs text-gray-400 mb-1">Change</div>
                      <div className={`font-medium ${
                        rec.recommendedPrice > rec.currentPrice ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {rec.recommendedPrice > rec.currentPrice ? '+' : ''}
                        {(((rec.recommendedPrice - rec.currentPrice) / rec.currentPrice) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-800 rounded-lg">
                    <div className="text-xs text-gray-400 mb-1">Reason</div>
                    <div className="text-sm text-gray-300">{rec.reason}</div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition">
                      Apply Price
                    </button>
                    <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition">
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
