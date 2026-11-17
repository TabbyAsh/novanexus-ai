// Read a goal and its current execution evidence in one database snapshot.
// The joined organization check also protects goals with legacy mislinked tasks.
export const goalExecutionQuery = `
  SELECT g.id AS goal_id, t.id AS task_id, t.type AS task_type,
         t.status AS task_status, t.updated_at AS task_updated_at,
         r.id AS run_id, r.status AS run_status, r.completed_at,
         SUBSTR(COALESCE(r.result_json->'result'->>'summary',
                         r.result_json->>'summary'), 1, 500) AS reported_summary
  FROM goals g
  LEFT JOIN tasks t ON t.goal_id = g.id AND t.org_id = g.org_id
  LEFT JOIN task_runs r ON r.id = (
    SELECT candidate.id FROM task_runs candidate
    WHERE candidate.task_id = t.id
    ORDER BY candidate.started_at DESC NULLS LAST, candidate.id DESC
    LIMIT 1
  )
  WHERE g.id = $1 AND g.org_id = $2
  ORDER BY t.updated_at DESC NULLS LAST, t.id DESC
  LIMIT 21
`;

export interface ExecutionRow {
  goal_id: string;
  task_id: string | null;
  task_type: string | null;
  task_status: string | null;
  task_updated_at: Date | null;
  run_id: string | null;
  run_status: string | null;
  completed_at: Date | null;
  reported_summary: string | null;
}

export function formatGoalExecution(rows: ExecutionRow[]) {
  if (rows.length === 0) return null;
  return {
    goalId: rows[0].goal_id,
    hasMore: rows.length > 20,
    tasks: rows.slice(0, 20).filter(row => row.task_id !== null).map(row => ({
      id: row.task_id,
      type: row.task_type,
      status: row.task_status,
      updatedAt: row.task_updated_at,
      latestRun: row.run_id === null ? null : {
        id: row.run_id,
        status: row.run_status,
        completedAt: row.completed_at,
        reportedSummary: row.reported_summary,
      },
    })),
  };
}
