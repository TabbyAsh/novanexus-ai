'use client';

/**
 * /check — the advertisable value loop.
 *
 * One promise, one completable action, no login, no AI dependency: paste what
 * you found and its sold prices, get the exact max to pay. This is the ad
 * destination — a single-purpose page a stranger finishes in ten seconds.
 *
 * It runs on the SAME comps-backed appraise engine as /flip-calculator, but
 * stripped to the one loop and labelled honestly (§ Trust Law): the basis of
 * every verdict is shown, and a no-comps answer says so.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Result {
  decision: 'BUY' | 'NEGOTIATE' | 'PASS' | 'WATCH';
  estimateBasis: 'MANUAL_COMPS' | 'LIVE_COMPS' | 'CATEGORY_MODEL';
  maxBuyPrice: number | null;
  expectedResaleLow: number | null;
  expectedResaleHigh: number | null;
  expectedNetProfitMid: number | null;
  confidence: number;
  reasons: string[];
  warnings: string[];
  negotiationScript: string;
}

const VERDICT: Record<Result['decision'], { label: string; sub: string; accent: string; ring: string }> = {
  BUY:       { label: 'BUY IT',    sub: 'The numbers work. Move.',            accent: '#4ade80', ring: 'rgba(74,222,128,.4)' },
  NEGOTIATE: { label: 'MAKE AN OFFER', sub: 'Only at the right price.',        accent: '#7dd8ff', ring: 'rgba(125,216,255,.4)' },
  PASS:      { label: 'WALK AWAY', sub: 'No margin here. Keep your cash.',     accent: '#f0736a', ring: 'rgba(240,115,106,.4)' },
  WATCH:     { label: 'NEED PRICES', sub: 'Paste a few sold prices for a real read.', accent: '#e0a860', ring: 'rgba(224,168,96,.4)' },
};

const BASIS: Record<Result['estimateBasis'], string> = {
  MANUAL_COMPS: 'from the sold prices you pasted',
  LIVE_COMPS: 'from live sold listings',
  CATEGORY_MODEL: 'a rough category estimate — paste sold prices for a real verdict',
};

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const moneyOr = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? money(n) : '—');

function parseComps(raw: string): number[] {
  return raw.split(/[,\n\s]+/).map(v => Number(v.replace(/[^0-9.]/g, ''))).filter(v => Number.isFinite(v) && v > 0);
}

export default function CheckClient() {
  const [item, setItem] = useState('');
  const [asking, setAsking] = useState('');
  const [comps, setComps] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => parseComps(comps), [comps]);
  const soldUrl = item.trim()
    ? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.trim())}&LH_Sold=1&LH_Complete=1`
    : null;

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.trim() || !asking) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API}/v1/flip/appraise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.trim(), askingPrice: parseFloat(asking), condition: 'Good',
          manualComps: parsed.length ? parsed : undefined,
        }),
      });
      const d = await res.json();
      if (d.success && d.data?.decision) setResult(d.data as Result);
      else setError(d.error?.message || 'Could not read that item. Try a more specific name.');
    } catch { setError('Network error — try again.'); }
    finally { setLoading(false); }
  };

  const v = result ? VERDICT[result.decision] : null;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% -10%, #071120 0%, #01030a 55%)', color: '#c8e8f5' }}>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 20px 80px' }}>

        {/* wordmark */}
        <Link href="/" style={{ textDecoration: 'none', color: '#7fa6c2', fontSize: 11, letterSpacing: '0.4em', textTransform: 'uppercase' }}>
          novanexus
        </Link>

        {/* hero */}
        <h1 style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.12, marginTop: 40, color: '#eafcff' }}>
          Never overpay for a flip again.
        </h1>
        <p style={{ fontSize: 16, color: '#7d99ad', marginTop: 14, lineHeight: 1.5 }}>
          Paste what you found and its sold prices. Nova gives you the exact max to pay,
          your expected profit, and a script to close the deal — in ten seconds, free.
        </p>

        {/* the loop */}
        <form onSubmit={check} style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>What did you find?</label>
            <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. DeWalt DCD771C2 20V drill" style={inp} />
          </div>
          <div>
            <label style={lbl}>What are they asking?</label>
            <input value={asking} onChange={e => setAsking(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="45" style={inp} />
          </div>

          <div style={{ border: '1px solid rgba(150,220,255,.14)', borderRadius: 12, padding: 14, background: 'rgba(4,10,20,.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Its recent sold prices</label>
              {soldUrl && (
                <a href={soldUrl} target="_blank" rel="noopener noreferrer"
                   style={{ fontSize: 12, color: '#7dd8ff', textDecoration: 'none', border: '1px solid rgba(125,216,255,.3)', borderRadius: 8, padding: '4px 10px' }}>
                  Pull them from eBay →
                </a>
              )}
            </div>
            <textarea value={comps} onChange={e => setComps(e.target.value)} rows={3}
              placeholder="Paste 3–5 sold prices. 72 85 79 90 68"
              style={{ ...inp, resize: 'none', fontFamily: 'ui-monospace, Consolas, monospace' }} />
            <div style={{ fontSize: 12, color: parsed.length >= 3 ? '#4ade80' : '#5d7891', marginTop: 6 }}>
              {parsed.length === 0 ? 'No prices yet — you\'ll get a rough estimate without them.'
                : `${parsed.length} sold price${parsed.length === 1 ? '' : 's'} detected${parsed.length >= 3 ? ' — enough for a real verdict' : ' — 3+ is best'}`}
            </div>
          </div>

          <button type="submit" disabled={loading || !item.trim() || !asking}
            style={{ ...btn, opacity: loading || !item.trim() || !asking ? 0.4 : 1 }}>
            {loading ? 'Reading the market…' : 'Check it'}
          </button>
        </form>

        {error && <p style={{ color: '#f0736a', fontSize: 14, marginTop: 16 }}>{error}</p>}

        {/* verdict */}
        {result && v && (
          <div style={{ marginTop: 26, border: `1px solid ${v.ring}`, borderRadius: 16, overflow: 'hidden', background: 'rgba(4,10,20,.5)' }}>
            <div style={{ padding: '22px 22px 18px', textAlign: 'center', borderBottom: '1px solid rgba(150,220,255,.1)' }}>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '0.04em', color: v.accent }}>{v.label}</div>
              <div style={{ fontSize: 14, color: '#7d99ad', marginTop: 4 }}>{v.sub}</div>
            </div>

            {result.decision !== 'WATCH' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(150,220,255,.1)' }}>
                <Stat label="Max to pay" value={moneyOr(result.maxBuyPrice)} big accent={v.accent} />
                <Stat label="Expected profit" value={moneyOr(result.expectedNetProfitMid)} />
                <Stat label="Resells for" value={`${moneyOr(result.expectedResaleLow)}–${moneyOr(result.expectedResaleHigh)}`} />
                <Stat label="Confidence" value={`${Math.round((result.confidence || 0) * 100)}%`} />
              </div>
            )}

            <div style={{ padding: '16px 22px' }}>
              <div style={{ fontSize: 12, color: '#5d7891', marginBottom: result.decision !== 'WATCH' ? 14 : 0 }}>
                ◆ {BASIS[result.estimateBasis]}
              </div>

              {result.negotiationScript && result.decision !== 'WATCH' && (
                <div style={{ border: '1px solid rgba(125,216,255,.2)', borderRadius: 10, padding: 14, background: 'rgba(0,0,0,.3)' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#5d7891', marginBottom: 6 }}>
                    Say this to the seller
                  </div>
                  <div style={{ fontSize: 14, color: '#c8e8f5', lineHeight: 1.5 }}>{result.negotiationScript}</div>
                  <button onClick={() => { navigator.clipboard.writeText(result.negotiationScript); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    style={{ marginTop: 10, background: 'none', border: '1px solid rgba(125,216,255,.3)', color: '#7dd8ff', borderRadius: 8, padding: '5px 12px', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    {copied ? '✓ copied' : 'copy'}
                  </button>
                </div>
              )}
            </div>

            {/* the upsell — one, honest, after value delivered */}
            <div style={{ padding: '18px 22px', borderTop: '1px solid rgba(150,220,255,.1)', background: 'rgba(125,216,255,.04)' }}>
              <div style={{ fontSize: 14, color: '#c8e8f5', marginBottom: 10 }}>
                That&apos;s one check. Nova can remember every flip you make, learn your market, and get
                sharper on the categories you actually source.
              </div>
              <Link href="/register" style={{ display: 'inline-block', background: 'linear-gradient(140deg,#eafcff,#7dd8ff)', color: '#04131c', fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 10, textDecoration: 'none' }}>
                Create a free account →
              </Link>
            </div>
          </div>
        )}

        {/* trust */}
        <p style={{ fontSize: 12, color: '#3d5266', marginTop: 30, lineHeight: 1.6 }}>
          Every verdict is only as good as the sold prices behind it — which is why Nova labels the
          basis of each number. Not financial advice. Resale estimates reflect market data and may
          not match your actual sale.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, big, accent }: { label: string; value: string; big?: boolean; accent?: string }) {
  return (
    <div style={{ background: 'rgba(4,10,20,.7)', padding: '14px 18px' }}>
      <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#5d7891' }}>{label}</div>
      <div style={{ fontSize: big ? 26 : 18, fontWeight: big ? 800 : 600, color: big ? (accent || '#eafcff') : '#c8e8f5', marginTop: 4 }}>{value}</div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#5d7891', marginBottom: 7 };
const inp: React.CSSProperties = { width: '100%', background: 'rgba(4,10,20,.6)', border: '1px solid rgba(150,220,255,.16)', borderRadius: 10, color: '#dbeefb', padding: '11px 13px', fontSize: 15, outline: 'none' };
const btn: React.CSSProperties = { background: 'linear-gradient(140deg,#eafcff,#7dd8ff)', color: '#04131c', border: 0, borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' };
