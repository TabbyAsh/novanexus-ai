'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';

// ─── Core Nova Sphere ────────────────────────────────────────────────
function NovaSphere() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.15;
      meshRef.current.rotation.x = Math.sin(t * 0.08) * 0.1;
      // Breathing scale
      const s = 1 + Math.sin(t * 0.6) * 0.03;
      meshRef.current.scale.setScalar(s);
    }
    if (glowRef.current) {
      const gs = 1 + Math.sin(t * 0.4) * 0.05;
      glowRef.current.scale.setScalar(gs);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.12 + Math.sin(t * 0.5) * 0.04;
    }
  });

  return (
    <group>
      {/* Inner core — bright, emissive */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, 6]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#7c3aed"
          emissiveIntensity={0.8}
          roughness={0.15}
          metalness={0.9}
          toneMapped={false}
        />
      </mesh>

      {/* Outer glow shell */}
      <mesh ref={glowRef} scale={1.6}>
        <icosahedronGeometry args={[1, 4]} />
        <meshBasicMaterial
          color="#00f5ff"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Inner glow — tighter, warmer */}
      <mesh scale={1.25}>
        <icosahedronGeometry args={[1, 4]} />
        <meshBasicMaterial
          color="#a855f7"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

// ─── Orbiting Particle Ring ──────────────────────────────────────────
function ParticleRing({ count = 120 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 2.2 + (Math.random() - 0.5) * 0.3;
      const y = (Math.random() - 0.5) * 0.15;
      arr[i * 3] = Math.cos(angle) * radius;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return arr;
  }, [count]);

  const sizes = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i] = 0.02 + Math.random() * 0.03;
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.1;
      ref.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.05) * 0.15;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#00f5ff"
        size={0.04}
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ─── Light Rays ──────────────────────────────────────────────────────
function LightRays() {
  const ref = useRef<THREE.Group>(null);
  const rayCount = 6;

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.z = clock.getElapsedTime() * 0.03;
    }
  });

  return (
    <group ref={ref}>
      {Array.from({ length: rayCount }).map((_, i) => {
        const angle = (i / rayCount) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * 1.8, Math.sin(angle) * 1.8, 0]}
            rotation={[0, 0, angle + Math.PI / 2]}
          >
            <planeGeometry args={[0.02, 1.5]} />
            <meshBasicMaterial
              color="#00f5ff"
              transparent
              opacity={0.06}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Scene Composition ───────────────────────────────────────────────
function NovaScene({ isMobile }: { isMobile: boolean }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#00f5ff" />
      <pointLight position={[-5, -3, 3]} intensity={0.6} color="#a855f7" />
      <pointLight position={[0, 0, 0]} intensity={2} color="#00e5ff" distance={8} decay={2} />

      <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.3}>
        <NovaSphere />
        <ParticleRing count={isMobile ? 60 : 120} />
        <LightRays />
      </Float>

      <Stars
        radius={50}
        depth={40}
        count={isMobile ? 800 : 2000}
        factor={2}
        saturation={0}
        fade
        speed={0.5}
      />
    </>
  );
}

// ─── Exported Component ──────────────────────────────────────────────
export default function NovaStar() {
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    setPrefersReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Static fallback for reduced motion
  if (prefersReduced) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div
          className="w-48 h-48 rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, #00f5ff 0%, #7c3aed 40%, transparent 70%)',
            filter: 'blur(20px)',
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full" style={{ minHeight: 400 }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={isMobile ? 1 : Math.min(window.devicePixelRatio, 2)}
      >
        <NovaScene isMobile={isMobile} />
      </Canvas>
    </div>
  );
}
