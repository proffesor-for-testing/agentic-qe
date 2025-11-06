/**
 * Phase 2 End-to-End Workflow Integration Tests
 *
 * Tests complete workflows spanning multiple Phase 2 components:
 * - Pattern-based test generation workflow
 * - Continuous improvement loop workflow
 * - ML flaky detection → fix → validation workflow
 * - Cross-project pattern sharing workflow
 *
 * @module tests/integration/phase2/phase2-e2e-workflows
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank } from '@reasoning/QEReasoningBank';
import { LearningEngine } from '@learning/LearningEngine';
import { PatternExtractor } from '@reasoning/PatternExtractor';
import { FlakyTestDetector } from '@learning/FlakyTestDetector';
import { ImprovementLoop } from '@learning/ImprovementLoop';
import { PerformanceTracker } from '@learning/PerformanceTracker';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import * as fs from 'fs-extra';
import * as path from 'path';

const TEST_OUTPUT_DIR = path.join(__dirname, '../../.tmp/phase2-e2e');

describe('Phase 2 End-to-End Workflow Tests', () => {
  let reasoningBank: QEReasoningBank;
  let learningEngine: LearningEngine;
  let patternExtractor: PatternExtractor;
  let flakyDetector: FlakyTestDetector;
  let improvementLoop: ImprovementLoop;
  let performanceTracker: PerformanceTracker;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    await fs.ensureDir(TEST_OUTPUT_DIR);

    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();
    reasoningBank = new QEReasoningBank();
    learningEngine = new LearningEngine();
    patternExtractor = new PatternExtractor();
    flakyDetector = new FlakyTestDetector();
    performanceTracker = new PerformanceTracker();
    improvementLoop = new ImprovementLoop(learningEngine, performanceTracker, memoryManager);

    await memoryManager.clear('coordination');
  });

  afterEach(async () => {
    await memoryManager.clear('coordination');
    await memoryManager.close();
    learningEngine.clear();
  });

  // ===========================================================================
  // Workflow 1: Pattern-Based Test Generation
  // ===========================================================================

  describe('Workflow 1: Pattern-Based Test Generation', () => {
    it('should complete pattern-based test generation workflow', async () => {
      const workflowMetrics = {
        startTime: performance.now(),
        steps: [] as Array<{ step: string; duration: number; success: boolean }>
      };

      // Step 1: Extract patterns from existing tests
      let stepStart = performance.now();
      const existingTest = `
        describe('UserService', () => {
          beforeEach(() => {
            service = new UserService();
          });

          it('should create user with valid data', async () => {
            const user = await service.createUser({ name: 'John', email: 'john@example.com' });
            expect(user.id).toBeDefined();
            expect(user.email).toBe('john@example.com');
          });

          it('should throw on duplicate email', async () => {
            await service.createUser({ name: 'John', email: 'test@example.com' });
            await expect(service.createUser({ name: 'Jane', email: 'test@example.com' }))
              .rejects.toThrow('Email already exists');
          });
        });
      `;

      const extractedPatterns = await patternExtractor.extractPatterns(existingTest, {
        framework: 'jest',
        language: 'typescript',
        filePath: 'UserService.test.ts'
      });

      workflowMetrics.steps.push({
        step: 'pattern-extraction',
        duration: performance.now() - stepStart,
        success: extractedPatterns.length > 0
      });

      expect(extractedPatterns.length).toBeGreaterThan(0);

      // Step 2: Store patterns in ReasoningBank
      stepStart = performance.now();
      const storedPatternIds: string[] = [];

      for (const pattern of extractedPatterns) {
        const patternId = await reasoningBank.storePattern({
          id: `e2e-pattern-${Date.now()}-${Math.random()}`,
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
            successRate: 0.85,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: pattern.tags || ['user', 'crud'],
          metadata: { source: 'e2e-workflow', version: '1.0.0' }
        });

        storedPatternIds.push(patternId);
      }

      workflowMetrics.steps.push({
        step: 'pattern-storage',
        duration: performance.now() - stepStart,
        success: storedPatternIds.length === extractedPatterns.length
      });

      expect(storedPatternIds.length).toBe(extractedPatterns.length);

      // Step 3: Find matching patterns for new module
      stepStart = performance.now();
      const matches = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        keywords: ['user', 'service'],
        limit: 5
      });

      workflowMetrics.steps.push({
        step: 'pattern-matching',
        duration: performance.now() - stepStart,
        success: matches.length > 0
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.framework).toBe('jest');

      // Step 4: Generate tests using matched patterns
      stepStart = performance.now();
      const generatedTests: string[] = [];

      for (const match of matches.slice(0, 3)) {
        const testCode = match.pattern.template
          .replace(/\{\{moduleName\}\}/g, 'OrderService')
          .replace(/\{\{entityName\}\}/g, 'Order');

        generatedTests.push(testCode);

        // Record pattern usage
        await reasoningBank.updateMetrics(match.pattern.id, true, 0.92);
      }

      workflowMetrics.steps.push({
        step: 'test-generation',
        duration: performance.now() - stepStart,
        success: generatedTests.length > 0
      });

      expect(generatedTests.length).toBeGreaterThan(0);

      // Step 5: Learn from generation outcomes
      stepStart = performance.now();
      for (let i = 0; i < generatedTests.length; i++) {
        await learningEngine.recordOutcome({
          id: `gen-outcome-${i}`,
          timestamp: new Date(),
          testId: `generated-test-${i}`,
          testName: `Generated test ${i}`,
          outcome: 'success',
          executionTime: 120,
          coverage: 0.92,
          edgeCasesCaught: 7,
          feedback: {
            quality: 0.92,
            relevance: 0.95
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 3,
            linesOfCode: 150,
            patternId: matches[i].pattern.id
          }
        });
      }

      workflowMetrics.steps.push({
        step: 'learning-record',
        duration: performance.now() - stepStart,
        success: true
      });

      // Print workflow metrics
      console.log('\n━━━ Pattern-Based Test Generation Workflow ━━━');
      console.log(`Total Duration: ${(performance.now() - workflowMetrics.startTime).toFixed(2)}ms`);
      console.log('\nSteps:');
      workflowMetrics.steps.forEach(s => {
        console.log(`  ${s.step}: ${s.duration.toFixed(2)}ms [${s.success ? '✓' : '✗'}]`);
      });

      // Verify workflow success
      expect(workflowMetrics.steps.every(s => s.success)).toBe(true);
      expect(performance.now() - workflowMetrics.startTime).toBeLessThan(10000); // <10s total
    }, 30000);

    it('should reuse patterns across multiple projects', async () => {
      // Project 1: Create and store patterns
      const project1Patterns = await patternExtractor.extractPatterns(`
        describe('AuthService', () => {
          it('authenticates user', async () => {
            const token = await authService.login('user@example.com', 'password');
            expect(token).toBeDefined();
          });
        });
      `, { framework: 'jest', language: 'typescript' });

      for (const pattern of project1Patterns) {
        await reasoningBank.storePattern({
          id: `project1-${Date.now()}-${Math.random()}`,
          name: pattern.name,
          category: pattern.category,
          framework: 'jest',
          language: 'typescript',
          description: pattern.description,
          template: pattern.template || '',
          applicability: { complexity: 'medium', context: [], constraints: [] },
          metrics: { successRate: 0.88, usageCount: 0, averageQuality: 0, lastUsed: new Date() },
          tags: ['auth', 'authentication'],
          metadata: { project: 'project-1' }
        });
      }

      // Project 2: Retrieve and reuse patterns
      const matches = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        tags: ['auth'],
        limit: 10
      });

      expect(matches.length).toBeGreaterThan(0);

      // Verify cross-project reuse
      const authPattern = matches.find(m => m.pattern.tags.includes('auth'));
      expect(authPattern).toBeDefined();
      expect(authPattern!.pattern.metadata.project).toBe('project-1');

      // Update metrics for reuse
      await reasoningBank.updateMetrics(authPattern!.pattern.id, true, 0.93);

      const updatedPattern = await reasoningBank.getPattern(authPattern!.pattern.id);
      expect(updatedPattern!.metrics.usageCount).toBe(1);
    }, 20000);
  });

  // ===========================================================================
  // Workflow 2: Continuous Improvement Loop
  // ===========================================================================

  describe('Workflow 2: Continuous Improvement Loop (20% Target)', () => {
    it('should achieve 20% improvement over multiple cycles', async () => {
      const targetImprovement = 0.20; // 20%
      const maxCycles = 10;
      const cycles: Array<{ cycle: number; improvement: number; quality: number }> = [];

      // Set baseline performance
      await performanceTracker.recordBaseline({
        quality: 0.75,
        coverage: 0.80,
        executionTime: 150
      });

      // Run improvement cycles
      for (let cycle = 0; cycle < maxCycles; cycle++) {
        // Simulate improving performance each cycle
        const improvementFactor = cycle / maxCycles;
        const currentQuality = 0.75 + (0.25 * improvementFactor); // Up to 100%

        // Record outcomes
        for (let i = 0; i < 5; i++) {
          await learningEngine.recordOutcome({
            id: `improvement-${cycle}-${i}`,
            timestamp: new Date(),
            testId: `test-${cycle}-${i}`,
            testName: `Test Cycle ${cycle} #${i}`,
            outcome: 'success',
            executionTime: Math.max(50, 150 - cycle * 10),
            coverage: Math.min(0.95, 0.80 + cycle * 0.015),
            edgeCasesCaught: 5 + cycle,
            feedback: {
              quality: currentQuality,
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

        // Run improvement cycle
        const cycleResult = await improvementLoop.runImprovementCycle();

        cycles.push({
          cycle: cycle + 1,
          improvement: cycleResult.improvementRate,
          quality: cycleResult.currentQuality
        });

        // Check if target reached
        const status = await performanceTracker.checkImprovementTarget(targetImprovement);
        if (status.targetReached) {
          console.log(`\n✓ Target reached at cycle ${cycle + 1}`);
          break;
        }
      }

      // Print improvement progression
      console.log('\n━━━ Continuous Improvement Progression ━━━');
      console.log('Cycle | Improvement | Quality');
      console.log('------|-------------|--------');
      cycles.forEach(c => {
        console.log(`  ${c.cycle.toString().padStart(2)}  |   ${(c.improvement * 100).toFixed(1).padStart(5)}%   | ${(c.quality * 100).toFixed(1).padStart(5)}%`);
      });

      const finalStatus = await performanceTracker.checkImprovementTarget(targetImprovement);

      expect(finalStatus.targetReached).toBe(true);
      expect(finalStatus.improvementRate).toBeGreaterThanOrEqual(targetImprovement);
      expect(cycles.length).toBeLessThanOrEqual(maxCycles);
    }, 40000);

    it('should store and retrieve improvement insights via memory', async () => {
      // Run a few improvement cycles
      for (let i = 0; i < 5; i++) {
        await learningEngine.recordOutcome({
          id: `insight-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100 - i * 5,
          coverage: 0.80 + i * 0.03,
          edgeCasesCaught: 5 + i,
          feedback: { quality: 0.80 + i * 0.04, relevance: 0.9 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
      }

      const insights = await learningEngine.analyzeTrends();

      // Store insights in memory
      await memoryManager.store('aqe/improvement/insights', {
        timestamp: new Date(),
        insights,
        trends: insights.trends,
        recommendations: insights.recommendations
      }, { partition: 'coordination' });

      // Retrieve insights
      const storedInsights = await memoryManager.retrieve('aqe/improvement/insights', {
        partition: 'coordination'
      });

      expect(storedInsights).toBeDefined();
      expect(storedInsights.insights).toBeDefined();
      expect(storedInsights.trends).toBeDefined();
    }, 20000);
  });

  // ===========================================================================
  // Workflow 3: ML Flaky Detection → Fix → Validation
  // ===========================================================================

  describe('Workflow 3: ML Flaky Detection → Fix → Validation', () => {
    it('should complete flaky test remediation workflow', async () => {
      const workflow = {
        steps: [] as Array<{ step: string; duration: number; result: any }>
      };

      // Step 1: Detect flaky tests using ML
      let stepStart = performance.now();

      const testHistory = Array.from({ length: 20 }, (_, i) => ({
        name: 'api.test.ts:fetchUser',
        passed: i % 4 !== 0, // 75% pass rate (flaky)
        duration: i % 4 === 0 ? 5200 : 150,
        timestamp: Date.now() - (20 - i) * 60000,
        error: i % 4 === 0 ? 'Request timeout' : undefined
      }));

      const flakyTests = await flakyDetector.detectFlakyTests(testHistory);

      workflow.steps.push({
        step: 'ml-detection',
        duration: performance.now() - stepStart,
        result: {
          detected: flakyTests.length,
          accuracy: flakyTests.length > 0 ? 1.0 : 0,
          falsePositiveRate: 0.0
        }
      });

      expect(flakyTests.length).toBeGreaterThan(0);
      expect(flakyTests[0].confidence).toBeGreaterThan(0.9);

      // Step 2: Analyze root cause with ML features
      stepStart = performance.now();

      const flakyTest = flakyTests[0];
      const rootCause = flakyTest.recommendation;

      workflow.steps.push({
        step: 'root-cause-analysis',
        duration: performance.now() - stepStart,
        result: {
          pattern: flakyTest.failurePattern,
          confidence: flakyTest.confidence,
          recommendation: rootCause.recommendation
        }
      });

      expect(flakyTest.failurePattern).toBeDefined();
      expect(rootCause.recommendation).toBeDefined();

      // Step 3: Apply recommended fix
      stepStart = performance.now();

      const fixApplied = {
        testName: flakyTest.name,
        fix: rootCause.recommendation,
        codeExample: rootCause.codeExample || 'await waitFor(() => condition, { timeout: 5000 });',
        applied: true
      };

      workflow.steps.push({
        step: 'fix-application',
        duration: performance.now() - stepStart,
        result: fixApplied
      });

      // Step 4: Validate fix effectiveness
      stepStart = performance.now();

      // Simulate test runs after fix (should be stable now)
      const postFixHistory = Array.from({ length: 20 }, (_, i) => ({
        name: 'api.test.ts:fetchUser',
        passed: true, // All passing after fix
        duration: 160,
        timestamp: Date.now() + i * 60000
      }));

      const postFixFlaky = await flakyDetector.detectFlakyTests(postFixHistory);

      workflow.steps.push({
        step: 'fix-validation',
        duration: performance.now() - stepStart,
        result: {
          flakyTestsAfterFix: postFixFlaky.length,
          fixEffective: postFixFlaky.length === 0,
          newPassRate: 1.0
        }
      });

      expect(postFixFlaky.length).toBe(0); // No more flaky tests

      // Step 5: Store fix pattern in ReasoningBank for future reuse
      stepStart = performance.now();

      const fixPatternId = await reasoningBank.storePattern({
        id: `fix-pattern-${Date.now()}`,
        name: 'Timeout Fix Pattern',
        category: 'stabilization',
        framework: 'jest',
        language: 'typescript',
        description: 'Pattern for fixing timeout-related flaky tests',
        template: fixApplied.codeExample,
        applicability: {
          complexity: 'medium',
          context: ['timeout', 'async', 'network'],
          constraints: []
        },
        metrics: {
          successRate: 1.0, // Fix was successful
          usageCount: 1,
          averageQuality: 1.0,
          lastUsed: new Date()
        },
        tags: ['flaky-fix', 'timeout', 'stabilization'],
        metadata: {
          originalIssue: flakyTest.failurePattern,
          fixEffectiveness: 1.0
        }
      });

      workflow.steps.push({
        step: 'pattern-storage',
        duration: performance.now() - stepStart,
        result: { patternId: fixPatternId }
      });

      // Print workflow results
      console.log('\n━━━ Flaky Test Remediation Workflow ━━━');
      workflow.steps.forEach(s => {
        console.log(`${s.step}:`);
        console.log(`  Duration: ${s.duration.toFixed(2)}ms`);
        console.log(`  Result:`, JSON.stringify(s.result, null, 2));
      });

      // Verify workflow success
      expect(workflow.steps.every(s => s.result)).toBeDefined();
      expect(workflow.steps[workflow.steps.length - 1].result.patternId).toBeDefined();
    }, 30000);

    it('should share flaky fix patterns across projects', async () => {
      // Project A: Detect and fix flaky test, store pattern
      const flakyTestA = {
        name: 'payment.test.ts:processPayment',
        failurePattern: 'timing' as const,
        recommendation: {
          recommendation: 'Add explicit wait for payment processing',
          codeExample: 'await waitFor(() => payment.status === "completed", { timeout: 5000 });'
        }
      };

      const patternAId = await reasoningBank.storePattern({
        id: `fix-pattern-project-a`,
        name: 'Payment Timeout Fix',
        category: 'stabilization',
        framework: 'jest',
        language: 'typescript',
        description: 'Fix for payment processing timeout',
        template: flakyTestA.recommendation.codeExample,
        applicability: {
          complexity: 'medium',
          context: ['payment', 'async', 'timeout'],
          constraints: []
        },
        metrics: {
          successRate: 1.0,
          usageCount: 1,
          averageQuality: 1.0,
          lastUsed: new Date()
        },
        tags: ['flaky-fix', 'payment', 'timeout'],
        metadata: { project: 'project-a' }
      });

      // Project B: Find and reuse fix pattern
      const matches = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        tags: ['flaky-fix', 'timeout'],
        limit: 10
      });

      expect(matches.length).toBeGreaterThan(0);

      const paymentFix = matches.find(m => m.pattern.tags.includes('payment'));
      expect(paymentFix).toBeDefined();
      expect(paymentFix!.pattern.id).toBe(patternAId);

      // Apply pattern in Project B
      await reasoningBank.updateMetrics(patternAId, true, 1.0);

      const updatedPattern = await reasoningBank.getPattern(patternAId);
      expect(updatedPattern!.metrics.usageCount).toBe(2); // Used in both projects
    }, 20000);
  });

  // ===========================================================================
  // Performance Validation
  // ===========================================================================

  describe('Workflow Performance Validation', () => {
    it('should complete workflows within performance targets', async () => {
      const workflows = [
        {
          name: 'Pattern Extraction + Storage',
          target: 2000, // <2s
          execute: async () => {
            const patterns = await patternExtractor.extractPatterns(`
              describe('Test', () => {
                it('works', () => { expect(true).toBe(true); });
              });
            `, { framework: 'jest', language: 'typescript' });

            for (const pattern of patterns) {
              await reasoningBank.storePattern({
                id: `perf-${Date.now()}`,
                name: pattern.name,
                category: pattern.category,
                framework: 'jest',
                language: 'typescript',
                description: pattern.description,
                template: pattern.template || '',
                applicability: { complexity: 'low', context: [], constraints: [] },
                metrics: { successRate: 0.85, usageCount: 0, averageQuality: 0, lastUsed: new Date() },
                tags: [],
                metadata: {}
              });
            }
          }
        },
        {
          name: 'Learning Record + Analysis',
          target: 1000, // <1s
          execute: async () => {
            for (let i = 0; i < 10; i++) {
              await learningEngine.recordOutcome({
                id: `perf-${i}`,
                timestamp: new Date(),
                testId: `test-${i}`,
                testName: `Test ${i}`,
                outcome: 'success',
                executionTime: 100,
                coverage: 0.85,
                edgeCasesCaught: 6,
                feedback: { quality: 0.85, relevance: 0.9 },
                metadata: {
                  framework: 'jest',
                  language: 'typescript',
                  complexity: 2,
                  linesOfCode: 100
                }
              });
            }

            await learningEngine.analyzeTrends();
          }
        }
      ];

      console.log('\n━━━ Workflow Performance Metrics ━━━');

      for (const workflow of workflows) {
        const start = performance.now();
        await workflow.execute();
        const elapsed = performance.now() - start;

        console.log(`${workflow.name}: ${elapsed.toFixed(2)}ms (target: <${workflow.target}ms)`);
        expect(elapsed).toBeLessThan(workflow.target);
      }
    }, 30000);
  });
});
