'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  price?: number;
  priceMonthly?: number;
  priceYearly?: number;
  interval: string | null;
  features: string[];
  comingSoon?: boolean;
  founding?: boolean;
}

export default function PricingPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [foundingSeats, setFoundingSeats] = useState<{ maxSeats: number; taken: number; remaining: number } | null>(null);
  const [briefProof, setBriefProof] = useState<{
    available: boolean; resolved: number; wins: number; losses: number;
    winRate: number | null; totalTracked: number;
    dateRange: { from: string; to: string } | null;
    disclaimer: string; sampleSizeNote: string | null;
  } | null>(null);

  useEffect(() => {
    fetchPricing();
    fetchFoundingSeats();
    fetchBriefProof();
  }, []);

  const fetchPricing = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/billing/pricing`);
      const data = await res.json();
      if (data.success) {
        setPlans(data.data.plans);
      }
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
    }
  };

  const fetchBriefProof = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/platform/brief-proof`);
      const data = await res.json();
      if (data.success && data.data) setBriefProof(data.data);
    } catch { /* non-critical */ }
  };

  const fetchFoundingSeats = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/billing/founding-seats`);
      const data = await res.json();
      if (data.success) {
        setFoundingSeats(data.data);
      }
    } catch {
      setFoundingSeats({ maxSeats: 50, taken: 0, remaining: 50 });
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!user || !isAuthenticated) {
      router.push('/register?redirect=/pricing');
      return;
    }

    if (planId === 'FREE' || planId === 'PRO') {
      return;
    }

    setCheckoutLoading(planId);

    try {
      const token = api.getAccessToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/billing/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ interval: billingInterval, plan: planId }),
      });

      const data = await res.json();

      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      } else {
        alert(data.error?.message || 'Failed to start checkout');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const getPrice = (plan: Plan) => {
    if (plan.price === 0) return 'Free';
    if (plan.comingSoon) return 'Coming Soon';
    
    const price = billingInterval === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    if (!price) return 'Contact Us';
    
    if (billingInterval === 'yearly') {
      return `$${price}/year`;
    }
    return `$${price}/month`;
  };

  const getSavings = (plan: Plan) => {
    if (!plan.priceMonthly || !plan.priceYearly) return null;
    const monthlyTotal = plan.priceMonthly * 12;
    const savings = monthlyTotal - plan.priceYearly;
    if (savings > 0 && billingInterval === 'yearly') {
      return `Save $${savings}/year`;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-950 py-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">FC</span>
            </div>
            <span className="text-2xl font-bold text-white">Flip Card</span>
          </Link>
          <h1 className="text-4xl font-bold text-white mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Evaluate flipping opportunities with real data.
            Avoid one bad buy and the subscription pays for itself.
          </p>
        </div>

        {/* Brief Performance Proof — only shown when real data exists */}
        {briefProof && briefProof.available && briefProof.winRate !== null && (
          <div className="mb-10 max-w-2xl mx-auto">
            <div className="bg-gradient-to-r from-green-900/30 to-cyan-900/30 border border-green-500/30 rounded-2xl p-6 text-center">
              <div className="text-xs text-green-400/70 uppercase tracking-wider mb-3">Daily Brief — Tracked Performance</div>
              <div className="flex items-center justify-center gap-8 mb-3">
                <div>
                  <div className="text-3xl font-bold text-green-400">{briefProof.winRate}%</div>
                  <div className="text-xs text-gray-400">Win Rate</div>
                </div>
                <div className="w-px h-10 bg-gray-700" />
                <div>
                  <div className="text-3xl font-bold text-white">{briefProof.resolved}</div>
                  <div className="text-xs text-gray-400">Resolved Setups</div>
                </div>
                <div className="w-px h-10 bg-gray-700" />
                <div>
                  <div className="text-3xl font-bold text-cyan-400">{briefProof.wins}W / {briefProof.losses}L</div>
                  <div className="text-xs text-gray-400">Win / Loss</div>
                </div>
              </div>
              {briefProof.dateRange && (
                <div className="text-xs text-gray-500 mb-2">
                  Data from {new Date(briefProof.dateRange.from).toLocaleDateString()} to {new Date(briefProof.dateRange.to).toLocaleDateString()}
                </div>
              )}
              <div className="text-xs text-gray-500 italic">{briefProof.disclaimer}</div>
            </div>
          </div>
        )}
        {briefProof && !briefProof.available && briefProof.sampleSizeNote && (
          <div className="mb-8 text-center text-xs text-gray-500">
            {briefProof.sampleSizeNote}
          </div>
        )}

        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="bg-gray-900 p-1 rounded-lg inline-flex">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition ${
                billingInterval === 'monthly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('yearly')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition ${
                billingInterval === 'yearly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Yearly
              <span className="ml-2 text-xs text-green-400">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const isFounding = plan.id === 'FOUNDING' || plan.founding;
            const isLite = plan.id === 'LITE';
            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-8 relative ${
                  isFounding
                    ? 'bg-gradient-to-b from-amber-900/40 via-yellow-900/20 to-gray-900 border-2 border-amber-500/60 ring-2 ring-amber-500/20'
                    : isLite
                    ? 'bg-gradient-to-b from-blue-900/50 to-gray-900 border-2 border-blue-500/50 ring-2 ring-blue-500/20'
                    : 'bg-gray-900 border border-gray-800'
                }`}
              >
                {isFounding && (
                  <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="text-base">\u2B50</span> Limited — {foundingSeats ? `${foundingSeats.remaining} of ${foundingSeats.maxSeats} seats left` : '50 seats'}
                  </div>
                )}
                {isLite && (
                  <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-4">
                    Most Popular
                  </div>
                )}
                
                <h3 className={`text-xl font-bold mb-2 ${isFounding ? 'text-amber-100' : 'text-white'}`}>{plan.name}</h3>
                
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">{getPrice(plan)}</span>
                  {getSavings(plan) && (
                    <span className="ml-2 text-sm text-green-400">{getSavings(plan)}</span>
                  )}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-gray-300 text-sm">
                      <svg className={`w-5 h-5 flex-shrink-0 ${isFounding ? 'text-amber-400' : 'text-green-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={plan.comingSoon || checkoutLoading === plan.id}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition ${
                    isFounding
                      ? 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white shadow-lg shadow-amber-900/30'
                      : isLite
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : plan.id === 'FREE'
                      ? 'bg-gray-800 hover:bg-gray-700 text-white'
                      : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  } disabled:opacity-50`}
                >
                  {checkoutLoading === plan.id
                    ? 'Loading...'
                    : plan.comingSoon
                    ? 'Coming Soon'
                    : isFounding
                    ? 'Claim Founding Seat'
                    : plan.id === 'FREE'
                    ? 'Get Started Free'
                    : 'Subscribe Now'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Disclaimer */}
        <div className="mt-16 text-center">
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-6 max-w-3xl mx-auto">
            <h4 className="text-yellow-400 font-semibold mb-2">Important Disclaimer</h4>
            <p className="text-gray-400 text-sm">
              Flip Card provides structured estimates for resale opportunities.
              It is not financial advice. All estimates are based on publicly available sold data
              and category heuristics. Actual results may vary.
              You are responsible for your own buying and selling decisions.
            </p>
          </div>
        </div>

        {/* FAQ or Features Section */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-white mb-8">What&apos;s Included</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '🔍', title: 'Real Sold Comps', desc: 'Prices from actual completed sales' },
              { icon: '💰', title: 'Profit Calculator', desc: 'Fees, shipping, and net profit breakdown' },
              { icon: '⚠️', title: 'Risk Flags', desc: 'Know what could go wrong before you buy' },
              { icon: '✅', title: 'Clear Verdict', desc: 'BUY, NEGOTIATE, or PASS — no guessing' },
            ].map((item, idx) => (
              <div key={idx} className="bg-gray-900 rounded-lg p-6">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h4 className="text-white font-semibold mb-1">{item.title}</h4>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-12 text-center">
          <Link href="/" className="text-gray-400 hover:text-white transition">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
