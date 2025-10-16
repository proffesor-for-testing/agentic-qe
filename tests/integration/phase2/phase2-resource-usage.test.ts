/**
 * Phase 2 Resource Usage Tests
 *
 * Validates that Phase 2 components stay within resource limits:
 * - Memory usage: <100MB per agent
 * - No memory leaks over extended operations
 * - CPU usage stays reasonable
 * - Efficient cleanup on agent termination
 *
 * @module tests/integration/phase2/phase2-resource-usage
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TestGeneratorAgent } from '../../../src/agents/TestGeneratorAgent';
import { CoverageAnalyzerAgent } from '../../../src/agents/CoverageAnalyzerAgent';
import { FlakyTestHunterAgent } from '../../../src/agents/FlakyTestHunterAgent';
import { LearningEngine } from '../../../src/learning/LearningEngine';
import { QEReasoningBank } from '../../../src/reasoning/QEReasoningBank';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../../src/core/EventBus';
import { QEAgentType } from '../../../src/types';
import { createAgentConfig } from '../../helpers/agent-config-factory';

// Helper to get memory usage in MB
function getMemoryUsageMB(): number {
  const usage = process.memoryUsage();
  return usage.heapUsed / 1024 / 1024;
}

// Helper to force garbage collection (requires --expose-gc flag)
function forceGC(): void {
  if (global.gc) {
    global.gc();
  }
}

// Helper to measure memory delta
async function measureMemoryUsage<T>(operation: () => Promise<T>): Promise<{
  result: T;
  memoryDeltaMB: number;
  initialMB: number;
  finalMB: number;
}> {
  forceGC();
  await new Promise(resolve => setTimeout(resolve, 100)); // Wait for GC

  const initialMB = getMemoryUsageMB();
  const result = await operation();

  forceGC();
  await new Promise(resolve => setTimeout(resolve, 100));

  const finalMB = getMemoryUsageMB();
  const memoryDeltaMB = finalMB - initialMB;

  return { result, memoryDeltaMB, initialMB, finalMB };
}

describe('Phase 2 Resource Usage Tests', () => {
  let memoryManager: SwarmMemoryManager;
  let eventBus: EventBus;

  beforeEach(async () => {
    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();
    eventBus = new EventBus();
    await eventBus.initialize();
  });

  afterEach(async () => {
    eventBus.removeAllListeners();
    await memoryManager.close();
  });

  // ===========================================================================
  // Agent Memory Usage
  // ===========================================================================

  describe('Agent Memory Usage (<100MB per agent)', () => {
    it('should not exceed 100MB for TestGeneratorAgent', async () => {
      const measurement = await measureMemoryUsage(async () => {
        const config = createAgentConfig({
          agentId: 'mem-test-gen-1',
          type: QEAgentType.TEST_GENERATOR,
          enablePatterns: true,
          enableLearning: true
        }, memoryManager, eventBus);

        const agent = new TestGeneratorAgent(config);
        await agent.initialize();

        // Run 100 test generation operations
        for (let i = 0; i < 100; i++) {
          await agent.executeTask({
            id: `mem-task-${i}`,
            type: 'generate-tests',
            payload: {
              modulePath: `src/module-${i}.ts`,
              framework: 'jest',
              coverage: 0.90
            },
            priority: 'medium',
            status: 'pending'
          });
        }

        await agent.terminate();
        return agent;
      });

      console.log('\n━━━ TestGeneratorAgent Memory Usage ━━━');
      console.log(`Initial: ${measurement.initialMB.toFixed(2)}MB`);
      console.log(`Final: ${measurement.finalMB.toFixed(2)}MB`);
      console.log(`Delta: ${measurement.memoryDeltaMB.toFixed(2)}MB`);

      expect(measurement.memoryDeltaMB).toBeLessThan(100); // <100MB
    }, 60000);

    it('should not exceed 100MB for CoverageAnalyzerAgent', async () => {
      const measurement = await measureMemoryUsage(async () => {
        const config = createAgentConfig({
          agentId: 'mem-cov-1',
          type: QEAgentType.COVERAGE_ANALYZER,
          enableLearning: true,
          targetImprovement: 0.20
        }, memoryManager, eventBus);

        const agent = new CoverageAnalyzerAgent(config);
        await agent.initialize();

        // Run 100 coverage analyses
        for (let i = 0; i < 100; i++) {
          await agent.executeTask({
            id: `mem-cov-task-${i}`,
            type: 'analyze-coverage',
            payload: {
              projectPath: 'src/',
              baselineCoverage: 0.75 + (i * 0.001)
            },
            priority: 'high',
            status: 'pending'
          });
        }

        await agent.terminate();
        return agent;
      });

      console.log('\n━━━ CoverageAnalyzerAgent Memory Usage ━━━');
      console.log(`Initial: ${measurement.initialMB.toFixed(2)}MB`);
      console.log(`Final: ${measurement.finalMB.toFixed(2)}MB`);
      console.log(`Delta: ${measurement.memoryDeltaMB.toFixed(2)}MB`);

      expect(measurement.memoryDeltaMB).toBeLessThan(100);
    }, 60000);

    it('should not exceed 100MB for FlakyTestHunterAgent', async () => {
      const measurement = await measureMemoryUsage(async () => {
        const config = createAgentConfig({
          agentId: 'mem-flaky-1',
          type: QEAgentType.FLAKY_TEST_HUNTER,
          detection: { repeatedRuns: 20 }
        }, memoryManager, eventBus);

        const agent = new FlakyTestHunterAgent(config);
        await agent.initialize();

        // Simulate test history for flaky detection
        const testHistory = Array.from({ length: 1000 }, (_, i) => ({
          testName: `test-${i % 50}`,
          timestamp: new Date(),
          result: Math.random() > 0.2 ? 'pass' as const : 'fail' as const,
          duration: 100 + Math.random() * 50
        }));

        await memoryManager.store('aqe/test-results/history', testHistory, {
          partition: 'coordination'
        });

        // Run 50 flaky detections
        for (let i = 0; i < 50; i++) {
          await agent.executeTask({
            id: `mem-flaky-task-${i}`,
            type: 'detect-flaky',
            payload: {
              timeWindow: 30,
              minRuns: 5
            },
            priority: 'high',
            status: 'pending'
          });
        }

        await agent.terminate();
        await memoryManager.clear('coordination');

        return agent;
      });

      console.log('\n━━━ FlakyTestHunterAgent Memory Usage ━━━');
      console.log(`Initial: ${measurement.initialMB.toFixed(2)}MB`);
      console.log(`Final: ${measurement.finalMB.toFixed(2)}MB`);
      console.log(`Delta: ${measurement.memoryDeltaMB.toFixed(2)}MB`);

      expect(measurement.memoryDeltaMB).toBeLessThan(100);
    }, 60000);
  });

  // ===========================================================================
  // Component Memory Usage
  // ===========================================================================

  describe('Component Memory Usage', () => {
    it('should not leak memory in LearningEngine over 1000 operations', async () => {
      const measurement = await measureMemoryUsage(async () => {
        const engine = new LearningEngine();

        // Record 1000 outcomes
        for (let i = 0; i < 1000; i++) {
          await engine.recordOutcome({
            id: `mem-learn-${i}`,
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

          // Clear periodically to simulate real usage
          if (i % 100 === 0 && i > 0) {
            engine.clear();
          }
        }

        return engine;
      });

      console.log('\n━━━ LearningEngine Memory Usage (1000 ops) ━━━');
      console.log(`Delta: ${measurement.memoryDeltaMB.toFixed(2)}MB`);

      expect(measurement.memoryDeltaMB).toBeLessThan(50); // <50MB for component
    }, 60000);

    it('should not leak memory in QEReasoningBank over 500 operations', async () => {
      const measurement = await measureMemoryUsage(async () => {
        const bank = new QEReasoningBank();

        // Store 500 patterns
        for (let i = 0; i < 500; i++) {
          await bank.storePattern({
            id: `mem-pattern-${i}`,
            name: `Pattern ${i}`,
            category: i % 2 === 0 ? 'unit' : 'integration',
            framework: 'jest',
            language: 'typescript',
            description: `Memory test pattern ${i}`,
            template: 'describe("{{name}}", () => { ... });',
            applicability: {
              complexity: 'medium',
              context: ['testing'],
              constraints: []
            },
            metrics: {
              successRate: 0.85,
              usageCount: 0,
              averageQuality: 0,
              lastUsed: new Date()
            },
            tags: ['memory-test'],
            metadata: {}
          });

          // Query patterns periodically
          if (i % 50 === 0) {
            await bank.findMatchingPatterns({
              framework: 'jest',
              language: 'typescript',
              limit: 10
            });
          }
        }

        return bank;
      });

      console.log('\n━━━ QEReasoningBank Memory Usage (500 patterns) ━━━');
      console.log(`Delta: ${measurement.memoryDeltaMB.toFixed(2)}MB`);

      expect(measurement.memoryDeltaMB).toBeLessThan(75); // <75MB for 500 patterns
    }, 60000);

    it('should not leak memory in SwarmMemoryManager over 1000 operations', async () => {
      const measurement = await measureMemoryUsage(async () => {
        const memory = new SwarmMemoryManager();

        // Store and retrieve 1000 times
        for (let i = 0; i < 1000; i++) {
          await memory.store(`aqe/test/key-${i % 100}`, {
            data: `value-${i}`,
            timestamp: Date.now(),
            metadata: { iteration: i }
          }, { partition: 'coordination' });

          if (i % 10 === 0) {
            await memory.retrieve(`aqe/test/key-${i % 100}`, {
              partition: 'coordination'
            });
          }

          // Clear periodically
          if (i % 200 === 0 && i > 0) {
            await memory.clear('coordination');
          }
        }

        await memory.clear('coordination');
        return memory;
      });

      console.log('\n━━━ SwarmMemoryManager Memory Usage (1000 ops) ━━━');
      console.log(`Delta: ${measurement.memoryDeltaMB.toFixed(2)}MB`);

      expect(measurement.memoryDeltaMB).toBeLessThan(30); // <30MB for memory manager
    }, 60000);
  });

  // ===========================================================================
  // Memory Leak Detection
  // ===========================================================================

  describe('Memory Leak Detection', () => {
    it('should not leak memory with repeated agent initialization/termination', async () => {
      const memorySnapshots: number[] = [];

      forceGC();
      await new Promise(resolve => setTimeout(resolve, 100));

      for (let i = 0; i < 10; i++) {
        const config = createAgentConfig({
          agentId: `leak-test-${i}`,
          type: QEAgentType.TEST_GENERATOR,
          enablePatterns: true
        }, memoryManager, eventBus);

        const agent = new TestGeneratorAgent(config);
        await agent.initialize();

        await agent.executeTask({
          id: `leak-task-${i}`,
          type: 'generate-tests',
          payload: {
            modulePath: 'src/test.ts',
            framework: 'jest'
          },
          priority: 'medium',
          status: 'pending'
        });

        await agent.terminate();

        forceGC();
        await new Promise(resolve => setTimeout(resolve, 100));

        memorySnapshots.push(getMemoryUsageMB());
      }

      console.log('\n━━━ Memory Leak Detection (Agent Lifecycle) ━━━');
      console.log('Iteration | Memory (MB)');
      console.log('----------|------------');
      memorySnapshots.forEach((mem, i) => {
        console.log(`    ${(i + 1).toString().padStart(2)}    | ${mem.toFixed(2).padStart(10)}`);
      });

      // Memory should not grow significantly over iterations
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      const growth = lastSnapshot - firstSnapshot;

      console.log(`\nMemory Growth: ${growth.toFixed(2)}MB`);

      expect(growth).toBeLessThan(50); // <50MB growth over 10 iterations
    }, 90000);

    it('should cleanup properly after learning engine operations', async () => {
      const iterations = 20;
      const memorySnapshots: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const engine = new LearningEngine();

        // Perform operations
        for (let j = 0; j < 50; j++) {
          await engine.recordOutcome({
            id: `cleanup-${i}-${j}`,
            timestamp: new Date(),
            testId: `test-${j}`,
            testName: `Test ${j}`,
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

        engine.clear();

        forceGC();
        await new Promise(resolve => setTimeout(resolve, 50));

        memorySnapshots.push(getMemoryUsageMB());
      }

      console.log('\n━━━ Memory Cleanup (LearningEngine) ━━━');
      console.log(`First 5: ${memorySnapshots.slice(0, 5).map(m => m.toFixed(2)).join(', ')}MB`);
      console.log(`Last 5:  ${memorySnapshots.slice(-5).map(m => m.toFixed(2)).join(', ')}MB`);

      const avgFirst5 = memorySnapshots.slice(0, 5).reduce((a, b) => a + b) / 5;
      const avgLast5 = memorySnapshots.slice(-5).reduce((a, b) => a + b) / 5;
      const growth = avgLast5 - avgFirst5;

      console.log(`Growth: ${growth.toFixed(2)}MB`);

      expect(growth).toBeLessThan(20); // <20MB growth
    }, 90000);
  });

  // ===========================================================================
  // Concurrent Operations Resource Usage
  // ===========================================================================

  describe('Concurrent Operations Resource Usage', () => {
    it('should handle multiple agents concurrently without excessive memory', async () => {
      const measurement = await measureMemoryUsage(async () => {
        const agents = [
          new TestGeneratorAgent(createAgentConfig({
            agentId: 'concurrent-gen-1',
            type: QEAgentType.TEST_GENERATOR,
            enablePatterns: true
          }, memoryManager, eventBus)),
          new TestGeneratorAgent(createAgentConfig({
            agentId: 'concurrent-gen-2',
            type: QEAgentType.TEST_GENERATOR,
            enablePatterns: true
          }, memoryManager, eventBus)),
          new CoverageAnalyzerAgent(createAgentConfig({
            agentId: 'concurrent-cov-1',
            type: QEAgentType.COVERAGE_ANALYZER,
            enableLearning: true
          }, memoryManager, eventBus)),
          new FlakyTestHunterAgent(createAgentConfig({
            agentId: 'concurrent-flaky-1',
            type: QEAgentType.FLAKY_TEST_HUNTER
          }, memoryManager, eventBus))
        ];

        // Initialize all agents
        await Promise.all(agents.map(a => a.initialize()));

        // Run concurrent tasks
        const tasks = agents.flatMap((agent, i) =>
          Array.from({ length: 25 }, (_, j) => ({
            agent,
            task: {
              id: `concurrent-task-${i}-${j}`,
              type: 'analyze-coverage' as const,
              payload: {},
              priority: 'medium' as const,
              status: 'pending' as const
            }
          }))
        );

        await Promise.all(
          tasks.map(({ agent, task }) => agent.executeTask(task))
        );

        // Terminate all agents
        await Promise.all(agents.map(a => a.terminate()));

        return agents;
      });

      console.log('\n━━━ Concurrent Agents Memory Usage ━━━');
      console.log(`Agents: 4`);
      console.log(`Tasks per agent: 25`);
      console.log(`Total tasks: 100`);
      console.log(`Memory delta: ${measurement.memoryDeltaMB.toFixed(2)}MB`);

      expect(measurement.memoryDeltaMB).toBeLessThan(200); // <200MB for 4 concurrent agents
    }, 90000);
  });

  // ===========================================================================
  // Long-Running Operations
  // ===========================================================================

  describe('Long-Running Operations', () => {
    it('should maintain stable memory over extended operations', async () => {
      const samples = 10;
      const memorySnapshots: number[] = [];

      const engine = new LearningEngine();

      for (let sample = 0; sample < samples; sample++) {
        // Perform 100 operations per sample
        for (let i = 0; i < 100; i++) {
          await engine.recordOutcome({
            id: `extended-${sample}-${i}`,
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

        forceGC();
        await new Promise(resolve => setTimeout(resolve, 100));

        memorySnapshots.push(getMemoryUsageMB());

        // Clear every few samples to simulate real usage
        if (sample % 3 === 0) {
          engine.clear();
        }
      }

      console.log('\n━━━ Extended Operations Memory Stability ━━━');
      console.log(`Samples: ${samples}`);
      console.log(`Operations per sample: 100`);
      console.log(`Total operations: ${samples * 100}`);
      console.log('\nMemory snapshots (MB):');
      console.log(memorySnapshots.map(m => m.toFixed(2)).join(', '));

      const maxMemory = Math.max(...memorySnapshots);
      const minMemory = Math.min(...memorySnapshots);
      const range = maxMemory - minMemory;

      console.log(`\nMemory range: ${range.toFixed(2)}MB (${minMemory.toFixed(2)} - ${maxMemory.toFixed(2)})`);

      // Memory should stay within a reasonable range
      expect(range).toBeLessThan(100); // <100MB variation

      engine.clear();
    }, 90000);
  });
});
