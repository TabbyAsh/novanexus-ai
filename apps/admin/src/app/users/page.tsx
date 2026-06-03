'use client';

import { useEffect, useState } from 'react';
import { Users, RefreshCw, TrendingUp, DollarSign } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  status: string;
  plan: string | null;
  outcomeValue: number | null;
  createdAt: string;
}

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';

async function fetchUsers(): Promise<UserRow[]> {
  try {
    // Admin-scoped endpoint — requires ops.admin scope on gateway
    const res = await fetch(`${GATEWAY}/v1/admin/users?limit=100`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.users ?? json?.data ?? [];
  } catch {
    return [];
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setUsers(await fetchUsers());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number | null) =>
    n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const fmtDate = (s: string) => {
    try { return new Date(s).toLocaleDateString(); } catch { return s; }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-400" /> Users
        </h1>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-7 h-7 text-blue-400 animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-10 text-center">
          <p className="text-gray-500 text-sm">
            No users returned. The admin users endpoint may not be wired yet, or there are no users.
          </p>
          <p className="text-gray-600 text-xs mt-2">
            Add <code className="text-violet-400">GET /v1/admin/users</code> to the gateway with <code className="text-violet-400">ops.admin</code> scope to see user data here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-widest grid grid-cols-5">
            <span className="col-span-2">Email</span>
            <span>Plan</span>
            <span>Outcome Value</span>
            <span>Joined</span>
          </div>
          {users.map((u) => (
            <div key={u.id} className="px-5 py-4 border-b border-gray-800/60 last:border-0 grid grid-cols-5 items-center hover:bg-white/[0.02] transition">
              <span className="col-span-2 text-sm text-white truncate">{u.email}</span>
              <span className="text-xs text-gray-400">{u.plan ?? 'free'}</span>
              <span className={`text-sm font-semibold ${u.outcomeValue && u.outcomeValue > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                {fmt(u.outcomeValue)}
              </span>
              <span className="text-xs text-gray-500">{fmtDate(u.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600">
        Outcome value = total $ attributed to Nova-assisted decisions (flips, trades, ops) for each user.
      </p>
    </div>
  );
}
