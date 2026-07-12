'use client';

/**
 * THE ARRIVAL v2 — the body of the Nexus threshold.
 *
 * The founder's sequence, exactly (NOVA-WORLD-CANON.md + direction 2026-07-02):
 *   the north star comes center stage → detonates into a NOVA → matter forms →
 *   the core births and DEPLOYS agents into orbit → matter assembles the wide X →
 *   star + X hold together as the NovaNexus logo (wordmark lands) → the X rounds
 *   into the text window. Your words are in the Nexus.
 *
 * Living behaviors (the loop, visible):
 *   DEPLOYMENT  — every agent is born from the core; new real pulse events birth
 *                 new agents mid-session.
 *   SELF-HEAL   — aging agents are drawn home, absorbed, and redeployed.
 *   REFINEMENT  — nearby agents exchange light; the receiver brightens.
 *   EXPANSION   — the swarm's population is the real event feed, nothing else.
 *
 * Law One: motes = real events; nebula light = real data; ambient life dims to
 * stillness when the pulse goes dark. Law Four: skip compresses time (×6) — the
 * logo moment always plays, never amputated.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

// ── Shared mutable stage (written by driver/UI, read in useFrame) ─────
export type NovaMode = 'idle' | 'thinking' | 'found';
export type Beat = 'void' | 'star' | 'detonation' | 'formation' | 'sigil' | 'window' | 'open';

export interface WorldStage {
  t: number;            // world-time (seconds, skip-compressed)
  beat: Beat;
  beatT: number;        // 0..1 progress within the current beat
  mode: NovaMode;
  skip: boolean;
  pulseAlive: boolean;  // real feed reachable — ambient life allowed
}

export interface SwarmEventInput {
  id: string;
  sector: 'core' | 'market' | 'bazaar' | 'forge';
  kind: string;   // card | flip | outcome | agent | event — the mote's real work
  fresh: boolean;
}

// An encounter surfaced to the DOM — the world explains itself (§7).
export interface EncounterNotice {
  reason: string;
}

export interface NebulaData {
  key: 'market' | 'bazaar' | 'forge';
  label: string;
  sub: string | null;
  active: number;
  weather: number;
  href: string;
}

// Beat boundaries (seconds of world-time)
const B = { star: 1.2, detonation: 3.8, formation: 4.6, sigil: 7.6, window: 10.6, open: 12.0 };

const SECTOR_COLOR: Record<string, THREE.Color> = {
  core:   new THREE.Color('#a5ecff'),
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
// back-out: matter overshoots its target, then settles — formation has weight
const backOut = (p: number) => { const c = 1.4; const q = p - 1; return 1 + (c + 1) * q * q * q + c * q * q; };

function beatOf(t: number): { beat: Beat; beatT: number } {
  if (t < B.star)       return { beat: 'void',       beatT: t / B.star };
  if (t < B.detonation) return { beat: 'star',       beatT: (t - B.star) / (B.detonation - B.star) };
  if (t < B.formation)  return { beat: 'detonation', beatT: (t - B.detonation) / (B.formation - B.detonation) };
  if (t < B.sigil)      return { beat: 'formation',  beatT: (t - B.formation) / (B.sigil - B.formation) };
  if (t < B.window)     return { beat: 'sigil',      beatT: (t - B.sigil) / (B.window - B.sigil) };
  if (t < B.open)       return { beat: 'window',     beatT: (t - B.window) / (B.open - B.window) };
  return { beat: 'open', beatT: 1 };
}

// Global intro factor: 0 before detonation, 1 after (with fast rise)
function novaBorn(stage: WorldStage): number {
  return clamp01((stage.t - B.detonation) / 0.5);
}

// ── Soft-glow point shader — the difference between dots and light ────
function makeGlowPoints(maxCount: number, baseSize: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxCount * 3), 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(maxCount * 3), 3));
  const sizes = new Float32Array(maxCount);
  const phases = new Float32Array(maxCount);
  for (let i = 0; i < maxCount; i++) { sizes[i] = 0.55 + Math.random(); phases[i] = Math.random(); }
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uScale: { value: baseSize },
      uTwinkle: { value: 1 },
      uPixelRatio: { value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1 },
    },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aPhase; attribute vec3 aColor;
      uniform float uTime; uniform float uScale; uniform float uTwinkle; uniform float uPixelRatio;
      varying float vAlpha; varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 1.0 - uTwinkle * 0.35 * (0.5 + 0.5 * sin(uTime * (1.0 + aPhase * 2.4) + aPhase * 43.0));
        vAlpha = tw; vColor = aColor;
        // uScale ≈ on-screen pixels at the reference depth (z = 6)
        gl_PointSize = aSize * uScale * uPixelRatio * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying float vAlpha; varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(smoothstep(0.5, 0.0, d), 2.2);
        gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
      }`,
  });
  return { geometry, material };
}

function setColor(geo: THREE.BufferGeometry, i: number, c: THREE.Color, mul = 1) {
  const a = geo.getAttribute('aColor') as THREE.BufferAttribute;
  a.setXYZ(i, c.r * mul, c.g * mul, c.b * mul);
  a.needsUpdate = true;
}

// Soft radial glow texture for sprites
function useGlowTexture(hex: string, inner = '#ffffff') {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.18, hex);
    grad.addColorStop(0.5, hex + '44');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, [hex, inner]);
}

// ── The clock — drives beats, reports them upward once each ───────────
function Director({ stage, onBeat }: { stage: WorldStage; onBeat: (b: Beat) => void }) {
  const reported = useRef<Beat>('void');
  useFrame((_, dt) => {
    // Skip compresses time ×6 until the sigil has held — the logo always plays.
    const speed = stage.skip && stage.t < B.window - 0.6 ? 6 : 1;
    stage.t += dt * speed;
    const { beat, beatT } = beatOf(stage.t);
    stage.beat = beat; stage.beatT = beatT;
    if (beat !== reported.current) { reported.current = beat; onBeat(beat); }
  });
  return null;
}

// ── Camera — carried, with a push on the detonation ───────────────────
function Rig({ stage }: { stage: WorldStage }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    let z = 8 - 2 * ease(clamp01(stage.t / B.open));           // 8 → 6 drift in
    if (stage.beat === 'detonation') z -= 0.5 * Math.sin(stage.beatT * Math.PI); // the push
    const drift = stage.beat === 'open' ? Math.sin(stage.t * 0.05) * 0.4 : 0;
    camera.position.x += (pointer.x * 0.4 + drift - camera.position.x) * 0.03;
    camera.position.y += (-pointer.y * 0.25 - camera.position.y) * 0.03;
    camera.position.z += (z - camera.position.z) * 0.04;
    camera.lookAt(0, -0.2, 0);
  });
  return null;
}

// ── The dark that is not empty ─────────────────────────────────────────
function DeepField({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const { geometry, material } = useMemo(() => {
    const g = makeGlowPoints(count, 5);
    const pos = g.geometry.getAttribute('position') as THREE.BufferAttribute;
    const dim = new THREE.Color('#4a6a8a');
    for (let i = 0; i < count; i++) {
      pos.setXYZ(i, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 30, -4 - Math.random() * 34);
      setColor(g.geometry, i, dim, 0.25 + Math.random() * 0.5);
    }
    g.material.uniforms.uOpacity.value = 0.5;
    return g;
  }, [count]);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.getElapsedTime();
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.003;
  });
  return <points ref={ref} geometry={geometry} material={material} />;
}

// The enormous presence inside the dark — a vast, barely-there haze.
function TheEnormity() {
  const map = useGlowTexture('#0d2038', '#16304e');
  return (
    <sprite position={[0, 0, -20]} scale={70}>
      <spriteMaterial map={map} transparent opacity={0.5} depthWrite={false} />
    </sprite>
  );
}

// ── THE NORTH STAR — comes center stage, then detonates ───────────────
function NorthStar({ stage }: { stage: WorldStage }) {
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Sprite>(null);
  const from = useMemo(() => new THREE.Vector3(4.8, 2.8, -8), []);
  const map = useGlowTexture('#aef5e0');

  useFrame(() => {
    if (!group.current) return;
    const p = ease(clamp01((stage.t - B.star) / (B.detonation - B.star)));
    group.current.position.lerpVectors(from, new THREE.Vector3(0, 0, 0), p);
    // pre-detonation: grows, quickens; detonation: the star IS the flash core
    const pre = 0.1 + p * 0.5;
    const det = stage.beat === 'detonation' ? 1 + stage.beatT * 5 : 1;
    const fade = stage.t > B.formation ? Math.max(0, 1 - (stage.t - B.formation) * 2) : 1;
    group.current.scale.setScalar(pre * det);
    group.current.visible = fade > 0.01 && stage.t > B.star * 0.4;
    if (glow.current) (glow.current.material as THREE.SpriteMaterial).opacity = (0.5 + p * 0.5) * fade;
    // the flicker of imminence
    if (glow.current && p > 0.75 && stage.beat === 'star') {
      (glow.current.material as THREE.SpriteMaterial).opacity *= 0.85 + 0.15 * Math.sin(stage.t * 40);
    }
  });

  return (
    <group ref={group}>
      <sprite ref={glow} scale={1.4}>
        <spriteMaterial map={map} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      {/* the cross of a star seen by a human eye */}
      {[0, Math.PI / 2].map((r, i) => (
        <mesh key={i} rotation={[0, 0, r]}>
          <planeGeometry args={[0.014, 2.6]} />
          <meshBasicMaterial color="#d8fff2" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// The detonation shockwave — one ring, outward, gone.
function Shockwave({ stage }: { stage: WorldStage }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const p = clamp01((stage.t - B.detonation) / 1.1);
    ref.current.visible = p > 0 && p < 1;
    const s = 0.2 + ease(p) * 16;
    ref.current.scale.setScalar(s);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - p);
  });
  return (
    <mesh ref={ref} visible={false}>
      <ringGeometry args={[0.96, 1, 96]} />
      <meshBasicMaterial color="#bfeaff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── NOVA — matter formed by the detonation; each atom a neuron ────────
function NovaCore({ stage, atomCount }: { stage: WorldStage; atomCount: number }) {
  const group = useRef<THREE.Group>(null);
  const smooth = useRef({ tighten: 1, spin: 1, twinkle: 1 });
  const nucleus = useGlowTexture('#8fdcff');
  const nucleusFar = useGlowTexture('#5f86d8', '#9fd4ff');

  const { geometry, material, targets, stagger } = useMemo(() => {
    const g = makeGlowPoints(atomCount, 8);
    const targets = new Float32Array(atomCount * 3);
    const stagger = new Float32Array(atomCount);
    const phi = Math.PI * (3 - Math.sqrt(5));
    const inner = new THREE.Color('#eafcff');
    const rim = new THREE.Color('#7b6cf0');
    const tmp = new THREE.Color();
    for (let i = 0; i < atomCount; i++) {
      const y = 1 - (i / (atomCount - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = phi * i;
      const jitter = 0.9 + Math.random() * 0.2;
      targets[i * 3] = Math.cos(th) * r * jitter;
      targets[i * 3 + 1] = y * jitter;
      targets[i * 3 + 2] = Math.sin(th) * r * jitter;
      stagger[i] = Math.random() * 0.35;
      // white-blue heart, violet rim — the first light before sunrise
      tmp.lerpColors(inner, rim, Math.abs(y) * 0.35 + (jitter - 0.9) * 2.2);
      setColor(g.geometry, i, tmp, 0.85 + Math.random() * 0.3);
    }
    return { ...g, targets, stagger };
  }, [atomCount]);

  const firings = useMemo(() => Array.from({ length: 10 }, () => ({ a: 0, b: 0, life: Math.random() })), []);
  const fireLines = useRef<(THREE.Line | null)[]>([]);

  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = t;

    const target =
      stage.mode === 'thinking' ? { tighten: 0.8, spin: 2.6, twinkle: 2.2 } :
      stage.mode === 'found' ? { tighten: 0.97, spin: 0.05, twinkle: 0.1 } :
      { tighten: 1, spin: 1, twinkle: 1 };
    smooth.current.tighten += (target.tighten - smooth.current.tighten) * 0.045;
    smooth.current.spin += (target.spin - smooth.current.spin) * 0.05;
    smooth.current.twinkle += (target.twinkle - smooth.current.twinkle) * 0.05;
    material.uniforms.uTwinkle.value = smooth.current.twinkle;

    // matter formation: atoms fly outward from the detonation point, overshoot, settle
    const born = novaBorn(stage);
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (born < 1.001 && stage.t < B.sigil) {
      const fp = clamp01((stage.t - B.detonation) / (B.sigil - B.detonation) * 1.8);
      for (let i = 0; i < atomCount; i++) {
        const p = backOut(clamp01((fp - stagger[i]) / (1 - stagger[i] * 0.8)));
        pos.setXYZ(i, targets[i * 3] * p, targets[i * 3 + 1] * p, targets[i * 3 + 2] * p);
      }
      pos.needsUpdate = true;
    }

    const breath = stage.mode === 'found' ? 1 : 1 + Math.sin(t * 0.55) * 0.03;
    group.current.scale.setScalar(Math.max(0.0001, born * breath * smooth.current.tighten));
    group.current.rotation.y = t * 0.1 * smooth.current.spin;
    material.uniforms.uOpacity.value = born;

    // neuron firings — thought taking roads
    for (let i = 0; i < firings.length; i++) {
      const f = firings[i];
      f.life -= dt * (stage.mode === 'thinking' ? 2.2 : 1);
      const line = fireLines.current[i];
      if (f.life <= 0 && stage.mode !== 'found' && born > 0.9) {
        f.a = Math.floor(Math.random() * atomCount);
        f.b = Math.floor(Math.random() * atomCount);
        f.life = 0.25 + Math.random() * 0.7;
        if (line) {
          const lp = line.geometry.getAttribute('position') as THREE.BufferAttribute;
          lp.setXYZ(0, targets[f.a * 3], targets[f.a * 3 + 1], targets[f.a * 3 + 2]);
          lp.setXYZ(1, targets[f.b * 3], targets[f.b * 3 + 1], targets[f.b * 3 + 2]);
          lp.needsUpdate = true;
        }
      }
      if (line) (line.material as THREE.LineBasicMaterial).opacity = Math.max(0, Math.min(0.55, f.life * 0.55)) * born;
    }
  });

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} />
      {/* nucleus — a center so bright it feels quiet */}
      <sprite scale={0.9}><spriteMaterial map={nucleus} transparent blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.95} /></sprite>
      <sprite scale={2.6}><spriteMaterial map={nucleusFar} transparent blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.32} /></sprite>
      <sprite scale={5.5}><spriteMaterial map={nucleusFar} transparent blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.1} /></sprite>
      {/* rings that do not fully close — almost a crown */}
      {[0.55, 0.18, -0.42].map((tilt, i) => (
        <mesh key={i} rotation={[Math.PI / 2 + tilt, 0, i * 1.35]}>
          <torusGeometry args={[1.38 + i * 0.17, 0.005, 8, 128, Math.PI * 1.7]} />
          <meshBasicMaterial color="#9fe6ff" transparent opacity={0.32 - i * 0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <line key={i} ref={(el: any) => { fireLines.current[i] = el; }}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={2} array={new Float32Array(6)} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#c8f4ff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
        </line>
      ))}
    </group>
  );
}

