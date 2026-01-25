/**
 * Agentic QE v3 - Deployment Advisor Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeploymentAdvisorService } from '../../../../src/domains/quality-assessment/services/deployment-advisor';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { DeploymentRequest, QualityMetrics } from '../../../../src/domains/quality-assessment/interfaces';

/**
 * Mock MemoryBackend implementation for testing
 */
class MockMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {
    this.store.clear();
  }

  async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async search(pattern: string, _limit?: number): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  async vectorSearch(_embedding: number[], _k: number): Promise<VectorSearchResult[]> {
    return [];
  }

  async storeVector(_key: string, _embedding: number[], _metadata?: unknown): Promise<void> {}

  // Helper for tests to add historical deployment records
  addDeploymentRecord(
    id: string,
    metrics: QualityMetrics,
    riskScore: number,
    decision: 'approved' | 'warning' | 'blocked',
    outcome?: boolean
  ): void {
    this.store.set(`deployment-advice:prediction:${id}`, {
      id,
      metrics,
      riskScore,
      decision,
      outcome,
      createdAt: new Date().toISOString(),
    });
  }
}

describe('DeploymentAdvisorService', () => {
  let service: DeploymentAdvisorService;
  let mockMemory: MockMemoryBackend;

  const createMetrics = (overrides: Partial<QualityMetrics> = {}): QualityMetrics => ({
    coverage: 85,
    testsPassing: 100,
    criticalBugs: 0,
    codeSmells: 5,
    securityVulnerabilities: 0,
    technicalDebt: 2,
    duplications: 3,
    ...overrides,
  });

  beforeEach(() => {
    mockMemory = new MockMemoryBackend();
    service = new DeploymentAdvisorService(mockMemory);
  });

  afterEach(async () => {
    await mockMemory.dispose();
  });

  describe('getDeploymentAdvice', () => {
    it('should approve deployment for high quality metrics', async () => {
      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: createMetrics(),
        riskTolerance: 'medium',
      };

      const result = await service.getDeploymentAdvice(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.decision).toBe('approved');
        expect(result.value.riskScore).toBeLessThan(0.3);
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.reasons.length).toBeGreaterThan(0);
      }
    });

    it('should increase risk score when critical bugs exist', async () => {
      const metricsWithBugs = createMetrics({ criticalBugs: 5 });
      const metricsWithoutBugs = createMetrics({ criticalBugs: 0 });

      const requestWithBugs: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: metricsWithBugs,
        riskTolerance: 'medium',
      };

      const requestWithoutBugs: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: metricsWithoutBugs,
        riskTolerance: 'medium',
      };

      const resultWithBugs = await service.getDeploymentAdvice(requestWithBugs);
      const resultWithoutBugs = await service.getDeploymentAdvice(requestWithoutBugs);

      expect(resultWithBugs.success).toBe(true);
      expect(resultWithoutBugs.success).toBe(true);
      if (resultWithBugs.success && resultWithoutBugs.success) {
        // Bugs should increase risk score
        expect(resultWithBugs.value.riskScore).toBeGreaterThan(resultWithoutBugs.value.riskScore);
        expect(resultWithBugs.value.reasons.some((r) => r.includes('critical bug'))).toBe(true);
      }
    });

    it('should increase risk score when security vulnerabilities exist', async () => {
      const metricsWithVulns = createMetrics({ securityVulnerabilities: 3 });
      const metricsWithoutVulns = createMetrics({ securityVulnerabilities: 0 });

      const requestWithVulns: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: metricsWithVulns,
        riskTolerance: 'medium',
      };

      const requestWithoutVulns: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: metricsWithoutVulns,
        riskTolerance: 'medium',
      };

      const resultWithVulns = await service.getDeploymentAdvice(requestWithVulns);
      const resultWithoutVulns = await service.getDeploymentAdvice(requestWithoutVulns);

      expect(resultWithVulns.success).toBe(true);
      expect(resultWithoutVulns.success).toBe(true);
      if (resultWithVulns.success && resultWithoutVulns.success) {
        // Vulnerabilities should increase risk score
        expect(resultWithVulns.value.riskScore).toBeGreaterThan(resultWithoutVulns.value.riskScore);
        expect(resultWithVulns.value.reasons.some((r) => r.includes('security'))).toBe(true);
      }
    });

    it('should warn when test coverage is low', async () => {
      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: createMetrics({ coverage: 50 }),
        riskTolerance: 'medium',
      };

      const result = await service.getDeploymentAdvice(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.reasons.some((r) => r.includes('coverage'))).toBe(true);
      }
    });

    it('should warn when tests are failing', async () => {
      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: createMetrics({ testsPassing: 90 }),
        riskTolerance: 'medium',
      };

      const result = await service.getDeploymentAdvice(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.reasons.some((r) => r.includes('failing'))).toBe(true);
      }
    });

    it('should include rollback plan for non-blocked deployments', async () => {
      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0-rc.1',
        metrics: createMetrics(),
        riskTolerance: 'medium',
      };

      const result = await service.getDeploymentAdvice(request);

      expect(result.success).toBe(true);
      if (result.success) {
        if (result.value.decision !== 'blocked') {
          expect(result.value.rollbackPlan).toBeDefined();
          expect(result.value.rollbackPlan).toContain('v1.0.0-rc.1');
        }
      }
    });

    it('should include conditions for warning decisions', async () => {
      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: createMetrics({ criticalBugs: 1, testsPassing: 98 }),
        riskTolerance: 'medium',
      };

      const result = await service.getDeploymentAdvice(request);

      expect(result.success).toBe(true);
      if (result.success) {
        if (result.value.decision === 'warning') {
          expect(result.value.conditions).toBeDefined();
          expect(result.value.conditions!.length).toBeGreaterThan(0);
        }
      }
    });

    it('should store prediction in memory for learning', async () => {
      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: createMetrics(),
        riskTolerance: 'medium',
      };

      await service.getDeploymentAdvice(request);

      const storedKeys = await mockMemory.search('deployment-advice:prediction:*');
      expect(storedKeys.length).toBeGreaterThan(0);
    });
  });

  describe('risk tolerance', () => {
    it('should be more conservative with low risk tolerance', async () => {
      const metricsWithIssues = createMetrics({ criticalBugs: 1, coverage: 70 });

      const lowToleranceRequest: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: metricsWithIssues,
        riskTolerance: 'low',
      };

      const highToleranceRequest: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: metricsWithIssues,
        riskTolerance: 'high',
      };

      const lowResult = await service.getDeploymentAdvice(lowToleranceRequest);
      const highResult = await service.getDeploymentAdvice(highToleranceRequest);

      expect(lowResult.success).toBe(true);
      expect(highResult.success).toBe(true);

      if (lowResult.success && highResult.success) {
        // Low tolerance should be stricter
        const decisionPriority = { blocked: 2, warning: 1, approved: 0 };
        expect(decisionPriority[lowResult.value.decision]).toBeGreaterThanOrEqual(
          decisionPriority[highResult.value.decision]
        );
      }
    });

    it('should allow more risk with high tolerance', async () => {
      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: createMetrics({ codeSmells: 30, duplications: 10 }),
        riskTolerance: 'high',
      };

      const result = await service.getDeploymentAdvice(request);

      expect(result.success).toBe(true);
      if (result.success) {
        // High tolerance should be more lenient for non-critical issues
        expect(['approved', 'warning']).toContain(result.value.decision);
      }
    });
  });

  describe('recordDeploymentOutcome', () => {
    it('should update prediction record with outcome', async () => {
      // First create a prediction
      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: createMetrics(),
        riskTolerance: 'medium',
      };

      await service.getDeploymentAdvice(request);

      // Find the stored prediction
      const keys = await mockMemory.search('deployment-advice:prediction:*');
      expect(keys.length).toBeGreaterThan(0);

      const adviceId = keys[0].replace('deployment-advice:prediction:', '');

      // Record outcome
      await service.recordDeploymentOutcome(adviceId, true);

      // Verify outcome was stored
      const record = await mockMemory.get<{ outcome: boolean }>(keys[0]);
      expect(record?.outcome).toBe(true);
    });

    it('should handle non-existent advice ID gracefully', async () => {
      // Should not throw
      await expect(
        service.recordDeploymentOutcome('non-existent-id', true)
      ).resolves.not.toThrow();
    });
  });

  describe('getHistoricalAccuracy', () => {
    it('should return zero accuracy when no predictions exist', async () => {
      const result = await service.getHistoricalAccuracy();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalPredictions).toBe(0);
        expect(result.value.correctPredictions).toBe(0);
        expect(result.value.accuracyRate).toBe(0);
      }
    });

    it('should calculate accuracy from historical predictions', async () => {
      const goodMetrics = createMetrics();
      const badMetrics = createMetrics({ criticalBugs: 5, securityVulnerabilities: 3 });

      // Add predictions with outcomes
      mockMemory.addDeploymentRecord('pred-1', goodMetrics, 0.2, 'approved', true); // Correct
      mockMemory.addDeploymentRecord('pred-2', goodMetrics, 0.25, 'approved', true); // Correct
      mockMemory.addDeploymentRecord('pred-3', badMetrics, 0.7, 'blocked', false); // Correct (blocked and would have failed)
      mockMemory.addDeploymentRecord('pred-4', goodMetrics, 0.2, 'approved', false); // False positive

      const result = await service.getHistoricalAccuracy();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalPredictions).toBe(4);
        expect(result.value.correctPredictions).toBe(3);
        expect(result.value.falsePositives).toBe(1);
        expect(result.value.falseNegatives).toBe(0);
      }
    });

    it('should identify false negatives correctly', async () => {
      const metrics = createMetrics({ criticalBugs: 1 });

      // Blocked but actually would have succeeded
      mockMemory.addDeploymentRecord('pred-1', metrics, 0.7, 'blocked', true);

      const result = await service.getHistoricalAccuracy();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.falseNegatives).toBe(1);
      }
    });

    it('should ignore predictions without outcomes', async () => {
      const metrics = createMetrics();

      // Prediction without outcome (no feedback yet)
      mockMemory.addDeploymentRecord('pred-1', metrics, 0.2, 'approved', undefined);

      const result = await service.getHistoricalAccuracy();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalPredictions).toBe(0);
      }
    });
  });

  describe('ML-based adjustment', () => {
    it('should apply ML adjustment when enabled and sufficient data exists', async () => {
      const metrics = createMetrics();

      // Add similar historical deployments with positive outcomes
      for (let i = 0; i < 10; i++) {
        mockMemory.addDeploymentRecord(`pred-${i}`, metrics, 0.2, 'approved', true);
      }

      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: metrics,
        riskTolerance: 'medium',
      };

      const result = await service.getDeploymentAdvice(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.confidence).toBeGreaterThan(0.7);
      }
    });

    it('should not apply ML adjustment when disabled', async () => {
      const serviceNoML = new DeploymentAdvisorService(mockMemory, {
        enableMLPrediction: false,
        learningRate: 0.1,
        riskWeights: {
          coverage: 0.15,
          testsPassing: 0.20,
          criticalBugs: 0.25,
          codeSmells: 0.05,
          securityVulnerabilities: 0.25,
          technicalDebt: 0.05,
          duplications: 0.05,
        },
        decisionThresholds: {
          approved: 0.3,
          warning: 0.6,
          blocked: 0.6,
        },
      });

      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: createMetrics(),
        riskTolerance: 'medium',
      };

      const result = await serviceNoML.getDeploymentAdvice(request);

      expect(result.success).toBe(true);
    });
  });

  describe('risk score calculation', () => {
    it('should calculate risk score between 0 and 1', async () => {
      const testCases = [
        createMetrics(), // Good metrics
        createMetrics({ coverage: 30, testsPassing: 70 }), // Poor metrics
        createMetrics({ criticalBugs: 10, securityVulnerabilities: 5 }), // Critical issues
      ];

      for (const metrics of testCases) {
        const request: DeploymentRequest = {
          releaseCandidate: 'v1.0.0',
          metrics,
          riskTolerance: 'medium',
        };

        const result = await service.getDeploymentAdvice(request);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.riskScore).toBeGreaterThanOrEqual(0);
          expect(result.value.riskScore).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should weight security vulnerabilities heavily', async () => {
      const metricsWithSecurity = createMetrics({ securityVulnerabilities: 1 });
      const metricsWithCodeSmells = createMetrics({ codeSmells: 50 });

      const securityRequest: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: metricsWithSecurity,
        riskTolerance: 'medium',
      };

      const smellsRequest: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: metricsWithCodeSmells,
        riskTolerance: 'medium',
      };

      const securityResult = await service.getDeploymentAdvice(securityRequest);
      const smellsResult = await service.getDeploymentAdvice(smellsRequest);

      expect(securityResult.success).toBe(true);
      expect(smellsResult.success).toBe(true);

      if (securityResult.success && smellsResult.success) {
        // Security vulnerability should have higher risk than code smells
        expect(securityResult.value.riskScore).toBeGreaterThan(smellsResult.value.riskScore);
      }
    });
  });

  describe('confidence calculation', () => {
    it('should return baseline confidence with no historical data', async () => {
      const request: DeploymentRequest = {
        releaseCandidate: 'v1.0.0',
        metrics: createMetrics(),
        riskTolerance: 'medium',
      };

      const result = await service.getDeploymentAdvice(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result.value.confidence).toBeLessThanOrEqual(0.95);
      }
    });
  });
});
