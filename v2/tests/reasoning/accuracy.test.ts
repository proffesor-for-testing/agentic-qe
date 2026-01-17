/**
 * Pattern Matching Accuracy Validation Tests
 *
 * Validates the 85%+ matching accuracy claim for QEReasoningBank.
 * Uses a ground truth dataset with known pattern similarities.
 *
 * @module tests/reasoning/accuracy
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { QEReasoningBank, TestPattern } from '../../src/reasoning/QEReasoningBank';
import { createSeededRandom } from '../../src/utils/SeededRandom';

interface GroundTruthPair {
  pattern1: TestPattern;
  pattern2: TestPattern;
  expectedSimilarity: number; // 0-1 scale
  shouldMatch: boolean;
}

describe('Pattern Matching Accuracy', () => {
  let reasoningBank: QEReasoningBank;
  let groundTruthDataset: GroundTruthPair[];

  beforeEach(async () => {
    reasoningBank = new QEReasoningBank();
    groundTruthDataset = createGroundTruthDataset();

    // Store all patterns
    for (const pair of groundTruthDataset) {
      await reasoningBank.storePattern(pair.pattern1);
      await reasoningBank.storePattern(pair.pattern2);
    }
  });

  describe('Matching Accuracy Validation', () => {
    it('should achieve 85%+ matching accuracy on ground truth dataset', async () => {
      let correctMatches = 0;
      let totalComparisons = 0;

      for (const pair of groundTruthDataset) {
        const similarity = reasoningBank.calculateSimilarity(pair.pattern1, pair.pattern2);
        const predicted = similarity >= 0.5; // Match threshold

        if (predicted === pair.shouldMatch) {
          correctMatches++;
        }

        totalComparisons++;
      }

      const accuracy = correctMatches / totalComparisons;

      expect(accuracy).toBeGreaterThanOrEqual(0.85);
      expect(totalComparisons).toBeGreaterThanOrEqual(100);

      console.log(`Matching Accuracy: ${(accuracy * 100).toFixed(2)}%`);
      console.log(`Correct: ${correctMatches}/${totalComparisons}`);
    });

    it('should have high precision (few false positives)', async () => {
      let truePositives = 0;
      let falsePositives = 0;

      for (const pair of groundTruthDataset) {
        const similarity = reasoningBank.calculateSimilarity(pair.pattern1, pair.pattern2);
        const predicted = similarity >= 0.5;

        if (predicted && pair.shouldMatch) {
          truePositives++;
        } else if (predicted && !pair.shouldMatch) {
          falsePositives++;
        }
      }

      const precision = truePositives / (truePositives + falsePositives);

      expect(precision).toBeGreaterThanOrEqual(0.80);

      console.log(`Precision: ${(precision * 100).toFixed(2)}%`);
    });

    it('should have high recall (few false negatives)', async () => {
      let truePositives = 0;
      let falseNegatives = 0;

      for (const pair of groundTruthDataset) {
        const similarity = reasoningBank.calculateSimilarity(pair.pattern1, pair.pattern2);
        const predicted = similarity >= 0.5;

        if (predicted && pair.shouldMatch) {
          truePositives++;
        } else if (!predicted && pair.shouldMatch) {
          falseNegatives++;
        }
      }

      const recall = truePositives / (truePositives + falseNegatives);

      expect(recall).toBeGreaterThanOrEqual(0.80);

      console.log(`Recall: ${(recall * 100).toFixed(2)}%`);
    });

    it('should correctly match very similar patterns', async () => {
      const verySimilarPairs = groundTruthDataset.filter(p => p.expectedSimilarity >= 0.8);

      for (const pair of verySimilarPairs) {
        const similarity = reasoningBank.calculateSimilarity(pair.pattern1, pair.pattern2);

        expect(similarity).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('should correctly identify very different patterns', async () => {
      const veryDifferentPairs = groundTruthDataset.filter(p => p.expectedSimilarity <= 0.2);

      for (const pair of veryDifferentPairs) {
        const similarity = reasoningBank.calculateSimilarity(pair.pattern1, pair.pattern2);

        expect(similarity).toBeLessThanOrEqual(0.4);
      }
    });

    it('should handle partial matches correctly', async () => {
      const partialPairs = groundTruthDataset.filter(
        p => p.expectedSimilarity > 0.3 && p.expectedSimilarity < 0.7
      );

      for (const pair of partialPairs) {
        const similarity = reasoningBank.calculateSimilarity(pair.pattern1, pair.pattern2);

        // Should be in the partial match range
        expect(similarity).toBeGreaterThan(0.2);
        expect(similarity).toBeLessThanOrEqual(0.8); // Use <= to handle boundary
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle patterns with identical framework and language', async () => {
      const pattern1: TestPattern = createTestPattern('p1', 'jest', 'typescript', ['api', 'unit']);
      const pattern2: TestPattern = createTestPattern('p2', 'jest', 'typescript', ['api', 'unit']);

      const similarity = reasoningBank.calculateSimilarity(pattern1, pattern2);

      expect(similarity).toBeGreaterThanOrEqual(0.9);
    });

    it('should handle patterns with no common tags', async () => {
      const pattern1: TestPattern = createTestPattern('p1', 'jest', 'typescript', ['api']);
      const pattern2: TestPattern = createTestPattern('p2', 'jest', 'typescript', ['database']);

      const similarity = reasoningBank.calculateSimilarity(pattern1, pattern2);

      // Should still match on framework and language
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(0.7);
    });

    it('should handle patterns with different frameworks', async () => {
      const pattern1: TestPattern = createTestPattern('p1', 'jest', 'typescript', ['api']);
      const pattern2: TestPattern = createTestPattern('p2', 'mocha', 'typescript', ['api']);

      const similarity = reasoningBank.calculateSimilarity(pattern1, pattern2);

      // Lower similarity due to framework difference
      expect(similarity).toBeLessThan(0.8);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should match API controller patterns across projects', async () => {
      const project1Pattern: TestPattern = {
        id: 'p1-api',
        name: 'API Controller Test',
        description: 'Test Express.js controller',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test template',
        examples: ['describe("UserController", () => {})'],
        confidence: 0.9,
        usageCount: 10,
        successRate: 0.85,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['api', 'controller', 'express', 'rest']
        }
      };

      const project2Pattern: TestPattern = {
        id: 'p2-api',
        name: 'REST API Controller Test',
        description: 'Test REST controller endpoints',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test template',
        examples: ['describe("ProductController", () => {})'],
        confidence: 0.88,
        usageCount: 8,
        successRate: 0.90,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['api', 'controller', 'rest', 'endpoint']
        }
      };

      const similarity = reasoningBank.calculateSimilarity(project1Pattern, project2Pattern);

      // Should be highly similar (same domain, framework, language, overlapping tags)
      expect(similarity).toBeGreaterThanOrEqual(0.75);
    });

    it('should distinguish between unit and integration patterns', async () => {
      const unitPattern: TestPattern = createTestPattern('unit', 'jest', 'typescript', ['unit', 'mock']);
      unitPattern.category = 'unit';

      const integrationPattern: TestPattern = createTestPattern('int', 'jest', 'typescript', ['integration', 'database']);
      integrationPattern.category = 'integration';

      const similarity = reasoningBank.calculateSimilarity(unitPattern, integrationPattern);

      // Different categories should reduce similarity
      expect(similarity).toBeLessThan(0.6);
    });
  });
});

/**
 * Create ground truth dataset with 100+ pattern pairs
 */
