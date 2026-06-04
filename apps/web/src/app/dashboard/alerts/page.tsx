'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Bell, RefreshCw, TrendingUp, ShoppingBag, Zap, Check } from 'lucide-react';

interface Alert {
  id: string;
  alert_type: string;
  symbol: string | null;
  message: string;
  is_read: boolean;
  triggered_at: string | null;
  created_at: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; cls: string; label: string }> = {
  TRADE:  { icon: TrendingUp,  cls: 'text-purple-400 bg-purple-500/10 border-purple-500/30', label: 'Stock Alert'  },
  CUSTOM: { icon: ShoppingBag, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'Flip Alert' },
  PRICE:  { icon: Zap,         cls: 'text-amber-400  bg-amber-500/10  border-amber-500/30',  label: 'Price Alert'  },
  SYSTEM: { icon: Bell,        cls: 'text-blue-400   bg-blue-500/10   border-blue-500/30',   label: 'System'       },
  QUOTA:  { icon: Bell,        cls: 'text-red-400    bg-red-500/10    border-red-500/30',    label: 'Quota'        },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/alerts`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json();
      if (d.success) setAlerts(d.data?.alerts ?? []);
    } catch { /* */ } finally { setLoading(false); }
  };

  const markAllRead = async () => {
    await fetch(`${API}/v1/alerts/read-all`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  };

  const markRead = async (id: string) => {
    await fetch(`${API}/v1/alerts/${id}/read`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, is_read: true } : a));
  };

  useEffect(() => { load(); }, []);

  const unread = alerts.filter((a) => !a.is_read).length;

  return (
    <DashboardLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Bell className="w-6 h-6 text-cyan-400" />
              Alerts
              {unread > 0 && (
                <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-400">
                  {unread} new
                </span>
              )}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Daily flip opportunities and stock setups — updated every morning.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-400 hover:text-white transition">
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
            <button onClick={load} disabled={loading}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-12 text-center">
            <Bell className="w-10 h-10 text-gray-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No alerts yet</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Flip and stock alerts arrive daily. They&apos;ll appear here automatically — no email required.
              Paid subscribers also receive email copies.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => {
              const cfg = TYPE_CONFIG[alert.alert_type] ?? TYPE_CONFIG.SYSTEM;
              const Icon = cfg.icon;
              return (
                <div
                  key={alert.id}
                  onClick={() => !alert.is_read && markRead(alert.id)}
                  className={`flex items-start gap-4 rounded-xl border p-4 transition cursor-pointer ${
                    alert.is_read
                      ? 'border-gray-800 bg-gray-900/30 opacity-60'
                      : 'border-gray-700 bg-gray-900/70 hover:bg-gray-900'
                  }`}
                >
                  {/* Type icon */}
                  <div className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center ${cfg.cls}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold ${cfg.cls.split(' ')[0]}`}>{cfg.label}</span>
                      {alert.symbol && (
                        <span className="text-xs font-mono text-gray-400">{alert.symbol}</span>
                      )}
                      {!alert.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">{alert.message}</p>
                    <p className="text-xs text-gray-600 mt-1">{timeAgo(alert.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
