import { ImageResponse } from 'next/og';

// Dynamic share image — every time someone pastes the /radar link, the preview
// shows today's #1 live trend. The link itself becomes the advertisement.

export const runtime = 'edge';
export const alt = "Nova Trend Radar — what's about to sell, before it peaks";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default async function Image() {
  let top: { product: string; velocity: number; regionCount: number } | null = null;
  let count = 0;
  try {
    const r = await fetch(`${API}/v1/trends/public`, { next: { revalidate: 1800 } });
    const d = await r.json();
    const c = d?.data?.cards?.[0];
    count = d?.data?.productOpportunities || 0;
    if (c?.product) top = { product: c.product, velocity: c.velocity, regionCount: c.regionCount };
  } catch { /* fall back to static copy */ }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: '#06060d', color: 'white', padding: '72px',
          justifyContent: 'space-between', fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg,#7c3aed,#06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '26px', fontWeight: 700,
          }}>N</div>
          <div style={{ display: 'flex', fontSize: '26px', color: '#a78bfa', fontWeight: 600 }}>Nova Trend Radar</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: '66px', fontWeight: 800, lineHeight: 1.05 }}>What&apos;s about to sell —</div>
          <div style={{ display: 'flex', fontSize: '66px', fontWeight: 800, lineHeight: 1.05, color: '#8b5cf6' }}>before it peaks.</div>
        </div>

        {top ? (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '8px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: '18px', padding: '28px 32px',
          }}>
            <div style={{ display: 'flex', fontSize: '24px', color: '#6b7280' }}>Trending right now</div>
            <div style={{ display: 'flex', fontSize: '42px', fontWeight: 700 }}>{top.product}</div>
            <div style={{ display: 'flex', fontSize: '24px', color: '#34d399' }}>
              {top.velocity}/100{top.regionCount > 1 ? ` · trending in ${top.regionCount} countries` : ''}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', fontSize: '30px', color: '#9ca3af' }}>Live demand signal for resellers. No login to look.</div>
        )}

        <div style={{ display: 'flex', fontSize: '26px', color: '#9ca3af' }}>
          {count > 0 ? `${count} live product opportunities on the board now` : 'novanexus — the intelligence layer'}
        </div>
      </div>
    ),
    { ...size }
  );
}
