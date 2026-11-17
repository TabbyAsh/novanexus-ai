const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { recordTaskCompletion } = require('../src/task-completion');

const connectionString = process.env.NOVA_TEST_DATABASE_URL ||
  (process.env.CI === 'true' ? process.env.DATABASE_URL : undefined);

test('bot completions preserve a single durable task result', {
  skip: connectionString ? false : 'Set NOVA_TEST_DATABASE_URL to a migrated test database',
}, async () => {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    // TEMP tables shadow the migrated tables for this connection only.
    await client.query('CREATE TEMP TABLE tasks (LIKE public.tasks INCLUDING DEFAULTS INCLUDING CONSTRAINTS)');
    await client.query('CREATE TEMP TABLE task_runs (LIKE public.task_runs INCLUDING DEFAULTS INCLUDING CONSTRAINTS)');
    await client.query('CREATE TEMP TABLE registered_bots (id uuid PRIMARY KEY)');
    await client.query('ALTER TABLE task_runs ADD FOREIGN KEY (bot_id) REFERENCES registered_bots(id)');

    const botId = randomUUID();
    await client.query('INSERT INTO registered_bots VALUES ($1)', [botId]);
    async function createTask() {
      const id = randomUUID();
      await client.query(
        "INSERT INTO tasks (id, type, assigned_to_bot, status) VALUES ($1, 'test', 'opsbot', 'RUNNING')", [id]
      );
      return id;
    }
    async function report(id, status, result, reporter = botId) {
      await client.query('BEGIN');
      try {
        const disposition = await recordTaskCompletion(client, id, status, JSON.stringify(result), reporter);
        await client.query('COMMIT');
        return disposition;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    const id = await createTask();
    assert.equal(await report(id, 'DONE', { a: 1, b: 2 }), 'recorded');
    assert.equal(await report(id, 'DONE', { b: 2, a: 1 }), 'replayed');
    assert.equal(await report(id, 'DONE', { a: 9 }), 'conflict');
    assert.equal(await report(id, 'FAILED', { error: 'late report' }), 'conflict');
    const runs = await client.query('SELECT status, result_json, started_at FROM task_runs WHERE task_id = $1', [id]);
    assert.deepEqual(runs.rows, [{ status: 'COMPLETED', result_json: { a: 1, b: 2 }, started_at: null }]);

    const otherBot = randomUUID();
    await client.query('INSERT INTO registered_bots VALUES ($1)', [otherBot]);
    assert.equal(await report(id, 'DONE', { a: 1, b: 2 }, otherBot), 'unverified');

    // Reproduce a terminal task left behind by older non-atomic writes.
    const legacyId = await createTask();
    await client.query("UPDATE tasks SET status = 'DONE', output_json = $2, updated_at = NOW() WHERE id = $1",
      [legacyId, JSON.stringify({ ok: true })]);
    assert.equal(await report(legacyId, 'DONE', { ok: true }), 'unverified');
    assert.equal(await report(legacyId, 'DONE', { ok: true }, null), 'replayed');
    const legacyRuns = await client.query('SELECT id FROM task_runs WHERE task_id = $1', [legacyId]);
    assert.equal(legacyRuns.rowCount, 0);
    const legacyTask = await client.query('SELECT status, output_json FROM tasks WHERE id = $1', [legacyId]);
    assert.deepEqual(legacyTask.rows, [{ status: 'DONE', output_json: { ok: true } }]);

    // A matching receipt from an earlier attempt does not verify this terminal transition.
    await client.query(
      `INSERT INTO task_runs (task_id, bot_id, status, result_json, completed_at)
       VALUES ($1, $2, 'COMPLETED', $3, NOW() - INTERVAL '1 day')`,
      [legacyId, botId, JSON.stringify({ ok: true })]
    );
    assert.equal(await report(legacyId, 'DONE', { ok: true }), 'unverified');

    const failedId = await createTask();
    assert.equal(await report(failedId, 'FAILED', { error: 'fixture' }), 'recorded');
    const failedRun = await client.query('SELECT status FROM task_runs WHERE task_id = $1', [failedId]);
    assert.deepEqual(failedRun.rows, [{ status: 'FAILED' }]);

    const retryId = await createTask();
    await assert.rejects(report(retryId, 'DONE', {}, randomUUID()), { code: '23503' });
    const task = await client.query('SELECT status, output_json FROM tasks WHERE id = $1', [retryId]);
    assert.deepEqual(task.rows, [{ status: 'RUNNING', output_json: null }]);
    assert.equal(await report(retryId, 'DONE', {}), 'recorded');
    assert.equal(await report(randomUUID(), 'DONE', {}), 'missing');

    const manualId = await createTask();
    assert.equal(await report(manualId, 'DONE', {}, null), 'recorded');
    const manualRuns = await client.query('SELECT id FROM task_runs WHERE task_id = $1', [manualId]);
    assert.equal(manualRuns.rowCount, 0);
  } finally {
    await client.end();
  }
});
