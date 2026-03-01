/**
 * Consensus Domain Integration Test Template
 * ============================================================================
 *
 * Template for testing Consensus engine integration in a domain coordinator.
 * Copy this file and replace:
 * - DOMAIN_NAME with your domain (e.g., 'security-compliance')
 * - Define your domain-specific finding types
 * - Implement domain-specific test scenarios
 *
 * MM-001: Multi-Model Consensus for Security Verification
 *
 * @example
 * // Copy this file to your domain's test folder:
 * // tests/integration/domains/security-compliance/consensus-integration.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

// ============================================================================
// REPLACE THESE IMPORTS WITH YOUR DOMAIN-SPECIFIC IMPORTS
// ============================================================================

// Import your domain coordinator
// import { DomainCoordinator, createDomainCoordinator } from '../../../../src/domains/DOMAIN_NAME/coordinator';

// Import Consensus engine types
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
  type ConsensusResult,
  type ModelVote,
  type ConsensusEngineConfig,
  type ConsensusStats,
} from '../../../src/coordination/consensus';

import type { DomainName, Severity } from '../../../src/shared/types';

// ============================================================================
// MOCK HELPERS - Reuse these in your tests
// ============================================================================

/**
 * Create a test security finding
 * REPLACE: Customize for your domain's finding types
 *
 * @param overrides - Properties to override on the default finding
 */
