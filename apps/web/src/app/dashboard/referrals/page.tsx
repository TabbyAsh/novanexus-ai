'use client';

/**
 * Referral Dashboard — Viral growth loop.
 * Each successful referral = $10 credit for both parties.
 * Backend: /v1/referrals/generate, /v1/referrals/validate/:code
 */

import { useEffect, useState } from 'react';
import { Gift, Copy, CheckCircle, Users, DollarSign, Share2, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';

interface ReferralData {
  code: string;
  referralUrl: string;
  totalReferrals: number;
  totalEarnings: number;
  rewardPerReferral: string;
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/referrals/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('nova_access_token') || ''}`,
          },
        }
      );
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error?.message || 'Could not load referral data.');
      }
    } catch {
      setError('Failed to load referral data. Make sure you are logged in.');
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.referralUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareMessages = data ? [
    {
      platform: 'Twitter / X',
      icon: '𝕏',
      color: 'bg-black border-gray-700',
      text: `I've been using Nova to find flip opportunities and screen stocks with real data. Try it free: ${data.referralUrl}`,
    },
    {
      platform: 'Facebook',
      icon: 'f',
      color: 'bg-blue-900/40 border-blue-700/40',
      text: `Nova finds real Craigslist flip opportunities and screens 500+ stocks for momentum setups. Get started free: ${data.referralUrl}`,
    },
    {
      platform: 'Reddit',
      icon: '🤖',
      color: 'bg-orange-900/30 border-orange-700/30',
      text: `Anyone else using AI tools to find flip opportunities? Found this platform that uses real eBay comps and live Craigslist data. ${data.referralUrl}`,
    },
  ] : [];

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300 text-sm">
          {error || 'Something went wrong loading your referral data.'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Gift className="w-6 h-6 text-violet-400" /> Refer & Earn
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Share Nova. Each person who signs up with your link earns you both <strong className="text-violet-300">$10 in credit</strong> — automatically.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-center">
          <Users className="w-5 h-5 text-blue-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">{data.totalReferrals}</div>
          <div className="text-xs text-gray-500 mt-1">Total Referrals</div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-center">
          <DollarSign className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-emerald-400">
            ${data.totalEarnings.toFixed(0)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Credits Earned</div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-center">
          <Gift className="w-5 h-5 text-violet-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-violet-400">$10</div>
          <div className="text-xs text-gray-500 mt-1">Per Referral</div>
        </div>
      </div>

      {/* Referral link */}
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-5 space-y-3">
        <div className="text-xs font-semibold text-violet-400 uppercase tracking-widest">Your Referral Link</div>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-300 font-mono truncate">
            {data.referralUrl}
          </div>
          <button
            onClick={copyUrl}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium text-white transition"
          >
            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="bg-gray-800 px-2 py-0.5 rounded font-mono text-violet-300">{data.code}</span>
          <span>Your code — share as a link or just the code</span>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="text-sm font-semibold text-white mb-4">How it works</div>
        <ol className="space-y-3">
          {[
            { step: '1', label: 'Share your link', desc: 'Send it to anyone who might want to flip items or screen stocks.' },
            { step: '2', label: 'They sign up', desc: 'Your friend registers using your link. Nova tracks the referral automatically.' },
            { step: '3', label: 'Both get $10 credit', desc: 'When they upgrade to a paid plan, you both receive $10 in account credit.' },
          ].map((s) => (
            <li key={s.step} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-violet-600/40 border border-violet-500/40 flex items-center justify-center text-xs font-bold text-violet-300 shrink-0 mt-0.5">
                {s.step}
              </div>
              <div>
                <div className="text-sm font-medium text-white">{s.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Share message templates */}
      <div>
        <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Share2 className="w-4 h-4 text-gray-400" /> Copy a message to share
        </div>
        <div className="space-y-3">
          {shareMessages.map((msg) => (
            <div key={msg.platform} className={`rounded-xl border p-4 ${msg.color}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{msg.icon}</span>
                  <span className="text-xs text-gray-400">{msg.platform}</span>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(msg.text)}
                  className="text-xs text-gray-500 hover:text-white transition flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{msg.text}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center">
        Credits are applied when the referred user upgrades to a paid plan. No expiry.
      </p>
    </div>
  );
}