// ── THE SIGIL — matter forms the X; star + X = the NovaNexus logo ──────
function roundedRectPoint(u: number, w: number, h: number, r: number, cy: number): [number, number] {
  const sw = w - 2 * r, sh = h - 2 * r;
  const per = 2 * sw + 2 * sh + 2 * Math.PI * r;
  let d = u * per;
  const hw = w / 2, hh = h / 2;
  if (d < sw) return [-sw / 2 + d, cy + hh];
  d -= sw;
  if (d < (Math.PI / 2) * r) { const a = d / r; return [sw / 2 + Math.sin(a) * r, cy + hh - r + Math.cos(a) * r]; }
  d -= (Math.PI / 2) * r;
  if (d < sh) return [hw, cy + hh - r - d];
  d -= sh;
  if (d < (Math.PI / 2) * r) { const a = d / r; return [hw - r + Math.cos(a) * r, cy - hh + r - Math.sin(a) * r]; }
  d -= (Math.PI / 2) * r;
  if (d < sw) return [sw / 2 - d, cy - hh];
  d -= sw;
  if (d < (Math.PI / 2) * r) { const a = d / r; return [-sw / 2 - Math.sin(a) * r, cy - hh + r - Math.cos(a) * r]; }
  d -= (Math.PI / 2) * r;
  if (d < sh) return [-hw, cy - hh + r + d];
  d -= sh;
  const a = d / r;
  return [-hw + r - Math.cos(a) * r, cy + hh - r + Math.sin(a) * r];
}

