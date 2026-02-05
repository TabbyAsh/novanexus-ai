'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    label: string;
  };
  icon: ReactNode;
  color: 'cyan' | 'purple' | 'pink' | 'green' | 'orange' | 'red';
  delay?: number;
}

const colorClasses = {
  cyan: {
    bg: 'from-cyan-500/20 to-cyan-500/5',
    border: 'border-cyan-500/30 hover:border-cyan-400/50',
    icon: 'bg-cyan-500/20 text-cyan-400',
    glow: 'hover:shadow-[0_0_40px_rgba(0,245,255,0.2)]',
  },
  purple: {
    bg: 'from-purple-500/20 to-purple-500/5',
    border: 'border-purple-500/30 hover:border-purple-400/50',
    icon: 'bg-purple-500/20 text-purple-400',
    glow: 'hover:shadow-[0_0_40px_rgba(139,92,246,0.2)]',
  },
  pink: {
    bg: 'from-pink-500/20 to-pink-500/5',
    border: 'border-pink-500/30 hover:border-pink-400/50',
    icon: 'bg-pink-500/20 text-pink-400',
    glow: 'hover:shadow-[0_0_40px_rgba(244,114,182,0.2)]',
  },
  green: {
    bg: 'from-green-500/20 to-green-500/5',
    border: 'border-green-500/30 hover:border-green-400/50',
    icon: 'bg-green-500/20 text-green-400',
    glow: 'hover:shadow-[0_0_40px_rgba(34,197,94,0.2)]',
  },
  orange: {
    bg: 'from-orange-500/20 to-orange-500/5',
    border: 'border-orange-500/30 hover:border-orange-400/50',
    icon: 'bg-orange-500/20 text-orange-400',
    glow: 'hover:shadow-[0_0_40px_rgba(249,115,22,0.2)]',
  },
  red: {
    bg: 'from-red-500/20 to-red-500/5',
    border: 'border-red-500/30 hover:border-red-400/50',
    icon: 'bg-red-500/20 text-red-400',
    glow: 'hover:shadow-[0_0_40px_rgba(239,68,68,0.2)]',
  },
};

export default function StatCard({ title, value, change, icon, color, delay = 0 }: StatCardProps) {
  const colors = colorClasses[color];
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      whileHover={{ scale: 1.02, y: -2 }}
      className={`
        relative overflow-hidden
        backdrop-blur-xl bg-gradient-to-br ${colors.bg}
        border ${colors.border}
        rounded-2xl p-6
        transition-all duration-300 ease-out
        ${colors.glow}
      `}
    >
      {/* Background glow */}
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-radial from-white/5 to-transparent rounded-full blur-xl" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-12 h-12 rounded-xl ${colors.icon} flex items-center justify-center`}>
            {icon}
          </div>
          {change && (
            <div className={`flex items-center gap-1 text-sm ${change.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              <span>{change.value >= 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(change.value)}%</span>
            </div>
          )}
        </div>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: delay + 0.2 }}
        >
          <p className="text-gray-400 text-sm mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {change && (
            <p className="text-gray-500 text-xs mt-1">{change.label}</p>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-white/10" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-20 bg-white/10 rounded" />
        <div className="h-8 w-32 bg-white/10 rounded" />
      </div>
    </div>
  );
}
