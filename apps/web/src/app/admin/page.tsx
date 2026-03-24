'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  FileText,
  Heart,
  Lock,
  Play,
  Power,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface PulseData {
  revenue: {
    mrr: number; totalActiveSubscribers: number; totalUsers: number;
    byPlan: Record<string, { active: number; canceled: number; pastDue: number; trialing: number }>;
  } | null;
  briefDelivery: {
    recentRuns: Array<{ job_name: string; status: string; duration_ms: number; created_at: string; details: any }>;
    totals: Record<string, number>; successRate: number | null;
  } | null;
  outcomes: {
    byStatus: Record<string, { count: number; avgPnl: number }>;
    totalTracked: number; resolved: number; winRate: number | null; wins: number; losses: number;
  } | null;
  calibration: { metrics: Array<any> } | null;
  scheduler: { recentRuns: Array<{ job_name: string; status: string; duration_ms: number; created_at: string }> } | null;
  deployment: { version: string; nodeVersion: string; uptime: number; env: string } | null;
  threats: { recentFailures: Array<any>; pastDueSubscriptions: number } | null;
  opportunities: { decisionCardsThisWeek: number; newUsersThisWeek: number; decisionCards30d?: number; newUsers30d?: number } | null;
  economics: {
    grossMrr: number; netMrr: number; atRiskMrr: number;
    paidUsers: number; freeUsers: number; conversionRate: number;
    briefsSent7d: number; briefsSent30d: number; revenuePerPaidUser: number;
    infraCostMonthly: number | null; margin: number | null;
  } | null;
  trends: {
    signups: Array<{ date: string; count: number }>;
    briefsSent: Array<{ date: string; count: number }>;
    outcomes: Array<{ date: string; wins: number; losses: number }>;
  } | null;
  actionLog: Array<{ id: string; actor_id: string; action_type: string; target: string; result: string; details: any; created_at: string }> | null;
  reviews: Array<{ id: string; wins?: string; losses?: string; decisions?: string; nextPriorities?: string; notes?: string; createdAt: string }> | null;
  schedulerState: { status: string; recentHealthAlerts: number; lastBriefRun: { status: string; at: string } | null } | null;
  governance: {
    setupTypes: Array<{ setup_type: string; status: string; reason: string; total_setups: number; win_rate: number | null; avg_pnl: number; manual_override: boolean; changed_by: string | null; auto_status: string }>;
    summary: { eligible: number; watch: number; quarantine: number; total: number };
    _fetchedAt: string;
  } | null;
  governanceImpact: {
    outcomesByClass: Record<string, { total: number; wins: number; losses: number; winRate: number | null; avgPnl: number }>;
    activeQuarantines: number;
    manualOverrides: number;
    overrideActions7d: number;
    _fetchedAt: string;
  } | null;
  _meta: { generatedAt: string; durationMs: number; errors?: string[] };
}

interface ServiceHealthItem {
  service: string; status: string; responseTimeMs: number; error: string | null;
}