function Sigil({ stage, count }: { stage: WorldStage; count: number }) {
  const ref = useRef<THREE.Points>(null);
  const CY = -1.15;

  const { geometry, material, birth, xShape, rect, delays } = useMemo(() => {
    const g = makeGlowPoints(count, 7);
    const birth = new Float32Array(count * 3);
    const xShape = new Float32Array(count * 3);
    const rect = new Float32Array(count * 3);
    const delays = new Float32Array(count);
    const c = new THREE.Color('#b8f0ff');
    const strand = 3; // 3 parallel strands per bar — the X reads as drawn, not dusted
    const perBar = Math.floor(count / 2);
    for (let i = 0; i < count; i++) {
      birth[i * 3] = (Math.random() - 0.5) * 0.3;
      birth[i * 3 + 1] = -0.5 + (Math.random() - 0.5) * 0.2;
      birth[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      const onA = i < perBar;
      const j = onA ? i : i - perBar;
      const s = (Math.floor(j / strand) / Math.max(1, Math.floor(perBar / strand) - 1)) * 2 - 1;
      const off = ((j % strand) - 1) * 0.022;
      xShape[i * 3] = s * 1.72;
      xShape[i * 3 + 1] = CY + (onA ? s : -s) * 0.3 + off;
      xShape[i * 3 + 2] = 0;
      const [rx, ry] = roundedRectPoint(i / count, 3.5, 0.62, 0.22, CY);
      rect[i * 3] = rx; rect[i * 3 + 1] = ry; rect[i * 3 + 2] = 0;
      delays[i] = Math.random() * 0.3;
      setColor(g.geometry, i, c, 0.9 + Math.random() * 0.3);
    }
    return { ...g, birth, xShape, rect, delays };
  }, [count]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    material.uniforms.uTime.value = clock.getElapsedTime();
    // sigil beat: first 55% assembles the X, then HOLD (the logo moment)
    const p1 = ease(clamp01(stage.beat === 'sigil' ? stage.beatT / 0.55 : stage.t >= B.window ? 1 : 0));
    // window beat: the X rounds into the window
    const p2 = ease(clamp01(stage.beat === 'window' ? stage.beatT : stage.t >= B.open ? 1 : 0));
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const d = delays[i];
      const q1 = ease(clamp01((p1 - d) / (1 - d)));
      const q2 = ease(clamp01((p2 - d * 0.6) / (1 - d * 0.6)));
      for (let k = 0; k < 3; k++) {
        const a = birth[i * 3 + k] + (xShape[i * 3 + k] - birth[i * 3 + k]) * q1;
        pos.array[i * 3 + k] = a + (rect[i * 3 + k] - a) * q2;
      }
    }
    pos.needsUpdate = true;
    ref.current.visible = p1 > 0.001;
    // once the DOM window carries it, the outline recedes to an echo
    material.uniforms.uOpacity.value = stage.beat === 'open' ? 0.12 : 1;
  });

  return <points ref={ref} geometry={geometry} material={material} />;
}

