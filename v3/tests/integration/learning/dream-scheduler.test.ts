/**
 * DreamScheduler Integration Tests
 * ADR-021: QE ReasoningBank - Dream Cycle Integration
 *
 * Tests for DreamScheduler automatic dream cycle scheduling:
 * - Time-based scheduling
 * - Experience-based triggers
 * - Event-based triggers (quality gate failures, domain milestones)
 * - Integration with LearningOptimizationCoordinator
 *
 * @module v3/tests/integration/learning/dream-scheduler.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DreamScheduler,
  createDreamScheduler,
  DEFAULT_DREAM_SCHEDULER_CONFIG,
  type DreamSchedulerConfig,
  type DreamSchedulerDependencies,
  type TaskExperience,
} from '../../../src/learning/dream/dream-scheduler';
import type { DreamEngine, DreamCycleResult } from '../../../src/learning/dream/dream-engine';
import type { DreamInsight } from '../../../src/learning/dream/insight-generator';
import type { EventBus, Subscription, MemoryBackend } from '../../../src/kernel/interfaces';
import type { DomainEvent } from '../../../src/shared/types';

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock DreamEngine that returns predictable insights
 */
function createMockDreamEngine(options?: {
  insightsToReturn?: DreamInsight[];
  shouldFail?: boolean;
  cycleStatus?: 'completed' | 'failed' | 'interrupted';
}): DreamEngine {
  const opts = options || {};
  const mockInsights: DreamInsight[] = opts.insightsToReturn ?? [
    {
      id: 'insight-1',
      cycleId: 'cycle-1',
      type: 'optimization',
      sourceConcepts: ['concept-1', 'concept-2'],
      description: 'Test insight 1',
      noveltyScore: 0.8,
      confidenceScore: 0.9,
      actionable: true,
      createdAt: new Date(),
    },
    {
      id: 'insight-2',
      cycleId: 'cycle-1',
      type: 'correlation',
      sourceConcepts: ['concept-3'],
      description: 'Test insight 2',
      noveltyScore: 0.5,
      confidenceScore: 0.6,
      actionable: false,
      createdAt: new Date(),
    },
  ];

  const mockCycleResult: DreamCycleResult = {
    cycle: {
      id: 'cycle-1',
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 5000,
      conceptsProcessed: 50,
      associationsFound: 10,
      insightsGenerated: mockInsights.length,
      status: opts.cycleStatus ?? 'completed',
    },
    insights: mockInsights,
    activationStats: {
      totalIterations: 10,
      peakActivation: 0.9,
      nodesActivated: 25,
    },
    patternsCreated: 0,
  };

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dream: vi.fn().mockImplementation(async () => {
      if (opts.shouldFail) {
        throw new Error('Dream failed');
      }
      return mockCycleResult;
    }),
    applyInsight: vi.fn().mockImplementation(async (insightId: string) => ({
      success: true,
      patternId: `pattern-from-${insightId}`,
    })),
    getPendingInsights: vi.fn().mockResolvedValue(mockInsights.filter((i) => i.actionable)),
    getDreamHistory: vi.fn().mockResolvedValue([mockCycleResult.cycle]),
    cancelDream: vi.fn().mockResolvedValue(undefined),
    isDreaming: vi.fn().mockReturnValue(false),
    getCurrentCycle: vi.fn().mockReturnValue(null),
    loadPatternsAsConcepts: vi.fn().mockResolvedValue(10),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as DreamEngine;
}

/**
 * Create a mock EventBus for event verification
 */
