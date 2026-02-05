'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: 'cyan' | 'purple' | 'pink' | 'green';
  delay?: number;
  hover?: boolean;
}

const glowColors = {
  cyan: 'hover:shadow-[0_0_60px_rgba(0,245,255,0.3)]',
  purple: 'hover:shadow-[0_0_60px_rgba(139,92,246,0.3)]',
  pink: 'hover:shadow-[0_0_60px_rgba(244,114,182,0.3)]',
  green: 'hover:shadow-[0_0_60px_rgba(34,197,94,0.3)]',
};

const borderColors = {
  cyan: 'border-cyan-500/20 hover:border-cyan-400/50',
  purple: 'border-purple-500/20 hover:border-purple-400/50',
  pink: 'border-pink-500/20 hover:border-pink-400/50',
  green: 'border-green-500/20 hover:border-green-400/50',
};

export default function GlassCard({ 
  children, 
  className = '', 
  glowColor = 'cyan',
  delay = 0,
  hover = true 
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      viewport={{ once: true }}
      whileHover={hover ? { scale: 1.02, y: -5 } : undefined}
      className={`
        relative backdrop-blur-xl bg-white/5 
        border ${borderColors[glowColor]}
        rounded-2xl p-6
        transition-all duration-500 ease-out
        ${hover ? glowColors[glowColor] : ''}
        ${className}
      `}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}

export function GlassButton({ 
  children, 
  className = '',
  variant = 'primary',
  onClick,
}: { 
  children: ReactNode; 
  className?: string;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`
        relative px-8 py-4 rounded-xl font-semibold
        transition-all duration-300
        ${variant === 'primary' 
          ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/50' 
          : 'backdrop-blur-xl bg-white/10 border border-white/20 text-white hover:bg-white/20'
        }
        ${className}
      `}
    >
      {children}
    </motion.button>
  );
}

export function AnimatedText({ 
  children, 
  className = '',
  delay = 0,
}: { 
  children: string; 
  className?: string;
  delay?: number;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className={className}
    >
      {children}
    </motion.span>
  );
}

export function GradientText({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string;
}) {
  return (
    <span className={`bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent ${className}`}>
      {children}
    </span>
  );
}
