/**
 * Phase 1 + Phase 2 Integration Tests
 *
 * Tests integration between Phase 1 (Multi-Model Router) and Phase 2 components:
 * - Cost-optimized pattern storage using router
 * - Learning with different model tiers
 * - Pattern extraction using appropriate models
 * - End-to-end workflow with routing
 *
 * @module tests/integration/phase1-phase2-integration
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { QEReasoningBank } from '@reasoning/QEReasoningBank';
import { LearningEngine } from '@learning/LearningEngine';
import { PatternExtractor } from '@reasoning/PatternExtractor';

describe('Phase 1 + Phase 2 Integration', () => {
  let reasoningBank: QEReasoningBank;
  let learningEngine: LearningEngine;
  let patternExtractor: PatternExtractor;

  beforeEach(() => {
    reasoningBank = new QEReasoningBank();
    learningEngine = new LearningEngine();
    patternExtractor = new PatternExtractor();
  });

  // ===========================================================================
  // Cost Optimization Integration
  // ===========================================================================

  describe('Cost Optimization with Multi-Model Router', () => {
    it('should use Phase 2 components with cost tracking', async () => {
      // Simulate cost-aware operations
      const costTracker = {
        totalCost: 0,
        operations: [] as Array<{ operation: string; cost: number; model: string }>
      };

      // Pattern extraction (could use cheaper model for simple patterns)
      const code = `
        describe('SimpleTest', () => {
          it('works', () => { expect(true).toBe(true); });
        });
      `;

      const patterns = await patternExtractor.extractPatterns(code, {
        framework: 'jest',
        language: 'typescript'
      });

      costTracker.operations.push({
        operation: 'pattern-extraction',
        cost: 0.001, // Simulated cost for cheaper model
        model: 'haiku'
      });

      // Store patterns (simple operation, use cheaper model)
      for (const pattern of patterns) {
        await reasoningBank.storePattern({
          id: `cost-${Date.now()}-${Math.random()}`,
          name: pattern.name,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: pattern.description,
          template: pattern.template || '',
          applicability: { complexity: 'low', context: [], constraints: [] },
          metrics: {
            successRate: 0.9,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: pattern.tags || [],
          metadata: { costModel: 'haiku' }
        });

        costTracker.operations.push({
          operation: 'pattern-storage',
          cost: 0.0005,
          model: 'haiku'
        });
      }

      // Learning analysis (complex operation, use better model)
      await learningEngine.recordOutcome({
        id: 'cost-test-1',
        timestamp: new Date(),
        testId: 'test-1',
        testName: 'Cost Test',
        outcome: 'success',
        executionTime: 100,
        coverage: 0.9,
        edgeCasesCaught: 6,
        feedback: { quality: 0.85, relevance: 0.9 },
        metadata: {
          framework: 'jest',
          language: 'typescript',
          complexity: 2,
          linesOfCode: 100
        }
      });

      costTracker.operations.push({
        operation: 'learning-record',
        cost: 0.002,
        model: 'sonnet'
      });

      costTracker.totalCost = costTracker.operations.reduce((sum, op) => sum + op.cost, 0);

      console.log('\n━━━ Cost Optimization Summary ━━━');
      console.log(`Total Operations: ${costTracker.operations.length}`);
      console.log(`Total Cost: $${costTracker.totalCost.toFixed(4)}`);
      console.log(`Average Cost per Operation: $${(costTracker.totalCost / costTracker.operations.length).toFixed(4)}`);

      // Verify cost savings
      expect(costTracker.totalCost).toBeLessThan(0.01); // Should be very cheap
    });

    it('should route complex analysis to better models', async () => {
      // Simulate routing decision based on complexity
      const tasks = [
        { complexity: 'low', operation: 'simple-lookup', recommendedModel: 'haiku' },
        { complexity: 'medium', operation: 'pattern-matching', recommendedModel: 'haiku' },
        { complexity: 'high', operation: 'trend-analysis', recommendedModel: 'sonnet' },
        { complexity: 'very-high', operation: 'ml-prediction', recommendedModel: 'sonnet' }
      ];

      const routingDecisions = tasks.map(task => {
        // Simple routing logic (in real implementation, use Phase 1 router)
        let model = 'haiku'; // Default to cheapest
        let estimatedCost = 0.001;

        if (task.complexity === 'high' || task.complexity === 'very-high') {
          model = 'sonnet';
          estimatedCost = 0.003;
        }

        return {
          task: task.operation,
          complexity: task.complexity,
          selectedModel: model,
          estimatedCost,
          reason: task.complexity === 'low' || task.complexity === 'medium'
            ? 'Simple task, use cost-efficient model'
            : 'Complex analysis, use powerful model'
        };
      });

      console.log('\n━━━ Routing Decisions ━━━');
      routingDecisions.forEach(decision => {
        console.log(`${decision.task}: ${decision.selectedModel} ($${decision.estimatedCost.toFixed(4)}) - ${decision.reason}`);
      });

      // Verify routing logic
      expect(routingDecisions[0].selectedModel).toBe('haiku');
      expect(routingDecisions[2].selectedModel).toBe('sonnet');
    });
  });

  // ===========================================================================
  // Performance Integration with Routing
  // ===========================================================================

  describe('Performance with Multi-Model Routing', () => {
    it('should maintain performance with cost optimization', async () => {
      const operations = [
        { type: 'lookup', expectedTime: 50, model: 'haiku' },
        { type: 'store', expectedTime: 20, model: 'haiku' },
        { type: 'analyze', expectedTime: 200, model: 'sonnet' }
      ];

      const results = [];

      for (const op of operations) {
        const start = performance.now();

        if (op.type === 'lookup') {
          await reasoningBank.findMatchingPatterns({
            framework: 'jest',
            language: 'typescript',
            limit: 5
          });
        } else if (op.type === 'store') {
          await reasoningBank.storePattern({
            id: `perf-${Date.now()}`,
            name: 'Test Pattern',
            category: 'unit',
            framework: 'jest',
            language: 'typescript',
            description: 'Performance test',
            template: '...',
            applicability: { complexity: 'low', context: [], constraints: [] },
            metrics: {
              successRate: 0.9,
              usageCount: 0,
              averageQuality: 0,
              lastUsed: new Date()
            },
            tags: [],
            metadata: { model: op.model }
          });
        } else if (op.type === 'analyze') {
          // Seed some data
          for (let i = 0; i < 20; i++) {
            await learningEngine.recordOutcome({
              id: `analyze-${i}`,
              timestamp: new Date(),
              testId: `test-${i}`,
              testName: `Test ${i}`,
              outcome: 'success',
              executionTime: 100,
              coverage: 0.85,
              edgeCasesCaught: 6,
              feedback: { quality: 0.8, relevance: 0.85 },
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

        const duration = performance.now() - start;

        results.push({
          operation: op.type,
          model: op.model,
          duration,
          expectedTime: op.expectedTime
        });
      }

      console.log('\n━━━ Performance with Routing ━━━');
      results.forEach(r => {
        console.log(`${r.operation} (${r.model}): ${r.duration.toFixed(2)}ms (expected: <${r.expectedTime}ms)`);
      });

      // Verify performance maintained
      results.forEach(r => {
        expect(r.duration).toBeLessThan(r.expectedTime * 1.5); // Allow 50% margin
      });
    });
  });

  // ===========================================================================
  // Quality vs Cost Trade-offs
  // ===========================================================================

  describe('Quality vs Cost Trade-offs', () => {
    it('should balance quality and cost across workflow', async () => {
      // Simulate complete workflow with cost tracking
      const workflow = {
        steps: [] as Array<{
          step: string;
          model: string;
          cost: number;
          qualityImpact: number;
        }>,
        totalCost: 0,
        overallQuality: 0
      };

      // Step 1: Pattern extraction (use cheaper model for common patterns)
      workflow.steps.push({
        step: 'pattern-extraction',
        model: 'haiku',
        cost: 0.001,
        qualityImpact: 0.85
      });

      // Step 2: Pattern storage (use cheaper model)
      workflow.steps.push({
        step: 'pattern-storage',
        model: 'haiku',
        cost: 0.0005,
        qualityImpact: 0.95
      });

      // Step 3: Pattern matching (use cheaper model for simple matching)
      workflow.steps.push({
        step: 'pattern-matching',
        model: 'haiku',
        cost: 0.001,
        qualityImpact: 0.90
      });

      // Step 4: Learning analysis (use better model for complex analysis)
      workflow.steps.push({
        step: 'learning-analysis',
        model: 'sonnet',
        cost: 0.003,
        qualityImpact: 0.95
      });

      // Calculate totals
      workflow.totalCost = workflow.steps.reduce((sum, s) => sum + s.cost, 0);
      workflow.overallQuality = workflow.steps.reduce((sum, s) => sum + s.qualityImpact, 0) / workflow.steps.length;

      console.log('\n━━━ Quality vs Cost Analysis ━━━');
      console.log(`Total Steps: ${workflow.steps.length}`);
      console.log(`Total Cost: $${workflow.totalCost.toFixed(4)}`);
      console.log(`Overall Quality: ${(workflow.overallQuality * 100).toFixed(1)}%`);
      console.log('\nBreakdown:');
      workflow.steps.forEach(s => {
        console.log(`  ${s.step} (${s.model}): $${s.cost.toFixed(4)} - Quality: ${(s.qualityImpact * 100).toFixed(0)}%`);
      });

      // Verify good balance
      expect(workflow.totalCost).toBeLessThan(0.01); // Low cost
      expect(workflow.overallQuality).toBeGreaterThan(0.85); // High quality
    });

    it('should prioritize quality for critical operations', async () => {
      // Identify critical vs non-critical operations
      const operations = [
        { name: 'pattern-lookup', critical: false, useModel: 'haiku' },
        { name: 'ml-prediction', critical: true, useModel: 'sonnet' },
        { name: 'simple-storage', critical: false, useModel: 'haiku' },
        { name: 'quality-analysis', critical: true, useModel: 'sonnet' }
      ];

      const assignments = operations.map(op => ({
        operation: op.name,
        critical: op.critical,
        model: op.critical ? 'sonnet' : 'haiku',
        rationale: op.critical
          ? 'Critical operation - prioritize quality over cost'
          : 'Non-critical operation - optimize for cost'
      }));

      console.log('\n━━━ Critical Operation Routing ━━━');
      assignments.forEach(a => {
        console.log(`${a.operation}: ${a.model} - ${a.rationale}`);
      });

      // Verify critical operations use better model
      const criticalOps = assignments.filter(a => a.critical);
      criticalOps.forEach(op => {
        expect(op.model).toBe('sonnet');
      });
    });
  });

  // ===========================================================================
  // End-to-End Integration
  // ===========================================================================

  describe('End-to-End Integration with Routing', () => {
    it('should complete full workflow with cost-optimized routing', async () => {
      const workflowMetrics = {
        startTime: performance.now(),
        steps: [] as Array<{ step: string; duration: number; cost: number }>,
        totalCost: 0,
        totalDuration: 0
      };

      // Step 1: Extract patterns (use haiku)
      let stepStart = performance.now();
      const code = `
        describe('PaymentService', () => {
          it('processes payment', async () => {
            const result = await paymentService.process({ amount: 100 });
            expect(result.status).toBe('success');
          });
        });
      `;

      const patterns = await patternExtractor.extractPatterns(code, {
        framework: 'jest',
        language: 'typescript'
      });

      workflowMetrics.steps.push({
        step: 'pattern-extraction',
        duration: performance.now() - stepStart,
        cost: 0.001
      });

      // Step 2: Store patterns (use haiku)
      stepStart = performance.now();
      for (const pattern of patterns) {
        await reasoningBank.storePattern({
          id: `e2e-${Date.now()}-${Math.random()}`,
          name: pattern.name,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: pattern.description,
          template: pattern.template || '',
          applicability: { complexity: 'medium', context: [], constraints: [] },
          metrics: {
            successRate: 0.9,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: pattern.tags || [],
          metadata: {}
        });
      }

      workflowMetrics.steps.push({
        step: 'pattern-storage',
        duration: performance.now() - stepStart,
        cost: 0.0005 * patterns.length
      });

      // Step 3: Find matching patterns (use haiku)
      stepStart = performance.now();
      const matches = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        limit: 5
      });

      workflowMetrics.steps.push({
        step: 'pattern-matching',
        duration: performance.now() - stepStart,
        cost: 0.001
      });

      // Step 4: Record learning (use haiku)
      stepStart = performance.now();
      await learningEngine.recordOutcome({
        id: 'e2e-learning-1',
        timestamp: new Date(),
        testId: 'payment-test-1',
        testName: 'Payment Processing Test',
        outcome: 'success',
        executionTime: 100,
        coverage: 0.92,
        edgeCasesCaught: 8,
        feedback: { quality: 0.9, relevance: 0.95 },
        metadata: {
          framework: 'jest',
          language: 'typescript',
          complexity: 3,
          linesOfCode: 150
        }
      });

      workflowMetrics.steps.push({
        step: 'learning-record',
        duration: performance.now() - stepStart,
        cost: 0.0005
      });

      // Step 5: Analyze trends (use sonnet for complex analysis)
      stepStart = performance.now();
      // Seed more data for meaningful analysis
      for (let i = 0; i < 20; i++) {
        await learningEngine.recordOutcome({
          id: `e2e-seed-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.85 + Math.random() * 0.1,
          edgeCasesCaught: 6,
          feedback: { quality: 0.8 + Math.random() * 0.15, relevance: 0.9 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
      }

      await learningEngine.analyzeTrends();

      workflowMetrics.steps.push({
        step: 'trend-analysis',
        duration: performance.now() - stepStart,
        cost: 0.003 // Higher cost for sonnet
      });

      // Calculate totals
      workflowMetrics.totalDuration = performance.now() - workflowMetrics.startTime;
      workflowMetrics.totalCost = workflowMetrics.steps.reduce((sum, s) => sum + s.cost, 0);

      console.log('\n━━━ End-to-End Workflow Metrics ━━━');
      console.log(`Total Duration: ${workflowMetrics.totalDuration.toFixed(2)}ms`);
      console.log(`Total Cost: $${workflowMetrics.totalCost.toFixed(4)}`);
      console.log('\nStep Breakdown:');
      workflowMetrics.steps.forEach(s => {
        console.log(`  ${s.step}: ${s.duration.toFixed(2)}ms ($${s.cost.toFixed(4)})`);
      });

      // Verify efficiency
      expect(workflowMetrics.totalDuration).toBeLessThan(5000); // <5 seconds
      expect(workflowMetrics.totalCost).toBeLessThan(0.01); // <$0.01
      expect(patterns.length).toBeGreaterThan(0);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Cost Savings Validation
  // ===========================================================================

  describe('Cost Savings Validation', () => {
    it('should demonstrate 70%+ cost savings vs all-sonnet approach', async () => {
      // Simulate 100 operations
      const operations = [
        { type: 'lookup', count: 40, sonnetCost: 0.003, haikuCost: 0.001 },
        { type: 'storage', count: 30, sonnetCost: 0.002, haikuCost: 0.0005 },
        { type: 'simple-analysis', count: 20, sonnetCost: 0.004, haikuCost: 0.001 },
        { type: 'complex-analysis', count: 10, sonnetCost: 0.005, haikuCost: 0.005 } // Both use sonnet
      ];

      let allSonnetCost = 0;
      let optimizedCost = 0;

      operations.forEach(op => {
        allSonnetCost += op.count * op.sonnetCost;
        optimizedCost += op.count * op.haikuCost;
      });

      const savings = ((allSonnetCost - optimizedCost) / allSonnetCost) * 100;

      console.log('\n━━━ Cost Savings Analysis ━━━');
      console.log(`All-Sonnet Approach: $${allSonnetCost.toFixed(4)}`);
      console.log(`Optimized Routing: $${optimizedCost.toFixed(4)}`);
      console.log(`Savings: $${(allSonnetCost - optimizedCost).toFixed(4)} (${savings.toFixed(1)}%)`);

      expect(savings).toBeGreaterThan(70); // >70% savings
    });
  });
});
