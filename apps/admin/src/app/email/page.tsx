'use client';

/**
 * Admin Email Broadcaster
 * Send directly to all 38 users (or segments) with one click.
 * Requires RESEND_API_KEY to be set in Railway.
 */

import { useEffect, useState } from 'react';
import { Mail, Send, Users, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';

// Pre-written founding member pitch — edit before sending
const FOUNDING_PITCH_HTML = `<div style="font-family:system-ui,sans-serif;background:#0a0a0f;color:#fff;padding:32px;max-width:600px;margin:0 auto">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
    <div style="width:40px;height:40px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:20px">N</div>
    <div>
      <div style="font-size:18px;font-weight:700">Nova Founding Member Offer</div>
      <div style="font-size:12px;color:#6b7280">Limited — 49 seats remaining</div>
    </div>
  </div>

  <p style="color:#9ca3af;font-size:15px;line-height:1.6">
    You signed up for Nova early. That means something to me.
  </p>

  <p style="color:#9ca3af;font-size:15px;line-height:1.6">
    I'm building Nova to be a real decision engine — one that finds flip opportunities, screens stocks with AI, learns from your outcomes, and gets better the more you use it. The flip pipeline pulls live Craigslist listings, evaluates them against real eBay sold comps, and gives you a buy/offer/skip verdict with a negotiation script. The stock screener runs momentum pattern analysis across 500+ tickers every morning.
  </p>

  <p style="color:#9ca3af;font-size:15px;line-height:1.6">
    This is a <strong style="color:#fff">Founding Member offer</strong>: $99/month, lifetime pricing lock. You get full access to every feature that ships, daily flip alerts, daily stock alerts, and your membership directly funds the AI credits that keep improving the system.
  </p>

  <div style="background:#111827;border:1px solid #f59e0b33;border-radius:12px;padding:20px;margin:24px 0">
    <div style="font-size:12px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:12px">⭐ Founding Member — $99/month</div>
    <ul style="list-style:none;margin:0;padding:0;space-y:8px">
      <li style="color:#9ca3af;font-size:14px;padding:4px 0">✓ Full platform access — all features, all modules</li>
      <li style="color:#9ca3af;font-size:14px;padding:4px 0">✓ Daily flip alerts — free Craigslist items worth flipping, emailed each morning</li>
      <li style="color:#9ca3af;font-size:14px;padding:4px 0">✓ Daily stock alerts — AI momentum setups, emailed before market open</li>
      <li style="color:#9ca3af;font-size:14px;padding:4px 0">✓ Weekly intelligence digest — best opportunities of the week</li>
      <li style="color:#9ca3af;font-size:14px;padding:4px 0">✓ Lifetime price lock — your rate never increases</li>
      <li style="color:#9ca3af;font-size:14px;padding:4px 0">✓ Direct input on roadmap — you shape what gets built next</li>
    </ul>
  </div>

  <p style="color:#6b7280;font-size:14px;line-height:1.5">
    49 seats left. When they're gone, the price goes to $149/month for new members.
  </p>

  <a href="https://novanexus-ai.com/pricing?plan=founding" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin-top:16px">
    Claim Founding Member Seat →
  </a>

  <p style="color:#374151;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #1f2937">
    This is not automated marketing. I sent this personally to the people who signed up early. — Nova
    <br>
    <a href="https://novanexus-ai.com" style="color:#6b7280">novanexus-ai.com</a>
  </p>
</div>`;

export default function EmailPage() {
  const [status, setStatus] = useState<{
    emailConfigured: boolean;
    totalRecipients: number;
    setupInstructions?: Record<string, string>;
  } | null>(null);
  const [subject, setSubject] = useState('Nova Founding Member — 49 seats left');
  const [html, setHtml] = useState(FOUNDING_PITCH_HTML);
  const [segment, setSegment] = useState<'all' | 'free' | 'paid'>('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';

  useEffect(() => {
    fetch(`${GATEWAY}/v1/admin/email/status`, {
      headers: { 'Authorization': `Bearer ${token}` },
    }).then(r => r.json()).then(d => {
      if (d.success) setStatus(d.data);
    }).catch(() => {});
  }, [token]);

  const send = async () => {
    if (!subject.trim() || !html.trim()) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`${GATEWAY}/v1/admin/email/broadcast`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html, segment }),
      });
      const d = await r.json();
      if (d.success) { setResult(d.data); }
      else { setError(d.error?.message || 'Broadcast failed.'); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Mail className="w-6 h-6 text-amber-400" /> Email Broadcast
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Send directly to your users. Pre-loaded with the founding member pitch.
        </p>
      </div>

      {/* Email config status */}
      {status && (
        <div className={`rounded-xl border p-4 ${status.emailConfigured
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-amber-500/30 bg-amber-500/10'}`}>
          <div className="flex items-start gap-3">
            {status.emailConfigured
              ? <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              : <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
            <div className="flex-1">
              {status.emailConfigured ? (
                <div>
                  <span className="font-semibold text-emerald-300">Email ready.</span>
                  <span className="text-emerald-500/80 text-sm ml-2">{status.totalRecipients} users in your list.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <span className="font-semibold text-amber-300">Resend not configured.</span>
                    <span className="text-amber-500/80 text-sm ml-2">{status.totalRecipients} users waiting to receive emails.</span>
                  </div>
                  {status.setupInstructions && (
                    <div className="space-y-1 text-sm text-gray-400">
                      {Object.entries(status.setupInstructions).map(([k, v]) => (
                        <div key={k}><span className="text-gray-600">{k}:</span> {v}</div>
                      ))}
                      <a href="https://resend.com" target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 mt-2">
                        Set up Resend <ExternalLink className="w-3 h-3" />
                      </a>
                      <span className="text-gray-600 ml-3">then add</span>
                      <code className="text-amber-300 ml-1 text-xs">RESEND_API_KEY</code>
                      <span className="text-gray-600"> to </span>
                      <a href="https://railway.com" target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300">
                        Railway vars <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Segment selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Send to:</span>
        {(['all', 'free', 'paid'] as const).map((s) => (
          <button key={s} onClick={() => setSegment(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              segment === s ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}>
            {s === 'all' ? `All users (${status?.totalRecipients ?? '…'})` : s === 'free' ? 'Free only' : 'Paid only'}
          </button>
        ))}
      </div>

      {/* Subject */}
      <div>
        <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1">Subject</label>
        <input value={subject} onChange={e => setSubject(e.target.value)}
          className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white text-sm focus:border-amber-500/60 outline-none" />
      </div>

      {/* HTML body */}
      <div>
        <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1">
          Email HTML <span className="text-gray-600 normal-case">(pre-loaded with founding member pitch — edit before sending)</span>
        </label>
        <textarea value={html} onChange={e => setHtml(e.target.value)} rows={16}
          className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-gray-300 text-xs font-mono focus:border-amber-500/60 outline-none resize-y" />
      </div>

      {/* Send button */}
      <div className="flex items-center gap-4">
        <button onClick={send} disabled={sending || !subject.trim() || !html.trim()}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-white transition">
          <Send className="w-4 h-4" />
          {sending ? 'Sending…' : `Send to ${segment === 'all' ? 'all users' : segment + ' users'}`}
        </button>
        <p className="text-xs text-gray-600">This sends real emails. Review the HTML above before clicking.</p>
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle className="w-5 h-5 text-emerald-400 inline mr-2" />
          <span className="text-emerald-300 font-semibold">Sent {result.sent} of {result.total}.</span>
          {result.failed > 0 && <span className="text-red-400 text-sm ml-2">{result.failed} failed.</span>}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">{error}</div>
      )}
    </div>
  );
}