// ── THE SWARM — born from the core, deployed to orbit, cycled home ────
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

const MAX_MOTES = 48;
const TRAIL = 9;
const BIRTH_DUR = 1.6;

interface Mote {
  id: string; sector: keyof typeof SECTOR_COLOR; kind: string; fresh: boolean; seed: number;
  home: THREE.Vector3; r: number; speed: number; tilt: number;
  bornAt: number;          // world-time of (re)deployment
  returnAt: number | null; // when set, the agent is being drawn home
  bright: number;          // refinement — exchanges brighten the receiver
  // kinematics — position persists, so noticing reads as real motion
  px: number; py: number; pz: number;
  state: 'orbit' | 'seeking' | 'connected';
  partnerId: string | null;
  stateUntil: number;      // when a connection releases
  holdUntil: number;       // the noticed agent waits
  cooldownUntil: number;   // encounters are occasions, not wallpaper
}

// Two motes are related when their REAL underlying events share something —
// encounters carry meaning or they don't happen (§7: legibility over spectacle).
function relate(a: Mote, b: Mote): string | null {
  if (a.kind && a.kind === b.kind) {
    const words: Record<string, string> = {
      agent: 'two watchers recognized each other’s work',
      card: 'two forged decisions found common ground',
      flip: 'two appraisals compared their markets',
      outcome: 'two recorded outcomes aligned',
      event: 'two signals from the spine crossed and compared',
    };
    return words[a.kind] || 'two agents doing the same work noticed each other';
  }
  if (a.sector === b.sector && a.sector !== 'core') return `two ${a.sector} agents met over shared territory`;
  if (a.fresh && b.fresh) return 'two newborn agents found each other';
  return null;
}

