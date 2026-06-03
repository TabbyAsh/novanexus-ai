'use client';

/**
 * ZeroPointField
 * ==============
 * Simulates quantum vacuum fluctuations — the zero-point energy of empty space.
 * Virtual particles appear and annihilate. Energy flickers in and out of existence.
 * The void is not empty. It only looks that way.
 *
 * Particle types:
 *   star  — stable virtual particle. lives 1–4s. gentle sine pulse.
 *   foam  — quantum foam. lives 80–450ms. flickers violently. barely visible.
 *   spark — high-energy event. lives 200–700ms. briefly bright. faint halo.
 *
 * Burst events: clusters of 4–14 particles at a random point, every 3–8s.
 * Virtual pairs: two particles that spawn close together simultaneously (rare).
 */

import { useEffect, useRef } from 'react';

// ─── Color palette ─────────────────────────────────────────────────────────────
// Quantum vacuum has a cold, UV-tinged character. No warm colors.
const PALETTE: [number, number, number][] = [
  [255, 255, 255],   // pure white        ×4 — most common
  [255, 255, 255],
  [255, 255, 255],
  [255, 255, 255],
  [230, 240, 255],   // cold blue-white   ×3
  [230, 240, 255],
  [230, 240, 255],
  [200, 220, 255],   // blue-white        ×2
  [200, 220, 255],
  [170, 210, 255],   // deeper blue-white ×1
  [100, 190, 255],   // quantum blue      ×1  (rare)
  [  0, 245, 255],   // cyan spark        ×1  (very rare)
];

type PType = 'star' | 'foam' | 'spark';

interface Particle {
  x: number;
  y: number;
  r: number;           // radius px
  age: number;         // ms elapsed
  maxAge: number;      // ms total life
  peakAt: number;      // fraction of life where opacity peaks (0–1)
  maxOpacity: number;  // opacity ceiling
  color: [number, number, number];
  type: PType;
  phase: number;       // random phase offset for pulse sine
}

// ─── Particle factory ──────────────────────────────────────────────────────────

