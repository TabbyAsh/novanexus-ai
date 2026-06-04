'use client';

/**
 * Custom Indicators — user-defined screener filters.
 * Set your own price range, volume, RSI bounds, and confidence threshold.
 * Nova's screener uses these when finding setups for you.
 */

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Sliders, Save, RefreshCw, CheckCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';
}

interface Filters {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  minRsi: number;
  maxRsi: number;
  minConfidence: number;
  signalTypes: string[];
}

const DEFAULTS: Filters = {
  minPrice: 0.50, maxPrice: 20.00, minVolume: 500000,
  minRsi: 30, maxRsi: 70, minConfidence: 60, signalTypes: ['bullish'],
};

export default function CustomIndicatorsPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API}/v1/screener/my-filters`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => { if (d.success && d.data?.filters) setFilters(d.data.filters); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch(`${API}/v1/screener/my-filters`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      const d = await r.json();
      if (d.success) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    } catch { /* */ } finally { setSaving(false); }
  };

  const set = (key: keyof Filters, val: number | string[]) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  const toggleType = (type: string) =>
    setFilters((prev) => ({
      ...prev,
      signalTypes: prev.signalTypes.includes(type)
        ? prev.signalTypes.filter(t => t !== type)
        : [...prev.signalTypes, type],
    }));

  if (loading) return (
    <DashboardLayout>
      <div className="flex justify-center py-20">
        <RefreshCw className="w-7 h-7 text-violet-400 animate-spin" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Sliders className="w-6 h-6 text-violet-400" /> Custom Indicators
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Nova&apos;s screener uses these filters when finding setups for your daily alerts and screener runs.
            </p>
          </div>
        </div>

        <div className="space-y-5 rounded-xl border border-gray-800 bg-gray-900/50 p-6">

          {/* Price range */}
          <FilterRow label="Price Range" hint="Stocks must trade within this price range">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-600 mb-1 block">Min $</label>
                <input type="number" step="0.01" value={filters.minPrice}
                  onChange={e => set('minPrice', parseFloat(e.target.value) || 0)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-violet-500/60" />
              </div>
              <span className="text-gray-600 mt-4">—</span>
              <div className="flex-1">
                <label className="text-xs text-gray-600 mb-1 block">Max $</label>
                <input type="number" step="0.01" value={filters.maxPrice}
                  onChange={e => set('maxPrice', parseFloat(e.target.value) || 0)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-violet-500/60" />
              </div>
            </div>
          </FilterRow>

          {/* Min volume */}
          <FilterRow label="Min Daily Volume" hint="Minimum average daily volume — filters illiquid stocks">
            <input type="number" step="50000" value={filters.minVolume}
              onChange={e => set('minVolume', parseInt(e.target.value) || 0)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-violet-500/60" />
            <p className="text-xs text-gray-600 mt-1">{(filters.minVolume / 1_000_000).toFixed(2)}M shares</p>
          </FilterRow>

          {/* RSI range */}
          <FilterRow label="RSI Range" hint="Only show setups where RSI is within this range">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-600 mb-1 block">Min RSI</label>
                <input type="number" min="0" max="100" step="1" value={filters.minRsi}
                  onChange={e => set('minRsi', parseFloat(e.target.value) || 0)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-violet-500/60" />
              </div>
              <span className="text-gray-600 mt-4">—</span>
              <div className="flex-1">
                <label className="text-xs text-gray-600 mb-1 block">Max RSI</label>
                <input type="number" min="0" max="100" step="1" value={filters.maxRsi}
                  onChange={e => set('maxRsi', parseFloat(e.target.value) || 0)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-violet-500/60" />
              </div>
            </div>
          </FilterRow>

          {/* Min confidence */}
          <FilterRow label="Minimum Signal Confidence" hint="Only show setups above this confidence threshold">
            <div className="flex items-center gap-3">
              <input type="range" min="30" max="90" step="5" value={filters.minConfidence}
                onChange={e => set('minConfidence', parseFloat(e.target.value))}
                className="flex-1 accent-violet-500" />
              <span className="text-white font-bold text-sm w-10 text-right">{filters.minConfidence}%</span>
            </div>
          </FilterRow>

          {/* Signal types */}
          <FilterRow label="Signal Types" hint="Which direction setups to include">
            <div className="flex gap-2">
              {['bullish', 'bearish', 'neutral'].map((type) => (
                <button key={type} onClick={() => toggleType(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    filters.signalTypes.includes(type)
                      ? type === 'bullish' ? 'bg-emerald-600 text-white'
                      : type === 'bearish' ? 'bg-red-600 text-white'
                      : 'bg-gray-600 text-white'
                      : 'bg-gray-800 text-gray-500 hover:text-white'
                  }`}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </FilterRow>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 font-semibold text-white text-sm transition">
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Filters'}
          </button>
          <button onClick={() => setFilters(DEFAULTS)} className="px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-400 transition">
            Reset to Defaults
          </button>
        </div>

        <p className="text-xs text-gray-600">
          These filters apply to your daily stock alert emails and your screener results. Changes take effect on the next screener run.
        </p>
      </div>
    </DashboardLayout>
  );
}

function FilterRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pb-4 border-b border-gray-800/60 last:border-0 last:pb-0">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      {children}
    </div>
  );
}
