'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import {
  ShoppingCart, Package, AlertTriangle, DollarSign, RefreshCw,
  TrendingUp, Download, Sparkles, Tag, Trash2, Eye, ExternalLink,
  Layers, ChevronDown, CheckCircle, Zap,
} from 'lucide-react';

// ================================================================
// Types
// ================================================================

interface DropshipDraft {
  id: string;
  productIdea: string;
  title: string;
  description: string;
  category: string;
  suggestedPrice: number;
  priceRange: { min: number; max: number };
  imageRequirements: string[];
  keywords: string[];
  targetMarketplace: string;
  profitMargin: number;
  confidence: number;
  createdAt: string;
}

interface DraftSummary {
  id: string;
  productIdea: string;
  title: string;
  category: string;
  suggestedPrice: number;
  profitMargin: number;
  confidence: number;
  createdAt: string;
}

type Tab = 'generate' | 'drafts';

// ================================================================
// Component
// ================================================================

export default function StorePage() {
  const [activeTab, setActiveTab] = useState<Tab>('generate');

  // Generator
  const [productIdea, setProductIdea] = useState('');
  const [niche, setNiche] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<DropshipDraft | null>(null);

  // Drafts
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<DropshipDraft | null>(null);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);

  // Export
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  // Load drafts on mount
  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    setIsLoadingDrafts(true);
    try {
      const res = await api.getDropshipDrafts();
      if (res.success && res.data?.drafts) setDrafts(res.data.drafts);
    } catch { /* ok */ }
    finally { setIsLoadingDrafts(false); }
  };

  // Generate listing
  const handleGenerate = async () => {
    if (!productIdea.trim()) return;
    setIsGenerating(true);
    setGeneratedDraft(null);
    try {
      const res = await api.generateDropshipListing({
        productIdea: productIdea.trim(),
        niche: niche.trim() || undefined,
      });
      if (res.success && res.data?.draft) {
        setGeneratedDraft(res.data.draft as DropshipDraft);
        // Refresh drafts
        await loadDrafts();
      }
    } catch { /* ok */ }
    finally { setIsGenerating(false); }
  };

  // View full draft
  const handleViewDraft = async (draftId: string) => {
    try {
      const res = await api.getDropshipDraft(draftId);
      if (res.success && res.data?.draft) {
        setSelectedDraft(res.data.draft as DropshipDraft);
        setActiveTab('generate'); // Show in the detail view
      }
    } catch { /* ok */ }
  };

  // Export single draft
  const handleExportDraft = async (draftId: string) => {
    setIsExporting(true);
    setExportMsg('');
    try {
      const res = await api.exportDropshipDraft(draftId);
      if (res.success && res.data?.csv) {
        downloadCSV(res.data.csv, `dropship-${draftId}.csv`);
        setExportMsg('CSV downloaded!');
      } else { setExportMsg('Export failed'); }
    } catch { setExportMsg('Export failed'); }
    finally { setIsExporting(false); }
  };

  // Export all drafts
  const handleExportAll = async () => {
    setIsExporting(true);
    setExportMsg('');
    try {
      const res = await api.exportAllDropshipDrafts();
      if (res.success && res.data?.csv) {
        downloadCSV(res.data.csv, 'all-dropship-drafts.csv');
        setExportMsg(`Exported ${res.data.count} drafts!`);
      } else { setExportMsg('Export failed'); }
    } catch { setExportMsg('Export failed'); }
    finally { setIsExporting(false); }
  };

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const displayDraft = generatedDraft || selectedDraft;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Dropship <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">Lab</span></h1>
            <p className="text-gray-400 mt-1">Generate product listings → Optimize titles & descriptions → Export to marketplace CSV</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {([
            { id: 'generate' as Tab, label: 'Generate Listing', icon: Sparkles },
            { id: 'drafts' as Tab, label: `My Drafts (${drafts.length})`, icon: Layers },
          ]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === tab.id ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* ========== GENERATE TAB ========== */}
        {activeTab === 'generate' && (
          <div className="space-y-6">
            {/* Generator Form */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-400" /> AI Listing Generator
              </h2>
              <p className="text-gray-400 text-sm mb-5">Describe a product idea — Nova generates an optimized marketplace listing with title, description, pricing, keywords, and image requirements.</p>

              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Product Idea *</label>
                  <input type="text" value={productIdea} onChange={e => setProductIdea(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                    placeholder="e.g. Ergonomic laptop stand, LED ring light, Phone grip holder..."
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Niche / Category (optional)</label>
                  <input type="text" value={niche} onChange={e => setNiche(e.target.value)}
                    placeholder="e.g. Tech accessories, Home office, Fitness..."
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
              </div>

              <button onClick={handleGenerate} disabled={isGenerating || !productIdea.trim()}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-orange-500/20 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                {isGenerating ? 'Generating Listing...' : 'Generate Listing'}
              </button>
            </div>

            {/* Generated / Selected Draft Display */}
            {displayDraft && (
              <div className="space-y-4">
                {/* Title & Meta */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white">{displayDraft.title}</h3>
                      <div className="flex items-center gap-3 mt-2 text-sm">
                        <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded">{displayDraft.category}</span>
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded">{displayDraft.targetMarketplace}</span>
                        <span className="text-gray-500">{displayDraft.confidence}% confidence</span>
                      </div>
                    </div>
                    <button onClick={() => handleExportDraft(displayDraft.id)} disabled={isExporting}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition flex items-center gap-2 text-sm">
                      <Download className="w-4 h-4" /> Export CSV
                    </button>
                  </div>
                  {exportMsg && <p className="text-sm text-green-400 mb-3">{exportMsg}</p>}

                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{displayDraft.description}</p>
                </div>

                {/* Pricing & Profit */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-gray-500 text-xs mb-1">Suggested Price</p>
                    <p className="text-xl font-bold text-green-400">${displayDraft.suggestedPrice.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-gray-500 text-xs mb-1">Price Range</p>
                    <p className="text-xl font-bold text-white">${displayDraft.priceRange.min} - ${displayDraft.priceRange.max}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-gray-500 text-xs mb-1">Profit Margin</p>
                    <p className={`text-xl font-bold ${displayDraft.profitMargin > 30 ? 'text-green-400' : displayDraft.profitMargin > 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {displayDraft.profitMargin}%
                    </p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-gray-500 text-xs mb-1">Confidence</p>
                    <p className="text-xl font-bold text-blue-400">{displayDraft.confidence}%</p>
                  </div>
                </div>

                {/* Keywords */}
                {displayDraft.keywords.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-orange-400" /> SEO Keywords
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {displayDraft.keywords.map((kw, i) => (
                        <span key={i} className="px-3 py-1 bg-orange-500/20 text-orange-300 rounded-full text-sm">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Image Requirements */}
                {displayDraft.imageRequirements.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-cyan-400" /> Image Requirements
                    </h4>
                    <ul className="space-y-1">
                      {displayDraft.imageRequirements.map((req, i) => (
                        <li key={i} className="text-gray-300 text-sm flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========== DRAFTS TAB ========== */}
        {activeTab === 'drafts' && (
          <div className="space-y-4">
            {/* Export All */}
            {drafts.length > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-sm">{drafts.length} saved draft{drafts.length !== 1 ? 's' : ''}</p>
                <button onClick={handleExportAll} disabled={isExporting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4" /> {isExporting ? 'Exporting...' : 'Export All as CSV'}
                </button>
              </div>
            )}
            {exportMsg && <p className="text-sm text-green-400">{exportMsg}</p>}

            {isLoadingDrafts ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
                Loading drafts...
              </div>
            ) : drafts.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">No dropship drafts yet.</p>
                <p className="text-gray-500 text-sm mt-1">Generate your first product listing to get started.</p>
                <button onClick={() => setActiveTab('generate')} className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition">
                  Generate First Listing
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {drafts.map(draft => (
                  <div key={draft.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-orange-500/20 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="text-white font-medium">{draft.title}</h4>
                        <div className="flex items-center gap-3 mt-1 text-sm">
                          <span className="px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded text-xs">{draft.category}</span>
                          <span className="text-green-400 font-medium">${draft.suggestedPrice.toFixed(2)}</span>
                          <span className={`text-xs ${draft.profitMargin > 30 ? 'text-green-400' : draft.profitMargin > 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {draft.profitMargin}% margin
                          </span>
                          <span className="text-gray-500 text-xs">{new Date(draft.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleViewDraft(draft.id)}
                          className="px-3 py-1.5 bg-orange-600/50 hover:bg-orange-600 text-white text-xs rounded-lg transition flex items-center gap-1">
                          <Eye className="w-3 h-3" /> View
                        </button>
                        <button onClick={() => handleExportDraft(draft.id)}
                          className="px-3 py-1.5 bg-green-600/50 hover:bg-green-600 text-white text-xs rounded-lg transition flex items-center gap-1">
                          <Download className="w-3 h-3" /> CSV
                        </button>
                      </div>
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
