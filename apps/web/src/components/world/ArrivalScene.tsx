'use client';

/**
 * THE ARRIVAL — the 3D body of the Nexus threshold.
 *
 * Canon (NOVA-WORLD-CANON.md):
 *  §I  darkness with something enormous inside → a point of northern light
 *      notices the visitor → supernova, each atom a neuron → atoms assemble
 *      the wide X (the Nexus) → the X rounds into the text window.
 *  §II Nova breathes when idle, tightens when thinking, stills when found.
 *  §III one agent is a mote with intention; discovery flares travel to Nova.
 *  §IV nebulae earn their light from real activity; unborn sectors appear
 *      as forming dust — never faked complete (Law Six).
 *  §V  the visitor is carried, not clicked; stillness is allowed.
 *
 * Law One: every swarm mote and every nebula's brightness is driven by the
 * /v1/world/pulse feed — real rows, real quotes. No decorative agents.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

// ── Shared mutable state (written by driver/UI, read in useFrame) ─────
export type NovaMode = 'idle' | 'thinking' | 'found';
export type Phase = 'void' | 'noticed' | 'nova' | 'nexus' | 'open';

export interface WorldStage {
  phase: Phase;
  elapsed: number;      // seconds since arrival
  novaIntro: number;    // 0..1 core bloom
  nexusP: number;       // 0..2 (0→1 assemble X, 1→2 round into window)
  mode: NovaMode;
  skip: boolean;        // visitor chose action over spectacle (Law Four)
}

export interface SwarmEventInput {
  id: string;
  sector: 'core' | 'market' | 'bazaar' | 'forge';
  fresh: boolean; // arrived during this session → flare
}

export interface NebulaData {
  key: 'market' | 'bazaar' | 'forge';
  label: string;
  sub: string | null;   // real stat line, or null when the sector is dark
  active: number;       // 0..1 earned light (0.08 = forming)
  weather: number;      // -1..1 (market red/green pressure), 0 otherwise
  href: string;
}

const PHASE_T = { void: 1.4, noticed: 4.2, nova: 7.2, nexus: 10.4 };

const SECTOR_COLOR: Record<string, THREE.Color> = {
  core:   new THREE.Color('#9be8ff'),
  market: new THREE.Color('#cfe0ff'),
  bazaar: new THREE.Color('#ffc773'),
  forge:  new THREE.Color('#c69bff'),
};

const NEBULA_POS: Record<string, [number, number, number]> = {
  market: [-13, 3.5, -26],
  bazaar: [12, -2.5, -24],
  forge:  [2, 7.5, -30],
};

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── Phase driver — the world's clock ──────────────────────────────────
function PhaseDriver({ stage, onOpen }: { stage: WorldStage; onOpen: () => void }) {
  const opened = useRef(false);
  useFrame((_, dt) => {
    stage.elapsed += dt;
    if (stage.skip) stage.elapsed = Math.max(stage.elapsed, PHASE_T.nexus + 0.01);

    const t = stage.elapsed;
    stage.phase =
      t < PHASE_T.void ? 'void' :
      t < PHASE_T.noticed ? 'noticed' :
      t < PHASE_T.nova ? 'nova' :
      t < PHASE_T.nexus ? 'nexus' : 'open';

    stage.novaIntro = ease(clamp01((t - PHASE_T.noticed) / (PHASE_T.nova - PHASE_T.noticed)));
    stage.nexusP = clamp01((t - PHASE_T.nova) / ((PHASE_T.nexus - PHASE_T.nova) / 2))
                 + clamp01((t - (PHASE_T.nova + (PHASE_T.nexus - PHASE_T.nova) / 2)) / ((PHASE_T.nexus - PHASE_T.nova) / 2));

    if (stage.phase === 'open' && !opened.current) {
      opened.current = true;
      onOpen();
    }
  });
  return null;
}

// ── Camera — carried, not controlled (§V) ─────────────────────────────
function Rig({ stage }: { stage: WorldStage }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    const dolly = 8 - 2 * ease(clamp01(stage.elapsed / PHASE_T.nexus)); // 8 → 6
    camera.position.x += (pointer.x * 0.35 - camera.position.x) * 0.03;
    camera.position.y += (-pointer.y * 0.22 - camera.position.y) * 0.03;
    camera.position.z += (dolly - camera.position.z) * 0.02;
    camera.lookAt(0, -0.25, 0);
  });
  return null;
}

// ── The dark that is not empty (§I) ───────────────────────────────────
function DustField({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * 44;
      a[i * 3 + 1] = (Math.random() - 0.5) * 26;
      a[i * 3 + 2] = -4 - Math.random() * 30;
    }
    return a;
  }, [count]);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.004;
      ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.01) * 0.02;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        color="#5a7a9a" size={0.02} transparent opacity={0.35}
        sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}
      />
    </points>
  );
}

// ── The light that notices the visitor (§I) ───────────────────────────
function NoticingLight({ stage }: { stage: WorldStage }) {
  const ref = useRef<THREE.Sprite>(null);
  const from = useMemo(() => new THREE.Vector3(4.6, 2.6, -7), []);
  useFrame(() => {
    if (!ref.current) return;
    const p = ease(clamp01((stage.elapsed - PHASE_T.void) / (PHASE_T.noticed - PHASE_T.void)));
    const visible = stage.phase === 'void' || stage.phase === 'noticed';
    ref.current.visible = visible || stage.novaIntro < 0.15;
    ref.current.position.lerpVectors(from, new THREE.Vector3(0, 0, 0), p);
    const s = 0.06 + p * 0.5 + stage.novaIntro * 0.4;
    ref.current.scale.setScalar(s);
    (ref.current.material as THREE.SpriteMaterial).opacity = 0.25 + p * 0.75;
  });
  const map = useGlowTexture('#bffff0');
  return (
    <sprite ref={ref}>
      <spriteMaterial map={map} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#aefadf" />
    </sprite>
  );
}

// Soft radial glow texture, generated once — no asset pipeline needed.
function useGlowTexture(hex: string) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, hex);
    grad.addColorStop(0.35, hex + 'aa');
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, [hex]);
}

// ── NOVA — the core; each atom a neuron (§I–II) ───────────────────────
function NovaCore({ stage, atomCount }: { stage: WorldStage; atomCount: number }) {
  const group = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const smooth = useRef({ tighten: 1, spin: 1 });

  // Fibonacci sphere — evenly-breathing atoms.
  const base = useMemo(() => {
    const a = new Float32Array(atomCount * 3);
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < atomCount; i++) {
      const y = 1 - (i / (atomCount - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = phi * i;
      const jitter = 0.94 + Math.random() * 0.12;
      a[i * 3] = Math.cos(th) * r * jitter;
      a[i * 3 + 1] = y * jitter;
      a[i * 3 + 2] = Math.sin(th) * r * jitter;
    }
    return a;
  }, [atomCount]);

  // Neuron firings — short-lived lines between atoms (pool of 8).
  const firings = useMemo(
    () => Array.from({ length: 8 }, () => ({ a: 0, b: 0, life: Math.random() * 1.5 })),
    []
  );
  const fireLines = useRef<(THREE.Line | null)[]>([]);

  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();

    // Mode targets: idle breathes, thinking tightens+quickens, found stills.
    const target =
      stage.mode === 'thinking' ? { tighten: 0.82, spin: 2.4 } :
      stage.mode === 'found' ? { tighten: 0.96, spin: 0.08 } :
      { tighten: 1, spin: 1 };
    smooth.current.tighten += (target.tighten - smooth.current.tighten) * 0.04;
    smooth.current.spin += (target.spin - smooth.current.spin) * 0.05;

    const breath = stage.mode === 'found' ? 1 : 1 + Math.sin(t * 0.6) * 0.03;
    group.current.scale.setScalar(Math.max(0.0001, stage.novaIntro * breath * smooth.current.tighten));
    group.current.rotation.y = t * 0.12 * smooth.current.spin;

    // Neuron firings
    for (let i = 0; i < firings.length; i++) {
      const f = firings[i];
      f.life -= dt;
      const line = fireLines.current[i];
      if (f.life <= 0 && stage.mode !== 'found' && stage.novaIntro > 0.6) {
        f.a = Math.floor(Math.random() * atomCount);
        f.b = Math.floor(Math.random() * atomCount);
        f.life = 0.3 + Math.random() * 0.8;
        if (line) {
          const pos = (line.geometry.getAttribute('position') as THREE.BufferAttribute);
          pos.setXYZ(0, base[f.a * 3], base[f.a * 3 + 1], base[f.a * 3 + 2]);
          pos.setXYZ(1, base[f.b * 3], base[f.b * 3 + 1], base[f.b * 3 + 2]);
          pos.needsUpdate = true;
        }
      }
      if (line) (line.material as THREE.LineBasicMaterial).opacity = Math.max(0, Math.min(0.5, f.life * 0.5));
    }
  });

  return (
    <group ref={group}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={atomCount} array={base} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          color="#d8f6ff" size={0.028} transparent opacity={0.95}
          sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </points>

      {/* Inner light — a center so bright it feels quiet */}
      <mesh>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshBasicMaterial color="#eafcff" transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh scale={1.9}>
        <sphereGeometry args={[0.32, 16, 16]} />
        <meshBasicMaterial
          color="#7dd8ff" transparent opacity={0.1} side={THREE.BackSide}
          blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </mesh>

      {/* Rings that do not fully close — lines that almost become a crown */}
      {[0.55, 0.2, -0.4].map((tilt, i) => (
        <mesh key={i} rotation={[Math.PI / 2 + tilt, 0, i * 1.3]}>
          <torusGeometry args={[1.35 + i * 0.16, 0.006, 8, 96, Math.PI * 1.72]} />
          <meshBasicMaterial color="#9fe6ff" transparent opacity={0.35 - i * 0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}

      {/* Neuron firing lines */}
      {Array.from({ length: 8 }).map((_, i) => (
        <line
          key={i}
          ref={(el: any) => { fireLines.current[i] = el; }}
        >
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={2} array={new Float32Array(6)} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#bff3ff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
        </line>
      ))}
    </group>
  );
}

// ── THE NEXUS — atoms assemble the X, the X rounds into the window (§I) ─
function roundedRectPoint(u: number, w: number, h: number, r: number, cy: number): [number, number] {
  // Walk the perimeter of a rounded rect (centered x=0, centered y=cy).
  const straightW = w - 2 * r, straightH = h - 2 * r;
  const per = 2 * straightW + 2 * straightH + 2 * Math.PI * r;
  let d = u * per;
  const hw = w / 2, hh = h / 2;
  // top edge (left→right)
  if (d < straightW) return [-straightW / 2 + d, cy + hh];
  d -= straightW;
  if (d < (Math.PI / 2) * r) { const a = d / r; return [straightW / 2 + Math.sin(a) * r, cy + hh - r + Math.cos(a) * r]; }
  d -= (Math.PI / 2) * r;
  if (d < straightH) return [hw, cy + hh - r - d];
  d -= straightH;
  if (d < (Math.PI / 2) * r) { const a = d / r; return [hw - r + Math.cos(a) * r, cy - hh + r - Math.sin(a) * r]; }
  d -= (Math.PI / 2) * r;
  if (d < straightW) return [straightW / 2 - d, cy - hh];
  d -= straightW;
  if (d < (Math.PI / 2) * r) { const a = d / r; return [-straightW / 2 - Math.sin(a) * r, cy - hh + r - Math.cos(a) * r]; }
  d -= (Math.PI / 2) * r;
  if (d < straightH) return [-hw, cy - hh + r + d];
  d -= straightH;
  const a = d / r;
  return [-hw + r - Math.cos(a) * r, cy + hh - r + Math.sin(a) * r];
}

function NexusWindow({ stage, count }: { stage: WorldStage; count: number }) {
  const ref = useRef<THREE.Points>(null);
  const CY = -1.15; // below the core, meeting the DOM window's landing spot

  const { birth, xShape, rect, delays } = useMemo(() => {
    const birth = new Float32Array(count * 3);
    const xShape = new Float32Array(count * 3);
    const rect = new Float32Array(count * 3);
    const delays = new Float32Array(count);
    const half = Math.floor(count / 2);
    for (let i = 0; i < count; i++) {
      // Born at the core's underside
      birth[i * 3] = (Math.random() - 0.5) * 0.4;
      birth[i * 3 + 1] = -0.6 + (Math.random() - 0.5) * 0.3;
      birth[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      // The wide X — much wider than it is tall
      const onA = i < half;
      const s = ((onA ? i : i - half) / (half - 1)) * 2 - 1;
      xShape[i * 3] = s * 1.7 + (Math.random() - 0.5) * 0.03;
      xShape[i * 3 + 1] = CY + (onA ? s : -s) * 0.3 + (Math.random() - 0.5) * 0.03;
      xShape[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
      // The window outline
      const [rx, ry] = roundedRectPoint(i / count, 3.5, 0.62, 0.22, CY);
      rect[i * 3] = rx; rect[i * 3 + 1] = ry; rect[i * 3 + 2] = 0;
      delays[i] = Math.random() * 0.25;
    }
    return { birth, xShape, rect, delays };
  }, [count]);

  const positions = useMemo(() => new Float32Array(birth), [birth]);

  useFrame(() => {
    if (!ref.current) return;
    const attr = ref.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = stage.nexusP;
    for (let i = 0; i < count; i++) {
      const d = delays[i];
      const p1 = ease(clamp01((Math.min(p, 1) - d) / (1 - d)));
      const p2 = ease(clamp01((Math.max(p - 1, 0) - d) / (1 - d)));
      for (let k = 0; k < 3; k++) {
        const from = birth[i * 3 + k] + (xShape[i * 3 + k] - birth[i * 3 + k]) * p1;
        attr.array[i * 3 + k] = from + (rect[i * 3 + k] - from) * p2;
      }
    }
    attr.needsUpdate = true;
    // Once the window is formed the DOM input carries it; the outline recedes to an echo.
    (ref.current.material as THREE.PointsMaterial).opacity = stage.phase === 'open' ? 0.1 : 0.85;
  });

  return (
    <points ref={ref} visible={stage.nexusP > 0.001}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        color="#aeefff" size={0.025} transparent opacity={0.85}
        sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}
      />
    </points>
  );
}

// ── THE SWARM — motes with intention, bound to real events (§III) ─────
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

const MAX_MOTES = 48;
const MAX_THREADS = 6;

function Swarm({ stage, events }: { stage: WorldStage; events: SwarmEventInput[] }) {
  const ref = useRef<THREE.Points>(null);
  const threadRefs = useRef<(THREE.Line | null)[]>([]);
  const threads = useRef<{ mote: number; life: number }[]>([]);
  const seen = useRef<Set<string>>(new Set());

  const motes = useMemo(() => {
    return events.slice(0, MAX_MOTES).map((e) => {
      const seed = hashSeed(e.id);
      const home = e.sector === 'core'
        ? new THREE.Vector3(0, 0, 0)
        : new THREE.Vector3(...NEBULA_POS[e.sector]).normalize().multiplyScalar(3.6 + seed * 1.6);
      return {
        id: e.id, sector: e.sector, seed, home,
        r: e.sector === 'core' ? 1.9 + seed * 0.9 : 0.5 + seed * 0.9,
        speed: 0.25 + seed * 0.6,
        tilt: seed * Math.PI,
      };
    });
  }, [events]);

  // Flares: any event marked fresh that we haven't flared yet (§III — it flares,
  // the flare travels back toward Nova).
  useMemo(() => {
    motes.forEach((m, idx) => {
      const src = events.find(e => e.id === m.id);
      if (src?.fresh && !seen.current.has(m.id)) {
        seen.current.add(m.id);
        if (threads.current.length < MAX_THREADS) threads.current.push({ mote: idx, life: 2.2 });
      }
    });
  }, [motes, events]);

  const positions = useMemo(() => new Float32Array(MAX_MOTES * 3), []);
  const colors = useMemo(() => {
    const c = new Float32Array(MAX_MOTES * 3);
    motes.forEach((m, i) => {
      const col = SECTOR_COLOR[m.sector];
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    });
    return c;
  }, [motes]);

  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const focus = stage.mode === 'thinking' ? 0.45 : 1; // swarm-focus: trails shorten, motion exact
    const attr = ref.current.geometry.getAttribute('position') as THREE.BufferAttribute;

    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const a = t * m.speed * (stage.mode === 'thinking' ? 1.8 : 1) + m.seed * 20;
      const wobble = Math.sin(t * 0.7 + m.seed * 30) * 0.15 * focus;
      const x = m.home.x + Math.cos(a) * m.r * focus;
      const y = m.home.y + Math.sin(a * 0.9 + m.tilt) * m.r * 0.35 * focus + wobble;
      const z = m.home.z + Math.sin(a) * m.r * focus * 0.8;
      attr.setXYZ(i, x, y, z);
    }
    attr.needsUpdate = true;
    ref.current.geometry.setDrawRange(0, motes.length);
    (ref.current.material as THREE.PointsMaterial).opacity = stage.novaIntro * 0.9;

    // Threads — discovery light traveling home
    threads.current.forEach((th, ti) => {
      th.life -= dt;
      const line = threadRefs.current[ti];
      if (!line) return;
      const alive = th.life > 0 && th.mote < motes.length;
      (line.material as THREE.LineBasicMaterial).opacity = alive ? Math.min(0.6, th.life * 0.45) : 0;
      if (alive) {
        const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        pos.setXYZ(0, attr.getX(th.mote), attr.getY(th.mote), attr.getZ(th.mote));
        pos.setXYZ(1, 0, 0, 0);
        pos.needsUpdate = true;
      }
    });
    threads.current = threads.current.filter(th => th.life > 0);
  });

  return (
    <group>
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={MAX_MOTES} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={MAX_MOTES} array={colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors size={0.06} transparent opacity={0.9}
          sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </points>
      {Array.from({ length: MAX_THREADS }).map((_, i) => (
        <line key={i} ref={(el: any) => { threadRefs.current[i] = el; }}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={2} array={new Float32Array(6)} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#e8fbff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
        </line>
      ))}
    </group>
  );
}

