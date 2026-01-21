/**
 * Agentic QE v3 - Defect Predictor Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefectPredictorService,
  PredictionFeedback,
} from '../../../../src/domains/defect-intelligence/services/defect-predictor';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { GitAnalyzer } from '../../../../src/shared/git';
import { FileReader } from '../../../../src/shared/io';
import { TypeScriptParser } from '../../../../src/shared/parsers';

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
    search: vi.fn().mockImplementation(async (pattern: string, limit?: number) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      const keys = Array.from(storage.keys()).filter((k) => regex.test(k));
      return keys.slice(0, limit);
    }),
    vectorSearch: vi.fn().mockResolvedValue([]),
    storeVector: vi.fn().mockImplementation(async (key: string, embedding: number[], metadata?: unknown) => {
      vectors.set(key, { embedding, metadata });
    }),
  };
}

/**
 * Mock GitAnalyzer for testing
 */
function createMockGitAnalyzer(): Partial<GitAnalyzer> {
  return {
    getBlameInfo: vi.fn().mockResolvedValue({
      'file.ts': [
        {
          commitHash: 'abc123',
          author: 'test@example.com',
          timestamp: Date.now(),
          lineCount: 10,
        },
      ],
    }),
    getFileHistory: vi.fn().mockResolvedValue({
      filePath: 'file.ts',
      totalCommits: 5,
      uniqueAuthors: 2,
      firstCommit: new Date(Date.now() - 86400000),
      lastCommit: new Date(),
      changeFrequency: 5,
      isRecentlyModified: true,
      bugFixCommits: 1,
    }),
    getChangeFrequency: vi.fn().mockResolvedValue(0.5),
    getDeveloperExperience: vi.fn().mockResolvedValue(0.5),
    getCodeAge: vi.fn().mockResolvedValue(0.4),
    getBugHistory: vi.fn().mockResolvedValue(0.2),
  };
}

/**
 * Mock FileReader for testing
 */
function createMockFileReader(): Partial<FileReader> {
  return {
    readFile: vi.fn().mockResolvedValue({
      success: true,
      value: `
        export class TestClass {
          private value: number;

          constructor() {
            this.value = 0;
          }

          public method(): void {
            this.value++;
          }
        }
      `,
    }),
    fileExists: vi.fn().mockResolvedValue(true),
    getFileStats: vi.fn().mockResolvedValue({
      size: 1000,
      lines: 50,
      functions: 2,
      classes: 1,
    }),
  };
}

/**
 * Mock TypeScriptParser for testing
 */
function createMockTypeScriptParser(): Partial<TypeScriptParser> {
  const mockAst = {} as unknown; // Empty mock AST

  return {
    parseFile: vi.fn().mockReturnValue(mockAst),
    extractFunctions: vi.fn().mockReturnValue([
      { name: 'method', isAsync: false },
    ]),
    extractClasses: vi.fn().mockReturnValue([
      { name: 'TestClass', methods: [{ name: 'method' }] },
    ]),
    extractImports: vi.fn().mockReturnValue([]),
    getComplexity: vi.fn().mockResolvedValue(5),
    getDependencies: vi.fn().mockResolvedValue([]),
  };
}

