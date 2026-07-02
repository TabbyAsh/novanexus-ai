import Link from 'next/link';

/**
 * A sector door — the public face of one nebula. One promise, one tool,
 * zero mythology tax. (Two-Depths Doctrine: sectors are public by design;
 * the world behind them is a link, never a prerequisite.)
 */
export interface SectorDoorProps {
  name: string;
  accent: string;         // sector color
  promise: string;        // the one-line promise
  sub: string;            // one supporting sentence
  points: string[];       // 3 concrete things the visitor gets
  ctaLabel: string;
  ctaHref: string;
  disclaimer?: string;
}

export default function SectorDoor(p: SectorDoorProps) {
  return (
    <div className="min-h-screen bg-[#01030a] text-white flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between">
        <Link href="/" className="text-[11px] tracking-[0.35em] uppercase no-underline" style={{ color: '#7fa6c2' }}>
          novanexus
        </Link>
        <Link href="/world" className="text-[11px] tracking-[0.25em] uppercase no-underline" style={{ color: '#3d5266' }}>
          the world behind this →
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full text-center py-16">
          <div className="text-[12px] tracking-[0.45em] uppercase mb-6" style={{ color: p.accent }}>
            {p.name}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-5">{p.promise}</h1>
          <p className="text-gray-400 text-lg mb-10">{p.sub}</p>

          <div className="grid gap-3 text-left mb-10">
            {p.points.map((pt, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg px-4 py-3"
                   style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ color: p.accent }}>→</span>
                <span className="text-gray-300 text-sm">{pt}</span>
              </div>
            ))}
          </div>

          <Link
            href={p.ctaHref}
            className="inline-block px-10 py-4 rounded-full font-semibold text-black no-underline text-lg"
            style={{ background: p.accent, boxShadow: `0 0 40px ${p.accent}44` }}
          >
            {p.ctaLabel}
          </Link>

          {p.disclaimer && (
            <p className="mt-8 text-[11px] text-gray-600 max-w-md mx-auto">{p.disclaimer}</p>
          )}
        </div>
      </main>
    </div>
  );
}
