'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import {
  Search, TrendingUp, RefreshCw, ExternalLink, DollarSign,
  ArrowRight, CheckCircle, Package, Tag, Trash2, ChevronDown,
} from 'lucide-react';

// ================================================================
// Types
// ================================================================

interface SearchResult {
  title: string;
  price: number;
  currency: string;
  source: string;
  url: string;
  imageUrl?: string;
  condition?: string;
  scrapedAt: string;
}

interface Appraisal {
  query: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  priceRange: string;
  recommendedBuyPrice: number;
  recommendedSellPrice: number;
  estimatedProfit: number;
  estimatedProfitPercent: number;
  platformFees: number;
  shippingEstimate: number;
  marketDemand: 'low' | 'medium' | 'high';
  confidence: number;
  flipVerdict: 'strong-buy' | 'buy' | 'hold' | 'pass';
  flipExplanation: string;
  sources: SearchResult[];
  provenance: { method: string; sourceCount?: number; category?: string; note: string };
}

type PipelineStage = 'candidate' | 'verified' | 'acquired' | 'listed' | 'sold';
interface PipelineItem {
  id: string;
  name: string;
  buyPrice: number;
  sellPrice: number | null;
  stage: PipelineStage;
  addedAt: string;
  notes: string;
}

type Tab = 'find' | 'appraise' | 'pipeline';

const STAGES: { id: PipelineStage; label: string; icon: string; color: string }[] = [
  { id: 'candidate', label: 'Candidate', icon: '🔍', color: 'text-blue-400 bg-blue-500/20' },
  { id: 'verified', label: 'Verified', icon: '✅', color: 'text-green-400 bg-green-500/20' },
  { id: 'acquired', label: 'Acquired', icon: '📦', color: 'text-yellow-400 bg-yellow-500/20' },
  { id: 'listed', label: 'Listed', icon: '🏷️', color: 'text-purple-400 bg-purple-500/20' },
  { id: 'sold', label: 'Sold', icon: '💰', color: 'text-emerald-400 bg-emerald-500/20' },
];

const VERDICT_STYLES: Record<string, string> = {
  'strong-buy': 'bg-green-500/20 text-green-300 border-green-500/40',
  buy: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  hold: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  pass: 'bg-red-500/20 text-red-300 border-red-500/40',
};

// Pipeline localStorage helpers
function loadPipeline(): PipelineItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('nova_flip_pipeline') || '[]'); } catch { return []; }
}
function savePipeline(items: PipelineItem[]) {
  if (typeof window !== 'undefined') localStorage.setItem('nova_flip_pipeline', JSON.stringify(items));
}

// ================================================================
// Component
// ================================================================

