import { EventEmitter } from 'node:events';
import {
  BotClient,
  BotConfig,
  BotRegistration,
  TaskDefinition,
  createBotConfig,
  installBotShutdownHandlers,
  startRegisteredBotHttpService,
} from '../index';

const registration: BotRegistration = {
  id: 'lifecycle-bot-id',
  botType: 'socialbot',
  instanceId: 'lifecycle-instance-id',
  status: 'ONLINE',
  capabilities: [],
  permissions: [],
  registeredAt: new Date().toISOString(),
  lastHeartbeat: new Date().toISOString(),
};

const claimedTask: TaskDefinition = {
  id: 'claimed-task-id',
  goalId: 'goal-id',
  botId: registration.id,
  type: 'TEST_TASK',
  priority: 1,
  status: 'RUNNING',
  inputJson: {},
  createdAt: new Date().toISOString(),
  claimToken: '11111111-1111-4111-8111-111111111111',
  claimGeneration: 1,
};

function createClient(options: Partial<BotConfig> = {}): BotClient {
  return new BotClient(createBotConfig('socialbot', [], {
    orchestratorUrl: 'http://orchestrator.test',
    heartbeatIntervalMs: 60_000,
    taskPollIntervalMs: 60_000,
    requestTimeoutMs: 200,
    heartbeatFailureThreshold: 2,
    taskShutdownTimeoutMs: 50,
    ...options,
  }));
}

function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' || input instanceof URL ? String(input) : input.url;
}

function registrationResponse(): Response {
  return Response.json({ success: true, data: { bot: registration } }, { status: 201 });
}

function acknowledgedLeaseResponse(durationMs = 5_000): Response {
  return Response.json({
    success: true,
    data: { leaseExpiresAt: new Date(Date.now() + durationMs).toISOString() },
  });
}

function heartbeatResponse(currentTask: unknown, durationMs = 5_000): Response {
  return Response.json({
    success: true,
    data: {
      currentTask: currentTask
        ? { id: claimedTask.id, leaseExpiresAt: new Date(Date.now() + durationMs).toISOString() }
        : null,
    },
  });
}

function abortableNever(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const rejectFromAbort = () => reject(signal?.reason ?? new Error('aborted'));
    if (signal?.aborted) rejectFromAbort();
    else signal?.addEventListener('abort', rejectFromAbort, { once: true });
  });
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for condition');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function deferredResponse(): { promise: Promise<Response>; resolve: (response: Response) => void } {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

