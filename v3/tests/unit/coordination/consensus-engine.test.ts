/**
 * Agentic QE v3 - Consensus Engine Unit Tests
 * Tests for multi-model consensus verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConsensusEngineImpl,
  createMockProvider,
  createProviderRegistry,
  createMajorityStrategy,
  createWeightedStrategy,
  createUnanimousStrategy,
  createConsensusEngine,
  createTestConsensusEngine,
  type SecurityFinding,
  type ModelProvider,
} from '../../../src/coordination/consensus';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test security finding
 */
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
        confidence: 0.9,
      },
    ],
    cweId: 'CWE-89',
    remediation: 'Use parameterized queries or prepared statements',
    detectedAt: new Date(),
    detectedBy: 'test-scanner',
    ...overrides,
  };
}

// ============================================================================
// Consensus Engine Tests
// ============================================================================

describe('ConsensusEngine', () => {
  let mockProviders: ModelProvider[];

  beforeEach(() => {
    // Create three mock providers with different behaviors
    mockProviders = [
      createMockProvider({
        id: 'mock-claude',
        name: 'Mock Claude',
        defaultAssessment: 'confirmed',
        defaultConfidence: 0.9,
        latencyMs: 100,
      }),
      createMockProvider({
        id: 'mock-gpt',
        name: 'Mock GPT',
        defaultAssessment: 'confirmed',
        defaultConfidence: 0.85,
        latencyMs: 150,
      }),
      createMockProvider({
        id: 'mock-gemini',
        name: 'Mock Gemini',
        defaultAssessment: 'confirmed',
        defaultConfidence: 0.8,
        latencyMs: 120,
      }),
    ];
  });

  describe('verify()', () => {
    it('should verify a finding with majority consensus', async () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical', 'high'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: true,
        humanReviewThreshold: 0.6,
      });

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.verdict).toBe('verified');
        expect(result.value.votes).toHaveLength(3);
        expect(result.value.confidence).toBeGreaterThan(0.8);
        expect(result.value.agreementRatio).toBe(1.0); // All agree
      }
    });

    it('should handle disputed findings', async () => {
      // Create providers with mixed assessments
      const mixedProviders = [
        createMockProvider({
          id: 'agree-1',
          name: 'Agrees',
          defaultAssessment: 'confirmed',
          defaultConfidence: 0.9,
        }),
        createMockProvider({
          id: 'disagree-1',
          name: 'Disagrees',
          defaultAssessment: 'rejected',
          defaultConfidence: 0.85,
        }),
      ];

      const registry = createProviderRegistry(mixedProviders);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 2,
        verifySeverities: ['critical'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: false,
        humanReviewThreshold: 0.6,
      });

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.verdict).toBe('disputed');
        expect(result.value.requiresHumanReview).toBe(true);
        expect(result.value.agreementRatio).toBe(0.5);
      }
    });

    it('should return insufficient when not enough models available', async () => {
      const singleProvider = [mockProviders[0]];
      const registry = createProviderRegistry(singleProvider);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: false,
        humanReviewThreshold: 0.6,
      });

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Insufficient models');
      }
    });

    it('should skip verification for low-severity findings', async () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical', 'high'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: false,
        humanReviewThreshold: 0.6,
      });

      const finding = createTestFinding({ severity: 'low' });
      const result = await engine.verify(finding);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.verdict).toBe('insufficient');
        expect(result.value.votes).toHaveLength(0);
        expect(result.value.reasoning).toContain('Verification skipped');
      }
    });

    it('should handle provider failures gracefully', async () => {
      const failingProviders = [
        createMockProvider({
          id: 'working',
          name: 'Working Provider',
          defaultAssessment: 'confirmed',
          defaultConfidence: 0.9,
        }),
        createMockProvider({
          id: 'failing',
          name: 'Failing Provider',
          failureRate: 1.0, // Always fail
        }),
      ];

      const registry = createProviderRegistry(failingProviders);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 1,
        maxModels: 2,
        verifySeverities: ['critical'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 1,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: false,
        humanReviewThreshold: 0.6,
      });

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.votes).toHaveLength(2);
        // One vote should have an error
        const errorVotes = result.value.votes.filter(v => v.error);
        expect(errorVotes).toHaveLength(1);
      }
    });

    it('should track costs when enabled', async () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: true,
        humanReviewThreshold: 0.6,
      });

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalCost).toBeDefined();
        expect(result.value.totalCost).toBeGreaterThan(0);
        result.value.votes.forEach(vote => {
          if (!vote.error) {
            expect(vote.cost).toBeDefined();
            expect(vote.tokenUsage).toBeDefined();
          }
        });
      }
    });
  });

  describe('verifyBatch()', () => {
    it('should verify multiple findings in batch', async () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical', 'high'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: false,
        humanReviewThreshold: 0.6,
      });

      const findings = [
        createTestFinding({ id: 'finding-1' }),
        createTestFinding({ id: 'finding-2' }),
        createTestFinding({ id: 'finding-3' }),
      ];

      const result = await engine.verifyBatch(findings);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(3);
        result.value.forEach(r => {
          expect(r.verdict).toBe('verified');
        });
      }
    });
  });

  describe('configuration management', () => {
    it('should get and set threshold', () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry);

      expect(engine.getThreshold()).toBe(2 / 3); // Default

      engine.setThreshold(0.75);
      expect(engine.getThreshold()).toBe(0.75);
    });

    it('should validate threshold range', () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry);

      expect(() => engine.setThreshold(-0.1)).toThrow();
      expect(() => engine.setThreshold(1.1)).toThrow();
    });

    it('should manage models', () => {
      const registry = createProviderRegistry([mockProviders[0]]);
      const engine = new ConsensusEngineImpl(registry);

      expect(engine.getModels()).toHaveLength(1);

      engine.addModel(mockProviders[1]);
      expect(engine.getModels()).toHaveLength(2);

      const removed = engine.removeModel('mock-gpt');
      expect(removed).toBe(true);
      expect(engine.getModels()).toHaveLength(1);
    });

    it('should update configuration', () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry);

      const initialConfig = engine.getConfig();
      expect(initialConfig.minModels).toBe(2);

      engine.updateConfig({ minModels: 3 });

      const updatedConfig = engine.getConfig();
      expect(updatedConfig.minModels).toBe(3);
    });
  });

  describe('statistics tracking', () => {
    it('should track verification statistics', async () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: true,
        humanReviewThreshold: 0.6,
      });

      const finding = createTestFinding();

      // Initial stats
      let stats = engine.getStats();
      expect(stats.totalVerifications).toBe(0);

      // Perform verification
      await engine.verify(finding);

      // Updated stats
      stats = engine.getStats();
      expect(stats.totalVerifications).toBe(1);
      expect(stats.byVerdict.verified).toBe(1);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
      expect(stats.modelStats['mock-claude']).toBeDefined();
    });

    it('should reset statistics', async () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: false,
        humanReviewThreshold: 0.6,
      });

      const finding = createTestFinding();
      await engine.verify(finding);

      expect(engine.getStats().totalVerifications).toBe(1);

      engine.resetStats();
      expect(engine.getStats().totalVerifications).toBe(0);
    });
  });

  describe('requiresVerification()', () => {
    it('should correctly determine if verification is required', () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical', 'high'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: false,
        humanReviewThreshold: 0.6,
      });

      expect(engine.requiresVerification(createTestFinding({ severity: 'critical' }))).toBe(true);
      expect(engine.requiresVerification(createTestFinding({ severity: 'high' }))).toBe(true);
      expect(engine.requiresVerification(createTestFinding({ severity: 'medium' }))).toBe(false);
      expect(engine.requiresVerification(createTestFinding({ severity: 'low' }))).toBe(false);
    });
  });

  describe('dispose()', () => {
    it('should dispose engine and reject further operations', async () => {
      const registry = createProviderRegistry(mockProviders);
      const engine = new ConsensusEngineImpl(registry);

      await engine.dispose();

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('disposed');
      }
    });
  });
});

