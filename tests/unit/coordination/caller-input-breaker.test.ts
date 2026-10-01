/**
 * #795: failures caused by invalid caller input are deterministic and say
 * nothing about a domain's health. They must not be retried and must not
 * count toward the ADR-064 domain circuit breaker; genuine failures still do.
 */

import { describe, expect, it, vi } from 'vitest';
import { handleTaskFailed, type QueenEventHandlerContext } from '../../../src/coordination/queen-event-handlers.js';
import { createDomainBreakerRegistry } from '../../../src/coordination/circuit-breaker/index.js';
import type { TaskExecution } from '../../../src/coordination/queen-types.js';
import type { DomainEvent } from '../../../src/shared/types/index.js';
import { CallerInputError, isCallerInputError } from '../../../src/shared/error-utils.js';

function context() {
  const registry = createDomainBreakerRegistry();
  const tasks = new Map<string, TaskExecution>();
  const ctx = {
    config: { taskRetryLimit: 3 },
    tasks,
    runningTaskCounter: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    taskDurations: { push: vi.fn(), average: vi.fn(() => 0) },
    auditLogger: { logComplete: vi.fn(), logFail: vi.fn() },
    domainBreakerRegistry: registry,
    traceCollector: null,
    taskTraceContexts: new Map(),
    taskCompletedHook: null,
    hypothesisManager: { createInvestigation: vi.fn(() => ({ id: 'inv' })), addHypothesis: vi.fn() },
    processQueue: vi.fn(async () => {}),
    enqueueTask: vi.fn(),
  };
  let seq = 0;
  const fail = async (payload: { error: string; callerError?: boolean }) => {
    const taskId = `task-${++seq}`;
    tasks.set(taskId, {
      taskId,
      task: {
        id: taskId, type: 'generate-tests', priority: 'p1', targetDomains: ['test-generation'],
        payload: {}, timeout: 10000, createdAt: new Date(),
      },
      status: 'running',
      assignedDomain: 'test-generation',
      assignedAgents: [],
      retryCount: 0,
    } as TaskExecution);
    ctx.runningTaskCounter++;
    await handleTaskFailed(ctx as unknown as QueenEventHandlerContext,
      { type: 'TaskFailed', payload: { taskId, ...payload } } as DomainEvent);
    return tasks.get(taskId)!;
  };
  return { ctx, registry, fail };
}

describe('#795 caller-input failures and the domain circuit breaker', () => {
  it('keeps the breaker closed after many caller-input failures, without retrying them', async () => {
    const { ctx, registry, fail } = context();

    for (let i = 0; i < 6; i++) {
      const execution = await fail({ error: 'Behavior example argument count does not match add', callerError: true });
      expect(execution.status).toBe('failed');
    }

    expect(registry.canExecuteInDomain('test-generation')).toBe(true);
    expect(registry.getBreaker('test-generation').getState()).toBe('closed');
    expect(ctx.enqueueTask).not.toHaveBeenCalled();
    expect(ctx.hypothesisManager.createInvestigation).not.toHaveBeenCalled();
    expect(ctx.tasksFailed).toBe(6);
    expect(ctx.auditLogger.logFail).toHaveBeenCalledTimes(6);
  });

  it('still opens the breaker and retries on genuine domain failures', async () => {
    const { ctx, registry, fail } = context();

    await fail({ error: 'SQLITE_BUSY: database is locked' });
    await fail({ error: 'SQLITE_BUSY: database is locked' });

    expect(registry.canExecuteInDomain('test-generation')).toBe(false);
    expect(ctx.enqueueTask).toHaveBeenCalledTimes(2);
  });

  it('recognises caller-input errors by class and by the serialisable marker', () => {
    expect(isCallerInputError(new CallerInputError('bad input'))).toBe(true);
    expect(isCallerInputError({ callerError: true, message: 'bad input' })).toBe(true);
    expect(isCallerInputError(new Error('bad input'))).toBe(false);
    expect(isCallerInputError(undefined)).toBe(false);
  });
});
