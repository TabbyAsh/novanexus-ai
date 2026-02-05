'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';

// Hook to detect if device prefers reduced resources
function useDeviceCapabilities() {
  const [isMobile, setIsMobile] = useState(false);
  const [isLowPower, setIsLowPower] = useState(false);

  useEffect(() => {
    // Check screen size
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Check for low power mode (battery saver)
    if ('getBattery' in navigator) {
      (navigator as any).getBattery?.().then((battery: any) => {
        setIsLowPower(battery.charging === false && battery.level < 0.2);
      });
    }

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return { isMobile, isLowPower };
}

// Animated CSS background with floating orbs and grid - performance optimized
export default function ParticleField() {
  const prefersReducedMotion = useReducedMotion();
  const { isMobile, isLowPower } = useDeviceCapabilities();
  
  // Reduce particle count based on device
  const particleCount = useMemo(() => {
    if (prefersReducedMotion || isLowPower) return 0;
    if (isMobile) return 15;
    return 30;
  }, [isMobile, isLowPower, prefersReducedMotion]);

  // Pre-calculate particle positions for stable rendering
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }).map((_, i) => ({
      id: i,
      left: `${(i * 37 + 13) % 100}%`,
      top: `${(i * 61 + 7) % 100}%`,
      duration: 4 + (i % 5),
      delay: (i % 8) * 0.3,
    }));
  }, [particleCount]);

  // Disable heavy animations if reduced motion or low power
  const shouldAnimate = !prefersReducedMotion && !isLowPower;
  
  return (
    <div 
      className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a]"
      style={{ contain: 'paint layout' }} // CSS containment for better performance
    >
      {/* Animated gradient orbs - GPU accelerated */}
      {shouldAnimate && (
        <>
          <motion.div
            className="absolute rounded-full opacity-30 blur-[100px] gpu-accelerated"
            style={{ 
              background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)',
              width: isMobile ? '300px' : '600px',
              height: isMobile ? '300px' : '600px',
              top: '10%',
              left: '20%',
            }}
            animate={{ x: [-50, 50, -50], y: [-25, 25, -25] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute rounded-full opacity-20 blur-[80px] gpu-accelerated"
            style={{ 
              background: 'radial-gradient(circle, #00f5ff 0%, transparent 70%)',
              width: isMobile ? '250px' : '500px',
              height: isMobile ? '250px' : '500px',
              top: '40%',
              right: '10%',
            }}
            animate={{ x: [50, -50, 50], y: [25, -25, 25] }}
            transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          />
          {!isMobile && (
            <motion.div
              className="absolute rounded-full opacity-25 blur-[60px] gpu-accelerated"
              style={{ 
                background: 'radial-gradient(circle, #f472b6 0%, transparent 70%)',
                width: '400px',
                height: '400px',
                bottom: '20%',
                left: '30%',
              }}
              animate={{ x: [-25, 25, -25], y: [50, -50, 50] }}
              transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </>
      )}
      
      {/* Static gradient orbs as fallback when motion is reduced */}
      {!shouldAnimate && (
        <>
          <div 
            className="absolute rounded-full opacity-20 blur-[100px]"
            style={{ 
              background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)',
              width: '400px', height: '400px', top: '10%', left: '20%'
            }} 
          />
          <div 
            className="absolute rounded-full opacity-15 blur-[80px]"
            style={{ 
              background: 'radial-gradient(circle, #00f5ff 0%, transparent 70%)',
              width: '350px', height: '350px', top: '40%', right: '10%'
            }} 
          />
        </>
      )}
      
      {/* Grid pattern - static, no animation needed */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: isMobile ? '40px 40px' : '50px 50px',
        }}
      />
      
      {/* Floating particles - significantly reduced and optimized */}
      {shouldAnimate && particleCount > 0 && (
        <div className="absolute inset-0" style={{ contain: 'strict' }}>
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute w-1 h-1 rounded-full bg-cyan-400/30 gpu-accelerated"
              style={{ left: particle.left, top: particle.top }}
              animate={{ y: [-10, 10, -10], opacity: [0.2, 0.4, 0.2] }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                delay: particle.delay,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )}
      
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent" />
    </div>
  );
}