// ── THE NEBULAE — light earned from real activity (§IV, Law Six) ──────
function Nebula({ data, stage }: { data: NebulaData; stage: WorldStage }) {
  const group = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Sprite>(null);
  const pos = NEBULA_POS[data.key];

  const cloud = useMemo(() => {
    const n = 130;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // gaussian-ish cluster
      const r = (Math.random() + Math.random() + Math.random()) / 3 * 2.6;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      a[i * 3] = Math.sin(ph) * Math.cos(th) * r * 1.6;
      a[i * 3 + 1] = Math.cos(ph) * r * 0.7;
      a[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    return a;
  }, []);

  const baseColor = data.key === 'market' ? '#cfe0ff' : data.key === 'bazaar' ? '#ffc773' : '#c69bff';
  // Market weather: pressure tints the storm — green expansion, red flare (§IV).
  const weatherColor = data.weather > 0.05 ? '#7dffb0' : data.weather < -0.05 ? '#ff8a7d' : baseColor;
  const glowMap = useGlowTexture(baseColor);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.rotation.y = t * 0.03 * (0.5 + data.active);
    const pulse = 1 + Math.sin(t * (0.4 + data.active * 1.2)) * 0.06 * data.active;
    group.current.scale.setScalar(pulse * stage.novaIntro);
    if (glowRef.current) {
      (glowRef.current.material as THREE.SpriteMaterial).opacity =
        (0.04 + data.active * 0.13) * stage.novaIntro;
    }
  });

  return (
    <group position={pos}>
      <group ref={group}>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={130} array={cloud} itemSize={3} />
          </bufferGeometry>
          <pointsMaterial
            color={weatherColor} size={0.09} transparent
            opacity={0.12 + data.active * 0.5}
            sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}
          />
        </points>
        <sprite ref={glowRef} scale={7}>
          <spriteMaterial map={glowMap} transparent blending={THREE.AdditiveBlending} depthWrite={false} color={baseColor} opacity={0.08} />
        </sprite>
      </group>
      {stage.phase === 'open' && (
        <Html center distanceFactor={26} style={{ pointerEvents: 'auto' }}>
          <a
            href={data.href}
            className="block text-center no-underline select-none"
            style={{ fontFamily: 'inherit' }}
          >
            <div className="text-[13px] tracking-[0.3em] uppercase" style={{ color: baseColor, opacity: 0.9 }}>
              {data.label}
            </div>
            <div className="text-[10px] mt-1" style={{ color: '#8fa8bf', opacity: 0.85 }}>
              {data.sub ?? 'forming — the gravity is already here'}
            </div>
          </a>
        </Html>
      )}
    </group>
  );
}

