'use client';

/**
 * THE WORLD — access gate.
 *
 * The World is the founder's cockpit: the backend visualization of the whole
 * system. It was built as a public arrival, but in practice strangers arriving
 * for a tool don't need a 3D cosmos — so it now opens only for the founder /
 * admins. Everyone else meets a quiet door pointing at the working tool.
 *
 * NOTE ON SCOPE: this gates the surface, not the data. /v1/world/pulse is still
 * a public endpoint (it only ever exposed aggregate counts of real activity).
 * Gating that endpoint is a backend change tracked separately.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '../../lib/store';
import WorldClient from './WorldClient';

export default function WorldGate() {
  const { user, scopes, isAuthenticated, isLoading, loadUser } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Resolve the session once on mount; the store starts isLoading: true.
    loadUser().finally(() => setChecked(true));
  }, [loadUser]);

  const role = (user as { role?: string } | null)?.role;
  const isFounder =
    scopes.includes('ops.admin') || role === 'OWNER' || role === 'ADMIN';

  if (!checked || isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/30 text-sm tracking-[0.3em] uppercase animate-pulse">
          Listening
        </div>
      </div>
    );
  }

  if (isAuthenticated && isFounder) {
    return <WorldClient />;
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center font-bold">
          N
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">This chamber is private.</h1>

        <p className="text-white/50 text-sm leading-relaxed">
          The World is Nova&apos;s operating floor — the founder&apos;s cockpit, not a
          showroom. What it watches over is public, and it works:
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
          <Link
            href="/flip-calculator"
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-sm font-semibold transition"
          >
            Open the Flip Calculator
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm transition"
          >
            Sign in
          </Link>
        </div>

        <p className="text-xs text-white/25 pt-2">
          Paste real sold prices, get an honest verdict. Free, no account.
        </p>
      </div>
    </div>
  );
}
