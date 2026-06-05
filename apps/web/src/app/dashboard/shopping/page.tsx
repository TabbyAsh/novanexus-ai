'use client';

/**
 * Shopping Decision Cards — stretch your money further.
 *
 * From the directional-thinking document:
 * "The system should find: cheapest gas, grocery deals, coupons, dry goods,
 * household essentials, price comparisons, best value per unit, local availability."
 *
 * This generates Shopping Decision Cards that answer:
 * "Where should I buy this? What is the cheapest safe option? Is the discount real?
 * Is buying bulk worth it? How much money does this save?"
 *
 * Implementation: AI-powered card generation (Groq/Gemini free tier) → links to
 * Google Shopping, GasBuddy, Instacart, store apps. Zero proprietary API cost.
 */

import { useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Sparkles, ShoppingCart, TrendingDown, ExternalLink, ArrowRight } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ShoppingCard {
  item: string;
  cheapestOption: string;
  estimatedPrice: string;
  whereToBuy: { name: string; url: string; note: string }[];
  bulkAdvice: string;
  savingsEstimate: string;
  warnings: string[];
  nextAction: string;
}

const QUICK_ITEMS = [
  { label: 'Gas', emoji: '⛽', query: 'cheapest gas near me' },
  { label: 'Groceries', emoji: '🥦', query: 'weekly grocery deals' },
  { label: 'Protein powder', emoji: '💪', query: 'cheapest protein powder per gram' },
  { label: 'Paper towels', emoji: '🧻', query: 'paper towels best value per sheet' },
  { label: 'Coffee', emoji: '☕', query: 'cheapest ground coffee per ounce' },
  { label: 'Rice/dry goods', emoji: '🌾', query: 'cheapest rice and dry goods bulk' },
  { label: 'Cleaning supplies', emoji: '🧹', query: 'cheapest cleaning supplies household' },
  { label: 'Phone plan', emoji: '📱', query: 'cheapest phone plan same coverage' },
];

// Generate a shopping card from Groq AI — free tier
async function generateShoppingCard(item: string, token: string): Promise<string> {
  const res = await fetch(`${API}/v1/cards/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      context: `I need to find the cheapest place to buy: ${item}. Give me a specific Shopping Decision Card with: where to buy it (with real store/app names), estimated price range, whether bulk buying makes sense, any coupons or apps that help (GasBuddy, Flipp, Ibotta, store apps), and how much I could realistically save vs. just grabbing it at the nearest store. Be specific about numbers.`,
      haves: ['Time to shop smart'],
      wants: ['Saved money'],
    }),
  });
  const d = await res.json();
  return d.data?.content || '';
}

// Direct search links — zero cost, always current
function getShoppingLinks(item: string): { name: string; url: string; note: string }[] {
  const q = encodeURIComponent(item);
  const links = [
    {
      name: 'Google Shopping',
      url: `https://www.google.com/search?q=${q}&tbm=shop`,
      note: 'Price comparison across hundreds of stores',
    },
    {
      name: 'Amazon',
      url: `https://www.amazon.com/s?k=${q}&ref=nb_sb_noss`,
      note: 'Check Subscribe & Save for recurring items',
    },
    {
      name: 'Walmart',
      url: `https://www.walmart.com/search?q=${q}`,
      note: 'Often cheapest for household staples',
    },
    {
      name: 'Instacart deals',
      url: `https://www.instacart.com/store/items?query=${q}`,
      note: 'Compare across local stores with delivery',
    },
  ];

  // Add gas-specific link
  if (item.toLowerCase().includes('gas') || item.toLowerCase().includes('fuel')) {
    links.unshift({
      name: 'GasBuddy',
      url: 'https://www.gasbuddy.com',
      note: 'Live gas prices near you — always free',
    });
  }

  // Add bulk buying link for dry goods
  if (/rice|sugar|flour|coffee|protein|powder|bulk/i.test(item)) {
    links.push({
      name: 'Costco / Sam\'s Club',
      url: `https://www.costco.com/CatalogSearch?dept=All&keyword=${q}`,
      note: 'Membership pays off quickly on staples',
    });
  }

  return links;
}

export default function ShoppingPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const [currentItem, setCurrentItem] = useState('');
  const [error, setError] = useState<string | null>(null);

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';

  const search = async (item: string) => {
    if (!item.trim()) return;
    setLoading(true);
    setError(null);
    setCard(null);
    setCurrentItem(item);
    try {
      const result = await generateShoppingCard(item, getToken());
      setCard(result);
    } catch {
      setError('Could not generate shopping card. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const links = currentItem ? getShoppingLinks(currentItem) : [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Shopping Decision Cards</h1>
          <p className="text-gray-500 text-sm mt-1">
            Enter anything you need to buy. Nova finds the cheapest option, compares sources,
            and tells you whether bulk buying actually saves money.
          </p>
        </div>

        {/* Search */}
        <div className="flex gap-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search(query)}
            placeholder="What do you need to buy? (e.g. protein powder, paper towels, gas)"
            className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50"
          />
          <button onClick={() => search(query)} disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm transition">
            <Sparkles className="w-4 h-4" />
            {loading ? 'Searching…' : 'Get Card'}
          </button>
        </div>

        {/* Quick items */}
        <div>
          <div className="text-xs text-gray-600 uppercase tracking-widest mb-2">Quick searches</div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ITEMS.map(item => (
              <button key={item.label} onClick={() => { setQuery(item.query); search(item.query); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-800 bg-gray-900/50 hover:border-emerald-500/30 text-xs text-gray-400 hover:text-white transition">
                {item.emoji} {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Finding the cheapest option for {currentItem}…</p>
          </div>
        )}

        {/* Error */}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Card result */}
        {card && !loading && (
          <div className="space-y-4">
            {/* AI card */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Shopping Card — {currentItem}</span>
              </div>
              <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{card}</div>
            </div>

            {/* Direct links */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <ShoppingCart className="w-3.5 h-3.5" /> Search now — real prices
              </div>
              <div className="space-y-2">
                {links.map(link => (
                  <a key={link.name} href={link.url} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-800 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition group">
                    <div>
                      <div className="text-sm font-medium text-white group-hover:text-emerald-300 transition">{link.name}</div>
                      <div className="text-xs text-gray-600">{link.note}</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-emerald-400 transition shrink-0" />
                  </a>
                ))}
              </div>
            </div>

            {/* Coupon/savings apps */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">Apps that cut prices further (free to use)</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'Flipp', url: 'https://flipp.com', note: 'Grocery flyers' },
                  { name: 'Ibotta', url: 'https://ibotta.com', note: 'Grocery cashback' },
                  { name: 'Rakuten', url: 'https://rakuten.com', note: 'Online cashback' },
                  { name: 'Honey', url: 'https://joinhoney.com', note: 'Auto coupon codes' },
                  { name: 'GasBuddy', url: 'https://gasbuddy.com', note: 'Live gas prices' },
                ].map(app => (
                  <a key={app.name} href={app.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 text-xs text-gray-500 hover:text-white transition">
                    {app.name} <span className="text-gray-700">· {app.note}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!card && !loading && !error && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-8 text-center">
            <ShoppingCart className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              Enter anything you buy regularly. Nova shows you the cheapest source, whether bulk buying helps, and apps that cut the price further.
            </p>
            <p className="text-gray-700 text-xs mt-2">Most people save $80–$200/month by buying the same things smarter.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