// ============================================================================
// Strategy Tests
// ============================================================================

describe('Consensus Strategies', () => {
  describe('MajorityStrategy', () => {
    it('should verify with simple majority', () => {
      const strategy = createMajorityStrategy({ minVotes: 2 });

      const votes = [
        { modelId: 'model1', agrees: true, confidence: 0.9, assessment: 'confirmed' as const, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: true, confidence: 0.85, assessment: 'confirmed' as const, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model3', agrees: false, confidence: 0.7, assessment: 'rejected' as const, reasoning: 'Invalid', executionTime: 100, votedAt: new Date() },
      ];

      const result = strategy.apply(votes);

      expect(result.verdict).toBe('verified');
      expect(result.agreementRatio).toBeCloseTo(2 / 3);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should dispute when votes are split', () => {
      const strategy = createMajorityStrategy();

      const votes = [
        { modelId: 'model1', agrees: true, confidence: 0.9, assessment: 'confirmed' as const, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: false, confidence: 0.9, assessment: 'rejected' as const, reasoning: 'Invalid', executionTime: 100, votedAt: new Date() },
      ];

      const result = strategy.apply(votes);

      expect(result.verdict).toBe('disputed');
      expect(result.requiresHumanReview).toBe(true);
    });
  });

  describe('WeightedStrategy', () => {
    it('should weight votes by confidence', () => {
      const strategy = createWeightedStrategy({ agreementThreshold: 0.6 });

      const votes = [
        { modelId: 'model1', agrees: true, confidence: 0.95, assessment: 'confirmed' as const, reasoning: 'High confidence', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: false, confidence: 0.5, assessment: 'rejected' as const, reasoning: 'Low confidence', executionTime: 100, votedAt: new Date() },
      ];

      const result = strategy.apply(votes);

      // High-confidence vote should dominate
      expect(result.verdict).toBe('verified');
      expect(result.agreementRatio).toBeGreaterThan(0.6);
    });

    it('should filter low-confidence votes', () => {
      const strategy = createWeightedStrategy({ minConfidence: 0.5 });

      const votes = [
        { modelId: 'model1', agrees: true, confidence: 0.8, assessment: 'confirmed' as const, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: false, confidence: 0.3, assessment: 'rejected' as const, reasoning: 'Very unsure', executionTime: 100, votedAt: new Date() },
      ];

      const result = strategy.apply(votes);

      // Low-confidence vote should be filtered out
      expect(result.verdict).toBe('verified');
    });
  });

  describe('UnanimousStrategy', () => {
    it('should verify only with unanimous agreement', () => {
      const strategy = createUnanimousStrategy();

      const votes = [
        { modelId: 'model1', agrees: true, confidence: 0.9, assessment: 'confirmed' as const, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: true, confidence: 0.85, assessment: 'confirmed' as const, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model3', agrees: true, confidence: 0.8, assessment: 'confirmed' as const, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
      ];

      const result = strategy.apply(votes);

      expect(result.verdict).toBe('verified');
      expect(result.agreementRatio).toBe(1.0);
    });

    it('should dispute with any disagreement', () => {
      const strategy = createUnanimousStrategy();

      const votes = [
        { modelId: 'model1', agrees: true, confidence: 0.9, assessment: 'confirmed' as const, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: true, confidence: 0.85, assessment: 'confirmed' as const, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model3', agrees: false, confidence: 0.8, assessment: 'rejected' as const, reasoning: 'Invalid', executionTime: 100, votedAt: new Date() },
      ];

      const result = strategy.apply(votes);

      expect(result.verdict).toBe('disputed');
      expect(result.requiresHumanReview).toBe(true);
    });
  });
});

// ============================================================================
// Factory Tests
// ============================================================================

describe('Factory Functions', () => {
  it('should create consensus engine with test providers', () => {
    const mockProviders = [
      createMockProvider({ id: 'mock1', defaultAssessment: 'confirmed' }),
      createMockProvider({ id: 'mock2', defaultAssessment: 'confirmed' }),
    ];

    const engine = createTestConsensusEngine(mockProviders, { minModels: 2 });

    expect(engine).toBeDefined();
    expect(engine.getModels()).toHaveLength(2);
  });

  it('should create consensus engine with custom configuration', () => {
    const mockProviders = [
      createMockProvider({ id: 'mock1', defaultAssessment: 'confirmed' }),
      createMockProvider({ id: 'mock2', defaultAssessment: 'confirmed' }),
    ];

    const engine = createConsensusEngine({
      models: mockProviders,
      engineConfig: {
        minModels: 2,
        maxModels: 2,
        verifySeverities: ['critical'],
        defaultThreshold: 0.5,
        defaultModelTimeout: 5000,
        defaultRetries: 2,
        enableCache: false,
        cacheTtlMs: 0,
        enableCostTracking: true,
        humanReviewThreshold: 0.6,
      },
      strategy: 'weighted',
    });

    expect(engine).toBeDefined();
    expect(engine.getConfig().minModels).toBe(2);
  });
});
