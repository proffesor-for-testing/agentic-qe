/**
 * Enhanced Tests for QEReasoningBank with Pattern Matching and Cross-Project Sharing
 * Tests vector similarity, hybrid matching, quality scoring, and pattern export/import
 *
 * @module tests/reasoning/QEReasoningBank-enhanced
 */

import { QEReasoningBank, TestPattern, PatternMatch } from '../../src/reasoning/QEReasoningBank';

describe('QEReasoningBank - Enhanced Pattern Matching', () => {
  let reasoningBank: QEReasoningBank;

  beforeEach(() => {
    reasoningBank = new QEReasoningBank({ minQuality: 0.6 });
  });

  afterEach(() => {
    // Cleanup if needed
  });

  // -------------------------------------------------------------------------
  // Vector Similarity Tests
  // -------------------------------------------------------------------------

  describe('Vector Similarity Matching', () => {
    beforeEach(async () => {
      // Seed patterns with different characteristics
      const patterns: TestPattern[] = [
        {
          id: 'api-controller-1',
          name: 'Express API Controller Test',
          description: 'Testing RESTful API controllers with Express.js',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'describe("{{controller}}", () => { it("should handle {{method}}", async () => {}) })',
          examples: ['describe("UserController", () => { it("should handle GET", async () => {}) })'],
          confidence: 0.95,
          usageCount: 100,
          successRate: 0.92,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['api', 'controller', 'express', 'rest']
          }
        },
        {
          id: 'api-validation-1',
          name: 'API Input Validation Test',
          description: 'Testing API request validation and error handling',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'describe("{{validator}}", () => { it("should reject invalid {{field}}", () => {}) })',
          examples: ['describe("UserValidator", () => { it("should reject invalid email", () => {}) })'],
          confidence: 0.90,
          usageCount: 75,
          successRate: 0.88,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['api', 'validation', 'error-handling']
          }
        },
        {
          id: 'database-crud-1',
          name: 'Database CRUD Operations Test',
          description: 'Testing database create, read, update, delete operations',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          template: 'describe("{{repository}}", () => { it("should {{operation}}", async () => {}) })',
          examples: ['describe("UserRepository", () => { it("should create user", async () => {}) })'],
          confidence: 0.88,
          usageCount: 60,
          successRate: 0.85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['database', 'crud', 'repository', 'integration']
          }
        }
      ];

      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }
    });

    it('should find similar patterns using vector similarity', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        language: 'typescript',
        keywords: ['api', 'controller'],
        sourceCode: 'function UserController() { /* API handling */ }'
      }, 5);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].similarity).toBeGreaterThan(0.5);
      expect(matches[0].pattern.id).toBe('api-controller-1'); // Most similar
    });

    it('should provide similarity scores in pattern matches', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        keywords: ['api']
      }, 10);

      matches.forEach(match => {
        expect(match).toHaveProperty('similarity');
        expect(match.similarity).toBeGreaterThanOrEqual(0);
        expect(match.similarity).toBeLessThanOrEqual(1);
      });
    });

    it('should rank patterns by hybrid score (vector + rule-based)', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        language: 'typescript',
        keywords: ['api', 'validation']
      }, 10);

      // Matches should be sorted by applicability (hybrid score)
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].applicability).toBeGreaterThanOrEqual(matches[i].applicability);
      }
    });

    it('should find similar patterns by example code', async () => {
      const exampleCode = `
        describe("ProductController", () => {
          it("should handle POST request", async () => {
            const response = await request(app).post('/products');
            expect(response.status).toBe(201);
          });
        });
      `;

      const matches = await reasoningBank.findSimilarPatterns(exampleCode, 'jest', 3);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.metadata.tags).toContain('api');
    });

    it('should include vector similarity in reasoning', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        keywords: ['api', 'controller']
      });

      expect(matches[0].reasoning).toContain('Similarity:');
      expect(matches[0].reasoning).toContain('%');
    });
  });

  // -------------------------------------------------------------------------
  // Quality Filtering Tests
  // -------------------------------------------------------------------------

  describe('Quality Filtering', () => {
    it('should filter patterns below minimum quality', async () => {
      const lowQualityPattern: TestPattern = {
        id: 'low-quality-1',
        name: 'Low Quality Pattern',
        description: 'Poor quality test pattern',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test()',
        examples: [],
        confidence: 0.3,
        usageCount: 1,
        successRate: 0.4,
        quality: 0.5, // Below minimum of 0.6
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      await reasoningBank.storePattern(lowQualityPattern);

      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest'
      }, 10);

      // Low quality pattern should be filtered out
      expect(matches.find(m => m.pattern.id === 'low-quality-1')).toBeUndefined();
    });

    it('should include quality score in pattern matches', async () => {
      const highQualityPattern: TestPattern = {
        id: 'high-quality-1',
        name: 'High Quality Pattern',
        description: 'Excellent test pattern',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'describe("{{name}}", () => { it("should {{action}}", () => { expect(result).toBe(expected); }); });',
        examples: ['describe("Calculator", () => { it("should add numbers", () => { expect(2+2).toBe(4); }); });'],
        confidence: 0.95,
        usageCount: 200,
        successRate: 0.95,
        quality: 0.92,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['high-quality', 'example']
        }
      };

      await reasoningBank.storePattern(highQualityPattern);

      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest'
      });

      const match = matches.find(m => m.pattern.id === 'high-quality-1');
      expect(match).toBeDefined();
      expect(match!.reasoning).toContain('Quality:');
    });

    it('should factor quality into applicability score', async () => {
      const mediumQualityPattern: TestPattern = {
        id: 'medium-1',
        name: 'Medium Quality',
        description: 'Medium quality pattern',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test()',
        examples: [],
        confidence: 0.9,
        usageCount: 50,
        successRate: 0.8,
        quality: 0.7,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['test']
        }
      };

      const highQualityPattern: TestPattern = {
        ...mediumQualityPattern,
        id: 'high-1',
        name: 'High Quality',
        quality: 0.95
      };

      await reasoningBank.storePattern(mediumQualityPattern);
      await reasoningBank.storePattern(highQualityPattern);

      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest'
      });

      const mediumMatch = matches.find(m => m.pattern.id === 'medium-1');
      const highMatch = matches.find(m => m.pattern.id === 'high-1');

      // Higher quality should have better applicability
      expect(highMatch!.applicability).toBeGreaterThan(mediumMatch!.applicability);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-Project Pattern Sharing Tests
  // -------------------------------------------------------------------------

  describe('Cross-Project Pattern Sharing', () => {
    it('should export patterns for sharing', () => {
      const patterns: TestPattern[] = [
        {
          id: 'shared-1',
          name: 'Shared Pattern 1',
          description: 'Pattern to share',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'test()',
          examples: [],
          confidence: 0.9,
          usageCount: 50,
          successRate: 0.85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['shared']
          }
        }
      ];

      patterns.forEach(p => reasoningBank.storePattern(p));

      const exported = reasoningBank.exportPatterns();

      expect(exported.length).toBeGreaterThan(0);
      expect(exported[0]).toHaveProperty('id');
      expect(exported[0]).toHaveProperty('template');
      expect(exported[0]).toHaveProperty('confidence');
    });

    it('should filter exported patterns by framework', () => {
      const patterns: TestPattern[] = [
        {
          id: 'jest-pattern',
          name: 'Jest Pattern',
          description: 'Jest test',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'describe()',
          examples: [],
          confidence: 0.9,
          usageCount: 50,
          successRate: 0.85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: []
          }
        },
        {
          id: 'mocha-pattern',
          name: 'Mocha Pattern',
          description: 'Mocha test',
          category: 'unit',
          framework: 'mocha',
          language: 'typescript',
          template: 'describe()',
          examples: [],
          confidence: 0.9,
          usageCount: 50,
          successRate: 0.85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: []
          }
        }
      ];

      patterns.forEach(p => reasoningBank.storePattern(p));

      const jestOnly = reasoningBank.exportPatterns({ framework: 'jest' });

      expect(jestOnly.length).toBe(1);
      expect(jestOnly[0].framework).toBe('jest');
    });

    it('should import patterns from another project', async () => {
      const importedPatterns: TestPattern[] = [
        {
          id: 'imported-1',
          name: 'Imported Pattern',
          description: 'Pattern from another project',
          category: 'integration',
          framework: 'playwright',
          language: 'typescript',
          template: 'test("{{scenario}}", async ({ page }) => {})',
          examples: [],
          confidence: 0.88,
          usageCount: 30,
          successRate: 0.82,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['imported', 'e2e']
          }
        }
      ];

      await reasoningBank.importPatterns(importedPatterns);

      const pattern = await reasoningBank.getPattern('imported-1');
      expect(pattern).toBeDefined();
      expect(pattern!.name).toBe('Imported Pattern');
    });

    it('should maintain pattern statistics after import', async () => {
      const patterns: TestPattern[] = [
        {
          id: 'stat-1',
          name: 'Pattern 1',
          description: 'Test',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'test()',
          examples: [],
          confidence: 0.9,
          usageCount: 100,
          successRate: 0.9,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: []
          }
        }
      ];

      await reasoningBank.importPatterns(patterns);

      const stats = await reasoningBank.getStatistics();

      expect(stats.totalPatterns).toBeGreaterThan(0);
      expect(stats.averageSuccessRate).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Advanced Matching Tests
  // -------------------------------------------------------------------------

  describe('Advanced Pattern Matching', () => {
    beforeEach(async () => {
      const patterns: TestPattern[] = [
        {
          id: 'async-1',
          name: 'Async Operation Test',
          description: 'Testing asynchronous operations',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'it("should {{action}}", async () => { await {{operation}}; })',
          examples: [],
          confidence: 0.9,
          usageCount: 80,
          successRate: 0.87,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['async', 'promises', 'await']
          }
        },
        {
          id: 'mock-1',
          name: 'Mock Dependencies Test',
          description: 'Testing with mocked dependencies',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'jest.mock("{{module}}"); it("should {{action}}", () => {})',
          examples: [],
          confidence: 0.85,
          usageCount: 90,
          successRate: 0.89,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['mock', 'dependencies', 'testing']
          }
        }
      ];

      for (const p of patterns) {
        await reasoningBank.storePattern(p);
      }
    });

    it('should match patterns by code content keywords', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        sourceCode: 'async function fetchData() { const result = await api.get(); return result; }',
        framework: 'jest'
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.metadata.tags).toContain('async');
    });

    it('should combine framework match with keyword match', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['mock', 'dependencies']
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.id).toBe('mock-1');
    });

    it('should provide detailed reasoning for matches', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        language: 'typescript',
        keywords: ['async']
      });

      const reasoning = matches[0].reasoning;

      expect(reasoning).toContain('Framework match');
      expect(reasoning).toContain('Language match');
      expect(reasoning).toContain('Tag matches');
      expect(reasoning).toContain('Success rate');
      expect(reasoning).toContain('Used');
    });
  });

  // -------------------------------------------------------------------------
  // Performance Tests (Pattern Matching)
  // -------------------------------------------------------------------------

  describe('Performance', () => {
    beforeEach(async () => {
      // Seed 100 patterns for performance testing
      for (let i = 0; i < 100; i++) {
        const pattern: TestPattern = {
          id: `perf-${i}`,
          name: `Performance Pattern ${i}`,
          description: `Test pattern for performance testing ${i}`,
          category: i % 2 === 0 ? 'unit' : 'integration',
          framework: 'jest',
          language: 'typescript',
          template: `test-${i}()`,
          examples: [`example-${i}`],
          confidence: 0.7 + Math.random() * 0.3,
          usageCount: Math.floor(Math.random() * 200),
          successRate: 0.7 + Math.random() * 0.3,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: [`tag-${i % 10}`, `category-${i % 5}`]
          }
        };

        await reasoningBank.storePattern(pattern);
      }
    });

    it('should find matching patterns in <50ms (p95)', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();

        await reasoningBank.findMatchingPatterns({
          codeType: 'test',
          framework: 'jest',
          keywords: [`tag-${i % 10}`]
        }, 10);

        const duration = performance.now() - start;
        measurements.push(duration);
      }

      measurements.sort((a, b) => a - b);
      const p95 = measurements[Math.floor(measurements.length * 0.95)];

      expect(p95).toBeLessThan(50);
    });

    it('should handle large batch pattern storage efficiently', async () => {
      const start = performance.now();

      const patterns: TestPattern[] = Array.from({ length: 50 }, (_, i) => ({
        id: `batch-${i}`,
        name: `Batch Pattern ${i}`,
        description: 'Batch test',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test()',
        examples: [],
        confidence: 0.9,
        usageCount: 10,
        successRate: 0.85,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: [`batch-${i}`]
        }
      }));

      for (const p of patterns) {
        await reasoningBank.storePattern(p);
      }

      const duration = performance.now() - start;

      // Should complete in reasonable time (under 500ms for 50 patterns)
      expect(duration).toBeLessThan(500);
    });
  });

  // -------------------------------------------------------------------------
  // Integration Scenarios
  // -------------------------------------------------------------------------

  describe('Integration Scenarios', () => {
    it('should support complete pattern lifecycle', async () => {
      // 1. Create and store pattern
      const pattern: TestPattern = {
        id: 'lifecycle-1',
        name: 'Lifecycle Test Pattern',
        description: 'Full lifecycle test',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'describe("{{name}}", () => { it("should {{action}}", () => {}) })',
        examples: ['describe("Test", () => { it("should work", () => {}) })'],
        confidence: 0.8,
        usageCount: 10,
        successRate: 0.75,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['lifecycle', 'test']
        }
      };

      await reasoningBank.storePattern(pattern);

      // 2. Find and use pattern
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        keywords: ['lifecycle']
      });

      expect(matches.length).toBeGreaterThan(0);

      // 3. Update metrics after successful use
      await reasoningBank.updatePatternMetrics('lifecycle-1', true);

      const updated = await reasoningBank.getPattern('lifecycle-1');
      expect(updated!.usageCount).toBe(11);
      expect(updated!.successRate).toBeGreaterThan(0.75);

      // 4. Export for sharing
      const exported = reasoningBank.exportPatterns({ framework: 'jest' });
      expect(exported.find(p => p.id === 'lifecycle-1')).toBeDefined();
    });

    it('should support pattern versioning workflow', async () => {
      // Create initial version
      const v1: TestPattern = {
        id: 'versioned-1',
        name: 'Versioned Pattern',
        description: 'Version 1',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'v1 template',
        examples: [],
        confidence: 0.8,
        usageCount: 50,
        successRate: 0.80,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      await reasoningBank.storePattern(v1);

      // Update to version 2
      const v2: TestPattern = {
        ...v1,
        description: 'Version 2',
        template: 'v2 template improved',
        metadata: { ...v1.metadata, version: '2.0.0' }
      };

      await reasoningBank.storePattern(v2);

      // Check version history
      const history = await reasoningBank.getVersionHistory('versioned-1');
      expect(history.length).toBe(1);
      expect(history[0].template).toBe('v1 template');

      // Current version should be v2
      const current = await reasoningBank.getPattern('versioned-1');
      expect(current!.template).toBe('v2 template improved');
    });
  });
});