export default function MarketplaceDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('find');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Appraise
  const [appraisalQuery, setAppraisalQuery] = useState('');
  const [appraisal, setAppraisal] = useState<Appraisal | null>(null);
  const [isAppraising, setIsAppraising] = useState(false);

  // Trending
  const [trending, setTrending] = useState<Array<{ category: string; icon: string; avgPrice: number; demand: string; examples: string[] }>>([]);

  // Pipeline
  const [pipeline, setPipeline] = useState<PipelineItem[]>([]);

  // Load pipeline + trending on mount
  useEffect(() => {
    setPipeline(loadPipeline());
    (async () => {
      try {
        const res = await api.getMarketplaceTrending();
        if (res.success && res.data?.categories) setTrending(res.data.categories);
      } catch { /* ok */ }
    })();
  }, []);

  // Search handler
  const handleSearch = useCallback(async (q?: string) => {
    const query = q || searchQuery;
    if (!query.trim()) return;
    if (q) setSearchQuery(q);
    setIsSearching(true);
    try {
      const res = await api.searchMarketplace(query);
      if (res.success && res.data?.products) setSearchResults(res.data.products);
      else setSearchResults([]);
    } catch { setSearchResults([]); }
    finally { setIsSearching(false); }
  }, [searchQuery]);

  // Appraise handler
  const handleAppraise = useCallback(async (q?: string) => {
    const query = q || appraisalQuery;
    if (!query.trim()) return;
    if (q) setAppraisalQuery(q);
    setIsAppraising(true);
    setAppraisal(null);
    try {
      const res = await api.appraiseProduct(query);
      if (res.success && res.data?.appraisal) setAppraisal(res.data.appraisal as unknown as Appraisal);
    } catch { /* ok */ }
    finally { setIsAppraising(false); }
  }, [appraisalQuery]);

  // Quick appraise from search result
  const quickAppraise = (title: string) => {
    setAppraisalQuery(title);
    setActiveTab('appraise');
    handleAppraise(title);
  };

  // Pipeline helpers
  const addToPipeline = (name: string, buyPrice: number) => {
    const item: PipelineItem = { id: Date.now().toString(), name, buyPrice, sellPrice: null, stage: 'candidate', addedAt: new Date().toISOString(), notes: '' };
    const updated = [item, ...pipeline];
    setPipeline(updated);
    savePipeline(updated);
  };
  const updateStage = (id: string, stage: PipelineStage) => {
    const updated = pipeline.map(p => p.id === id ? { ...p, stage } : p);
    setPipeline(updated);
    savePipeline(updated);
  };
  const removePipelineItem = (id: string) => {
    const updated = pipeline.filter(p => p.id !== id);
    setPipeline(updated);
    savePipeline(updated);
  };

  const pipelineTotalInvested = pipeline.filter(p => p.stage === 'acquired' || p.stage === 'listed').reduce((s, p) => s + p.buyPrice, 0);
  const pipelineSoldProfit = pipeline.filter(p => p.stage === 'sold' && p.sellPrice).reduce((s, p) => s + ((p.sellPrice || 0) - p.buyPrice), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Marketplace <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">Flip Hub</span></h1>
            <p className="text-gray-400 mt-1">Find underpriced items → Appraise → Calculate flip profit → Track your pipeline</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {([
            { id: 'find' as Tab, label: 'Find & Search', icon: Search },
            { id: 'appraise' as Tab, label: 'Appraise & Flip', icon: DollarSign },
            { id: 'pipeline' as Tab, label: `Pipeline (${pipeline.length})`, icon: Package },
          ]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === tab.id ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* ========== FIND TAB ========== */}
        {activeTab === 'find' && (
          <div className="space-y-6">
            {/* Search Bar */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Search className="w-5 h-5 text-cyan-400" /> Live eBay Search
              </h2>
              <p className="text-gray-400 text-sm mb-4">Search real-time Buy It Now listings. Find underpriced items to flip.</p>
              <div className="flex gap-3">
                <input type="text" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g. iPhone 15 Pro Max, Nintendo Switch, Jordan 4 Retro..."
                  className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
                <button onClick={() => handleSearch()} disabled={isSearching || !searchQuery.trim()}
                  className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-600/50 text-white rounded-lg transition flex items-center gap-2">
                  {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {isSearching ? 'Searching...' : 'Search eBay'}
                </button>
              </div>
            </div>

            {/* Results */}
            {searchResults.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-white font-semibold mb-4">{searchResults.length} Listings Found</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResults.map((product, idx) => (
                    <div key={idx} className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-cyan-500/30 transition">
                      <p className="text-white font-medium text-sm line-clamp-2 mb-2">{product.title}</p>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-green-400 font-bold text-lg">${(product.price ?? 0).toFixed(2)}</span>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="capitalize">{product.source}</span>
                          {product.condition && <span className="px-1.5 py-0.5 bg-gray-700 rounded">{product.condition}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => quickAppraise(product.title)}
                          className="flex-1 py-2 bg-pink-600/80 hover:bg-pink-600 text-white text-xs rounded-lg transition flex items-center justify-center gap-1">
                          <DollarSign className="w-3 h-3" /> Appraise
                        </button>
                        <button onClick={() => addToPipeline(product.title, product.price)}
                          className="flex-1 py-2 bg-blue-600/80 hover:bg-blue-600 text-white text-xs rounded-lg transition flex items-center justify-center gap-1">
                          <Package className="w-3 h-3" /> Add to Pipeline
                        </button>
                        <a href={product.url} target="_blank" rel="noopener noreferrer"
                          className="py-2 px-3 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trending */}
            {trending.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-400" /> Trending Flip Categories
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {trending.map(cat => (
                    <button key={cat.category} onClick={() => handleSearch(cat.examples[0] || cat.category)}
                      className="bg-gray-800 hover:bg-gray-700/80 border border-gray-700 hover:border-purple-500/30 rounded-xl p-4 text-left transition">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{cat.icon}</span>
                        <span className="text-white font-medium">{cat.category}</span>
                      </div>
                      <p className="text-green-400 font-bold">${(cat.avgPrice ?? 0).toFixed(0)} avg</p>
                      <p className="text-gray-500 text-xs mt-1 capitalize">{cat.demand} demand</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== APPRAISE TAB ========== */}
        {activeTab === 'appraise' && (
          <div className="space-y-6">
            {/* Appraisal Input */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-pink-400" /> Flip Appraisal Engine
              </h2>
              <p className="text-gray-400 text-sm mb-4">Enter any product — get real market comps, flip profit estimate, and a buy/pass verdict.</p>
              <div className="flex gap-3">
                <input type="text" value={appraisalQuery}
                  onChange={e => setAppraisalQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAppraise()}
                  placeholder="e.g. PS5 Digital Edition, MacBook Air M2, Air Jordan 4..."
                  className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500" />
                <button onClick={() => handleAppraise()} disabled={isAppraising || !appraisalQuery.trim()}
                  className="px-6 py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-600/50 text-white rounded-lg transition flex items-center gap-2">
                  {isAppraising ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  {isAppraising ? 'Analyzing...' : 'Appraise'}
                </button>
              </div>
            </div>

            {/* Appraisal Results */}
            {appraisal && (
              <div className="space-y-4">
                {/* Verdict Banner */}
                <div className={`p-5 rounded-xl border ${VERDICT_STYLES[appraisal.flipVerdict] || VERDICT_STYLES.hold}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white">{appraisal.query}</h3>
                      <p className="text-sm mt-1 opacity-80">{appraisal.provenance?.note ?? ''}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-bold px-4 py-2 rounded-xl border ${VERDICT_STYLES[appraisal.flipVerdict] || ''}`}>
                        {(appraisal.flipVerdict ?? 'hold').toUpperCase().replace('-', ' ')}
                      </span>
                      <p className="text-xs mt-2 text-gray-400">{appraisal.confidence ?? 0}% confidence</p>
                    </div>
                  </div>
                </div>

                {/* Flip Economics */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Buy At', value: `$${(appraisal.recommendedBuyPrice ?? 0).toFixed(2)}`, color: 'text-cyan-400', sub: '25th percentile' },
                    { label: 'Sell At', value: `$${(appraisal.recommendedSellPrice ?? 0).toFixed(2)}`, color: 'text-green-400', sub: '75th percentile' },
                    { label: 'Est. Profit', value: `$${(appraisal.estimatedProfit ?? 0).toFixed(2)}`, color: (appraisal.estimatedProfit ?? 0) > 0 ? 'text-green-400' : 'text-red-400', sub: `${appraisal.estimatedProfitPercent ?? 0}% ROI` },
                    { label: 'eBay Fees', value: `$${(appraisal.platformFees ?? 0).toFixed(2)}`, color: 'text-orange-400', sub: '~13% FVF' },
                    { label: 'Shipping', value: `$${(appraisal.shippingEstimate ?? 0).toFixed(2)}`, color: 'text-gray-400', sub: 'estimated' },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                      <p className="text-gray-500 text-xs mb-1">{s.label}</p>
                      <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-gray-600 text-xs mt-1">{s.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Explanation */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h4 className="text-white font-medium mb-2">Flip Analysis</h4>
                  <p className="text-gray-300 text-sm leading-relaxed">{appraisal.flipExplanation}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`px-2 py-1 rounded text-xs ${appraisal.marketDemand === 'high' ? 'bg-green-500/20 text-green-400' : appraisal.marketDemand === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                      {appraisal.marketDemand ?? 'unknown'} demand
                    </span>
                    <span className="text-xs text-gray-500">Range: {appraisal.priceRange ?? 'N/A'}</span>
                    <span className="text-xs text-gray-500">Method: {appraisal.provenance?.method ?? 'unknown'}</span>
                  </div>
                </div>

                {/* Comparable Listings */}
                {(appraisal.sources?.length ?? 0) > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h4 className="text-white font-medium mb-3">Comparable Listings ({appraisal.sources?.length ?? 0})</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(appraisal.sources ?? []).map((src, i) => (
                        <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700/80 transition">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{src.title}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                              <span className="capitalize">{src.source}</span>
                              {src.condition && <span className="px-1 py-0.5 bg-gray-700 rounded">{src.condition}</span>}
                            </div>
                          </div>
                          <span className="text-green-400 font-bold ml-4">${(src.price ?? 0).toFixed(2)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add to Pipeline */}
                <button onClick={() => addToPipeline(appraisal.query, appraisal.recommendedBuyPrice ?? 0)}
                  className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-pink-500/20 transition flex items-center justify-center gap-2">
                  <Package className="w-5 h-5" /> Add to Flip Pipeline
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========== PIPELINE TAB ========== */}
        {activeTab === 'pipeline' && (
          <div className="space-y-6">
            {/* Pipeline Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-gray-500 text-xs">Active Items</p>
                <p className="text-2xl font-bold text-white">{pipeline.length}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-gray-500 text-xs">Total Invested</p>
                <p className="text-2xl font-bold text-yellow-400">${pipelineTotalInvested.toFixed(0)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-gray-500 text-xs">Realized Profit</p>
                <p className={`text-2xl font-bold ${pipelineSoldProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${pipelineSoldProfit.toFixed(0)}</p>
              </div>
            </div>

            {/* Pipeline Items */}
            {pipeline.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">No items in your flip pipeline yet.</p>
                <p className="text-gray-500 text-sm mt-1">Search for products and add them to start tracking your flips.</p>
                <button onClick={() => setActiveTab('find')} className="mt-4 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition">
                  Start Finding Items
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {pipeline.map(item => (
                  <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="text-white font-medium">{item.name}</h4>
                        <div className="flex items-center gap-3 mt-1 text-sm">
                          <span className="text-cyan-400">Buy: ${(item.buyPrice ?? 0).toFixed(2)}</span>
                          {item.sellPrice != null && <span className="text-green-400">Sell: ${(item.sellPrice ?? 0).toFixed(2)}</span>}
                          <span className="text-gray-500">{new Date(item.addedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Stage selector */}
                        <div className="relative">
                          <select
                            value={item.stage}
                            onChange={e => updateStage(item.id, e.target.value as PipelineStage)}
                            className="appearance-none pl-3 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm cursor-pointer focus:outline-none focus:border-pink-500"
                          >
                            {STAGES.map(s => (
                              <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                        </div>
                        {/* Appraise button */}
                        <button onClick={() => quickAppraise(item.name)}
                          className="p-2 bg-pink-600/50 hover:bg-pink-600 text-white rounded-lg transition" title="Appraise">
                          <DollarSign className="w-4 h-4" />
                        </button>
                        {/* Remove */}
                        <button onClick={() => removePipelineItem(item.id)}
                          className="p-2 bg-red-600/30 hover:bg-red-600/60 text-red-400 rounded-lg transition" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {/* Stage progress bar */}
                    <div className="flex items-center gap-1 mt-3">
                      {STAGES.map((s, i) => {
                        const stageIdx = STAGES.findIndex(st => st.id === item.stage);
                        const isActive = i <= stageIdx;
                        return (
                          <div key={s.id} className="flex-1 flex items-center gap-1">
                            <div className={`h-1.5 flex-1 rounded-full ${isActive ? 'bg-pink-500' : 'bg-gray-800'}`} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
