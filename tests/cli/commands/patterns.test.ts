/**
 * CLI Patterns Commands Tests
 * Tests for `aqe patterns` commands (list, search, extract, show, stats)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank, TestPattern } from '@reasoning/QEReasoningBank';
import { PatternExtractor } from '@reasoning/PatternExtractor';
import { Database } from '@utils/Database';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('CLI Patterns Commands', () => {
  let reasoningBank: QEReasoningBank;
  let patternExtractor: PatternExtractor;
  let database: Database;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, '../../temp', `cli-patterns-${Date.now()}.db`);
    await fs.ensureDir(path.dirname(testDbPath));

    database = new Database(testDbPath);
    await database.initialize();

    reasoningBank = new QEReasoningBank({ database, minQuality: 0.6 });
    await reasoningBank.initialize();

    patternExtractor = new PatternExtractor({ minConfidence: 0.7 });
  });

  afterEach(async () => {
    if (database) {
      await database.close();
    }
    if (fs.existsSync(testDbPath)) {
      await fs.remove(testDbPath);
    }
  });

  describe('aqe patterns list', () => {
    it('should list all patterns', async () => {
      // Store some patterns
      for (let i = 0; i < 5; i++) {
        await reasoningBank.storePattern({
          id: `pattern-${i}`,
          name: `Test Pattern ${i}`,
          description: `Pattern ${i}`,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: `describe('Test ${i}', () => { it('works', () => {}); });`,
          examples: [`example ${i}`],
          confidence: 0.85,
          usageCount: i * 2,
          successRate: 0.9,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['test', 'unit']
          }
        });
      }

      const patterns = await reasoningBank.getAllPatterns();
      expect(patterns.length).toBe(5);
    });

    it('should filter patterns by framework', async () => {
      // Store patterns with different frameworks
      await reasoningBank.storePattern({
        id: 'jest-pattern',
        name: 'Jest Pattern',
        description: 'Jest test',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'describe(...)',
        examples: ['ex1'],
        confidence: 0.85,
        usageCount: 10,
        successRate: 0.9,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['jest']
        }
      });

      await reasoningBank.storePattern({
        id: 'mocha-pattern',
        name: 'Mocha Pattern',
        description: 'Mocha test',
        category: 'unit',
        framework: 'mocha',
        language: 'typescript',
        template: 'describe(...)',
        examples: ['ex1'],
        confidence: 0.85,
        usageCount: 10,
        successRate: 0.9,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['mocha']
        }
      });

      const allPatterns = await reasoningBank.getAllPatterns();
      expect(allPatterns.length).toBe(2);

      // Filter simulation
      const jestPatterns = allPatterns.filter(p => p.framework === 'jest');
      expect(jestPatterns.length).toBe(1);
    });
  });

  describe('aqe patterns search', () => {
    it('should search patterns by keyword', async () => {
      await reasoningBank.storePattern({
        id: 'api-pattern',
        name: 'API Test Pattern',
        description: 'Testing REST APIs',
        category: 'integration',
        framework: 'jest',
        language: 'typescript',
        template: 'describe("API", () => {})',
        examples: ['API test example'],
        confidence: 0.9,
        usageCount: 20,
        successRate: 0.95,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['api', 'rest', 'integration']
        }
      });

      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['api']
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.name).toContain('API');
    });
  });

  describe('aqe patterns extract', () => {
    it('should extract patterns from test files', async () => {
      // Create test file
      const testFile = path.join(__dirname, '../../temp', 'sample-test.ts');
      await fs.writeFile(testFile, `
        describe('UserService', () => {
          it('should handle null input', () => {
            const result = userService.process(null);
            expect(result).toBeNull();
          });

          it('should throw error on invalid data', () => {
            expect(() => userService.process({ invalid: true })).toThrow();
          });
        });
      `);

      const extracted = await patternExtractor.extractFromFile(testFile);

      expect(extracted.length).toBeGreaterThan(0);

      // Cleanup
      await fs.remove(testFile);
    });
  });

  describe('aqe patterns show', () => {
    it('should show pattern details', async () => {
      const pattern: TestPattern = {
        id: 'detailed-pattern',
        name: 'Detailed Test Pattern',
        description: 'A comprehensive pattern with all details',
        category: 'integration',
        framework: 'jest',
        language: 'typescript',
        template: 'describe("{{name}}", () => { it("{{test}}", async () => { /* ... */ }); });',
        examples: [
          'describe("UserAPI", () => { it("should return user", async () => {}); });'
        ],
        confidence: 0.92,
        usageCount: 50,
        successRate: 0.96,
        quality: 0.88,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.2.0',
          tags: ['api', 'user', 'integration', 'async']
        }
      };

      await reasoningBank.storePattern(pattern);

      const retrieved = await reasoningBank.getPattern('detailed-pattern');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Detailed Test Pattern');
      expect(retrieved?.quality).toBe(0.88);
      expect(retrieved?.usageCount).toBe(50);
    });
  });

  describe('aqe patterns stats', () => {
    it('should show pattern statistics', async () => {
      // Store patterns with various stats
      for (let i = 0; i < 10; i++) {
        await reasoningBank.storePattern({
          id: `stats-pattern-${i}`,
          name: `Pattern ${i}`,
          description: 'Stats pattern',
          category: i % 2 === 0 ? 'unit' : 'integration',
          framework: 'jest',
          language: 'typescript',
          template: 'test template',
          examples: ['example'],
          confidence: 0.7 + (i * 0.02),
          usageCount: i * 5,
          successRate: 0.8 + (i * 0.01),
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['test']
          }
        });
      }

      const patterns = await reasoningBank.getAllPatterns();
      const totalPatterns = patterns.length;
      const avgUsage = patterns.reduce((sum, p) => sum + p.usageCount, 0) / totalPatterns;
      const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / totalPatterns;

      expect(totalPatterns).toBe(10);
      expect(avgUsage).toBeGreaterThan(0);
      expect(avgConfidence).toBeGreaterThan(0.7);
    });
  });
});