describe('DefectPredictorService', () => {
  let service: DefectPredictorService;
  let mockMemory: MemoryBackend;
  let mockGit: Partial<GitAnalyzer>;
  let mockReader: Partial<FileReader>;
  let mockParser: Partial<TypeScriptParser>;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    mockGit = createMockGitAnalyzer();
    mockReader = createMockFileReader();
    mockParser = createMockTypeScriptParser();
    service = new DefectPredictorService(
      mockMemory,
      {},
      mockGit as GitAnalyzer,
      mockReader as FileReader,
      mockParser as TypeScriptParser
    );
  });

  describe('predictDefects', () => {
    it('should predict defects for valid files', async () => {
      const result = await service.predictDefects({
        files: ['src/service/user-service.ts', 'src/controller/user-controller.ts'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.predictions).toHaveLength(2);
        expect(result.value.predictions[0].file).toBe('src/service/user-service.ts');
        expect(result.value.predictions[0].probability).toBeGreaterThanOrEqual(0);
        expect(result.value.predictions[0].probability).toBeLessThanOrEqual(1);
        expect(result.value.modelConfidence).toBeGreaterThan(0);
      }
    });

    it('should return error for empty files array', async () => {
      const result = await service.predictDefects({ files: [] });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('No files provided for prediction');
      }
    });

    it('should return error when exceeding max predictions per batch', async () => {
      const files = Array.from({ length: 150 }, (_, i) => `file${i}.ts`);
      const result = await service.predictDefects({ files });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Too many files');
      }
    });

    it('should respect custom threshold for risk level calculation', async () => {
      const result = await service.predictDefects({
        files: ['src/utils/helper.ts'],
        threshold: 0.1, // Low threshold makes more things high risk
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const prediction = result.value.predictions[0];
        expect(prediction.riskLevel).toBeDefined();
      }
    });

    it('should use custom feature weights when provided', async () => {
      const result = await service.predictDefects({
        files: ['src/service.ts'],
        features: [
          { name: 'codeComplexity', weight: 0.5 },
          { name: 'testCoverage', weight: 0.5 },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.predictions[0].factors).toBeDefined();
      }
    });

    it('should include recommendations in predictions', async () => {
      const result = await service.predictDefects({
        files: ['src/controller/complex-controller.ts'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const prediction = result.value.predictions[0];
        expect(prediction.recommendations).toBeInstanceOf(Array);
      }
    });

    it('should calculate model confidence based on predictions', async () => {
      const result = await service.predictDefects({
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.modelConfidence).toBeGreaterThanOrEqual(0);
        expect(result.value.modelConfidence).toBeLessThanOrEqual(1);
      }
    });

    it('should store prediction in memory for feedback', async () => {
      await service.predictDefects({
        files: ['src/test.ts'],
      });

      expect(mockMemory.set).toHaveBeenCalled();
    });
  });

  describe('analyzeRegressionRisk', () => {
    it('should analyze regression risk for valid changeset', async () => {
      const result = await service.analyzeRegressionRisk({
        changeset: ['src/api/endpoint.ts', 'src/service/data-service.ts'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.overallRisk).toBeGreaterThanOrEqual(0);
        expect(result.value.overallRisk).toBeLessThanOrEqual(1);
        expect(result.value.riskLevel).toBeDefined();
        expect(result.value.impactedAreas).toBeInstanceOf(Array);
        expect(result.value.recommendedTests).toBeInstanceOf(Array);
        expect(result.value.confidence).toBeGreaterThan(0);
      }
    });

    it('should return error for empty changeset', async () => {
      const result = await service.analyzeRegressionRisk({ changeset: [] });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('No files in changeset');
      }
    });

    it('should increase confidence for deep analysis', async () => {
      const shallowResult = await service.analyzeRegressionRisk({
        changeset: ['src/file.ts'],
        depth: 'shallow',
      });

      const deepResult = await service.analyzeRegressionRisk({
        changeset: ['src/file.ts'],
        depth: 'deep',
      });

      expect(shallowResult.success).toBe(true);
      expect(deepResult.success).toBe(true);
      if (shallowResult.success && deepResult.success) {
        expect(deepResult.value.confidence).toBeGreaterThan(shallowResult.value.confidence);
      }
    });

    it('should categorize files into correct areas', async () => {
      const result = await service.analyzeRegressionRisk({
        changeset: [
          'src/controller/api-controller.ts',
          'src/service/business-service.ts',
          'src/repository/data-repository.ts',
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const areas = result.value.impactedAreas.map((a) => a.area);
        expect(areas).toContain('API Layer');
        expect(areas).toContain('Business Logic');
        expect(areas).toContain('Data Access');
      }
    });

    it('should generate test recommendations based on impacted areas', async () => {
      const result = await service.analyzeRegressionRisk({
        changeset: ['src/controller/user-controller.ts'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.recommendedTests.length).toBeGreaterThan(0);
        expect(result.value.recommendedTests.some((t) => t.includes('API'))).toBe(true);
      }
    });
  });

  describe('updateModel', () => {
    it('should store feedback successfully', async () => {
      const feedback: PredictionFeedback = {
        predictionId: 'pred-123',
        file: 'src/test.ts',
        predictedProbability: 0.7,
        actualDefect: true,
        defectType: 'null-pointer',
      };

      const result = await service.updateModel(feedback);

      expect(result.success).toBe(true);
      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.stringContaining('feedback'),
        expect.objectContaining({ predictionId: 'pred-123' }),
        expect.any(Object)
      );
    });

    it('should update model metrics after true positive feedback', async () => {
      const feedback: PredictionFeedback = {
        predictionId: 'pred-456',
        file: 'src/buggy.ts',
        predictedProbability: 0.8,
        actualDefect: true,
      };

      await service.updateModel(feedback);
      const metrics = await service.getModelMetrics();

      expect(metrics.totalPredictions).toBeDefined();
      expect(metrics.accuracy).toBeGreaterThan(0);
    });

    it('should update model metrics after false positive feedback', async () => {
      const feedback: PredictionFeedback = {
        predictionId: 'pred-789',
        file: 'src/clean.ts',
        predictedProbability: 0.6,
        actualDefect: false,
      };

      await service.updateModel(feedback);
      const metrics = await service.getModelMetrics();

      expect(metrics.precision).toBeDefined();
    });
  });

  describe('getModelMetrics', () => {
    it('should return initial model metrics', async () => {
      const metrics = await service.getModelMetrics();

      expect(metrics.accuracy).toBeGreaterThan(0);
      expect(metrics.precision).toBeGreaterThan(0);
      expect(metrics.recall).toBeGreaterThan(0);
      expect(metrics.f1Score).toBeGreaterThan(0);
      expect(metrics.totalPredictions).toBeDefined();
      expect(metrics.lastUpdated).toBeInstanceOf(Date);
    });

    it('should load persisted metrics from memory', async () => {
      const storedMetrics = {
        accuracy: 0.9,
        precision: 0.88,
        recall: 0.92,
        f1Score: 0.90,
        totalPredictions: 100,
        lastUpdated: new Date().toISOString(),
      };

      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key.includes('metrics')) {
          return storedMetrics;
        }
        return undefined;
      });

      const metrics = await service.getModelMetrics();

      expect(metrics.accuracy).toBe(0.9);
      expect(metrics.totalPredictions).toBe(100);
    });

    it('should increment total predictions after predictDefects', async () => {
      const initialMetrics = await service.getModelMetrics();
      const initialCount = initialMetrics.totalPredictions;

      await service.predictDefects({
        files: ['file1.ts', 'file2.ts'],
      });

      const updatedMetrics = await service.getModelMetrics();
      expect(updatedMetrics.totalPredictions).toBe(initialCount + 2);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle files with special characters in path', async () => {
      const result = await service.predictDefects({
        files: ['src/utils/string-helpers[v2].ts'],
      });

      expect(result.success).toBe(true);
    });

    it('should handle memory backend errors gracefully', async () => {
      (mockMemory.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Storage error'));

      const result = await service.predictDefects({
        files: ['src/test.ts'],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Storage error');
      }
    });

    it('should handle service files with higher complexity', async () => {
      const result = await service.predictDefects({
        files: ['src/service/complex-service.ts'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const prediction = result.value.predictions[0];
        // Service files should have higher base complexity
        expect(prediction.probability).toBeGreaterThan(0);
      }
    });

    it('should cache file metrics to avoid recomputation', async () => {
      // First prediction
      await service.predictDefects({ files: ['src/cached.ts'] });

      // Second prediction for same file
      await service.predictDefects({ files: ['src/cached.ts'] });

      // Memory.set should be called to cache metrics
      expect(mockMemory.set).toHaveBeenCalled();
    });
  });
});
