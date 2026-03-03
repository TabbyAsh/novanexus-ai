'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Bot, Play, Clock, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Zap, Activity,
} from 'lucide-react';

interface AgentDef {
  id: string; name: string; slug: string; sector: string;
  description: string; steps_template: any[]; risk_level: string;
  requires_mode: string; enabled: boolean;
}

interface AgentRun {
  id: string; status: string; agent_name: string; agent_slug: string;
  sector: string; steps_completed: number; steps_total: number;
  outcome_value: number | null; outcome_type: string | null;
  governance_mode: string; duration_ms: number | null;
  created_at: string; completed_at: string | null; error_message: string | null;
  result_summary: any;
}

const SECTOR_COLORS: Record<string, string> = {
  stocks: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  marketplace: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  portfolio: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  compliance: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  COMPLETED: CheckCircle2, FAILED: XCircle, RUNNING: Activity,
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'text-green-400', FAILED: 'text-red-400', RUNNING: 'text-cyan-400 animate-pulse',
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningSlug, setRunningSlug] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runDetails, setRunDetails] = useState<Record<string, any>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [defRes, runsRes] = await Promise.all([
        api.getAgentDefinitions(),
        api.getAgentRuns(20),
      ]);
      if (defRes.success && defRes.data) setAgents(defRes.data.agents);
      if (runsRes.success && runsRes.data) setRuns(runsRes.data.runs);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const triggerRun = async (slug: string) => {
    setRunningSlug(slug);
    try {
      const res = await api.runAgent(slug);
      if (res.success) {
        load(); // refresh runs
      }
    } finally { setRunningSlug(null); }
  };

  const toggleRunDetails = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(runId);
    if (!runDetails[runId]) {
      const res = await api.getAgentRun(runId);
      if (res.success && res.data) {
        setRunDetails(prev => ({ ...prev, [runId]: res.data }));
      }
    }
  };

  const fmtDuration = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const fmtTime = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Bot className="w-8 h-8 text-cyan-400" /> Agent Control Center
          </h1>
          <p className="text-gray-400 mt-1">
            Autonomous agents that execute multi-step workflows. AI-first, not chatbot.
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
          <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Agent Definitions Grid */}
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-yellow-400" /> Available Agents
      </h2>

      {loading && agents.length === 0 ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {agents.map(agent => (
            <div key={agent.id} className={`rounded-xl border p-5 ${SECTOR_COLORS[agent.sector] || 'border-gray-700 bg-gray-800/50 text-gray-300'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">{agent.name}</h3>
                  <span className="text-xs uppercase tracking-wider opacity-75">{agent.sector}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border ${
                  agent.risk_level === 'LOW' ? 'border-green-500/40 text-green-400' :
                  agent.risk_level === 'MEDIUM' ? 'border-amber-500/40 text-amber-400' :
                  'border-red-500/40 text-red-400'
                }`}>
                  {agent.risk_level} RISK
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-3">{agent.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {agent.steps_template?.length || 0} steps · mode: {agent.requires_mode}
                </span>
                <button
                  onClick={() => triggerRun(agent.slug)}
                  disabled={runningSlug === agent.slug}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition"
                >
                  {runningSlug === agent.slug ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running...</>
                  ) : (
                    <><Play className="w-3.5 h-3.5" /> Run Now</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Runs */}
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-cyan-400" /> Recent Runs
      </h2>

      {runs.length === 0 && !loading ? (
        <div className="text-center py-12 text-gray-500">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No agent runs yet. Trigger your first agent above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map(run => {
            const StatusIcon = STATUS_ICONS[run.status] || AlertTriangle;
            const isExpanded = expandedRun === run.id;
            const details = runDetails[run.id];

            return (
              <div key={run.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleRunDetails(run.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition text-left"
                >
                  <StatusIcon className={`w-5 h-5 flex-shrink-0 ${STATUS_COLORS[run.status] || 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{run.agent_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${SECTOR_COLORS[run.sector] || 'bg-gray-700 text-gray-400'}`}>{run.sector}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-0.5">
                      <span>{fmtTime(run.created_at)}</span>
                      <span>{run.steps_completed}/{run.steps_total} steps</span>
                      <span>{fmtDuration(run.duration_ms)}</span>
                      {run.outcome_value != null && run.outcome_value > 0 && (
                        <span className="text-green-400">+{run.outcome_value} {run.outcome_type}</span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-800 p-4 bg-gray-950/50">
                    {run.error_message && (
                      <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {run.error_message}
                      </div>
                    )}
                    {details?.steps ? (
                      <div className="space-y-2">
                        {details.steps.map((step: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <span className="text-gray-500 w-6 text-right">{i + 1}</span>
                            <span className={`w-2 h-2 rounded-full ${
                              step.status === 'COMPLETED' ? 'bg-green-400' :
                              step.status === 'FAILED' ? 'bg-red-400' :
                              step.status === 'SKIPPED' ? 'bg-gray-500' : 'bg-cyan-400'
                            }`} />
                            <span className="text-gray-300 flex-1">{step.step_name}</span>
                            <span className="text-gray-500">{step.action}</span>
                            <span className="text-gray-600 w-16 text-right">{fmtDuration(step.duration_ms)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex justify-center py-4"><RefreshCw className="w-4 h-4 text-gray-500 animate-spin" /></div>
                    )}
                    <div className="mt-3 text-xs text-gray-600">
                      Governance: {run.governance_mode} · Run ID: {run.id.slice(0, 8)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