describe('BotClient bounded lifecycle', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signals HTTP readiness only after orchestrator registration and listening succeed', async () => {
    const order: string[] = [];
    const lifecycle = {
      start: jest.fn(async () => { order.push('registered'); }),
      stop: jest.fn(async () => { order.push('stopped'); }),
    };
    const listen = jest.fn(async () => {
      order.push('listening');
      return { listening: true };
    });
    const signalReady = jest.fn(() => { order.push('ready'); });

    await expect(startRegisteredBotHttpService(lifecycle, listen, signalReady)).resolves.toEqual({ listening: true });
    expect(order).toEqual(['registered', 'listening', 'ready']);

    const failedLifecycle = {
      start: jest.fn(async () => { throw new Error('orchestrator unavailable'); }),
      stop: jest.fn(async () => undefined),
    };
    const neverListen = jest.fn(async () => ({ listening: true }));
    const neverReady = jest.fn();
    await expect(startRegisteredBotHttpService(failedLifecycle, neverListen, neverReady)).rejects.toThrow(
      'orchestrator unavailable',
    );
    expect(neverListen).not.toHaveBeenCalled();
    expect(neverReady).not.toHaveBeenCalled();
  });

  it('sends only database-safe heartbeat states and fails health after bounded heartbeat timeouts', async () => {
    const heartbeatStates: string[] = [];
    let heartbeatCount = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) {
        const body = JSON.parse(String(init?.body)) as { status: string };
        heartbeatStates.push(body.status);
        heartbeatCount += 1;
        if (heartbeatCount === 1) return Response.json({ success: true });
        return abortableNever(init?.signal);
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json([]);
    });
    const client = createClient({ heartbeatIntervalMs: 30, requestTimeoutMs: 20 });

    try {
      await client.start();
      expect(client.getHealthStatus().status).toBe('healthy');

      await waitUntil(() => client.getHealthStatus().status === 'unhealthy');
      expect(client.getHealthStatus().checks.heartbeat).toMatchObject({
        status: 'fail',
        message: expect.stringContaining('2 consecutive heartbeat failures'),
      });
      expect(heartbeatStates[0]).toBe('ONLINE');
      expect(heartbeatStates.every(status => ['ONLINE', 'OFFLINE', 'BUSY', 'ERROR'].includes(status))).toBe(true);
    } finally {
      await client.stop();
    }
  });

  it('keeps slow polling and task execution single-flight and maps BUSY heartbeats', async () => {
    const handlerGate = deferred();
    const heartbeatStates: string[] = [];
    const renewedTasks: unknown[] = [];
    let acknowledgements = 0;
    let taskPolls = 0;
    let handlerStarts = 0;
    let activeHandlers = 0;
    let maxActiveHandlers = 0;

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) {
        const body = JSON.parse(String(init?.body)) as { status: string; currentTask?: unknown };
        heartbeatStates.push(body.status);
        renewedTasks.push(body.currentTask);
        return heartbeatResponse(body.currentTask);
      }
      if (url.endsWith('/tasks') && init?.method === 'GET') {
        taskPolls += 1;
        await new Promise(resolve => setTimeout(resolve, 25));
        return Response.json(taskPolls === 1 ? [claimedTask] : []);
      }
      if (url.endsWith('/ack')) {
        acknowledgements += 1;
        return acknowledgedLeaseResponse();
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ success: true });
    });

    const client = createClient({ heartbeatIntervalMs: 10, taskPollIntervalMs: 5 });
    client.registerTaskHandler('TEST_TASK', async () => {
      handlerStarts += 1;
      activeHandlers += 1;
      maxActiveHandlers = Math.max(maxActiveHandlers, activeHandlers);
      await handlerGate.promise;
      activeHandlers -= 1;
      return { success: true };
    });

    await client.start();
    try {
      await waitUntil(() => handlerStarts === 1);
      await new Promise(resolve => setTimeout(resolve, 40));

      expect(taskPolls).toBe(1);
      expect(handlerStarts).toBe(1);
      expect(maxActiveHandlers).toBe(1);
      expect(acknowledgements).toBe(1);
      expect(heartbeatStates).toContain('BUSY');
      expect(renewedTasks).toContainEqual({
        id: claimedTask.id,
        claimToken: claimedTask.claimToken,
        claimGeneration: claimedTask.claimGeneration,
      });

      handlerGate.resolve();
      await waitUntil(() => client.getStatus() === 'READY');
    } finally {
      handlerGate.resolve();
      await client.stop();
    }
    expect(client.getStatus()).toBe('STOPPED');
  });

  it('cancels an over-deadline task and never resurrects READY after stop', async () => {
    const handlerGate = deferred();
    const completionBodies: Array<{ status?: string; error?: string }> = [];
    let taskOffered = false;
    let taskSignal: AbortSignal | undefined;

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) return Response.json({ success: true });
      if (url.endsWith('/tasks') && init?.method === 'GET') {
        if (taskOffered) return Response.json([]);
        taskOffered = true;
        return Response.json([claimedTask]);
      }
      if (url.endsWith('/ack')) return acknowledgedLeaseResponse();
      if (url.endsWith('/complete')) {
        completionBodies.push(JSON.parse(String(init?.body)) as { status?: string; error?: string });
        return Response.json({ success: true });
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ success: true });
    });

    const client = createClient({ taskPollIntervalMs: 5, taskShutdownTimeoutMs: 30 });
    client.registerTaskHandler('TEST_TASK', async (_task, context) => {
      taskSignal = context.signal;
      await handlerGate.promise;
      return { success: true };
    });

    await client.start();
    await waitUntil(() => client.getStatus() === 'BUSY');
    const stopStartedAt = Date.now();
    await client.stop();

    expect(Date.now() - stopStartedAt).toBeLessThan(500);
    expect(taskSignal?.aborted).toBe(true);
    expect(client.getStatus()).toBe('STOPPED');
    expect(client.getBotId()).toBeNull();
    expect(completionBodies).toContainEqual(expect.objectContaining({
      status: 'FAILED',
      error: 'Task cancelled during bot shutdown',
    }));

    handlerGate.resolve();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(client.getStatus()).toBe('STOPPED');
  });

  it('never renews an aborted task after the network recovers and lets its lease become reclaimable', async () => {
    let offered = false;
    let activeHeartbeatRequests = 0;
    let activeHeartbeatAbortedByLeaseLoss = false;
    let recoveredHeartbeatRequests = 0;
    let serverLeaseExpiresAt = 0;
    let taskSignal: AbortSignal | undefined;
    const postLossCurrentTasks: unknown[] = [];
    const ignoredAbortGate = deferred();
    const client = createClient({
      heartbeatIntervalMs: 20,
      taskPollIntervalMs: 5,
      requestTimeoutMs: 500,
    });

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) {
        const body = JSON.parse(String(init?.body)) as { currentTask?: unknown };
        if (taskSignal?.aborted) {
          recoveredHeartbeatRequests += 1;
          if (body.currentTask) {
            postLossCurrentTasks.push(body.currentTask);
            serverLeaseExpiresAt = Date.now() + 240;
          }
          return heartbeatResponse(body.currentTask);
        }
        if (body.currentTask) {
          activeHeartbeatRequests += 1;
          return new Promise<Response>((_resolve, reject) => {
            const rejectFromAbort = () => {
              activeHeartbeatAbortedByLeaseLoss = taskSignal?.aborted === true;
              reject(init?.signal?.reason ?? new Error('aborted'));
            };
            if (init?.signal?.aborted) rejectFromAbort();
            else init?.signal?.addEventListener('abort', rejectFromAbort, { once: true });
          });
        }
        return heartbeatResponse(undefined);
      }
      if (url.endsWith('/tasks') && init?.method === 'GET') {
        if (offered) return Response.json([]);
        offered = true;
        return Response.json([claimedTask]);
      }
      if (url.endsWith('/ack')) {
        serverLeaseExpiresAt = Date.now() + 240;
        return Response.json({
          success: true,
          data: { leaseExpiresAt: new Date(serverLeaseExpiresAt).toISOString() },
        });
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ success: true });
    });

    client.registerTaskHandler('TEST_TASK', async (_task, context) => {
      taskSignal = context.signal;
      // Deliberately ignore cancellation to prove later heartbeats still cannot
      // resurrect or extend this claim after lease loss is declared.
      await ignoredAbortGate.promise;
      return { success: true };
    });

    await client.start();
    try {
      await waitUntil(() => taskSignal?.aborted === true);
      expect(activeHeartbeatRequests).toBeGreaterThan(0);
      expect(activeHeartbeatAbortedByLeaseLoss).toBe(true);
      expect(taskSignal?.reason).toEqual(expect.objectContaining({
        message: 'Task lease renewal could not be confirmed before expiry',
      }));
      await waitUntil(() => recoveredHeartbeatRequests >= 3);
      await waitUntil(() => Date.now() >= serverLeaseExpiresAt);
      expect(postLossCurrentTasks).toEqual([]);
      expect(client.getStatus()).toBe('ERROR');
      expect(client.getHealthStatus().status).toBe('unhealthy');
    } finally {
      ignoredAbortGate.resolve();
      await client.stop();
    }
  });

  it('stops heartbeat eligibility as soon as completion is authoritative, before audit emission', async () => {
    const auditGate = deferred();
    const auditStarted = deferred();
    const postCompletionCurrentTasks: unknown[] = [];
    let offered = false;
    let completionConfirmed = false;
    let postCompletionHeartbeats = 0;

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) {
        const body = JSON.parse(String(init?.body)) as { currentTask?: unknown };
        if (completionConfirmed) {
          postCompletionHeartbeats += 1;
          if (body.currentTask) postCompletionCurrentTasks.push(body.currentTask);
        }
        return heartbeatResponse(body.currentTask);
      }
      if (url.endsWith('/tasks') && init?.method === 'GET') {
        if (offered) return Response.json([]);
        offered = true;
        return Response.json([claimedTask]);
      }
      if (url.endsWith('/ack')) return acknowledgedLeaseResponse();
      if (url.endsWith('/complete')) {
        completionConfirmed = true;
        return Response.json({ success: true });
      }
      if (url.endsWith('/v1/events')) {
        const body = JSON.parse(String(init?.body)) as { type?: string };
        if (body.type === 'TASK_COMPLETED') {
          auditStarted.resolve();
          await auditGate.promise;
        }
        return Response.json({ success: true });
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ success: true });
    });

    const client = createClient({ heartbeatIntervalMs: 10, taskPollIntervalMs: 5 });
    client.registerTaskHandler('TEST_TASK', async () => ({ success: true }));

    await client.start();
    try {
      await auditStarted.promise;
      await waitUntil(() => postCompletionHeartbeats >= 3);
      expect(client.getStatus()).toBe('BUSY');
      expect(postCompletionCurrentTasks).toEqual([]);
      auditGate.resolve();
      await waitUntil(() => client.getStatus() === 'READY');
    } finally {
      auditGate.resolve();
      await client.stop();
    }
  });

  it('lets authoritative completion resolve an earlier in-flight heartbeat conflict', async () => {
    const staleHeartbeat = deferredResponse();
    const completionResponse = deferredResponse();
    const heartbeatStarted = deferred();
    const completionStarted = deferred();
    const heartbeatAfterConflict = deferred();
    let offered = false;
    let completionInFlight = false;

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) {
        const body = JSON.parse(String(init?.body)) as { currentTask?: { id?: string } };
        if (body.currentTask?.id === claimedTask.id && !completionInFlight) {
          heartbeatStarted.resolve();
          return staleHeartbeat.promise;
        }
        if (completionInFlight) heartbeatAfterConflict.resolve();
        return heartbeatResponse(body.currentTask);
      }
      if (url.endsWith('/tasks') && init?.method === 'GET') {
        if (offered) return Response.json([]);
        offered = true;
        return Response.json([claimedTask]);
      }
      if (url.endsWith('/ack')) return acknowledgedLeaseResponse();
      if (url.endsWith('/complete')) {
        completionInFlight = true;
        completionStarted.resolve();
        return completionResponse.promise;
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ success: true });
    });

    const client = createClient({ heartbeatIntervalMs: 10, taskPollIntervalMs: 5 });
    client.registerTaskHandler('TEST_TASK', async () => {
      await heartbeatStarted.promise;
      return { success: true };
    });

    await client.start();
    try {
      await completionStarted.promise;
      staleHeartbeat.resolve(Response.json(
        { success: false, error: { code: 'TASK_CLAIM_STALE' } },
        { status: 409 },
      ));
      await heartbeatAfterConflict.promise;
      expect(client.getStatus()).toBe('BUSY');

      completionResponse.resolve(Response.json({ success: true }));
      await waitUntil(() => client.getStatus() === 'READY');
      expect(client.getHealthStatus().status).toBe('healthy');
    } finally {
      completionResponse.resolve(Response.json({ success: true }));
      await client.stop();
    }
  });

  it('atomically ends lease eligibility before a queued post-success heartbeat conflict runs', async () => {
    const staleHeartbeat = deferredResponse();
    const completionResponse = deferredResponse();
    const heartbeatStarted = deferred();
    const completionStarted = deferred();
    let offered = false;

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) {
        const body = JSON.parse(String(init?.body)) as { currentTask?: { id?: string } };
        if (body.currentTask?.id === claimedTask.id) {
          heartbeatStarted.resolve();
          return staleHeartbeat.promise;
        }
        return heartbeatResponse(body.currentTask);
      }
      if (url.endsWith('/tasks') && init?.method === 'GET') {
        if (offered) return Response.json([]);
        offered = true;
        return Response.json([claimedTask]);
      }
      if (url.endsWith('/ack')) return acknowledgedLeaseResponse();
      if (url.endsWith('/complete')) {
        completionStarted.resolve();
        return completionResponse.promise;
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ success: true });
    });

    const client = createClient({ heartbeatIntervalMs: 10, taskPollIntervalMs: 5 });
    client.registerTaskHandler('TEST_TASK', async () => {
      await heartbeatStarted.promise;
      return { success: true };
    });

    await client.start();
    try {
      await completionStarted.promise;
      // A no-content success has the shortest completion continuation. Resolve
      // it immediately before the stale response so the 409 is queued after
      // reportTaskResult succeeds but before processTask resumes.
      completionResponse.resolve(new Response(null, { status: 204 }));
      staleHeartbeat.resolve(Response.json(
        { success: false, error: { code: 'TASK_CLAIM_STALE' } },
        { status: 409 },
      ));

      await waitUntil(() => client.getStatus() === 'READY');
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(client.getStatus()).toBe('READY');
      expect(client.getHealthStatus().status).toBe('healthy');
    } finally {
      completionResponse.resolve(new Response(null, { status: 204 }));
      await client.stop();
    }
  });

  it('fails the exact task when a pending heartbeat conflict outlives an unconfirmed completion', async () => {
    const staleHeartbeat = deferredResponse();
    const completionResponse = deferredResponse();
    const heartbeatStarted = deferred();
    const completionStarted = deferred();
    const heartbeatDuringCompletion = deferred();
    const postFailureCurrentTasks: unknown[] = [];
    let offered = false;
    let completionInFlight = false;
    let completionFailed = false;
    let postFailureHeartbeats = 0;

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) {
        const body = JSON.parse(String(init?.body)) as { currentTask?: unknown };
        if (body.currentTask && !completionInFlight) {
          heartbeatStarted.resolve();
          return staleHeartbeat.promise;
        }
        if (completionInFlight && !completionFailed) heartbeatDuringCompletion.resolve();
        if (completionFailed) {
          postFailureHeartbeats += 1;
          if (body.currentTask) postFailureCurrentTasks.push(body.currentTask);
        }
        return heartbeatResponse(body.currentTask);
      }
      if (url.endsWith('/tasks') && init?.method === 'GET') {
        if (offered) return Response.json([]);
        offered = true;
        return Response.json([claimedTask]);
      }
      if (url.endsWith('/ack')) return acknowledgedLeaseResponse();
      if (url.endsWith('/complete')) {
        completionInFlight = true;
        completionStarted.resolve();
        return completionResponse.promise;
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ success: true });
    });

    const client = createClient({ heartbeatIntervalMs: 10, taskPollIntervalMs: 5 });
    client.registerTaskHandler('TEST_TASK', async () => {
      await heartbeatStarted.promise;
      return { success: true };
    });

    await client.start();
    try {
      await completionStarted.promise;
      staleHeartbeat.resolve(Response.json(
        { success: false, error: { code: 'TASK_CLAIM_STALE' } },
        { status: 409 },
      ));
      await heartbeatDuringCompletion.promise;

      completionFailed = true;
      completionResponse.resolve(Response.json(
        { success: false, error: { code: 'COMPLETE_FAILED' } },
        { status: 503 },
      ));
      await waitUntil(() => client.getStatus() === 'ERROR');
      await waitUntil(() => postFailureHeartbeats >= 3);
      expect(postFailureCurrentTasks).toEqual([]);
      expect(client.getHealthStatus().status).toBe('unhealthy');
    } finally {
      completionResponse.resolve(new Response(null, { status: 204 }));
      await client.stop();
    }
  });

  it('ignores delayed task-A heartbeat, progress, and result conflicts after task B starts', async () => {
    const taskA: TaskDefinition = {
      ...claimedTask,
      id: 'task-a',
      claimToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      claimGeneration: 11,
    };
    const taskB: TaskDefinition = {
      ...claimedTask,
      id: 'task-b',
      claimToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      claimGeneration: 12,
    };
    const staleHeartbeat = deferredResponse();
    const staleProgress = deferredResponse();
    const staleResult = deferredResponse();
    const heartbeatAStarted = deferred();
    const progressAStarted = deferred();
    const resultAStarted = deferred();
    const taskBGate = deferred();
    const staleOperations: Array<Promise<unknown>> = [];
    const renewedTaskIds: string[] = [];
    let pollCount = 0;
    let taskBSignal: AbortSignal | undefined;
    let completionCalls = 0;

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) {
        const body = JSON.parse(String(init?.body)) as { currentTask?: { id?: string } };
        if (body.currentTask?.id === taskA.id) {
          heartbeatAStarted.resolve();
          return staleHeartbeat.promise;
        }
        if (body.currentTask?.id) renewedTaskIds.push(body.currentTask.id);
        return heartbeatResponse(body.currentTask);
      }
      if (url.endsWith('/tasks') && init?.method === 'GET') {
        pollCount += 1;
        if (pollCount === 1) return Response.json([taskA]);
        if (pollCount === 2) return Response.json([taskB]);
        return Response.json([]);
      }
      if (url.endsWith('/ack')) return acknowledgedLeaseResponse();
      if (url.endsWith('/progress')) {
        progressAStarted.resolve();
        return staleProgress.promise;
      }
      if (url.endsWith('/complete')) {
        completionCalls += 1;
        if (completionCalls === 1) {
          resultAStarted.resolve();
          return staleResult.promise;
        }
        return Response.json({ success: true });
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ success: true });
    });

    const client = createClient({ heartbeatIntervalMs: 100, taskPollIntervalMs: 5 });
    const testOnlyResultReporter = client as unknown as {
      reportTaskResult: (
        task: TaskDefinition,
        result: { success: boolean },
        signal?: AbortSignal,
      ) => Promise<boolean>;
    };
    client.registerTaskHandler('TEST_TASK', async (task, context) => {
      if (task.id === taskA.id) {
        staleOperations.push(context.reportProgress(10, 'delayed progress'));
        staleOperations.push(testOnlyResultReporter.reportTaskResult(task, { success: true }, context.signal));
        await Promise.all([heartbeatAStarted.promise, progressAStarted.promise, resultAStarted.promise]);
        return { success: true };
      }
      taskBSignal = context.signal;
      await taskBGate.promise;
      return { success: true };
    });

    await client.start();
    try {
      await waitUntil(() => taskBSignal !== undefined);
      const staleConflict = () => Response.json(
        { success: false, error: { code: 'TASK_CLAIM_STALE' } },
        { status: 409 },
      );
      staleHeartbeat.resolve(staleConflict());
      staleProgress.resolve(staleConflict());
      staleResult.resolve(staleConflict());
      await Promise.all(staleOperations);
      await new Promise(resolve => setTimeout(resolve, 5));

      expect(client.getHealthStatus().status).toBe('healthy');
      await waitUntil(() => renewedTaskIds.includes(taskB.id));

      expect(taskBSignal?.aborted).toBe(false);
      expect(client.getStatus()).toBe('BUSY');
    } finally {
      taskBGate.resolve();
      await client.stop();
    }
  });

  it('cancels a delayed start without allowing it to continue after stop', async () => {
    let releaseRegistration: (() => void) | undefined;
    let heartbeatCalls = 0;
    let deregistrationCalls = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) {
        await new Promise<void>(resolve => { releaseRegistration = resolve; });
        return registrationResponse();
      }
      if (url.endsWith('/heartbeat')) {
        heartbeatCalls += 1;
        return Response.json({ success: true });
      }
      if (init?.method === 'DELETE') {
        deregistrationCalls += 1;
        return new Response(null, { status: 204 });
      }
      return Response.json([]);
    });
    const client = createClient({ requestTimeoutMs: 500 });

    const startPromise = client.start();
    await waitUntil(() => Boolean(releaseRegistration));
    const stopPromise = client.stop();
    releaseRegistration?.();

    await expect(startPromise).rejects.toThrow('Bot startup cancelled');
    await stopPromise;
    expect(client.getStatus()).toBe('STOPPED');
    expect(client.getBotId()).toBeNull();
    expect(heartbeatCalls).toBe(0);
    expect(deregistrationCalls).toBe(1);
  });

  it('bounds registration and deregistration requests', async () => {
    const registrationTimeoutClient = createClient({ requestTimeoutMs: 20 });
    jest.spyOn(global, 'fetch').mockImplementation(async (_input, init) => abortableNever(init?.signal));

    const registrationStartedAt = Date.now();
    await expect(registrationTimeoutClient.start()).rejects.toThrow(
      'Orchestrator request timed out after 20ms: POST /v1/bots/register',
    );
    expect(Date.now() - registrationStartedAt).toBeLessThan(500);
    await registrationTimeoutClient.stop();
    expect(registrationTimeoutClient.getStatus()).toBe('STOPPED');

    jest.restoreAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith('/v1/bots/register')) return registrationResponse();
      if (url.endsWith('/heartbeat')) return Response.json({ success: true });
      if (init?.method === 'DELETE') return abortableNever(init.signal);
      return Response.json([]);
    });
    const deregistrationTimeoutClient = createClient({ requestTimeoutMs: 20 });
    await deregistrationTimeoutClient.start();

    const deregistrationStartedAt = Date.now();
    await deregistrationTimeoutClient.stop();
    expect(Date.now() - deregistrationStartedAt).toBeLessThan(500);
    expect(deregistrationTimeoutClient.getStatus()).toBe('STOPPED');
    expect(deregistrationTimeoutClient.getBotId()).toBeNull();
  });

  it.each(['storebot', 'tradebot'] as const)(
    'drains and cancels an active %s task before SIGINT exits',
    async (botType) => {
      let offered = false;
      let taskSignal: AbortSignal | undefined;
      const claimHeaders: Array<Record<string, string>> = [];
      jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const url = urlOf(input);
        if (url.endsWith('/v1/bots/register')) return registrationResponse();
        if (url.endsWith('/heartbeat')) {
          const body = JSON.parse(String(init?.body)) as { currentTask?: unknown };
          return heartbeatResponse(body.currentTask);
        }
        if (url.endsWith('/tasks') && init?.method === 'GET') {
          if (offered) return Response.json([]);
          offered = true;
          return Response.json([{ ...claimedTask, botId: registration.id }]);
        }
        if (url.endsWith('/ack') || url.endsWith('/complete')) {
          claimHeaders.push(init?.headers as Record<string, string>);
          return url.endsWith('/ack') ? acknowledgedLeaseResponse() : Response.json({ success: true });
        }
        if (init?.method === 'DELETE') return new Response(null, { status: 204 });
        return Response.json({ success: true });
      });

      const client = new BotClient(createBotConfig(botType, [], {
        orchestratorUrl: 'http://orchestrator.test',
        heartbeatIntervalMs: 10,
        taskPollIntervalMs: 5,
        requestTimeoutMs: 100,
        taskShutdownTimeoutMs: 20,
      }));
      client.registerTaskHandler('TEST_TASK', async (_task, context) => {
        taskSignal = context.signal;
        await new Promise<void>(resolve => {
          context.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return { success: false, error: 'cancelled' };
      });

      const signals = new EventEmitter();
      const exited = deferred();
      let exitCode: number | undefined;
      installBotShutdownHandlers(client, {
        signalSource: signals,
        exit: (code) => {
          exitCode = code;
          exited.resolve();
        },
      });

      await client.start();
      await waitUntil(() => client.getStatus() === 'BUSY');
      signals.emit('SIGINT');
      await exited.promise;

      expect(exitCode).toBe(0);
      expect(taskSignal?.aborted).toBe(true);
      expect(client.getStatus()).toBe('STOPPED');
      expect(claimHeaders.length).toBeGreaterThanOrEqual(2);
      for (const headers of claimHeaders) {
        expect(headers['X-Task-Claim-Token']).toBe(claimedTask.claimToken);
        expect(headers['X-Task-Claim-Generation']).toBe(String(claimedTask.claimGeneration));
      }
    },
  );
});
