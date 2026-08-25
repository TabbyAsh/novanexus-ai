import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ACK_TASK_CLAIM_SQL,
  CLAIM_TASKS_SQL,
  COMPLETE_TASK_CLAIM_SQL,
  INSERT_TASK_RUN_SQL,
  RENEW_TASK_LEASE_SQL,
  SELECT_TASK_FOR_COMPLETION_SQL,
  TASK_CLAIM_ACK_TIMEOUT_MS,
  TASK_CLAIM_LIMIT,
  TASK_LEASE_MS,
  UPDATE_TASK_PROGRESS_SQL,
  acknowledgeTaskClaim,
  claimTasks,
  completeTaskClaim,
  renewTaskLease,
  type TaskClaimIdentity,
  type TaskClaimQuery,
} from '../task-claim';

const identity: TaskClaimIdentity = {
  taskId: 'task-1',
  botId: 'bot-a',
  claimToken: '11111111-1111-4111-8111-111111111111',
  claimGeneration: 3,
};

describe('fenced task claiming', () => {
  test('atomically issues a short unacknowledged token and generation', () => {
    const sql = CLAIM_TASKS_SQL.replace(/\s+/g, ' ').trim();

    expect(sql).toContain('WITH claimable AS');
    expect(sql).toContain("t.status = 'QUEUED'");
    expect(sql).toContain('claim_available_at');
    expect(sql).toContain("t.status = 'RUNNING' AND t.lease_expires_at <= NOW()");
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("SET status = 'RUNNING'");
    expect(sql).toContain('claim_generation = t.claim_generation + 1');
    expect(sql).toContain('claim_token = uuid_generate_v4()');
    expect(sql).toContain('claim_acknowledged_at = NULL');
    expect(sql).toContain("lease_expires_at = NOW() + ($4::double precision * INTERVAL '1 millisecond')");
    expect(sql).not.toContain(';');
  });

  test('binds one instance, one row, and the acknowledgement timeout', async () => {
    const runQuery = jest.fn(async () => ({ rows: [{ id: 'task-1' }] }));

    await expect(claimTasks(runQuery, {
      botId: 'bot-a',
      botType: 'socialbot',
    })).resolves.toEqual([{ id: 'task-1' }]);

    expect(runQuery).toHaveBeenCalledWith(CLAIM_TASKS_SQL, [
      'bot-a',
      'socialbot',
      TASK_CLAIM_LIMIT,
      TASK_CLAIM_ACK_TIMEOUT_MS,
    ]);
    expect(TASK_CLAIM_LIMIT).toBe(1);
    expect(TASK_CLAIM_ACK_TIMEOUT_MS).toBeLessThan(TASK_LEASE_MS);
  });

  test('two simultaneous clients can receive a queued row only once', async () => {
    let arrivals = 0;
    let releaseBoth!: () => void;
    const bothArrived = new Promise<void>(resolve => { releaseBoth = resolve; });
    let rowLocked = false;
    let status: 'QUEUED' | 'RUNNING' = 'QUEUED';

    const runQuery: TaskClaimQuery = async (sql, params = []) => {
      expect(sql).toBe(CLAIM_TASKS_SQL);
      arrivals += 1;
      if (arrivals === 2) releaseBoth();
      await bothArrived;

      if (rowLocked || status !== 'QUEUED') return { rows: [] };
      rowLocked = true;
      try {
        await new Promise<void>(resolve => setImmediate(resolve));
        status = 'RUNNING';
        return {
          rows: [{
            id: 'task-1',
            status,
            claimed_by_bot_id: params[0],
            claim_token: identity.claimToken,
            claim_generation: 1,
          }],
        };
      } finally {
        rowLocked = false;
      }
    };

    const [claimedByA, claimedByB] = await Promise.all([
      claimTasks(runQuery, { botId: 'bot-a', botType: 'socialbot' }),
      claimTasks(runQuery, { botId: 'bot-b', botType: 'socialbot' }),
    ]);
    expect([...claimedByA, ...claimedByB]).toHaveLength(1);
  });

  test('acknowledges and renews only one exact unexpired claim', async () => {
    const runQuery = jest.fn(async () => ({ rows: [{ id: identity.taskId }] }));

    await expect(acknowledgeTaskClaim(runQuery, identity)).resolves.toEqual({ id: identity.taskId });
    expect(runQuery).toHaveBeenLastCalledWith(ACK_TASK_CLAIM_SQL, [
      identity.taskId,
      identity.botId,
      identity.claimToken,
      identity.claimGeneration,
      TASK_LEASE_MS,
    ]);

    await expect(renewTaskLease(runQuery, identity)).resolves.toEqual({ id: identity.taskId });
    expect(runQuery).toHaveBeenLastCalledWith(RENEW_TASK_LEASE_SQL, [
      identity.taskId,
      identity.botId,
      identity.claimToken,
      identity.claimGeneration,
      TASK_LEASE_MS,
    ]);

    const renewSql = RENEW_TASK_LEASE_SQL.replace(/\s+/g, ' ').trim();
    expect(renewSql).toContain('WHERE id = $1');
    expect(renewSql).toContain('AND claimed_by_bot_id = $2');
    expect(renewSql).toContain('AND claim_token = $3::uuid');
    expect(renewSql).toContain('AND claim_generation = $4');
    expect(renewSql).toContain('AND claim_acknowledged_at IS NOT NULL');
    expect(renewSql).toContain('AND lease_expires_at > NOW()');
    expect(renewSql).toContain('RETURNING id, lease_expires_at');
    expect(renewSql).not.toContain('RETURNING *');
  });

  test('fences progress and maps completion transactionally and idempotently', async () => {
    const client = jest.fn(async (sql: string, _params?: any[]) => {
      if (sql === SELECT_TASK_FOR_COMPLETION_SQL) {
        return { rows: [{
          id: identity.taskId,
          status: 'RUNNING',
          claimed_by_bot_id: identity.botId,
          claim_token: identity.claimToken,
          claim_generation: identity.claimGeneration,
          started_at: '2026-08-25T12:00:00.000Z',
        }] };
      }
      if (sql === COMPLETE_TASK_CLAIM_SQL) return { rows: [{ id: identity.taskId, status: 'DONE' }] };
      if (sql === INSERT_TASK_RUN_SQL) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(completeTaskClaim(
      operation => operation(client),
      { ...identity, status: 'DONE', outputJson: '{"ok":true}' },
    )).resolves.toEqual({ outcome: 'completed', status: 'DONE' });

    expect(client).toHaveBeenCalledTimes(3);
    expect(client.mock.calls[2][1]).toEqual([
      identity.taskId,
      identity.botId,
      '2026-08-25T12:00:00.000Z',
      'COMPLETED',
      '{"ok":true}',
      identity.claimGeneration,
    ]);
    for (const sql of [UPDATE_TASK_PROGRESS_SQL, COMPLETE_TASK_CLAIM_SQL]) {
      const normalized = sql.replace(/\s+/g, ' ');
      expect(normalized).toContain('claimed_by_bot_id = $2');
      expect(normalized).toContain('claim_token = $3::uuid');
      expect(normalized).toContain('claim_generation = $4');
      expect(normalized).toContain("status = 'RUNNING'");
      expect(normalized).toContain('lease_expires_at > NOW()');
    }
    expect(INSERT_TASK_RUN_SQL).toContain('ON CONFLICT (task_id, claim_generation) DO NOTHING');
  });

  test('migration and rollback cover invariants, legacy grace, and worker shutdown', () => {
    const root = join(__dirname, '..', '..', '..', '..');
    const migrationFile = '034_task_claim_leases_maintenance.sql';
    const migration = readFileSync(join(root, 'infra', 'migrations', migrationFile), 'utf8');
    const rollback = readFileSync(join(root, 'infra', 'runbooks', 'rollback-task-claim-leases.sql'), 'utf8');
    const dockerfile = readFileSync(join(root, 'Dockerfile.prod'), 'utf8');
    const ciWorkflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    const migrationRunner = require(join(root, 'scripts', 'run-migrations.js')) as {
      MAINTENANCE_ACK: string;
      assertMaintenanceAuthorized: (file: string, sql: string, env: Record<string, string>) => void;
    };

    expect(migration).toContain('-- nova:maintenance-required');
    expect(migration).toContain("current_setting('nova.maintenance_mode', true) IS DISTINCT FROM 'on'");
    expect(migration).toContain('LOCK TABLE bots IN SHARE ROW EXCLUSIVE MODE');
    expect(migration).toContain("WHERE last_heartbeat > NOW() - INTERVAL '2 minutes'");
    expect(migration).not.toContain("status IN ('ONLINE', 'BUSY')");
    expect(migration).toContain('claim_generation BIGINT NOT NULL DEFAULT 0');
    expect(migration).toContain('claim_token UUID');
    expect(migration).toContain('claim_acknowledged_at TIMESTAMPTZ');
    expect(migration).toContain("SET status = 'QUEUED'");
    expect(migration).toContain("claim_available_at = NOW() + INTERVAL '90 seconds'");
    expect(migration).toContain('tasks_running_claim_required');
    expect(migration).toContain('idx_task_runs_claim_generation');
    expect(rollback).toContain('LOCK TABLE bots IN SHARE ROW EXCLUSIVE MODE');
    expect(rollback).toContain('Task-claim rollback refused: recent bot heartbeat still exists');
    expect(rollback).not.toContain("status IN ('ONLINE', 'BUSY')");
    expect(rollback).toContain("WHERE status = 'RUNNING'");
    expect(rollback).toContain("SET status = 'QUEUED'");
    expect(rollback).toContain('claim_token = NULL');
    expect(rollback).toContain('DROP CONSTRAINT IF EXISTS tasks_running_claim_required');
    expect(dockerfile).toContain('NOVA_ROLLING_STARTUP=1 node /app/scripts/run-migrations.js');
    expect(ciWorkflow).toContain("grep -qF -- '-- nova:maintenance-required'");
    expect(ciWorkflow).toContain("SELECT set_config('nova.maintenance_mode', 'on', false)");
    expect(ciWorkflow).toContain("-f \"$f\"");
    expect(ciWorkflow).not.toContain('NOVA_ROLLING_STARTUP=0');
    expect(() => migrationRunner.assertMaintenanceAuthorized(migrationFile, migration, {
      NOVA_ROLLING_STARTUP: '1',
      NOVA_MAINTENANCE_MIGRATION: migrationFile,
      NOVA_MAINTENANCE_ACK: migrationRunner.MAINTENANCE_ACK,
    })).toThrow('cannot run during rolling startup');
    expect(() => migrationRunner.assertMaintenanceAuthorized(migrationFile, migration, {
      NOVA_MAINTENANCE_MIGRATION: migrationFile,
      NOVA_MAINTENANCE_ACK: migrationRunner.MAINTENANCE_ACK,
    })).not.toThrow();
  });
});