function createMockEventBus(): EventBus & {
  _subscriptions: Map<string, Array<(event: DomainEvent) => void>>;
  _publishedEvents: DomainEvent[];
  _simulateEvent: (eventType: string, payload: unknown) => Promise<void>;
} {
  const subscriptions = new Map<string, Array<(event: DomainEvent) => void>>();
  const publishedEvents: DomainEvent[] = [];

  return {
    _subscriptions: subscriptions,
    _publishedEvents: publishedEvents,
    _simulateEvent: async (eventType: string, payload: unknown) => {
      const handlers = subscriptions.get(eventType) || [];
      const event: DomainEvent = {
        id: `event-${Date.now()}`,
        type: eventType,
        timestamp: new Date(),
        source: 'test',
        payload,
      };
      for (const handler of handlers) {
        await handler(event);
      }
    },

    publish: vi.fn().mockImplementation(async (event: DomainEvent) => {
      publishedEvents.push(event);
    }),

    subscribe: vi.fn().mockImplementation(
      <T>(eventType: string, handler: (event: DomainEvent<T>) => void): Subscription => {
        const handlers = subscriptions.get(eventType) || [];
        handlers.push(handler as (event: DomainEvent) => void);
        subscriptions.set(eventType, handlers);
        return {
          unsubscribe: () => {
            const currentHandlers = subscriptions.get(eventType) || [];
            const idx = currentHandlers.indexOf(handler as (event: DomainEvent) => void);
            if (idx >= 0) currentHandlers.splice(idx, 1);
          },
          active: true,
        };
      }
    ),

    subscribeToChannel: vi.fn().mockReturnValue({
      unsubscribe: vi.fn(),
      active: true,
    }),

    getHistory: vi.fn().mockResolvedValue([]),

    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock MemoryBackend for state persistence
 */
function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),

    set: vi.fn().mockImplementation(async <T>(key: string, value: T) => {
      storage.set(key, value);
    }),

    get: vi.fn().mockImplementation(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),

    delete: vi.fn().mockImplementation(async (key: string) => {
      return storage.delete(key);
    }),

    has: vi.fn().mockImplementation(async (key: string) => {
      return storage.has(key);
    }),

    search: vi.fn().mockResolvedValue([]),

    vectorSearch: vi.fn().mockResolvedValue([]),

    storeVector: vi.fn().mockResolvedValue(undefined),

    count: vi.fn().mockResolvedValue(0),

    hasCodeIntelligenceIndex: vi.fn().mockResolvedValue(false),
  } as unknown as MemoryBackend;
}

/**
 * Create a test experience
 */
