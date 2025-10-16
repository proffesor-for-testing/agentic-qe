/**
 * PatternClassifier Tests
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 */

import { PatternClassifier } from '../../../src/reasoning/PatternClassifier';
import { TestPattern, PatternType, TestFramework, PatternCategory } from '../../../src/types/pattern.types';

describe('PatternClassifier', () => {
  let classifier: PatternClassifier;

  beforeEach(() => {
    classifier = new PatternClassifier();
  });

  const createMockPattern = (id: string, type: PatternType, name: string, frequency = 5): TestPattern => ({
    id,
    name,
    type,
    category: PatternCategory.UNIT_TEST,
    framework: TestFramework.JEST,
    template: {
      id: `template-${id}`,
      name: `Template ${name}`,
      description: 'Mock template',
      structure: { type: 'root', id: 'root', children: [], properties: {}, parameterRefs: [] },
      parameters: [],
      validationRules: [],
      codeGenerators: {}
    },
    examples: [`// Example for ${type}`],
    frequency,
    confidence: 0.85,
    applicabilityConditions: ['test condition'],
    sourceFile: '/test.ts',
    createdAt: new Date(),
    metadata: {}
  });

  describe('classify', () => {
    it('should classify edge case pattern correctly', async () => {
      const pattern = createMockPattern('1', PatternType.EDGE_CASE, 'handle null input');

      const result = await classifier.classify(pattern);

      expect(result.patternId).toBe('1');
      expect(result.type).toBe(PatternType.EDGE_CASE);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reasoning).toBeDefined();
    });

    it('should classify error handling pattern correctly', async () => {
      const pattern = createMockPattern('2', PatternType.ERROR_HANDLING, 'test error throw');

      const result = await classifier.classify(pattern);

      expect(result.type).toBe(PatternType.ERROR_HANDLING);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should provide reasoning for classification', async () => {
      const pattern = createMockPattern('3', PatternType.ASYNC_PATTERN, 'async test');

      const result = await classifier.classify(pattern);

      expect(result.reasoning).toContain('async');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('should provide alternative classifications', async () => {
      const pattern = createMockPattern('4', PatternType.EDGE_CASE, 'boundary test');

      const result = await classifier.classify(pattern);

      expect(result.alternatives).toBeDefined();
      expect(Array.isArray(result.alternatives)).toBe(true);
    });

    it('should have higher confidence for clear patterns', async () => {
      const clearPattern = createMockPattern('5', PatternType.ERROR_HANDLING, 'error throw catch test', 10);
      const unclearPattern = createMockPattern('6', PatternType.ASSERTION_PATTERN, 'test', 1);

      const clearResult = await classifier.classify(clearPattern);
      const unclearResult = await classifier.classify(unclearPattern);

      expect(clearResult.confidence).toBeGreaterThan(unclearResult.confidence);
    });
  });

  describe('calculateSimilarity', () => {
    beforeEach(() => {
      const patterns = [
        createMockPattern('p1', PatternType.EDGE_CASE, 'null handling'),
        createMockPattern('p2', PatternType.EDGE_CASE, 'undefined handling'),
        createMockPattern('p3', PatternType.ERROR_HANDLING, 'exception test')
      ];
      classifier.loadPatterns(patterns);
    });

    it('should calculate similarity between patterns', async () => {
      const similarity = await classifier.calculateSimilarity('p1', 'p2');

      expect(similarity.pattern1).toBe('p1');
      expect(similarity.pattern2).toBe('p2');
      expect(similarity.score).toBeGreaterThanOrEqual(0);
      expect(similarity.score).toBeLessThanOrEqual(1);
      expect(similarity.details).toBeDefined();
    });

    it('should show high similarity for same-type patterns', async () => {
      const similarity = await classifier.calculateSimilarity('p1', 'p2');

      // Both are EDGE_CASE patterns
      expect(similarity.score).toBeGreaterThan(0.5);
    });

    it('should show low similarity for different-type patterns', async () => {
      const similarity = await classifier.calculateSimilarity('p1', 'p3');

      // EDGE_CASE vs ERROR_HANDLING
      expect(similarity.score).toBeLessThan(0.8);
    });

    it('should provide detailed similarity breakdown', async () => {
      const similarity = await classifier.calculateSimilarity('p1', 'p2');

      expect(similarity.details.structuralSimilarity).toBeDefined();
      expect(similarity.details.semanticSimilarity).toBeDefined();
      expect(similarity.details.typeCompatibility).toBeDefined();
      expect(similarity.details.commonPatterns).toBeDefined();
    });
  });

  describe('recommendPatterns', () => {
    beforeEach(() => {
      const patterns = [
        createMockPattern('p1', PatternType.EDGE_CASE, 'null handling'),
        createMockPattern('p2', PatternType.ASYNC_PATTERN, 'async operation'),
        createMockPattern('p3', PatternType.ERROR_HANDLING, 'error handling'),
        createMockPattern('p4', PatternType.BOUNDARY_CONDITION, 'range check')
      ];
      classifier.loadPatterns(patterns);
    });

    it('should recommend patterns for code', async () => {
      const code = `
async function fetchData(id: string | null): Promise<any> {
  if (id === null) {
    throw new Error('Invalid ID');
  }
  const response = await fetch(\`/api/\${id}\`);
  return await response.json();
}
      `;

      const recommendations = await classifier.recommendPatterns(code, 3);

      expect(recommendations.length).toBeLessThanOrEqual(3);
      expect(recommendations.length).toBeGreaterThan(0);

      recommendations.forEach(rec => {
        expect(rec.patternId).toBeDefined();
        expect(rec.patternName).toBeDefined();
        expect(rec.score).toBeGreaterThanOrEqual(0);
        expect(rec.score).toBeLessThanOrEqual(1);
        expect(rec.reason).toBeDefined();
        expect(rec.applicability).toBeGreaterThanOrEqual(0);
      });
    });

    it('should recommend async patterns for async code', async () => {
      const code = `
async function test() {
  await someOperation();
}
      `;

      const recommendations = await classifier.recommendPatterns(code);

      // Should recommend async pattern
      const asyncRec = recommendations.find(r => r.patternId === 'p2');
      expect(asyncRec).toBeDefined();
    });

    it('should recommend error patterns for error handling code', async () => {
      const code = `
function test() {
  try {
    riskyOperation();
  } catch (error) {
    handleError(error);
  }
}
      `;

      const recommendations = await classifier.recommendPatterns(code);

      const errorRec = recommendations.find(r => r.patternId === 'p3');
      expect(errorRec).toBeDefined();
    });

    it('should sort recommendations by score', async () => {
      const code = 'async function test() { await op(); }';

      const recommendations = await classifier.recommendPatterns(code);

      for (let i = 1; i < recommendations.length; i++) {
        expect(recommendations[i - 1].score).toBeGreaterThanOrEqual(recommendations[i].score);
      }
    });

    it('should respect limit parameter', async () => {
      const code = 'function test() {}';

      const recs1 = await classifier.recommendPatterns(code, 1);
      const recs2 = await classifier.recommendPatterns(code, 2);

      expect(recs1.length).toBeLessThanOrEqual(1);
      expect(recs2.length).toBeLessThanOrEqual(2);
    });
  });

  describe('findSimilarPatterns', () => {
    beforeEach(() => {
      const patterns = [
        createMockPattern('p1', PatternType.EDGE_CASE, 'null check'),
        createMockPattern('p2', PatternType.EDGE_CASE, 'undefined check'),
        createMockPattern('p3', PatternType.EDGE_CASE, 'empty check'),
        createMockPattern('p4', PatternType.ERROR_HANDLING, 'error test'),
        createMockPattern('p5', PatternType.BOUNDARY_CONDITION, 'range test')
      ];
      classifier.loadPatterns(patterns);
    });

    it('should find similar patterns', async () => {
      const similar = await classifier.findSimilarPatterns('p1', 0.5);

      expect(similar.length).toBeGreaterThan(0);
      similar.forEach(s => {
        expect(s.score).toBeGreaterThanOrEqual(0.5);
      });
    });

    it('should not include the target pattern itself', async () => {
      const similar = await classifier.findSimilarPatterns('p1', 0.0);

      const selfMatch = similar.find(s => s.pattern1 === 'p1' && s.pattern2 === 'p1');
      expect(selfMatch).toBeUndefined();
    });

    it('should respect threshold parameter', async () => {
      const similar = await classifier.findSimilarPatterns('p1', 0.9);

      similar.forEach(s => {
        expect(s.score).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should respect limit parameter', async () => {
      const similar = await classifier.findSimilarPatterns('p1', 0.0, 2);

      expect(similar.length).toBeLessThanOrEqual(2);
    });

    it('should sort by similarity score descending', async () => {
      const similar = await classifier.findSimilarPatterns('p1', 0.0);

      for (let i = 1; i < similar.length; i++) {
        expect(similar[i - 1].score).toBeGreaterThanOrEqual(similar[i].score);
      }
    });
  });

  describe('loadPatterns', () => {
    it('should load patterns for classification', () => {
      const patterns = [
        createMockPattern('p1', PatternType.EDGE_CASE, 'test1'),
        createMockPattern('p2', PatternType.ERROR_HANDLING, 'test2')
      ];

      classifier.loadPatterns(patterns);

      expect(classifier.getPatterns().length).toBe(2);
    });

    it('should retrieve pattern by ID', () => {
      const patterns = [
        createMockPattern('p1', PatternType.EDGE_CASE, 'test1')
      ];

      classifier.loadPatterns(patterns);

      const pattern = classifier.getPattern('p1');
      expect(pattern).toBeDefined();
      expect(pattern!.id).toBe('p1');
    });
  });
});
