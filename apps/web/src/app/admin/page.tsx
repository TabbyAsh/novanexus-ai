'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  FileText,
  Power,
  Settings,
  Shield,
  Users,
} from 'lucide-react';

type OverviewStats = {
  goalsTotal: number | null;
  tasksTotal: number | null;
  pendingApprovals: number | null;
  eventsLast24Hours: number | null;
};

interface EventItem {
  id: string;
  type: string;
  actorType: string;
  actorId: string;
  ts: string;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'audit' | 'settings'>('overview');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [killSwitchEnabled, setKillSwitchEnabled] = useState<boolean | null>(null);
  const [killSwitchLoading, setKillSwitchLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewStats>({
    goalsTotal: null,
    tasksTotal: null,
    pendingApprovals: null,
    eventsLast24Hours: null,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statsRes, eventStatsRes, recentEventsRes] = await Promise.all([
        api.getStats(),
        api.getEventStats(),
        api.getRecentEvents(50),
      ]);

      if (statsRes.success && statsRes.data) {
        const statsData = statsRes.data;
        const goalsTotal = Object.values(statsData.goals || {}).reduce((sum, n) => sum + n, 0);
        const tasksTotal = Object.values(statsData.tasks || {}).reduce((sum, n) => sum + n, 0);

        setStats((s) => ({
          ...s,
          goalsTotal,
          tasksTotal,
          pendingApprovals: statsData.pendingApprovals,
        }));

        setKillSwitchEnabled(statsData.killSwitch?.enabled ?? null);
      } else {
        setKillSwitchEnabled(null);
        setStats({
          goalsTotal: null,
          tasksTotal: null,
          pendingApprovals: null,
          eventsLast24Hours: null,
        });
        setEvents([]);
        setError(statsRes.error?.message || 'Failed to load stats');
      }

      if (eventStatsRes.success && eventStatsRes.data) {
        const eventStatsData = eventStatsRes.data;
        setStats((s) => ({ ...s, eventsLast24Hours: eventStatsData.last24Hours }));
      } else {
        setStats((s) => ({ ...s, eventsLast24Hours: null }));
      }

      if (recentEventsRes.success && recentEventsRes.data?.events) {
        setEvents(
          recentEventsRes.data.events.map((e) => ({
            id: e.id,
            type: e.type,
            actorType: e.actorType,
            actorId: e.actorId,
            ts: e.ts,
          }))
        );
      } else {
        setEvents([]);
      }
    } catch (e) {
      setKillSwitchEnabled(null);
      setStats({
        goalsTotal: null,
        tasksTotal: null,
        pendingApprovals: null,
        eventsLast24Hours: null,
      });
      setEvents([]);
      setError((e as Error).message || 'Failed to load admin dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleKillSwitch = async () => {
    if (killSwitchEnabled === null) {
      loadDashboardData();
      return;
    }

    const activating = !killSwitchEnabled;
    const confirmed = window.confirm(
      activating
        ? 'WARNING: This will disable ALL automated trading operations. Continue?'
        : 'Re-enable all automated trading operations?'
    );
    if (!confirmed) return;

    setKillSwitchLoading(true);
    setError(null);

    try {
      if (activating) {
        const reason = window.prompt('Reason (optional) for activating kill switch?') || undefined;
        const res = await api.enableKillSwitch(reason);
        if (res.success && res.data) {
          setKillSwitchEnabled(res.data.enabled);
        } else {
          setError(res.error?.message || 'Failed to enable kill switch');
        }
      } else {
        const res = await api.disableKillSwitch();
        if (res.success && res.data) {
          setKillSwitchEnabled(res.data.enabled);
        } else {
          setError(res.error?.message || 'Failed to disable kill switch');
        }
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to update kill switch');
    } finally {
      setKillSwitchLoading(false);
    }
  };


  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'audit', label: 'Audit Logs', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Shield className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Admin Dashboard</h1>
                <p className="text-sm text-gray-400">Nova Enterprises Management</p>
              </div>
            </div>

            {/* Kill Switch */}
            <button
              onClick={toggleKillSwitch}
              disabled={killSwitchLoading || killSwitchEnabled === null}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                killSwitchEnabled === null
                  ? 'bg-gray-500/10 border border-gray-700 text-gray-300 cursor-not-allowed'
                  : killSwitchEnabled
                    ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
                    : 'bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30'
              }`}
              title={killSwitchEnabled === null ? 'Kill switch status unavailable' : undefined}
            >
              <Power className="w-4 h-4" />
              {killSwitchEnabled === null
                ? 'Kill Switch Unknown'
                : killSwitchEnabled
                  ? 'Kill Switch ACTIVE'
                  : 'Trading Enabled'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-lg w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-sm text-red-300">{error}</span>
          </div>
        )}

        {/* Kill Switch Warning */}
        {killSwitchEnabled === true && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div>
              <div className="font-medium text-red-400">Emergency Kill Switch Active</div>
              <div className="text-sm text-red-400/70">All automated trading operations are currently disabled.</div>
            </div>
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid (verified sources only) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-2xl font-bold">
                  {stats.goalsTotal === null ? '—' : stats.goalsTotal.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Goals (total)</div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <Activity className="w-5 h-5 text-green-400" />
                </div>
                <div className="text-2xl font-bold">
                  {stats.tasksTotal === null ? '—' : stats.tasksTotal.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Tasks (total)</div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-2xl font-bold">
                  {stats.pendingApprovals === null ? '—' : stats.pendingApprovals.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Pending approvals</div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <Clock className="w-5 h-5 text-purple-400" />
                </div>
                <div className="text-2xl font-bold">
                  {stats.eventsLast24Hours === null ? '—' : stats.eventsLast24Hours.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Events (24h)</div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="p-4 border-b border-gray-800">
                <h2 className="font-semibold">Recent Activity</h2>
              </div>
              <div className="divide-y divide-gray-800">
                {events.length === 0 ? (
                  <div className="p-6 text-sm text-gray-400">
                    {isLoading ? 'Loading…' : 'No recent events (or service unavailable).'}
                  </div>
                ) : (
                  events.slice(0, 5).map((evt) => (
                    <div key={evt.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
                          <Activity className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">{evt.type}</div>
                          <div className="text-xs text-gray-400">
                            {evt.actorType}:{evt.actorId}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">{formatDate(evt.ts)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-semibold mb-2">User Management</h2>
            <p className="text-sm text-gray-400">
              Unavailable — user directory is not connected. No placeholder data is shown in SYSTEM ACTIVATION mode.
            </p>
          </div>
        )}

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800">
              <h2 className="font-semibold">Events</h2>
              <p className="text-xs text-gray-500 mt-1">Source: EventBus</p>
            </div>
            <div className="divide-y divide-gray-800">
              {events.length === 0 ? (
                <div className="p-6 text-sm text-gray-400">
                  {isLoading ? 'Loading…' : 'No events (or service unavailable).'}
                </div>
              ) : (
                events.map((evt) => (
                  <div key={evt.id} className="p-4 flex items-start gap-4">
                    <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{evt.type}</span>
                      </div>
                      <div className="text-sm text-gray-400">
                        Actor: {evt.actorType}:{evt.actorId}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Event ID: {evt.id}</div>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(evt.ts)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-semibold mb-2">Platform Settings</h2>
            <p className="text-sm text-gray-400">
              Unavailable — platform setting controls are not wired to backend APIs yet. No placeholder values are displayed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
