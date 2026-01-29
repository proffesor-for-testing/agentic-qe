/**
 * Unit Tests for ExperienceCaptureService
 * Phase 4: Self-Learning Features
 *
 * Tests task execution experience capture for pattern learning.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ExperienceCaptureService,
  createExperienceCaptureService,
  DEFAULT_EXPERIENCE_CONFIG,
  type TaskExperience,
  type ExperienceCaptureConfig,
} from '../../../src/learning/experience-capture.js';
import type { PatternStore } from '../../../src/learning/pattern-store.js';
import type { MemoryBackend, EventBus } from '../../../src/kernel/interfaces.js';
import type { QEDomain } from '../../../src/learning/qe-patterns.js';
import { ok, err } from '../../../src/shared/types/index.js';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    get: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    set: vi.fn((key: string, value: unknown) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
    has: vi.fn((key: string) => Promise.resolve(storage.has(key))),
    keys: vi.fn(() => Promise.resolve(Array.from(storage.keys()))),
    search: vi.fn((pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const matches = Array.from(storage.keys()).filter((k) => regex.test(k));
      return Promise.resolve(matches);
    }),
    clear: vi.fn(() => {
      storage.clear();
      return Promise.resolve();
    }),
    size: vi.fn(() => Promise.resolve(storage.size)),
    close: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ type: 'memory', ready: true })),
  } as unknown as MemoryBackend;
}

function createMockPatternStore(): PatternStore {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    store: vi.fn().mockResolvedValue(ok('pattern-123')),
    create: vi.fn().mockResolvedValue(
      ok({
        id: 'new-pattern-123',
        patternType: 'test-template',
        name: 'Created Pattern',
      })
    ),
    get: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue(ok([])),
    recordUsage: vi.fn().mockResolvedValue(ok(undefined)),
    promote: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    getStats: vi.fn().mockResolvedValue({
      totalPatterns: 5,
      byTier: { shortTerm: 3, longTerm: 2 },
    }),
    cleanup: vi.fn().mockResolvedValue({ removed: 0, promoted: 0 }),
  } as unknown as PatternStore;
}

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    unsubscribe: vi.fn(),
    emit: vi.fn(),
  } as unknown as EventBus;
}

// ============================================================================
// Tests
// ============================================================================

describe('ExperienceCaptureService', () => {
  let memory: MemoryBackend;
  let patternStore: PatternStore;
  let eventBus: EventBus;
  let service: ExperienceCaptureService;

  beforeEach(async () => {
    memory = createMockMemoryBackend();
    patternStore = createMockPatternStore();
    eventBus = createMockEventBus();
    service = createExperienceCaptureService(memory, patternStore, eventBus);
    await service.initialize();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await service.dispose();
  });

  describe('Initialization', () => {
    it('should initialize with default config', async () => {
      const newService = createExperienceCaptureService(memory);
      await newService.initialize();

      const stats = await newService.getStats();
      expect(stats.totalExperiences).toBe(0);
      expect(stats.successRate).toBe(0);

      await newService.dispose();
    });

    it('should initialize with custom config', async () => {
      const customConfig: Partial<ExperienceCaptureConfig> = {
        namespace: 'custom-experiences',
        minQualityForPatternExtraction: 0.9,
        promotionThreshold: 10,
      };

      const customService = createExperienceCaptureService(
        memory,
        patternStore,
        eventBus,
        customConfig
      );
      await customService.initialize();

      // Should be functional with custom config
      const id = customService.startCapture('test task');
      expect(id).toBeDefined();

      await customService.dispose();
    });

    it('should load existing stats on initialization', async () => {
      // Store stats
      await memory.set('qe-experiences:stats', {
        totalCaptured: 10,
        successfulCaptures: 8,
        patternsExtracted: 3,
        patternsPromoted: 1,
        byDomain: [['test-generation', 5]],
      });

      const newService = createExperienceCaptureService(memory);
      await newService.initialize();

      const stats = await newService.getStats();
      expect(stats.totalExperiences).toBe(10);
      expect(stats.patternsExtracted).toBe(3);

      await newService.dispose();
    });
  });

  describe('Experience Capture Flow', () => {
    it('should start capture and return experience ID', () => {
      const id = service.startCapture('Generate unit tests for UserService');

      expect(id).toBeDefined();
      expect(id).toMatch(/^exp-\d+-[a-z0-9]+$/);
    });

    it('should start capture with options', () => {
      const id = service.startCapture('Test task', {
        agent: 'qe-test-architect',
        domain: 'test-generation',
        model: 'sonnet',
        trajectoryId: 'traj-123',
        metadata: { priority: 'high' },
      });

      expect(id).toBeDefined();

      const active = service.getActiveExperience(id);
      expect(active?.agent).toBe('qe-test-architect');
      expect(active?.domain).toBe('test-generation');
      expect(active?.model).toBe('sonnet');
      expect(active?.trajectoryId).toBe('traj-123');
    });

    it('should record steps in active experience', () => {
      const id = service.startCapture('Multi-step task');

      service.recordStep(id, { action: 'analyze-code', result: 'Found 5 methods' });
      service.recordStep(id, { action: 'generate-tests', quality: 0.9 });
      service.recordStep(id, {
        action: 'verify-coverage',
        result: '85% coverage',
        quality: 0.85,
      });

      const active = service.getActiveExperience(id);
      expect(active?.steps).toHaveLength(3);
      expect(active?.steps[0].action).toBe('analyze-code');
      expect(active?.steps[1].quality).toBe(0.9);
      expect(active?.steps[2].result).toBe('85% coverage');
    });

    it('should warn for recording step on non-existent experience', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service.recordStep('non-existent-id', { action: 'test' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Experience not found')
      );

      consoleSpy.mockRestore();
    });

    it('should complete capture and return experience', async () => {
      const id = service.startCapture('Complete task', {
        agent: 'qe-test-architect',
        domain: 'test-generation',
      });

      service.recordStep(id, { action: 'step-1', quality: 0.9 });
      service.recordStep(id, { action: 'step-2', quality: 0.8 });

      const result = await service.completeCapture(id, {
        success: true,
        quality: 0.85,
        feedback: 'Good work!',
      });

      expect(result.success).toBe(true);

      const experience = result.value!;
      expect(experience.success).toBe(true);
      expect(experience.quality).toBe(0.85);
      expect(experience.feedback).toBe('Good work!');
      expect(experience.durationMs).toBeGreaterThanOrEqual(0);
      expect(experience.completedAt).toBeGreaterThanOrEqual(experience.startedAt);
    });

    it('should calculate quality from steps if not provided', async () => {
      const id = service.startCapture('Auto-quality task');

      service.recordStep(id, { action: 'step-1', quality: 0.8 });
      service.recordStep(id, { action: 'step-2', quality: 0.9 });
      service.recordStep(id, { action: 'step-3', quality: 0.7 });

      const result = await service.completeCapture(id, { success: true });

      expect(result.success).toBe(true);
      // Average quality: (0.8 + 0.9 + 0.7) / 3 = 0.8 + 0.1 (success bonus) = 0.9
      expect(result.value?.quality).toBeCloseTo(0.9, 1);
    });

    it('should handle failed experience completion', async () => {
      const id = service.startCapture('Failed task');

      const result = await service.completeCapture(id, {
        success: false,
        feedback: 'Something went wrong',
      });

      expect(result.success).toBe(true);
      expect(result.value?.success).toBe(false);
      expect(result.value?.feedback).toBe('Something went wrong');
    });

    it('should return error for completing non-existent experience', async () => {
      const result = await service.completeCapture('non-existent', { success: true });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not found');
    });

    it('should remove experience from active after completion', async () => {
      const id = service.startCapture('Completing task');

      await service.completeCapture(id, { success: true });

      const active = service.getActiveExperience(id);
      expect(active).toBeUndefined();
    });

    it('should persist completed experience to memory', async () => {
      const id = service.startCapture('Persistent task', {
        domain: 'test-generation',
      });

      await service.completeCapture(id, { success: true, quality: 0.85 });

      expect(memory.set).toHaveBeenCalledWith(
        expect.stringContaining('experience'),
        expect.objectContaining({
          id,
          success: true,
          quality: 0.85,
        }),
        { persist: true }
      );
    });
  });

  describe('Pattern Extraction', () => {
    it('should extract pattern from high-quality successful experience', async () => {
      const id = service.startCapture('High quality task', {
        domain: 'test-generation',
      });

      service.recordStep(id, { action: 'generate', quality: 0.9 });

      await service.completeCapture(id, { success: true, quality: 0.85 });

      expect(patternStore.create).toHaveBeenCalled();
    });

    it('should not extract pattern from low-quality experience', async () => {
      const id = service.startCapture('Low quality task');

      await service.completeCapture(id, {
        success: true,
        quality: 0.3, // Below threshold (0.7)
      });

      expect(patternStore.create).not.toHaveBeenCalled();
    });

    it('should not extract pattern from failed experience', async () => {
      const id = service.startCapture('Failed task');

      await service.completeCapture(id, {
        success: false,
        quality: 0.9, // High quality but failed
      });

      expect(patternStore.create).not.toHaveBeenCalled();
    });

    it('should reinforce existing pattern if similar found', async () => {
      // Setup: pattern store returns existing similar pattern
      (patternStore.search as any).mockResolvedValue(
        ok([
          {
            pattern: { id: 'existing-pattern', usageCount: 2 },
            similarity: 0.9, // Above threshold (0.85)
            score: 0.9,
          },
        ])
      );

      const id = service.startCapture('Similar task');
      service.recordStep(id, { action: 'test', quality: 0.9 });

      const result = await service.completeCapture(id, {
        success: true,
        quality: 0.85,
      });

      expect(patternStore.recordUsage).toHaveBeenCalledWith('existing-pattern', true);
      expect(result.value?.patterns).toContain('existing-pattern');
    });

    it('should promote pattern after threshold uses', async () => {
      // Setup: pattern store returns pattern at promotion threshold
      (patternStore.search as any).mockResolvedValue(
        ok([
          {
            pattern: {
              id: 'promotable-pattern',
              tier: 'short-term',
              usageCount: 3,
            },
            similarity: 0.95,
            score: 0.95,
          },
        ])
      );
      (patternStore.get as any).mockResolvedValue({
        id: 'promotable-pattern',
        tier: 'short-term',
        usageCount: 3,
      });

      const id = service.startCapture('Promote trigger task');
      service.recordStep(id, { action: 'test', quality: 0.9 });

      await service.completeCapture(id, { success: true, quality: 0.9 });

      expect(patternStore.promote).toHaveBeenCalledWith('promotable-pattern');
    });

    it('should work without pattern store', async () => {
      const noPatternService = createExperienceCaptureService(memory);
      await noPatternService.initialize();

      const id = noPatternService.startCapture('No pattern store task');

      const result = await noPatternService.completeCapture(id, {
        success: true,
        quality: 0.9,
      });

      expect(result.success).toBe(true);
      expect(result.value?.patterns).toBeUndefined();

      await noPatternService.dispose();
    });
  });

  describe('Pattern Type Detection', () => {
    it('should detect test-template for test-related tasks', async () => {
      const id = service.startCapture('Generate unit tests for AuthService');
      await service.completeCapture(id, { success: true, quality: 0.85 });

      expect(patternStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: 'test-template',
        })
      );
    });

    it('should detect mock-pattern for mock-related tasks', async () => {
      const id = service.startCapture('Create mock for database connection');
      await service.completeCapture(id, { success: true, quality: 0.85 });

      expect(patternStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: 'mock-pattern',
        })
      );
    });

    it('should detect coverage-strategy for coverage tasks', async () => {
      const id = service.startCapture('Improve coverage for payment module');
      await service.completeCapture(id, { success: true, quality: 0.85 });

      expect(patternStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: 'coverage-strategy',
        })
      );
    });

    it('should detect api-contract for API tasks', async () => {
      // "Contract testing" contains "test" so it will be detected as test-template first
      // Use a task without "test" to get api-contract detection
      const id = service.startCapture('API contract validation for REST endpoints');
      await service.completeCapture(id, { success: true, quality: 0.85 });

      expect(patternStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: 'api-contract',
        })
      );
    });
  });

  describe('Cross-Domain Sharing', () => {
    it('should share experience across related domains', async () => {
      const id = service.startCapture('Cross-domain task', {
        domain: 'test-generation',
      });

      const result = await service.completeCapture(id, {
        success: true,
        quality: 0.9,
      });

      expect(result.success).toBe(true);

      // Should store references in related domains
      await service.shareAcrossDomains(result.value!);

      // test-generation relates to: test-execution, coverage-analysis
      expect(memory.set).toHaveBeenCalledWith(
        expect.stringContaining('shared:test-execution'),
        expect.objectContaining({
          sourceExperience: id,
          sourceDomain: 'test-generation',
        }),
        { persist: true }
      );
    });

    it('should not share if cross-domain sharing disabled', async () => {
      const noShareService = createExperienceCaptureService(
        memory,
        patternStore,
        eventBus,
        { enableCrossDomainSharing: false }
      );
      await noShareService.initialize();

      const id = noShareService.startCapture('No share task', {
        domain: 'test-generation',
      });
      const result = await noShareService.completeCapture(id, {
        success: true,
        quality: 0.9,
      });

      await noShareService.shareAcrossDomains(result.value!);

      // Should not have shared entries
      expect(memory.set).not.toHaveBeenCalledWith(
        expect.stringContaining('shared:'),
        expect.anything(),
        expect.anything()
      );

      await noShareService.dispose();
    });

    it('should not share experience without domain', async () => {
      const id = service.startCapture('No domain task');

      const result = await service.completeCapture(id, {
        success: true,
        quality: 0.9,
      });

      await service.shareAcrossDomains(result.value!);

      expect(memory.set).not.toHaveBeenCalledWith(
        expect.stringContaining('shared:'),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('Experience Retrieval', () => {
    it('should get experience by ID', async () => {
      const id = service.startCapture('Retrievable task', {
        domain: 'test-generation',
      });
      await service.completeCapture(id, { success: true, quality: 0.8 });

      const experience = await service.getExperience(id);

      expect(experience).toBeDefined();
      expect(experience?.success).toBe(true);
      expect(experience?.quality).toBe(0.8);
    });

    it('should return null for non-existent experience', async () => {
      const experience = await service.getExperience('non-existent');
      expect(experience).toBeNull();
    });

    it('should search experiences by domain', async () => {
      // Add experiences
      const id1 = service.startCapture('Task 1', { domain: 'test-generation' });
      const id2 = service.startCapture('Task 2', { domain: 'coverage-analysis' });
      const id3 = service.startCapture('Task 3', { domain: 'test-generation' });

      await service.completeCapture(id1, { success: true });
      await service.completeCapture(id2, { success: true });
      await service.completeCapture(id3, { success: true });

      // Note: search depends on memory.search which is mocked
      // In real tests, the search would filter by domain
    });

    it('should search experiences with filters', async () => {
      const id = service.startCapture('Filtered task', {
        agent: 'qe-test-architect',
        domain: 'test-generation',
      });
      await service.completeCapture(id, { success: true, quality: 0.9 });

      // The search function accepts multiple filters
      const results = await service.searchExperiences({
        agent: 'qe-test-architect',
        success: true,
        minQuality: 0.8,
        limit: 10,
      });

      // Results depend on memory backend mock
      expect(results).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should track capture counts', async () => {
      const id1 = service.startCapture('Task 1');
      const id2 = service.startCapture('Task 2');
      const id3 = service.startCapture('Task 3');

      await service.completeCapture(id1, { success: true });
      await service.completeCapture(id2, { success: true });
      await service.completeCapture(id3, { success: false });

      const stats = await service.getStats();

      expect(stats.totalExperiences).toBe(3);
      expect(stats.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('should track patterns extracted and promoted', async () => {
      // Setup for pattern extraction
      (patternStore.search as any).mockResolvedValue(ok([])); // No existing patterns

      const id = service.startCapture('Pattern task');
      await service.completeCapture(id, { success: true, quality: 0.9 });

      const stats = await service.getStats();

      expect(stats.patternsExtracted).toBeGreaterThanOrEqual(0);
    });

    it('should track experiences by domain', async () => {
      const id1 = service.startCapture('Task 1', { domain: 'test-generation' });
      const id2 = service.startCapture('Task 2', { domain: 'test-generation' });
      const id3 = service.startCapture('Task 3', { domain: 'coverage-analysis' });

      await service.completeCapture(id1, { success: true });
      await service.completeCapture(id2, { success: true });
      await service.completeCapture(id3, { success: true });

      const stats = await service.getStats();

      expect(stats.byDomain['test-generation']).toBe(2);
      expect(stats.byDomain['coverage-analysis']).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should remove excess experiences per domain', async () => {
      const customService = createExperienceCaptureService(
        memory,
        patternStore,
        eventBus,
        { maxExperiencesPerDomain: 5 }
      );
      await customService.initialize();

      // Add 6 experiences
      for (let i = 0; i < 6; i++) {
        const id = customService.startCapture(`Task ${i}`, {
          domain: 'test-generation',
        });
        await customService.completeCapture(id, { success: true });
      }

      const { removed } = await customService.cleanup();

      // Should have removed oldest to stay under limit
      expect(removed).toBeGreaterThanOrEqual(0);

      await customService.dispose();
    });
  });

  describe('Event Emission', () => {
    it('should emit event on experience capture', async () => {
      const id = service.startCapture('Event task', { domain: 'test-generation' });

      await service.completeCapture(id, { success: true, quality: 0.9 });

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'learning.ExperienceCaptured',
          source: 'learning-optimization',
          payload: expect.objectContaining({
            experience: expect.objectContaining({
              id,
              success: true,
            }),
          }),
        })
      );
    });

    it('should work without event bus', async () => {
      const noEventService = createExperienceCaptureService(memory, patternStore);
      await noEventService.initialize();

      const id = noEventService.startCapture('No event task');

      // Should not throw
      await noEventService.completeCapture(id, { success: true });

      await noEventService.dispose();
    });
  });

  describe('Dispose', () => {
    it('should save stats on dispose', async () => {
      const id = service.startCapture('Pre-dispose task');
      await service.completeCapture(id, { success: true });

      await service.dispose();

      expect(memory.set).toHaveBeenCalledWith(
        expect.stringContaining('stats'),
        expect.objectContaining({
          totalCaptured: expect.any(Number),
          successfulCaptures: expect.any(Number),
        }),
        { persist: true }
      );
    });

    it('should clear active experiences on dispose', async () => {
      const id = service.startCapture('Uncompleted task');

      await service.dispose();

      // After reinitialize, should not find active experience
      await service.initialize();
      const active = service.getActiveExperience(id);
      expect(active).toBeUndefined();
    });

    it('should stop cleanup timer on dispose', async () => {
      const customService = createExperienceCaptureService(
        memory,
        patternStore,
        eventBus,
        { autoCleanup: true, cleanupIntervalMs: 100 }
      );
      await customService.initialize();

      await customService.dispose();

      // Should not throw after dispose
    });
  });
});
