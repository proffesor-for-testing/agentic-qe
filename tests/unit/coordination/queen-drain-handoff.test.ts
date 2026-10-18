/**
 * #1127 and the low findings of #1124, follow-ups from the review of #1107.
 *
 * - A slot freed while a drain is running must reach the queue. Before, a task
 *   failed at dispatch outside the drain skipped its own processQueue call and
 *   the drain moved on after its own task was assigned, so the freed slot sat
 *   unused until some unrelated submit or completion.
 * - A task failed at dispatch publishes QueenTaskFailed like any other failure.
 * - Work stealing only moves a task to a domain whose plugin can execute it,
 *   and a stolen task holds a slot like any other dispatched task.
 *
 * Each interleaving is driven deterministically: agent spawn for the drain's
 * own task is held on a gate while the other event happens.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  assignTask, enqueueTask, processQueue, type QueenTaskContext,
} from '../../../src/coordination/queen-task-management.js';
import { triggerWorkStealing, type QueenWorkStealingContext } from '../../../src/coordination/queen-work-stealing.js';
import type { QueenTask, TaskExecution } from '../../../src/coordination/queen-types.js';
import type { DomainPlugin } from '../../../src/kernel/interfaces.js';
import { ok, type DomainName, type Priority } from '../../../src/shared/types/index.js';

function task(id: string, type: QueenTask['type'], domain: DomainName, priority: Priority = 'p1'): QueenTask {
  return { id, type, priority, targetDomains: [domain], payload: {}, timeout: 10000, createdAt: new Date() };
}

function plugin(types: string[]) {
  return {
    executeTask: vi.fn(async () => ok(undefined)),
    canHandleTask: (type: string) => types.includes(type),
    getSupportedTaskTypes: () => [...types],
    handleEvent: vi.fn(async () => {}),
  };
}

function createContext(maxConcurrentTasks: number) {
  const security = plugin(['security-audit', 'sast-scan']);
  const coverage = plugin(['analyze-coverage']);
  // Agent spawn for the next dispatch can be held open, so other events can
  // happen while a drain is awaiting it.
  let holdNext = false;
  let releaseHeld: () => void = () => {};
  const requestAgentSpawn = vi.fn(async () => {
    if (holdNext) {
      holdNext = false;
      await new Promise<void>(resolve => { releaseHeld = resolve; });
    }
    return ok('agent-1');
  });
  const ctx = {
    config: { maxConcurrentTasks, taskRetryLimit: 0, enableMetrics: false },
    tasks: new Map<string, TaskExecution>(),
    taskQueue: new Map<Priority, QueenTask[]>([['p0', []], ['p1', []], ['p2', []], ['p3', []]]),
    domainQueues: new Map<DomainName, QueenTask[]>([
      ['coverage-analysis', []], ['security-compliance', []], ['requirements-validation', []],
    ]),
    domainLastActivity: new Map(),
    domainPlugins: new Map<DomainName, DomainPlugin>([
      ['security-compliance', security as unknown as DomainPlugin],
      ['coverage-analysis', coverage as unknown as DomainPlugin],
    ]),
    runningTaskCounter: 0,
    tasksReceived: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    taskDurations: { push: vi.fn() },
    auditLogger: { logAssign: vi.fn(), logComplete: vi.fn(), logFail: vi.fn(), logSteal: vi.fn() },
    agentCoordinator: { stop: vi.fn(async () => ok(undefined)) },
    tinyDancerRouter: null,
    domainBreakerRegistry: null as null | { canExecuteInDomain: (d: DomainName) => boolean },
    domainTeamManager: null,
    tierSelector: null,
    traceCollector: null,
    taskTraceContexts: new Map(),
    coExecutionRepo: null,
    requestAgentSpawn,
    publishEvent: vi.fn(async () => {}),
    getDomainLoad: () => 0,
    getDomainHealth: () => undefined,
  };
  const hold = () => { holdNext = true; };
  const release = () => releaseHeld();
  return { ctx, security, coverage, hold, release };
}

type Ctx = ReturnType<typeof createContext>['ctx'];
const asCtx = (ctx: Ctx) => ctx as unknown as QueenTaskContext;

function setQueued(ctx: Ctx, t: QueenTask): void {
  ctx.tasks.set(t.id, { taskId: t.id, task: t, status: 'queued', assignedAgents: [], retryCount: 0 });
  enqueueTask(ctx.taskQueue, ctx.domainQueues, t);
}

/** What submitTask does for a task admitted below capacity. */
async function submitDirect(ctx: Ctx, t: QueenTask): Promise<void> {
  ctx.runningTaskCounter++;
  await assignTask(asCtx(ctx), t);
}

