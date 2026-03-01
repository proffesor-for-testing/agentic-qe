/**
 * Unit tests for TeammateIdleHook
 * ADR-064, Phase 1B: Idle detection and auto-assignment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TeammateIdleHook,
  createTeammateIdleHook,
  type TaskQueue,
  type PendingTask,
  type IdleAction,
} from '../../src/hooks/teammate-idle-hook.js';

// ============================================================================
// Helpers
// ============================================================================

/** Build a PendingTask for tests */
function makeTask(overrides: Partial<PendingTask> = {}): PendingTask {
  return {
    id: overrides.id ?? `task-${Math.random().toString(36).slice(2, 6)}`,
    domain: overrides.domain ?? 'test-generation',
    priority: overrides.priority ?? 'p1',
    title: overrides.title ?? 'Sample task',
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

/** Create a mock TaskQueue */
function mockTaskQueue(tasks: PendingTask[] = [], claimResult = true): TaskQueue {
  return {
    getPendingTasks: vi.fn().mockResolvedValue(tasks),
    claimTask: vi.fn().mockResolvedValue(claimResult),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('TeammateIdleHook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- Construction ----------

  it('should construct with default config', () => {
    const hook = createTeammateIdleHook();
    const stats = hook.getStats();
    expect(stats.monitoredAgents).toBe(0);
    expect(stats.idleAgents).toBe(0);
    expect(stats.totalIdleEvents).toBe(0);
    hook.dispose();
  });

  // ---------- Start / Stop monitoring ----------

  it('should start monitoring an agent', () => {
    const hook = createTeammateIdleHook();
    hook.start('agent-1', 'test-generation');
    expect(hook.getStats().monitoredAgents).toBe(1);
    hook.dispose();
  });

  it('should stop monitoring an agent', () => {
    const hook = createTeammateIdleHook();
    hook.start('agent-1', 'test-generation');
    hook.stop('agent-1');
    expect(hook.getStats().monitoredAgents).toBe(0);
    hook.dispose();
  });

  it('should handle stopping a non-monitored agent gracefully', () => {
    const hook = createTeammateIdleHook();
    // Should not throw
    hook.stop('ghost-agent');
    hook.dispose();
  });

  // ---------- Activity recording ----------

  it('should reset idle timer on recordActivity', async () => {
    const hook = createTeammateIdleHook({ idleThresholdMs: 100 });
    hook.start('agent-1', 'dom');

    // Advance time past threshold
    vi.advanceTimersByTime(80);
    hook.recordActivity('agent-1');

    // Agent should NOT be idle yet because we just recorded activity
    vi.advanceTimersByTime(50);
    const result = await hook.checkIdle('agent-1');
    expect(result).toBeNull(); // not idle yet, only 50ms since activity
    hook.dispose();
  });

  // ---------- onIdle behavior ----------

  it('should return wait when autoAssign is false', async () => {
    const hook = createTeammateIdleHook({ autoAssign: false, idleThresholdMs: 10 });
    hook.start('agent-1', 'dom');

    const action = await hook.onIdle('agent-1');
    expect(action.action).toBe('wait');
    expect((action as { reason: string }).reason).toContain('auto-assign disabled');
    hook.dispose();
  });

  it('should return wait when no task queue is configured', async () => {
    const hook = createTeammateIdleHook({ autoAssign: true, idleThresholdMs: 10 });
    hook.start('agent-1', 'dom');

    const action = await hook.onIdle('agent-1');
    expect(action.action).toBe('wait');
    expect((action as { reason: string }).reason).toContain('no task queue');
    hook.dispose();
  });

  it('should claim a pending task and return assigned', async () => {
    const task = makeTask({ id: 'task-abc', domain: 'test-generation' });
    const queue = mockTaskQueue([task], true);
    const hook = new TeammateIdleHook(
      { autoAssign: true, idleThresholdMs: 10 },
      queue,
    );
    hook.start('agent-1', 'test-generation');

    const action = await hook.onIdle('agent-1');
    expect(action.action).toBe('assigned');
    expect((action as { taskId: string }).taskId).toBe('task-abc');
    expect(queue.claimTask).toHaveBeenCalledWith('task-abc', 'agent-1');
    hook.dispose();
  });

  it('should filter tasks by claimable domains', async () => {
    const t1 = makeTask({ domain: 'coverage-analysis' });
    const t2 = makeTask({ domain: 'security-compliance' });
    const queue = mockTaskQueue([t1, t2], true);

    const hook = new TeammateIdleHook(
      { autoAssign: true, idleThresholdMs: 10, claimableDomains: ['coverage-analysis'] },
      queue,
    );
    hook.start('agent-1', 'coverage-analysis');

    await hook.onIdle('agent-1');
    expect(queue.getPendingTasks).toHaveBeenCalledWith(
      expect.objectContaining({ domains: ['coverage-analysis'] }),
    );
    hook.dispose();
  });

  it('should respect minPriority filter', async () => {
    const p0 = makeTask({ priority: 'p0', id: 'high' });
    const p2 = makeTask({ priority: 'p2', id: 'low' });
    const p3 = makeTask({ priority: 'p3', id: 'lowest' });
    const queue = mockTaskQueue([p0, p2, p3], true);

    const hook = new TeammateIdleHook(
      { autoAssign: true, idleThresholdMs: 10, minPriority: 'p1' },
      queue,
    );
    hook.start('agent-1', 'dom');

    const action = await hook.onIdle('agent-1');
    // Only p0 meets the p1 threshold (p0 <= p1), p2 and p3 do not
    expect(action.action).toBe('assigned');
    expect((action as { taskId: string }).taskId).toBe('high');
    hook.dispose();
  });

  it('should prefer same-domain tasks when preferSameDomain is true', async () => {
    const other = makeTask({ domain: 'other', priority: 'p0', id: 'other-task', createdAt: 1 });
    const same = makeTask({ domain: 'my-domain', priority: 'p1', id: 'same-task', createdAt: 1 });
    const queue = mockTaskQueue([other, same], true);

    const hook = new TeammateIdleHook(
      { autoAssign: true, idleThresholdMs: 10, preferSameDomain: true },
      queue,
    );
    hook.start('agent-1', 'my-domain');

    const action = await hook.onIdle('agent-1');
    expect(action.action).toBe('assigned');
    // Same-domain task should be preferred despite lower priority
    expect((action as { taskId: string }).taskId).toBe('same-task');
    hook.dispose();
  });

  it('should return wait when no pending tasks exist', async () => {
    const queue = mockTaskQueue([], true);
    const hook = new TeammateIdleHook(
      { autoAssign: true, idleThresholdMs: 10 },
      queue,
    );
    hook.start('agent-1', 'dom');

    const action = await hook.onIdle('agent-1');
    expect(action.action).toBe('wait');
    expect((action as { reason: string }).reason).toContain('no pending tasks');
    hook.dispose();
  });

  it('should return wait when agent is not found', async () => {
    const hook = createTeammateIdleHook({ idleThresholdMs: 10 });
    const action = await hook.onIdle('ghost');
    expect(action.action).toBe('wait');
    expect((action as { reason: string }).reason).toContain('not found');
    hook.dispose();
  });

  // ---------- getIdleAgents ----------

  it('should return agents past the idle threshold', () => {
    const hook = createTeammateIdleHook({ idleThresholdMs: 100 });
    hook.start('a1', 'dom');
    hook.start('a2', 'dom');

    // Advance time past threshold
    vi.advanceTimersByTime(150);

    const idle = hook.getIdleAgents();
    expect(idle).toHaveLength(2);
    expect(idle[0].agentId).toBe('a1');
    expect(idle[0].idleSinceMs).toBeGreaterThanOrEqual(100);
    hook.dispose();
  });

  it('should not return agents below idle threshold', () => {
    const hook = createTeammateIdleHook({ idleThresholdMs: 1000 });
    hook.start('a1', 'dom');
    // No time advance
    const idle = hook.getIdleAgents();
    expect(idle).toHaveLength(0);
    hook.dispose();
  });

  // ---------- Stats ----------

  it('should return correct stats after operations', async () => {
    const queue = mockTaskQueue([], true);
    const hook = new TeammateIdleHook(
      { autoAssign: true, idleThresholdMs: 10 },
      queue,
    );
    hook.start('a1', 'dom');
    vi.advanceTimersByTime(20);

    await hook.onIdle('a1'); // wait (no tasks)

    const stats = hook.getStats();
    expect(stats.monitoredAgents).toBe(1);
    expect(stats.totalIdleEvents).toBe(1);
    expect(stats.totalWaits).toBe(1);
    expect(stats.totalAssigned).toBe(0);
    hook.dispose();
  });

  // ---------- Dispose ----------

  it('should clean up intervals on dispose', () => {
    const hook = createTeammateIdleHook({ idleThresholdMs: 100 });
    hook.start('a1', 'dom');
    hook.dispose();
    expect(hook.getStats().monitoredAgents).toBe(0);
  });

  // ---------- Callbacks ----------

  it('should fire idle callback on idle events', async () => {
    const cb = vi.fn();
    const hook = createTeammateIdleHook({ autoAssign: false, idleThresholdMs: 10 });
    hook.onIdleCallback(cb);
    hook.start('a1', 'dom');

    await hook.onIdle('a1');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('a1', expect.objectContaining({ action: 'wait' }));
    hook.dispose();
  });

  it('should fire assign callback on successful assignment', async () => {
    const assignCb = vi.fn();
    const task = makeTask({ id: 'task-xyz', domain: 'dom' });
    const queue = mockTaskQueue([task], true);
    const hook = new TeammateIdleHook(
      { autoAssign: true, idleThresholdMs: 10 },
      queue,
    );
    hook.onAssignCallback(assignCb);
    hook.start('a1', 'dom');

    await hook.onIdle('a1');
    expect(assignCb).toHaveBeenCalledTimes(1);
    expect(assignCb).toHaveBeenCalledWith('a1', 'task-xyz', 'dom');
    hook.dispose();
  });
});
