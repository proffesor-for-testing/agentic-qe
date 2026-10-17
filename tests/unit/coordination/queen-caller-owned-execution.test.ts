import { describe, expect, it, vi } from 'vitest';
import { loadState } from '../../../src/coordination/queen-lifecycle.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';
import type { TaskExecution, QueenTask } from '../../../src/coordination/queen-types.js';

function taskExecution(executionOwner?: 'queen' | 'caller'): TaskExecution {
  return { taskId: executionOwner ?? 'default', status: 'queued', assignedAgents: [], retryCount: 0,
    task: { id: executionOwner ?? 'default', type: 'execute-tests', priority: 'p1', targetDomains: ['test-execution'], payload: {}, timeout: 10000, createdAt: new Date(), ...(executionOwner ? { executionOwner } : {}) } };
}

describe('caller-owned queued task recovery (#1059)', () => {
  it('marks an interrupted caller-owned request failed instead of dispatching it without its caller', async () => {
    const execution = taskExecution('caller');
    const memory = { get: vi.fn(async () => ({ tasks: [[execution.taskId, execution]] })) } as unknown as MemoryBackend;
    const tasks = new Map<string, TaskExecution>();
    const enqueue = vi.fn<(task: QueenTask) => void>();
    await loadState(memory, tasks, enqueue);
    expect(enqueue).not.toHaveBeenCalled();
    expect(tasks.get(execution.taskId)).toMatchObject({ status: 'failed', error: expect.stringContaining('submit a new request'), completedAt: expect.any(Date) });
  });

  it('continues to enqueue ordinary Queen-owned tasks on recovery', async () => {
    for (const owner of [undefined, 'queen'] as const) {
      const execution = taskExecution(owner);
      const memory = { get: vi.fn(async () => ({ tasks: [[execution.taskId, execution]] })) } as unknown as MemoryBackend;
      const tasks = new Map<string, TaskExecution>();
      const enqueue = vi.fn<(task: QueenTask) => void>();
      await loadState(memory, tasks, enqueue);
      expect(enqueue).toHaveBeenCalledExactlyOnceWith(execution.task);
      expect(tasks.get(execution.taskId)?.status).toBe('queued');
    }
  });
});