function createTestFinding(overrides?: Partial<SecurityFinding>): SecurityFinding {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    type: 'sql-injection', // REPLACE: Your domain's finding type
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

/**
 * Create mock model providers for consensus testing
 *
 * @param configs - Array of provider configurations
 */
function createMockProviders(
  configs: Array<{
    id: string;
    name?: string;
    defaultAssessment?: 'confirmed' | 'rejected' | 'inconclusive';
    defaultConfidence?: number;
    latencyMs?: number;
    failureRate?: number;
  }>
): ModelProvider[] {
  return configs.map(config =>
    createMockProvider({
      id: config.id,
      name: config.name ?? config.id,
      defaultAssessment: config.defaultAssessment ?? 'confirmed',
      defaultConfidence: config.defaultConfidence ?? 0.85,
      latencyMs: config.latencyMs ?? 100,
      failureRate: config.failureRate,
    })
  );
}

/**
 * Create a consensus engine with test configuration
 *
 * @param options - Configuration options
 */
function createTestEngine(options: {
  providers?: ModelProvider[];
  minModels?: number;
  maxModels?: number;
  verifySeverities?: Severity[];
  threshold?: number;
  enableCostTracking?: boolean;
} = {}): ConsensusEngineImpl {
  const defaultProviders = createMockProviders([
    { id: 'mock-claude', defaultAssessment: 'confirmed', defaultConfidence: 0.9 },
    { id: 'mock-gpt', defaultAssessment: 'confirmed', defaultConfidence: 0.85 },
    { id: 'mock-gemini', defaultAssessment: 'confirmed', defaultConfidence: 0.8 },
  ]);

  const providers = options.providers ?? defaultProviders;
  const registry = createProviderRegistry(providers);

  return new ConsensusEngineImpl(registry, {
    minModels: options.minModels ?? 2,
    maxModels: options.maxModels ?? 3,
    verifySeverities: options.verifySeverities ?? ['critical', 'high'],
    defaultThreshold: options.threshold ?? 0.5,
    defaultModelTimeout: 5000,
    defaultRetries: 2,
    enableCache: false,
    cacheTtlMs: 0,
    enableCostTracking: options.enableCostTracking ?? false,
    humanReviewThreshold: 0.6,
  });
}

// ============================================================================
// DOMAIN-SPECIFIC FINDING TYPES
// Replace these with your domain's finding categories
// ============================================================================

/**
 * Example: Test coverage finding (for coverage-analysis domain)
 */
interface CoverageFinding extends Omit<SecurityFinding, 'category' | 'cweId' | 'owaspCategory'> {
  category: 'uncovered-code' | 'low-coverage' | 'untested-branch';
  coveragePercentage?: number;
  missingTests?: string[];
}

/**
 * Example: Quality finding (for quality-assessment domain)
 */
interface QualityFinding extends Omit<SecurityFinding, 'category'> {
  category: 'code-smell' | 'complexity' | 'duplication' | 'maintainability';
  metricValue?: number;
  threshold?: number;
}

// ============================================================================
// REPLACE 'DOMAIN_NAME' with your actual domain name
// ============================================================================

const DOMAIN_NAME: DomainName = 'security-compliance'; // REPLACE with your domain

describe('[DOMAIN_NAME] Consensus Integration', () => {
  let mockProviders: ModelProvider[];

  beforeEach(() => {
    // Create fresh mock providers for each test
    mockProviders = createMockProviders([
      { id: 'mock-claude', name: 'Mock Claude', defaultAssessment: 'confirmed', defaultConfidence: 0.9 },
      { id: 'mock-gpt', name: 'Mock GPT', defaultAssessment: 'confirmed', defaultConfidence: 0.85 },
      { id: 'mock-gemini', name: 'Mock Gemini', defaultAssessment: 'confirmed', defaultConfidence: 0.8 },
    ]);
  });

  // ==========================================================================
  // Test: Consensus engine initializes correctly
  // ==========================================================================

  describe('consensus engine initialization', () => {
    it('should initialize consensus engine', async () => {
      const engine = createTestEngine({ providers: mockProviders });

      expect(engine).toBeDefined();
      expect(engine.getModels()).toHaveLength(3);

      // NOTE: createTestEngine sets threshold to 0.5
      // ConsensusEngineImpl default is 2/3
      // REPLACE: Adjust based on your configuration
      const threshold = engine.getThreshold();
      expect(threshold).toBeGreaterThan(0);
      expect(threshold).toBeLessThanOrEqual(1);
    });

    it('should initialize with custom configuration', async () => {
      const engine = createTestEngine({
        providers: mockProviders,
        minModels: 3,
        threshold: 0.75,
        verifySeverities: ['critical'],
      });

      const config = engine.getConfig();
      expect(config.minModels).toBe(3);
      expect(config.verifySeverities).toContain('critical');
      expect(config.verifySeverities).not.toContain('high');
    });

    it('should integrate with domain coordinator', async () => {
      const engine = createTestEngine({ providers: mockProviders });

      // REPLACE: Your coordinator should accept the consensus engine
      // const coordinator = createDomainCoordinator({
      //   consensusEngine: engine,
      //   // ... other dependencies
      // });
      //
      // expect(coordinator.hasConsensusIntegration()).toBe(true);

      expect(engine.getModels().length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Test: requiresConsensus() respects threshold
  // ==========================================================================

  describe('consensus requirement detection', () => {
    it('should require consensus for high-confidence findings', async () => {
      const engine = createTestEngine({
        providers: mockProviders,
        verifySeverities: ['critical', 'high'],
      });

      // Critical severity should require consensus
      const criticalFinding = createTestFinding({ severity: 'critical' });
      expect(engine.requiresVerification(criticalFinding)).toBe(true);

      // High severity should require consensus
      const highFinding = createTestFinding({ severity: 'high' });
      expect(engine.requiresVerification(highFinding)).toBe(true);
    });

    it('should not require consensus for low-severity findings', async () => {
      const engine = createTestEngine({
        providers: mockProviders,
        verifySeverities: ['critical', 'high'],
      });

      // Medium severity should not require consensus
      const mediumFinding = createTestFinding({ severity: 'medium' });
      expect(engine.requiresVerification(mediumFinding)).toBe(false);

      // Low severity should not require consensus
      const lowFinding = createTestFinding({ severity: 'low' });
      expect(engine.requiresVerification(lowFinding)).toBe(false);
    });

    it('should respect custom severity configuration', async () => {
      // Only require consensus for critical findings
      const engine = createTestEngine({
        providers: mockProviders,
        verifySeverities: ['critical'],
      });

      const criticalFinding = createTestFinding({ severity: 'critical' });
      const highFinding = createTestFinding({ severity: 'high' });

      expect(engine.requiresVerification(criticalFinding)).toBe(true);
      expect(engine.requiresVerification(highFinding)).toBe(false);
    });
  });

  // ==========================================================================
  // Test: verifyFinding() calls consensus engine
  // ==========================================================================

  describe('finding verification', () => {
    it('should verify findings through consensus', async () => {
      const engine = createTestEngine({ providers: mockProviders });

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
      const mixedProviders = createMockProviders([
        { id: 'agree-1', defaultAssessment: 'confirmed', defaultConfidence: 0.9 },
        { id: 'disagree-1', defaultAssessment: 'rejected', defaultConfidence: 0.85 },
      ]);

      const engine = createTestEngine({
        providers: mixedProviders,
        minModels: 2,
        maxModels: 2,
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
      const singleProvider = createMockProviders([
        { id: 'solo', defaultAssessment: 'confirmed' },
      ]);

      const engine = createTestEngine({
        providers: singleProvider,
        minModels: 2,
      });

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Insufficient models');
      }
    });

    it('should skip verification for low-severity findings', async () => {
      const engine = createTestEngine({
        providers: mockProviders,
        verifySeverities: ['critical', 'high'],
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
  });

  // ==========================================================================
  // Test: Graceful degradation without providers
  // ==========================================================================

  describe('graceful degradation', () => {
    it('should work without consensus (graceful degradation)', async () => {
      // REPLACE: Your coordinator should function without consensus engine
      // const coordinator = createDomainCoordinator({
      //   consensusEngine: undefined,
      //   // ... other dependencies
      // });
      //
      // Coordinator should still process findings without verification
      // const finding = createTestFinding();
      // const result = await coordinator.processFinding(finding);
      //
      // expect(result.processed).toBe(true);
      // expect(result.verified).toBe(false); // Not verified, but processed

      // Placeholder assertion - remove when implementing
      expect(true).toBe(true);
    });

    it('should handle provider failures gracefully', async () => {
      const providersWithFailure = createMockProviders([
        { id: 'working', defaultAssessment: 'confirmed', defaultConfidence: 0.9 },
        { id: 'failing', failureRate: 1.0 }, // Always fail
      ]);

      const engine = createTestEngine({
        providers: providersWithFailure,
        minModels: 1,
        maxModels: 2,
      });

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.votes).toHaveLength(2);
        // One vote should have an error
        const errorVotes = result.value.votes.filter((v: ModelVote) => v.error);
        expect(errorVotes).toHaveLength(1);
      }
    });

    it('should continue processing when all providers fail', async () => {
      const allFailingProviders = createMockProviders([
        { id: 'fail-1', failureRate: 1.0 },
        { id: 'fail-2', failureRate: 1.0 },
      ]);

      const engine = createTestEngine({
        providers: allFailingProviders,
        minModels: 1,
      });

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      // REPLACE: Behavior depends on implementation
      // Some implementations return error, others return result with error votes
      // The key is that it doesn't crash
      expect(result).toBeDefined();

      // For strict error handling:
      // expect(result.success).toBe(false);
      // if (!result.success) {
      //   expect(result.error).toBeDefined();
      // }

      // For lenient handling (returns result with error votes):
      // expect(result.success).toBe(true);
      // if (result.success) {
      //   const errorVotes = result.value.votes.filter(v => v.error);
      //   expect(errorVotes.length).toBeGreaterThan(0);
      // }
    });
  });

  // ==========================================================================
  // Test: Batch verification
  // ==========================================================================

  describe('batch verification', () => {
    it('should verify multiple findings in batch', async () => {
      const engine = createTestEngine({ providers: mockProviders });

      const findings = [
        createTestFinding({ id: 'finding-1' }),
        createTestFinding({ id: 'finding-2' }),
        createTestFinding({ id: 'finding-3' }),
      ];

      const result = await engine.verifyBatch(findings);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(3);
        result.value.forEach((r: ConsensusResult) => {
          expect(r.verdict).toBe('verified');
        });
      }
    });

    it('should handle mixed severities in batch', async () => {
      const engine = createTestEngine({
        providers: mockProviders,
        verifySeverities: ['critical', 'high'],
      });

      const findings = [
        createTestFinding({ id: 'critical-1', severity: 'critical' }),
        createTestFinding({ id: 'low-1', severity: 'low' }),
        createTestFinding({ id: 'high-1', severity: 'high' }),
      ];

      const result = await engine.verifyBatch(findings);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(3);

        // Critical and high should be verified
        const criticalResult = result.value.find(
          (r: ConsensusResult) => r.finding.id === 'critical-1'
        );
        expect(criticalResult?.verdict).toBe('verified');

        // Low severity should be skipped
        const lowResult = result.value.find(
          (r: ConsensusResult) => r.finding.id === 'low-1'
        );
        expect(lowResult?.verdict).toBe('insufficient');
      }
    });
  });

  // ==========================================================================
  // Test: Consensus stats tracking
  // ==========================================================================

  describe('statistics tracking', () => {
    it('should track consensus statistics', async () => {
      const engine = createTestEngine({
        providers: mockProviders,
        enableCostTracking: true,
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

    it('should track model performance', async () => {
      const engine = createTestEngine({
        providers: mockProviders,
        enableCostTracking: true,
      });

      // Perform multiple verifications
      await engine.verify(createTestFinding());
      await engine.verify(createTestFinding());

      const stats = engine.getStats();

      // Each model should have stats
      ['mock-claude', 'mock-gpt', 'mock-gemini'].forEach(modelId => {
        expect(stats.modelStats[modelId]).toBeDefined();
        expect(stats.modelStats[modelId].votes).toBe(2);
        expect(stats.modelStats[modelId].averageConfidence).toBeGreaterThan(0);
      });
    });

    it('should reset statistics', async () => {
      const engine = createTestEngine({ providers: mockProviders });

      await engine.verify(createTestFinding());
      expect(engine.getStats().totalVerifications).toBe(1);

      engine.resetStats();
      expect(engine.getStats().totalVerifications).toBe(0);
    });

    it('should track costs when enabled', async () => {
      const engine = createTestEngine({
        providers: mockProviders,
        enableCostTracking: true,
      });

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalCost).toBeDefined();
        expect(result.value.totalCost).toBeGreaterThan(0);
        result.value.votes.forEach((vote: ModelVote) => {
          if (!vote.error) {
            expect(vote.cost).toBeDefined();
            expect(vote.tokenUsage).toBeDefined();
          }
        });
      }
    });
  });

  // ==========================================================================
  // Test: Consensus strategies
  // ==========================================================================

  describe('consensus strategies', () => {
    it('should support majority strategy', () => {
      const strategy = createMajorityStrategy({ minVotes: 2 });

      const votes: ModelVote[] = [
        { modelId: 'model1', agrees: true, confidence: 0.9, assessment: 'confirmed', reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: true, confidence: 0.85, assessment: 'confirmed', reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model3', agrees: false, confidence: 0.7, assessment: 'rejected', reasoning: 'Invalid', executionTime: 100, votedAt: new Date() },
      ];

      const result = strategy.apply(votes);

      expect(result.verdict).toBe('verified');
      expect(result.agreementRatio).toBeCloseTo(2 / 3);
    });

    it('should support weighted strategy', () => {
      const strategy = createWeightedStrategy({ agreementThreshold: 0.6 });

      const votes: ModelVote[] = [
        { modelId: 'model1', agrees: true, confidence: 0.95, assessment: 'confirmed', reasoning: 'High confidence', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: false, confidence: 0.5, assessment: 'rejected', reasoning: 'Low confidence', executionTime: 100, votedAt: new Date() },
      ];

      const result = strategy.apply(votes);

      // High-confidence vote should dominate
      expect(result.verdict).toBe('verified');
    });

    it('should support unanimous strategy', () => {
      const strategy = createUnanimousStrategy();

      const unanimousVotes: ModelVote[] = [
        { modelId: 'model1', agrees: true, confidence: 0.9, assessment: 'confirmed', reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: true, confidence: 0.85, assessment: 'confirmed', reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
      ];

      const result = strategy.apply(unanimousVotes);
      expect(result.verdict).toBe('verified');
      expect(result.agreementRatio).toBe(1.0);

      // With disagreement
      const mixedVotes: ModelVote[] = [
        { modelId: 'model1', agrees: true, confidence: 0.9, assessment: 'confirmed', reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'model2', agrees: false, confidence: 0.85, assessment: 'rejected', reasoning: 'Invalid', executionTime: 100, votedAt: new Date() },
      ];

      const mixedResult = strategy.apply(mixedVotes);
      expect(mixedResult.verdict).toBe('disputed');
    });
  });

  // ==========================================================================
  // Test: Configuration management
  // ==========================================================================

  describe('configuration management', () => {
    it('should get and set threshold', () => {
      const engine = createTestEngine({ providers: mockProviders });

      // NOTE: Default threshold depends on createTestEngine configuration
      // The ConsensusEngineImpl default is 2/3, but createTestEngine sets 0.5
      // REPLACE: Adjust based on your engine configuration
      const initialThreshold = engine.getThreshold();
      expect(typeof initialThreshold).toBe('number');
      expect(initialThreshold).toBeGreaterThan(0);
      expect(initialThreshold).toBeLessThanOrEqual(1);

      engine.setThreshold(0.75);
      expect(engine.getThreshold()).toBe(0.75);
    });

    it('should validate threshold range', () => {
      const engine = createTestEngine({ providers: mockProviders });

      expect(() => engine.setThreshold(-0.1)).toThrow();
      expect(() => engine.setThreshold(1.1)).toThrow();
    });

    it('should manage models dynamically', () => {
      const initialProviders = createMockProviders([
        { id: 'initial-1' },
      ]);

      const engine = createTestEngine({
        providers: initialProviders,
        minModels: 1,
      });

      expect(engine.getModels()).toHaveLength(1);

      // Add model
      const newProvider = createMockProvider({
        id: 'new-model',
        name: 'New Model',
        defaultAssessment: 'confirmed',
      });

      engine.addModel(newProvider);
      expect(engine.getModels()).toHaveLength(2);

      // Remove model
      const removed = engine.removeModel('new-model');
      expect(removed).toBe(true);
      expect(engine.getModels()).toHaveLength(1);
    });

    it('should update configuration', () => {
      const engine = createTestEngine({ providers: mockProviders });

      const initialConfig = engine.getConfig();
      expect(initialConfig.minModels).toBe(2);

      engine.updateConfig({ minModels: 3 });

      const updatedConfig = engine.getConfig();
      expect(updatedConfig.minModels).toBe(3);
    });
  });

  // ==========================================================================
  // Test: Engine disposal
  // ==========================================================================

  describe('engine disposal', () => {
    it('should dispose engine and reject further operations', async () => {
      const engine = createTestEngine({ providers: mockProviders });

      await engine.dispose();

      const finding = createTestFinding();
      const result = await engine.verify(finding);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('disposed');
      }
    });
  });

  // ==========================================================================
  // DOMAIN-SPECIFIC TESTS
  // REPLACE: Add tests specific to your domain's finding types
  // ==========================================================================

  describe('[DOMAIN_NAME]-specific findings', () => {
    // Example for security-compliance domain
    it('should handle security findings with CWE mappings', async () => {
      const engine = createTestEngine({ providers: mockProviders });

      const securityFinding = createTestFinding({
        type: 'sql-injection',
        cweId: 'CWE-89',
        owaspCategory: 'A03:2021-Injection',
      });

      const result = await engine.verify(securityFinding);

      expect(result.success).toBe(true);
      if (result.success) {
        // Finding should preserve CWE mapping
        expect(result.value.finding.cweId).toBe('CWE-89');
      }
    });

    // REPLACE: Add more domain-specific tests
    // Example for coverage-analysis domain:
    // it('should verify coverage gap findings', async () => { ... });

    // Example for quality-assessment domain:
    // it('should verify code smell findings', async () => { ... });
  });
});
