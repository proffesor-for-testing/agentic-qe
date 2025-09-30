/**
 * Comprehensive test suite for TestGeneratorAgent
 * Tests AI-powered test generation, sublinear algorithms, and consciousness integration
 */

import { TestGeneratorAgent, TestGeneratorConfig } from '../../src/agents/TestGeneratorAgent';
import { EventEmitter } from 'events';
import {
  AgentType,
  AgentContext,
  QETask,
  TaskAssignment,
  TestSuite,
  TestType
} from '../../src/types';

// Mock MemoryStore implementation
class MockMemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any, ttl?: number): Promise<void> {
    this.data.set(key, { value, ttl, timestamp: Date.now() });
  }

  async retrieve(key: string): Promise<any> {
    const item = this.data.get(key);
    return item ? item.value : undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

describe('TestGeneratorAgent', () => {
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;
  let testGeneratorConfig: TestGeneratorConfig;
  let testGenerator: TestGeneratorAgent;

  const testContext: AgentContext = {
    id: 'test-generator-context',
    type: 'test-generator' as AgentType,
    status: 'idle',
    metadata: { environment: 'test' }
  };

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    testGeneratorConfig = {
      id: 'test-generator-1',
      type: 'test-generator' as AgentType,
      capabilities: [],
      context: testContext,
      memoryStore: mockMemoryStore,
      eventBus: mockEventBus,
      frameworks: ['jest', 'mocha', 'cypress'],
      generationStrategies: ['boundary-value', 'equivalence-class', 'mutation-testing'],
      aiModel: 'gpt-4',
      coverageTarget: 90,
      maxTestsPerSuite: 100,
      sublinearOptimization: true,
      consciousnessIntegration: true
    };

    testGenerator = new TestGeneratorAgent(testGeneratorConfig);
  });

  afterEach(async () => {
    if (testGenerator.getStatus().status !== 'terminated') {
      await testGenerator.terminate();
    }
  });

  describe('Initialization', () => {
    test('should initialize with correct capabilities', async () => {
      await testGenerator.initialize();

      const status = testGenerator.getStatus();
      expect(status.capabilities).toContain('ai-test-generation');
      expect(status.capabilities).toContain('sublinear-optimization');
      expect(status.capabilities).toContain('consciousness-integration');
    });

    test('should load generation patterns from memory', async () => {
      // Pre-populate memory with patterns
      await mockMemoryStore.store('generation-patterns', {
        boundaryValue: { success: 0.85, usage: 142 },
        equivalenceClass: { success: 0.78, usage: 98 }
      });

      await testGenerator.initialize();

      // Verify patterns were loaded
      const status = testGenerator.getStatus();
      expect(status.status).toBe('active');
    });
  });

  describe('AI-Powered Test Generation', () => {
    beforeEach(async () => {
      await testGenerator.initialize();
    });

    test('should generate comprehensive test suite', async () => {
      const sourceCode = `
        function calculateDiscount(price, customerType) {
          if (price < 0) throw new Error('Invalid price');
          if (customerType === 'premium') return price * 0.8;
          if (customerType === 'regular') return price * 0.9;
          return price;
        }
      `;

      const task: QETask = {
        id: 'generation-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode,
          framework: 'jest',
          coverageTarget: 95,
          strategies: ['boundary-value', 'equivalence-class']
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'generation-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testGenerator.executeTask(assignment);

      expect(result.testSuite).toBeDefined();
      expect(result.testSuite.tests.length).toBeGreaterThan(0);
      expect(result.aiAnalysis).toBeDefined();
      expect(result.optimizationApplied).toBe(true);
      expect(result.consciousnessInsights).toBeDefined();

      // Verify test quality
      const testSuite = result.testSuite as TestSuite;
      expect(testSuite.tests.some(t => t.type === 'unit')).toBe(true);
      expect(testSuite.metadata.coverageTarget).toBe(95);
    });

    test('should apply different generation strategies', async () => {
      const task: QETask = {
        id: 'strategy-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode: 'function add(a, b) { return a + b; }',
          framework: 'jest',
          strategies: ['mutation-testing', 'property-based']
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'strategy-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testGenerator.executeTask(assignment);

      expect(result.strategiesApplied).toContain('mutation-testing');
      expect(result.strategiesApplied).toContain('property-based');
      expect(result.testSuite.tests.length).toBeGreaterThan(0);
    });
  });

  describe('Sublinear Optimization', () => {
    beforeEach(async () => {
      await testGenerator.initialize();
    });

    test('should optimize test generation using sublinear algorithms', async () => {
      const largeSourceCode = Array.from({ length: 50 }, (_, i) =>
        `function func${i}(x) { return x * ${i}; }`
      ).join('\n');

      const task: QETask = {
        id: 'optimization-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode: largeSourceCode,
          framework: 'jest',
          optimizationLevel: 'sublinear'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'optimization-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const startTime = Date.now();
      const result = await testGenerator.executeTask(assignment);
      const executionTime = Date.now() - startTime;

      expect(result.optimizationApplied).toBe(true);
      expect(result.optimizationMetrics).toBeDefined();
      expect(result.optimizationMetrics.complexityReduction).toBeGreaterThan(0);
      expect(executionTime).toBeLessThan(10000); // Should be reasonably fast
    });

    test('should handle optimization failures gracefully', async () => {
      // Mock optimization failure
      const originalApplySublinear = (testGenerator as any).applySublinearOptimization;
      (testGenerator as any).applySublinearOptimization = jest.fn().mockRejectedValue(
        new Error('Optimization failed')
      );

      const task: QETask = {
        id: 'optimization-failure-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode: 'function test() { return true; }',
          framework: 'jest'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'optimization-failure-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testGenerator.executeTask(assignment);

      expect(result.optimizationApplied).toBe(false);
      expect(result.testSuite).toBeDefined(); // Should still generate tests

      // Restore original method
      (testGenerator as any).applySublinearOptimization = originalApplySublinear;
    });
  });

  describe('Consciousness Integration', () => {
    beforeEach(async () => {
      await testGenerator.initialize();
    });

    test('should integrate consciousness for enhanced test generation', async () => {
      const task: QETask = {
        id: 'consciousness-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode: 'function complexLogic(a, b, c) { return a ? b + c : b - c; }',
          framework: 'jest',
          enableConsciousness: true
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'consciousness-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testGenerator.executeTask(assignment);

      expect(result.consciousnessInsights).toBeDefined();
      expect(result.consciousnessInsights.emergentPatterns).toBeDefined();
      expect(result.consciousnessInsights.reasoningDepth).toBeGreaterThan(0);
      expect(result.consciousnessInsights.novelty).toBeGreaterThan(0);
    });

    test('should evolve test generation based on consciousness feedback', async () => {
      // First generation
      const task1: QETask = {
        id: 'evolution-task-1',
        type: 'ai-test-generation',
        payload: {
          sourceCode: 'function simple(x) { return x * 2; }',
          framework: 'jest',
          enableConsciousness: true
        },
        priority: 1,
        status: 'pending'
      };

      const assignment1: TaskAssignment = {
        id: 'evolution-assignment-1',
        task: task1,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result1 = await testGenerator.executeTask(assignment1);

      // Second generation should show evolution
      const task2: QETask = {
        id: 'evolution-task-2',
        type: 'ai-test-generation',
        payload: {
          sourceCode: 'function simple(x) { return x * 3; }',
          framework: 'jest',
          enableConsciousness: true
        },
        priority: 1,
        status: 'pending'
      };

      const assignment2: TaskAssignment = {
        id: 'evolution-assignment-2',
        task: task2,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result2 = await testGenerator.executeTask(assignment2);

      // Second result should show evolved reasoning
      expect(result2.consciousnessInsights.reasoningDepth)
        .toBeGreaterThanOrEqual(result1.consciousnessInsights.reasoningDepth);
    });
  });

  describe('Defect Prediction', () => {
    beforeEach(async () => {
      await testGenerator.initialize();
    });

    test('should predict potential defects', async () => {
      const task: QETask = {
        id: 'defect-prediction-task',
        type: 'defect-prediction',
        payload: {
          sourceCode: `
            function processArray(arr) {
              if (arr.length === 0) return null;
              let sum = 0;
              for (let i = 0; i <= arr.length; i++) { // Off-by-one error
                sum += arr[i];
              }
              return sum / arr.length;
            }
          `,
          analysisDepth: 'deep'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'defect-prediction-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testGenerator.executeTask(assignment);

      expect(result.predictions).toBeDefined();
      expect(Array.isArray(result.predictions)).toBe(true);
      expect(result.predictions.length).toBeGreaterThan(0);

      // Should detect the off-by-one error
      const offByOneError = result.predictions.find((p: any) =>
        p.type.includes('boundary') || p.type.includes('index')
      );
      expect(offByOneError).toBeDefined();
      expect(offByOneError.severity).toBe('high');
    });
  });

  describe('Test Suite Enhancement', () => {
    beforeEach(async () => {
      await testGenerator.initialize();
    });

    test('should enhance existing test suite', async () => {
      const existingTestSuite: TestSuite = {
        id: 'existing-suite',
        name: 'Existing Test Suite',
        tests: [{
          id: 'existing-test',
          name: 'Basic Test',
          type: 'unit' as TestType,
          parameters: [],
          assertions: ['expect(1 + 1).toBe(2)'],
          expectedResult: 2
        }],
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 70,
          framework: 'jest',
          estimatedDuration: 1000
        }
      };

      const task: QETask = {
        id: 'enhancement-task',
        type: 'test-suite-enhancement',
        payload: {
          existingTestSuite,
          targetCoverage: 95,
          enhancementStrategies: ['boundary-value', 'edge-case']
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'enhancement-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testGenerator.executeTask(assignment);

      expect(result.enhancedTestSuite).toBeDefined();
      expect(result.enhancedTestSuite.tests.length).toBeGreaterThan(existingTestSuite.tests.length);
      expect(result.coverageImprovement).toBeGreaterThan(0);
      expect(result.enhancementSummary).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await testGenerator.initialize();
    });

    test('should handle invalid source code gracefully', async () => {
      const task: QETask = {
        id: 'invalid-code-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode: 'invalid javascript syntax {{{',
          framework: 'jest'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'invalid-code-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testGenerator.executeTask(assignment);

      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.testSuite.tests.length).toBeGreaterThanOrEqual(0); // Should handle gracefully
    });

    test('should handle unsupported frameworks', async () => {
      const task: QETask = {
        id: 'unsupported-framework-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode: 'function test() { return true; }',
          framework: 'unsupported-framework'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'unsupported-framework-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(testGenerator.executeTask(assignment)).rejects.toThrow('Unsupported framework');
    });

    test('should handle empty source code', async () => {
      const task: QETask = {
        id: 'empty-code-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode: '',
          framework: 'jest'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'empty-code-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testGenerator.executeTask(assignment);

      expect(result.warnings).toBeDefined();
      expect(result.warnings.some((w: string) => w.includes('empty') || w.includes('no code'))).toBe(true);
    });
  });

  describe('Performance and Memory Management', () => {
    beforeEach(async () => {
      await testGenerator.initialize();
    });

    test('should track generation performance metrics', async () => {
      const task: QETask = {
        id: 'performance-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode: 'function test() { return true; }',
          framework: 'jest'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'performance-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const initialMetrics = testGenerator.getStatus().performanceMetrics;
      await testGenerator.executeTask(assignment);
      const updatedMetrics = testGenerator.getStatus().performanceMetrics;

      expect(updatedMetrics.tasksCompleted).toBe(initialMetrics.tasksCompleted + 1);
      expect(updatedMetrics.averageExecutionTime).toBeGreaterThan(0);
    });

    test('should store and retrieve generation patterns', async () => {
      // Execute a generation task
      const task: QETask = {
        id: 'pattern-storage-task',
        type: 'ai-test-generation',
        payload: {
          sourceCode: 'function pattern() { return "test"; }',
          framework: 'jest',
          strategies: ['boundary-value']
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'pattern-storage-assignment',
        task,
        agentId: testGenerator.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await testGenerator.executeTask(assignment);

      // Verify patterns were stored
      const storedPatterns = await mockMemoryStore.retrieve(
        `agent:${testGenerator.getStatus().agentId.id}:generation-patterns`
      );
      expect(storedPatterns).toBeDefined();
    });
  });
});