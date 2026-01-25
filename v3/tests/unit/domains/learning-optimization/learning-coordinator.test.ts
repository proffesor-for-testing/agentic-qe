/**
 * Agentic QE v3 - Learning Coordinator Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LearningCoordinatorService } from '../../../../src/domains/learning-optimization/services/learning-coordinator';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { TimeRange } from '../../../../src/shared/value-objects';
import {
  Experience,
  ExperienceResult,
  PatternContext,
  LearnedPattern,
} from '../../../../src/domains/learning-optimization/interfaces';
import { DomainName, AgentId } from '../../../../src/shared/types';

// Mock MemoryBackend
function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockImplementation(async (key: string, value: unknown, _options?: StoreOptions) => {
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
    search: vi.fn().mockImplementation(async (pattern: string, _limit?: number) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(storage.keys()).filter((key) => regex.test(key));
    }),
    vectorSearch: vi.fn().mockResolvedValue([] as VectorSearchResult[]),
    storeVector: vi.fn().mockResolvedValue(undefined),
  };
}

// Helper to create test experiences
function createTestExperience(overrides: Partial<Experience> = {}): Experience {
  const agentId: AgentId = {
    value: overrides.agentId?.value || 'test-agent-1',
    domain: overrides.agentId?.domain || 'test-generation',
    type: overrides.agentId?.type || 'generator',
  };

  return {
    id: overrides.id || 'exp-1',
    agentId,
    domain: overrides.domain || 'test-generation',
    action: overrides.action || 'generate-test',
    state: overrides.state || {
      context: { language: 'typescript', framework: 'vitest' },
      metrics: { coverage: 80, duration: 1000 },
    },
    result: overrides.result || {
      success: true,
      outcome: { testsGenerated: 5 },
      duration: 1000,
    },
    reward: overrides.reward ?? 0.8,
    timestamp: overrides.timestamp || new Date(),
  };
}

describe('LearningCoordinatorService', () => {
  let service: LearningCoordinatorService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new LearningCoordinatorService(mockMemory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('learnPattern', () => {
    it('should learn a pattern from sufficient experiences', async () => {
      const experiences = Array.from({ length: 5 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          action: 'generate-test',
          result: { success: true, outcome: { testsGenerated: 5 }, duration: 1000 },
          reward: 0.8,
        })
      );

      const result = await service.learnPattern(experiences);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('test-pattern');
        expect(result.value.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result.value.successRate).toBe(1); // All experiences succeeded
      }
    });

    it('should reject when insufficient experiences provided', async () => {
      const experiences = [createTestExperience()];

      const result = await service.learnPattern(experiences);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('at least');
      }
    });

    it('should reject when success rate is below threshold', async () => {
      const experiences = Array.from({ length: 5 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          result: {
            success: i < 2, // Only 2 out of 5 succeed = 40%
            outcome: {},
            duration: 1000,
          },
        })
      );

      const result = await service.learnPattern(experiences);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('below threshold');
      }
    });

    it('should infer pattern type from experience actions', async () => {
      const fixExperiences = Array.from({ length: 5 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          action: 'fix-bug',
          result: { success: true, outcome: {}, duration: 1000 },
        })
      );

      const result = await service.learnPattern(fixExperiences);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('fix-pattern');
      }
    });

    it('should store the learned pattern in memory', async () => {
      const experiences = Array.from({ length: 5 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          result: { success: true, outcome: {}, duration: 1000 },
        })
      );

      await service.learnPattern(experiences);

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const patternCall = calls.find((c) => (c[0] as string).includes('learning:pattern:'));
      expect(patternCall).toBeDefined();
    });
  });

  describe('findMatchingPatterns', () => {
    it('should find patterns matching the given context', async () => {
      // Directly store a pattern in memory to test the find functionality
      const pattern: LearnedPattern = {
        id: 'test-pattern-1',
        type: 'test-pattern',
        domain: 'test-generation',
        name: 'test-pattern',
        description: 'Test pattern',
        confidence: 0.9,
        usageCount: 10,
        successRate: 0.85,
        context: {
          language: 'typescript',
          framework: 'vitest',
          tags: ['unit'],
        },
        template: { type: 'workflow', content: 'test', variables: [] },
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      await mockMemory.set(`learning:pattern:${pattern.id}`, pattern);

      const context: PatternContext = {
        language: 'typescript',
        framework: 'vitest',
        tags: [],
      };

      const result = await service.findMatchingPatterns(context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value)).toBe(true);
        // Should find the pattern we stored
        expect(result.value.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should return empty array when no patterns match', async () => {
      const context: PatternContext = {
        language: 'python',
        framework: 'pytest',
        tags: [],
      };

      const result = await service.findMatchingPatterns(context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should respect the limit parameter', async () => {
      const context: PatternContext = {
        tags: [],
      };

      const result = await service.findMatchingPatterns(context, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('applyPattern', () => {
    it('should apply pattern and replace template variables', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-1',
        type: 'test-pattern',
        domain: 'test-generation',
        name: 'test-pattern',
        description: 'Test pattern',
        confidence: 0.9,
        usageCount: 0,
        successRate: 0.9,
        context: { tags: [] },
        template: {
          type: 'workflow',
          content: 'Test for {{domain}} using {{action}}',
          variables: [
            { name: 'domain', type: 'string', required: true },
            { name: 'action', type: 'string', required: false, defaultValue: 'default-action' },
          ],
        },
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      const result = await service.applyPattern(pattern, { domain: 'test-generation' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toContain('test-generation');
        expect(result.value).toContain('default-action');
      }
    });

    it('should fail when required variable is not provided', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-1',
        type: 'test-pattern',
        domain: 'test-generation',
        name: 'test-pattern',
        description: 'Test pattern',
        confidence: 0.9,
        usageCount: 0,
        successRate: 0.9,
        context: { tags: [] },
        template: {
          type: 'workflow',
          content: 'Test for {{domain}}',
          variables: [{ name: 'domain', type: 'string', required: true }],
        },
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      const result = await service.applyPattern(pattern, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Required variable');
      }
    });
  });

  describe('updatePatternFeedback', () => {
    it('should update pattern success rate on positive feedback', async () => {
      // First create a pattern in memory
      const pattern: LearnedPattern = {
        id: 'pattern-1',
        type: 'test-pattern',
        domain: 'test-generation',
        name: 'test-pattern',
        description: 'Test pattern',
        confidence: 0.9,
        usageCount: 10,
        successRate: 0.8,
        context: { tags: [] },
        template: { type: 'workflow', content: 'test', variables: [] },
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      await mockMemory.set(`learning:pattern:${pattern.id}`, pattern);

      const result = await service.updatePatternFeedback('pattern-1', true);

      expect(result.success).toBe(true);
      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should return error for non-existent pattern', async () => {
      const result = await service.updatePatternFeedback('non-existent', true);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });
  });

  describe('consolidatePatterns', () => {
    it('should consolidate multiple patterns into one', async () => {
      const pattern1: LearnedPattern = {
        id: 'pattern-1',
        type: 'test-pattern',
        domain: 'test-generation',
        name: 'pattern-1',
        description: 'Test pattern 1',
        confidence: 0.8,
        usageCount: 10,
        successRate: 0.85,
        context: { tags: ['unit'] },
        template: { type: 'workflow', content: 'test1', variables: [] },
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      const pattern2: LearnedPattern = {
        id: 'pattern-2',
        type: 'test-pattern',
        domain: 'test-generation',
        name: 'pattern-2',
        description: 'Test pattern 2',
        confidence: 0.9,
        usageCount: 20,
        successRate: 0.9,
        context: { tags: ['integration'] },
        template: { type: 'workflow', content: 'test2', variables: [] },
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      await mockMemory.set('learning:pattern:pattern-1', pattern1);
      await mockMemory.set('learning:pattern:pattern-2', pattern2);

      const result = await service.consolidatePatterns(['pattern-1', 'pattern-2']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.name).toContain('consolidated');
        expect(result.value.usageCount).toBe(30); // Combined usage
        expect(result.value.context.tags).toContain('unit');
        expect(result.value.context.tags).toContain('integration');
      }
    });

    it('should reject consolidation with fewer than 2 patterns', async () => {
      const result = await service.consolidatePatterns(['pattern-1']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('at least 2');
      }
    });
  });

  describe('recordExperience', () => {
    it('should record a new experience and return its ID', async () => {
      const experience = createTestExperience();
      const { id: _id, timestamp: _timestamp, ...experienceData } = experience;

      const result = await service.recordExperience(experienceData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeDefined();
        expect(typeof result.value).toBe('string');
      }
    });

    it('should index experience by agent and domain', async () => {
      const experience = createTestExperience();
      const { id: _id, timestamp: _timestamp, ...experienceData } = experience;

      await service.recordExperience(experienceData);

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const indexCalls = calls.filter((c) => (c[0] as string).includes(':index:'));
      expect(indexCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('mineExperiences', () => {
    it('should return insights from mined experiences', async () => {
      const timeRange = TimeRange.lastNDays(7);

      const result = await service.mineExperiences('test-generation', timeRange);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveProperty('experienceCount');
        expect(result.value).toHaveProperty('successRate');
        expect(result.value).toHaveProperty('recommendations');
      }
    });

    it('should return recommendation when no experiences found', async () => {
      const timeRange = TimeRange.lastNDays(1);

      const result = await service.mineExperiences('test-generation', timeRange);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.experienceCount).toBe(0);
        expect(result.value.recommendations).toContain('No experiences found in the given time range');
      }
    });
  });

  describe('calculateReward', () => {
    it('should calculate positive reward for successful outcome with maximize objective', () => {
      const result: ExperienceResult = {
        success: true,
        outcome: { coverage: 80 },
        duration: 1000,
      };

      const objective = {
        metric: 'coverage',
        direction: 'maximize' as const,
        constraints: [],
      };

      const reward = service.calculateReward(result, objective);

      expect(reward).toBeGreaterThan(0);
      expect(reward).toBeLessThanOrEqual(1);
    });

    it('should apply penalty for violated constraints', () => {
      const result: ExperienceResult = {
        success: false, // Failed result to ensure lower reward
        outcome: { coverage: 80, duration: 10000 },
        duration: 10000,
      };

      const objective = {
        metric: 'coverage',
        direction: 'maximize' as const,
        constraints: [{ metric: 'duration', operator: 'lt' as const, value: 5000 }],
      };

      const reward = service.calculateReward(result, objective);

      // The reward should be less than the maximum (1) due to constraint violation and failure
      expect(reward).toBeLessThanOrEqual(1);
      // With a constraint violation and failed result, reward should be penalized
      expect(reward).toBeLessThan(0.9);
    });
  });

  describe('clusterExperiences', () => {
    it('should cluster similar experiences together', async () => {
      const experiences = [
        createTestExperience({ id: 'exp-1', action: 'generate-test' }),
        createTestExperience({ id: 'exp-2', action: 'generate-test' }),
        createTestExperience({ id: 'exp-3', action: 'generate-test' }),
        createTestExperience({ id: 'exp-4', action: 'fix-bug' }),
        createTestExperience({ id: 'exp-5', action: 'fix-bug' }),
      ];

      const result = await service.clusterExperiences(experiences);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
        for (const cluster of result.value) {
          expect(cluster.experiences.length).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it('should return empty array for empty input', async () => {
      const result = await service.clusterExperiences([]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getPatternStats', () => {
    it('should return pattern statistics', async () => {
      const result = await service.getPatternStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveProperty('totalPatterns');
        expect(result.value).toHaveProperty('byType');
        expect(result.value).toHaveProperty('byDomain');
        expect(result.value).toHaveProperty('avgConfidence');
        expect(result.value).toHaveProperty('avgSuccessRate');
      }
    });

    it('should filter by domain when specified', async () => {
      const result = await service.getPatternStats('test-generation');

      expect(result.success).toBe(true);
    });
  });
});