describe('a slot freed while a drain is running reaches the queue (#1127)', () => {
  it('hands the slot of a task failed at dispatch outside the drain to the next task of the same priority', async () => {
    const { ctx, coverage, hold, release } = createContext(3);
    ctx.runningTaskCounter = 1; // one task already running elsewhere
    const x = task('x', 'analyze-coverage', 'coverage-analysis');
    const z = task('z', 'analyze-coverage', 'coverage-analysis');
    setQueued(ctx, x);
    setQueued(ctx, z);

    // 1. The drain is awaiting assignment of X.
    hold();
    const drain = processQueue(asCtx(ctx));
    await vi.waitFor(() => expect(ctx.requestAgentSpawn).toHaveBeenCalledTimes(1));
    expect(ctx.runningTaskCounter).toBe(2);

    // 2. Meanwhile Y is submitted directly and fails as unexecutable.
    await submitDirect(ctx, task('y', 'scan-security', 'security-compliance'));
    expect(ctx.tasks.get('y')?.status).toBe('failed');
    expect(ctx.runningTaskCounter).toBe(2);

    // 3. X is assigned; the drain must not stop with a free slot and Z queued.
    release();
    await drain;

    expect(ctx.tasks.get('x')?.status).toBe('running');
    expect(ctx.tasks.get('z')?.status).toBe('running');
    expect(coverage.executeTask).toHaveBeenCalledTimes(2);
    expect(ctx.runningTaskCounter).toBe(3);
  });

  it('re-scans from the top priority when a slot frees after the drain has passed it', async () => {
    const { ctx, hold, release } = createContext(2);
    const low = task('low', 'analyze-coverage', 'coverage-analysis', 'p2');
    const urgent = task('urgent', 'analyze-coverage', 'coverage-analysis', 'p0');
    setQueued(ctx, low);

    // The drain has passed p0 (empty) and is awaiting assignment of the p2 task.
    hold();
    const drain = processQueue(asCtx(ctx));
    await vi.waitFor(() => expect(ctx.requestAgentSpawn).toHaveBeenCalledTimes(1));

    // A p0 task is queued, then a slot is freed by a failure at dispatch.
    setQueued(ctx, urgent);
    await submitDirect(ctx, task('y', 'scan-security', 'security-compliance'));

    release();
    await drain;

    expect(ctx.tasks.get('urgent')?.status).toBe('running');
    expect(ctx.runningTaskCounter).toBe(2);
  });

  it('hands on the slot of a queued task cancelled while its agent spawn was pending', async () => {
    const { ctx, coverage, hold, release } = createContext(1);
    const cancelled = task('cancelled', 'analyze-coverage', 'coverage-analysis');
    const next = task('next', 'analyze-coverage', 'coverage-analysis');
    setQueued(ctx, cancelled);
    setQueued(ctx, next);

    hold();
    const drain = processQueue(asCtx(ctx));
    await vi.waitFor(() => expect(ctx.requestAgentSpawn).toHaveBeenCalledTimes(1));
    // cancelTask on a task the drain is dispatching
    ctx.tasks.set('cancelled', { ...ctx.tasks.get('cancelled')!, status: 'cancelled', completedAt: new Date() });
    release();
    await drain;

    expect(ctx.tasks.get('cancelled')?.status).toBe('cancelled');
    expect(ctx.tasks.get('next')?.status).toBe('running');
    expect(coverage.executeTask).toHaveBeenCalledTimes(1);
    expect(ctx.runningTaskCounter).toBe(1);
  });

  it('fills every free slot in priority order in one drain', async () => {
    const { ctx, coverage } = createContext(3);
    for (const [id, p] of [['a', 'p2'], ['b', 'p1'], ['c', 'p1'], ['d', 'p2']] as const) {
      setQueued(ctx, task(id, 'analyze-coverage', 'coverage-analysis', p));
    }

    await processQueue(asCtx(ctx));

    expect(['b', 'c', 'a'].map(id => ctx.tasks.get(id)?.status)).toEqual(['running', 'running', 'running']);
    expect(ctx.tasks.get('d')?.status).toBe('queued');
    expect(coverage.executeTask).toHaveBeenCalledTimes(3);
    expect(ctx.runningTaskCounter).toBe(3);
  });

  // #1107 made the drain iterative. A slot freed outside a drain starts one,
  // and that drain must not recurse either.
  it('drains a long queue of unhandled tasks from a direct failure without recursion', async () => {
    const { ctx, coverage } = createContext(1);
    const queued = Array.from({ length: 3000 }, (_, i) => task(`scan-${i}`, 'scan-security', 'security-compliance'));
    for (const t of queued) setQueued(ctx, t);
    setQueued(ctx, task('coverage', 'analyze-coverage', 'coverage-analysis'));

    await submitDirect(ctx, task('y', 'scan-security', 'security-compliance'));

    expect(queued.every(t => ctx.tasks.get(t.id)?.status === 'failed')).toBe(true);
    expect(ctx.tasksFailed).toBe(3001);
    expect(ctx.tasks.get('coverage')?.status).toBe('running');
    expect(coverage.executeTask).toHaveBeenCalledTimes(1);
    expect(ctx.runningTaskCounter).toBe(1);
  }, 30000);
});

