'use client';

/**
 * Flip Card — the real decision product (Sprint Zero T4–T6, T9).
 * Submits a product to StoreBot, which sources real eBay comps via
 * commercedata and returns a universal FLIP Decision Card.
 */

import { useState } from 'react';
import Link from 'next/link';
import FlipCard, { DecisionCard } from '../../../components/FlipCard';
import { api } from '../../../lib/api';

export default function FlipCardPage() {
  const [value, setValue] = useState('');
  const [askingPrice, setAskingPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<DecisionCard | null>(null);
  const [outcomeMsg, setOutcomeMsg] = useState<string | null>(null);

  const isUrl = /^https?:\/\//i.test(value.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    setCard(null);
    setOutcomeMsg(null);

    const res = await api.analyzeFlipCard({
      value: value.trim(),
      inputType: isUrl ? 'url' : 'description',
      askingPrice: askingPrice ? parseFloat(askingPrice) : null,
      condition: condition || undefined,
    });

    if (res.success && res.data?.card) {
      setCard(res.data.card as unknown as DecisionCard);
    } else {
      setError(res.error?.message || 'Analysis failed. Try a more specific product name.');
    }
    setLoading(false);
  };

  // T9: record the real-world outcome of the decision
  const logOutcome = async (status: 'EXECUTED' | 'SKIPPED') => {
    if (!card) return;
    setOutcomeMsg(null);
    const res = await api.updateCardOutcome(card.id, { status });
    if (res.success && res.data?.card) {
      setCard(res.data.card as unknown as DecisionCard);
      setOutcomeMsg(`Outcome recorded: ${status}.`);
    } else {
      setOutcomeMsg(res.error?.message || 'Could not record outcome.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">FC</span>
            </div>
            <span className="text-white font-semibold">Flip Card</span>
          </Link>
          <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm transition">Dashboard</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Real Flip Card</h1>
          <p className="text-gray-400 text-sm mt-1">
            Every number comes from live eBay comparable listings. If data is missing, Nova says so — no guesses.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <div>
            <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1">
              Product (name or eBay/listing URL)
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. Apple AirPods Pro 2nd Gen"
              className="w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm text-white focus:border-emerald-600 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1">
                Your buy price (optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                placeholder="e.g. 120"
                className="w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm text-white focus:border-emerald-600 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1">
                Condition (optional)
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm text-white focus:border-emerald-600 outline-none"
              >
                <option value="">Any</option>
                <option value="NEW">New</option>
                <option value="USED">Used</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold transition"
          >
            {loading ? 'Analyzing real eBay comps…' : 'Generate Flip Card'}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>

        {card && (
          <div className="space-y-4">
            <FlipCard card={card} />

            {/* T9: Outcome logging */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
              <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Record Outcome</div>
              <p className="text-sm text-gray-400 mb-3">
                Current status:{' '}
                <span className="text-white font-mono">{(card as any).outcome?.status ?? 'PENDING'}</span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => logOutcome('EXECUTED')}
                  className="rounded-lg bg-emerald-700 hover:bg-emerald-600 px-4 py-2 text-sm font-medium transition"
                >
                  I bought it (Executed)
                </button>
                <button
                  onClick={() => logOutcome('SKIPPED')}
                  className="rounded-lg bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm font-medium transition"
                >
                  I passed (Skipped)
                </button>
              </div>
              {outcomeMsg && <p className="text-sm text-emerald-400 mt-3">{outcomeMsg}</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
