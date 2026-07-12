'use client';

/**
 * FORGE CONTROL — the builder-agent workforce, as a product surface (Phase 6).
 * Watch the Smith write code and repair its own failures; run the gated
 * self-improvement loop; read the eval leaderboard. Every proposal is a
 * reviewable artifact — nothing merges without a human.
 */

import { useCallback, useEffect, useState } from 'react';

const API = '/api/proxy';

interface SmithResult {
  solved: boolean; iterations: number; finalCode: string; finalTestOutput: string;
  trajectory: Array<{ iteration: number; passed: boolean; error: string }>;
  artifactId: string | null;
}
interface EvalRow { agent: string; suite: string; passed: number; total: number; score: number; created_at: string }
interface ProviderH { name: string; configured: boolean; available: boolean; lastSuccessAt: string | null; lastFailureReason: string | null; quotaExhaustedUntil: string | null }
interface Health {
  providers: ProviderH[]; capableOfLLM: boolean; fallbackOrder: string[];
  sovereignty: { score: number; band: string; localAvailable: boolean; externalConfigured: number; rationale: string };
  lastRun: { provider: string | null; at: string | null; tier: string | null };
  failureMemory: Array<{ observation: string; lesson: string; at: string }>;
}

function token() { return typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') : null; }

export default function ForgeControl() {
  const [problem, setProblem] = useState('Export function isBalanced(s) returning true iff the brackets ()[]{} in s are correctly balanced and nested.');
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<SmithResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const [improveMsg, setImproveMsg] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ approvalId: string; semver: string } | null>(null);
  const [board, setBoard] = useState<EvalRow[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [proposals, setProposals] = useState<Array<{ id: string; author: string; claim: string; summary: string }>>([]);

  const loadProposals = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/agents/proposals`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
      const d = await r.json();
      if (d?.success) setProposals(d.data.proposals || []);
    } catch { /* leave empty */ }
  }, []);

  const decide = useCallback(async (proposalId: string, decision: 'accept' | 'reject') => {
    const reason = window.prompt(decision === 'accept' ? 'Why accept? (this trains the agent)' : 'Why reject? (this trains the agent)') || '';
    if (!reason.trim()) return;
    try {
      const response = await fetch(`${API}/v1/agents/proposals/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: JSON.stringify({ proposalId, decision, reason }),
      });
      if (!response.ok) return;
      loadProposals();
    } catch { /* optimistic */ }
  }, [loadProposals]);

  const loadBoard = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/agents/evals/leaderboard`);
      const d = await r.json();
      if (d?.success) setBoard(d.data.runs || []);
    } catch { /* leave empty */ }
  }, []);
  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/agents/providers`);
      const d = await r.json();
      if (d?.success) setHealth(d.data);
    } catch { /* leave null */ }
  }, []);
  useEffect(() => { loadBoard(); loadHealth(); loadProposals(); }, [loadBoard, loadHealth, loadProposals]);

  const build = useCallback(async () => {
    if (!problem.trim() || building) return;
    setBuilding(true); setError(null); setResult(null);
    try {
      const r = await fetch(`${API}/v1/smith/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: JSON.stringify({ problem: problem.trim() }),
      });
      const d = await r.json();
      if (d?.success) setResult(d.data);
      else setError(d?.error?.message || 'Build failed.');
    } catch { setError('Could not reach the Smith.'); }
    finally { setBuilding(false); }
  }, [problem, building]);

  const improve = useCallback(async () => {
    if (improving) return;
    setImproving(true); setImproveMsg(null); setPendingPromotion(null);
    try {
      const r = await fetch(`${API}/v1/agents/evals/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: JSON.stringify({ agent: 'coder-agent' }),
      });
      const d = await r.json();
      setImproveMsg(d?.success ? d.data.reason : (d?.error?.message || 'Pass failed.'));
      if (d?.success && d.data?.approvalId && d.data?.candidateSemver) {
        setPendingPromotion({ approvalId: d.data.approvalId, semver: d.data.candidateSemver });
      }
      loadBoard();
    } catch { setImproveMsg('Could not run the improvement pass.'); }
    finally { setImproving(false); }
  }, [improving, loadBoard]);

  const decidePromotion = useCallback(async (decision: 'approve' | 'reject') => {
    if (!pendingPromotion) return;
    const reason = window.prompt(`${decision === 'approve' ? 'Why activate' : 'Why reject'} prompt ${pendingPromotion.semver}? This becomes the governance record.`) || '';
    if (!reason.trim()) return;
    try {
      const r = await fetch(`${API}/v1/agents/evals/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: JSON.stringify({ approvalId: pendingPromotion.approvalId, decision, reason }),
      });
      const d = await r.json();
      if (!r.ok || !d?.success) throw new Error(d?.error?.code || 'PROMOTION_FAILED');
      setImproveMsg(decision === 'approve'
        ? `Human-approved: ${d.data.agent} ${d.data.semver} is now active.`
        : `Human-rejected: ${d.data.agent} ${d.data.semver} was retired.`);
      setPendingPromotion(null);
    } catch {
      setImproveMsg('The promotion decision was not persisted. Nothing changed.');
    }
  }, [pendingPromotion]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white px-6 py-8 max-w-5xl mx-auto">
      <div className="mb-2 text-[11px] tracking-[0.3em] uppercase text-cyan-400">The Forge · builder agents</div>
      <h1 className="text-2xl font-bold mb-1">Forge Control</h1>
      <p className="text-gray-400 text-sm mb-8">
        The Smith writes code, runs it in a sealed sandbox, and repairs its own failures. Solutions are
        <span className="text-cyan-300"> proposals</span> — reviewed and committed by a human, never auto-merged.
      </p>

      {/* Sovereign Mind Layer — provider health + sovereignty score */}
      <section className="rounded-xl border border-gray-800 bg-[#111117] p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Sovereign Mind Layer</h2>
          {health && (
            <span className={`text-[11px] px-2 py-1 rounded ${health.capableOfLLM ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
              {health.capableOfLLM ? '● Nova can run agent jobs' : '○ No mind available — agent jobs will halt honestly'}
            </span>
          )}
        </div>
        {!health ? (
          <div className="text-sm text-gray-600">Loading provider health…</div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-3xl font-bold" style={{ color: health.sovereignty.score >= 75 ? '#34d399' : health.sovereignty.score >= 50 ? '#fbbf24' : '#f87171' }}>
                {health.sovereignty.score}%
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-400">sovereignty · {health.sovereignty.band}</div>
                <div className="text-[11px] text-gray-500 max-w-lg">{health.sovereignty.rationale}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              {health.providers.map(p => (
                <div key={p.name} className="flex items-center justify-between text-xs rounded-lg px-3 py-2 bg-black/30 border border-gray-800">
                  <span className="text-gray-300">{p.name}{p.name === 'local' && ' 🔒'}</span>
                  <span className={
                    !p.configured ? 'text-gray-600'
                      : p.available ? 'text-emerald-400'
                      : p.quotaExhaustedUntil ? 'text-amber-400' : 'text-red-400'
                  }>
                    {!p.configured ? 'not configured' : p.available ? 'ready' : p.quotaExhaustedUntil ? 'quota-dark' : (p.lastFailureReason || 'down')}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-gray-500">
              Fallback order: <span className="text-gray-400">{health.fallbackOrder.join(' → ')}</span>
              {health.lastRun.provider && <> · last run powered by <span className="text-cyan-300">{health.lastRun.provider}</span></>}
            </div>
            {health.sovereignty.score < 75 && (
              <div className="mt-3 text-[11px] text-violet-300">
                → Next move to reduce dependency: run a local model (Ollama/vLLM) and set <code className="text-violet-200">LOCAL_LLM_URL</code>. It becomes the first-choice backend and crosses you to 75% sovereign.
              </div>
            )}
            {health.failureMemory.length > 0 && (
              <div className="mt-4 border-t border-gray-800 pt-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Failure memory</div>
                {health.failureMemory.slice(0, 2).map((f, i) => (
                  <div key={i} className="text-[11px] text-gray-500 mb-1">⚠ {f.lesson}</div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* The Smith */}
      <section className="rounded-xl border border-cyan-900/40 bg-[#111117] p-5 mb-6">
        <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">Give the Smith a problem</h2>
        <textarea
          value={problem} onChange={e => setProblem(e.target.value)} rows={3}
          className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-sm text-gray-100 outline-none focus:border-cyan-600"
        />
        <button
          onClick={build} disabled={building}
          className="mt-3 px-6 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm disabled:opacity-40"
        >
          {building ? 'Building & testing…' : 'Build it'}
        </button>

        {error && <div className="mt-4 text-sm text-red-400">{error}</div>}
        {result && (
          <div className="mt-5">
            <div className={`text-sm font-semibold ${result.solved ? 'text-emerald-400' : 'text-amber-400'}`}>
              {result.solved ? `✓ Solved in ${result.iterations} iteration${result.iterations === 1 ? '' : 's'}` : `Did not converge in ${result.iterations} iterations (honest failure — no fabricated pass)`}
            </div>
            <div className="mt-2 text-xs text-gray-500">Repair trajectory:</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {result.trajectory.map(t => (
                <span key={t.iteration} className={`text-[11px] px-2 py-1 rounded ${t.passed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                  #{t.iteration} {t.passed ? 'pass' : 'fail'}
                </span>
              ))}
            </div>
            {result.finalCode && (
              <pre className="mt-3 max-h-72 overflow-auto text-[11px] bg-black/50 border border-gray-800 rounded-lg p-3 text-gray-300 whitespace-pre-wrap">{result.finalCode}</pre>
            )}
            {result.artifactId && <div className="mt-2 text-[11px] text-gray-600">Proposal recorded on the substrate · {result.artifactId}</div>}
          </div>
        )}
      </section>

      {/* Proposal Review — the approval-as-training loop (Phase 3) */}
      <section className="rounded-xl border border-amber-900/40 bg-[#111117] p-5 mb-6">
        <h2 className="text-sm font-semibold text-amber-300 uppercase tracking-wider mb-2">Proposal Review</h2>
        <p className="text-gray-400 text-xs mb-3">
          Agents propose; you decide. Every accept/reject — <span className="text-amber-300">with your reason</span> — trains the next generation. Nothing merges to production without you.
        </p>
        {proposals.length === 0 ? (
          <div className="text-sm text-gray-600">No proposals awaiting your decision.</div>
        ) : (
          <div className="space-y-2">
            {proposals.map(p => (
              <div key={p.id} className="rounded-lg bg-black/30 border border-gray-800 p-3">
                <div className="text-[11px] text-gray-500 mb-1">{p.author}</div>
                <div className="text-sm text-gray-200 mb-2">{p.claim}</div>
                <div className="flex gap-2">
                  <button onClick={() => decide(p.id, 'accept')} className="px-3 py-1 rounded text-[11px] bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/30">Accept</button>
                  <button onClick={() => decide(p.id, 'reject')} className="px-3 py-1 rounded text-[11px] bg-red-600/15 border border-red-600/40 text-red-300 hover:bg-red-600/25">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recursive improvement */}
      <section className="rounded-xl border border-violet-900/40 bg-[#111117] p-5 mb-6">
        <h2 className="text-sm font-semibold text-violet-300 uppercase tracking-wider mb-2">Recursive self-improvement</h2>
        <p className="text-gray-400 text-xs mb-3">
          Nova drafts an improved version of the Smith&apos;s prompt and scores it against a fixed benchmark suite.
          A ≥15% gain may nominate a candidate; <span className="text-violet-300">only a human promotion approval activates it</span>.
          The benchmark supplies evidence. The operator supplies authority.
        </p>
        <button
          onClick={improve} disabled={improving}
          className="px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm disabled:opacity-40"
        >
          {improving ? 'Scoring incumbent vs candidate…' : 'Run one improvement pass'}
        </button>
        {improveMsg && <div className="mt-3 text-sm text-violet-200">{improveMsg}</div>}
        {pendingPromotion && (
          <div className="mt-3 rounded-lg border border-violet-500/25 bg-violet-500/5 p-3">
            <div className="text-xs text-gray-300 mb-2">Candidate {pendingPromotion.semver} passed the benchmark and is inactive pending your decision.</div>
            <div className="flex gap-2">
              <button onClick={() => decidePromotion('approve')} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold">Approve activation</button>
              <button onClick={() => decidePromotion('reject')} className="px-3 py-1.5 rounded-md border border-gray-700 hover:border-red-500/40 text-xs text-gray-400 hover:text-red-300">Reject candidate</button>
            </div>
          </div>
        )}
      </section>

      {/* Eval leaderboard */}
      <section className="rounded-xl border border-gray-800 bg-[#111117] p-5">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Benchmark history</h2>
        {board.length === 0 ? (
          <div className="text-sm text-gray-600">No benchmark runs yet. Run an improvement pass to populate it.</div>
        ) : (
          <div className="space-y-1">
            {board.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-800/50">
                <span className="text-gray-300">{r.agent} · {r.suite}</span>
                <span className={`font-mono ${r.score >= 0.75 ? 'text-emerald-400' : r.score >= 0.5 ? 'text-amber-400' : 'text-red-400'}`}>
                  {r.passed}/{r.total} · {(r.score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
