"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordTaskCompletion = recordTaskCompletion;
/** Call inside a transaction so the task state and its run receipt commit together. */
async function recordTaskCompletion(client, taskId, status, outputJson, botId) {
    // A second worker or a retry must inspect the committed result of the first report.
    const result = await client.query(`SELECT status, output_json = $2::jsonb AS same_output
       FROM tasks WHERE id = $1 FOR UPDATE`, [taskId, outputJson]);
    const task = result.rows[0];
    if (!task)
        return 'missing';
    const runStatus = status === 'DONE' ? 'COMPLETED' : 'FAILED';
    if (task.status === 'DONE' || task.status === 'FAILED') {
        if (task.status !== status || !task.same_output)
            return 'conflict';
        if (!botId)
            return 'replayed';
        // A pre-transaction completion may have updated only the task. A matching
        // payload cannot establish which worker ran it or when that run occurred.
        const receipt = await client.query(`SELECT 1 FROM task_runs r JOIN tasks t ON t.id = r.task_id
       WHERE r.task_id = $1 AND r.bot_id = $2 AND r.status = $3
         AND r.result_json = $4::jsonb AND r.completed_at >= t.updated_at
       LIMIT 1`, [taskId, botId, runStatus, outputJson]);
        return receipt.rows.length ? 'replayed' : 'unverified';
    }
    await client.query('UPDATE tasks SET status = $1, output_json = $2, updated_at = NOW() WHERE id = $3', [status, outputJson, taskId]);
    if (botId) {
        // The execution start is unknown. Task creation may precede execution by hours.
        await client.query(`INSERT INTO task_runs (task_id, bot_id, started_at, completed_at, status, result_json)
       VALUES ($1, $2, NULL, NOW(), $3, $4)`, [taskId, botId, runStatus, outputJson]);
    }
    return 'recorded';
}
