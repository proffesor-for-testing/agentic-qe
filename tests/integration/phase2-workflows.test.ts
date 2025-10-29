/**
 * Phase 2 End-to-End Workflow Integration Tests
 *
 * Tests complete workflows across all Phase 2 components:
 * - Generate test → Extract pattern → Store in ReasoningBank → Reuse in new project
 * - Execute test → Track performance → Learn from outcome → Improve strategy
 * - Detect flaky test → Analyze with ML → Apply fix → Validate improvement
 *
 * @module tests/integration/phase2-workflows
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { QEReasoningBank } from '@reasoning/QEReasoningBank';
import { LearningEngine } from '@learning/LearningEngine';
import { PatternExtractor } from '@reasoning/PatternExtractor';
import { FlakyTestDetector } from '@learning/FlakyTestDetector';
import * as fs from 'fs-extra';
import * as path from 'path';

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, '../fixtures/phase2-test-data');
const TEST_OUTPUT_DIR = path.join(__dirname, '../.tmp/phase2-workflows');

describe('Phase 2 End-to-End Workflows', () => {
  let reasoningBank: QEReasoningBank;
  let learningEngine: LearningEngine;
  let patternExtractor: PatternExtractor;
  let flakyDetector: FlakyTestDetector;

  beforeAll(async () => {
    // Ensure test directories exist
    await fs.ensureDir(TEST_DATA_DIR);
    await fs.ensureDir(TEST_OUTPUT_DIR);
  });

  beforeEach(() => {
    reasoningBank = new QEReasoningBank();
    learningEngine = new LearningEngine();
    patternExtractor = new PatternExtractor();
    flakyDetector = new FlakyTestDetector();
  });

  afterEach(async () => {
    // Clean up
    if (learningEngine) learningEngine.clear();
    // Don't delete test output for debugging
  });

  afterAll(async () => {
    // Optional: Clean up test output
    // await fs.remove(TEST_OUTPUT_DIR);
  });

  // ===========================================================================
  // Workflow 1: Test Generation → Pattern Extraction → ReasoningBank → Reuse
  // ===========================================================================

  describe('Workflow 1: Generate → Extract → Store → Reuse', () => {
    it('should complete full test generation and pattern reuse workflow', async () => {
      // Step 1: Create sample source code
      const sourceCode = `
        export class UserService {
          private users: Map<string, User> = new Map();

          async createUser(data: CreateUserDTO): Promise<User> {
            if (!data.email || !data.name) {
              throw new Error('Email and name are required');
            }

            if (this.users.has(data.email)) {
              throw new Error('User already exists');
            }

            const user: User = {
              id: generateId(),
              email: data.email,
              name: data.name,
              createdAt: new Date()
            };

            this.users.set(user.email, user);
            return user;
          }

          async getUser(email: string): Promise<User | null> {
            return this.users.get(email) || null;
          }

          async deleteUser(email: string): Promise<boolean> {
            return this.users.delete(email);
          }
        }
      `;

      // Step 2: Extract patterns from source code
      const patterns = await patternExtractor.extractPatterns(sourceCode, {
        framework: 'jest',
        language: 'typescript'
      });

      expect(patterns).toBeDefined();
      expect(patterns.length).toBeGreaterThan(0);

      // Step 3: Store patterns in ReasoningBank
      const storedPatternIds: string[] = [];
      for (const pattern of patterns) {
        const patternId = await reasoningBank.storePattern({
          id: `pattern-${Date.now()}-${Math.random()}`,
          name: pattern.name,
          category: pattern.category,
          framework: 'jest',
          language: 'typescript',
          description: pattern.description,
          template: pattern.template || '',
          applicability: {
            complexity: pattern.complexity || 'medium',
            context: pattern.context || [],
            constraints: pattern.constraints || []
          },
          metrics: {
            successRate: 0.8,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: pattern.tags || [],
          metadata: {
            source: 'pattern-extraction',
            version: '1.0.0'
          }
        });

        storedPatternIds.push(patternId);
      }

      expect(storedPatternIds.length).toBeGreaterThan(0);

      // Step 4: Retrieve patterns for new project
      const matchingPatterns = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        keywords: ['user', 'create', 'crud']
      });

      expect(matchingPatterns.length).toBeGreaterThan(0);
      expect(matchingPatterns[0].pattern.framework).toBe('jest');

      // Step 5: Verify pattern reusability
      const firstPattern = matchingPatterns[0];
      expect(firstPattern.pattern.template).toBeDefined();
      expect(firstPattern.applicability).toBeGreaterThan(0);
      expect(firstPattern.reasoning).toBeDefined();
    });

    it('should extract patterns from multiple test files', async () => {
      const testFiles = [
        {
          path: 'user.test.ts',
          code: `
            describe('UserService', () => {
              it('should create user', () => {
                const service = new UserService();
                const user = await service.createUser({ email: 'test@example.com', name: 'Test' });
                expect(user.id).toBeDefined();
              });
            });
          `
        },
        {
          path: 'auth.test.ts',
          code: `
            describe('AuthService', () => {
              it('should authenticate user', async () => {
                const service = new AuthService();
                const token = await service.login('user@example.com', 'password');
                expect(token).toBeDefined();
              });
            });
          `
        }
      ];

      const allPatterns = [];
      for (const file of testFiles) {
        const patterns = await patternExtractor.extractPatterns(file.code, {
          framework: 'jest',
          language: 'typescript',
          filePath: file.path
        });
        allPatterns.push(...patterns);
      }

      expect(allPatterns.length).toBeGreaterThan(0);

      // Store all patterns
      for (const pattern of allPatterns) {
        await reasoningBank.storePattern({
          id: `pattern-${Date.now()}-${Math.random()}`,
          name: pattern.name,
          category: pattern.category,
          framework: 'jest',
          language: 'typescript',
          description: pattern.description,
          template: pattern.template || '',
          applicability: {
            complexity: 'medium',
            context: [],
            constraints: []
          },
          metrics: {
            successRate: 0.8,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: pattern.tags || [],
          metadata: { source: 'multi-file-extraction' }
        });
      }

      const stats = await reasoningBank.getStatistics();
      expect(stats.totalPatterns).toBeGreaterThanOrEqual(allPatterns.length);
    });

    it('should update pattern metrics after successful reuse', async () => {
      // Store initial pattern
      const patternId = await reasoningBank.storePattern({
        id: 'pattern-test-001',
        name: 'User CRUD Test Pattern',
        category: 'integration',
        framework: 'jest',
        language: 'typescript',
        description: 'Pattern for testing CRUD operations',
        template: 'describe("CRUD", () => { ... })',
        applicability: {
          complexity: 'medium',
          context: ['database', 'api'],
          constraints: []
        },
        metrics: {
          successRate: 0.8,
          usageCount: 0,
          averageQuality: 0,
          lastUsed: new Date()
        },
        tags: ['crud', 'database'],
        metadata: { source: 'manual' }
      });

      // Simulate successful reuse
      await reasoningBank.updateMetrics(patternId, true, 0.95);

      // Verify metrics updated
      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern).toBeDefined();
      expect(pattern!.metrics.usageCount).toBe(1);
      expect(pattern!.metrics.successRate).toBeGreaterThan(0.8);
      expect(pattern!.metrics.averageQuality).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Workflow 2: Execute → Track → Learn → Improve
  // ===========================================================================

  describe('Workflow 2: Execute → Track → Learn → Improve', () => {
    it('should complete execution, tracking, and learning cycle', async () => {
      // Step 1: Simulate test execution
      const testResults = [
        {
          id: 'test-001',
          name: 'User creation test',
          outcome: 'success' as const,
          executionTime: 150,
          coverage: 0.92,
          edgeCasesCaught: 8
        },
        {
          id: 'test-002',
          name: 'User validation test',
          outcome: 'success' as const,
          executionTime: 120,
          coverage: 0.88,
          edgeCasesCaught: 6
        },
        {
          id: 'test-003',
          name: 'User update test',
          outcome: 'flaky' as const,
          executionTime: 200,
          coverage: 0.75,
          edgeCasesCaught: 4
        }
      ];

      // Step 2: Record outcomes in learning engine
      for (const result of testResults) {
        await learningEngine.recordOutcome({
          id: `record-${result.id}`,
          timestamp: new Date(),
          testId: result.id,
          testName: result.name,
          outcome: result.outcome,
          executionTime: result.executionTime,
          coverage: result.coverage,
          edgeCasesCaught: result.edgeCasesCaught,
          feedback: {
            quality: result.coverage, // Use coverage as quality proxy
            relevance: 0.9
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 3,
            linesOfCode: 150
          }
        });
      }

      // Step 3: Analyze trends
      const insights = await learningEngine.analyzeTrends();
      expect(insights).toBeDefined();

      // Step 4: Apply learning to improve future tests
      const recommendations = await learningEngine.applyLearning({
        framework: 'jest',
        language: 'typescript',
        complexity: 3
      });

      expect(recommendations.recommendations).toBeDefined();
      expect(recommendations.recommendations.length).toBeGreaterThan(0);
      expect(recommendations.expectedQuality).toBeGreaterThan(0);
    });

    it('should track quality improvement over 30 days', async () => {
      // Simulate 30 days of test execution with improving metrics
      const daysToSimulate = 30;
      const recordsPerDay = 3;

      for (let day = 0; day < daysToSimulate; day++) {
        for (let i = 0; i < recordsPerDay; i++) {
          const improvementFactor = day / daysToSimulate; // 0 to 1 over time

          await learningEngine.recordOutcome({
            id: `rec-day${day}-${i}`,
            timestamp: new Date(Date.now() - (daysToSimulate - day) * 24 * 60 * 60 * 1000),
            testId: `test-${day}-${i}`,
            testName: `Test Day ${day} #${i}`,
            outcome: day < 25 || i % 3 !== 0 ? 'success' : 'flaky',
            executionTime: Math.max(50, 200 - day * 5),
            coverage: 0.7 + improvementFactor * 0.25,
            edgeCasesCaught: 3 + Math.floor(improvementFactor * 7),
            feedback: {
              quality: 0.6 + improvementFactor * 0.3,
              relevance: 0.85
            },
            metadata: {
              framework: 'jest',
              language: 'typescript',
              complexity: 2 + (i % 3),
              linesOfCode: 100 + day * 2
            }
          });
        }
      }

      // Get improvement metrics
      const metrics = await learningEngine.getImprovementMetrics(30);

      expect(metrics.testQuality.improvement).toBeGreaterThan(0.1); // 10%+ improvement
      expect(metrics.edgeCaseCoverage.improvement).toBeGreaterThan(0.2); // 20%+ improvement
      expect(metrics.executionEfficiency.improvement).toBeGreaterThan(0); // Some improvement
    });

    it('should generate actionable recommendations based on historical data', async () => {
      // Seed with diverse test outcomes
      const testScenarios = [
        { quality: 0.95, coverage: 0.92, edgeCases: 10, outcome: 'success' as const },
        { quality: 0.88, coverage: 0.85, edgeCases: 7, outcome: 'success' as const },
        { quality: 0.65, coverage: 0.70, edgeCases: 3, outcome: 'failure' as const },
        { quality: 0.75, coverage: 0.78, edgeCases: 5, outcome: 'flaky' as const }
      ];

      for (let i = 0; i < 15; i++) {
        const scenario = testScenarios[i % testScenarios.length];
        await learningEngine.recordOutcome({
          id: `rec-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: scenario.outcome,
          executionTime: 100 + i * 10,
          coverage: scenario.coverage,
          edgeCasesCaught: scenario.edgeCases,
          feedback: {
            quality: scenario.quality,
            relevance: 0.9
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
      }

      const result = await learningEngine.applyLearning({
        framework: 'jest',
        language: 'typescript',
        complexity: 2
      });

      expect(result.recommendations).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.5);

      // Should have actionable recommendations
      const hasActionableRecommendation = result.recommendations.some(r =>
        r.includes('quality') || r.includes('edge case') || r.includes('flakiness')
      );
      expect(hasActionableRecommendation).toBe(true);
    });
  });

  // ===========================================================================
  // Workflow 3: Detect Flaky → Analyze → Fix → Validate
  // ===========================================================================

  describe('Workflow 3: Detect Flaky → Analyze → Fix → Validate', () => {
    it('should detect flaky test and provide fix recommendations', async () => {
      // Step 1: Simulate flaky test executions
      const flakyTestResults = [
        { testId: 'flaky-001', passed: true, duration: 150 },
        { testId: 'flaky-001', passed: false, duration: 155 },
        { testId: 'flaky-001', passed: true, duration: 148 },
        { testId: 'flaky-001', passed: false, duration: 152 },
        { testId: 'flaky-001', passed: true, duration: 151 }
      ];

      for (const result of flakyTestResults) {
        await flakyDetector.recordTestExecution({
          testId: result.testId,
          testName: 'User authentication test',
          passed: result.passed,
          duration: result.duration,
          timestamp: new Date(),
          metadata: {
            framework: 'jest',
            filePath: 'auth.test.ts',
            suite: 'AuthService'
          }
        });
      }

      // Step 2: Detect flaky tests
      const flakyTests = await flakyDetector.detectFlakyTests({
        minExecutions: 3,
        flakinessThreshold: 0.3 // 30% failure rate
      });

      expect(flakyTests.length).toBeGreaterThan(0);
      expect(flakyTests[0].testId).toBe('flaky-001');
      expect(flakyTests[0].flakinessScore).toBeGreaterThan(0.3);

      // Step 3: Get fix recommendations
      const recommendations = await flakyDetector.getFixRecommendations(flakyTests[0].testId);

      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);

      // Should suggest common fixes
      const hasPracticalFix = recommendations.some(r =>
        r.includes('timing') || r.includes('retry') || r.includes('isolation') || r.includes('async')
      );
      expect(hasPracticalFix).toBe(true);
    });

    it('should integrate flaky detection with learning engine', async () => {
      // Create flaky test pattern
      for (let i = 0; i < 10; i++) {
        const isSuccess = i % 3 !== 0; // 66% success rate (flaky)

        await learningEngine.recordOutcome({
          id: `flaky-rec-${i}`,
          timestamp: new Date(),
          testId: 'integration-test-001',
          testName: 'Integration Test with External API',
          outcome: isSuccess ? 'success' : 'flaky',
          executionTime: 200 + Math.random() * 100,
          coverage: 0.85,
          edgeCasesCaught: 5,
          feedback: {
            quality: isSuccess ? 0.8 : 0.6,
            relevance: 0.9
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 4,
            linesOfCode: 200
          }
        });
      }

      // Get insights from learning engine
      const insights = await learningEngine.analyzeTrends();

      // Check for flakiness-related insights or recommendations
      const stats = learningEngine.getStatistics();
      expect(stats.flakinessRate).toBeGreaterThan(0.2); // Should detect high flakiness
    });

    it('should validate fix effectiveness after applying recommendations', async () => {
      const testId = 'flaky-before-fix';

      // Before fix: high flakiness
      for (let i = 0; i < 10; i++) {
        await flakyDetector.recordTestExecution({
          testId,
          testName: 'Database transaction test',
          passed: i % 2 === 0,
          duration: 150,
          timestamp: new Date(),
          metadata: {
            framework: 'jest',
            filePath: 'db.test.ts',
            suite: 'DatabaseService'
          }
        });
      }

      const beforeFix = await flakyDetector.detectFlakyTests({ minExecutions: 5 });
      expect(beforeFix.length).toBeGreaterThan(0);

      // Simulate fix applied (reset detector)
      flakyDetector = new FlakyTestDetector();

      // After fix: consistent passing
      for (let i = 0; i < 10; i++) {
        await flakyDetector.recordTestExecution({
          testId,
          testName: 'Database transaction test',
          passed: true, // All passing now
          duration: 150,
          timestamp: new Date(),
          metadata: {
            framework: 'jest',
            filePath: 'db.test.ts',
            suite: 'DatabaseService'
          }
        });
      }

      const afterFix = await flakyDetector.detectFlakyTests({ minExecutions: 5 });
      expect(afterFix.length).toBe(0); // No more flaky tests
    });
  });

  // ===========================================================================
  // Cross-Component Integration
  // ===========================================================================

  describe('Cross-Component Integration', () => {
    it('should integrate pattern extraction with learning feedback', async () => {
      // Extract pattern
      const code = `
        export class PaymentService {
          async processPayment(amount: number): Promise<Transaction> {
            if (amount <= 0) throw new Error('Invalid amount');
            // Process payment logic
            return { id: 'tx-001', amount, status: 'completed' };
          }
        }
      `;

      const patterns = await patternExtractor.extractPatterns(code, {
        framework: 'jest',
        language: 'typescript'
      });

      // Store in reasoning bank
      const patternId = await reasoningBank.storePattern({
        id: `pattern-${Date.now()}`,
        name: patterns[0]?.name || 'Payment Service Pattern',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        description: 'Payment processing test pattern',
        template: '...',
        applicability: { complexity: 'medium', context: [], constraints: [] },
        metrics: {
          successRate: 0.8,
          usageCount: 0,
          averageQuality: 0,
          lastUsed: new Date()
        },
        tags: ['payment', 'transaction'],
        metadata: { source: 'extraction' }
      });

      // Simulate using pattern and learning from it
      await reasoningBank.updateMetrics(patternId, true, 0.95);

      await learningEngine.recordOutcome({
        id: 'learn-001',
        timestamp: new Date(),
        testId: 'payment-test-001',
        testName: 'Payment processing test',
        outcome: 'success',
        executionTime: 100,
        coverage: 0.95,
        edgeCasesCaught: 7,
        feedback: {
          quality: 0.95,
          relevance: 0.9
        },
        metadata: {
          framework: 'jest',
          language: 'typescript',
          complexity: 3,
          linesOfCode: 120,
          patternId: patternId
        }
      });

      // Verify integration
      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern!.metrics.averageQuality).toBeGreaterThan(0);

      const stats = learningEngine.getStatistics();
      expect(stats.averageQuality).toBeGreaterThan(0.9);
    });

    it('should use learning insights to prioritize pattern selection', async () => {
      // Store multiple patterns
      const patterns = [
        {
          id: 'pattern-high-quality',
          name: 'High Quality Pattern',
          successRate: 0.95,
          usageCount: 100
        },
        {
          id: 'pattern-medium-quality',
          name: 'Medium Quality Pattern',
          successRate: 0.75,
          usageCount: 50
        },
        {
          id: 'pattern-low-quality',
          name: 'Low Quality Pattern',
          successRate: 0.50,
          usageCount: 10
        }
      ];

      for (const p of patterns) {
        await reasoningBank.storePattern({
          id: p.id,
          name: p.name,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: p.name,
          template: '...',
          applicability: { complexity: 'medium', context: [], constraints: [] },
          metrics: {
            successRate: p.successRate,
            usageCount: p.usageCount,
            averageQuality: p.successRate,
            lastUsed: new Date()
          },
          tags: ['test'],
          metadata: {}
        });
      }

      // Find matching patterns
      const matches = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        limit: 10
      });

      // Should prioritize high-quality patterns
      expect(matches[0].pattern.id).toBe('pattern-high-quality');
      expect(matches[0].applicability).toBeGreaterThan(matches[1].applicability);
    });
  });

  // ===========================================================================
  // Real-World Scenario Tests
  // ===========================================================================

  describe('Real-World Scenarios', () => {
    it('should handle complete test generation lifecycle for REST API', async () => {
      // Scenario: Testing a REST API endpoint

      // 1. Extract patterns from existing API tests
      const existingTests = `
        describe('API Endpoints', () => {
          it('GET /users should return users', async () => {
            const response = await request(app).get('/users');
            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Array);
          });

          it('POST /users should create user', async () => {
            const response = await request(app)
              .post('/users')
              .send({ name: 'John', email: 'john@example.com' });
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
          });
        });
      `;

      const patterns = await patternExtractor.extractPatterns(existingTests, {
        framework: 'jest',
        language: 'typescript'
      });

      // 2. Store patterns
      for (const pattern of patterns) {
        await reasoningBank.storePattern({
          id: `api-pattern-${Date.now()}-${Math.random()}`,
          name: pattern.name,
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          description: pattern.description,
          template: pattern.template || '',
          applicability: { complexity: 'medium', context: ['api', 'rest'], constraints: [] },
          metrics: {
            successRate: 0.9,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: ['api', 'rest', 'http'],
          metadata: { source: 'api-tests' }
        });
      }

      // 3. Reuse patterns for new endpoint
      const apiPatterns = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        tags: ['api'],
        limit: 5
      });

      expect(apiPatterns.length).toBeGreaterThan(0);

      // 4. Track test execution and learn
      await learningEngine.recordOutcome({
        id: 'api-test-outcome',
        timestamp: new Date(),
        testId: 'new-api-test',
        testName: 'GET /products endpoint test',
        outcome: 'success',
        executionTime: 250,
        coverage: 0.88,
        edgeCasesCaught: 6,
        feedback: {
          quality: 0.88,
          relevance: 0.95
        },
        metadata: {
          framework: 'jest',
          language: 'typescript',
          complexity: 3,
          linesOfCode: 150
        }
      });

      const stats = learningEngine.getStatistics();
      expect(stats.totalRecords).toBeGreaterThan(0);
    });

    it('should handle microservices integration testing workflow', async () => {
      // Scenario: Testing microservices with multiple dependencies

      // Simulate tests for 3 microservices
      const services = ['auth', 'user', 'payment'];

      for (const service of services) {
        // Record successful integration tests
        for (let i = 0; i < 5; i++) {
          await learningEngine.recordOutcome({
            id: `${service}-test-${i}`,
            timestamp: new Date(),
            testId: `${service}-integration-${i}`,
            testName: `${service} service integration test ${i}`,
            outcome: i === 4 ? 'flaky' : 'success', // Last test is flaky
            executionTime: 300 + Math.random() * 100,
            coverage: 0.85 + Math.random() * 0.1,
            edgeCasesCaught: 5 + Math.floor(Math.random() * 3),
            feedback: {
              quality: 0.8 + Math.random() * 0.15,
              relevance: 0.9
            },
            metadata: {
              framework: 'jest',
              language: 'typescript',
              complexity: 4,
              linesOfCode: 200,
              service: service
            }
          });
        }
      }

      // Analyze across all services
      const insights = await learningEngine.analyzeTrends();
      const stats = learningEngine.getStatistics();

      expect(stats.totalRecords).toBe(15); // 3 services × 5 tests
      expect(stats.flakinessRate).toBeGreaterThan(0); // Some flaky tests detected
    });
  });
});