describe('QueenTaskFailed for a task failed at dispatch (#1124)', () => {
  it('is published for a submitted task no handler executes', async () => {
    const { ctx } = createContext(2);

    await submitDirect(ctx, task('y', 'scan-security', 'security-compliance'));

    expect(ctx.publishEvent).toHaveBeenCalledWith('TaskFailed', {
      taskId: 'y',
      domain: 'security-compliance',
      error: expect.stringContaining("No handler for task type 'scan-security'"),
    });
  });

  it('is published for a queued task that cannot be assigned', async () => {
    const { ctx } = createContext(1);
    ctx.domainBreakerRegistry = { canExecuteInDomain: () => false };
    setQueued(ctx, task('blocked', 'analyze-coverage', 'coverage-analysis'));

    await processQueue(asCtx(ctx));

    expect(ctx.publishEvent).toHaveBeenCalledWith('TaskFailed', {
      taskId: 'blocked',
      domain: undefined,
      error: expect.stringContaining('circuit breaker is open'),
    });
    expect(ctx.runningTaskCounter).toBe(0);
  });
});

describe('a task its plugin refuses at dispatch (#1124)', () => {
  it('publishes QueenTaskFailed, releases its slot once and hands it to the queue', async () => {
    const { ctx, coverage } = createContext(1);
    coverage.executeTask.mockImplementationOnce(async () => ({ success: false, error: new Error('refused') }) as never);
    const waiting = task('waiting', 'analyze-coverage', 'coverage-analysis');
    setQueued(ctx, waiting);

    await submitDirect(ctx, task('refused', 'analyze-coverage', 'coverage-analysis'));

    expect(ctx.tasks.get('refused')).toMatchObject({ status: 'failed', error: 'refused' });
    expect(ctx.publishEvent).toHaveBeenCalledWith('TaskFailed', { taskId: 'refused', domain: 'coverage-analysis', error: 'refused' });
    expect(ctx.tasks.get('waiting')?.status).toBe('running');
    expect(ctx.runningTaskCounter).toBe(1);
  });
});

describe('work stealing checks for a handler and takes a slot (#1124)', () => {
  async function steal(ctx: Ctx, idle: DomainName, busy: DomainName) {
    const { dispatchStolenTask, canDomainExecuteTask } = await import('../../../src/coordination/queen-task-management.js');
    const wsCtx: QueenWorkStealingContext = {
      config: { workStealing: { stealBatchSize: 3 } } as QueenWorkStealingContext['config'],
      domainQueues: ctx.domainQueues,
      auditLogger: ctx.auditLogger as unknown as QueenWorkStealingContext['auditLogger'],
      tasksStolen: 0,
      getIdleDomains: () => [idle],
      getBusyDomains: () => [busy],
      getDomainLoad: () => 0,
      canExecuteInDomain: (d, t) => canDomainExecuteTask(ctx.domainPlugins, d, t),
      removeFromQueues: (t) => {
        for (const q of [...ctx.taskQueue.values(), ...ctx.domainQueues.values()]) {
          const i = q.findIndex(e => e.id === t.id);
          if (i !== -1) q.splice(i, 1);
        }
      },
      assignTaskToDomain: (t, d) => dispatchStolenTask(asCtx(ctx), t, d),
      publishEvent: ctx.publishEvent,
    };
    return triggerWorkStealing(wsCtx);
  }

  it('does not steal a task onto a domain whose plugin cannot execute it', async () => {
    const { ctx } = createContext(4);
    // ideation-assessment maps to coverage-analysis and security-compliance,
    // but no loaded plugin executes it.
    setQueued(ctx, task('idea', 'ideation-assessment', 'coverage-analysis'));

    const stolen = await steal(ctx, 'security-compliance', 'coverage-analysis');

    expect(stolen).toBe(0);
    expect(ctx.tasks.get('idea')?.status).toBe('queued');
    expect(ctx.runningTaskCounter).toBe(0);
  });

  it('holds a slot for a stolen task while it runs', async () => {
    const { ctx, security } = createContext(4);
    security.canHandleTask = (type: string) => type === 'ideation-assessment';
    setQueued(ctx, task('idea', 'ideation-assessment', 'coverage-analysis'));

    const stolen = await steal(ctx, 'security-compliance', 'coverage-analysis');

    expect(stolen).toBe(1);
    expect(ctx.tasks.get('idea')).toMatchObject({ status: 'running', assignedDomain: 'security-compliance' });
    expect(security.executeTask).toHaveBeenCalledTimes(1);
    expect(ctx.runningTaskCounter).toBe(1);
  });

  it('fails a stolen task that cannot be assigned instead of dropping it from the queue', async () => {
    const { ctx, security } = createContext(4);
    security.canHandleTask = (type: string) => type === 'ideation-assessment';
    ctx.domainBreakerRegistry = { canExecuteInDomain: () => false };
    setQueued(ctx, task('idea', 'ideation-assessment', 'coverage-analysis'));

    await steal(ctx, 'security-compliance', 'coverage-analysis');

    expect(ctx.tasks.get('idea')).toMatchObject({ status: 'failed', error: expect.stringContaining('circuit breaker is open') });
    expect(ctx.runningTaskCounter).toBe(0);
  });
});
