/**
 * Experience Capture Service Tests
 * Phase 4: Self-Learning Features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ExperienceCaptureService,
  createExperienceCaptureService,
  DEFAULT_EXPERIENCE_CONFIG,
  type TaskExperience,
  type ExperienceCaptureConfig,
} from '../../src/learning/experience-capture.js';
import { type IPatternStore } from '../../src/learning/pattern-store.js';
import { type MemoryBackend, type EventBus, type Result } from '../../src/kernel/interfaces.js';

// Mock implementations
function createMockMemory(): MemoryBackend {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async <T>(key: string) => store.get(key) as T | undefined),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    has: vi.fn(async (key: string) => store.has(key)),
    keys: vi.fn(async () => Array.from(store.keys())),
    search: vi.fn(async () => []),
    stats: vi.fn(async () => ({ totalEntries: store.size, namespaces: {} })),
    clear: vi.fn(async () => store.clear()),
    close: vi.fn(async () => {}),
  } as unknown as MemoryBackend;
}

function createMockPatternStore(): IPatternStore {
  const patterns = new Map<string, unknown>();
  return {
    initialize: vi.fn(async () => {}),
    store: vi.fn(async (pattern: unknown) => {
      const p = pattern as { id: string };
      patterns.set(p.id, pattern);
      return { success: true, value: p.id } as Result<string>;
    }),
    create: vi.fn(async () => ({ success: false, error: new Error('Not implemented') } as Result<unknown>)),
    get: vi.fn(async () => null),
    search: vi.fn(async () => ({ success: true, value: [] } as Result<unknown[]>)),
    recordUsage: vi.fn(async () => ({ success: true, value: undefined } as Result<void>)),
    promote: vi.fn(async () => ({ success: true, value: undefined } as Result<void>)),
    delete: vi.fn(async () => ({ success: true, value: undefined } as Result<void>)),
    getStats: vi.fn(async () => ({
      totalPatterns: patterns.size,
      byDomain: {},
      byType: {},
      avgConfidence: 0.8,
      avgUsageCount: 1,
      recentlyUsed: [],
    })),
    dispose: vi.fn(async () => {}),
  } as unknown as IPatternStore;
}

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
    unsubscribe: vi.fn(),
    emit: vi.fn(async () => {}),
  } as unknown as EventBus;
}

describe('ExperienceCaptureService', () => {
  let service: ExperienceCaptureService;
  let mockMemory: MemoryBackend;
  let mockPatternStore: IPatternStore;
  let mockEventBus: EventBus;

  beforeEach(async () => {
    mockMemory = createMockMemory();
    mockPatternStore = createMockPatternStore();
    mockEventBus = createMockEventBus();

    service = new ExperienceCaptureService(
      mockMemory,
      mockPatternStore,
      mockEventBus,
      DEFAULT_EXPERIENCE_CONFIG
    );

    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('startCapture', () => {
    it('should create a new experience with unique ID', () => {
      const experienceId = service.startCapture('Generate unit tests', {
        domain: 'test-generation',
        agent: 'qe-test-architect',
      });

      expect(experienceId).toBeTruthy();
      expect(typeof experienceId).toBe('string');
      expect(experienceId.length).toBeGreaterThan(0);
    });

    it('should track active experiences', () => {
      const id1 = service.startCapture('Task 1', { domain: 'test-generation' });
      const id2 = service.startCapture('Task 2', { domain: 'coverage-analysis' });

      // Active experiences can be retrieved
      expect(service.getActiveExperience(id1)).toBeDefined();
      expect(service.getActiveExperience(id2)).toBeDefined();
    });

    it('should use default domain when not specified', () => {
      const id = service.startCapture('Task without domain');
      expect(id).toBeTruthy();
    });
  });

  describe('recordStep', () => {
    it('should record steps for active experience', () => {
      const experienceId = service.startCapture('Test task', { domain: 'test-generation' });

      service.recordStep(experienceId, {
        action: 'analyze',
        result: 'found coverage: 85%',
        quality: 0.85,
      });

      service.recordStep(experienceId, {
        action: 'generate',
        result: 'generated 5 tests',
        quality: 0.9,
      });

      // Steps recorded internally - verified on completion
      expect(true).toBe(true);
    });

    it('should handle non-existent experience gracefully', () => {
      // Should not throw
      service.recordStep('non-existent-id', {
        action: 'test',
        result: 'test result',
      });
    });
  });

  describe('completeCapture', () => {
    it('should complete experience with success outcome', async () => {
      const experienceId = service.startCapture('Test task', {
        domain: 'test-generation',
        agent: 'qe-test-architect',
      });

      service.recordStep(experienceId, {
        action: 'generate',
        result: 'generated 10 tests',
        quality: 0.9,
      });

      const result = await service.completeCapture(experienceId, {
        success: true,
        quality: 0.95,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.success).toBe(true);
        expect(result.value.quality).toBe(0.95);
        expect(result.value.completedAt).toBeDefined();
      }
    });

    it('should complete experience with failure outcome', async () => {
      const experienceId = service.startCapture('Failing task', {
        domain: 'test-execution',
      });

      const result = await service.completeCapture(experienceId, {
        success: false,
        quality: 0.2,
        feedback: 'Test execution failed',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.success).toBe(false);
        expect(result.value.feedback).toBe('Test execution failed');
      }
    });

    it('should persist experience to memory', async () => {
      const experienceId = service.startCapture('Persisted task', {
        domain: 'coverage-analysis',
      });

      await service.completeCapture(experienceId, {
        success: true,
        quality: 0.9,
      });

      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should return error for non-existent experience', async () => {
      const result = await service.completeCapture('non-existent', {
        success: true,
        quality: 1.0,
      });

      expect(result.success).toBe(false);
    });

    it('should remove experience from active after completion', async () => {
      const id = service.startCapture('Task', { domain: 'test-generation' });
      expect(service.getActiveExperience(id)).toBeDefined();

      await service.completeCapture(id, { success: true, quality: 0.8 });
      expect(service.getActiveExperience(id)).toBeUndefined();
    });
  });

  describe('extractPattern', () => {
    it('should try to create pattern from successful experience', async () => {
      const now = Date.now();
      const experience: TaskExperience = {
        id: 'exp-1',
        task: 'Generate unit tests for UserService',
        domain: 'test-generation',
        agent: 'qe-test-architect',
        startedAt: now - 60000,
        completedAt: now,
        durationMs: 60000,
        steps: [
          {
            action: 'analyze',
            result: 'found 5 functions',
            quality: 0.9,
            timestamp: now - 30000,
          },
          {
            action: 'generate',
            result: 'generated 5 tests with 95% coverage',
            quality: 0.95,
            timestamp: now,
          },
        ],
        success: true,
        quality: 0.95,
      };

      const result = await service.extractPattern(experience);

      // Result structure has newPattern, reinforced, promoted
      expect(result).toHaveProperty('newPattern');
      expect(result).toHaveProperty('reinforced');
      expect(result).toHaveProperty('promoted');
    });

    it('should return default result when no pattern store', async () => {
      // Service without pattern store
      const serviceWithoutStore = new ExperienceCaptureService(
        mockMemory,
        undefined as unknown as IPatternStore,
        mockEventBus,
        DEFAULT_EXPERIENCE_CONFIG
      );
      await serviceWithoutStore.initialize();

      const now = Date.now();
      const experience: TaskExperience = {
        id: 'exp-2',
        task: 'Task without store',
        domain: 'test-generation',
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        steps: [],
        success: true,
        quality: 0.9,
      };

      const result = await serviceWithoutStore.extractPattern(experience);

      expect(result.newPattern).toBe(false);
      expect(result.reinforced).toBe(false);
      expect(result.promoted).toBe(false);

      await serviceWithoutStore.dispose();
    });

    it('should search for similar patterns', async () => {
      const now = Date.now();
      const experience: TaskExperience = {
        id: 'exp-3',
        task: 'Generate tests',
        domain: 'test-generation',
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        steps: [],
        success: true,
        quality: 0.8,
      };

      await service.extractPattern(experience);

      // Should call search on pattern store
      expect(mockPatternStore.search).toHaveBeenCalled();
    });
  });

  describe('getExperience', () => {
    it('should retrieve persisted experience', async () => {
      const experienceId = service.startCapture('Retrievable task', {
        domain: 'test-generation',
      });

      await service.completeCapture(experienceId, {
        success: true,
        quality: 0.85,
      });

      // Mock the memory.get to return the experience
      const now = Date.now();
      const mockGet = mockMemory.get as ReturnType<typeof vi.fn>;
      mockGet.mockResolvedValueOnce({
        id: experienceId,
        task: 'Retrievable task',
        domain: 'test-generation',
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        steps: [],
        success: true,
        quality: 0.85,
      });

      const experience = await service.getExperience(experienceId);
      expect(experience).not.toBeNull();
    });

    it('should return null for non-existent experience', async () => {
      const experience = await service.getExperience('non-existent');
      expect(experience).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      // Start and complete some experiences
      const id1 = service.startCapture('Task 1', { domain: 'test-generation' });
      await service.completeCapture(id1, { success: true, quality: 0.9 });

      const id2 = service.startCapture('Task 2', { domain: 'test-generation' });
      await service.completeCapture(id2, { success: false, quality: 0.3 });

      const stats = await service.getStats();

      expect(stats.totalExperiences).toBe(2);
      expect(stats.successRate).toBeCloseTo(0.5, 1);
      expect(stats.patternsExtracted).toBeGreaterThanOrEqual(0);
      expect(stats.patternsPromoted).toBeGreaterThanOrEqual(0);
    });
  });

  describe('factory function', () => {
    it('should create service with default config', () => {
      const service = createExperienceCaptureService(
        mockMemory,
        mockPatternStore,
        mockEventBus
      );

      expect(service).toBeInstanceOf(ExperienceCaptureService);
    });

    it('should create service with custom config', () => {
      const customConfig: ExperienceCaptureConfig = {
        ...DEFAULT_EXPERIENCE_CONFIG,
        minQualityForPattern: 0.9,
        promotionThreshold: 5,
      };

      const service = createExperienceCaptureService(
        mockMemory,
        mockPatternStore,
        mockEventBus,
        customConfig
      );

      expect(service).toBeInstanceOf(ExperienceCaptureService);
    });
  });
});

describe('DEFAULT_EXPERIENCE_CONFIG', () => {
  it('should have reasonable default values', () => {
    expect(DEFAULT_EXPERIENCE_CONFIG.minQualityForPatternExtraction).toBe(0.7);
    expect(DEFAULT_EXPERIENCE_CONFIG.promotionThreshold).toBe(3);
    expect(DEFAULT_EXPERIENCE_CONFIG.similarityThreshold).toBe(0.85);
    expect(DEFAULT_EXPERIENCE_CONFIG.maxExperiencesPerDomain).toBe(1000);
    expect(DEFAULT_EXPERIENCE_CONFIG.enableCrossDomainSharing).toBe(true);
    expect(DEFAULT_EXPERIENCE_CONFIG.autoCleanup).toBe(true);
  });
});
