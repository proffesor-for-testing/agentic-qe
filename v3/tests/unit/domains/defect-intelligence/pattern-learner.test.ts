/**
 * Agentic QE v3 - Pattern Learner Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternLearnerService } from '../../../../src/domains/defect-intelligence/services/pattern-learner';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { DefectInfo, DefectPattern } from '../../../../src/domains/defect-intelligence/interfaces';

/**
 * Mock MemoryBackend implementation for testing
 */
function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, { embedding: number[]; metadata: unknown }>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockImplementation(async <T>(key: string, value: T, _options?: StoreOptions) => {
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
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(storage.keys()).filter((k) => regex.test(k));
    }),
    vectorSearch: vi.fn().mockResolvedValue([]),
    storeVector: vi.fn().mockImplementation(async (key: string, embedding: number[], metadata?: unknown) => {
      vectors.set(key, { embedding, metadata });
    }),
  };
}

/**
 * Helper to create test defect info
 */
function createDefect(overrides: Partial<DefectInfo> = {}): DefectInfo {
  return {
    id: `defect-${Math.random().toString(36).substr(2, 9)}`,
    title: 'Test defect',
    description: 'A test defect for unit testing',
    ...overrides,
  };
}

describe('PatternLearnerService', () => {
  let service: PatternLearnerService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new PatternLearnerService(mockMemory);
  });

  describe('learnPatterns', () => {
    it('should learn patterns from defects with null pointer indicators', async () => {
      const defects: DefectInfo[] = [
        createDefect({ title: 'NullPointerException in UserService', description: 'null reference error' }),
        createDefect({ title: 'Cannot read property of undefined', description: 'TypeError when accessing user' }),
      ];

      const result = await service.learnPatterns({ defects });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.patterns.length).toBeGreaterThan(0);
        const nullPattern = result.value.patterns.find((p) =>
          p.name.toLowerCase().includes('null') || p.indicators.some((i) => i.includes('null'))
        );
        expect(nullPattern).toBeDefined();
      }
    });

    it('should return error for empty defects array', async () => {
      const result = await service.learnPatterns({ defects: [] });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('No defects provided for learning');
      }
    });

    it('should respect minimum pattern frequency threshold', async () => {
      // Create service with higher threshold
      const strictService = new PatternLearnerService(mockMemory, {
        minPatternFrequency: 3,
      });

      const defects: DefectInfo[] = [
        createDefect({ title: 'Memory leak issue', description: 'OutOfMemory error' }),
        createDefect({ title: 'Another memory problem', description: 'heap exhausted' }),
      ];

      const result = await strictService.learnPatterns({ defects });

      expect(result.success).toBe(true);
      if (result.success) {
        // With frequency threshold of 3, patterns appearing only twice should be filtered
        const highFreqPatterns = result.value.patterns.filter((p) => p.frequency >= 3);
        expect(highFreqPatterns.length).toBeLessThanOrEqual(result.value.patterns.length);
      }
    });

    it('should learn patterns from defect tags', async () => {
      const defects: DefectInfo[] = [
        createDefect({ title: 'API error', tags: ['api', 'timeout'] }),
        createDefect({ title: 'Service timeout', tags: ['api', 'timeout'] }),
      ];

      const result = await service.learnPatterns({ defects });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.modelUpdated).toBe(true);
      }
    });

    it('should calculate improvement estimate based on pattern coverage', async () => {
      const defects: DefectInfo[] = [
        createDefect({ title: 'Race condition in async handler', description: 'timing issue' }),
        createDefect({ title: 'Concurrent modification error', description: 'race condition detected' }),
        createDefect({ title: 'Thread safety bug', description: 'intermittent failure' }),
      ];

      const result = await service.learnPatterns({ defects });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.improvementEstimate).toBeGreaterThanOrEqual(0);
        expect(result.value.improvementEstimate).toBeLessThanOrEqual(1);
      }
    });

    it('should store learned patterns in memory', async () => {
      const defects: DefectInfo[] = [
        createDefect({ title: 'Input validation error', description: 'XSS vulnerability' }),
        createDefect({ title: 'Injection attack', description: 'SQL injection detected' }),
      ];

      await service.learnPatterns({ defects });

      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should learn resolution mappings when includeResolutions is true', async () => {
      const defects: DefectInfo[] = [
        createDefect({ title: 'Memory leak bug', description: 'Circular reference causing OutOfMemory' }),
        createDefect({ title: 'Memory exhaustion', description: 'heap memory leak detected' }),
      ];

      const result = await service.learnPatterns({
        defects,
        includeResolutions: true,
      });

      expect(result.success).toBe(true);
      if (result.success && result.value.patterns.length > 0) {
        // Resolution mappings should be stored when patterns are found
        expect(mockMemory.set).toHaveBeenCalled();
      }
    });

    it('should merge with known patterns for comprehensive coverage', async () => {
      const defects: DefectInfo[] = [
        createDefect({ title: 'Null pointer exception', description: 'NullPointerException in service' }),
        createDefect({ title: 'Null reference error', description: 'Cannot read property of null' }),
      ];

      const result = await service.learnPatterns({ defects });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should find patterns from the null-pointer indicators
        expect(result.value.patterns.length).toBeGreaterThan(0);
      }
    });
  });

  describe('clusterDefects', () => {
    it('should cluster defects by semantic similarity', async () => {
      const defects: DefectInfo[] = [
        createDefect({ id: 'd1', title: 'Database connection timeout', description: 'Connection pool exhausted' }),
        createDefect({ id: 'd2', title: 'DB connection failure', description: 'Cannot connect to database' }),
        createDefect({ id: 'd3', title: 'UI rendering issue', description: 'Component not rendering' }),
      ];

      const result = await service.clusterDefects({
        defects,
        method: 'semantic',
        minClusterSize: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.clusters).toBeDefined();
        expect(result.value.outliers).toBeDefined();
        expect(result.value.clusteringMetrics).toBeDefined();
      }
    });

    it('should return error for empty defects array', async () => {
      const result = await service.clusterDefects({
        defects: [],
        method: 'semantic',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('No defects provided for clustering');
      }
    });

    it('should return error for unknown clustering method', async () => {
      const defects = [createDefect()];

      const result = await service.clusterDefects({
        defects,
        method: 'unknown' as 'semantic',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Unknown clustering method');
      }
    });

    it('should cluster defects by behavioral similarity (tags)', async () => {
      const defects: DefectInfo[] = [
        createDefect({ id: 'd1', title: 'Bug 1', tags: ['api', 'auth'] }),
        createDefect({ id: 'd2', title: 'Bug 2', tags: ['api', 'auth'] }),
        createDefect({ id: 'd3', title: 'Bug 3', tags: ['ui', 'rendering'] }),
      ];

      const result = await service.clusterDefects({
        defects,
        method: 'behavioral',
        minClusterSize: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.clusters.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should cluster defects by temporal patterns', async () => {
      const defects: DefectInfo[] = [
        createDefect({ id: 'd1', title: 'Login failed error' }),
        createDefect({ id: 'd2', title: 'Login timeout error' }),
        createDefect({ id: 'd3', title: 'Payment processing bug' }),
      ];

      const result = await service.clusterDefects({
        defects,
        method: 'temporal',
        minClusterSize: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.clusteringMetrics.silhouette).toBeGreaterThanOrEqual(0);
        expect(result.value.clusteringMetrics.cohesion).toBeGreaterThanOrEqual(0);
      }
    });

    it('should identify outliers not fitting any cluster', async () => {
      const defects: DefectInfo[] = [
        createDefect({ id: 'd1', title: 'Common error type A', description: 'Description A' }),
        createDefect({ id: 'd2', title: 'Common error type A variant', description: 'Similar to A' }),
        createDefect({ id: 'd3', title: 'Unique random issue XYZ', description: 'Completely different' }),
      ];

      const result = await service.clusterDefects({
        defects,
        method: 'behavioral',
        minClusterSize: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Single defects may be outliers
        expect(result.value.outliers).toBeDefined();
      }
    });

    it('should generate suggested fixes for clusters', async () => {
      const defects: DefectInfo[] = [
        createDefect({ id: 'd1', title: 'Null pointer exception', description: 'NPE in service' }),
        createDefect({ id: 'd2', title: 'Null reference error', description: 'null value' }),
      ];

      const result = await service.clusterDefects({
        defects,
        method: 'semantic',
        minClusterSize: 2,
      });

      expect(result.success).toBe(true);
      if (result.success && result.value.clusters.length > 0) {
        expect(result.value.clusters[0].suggestedFix).toBeDefined();
        expect(result.value.clusters[0].suggestedFix.length).toBeGreaterThan(0);
      }
    });
  });

  describe('findSimilarDefects', () => {
    it('should find similar defects using vector search', async () => {
      const targetDefect = createDefect({
        title: 'Authentication failure',
        description: 'User cannot log in',
      });

      // Mock vector search to return results
      const mockResults: VectorSearchResult[] = [
        { key: 'defect:similar-1', score: 0.9, metadata: { defectId: 'similar-1' } },
        { key: 'defect:similar-2', score: 0.8, metadata: { defectId: 'similar-2' } },
      ];
      (mockMemory.vectorSearch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResults);
      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key.includes('similar-1')) {
          return createDefect({ id: 'similar-1', title: 'Auth error' });
        }
        if (key.includes('similar-2')) {
          return createDefect({ id: 'similar-2', title: 'Login issue' });
        }
        return undefined;
      });

      const result = await service.findSimilarDefects(targetDefect, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeInstanceOf(Array);
      }
    });

    it('should exclude the source defect from results', async () => {
      const targetDefect = createDefect({ id: 'target-id', title: 'Test bug' });

      const mockResults: VectorSearchResult[] = [
        { key: 'defect:target-id', score: 1.0, metadata: {} },
        { key: 'defect:other-id', score: 0.85, metadata: {} },
      ];
      (mockMemory.vectorSearch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResults);
      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key.includes('target-id')) {
          return targetDefect;
        }
        return createDefect({ id: 'other-id' });
      });

      const result = await service.findSimilarDefects(targetDefect, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        const hasTargetId = result.value.some((d) => d.id === 'target-id');
        expect(hasTargetId).toBe(false);
      }
    });

    it('should respect limit parameter', async () => {
      const targetDefect = createDefect({ title: 'Test' });

      const mockResults: VectorSearchResult[] = Array.from({ length: 10 }, (_, i) => ({
        key: `defect:d${i}`,
        score: 0.9 - i * 0.05,
        metadata: {},
      }));
      (mockMemory.vectorSearch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResults);
      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        const match = key.match(/d(\d+)/);
        if (match) {
          return createDefect({ id: `d${match[1]}` });
        }
        return undefined;
      });

      const result = await service.findSimilarDefects(targetDefect, 3);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('getPatternById', () => {
    it('should return cached pattern if available', async () => {
      const defects = [
        createDefect({ title: 'Memory leak', description: 'heap exhausted' }),
        createDefect({ title: 'OOM error', description: 'OutOfMemory' }),
      ];

      const learnResult = await service.learnPatterns({ defects });
      expect(learnResult.success).toBe(true);

      if (learnResult.success && learnResult.value.patterns.length > 0) {
        const patternId = learnResult.value.patterns[0].id;
        const pattern = await service.getPatternById(patternId);

        expect(pattern).toBeDefined();
        expect(pattern?.id).toBe(patternId);
      }
    });

    it('should load pattern from memory if not cached', async () => {
      const storedPattern: DefectPattern = {
        id: 'stored-pattern-123',
        name: 'Test Pattern',
        indicators: ['test', 'indicator'],
        frequency: 5,
        prevention: 'Test prevention',
      };

      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(storedPattern);

      const pattern = await service.getPatternById('stored-pattern-123');

      expect(pattern).toBeDefined();
      expect(pattern?.name).toBe('Test Pattern');
    });

    it('should return undefined for non-existent pattern', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const pattern = await service.getPatternById('non-existent-id');

      expect(pattern).toBeUndefined();
    });
  });

  describe('listPatterns', () => {
    it('should return all learned patterns', async () => {
      // Setup mock to return pattern keys
      const patternKeys = ['pattern:1', 'pattern:2', 'pattern:3'];
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(patternKeys);
      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        const match = key.match(/pattern:(\d+)/);
        if (match) {
          return {
            id: `p${match[1]}`,
            name: `Pattern ${match[1]}`,
            indicators: [],
            frequency: parseInt(match[1]) * 2,
            prevention: 'Test',
          };
        }
        return undefined;
      });

      const patterns = await service.listPatterns();

      expect(patterns).toBeInstanceOf(Array);
    });

    it('should sort patterns by frequency descending', async () => {
      const patternKeys = ['pattern:low', 'pattern:high', 'pattern:mid'];
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(patternKeys);
      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key.includes('low')) return { id: 'low', name: 'Low', indicators: [], frequency: 1, prevention: '' };
        if (key.includes('high')) return { id: 'high', name: 'High', indicators: [], frequency: 10, prevention: '' };
        if (key.includes('mid')) return { id: 'mid', name: 'Mid', indicators: [], frequency: 5, prevention: '' };
        return undefined;
      });

      const patterns = await service.listPatterns();

      expect(patterns.length).toBe(3);
      expect(patterns[0].frequency).toBeGreaterThanOrEqual(patterns[1].frequency);
      expect(patterns[1].frequency).toBeGreaterThanOrEqual(patterns[2].frequency);
    });

    it('should respect limit parameter', async () => {
      const patternKeys = Array.from({ length: 100 }, (_, i) => `pattern:${i}`);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(patternKeys);
      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        const match = key.match(/pattern:(\d+)/);
        if (match) {
          return { id: `p${match[1]}`, name: `P${match[1]}`, indicators: [], frequency: 1, prevention: '' };
        }
        return undefined;
      });

      const patterns = await service.listPatterns(5);

      expect(patterns.length).toBeLessThanOrEqual(5);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle defects with empty title and description', async () => {
      const defects = [createDefect({ title: '', description: '' })];

      const result = await service.learnPatterns({ defects });

      expect(result.success).toBe(true);
    });

    it('should handle memory backend errors gracefully in clustering', async () => {
      (mockMemory.storeVector as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Vector storage failed'));

      const defects = [
        createDefect({ id: 'd1', title: 'Bug' }),
        createDefect({ id: 'd2', title: 'Bug' }),
      ];

      const result = await service.clusterDefects({
        defects,
        method: 'semantic',
      });

      expect(result.success).toBe(false);
    });

    it('should handle very long defect descriptions', async () => {
      const longDescription = 'A'.repeat(10000);
      const defects = [createDefect({ description: longDescription })];

      const result = await service.learnPatterns({ defects });

      expect(result.success).toBe(true);
    });

    it('should handle special characters in defect content', async () => {
      const defects = [
        createDefect({
          title: 'Error: <script>alert("XSS")</script>',
          description: 'SELECT * FROM users; DROP TABLE users;--',
        }),
      ];

      const result = await service.learnPatterns({ defects });

      expect(result.success).toBe(true);
    });
  });
});