function createGroundTruthDataset(): GroundTruthPair[] {
  const dataset: GroundTruthPair[] = [];

  // Very similar patterns (20 pairs)
  for (let i = 0; i < 20; i++) {
    dataset.push({
      pattern1: createTestPattern(`similar-${i}-a`, 'jest', 'typescript', ['api', 'unit']),
      pattern2: createTestPattern(`similar-${i}-b`, 'jest', 'typescript', ['api', 'unit']),
      expectedSimilarity: 0.95,
      shouldMatch: true
    });
  }

  // Moderately similar patterns (30 pairs)
  for (let i = 0; i < 30; i++) {
    dataset.push({
      pattern1: createTestPattern(`moderate-${i}-a`, 'jest', 'typescript', ['api', 'unit']),
      pattern2: createTestPattern(`moderate-${i}-b`, 'jest', 'typescript', ['api', 'integration']),
      expectedSimilarity: 0.5,
      shouldMatch: true
    });
  }

  // Different patterns (30 pairs)
  for (let i = 0; i < 30; i++) {
    dataset.push({
      pattern1: createTestPattern(`diff-${i}-a`, 'jest', 'typescript', ['api']),
      pattern2: createTestPattern(`diff-${i}-b`, 'mocha', 'javascript', ['e2e']),
      expectedSimilarity: 0.1,
      shouldMatch: false
    });
  }

  // Same framework, different language (10 pairs)
  for (let i = 0; i < 10; i++) {
    dataset.push({
      pattern1: createTestPattern(`lang-${i}-a`, 'jest', 'typescript', ['unit']),
      pattern2: createTestPattern(`lang-${i}-b`, 'jest', 'javascript', ['unit']),
      expectedSimilarity: 0.6,
      shouldMatch: true
    });
  }

  // Same language, different framework (10 pairs)
  for (let i = 0; i < 10; i++) {
    dataset.push({
      pattern1: createTestPattern(`fw-${i}-a`, 'jest', 'typescript', ['unit']),
      pattern2: createTestPattern(`fw-${i}-b`, 'vitest', 'typescript', ['unit']),
      expectedSimilarity: 0.55,
      shouldMatch: true
    });
  }

  return dataset;
}

// Seeded random instance for deterministic pattern creation
const accuracyRng = createSeededRandom(15200);

/**
 * Helper to create test patterns
 */
function createTestPattern(
  id: string,
  framework: 'jest' | 'mocha' | 'vitest' | 'playwright' | 'cypress' | 'jasmine' | 'ava',
  language: 'typescript' | 'javascript' | 'python',
  tags: string[]
): TestPattern {
  return {
    id,
    name: `Pattern ${id}`,
    description: `Test pattern ${id}`,
    category: 'unit',
    framework,
    language,
    template: `template-${id}`,
    examples: [`example-${id}`],
    confidence: 0.8 + accuracyRng.random() * 0.2,
    usageCount: Math.floor(accuracyRng.random() * 100),
    successRate: 0.7 + accuracyRng.random() * 0.3,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      tags
    }
  };
}