function Swarm({ stage, events, onEncounter }: { stage: WorldStage; events: SwarmEventInput[]; onEncounter?: (n: EncounterNotice) => void }) {
  const pointsRef = useRef<THREE.Points>(null);
  const trailRefs = useRef<(THREE.Line | null)[]>([]);
  const exchRefs = useRef<(THREE.Line | null)[]>([]);
  const motes = useRef<Map<string, Mote>>(new Map());
  const trailHist = useRef<Float32Array[]>(Array.from({ length: MAX_MOTES }, () => new Float32Array(TRAIL * 3)));
  const exchanges = useRef<{ a: string; b: string; life: number }[]>([]);
  const lastScan = useRef(0);
  const lastHeal = useRef(0);

  const { geometry, material } = useMemo(() => makeGlowPoints(MAX_MOTES, 13), []);

  // Reconcile motes with the real event feed. Births are staggered through the
  // formation beat on arrival; fresh events birth immediately (deployment).
  useMemo(() => {
    const list = events.slice(0, MAX_MOTES);
    let order = 0;
    for (const e of list) {
      if (!motes.current.has(e.id)) {
        const seed = hashSeed(e.id);
        const home = e.sector === 'core'
          ? new THREE.Vector3(0, 0, 0)
          : new THREE.Vector3(...NEBULA_POS[e.sector]).normalize().multiplyScalar(3.6 + seed * 1.8);
        motes.current.set(e.id, {
          id: e.id, sector: e.sector, kind: e.kind, fresh: e.fresh, seed, home,
          r: e.sector === 'core' ? 2.0 + seed * 1.0 : 0.5 + seed * 0.9,
          speed: 0.25 + seed * 0.6,
          tilt: seed * Math.PI,
          bornAt: e.fresh ? stage.t : B.formation + 0.1 + (order / Math.max(1, list.length)) * (B.sigil - B.formation - 0.4) + seed * 0.2,
          returnAt: null,
          bright: 1,
          px: 0, py: 0, pz: 0,
          state: 'orbit', partnerId: null, stateUntil: 0, holdUntil: 0, cooldownUntil: 0,
        });
      }
      order++;
    }
    const keep = new Set(list.map(e => e.id));
    for (const id of Array.from(motes.current.keys())) if (!keep.has(id)) motes.current.delete(id);
  }, [events]);

  useFrame(({ clock }, dt) => {
    if (!pointsRef.current) return;
    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = t;
    const born = novaBorn(stage);
    const focus = stage.mode === 'thinking' ? 0.45 : 1;
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = Array.from(motes.current.values());

    // SELF-HEAL: periodically the oldest agent is drawn home, absorbed, redeployed.
    if (stage.beat === 'open' && stage.pulseAlive && stage.t - lastHeal.current > 9) {
      lastHeal.current = stage.t;
      const candidate = arr.filter(m => m.returnAt === null && stage.t - m.bornAt > 12)
        .sort((a, b) => a.bornAt - b.bornAt)[0];
      if (candidate) candidate.returnAt = stage.t;
    }

    // ENCOUNTERS: an agent passes another whose work is genuinely RELATED —
    // it notices: brakes against its momentum, turns back, connects, then
    // resumes its path. Meaning, or it doesn't happen (§7).
    if (stage.beat === 'open' && stage.pulseAlive && t - lastScan.current > 0.6) {
      lastScan.current = t;
      const busy = arr.filter(m => m.state !== 'orbit').length;
      if (busy < 2) {
        outer:
        for (let i = 0; i < arr.length; i++) {
          const A = arr[i];
          if (A.state !== 'orbit' || stage.t < A.cooldownUntil || stage.t - A.bornAt < BIRTH_DUR || A.returnAt !== null) continue;
          for (let j = i + 1; j < arr.length; j++) {
            const C = arr[j];
            if (C.state !== 'orbit' || stage.t < C.cooldownUntil || stage.t - C.bornAt < BIRTH_DUR || C.returnAt !== null) continue;
            const dx = A.px - C.px, dy = A.py - C.py, dz = A.pz - C.pz;
            if (dx * dx + dy * dy + dz * dz > 1.44) continue; // must actually pass close
            const reason = relate(A, C);
            if (!reason) continue;
            A.state = 'seeking'; A.partnerId = C.id; (A as any).reason = reason;
            C.holdUntil = stage.t + 6; // the noticed one slows and waits
            break outer;
          }
        }
      }
    }

    for (let i = 0; i < MAX_MOTES; i++) {
      const m = arr[i];
      if (!m) { pos.setXYZ(i, 0, 0, 0); continue; }
      const age = stage.t - m.bornAt;
      const a = t * m.speed * (stage.mode === 'thinking' ? 1.8 : 1) + m.seed * 20;
      const wob = Math.sin(t * 0.7 + m.seed * 30) * 0.15 * focus;
      const ox = m.home.x + Math.cos(a) * m.r * focus;
      const oy = m.home.y + Math.sin(a * 0.9 + m.tilt) * m.r * 0.35 * focus + wob;
      const oz = m.home.z + Math.sin(a) * m.r * focus * 0.8;

      let glow = m.bright;
      if (age < 0) {
        m.px = 0; m.py = 0; m.pz = 0; glow = 0;                          // not yet deployed
      } else if (age < BIRTH_DUR) {                                      // DEPLOYMENT: ejected from the core along an arc
        const p = ease(age / BIRTH_DUR);
        m.px = ox * p; m.py = oy * p + Math.sin(p * Math.PI) * 0.5; m.pz = oz * p;
        glow = m.bright * (1.6 - 0.6 * p);                               // birth flash
      } else if (m.returnAt !== null) {                                  // drawn home for absorption
        const p = ease(clamp01((stage.t - m.returnAt) / 2.2));
        m.px = ox * (1 - p); m.py = oy * (1 - p); m.pz = oz * (1 - p);
        glow = m.bright * (1 - p * 0.7);
        if (p >= 1) { m.returnAt = null; m.bornAt = stage.t; m.bright = 1.15; } // REDEPLOYED, refined
      } else {
        // kinematic follow — the orbit is a pull, not a rail
        let tx = ox, ty = oy, tz = oz, k = 0.06;
        if (m.state === 'seeking') {
          const P = m.partnerId ? motes.current.get(m.partnerId) : undefined;
          if (!P) { m.state = 'orbit'; m.partnerId = null; }
          else {
            tx = P.px; ty = P.py; tz = P.pz; k = 0.035;                  // braking, doubling back
            const d2 = (m.px - P.px) ** 2 + (m.py - P.py) ** 2 + (m.pz - P.pz) ** 2;
            if (d2 < 0.09) {                                             // CONNECTED
              m.state = 'connected'; m.stateUntil = stage.t + 1.2;
              m.bright = 1.6; P.bright = Math.min(1.8, P.bright + 0.4);
              if (exchanges.current.length < 6) exchanges.current.push({ a: m.id, b: P.id, life: 1.4 });
              if (onEncounter && (m as any).reason) onEncounter({ reason: (m as any).reason });
            }
          }
        } else if (m.state === 'connected') {
          const P = m.partnerId ? motes.current.get(m.partnerId) : undefined;
          if (P) { tx = P.px + 0.18; ty = P.py + 0.1; tz = P.pz; k = 0.08; }
          if (!P || stage.t > m.stateUntil) {                            // release, resume path
            m.state = 'orbit'; m.partnerId = null; m.cooldownUntil = stage.t + 22;
            if (P) { P.holdUntil = 0; P.cooldownUntil = stage.t + 22; }
          }
        }
        if (stage.t < m.holdUntil) k *= 0.22;                            // the noticed one waits
        m.px += (tx - m.px) * k; m.py += (ty - m.py) * k; m.pz += (tz - m.pz) * k;
      }
      m.bright += (1 - m.bright) * 0.005;
      pos.setXYZ(i, m.px, m.py, m.pz);
      setColor(geometry, i, SECTOR_COLOR[m.sector], glow * born);

      // trail — a small body of light that shows where it came from
      const h = trailHist.current[i];
      h.copyWithin(3, 0, (TRAIL - 1) * 3);
      h[0] = m.px; h[1] = m.py; h[2] = m.pz;
      const line = trailRefs.current[i];
      if (line) {
        const lp = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        (lp.array as Float32Array).set(h);
        lp.needsUpdate = true;
        (line.material as THREE.LineBasicMaterial).opacity =
          (age >= 0 ? 0.22 : 0) * focus * born * (stage.pulseAlive ? 1 : 0.3);
      }
    }
    pos.needsUpdate = true;
    geometry.setDrawRange(0, MAX_MOTES);
    material.uniforms.uOpacity.value = born * (stage.pulseAlive ? 1 : 0.45);

    // exchange lines — thought as motion between agents (tracked by id,
    // so a connection survives the feed reordering beneath it)
    exchanges.current.forEach((ex, xi) => {
      ex.life -= dt;
      const line = exchRefs.current[xi];
      if (!line) return;
      const A = motes.current.get(ex.a);
      const C = motes.current.get(ex.b);
      const alive = ex.life > 0 && A && C;
      (line.material as THREE.LineBasicMaterial).opacity = alive ? Math.min(0.5, ex.life * 0.4) : 0;
      if (alive) {
        const lp = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        lp.setXYZ(0, A.px, A.py, A.pz);
        lp.setXYZ(1, C.px, C.py, C.pz);
        lp.needsUpdate = true;
      }
    });
    exchanges.current = exchanges.current.filter(ex => ex.life > 0);
  });

  return (
    <group>
      <points ref={pointsRef} geometry={geometry} material={material} />
      {Array.from({ length: MAX_MOTES }).map((_, i) => (
        <line key={`t${i}`} ref={(el: any) => { trailRefs.current[i] = el; }}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={TRAIL} array={new Float32Array(TRAIL * 3)} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#bfeaff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
        </line>
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <line key={`x${i}`} ref={(el: any) => { exchRefs.current[i] = el; }}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={2} array={new Float32Array(6)} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#e8fbff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
        </line>
      ))}
    </group>
  );
}

