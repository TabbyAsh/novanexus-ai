import type { PoolClient } from 'pg';

type FinalTaskStatus = 'DONE' | 'FAILED';

/** Call inside a transaction so the task state and its run receipt commit together. */
export async function recordTaskCompletion(
  client: PoolClient,
  taskId: string,
  status: FinalTaskStatus,
  outputJson: string,
  botId: string | undefined
): Promise<'recorded' | 'replayed' | 'conflict' | 'missing'> {
  // A second worker or a retry must inspect the committed result of the first report.
  const result = await client.query<{ status: string; same_output: boolean | null }>(
    `SELECT status, output_json = $2::jsonb AS same_output
       FROM tasks WHERE id = $1 FOR UPDATE`,
    [taskId, outputJson]
  );
  const task = result.rows[0];
  if (!task) return 'missing';
  if (task.status === 'DONE' || task.status === 'FAILED') {
    return task.status === status && task.same_output ? 'replayed' : 'conflict';
  }

  await client.query(
    'UPDATE tasks SET status = $1, output_json = $2, updated_at = NOW() WHERE id = $3',
    [status, outputJson, taskId]
  );
  if (botId) {
    // The execution start is unknown. Task creation may precede execution by hours.
    await client.query(
      `INSERT INTO task_runs (task_id, bot_id, started_at, completed_at, status, result_json)
       VALUES ($1, $2, NULL, NOW(), $3, $4)`,
      [taskId, botId, status === 'DONE' ? 'COMPLETED' : 'FAILED', outputJson]
    );
  }
  return 'recorded';
}
