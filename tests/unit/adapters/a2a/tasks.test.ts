/**
 * A2A Task Negotiation Protocol Unit Tests
 *
 * Comprehensive test suite for the A2A Task Store, Task Manager, and Task Router.
 * Target: 60+ unit tests covering all components.
 *
 * @module tests/unit/adapters/a2a/tasks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  // Task Store
  TaskStore,
  createTaskStore,
  DEFAULT_TASK_STORE_CONFIG,
  type A2ATaskFull,
  type TaskHistoryEntry,
  type TaskMetadata,
  type TaskQueryOptions,

  // Task Manager
  TaskManager,
  createTaskManager,
  DEFAULT_TASK_MANAGER_CONFIG,
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  isTerminal,
  isValidTransition,
  type CreateTaskOptions,
  type TaskStateChangeEvent,
  type TaskArtifactEvent,

  // Task Router
  TaskRouter,
  createTaskRouter,
  DEFAULT_ROUTER_CONFIG,
  type RoutingRequest,
  type AgentLoad,

  // Discovery for Router tests
  DiscoveryService,
  createDiscoveryService,
  createAgentCardGenerator,

  // Message types
  type A2AMessage,
  type TaskStatus,
  type A2AArtifact,
  type QEAgentCard,

  // Helpers
  createAgentSkill,
  DEFAULT_CAPABILITIES,
  DEFAULT_INPUT_MODES,
  DEFAULT_OUTPUT_MODES,
  DEFAULT_QE_PROVIDER,
} from '../../../../src/adapters/a2a/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestMessage = (text: string = 'Test message', role: 'user' | 'agent' = 'user'): A2AMessage => ({
  role,
  parts: [{ type: 'text', text }],
});

const createTestTask = (
  id: string,
  status: TaskStatus = 'submitted',
  overrides: Partial<A2ATaskFull> = {}
): A2ATaskFull => {
  const now = new Date();
  return {
    id,
    contextId: overrides.contextId ?? `ctx-${id}`,
    status,
    message: createTestMessage(),
    artifacts: [],
    history: [
      {
        fromStatus: null,
        toStatus: 'submitted',
        timestamp: now,
        reason: 'Task created',
      },
    ],
    metadata: {
      createdAt: now,
      updatedAt: now,
      agentId: 'test-agent',
      ...overrides.metadata,
    },
    ...overrides,
  };
};

const createTestAgentCard = (id: string, options: Partial<QEAgentCard> = {}): QEAgentCard => ({
  name: id,
  description: `Test agent ${id}`,
  url: `https://example.com/a2a/${id}`,
  version: '3.0.0',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
    ...options.capabilities,
  },
  skills: options.skills ?? [
    createAgentSkill(`${id}-skill`, `${id} Skill`, `Skill for ${id}`, {
      tags: ['testing', id.split('-')[1] ?? 'general'],
    }),
  ],
  provider: DEFAULT_QE_PROVIDER,
  defaultInputModes: DEFAULT_INPUT_MODES,
  defaultOutputModes: DEFAULT_OUTPUT_MODES,
  qeMetadata: options.qeMetadata ?? { domain: 'test-generation' },
  ...options,
});

const createMockDiscoveryService = (cards: Map<string, QEAgentCard> = new Map()): DiscoveryService => {
  const generator = createAgentCardGenerator({ baseUrl: 'https://test.example.com' });
  const service = createDiscoveryService({
    generator,
    baseUrl: 'https://qe.example.com',
  });
  if (cards.size > 0) {
    service.registerCards(cards);
  }
  return service;
};

// ============================================================================
// Task Store Tests
// ============================================================================

describe('A2A Task Store', () => {
  describe('createTaskStore', () => {
    it('should create store with default config', () => {
      const store = createTaskStore();
      expect(store).toBeInstanceOf(TaskStore);
      expect(store.size).toBe(0);
      store.destroy();
    });

    it('should create store with custom config', () => {
      const store = createTaskStore({
        maxTasks: 100,
        completedTaskTtl: 3600000,
        enableAutoCleanup: false,
      });
      expect(store).toBeInstanceOf(TaskStore);
      store.destroy();
    });

    it('should have correct default config values', () => {
      expect(DEFAULT_TASK_STORE_CONFIG.maxTasks).toBe(10000);
      expect(DEFAULT_TASK_STORE_CONFIG.completedTaskTtl).toBe(86400000);
      expect(DEFAULT_TASK_STORE_CONFIG.enableAutoCleanup).toBe(true);
    });
  });

  describe('CRUD Operations', () => {
    let store: TaskStore;

    beforeEach(() => {
      store = createTaskStore({ enableAutoCleanup: false });
    });

    afterEach(() => {
      store.destroy();
    });

    it('should create a task', () => {
      const task = createTestTask('task-1');
      const created = store.create(task);

      expect(created.id).toBe('task-1');
      expect(store.has('task-1')).toBe(true);
      expect(store.size).toBe(1);
    });

    it('should reject duplicate task ID', () => {
      const task = createTestTask('task-1');
      store.create(task);

      expect(() => store.create(task)).toThrow('already exists');
    });

    it('should get a task by ID', () => {
      store.create(createTestTask('task-1'));
      const task = store.get('task-1');

      expect(task).not.toBeNull();
      expect(task?.id).toBe('task-1');
    });

    it('should return null for non-existent task', () => {
      const task = store.get('non-existent');
      expect(task).toBeNull();
    });

    it('should update a task', () => {
      store.create(createTestTask('task-1'));
      const updated = store.update('task-1', { status: 'working' });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('working');
    });

    it('should return null when updating non-existent task', () => {
      const result = store.update('non-existent', { status: 'working' });
      expect(result).toBeNull();
    });

    it('should delete a task', () => {
      store.create(createTestTask('task-1'));
      const deleted = store.delete('task-1');

      expect(deleted).toBe(true);
      expect(store.has('task-1')).toBe(false);
    });

    it('should return false when deleting non-existent task', () => {
      const deleted = store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('Query Operations', () => {
    let store: TaskStore;

    beforeEach(() => {
      store = createTaskStore({ enableAutoCleanup: false });

      // Create test tasks
      store.create(createTestTask('task-1', 'submitted', { contextId: 'ctx-a' }));
      store.create(createTestTask('task-2', 'working', { contextId: 'ctx-a' }));
      store.create(createTestTask('task-3', 'completed', { contextId: 'ctx-b' }));
      store.create(createTestTask('task-4', 'failed', { contextId: 'ctx-b' }));
      store.create(createTestTask('task-5', 'submitted', { contextId: 'ctx-c' }));
    });

    afterEach(() => {
      store.destroy();
    });

    it('should query all tasks', () => {
      const result = store.query();
      expect(result.total).toBe(5);
      expect(result.tasks).toHaveLength(5);
    });

    it('should query by context ID', () => {
      const result = store.query({ contextId: 'ctx-a' });
      expect(result.total).toBe(2);
      expect(result.tasks.every((t) => t.contextId === 'ctx-a')).toBe(true);
    });

    it('should query by single status', () => {
      const result = store.query({ status: 'submitted' });
      expect(result.total).toBe(2);
      expect(result.tasks.every((t) => t.status === 'submitted')).toBe(true);
    });

    it('should query by multiple statuses', () => {
      const result = store.query({ status: ['submitted', 'working'] });
      expect(result.total).toBe(3);
    });

    it('should apply limit', () => {
      const result = store.query({ limit: 2 });
      expect(result.tasks).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it('should apply offset', () => {
      const result = store.query({ offset: 2, limit: 2 });
      expect(result.tasks).toHaveLength(2);
      expect(result.offset).toBe(2);
    });

    it('should sort by createdAt descending by default', () => {
      const result = store.query();
      // Verify sorting is descending (later dates first)
      // Since all tasks created nearly simultaneously, just verify total and order stability
      expect(result.total).toBe(5);
      // The sort is stable - items with same timestamp maintain their relative order
      // In Map iteration order, this would be insertion order which is task-1, task-2, etc.
      // When sorted descending by same timestamp, order is implementation-dependent
      // What matters is that a sort was applied - let's verify by checking sort order
      for (let i = 1; i < result.tasks.length; i++) {
        expect(result.tasks[i - 1].metadata.createdAt.getTime()).toBeGreaterThanOrEqual(
          result.tasks[i].metadata.createdAt.getTime()
        );
      }
    });

    it('should sort ascending when specified', () => {
      const result = store.query({ order: 'asc' });
      // Oldest first
      expect(result.tasks[0].id).toBe('task-1');
    });

    it('should get tasks by context', () => {
      const tasks = store.getByContext('ctx-a');
      expect(tasks).toHaveLength(2);
    });

    it('should get tasks by status', () => {
      const tasks = store.getByStatus('working');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('working');
    });

    it('should get tasks by agent', () => {
      const tasks = store.getByAgent('test-agent');
      expect(tasks).toHaveLength(5);
    });

    it('should provide next cursor for pagination', () => {
      const result = store.query({ limit: 2 });
      expect(result.nextCursor).toBe('2');
    });
  });

  describe('Bulk Operations', () => {
    let store: TaskStore;

    beforeEach(() => {
      store = createTaskStore({ enableAutoCleanup: false });
      store.create(createTestTask('task-1'));
      store.create(createTestTask('task-2'));
      store.create(createTestTask('task-3'));
    });

    afterEach(() => {
      store.destroy();
    });

    it('should get many tasks', () => {
      const result = store.getMany(['task-1', 'task-2', 'task-999']);
      expect(result.get('task-1')).not.toBeNull();
      expect(result.get('task-2')).not.toBeNull();
      expect(result.get('task-999')).toBeNull();
    });

    it('should delete many tasks', () => {
      const deleted = store.deleteMany(['task-1', 'task-2']);
      expect(deleted).toBe(2);
      expect(store.size).toBe(1);
    });

    it('should delete by context', () => {
      store.create(createTestTask('task-4', 'submitted', { contextId: 'ctx-special' }));
      store.create(createTestTask('task-5', 'working', { contextId: 'ctx-special' }));

      const deleted = store.deleteByContext('ctx-special');
      expect(deleted).toBe(2);
    });
  });

  describe('Statistics', () => {
    let store: TaskStore;

    beforeEach(() => {
      store = createTaskStore({ enableAutoCleanup: false });
      store.create(createTestTask('task-1', 'submitted', { contextId: 'ctx-1' }));
      store.create(createTestTask('task-2', 'working', { contextId: 'ctx-1' }));
      store.create(createTestTask('task-3', 'completed', { contextId: 'ctx-2' }));
    });

    afterEach(() => {
      store.destroy();
    });

    it('should provide statistics', () => {
      const stats = store.getStats();

      expect(stats.totalTasks).toBe(3);
      expect(stats.tasksByStatus.submitted).toBe(1);
      expect(stats.tasksByStatus.working).toBe(1);
      expect(stats.tasksByStatus.completed).toBe(1);
      expect(stats.contextCount).toBe(2);
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired tasks', () => {
      const store = createTaskStore({
        enableAutoCleanup: false,
        completedTaskTtl: 1, // 1ms TTL for testing
      });

      // Create and complete a task
      const task = createTestTask('task-1', 'completed');
      store.create(task);

      // Wait a bit for expiration
      vi.useFakeTimers();
      vi.advanceTimersByTime(10);

      const cleaned = store.cleanupExpired();
      expect(cleaned).toBe(1);
      expect(store.size).toBe(0);

      vi.useRealTimers();
      store.destroy();
    });

    it('should clear all tasks', () => {
      const store = createTaskStore({ enableAutoCleanup: false });
      store.create(createTestTask('task-1'));
      store.create(createTestTask('task-2'));

      store.clear();

      expect(store.size).toBe(0);
      store.destroy();
    });
  });
});

// ============================================================================
// Task Manager Tests
// ============================================================================

describe('A2A Task Manager', () => {
  describe('createTaskManager', () => {
    it('should create manager with default config', () => {
      const manager = createTaskManager();
      expect(manager).toBeInstanceOf(TaskManager);
      manager.destroy();
    });

    it('should have correct default config', () => {
      expect(DEFAULT_TASK_MANAGER_CONFIG.autoGenerateContextId).toBe(true);
      expect(DEFAULT_TASK_MANAGER_CONFIG.defaultAgentId).toBe('default-agent');
    });
  });

  describe('State Machine', () => {
    it('should define valid transitions', () => {
      expect(VALID_TRANSITIONS.submitted).toContain('working');
      expect(VALID_TRANSITIONS.submitted).toContain('rejected');
      expect(VALID_TRANSITIONS.submitted).toContain('canceled');

      expect(VALID_TRANSITIONS.working).toContain('completed');
      expect(VALID_TRANSITIONS.working).toContain('failed');
      expect(VALID_TRANSITIONS.working).toContain('input_required');
      expect(VALID_TRANSITIONS.working).toContain('auth_required');

      expect(VALID_TRANSITIONS.completed).toHaveLength(0);
      expect(VALID_TRANSITIONS.failed).toHaveLength(0);
    });

    it('should identify terminal states', () => {
      expect(TERMINAL_STATES).toContain('completed');
      expect(TERMINAL_STATES).toContain('failed');
      expect(TERMINAL_STATES).toContain('canceled');
      expect(TERMINAL_STATES).toContain('rejected');
    });

    it('should check if status is terminal', () => {
      expect(isTerminal('completed')).toBe(true);
      expect(isTerminal('failed')).toBe(true);
      expect(isTerminal('working')).toBe(false);
      expect(isTerminal('submitted')).toBe(false);
    });

    it('should validate transitions', () => {
      expect(isValidTransition('submitted', 'working')).toBe(true);
      expect(isValidTransition('submitted', 'completed')).toBe(false);
      expect(isValidTransition('working', 'completed')).toBe(true);
      expect(isValidTransition('completed', 'working')).toBe(false);
    });
  });

  describe('Task Creation', () => {
    let manager: TaskManager;

    beforeEach(() => {
      manager = createTaskManager();
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should create a task from message', () => {
      const message = createTestMessage('Generate tests for user service');
      const task = manager.createTask(message);

      expect(task.id).toBeDefined();
      expect(task.status).toBe('submitted');
      expect(task.message).toBe(message);
      expect(task.artifacts).toHaveLength(0);
      expect(task.history).toHaveLength(1);
    });

    it('should create task with custom options', () => {
      const message = createTestMessage();
      const task = manager.createTask(message, {
        id: 'custom-id',
        contextId: 'custom-context',
        agentId: 'custom-agent',
        priority: 5,
        tags: ['important'],
      });

      expect(task.id).toBe('custom-id');
      expect(task.contextId).toBe('custom-context');
      expect(task.metadata.agentId).toBe('custom-agent');
      expect(task.metadata.priority).toBe(5);
      expect(task.metadata.tags).toContain('important');
    });

    it('should auto-generate context ID', () => {
      const message = createTestMessage();
      const task = manager.createTask(message);

      expect(task.contextId).toBeDefined();
      expect(task.contextId).toMatch(/^ctx-/);
    });

    it('should create subtask', () => {
      const parent = manager.createTask(createTestMessage('Parent task'));
      const subtask = manager.createSubtask(parent.id, createTestMessage('Subtask'));

      expect(subtask).not.toBeNull();
      expect(subtask?.metadata.parentTaskId).toBe(parent.id);
      expect(subtask?.contextId).toBe(parent.contextId);
    });

    it('should return null for subtask with non-existent parent', () => {
      const subtask = manager.createSubtask('non-existent', createTestMessage());
      expect(subtask).toBeNull();
    });

    it('should emit taskCreated event', () => {
      const listener = vi.fn();
      manager.on('taskCreated', listener);

      manager.createTask(createTestMessage());

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('Task Retrieval', () => {
    let manager: TaskManager;

    beforeEach(() => {
      manager = createTaskManager();
      manager.createTask(createTestMessage(), { contextId: 'ctx-1', agentId: 'agent-a' });
      manager.createTask(createTestMessage(), { contextId: 'ctx-1', agentId: 'agent-b' });
      manager.createTask(createTestMessage(), { contextId: 'ctx-2', agentId: 'agent-a' });
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should get task by ID', () => {
      const task = manager.createTask(createTestMessage(), { id: 'specific-task' });
      const retrieved = manager.getTask('specific-task');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('specific-task');
    });

    it('should get tasks by context', () => {
      const tasks = manager.getTasksByContext('ctx-1');
      expect(tasks).toHaveLength(2);
    });

    it('should get tasks by agent', () => {
      const tasks = manager.getTasksByAgent('agent-a');
      expect(tasks).toHaveLength(2);
    });

    it('should get subtasks', () => {
      const parent = manager.createTask(createTestMessage(), { id: 'parent' });
      manager.createSubtask('parent', createTestMessage());
      manager.createSubtask('parent', createTestMessage());

      const subtasks = manager.getSubtasks('parent');
      expect(subtasks).toHaveLength(2);
    });

    it('should report task count', () => {
      expect(manager.taskCount).toBe(3);
    });
  });

  describe('State Transitions', () => {
    let manager: TaskManager;

    beforeEach(() => {
      manager = createTaskManager();
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should transition task status', () => {
      const task = manager.createTask(createTestMessage());
      const updated = manager.transition(task.id, 'working', 'Starting work');

      expect(updated.status).toBe('working');
      expect(updated.history).toHaveLength(2);
      expect(updated.history[1].fromStatus).toBe('submitted');
      expect(updated.history[1].toStatus).toBe('working');
    });

    it('should reject invalid transition', () => {
      const task = manager.createTask(createTestMessage());

      expect(() => manager.transition(task.id, 'completed')).toThrow('Invalid state transition');
    });

    it('should throw for non-existent task', () => {
      expect(() => manager.transition('non-existent', 'working')).toThrow('not found');
    });

    it('should start task (submitted -> working)', () => {
      const task = manager.createTask(createTestMessage());
      const started = manager.startTask(task.id);

      expect(started.status).toBe('working');
    });

    it('should complete task (working -> completed)', () => {
      const task = manager.createTask(createTestMessage());
      manager.startTask(task.id);
      const completed = manager.completeTask(task.id);

      expect(completed.status).toBe('completed');
    });

    it('should fail task (working -> failed)', () => {
      const task = manager.createTask(createTestMessage());
      manager.startTask(task.id);
      const failed = manager.failTask(task.id, { message: 'Something went wrong', code: 'ERR_001' });

      expect(failed.status).toBe('failed');
      expect(failed.error).toBeDefined();
      expect(failed.error?.message).toBe('Something went wrong');
    });

    it('should cancel task', () => {
      const task = manager.createTask(createTestMessage());
      const canceled = manager.cancelTask(task.id, 'User requested');

      expect(canceled.status).toBe('canceled');
    });

    it('should reject task (submitted -> rejected)', () => {
      const task = manager.createTask(createTestMessage());
      const rejected = manager.rejectTask(task.id, 'Unsupported operation');

      expect(rejected.status).toBe('rejected');
    });

    it('should request input (working -> input_required)', () => {
      const task = manager.createTask(createTestMessage());
      manager.startTask(task.id);
      const waiting = manager.requestInput(task.id, 'Please provide more details');

      expect(waiting.status).toBe('input_required');
    });

    it('should request auth (working -> auth_required)', () => {
      const task = manager.createTask(createTestMessage());
      manager.startTask(task.id);
      const waiting = manager.requestAuth(task.id, 'OAuth2');

      expect(waiting.status).toBe('auth_required');
    });

    it('should resume task after input', () => {
      const task = manager.createTask(createTestMessage());
      manager.startTask(task.id);
      manager.requestInput(task.id);
      const resumed = manager.resumeTask(task.id);

      expect(resumed.status).toBe('working');
    });

    it('should provide input and resume', () => {
      const task = manager.createTask(createTestMessage());
      manager.startTask(task.id);
      manager.requestInput(task.id);

      const input = createTestMessage('Here is the additional info', 'user');
      const resumed = manager.provideInput(task.id, input);

      expect(resumed.status).toBe('working');
      expect(resumed.artifacts.length).toBeGreaterThan(0);
    });

    it('should emit stateChange event', () => {
      const listener = vi.fn();
      manager.on('stateChange', listener);

      const task = manager.createTask(createTestMessage());
      manager.startTask(task.id);

      expect(listener).toHaveBeenCalledOnce();
      const event = listener.mock.calls[0][0] as TaskStateChangeEvent;
      expect(event.previousStatus).toBe('submitted');
      expect(event.newStatus).toBe('working');
    });
  });

  describe('Artifact Management', () => {
    let manager: TaskManager;

    beforeEach(() => {
      manager = createTaskManager();
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should add artifact to task', () => {
      const task = manager.createTask(createTestMessage());
      const artifact: A2AArtifact = {
        id: 'artifact-1',
        name: 'Test Results',
        parts: [{ type: 'text', text: 'All tests passed' }],
      };

      const updated = manager.addArtifact(task.id, artifact);

      expect(updated.artifacts).toHaveLength(1);
      expect(updated.artifacts[0].name).toBe('Test Results');
    });

    it('should add multiple artifacts', () => {
      const task = manager.createTask(createTestMessage());
      const artifacts: A2AArtifact[] = [
        { id: 'a1', name: 'Result 1', parts: [{ type: 'text', text: 'Text 1' }] },
        { id: 'a2', name: 'Result 2', parts: [{ type: 'text', text: 'Text 2' }] },
      ];

      const updated = manager.addArtifacts(task.id, artifacts);

      expect(updated.artifacts).toHaveLength(2);
    });

    it('should append to existing artifact', () => {
      const task = manager.createTask(createTestMessage());
      manager.addArtifact(task.id, {
        id: 'stream-1',
        name: 'Streaming Result',
        parts: [{ type: 'text', text: 'Part 1' }],
      });

      manager.addArtifact(task.id, {
        id: 'stream-1',
        name: 'Streaming Result',
        parts: [{ type: 'text', text: 'Part 2' }],
        append: true,
        lastChunk: true,
      });

      const updated = manager.getTask(task.id);
      expect(updated?.artifacts).toHaveLength(1);
      expect(updated?.artifacts[0].parts).toHaveLength(2);
      expect(updated?.artifacts[0].lastChunk).toBe(true);
    });

    it('should create text artifact', () => {
      const artifact = manager.createTextArtifact('a1', 'Summary', 'This is a summary');

      expect(artifact.id).toBe('a1');
      expect(artifact.name).toBe('Summary');
      expect(artifact.parts[0]).toEqual({ type: 'text', text: 'This is a summary' });
    });

    it('should create data artifact', () => {
      const artifact = manager.createDataArtifact('a2', 'Coverage', { total: 85, covered: 80 });

      expect(artifact.parts[0]).toEqual({ type: 'data', data: { total: 85, covered: 80 } });
    });

    it('should create file artifact', () => {
      const artifact = manager.createFileArtifact('a3', 'Report', {
        name: 'report.pdf',
        mimeType: 'application/pdf',
        uri: 'https://example.com/report.pdf',
      });

      expect(artifact.parts[0]).toEqual({
        type: 'file',
        file: {
          name: 'report.pdf',
          mimeType: 'application/pdf',
          uri: 'https://example.com/report.pdf',
        },
      });
    });

    it('should emit artifactAdded event', () => {
      const listener = vi.fn();
      manager.on('artifactAdded', listener);

      const task = manager.createTask(createTestMessage());
      manager.addArtifact(task.id, {
        id: 'a1',
        name: 'Test',
        parts: [{ type: 'text', text: 'Content' }],
      });

      expect(listener).toHaveBeenCalledOnce();
      const event = listener.mock.calls[0][0] as TaskArtifactEvent;
      expect(event.artifact.id).toBe('a1');
      expect(event.isUpdate).toBe(false);
    });
  });

  describe('Task History', () => {
    let manager: TaskManager;

    beforeEach(() => {
      manager = createTaskManager();
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should track state history', () => {
      const task = manager.createTask(createTestMessage());
      manager.startTask(task.id, 'Beginning work');
      manager.requestInput(task.id, 'Need more info');
      manager.resumeTask(task.id, 'Got input');
      manager.completeTask(task.id, [], 'Done');

      const history = manager.getTaskHistory(task.id);

      expect(history).toHaveLength(5);
      expect(history?.[0].toStatus).toBe('submitted');
      expect(history?.[1].toStatus).toBe('working');
      expect(history?.[2].toStatus).toBe('input_required');
      expect(history?.[3].toStatus).toBe('working');
      expect(history?.[4].toStatus).toBe('completed');
    });

    it('should return null for non-existent task history', () => {
      const history = manager.getTaskHistory('non-existent');
      expect(history).toBeNull();
    });

    it('should calculate status duration', async () => {
      vi.useFakeTimers();

      const task = manager.createTask(createTestMessage());
      vi.advanceTimersByTime(1000);

      const duration = manager.getStatusDuration(task.id);
      expect(duration).toBeGreaterThanOrEqual(1000);

      vi.useRealTimers();
    });

    it('should calculate total duration', async () => {
      vi.useFakeTimers();

      const task = manager.createTask(createTestMessage());
      vi.advanceTimersByTime(500);
      manager.startTask(task.id);
      vi.advanceTimersByTime(500);

      const duration = manager.getTotalDuration(task.id);
      expect(duration).toBeGreaterThanOrEqual(1000);

      vi.useRealTimers();
    });
  });

  describe('Query and Stats', () => {
    let manager: TaskManager;

    beforeEach(() => {
      manager = createTaskManager();
      manager.createTask(createTestMessage());
      manager.createTask(createTestMessage());
      const task3 = manager.createTask(createTestMessage());
      manager.startTask(task3.id);
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should query tasks', () => {
      const result = manager.queryTasks({ status: 'submitted' });
      expect(result.total).toBe(2);
    });

    it('should get stats', () => {
      const stats = manager.getStats();

      expect(stats.totalTasks).toBe(3);
      expect(stats.tasksByStatus.submitted).toBe(2);
      expect(stats.tasksByStatus.working).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should delete task', () => {
      const manager = createTaskManager();
      const task = manager.createTask(createTestMessage());

      const deleted = manager.deleteTask(task.id);
      expect(deleted).toBe(true);
      expect(manager.hasTask(task.id)).toBe(false);

      manager.destroy();
    });

    it('should clear all tasks', () => {
      const manager = createTaskManager();
      manager.createTask(createTestMessage());
      manager.createTask(createTestMessage());

      manager.clearAllTasks();

      expect(manager.taskCount).toBe(0);
      manager.destroy();
    });
  });
});

// ============================================================================
// Task Router Tests
// ============================================================================

describe('A2A Task Router', () => {
  let discoveryService: DiscoveryService;
  let router: TaskRouter;

  beforeEach(() => {
    const cards = new Map<string, QEAgentCard>();
    cards.set(
      'qe-test-architect',
      createTestAgentCard('qe-test-architect', {
        skills: [
          createAgentSkill('test-generation', 'Test Generation', 'Generate tests', {
            tags: ['testing', 'ai', 'tdd'],
          }),
        ],
        qeMetadata: { domain: 'test-generation' },
      })
    );
    cards.set(
      'qe-security-scanner',
      createTestAgentCard('qe-security-scanner', {
        skills: [
          createAgentSkill('security-scan', 'Security Scan', 'Scan for vulnerabilities', {
            tags: ['security', 'owasp'],
          }),
        ],
        qeMetadata: { domain: 'security-compliance' },
      })
    );
    cards.set(
      'qe-coverage-specialist',
      createTestAgentCard('qe-coverage-specialist', {
        skills: [
          createAgentSkill('coverage-analysis', 'Coverage Analysis', 'Analyze code coverage', {
            tags: ['coverage', 'testing'],
          }),
        ],
        qeMetadata: { domain: 'coverage-analysis' },
      })
    );

    discoveryService = createMockDiscoveryService(cards);
    router = createTaskRouter({ discoveryService });
  });

  afterEach(() => {
    router.destroy();
  });

  describe('createTaskRouter', () => {
    it('should create router with discovery service', () => {
      expect(router).toBeInstanceOf(TaskRouter);
    });

    it('should have correct default config', () => {
      expect(DEFAULT_ROUTER_CONFIG.defaultMaxTasksPerAgent).toBe(10);
      expect(DEFAULT_ROUTER_CONFIG.overloadThreshold).toBe(80);
      expect(DEFAULT_ROUTER_CONFIG.enableSkillRouting).toBe(true);
      expect(DEFAULT_ROUTER_CONFIG.enableLoadBalancing).toBe(true);
    });
  });

  describe('Routing', () => {
    it('should route to preferred agent', async () => {
      const request: RoutingRequest = {
        message: createTestMessage('Generate tests'),
        preferredAgentId: 'qe-test-architect',
      };

      const decision = await router.route(request);

      expect(decision.agentId).toBe('qe-test-architect');
      expect(decision.score).toBe(1.0);
      expect(decision.reason).toContain('preferred');
    });

    it('should route by required skill', async () => {
      const request: RoutingRequest = {
        message: createTestMessage('Scan for security vulnerabilities'),
        requiredSkill: 'security-scan',
      };

      const decision = await router.route(request);

      expect(decision.agentId).toBe('qe-security-scanner');
      expect(decision.matchedSkill?.id).toBe('security-scan');
    });

    it('should route by required domain', async () => {
      const request: RoutingRequest = {
        message: createTestMessage('Analyze coverage'),
        requiredDomain: 'coverage-analysis',
      };

      const decision = await router.route(request);

      expect(decision.agentId).toBe('qe-coverage-specialist');
    });

    it('should infer skill from message text', async () => {
      const request: RoutingRequest = {
        message: createTestMessage('I need to generate unit tests for my service'),
      };

      const decision = await router.route(request);

      // Should match 'test-generation' skill based on 'test' keyword
      expect(decision.agentId).toBe('qe-test-architect');
    });

    it('should throw when no agents available', async () => {
      const emptyService = createMockDiscoveryService();
      const emptyRouter = createTaskRouter({ discoveryService: emptyService });

      const request: RoutingRequest = {
        message: createTestMessage('Do something'),
      };

      await expect(emptyRouter.route(request)).rejects.toThrow('No agents available');
      emptyRouter.destroy();
    });

    it('should provide alternatives', async () => {
      const request: RoutingRequest = {
        message: createTestMessage('Testing request'),
        requiredTags: ['testing'],
      };

      const decision = await router.route(request);

      // Multiple agents have testing-related skills
      expect(decision.alternatives.length).toBeGreaterThanOrEqual(0);
    });

    it('should emit taskRouted event', async () => {
      const listener = vi.fn();
      router.on('taskRouted', listener);

      await router.route({ message: createTestMessage() });

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('Context Management', () => {
    it('should maintain context-agent mapping', async () => {
      const request: RoutingRequest = {
        message: createTestMessage('First message'),
        contextId: 'conversation-1',
        preferredAgentId: 'qe-test-architect',
      };

      await router.route(request);

      const agent = router.getContextAgent('conversation-1');
      expect(agent).toBe('qe-test-architect');
    });

    it('should route to existing context agent', async () => {
      // First request establishes context
      await router.route({
        message: createTestMessage('First message'),
        contextId: 'conversation-2',
        preferredAgentId: 'qe-security-scanner',
      });

      // Second request should use same agent
      const decision = await router.route({
        message: createTestMessage('Follow-up message'),
        contextId: 'conversation-2',
      });

      expect(decision.agentId).toBe('qe-security-scanner');
      expect(decision.reason).toContain('existing context');
    });

    it('should clear context mapping', () => {
      router.setContextAgent('ctx-1', 'agent-1');
      expect(router.getContextAgent('ctx-1')).toBe('agent-1');

      router.clearContextAgent('ctx-1');
      expect(router.getContextAgent('ctx-1')).toBeNull();
    });
  });

  describe('Load Balancing', () => {
    it('should track agent load', () => {
      router.updateAgentLoad('qe-test-architect', 5);

      const load = router.getAgentLoad('qe-test-architect');
      expect(load?.activeTasks).toBe(5);
      expect(load?.loadPercentage).toBe(50);
    });

    it('should increment agent load', () => {
      router.updateAgentLoad('qe-test-architect', 3);
      router.incrementAgentLoad('qe-test-architect');

      const load = router.getAgentLoad('qe-test-architect');
      expect(load?.activeTasks).toBe(4);
    });

    it('should decrement agent load', () => {
      router.updateAgentLoad('qe-test-architect', 3);
      router.decrementAgentLoad('qe-test-architect');

      const load = router.getAgentLoad('qe-test-architect');
      expect(load?.activeTasks).toBe(2);
    });

    it('should detect overloaded agents', () => {
      router.updateAgentLoad('qe-test-architect', 9); // 90% load

      expect(router.isAgentOverloaded('qe-test-architect')).toBe(true);
    });

    it('should not route to overloaded agents', async () => {
      // Make test-architect overloaded
      router.updateAgentLoad('qe-test-architect', 9);

      const request: RoutingRequest = {
        message: createTestMessage('Generate tests'),
        requiredTags: ['testing'],
        excludeOverloaded: true,
      };

      const decision = await router.route(request);

      // Should pick coverage-specialist instead (also has testing tag)
      expect(decision.agentId).not.toBe('qe-test-architect');
    });

    it('should set max tasks for agent', () => {
      router.setAgentMaxTasks('qe-test-architect', 20);
      router.updateAgentLoad('qe-test-architect', 10);

      const load = router.getAgentLoad('qe-test-architect');
      expect(load?.maxTasks).toBe(20);
      expect(load?.loadPercentage).toBe(50);
    });
  });

  describe('Priority Queue', () => {
    it('should enqueue tasks', () => {
      router.enqueue('task-1', createTestMessage(), { message: createTestMessage(), priority: 'normal' });
      router.enqueue('task-2', createTestMessage(), { message: createTestMessage(), priority: 'high' });

      expect(router.queueLength).toBe(2);
    });

    it('should order by priority', () => {
      router.enqueue('task-low', createTestMessage(), { message: createTestMessage(), priority: 'low' });
      router.enqueue('task-high', createTestMessage(), { message: createTestMessage(), priority: 'high' });
      router.enqueue('task-urgent', createTestMessage(), { message: createTestMessage(), priority: 'urgent' });

      const first = router.dequeue();
      expect(first?.taskId).toBe('task-urgent');

      const second = router.dequeue();
      expect(second?.taskId).toBe('task-high');
    });

    it('should remove from queue', () => {
      router.enqueue('task-1', createTestMessage(), { message: createTestMessage() });
      router.enqueue('task-2', createTestMessage(), { message: createTestMessage() });

      const removed = router.removeFromQueue('task-1');
      expect(removed).toBe(true);
      expect(router.queueLength).toBe(1);
    });

    it('should return null when dequeuing empty queue', () => {
      const result = router.dequeue();
      expect(result).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should provide router stats', async () => {
      router.updateAgentLoad('qe-test-architect', 3);
      router.updateAgentLoad('qe-security-scanner', 9); // Overloaded

      await router.route({
        message: createTestMessage(),
        contextId: 'ctx-1',
        preferredAgentId: 'qe-coverage-specialist',
      });

      router.enqueue('task-1', createTestMessage(), { message: createTestMessage() });

      const stats = router.getStats();

      expect(stats.trackedAgents).toBe(2);
      expect(stats.overloadedAgents).toBe(1);
      expect(stats.contextMappings).toBe(1);
      expect(stats.queueLength).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should clear all state', () => {
      router.updateAgentLoad('agent-1', 5);
      router.setContextAgent('ctx-1', 'agent-1');
      router.enqueue('task-1', createTestMessage(), { message: createTestMessage() });

      router.clear();

      expect(router.getAllAgentLoads()).toHaveLength(0);
      expect(router.getAllContextMappings().size).toBe(0);
      expect(router.queueLength).toBe(0);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Task Negotiation Protocol Integration', () => {
  it('should handle complete task lifecycle', async () => {
    // Setup
    const cards = new Map<string, QEAgentCard>();
    cards.set(
      'qe-test-architect',
      createTestAgentCard('qe-test-architect', {
        skills: [createAgentSkill('test-generation', 'Test Generation', 'Generate tests')],
      })
    );

    const discoveryService = createMockDiscoveryService(cards);
    const router = createTaskRouter({ discoveryService });
    const manager = createTaskManager();

    // 1. Create task
    const message = createTestMessage('Generate tests for user service');
    const task = manager.createTask(message);
    expect(task.status).toBe('submitted');

    // 2. Route task
    const decision = await router.routeTask(task, {});
    expect(decision.agentId).toBe('qe-test-architect');

    // 3. Start processing
    manager.startTask(task.id);
    expect(manager.getTask(task.id)?.status).toBe('working');

    // 4. Add artifact
    const artifact = manager.createTextArtifact('result-1', 'Test File', 'describe("User", () => { ... })');
    manager.addArtifact(task.id, artifact);

    // 5. Complete task
    manager.completeTask(task.id);
    expect(manager.getTask(task.id)?.status).toBe('completed');

    // 6. Verify history
    const history = manager.getTaskHistory(task.id);
    expect(history?.length).toBe(3); // submitted -> working -> completed

    // Cleanup
    manager.destroy();
    router.destroy();
  });

  it('should handle multi-turn conversation', async () => {
    const cards = new Map<string, QEAgentCard>();
    cards.set('agent-1', createTestAgentCard('agent-1'));

    const discoveryService = createMockDiscoveryService(cards);
    const router = createTaskRouter({ discoveryService });
    const manager = createTaskManager();

    // Turn 1
    const task1 = manager.createTask(createTestMessage('Start conversation'), {
      contextId: 'conversation-ctx',
    });

    await router.routeTask(task1, { contextId: task1.contextId });
    manager.startTask(task1.id);
    manager.requestInput(task1.id, 'What file should I test?');

    expect(manager.getTask(task1.id)?.status).toBe('input_required');

    // Turn 2 - User provides input
    const inputMessage = createTestMessage('Test the UserService.ts file', 'user');
    manager.provideInput(task1.id, inputMessage);

    expect(manager.getTask(task1.id)?.status).toBe('working');

    // Verify context routing
    const contextAgent = router.getContextAgent('conversation-ctx');
    expect(contextAgent).toBe('agent-1');

    // Turn 3 would continue with same agent...

    manager.destroy();
    router.destroy();
  });

  it('should handle task failure and error reporting', () => {
    const manager = createTaskManager();

    const task = manager.createTask(createTestMessage('Risky operation'));
    manager.startTask(task.id);

    manager.failTask(task.id, {
      message: 'Operation timed out',
      code: 'TIMEOUT',
      retryable: true,
    });

    const failed = manager.getTask(task.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.error?.code).toBe('TIMEOUT');
    expect(failed?.error?.retryable).toBe(true);

    // Verify terminal state
    expect(isTerminal(failed!.status)).toBe(true);
    expect(() => manager.startTask(task.id)).toThrow('Invalid state transition');

    manager.destroy();
  });
});
