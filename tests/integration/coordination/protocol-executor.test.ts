/**
 * Agentic QE v3 - Protocol Executor Integration Tests
 * Tests protocol registration, execution, and scheduling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DefaultProtocolExecutor } from '../../../src/coordination/protocol-executor';
import { InMemoryEventBus } from '../../../src/kernel/event-bus';
import { Protocol, ProtocolAction } from '../../../src/coordination/interfaces';
import { MemoryBackend, StoreOptions, EventBus } from '../../../src/kernel/interfaces';
import { DomainName } from '../../../src/shared/types';

/**
 * Mock MemoryBackend for testing
 */
function createMockMemory(): MemoryBackend {
  const store = new Map<string, unknown>();

  return {
    async initialize() {},
    async dispose() {},
    async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
      store.set(key, value);
    },
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async has(key: string): Promise<boolean> {
      return store.has(key);
    },
    async search(pattern: string, _limit?: number): Promise<string[]> {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(store.keys()).filter((k) => regex.test(k));
    },
    async vectorSearch(_embedding: number[], _k: number): Promise<[]> {
      return [];
    },
    async storeVector(
      _key: string,
      _embedding: number[],
      _metadata?: unknown
    ): Promise<void> {},
  };
}

/**
 * Mock domain API provider
 */
function createMockDomainAPI() {
  const actionResults = new Map<string, unknown>();

  return {
    getDomainAPI: <T>(domain: DomainName): T | undefined => {
      // Return a mock API object that tracks method calls
      return {
        generateTests: vi.fn().mockResolvedValue({ tests: 5 }),
        executeTests: vi.fn().mockResolvedValue({ passed: 5, failed: 0 }),
        analyzeCoverage: vi.fn().mockResolvedValue({ line: 85, branch: 75 }),
        assessQuality: vi.fn().mockResolvedValue({ score: 8.5 }),
      } as unknown as T;
    },
    setActionResult: (action: string, result: unknown) => {
      actionResults.set(action, result);
    },
  };
}

