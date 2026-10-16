/**
 * #1070: a queued task that reaches a terminal state while still in the queue
 * (e.g. its MCP caller executed it directly) must never be dispatched again.
 * Before the fix, processQueue reassigned it when a slot freed: its status
 * flipped completed -> running and runningTaskCounter leaked 1.
 *
 * Drives the real handleTaskCompleted and processQueue over one shared context.
 */
import { describe, expect, it, vi } from 'vitest';
import { handleTaskCompleted, type QueenEventHandlerContext } from '../../../src/coordination/queen-event-handlers.js';
import { enqueueTask, processQueue, type QueenTaskContext } from '../../../src/coordination/queen-task-management.js';
import type { QueenTask, TaskExecution } from '../../../src/coordination/queen-types.js';
import { ok, type DomainEvent, type DomainName, type Priority } from '../../../src/shared/types/index.js';

function task(id: string, type: QueenTask['type'] = 'index-code', domain: DomainName = 'code-intelligence'): QueenTask {
  return { id, type, priority: 'p1', targetDomains: [domain], payload: {}, timeout: 10000, createdAt: new Date() };
}

function createContext(maxConcurrentTasks: number) {
  const taskQueue = new Map<Priority, QueenTask[]>([['p0', []], ['p1', []], ['p2', []], ['p3', []]]);
  const domainQueues = new Map<DomainName, QueenTask[]>([['code-intelligence', []], ['quality-assessment', []]]);
  const requestAgentSpawn = vi.fn(async () => ok('agent-1'));
  const ctx = {
    config: { maxConcurrentTasks, taskRetryLimit: 0, enableMetrics: false },
    tasks: new Map<string, TaskExecution>(),
    taskQueue,
    domainQueues,
    domainLastActivity: new Map(),
    runningTaskCounter: 0,
    tasksReceived: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    taskDurations: { push: vi.fn(), average: vi.fn(() => 0) },
    auditLogger: { logAssign: vi.fn(), logComplete: vi.fn(), logFail: vi.fn() },
    agentCoordinator: { stop: vi.fn(async () => ok(undefined)) },
    tinyDancerRouter: null,
    domainBreakerRegistry: null,
    domainTeamManager: null,
    tierSelector: null,
    traceCollector: null,
    taskTraceContexts: new Map(),
    coExecutionRepo: null,
    taskCompletedHook: null,
    hypothesisManager: null,
    requestAgentSpawn,
    publishEvent: vi.fn(async () => {}),
    getDomainLoad: () => 0,
    getDomainHealth: () => undefined,
    processQueue: async () => processQueue(ctx as unknown as QueenTaskContext),
    enqueueTask: (t: QueenTask) => enqueueTask(taskQueue, domainQueues, t),
  };
  return ctx;
}

const completed = (taskId: string): DomainEvent =>
  ({ type: 'TaskCompleted', payload: { taskId, result: { ok: true } } } as DomainEvent);

function setRunning(ctx: ReturnType<typeof createContext>, t: QueenTask): void {
  ctx.tasks.set(t.id, { taskId: t.id, task: t, status: 'running', assignedAgents: [], retryCount: 0, startedAt: new Date() });
  ctx.runningTaskCounter++;
}

function setQueued(ctx: ReturnType<typeof createContext>, t: QueenTask): void {
  ctx.tasks.set(t.id, { taskId: t.id, task: t, status: 'queued', assignedAgents: [], retryCount: 0 });
  ctx.enqueueTask(t);
}

const queuedCount = (ctx: ReturnType<typeof createContext>) =>
  [...ctx.taskQueue.values()].reduce((n, q) => n + q.length, 0) +
  [...ctx.domainQueues.values()].reduce((n, q) => n + q.length, 0);

describe('queued task that completes before dispatch (#1070)', () => {
  it('is not re-dispatched when a slot frees, and the running counter returns to 0', async () => {
    const ctx = createContext(1);
    const blocker = task('blocker', 'assess-quality', 'quality-assessment');
    const callerOwned = task('caller-owned');
    setRunning(ctx, blocker);
    setQueued(ctx, callerOwned);

    // The caller executes the queued task itself and reports completion.
    await handleTaskCompleted(ctx as unknown as QueenEventHandlerContext, completed(callerOwned.id));
    expect(ctx.tasks.get(callerOwned.id)?.status).toBe('completed');
    expect(ctx.runningTaskCounter).toBe(1);

    // The blocker finishes, freeing the only slot.
    await handleTaskCompleted(ctx as unknown as QueenEventHandlerContext, completed(blocker.id));

    expect(ctx.tasks.get(callerOwned.id)?.status).toBe('completed');
    expect(ctx.runningTaskCounter).toBe(0);
    expect(ctx.requestAgentSpawn).not.toHaveBeenCalled();
    expect(ctx.publishEvent).not.toHaveBeenCalledWith('TaskAssigned', expect.anything());
    expect(ctx.tasksCompleted).toBe(2);
    expect(queuedCount(ctx)).toBe(0);
  });

  it('still dispatches a waiting task queued behind a terminal one', async () => {
    const ctx = createContext(1);
    const done = task('done');
    const waiting = task('waiting');
    setQueued(ctx, done);
    setQueued(ctx, waiting);
    ctx.tasks.set(done.id, { ...ctx.tasks.get(done.id)!, status: 'completed', completedAt: new Date() });

    await processQueue(ctx as unknown as QueenTaskContext);

    expect(ctx.tasks.get(done.id)?.status).toBe('completed');
    expect(ctx.tasks.get(waiting.id)?.status).toBe('running');
    expect(ctx.runningTaskCounter).toBe(1);
    expect(ctx.requestAgentSpawn).toHaveBeenCalledTimes(1);
    expect(queuedCount(ctx)).toBe(0);
  });

  it('drops failed and cancelled entries without consuming a slot', async () => {
    const ctx = createContext(2);
    const failed = task('failed');
    const cancelled = task('cancelled');
    setQueued(ctx, failed);
    setQueued(ctx, cancelled);
    ctx.tasks.set(failed.id, { ...ctx.tasks.get(failed.id)!, status: 'failed', completedAt: new Date() });
    ctx.tasks.set(cancelled.id, { ...ctx.tasks.get(cancelled.id)!, status: 'cancelled', completedAt: new Date() });

    await processQueue(ctx as unknown as QueenTaskContext);

    expect(ctx.tasks.get(failed.id)?.status).toBe('failed');
    expect(ctx.tasks.get(cancelled.id)?.status).toBe('cancelled');
    expect(ctx.runningTaskCounter).toBe(0);
    expect(ctx.requestAgentSpawn).not.toHaveBeenCalled();
    expect(queuedCount(ctx)).toBe(0);
  });
});
