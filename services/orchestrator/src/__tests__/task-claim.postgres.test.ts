import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import {
  acknowledgeTaskClaim,
  claimTasks,
  completeTaskClaim,
  type TaskClaimIdentity,
  type TaskClaimQuery,
  type TaskClaimTransaction,
} from '../task-claim';

const databaseUrl = process.env.DATABASE_URL;
const runPostgres = Boolean(databaseUrl)
  && (process.env.CI === 'true' || process.env.POSTGRES_INTEGRATION === '1');
const describePostgres = runPostgres ? describe : describe.skip;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describePostgres('task claims against PostgreSQL', () => {
  jest.setTimeout(30_000);

  let clientA: Client;
  let clientB: Client;
  let schema: string;
  let botA: string;
  let botB: string;
  let migration: string;
  const root = join(__dirname, '..', '..', '..', '..');

  const asQuery = (client: Client): TaskClaimQuery =>
    (text, params) => client.query(text, params);

  const asTransaction = (client: Client): TaskClaimTransaction => async (operation) => {
    await client.query('BEGIN');
    try {
      const result = await operation(asQuery(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  };

  beforeAll(async () => {
    schema = `task_claim_${process.pid}_${Date.now()}`;
    clientA = new Client({ connectionString: databaseUrl });
    clientB = new Client({ connectionString: databaseUrl });
    await Promise.all([clientA.connect(), clientB.connect()]);
    await clientA.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await clientA.query(`CREATE SCHEMA "${schema}"`);
    await Promise.all([
      clientA.query(`SET search_path TO "${schema}", public`),
      clientB.query(`SET search_path TO "${schema}", public`),
    ]);

    await clientA.query(`
      CREATE TABLE bots (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
        last_heartbeat TIMESTAMPTZ
      );
      CREATE TABLE tasks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        assigned_to_bot VARCHAR(20) NOT NULL,
        type VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
        input_json JSONB,
        output_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE task_runs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        status VARCHAR(20) CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
        result_json JSONB
      );
    `);

    await clientA.query(`
      INSERT INTO tasks (assigned_to_bot, type, status)
      VALUES
        ('socialbot', 'LEGACY', 'RUNNING'),
        ('socialbot', 'SELECTED_QUEUED', 'QUEUED')
    `);
    migration = readFileSync(
      join(root, 'infra', 'migrations', '034_task_claim_leases_maintenance.sql'),
      'utf8',
    );
  });

  afterAll(async () => {
    if (clientA) {
      await clientA.query('RESET search_path');
      await clientA.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await Promise.all([clientA?.end(), clientB?.end()]);
  });

  test('maintenance migration rejects every recent worker and preserves selected queued work', async () => {
    await clientA.query(`
      INSERT INTO bots (status, last_heartbeat)
      VALUES ('ERROR', NOW())
    `);
    await clientA.query("SELECT set_config('nova.maintenance_mode', 'on', false)");

    await expect(clientA.query(migration)).rejects.toThrow(
      'Task-claim migration refused: bot workers heartbeated within 2 minutes',
    );
    await clientA.query('ROLLBACK');

    const selected = await clientA.query(
      "SELECT status FROM tasks WHERE type = 'SELECTED_QUEUED'",
    );
    expect(selected.rows[0].status).toBe('QUEUED');
    const schemaChange = await clientA.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'tasks'
          AND column_name = 'claim_token'
      ) AS applied
    `, [schema]);
    expect(schemaChange.rows[0].applied).toBe(false);

    await clientA.query("UPDATE bots SET last_heartbeat = NOW() - INTERVAL '3 minutes'");
    await clientA.query(migration);
    await clientA.query("DELETE FROM tasks WHERE type = 'SELECTED_QUEUED'");

    const bots = await clientA.query(`
      INSERT INTO bots (status)
      VALUES ('OFFLINE'), ('OFFLINE')
      RETURNING id
    `);
    [botA, botB] = bots.rows.map(row => row.id);
  });

  test('a lost claim response is not renewed and can be reclaimed once', async () => {
    const inserted = await clientA.query(`
      INSERT INTO tasks (assigned_to_bot, type, status)
      VALUES ('socialbot', 'LOST_RESPONSE', 'QUEUED')
      RETURNING id
    `);

    const [first] = await claimTasks<any>(asQuery(clientA), {
      botId: botA,
      botType: 'socialbot',
      ackTimeoutMs: 60,
    });
    expect(first.id).toBe(inserted.rows[0].id);
    expect(first.claim_acknowledged_at).toBeNull();

    await wait(100);
    const [second] = await claimTasks<any>(asQuery(clientB), {
      botId: botB,
      botType: 'socialbot',
      ackTimeoutMs: 500,
    });
    expect(second.id).toBe(first.id);
    expect(Number(second.claim_generation)).toBe(Number(first.claim_generation) + 1);
    expect(second.claim_token).not.toBe(first.claim_token);

    const secondIdentity: TaskClaimIdentity = {
      taskId: second.id,
      botId: botB,
      claimToken: second.claim_token,
      claimGeneration: Number(second.claim_generation),
    };
    await acknowledgeTaskClaim(asQuery(clientB), secondIdentity, 5_000);
    await completeTaskClaim(asTransaction(clientB), {
      ...secondIdentity,
      status: 'FAILED',
      outputJson: '{"reason":"lost response test cleanup"}',
    });
  });

  test('a stale worker cannot overwrite the new owner and completion is idempotent', async () => {
    const inserted = await clientA.query(`
      INSERT INTO tasks (assigned_to_bot, type, status)
      VALUES ('socialbot', 'STALE_COMPLETION', 'QUEUED')
      RETURNING id
    `);
    const [first] = await claimTasks<any>(asQuery(clientA), {
      botId: botA,
      botType: 'socialbot',
      ackTimeoutMs: 50,
    });
    await wait(90);
    const [second] = await claimTasks<any>(asQuery(clientB), {
      botId: botB,
      botType: 'socialbot',
    });

    const firstIdentity: TaskClaimIdentity = {
      taskId: inserted.rows[0].id,
      botId: botA,
      claimToken: first.claim_token,
      claimGeneration: Number(first.claim_generation),
    };
    const secondIdentity: TaskClaimIdentity = {
      taskId: inserted.rows[0].id,
      botId: botB,
      claimToken: second.claim_token,
      claimGeneration: Number(second.claim_generation),
    };
    await expect(acknowledgeTaskClaim(asQuery(clientB), secondIdentity, 5_000)).resolves.toBeTruthy();

    await expect(completeTaskClaim(asTransaction(clientA), {
      ...firstIdentity,
      status: 'DONE',
      outputJson: '{"worker":"stale"}',
    })).resolves.toEqual({ outcome: 'stale' });

    const preserved = await clientA.query(
      'SELECT status, claimed_by_bot_id, claim_generation FROM tasks WHERE id = $1',
      [inserted.rows[0].id],
    );
    expect(preserved.rows[0]).toMatchObject({ status: 'RUNNING', claimed_by_bot_id: botB });
    expect(Number(preserved.rows[0].claim_generation)).toBe(secondIdentity.claimGeneration);

    await expect(completeTaskClaim(asTransaction(clientB), {
      ...secondIdentity,
      status: 'DONE',
      outputJson: '{"worker":"current"}',
    })).resolves.toEqual({ outcome: 'completed', status: 'DONE' });
    await expect(completeTaskClaim(asTransaction(clientB), {
      ...secondIdentity,
      status: 'DONE',
      outputJson: '{"worker":"current"}',
    })).resolves.toEqual({ outcome: 'idempotent', status: 'DONE' });

    const runs = await clientA.query(
      'SELECT status, started_at, claim_generation FROM task_runs WHERE task_id = $1',
      [inserted.rows[0].id],
    );
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0].status).toBe('COMPLETED');
    expect(runs.rows[0].started_at).toBeTruthy();
    expect(Number(runs.rows[0].claim_generation)).toBe(secondIdentity.claimGeneration);
  });

  test('task update and task_run insertion roll back together', async () => {
    const inserted = await clientA.query(`
      INSERT INTO tasks (assigned_to_bot, type, status)
      VALUES ('socialbot', 'TRANSACTION', 'QUEUED')
      RETURNING id
    `);
    const [claim] = await claimTasks<any>(asQuery(clientA), { botId: botA, botType: 'socialbot' });
    const claimIdentity: TaskClaimIdentity = {
      taskId: inserted.rows[0].id,
      botId: botA,
      claimToken: claim.claim_token,
      claimGeneration: Number(claim.claim_generation),
    };
    await acknowledgeTaskClaim(asQuery(clientA), claimIdentity, 5_000);

    await clientA.query(`
      CREATE FUNCTION reject_task_run() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced task_run failure';
      END
      $$;
      CREATE TRIGGER reject_task_run_insert
      BEFORE INSERT ON task_runs
      FOR EACH ROW EXECUTE FUNCTION reject_task_run();
    `);

    await expect(completeTaskClaim(asTransaction(clientA), {
      ...claimIdentity,
      status: 'DONE',
      outputJson: '{}',
    })).rejects.toThrow('forced task_run failure');
    const task = await clientA.query('SELECT status, lease_expires_at FROM tasks WHERE id = $1', [claimIdentity.taskId]);
    expect(task.rows[0].status).toBe('RUNNING');
    expect(task.rows[0].lease_expires_at).toBeTruthy();
    await clientA.query('DROP TRIGGER reject_task_run_insert ON task_runs');
  });

  test('legacy grace and rollback reject ERROR, BUSY, and racing heartbeats before requeue', async () => {
    const legacy = await clientA.query(`
      SELECT status, claim_available_at, lease_expires_at
      FROM tasks
      WHERE type = 'LEGACY'
    `);
    expect(legacy.rows[0].status).toBe('QUEUED');
    expect(legacy.rows[0].claim_available_at).toBeTruthy();
    expect(legacy.rows[0].lease_expires_at).toBeNull();

    const beforeGrace = await claimTasks(asQuery(clientA), { botId: botA, botType: 'socialbot' });
    expect(beforeGrace.find((row: any) => row.type === 'LEGACY')).toBeUndefined();
    await clientA.query("UPDATE tasks SET claim_available_at = NOW() - INTERVAL '1 second' WHERE type = 'LEGACY'");
    const [recovered] = await claimTasks<any>(asQuery(clientA), { botId: botA, botType: 'socialbot' });
    expect(recovered.type).toBe('LEGACY');

    const rollback = readFileSync(
      join(root, 'infra', 'runbooks', 'rollback-task-claim-leases.sql'),
      'utf8',
    );

    for (const status of ['ERROR', 'BUSY']) {
      await clientA.query(
        'UPDATE bots SET status = $1, last_heartbeat = NOW() WHERE id = $2',
        [status, botA],
      );
      await expect(clientA.query(rollback)).rejects.toThrow(
        'Task-claim rollback refused: recent bot heartbeat still exists',
      );
      await clientA.query('ROLLBACK');
    }

    // A heartbeat already in flight holds a conflicting table lock. Rollback
    // waits for it, then observes the freshly committed heartbeat and refuses.
    await clientA.query("UPDATE bots SET last_heartbeat = NOW() - INTERVAL '3 minutes'");
    await clientB.query('BEGIN');
    await clientB.query(
      "UPDATE bots SET status = 'OFFLINE', last_heartbeat = NOW() WHERE id = $1",
      [botB],
    );
    let rollbackSettled = false;
    const racedRollback = clientA.query(rollback);
    void racedRollback.then(
      () => { rollbackSettled = true; },
      () => { rollbackSettled = true; },
    );
    await wait(50);
    expect(rollbackSettled).toBe(false);
    await clientB.query('COMMIT');
    await expect(racedRollback).rejects.toThrow(
      'Task-claim rollback refused: recent bot heartbeat still exists',
    );
    await clientA.query('ROLLBACK');

    await clientA.query("UPDATE bots SET last_heartbeat = NOW() - INTERVAL '3 minutes'");
    await clientA.query(rollback);
    const afterRollback = await clientA.query(`
      SELECT status, claimed_by_bot_id, claim_token, lease_expires_at
      FROM tasks
      WHERE id = $1
    `, [recovered.id]);
    expect(afterRollback.rows[0]).toEqual({
      status: 'QUEUED',
      claimed_by_bot_id: null,
      claim_token: null,
      lease_expires_at: null,
    });
  });
});