interface SchedulerStatusData {
  uptime: number; schedulesActive: boolean; healthMonitorActive: boolean;
  serviceHealth: ServiceHealthItem[];
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'success' || status === 'healthy'
    ? 'bg-green-400' : status === 'failure' || status === 'unhealthy' || status === 'unreachable'
    ? 'bg-red-400' : status === 'alert' ? 'bg-amber-400' : 'bg-gray-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-white' }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color = 'text-cyan-400' }: { icon: any; title: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`w-5 h-5 ${color}`} />
      <h2 className="text-lg font-semibold text-white">{title}</h2>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CommandCenter() {
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatusData | null>(null);
  const [killSwitch, setKillSwitch] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [triggerStatus, setTriggerStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [pulseRes, schedulerRes, statsRes] = await Promise.all([
        api.getCommandPulse(),
        api.getSchedulerStatus().catch(() => ({ success: false as const, data: undefined })),
        api.getStats().catch(() => ({ success: false as const, data: undefined })),
      ]);
      if (pulseRes.success && pulseRes.data) setPulse(pulseRes.data as unknown as PulseData);
      else setError(pulseRes.error?.message || 'Failed to load command pulse');
      if (schedulerRes.success && schedulerRes.data) setSchedulerStatus(schedulerRes.data as unknown as SchedulerStatusData);
      if (statsRes.success && statsRes.data) setKillSwitch(statsRes.data.killSwitch?.enabled ?? null);
      setLastRefresh(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { const i = setInterval(loadData, 60000); return () => clearInterval(i); }, [loadData]);

  const handleTrigger = async (job: 'brief' | 'outcomes' | 'health') => {
    setTriggerStatus(s => ({ ...s, [job]: 'running' }));
    try {
      const res = await api.triggerSchedulerJob(job);
      setTriggerStatus(s => ({ ...s, [job]: res.success ? 'triggered' : 'failed' }));
      setTimeout(loadData, 3000);
    } catch { setTriggerStatus(s => ({ ...s, [job]: 'failed' })); }
    setTimeout(() => setTriggerStatus(s => ({ ...s, [job]: '' })), 5000);
  };

  const handleKillSwitch = async () => {
    if (killSwitch === null) return;
    const activating = !killSwitch;
    if (!window.confirm(activating ? 'ACTIVATE kill switch? This disables ALL automated operations.' : 'DEACTIVATE kill switch?')) return;
    if (activating) {
      const reason = window.prompt('Reason (optional):') || undefined;
      const res = await api.enableKillSwitch(reason);
      if (res.success) {
        setKillSwitch(res.data?.enabled ?? true);
        api.logCommandAction('kill-switch-enable', 'enterprise', 'success', { reason }).catch(() => {});
      }
    } else {
      const res = await api.disableKillSwitch();
      if (res.success) {
        setKillSwitch(res.data?.enabled ?? false);
        api.logCommandAction('kill-switch-disable', 'enterprise', 'success').catch(() => {});
      }
    }
  };

  const handleTriggerAudited = async (job: 'brief' | 'outcomes' | 'health') => {
    setTriggerStatus(s => ({ ...s, [job]: 'running' }));
    try {
      const res = await api.triggerSchedulerJob(job);
      if (res.success) {
        setTriggerStatus(s => ({ ...s, [job]: 'triggered' }));
      } else {
        // Check for cooldown
        const errMsg = (res as any).error?.message || '';
        setTriggerStatus(s => ({ ...s, [job]: errMsg.includes('cooldown') ? 'cooldown' : 'failed' }));
      }
      setTimeout(loadData, 3000);
    } catch { setTriggerStatus(s => ({ ...s, [job]: 'failed' })); }
    setTimeout(() => setTriggerStatus(s => ({ ...s, [job]: '' })), 5000);
  };

  const rev = pulse?.revenue;
  const bd = pulse?.briefDelivery;
  const out = pulse?.outcomes;
  const dep = pulse?.deployment;
  const thr = pulse?.threats;
  const opp = pulse?.opportunities;
  const sched = pulse?.scheduler;
  const econ = pulse?.economics as PulseData['economics'];
  const actionLog = pulse?.actionLog as PulseData['actionLog'];
  const reviews = pulse?.reviews as PulseData['reviews'];
  const schedState = pulse?.schedulerState as PulseData['schedulerState'];
  const gov = pulse?.governance as PulseData['governance'];
  const govImpact = pulse?.governanceImpact as PulseData['governanceImpact'];
  const health = schedulerStatus?.serviceHealth || [];

  const handleGovernanceOverride = async (setupType: string, newStatus: 'eligible' | 'watch' | 'quarantine') => {
    const reason = window.prompt(`Override ${setupType} to ${newStatus}. Reason:`);
    if (reason === null) return; // canceled
    const res = await api.setGovernanceOverride(setupType, newStatus, reason || undefined);
    if (res.success) setTimeout(loadData, 1000);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* HEADER */}
      <div className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/20 rounded-lg"><Shield className="w-6 h-6 text-cyan-400" /></div>
              <div>
                <h1 className="text-xl font-bold">Nova Command Center</h1>
                <p className="text-sm text-gray-400">
                  Enterprise Pulse {dep ? `· v${dep.version} · ${dep.env}` : ''}
                  {lastRefresh && ` · Updated ${formatTime(lastRefresh.toISOString())}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={loadData} disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 text-sm transition">
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button onClick={handleKillSwitch} disabled={killSwitch === null}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition ${
                  killSwitch === null ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : killSwitch ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
                  : 'bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30'}`}>
                <Power className="w-4 h-4" />
                {killSwitch === null ? 'Unknown' : killSwitch ? 'KILL ACTIVE' : 'Systems Go'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-2 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        </div>
      )}

      {pulse?._meta?.errors && pulse._meta.errors.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pt-2">
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">
            Partial data: {pulse._meta.errors.join(', ')}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
        {/* KEY METRICS */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard icon={DollarSign} label="MRR" value={rev ? `$${rev.mrr.toLocaleString()}` : '\u2014'} color="text-green-400" sub={rev ? `${rev.totalActiveSubscribers} active subs` : undefined} />
          <StatCard icon={Users} label="Users" value={rev?.totalUsers ?? '\u2014'} color="text-blue-400" sub={opp ? `+${opp.newUsersThisWeek} this week` : undefined} />
          <StatCard icon={Target} label="Win Rate" value={out?.winRate != null ? `${out.winRate}%` : '\u2014'} color="text-cyan-400" sub={out ? `${out.wins}W / ${out.losses}L (${out.resolved} resolved)` : undefined} />
          <StatCard icon={Zap} label="Briefs Sent" value={bd?.totals?.success ?? '\u2014'} color="text-purple-400" sub={bd?.successRate != null ? `${bd.successRate}% success rate` : undefined} />
          <StatCard icon={BarChart3} label="Signals/wk" value={opp?.decisionCardsThisWeek ?? '\u2014'} color="text-amber-400" />
          <StatCard icon={Clock} label="Uptime" value={dep ? formatUptime(dep.uptime) : '\u2014'} color="text-gray-300" sub={dep ? `Node ${dep.nodeVersion}` : undefined} />
        </div>

        {/* SERVICE HEALTH + CONTROL */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={Heart} title="Service Health" color="text-red-400" />
            {health.length === 0 ? (
              <p className="text-sm text-gray-500">No health data yet. Scheduler may still be starting.</p>
            ) : (
              <div className="space-y-2">
                {health.map(h => (
                  <div key={h.service} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50">
                    <div className="flex items-center gap-2">
                      <StatusDot status={h.status} />
                      <span className="text-sm font-medium">{h.service}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500">{h.responseTimeMs}ms</span>
                      {h.error && <span className="text-red-400 truncate max-w-[200px]">{h.error}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {schedulerStatus && (
              <div className="mt-3 text-xs text-gray-500">
                Scheduler: {schedulerStatus.schedulesActive ? '\u2713 Schedules active' : '\u23F8 Schedules paused'}
                {' \u00B7 '}
                {schedulerStatus.healthMonitorActive ? '\u2713 Health monitor active' : '\u23F8 Health monitor paused'}
              </div>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={Play} title="Control Actions" color="text-green-400" />
            <div className="space-y-3">
              {([
                { job: 'brief' as const, label: 'Generate & Send Daily Brief', desc: 'Runs screener \u2192 generates brief \u2192 sends to subscribers', icon: Zap },
                { job: 'outcomes' as const, label: 'Track Brief Outcomes', desc: 'Fetches current prices, classifies setup outcomes', icon: Target },
                { job: 'health' as const, label: 'Run Health Check', desc: 'Pings all services, updates health status', icon: Heart },
              ]).map(({ job, label, desc, icon: BtnIcon }) => (
                <div key={job} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    <BtnIcon className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs text-gray-500">{desc}</div>
                    </div>
                  </div>
                  <button onClick={() => handleTriggerAudited(job)} disabled={triggerStatus[job] === 'running' || triggerStatus[job] === 'cooldown'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      triggerStatus[job] === 'triggered' ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : triggerStatus[job] === 'failed' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : triggerStatus[job] === 'running' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                      : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20'}`}>
                    {triggerStatus[job] === 'running' ? 'Running...' : triggerStatus[job] === 'triggered' ? '\u2713 Triggered' : triggerStatus[job] === 'failed' ? '\u2715 Failed' : triggerStatus[job] === 'cooldown' ? '\u23F1 Cooldown' : 'Trigger'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* REVENUE + OUTCOMES */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={DollarSign} title="Revenue by Plan" color="text-green-400" />
            {rev ? (
              <div className="space-y-2">
                {Object.entries(rev.byPlan).map(([plan, counts]) => {
                  const pm: Record<string, number> = { FOUNDING: 99, LITE: 29, PRO: 149 };
                  const planMrr = (counts.active + counts.trialing) * (pm[plan] || 0);
                  return (
                    <div key={plan} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
                      <div>
                        <span className="text-sm font-medium">{plan}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {counts.active} active
                          {counts.trialing > 0 && ` \u00B7 ${counts.trialing} trial`}
                          {counts.canceled > 0 && ` \u00B7 ${counts.canceled} canceled`}
                          {counts.pastDue > 0 && <span className="text-red-400"> \u00B7 {counts.pastDue} past due</span>}
                        </span>
                      </div>
                      <span className={`text-sm font-bold ${planMrr > 0 ? 'text-green-400' : 'text-gray-500'}`}>${planMrr}/mo</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-gray-500">Revenue data unavailable</p>}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={Target} title="Brief Outcome Breakdown" color="text-cyan-400" />
            {out && Object.keys(out.byStatus).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(out.byStatus).map(([status, { count, avgPnl }]) => {
                  const colors: Record<string, string> = { HIT_T1: 'text-green-400', HIT_T2: 'text-emerald-400', STOPPED_OUT: 'text-red-400', ACTIVE: 'text-blue-400', NO_TRIGGER: 'text-gray-400' };
                  return (
                    <div key={status} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50">
                      <div className="flex items-center gap-2">
                        {status.startsWith('HIT') ? <CheckCircle className="w-4 h-4 text-green-400" /> : status === 'STOPPED_OUT' ? <XCircle className="w-4 h-4 text-red-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                        <span className={`text-sm font-medium ${colors[status] || 'text-gray-300'}`}>{status.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold">{count}</span>
                        {avgPnl !== 0 && <span className={`text-xs ml-2 ${avgPnl > 0 ? 'text-green-400' : 'text-red-400'}`}>avg {avgPnl > 0 ? '+' : ''}{avgPnl.toFixed(1)}%</span>}
                      </div>
                    </div>
                  );
                })}
                <div className="mt-2 p-2 rounded-lg bg-gray-800/30 text-xs text-gray-400">
                  {out.totalTracked} tracked \u00B7 {out.resolved} resolved \u00B7 Win rate: {out.winRate ?? '\u2014'}%
                </div>
              </div>
            ) : <p className="text-sm text-gray-500">No outcome data yet. Run outcome tracking to populate.</p>}
          </div>
        </div>

        {/* BRIEF LOG + THREATS */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={Zap} title="Brief Delivery Log" color="text-purple-400" />
            {bd && bd.recentRuns.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {bd.recentRuns.map((run, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50 text-sm">
                    <div className="flex items-center gap-2">
                      <StatusDot status={run.status} />
                      <span className="text-gray-300">{formatTime(run.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500">{run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '\u2014'}</span>
                      <span className={run.status === 'success' ? 'text-green-400' : 'text-red-400'}>{run.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">No brief delivery runs recorded yet.</p>}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={AlertTriangle} title="Threat Registry" color="text-red-400" />
            <div className="space-y-2">
              {thr?.pastDueSubscriptions ? (
                <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <span className="text-sm text-red-300">Past-due subscriptions</span>
                  <span className="text-sm font-bold text-red-400">{thr.pastDueSubscriptions}</span>
                </div>
              ) : null}
              {thr?.recentFailures && thr.recentFailures.length > 0 ? (
                thr.recentFailures.slice(0, 5).map((f: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50 text-sm">
                    <div className="flex items-center gap-2">
                      <StatusDot status={f.status} />
                      <span className="text-gray-300">{f.job_name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{formatTime(f.created_at)}</span>
                  </div>
                ))
              ) : (
                <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> No active threats detected
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SCHEDULER RUNS + OPPORTUNITIES */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={Server} title="Recent Scheduler Runs" color="text-amber-400" />
            {sched && sched.recentRuns.length > 0 ? (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {sched.recentRuns.map((run, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-gray-800/30 text-xs">
                    <div className="flex items-center gap-2">
                      <StatusDot status={run.status} />
                      <span className="text-gray-300 font-medium">{run.job_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '\u2014'}</span>
                      <span className="text-gray-500">{formatTime(run.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">No scheduler runs recorded yet.</p>}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={TrendingUp} title="Opportunity Registry" color="text-emerald-400" />
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
                <div><div className="text-sm font-medium">Decision Cards (7d)</div><div className="text-xs text-gray-500">Screener-generated signals</div></div>
                <span className="text-xl font-bold text-emerald-400">{opp?.decisionCardsThisWeek ?? '\u2014'}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
                <div><div className="text-sm font-medium">New Signups (7d)</div><div className="text-xs text-gray-500">User acquisition</div></div>
                <span className="text-xl font-bold text-blue-400">{opp?.newUsersThisWeek ?? '\u2014'}</span>
              </div>
              {rev && rev.totalUsers > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
                  <div><div className="text-sm font-medium">Conversion Rate</div><div className="text-xs text-gray-500">Active subs / total users</div></div>
                  <span className="text-xl font-bold text-cyan-400">{(rev.totalActiveSubscribers / rev.totalUsers * 100).toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ECONOMICS — Unit economics panel */}
        {econ && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={DollarSign} title="Unit Economics" color="text-green-400" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-lg bg-gray-800/50">
                <div className="text-xs text-gray-500">Net MRR</div>
                <div className="text-lg font-bold text-green-400">${econ.netMrr}</div>
                {econ.atRiskMrr > 0 && <div className="text-xs text-red-400">-${econ.atRiskMrr} at risk</div>}
              </div>
              <div className="p-3 rounded-lg bg-gray-800/50">
                <div className="text-xs text-gray-500">Paid Users</div>
                <div className="text-lg font-bold text-blue-400">{econ.paidUsers}</div>
                <div className="text-xs text-gray-500">{econ.freeUsers} free</div>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/50">
                <div className="text-xs text-gray-500">Conversion</div>
                <div className="text-lg font-bold text-cyan-400">{econ.conversionRate}%</div>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/50">
                <div className="text-xs text-gray-500">Rev/Paid User</div>
                <div className="text-lg font-bold text-green-400">${econ.revenuePerPaidUser}</div>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/50">
                <div className="text-xs text-gray-500">Briefs (7d/30d)</div>
                <div className="text-lg font-bold text-purple-400">{econ.briefsSent7d} / {econ.briefsSent30d}</div>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/50">
                <div className="text-xs text-gray-500">Infra Cost</div>
                <div className="text-lg font-bold text-gray-300">{econ.infraCostMonthly !== null ? `$${econ.infraCostMonthly}` : 'Not set'}</div>
                {econ.margin !== null && <div className="text-xs text-green-400">{econ.margin}% margin</div>}
                {econ.infraCostMonthly === null && <div className="text-xs text-gray-600">Set INFRA_COST_MONTHLY</div>}
              </div>
            </div>
          </div>
        )}

        {/* SCHEDULER STATE + ACTION HISTORY */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Scheduler State */}
          {schedState && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <SectionHeader icon={Activity} title="Scheduler State" color="text-amber-400" />
              <div className="flex items-center gap-3 mb-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  schedState.status === 'healthy' ? 'bg-green-500/20 text-green-400' :
                  schedState.status === 'degraded' ? 'bg-amber-500/20 text-amber-400' :
                  schedState.status === 'blocked' ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>{schedState.status.toUpperCase()}</span>
                {schedState.recentHealthAlerts > 0 && (
                  <span className="text-xs text-amber-400">{schedState.recentHealthAlerts} alerts (30m)</span>
                )}
              </div>
              {schedState.lastBriefRun && (
                <div className="text-xs text-gray-500">
                  Last brief: <StatusDot status={schedState.lastBriefRun.status} /> {schedState.lastBriefRun.status} at {formatTime(schedState.lastBriefRun.at)}
                </div>
              )}
            </div>
          )}

          {/* Action History */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <SectionHeader icon={FileText} title="Action Audit Log" color="text-indigo-400" />
            {actionLog && actionLog.length > 0 ? (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {actionLog.slice(0, 15).map((a: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-gray-800/30 text-xs">
                    <div className="flex items-center gap-2">
                      <StatusDot status={a.result} />
                      <span className="text-gray-300 font-medium">{a.action_type}</span>
                      {a.target && <span className="text-gray-500">{'\u2192'} {a.target}</span>}
                      {a.actor_id && a.actor_id !== 'scheduler' && <span className="text-gray-600 ml-1">by {a.actor_id.slice(0, 8)}</span>}
                    </div>
                    <span className="text-gray-500">{formatTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">No command actions recorded yet.</p>}
          </div>
        </div>

        {/* SETUP GOVERNANCE */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader icon={ShieldAlert} title="Setup Type Governance" color="text-orange-400" />
            {gov?.summary && (
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400">{gov.summary.eligible} eligible</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">{gov.summary.watch} watch</span>
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400">{gov.summary.quarantine} quarantine</span>
              </div>
            )}
          </div>
          {gov && gov.setupTypes.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {gov.setupTypes.map((g: any, i: number) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${
                  g.status === 'eligible' ? 'bg-green-500/5 border-green-500/20' :
                  g.status === 'quarantine' ? 'bg-red-500/5 border-red-500/20' :
                  'bg-amber-500/5 border-amber-500/20'
                }`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        g.status === 'eligible' ? 'bg-green-500/20 text-green-400' :
                        g.status === 'quarantine' ? 'bg-red-500/20 text-red-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>{g.status.toUpperCase()}</span>
                      <span className="text-sm font-medium text-white">{g.setup_type}</span>
                      {g.manual_override && <Lock className="w-3 h-3 text-amber-400" title="Manual override" />}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {g.reason}
                      {g.win_rate !== null && ` \u00B7 ${g.win_rate}% win rate \u00B7 ${g.total_setups} total`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    {g.status !== 'eligible' && (
                      <button onClick={() => handleGovernanceOverride(g.setup_type, 'eligible')}
                        className="px-2 py-1 rounded text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 transition"
                        title="Promote to eligible">\u2713</button>
                    )}
                    {g.status !== 'watch' && (
                      <button onClick={() => handleGovernanceOverride(g.setup_type, 'watch')}
                        className="px-2 py-1 rounded text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"
                        title="Set to watch">\u25CE</button>
                    )}
                    {g.status !== 'quarantine' && (
                      <button onClick={() => handleGovernanceOverride(g.setup_type, 'quarantine')}
                        className="px-2 py-1 rounded text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                        title="Quarantine">\u2715</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-500">No governance data yet. Run outcome tracking to compute setup type performance.</p>}
          <div className="text-xs text-gray-600 mt-2">Fails closed: unknown types default to watch. Auto-computed from brief outcomes. Manual overrides persist until cleared.</div>

          {/* Governance Impact Measurement */}
          {govImpact && Object.keys(govImpact.outcomesByClass).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-3">Outcome Quality by Governance Class</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(govImpact.outcomesByClass).map(([cls, data]) => (
                  <div key={cls} className={`p-2 rounded-lg text-center ${
                    cls === 'eligible' ? 'bg-green-500/10' : cls === 'quarantine' ? 'bg-red-500/10' : cls === 'watch' ? 'bg-amber-500/10' : 'bg-gray-800/50'
                  }`}>
                    <div className={`text-xs font-bold ${
                      cls === 'eligible' ? 'text-green-400' : cls === 'quarantine' ? 'text-red-400' : cls === 'watch' ? 'text-amber-400' : 'text-gray-400'
                    }`}>{cls.toUpperCase()}</div>
                    <div className="text-lg font-bold text-white">{data.winRate !== null ? `${data.winRate}%` : '\u2014'}</div>
                    <div className="text-xs text-gray-500">{data.wins}W/{data.losses}L ({data.total})</div>
                    {data.avgPnl !== 0 && <div className={`text-xs ${data.avgPnl > 0 ? 'text-green-400' : 'text-red-400'}`}>{data.avgPnl > 0 ? '+' : ''}{data.avgPnl.toFixed(1)}%</div>}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>{govImpact.activeQuarantines} quarantined</span>
                <span>{govImpact.manualOverrides} overrides</span>
                <span>{govImpact.overrideActions7d} override actions (7d)</span>
              </div>
            </div>
          )}
        </div>

        {/* WEEKLY REVIEWS */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <SectionHeader icon={BookOpen} title="Weekly Reviews" color="text-violet-400" />
          {reviews && reviews.length > 0 ? (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {reviews.map((r: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">{formatTime(r.createdAt)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {r.wins && <div><span className="text-green-400 font-medium">Wins:</span> <span className="text-gray-300">{r.wins}</span></div>}
                    {r.losses && <div><span className="text-red-400 font-medium">Losses:</span> <span className="text-gray-300">{r.losses}</span></div>}
                    {r.decisions && <div className="col-span-2"><span className="text-cyan-400 font-medium">Decisions:</span> <span className="text-gray-300">{r.decisions}</span></div>}
                    {r.risks && <div className="col-span-2"><span className="text-red-300 font-medium">Risks:</span> <span className="text-gray-300">{r.risks}</span></div>}
                    {r.nextActions && <div className="col-span-2"><span className="text-emerald-400 font-medium">Next Actions:</span> <span className="text-gray-300">{r.nextActions}</span></div>}
                    {r.nextPriorities && <div className="col-span-2"><span className="text-amber-400 font-medium">Priorities:</span> <span className="text-gray-300">{r.nextPriorities}</span></div>}
                    {r.notes && <div className="col-span-2"><span className="text-gray-400 font-medium">Notes:</span> <span className="text-gray-300">{r.notes}</span></div>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-500">No weekly reviews yet. Use POST /v1/command/review to log one.</p>}
        </div>

        <div className="text-xs text-gray-600 text-center pb-4">
          Command pulse generated in {pulse?._meta?.durationMs ?? '\u2014'}ms
          {' \u00B7 '}{pulse?._meta?.generatedAt ? formatTime(pulse._meta.generatedAt) : ''}
          {' \u00B7 '}Nova Enterprises Command Layer v2
        </div>
      </div>
    </div>
  );
}
