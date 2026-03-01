'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

interface RealityState {
  online: boolean;
  marketOpen: boolean;
  dataFresh: boolean;
  backendsHealthy: boolean;
  lastCheck: string;
}

export function RealityBanner() {
  const [reality, setReality] = useState<RealityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkReality = async () => {
      try {
        const res = await api.getReality();
        if (res.success && res.data) {
          setReality(res.data);
        } else {
          // If API fails, assume offline
          setReality({
            online: false,
            marketOpen: false,
            dataFresh: false,
            backendsHealthy: false,
            lastCheck: new Date().toISOString(),
          });
        }
      } catch {
        setReality({
          online: false,
          marketOpen: false,
          dataFresh: false,
          backendsHealthy: false,
          lastCheck: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    };

    checkReality();
    // Re-check every 30 seconds
    const interval = setInterval(checkReality, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading || dismissed) return null;

  // Only show banner if truly offline
  if (reality?.online) return null;

  const getMessage = () => {
    if (!reality?.backendsHealthy) {
      return { icon: '🔴', text: 'System Offline — TAKE actions disabled', severity: 'critical' };
    }
    if (!reality?.marketOpen) {
      return { icon: '🌙', text: 'Market Closed — After hours mode', severity: 'info' };
    }
    if (!reality?.dataFresh) {
      return { icon: '⚠️', text: 'Data Stale — Prices may be outdated', severity: 'warning' };
    }
    return null;
  };

  const message = getMessage();
  if (!message) return null;

  const severityColors = {
    critical: 'from-red-900/90 to-red-800/90 border-red-500/50',
    warning: 'from-amber-900/90 to-amber-800/90 border-amber-500/50',
    info: 'from-blue-900/90 to-blue-800/90 border-blue-500/50',
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 bg-gradient-to-r ${severityColors[message.severity as keyof typeof severityColors]} border-b backdrop-blur-xl`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">{message.icon}</span>
            <span className="text-white font-medium">{message.text}</span>
            <span className="text-white/50 text-sm">
              Last check: {new Date(reality?.lastCheck || '').toLocaleTimeString()}
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-white/50 hover:text-white text-xl"
          >
            ×
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default RealityBanner;