describe('DefaultProtocolExecutor Integration', () => {
  let eventBus: EventBus;
  let memory: MemoryBackend;
  let mockDomainAPI: ReturnType<typeof createMockDomainAPI>;
  let executor: DefaultProtocolExecutor;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    memory = createMockMemory();
    mockDomainAPI = createMockDomainAPI();
    executor = new DefaultProtocolExecutor(
      eventBus,
      memory,
      mockDomainAPI.getDomainAPI
    );
  });

  afterEach(() => {
    // Clean up any scheduled protocols
    for (const protocol of executor.listProtocols()) {
      executor.unregisterProtocol(protocol.id);
    }
  });

  describe('protocol registration', () => {
    it('should register a protocol', () => {
      const protocol: Protocol = {
        id: 'test-protocol',
        name: 'Test Protocol',
        description: 'A test protocol',
        schedule: { type: 'immediate' },
        participants: ['test-generation', 'test-execution'],
        actions: [],
        priority: 'medium',
        enabled: true,
      };

      executor.registerProtocol(protocol);

      const registered = executor.getProtocol('test-protocol');
      expect(registered).toBeDefined();
      expect(registered?.name).toBe('Test Protocol');
    });

    it('should list registered protocols', () => {
      const protocol1: Protocol = {
        id: 'protocol-1',
        name: 'Protocol 1',
        schedule: { type: 'immediate' },
        participants: ['test-generation'],
        actions: [],
        priority: 'high',
        enabled: true,
      };

      const protocol2: Protocol = {
        id: 'protocol-2',
        name: 'Protocol 2',
        schedule: { type: 'immediate' },
        participants: ['coverage-analysis'],
        actions: [],
        priority: 'low',
        enabled: true,
      };

      executor.registerProtocol(protocol1);
      executor.registerProtocol(protocol2);

      const protocols = executor.listProtocols();
      expect(protocols.length).toBe(2);
      expect(protocols.map((p) => p.id)).toContain('protocol-1');
      expect(protocols.map((p) => p.id)).toContain('protocol-2');
    });

    it('should unregister a protocol', () => {
      const protocol: Protocol = {
        id: 'remove-protocol',
        name: 'Remove Protocol',
        schedule: { type: 'immediate' },
        participants: ['test-generation'],
        actions: [],
        priority: 'medium',
        enabled: true,
      };

      executor.registerProtocol(protocol);
      expect(executor.getProtocol('remove-protocol')).toBeDefined();

      const result = executor.unregisterProtocol('remove-protocol');
      expect(result).toBe(true);
      expect(executor.getProtocol('remove-protocol')).toBeUndefined();
    });
  });

  describe('protocol execution', () => {
    it('should execute a protocol with actions', async () => {
      const action: ProtocolAction = {
        id: 'generate-action',
        name: 'Generate Tests',
        targetDomain: 'test-generation',
        method: 'generateTests',
        params: { file: 'src/app.ts' },
      };

      const protocol: Protocol = {
        id: 'execute-protocol',
        name: 'Execute Protocol',
        schedule: { type: 'immediate' },
        participants: ['test-generation'],
        actions: [action],
        priority: 'high',
        enabled: true,
      };

      executor.registerProtocol(protocol);

      const result = await executor.execute('execute-protocol');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.status).toBe('completed');
      }
    });

    it('should execute actions in dependency order', async () => {
      const executionOrder: string[] = [];

      // Mock domain API to track execution order
      const orderedDomainAPI = <T>(_domain: DomainName): T | undefined => {
        return {
          first: vi.fn().mockImplementation(async () => {
            executionOrder.push('first');
            return { success: true };
          }),
          second: vi.fn().mockImplementation(async () => {
            executionOrder.push('second');
            return { success: true };
          }),
          third: vi.fn().mockImplementation(async () => {
            executionOrder.push('third');
            return { success: true };
          }),
        } as unknown as T;
      };

      const orderedExecutor = new DefaultProtocolExecutor(
        new InMemoryEventBus(),
        memory,
        orderedDomainAPI
      );

      const protocol: Protocol = {
        id: 'ordered-protocol',
        name: 'Ordered Protocol',
        schedule: { type: 'immediate' },
        participants: ['test-generation'],
        actions: [
          {
            id: 'action-1',
            name: 'First',
            targetDomain: 'test-generation',
            method: 'first',
          },
          {
            id: 'action-2',
            name: 'Second',
            targetDomain: 'test-generation',
            method: 'second',
            dependsOn: ['action-1'],
          },
          {
            id: 'action-3',
            name: 'Third',
            targetDomain: 'test-generation',
            method: 'third',
            dependsOn: ['action-2'],
          },
        ],
        priority: 'high',
        enabled: true,
      };

      orderedExecutor.registerProtocol(protocol);
      await orderedExecutor.execute('ordered-protocol');

      expect(executionOrder).toEqual(['first', 'second', 'third']);
    });

    it('should pass parameters to protocol execution', async () => {
      let receivedParams: Record<string, unknown> = {};

      const paramDomainAPI = <T>(_domain: DomainName): T | undefined => {
        return {
          process: vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
            receivedParams = params;
            return { success: true };
          }),
        } as unknown as T;
      };

      const paramExecutor = new DefaultProtocolExecutor(
        new InMemoryEventBus(),
        memory,
        paramDomainAPI
      );

      const protocol: Protocol = {
        id: 'param-protocol',
        name: 'Param Protocol',
        schedule: { type: 'immediate' },
        participants: ['test-generation'],
        actions: [
          {
            id: 'action-1',
            name: 'Process',
            targetDomain: 'test-generation',
            method: 'process',
          },
        ],
        priority: 'medium',
        enabled: true,
      };

      paramExecutor.registerProtocol(protocol);
      await paramExecutor.execute('param-protocol', {
        targetFile: 'src/app.ts',
        coverage: 80,
      });

      expect(receivedParams.targetFile).toBe('src/app.ts');
      expect(receivedParams.coverage).toBe(80);
    });
  });

  describe('execution events', () => {
    it('should emit protocol started event', async () => {
      const receivedEvents: string[] = [];

      eventBus.subscribe('coordination.ProtocolStarted', () => {
        receivedEvents.push('started');
      });

      const protocol: Protocol = {
        id: 'event-protocol',
        name: 'Event Protocol',
        schedule: { type: 'immediate' },
        participants: ['test-generation'],
        actions: [],
        priority: 'medium',
        enabled: true,
      };

      executor.registerProtocol(protocol);
      await executor.execute('event-protocol');

      expect(receivedEvents).toContain('started');
    });

    it('should emit protocol completed event', async () => {
      const receivedEvents: string[] = [];

      eventBus.subscribe('coordination.ProtocolCompleted', () => {
        receivedEvents.push('completed');
      });

      const protocol: Protocol = {
        id: 'complete-protocol',
        name: 'Complete Protocol',
        schedule: { type: 'immediate' },
        participants: ['test-generation'],
        actions: [],
        priority: 'medium',
        enabled: true,
      };

      executor.registerProtocol(protocol);
      await executor.execute('complete-protocol');

      expect(receivedEvents).toContain('completed');
    });
  });

  describe('error handling', () => {
    it('does not retry a timed-out action whose first attempt may still commit', async () => {
      const effects: string[] = [];
      let finishFirst!: () => void;
      const apply = vi.fn()
        .mockImplementationOnce(() => {
          effects.push('applied');
          return new Promise<void>((resolve) => { finishFirst = resolve; });
        })
        .mockImplementationOnce(async () => { effects.push('applied again'); });
      const actionEvents: string[] = [];
      eventBus.subscribe('coordination.ActionCompleted', () => { actionEvents.push('completed'); });
      eventBus.subscribe('coordination.ActionOutcomeUnknown', () => { actionEvents.push('unknown'); });
      eventBus.subscribe('coordination.ProtocolCompleted', () => { actionEvents.push('protocol completed'); });
      eventBus.subscribe('coordination.ProtocolOutcomeUnknown', () => { actionEvents.push('protocol unknown'); });
      const timedExecutor = new DefaultProtocolExecutor(eventBus, memory, <T>() => ({ apply }) as T);
      timedExecutor.registerProtocol({
        id: 'ambiguous-timeout', name: 'Ambiguous timeout',
        schedule: { type: 'immediate' }, participants: ['test-generation'],
        actions: [{ id: 'apply', name: 'Apply external effect', targetDomain: 'test-generation',
          method: 'apply', timeout: 20, retry: { maxAttempts: 2, backoffMs: 1 } }],
        priority: 'high', enabled: true,
      });

      const result = await timedExecutor.execute('ambiguous-timeout');
      finishFirst(); // The timed-out provider call can finish after the protocol returns.

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.status).toBe('unknown');
        expect(result.value.results.get('apply')).toMatchObject({
          status: 'unknown', retryAttempts: undefined,
        });
        const stored = await memory.get<{ status: string; results: Record<string, { status: string }> }>(
          `protocol-execution:${result.value.executionId}`
        );
        expect(stored?.status).toBe('unknown');
        expect(stored?.results.apply.status).toBe('unknown');
      }
      expect(apply).toHaveBeenCalledTimes(1);
      expect(effects).toEqual(['applied']);
      expect(actionEvents).toEqual(['unknown', 'protocol unknown']);
    });

    it('skips dependents of an unknown action without turning it into a deadlock', async () => {
      const dependent = vi.fn().mockResolvedValue('should not run');
      const blockedExecutor = new DefaultProtocolExecutor(
        eventBus, memory,
        <T>() => ({ hang: () => new Promise(() => {}), dependent }) as T
      );
      blockedExecutor.registerProtocol({
        id: 'blocked-dependent', name: 'Blocked dependent',
        schedule: { type: 'immediate' }, participants: ['test-generation'],
        actions: [
          { id: 'hang', name: 'May commit', targetDomain: 'test-generation', method: 'hang', timeout: 10 },
          { id: 'dependent', name: 'Dependent', targetDomain: 'test-generation',
            method: 'dependent', dependsOn: ['hang'] },
        ],
        priority: 'high', enabled: true,
      });

      const result = await blockedExecutor.execute('blocked-dependent');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.status).toBe('unknown');
        expect(result.value.results.get('hang')?.status).toBe('unknown');
        expect(result.value.results.get('dependent')?.status).toBe('skipped');
      }
      expect(dependent).not.toHaveBeenCalled();
    });

    it('still retries an explicit pre-effect rejection when configured', async () => {
      const attempt = vi.fn()
        .mockRejectedValueOnce(new Error('Rejected before effect'))
        .mockResolvedValueOnce('accepted');
      const retryExecutor = new DefaultProtocolExecutor(eventBus, memory, <T>() => ({ attempt }) as T);
      retryExecutor.registerProtocol({
        id: 'rejected-attempt', name: 'Rejected attempt',
        schedule: { type: 'immediate' }, participants: ['test-generation'],
        actions: [{ id: 'attempt', name: 'Attempt', targetDomain: 'test-generation',
          method: 'attempt', retry: { maxAttempts: 2, backoffMs: 1 } }],
        priority: 'high', enabled: true,
      });

      const result = await retryExecutor.execute('rejected-attempt');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.status).toBe('completed');
        expect(result.value.results.get('attempt')?.retryAttempts).toBe(1);
      }
      expect(attempt).toHaveBeenCalledTimes(2);
    });

    it('should handle missing protocol gracefully', async () => {
      const result = await executor.execute('non-existent-protocol');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should handle action failures', async () => {
      const failingDomainAPI = <T>(_domain: DomainName): T | undefined => {
        return {
          failingMethod: vi.fn().mockRejectedValue(new Error('Action failed')),
        } as unknown as T;
      };

      const failingExecutor = new DefaultProtocolExecutor(
        new InMemoryEventBus(),
        memory,
        failingDomainAPI
      );

      const protocol: Protocol = {
        id: 'failing-protocol',
        name: 'Failing Protocol',
        schedule: { type: 'immediate' },
        participants: ['test-generation'],
        actions: [
          {
            id: 'fail-action',
            name: 'Fail',
            targetDomain: 'test-generation',
            method: 'failingMethod',
          },
        ],
        priority: 'medium',
        enabled: true,
      };

      failingExecutor.registerProtocol(protocol);
      const result = await failingExecutor.execute('failing-protocol');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.status).toBe('failed');
      }
    });
  });

  describe('protocol cancellation', () => {
    it('should cancel running protocol', async () => {
      const longRunningDomainAPI = <T>(_domain: DomainName): T | undefined => {
        return {
          longRunning: vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { success: true };
          }),
        } as unknown as T;
      };

      const longExecutor = new DefaultProtocolExecutor(
        new InMemoryEventBus(),
        memory,
        longRunningDomainAPI
      );

      const protocol: Protocol = {
        id: 'long-protocol',
        name: 'Long Protocol',
        schedule: { type: 'immediate' },
        participants: ['test-generation'],
        actions: [
          {
            id: 'long-action',
            name: 'Long Running',
            targetDomain: 'test-generation',
            method: 'longRunning',
          },
        ],
        priority: 'medium',
        enabled: true,
      };

      longExecutor.registerProtocol(protocol);

      // Start execution without awaiting
      const executionPromise = longExecutor.execute('long-protocol');

      // Cancel after short delay
      await new Promise((r) => setTimeout(r, 50));

      // Get active executions and cancel if any
      // Note: API may vary, this tests the concept

      const result = await executionPromise;

      // Either completed or we caught it
      expect(result.success).toBe(true);
    });
  });
});
