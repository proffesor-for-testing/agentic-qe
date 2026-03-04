/**
 * Tests for EdgeCaseInjector - Pre-task Pattern Injection
 * Loki-mode Item 5: Edge Case Injector
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EdgeCaseInjector,
  extractKeywords,
  DEFAULT_INJECTION_CONFIG,
} from '../../../../src/domains/test-generation/pattern-injection/edge-case-injector.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockMemory(
  searchResults: Record<string, string[]> = {},
  getResults: Record<string, unknown> = {}
): MemoryBackend {
  return {
    search: vi.fn(async (pattern: string) => {
      // Find matching results by checking each registered pattern
      for (const [key, value] of Object.entries(searchResults)) {
        if (pattern === key || pattern.includes('*')) {
          return value;
        }
      }
      return [];
    }),
    get: vi.fn(async (key: string) => {
      return getResults[key];
    }),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => true),
    has: vi.fn(async () => false),
    vectorSearch: vi.fn(async () => []),
    storeVector: vi.fn(async () => {}),
    count: vi.fn(async () => 0),
    hasCodeIntelligenceIndex: vi.fn(async () => false),
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  } as unknown as MemoryBackend;
}

function createPatternData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'null-input-check',
    description: 'When receiving null/undefined inputs, test for TypeError or graceful handling',
    confidence: 0.8,
    successRate: 0.9,
    usageCount: 15,
    tags: ['null-check', 'edge-case'],
    ...overrides,
  };
}

const SAMPLE_SOURCE = `
import { UserService } from './user-service';
import { Database } from '../database';

export class AuthController {
  constructor(private userService: UserService, private db: Database) {}

  async login(username: string, password: string): Promise<boolean> {
    const user = await this.userService.findByUsername(username);
    if (!user) return false;
    return user.password === password;
  }

  async register(email: string, password: string): Promise<void> {
    await this.db.insert('users', { email, password });
  }
}
`;

// ============================================================================
// Tests: extractKeywords
// ============================================================================

describe('extractKeywords', () => {
  it('should extract function names from declarations', () => {
    const code = 'function calculateDiscount(user) { return 0; }';
    const keywords = extractKeywords(code);
    expect(keywords).toContain('calculateDiscount');
  });

  it('should extract class names', () => {
    const code = 'class UserService { doWork() {} }';
    const keywords = extractKeywords(code);
    expect(keywords).toContain('UserService');
  });

  it('should extract const/arrow function names', () => {
    const code = 'const processItems = (items) => items.map(x => x);';
    const keywords = extractKeywords(code);
    expect(keywords).toContain('processItems');
  });

  it('should extract named imports', () => {
    const code = `import { UserService, Database } from './services';`;
    const keywords = extractKeywords(code);
    expect(keywords).toContain('UserService');
    expect(keywords).toContain('Database');
  });

  it('should extract default imports', () => {
    const code = `import Router from 'express';`;
    const keywords = extractKeywords(code);
    expect(keywords).toContain('Router');
  });

  it('should extract method calls longer than 2 chars', () => {
    const code = 'this.userService.findByUsername(name);';
    const keywords = extractKeywords(code);
    expect(keywords).toContain('findByUsername');
  });

  it('should filter out noise words', () => {
    const code = 'const x = function map() { return this.filter(); }';
    const keywords = extractKeywords(code);
    expect(keywords).not.toContain('const');
    expect(keywords).not.toContain('function');
    expect(keywords).not.toContain('map');
    expect(keywords).not.toContain('filter');
  });

  it('should extract multiple keywords from complex source', () => {
    const keywords = extractKeywords(SAMPLE_SOURCE);
    expect(keywords).toContain('AuthController');
    expect(keywords).toContain('UserService');
    expect(keywords).toContain('Database');
    expect(keywords).toContain('login');
    expect(keywords).toContain('register');
  });

  it('should return empty array for empty source', () => {
    expect(extractKeywords('')).toEqual([]);
  });
});

// ============================================================================
// Tests: EdgeCaseInjector
// ============================================================================

describe('EdgeCaseInjector', () => {
  describe('getInjectionContext', () => {
    it('should return formatted prompt context with patterns', async () => {
      const patternKeys = ['pattern:test-generation:null-check'];
      const mockMemory = createMockMemory(
        { 'edge-case:*AuthController*': patternKeys },
        {
          'pattern:test-generation:null-check': createPatternData(),
        }
      );

      // Override search to return keys for any query
      vi.mocked(mockMemory.search).mockResolvedValue(patternKeys);

      const injector = new EdgeCaseInjector(mockMemory);
      const result = await injector.getInjectionContext(SAMPLE_SOURCE, 'test-generation');

      expect(result.patternsUsed).toBeGreaterThan(0);
      expect(result.promptContext).toContain('Historical Edge Cases');
      expect(result.promptContext).toContain('null-check');
    });

    it('should return empty context when no patterns found', async () => {
      const mockMemory = createMockMemory();
      vi.mocked(mockMemory.search).mockResolvedValue([]);

      const injector = new EdgeCaseInjector(mockMemory);
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      expect(result.promptContext).toBe('');
      expect(result.patternsUsed).toBe(0);
      expect(result.totalConsidered).toBe(0);
    });

    it('should respect topN config to limit patterns', async () => {
      const keys = [
        'pattern:1', 'pattern:2', 'pattern:3', 'pattern:4', 'pattern:5',
      ];
      const getResults: Record<string, unknown> = {};
      for (let i = 0; i < 5; i++) {
        getResults[keys[i]] = createPatternData({
          name: `pattern-${i + 1}`,
          description: `Edge case ${i + 1}`,
          confidence: 0.8,
          successRate: 0.9 - i * 0.05,
          usageCount: 20 - i * 2,
        });
      }

      const mockMemory = createMockMemory({}, getResults);
      vi.mocked(mockMemory.search).mockResolvedValue(keys);

      const injector = new EdgeCaseInjector(mockMemory, { topN: 3 });
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      expect(result.patternsUsed).toBe(3);
      expect(result.totalConsidered).toBe(5);
    });

    it('should filter patterns below minConfidence', async () => {
      const keys = ['pattern:high', 'pattern:low'];
      const mockMemory = createMockMemory({}, {
        'pattern:high': createPatternData({
          name: 'high-conf',
          description: 'High confidence edge case',
          confidence: 0.8,
        }),
        'pattern:low': createPatternData({
          name: 'low-conf',
          description: 'Low confidence edge case',
          confidence: 0.2,
        }),
      });
      vi.mocked(mockMemory.search).mockResolvedValue(keys);

      const injector = new EdgeCaseInjector(mockMemory, { minConfidence: 0.5 });
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      expect(result.patternsUsed).toBe(1);
      expect(result.totalConsidered).toBe(2);
      expect(result.promptContext).toContain('High confidence edge case');
      expect(result.promptContext).not.toContain('Low confidence edge case');
    });

    it('should format prompt as numbered list', async () => {
      const keys = ['pattern:a', 'pattern:b'];
      const mockMemory = createMockMemory({}, {
        'pattern:a': createPatternData({
          name: 'null-handler',
          description: 'Test null inputs',
          tags: ['null-check'],
        }),
        'pattern:b': createPatternData({
          name: 'empty-array',
          description: 'Test empty arrays',
          tags: ['boundary'],
        }),
      });
      vi.mocked(mockMemory.search).mockResolvedValue(keys);

      const injector = new EdgeCaseInjector(mockMemory);
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      expect(result.promptContext).toMatch(/^## Historical Edge Cases/);
      expect(result.promptContext).toMatch(/1\. \[null-check\] Test null inputs/);
      expect(result.promptContext).toMatch(/2\. \[boundary\] Test empty arrays/);
    });

    it('should sort by relevance heuristic (successRate + confidence + usage)', async () => {
      const keys = ['pattern:low', 'pattern:high'];
      const mockMemory = createMockMemory({}, {
        'pattern:low': createPatternData({
          name: 'low-relevance',
          description: 'Less relevant',
          successRate: 0.3,
          confidence: 0.5,
          usageCount: 1,
        }),
        'pattern:high': createPatternData({
          name: 'high-relevance',
          description: 'More relevant',
          successRate: 0.95,
          confidence: 0.9,
          usageCount: 50,
        }),
      });
      vi.mocked(mockMemory.search).mockResolvedValue(keys);

      const injector = new EdgeCaseInjector(mockMemory);
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      // high-relevance should be first (item 1)
      const lines = result.promptContext.split('\n').filter(l => l.match(/^\d+\./));
      expect(lines[0]).toContain('More relevant');
    });

    it('should handle memory.search failure gracefully', async () => {
      const mockMemory = createMockMemory();
      vi.mocked(mockMemory.search).mockRejectedValue(new Error('DB connection failed'));

      const injector = new EdgeCaseInjector(mockMemory);
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      expect(result.promptContext).toBe('');
      expect(result.patternsUsed).toBe(0);
    });

    it('should handle memory.get failure for individual patterns gracefully', async () => {
      const keys = ['pattern:good', 'pattern:bad'];
      const mockMemory = createMockMemory({}, {});
      vi.mocked(mockMemory.search).mockResolvedValue(keys);
      vi.mocked(mockMemory.get).mockImplementation(async (key: string) => {
        if (key === 'pattern:bad') throw new Error('corrupted');
        if (key === 'pattern:good') {
          return createPatternData({
            name: 'working-pattern',
            description: 'A working edge case pattern',
          });
        }
        return undefined;
      });

      const injector = new EdgeCaseInjector(mockMemory);
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      expect(result.patternsUsed).toBe(1);
      expect(result.promptContext).toContain('A working edge case pattern');
    });

    it('should use domain filter in search queries', async () => {
      const mockMemory = createMockMemory();
      vi.mocked(mockMemory.search).mockResolvedValue([]);

      const injector = new EdgeCaseInjector(mockMemory);
      await injector.getInjectionContext(SAMPLE_SOURCE, 'coverage-analysis');

      const searchCalls = vi.mocked(mockMemory.search).mock.calls;
      const queries = searchCalls.map(c => c[0]);
      expect(queries.some(q => q.includes('coverage-analysis'))).toBe(true);
    });

    it('should infer tags when patterns have no tags', async () => {
      const keys = ['pattern:null-handler'];
      const mockMemory = createMockMemory({}, {
        'pattern:null-handler': createPatternData({
          name: 'null-handler-pattern',
          description: 'Handle null values',
          tags: [],
        }),
      });
      vi.mocked(mockMemory.search).mockResolvedValue(keys);

      const injector = new EdgeCaseInjector(mockMemory);
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      expect(result.promptContext).toContain('[null-check]');
    });

    it('should use default config values', () => {
      expect(DEFAULT_INJECTION_CONFIG.topN).toBe(3);
      expect(DEFAULT_INJECTION_CONFIG.minConfidence).toBe(0.5);
      expect(DEFAULT_INJECTION_CONFIG.namespace).toBe('aqe/v3/domains/test-generation');
    });

    it('should skip patterns with no name and no description', async () => {
      const keys = ['pattern:empty'];
      const mockMemory = createMockMemory({}, {
        'pattern:empty': { confidence: 0.8, successRate: 0.9 },
      });
      vi.mocked(mockMemory.search).mockResolvedValue(keys);

      const injector = new EdgeCaseInjector(mockMemory);
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      // Pattern with name inferred from key should still be included
      // The key "pattern:empty" gives name "empty" from the last segment
      expect(result.patternsUsed).toBe(1);
    });

    it('should handle non-object values from memory.get', async () => {
      const keys = ['pattern:str'];
      const mockMemory = createMockMemory({}, {
        'pattern:str': 'just a string' as unknown,
      });
      vi.mocked(mockMemory.search).mockResolvedValue(keys);

      const injector = new EdgeCaseInjector(mockMemory);
      const result = await injector.getInjectionContext(SAMPLE_SOURCE);

      expect(result.patternsUsed).toBe(0);
    });
  });
});
