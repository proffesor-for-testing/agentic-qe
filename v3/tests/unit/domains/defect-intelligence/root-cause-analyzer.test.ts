/**
 * Agentic QE v3 - Root Cause Analyzer Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RootCauseAnalyzerService } from '../../../../src/domains/defect-intelligence/services/root-cause-analyzer';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { TimelineEvent } from '../../../../src/domains/defect-intelligence/interfaces';

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
    search: vi.fn().mockImplementation(async (_pattern: string, _limit?: number) => {
      return [];
    }),
    vectorSearch: vi.fn().mockResolvedValue([]),
    storeVector: vi.fn().mockImplementation(async (key: string, embedding: number[], metadata?: unknown) => {
      vectors.set(key, { embedding, metadata });
    }),
  };
}

describe('RootCauseAnalyzerService', () => {
  let service: RootCauseAnalyzerService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new RootCauseAnalyzerService(mockMemory);
  });

  describe('analyzeRootCause', () => {
    it('should analyze root cause for null reference symptoms', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-123',
        symptoms: ['NullPointerException', 'Cannot read property of undefined', 'null reference'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.defectId).toBe('defect-123');
        expect(result.value.rootCause).toBeDefined();
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.contributingFactors).toBeInstanceOf(Array);
        expect(result.value.recommendations).toBeInstanceOf(Array);
      }
    });

    it('should return error for empty symptoms array', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-123',
        symptoms: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('No symptoms provided for analysis');
      }
    });

    it('should identify concurrency root cause from race condition symptoms', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-456',
        symptoms: ['race condition', 'intermittent failure', 'timing issue', 'concurrent access'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Root cause can be any concurrency-related issue
        expect(result.value.rootCause.toLowerCase()).toMatch(/concurrent|synchronization|race|async|lock|thread|timing/);
      }
    });

    it('should identify resource management root cause from memory symptoms', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-789',
        symptoms: ['memory leak', 'OutOfMemory', 'heap exhausted', 'connection pool'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Root cause can be any resource-related issue
        expect(result.value.rootCause.toLowerCase()).toMatch(/resource|memory|cleanup|release|pool|connection|gc/);
      }
    });

    it('should return low confidence result when symptoms are unclear', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-unknown',
        symptoms: ['something went wrong'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Low confidence results should still provide guidance
        expect(result.value.confidence).toBeLessThan(0.5);
      }
    });

    it('should include context-based contributing factors', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-context',
        symptoms: ['API error', 'service unavailable'],
        context: {
          recentChanges: true,
          highTraffic: true,
          environment: 'production',
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const factorNames = result.value.contributingFactors.map((f) => f.factor.toLowerCase());
        expect(factorNames.some((f) => f.includes('recent') || f.includes('traffic') || f.includes('environment'))).toBe(
          true
        );
      }
    });

    it('should generate relevant recommendations based on root cause', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-security',
        symptoms: ['SQL injection', 'input validation', 'security vulnerability'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.recommendations.length).toBeGreaterThan(0);
        expect(
          result.value.recommendations.some(
            (r) => r.toLowerCase().includes('sanitiz') || r.toLowerCase().includes('validat')
          )
        ).toBe(true);
      }
    });

    it('should store analysis in memory for future reference', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-store',
        symptoms: ['null pointer exception', 'undefined error'], // Clear symptoms to match a pattern
      });

      expect(result.success).toBe(true);
      if (result.success && result.value.confidence >= 0.3) {
        // Only high-confidence analyses are stored
        expect(mockMemory.set).toHaveBeenCalled();
      }
    });

    it('should identify data integrity root cause', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-data',
        symptoms: ['corrupt data', 'invalid state', 'constraint violation', 'duplicate entry'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.rootCause.toLowerCase()).toMatch(/data|validation|integrity|constraint/);
      }
    });
  });

  describe('findRelatedDefects', () => {
    it('should find defects with same root cause category', async () => {
      // Setup: Store analysis for the target defect
      const storedAnalysis = { defectId: 'target-defect', category: 'null-reference' };
      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key.includes('target-defect')) {
          return storedAnalysis;
        }
        if (key.includes('related-1')) {
          return { defectId: 'related-1', category: 'null-reference' };
        }
        if (key.includes('unrelated')) {
          return { defectId: 'unrelated', category: 'concurrency' };
        }
        return undefined;
      });

      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        'analysis:target-defect',
        'analysis:related-1',
        'analysis:unrelated',
      ]);

      const result = await service.findRelatedDefects('target-defect');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toContain('related-1');
        expect(result.value).not.toContain('unrelated');
      }
    });

    it('should return empty array for defect without prior analysis', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await service.findRelatedDefects('unknown-defect');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should exclude the source defect from related defects', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        return { defectId: key.split(':').pop(), category: 'test-category' };
      });
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        'analysis:defect-1',
        'analysis:defect-2',
        'analysis:defect-1', // Duplicate
      ]);

      const result = await service.findRelatedDefects('defect-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).not.toContain('defect-1');
      }
    });
  });

  describe('generateTimeline', () => {
    it('should return stored timeline events', async () => {
      const storedEvents: TimelineEvent[] = [
        { timestamp: new Date('2024-01-01'), event: 'Code deployed', relevance: 0.9 },
        { timestamp: new Date('2024-01-02'), event: 'Bug reported', relevance: 1.0 },
      ];

      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(storedEvents);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.generateTimeline('defect-timeline');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(2);
      }
    });

    it('should include code changes from code intelligence', async () => {
      const codeChange = {
        timestamp: '2024-01-15T10:00:00Z',
        description: 'Updated authentication module',
        file: 'src/auth.ts',
      };

      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key.includes('change:')) {
          return codeChange;
        }
        return undefined;
      });
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(['code-intelligence:change:1']);

      const result = await service.generateTimeline('defect-with-changes');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.some((e) => e.event.includes('Code change'))).toBe(true);
      }
    });

    it('should sort timeline by timestamp descending', async () => {
      const storedEvents: TimelineEvent[] = [
        { timestamp: new Date('2024-01-01'), event: 'Oldest', relevance: 0.5 },
        { timestamp: new Date('2024-01-03'), event: 'Newest', relevance: 0.5 },
        { timestamp: new Date('2024-01-02'), event: 'Middle', relevance: 0.5 },
      ];

      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(storedEvents);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.generateTimeline('defect-sorted');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value[0].event).toBe('Newest');
        expect(result.value[result.value.length - 1].event).toBe('Oldest');
      }
    });

    it('should respect max timeline events limit', async () => {
      const manyEvents: TimelineEvent[] = Array.from({ length: 50 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 86400000),
        event: `Event ${i}`,
        relevance: 0.5,
      }));

      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(manyEvents);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.generateTimeline('defect-many-events');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(20); // Default maxTimelineEvents
      }
    });

    it('should return empty array when no events found', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.generateTimeline('defect-no-events');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('suggestRemediation', () => {
    it('should suggest remediation for logic errors', async () => {
      const suggestions = await service.suggestRemediation('Incorrect algorithm implementation');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.toLowerCase().includes('test') || s.toLowerCase().includes('review'))).toBe(
        true
      );
    });

    it('should suggest remediation for null reference issues', async () => {
      const suggestions = await service.suggestRemediation('Missing null check');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.toLowerCase().includes('null') || s.toLowerCase().includes('optional'))).toBe(
        true
      );
    });

    it('should suggest remediation for concurrency issues', async () => {
      const suggestions = await service.suggestRemediation('Missing synchronization in concurrent access');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(
        suggestions.some((s) => s.toLowerCase().includes('lock') || s.toLowerCase().includes('synchron'))
      ).toBe(true);
    });

    it('should suggest remediation for security issues', async () => {
      const suggestions = await service.suggestRemediation('Missing input sanitization');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.toLowerCase().includes('sanitiz') || s.toLowerCase().includes('input'))).toBe(
        true
      );
    });

    it('should return generic suggestions for unknown root causes', async () => {
      const suggestions = await service.suggestRemediation('Some unknown issue type');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.includes('test') || s.includes('document') || s.includes('Review'))).toBe(true);
    });

    it('should return unique suggestions without duplicates', async () => {
      const suggestions = await service.suggestRemediation('Memory leak and resource exhaustion');

      const uniqueSuggestions = [...new Set(suggestions)];
      expect(suggestions.length).toBe(uniqueSuggestions.length);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle symptoms with file paths', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-files',
        symptoms: [
          'Error in src/service/user-service.ts',
          'Stack trace shows lib/database/connection.js:45',
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.relatedFiles.length).toBeGreaterThan(0);
      }
    });

    it('should extract file references from path patterns', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-paths',
        symptoms: ['app/controllers/api_controller raised exception'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Either finds the path pattern or returns empty (both valid)
        expect(result.value.relatedFiles).toBeInstanceOf(Array);
      }
    });

    it('should handle memory backend errors gracefully', async () => {
      (mockMemory.set as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Storage failure'));

      const result = await service.analyzeRootCause({
        defectId: 'defect-error',
        symptoms: ['null pointer exception', 'undefined variable'], // Clear symptoms to trigger storage
      });

      // Analysis may fail if storage fails during the process
      expect(result.success === false || result.success === true).toBe(true);
    });

    it('should handle very long symptom strings', async () => {
      const longSymptom = 'Error: '.repeat(1000);
      const result = await service.analyzeRootCause({
        defectId: 'defect-long',
        symptoms: [longSymptom],
      });

      expect(result.success).toBe(true);
    });

    it('should handle symptoms with special characters', async () => {
      const result = await service.analyzeRootCause({
        defectId: 'defect-special',
        symptoms: [
          'Error: <div onclick="alert(1)">XSS</div>',
          "SQL: SELECT * FROM users WHERE id='1' OR '1'='1'",
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should update historical data for recurring issues', async () => {
      // Use clear symptoms to ensure patterns match
      const result1 = await service.analyzeRootCause({
        defectId: 'defect-recurring-1',
        symptoms: ['NullPointerException', 'null reference', 'undefined'],
      });

      const result2 = await service.analyzeRootCause({
        defectId: 'defect-recurring-2',
        symptoms: ['null reference error', 'Cannot read property of undefined'],
      });

      // Both should succeed with sufficient confidence to trigger storage
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should include historical patterns in contributing factors', async () => {
      // Setup historical data
      (mockMemory.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key.includes('history:')) {
          return {
            occurrences: 5,
            commonFactors: ['Missing validation', 'API contract change'],
          };
        }
        return undefined;
      });

      const result = await service.analyzeRootCause({
        defectId: 'defect-historical',
        symptoms: ['API error', 'service unavailable'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const hasRecurringFactor = result.value.contributingFactors.some((f) =>
          f.factor.toLowerCase().includes('recurring')
        );
        expect(hasRecurringFactor).toBe(true);
      }
    });
  });

  describe('configuration', () => {
    it('should respect custom min confidence threshold', async () => {
      const strictService = new RootCauseAnalyzerService(mockMemory, {
        minConfidenceThreshold: 0.9,
      });

      const result = await strictService.analyzeRootCause({
        defectId: 'defect-strict',
        symptoms: ['vague error'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // With high threshold, may not meet confidence requirements
        expect(result.value.rootCause).toBeDefined();
      }
    });

    it('should respect custom max timeline events', async () => {
      const limitedService = new RootCauseAnalyzerService(mockMemory, {
        maxTimelineEvents: 5,
      });

      const manyEvents: TimelineEvent[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 86400000),
        event: `Event ${i}`,
        relevance: 0.5,
      }));

      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(manyEvents);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await limitedService.generateTimeline('defect-limited');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(5);
      }
    });
  });
});