// The unborn — dust rings, gravity without shape yet (§IV).
function UnbornNebulae() {
  const rings = useMemo(() => {
    const make = (cx: number, cy: number, cz: number, R: number) => {
      const n = 90;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2;
        a[i * 3] = cx + Math.cos(th) * R + (Math.random() - 0.5) * 0.8;
        a[i * 3 + 1] = cy + (Math.random() - 0.5) * 0.5;
        a[i * 3 + 2] = cz + Math.sin(th) * R * 0.6;
      }
      return a;
    };
    return [make(-22, -8, -38, 3), make(24, 9, -42, 3.6)];
  }, []);
  return (
    <>
      {rings.map((r, i) => (
        <points key={i}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={90} array={r} itemSize={3} />
          </bufferGeometry>
          <pointsMaterial color="#6b7f95" size={0.05} transparent opacity={0.10} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
        </points>
      ))}
    </>
  );
}

// ── Composition ───────────────────────────────────────────────────────
export default function ArrivalScene({
  stage, events, nebulae, isMobile, onOpen,
}: {
  stage: WorldStage;
  events: SwarmEventInput[];
  nebulae: NebulaData[];
  isMobile: boolean;
  onOpen: () => void;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 45 }}
      style={{ background: '#02040a' }}
      gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
      dpr={isMobile ? 1 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)}
    >
      <PhaseDriver stage={stage} onOpen={onOpen} />
      <Rig stage={stage} />
      <DustField count={isMobile ? 400 : 900} />
      <NoticingLight stage={stage} />
      <NovaCore stage={stage} atomCount={isMobile ? 500 : 1100} />
      <NexusWindow stage={stage} count={isMobile ? 160 : 260} />
      <Swarm stage={stage} events={events} />
      {nebulae.map(n => <Nebula key={n.key} data={n} stage={stage} />)}
      <UnbornNebulae />
    </Canvas>
  );
}