function createTestExperience(index: number, overrides?: Partial<TaskExperience>): TaskExperience {
  return {
    id: `exp-${index}`,
    agentType: 'tester',
    domain: 'test-execution',
    taskType: 'run-tests',
    success: index % 2 === 0,
    duration: 1000 + index * 100,
    context: { testFile: `test-${index}.ts` },
    timestamp: new Date(Date.now() - index * 1000),
    ...overrides,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('DreamScheduler', () => {
  let dreamEngine: ReturnType<typeof createMockDreamEngine>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let memoryBackend: ReturnType<typeof createMockMemoryBackend>;
  let scheduler: DreamScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    dreamEngine = createMockDreamEngine();
    eventBus = createMockEventBus();
    memoryBackend = createMockMemoryBackend();
  });

  afterEach(async () => {
    if (scheduler) {
      try {
        await scheduler.dispose();
      } catch {
        // Ignore disposal errors in cleanup
      }
    }
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================

  describe('initialization', () => {
    it('should initialize with DreamEngine dependency', async () => {
      scheduler = new DreamScheduler({ dreamEngine, eventBus });
      await scheduler.initialize();

      const status = scheduler.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.running).toBe(false);
    });

    it('should throw if DreamEngine not provided', () => {
      expect(() => {
        new DreamScheduler({
          dreamEngine: null as unknown as DreamEngine,
          eventBus,
        });
      }).toThrow('DreamScheduler requires dreamEngine dependency');
    });

    it('should throw if EventBus not provided', () => {
      expect(() => {
        new DreamScheduler({
          dreamEngine,
          eventBus: null as unknown as EventBus,
        });
      }).toThrow('DreamScheduler requires eventBus dependency');
    });

    it('should subscribe to EventBus events', async () => {
      scheduler = new DreamScheduler({ dreamEngine, eventBus }, {
        enableQualityGateFailureTrigger: true,
        enableDomainMilestoneTrigger: true,
      });
      await scheduler.initialize();

      // Should subscribe to quality gate and milestone events
      expect(eventBus.subscribe).toHaveBeenCalledWith(
        'quality-assessment:gate:completed',
        expect.any(Function)
      );
      expect(eventBus.subscribe).toHaveBeenCalledWith(
        'coordination:milestone:reached',
        expect.any(Function)
      );
    });

    it('should restore state from memory backend on initialize', async () => {
      const savedState = {
        lastDreamTime: new Date(Date.now() - 60000).toISOString(),
        totalDreamsCompleted: 5,
        experienceBuffer: [createTestExperience(0), createTestExperience(1)],
      };
      memoryBackend.get = vi.fn().mockResolvedValue(savedState);

      scheduler = new DreamScheduler({ dreamEngine, eventBus, memoryBackend });
      await scheduler.initialize();

      const status = scheduler.getStatus();
      expect(status.totalDreamsCompleted).toBe(5);
      expect(status.experienceCount).toBe(2);
    });
  });

  // ==========================================================================
  // Automatic Scheduling Tests
  // ==========================================================================

  describe('automatic scheduling', () => {
    it('should trigger dream after configured interval', async () => {
      const config: Partial<DreamSchedulerConfig> = {
        autoScheduleIntervalMs: 60000, // 1 minute
        minTimeBetweenDreamsMs: 30000, // 30 seconds
      };

      scheduler = new DreamScheduler({ dreamEngine, eventBus }, config);
      await scheduler.initialize();
      scheduler.start();

      expect(scheduler.getStatus().running).toBe(true);

      // Fast-forward past the interval
      await vi.advanceTimersByTimeAsync(60000);

      // Dream should have been triggered
      expect(dreamEngine.dream).toHaveBeenCalled();
    });

    it('should respect minTimeBetweenDreams', async () => {
      const config: Partial<DreamSchedulerConfig> = {
        autoScheduleIntervalMs: 10000,
        minTimeBetweenDreamsMs: 60000, // 1 minute minimum
      };

      scheduler = new DreamScheduler({ dreamEngine, eventBus }, config);
      await scheduler.initialize();
      scheduler.start();

      // Trigger first dream manually
      await scheduler.triggerDream(1000);
      vi.clearAllMocks();

      // Try to trigger another dream immediately
      await expect(scheduler.triggerDream(1000)).rejects.toThrow(
        'minimum interval not met'
      );
    });

    it('should not trigger if already dreaming', async () => {
      // Create engine that returns slowly
      const slowEngine = createMockDreamEngine();
      slowEngine.dream = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return {
          cycle: { id: 'slow-cycle', status: 'completed' },
          insights: [],
          activationStats: {},
          patternsCreated: 0,
        };
      });

      scheduler = new DreamScheduler(
        { dreamEngine: slowEngine, eventBus },
        {
          autoScheduleIntervalMs: 1000,
          minTimeBetweenDreamsMs: 0,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      // Start first dream
      const dreamPromise = scheduler.triggerDream(5000);

      // Try to start another while first is running
      await expect(scheduler.triggerDream(1000)).rejects.toThrow(
        'A dream is already in progress'
      );

      // Complete first dream
      await vi.advanceTimersByTimeAsync(5000);
      await dreamPromise;
    });
  });

  // ==========================================================================
  // Experience-Based Triggers Tests
  // ==========================================================================

  describe('experience-based triggers', () => {
    it('should accumulate experiences', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        {
          experienceThreshold: 100, // High threshold to prevent auto-trigger
          enableExperienceTrigger: false,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      for (let i = 0; i < 10; i++) {
        scheduler.recordExperience(createTestExperience(i));
      }

      expect(scheduler.getStatus().experienceCount).toBe(10);
      expect(scheduler.getExperienceBuffer()).toHaveLength(10);
    });

    it('should trigger dream when threshold reached', async () => {
      const config: Partial<DreamSchedulerConfig> = {
        experienceThreshold: 5,
        enableExperienceTrigger: true,
        minTimeBetweenDreamsMs: 0,
        autoScheduleIntervalMs: 3600000, // Long interval to prevent scheduled dreams
      };

      scheduler = new DreamScheduler({ dreamEngine, eventBus }, config);
      await scheduler.initialize();
      scheduler.start();

      // Add experiences up to threshold
      for (let i = 0; i < 5; i++) {
        scheduler.recordExperience(createTestExperience(i));
      }

      // Allow async dream to trigger
      await vi.advanceTimersByTimeAsync(100);

      expect(dreamEngine.dream).toHaveBeenCalled();
    });

    it('should clear experience buffer after dream', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        {
          experienceThreshold: 100,
          minTimeBetweenDreamsMs: 0,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      // Add some experiences
      for (let i = 0; i < 10; i++) {
        scheduler.recordExperience(createTestExperience(i));
      }

      expect(scheduler.getStatus().experienceCount).toBe(10);

      // Trigger dream
      await scheduler.triggerDream(1000);

      // Buffer should be cleared
      expect(scheduler.getStatus().experienceCount).toBe(0);
    });
  });

  // ==========================================================================
  // Event-Based Triggers Tests
  // ==========================================================================

  describe('event-based triggers', () => {
    it('should trigger quick dream on quality gate failure', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        {
          enableQualityGateFailureTrigger: true,
          minTimeBetweenDreamsMs: 0,
          quickDreamDurationMs: 2000,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      // Simulate quality gate failure event
      await eventBus._simulateEvent('quality-assessment:gate:completed', {
        passed: false,
      });

      // Allow async handler to complete
      await vi.advanceTimersByTimeAsync(100);

      expect(dreamEngine.dream).toHaveBeenCalledWith(2000);
    });

    it('should not trigger dream on quality gate success', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        {
          enableQualityGateFailureTrigger: true,
          minTimeBetweenDreamsMs: 0,
          autoScheduleIntervalMs: 3600000,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      // Simulate quality gate success event
      await eventBus._simulateEvent('quality-assessment:gate:completed', {
        passed: true,
      });

      await vi.advanceTimersByTimeAsync(100);

      // Dream should not be triggered for passing gates
      expect(dreamEngine.dream).not.toHaveBeenCalled();
    });

    it('should trigger dream on domain milestone', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        {
          enableDomainMilestoneTrigger: true,
          minTimeBetweenDreamsMs: 0,
          autoScheduleIntervalMs: 3600000,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      // Simulate milestone event
      await eventBus._simulateEvent('coordination:milestone:reached', {
        milestone: 'test-coverage-80%',
        domain: 'coverage-analysis',
      });

      await vi.advanceTimersByTimeAsync(100);

      expect(dreamEngine.dream).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Insight Handling Tests
  // ==========================================================================

  describe('insight handling', () => {
    it('should auto-apply high confidence insights when enabled', async () => {
      const highConfidenceInsights: DreamInsight[] = [
        {
          id: 'high-conf-1',
          cycleId: 'cycle-1',
          type: 'optimization',
          sourceConcepts: ['a'],
          description: 'High confidence insight',
          noveltyScore: 0.9,
          confidenceScore: 0.95, // Above threshold
          actionable: true,
          createdAt: new Date(),
        },
        {
          id: 'low-conf-1',
          cycleId: 'cycle-1',
          type: 'correlation',
          sourceConcepts: ['b'],
          description: 'Low confidence insight',
          noveltyScore: 0.7,
          confidenceScore: 0.5, // Below threshold
          actionable: true,
          createdAt: new Date(),
        },
      ];

      dreamEngine = createMockDreamEngine({ insightsToReturn: highConfidenceInsights });

      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        {
          autoApplyHighConfidenceInsights: true,
          insightConfidenceThreshold: 0.8,
          minTimeBetweenDreamsMs: 0,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      await scheduler.triggerDream(1000);

      // Only high confidence insight should be applied
      expect(dreamEngine.applyInsight).toHaveBeenCalledWith('high-conf-1');
      expect(dreamEngine.applyInsight).not.toHaveBeenCalledWith('low-conf-1');
    });

    it('should emit dream.completed event with insights', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        { minTimeBetweenDreamsMs: 0 }
      );
      await scheduler.initialize();
      scheduler.start();

      await scheduler.triggerDream(1000);

      // Verify event was published
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'learning-optimization:dream:completed',
          payload: expect.objectContaining({
            cycleId: 'cycle-1',
            insightsGenerated: 2,
          }),
        })
      );
    });

    it('should filter insights by confidence threshold', async () => {
      const mixedInsights: DreamInsight[] = [
        {
          id: 'actionable-high',
          cycleId: 'cycle-1',
          type: 'optimization',
          sourceConcepts: [],
          description: 'Actionable high confidence',
          noveltyScore: 0.9,
          confidenceScore: 0.95,
          actionable: true,
          createdAt: new Date(),
        },
        {
          id: 'non-actionable-high',
          cycleId: 'cycle-1',
          type: 'anomaly',
          sourceConcepts: [],
          description: 'Non-actionable high confidence',
          noveltyScore: 0.8,
          confidenceScore: 0.9,
          actionable: false, // Should not be applied even with high confidence
          createdAt: new Date(),
        },
      ];

      dreamEngine = createMockDreamEngine({ insightsToReturn: mixedInsights });

      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        {
          autoApplyHighConfidenceInsights: true,
          insightConfidenceThreshold: 0.8,
          minTimeBetweenDreamsMs: 0,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      await scheduler.triggerDream(1000);

      // Only actionable high confidence should be applied
      expect(dreamEngine.applyInsight).toHaveBeenCalledWith('actionable-high');
      expect(dreamEngine.applyInsight).not.toHaveBeenCalledWith('non-actionable-high');
    });
  });

  // ==========================================================================
  // Manual Triggers Tests
  // ==========================================================================

  describe('manual triggers', () => {
    it('should allow manual dream trigger', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        { minTimeBetweenDreamsMs: 0 }
      );
      await scheduler.initialize();
      scheduler.start();

      const result = await scheduler.triggerDream();

      expect(result.cycle.status).toBe('completed');
      expect(dreamEngine.dream).toHaveBeenCalledWith(DEFAULT_DREAM_SCHEDULER_CONFIG.defaultDreamDurationMs);
    });

    it('should support different dream durations', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        {
          minTimeBetweenDreamsMs: 0,
          quickDreamDurationMs: 3000,
          defaultDreamDurationMs: 10000,
          fullDreamDurationMs: 30000,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      // Quick dream
      await scheduler.triggerQuickDream();
      expect(dreamEngine.dream).toHaveBeenLastCalledWith(3000);

      // Reset minimum time check
      vi.advanceTimersByTime(1);

      // Full dream
      await scheduler.triggerFullDream();
      expect(dreamEngine.dream).toHaveBeenLastCalledWith(30000);
    });

    it('should throw if not initialized', async () => {
      scheduler = new DreamScheduler({ dreamEngine, eventBus });

      await expect(scheduler.triggerDream()).rejects.toThrow(
        'DreamScheduler not initialized'
      );
    });
  });

  // ==========================================================================
  // Cleanup Tests
  // ==========================================================================

  describe('cleanup', () => {
    it('should stop timers on dispose', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        { autoScheduleIntervalMs: 60000 }
      );
      await scheduler.initialize();
      scheduler.start();

      expect(scheduler.getStatus().running).toBe(true);

      await scheduler.dispose();

      expect(scheduler.getStatus().running).toBe(false);
      expect(scheduler.getStatus().initialized).toBe(false);
    });

    it('should unsubscribe from events on dispose', async () => {
      const mockUnsubscribe = vi.fn();
      const customEventBus = createMockEventBus();
      customEventBus.subscribe = vi.fn().mockReturnValue({
        unsubscribe: mockUnsubscribe,
        active: true,
      });

      scheduler = new DreamScheduler(
        { dreamEngine, eventBus: customEventBus },
        {
          enableQualityGateFailureTrigger: true,
          enableDomainMilestoneTrigger: true,
        }
      );
      await scheduler.initialize();

      await scheduler.dispose();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
    });

    it('should save state to memory backend on dispose', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus, memoryBackend },
        { minTimeBetweenDreamsMs: 0 }
      );
      await scheduler.initialize();
      scheduler.start();

      // Add some experiences
      scheduler.recordExperience(createTestExperience(0));
      scheduler.recordExperience(createTestExperience(1));

      // Trigger a dream to update state
      await scheduler.triggerDream(1000);

      await scheduler.dispose();

      expect(memoryBackend.set).toHaveBeenCalledWith(
        'dream-scheduler:state',
        expect.objectContaining({
          totalDreamsCompleted: 1,
          experienceBuffer: [],
        }),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // Status Tests
  // ==========================================================================

  describe('status', () => {
    it('should return comprehensive status', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        {
          experienceThreshold: 25,
          minTimeBetweenDreamsMs: 0,
        }
      );
      await scheduler.initialize();
      scheduler.start();

      // Add some experiences
      for (let i = 0; i < 5; i++) {
        scheduler.recordExperience(createTestExperience(i));
      }

      // Trigger a dream
      await scheduler.triggerDream(1000);

      const status = scheduler.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.running).toBe(true);
      expect(status.dreaming).toBe(false);
      expect(status.experienceCount).toBe(0); // Cleared after dream
      expect(status.experienceThreshold).toBe(25);
      expect(status.totalDreamsCompleted).toBe(1);
      expect(status.lastDreamTime).not.toBeNull();
      expect(status.autoSchedulingEnabled).toBe(true);
    });

    it('should track last dream result', async () => {
      scheduler = new DreamScheduler(
        { dreamEngine, eventBus },
        { minTimeBetweenDreamsMs: 0 }
      );
      await scheduler.initialize();
      scheduler.start();

      const result = await scheduler.triggerDream(1000);
      const lastResult = scheduler.getLastDreamResult();

      expect(lastResult).toEqual(result);
      expect(lastResult?.insights).toHaveLength(2);
    });
  });
});

