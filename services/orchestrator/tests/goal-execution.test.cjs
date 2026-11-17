const test = require('node:test');
const assert = require('node:assert/strict');
const { formatGoalExecution, goalExecutionQuery } = require('../dist/goal-execution');

test('distinguishes an inaccessible goal from an existing goal without tasks', () => {
  assert.equal(formatGoalExecution([]), null);
  assert.deepEqual(formatGoalExecution([{ goal_id: 'g', task_id: null }]), {
    goalId: 'g', tasks: [], hasMore: false,
  });
});

test('a task marked done carries no receipt until a worker run exists', () => {
  const rows = [{ goal_id: 'g', task_id: 't', task_status: 'DONE', run_id: null }];
  const entry = formatGoalExecution(rows).tasks[0];
  assert.equal(entry.status, 'DONE');
  assert.equal(entry.latestRun, null);
});

test('keeps the extra row only as a signal that older tasks exist', () => {
  const rows = Array.from({ length: 21 }, (_, id) => ({ goal_id: 'g', task_id: String(id), run_id: null }));
  const result = formatGoalExecution(rows);
  assert.equal(result.tasks.length, 20);
  assert.equal(result.hasMore, true);
  assert.equal(formatGoalExecution(rows.slice(0, 20)).hasMore, false);
});

test('reads only the matching organization and the latest run for each task', {
  skip: !process.env.DATABASE_URL && process.env.NOVA_TEST_SQLITE !== '1',
}, async () => {
  // CI exercises PostgreSQL. A local Node 22+ checkout can exercise the same SQL
  // without a server using NOVA_TEST_SQLITE=1.
  const sqlite = !process.env.DATABASE_URL;
  const db = sqlite
    ? new (require('node:sqlite').DatabaseSync)(':memory:')
    : new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
  async function read(goal, org) {
    const rows = sqlite
      ? db.prepare(goalExecutionQuery).all({ $1: goal, $2: org })
      : (await db.query(goalExecutionQuery, [goal, org])).rows;
    return formatGoalExecution(rows);
  }
  const setup = `
    CREATE TEMP TABLE goals (id text primary key, org_id text);
    CREATE TEMP TABLE tasks (id text primary key, org_id text, goal_id text, type text, status text, updated_at timestamp);
    CREATE TEMP TABLE task_runs (id text primary key, task_id text, status text, started_at timestamp,
                                 completed_at timestamp, result_json jsonb);
    INSERT INTO goals VALUES ('work','org1'),('empty','org1'),('other','org2');
    INSERT INTO tasks VALUES
      ('t1','org1','work','compare','DONE','2025-02-03'),
      ('t2','org1','work','review','QUEUED','2025-02-02'),
      ('foreign','org2','work','hidden','DONE','2025-02-04');
    INSERT INTO task_runs VALUES
      ('runA','t1','FAILED','2025-02-01','2025-02-01','{"summary":"older"}'),
      ('runB','t1','FAILED','2025-02-01','2025-02-02','{"summary":"older retry"}'),
      ('run0','t1','COMPLETED',NULL,'2025-02-03','{"result":{"summary":"source read back"},"other":"private metadata"}'),
      ('runC','foreign','COMPLETED','2025-02-03','2025-02-03','{"summary":"wrong organization"}');
  `;
  if (!sqlite) await db.connect();
  try {
    if (sqlite) db.exec(setup);
    else await db.query(setup);
    assert.equal(await read('work', 'org2'), null);
    assert.equal((await read('empty', 'org1')).tasks.length, 0);
    const result = await read('work', 'org1');
    assert.deepEqual(result.tasks.map(row => row.id), ['t1', 't2']);
    assert.equal(result.tasks[0].latestRun.id, 'run0');
    assert.equal(result.tasks[0].latestRun.startedAt, null);
    assert.equal(result.tasks[0].latestRun.reportedSummary, 'source read back');
    assert.equal(result.tasks[1].latestRun, null);
    assert.equal(JSON.stringify(result).includes('private metadata'), false);
  } finally {
    if (sqlite) db.close();
    else await db.end();
  }
});
