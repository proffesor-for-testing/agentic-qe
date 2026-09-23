import { describe, expect, it, vi } from 'vitest';
import { handleTaskCompleted, handleTaskFailed, type QueenEventHandlerContext } from '../../../src/coordination/queen-event-handlers.js';
import { assignTaskToDomain, type QueenTaskContext } from '../../../src/coordination/queen-task-management.js';
import type { QueenTask, TaskExecution } from '../../../src/coordination/queen-types.js';
import { ok, type DomainEvent } from '../../../src/shared/types/index.js';

function cancelledContext(pending: boolean) {
  const taskId = 'cancelled-task';
  const execution = {
    taskId,
    task: {
      id: taskId, type: 'execute-tests', priority: 'p1', targetDomains: ['test-execution'],
      payload: {}, timeout: 10000, createdAt: new Date(),
    },
    status: 'cancelled',
    assignedAgents: [],
    retryCount: 0,
    completedAt: new Date(),
    cancellationResultPending: pending,
  } as TaskExecution;
  const context = {
    tasks: new Map([[taskId, execution]]),
    runningTaskCounter: pending ? 1 : 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    taskDurations: { push: vi.fn(), average: vi.fn(() => 0) },
    auditLogger: { logComplete: vi.fn(), logFail: vi.fn() },
    processQueue: vi.fn(async () => {}),
    enqueueTask: vi.fn(),
  };
  return { taskId, context };
}

function event(type: string, taskId: string): DomainEvent {
  return { type, payload: { taskId, result: { passed: 1 }, error: 'late failure' } } as DomainEvent;
}

describe('cancelled task event conservation', () => {
  it('ignores a late completion, including duplicate delivery', async () => {
    const { taskId, context } = cancelledContext(true);
    await handleTaskCompleted(context as unknown as QueenEventHandlerContext, event('TaskCompleted', taskId));
    expect(context.tasks.get(taskId)?.status).toBe('cancelled');
    expect(context.tasks.get(taskId)?.cancellationResultPending).toBe(false);
    expect(context.tasksCompleted).toBe(0);
    expect(context.runningTaskCounter).toBe(0);
    expect(context.auditLogger.logComplete).not.toHaveBeenCalled();
    expect(context.taskDurations.push).not.toHaveBeenCalled();
    expect(context.processQueue).toHaveBeenCalledTimes(1);

    await handleTaskCompleted(context as unknown as QueenEventHandlerContext, event('TaskCompleted', taskId));
    expect(context.tasksCompleted).toBe(0);
    expect(context.runningTaskCounter).toBe(0);
    expect(context.processQueue).toHaveBeenCalledTimes(1);
  });

  it('ignores a late failure instead of retrying a cancelled task', async () => {
    const { taskId, context } = cancelledContext(true);
    await handleTaskFailed(context as unknown as QueenEventHandlerContext, event('TaskFailed', taskId));
    expect(context.tasks.get(taskId)?.status).toBe('cancelled');
    expect(context.tasks.get(taskId)?.cancellationResultPending).toBe(false);
    expect(context.tasksFailed).toBe(0);
    expect(context.runningTaskCounter).toBe(0);
    expect(context.enqueueTask).not.toHaveBeenCalled();
    expect(context.auditLogger.logFail).not.toHaveBeenCalled();
    expect(context.processQueue).toHaveBeenCalledTimes(1);
  });

  it('never promotes a previously cancelled queued task', async () => {
    const { taskId, context } = cancelledContext(false);
    await handleTaskCompleted(context as unknown as QueenEventHandlerContext, event('TaskCompleted', taskId));
    expect(context.tasks.get(taskId)?.status).toBe('cancelled');
    expect(context.tasksCompleted).toBe(0);
    expect(context.runningTaskCounter).toBe(0);
    expect(context.processQueue).not.toHaveBeenCalled();
  });

  it('does not resurrect a queued task cancelled while agent spawn is pending', async () => {
    const task: QueenTask = {
      id: 'queued-during-spawn', type: 'execute-tests', priority: 'p1',
      targetDomains: ['test-execution'], payload: {}, timeout: 10000,
      createdAt: new Date(),
    };
    const execution = {
      taskId: task.id, task, status: 'queued', assignedAgents: [], retryCount: 0,
    } as TaskExecution;
    let releaseSpawn!: () => void;
    const spawnGate = new Promise<void>(resolve => { releaseSpawn = resolve; });
    const stop = vi.fn(async () => ok(undefined));
    const publishEvent = vi.fn(async () => {});
    const context = {
      tasks: new Map([[task.id, execution]]),
      runningTaskCounter: 1,
      tinyDancerRouter: null,
      domainBreakerRegistry: null,
      domainTeamManager: null,
      requestAgentSpawn: async () => { await spawnGate; return ok('new-agent'); },
      agentCoordinator: { stop },
      publishEvent,
    };

    const assignment = assignTaskToDomain(context as unknown as QueenTaskContext, task, 'test-execution');
    context.tasks.set(task.id, {
      ...execution, status: 'cancelled', cancellationResultPending: false,
    });
    releaseSpawn();

    expect((await assignment).success).toBe(true);
    expect(context.tasks.get(task.id)?.status).toBe('cancelled');
    expect(context.runningTaskCounter).toBe(0);
    expect(stop).toHaveBeenCalledWith('new-agent');
    expect(publishEvent).not.toHaveBeenCalled();
  });
});
