/**
 * Agentic QE v3 - Consensus Engine Integration Test
 * Tests the full consensus verification pipeline
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestConsensusEngine,
  createMockProvider,
  type SecurityFinding,
  type ConsensusEngine,
} from '../../src/coordination/consensus';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test security finding
 */
function createTestFinding(): SecurityFinding {
  return {
    id: 'integration-test-finding',
    type: 'sql-injection',
    category: 'injection',
    severity: 'critical',
    description: 'SQL injection vulnerability in user input',
    explanation: 'Direct string concatenation in SQL query without sanitization',
    location: {
      file: 'src/api/users.ts',
      line: 45,
      column: 12,
      function: 'getUserById',
    },
    evidence: [
      {
        type: 'code-snippet',
        content: 'db.query(`SELECT * FROM users WHERE id = ${req.params.id}`)',
        confidence: 0.95,
      },
      {
        type: 'data-flow',
        content: 'Tainted data flows from req.params.id to SQL query',
        confidence: 0.9,
      },
    ],
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021 - Injection',
    remediation: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = ?", [req.params.id])',
    detectedAt: new Date(),
    detectedBy: 'integration-test',
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Consensus Engine Integration', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    // Create engine with three mock providers
    const providers = [
      createMockProvider({
        id: 'claude',
        name: 'Claude',
        defaultAssessment: 'confirmed',
        defaultConfidence: 0.92,
        latencyMs: 150,
      }),
      createMockProvider({
        id: 'gpt',
        name: 'GPT-4',
        defaultAssessment: 'confirmed',
        defaultConfidence: 0.88,
        latencyMs: 200,
      }),
      createMockProvider({
        id: 'gemini',
        name: 'Gemini',
        defaultAssessment: 'confirmed',
        defaultConfidence: 0.85,
        latencyMs: 180,
      }),
    ];

    engine = createTestConsensusEngine(providers, {
      minModels: 2,
      maxModels: 3,
      verifySeverities: ['critical', 'high'],
      defaultThreshold: 2 / 3,
      enableCostTracking: true,
      humanReviewThreshold: 0.7,
    });
  });

  describe('end-to-end verification', () => {
    it('should verify a security finding through the full pipeline', async () => {
      const finding = createTestFinding();

      const result = await engine.verify(finding);

      // Verify success
      expect(result.success).toBe(true);
      if (!result.success) return;

      const { value: consensusResult } = result;

      // Verify basic properties
      expect(consensusResult.finding.id).toBe(finding.id);
      expect(consensusResult.votes).toHaveLength(3);

      // All models should agree (confirmed)
      expect(consensusResult.verdict).toBe('verified');
      expect(consensusResult.agreementRatio).toBe(1.0);

      // Confidence should be high
      expect(consensusResult.confidence).toBeGreaterThan(0.8);

      // Should have reasoning
      expect(consensusResult.reasoning).toBeDefined();
      expect(consensusResult.reasoning.length).toBeGreaterThan(0);

      // Should not require human review (high confidence, unanimous)
      expect(consensusResult.requiresHumanReview).toBe(false);

      // Verify vote details
      consensusResult.votes.forEach(vote => {
        expect(vote.modelId).toBeDefined();
        expect(vote.agrees).toBe(true);
        expect(vote.assessment).toBe('confirmed');
        expect(vote.confidence).toBeGreaterThan(0.8);
        expect(vote.reasoning).toBeDefined();
        expect(vote.executionTime).toBeGreaterThan(0);
        expect(vote.votedAt).toBeInstanceOf(Date);
      });

      // Verify cost tracking
      expect(consensusResult.totalCost).toBeDefined();
      expect(consensusResult.totalCost).toBeGreaterThan(0);

      // Verify execution time
      expect(consensusResult.totalExecutionTime).toBeGreaterThan(0);
      expect(consensusResult.completedAt).toBeInstanceOf(Date);
    });

    it('should handle batch verification', async () => {
      const findings = [
        createTestFinding(),
        { ...createTestFinding(), id: 'finding-2' },
        { ...createTestFinding(), id: 'finding-3' },
      ];

      const result = await engine.verifyBatch(findings);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.value).toHaveLength(3);

      result.value.forEach((consensusResult, index) => {
        expect(consensusResult.finding.id).toBe(findings[index].id);
        expect(consensusResult.verdict).toBe('verified');
        expect(consensusResult.votes).toHaveLength(3);
      });
    });

    it('should track statistics across multiple verifications', async () => {
      const finding1 = createTestFinding();
      const finding2 = { ...createTestFinding(), id: 'finding-2' };

      // Initial stats
      let stats = engine.getStats();
      expect(stats.totalVerifications).toBe(0);

      // First verification
      await engine.verify(finding1);
      stats = engine.getStats();
      expect(stats.totalVerifications).toBe(1);
      expect(stats.byVerdict.verified).toBe(1);

      // Second verification
      await engine.verify(finding2);
      stats = engine.getStats();
      expect(stats.totalVerifications).toBe(2);
      expect(stats.byVerdict.verified).toBe(2);

      // Model stats should be tracked
      expect(stats.modelStats.claude).toBeDefined();
      expect(stats.modelStats.claude.votes).toBe(2);
      expect(stats.modelStats.claude.agreements).toBe(2);
      expect(stats.modelStats.claude.averageConfidence).toBeGreaterThan(0.8);

      // Average metrics
      expect(stats.averageConfidence).toBeGreaterThan(0.8);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
      expect(stats.totalCost).toBeGreaterThan(0);
    });
  });

  describe('disputed findings', () => {
    it('should handle findings where models disagree', async () => {
      // Create engine with mixed assessments
      const providers = [
        createMockProvider({
          id: 'agree-1',
          name: 'Agrees 1',
          defaultAssessment: 'confirmed',
          defaultConfidence: 0.9,
        }),
        createMockProvider({
          id: 'disagree-1',
          name: 'Disagrees 1',
          defaultAssessment: 'rejected',
          defaultConfidence: 0.85,
        }),
        createMockProvider({
          id: 'agree-2',
          name: 'Agrees 2',
          defaultAssessment: 'confirmed',
          defaultConfidence: 0.88,
        }),
      ];

      const disputedEngine = createTestConsensusEngine(providers, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical'],
        defaultThreshold: 2 / 3,
        humanReviewThreshold: 0.7,
      });

      const finding = createTestFinding();
      const result = await disputedEngine.verify(finding);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const { value: consensusResult } = result;

      // Should still reach majority verdict (2/3 agree)
      expect(consensusResult.verdict).toBe('verified');
      expect(consensusResult.agreementRatio).toBeCloseTo(2 / 3);

      // Should have votes from all models
      expect(consensusResult.votes).toHaveLength(3);

      // Reasoning should mention both perspectives
      expect(consensusResult.reasoning).toContain('agree');
      expect(consensusResult.reasoning).toContain('disagree');
    });
  });

  describe('error handling', () => {
    it('should handle provider failures gracefully', async () => {
      const providers = [
        createMockProvider({
          id: 'working-1',
          name: 'Working 1',
          defaultAssessment: 'confirmed',
          defaultConfidence: 0.9,
        }),
        createMockProvider({
          id: 'failing',
          name: 'Failing Provider',
          failureRate: 1.0, // Always fail
        }),
        createMockProvider({
          id: 'working-2',
          name: 'Working 2',
          defaultAssessment: 'confirmed',
          defaultConfidence: 0.88,
        }),
      ];

      const resilientEngine = createTestConsensusEngine(providers, {
        minModels: 2,
        maxModels: 3,
        verifySeverities: ['critical'],
        defaultThreshold: 0.5,
      });

      const finding = createTestFinding();
      const result = await resilientEngine.verify(finding);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const { value: consensusResult } = result;

      // Should still reach verdict with 2 working providers
      expect(consensusResult.votes).toHaveLength(3);

      // One vote should have an error
      const errorVotes = consensusResult.votes.filter(v => v.error);
      expect(errorVotes).toHaveLength(1);

      // Should still be able to reach consensus with remaining votes
      expect(consensusResult.verdict).toBe('verified');

      // Statistics should track errors
      const stats = resilientEngine.getStats();
      const failingStats = stats.modelStats.failing;
      expect(failingStats).toBeDefined();
      expect(failingStats.errors).toBe(1);
    });
  });
});
