/**
 * #1081: a Queen-owned task whose domain plugin has no handler for its type
 * used to fall through to the TaskAssigned event fallback. Nothing answered
 * it, so the task stayed `running` and held a concurrency slot for good. The
 * Queen now fails such a task at dispatch with the reason and frees the slot,
 * on every path into assignTaskToDomain: direct submission, the queue and
 * work stealing. Caller-owned tasks (#1065) are left to their caller.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  assignTask, assignTaskToDomain, enqueueTask, processQueue, type QueenTaskContext,
} from '../../../src/coordination/queen-task-management.js';
import type { QueenTask, TaskExecution } from '../../../src/coordination/queen-types.js';
import type { DomainPlugin } from '../../../src/kernel/interfaces.js';
import { ok, type DomainName, type Priority } from '../../../src/shared/types/index.js';

function task(id: string, type: QueenTask['type'], domain: DomainName, executionOwner?: 'caller'): QueenTask {
  return {
    id, type, priority: 'p1', targetDomains: [domain], payload: {}, timeout: 10000, createdAt: new Date(),
    ...(executionOwner ? { executionOwner } : {}),
  };
}

function plugin(types: string[]) {
  return {
    executeTask: vi.fn(async () => ok(undefined)),
    canHandleTask: (type: string) => types.includes(type),
    getSupportedTaskTypes: () => [...types],
    handleEvent: vi.fn(async () => {}),
  };
}

function createContext(maxConcurrentTasks = 4) {
  const security = plugin(['security-audit', 'sast-scan']);
  const coverage = plugin(['analyze-coverage']);
  const taskQueue = new Map<Priority, QueenTask[]>([['p0', []], ['p1', []], ['p2', []], ['p3', []]]);
  const domainQueues = new Map<DomainName, QueenTask[]>();
  const ctx = {
    config: { maxConcurrentTasks, taskRetryLimit: 0, enableMetrics: false },
    tasks: new Map<string, TaskExecution>(),
    taskQueue,
    domainQueues,
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
    auditLogger: { logAssign: vi.fn(), logComplete: vi.fn(), logFail: vi.fn() },
    agentCoordinator: { stop: vi.fn(async () => ok(undefined)) },
    tinyDancerRouter: null,
    domainBreakerRegistry: null as null | { canExecuteInDomain: (d: DomainName) => boolean },
    domainTeamManager: null,
    tierSelector: null,
    traceCollector: null,
    taskTraceContexts: new Map(),
    coExecutionRepo: null,
    requestAgentSpawn: vi.fn(async () => ok('agent-1')),
    publishEvent: vi.fn(async () => {}),
    getDomainLoad: () => 0,
    getDomainHealth: () => undefined,
  };
  return { ctx, security, coverage };
}

const asCtx = (ctx: ReturnType<typeof createContext>['ctx']) => ctx as unknown as QueenTaskContext;

describe('Queen dispatch of a task type no plugin executes (#1081)', () => {
  it('fails a submitted Queen-owned task with the reason and releases its slot', async () => {
    const { ctx, security } = createContext();
    const t = task('scan', 'scan-security', 'security-compliance');
    ctx.runningTaskCounter = 1; // submitTask takes the slot before assigning

    const result = await assignTask(asCtx(ctx), t);

    expect(result).toEqual({ success: true, value: 'scan' });
    expect(ctx.tasks.get('scan')).toMatchObject({
      status: 'failed',
      assignedDomain: 'security-compliance',
      error: "No handler for task type 'scan-security' in domain security-compliance (supported: security-audit, sast-scan)",
      completedAt: expect.any(Date),
    });
    expect(ctx.runningTaskCounter).toBe(0);
    expect(ctx.tasksFailed).toBe(1);
    expect(ctx.requestAgentSpawn).not.toHaveBeenCalled();
    expect(ctx.publishEvent).not.toHaveBeenCalledWith('TaskAssigned', expect.anything());
    expect(security.executeTask).not.toHaveBeenCalled();
    expect(security.handleEvent).not.toHaveBeenCalled();
  });

  it('fails a task whose domain plugin is not loaded', async () => {
    const { ctx } = createContext();
    ctx.runningTaskCounter = 1;

    await assignTask(asCtx(ctx), task('chaos', 'run-chaos', 'chaos-resilience'));

    expect(ctx.tasks.get('chaos')).toMatchObject({
      status: 'failed', error: expect.stringContaining('chaos-resilience (domain not loaded)'),
    });
    expect(ctx.runningTaskCounter).toBe(0);
  });

  it('fails a queued unhandled task on dispatch and moves on to the next queued task', async () => {
    const { ctx, coverage } = createContext(1);
    const unhandled = task('scan', 'scan-security', 'security-compliance');
    const handled = task('coverage', 'analyze-coverage', 'coverage-analysis');
    for (const t of [unhandled, handled]) {
      ctx.tasks.set(t.id, { taskId: t.id, task: t, status: 'queued', assignedAgents: [], retryCount: 0 });
      enqueueTask(ctx.taskQueue, ctx.domainQueues, t);
    }

    await processQueue(asCtx(ctx));

    expect(ctx.tasks.get('scan')?.status).toBe('failed');
    expect(ctx.tasks.get('coverage')?.status).toBe('running');
    expect(coverage.executeTask).toHaveBeenCalledTimes(1);
    expect(ctx.runningTaskCounter).toBe(1);
  });

  // Review of #1107: failing a queued task re-entered processQueue once per
  // task, so a long queue overflowed the stack (about 1000 frames) and every
  // unwound frame decremented the running counter, leaving it near -1000.
  it('drains a long queue of unhandled tasks without recursion and keeps the counter at zero', async () => {
    const { ctx, coverage } = createContext(1);
    const queued = Array.from({ length: 3000 }, (_, i) => task(`scan-${i}`, 'scan-security', 'security-compliance'));
    const handled = task('coverage', 'analyze-coverage', 'coverage-analysis');
    for (const t of [...queued, handled]) {
      ctx.tasks.set(t.id, { taskId: t.id, task: t, status: 'queued', assignedAgents: [], retryCount: 0 });
      enqueueTask(ctx.taskQueue, ctx.domainQueues, t);
    }

    await processQueue(asCtx(ctx));

    expect(queued.every(t => ctx.tasks.get(t.id)?.status === 'failed')).toBe(true);
    expect(ctx.tasksFailed).toBe(3000);
    expect(ctx.tasks.get('coverage')?.status).toBe('running');
    expect(coverage.executeTask).toHaveBeenCalledTimes(1);
    expect(ctx.runningTaskCounter).toBe(1);
  }, 30000);

  it('fails a queued task that cannot be assigned at all instead of leaving it queued on a held slot', async () => {
    const { ctx } = createContext(1);
    ctx.domainBreakerRegistry = { canExecuteInDomain: () => false };
    const t = task('coverage', 'analyze-coverage', 'coverage-analysis');
    ctx.tasks.set(t.id, { taskId: t.id, task: t, status: 'queued', assignedAgents: [], retryCount: 0 });
    enqueueTask(ctx.taskQueue, ctx.domainQueues, t);

    await processQueue(asCtx(ctx));

    expect(ctx.tasks.get('coverage')).toMatchObject({ status: 'failed', error: expect.stringContaining('circuit breaker is open') });
    expect(ctx.runningTaskCounter).toBe(0);
  });

  it('fails a stolen task on an idle domain without a handler', async () => {
    const { ctx } = createContext();
    const t = task('stolen', 'analyze-coverage', 'coverage-analysis');

    await assignTaskToDomain(asCtx(ctx), t, 'security-compliance');

    expect(ctx.tasks.get('stolen')).toMatchObject({ status: 'failed', assignedDomain: 'security-compliance' });
  });

  it('still executes a handled Queen-owned task exactly once', async () => {
    const { ctx, coverage } = createContext();
    ctx.runningTaskCounter = 1;

    await assignTask(asCtx(ctx), task('coverage', 'analyze-coverage', 'coverage-analysis'));

    expect(ctx.tasks.get('coverage')?.status).toBe('running');
    expect(coverage.executeTask).toHaveBeenCalledTimes(1);
    expect(ctx.runningTaskCounter).toBe(1);
  });

  it('leaves a caller-owned task to its caller: not failed and not dispatched to a plugin (#1065)', async () => {
    const { ctx, security } = createContext();
    ctx.runningTaskCounter = 1;

    await assignTask(asCtx(ctx), task('caller', 'scan-security', 'security-compliance', 'caller'));

    expect(ctx.tasks.get('caller')?.status).toBe('running');
    expect(ctx.runningTaskCounter).toBe(1);
    expect(security.executeTask).not.toHaveBeenCalled();
    expect(security.handleEvent).not.toHaveBeenCalled();
  });
});
