'use client';

/**
 * /deals — today's verified flips.
 *
 * These are not suggestions. Each row is a real classifieds listing whose
 * resale was measured against real eBay SOLD listings, with fees and shipping
 * subtracted. Nova refuses to price anything she can't match to enough real
 * comps, so an empty page is an honest answer, not a broken one.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Deal {
  title: string; price: number; resale: number; low: number | null; high: number | null;
  comps: number; shipping: number; net: number; roi: number;
  region: string | null; url: string | null; query: string | null;
}

const money = (n: number) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

function ago(iso: string | null) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function DealsClient() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    fetch(`${API}/v1/deals/live`)
      .then(r => r.json())
      .then(d => {
        if (d?.success) { setDeals(d.data.deals || []); setScannedAt(d.data.scannedAt); }
        else setDark(true);
      })
      .catch(() => setDark(true));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% -10%, #071120 0%, #01030a 55%)', color: '#c8e8f5' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 80px' }}>

        <Link href="/" style={{ textDecoration: 'none', color: '#7fa6c2', fontSize: 11, letterSpacing: '0.4em', textTransform: 'uppercase' }}>
          novanexus
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.15, marginTop: 38, color: '#eafcff' }}>
          Today&apos;s verified flips.
        </h1>
        <p style={{ fontSize: 15.5, color: '#7d99ad', marginTop: 13, lineHeight: 1.55 }}>
          Nova reads local classifieds, looks up what each item <em>actually sold for</em> on eBay,
          subtracts fees and shipping, and publishes only what clears a real profit.
          {scannedAt && <> Last swept <strong style={{ color: '#c8e8f5' }}>{ago(scannedAt)}</strong>.</>}
        </p>

        {deals === null && !dark && (
          <p style={{ marginTop: 34, color: '#5d7891', fontSize: 14 }}>Loading the latest sweep…</p>
        )}

        {dark && (
          <p style={{ marginTop: 34, color: '#e0a860', fontSize: 14 }}>
            The feed is unavailable right now. It will be back — nothing here is ever guessed to fill the gap.
          </p>
        )}

        {deals && deals.length === 0 && (
          <div style={{ marginTop: 34, border: '1px solid rgba(150,220,255,.16)', borderRadius: 14, padding: 22, background: 'rgba(4,10,20,.5)' }}>
            <div style={{ fontSize: 16, color: '#eafcff', marginBottom: 8 }}>Nothing cleared the bar this sweep.</div>
            <p style={{ fontSize: 14, color: '#7d99ad', lineHeight: 1.55 }}>
              That&apos;s the honest answer, and it&apos;s the usual one. Sellers of brand-name goods
              mostly price at or above what an item nets after fees and shipping. Rather than pad this
              page, Nova shows nothing. Check back after the next sweep.
            </p>
          </div>
        )}

        {deals && deals.length > 0 && (
          <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {deals.map((d, i) => (
              <div key={i} style={{ border: '1px solid rgba(74,222,128,.28)', borderRadius: 14, overflow: 'hidden', background: 'rgba(4,10,20,.5)' }}>
                <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid rgba(150,220,255,.1)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 15.5, color: '#eafcff', fontWeight: 600 }}>{d.title}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: '#4ade80', whiteSpace: 'nowrap' }}>+{money(d.net)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(150,220,255,.1)' }}>
                  <Cell label="Asking" value={money(d.price)} />
                  <Cell label="Sells for" value={'~' + money(d.resale)} />
                  <Cell label="Shipping" value={money(d.shipping)} />
                  <Cell label="ROI" value={d.roi + '%'} accent="#4ade80" />
                </div>
                <div style={{ padding: '11px 18px', fontSize: 11.5, color: '#5d7891', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span>◆ {d.comps} matched sold listings{d.low && d.high ? ` · mid ${money(d.low)}–${money(d.high)}` : ''}{d.region ? ` · ${d.region}` : ''}</span>
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: '#7dd8ff', textDecoration: 'none' }}>
                      open the listing →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 34, borderTop: '1px solid rgba(150,220,255,.12)', paddingTop: 18 }}>
          <p style={{ fontSize: 13.5, color: '#c8e8f5', marginBottom: 10 }}>
            Found something yourself? Check it against real sold prices before you buy.
          </p>
          <Link href="/check" style={{ display: 'inline-block', background: 'linear-gradient(140deg,#eafcff,#7dd8ff)', color: '#04131c', fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 10, textDecoration: 'none' }}>
            Check a flip →
          </Link>
        </div>

        <p style={{ fontSize: 12, color: '#3d5266', marginTop: 26, lineHeight: 1.6 }}>
          Listings are third-party and can sell or change at any time — always verify before you buy.
          Resale figures are medians of matched sold listings, not guarantees. Not financial advice.
        </p>
      </div>
    </div>
  );
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'rgba(4,10,20,.7)', padding: '11px 14px' }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#5d7891' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent || '#c8e8f5', marginTop: 3 }}>{value}</div>
    </div>
  );
}
