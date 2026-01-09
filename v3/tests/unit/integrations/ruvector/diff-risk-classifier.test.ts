/**
 * Agentic QE v3 - Diff Risk Classifier Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDiffRiskClassifier,
  RuVectorDiffRiskClassifier,
  FallbackDiffRiskClassifier,
} from '../../../../src/integrations/ruvector';
import type {
  RuVectorConfig,
  DiffContext,
  FileChange,
} from '../../../../src/integrations/ruvector';

// Test fixtures
function createFileChange(overrides: Partial<FileChange> = {}): FileChange {
  return {
    filePath: 'src/services/user-service.ts',
    status: 'modified',
    additions: 10,
    deletions: 5,
    ...overrides,
  };
}

function createDiffContext(overrides: Partial<DiffContext> = {}): DiffContext {
  return {
    files: [createFileChange()],
    commitHash: 'abc123',
    message: 'Update user service',
    ...overrides,
  };
}

function createConfig(overrides: Partial<RuVectorConfig> = {}): RuVectorConfig {
  return {
    enabled: true,
    endpoint: 'http://localhost:8080',
    fallbackEnabled: true,
    cacheEnabled: false,
    ...overrides,
  };
}

describe('Diff Risk Classifier', () => {
  describe('Factory Function', () => {
    it('should create RuVectorDiffRiskClassifier when enabled', () => {
      const classifier = createDiffRiskClassifier(createConfig({ enabled: true }));
      expect(classifier).toBeInstanceOf(RuVectorDiffRiskClassifier);
    });

    it('should create FallbackDiffRiskClassifier when disabled', () => {
      const classifier = createDiffRiskClassifier(createConfig({ enabled: false }));
      expect(classifier).toBeInstanceOf(FallbackDiffRiskClassifier);
    });
  });

  describe('RuVectorDiffRiskClassifier', () => {
    let classifier: RuVectorDiffRiskClassifier;

    beforeEach(() => {
      classifier = new RuVectorDiffRiskClassifier(createConfig());
    });

    describe('classifyDiff', () => {
      it('should classify a simple diff', async () => {
        const context = createDiffContext();
        const result = await classifier.classifyDiff(context);

        expect(result).toHaveProperty('level');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('factors');
        expect(result).toHaveProperty('highRiskFiles');
        expect(result).toHaveProperty('recommendedTests');
        expect(result.usedFallback).toBe(false);
      });

      it('should return score between 0 and 1', async () => {
        const context = createDiffContext();
        const result = await classifier.classifyDiff(context);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });

      it('should return valid severity level', async () => {
        const context = createDiffContext();
        const result = await classifier.classifyDiff(context);

        expect(['critical', 'high', 'medium', 'low', 'info']).toContain(result.level);
      });

      it('should identify high-risk files', async () => {
        const context = createDiffContext({
          files: [
            createFileChange({ filePath: 'src/auth/token-service.ts', additions: 100 }),
            createFileChange({ filePath: 'src/utils/helper.ts', additions: 5 }),
          ],
        });

        const result = await classifier.classifyDiff(context);

        expect(Array.isArray(result.highRiskFiles)).toBe(true);
      });

      it('should recommend tests based on risk', async () => {
        const context = createDiffContext({
          files: [
            createFileChange({ filePath: 'src/security/auth.ts', additions: 50 }),
          ],
        });

        const result = await classifier.classifyDiff(context);

        expect(Array.isArray(result.recommendedTests)).toBe(true);
        expect(result.recommendedTests.length).toBeGreaterThan(0);

        for (const test of result.recommendedTests) {
          expect(test).toHaveProperty('type');
          expect(test).toHaveProperty('priority');
          expect(test).toHaveProperty('reason');
        }
      });

      it('should classify large changesets as higher risk', async () => {
        const smallContext = createDiffContext({
          files: [createFileChange({ additions: 10, deletions: 5 })],
        });

        const largeContext = createDiffContext({
          files: [createFileChange({ additions: 500, deletions: 200 })],
        });

        const smallResult = await classifier.classifyDiff(smallContext);
        const largeResult = await classifier.classifyDiff(largeContext);

        expect(largeResult.score).toBeGreaterThanOrEqual(smallResult.score);
      });

      it('should classify security-related changes as higher risk', async () => {
        const normalContext = createDiffContext({
          files: [createFileChange({ filePath: 'src/utils/format.ts' })],
        });

        const securityContext = createDiffContext({
          files: [createFileChange({ filePath: 'src/auth/password.ts' })],
        });

        const normalResult = await classifier.classifyDiff(normalContext);
        const securityResult = await classifier.classifyDiff(securityContext);

        expect(securityResult.score).toBeGreaterThanOrEqual(normalResult.score);
      });
    });

    describe('rankFilesByRisk', () => {
      it('should rank files by risk score', async () => {
        const files: FileChange[] = [
          createFileChange({ filePath: 'src/utils/helper.ts', additions: 5 }),
          createFileChange({ filePath: 'src/auth/token.ts', additions: 50 }),
          createFileChange({ filePath: 'src/services/user.ts', additions: 20 }),
        ];

        const ranking = await classifier.rankFilesByRisk(files);

        expect(ranking).toHaveLength(3);

        // Should be sorted by risk score descending
        for (let i = 1; i < ranking.length; i++) {
          expect(ranking[i - 1].riskScore).toBeGreaterThanOrEqual(ranking[i].riskScore);
        }
      });
    });

    describe('requiresSecurityReview', () => {
      it('should require security review for auth changes', async () => {
        const context = createDiffContext({
          files: [createFileChange({ filePath: 'src/auth/login.ts' })],
        });

        const result = await classifier.requiresSecurityReview(context);
        expect(result).toBe(true);
      });

      it('should require security review for password changes', async () => {
        const context = createDiffContext({
          files: [createFileChange({ filePath: 'src/services/password-service.ts' })],
        });

        const result = await classifier.requiresSecurityReview(context);
        expect(result).toBe(true);
      });

      it('should require security review for crypto changes', async () => {
        const context = createDiffContext({
          files: [createFileChange({ filePath: 'src/utils/encryption.ts' })],
        });

        const result = await classifier.requiresSecurityReview(context);
        expect(result).toBe(true);
      });

      it('should not require security review for non-sensitive changes', async () => {
        const context = createDiffContext({
          files: [createFileChange({ filePath: 'src/components/button.tsx' })],
        });

        const result = await classifier.requiresSecurityReview(context);
        expect(result).toBe(false);
      });
    });

    describe('getRecommendedReviewers', () => {
      it('should recommend security team for security changes', async () => {
        const context = createDiffContext({
          files: [createFileChange({ filePath: 'src/security/auth.ts' })],
        });

        const reviewers = await classifier.getRecommendedReviewers(context);

        expect(reviewers).toContain('security-team');
      });

      it('should recommend API owner for API changes', async () => {
        const context = createDiffContext({
          files: [createFileChange({ filePath: 'src/api/public-api.ts' })],
        });

        const reviewers = await classifier.getRecommendedReviewers(context);

        expect(reviewers).toContain('api-owner');
      });

      it('should recommend tech lead for core changes', async () => {
        const context = createDiffContext({
          files: [createFileChange({ filePath: 'src/kernel/bootstrap.ts' })],
        });

        const reviewers = await classifier.getRecommendedReviewers(context);

        expect(reviewers).toContain('tech-lead');
      });
    });

    describe('predictDefects', () => {
      it('should predict defects for risky changes', async () => {
        const context = createDiffContext({
          files: [
            createFileChange({ filePath: 'src/auth/complex.ts', additions: 150 }),
          ],
        });

        const predictions = await classifier.predictDefects(context);

        expect(Array.isArray(predictions)).toBe(true);
        for (const pred of predictions) {
          expect(pred).toHaveProperty('filePath');
          expect(pred).toHaveProperty('probability');
          expect(pred).toHaveProperty('type');
        }
      });

      it('should predict new-code-defects for large additions', async () => {
        const context = createDiffContext({
          files: [
            createFileChange({ additions: 200, deletions: 10 }),
          ],
        });

        const predictions = await classifier.predictDefects(context);

        const newCodeDefects = predictions.filter((p) => p.type === 'new-code-defect');
        expect(newCodeDefects.length).toBeGreaterThan(0);
      });

      it('should predict regressions for large deletions', async () => {
        const context = createDiffContext({
          files: [
            createFileChange({ additions: 10, deletions: 100 }),
          ],
        });

        const predictions = await classifier.predictDefects(context);

        const regressions = predictions.filter((p) => p.type === 'regression');
        expect(regressions.length).toBeGreaterThan(0);
      });
    });
  });

  describe('FallbackDiffRiskClassifier', () => {
    let classifier: FallbackDiffRiskClassifier;

    beforeEach(() => {
      classifier = new FallbackDiffRiskClassifier();
    });

    it('should classify diffs using rules', async () => {
      const context = createDiffContext();
      const result = await classifier.classifyDiff(context);

      expect(result.usedFallback).toBe(true);
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('score');
    });

    it('should identify sensitive files', async () => {
      const context = createDiffContext({
        files: [createFileChange({ filePath: '.env.local' })],
      });

      const result = await classifier.classifyDiff(context);

      expect(result.score).toBeGreaterThan(0.3);
    });
  });

  describe('Integration', () => {
    it('should fallback when RuVector disabled', async () => {
      const classifier = createDiffRiskClassifier(createConfig({ enabled: false }));
      const result = await classifier.classifyDiff(createDiffContext());

      expect(result.usedFallback).toBe(true);
    });

    it('should cache results when enabled', async () => {
      const classifier = new RuVectorDiffRiskClassifier(
        createConfig({ cacheEnabled: true, cacheTtl: 60000 })
      );
      const context = createDiffContext();

      const result1 = await classifier.classifyDiff(context);
      const result2 = await classifier.classifyDiff(context);

      expect(result1.score).toBe(result2.score);
    });
  });
});
