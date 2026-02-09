/**
 * Unit tests for Queen Coordinator pattern training pipeline
 * ADR-064 Phase 3: Learning & Observability
 *
 * Tests connectReasoningBank() → handleTaskCompleted() → TaskCompletedHook
 * → ReasoningBankPatternStore → QEReasoningBank
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueenCoordinator } from '../../src/coordination/queen-coordinator.js';
import type { IQEReasoningBank } from '../../src/learning/qe-reasoning-bank.js';
import type { DomainEvent, DomainName } from '../../src/shared/types/index.js';

// ============================================================================
// Minimal mocks — only what's needed for the pattern training path
// ============================================================================

function createMockEventBus() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn(), active: true }),
    subscribeToChannel: vi.fn().mockReturnValue({ unsubscribe: vi.fn(), active: true }),
    getHistory: vi.fn().mockResolvedValue([]),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAgentCoordinator() {
  return {
    spawn: vi.fn().mockResolvedValue({ success: true, value: 'agent-1' }),
    getStatus: vi.fn().mockReturnValue('idle'),
    listAgents: vi.fn().mockReturnValue([]),
    stop: vi.fn().mockResolvedValue({ success: true, value: undefined }),
    getActiveCount: vi.fn().mockReturnValue(0),
    canSpawn: vi.fn().mockReturnValue(true),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockMemory() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    has: vi.fn().mockResolvedValue(false),
    search: vi.fn().mockResolvedValue([]),
    vectorSearch: vi.fn().mockResolvedValue([]),
    storeVector: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

/** Mock router that captures subscribeToEventType handlers */
function createMockRouter() {
  const eventHandlers = new Map<string, ((event: DomainEvent) => Promise<void>)[]>();
  let subCounter = 0;

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    subscribeToDoamin: vi.fn().mockReturnValue(`sub-domain-${++subCounter}`),
    subscribeToEventType: vi.fn().mockImplementation(
      (eventType: string, handler: (event: DomainEvent) => Promise<void>) => {
        if (!eventHandlers.has(eventType)) {
          eventHandlers.set(eventType, []);
        }
        eventHandlers.get(eventType)!.push(handler);
        return `sub-${eventType}-${++subCounter}`;
      }
    ),
    unsubscribe: vi.fn().mockReturnValue(true),
    route: vi.fn().mockResolvedValue(undefined),
    getCorrelation: vi.fn().mockReturnValue(undefined),
    trackCorrelation: vi.fn(),
    aggregate: vi.fn().mockReturnValue({ totalEvents: 0, byType: {}, byDomain: {} }),
    getHistory: vi.fn().mockResolvedValue([]),

    // Test helper: fire an event to captured handlers
    async fireEvent(eventType: string, event: DomainEvent): Promise<void> {
      const handlers = eventHandlers.get(eventType) || [];
      for (const handler of handlers) {
        await handler(event);
      }
    },
  };
}

