'use client';

import { useState } from 'react';
import { api, type GoalExecution } from '@/lib/api';

export default function GoalExecutionPanel({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [execution, setExecution] = useState<GoalExecution | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await api.getGoalExecution(goalId);
      if (!result.success || !result.data) throw new Error('Read failed');
      setExecution(result.data);
    } catch {
      setError('Execution history could not be read. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-4 border-t border-gray-800 pt-3">
      <button type="button" aria-expanded={open} className="text-sm text-blue-300"
        onClick={() => {
          setOpen(!open);
          if (!open && !loading) void load();
        }}>
        {open ? 'Hide execution history' : 'Inspect execution history'}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm text-gray-300" aria-busy={loading}>
          <button type="button" disabled={loading} onClick={() => void load()}
            className="rounded border border-gray-700 px-3 py-1 disabled:opacity-50">
            {loading ? 'Reading…' : 'Refresh'}
          </button>
          {error && <p role="alert" className="text-red-300">{error}</p>}
          {execution && !error && (
            <>
              {execution.tasks.length === 0 && <p>No tasks recorded for this goal.</p>}
              {execution.hasMore && <p>Showing the 20 most recently updated tasks.</p>}
              {execution.tasks.map(task => (
                <article key={task.id} className="rounded-lg bg-gray-950 p-3">
                  <p className="font-medium text-white">{task.type} · {task.status}</p>
                  <p className="text-xs text-gray-400">Task updated {new Date(task.updatedAt).toLocaleString()}</p>
                  {task.latestRun ? (
                    <>
                      <p className="mt-2">Latest worker run · {task.latestRun.status}
                        {task.latestRun.completedAt && ' · ' + new Date(task.latestRun.completedAt).toLocaleString()}</p>
                      {task.latestRun.reportedSummary && <p className="mt-1 whitespace-pre-wrap break-words">{task.latestRun.reportedSummary}</p>}
                      <p className="mt-1 break-all text-xs text-gray-400">Run receipt {task.latestRun.id}</p>
                    </>
                  ) : <p className="mt-2 text-gray-400">No worker run recorded.</p>}
                </article>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