// ── THE NEBULAE — light earned from real activity ─────────────────────
function Nebula({ data, stage }: { data: NebulaData; stage: WorldStage }) {
  const group = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Sprite>(null);
  const pos = NEBULA_POS[data.key];
  const baseColor = data.key === 'market' ? '#cfe0ff' : data.key === 'bazaar' ? '#ffc773' : '#c69bff';
  const weatherColor = data.weather > 0.05 ? '#7dffb0' : data.weather < -0.05 ? '#ff8a7d' : baseColor;
  const glowMap = useGlowTexture(baseColor, baseColor);

  const { geometry, material } = useMemo(() => {
    const n = 150;
    const g = makeGlowPoints(n, 60);
    const p = g.geometry.getAttribute('position') as THREE.BufferAttribute;
    const c = new THREE.Color(weatherColor);
    for (let i = 0; i < n; i++) {
      const r = (Math.random() + Math.random() + Math.random()) / 3 * 2.8;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      p.setXYZ(i, Math.sin(ph) * Math.cos(th) * r * 1.7, Math.cos(ph) * r * 0.7, Math.sin(ph) * Math.sin(th) * r);
      setColor(g.geometry, i, c, 0.4 + Math.random() * 0.8);
    }
    return g;
  }, [weatherColor]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = t;
    group.current.rotation.y = t * 0.035 * (0.5 + data.active);
    group.current.rotation.z = Math.sin(t * 0.05) * 0.1;
    const born = novaBorn(stage);
    const pulse = 1 + Math.sin(t * (0.4 + data.active * 1.2)) * 0.06 * data.active;
    group.current.scale.setScalar(pulse * born);
    material.uniforms.uOpacity.value = (0.15 + data.active * 0.55) * born;
    if (glowRef.current) (glowRef.current.material as THREE.SpriteMaterial).opacity = (0.05 + data.active * 0.14) * born;
  });

  return (
    <group position={pos}>
      <group ref={group}>
        <points geometry={geometry} material={material} />
        <sprite ref={glowRef} scale={8}>
          <spriteMaterial map={glowMap} transparent blending={THREE.AdditiveBlending} depthWrite={false} opacity={0} />
        </sprite>
      </group>
      {stage.beat === 'open' && (
        <Html center distanceFactor={26} style={{ pointerEvents: 'auto' }}>
          <a href={data.href} className="block text-center no-underline select-none">
            <div className="text-[13px] tracking-[0.3em] uppercase" style={{ color: baseColor, opacity: 0.9 }}>{data.label}</div>
            <div className="text-[10px] mt-1" style={{ color: '#8fa8bf', opacity: 0.85 }}>
              {data.sub ?? 'forming — the gravity is already here'}
            </div>
          </a>
        </Html>
      )}
    </group>
  );
}

