/**
 * Integration Tests - Test Generation Coordinator
 * Tests the full workflow of test generation using actual interfaces
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TestGenerationCoordinator,
  ITestGenerationCoordinator,
} from '../../../src/domains/test-generation/coordinator';
import { EventBus, MemoryBackend, AgentCoordinator } from '../../../src/kernel/interfaces';
import { createMockEventBus, createMockMemory, createMockAgentCoordinator } from '../../mocks';

describe('Test Generation Coordinator Integration', () => {
  let coordinator: ITestGenerationCoordinator;
  let eventBus: EventBus;
  let memory: MemoryBackend;
  let agentCoordinator: AgentCoordinator;

  beforeEach(async () => {
    eventBus = createMockEventBus();
    memory = createMockMemory();
    agentCoordinator = createMockAgentCoordinator();

    coordinator = new TestGenerationCoordinator(
      eventBus,
      memory,
      agentCoordinator
    );
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.dispose();
    vi.clearAllMocks();
  });

  describe('Test Generation Workflow', () => {
    it('should generate tests for source files', async () => {
      const request = {
        sourceFiles: ['src/utils/math.ts'],
        testType: 'unit' as const,
        framework: 'vitest' as const,
        coverageTarget: 80,
      };

      const result = await coordinator.generateTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tests).toBeDefined();
        expect(Array.isArray(result.value.tests)).toBe(true);
        expect(result.value.coverageEstimate).toBeGreaterThanOrEqual(0);
      }
    });

    it('should generate integration tests', async () => {
      const request = {
        sourceFiles: ['src/services/user.ts'],
        testType: 'integration' as const,
        framework: 'vitest' as const,
      };

      const result = await coordinator.generateTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tests).toBeDefined();
      }
    });

    it('should handle empty source files array', async () => {
      const request = {
        sourceFiles: [],
        testType: 'unit' as const,
        framework: 'vitest' as const,
      };

      const result = await coordinator.generateTests(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('source files');
      }
    });

    it('should track workflow status during generation', async () => {
      const request = {
        sourceFiles: ['src/index.ts'],
        testType: 'unit' as const,
        framework: 'vitest' as const,
      };

      // Start generation
      const resultPromise = coordinator.generateTests(request);

      // Check active workflows
      const activeWorkflows = coordinator.getActiveWorkflows();
      expect(activeWorkflows).toBeDefined();
      expect(Array.isArray(activeWorkflows)).toBe(true);

      await resultPromise;
    });

    it('should include patterns used in response', async () => {
      const request = {
        sourceFiles: ['src/utils/helper.ts'],
        testType: 'unit' as const,
        framework: 'vitest' as const,
        patterns: ['arrange-act-assert', 'given-when-then'],
      };

      const result = await coordinator.generateTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.patternsUsed).toBeDefined();
        expect(Array.isArray(result.value.patternsUsed)).toBe(true);
      }
    });
  });

  describe('TDD Workflow', () => {
    it('should execute red phase of TDD', async () => {
      const request = {
        feature: 'User registration validation',
        behavior: 'should validate email format',
        framework: 'vitest',
        phase: 'red' as const,
      };

      const result = await coordinator.generateTDDTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.phase).toBe('red');
        expect(result.value.nextStep).toBeDefined();
      }
    });

    it('should execute green phase of TDD', async () => {
      const request = {
        feature: 'Order total calculation',
        behavior: 'should sum item prices',
        framework: 'vitest',
        phase: 'green' as const,
      };

      const result = await coordinator.generateTDDTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.phase).toBe('green');
      }
    });

    it('should execute refactor phase of TDD', async () => {
      const request = {
        feature: 'Data transformation',
        behavior: 'should normalize input',
        framework: 'vitest',
        phase: 'refactor' as const,
      };

      const result = await coordinator.generateTDDTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.phase).toBe('refactor');
      }
    });
  });

  describe('Property-Based Testing', () => {
    it('should generate property-based tests', async () => {
      const request = {
        function: 'function reverse(arr: string[]): string[]',
        properties: [
          'Reversing twice returns original',
          'Length is preserved',
        ],
      };

      const result = await coordinator.generatePropertyTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tests).toBeDefined();
        expect(Array.isArray(result.value.tests)).toBe(true);
        expect(result.value.arbitraries).toBeDefined();
      }
    });

    it('should handle constraints in property tests', async () => {
      const request = {
        function: 'function divide(a: number, b: number): number',
        properties: ['Division is inverse of multiplication'],
        constraints: { b: { min: 1 } },
      };

      const result = await coordinator.generatePropertyTests(request);

      expect(result.success).toBe(true);
    });
  });

  describe('Test Data Generation', () => {
    it('should generate test data from schema', async () => {
      // Schema format expected by the generator: flat field definitions
      const request = {
        schema: {
          id: { type: 'string', faker: 'string.uuid' },
          name: { type: 'string', faker: 'person.fullName' },
          email: { type: 'string', faker: 'internet.email' },
        },
        count: 5,
      };

      const result = await coordinator.generateTestData(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.records).toBeDefined();
        expect(result.value.records.length).toBe(5);
        expect(result.value.seed).toBeDefined();
      }
    });

    it('should preserve relationships when requested', async () => {
      const request = {
        schema: {
          userId: { type: 'string', faker: 'string.uuid' },
          orderId: { type: 'string', faker: 'string.uuid' },
        },
        count: 3,
        preserveRelationships: true,
      };

      const result = await coordinator.generateTestData(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.records.length).toBe(3);
      }
    });
  });

  describe('Pattern Learning', () => {
    it('should learn patterns from test files', async () => {
      const request = {
        testFiles: ['tests/unit/example.test.ts'],
        depth: 'shallow' as const,
      };

      const result = await coordinator.learnPatterns(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.patterns).toBeDefined();
        expect(Array.isArray(result.value.patterns)).toBe(true);
        expect(result.value.confidence).toBeGreaterThanOrEqual(0);
        expect(result.value.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should perform deep pattern analysis', async () => {
      const request = {
        testFiles: ['tests/unit/complex.test.ts'],
        depth: 'deep' as const,
      };

      const result = await coordinator.learnPatterns(request);

      expect(result.success).toBe(true);
    });
  });

  describe('Event Publishing', () => {
    it('should publish event on test generation', async () => {
      const publishSpy = vi.spyOn(eventBus, 'publish');

      const request = {
        sourceFiles: ['src/test.ts'],
        testType: 'unit' as const,
        framework: 'vitest' as const,
      };

      await coordinator.generateTests(request);

      expect(publishSpy).toHaveBeenCalled();
    });
  });

  describe('Concurrent Workflow Management', () => {
    it('should handle multiple concurrent test generations', async () => {
      const requests = [
        { sourceFiles: ['src/a.ts'], testType: 'unit' as const, framework: 'vitest' as const },
        { sourceFiles: ['src/b.ts'], testType: 'unit' as const, framework: 'vitest' as const },
        { sourceFiles: ['src/c.ts'], testType: 'unit' as const, framework: 'vitest' as const },
      ];

      const results = await Promise.all(
        requests.map(req => coordinator.generateTests(req))
      );

      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.success).toBe(true);
      });
    });

    it('should limit concurrent workflows based on config', async () => {
      // Create coordinator with low limit
      const limitedCoordinator = new TestGenerationCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        { maxConcurrentWorkflows: 2, defaultTimeout: 60000, enablePatternLearning: false, publishEvents: false }
      );

      await limitedCoordinator.initialize();

      // All should complete even if queued
      const requests = Array(4).fill({
        sourceFiles: ['src/x.ts'],
        testType: 'unit' as const,
        framework: 'vitest' as const,
      });

      const results = await Promise.all(
        requests.map(req => limitedCoordinator.generateTests(req))
      );

      expect(results.every(r => r !== undefined)).toBe(true);

      await limitedCoordinator.dispose();
    });
  });

  describe('Error Handling', () => {
    it('should handle coordinator not initialized', async () => {
      const uninitCoordinator = new TestGenerationCoordinator(
        eventBus,
        memory,
        agentCoordinator
      );

      // Don't initialize - try to use
      const request = {
        sourceFiles: ['src/test.ts'],
        testType: 'unit' as const,
        framework: 'vitest' as const,
      };

      const result = await uninitCoordinator.generateTests(request);

      // Should handle gracefully
      expect(result).toBeDefined();
    });
  });
});