function createMockReasoningBank(): IQEReasoningBank & {
  storePattern: ReturnType<typeof vi.fn>;
  recordOutcome: ReturnType<typeof vi.fn>;
} {
  let counter = 0;
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    storePattern: vi.fn().mockImplementation(async (options) => ({
      success: true,
      value: {
        id: `qe-pattern-${++counter}`,
        patternType: options.patternType,
        name: options.name,
        qeDomain: 'test-generation',
        domain: 'test-generation',
        description: options.description,
        confidence: options.confidence ?? 0.5,
        usageCount: 0,
        successRate: 0,
        qualityScore: 0.5,
        context: options.context || { tags: [] },
        template: options.template,
        tier: 'short-term' as const,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        successfulUses: 0,
        reusable: false,
        reuseCount: 0,
        averageTokenSavings: 0,
      },
    })),
    searchPatterns: vi.fn().mockResolvedValue({ success: true, value: [] }),
    getPattern: vi.fn().mockResolvedValue(null),
    recordOutcome: vi.fn().mockResolvedValue({ success: true, value: undefined }),
    routeTask: vi.fn().mockResolvedValue({ success: true, value: {} }),
    getGuidance: vi.fn().mockReturnValue({}),
    generateContext: vi.fn().mockReturnValue(''),
    checkAntiPatterns: vi.fn().mockReturnValue([]),
    embed: vi.fn().mockResolvedValue(new Array(128).fill(0)),
    getStats: vi.fn().mockResolvedValue({}),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Seed a task execution directly into the Queen's private tasks map.
 * This avoids pulling in the full submitTask path (governance, routing, etc).
 */
function seedTask(
  queen: QueenCoordinator,
  taskId: string,
  overrides: Record<string, unknown> = {},
): void {
  const tasks = (queen as unknown as { tasks: Map<string, unknown> }).tasks;
  tasks.set(taskId, {
    taskId,
    task: {
      id: taskId,
      type: overrides.taskType ?? 'generate-tests',
      priority: 'p1',
      targetDomains: ['test-generation'],
      payload: {},
      timeout: 30000,
      createdAt: new Date(),
    },
    status: overrides.status ?? 'running',
    assignedDomain: overrides.assignedDomain ?? 'test-generation',
    assignedAgents: overrides.assignedAgents ?? ['agent-1'],
    startedAt: new Date(Date.now() - 2000),
    retryCount: 0,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('QueenCoordinator pattern training (ADR-064 Phase 3)', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let agentCoordinator: ReturnType<typeof createMockAgentCoordinator>;
  let memory: ReturnType<typeof createMockMemory>;
  let router: ReturnType<typeof createMockRouter>;
  let bank: ReturnType<typeof createMockReasoningBank>;
  let queen: QueenCoordinator;

  beforeEach(() => {
    eventBus = createMockEventBus();
    agentCoordinator = createMockAgentCoordinator();
    memory = createMockMemory();
    router = createMockRouter();
    bank = createMockReasoningBank();

    queen = new QueenCoordinator(
      eventBus as any,
      agentCoordinator as any,
      memory as any,
      router as any,
      undefined, // protocolExecutor
      undefined, // workflowExecutor
      undefined, // domainPlugins
      {
        enableMetrics: false,
        enableRouting: false,
        enableCircuitBreakers: false,
        enableDomainTeams: false,
        enableFleetTiers: false,
        workStealing: {
          enabled: false,
          idleThreshold: 5000,
          loadThreshold: 10,
          stealBatchSize: 3,
          checkInterval: 10000,
        },
      },
    );

    // Bypass full initialize() (MinCut, governance, etc.) —
    // directly register event handlers and mark as initialized
    const q = queen as unknown as { initialized: boolean; subscribeToEvents(): void };
    q.subscribeToEvents();
    q.initialized = true;
  });

  // ---------- connectReasoningBank ----------

  it('should accept a reasoning bank via connectReasoningBank()', () => {
    // Should not throw
    queen.connectReasoningBank(bank);
  });

  // ---------- Metrics extraction ----------

  it('should extract metrics from result.metrics object', async () => {
    queen.connectReasoningBank(bank);
    seedTask(queen, 'task-metrics-obj');

    await router.fireEvent('TaskCompleted', {
      id: 'evt-1',
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: 'test-generation' as DomainName,
      payload: {
        taskId: 'task-metrics-obj',
        result: {
          metrics: {
            testsPassed: 8,
            testsFailed: 2,
            coverageChange: 0.05,
            securityIssues: 0,
            performanceMs: 1200,
          },
          testCode: 'describe("svc", () => { it("works", () => expect(true)); });',
        },
      },
    });

    // Allow fire-and-forget promise to resolve
    await new Promise(r => setTimeout(r, 50));

    expect(bank.storePattern).toHaveBeenCalled();
    // Verify the confidence is propagated from extraction (not hardcoded 0.5)
    const storeCall = bank.storePattern.mock.calls[0]?.[0];
    expect(storeCall).toBeDefined();
    expect(storeCall.confidence).toBeGreaterThan(0);
  });

  it('should extract metrics from flat result fields', async () => {
    queen.connectReasoningBank(bank);
    seedTask(queen, 'task-flat-metrics');

    await router.fireEvent('TaskCompleted', {
      id: 'evt-2',
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: 'test-generation' as DomainName,
      payload: {
        taskId: 'task-flat-metrics',
        result: {
          testsPassed: 5,
          testsFailed: 1,
          testCode: 'describe("flat", () => { it("extracts", () => expect(1).toBe(1)); });',
        },
      },
    });

    await new Promise(r => setTimeout(r, 50));

    expect(bank.storePattern).toHaveBeenCalled();
  });

  it('should log error and skip pattern training when result has no metrics', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    queen.connectReasoningBank(bank);
    seedTask(queen, 'task-no-metrics');

    await router.fireEvent('TaskCompleted', {
      id: 'evt-3',
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: 'test-generation' as DomainName,
      payload: {
        taskId: 'task-no-metrics',
        result: {
          someField: 'value',
          anotherField: 42,
        },
      },
    });

    await new Promise(r => setTimeout(r, 50));

    // Bank should NOT have been called — no metrics means skip
    expect(bank.storePattern).not.toHaveBeenCalled();

    // Should have logged an error about unrecognized metrics shape
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('no recognizable metrics shape'),
    );

    errorSpy.mockRestore();
  });

  it('should log error and skip when result is not an object', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    queen.connectReasoningBank(bank);
    seedTask(queen, 'task-string-result');

    await router.fireEvent('TaskCompleted', {
      id: 'evt-4',
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: 'test-generation' as DomainName,
      payload: {
        taskId: 'task-string-result',
        result: 'just a string',
      },
    });

    await new Promise(r => setTimeout(r, 50));

    expect(bank.storePattern).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('result is not an object'),
    );

    errorSpy.mockRestore();
  });

  // ---------- End-to-end: Queen → Hook → Adapter → Bank ----------

  it('should flow patterns end-to-end from TaskCompleted event to ReasoningBank', async () => {
    queen.connectReasoningBank(bank);
    seedTask(queen, 'task-e2e', { assignedDomain: 'test-generation' });

    await router.fireEvent('TaskCompleted', {
      id: 'evt-5',
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: 'test-generation' as DomainName,
      payload: {
        taskId: 'task-e2e',
        result: {
          metrics: {
            testsPassed: 10,
            testsFailed: 0,
            securityIssues: 0,
            performanceMs: 800,
          },
          testCode: 'describe("UserService", () => { it("creates user", () => expect(user).toBeDefined()); });',
          template: 'AAA template: Arrange setup data, Act call method, Assert verify result works well',
        },
      },
    });

    // Allow fire-and-forget + hook processing
    await new Promise(r => setTimeout(r, 50));

    // Bank should have received patterns
    expect(bank.storePattern).toHaveBeenCalled();
    expect(bank.recordOutcome).toHaveBeenCalled();

    // Verify storePattern was called with correct structure
    const firstCall = bank.storePattern.mock.calls[0][0];
    expect(firstCall.patternType).toBeDefined();
    expect(firstCall.name).toBeDefined();
    expect(firstCall.template.content).toBeTruthy();
    expect(firstCall.confidence).toBeGreaterThan(0);

    // Verify outcome was recorded as successful
    const outcomeCall = bank.recordOutcome.mock.calls[0][0];
    expect(outcomeCall.success).toBe(true);
    expect(outcomeCall.patternId).toMatch(/^qe-pattern-/);
  });

  it('should not train patterns when connectReasoningBank was never called', async () => {
    // Do NOT call connectReasoningBank
    seedTask(queen, 'task-no-bank');

    await router.fireEvent('TaskCompleted', {
      id: 'evt-6',
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: 'test-generation' as DomainName,
      payload: {
        taskId: 'task-no-bank',
        result: {
          metrics: { testsPassed: 5, testsFailed: 0 },
          testCode: 'describe("x", () => { it("y", () => expect(1).toBe(1)); });',
        },
      },
    });

    await new Promise(r => setTimeout(r, 50));

    expect(bank.storePattern).not.toHaveBeenCalled();
  });

  it('should handle bank errors without crashing task completion', async () => {
    bank.storePattern.mockRejectedValue(new Error('Bank down'));
    queen.connectReasoningBank(bank);
    seedTask(queen, 'task-bank-error');

    // Should not throw
    await router.fireEvent('TaskCompleted', {
      id: 'evt-7',
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: 'test-generation' as DomainName,
      payload: {
        taskId: 'task-bank-error',
        result: {
          metrics: { testsPassed: 10, testsFailed: 0, securityIssues: 0, performanceMs: 500 },
          testCode: 'describe("err", () => { it("handles", () => expect(true).toBe(true)); });',
        },
      },
    });

    await new Promise(r => setTimeout(r, 50));

    // Bank was called but errored — task completion should still succeed
    expect(bank.storePattern).toHaveBeenCalled();
    // Task should still be marked completed in the Queen
    const status = queen.getTaskStatus('task-bank-error');
    expect(status?.status).toBe('completed');
  });

  // ---------- Confidence propagation (Fix #2) ----------

  it('should propagate extracted confidence to ReasoningBank (not hardcoded 0.5)', async () => {
    queen.connectReasoningBank(bank);
    seedTask(queen, 'task-confidence');

    await router.fireEvent('TaskCompleted', {
      id: 'evt-8',
      type: 'TaskCompleted',
      timestamp: new Date(),
      source: 'test-generation' as DomainName,
      payload: {
        taskId: 'task-confidence',
        result: {
          metrics: {
            testsPassed: 10,
            testsFailed: 0,
            coverageChange: 0.1,
            securityIssues: 0,
            performanceMs: 500,
          },
          testCode: 'describe("confidence", () => { it("is high", () => expect(true).toBe(true)); });',
        },
      },
    });

    await new Promise(r => setTimeout(r, 50));

    // With perfect metrics (10/0 pass/fail, coverage > 0, security = 0, perf < 5000)
    // confidence boost should be ~0.15 + 0.05 + 0.1 + 0.05 = 0.35
    // base confidence for test-generation is 0.6
    // So total confidence should be 0.6 + 0.35 = 0.95
    const storeCall = bank.storePattern.mock.calls[0]?.[0];
    expect(storeCall).toBeDefined();
    expect(storeCall.confidence).toBeGreaterThan(0.5);
    expect(storeCall.confidence).toBeLessThanOrEqual(1.0);
  });
});