function UnbornNebulae() {
  const { geometry, material } = useMemo(() => {
    const n = 180;
    const g = makeGlowPoints(n, 40);
    const p = g.geometry.getAttribute('position') as THREE.BufferAttribute;
    const dim = new THREE.Color('#5d7288');
    const centers = [[-22, -8, -38, 3], [24, 9, -42, 3.6]];
    for (let i = 0; i < n; i++) {
      const [cx, cy, cz, R] = centers[i % 2];
      const th = Math.random() * Math.PI * 2;
      p.setXYZ(i, cx + Math.cos(th) * R + (Math.random() - 0.5), cy + (Math.random() - 0.5) * 0.5, cz + Math.sin(th) * R * 0.6);
      setColor(g.geometry, i, dim, 0.2 + Math.random() * 0.3);
    }
    g.material.uniforms.uOpacity.value = 0.35;
    return g;
  }, []);
  useFrame(({ clock }) => { material.uniforms.uTime.value = clock.getElapsedTime(); });
  return <points geometry={geometry} material={material} />;
}

// ── Composition ───────────────────────────────────────────────────────
export default function ArrivalScene({
  stage, events, nebulae, isMobile, onBeat, onEncounter,
}: {
  stage: WorldStage;
  events: SwarmEventInput[];
  nebulae: NebulaData[];
  isMobile: boolean;
  onBeat: (b: Beat) => void;
  onEncounter?: (n: EncounterNotice) => void;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 45 }}
      style={{ background: '#01030a' }}
      gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
      dpr={isMobile ? 1 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)}
    >
      <Director stage={stage} onBeat={onBeat} />
      <Rig stage={stage} />
      <TheEnormity />
      <DeepField count={isMobile ? 400 : 900} />
      <NorthStar stage={stage} />
      <Shockwave stage={stage} />
      <NovaCore stage={stage} atomCount={isMobile ? 500 : 1200} />
      <Sigil stage={stage} count={isMobile ? 220 : 320} />
      <Swarm stage={stage} events={events} onEncounter={onEncounter} />
      {nebulae.map(n => <Nebula key={n.key} data={n} stage={stage} />)}
      <UnbornNebulae />
    </Canvas>
  );
}
