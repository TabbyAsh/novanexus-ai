'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Lightbulb,
  Sparkles,
  Plus,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Clock,
  X,
  AlertCircle,
  Play,
  Zap,
} from 'lucide-react';

interface Thesis {
  id: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  confidence: number;
  thesisText: string;
  reasoning: string[];
  aiGenerated: boolean;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export default function ThesisPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedThesis, setSelectedThesis] = useState<Thesis | null>(null);

  const [generateSymbol, setGenerateSymbol] = useState('');
  const [formData, setFormData] = useState({
    symbol: '',
    direction: 'LONG',
    entryPrice: '',
    targetPrice: '',
    stopLoss: '',
    thesisText: '',
    reasoning: '',
  });

  useEffect(() => {
    loadTheses();
  }, []);

  const loadTheses = async () => {
    setIsLoading(true);
    try {
      const result = await api.getTradeIdeas();
      if (result.success && result.data) {
        setTheses((result.data.theses || []) as Thesis[]);
      } else {
        setTheses([]);
      }
    } catch {
      setTheses([]);
    }
    setIsLoading(false);
  };

  const handleAIGenerate = async () => {
    if (!generateSymbol) return;
    setIsGenerating(true);
    setError(null);

    try {
      const result = await api.generateThesis(generateSymbol.toUpperCase());

      if (result.success && result.data) {
        loadTheses();
        setGenerateSymbol('');
        setSelectedThesis((result.data as any).thesis ?? null);
      } else {
        setError(result.error?.message || 'Failed to generate thesis');
      }
    } catch (err) {
      setError('Failed to generate thesis');
    }
    setIsGenerating(false);
  };

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const result = await api.createTradeIdea({
        symbol: formData.symbol,
        direction: formData.direction as 'LONG' | 'SHORT',
        entryPrice: parseFloat(formData.entryPrice),
        targetPrice: formData.targetPrice ? parseFloat(formData.targetPrice) : undefined,
        stopLoss: formData.stopLoss ? parseFloat(formData.stopLoss) : undefined,
        thesisText: formData.thesisText,
        reasoning: formData.reasoning.split('\n').filter(r => r.trim()),
      });

      if (result.success) {
        setShowForm(false);
        loadTheses();
        setFormData({ symbol: '', direction: 'LONG', entryPrice: '', targetPrice: '', stopLoss: '', thesisText: '', reasoning: '' });
      } else {
        setError(result.error?.message || 'Failed to create thesis');
      }
    } catch (err) {
      setError('Failed to create thesis');
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Trade Ideas</h1>
          <p className="text-gray-400 mt-1">Generate and manage your trading theses</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Manual Thesis
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* AI Generator */}
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-xl p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-500/20 rounded-xl">
            <Sparkles className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white mb-1">AI Thesis Generator</h2>
            <p className="text-gray-400 text-sm mb-4">
              Enter a symbol and let AI analyze market data to generate a trade thesis with entry, target, and stop-loss recommendations.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={generateSymbol}
                onChange={(e) => setGenerateSymbol(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter symbol (e.g., AAPL, TSLA)"
              />
              <button
                onClick={handleAIGenerate}
                disabled={isGenerating || !generateSymbol}
                className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white font-medium rounded-lg transition"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Theses Grid */}
      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : theses.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lightbulb className="w-8 h-8 text-gray-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No Trade Ideas Yet</h3>
          <p className="text-gray-400 mb-4">Generate an AI thesis or create one manually to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {theses.map(thesis => (
            <div
              key={thesis.id}
              onClick={() => setSelectedThesis(thesis)}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 cursor-pointer hover:border-gray-700 transition"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">{thesis.symbol}</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                    thesis.direction === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {thesis.direction}
                  </span>
                </div>
                {thesis.aiGenerated && (
                  <span className="flex items-center gap-1 text-xs text-purple-400">
                    <Sparkles className="w-3 h-3" />
                    AI
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-400 line-clamp-2 mb-4">{thesis.thesisText}</p>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-gray-500">Entry</div>
                  <div className="text-white font-medium">${thesis.entryPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Target</div>
                  <div className="text-green-400 font-medium">${thesis.targetPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Stop</div>
                  <div className="text-red-400 font-medium">${thesis.stopLoss.toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`px-2 py-0.5 text-xs rounded ${
                    thesis.confidence >= 70 ? 'bg-green-500/20 text-green-400' :
                    thesis.confidence >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {thesis.confidence}% conf
                  </div>
                  <div className="text-xs text-gray-500">R/R: {thesis.riskRewardRatio.toFixed(1)}</div>
                </div>
                <div className="text-xs text-gray-500">{formatDate(thesis.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Thesis Detail Modal */}
      {selectedThesis && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-white">{selectedThesis.symbol}</span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                  selectedThesis.direction === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {selectedThesis.direction}
                </span>
                {selectedThesis.aiGenerated && (
                  <span className="flex items-center gap-1 text-xs text-purple-400">
                    <Sparkles className="w-3 h-3" />
                    AI Generated
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedThesis(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Entry</div>
                  <div className="text-lg font-bold text-white">${selectedThesis.entryPrice.toFixed(2)}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Target</div>
                  <div className="text-lg font-bold text-green-400">${selectedThesis.targetPrice.toFixed(2)}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Stop Loss</div>
                  <div className="text-lg font-bold text-red-400">${selectedThesis.stopLoss.toFixed(2)}</div>
                </div>
              </div>

              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-400" />
                  <span className="text-gray-400">Confidence:</span>
                  <span className="text-white font-medium">{selectedThesis.confidence}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  <span className="text-gray-400">R/R:</span>
                  <span className="text-white font-medium">{selectedThesis.riskRewardRatio.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Thesis</h4>
                <p className="text-gray-400 text-sm">{selectedThesis.thesisText}</p>
              </div>

              {selectedThesis.reasoning.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Reasoning</h4>
                  <ul className="space-y-1">
                    {selectedThesis.reasoning.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                        <span className="text-blue-400 mt-0.5">•</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-400/80">
                  <strong>Disclaimer:</strong> This is for educational purposes only. Not financial advice. Do your own research before trading.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setSelectedThesis(null)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
                >
                  Close
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
                  <Play className="w-4 h-4" />
                  Execute Paper Trade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Create Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Create Trade Thesis</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
                  <input
                    type="text"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Direction</label>
                  <select
                    value={formData.direction}
                    onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="LONG">Long</option>
                    <option value="SHORT">Short</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Entry Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.entryPrice}
                    onChange={(e) => setFormData({ ...formData, entryPrice: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Target</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.targetPrice}
                    onChange={(e) => setFormData({ ...formData, targetPrice: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Stop Loss</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.stopLoss}
                    onChange={(e) => setFormData({ ...formData, stopLoss: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Thesis</label>
                <textarea
                  value={formData.thesisText}
                  onChange={(e) => setFormData({ ...formData, thesisText: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  placeholder="Describe your trade thesis..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Reasoning (one per line)</label>
                <textarea
                  value={formData.reasoning}
                  onChange={(e) => setFormData({ ...formData, reasoning: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  placeholder="Key reasons supporting your thesis..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  Create Thesis
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