// ============================================================================
// Integration Tests with LearningOptimizationCoordinator
// ============================================================================

describe('DreamScheduler Integration', () => {
  let dreamEngine: ReturnType<typeof createMockDreamEngine>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let memoryBackend: ReturnType<typeof createMockMemoryBackend>;

  beforeEach(() => {
    vi.useFakeTimers();
    dreamEngine = createMockDreamEngine();
    eventBus = createMockEventBus();
    memoryBackend = createMockMemoryBackend();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('with LearningOptimizationCoordinator', () => {
    it('should be initialized when coordinator initializes', async () => {
      // Simulating the pattern where coordinator initializes scheduler
      const scheduler = createDreamScheduler(
        { dreamEngine, eventBus, memoryBackend },
        { autoScheduleIntervalMs: 3600000 }
      );

      await scheduler.initialize();
      expect(scheduler.getStatus().initialized).toBe(true);

      await scheduler.dispose();
    });

    it('should receive experiences from coordinator workflows', async () => {
      const scheduler = createDreamScheduler(
        { dreamEngine, eventBus, memoryBackend },
        {
          experienceThreshold: 10,
          enableExperienceTrigger: false, // Disable to track manually
        }
      );

      await scheduler.initialize();
      scheduler.start();

      // Simulate coordinator recording experiences
      const workflowExperiences = [
        createTestExperience(0, { domain: 'test-generation', taskType: 'generate-tests' }),
        createTestExperience(1, { domain: 'test-execution', taskType: 'run-tests' }),
        createTestExperience(2, { domain: 'coverage-analysis', taskType: 'analyze-coverage' }),
      ];

      for (const exp of workflowExperiences) {
        scheduler.recordExperience(exp);
      }

      expect(scheduler.getStatus().experienceCount).toBe(3);

      const buffer = scheduler.getExperienceBuffer();
      expect(buffer.map((e) => e.domain)).toEqual([
        'test-generation',
        'test-execution',
        'coverage-analysis',
      ]);

      await scheduler.dispose();
    });

    it('should expose dream status via coordinator', async () => {
      const scheduler = createDreamScheduler(
        { dreamEngine, eventBus, memoryBackend },
        { minTimeBetweenDreamsMs: 0 }
      );

      await scheduler.initialize();
      scheduler.start();

      // Before dream
      expect(scheduler.getStatus().totalDreamsCompleted).toBe(0);
      expect(scheduler.getLastDreamResult()).toBeNull();

      // After dream
      await scheduler.triggerDream(1000);

      expect(scheduler.getStatus().totalDreamsCompleted).toBe(1);
      expect(scheduler.getLastDreamResult()).not.toBeNull();
      expect(scheduler.getLastDreamResult()?.insights.length).toBeGreaterThan(0);

      await scheduler.dispose();
    });
  });

  describe('cross-domain dream insights', () => {
    it('should emit events consumable by other domains', async () => {
      const scheduler = createDreamScheduler(
        { dreamEngine, eventBus, memoryBackend },
        { minTimeBetweenDreamsMs: 0 }
      );

      await scheduler.initialize();
      scheduler.start();

      await scheduler.triggerDream(1000);

      // Verify event was published with correct structure
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'learning-optimization:dream:completed',
          source: 'learning-optimization',
          payload: expect.objectContaining({
            cycleId: expect.any(String),
            insightsGenerated: expect.any(Number),
            patternsCreated: expect.any(Number),
            duration: expect.any(Number),
          }),
        })
      );

      await scheduler.dispose();
    });

    it('should include domain-relevant filtering in insights', async () => {
      // Create insights with different domains
      const domainInsights: DreamInsight[] = [
        {
          id: 'test-gen-insight',
          cycleId: 'cycle-1',
          type: 'optimization',
          sourceConcepts: ['test-generation:pattern-1'],
          description: 'Test generation improvement',
          noveltyScore: 0.8,
          confidenceScore: 0.85,
          actionable: true,
          suggestedAction: 'Improve mock generation',
          createdAt: new Date(),
        },
        {
          id: 'coverage-insight',
          cycleId: 'cycle-1',
          type: 'correlation',
          sourceConcepts: ['coverage-analysis:gap-1'],
          description: 'Coverage correlation',
          noveltyScore: 0.7,
          confidenceScore: 0.75,
          actionable: true,
          suggestedAction: 'Add tests for uncovered paths',
          createdAt: new Date(),
        },
      ];

      dreamEngine = createMockDreamEngine({ insightsToReturn: domainInsights });

      const scheduler = createDreamScheduler(
        { dreamEngine, eventBus, memoryBackend },
        { minTimeBetweenDreamsMs: 0, autoApplyHighConfidenceInsights: false }
      );

      await scheduler.initialize();
      scheduler.start();

      const result = await scheduler.triggerDream(1000);

      // Should have domain-specific insights
      expect(result.insights).toHaveLength(2);
      expect(result.insights.some((i) =>
        i.sourceConcepts.some((c) => c.includes('test-generation'))
      )).toBe(true);
      expect(result.insights.some((i) =>
        i.sourceConcepts.some((c) => c.includes('coverage-analysis'))
      )).toBe(true);

      await scheduler.dispose();
    });
  });

  describe('full dream-to-insight-application flow', () => {
    it('should complete full dream-to-insight-application flow', async () => {
      const highQualityInsights: DreamInsight[] = [
        {
          id: 'high-quality-insight',
          cycleId: 'cycle-1',
          type: 'optimization',
          sourceConcepts: ['concept-1', 'concept-2'],
          description: 'High quality actionable insight',
          noveltyScore: 0.9,
          confidenceScore: 0.95,
          actionable: true,
          suggestedAction: 'Apply pattern to improve test coverage',
          createdAt: new Date(),
        },
      ];

      dreamEngine = createMockDreamEngine({ insightsToReturn: highQualityInsights });

      const scheduler = createDreamScheduler(
        { dreamEngine, eventBus, memoryBackend },
        {
          experienceThreshold: 20,
          enableExperienceTrigger: true,
          autoApplyHighConfidenceInsights: true,
          insightConfidenceThreshold: 0.8,
          minTimeBetweenDreamsMs: 0,
          autoScheduleIntervalMs: 3600000,
        }
      );

      await scheduler.initialize();
      scheduler.start();

      // 1. Accumulate experiences
      for (let i = 0; i < 20; i++) {
        scheduler.recordExperience(createTestExperience(i));
      }

      // 2. Wait for dream trigger (experience threshold reached)
      await vi.advanceTimersByTimeAsync(100);

      // 3. Verify dream was triggered
      expect(dreamEngine.dream).toHaveBeenCalled();

      // 4. Verify insights were emitted via event
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'learning-optimization:dream:completed',
        })
      );

      // 5. Verify high-confidence insight was auto-applied
      expect(dreamEngine.applyInsight).toHaveBeenCalledWith('high-quality-insight');

      await scheduler.dispose();
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  let dreamEngine: ReturnType<typeof createMockDreamEngine>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let scheduler: DreamScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = createMockEventBus();
  });

  afterEach(async () => {
    if (scheduler) {
      try {
        await scheduler.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle dream engine failures gracefully', async () => {
    dreamEngine = createMockDreamEngine({ shouldFail: true });

    scheduler = new DreamScheduler(
      { dreamEngine, eventBus },
      { minTimeBetweenDreamsMs: 0 }
    );
    await scheduler.initialize();
    scheduler.start();

    await expect(scheduler.triggerDream(1000)).rejects.toThrow('Dream failed');

    // Status should reflect no successful dreams
    expect(scheduler.getStatus().totalDreamsCompleted).toBe(0);
  });

  it('should reschedule on scheduled dream failure', async () => {
    dreamEngine = createMockDreamEngine({ shouldFail: true });

    scheduler = new DreamScheduler(
      { dreamEngine, eventBus },
      {
        autoScheduleIntervalMs: 10000,
        minTimeBetweenDreamsMs: 0,
      }
    );
    await scheduler.initialize();
    scheduler.start();

    // First scheduled dream fails
    await vi.advanceTimersByTimeAsync(10000);

    // Scheduler should still be running and have rescheduled
    expect(scheduler.getStatus().running).toBe(true);
  });

  it('should handle concurrent experience recording', async () => {
    dreamEngine = createMockDreamEngine();

    scheduler = new DreamScheduler(
      { dreamEngine, eventBus },
      {
        experienceThreshold: 1000, // High threshold to avoid triggering
        enableExperienceTrigger: false,
      }
    );
    await scheduler.initialize();
    scheduler.start();

    // Record many experiences concurrently
    const recordPromises = Array(100)
      .fill(null)
      .map((_, i) => {
        scheduler.recordExperience(createTestExperience(i));
        return Promise.resolve();
      });

    await Promise.all(recordPromises);

    expect(scheduler.getStatus().experienceCount).toBe(100);
  });

  it('should handle insight application failure', async () => {
    const mockEngine = createMockDreamEngine();
    mockEngine.applyInsight = vi.fn().mockRejectedValue(new Error('Apply failed'));

    scheduler = new DreamScheduler(
      { dreamEngine: mockEngine, eventBus },
      {
        autoApplyHighConfidenceInsights: true,
        insightConfidenceThreshold: 0.5,
        minTimeBetweenDreamsMs: 0,
      }
    );
    await scheduler.initialize();
    scheduler.start();

    // Should complete without throwing even if apply fails
    const result = await scheduler.triggerDream(1000);
    expect(result.cycle.status).toBe('completed');
  });

  it('should handle empty insight results', async () => {
    dreamEngine = createMockDreamEngine({ insightsToReturn: [] });

    scheduler = new DreamScheduler(
      { dreamEngine, eventBus },
      { minTimeBetweenDreamsMs: 0 }
    );
    await scheduler.initialize();
    scheduler.start();

    const result = await scheduler.triggerDream(1000);

    expect(result.insights).toHaveLength(0);
    expect(scheduler.getStatus().totalDreamsCompleted).toBe(1);
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  let dreamEngine: ReturnType<typeof createMockDreamEngine>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let memoryBackend: ReturnType<typeof createMockMemoryBackend>;
  let scheduler: DreamScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    dreamEngine = createMockDreamEngine();
    eventBus = createMockEventBus();
    memoryBackend = createMockMemoryBackend();
  });

  afterEach(async () => {
    if (scheduler) {
      try {
        await scheduler.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle rapid start/stop cycles', async () => {
    scheduler = new DreamScheduler(
      { dreamEngine, eventBus },
      { autoScheduleIntervalMs: 1000 }
    );
    await scheduler.initialize();

    // Rapid start/stop cycles
    for (let i = 0; i < 10; i++) {
      scheduler.start();
      scheduler.stop();
    }

    expect(scheduler.getStatus().running).toBe(false);
    expect(scheduler.getStatus().initialized).toBe(true);
  });

  it('should handle multiple initializations gracefully', async () => {
    scheduler = new DreamScheduler({ dreamEngine, eventBus });

    // Multiple initialization calls should be idempotent
    await scheduler.initialize();
    await scheduler.initialize();
    await scheduler.initialize();

    expect(scheduler.getStatus().initialized).toBe(true);
  });

  it('should handle state restoration with corrupted data', async () => {
    // Return corrupted state
    memoryBackend.get = vi.fn().mockResolvedValue({
      lastDreamTime: 'invalid-date',
      totalDreamsCompleted: 'not-a-number',
      experienceBuffer: 'not-an-array',
    });

    scheduler = new DreamScheduler({ dreamEngine, eventBus, memoryBackend });

    // Should not throw during initialization
    await scheduler.initialize();
    expect(scheduler.getStatus().initialized).toBe(true);
  });

  it('should handle memory backend save failures', async () => {
    memoryBackend.set = vi.fn().mockRejectedValue(new Error('Save failed'));

    scheduler = new DreamScheduler({ dreamEngine, eventBus, memoryBackend });
    await scheduler.initialize();
    scheduler.start();

    // Dispose should complete even if save fails
    await scheduler.dispose();
    expect(scheduler.getStatus().initialized).toBe(false);
  });

  it('should handle very long experience buffers', async () => {
    scheduler = new DreamScheduler(
      { dreamEngine, eventBus },
      {
        experienceThreshold: 10000,
        enableExperienceTrigger: false,
      }
    );
    await scheduler.initialize();
    scheduler.start();

    // Add many experiences
    for (let i = 0; i < 1000; i++) {
      scheduler.recordExperience(createTestExperience(i));
    }

    expect(scheduler.getStatus().experienceCount).toBe(1000);
    expect(scheduler.getExperienceBuffer()).toHaveLength(1000);
  });

  it('should handle dream trigger exactly at threshold', async () => {
    scheduler = new DreamScheduler(
      { dreamEngine, eventBus },
      {
        experienceThreshold: 5,
        enableExperienceTrigger: true,
        minTimeBetweenDreamsMs: 0,
        autoScheduleIntervalMs: 3600000,
      }
    );
    await scheduler.initialize();
    scheduler.start();

    // Add exactly threshold experiences
    for (let i = 0; i < 5; i++) {
      scheduler.recordExperience(createTestExperience(i));
    }

    await vi.advanceTimersByTimeAsync(100);

    expect(dreamEngine.dream).toHaveBeenCalledTimes(1);
  });

  it('should handle event subscription failures gracefully', async () => {
    const failingEventBus = createMockEventBus();
    failingEventBus.subscribe = vi.fn().mockImplementation(() => {
      throw new Error('Subscription failed');
    });

    scheduler = new DreamScheduler(
      { dreamEngine, eventBus: failingEventBus },
      {
        enableQualityGateFailureTrigger: true,
      }
    );

    // Should throw during initialization if subscription fails
    await expect(scheduler.initialize()).rejects.toThrow('Subscription failed');
  });

  it('should handle zero experience threshold', async () => {
    scheduler = new DreamScheduler(
      { dreamEngine, eventBus },
      {
        experienceThreshold: 0, // Edge case: zero threshold
        enableExperienceTrigger: true,
        minTimeBetweenDreamsMs: 0,
        autoScheduleIntervalMs: 3600000,
      }
    );
    await scheduler.initialize();
    scheduler.start();

    // Recording any experience should not crash
    scheduler.recordExperience(createTestExperience(0));

    await vi.advanceTimersByTimeAsync(100);

    // Behavior with zero threshold is undefined but should not crash
    expect(scheduler.getStatus().initialized).toBe(true);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('Factory Functions', () => {
  it('createDreamScheduler should create scheduler with dependencies', async () => {
    const dreamEngine = createMockDreamEngine();
    const eventBus = createMockEventBus();

    const scheduler = createDreamScheduler({ dreamEngine, eventBus });

    expect(scheduler).toBeInstanceOf(DreamScheduler);

    await scheduler.initialize();
    expect(scheduler.getStatus().initialized).toBe(true);

    await scheduler.dispose();
  });

  it('createDreamScheduler should accept partial config', async () => {
    const dreamEngine = createMockDreamEngine();
    const eventBus = createMockEventBus();

    const scheduler = createDreamScheduler(
      { dreamEngine, eventBus },
      {
        experienceThreshold: 50,
        autoScheduleIntervalMs: 7200000, // 2 hours
      }
    );

    await scheduler.initialize();

    const status = scheduler.getStatus();
    expect(status.experienceThreshold).toBe(50);

    await scheduler.dispose();
  });
});