const CFG: Record<PType, {
  ageRange: [number, number];
  rRange: [number, number];
  opRange: [number, number];
  peakAt: number;
}> = {
  star:  { ageRange: [1000, 4000], rRange: [0.3, 1.5], opRange: [0.20, 0.65], peakAt: 0.25 },
  foam:  { ageRange: [80,   450],  rRange: [0.15, 0.7], opRange: [0.08, 0.28], peakAt: 0.12 },
  spark: { ageRange: [180,  700],  rRange: [0.8, 2.4],  opRange: [0.55, 1.00], peakAt: 0.08 },
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randColor(): [number, number, number] {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

function makeParticle(
  w: number,
  h: number,
  type: PType,
  x?: number,
  y?: number,
): Particle {
  const c = CFG[type];
  return {
    x: x ?? Math.random() * w,
    y: y ?? Math.random() * h,
    r: rand(c.rRange[0], c.rRange[1]),
    age: 0,
    maxAge: rand(c.ageRange[0], c.ageRange[1]),
    peakAt: c.peakAt + Math.random() * 0.15,
    maxOpacity: rand(c.opRange[0], c.opRange[1]),
    color: randColor(),
    type,
    phase: Math.random() * Math.PI * 2,
  };
}

// ─── Opacity curve ─────────────────────────────────────────────────────────────

function opacity(p: Particle, ts: number): number {
  const t = p.age / p.maxAge; // 0 → 1
  let o: number;

  if (t <= p.peakAt) {
    // Rise
    o = t / p.peakAt;
  } else {
    // Fall
    o = 1 - (t - p.peakAt) / (1 - p.peakAt);
  }
  o = Math.max(0, Math.min(1, o));

  if (p.type === 'star') {
    // Slow breathing sine
    o *= 0.72 + 0.28 * Math.sin(ts * 0.0018 + p.phase);
  } else if (p.type === 'foam') {
    // Violent stochastic flicker — 40% of frames are dark
    o *= Math.random() > 0.38 ? 1 : 0;
  }
  // spark: no modifier — short, clean burst

  return o * p.maxOpacity;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ZeroPointField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animId: number;
    let W = 0;
    let H = 0;
    let lastTs = 0;
    let lastBurst = 0;
    let particles: Particle[] = [];

    // ── Resize ──────────────────────────────────────────────────────────────────
    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width  = W;
      canvas!.height = H;
    }

    // ── Burst event ─────────────────────────────────────────────────────────────
    function burst() {
      const cx = Math.random() * W;
      const cy = Math.random() * H;
      const n  = 4 + Math.floor(Math.random() * 11);
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = Math.random() * 55;
        const type: PType = Math.random() < 0.35 ? 'spark' : 'star';
        particles.push(makeParticle(
          W, H, type,
          cx + Math.cos(angle) * dist,
          cy + Math.sin(angle) * dist,
        ));
      }
    }

    // ── Virtual pair event ──────────────────────────────────────────────────────
    function virtualPair() {
      const cx = Math.random() * W;
      const cy = Math.random() * H;
      const d  = 3 + Math.random() * 12; // separation
      const a  = Math.random() * Math.PI * 2;
      particles.push(makeParticle(W, H, 'spark', cx + Math.cos(a) * d, cy + Math.sin(a) * d));
      particles.push(makeParticle(W, H, 'spark', cx - Math.cos(a) * d, cy - Math.sin(a) * d));
    }

    // ── Density targets ─────────────────────────────────────────────────────────
    const T_STAR  = 200;
    const T_FOAM  = 50;

    // ── Pre-populate (staggered ages so field is alive from frame 1) ─────────────
    for (let i = 0; i < T_STAR; i++) {
      const p = makeParticle(W, H, 'star');
      p.age = Math.random() * p.maxAge;
      particles.push(p);
    }
    for (let i = 0; i < T_FOAM; i++) {
      const p = makeParticle(W, H, 'foam');
      p.age = Math.random() * p.maxAge;
      particles.push(p);
    }

    // ── Animation loop ──────────────────────────────────────────────────────────
    function frame(ts: number) {
      const dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
      lastTs = ts;

      // True black void — no partial fill, full clear
      ctx!.fillStyle = '#000000';
      ctx!.fillRect(0, 0, W, H);

      // Spawn to maintain target density (cap per-frame to avoid spikes)
      const starCount = particles.filter(p => p.type === 'star').length;
      const foamCount = particles.filter(p => p.type === 'foam').length;
      const spawnStars = Math.min(Math.max(0, T_STAR - starCount), 5);
      const spawnFoam  = Math.min(Math.max(0, T_FOAM - foamCount), 8);
      for (let i = 0; i < spawnStars; i++) particles.push(makeParticle(W, H, 'star'));
      for (let i = 0; i < spawnFoam;  i++) particles.push(makeParticle(W, H, 'foam'));

      // Burst timer
      if (ts - lastBurst > 3000 + Math.random() * 5000) {
        lastBurst = ts;
        burst();
        if (Math.random() < 0.3) virtualPair();
      }

      // Draw and prune
      const alive: Particle[] = [];
      for (const p of particles) {
        p.age += dt;
        if (p.age >= p.maxAge) continue;

        const a = opacity(p, ts);
        if (a < 0.001) { alive.push(p); continue; }

        const [r, g, b] = p.color;

        // Core particle
        ctx!.globalAlpha = a;
        ctx!.fillStyle = `rgb(${r},${g},${b})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();

        // Sparks get a subtle radial halo
        if (p.type === 'spark' && a > 0.35) {
          const grad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
          grad.addColorStop(0, `rgba(${r},${g},${b},${a * 0.35})`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx!.fillStyle = grad;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
          ctx!.fill();
        }

        alive.push(p);
      }

      ctx!.globalAlpha = 1;
      particles = alive;
      animId = requestAnimationFrame(frame);
    }

    // ── Init ────────────────────────────────────────────────────────────────────
    resize();
    window.addEventListener('resize', resize, { passive: true });
    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, display: 'block', background: '#000' }}
    />
  );
}
