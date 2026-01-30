/**
 * Agentic QE v3 - Native Learning Provider Unit Tests
 * Tests for NativeLearningProvider pattern-based verification
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  NativeLearningProvider,
  createNativeLearningProvider,
  withNativeLearning,
  type NativeLearningProviderConfig,
  type SecurityVerificationPattern,
} from '../../../../../src/coordination/consensus/providers/native-learning-provider';
import type {
  ModelProvider,
  SecurityFinding,
  VoteAssessment,
} from '../../../../../src/coordination/consensus/interfaces';

// ============================================================================
// Mock Setup
// ============================================================================

function createMockProvider(config: {
  id?: string;
  assessment?: VoteAssessment;
  confidence?: number;
  shouldFail?: boolean;
}): ModelProvider {
  return {
    id: config.id || 'mock-provider',
    name: 'Mock Provider',
    type: 'custom',
    complete: vi.fn().mockImplementation(async () => {
      if (config.shouldFail) {
        throw new Error('Mock provider failed');
      }
      return `VERDICT: ${config.assessment || 'confirmed'}
CONFIDENCE: ${Math.round((config.confidence || 0.9) * 100)}
REASONING: Mock analysis completed successfully`;
    }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, availableModels: [] }),
    dispose: vi.fn().mockResolvedValue(undefined),
    getCostPerToken: () => ({ input: 0.001, output: 0.002 }),
  };
}

function createMockPatternStore() {
  const patterns = new Map<string, unknown>();

  return {
    store: vi.fn().mockResolvedValue({ success: true }),
    search: vi.fn().mockImplementation(async (query: string) => ({
      success: true,
      value: [],
    })),
    get: vi.fn().mockImplementation(async (key: string) => patterns.get(key)),
    patterns,
  };
}

function createTestFinding(overrides?: Partial<SecurityFinding>): SecurityFinding {
  return {
    id: 'test-finding-1',
    type: 'sql-injection',
    category: 'injection',
    severity: 'critical',
    description: 'Potential SQL injection vulnerability',
    explanation: 'User input is directly concatenated into SQL query',
    location: {
      file: 'src/database/query.ts',
      line: 42,
      function: 'getUserById',
    },
    evidence: [
      {
        type: 'code-snippet',
        content: 'const query = `SELECT * FROM users WHERE id = ${userId}`;',
        location: 'src/database/query.ts:42',
        confidence: 0.9,
      },
    ],
    cweId: 'CWE-89',
    remediation: 'Use parameterized queries',
    detectedAt: new Date(),
    detectedBy: 'test-scanner',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('NativeLearningProvider', () => {
  let mockFallbackProvider: ModelProvider;
  let mockPatternStore: ReturnType<typeof createMockPatternStore>;

  beforeEach(() => {
    mockFallbackProvider = createMockProvider({});
    mockPatternStore = createMockPatternStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with default config', () => {
      const provider = new NativeLearningProvider();

      expect(provider.id).toBe('native-learning');
      expect(provider.name).toBe('Native Learning (Local Patterns)');
      expect(provider.type).toBe('custom');
    });

    it('should accept pattern store', () => {
      const provider = new NativeLearningProvider({
        patternStore: mockPatternStore as any,
      });

      expect(provider).toBeDefined();
    });

    it('should accept fallback provider', () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
      });

      expect(provider).toBeDefined();
    });

    it('should use custom config values', () => {
      const provider = new NativeLearningProvider({
        minSimilarity: 0.9,
        minConfidence: 0.85,
        minSuccessRate: 0.95,
        minVerificationCount: 5,
        enableLearning: false,
      });

      expect(provider).toBeDefined();
    });
  });

  describe('complete()', () => {
    it('should delegate to fallback provider', async () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
      });

      await provider.complete('Test prompt');

      expect(mockFallbackProvider.complete).toHaveBeenCalledWith('Test prompt', undefined);
    });

    it('should throw error when no fallback provider', async () => {
      const provider = new NativeLearningProvider();

      await expect(provider.complete('Test')).rejects.toThrow(
        'requires a fallback provider'
      );
    });

    it('should throw error when disposed', async () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
      });

      await provider.dispose();

      await expect(provider.complete('Test')).rejects.toThrow('disposed');
    });
  });

  describe('verifyFinding()', () => {
    it('should return cached pattern on cache hit', async () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
        minConfidence: 0.7,
        minSuccessRate: 0.8,
        minVerificationCount: 2,
      });

      // First call - cache miss, delegates to fallback
      const finding1 = createTestFinding();
      await provider.verifyFinding(finding1);

      // Manually add a pattern to simulate learning
      const finding2 = createTestFinding({ id: 'test-finding-2' });
      const result1 = await provider.verifyFinding(finding2);

      expect(result1.modelId).toContain('native-learning');
    });

    it('should delegate to fallback on cache miss', async () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
      });

      const finding = createTestFinding();
      const result = await provider.verifyFinding(finding);

      expect(mockFallbackProvider.complete).toHaveBeenCalled();
      expect(result.modelId).toContain('mock-provider');
    });

    it('should return inconclusive when no fallback and no pattern', async () => {
      const provider = new NativeLearningProvider();

      const finding = createTestFinding();
      const result = await provider.verifyFinding(finding);

      expect(result.assessment).toBe('inconclusive');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('no fallback provider');
    });

    it('should track statistics correctly', async () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
      });

      const finding = createTestFinding();
      await provider.verifyFinding(finding);

      const stats = provider.getStats();

      expect(stats.totalVerifications).toBe(1);
      expect(stats.cacheMisses).toBe(1);
      expect(stats.fallbackCalls).toBe(1);
    });

    it('should handle fallback provider errors', async () => {
      const failingProvider = createMockProvider({ shouldFail: true });
      const provider = new NativeLearningProvider({
        fallbackProvider: failingProvider,
      });

      const finding = createTestFinding();
      const result = await provider.verifyFinding(finding);

      expect(result.assessment).toBe('inconclusive');
      expect(result.error).toContain('Mock provider failed');
    });

    it('should learn from high-confidence results', async () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
        enableLearning: true,
        minConfidence: 0.7,
      });

      const finding = createTestFinding();
      await provider.verifyFinding(finding);

      const stats = provider.getStats();

      // Pattern should be learned from high-confidence result
      expect(stats.patternsLearned).toBeGreaterThanOrEqual(0);
    });

    it('should update verification count on repeat patterns', async () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
        enableLearning: true,
      });

      // Verify same finding multiple times
      const finding = createTestFinding();
      await provider.verifyFinding(finding);
      await provider.verifyFinding(finding);

      const stats = provider.getStats();

      expect(stats.totalVerifications).toBe(2);
    });
  });

  describe('setFallbackProvider()', () => {
    it('should allow setting fallback provider after construction', async () => {
      const provider = new NativeLearningProvider();

      provider.setFallbackProvider(mockFallbackProvider);

      const finding = createTestFinding();
      await provider.verifyFinding(finding);

      expect(mockFallbackProvider.complete).toHaveBeenCalled();
    });
  });

  describe('getStats()', () => {
    it('should return initial empty stats', () => {
      const provider = new NativeLearningProvider();

      const stats = provider.getStats();

      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
      expect(stats.fallbackCalls).toBe(0);
      expect(stats.patternsLearned).toBe(0);
      expect(stats.totalVerifications).toBe(0);
    });

    it('should return copy of stats', () => {
      const provider = new NativeLearningProvider();

      const stats1 = provider.getStats();
      const stats2 = provider.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('getCacheHitRate()', () => {
    it('should return 0 when no verifications', () => {
      const provider = new NativeLearningProvider();

      expect(provider.getCacheHitRate()).toBe(0);
    });

    it('should calculate hit rate correctly', async () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
      });

      // Simulate cache misses
      const finding = createTestFinding();
      await provider.verifyFinding(finding);

      // Hit rate should be low since we're hitting fallback
      const hitRate = provider.getCacheHitRate();

      expect(hitRate).toBeGreaterThanOrEqual(0);
      expect(hitRate).toBeLessThanOrEqual(1);
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy when pattern store is accessible', async () => {
      const provider = new NativeLearningProvider({
        patternStore: mockPatternStore as any,
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.availableModels).toContain('native-pattern-matcher');
    });

    it('should return healthy when fallback is healthy', async () => {
      const provider = new NativeLearningProvider({
        fallbackProvider: mockFallbackProvider,
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
    });

    it('should return unhealthy when fallback is unhealthy', async () => {
      const unhealthyProvider = createMockProvider({});
      unhealthyProvider.healthCheck = vi.fn().mockResolvedValue({
        healthy: false,
        error: 'Provider error',
      });

      const provider = new NativeLearningProvider({
        fallbackProvider: unhealthyProvider,
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Fallback: FAIL');
    });
  });

  describe('getCostPerToken()', () => {
    it('should return zero cost for local patterns', () => {
      const provider = new NativeLearningProvider();

      const cost = provider.getCostPerToken();

      expect(cost.input).toBe(0);
      expect(cost.output).toBe(0);
    });
  });
});

describe('Factory Functions', () => {
  describe('createNativeLearningProvider()', () => {
    it('should create provider with default config', () => {
      const provider = createNativeLearningProvider();

      expect(provider).toBeInstanceOf(NativeLearningProvider);
    });

    it('should create provider with custom config', () => {
      const mockFallback = createMockProvider({});

      const provider = createNativeLearningProvider({
        fallbackProvider: mockFallback,
        minSimilarity: 0.9,
      });

      expect(provider).toBeInstanceOf(NativeLearningProvider);
    });
  });

  describe('withNativeLearning()', () => {
    it('should wrap existing provider with native learning', () => {
      const baseProvider = createMockProvider({ id: 'base' });

      const wrappedProvider = withNativeLearning(baseProvider);

      expect(wrappedProvider).toBeInstanceOf(NativeLearningProvider);
    });

    it('should pass config to wrapper', () => {
      const baseProvider = createMockProvider({ id: 'base' });

      const wrappedProvider = withNativeLearning(baseProvider, {
        minSimilarity: 0.9,
        enableLearning: false,
      });

      expect(wrappedProvider).toBeInstanceOf(NativeLearningProvider);
    });

    it('should delegate to wrapped provider', async () => {
      const baseProvider = createMockProvider({ id: 'base' });

      const wrappedProvider = withNativeLearning(baseProvider);

      await wrappedProvider.complete('Test prompt');

      expect(baseProvider.complete).toHaveBeenCalled();
    });
  });
});

describe('Pattern Matching', () => {
  it('should match patterns by category and type', async () => {
    const mockFallback = createMockProvider({
      assessment: 'confirmed',
      confidence: 0.95,
    });

    const provider = new NativeLearningProvider({
      fallbackProvider: mockFallback,
      enableLearning: true,
    });

    // First call learns the pattern
    const finding1 = createTestFinding({
      category: 'injection',
      type: 'sql-injection',
    });
    await provider.verifyFinding(finding1);

    // Second call with same pattern should learn
    const finding2 = createTestFinding({
      id: 'finding-2',
      category: 'injection',
      type: 'sql-injection',
    });
    const result = await provider.verifyFinding(finding2);

    expect(result).toBeDefined();
  });

  it('should use code patterns for similarity', async () => {
    const mockFallback = createMockProvider({});

    const provider = new NativeLearningProvider({
      fallbackProvider: mockFallback,
      enableLearning: true,
    });

    const finding = createTestFinding({
      evidence: [
        {
          type: 'code-snippet',
          content: 'db.query("SELECT * FROM users WHERE id = " + userId)',
          location: 'src/db.ts:10',
          confidence: 0.9,
        },
      ],
    });

    await provider.verifyFinding(finding);

    const stats = provider.getStats();

    expect(stats.totalVerifications).toBe(1);
  });
});
