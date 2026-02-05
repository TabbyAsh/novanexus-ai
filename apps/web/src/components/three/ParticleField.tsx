'use client';

import { motion } from 'framer-motion';

// Animated CSS background with floating orbs and grid
export default function ParticleField() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a]">
      {/* Animated gradient orbs */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full opacity-30 blur-[100px]"
        style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
        animate={{
          x: [-100, 100, -100],
          y: [-50, 50, -50],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        initial={{ top: '10%', left: '20%' }}
      />
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[80px]"
        style={{ background: 'radial-gradient(circle, #00f5ff 0%, transparent 70%)' }}
        animate={{
          x: [100, -100, 100],
          y: [50, -50, 50],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
        initial={{ top: '40%', right: '10%' }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full opacity-25 blur-[60px]"
        style={{ background: 'radial-gradient(circle, #f472b6 0%, transparent 70%)' }}
        animate={{
          x: [-50, 50, -50],
          y: [100, -100, 100],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        initial={{ bottom: '20%', left: '30%' }}
      />
      
      {/* Grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />
      
      {/* Floating particles */}
      <div className="absolute inset-0">
        {Array.from({ length: 50 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-cyan-400/30"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [-20, 20, -20],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: 3 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent" />
    </div>
  );
}
