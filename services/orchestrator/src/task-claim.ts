export const TASK_CLAIM_LIMIT = 1;
export const TASK_CLAIM_ACK_TIMEOUT_MS = 15_000;
export const TASK_LEASE_MS = 90_000;

export interface TaskClaimQueryResult<T = any> {
  rows: T[];
  rowCount?: number | null;
}

export type TaskClaimQuery = (
  text: string,
  params?: any[],
) => Promise<TaskClaimQueryResult>;

export interface TaskClaimIdentity {
  taskId: string;
  botId: string;
  claimToken: string;
  claimGeneration: number;
}

export interface TaskClaimOptions {
  botId: string;
  botType: string;
  limit?: number;
  ackTimeoutMs?: number;
}

export interface CompleteTaskClaimInput extends TaskClaimIdentity {
  status: 'DONE' | 'FAILED';
  outputJson: string;
}

export type CompleteTaskClaimResult =
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'completed' | 'idempotent'; status: 'DONE' | 'FAILED' };

export type TaskClaimTransaction = <T>(
  operation: (client: TaskClaimQuery) => Promise<T>,
) => Promise<T>;

/**
 * Claiming and selecting happen in one statement. A new token and monotonically
 * increasing generation fence every delivery. The initial lease is deliberately
 * short and heartbeats cannot renew it until the worker explicitly acknowledges.
 */
export const CLAIM_TASKS_SQL = `
WITH claimable AS (
  SELECT t.id
  FROM tasks AS t
  WHERE (
    (
      t.status = 'QUEUED'
      AND COALESCE(t.claim_available_at, '-infinity'::timestamptz) <= NOW()
    )
    OR (t.status = 'RUNNING' AND t.lease_expires_at <= NOW())
  )
    AND (t.assigned_to_bot IS NULL OR t.assigned_to_bot = $2)
  ORDER BY t.created_at ASC, t.id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT $3
)
UPDATE tasks AS t
SET status = 'RUNNING',
    claimed_by_bot_id = $1,
    claim_generation = t.claim_generation + 1,
    claim_token = uuid_generate_v4(),
    claim_acknowledged_at = NULL,
    lease_expires_at = NOW() + ($4::double precision * INTERVAL '1 millisecond'),
    claim_available_at = NULL,
    started_at = NOW(),
    completed_at = NULL,
    updated_at = NOW()
FROM claimable
WHERE t.id = claimable.id
RETURNING t.*
`;

export const ACK_TASK_CLAIM_SQL = `
UPDATE tasks
SET claim_acknowledged_at = COALESCE(claim_acknowledged_at, NOW()),
    lease_expires_at = NOW() + ($5::double precision * INTERVAL '1 millisecond'),
    updated_at = NOW()
WHERE id = $1
  AND claimed_by_bot_id = $2
  AND claim_token = $3::uuid
  AND claim_generation = $4
  AND status = 'RUNNING'
  AND lease_expires_at > NOW()
RETURNING *
`;

export const RENEW_TASK_LEASE_SQL = `
UPDATE tasks
SET lease_expires_at = NOW() + ($5::double precision * INTERVAL '1 millisecond'),
    updated_at = NOW()
WHERE id = $1
  AND claimed_by_bot_id = $2
  AND claim_token = $3::uuid
  AND claim_generation = $4
  AND status = 'RUNNING'
  AND claim_acknowledged_at IS NOT NULL
  AND lease_expires_at > NOW()
RETURNING id, lease_expires_at
`;

export const UPDATE_TASK_PROGRESS_SQL = `
UPDATE tasks
SET output_json = jsonb_set(
      COALESCE(output_json::jsonb, '{}'::jsonb),
      '{progress}',
      $5::jsonb
    ),
    updated_at = NOW()
WHERE id = $1
  AND claimed_by_bot_id = $2
  AND claim_token = $3::uuid
  AND claim_generation = $4
  AND status = 'RUNNING'
  AND claim_acknowledged_at IS NOT NULL
  AND lease_expires_at > NOW()
RETURNING id
`;

export const SELECT_TASK_FOR_COMPLETION_SQL = `
SELECT id, status, claimed_by_bot_id, claim_token, claim_generation, started_at
FROM tasks
WHERE id = $1
FOR UPDATE
`;

