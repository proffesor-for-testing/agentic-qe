/**
 * Enhanced QEReasoningBank Tests
 * Target: 85%+ pattern matching accuracy
 */

import { QEReasoningBank, TestPattern } from '../../../src/reasoning/QEReasoningBank';

describe('QEReasoningBank - Enhanced with Vector Similarity', () => {
  let reasoningBank: QEReasoningBank;

  beforeEach(() => {
    reasoningBank = new QEReasoningBank({ minQuality: 0.7 });
  });

  const createTestPattern = (
    id: string,
    name: string,
    framework: 'jest' | 'mocha' | 'vitest' | 'playwright' | 'cypress' | 'jasmine' | 'ava',
    tags: string[],
    example: string
  ): TestPattern => ({
    id,
    name,
    description: `Test pattern for ${name}`,
    category: 'unit',
    framework,
    language: 'typescript',
    template: example,
    examples: [example],
    confidence: 0.9,
    usageCount: 5,
    successRate: 0.95,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      tags
    }
  });

  describe('Vector Similarity Pattern Matching', () => {
    it('should find patterns using vector similarity with 85%+ accuracy', async () => {
      // Create a diverse set of test patterns
      const patterns = [
        createTestPattern(
          'p1',
          'API Controller Validation',
          'jest',
          ['api', 'controller', 'validation'],
          'it("should validate API request", () => { expect(validateRequest(data)).toBe(true); });'
        ),
        createTestPattern(
          'p2',
          'Database Query Test',
          'jest',
          ['database', 'query', 'integration'],
          'it("should query database", async () => { const result = await db.query(); expect(result).toBeDefined(); });'
        ),
        createTestPattern(
          'p3',
          'API Endpoint Authentication',
          'jest',
          ['api', 'authentication', 'security'],
          'it("should authenticate API endpoint", () => { expect(auth.verify(token)).toBe(true); });'
        ),
        createTestPattern(
          'p4',
          'UI Component Rendering',
          'jest',
          ['ui', 'component', 'rendering'],
          'it("should render component", () => { render(<Component />); expect(screen.getByText("Hello")).toBeInTheDocument(); });'
        ),
        createTestPattern(
          'p5',
          'API Integration Test',
          'jest',
          ['api', 'integration', 'endpoint'],
          'it("should test API integration", async () => { const response = await api.call(); expect(response.status).toBe(200); });'
        )
      ];

      // Store all patterns
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      // Test Case 1: Query for API-related patterns
      const apiMatches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['api', 'validation']
      }, 3);

      expect(apiMatches.length).toBeGreaterThan(0);
      expect(apiMatches[0].pattern.id).toBe('p1'); // Should match API Controller Validation
      expect(apiMatches[0].similarity).toBeGreaterThan(0.7);

      // Test Case 2: Query for database patterns
      const dbMatches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        keywords: ['database', 'query']
      }, 3);

      expect(dbMatches.length).toBeGreaterThan(0);
      expect(dbMatches[0].pattern.id).toBe('p2'); // Should match Database Query Test
      expect(dbMatches[0].similarity).toBeGreaterThan(0.7);

      // Test Case 3: Query with source code
      const codeMatches = await reasoningBank.findSimilarPatterns(
        'it("should test authentication", () => { expect(auth.check()).toBe(true); });',
        'jest',
        3
      );

      expect(codeMatches.length).toBeGreaterThan(0);
      expect(codeMatches[0].pattern.metadata.tags).toContain('authentication');
    });

    it('should achieve 85%+ accuracy on pattern similarity tests', async () => {
      // Ground truth: patterns with known similarity relationships
      const testCases = [
        {
          pattern: createTestPattern(
            'test1',
            'API Validation Test',
            'jest',
            ['api', 'validation'],
            'it("validates API", () => { expect(validate()).toBe(true); });'
          ),
          expectedMatch: 'API Controller Validation',
          minSimilarity: 0.85
        },
        {
          pattern: createTestPattern(
            'test2',
            'Database Integration Test',
            'jest',
            ['database', 'integration'],
            'it("tests database", async () => { await db.query(); });'
          ),
          expectedMatch: 'Database Query Test',
          minSimilarity: 0.85
        },
        {
          pattern: createTestPattern(
            'test3',
            'Component Render Test',
            'jest',
            ['ui', 'component'],
            'it("renders component", () => { render(<Test />); });'
          ),
          expectedMatch: 'UI Component Rendering',
          minSimilarity: 0.85
        }
      ];

      // Store reference patterns
      const referencePatterns = [
        createTestPattern(
          'ref1',
          'API Controller Validation',
          'jest',
          ['api', 'controller', 'validation'],
          'it("validates API request", () => { expect(validateRequest()).toBe(true); });'
        ),
        createTestPattern(
          'ref2',
          'Database Query Test',
          'jest',
          ['database', 'query'],
          'it("queries database", async () => { const result = await db.query(); });'
        ),
        createTestPattern(
          'ref3',
          'UI Component Rendering',
          'jest',
          ['ui', 'component', 'rendering'],
          'it("renders UI component", () => { render(<Component />); });'
        )
      ];

      for (const pattern of referencePatterns) {
        await reasoningBank.storePattern(pattern);
      }

      // Test each case
      let correctMatches = 0;
      for (const testCase of testCases) {
        const matches = await reasoningBank.findSimilarPatterns(
          testCase.pattern.examples[0],
          testCase.pattern.framework,
          3
        );

        if (matches.length > 0) {
          const topMatch = matches[0];
          if (topMatch.pattern.name === testCase.expectedMatch &&
              topMatch.similarity >= testCase.minSimilarity) {
            correctMatches++;
          }
        }
      }

      // Calculate accuracy
      const accuracy = correctMatches / testCases.length;
      expect(accuracy).toBeGreaterThanOrEqual(0.85); // 85%+ accuracy target
    });
  });

  describe('Pattern Quality Scoring', () => {
    it('should calculate quality scores for patterns', async () => {
      const pattern = createTestPattern(
        'quality1',
        'High Quality Test',
        'jest',
        ['api', 'validation'],
        `// This is a well-documented test
it("should validate API request with proper error handling", async () => {
  // Arrange
  const request = { id: 1, data: "test" };

  // Act
  const result = await validateRequest(request);

  // Assert
  expect(result).toBeDefined();
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
});`
      );

      await reasoningBank.storePattern(pattern);
      const retrieved = await reasoningBank.getPattern('quality1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.quality).toBeDefined();
      expect(retrieved!.quality).toBeGreaterThan(0);
      expect(retrieved!.quality).toBeLessThanOrEqual(1);
    });

    it('should filter patterns by quality threshold', async () => {
      const highQualityBank = new QEReasoningBank({ minQuality: 0.8 });

      // Add high quality pattern
      await highQualityBank.storePattern(createTestPattern(
        'high1',
        'High Quality Pattern',
        'jest',
        ['api'],
        `it("well-structured test", async () => {
  const result = await api.call();
  expect(result).toBeDefined();
  expect(result.status).toBe(200);
});`
      ));

      // Find patterns - should respect quality threshold
      const matches = await highQualityBank.findMatchingPatterns({
        codeType: 'test',
        keywords: ['api']
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => (m.pattern.quality ?? 0) >= 0.7)).toBe(true);
    });
  });

  describe('Cross-Framework Pattern Sharing', () => {
    it('should support all 6 frameworks (jest, mocha, cypress, vitest, jasmine, ava)', async () => {
      const frameworks: Array<'jest' | 'mocha' | 'vitest' | 'playwright' | 'cypress' | 'jasmine' | 'ava'> = [
        'jest', 'mocha', 'cypress', 'vitest', 'jasmine', 'ava'
      ];

      for (const framework of frameworks) {
        const pattern = createTestPattern(
          `fw-${framework}`,
          `${framework} Test Pattern`,
          framework,
          [framework, 'test'],
          `it("${framework} test", () => { expect(true).toBe(true); });`
        );

        await reasoningBank.storePattern(pattern);
      }

      const stats = reasoningBank.getStats();
      expect(stats.totalPatterns).toBe(6);
      expect(Object.keys(stats.byFramework)).toEqual(expect.arrayContaining(frameworks));
    });

    it('should export and import patterns for cross-project sharing', async () => {
      // Project A: Create and store patterns
      await reasoningBank.storePattern(createTestPattern(
        'shared1',
        'Shared API Pattern',
        'jest',
        ['api', 'shared'],
        'it("shared test", () => { expect(true).toBe(true); });'
      ));

      // Export patterns
      const exported = reasoningBank.exportPatterns({ framework: 'jest' });
      expect(exported.length).toBe(1);

      // Project B: Import patterns
      const newBank = new QEReasoningBank();
      await newBank.importPatterns(exported);

      const imported = await newBank.getPattern('shared1');
      expect(imported).toBeDefined();
      expect(imported!.name).toBe('Shared API Pattern');
    });
  });

  describe('Pattern Statistics', () => {
    it('should calculate comprehensive statistics with quality metrics', async () => {
      await reasoningBank.storePattern(createTestPattern(
        's1',
        'Jest Unit Test',
        'jest',
        ['unit'],
        'it("test", () => { expect(true).toBe(true); });'
      ));

      await reasoningBank.storePattern(createTestPattern(
        's2',
        'Mocha Integration Test',
        'mocha',
        ['integration'],
        'it("test", () => { assert.ok(true); });'
      ));

      await reasoningBank.storePattern(createTestPattern(
        's3',
        'Cypress E2E Test',
        'cypress',
        ['e2e'],
        'it("test", () => { cy.visit("/"); });'
      ));

      const stats = reasoningBank.getStats();

      expect(stats.totalPatterns).toBe(3);
      expect(stats.byFramework['jest']).toBe(1);
      expect(stats.byFramework['mocha']).toBe(1);
      expect(stats.byFramework['cypress']).toBe(1);
      expect(stats.byCategory['unit']).toBe(1);
      expect(stats.averageQuality).toBeGreaterThan(0);
      expect(stats.averageSuccessRate).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle 100+ patterns efficiently', async () => {
      // Store 100 patterns
      for (let i = 0; i < 100; i++) {
        await reasoningBank.storePattern(createTestPattern(
          `perf-${i}`,
          `Test Pattern ${i}`,
          'jest',
          [`tag${i % 10}`],
          `it("test ${i}", () => { expect(true).toBe(true); });`
        ));
      }

      const stats = reasoningBank.getStats();
      expect(stats.totalPatterns).toBe(100);

      // Pattern lookup should be < 50ms
      const startTime = Date.now();
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        keywords: ['tag5']
      }, 10);
      const endTime = Date.now();

      expect(matches.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(50); // < 50ms p95
    });

    it('should store patterns efficiently (< 25ms p95)', async () => {
      const pattern = createTestPattern(
        'perf-store',
        'Performance Test',
        'jest',
        ['performance'],
        'it("test", () => { expect(true).toBe(true); });'
      );

      const startTime = Date.now();
      await reasoningBank.storePattern(pattern);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(25); // < 25ms p95
    });
  });

  describe('Version History', () => {
    it('should track pattern versions', async () => {
      const pattern = createTestPattern(
        'versioned',
        'Versioned Pattern',
        'jest',
        ['v1'],
        'it("v1", () => { expect(true).toBe(true); });'
      );

      // Store version 1
      await reasoningBank.storePattern(pattern);

      // Update to version 2
      pattern.template = 'it("v2", () => { expect(true).toBe(true); });';
      pattern.metadata.version = '2.0.0';
      await reasoningBank.storePattern(pattern);

      // Check history
      const history = await reasoningBank.getVersionHistory('versioned');
      expect(history.length).toBe(1); // One previous version
      expect(history[0].metadata.version).toBe('1.0.0');
    });
  });
});
