'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Plus, Package, DollarSign, TrendingUp, Trash2, Edit3, X, RefreshCw, ChevronRight,
} from 'lucide-react';

interface Flip {
  id: string; itemName: string; category: string | null; source: string | null;
  purchasePrice: number; repairCost: number; listingPrice: number | null;
  soldPrice: number | null; shippingCost: number; platformFees: number;
  status: string; notes: string | null; roi: number | null;
  acquiredAt: string | null; listedAt: string | null; soldAt: string | null;
  createdAt: string; updatedAt: string;
}

interface Summary {
  totalInvested: number; totalRevenue: number; totalFees: number; netProfit: number; count: number;
}

const STATUSES = ['SOURCED', 'ACQUIRED', 'REPAIRING', 'LISTED', 'SOLD', 'ARCHIVED'] as const;
const STATUS_COLORS: Record<string, string> = {
  SOURCED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  ACQUIRED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  REPAIRING: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  LISTED: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  SOLD: 'bg-green-500/20 text-green-400 border-green-500/30',
  ARCHIVED: 'bg-gray-700/20 text-gray-500 border-gray-700/30',
};

const NEXT_STATUS: Record<string, string> = {
  SOURCED: 'ACQUIRED', ACQUIRED: 'REPAIRING', REPAIRING: 'LISTED', LISTED: 'SOLD',
};

export default function FlipsPage() {
  const [flips, setFlips] = useState<Flip[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [form, setForm] = useState({ itemName: '', category: '', source: '', purchasePrice: '', repairCost: '', listingPrice: '', notes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getFlips(filter || undefined);
      if (res.success && res.data) {
        setFlips(res.data.flips);
        setSummary(res.data.summary);
      }
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.createFlip({
      itemName: form.itemName,
      category: form.category || undefined,
      source: form.source || undefined,
      purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : 0,
      repairCost: form.repairCost ? parseFloat(form.repairCost) : 0,
      listingPrice: form.listingPrice ? parseFloat(form.listingPrice) : undefined,
      notes: form.notes || undefined,
    });
    if (res.success) {
      setShowForm(false);
      setForm({ itemName: '', category: '', source: '', purchasePrice: '', repairCost: '', listingPrice: '', notes: '' });
      load();
    }
  };

  const advanceStatus = async (flip: Flip) => {
    const next = NEXT_STATUS[flip.status];
    if (!next) return;
    // If marking as SOLD, prompt for sold price
    if (next === 'SOLD') {
      const priceStr = prompt('Sold price?', String(flip.listingPrice || ''));
      if (!priceStr) return;
      await api.updateFlip(flip.id, { status: 'SOLD', soldPrice: parseFloat(priceStr) });
    } else {
      await api.updateFlip(flip.id, { status: next });
    }
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this flip?')) return;
    await api.deleteFlip(id);
    load();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Flip Pipeline</h1>
          <p className="text-gray-400 mt-1">Track items from sourcing to sale. Maximize ROI.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
            <RefreshCw className="w-5 h-5 text-gray-400" />
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition">
            <Plus className="w-4 h-4" /> New Flip
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
            <div className="text-sm text-gray-400 mb-1">Active Flips</div>
            <div className="text-2xl font-bold text-white">{summary.count}</div>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
            <div className="text-sm text-gray-400 mb-1">Invested</div>
            <div className="text-2xl font-bold text-white">{fmt(summary.totalInvested)}</div>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4">
            <div className="text-sm text-gray-400 mb-1">Revenue</div>
            <div className="text-2xl font-bold text-white">{fmt(summary.totalRevenue)}</div>
          </div>
          <div className={`rounded-xl border p-4 ${summary.netProfit >= 0 ? 'border-green-500/20 bg-green-500/10' : 'border-red-500/20 bg-red-500/10'}`}>
            <div className="text-sm text-gray-400 mb-1">Net Profit</div>
            <div className={`text-2xl font-bold ${summary.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(summary.netProfit)}</div>
          </div>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-sm transition ${!filter ? 'bg-white/10 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>All</button>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm transition ${filter === s ? 'bg-white/10 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">New Flip</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <input value={form.itemName} onChange={e => setForm({ ...form, itemName: e.target.value })} placeholder="Item name *" required className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Category" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
                <input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Source" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input type="number" step="0.01" value={form.purchasePrice} onChange={e => setForm({ ...form, purchasePrice: e.target.value })} placeholder="Buy $" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
                <input type="number" step="0.01" value={form.repairCost} onChange={e => setForm({ ...form, repairCost: e.target.value })} placeholder="Repair $" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
                <input type="number" step="0.01" value={form.listingPrice} onChange={e => setForm({ ...form, listingPrice: e.target.value })} placeholder="List $" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
              </div>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes..." rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
              <button type="submit" className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition">Create Flip</button>
            </form>
          </div>
        </div>
      )}

      {/* Flips List */}
      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" /></div>
      ) : flips.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No flips yet. Add your first item to start tracking.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flips.map(flip => (
            <div key={flip.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-medium truncate">{flip.itemName}</span>
                  <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_COLORS[flip.status] || ''}`}>{flip.status}</span>
                  {flip.category && <span className="text-gray-500 text-xs">{flip.category}</span>}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>Buy: {fmt(flip.purchasePrice)}</span>
                  {flip.repairCost > 0 && <span>Repair: {fmt(flip.repairCost)}</span>}
                  {flip.listingPrice && <span>List: {fmt(flip.listingPrice)}</span>}
                  {flip.soldPrice && <span className="text-green-400">Sold: {fmt(flip.soldPrice)}</span>}
                  {flip.roi !== null && <span className={flip.roi >= 0 ? 'text-green-400' : 'text-red-400'}>ROI: {flip.roi}%</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {NEXT_STATUS[flip.status] && (
                  <button onClick={() => advanceStatus(flip)} className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs hover:bg-cyan-600/30 transition" title={`Move to ${NEXT_STATUS[flip.status]}`}>
                    <ChevronRight className="w-3 h-3" /> {NEXT_STATUS[flip.status]}
                  </button>
                )}
                <button onClick={() => handleDelete(flip.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
