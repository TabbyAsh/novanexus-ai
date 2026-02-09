'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api } from '@/lib/api';

interface DecisionItem {
  id: string;
  symbol: string;
  direction: string;
  intent: string;
  status: string;
  source: string;
  journalEntryId: string | null;
  constraints: Record<string, unknown>;
  rationale: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  eventCount: number;
  lastEventAt: string | null;
}

interface ReplayState {
  decision: any;
  events: Array<{
    id: string;
    eventType: string;
    seq: number;
    ts: string;
    payload: Record<string, unknown>;
  }>;
}

function parseJsonInput(raw: string): Record<string, unknown> | undefined {
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return { text: raw };
  }
}

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [replay, setReplay] = useState<ReplayState | null>(null);
  const [noteByDecision, setNoteByDecision] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    symbol: '',
    direction: 'LONG',
    intent: '',
    constraints: '',
    rationale: '',
  });

  const loadDecisions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getDecisions();
      if (result.success && result.data) {
        setDecisions(result.data.decisions as DecisionItem[]);
      } else {
        setError(result.error?.message || 'Failed to load decisions');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load decisions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDecisions();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const result = await api.createDecision({
        symbol: form.symbol,
        direction: form.direction as any,
        intent: form.intent,
        constraints: parseJsonInput(form.constraints),
        rationale: parseJsonInput(form.rationale),
      });

      if (result.success) {
        setShowForm(false);
        setForm({ symbol: '', direction: 'LONG', intent: '', constraints: '', rationale: '' });
        await loadDecisions();
      } else {
        setError(result.error?.message || 'Failed to create decision');
      }
    } catch {
      setError('Failed to create decision');
    }
  };

  const handleReplay = async (decisionId: string) => {
    setError(null);
    try {
      const result = await api.replayDecision(decisionId);
      if (result.success && result.data) {
        setReplay(result.data as ReplayState);
      } else {
        setError(result.error?.message || 'Replay failed');
      }
    } catch {
      setError('Replay failed');
    }
  };

  const handleAppendNote = async (decisionId: string) => {
    const note = noteByDecision[decisionId];
    if (!note?.trim()) return;

    setError(null);
    try {
      const result = await api.appendDecisionEvent(decisionId, 'note', { note });
      if (result.success) {
        setNoteByDecision((prev) => ({ ...prev, [decisionId]: '' }));
        await loadDecisions();
      } else {
        setError(result.error?.message || 'Failed to append note');
      }
    } catch {
      setError('Failed to append note');
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Decisions</h1>
            <p className="text-gray-400">Create decision artifacts, append events, and replay the full chain.</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition"
          >
            {showForm ? 'Close' : 'New Decision'}
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-gray-400">Symbol</label>
                <input
                  value={form.symbol}
                  onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                  className="mt-2 w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
                  placeholder="AAPL"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Direction</label>
                <select
                  value={form.direction}
                  onChange={(e) => setForm((prev) => ({ ...prev, direction: e.target.value }))}
                  className="mt-2 w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400">Intent</label>
                <input
                  value={form.intent}
                  onChange={(e) => setForm((prev) => ({ ...prev, intent: e.target.value }))}
                  className="mt-2 w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
                  placeholder="Breakout above 180 with tight stop"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400">Constraints (JSON or text)</label>
                <textarea
                  value={form.constraints}
                  onChange={(e) => setForm((prev) => ({ ...prev, constraints: e.target.value }))}
                  className="mt-2 w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white h-28"
                  placeholder='{"maxRiskPct":2,"timeHorizon":"2w"}'
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Rationale (JSON or text)</label>
                <textarea
                  value={form.rationale}
                  onChange={(e) => setForm((prev) => ({ ...prev, rationale: e.target.value }))}
                  className="mt-2 w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white h-28"
                  placeholder="Earnings momentum + trend confirmation."
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 transition"
              >
                Save Decision
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">
            {isLoading ? (
              <div className="text-gray-400">Loading decisions…</div>
            ) : decisions.length === 0 ? (
              <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 text-gray-400">
                No decisions yet. Create one to start your replay loop.
              </div>
            ) : (
              decisions.map((decision) => (
                <div key={decision.id} className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-semibold text-white">{decision.symbol}</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          {decision.direction}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-gray-300 border border-white/10">
                          {decision.status}
                        </span>
                      </div>
                      <p className="text-gray-300 mt-2">{decision.intent}</p>
                      <div className="text-xs text-gray-500 mt-2">
                        Created {formatDate(decision.createdAt)} · Events {decision.eventCount} · Last {formatDate(decision.lastEventAt)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReplay(decision.id)}
                        className="px-3 py-2 rounded-lg bg-purple-600/80 text-white hover:bg-purple-500 transition"
                      >
                        Replay
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-3">
                    <input
                      value={noteByDecision[decision.id] || ''}
                      onChange={(e) => setNoteByDecision((prev) => ({ ...prev, [decision.id]: e.target.value }))}
                      className="flex-1 rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm text-white"
                      placeholder="Append note/event (optional)"
                    />
                    <button
                      onClick={() => handleAppendNote(decision.id)}
                      className="px-3 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
                    >
                      Add Note
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4">
            <div className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800">
              <h2 className="text-lg font-semibold text-white">Replay Output</h2>
              <p className="text-sm text-gray-400 mb-4">Latest replay for verification.</p>
              {replay ? (
                <div className="space-y-4">
                  <div className="text-sm text-gray-300">
                    <div className="text-white font-medium">{replay.decision.symbol}</div>
                    <div className="text-gray-400">{replay.decision.intent}</div>
                    {replay.decision.quoteSnapshot && (
                      <div className="text-xs text-gray-500 mt-2">
                        Quote snapshot: ${String(replay.decision.quoteSnapshot.price || '—')}
                      </div>
                    )}
                  </div>
                  <div className="border border-gray-800 rounded-xl p-3 max-h-64 overflow-auto text-xs text-gray-400 space-y-2">
                    {replay.events.map((event) => (
                      <div key={event.id} className="flex items-start gap-2">
                        <span className="text-cyan-400">{event.seq}</span>
                        <div>
                          <div className="text-gray-300">{event.eventType}</div>
                          <div className="text-gray-500">{new Date(event.ts).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">Replay a decision to view its event chain.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
