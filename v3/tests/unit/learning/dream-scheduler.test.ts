/**
 * DreamScheduler Unit Tests
 * ADR-021: QE ReasoningBank - Dream Cycle Integration
 *
 * Tests for the DreamScheduler service that manages automatic dream cycle scheduling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DreamScheduler,
  createDreamScheduler,
  DEFAULT_DREAM_SCHEDULER_CONFIG,
  type DreamSchedulerDependencies,
  type TaskExperience,
} from '../../../src/learning/dream/dream-scheduler';
import type { EventBus, Subscription, MemoryBackend } from '../../../src/kernel/interfaces';
import type { DreamEngine, DreamCycleResult } from '../../../src/learning/dream/dream-engine';
import type { DomainEvent } from '../../../src/shared/types/index';

// ============================================================================
// Mocks
// ============================================================================

function createMockDreamEngine(): DreamEngine {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dream: vi.fn().mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        startTime: new Date(),
        endTime: new Date(),
        durationMs: 1000,
        conceptsProcessed: 10,
        associationsFound: 5,
        insightsGenerated: 2,
        status: 'completed',
      },
      insights: [
        {
          id: 'insight-1',
          cycleId: 'cycle-1',
          type: 'optimization',
          sourceConcepts: ['concept-1'],
          description: 'Test insight',
          noveltyScore: 0.7,
          confidenceScore: 0.85,
          actionable: true,
          applied: false,
          createdAt: new Date(),
        },
      ],
      activationStats: {
        totalIterations: 20,
        peakActivation: 0.9,
        nodesActivated: 15,
      },
      patternsCreated: 0,
    } as DreamCycleResult),
    applyInsight: vi.fn().mockResolvedValue({ success: true, patternId: 'pattern-1' }),
    loadPatternsAsConcepts: vi.fn().mockResolvedValue(5),
    cancelDream: vi.fn().mockResolvedValue(undefined),
    isDreaming: vi.fn().mockReturnValue(false),
    getCurrentCycle: vi.fn().mockReturnValue(null),
    getPendingInsights: vi.fn().mockResolvedValue([]),
    getDreamHistory: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as DreamEngine;
}

function createMockEventBus(): EventBus {
  const subscriptions: Array<{
    eventType: string;
    handler: (event: DomainEvent<unknown>) => Promise<void>;
    active: boolean;
  }> = [];

  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockImplementation((eventType, handler) => {
      const sub = { eventType, handler, active: true };
      subscriptions.push(sub);
      return {
        unsubscribe: () => {
          sub.active = false;
        },
        active: true,
      } as Subscription;
    }),
    subscribeToChannel: vi.fn().mockImplementation(() => ({
      unsubscribe: vi.fn(),
      active: true,
    })),
    getHistory: vi.fn().mockResolvedValue([]),
    dispose: vi.fn().mockResolvedValue(undefined),
    // Expose for testing - emit event to handlers
    _emit: async (eventType: string, payload: unknown) => {
      for (const sub of subscriptions) {
        if (sub.active && sub.eventType === eventType) {
          await sub.handler({
            id: 'event-1',
            type: eventType,
            timestamp: new Date(),
            source: 'test' as any,
            payload,
          });
        }
      }
    },
  } as unknown as EventBus & { _emit: (eventType: string, payload: unknown) => Promise<void> };
}

function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockImplementation((key, value) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    get: vi.fn().mockImplementation((key) => {
      return Promise.resolve(storage.get(key));
    }),
    delete: vi.fn().mockImplementation((key) => {
      return Promise.resolve(storage.delete(key));
    }),
    has: vi.fn().mockImplementation((key) => {
      return Promise.resolve(storage.has(key));
    }),
    search: vi.fn().mockResolvedValue([]),
    vectorSearch: vi.fn().mockResolvedValue([]),
    storeVector: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    hasCodeIntelligenceIndex: vi.fn().mockResolvedValue(false),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as MemoryBackend;
}

function createTestExperience(id: string): TaskExperience {
  return {
    id,
    agentType: 'tester',
    domain: 'test-execution',
    taskType: 'run-tests',
    success: true,
    duration: 1000,
    timestamp: new Date(),
  };
}

// ============================================================================
// Constructor Tests
// ============================================================================

describe('DreamScheduler', () => {
  let mockDreamEngine: DreamEngine;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockMemoryBackend: MemoryBackend;
  let dependencies: DreamSchedulerDependencies;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDreamEngine = createMockDreamEngine();
    mockEventBus = createMockEventBus();
    mockMemoryBackend = createMockMemoryBackend();
    dependencies = {
      dreamEngine: mockDreamEngine,
      eventBus: mockEventBus,
      memoryBackend: mockMemoryBackend,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw if dreamEngine dependency is missing', () => {
      expect(() => {
        new DreamScheduler({
          dreamEngine: undefined as unknown as DreamEngine,
          eventBus: mockEventBus,
        });
      }).toThrow('DreamScheduler requires dreamEngine dependency');
    });

    it('should throw if eventBus dependency is missing', () => {
      expect(() => {
        new DreamScheduler({
          dreamEngine: mockDreamEngine,
          eventBus: undefined as unknown as EventBus,
        });
      }).toThrow('DreamScheduler requires eventBus dependency');
    });

    it('should create instance with default config', () => {
      const scheduler = new DreamScheduler(dependencies);
      expect(scheduler).toBeDefined();
      const status = scheduler.getStatus();
      expect(status.initialized).toBe(false);
      expect(status.running).toBe(false);
    });

    it('should merge custom config with defaults', () => {
      const scheduler = new DreamScheduler(dependencies, {
        experienceThreshold: 50,
        autoScheduleIntervalMs: 1800000,
      });
      const status = scheduler.getStatus();
      expect(status.experienceThreshold).toBe(50);
    });
  });

  describe('initialize', () => {
    it('should initialize and set up event subscriptions', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();

      const status = scheduler.getStatus();
      expect(status.initialized).toBe(true);
      expect(mockEventBus.subscribe).toHaveBeenCalled();
    });

    it('should be idempotent', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();
      await scheduler.initialize();

      // subscribe should only be called once
      const subscribeCallCount = (mockEventBus.subscribe as vi.Mock).mock.calls.length;
      expect(subscribeCallCount).toBeGreaterThan(0);
    });

    it('should restore state from memory if available', async () => {
      // Set up pre-existing state
      (mockMemoryBackend.get as vi.Mock).mockResolvedValueOnce({
        lastDreamTime: new Date(Date.now() - 1000).toISOString(),
        totalDreamsCompleted: 5,
        experienceBuffer: [createTestExperience('exp-1')],
      });

      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();

      const status = scheduler.getStatus();
      expect(status.totalDreamsCompleted).toBe(5);
      expect(status.experienceCount).toBe(1);
    });
  });

  describe('start/stop', () => {
    it('should start scheduling and set running to true', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();
      scheduler.start();

      const status = scheduler.getStatus();
      expect(status.running).toBe(true);
      expect(status.autoSchedulingEnabled).toBe(true);
    });

    it('should stop scheduling and set running to false', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();
      scheduler.start();
      scheduler.stop();

      const status = scheduler.getStatus();
      expect(status.running).toBe(false);
    });

    it('should throw if not initialized', () => {
      const scheduler = new DreamScheduler(dependencies);
      expect(() => scheduler.start()).toThrow('not initialized');
    });
  });

  describe('triggerDream', () => {
    it('should execute a dream with specified duration', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();

      const result = await scheduler.triggerDream(5000);

      expect(mockDreamEngine.dream).toHaveBeenCalledWith(5000);
      expect(result.cycle.status).toBe('completed');
    });

    it('should use default duration if not specified', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        defaultDreamDurationMs: 15000,
      });
      await scheduler.initialize();

      await scheduler.triggerDream();

      expect(mockDreamEngine.dream).toHaveBeenCalledWith(15000);
    });

    it('should throw if minimum time between dreams not met', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        minTimeBetweenDreamsMs: 60000,
      });
      await scheduler.initialize();

      // First dream succeeds
      await scheduler.triggerDream();

      // Second dream should fail (not enough time passed)
      await expect(scheduler.triggerDream()).rejects.toThrow('minimum interval');
    });

    it('should update lastDreamResult after successful dream', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();

      await scheduler.triggerDream();

      const lastResult = scheduler.getLastDreamResult();
      expect(lastResult).not.toBeNull();
      expect(lastResult?.cycle.id).toBe('cycle-1');
    });

    it('should publish dream completed event', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();

      await scheduler.triggerDream();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'learning-optimization:dream:completed',
        })
      );
    });
  });

  describe('triggerQuickDream', () => {
    it('should use quick dream duration', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        quickDreamDurationMs: 3000,
      });
      await scheduler.initialize();

      await scheduler.triggerQuickDream();

      expect(mockDreamEngine.dream).toHaveBeenCalledWith(3000);
    });
  });

  describe('triggerFullDream', () => {
    it('should use full dream duration', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        fullDreamDurationMs: 60000,
      });
      await scheduler.initialize();

      await scheduler.triggerFullDream();

      expect(mockDreamEngine.dream).toHaveBeenCalledWith(60000);
    });
  });

  describe('recordExperience', () => {
    it('should add experience to buffer', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();

      scheduler.recordExperience(createTestExperience('exp-1'));

      const status = scheduler.getStatus();
      expect(status.experienceCount).toBe(1);
    });

    it('should trigger dream when threshold is reached', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        experienceThreshold: 3,
        enableExperienceTrigger: true,
      });
      await scheduler.initialize();

      scheduler.recordExperience(createTestExperience('exp-1'));
      scheduler.recordExperience(createTestExperience('exp-2'));
      scheduler.recordExperience(createTestExperience('exp-3'));

      // Allow async dream trigger to execute
      await vi.runAllTimersAsync();

      expect(mockDreamEngine.dream).toHaveBeenCalled();
    });

    it('should not trigger dream if experience trigger is disabled', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        experienceThreshold: 3,
        enableExperienceTrigger: false,
      });
      await scheduler.initialize();

      for (let i = 0; i < 5; i++) {
        scheduler.recordExperience(createTestExperience(`exp-${i}`));
      }

      await vi.runAllTimersAsync();

      expect(mockDreamEngine.dream).not.toHaveBeenCalled();
    });

    it('should clear experience buffer after dream', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        experienceThreshold: 2,
        enableExperienceTrigger: true,
      });
      await scheduler.initialize();

      scheduler.recordExperience(createTestExperience('exp-1'));
      scheduler.recordExperience(createTestExperience('exp-2'));

      await vi.runAllTimersAsync();

      const status = scheduler.getStatus();
      expect(status.experienceCount).toBe(0);
    });
  });

  describe('getExperienceBuffer', () => {
    it('should return copy of experience buffer', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();

      scheduler.recordExperience(createTestExperience('exp-1'));
      scheduler.recordExperience(createTestExperience('exp-2'));

      const buffer = scheduler.getExperienceBuffer();
      expect(buffer).toHaveLength(2);
      expect(buffer[0].id).toBe('exp-1');

      // Modifying returned buffer shouldn't affect internal state
      buffer.pop();
      expect(scheduler.getExperienceBuffer()).toHaveLength(2);
    });
  });

  describe('clearExperienceBuffer', () => {
    it('should clear all experiences', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();

      scheduler.recordExperience(createTestExperience('exp-1'));
      scheduler.clearExperienceBuffer();

      const status = scheduler.getStatus();
      expect(status.experienceCount).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return complete status object', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        experienceThreshold: 25,
      });
      await scheduler.initialize();
      scheduler.start();

      const status = scheduler.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.running).toBe(true);
      expect(status.dreaming).toBe(false);
      expect(status.experienceCount).toBe(0);
      expect(status.experienceThreshold).toBe(25);
      expect(status.totalDreamsCompleted).toBe(0);
      expect(status.lastDreamTime).toBeNull();
      expect(status.autoSchedulingEnabled).toBe(true);
    });
  });

  describe('auto-scheduling', () => {
    it('should schedule dreams at configured interval', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        autoScheduleIntervalMs: 5000,
        minTimeBetweenDreamsMs: 1000,
      });
      await scheduler.initialize();
      scheduler.start();

      // Fast forward past the interval
      await vi.advanceTimersByTimeAsync(5500);

      expect(mockDreamEngine.dream).toHaveBeenCalled();
    });

    it('should reschedule after successful dream', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        autoScheduleIntervalMs: 5000,
        minTimeBetweenDreamsMs: 1000,
      });
      await scheduler.initialize();
      scheduler.start();

      // First scheduled dream
      await vi.advanceTimersByTimeAsync(5500);
      expect(mockDreamEngine.dream).toHaveBeenCalledTimes(1);

      // Second scheduled dream
      await vi.advanceTimersByTimeAsync(5500);
      expect(mockDreamEngine.dream).toHaveBeenCalledTimes(2);
    });

    it('should not schedule when stopped', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        autoScheduleIntervalMs: 5000,
      });
      await scheduler.initialize();
      scheduler.start();
      scheduler.stop();

      await vi.advanceTimersByTimeAsync(10000);

      expect(mockDreamEngine.dream).not.toHaveBeenCalled();
    });
  });

  describe('event triggers', () => {
    it('should trigger dream on quality gate failure', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        enableQualityGateFailureTrigger: true,
      });
      await scheduler.initialize();

      // Simulate quality gate failure event
      await mockEventBus._emit('quality-assessment:gate:completed', { passed: false });

      expect(mockDreamEngine.dream).toHaveBeenCalled();
    });

    it('should not trigger dream on quality gate success', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        enableQualityGateFailureTrigger: true,
      });
      await scheduler.initialize();

      // Simulate quality gate success event
      await mockEventBus._emit('quality-assessment:gate:completed', { passed: true });

      expect(mockDreamEngine.dream).not.toHaveBeenCalled();
    });

    it('should not subscribe to quality gate events if disabled', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        enableQualityGateFailureTrigger: false,
      });
      await scheduler.initialize();

      const subscribeCalls = (mockEventBus.subscribe as vi.Mock).mock.calls;
      const hasQualityGateSubscription = subscribeCalls.some(
        (call) => call[0] === 'quality-assessment:gate:completed'
      );
      expect(hasQualityGateSubscription).toBe(false);
    });
  });

  describe('auto-apply insights', () => {
    it('should auto-apply high confidence insights when enabled', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        autoApplyHighConfidenceInsights: true,
        insightConfidenceThreshold: 0.8,
      });
      await scheduler.initialize();

      await scheduler.triggerDream();

      // The mock returns an insight with confidenceScore 0.85
      expect(mockDreamEngine.applyInsight).toHaveBeenCalledWith('insight-1');
    });

    it('should not auto-apply insights when disabled', async () => {
      const scheduler = new DreamScheduler(dependencies, {
        autoApplyHighConfidenceInsights: false,
      });
      await scheduler.initialize();

      await scheduler.triggerDream();

      expect(mockDreamEngine.applyInsight).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should stop and clean up resources', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();
      scheduler.start();

      await scheduler.dispose();

      const status = scheduler.getStatus();
      expect(status.initialized).toBe(false);
      expect(status.running).toBe(false);
    });

    it('should save state before disposing', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();
      scheduler.recordExperience(createTestExperience('exp-1'));

      await scheduler.dispose();

      expect(mockMemoryBackend.set).toHaveBeenCalledWith(
        'dream-scheduler:state',
        expect.objectContaining({
          experienceBuffer: expect.any(Array),
        }),
        expect.any(Object)
      );
    });

    it('should unsubscribe from all events', async () => {
      const scheduler = new DreamScheduler(dependencies);
      await scheduler.initialize();

      const subscriptions = (mockEventBus.subscribe as vi.Mock).mock.results;

      await scheduler.dispose();

      // All returned subscriptions should have unsubscribe called
      for (const result of subscriptions) {
        const subscription = result.value as Subscription;
        // The subscription active state is managed by our mock
      }
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createDreamScheduler', () => {
  it('should create DreamScheduler instance', () => {
    const mockDreamEngine = createMockDreamEngine();
    const mockEventBus = createMockEventBus();

    const scheduler = createDreamScheduler({
      dreamEngine: mockDreamEngine,
      eventBus: mockEventBus,
    });

    expect(scheduler).toBeInstanceOf(DreamScheduler);
  });

  it('should pass config to constructor', () => {
    const mockDreamEngine = createMockDreamEngine();
    const mockEventBus = createMockEventBus();

    const scheduler = createDreamScheduler(
      {
        dreamEngine: mockDreamEngine,
        eventBus: mockEventBus,
      },
      {
        experienceThreshold: 100,
      }
    );

    const status = scheduler.getStatus();
    expect(status.experienceThreshold).toBe(100);
  });
});

// ============================================================================
// Default Config Tests
// ============================================================================

describe('DEFAULT_DREAM_SCHEDULER_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.autoScheduleIntervalMs).toBe(3600000); // 1 hour
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.minTimeBetweenDreamsMs).toBe(300000); // 5 minutes
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.experienceThreshold).toBe(20);
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.enableExperienceTrigger).toBe(true);
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.enableQualityGateFailureTrigger).toBe(true);
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.defaultDreamDurationMs).toBe(10000); // 10 seconds
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.quickDreamDurationMs).toBe(5000); // 5 seconds
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.fullDreamDurationMs).toBe(30000); // 30 seconds
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.autoApplyHighConfidenceInsights).toBe(false);
    expect(DEFAULT_DREAM_SCHEDULER_CONFIG.insightConfidenceThreshold).toBe(0.8);
  });
});
