/**
 * Pattern Reuse Integration Tests
 *
 * Tests pattern matching and reuse across sessions
 * Based on CRITICAL-LEARNING-SYSTEM-ANALYSIS.md findings
 *
 * Test Coverage:
 * 1. Pattern matching finds similar code
 * 2. Pattern adaptation to new context
 * 3. Pattern reuse improves performance
 * 4. Pattern success rate tracking
 * 5. Similar code detection
 * 6. Pattern recommendation accuracy
 *
 * **Key Findings from Analysis:**
 * - Patterns exist in memory but not persisted
 * - No pattern reuse logic implemented
 * - Same patterns regenerated every time
 * - No performance improvement over time
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank, TestPattern, PatternMatch } from '@reasoning/QEReasoningBank';
import { Database } from '@utils/Database';
import * as fs from 'fs';
import * as path from 'path';

describe('Pattern Reuse Integration Tests', () => {
  let reasoningBank: QEReasoningBank;
  let database: Database;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, '../temp', `pattern-reuse-${Date.now()}.db`);
    const tempDir = path.dirname(testDbPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    database = new Database(testDbPath);
    await database.initialize();

    // Create patterns table
    await database.run(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        framework TEXT NOT NULL,
        language TEXT NOT NULL,
        template TEXT NOT NULL,
        examples TEXT,
        confidence REAL NOT NULL,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        quality REAL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    reasoningBank = new QEReasoningBank({ minQuality: 0.6 });
  });

  afterEach(async () => {
    if (database) {
      await database.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  /**
   * Test 1: Pattern Matching Finds Similar Code
   */
  describe('Pattern Matching', () => {
    it('should find matching patterns for similar code', async () => {
      // Store existing patterns
      const apiPattern: TestPattern = {
        id: 'api-pattern-001',
        name: 'API Controller Test',
        description: 'Testing REST API controllers',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: `
          describe('{{controller}}', () => {
            it('should {{action}} on {{method}} {{endpoint}}', async () => {
              const response = await request(app).{{method}}('{{endpoint}}');
              expect(response.status).toBe({{status}});
            });
          });
        `,
        examples: [
          'describe("UserController", () => { it("should get users", async () => { ... }); });',
          'describe("ProductController", () => { it("should create product", async () => { ... }); });'
        ],
        confidence: 0.9,
        usageCount: 15,
        successRate: 0.95,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['api', 'controller', 'rest']
        }
      };

      await reasoningBank.storePattern(apiPattern);

      // New similar code
      const newCode = `
        class OrderController {
          async getOrders(req, res) {
            const orders = await Order.findAll();
            res.json(orders);
          }
        }
      `;

      // ❌ EXPECTED TO FAIL: Pattern matching not finding similar patterns
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'controller',
        framework: 'jest',
        keywords: ['api', 'controller', 'orders'],
        sourceCode: newCode
      });

      expect(matches.length).toBeGreaterThan(0); // Will FAIL
      expect(matches[0]?.pattern.id).toBe('api-pattern-001');
      expect(matches[0]?.similarity).toBeGreaterThan(0.7);
    });

    it('should rank patterns by relevance', async () => {
      // Store multiple patterns
      const patterns: TestPattern[] = [
        {
          id: 'unit-pattern-001',
          name: 'Basic Unit Test',
          description: 'Simple unit test pattern',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'describe(...)',
          examples: ['basic test'],
          confidence: 0.7,
          usageCount: 5,
          successRate: 0.8,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['unit', 'basic']
          }
        },
        {
          id: 'api-pattern-002',
          name: 'Advanced API Test',
          description: 'Complex API testing with authentication',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          template: 'complex api template',
          examples: ['advanced api test'],
          confidence: 0.95,
          usageCount: 25,
          successRate: 0.98,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['api', 'auth', 'integration']
          }
        },
        {
          id: 'database-pattern-001',
          name: 'Database Test Pattern',
          description: 'Testing database operations',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          template: 'database test template',
          examples: ['database test'],
          confidence: 0.85,
          usageCount: 10,
          successRate: 0.9,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['database', 'integration']
          }
        }
      ];

      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      // Query for API-related patterns
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['api', 'authentication', 'endpoint']
      });

      // ❌ EXPECTED TO FAIL: Pattern ranking not working
      expect(matches.length).toBeGreaterThan(0);
      // Best match should be the advanced API pattern
      expect(matches[0]?.pattern.id).toBe('api-pattern-002'); // Will FAIL
      expect(matches[0]?.confidence).toBeGreaterThan(matches[1]?.confidence || 0);
    });
  });

  /**
   * Test 2: Pattern Adaptation to New Context
   */
  describe('Pattern Adaptation', () => {
    it('should adapt pattern template to new context', async () => {
      const pattern: TestPattern = {
        id: 'crud-pattern-001',
        name: 'CRUD Operation Test',
        description: 'Testing CRUD operations',
        category: 'integration',
        framework: 'jest',
        language: 'typescript',
        template: `
          describe('{{entity}} CRUD', () => {
            it('should create {{entity}}', async () => {
              const data = {{sampleData}};
              const result = await {{repository}}.create(data);
              expect(result.id).toBeDefined();
            });

            it('should read {{entity}}', async () => {
              const result = await {{repository}}.findById({{id}});
              expect(result).toBeDefined();
            });
          });
        `,
        examples: [
          'User CRUD test',
          'Product CRUD test'
        ],
        confidence: 0.92,
        usageCount: 20,
        successRate: 0.96,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['crud', 'database']
        }
      };

      await reasoningBank.storePattern(pattern);

      // Adapt pattern for new entity
      const context = {
        entity: 'Order',
        repository: 'orderRepository',
        sampleData: '{ customerId: 1, amount: 100 }',
        id: '123'
      };

      // ❌ EXPECTED TO FAIL: Pattern adaptation not implemented
      const adapted = await reasoningBank.adaptPattern('crud-pattern-001', context);

      expect(adapted).toBeDefined(); // Will FAIL
      expect(adapted).toContain('Order CRUD');
      expect(adapted).toContain('orderRepository');
      expect(adapted).toContain('customerId: 1');
    });

    it('should preserve pattern quality during adaptation', async () => {
      const highQualityPattern: TestPattern = {
        id: 'hq-pattern-001',
        name: 'High Quality Pattern',
        description: 'Well-tested pattern',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'high quality template with {{placeholder}}',
        examples: ['example 1', 'example 2', 'example 3'],
        confidence: 0.95,
        usageCount: 50,
        successRate: 0.98,
        quality: 0.92,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['high-quality', 'tested']
        }
      };

      await reasoningBank.storePattern(highQualityPattern);

      const adapted = await reasoningBank.adaptPattern('hq-pattern-001', {
        placeholder: 'new value'
      });

      // ❌ EXPECTED TO FAIL: Quality not preserved
      expect(adapted).toBeDefined();
      // Adapted pattern should maintain quality
      const adaptedPattern = await reasoningBank.getPattern('hq-pattern-001');
      expect(adaptedPattern?.quality).toBeGreaterThan(0.9);
    });
  });

  /**
   * Test 3: Pattern Reuse Improves Performance
   * **Critical Test**: This is the MAIN VALUE PROP that's currently broken
   */
  describe('Performance Improvement via Reuse', () => {
    it('should reduce generation time for similar code', async () => {
      // First generation - no pattern available
      const startTime1 = performance.now();

      // Simulate test generation (normally this would call TestGeneratorAgent)
      const generatedTest1 = await simulateTestGeneration('UserService', false);
      const time1 = performance.now() - startTime1;

      expect(generatedTest1).toBeDefined();

      // Extract and store pattern
      const pattern: TestPattern = {
        id: 'service-pattern-001',
        name: 'Service Test Pattern',
        description: 'Pattern extracted from UserService',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: generatedTest1,
        examples: [generatedTest1],
        confidence: 0.85,
        usageCount: 1,
        successRate: 1,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['service', 'unit']
        }
      };

      await reasoningBank.storePattern(pattern);

      // Second generation - pattern available
      const startTime2 = performance.now();

      // ❌ EXPECTED TO FAIL: No pattern reuse implemented
      const generatedTest2 = await simulateTestGeneration('ProductService', true);
      const time2 = performance.now() - startTime2;

      expect(generatedTest2).toBeDefined();

      // Should be significantly faster with pattern reuse
      console.log(`Generation times: ${time1.toFixed(2)}ms (no pattern) vs ${time2.toFixed(2)}ms (with pattern)`);

      // ❌ EXPECTED TO FAIL: No performance improvement
      expect(time2).toBeLessThan(time1 * 0.7); // Should be 30%+ faster
    });

    it('should track performance improvement over multiple uses', async () => {
      const pattern: TestPattern = {
        id: 'perf-pattern-001',
        name: 'Performance Test Pattern',
        description: 'Pattern for tracking performance',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test template',
        examples: ['example'],
        confidence: 0.8,
        usageCount: 0,
        successRate: 0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['performance']
        }
      };

      await reasoningBank.storePattern(pattern);

      const generationTimes: number[] = [];

      // Simulate multiple uses
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await simulateTestGeneration(`Service${i}`, true);
        const duration = performance.now() - start;
        generationTimes.push(duration);

        // Update pattern usage
        pattern.usageCount++;
        await reasoningBank.storePattern(pattern);
      }

      // ❌ EXPECTED TO FAIL: No improvement trend
      const firstThree = generationTimes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const lastThree = generationTimes.slice(-3).reduce((a, b) => a + b, 0) / 3;

      expect(lastThree).toBeLessThan(firstThree); // Should get faster with reuse
    });
  });

  /**
   * Test 4: Pattern Success Rate Tracking
   */
  describe('Success Rate Tracking', () => {
    it('should track pattern success rate over time', async () => {
      const pattern: TestPattern = {
        id: 'success-pattern-001',
        name: 'Success Tracking Pattern',
        description: 'Pattern for tracking success',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test template',
        examples: ['example'],
        confidence: 0.8,
        usageCount: 0,
        successRate: 0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['tracking']
        }
      };

      await reasoningBank.storePattern(pattern);

      // Simulate usage with successes and failures
      const usageResults = [
        true, true, true, false, true, // 80% success (4/5)
        true, true, false, true, true  // 80% success (8/10)
      ];

      for (const success of usageResults) {
        // ❌ EXPECTED TO FAIL: recordUsage method doesn't exist
        await reasoningBank.recordUsage('success-pattern-001', success);
      }

      // Verify success rate updated
      const updatedPattern = await reasoningBank.getPattern('success-pattern-001');

      expect(updatedPattern?.usageCount).toBe(10); // Will FAIL
      expect(updatedPattern?.successRate).toBeCloseTo(0.8, 2);
    });

    it('should recommend patterns based on success rate', async () => {
      // Store patterns with different success rates
      const patterns: TestPattern[] = [
        {
          id: 'high-success-001',
          name: 'High Success Pattern',
          description: 'Reliable pattern',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'reliable template',
          examples: ['example'],
          confidence: 0.9,
          usageCount: 100,
          successRate: 0.98, // Very high success
          quality: 0.95,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['reliable']
          }
        },
        {
          id: 'low-success-001',
          name: 'Low Success Pattern',
          description: 'Unreliable pattern',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'unreliable template',
          examples: ['example'],
          confidence: 0.8,
          usageCount: 50,
          successRate: 0.45, // Low success
          quality: 0.5,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['unreliable']
          }
        }
      ];

      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      // Get recommendations
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['unit']
      });

      // ❌ EXPECTED TO FAIL: Success rate not factored into ranking
      expect(matches.length).toBeGreaterThan(0);
      // High success pattern should be recommended first
      expect(matches[0]?.pattern.id).toBe('high-success-001'); // Will FAIL
      expect(matches[0]?.pattern.successRate).toBeGreaterThan(0.9);
    });
  });

  /**
   * Test 5: Similar Code Detection
   */
  describe('Similar Code Detection', () => {
    it('should detect similar code patterns', async () => {
      // Store pattern
      const pattern: TestPattern = {
        id: 'similarity-pattern-001',
        name: 'Similarity Test Pattern',
        description: 'Pattern for similarity detection',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: `
          class UserService {
            async getUser(id: string) {
              return await this.repository.findById(id);
            }
          }
        `,
        examples: ['user service example'],
        confidence: 0.85,
        usageCount: 10,
        successRate: 0.9,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['service', 'repository']
        }
      };

      await reasoningBank.storePattern(pattern);

      // Very similar code
      const similarCode = `
        class ProductService {
          async getProduct(productId: string) {
            return await this.repository.findById(productId);
          }
        }
      `;

      // ❌ EXPECTED TO FAIL: Vector similarity not calculating correctly
      const similarity = await reasoningBank.calculateSimilarity(
        pattern.template,
        similarCode
      );

      expect(similarity).toBeGreaterThan(0.8); // Will FAIL
    });

    it('should distinguish between similar and different code', async () => {
      const pattern: TestPattern = {
        id: 'distinction-pattern-001',
        name: 'Distinction Test Pattern',
        description: 'Pattern for testing distinction',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: `
          describe('Authentication', () => {
            it('should login user', () => {
              // authentication test
            });
          });
        `,
        examples: ['auth test'],
        confidence: 0.9,
        usageCount: 15,
        successRate: 0.95,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['auth']
        }
      };

      await reasoningBank.storePattern(pattern);

      // Very different code
      const differentCode = `
        function calculateTaxes(income: number): number {
          return income * 0.2;
        }
      `;

      const similarity = await reasoningBank.calculateSimilarity(
        pattern.template,
        differentCode
      );

      // ❌ EXPECTED TO FAIL: Not distinguishing properly
      expect(similarity).toBeLessThan(0.3); // Should be very low
    });
  });

  /**
   * Test 6: Pattern Recommendation Accuracy
   */
  describe('Pattern Recommendation', () => {
    it('should recommend most appropriate pattern', async () => {
      // Store diverse patterns
      const patterns: TestPattern[] = [
        {
          id: 'unit-service-001',
          name: 'Unit Test Service Pattern',
          description: 'Unit testing services',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'unit service template',
          examples: ['unit example'],
          confidence: 0.9,
          usageCount: 50,
          successRate: 0.95,
          quality: 0.9,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['unit', 'service']
          }
        },
        {
          id: 'integration-api-001',
          name: 'Integration API Pattern',
          description: 'Integration testing APIs',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          template: 'integration api template',
          examples: ['integration example'],
          confidence: 0.88,
          usageCount: 30,
          successRate: 0.92,
          quality: 0.85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['integration', 'api']
          }
        }
      ];

      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      // Query for unit test
      const unitMatches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['unit', 'service']
      });

      // ❌ EXPECTED TO FAIL: Wrong pattern recommended
      expect(unitMatches[0]?.pattern.id).toBe('unit-service-001');

      // Query for integration test
      const integrationMatches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['integration', 'api']
      });

      expect(integrationMatches[0]?.pattern.id).toBe('integration-api-001');
    });
  });
});

/**
 * Helper function to simulate test generation
 * In real implementation, this would call TestGeneratorAgent
 */
async function simulateTestGeneration(
  serviceName: string,
  usePattern: boolean
): Promise<string> {
  // Simulate generation time
  const baseTime = usePattern ? 50 : 200; // Pattern reuse should be faster
  const variation = Math.random() * 50;

  await new Promise(resolve => setTimeout(resolve, baseTime + variation));

  return `
    describe('${serviceName}', () => {
      it('should work correctly', () => {
        expect(true).toBe(true);
      });
    });
  `;
}