export const COMPLETE_TASK_CLAIM_SQL = `
UPDATE tasks
SET status = $5,
    output_json = $6,
    completed_at = NOW(),
    lease_expires_at = NULL,
    updated_at = NOW()
WHERE id = $1
  AND claimed_by_bot_id = $2
  AND claim_token = $3::uuid
  AND claim_generation = $4
  AND status = 'RUNNING'
  AND claim_acknowledged_at IS NOT NULL
  AND lease_expires_at > NOW()
RETURNING id, status
`;

export const INSERT_TASK_RUN_SQL = `
INSERT INTO task_runs (
  task_id,
  bot_id,
  started_at,
  completed_at,
  status,
  result_json,
  claim_generation
)
VALUES ($1, $2, $3, NOW(), $4, $5, $6)
ON CONFLICT (task_id, claim_generation) DO NOTHING
`;

export async function claimTasks<T = any>(
  runQuery: TaskClaimQuery,
  options: TaskClaimOptions,
): Promise<T[]> {
  const result = await runQuery(CLAIM_TASKS_SQL, [
    options.botId,
    options.botType,
    options.limit ?? TASK_CLAIM_LIMIT,
    options.ackTimeoutMs ?? TASK_CLAIM_ACK_TIMEOUT_MS,
  ]);
  return result.rows as T[];
}

export async function acknowledgeTaskClaim<T = any>(
  runQuery: TaskClaimQuery,
  identity: TaskClaimIdentity,
  leaseMs: number = TASK_LEASE_MS,
): Promise<T | null> {
  const result = await runQuery(ACK_TASK_CLAIM_SQL, [
    identity.taskId,
    identity.botId,
    identity.claimToken,
    identity.claimGeneration,
    leaseMs,
  ]);
  return (result.rows[0] as T | undefined) ?? null;
}

export async function renewTaskLease<T = any>(
  runQuery: TaskClaimQuery,
  identity: TaskClaimIdentity,
  leaseMs: number = TASK_LEASE_MS,
): Promise<T | null> {
  const result = await runQuery(RENEW_TASK_LEASE_SQL, [
    identity.taskId,
    identity.botId,
    identity.claimToken,
    identity.claimGeneration,
    leaseMs,
  ]);
  return (result.rows[0] as T | undefined) ?? null;
}

export async function updateTaskProgress(
  runQuery: TaskClaimQuery,
  identity: TaskClaimIdentity,
  progressJson: string,
): Promise<boolean> {
  const result = await runQuery(UPDATE_TASK_PROGRESS_SQL, [
    identity.taskId,
    identity.botId,
    identity.claimToken,
    identity.claimGeneration,
    progressJson,
  ]);
  return result.rows.length === 1;
}

function claimMatches(row: any, identity: TaskClaimIdentity): boolean {
  return row.claimed_by_bot_id === identity.botId
    && row.claim_token === identity.claimToken
    && Number(row.claim_generation) === identity.claimGeneration;
}

export async function completeTaskClaim(
  runTransaction: TaskClaimTransaction,
  input: CompleteTaskClaimInput,
): Promise<CompleteTaskClaimResult> {
  return runTransaction(async (client) => {
    const currentResult = await client(SELECT_TASK_FOR_COMPLETION_SQL, [input.taskId]);
    const current = currentResult.rows[0];
    if (!current) return { outcome: 'not_found' };
    if (!claimMatches(current, input)) return { outcome: 'stale' };

    if (current.status === input.status) {
      return { outcome: 'idempotent', status: input.status };
    }
    if (current.status !== 'RUNNING') return { outcome: 'stale' };

    const completed = await client(COMPLETE_TASK_CLAIM_SQL, [
      input.taskId,
      input.botId,
      input.claimToken,
      input.claimGeneration,
      input.status,
      input.outputJson,
    ]);
    if (completed.rows.length !== 1) return { outcome: 'stale' };

    const runStatus = input.status === 'DONE' ? 'COMPLETED' : 'FAILED';
    await client(INSERT_TASK_RUN_SQL, [
      input.taskId,
      input.botId,
      current.started_at,
      runStatus,
      input.outputJson,
      input.claimGeneration,
    ]);

    return { outcome: 'completed', status: input.status };
  });
}
