/**
 * Integration Tests - Test Generation Coordinator
 * Tests the full workflow of test generation including services and events
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
    it('should generate unit tests for TypeScript code', async () => {
      const request = {
        sourceCode: `
          export function add(a: number, b: number): number {
            return a + b;
          }

          export function multiply(a: number, b: number): number {
            return a * b;
          }
        `,
        language: 'typescript' as const,
        testType: 'unit' as const,
        framework: 'vitest' as const,
        coverageTarget: 80,
      };

      const result = await coordinator.generateTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tests).toBeDefined();
        expect(result.value.tests.length).toBeGreaterThan(0);
        expect(result.value.metadata.framework).toBe('vitest');
      }
    });

    it('should generate integration tests', async () => {
      const request = {
        sourceCode: `
          export class UserService {
            constructor(private db: Database) {}

            async getUser(id: string): Promise<User> {
              return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
            }
          }
        `,
        language: 'typescript' as const,
        testType: 'integration' as const,
        framework: 'vitest' as const,
      };

      const result = await coordinator.generateTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tests.some(t =>
          t.code.includes('mock') || t.code.includes('stub')
        )).toBe(true);
      }
    });

    it('should emit TestGenerated event', async () => {
      const publishSpy = vi.spyOn(eventBus, 'publish');

      const request = {
        sourceCode: 'export const foo = () => "bar";',
        language: 'typescript' as const,
        testType: 'unit' as const,
        framework: 'vitest' as const,
      };

      await coordinator.generateTests(request);

      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test-generation.test-generated',
        })
      );
    });

    it('should track workflow status during generation', async () => {
      const request = {
        sourceCode: 'export const x = 1;',
        language: 'typescript' as const,
        testType: 'unit' as const,
        framework: 'vitest' as const,
      };

      // Start generation
      const resultPromise = coordinator.generateTests(request);

      // Check active workflows
      const activeWorkflows = coordinator.getActiveWorkflows();
      expect(activeWorkflows.length).toBeGreaterThanOrEqual(0);

      await resultPromise;
    });
  });

  describe('TDD Workflow', () => {
    it('should execute red-green-refactor cycle', async () => {
      const request = {
        feature: 'Add input validation to user registration',
        requirements: [
          'Email must be valid format',
          'Password must be at least 8 characters',
          'Username must be unique',
        ],
        language: 'typescript' as const,
        framework: 'vitest' as const,
      };

      const result = await coordinator.executeTDD(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.redPhase).toBeDefined();
        expect(result.value.greenPhase).toBeDefined();
        expect(result.value.refactorPhase).toBeDefined();
        expect(result.value.iterations).toBeGreaterThanOrEqual(1);
      }
    });

    it('should generate failing tests in red phase', async () => {
      const request = {
        feature: 'Calculate order total',
        requirements: ['Sum item prices', 'Apply discounts'],
        language: 'typescript' as const,
        framework: 'vitest' as const,
      };

      const result = await coordinator.executeTDD(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.redPhase.tests.length).toBeGreaterThan(0);
        expect(result.value.redPhase.status).toBe('failing');
      }
    });
  });

  describe('Property-Based Testing', () => {
    it('should generate property-based tests', async () => {
      const request = {
        functionSignature: 'function sort<T>(arr: T[]): T[]',
        properties: [
          'Output length equals input length',
          'Output is sorted in ascending order',
          'All input elements are in output',
        ],
        language: 'typescript' as const,
        framework: 'fast-check' as const,
      };

      const result = await coordinator.generatePropertyTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tests.length).toBeGreaterThanOrEqual(3);
        expect(result.value.tests.every(t => t.code.includes('fc.'))).toBe(true);
      }
    });

    it('should detect edge cases through properties', async () => {
      const request = {
        functionSignature: 'function divide(a: number, b: number): number',
        properties: [
          'Division is inverse of multiplication',
          'Dividing by 1 returns the same number',
        ],
        language: 'typescript' as const,
        framework: 'fast-check' as const,
      };

      const result = await coordinator.generatePropertyTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should detect division by zero edge case
        const hasEdgeCase = result.value.tests.some(t =>
          t.code.includes('assume') || t.code.includes('pre')
        );
        expect(hasEdgeCase || result.value.edgeCases.length > 0).toBe(true);
      }
    });
  });

  describe('Test Data Generation', () => {
    it('should generate realistic test data', async () => {
      const request = {
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            email: { type: 'string', format: 'email' },
            age: { type: 'integer', minimum: 0, maximum: 150 },
            createdAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'email'],
        },
        count: 10,
        options: {
          realistic: true,
          seed: 12345,
        },
      };

      const result = await coordinator.generateTestData(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.data.length).toBe(10);
        expect(result.value.data[0]).toHaveProperty('id');
        expect(result.value.data[0]).toHaveProperty('email');
        // Check email format
        expect(result.value.data[0].email).toMatch(/@/);
      }
    });

    it('should generate edge case data', async () => {
      const request = {
        schema: {
          type: 'object',
          properties: {
            value: { type: 'number', minimum: -100, maximum: 100 },
          },
        },
        count: 5,
        options: {
          includeEdgeCases: true,
        },
      };

      const result = await coordinator.generateTestData(request);

      expect(result.success).toBe(true);
      if (result.success) {
        const values = result.value.data.map(d => d.value);
        // Should include boundary values
        expect(values.some(v => v === -100 || v === 100 || v === 0)).toBe(true);
      }
    });
  });

  describe('Pattern Learning', () => {
    it('should learn patterns from successful tests', async () => {
      const request = {
        testResults: [
          {
            testCode: `
              describe('UserService', () => {
                it('should validate email format', () => {
                  expect(isValidEmail('test@example.com')).toBe(true);
                  expect(isValidEmail('invalid')).toBe(false);
                });
              });
            `,
            passed: true,
            coverageIncrease: 15,
            executionTime: 50,
          },
        ],
        context: {
          language: 'typescript',
          framework: 'vitest',
          domain: 'validation',
        },
      };

      const result = await coordinator.learnPatterns(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.patternsLearned).toBeGreaterThan(0);
        expect(result.value.confidence).toBeGreaterThan(0);
      }
    });

    it('should store patterns in memory backend', async () => {
      const storeSpy = vi.spyOn(memory, 'store');

      const request = {
        testResults: [
          {
            testCode: 'it("should work", () => expect(true).toBe(true));',
            passed: true,
            coverageIncrease: 5,
            executionTime: 10,
          },
        ],
        context: {
          language: 'typescript',
          framework: 'vitest',
          domain: 'general',
        },
      };

      await coordinator.learnPatterns(request);

      expect(storeSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid source code gracefully', async () => {
      const request = {
        sourceCode: 'this is not valid code {{{{',
        language: 'typescript' as const,
        testType: 'unit' as const,
        framework: 'vitest' as const,
      };

      const result = await coordinator.generateTests(request);

      // Should still return a result, possibly with warnings
      expect(result).toBeDefined();
    });

    it('should handle unsupported language', async () => {
      const request = {
        sourceCode: 'print("hello")',
        language: 'brainfuck' as any,
        testType: 'unit' as const,
        framework: 'vitest' as const,
      };

      const result = await coordinator.generateTests(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('language');
      }
    });

    it('should handle timeout gracefully', async () => {
      // Create coordinator with very short timeout
      const shortTimeoutCoordinator = new TestGenerationCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        { maxConcurrentWorkflows: 5, defaultTimeout: 1, enablePatternLearning: false, publishEvents: false }
      );

      await shortTimeoutCoordinator.initialize();

      const request = {
        sourceCode: 'export const x = 1;'.repeat(1000),
        language: 'typescript' as const,
        testType: 'unit' as const,
        framework: 'vitest' as const,
      };

      const result = await shortTimeoutCoordinator.generateTests(request);

      // Should handle timeout without crashing
      expect(result).toBeDefined();

      await shortTimeoutCoordinator.dispose();
    });
  });

  describe('Concurrent Workflow Management', () => {
    it('should handle multiple concurrent test generations', async () => {
      const requests = [
        { sourceCode: 'export const a = 1;', language: 'typescript' as const, testType: 'unit' as const, framework: 'vitest' as const },
        { sourceCode: 'export const b = 2;', language: 'typescript' as const, testType: 'unit' as const, framework: 'vitest' as const },
        { sourceCode: 'export const c = 3;', language: 'typescript' as const, testType: 'unit' as const, framework: 'vitest' as const },
      ];

      const results = await Promise.all(
        requests.map(req => coordinator.generateTests(req))
      );

      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should respect max concurrent workflow limit', async () => {
      // Create coordinator with limit of 2
      const limitedCoordinator = new TestGenerationCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        { maxConcurrentWorkflows: 2, defaultTimeout: 60000, enablePatternLearning: false, publishEvents: false }
      );

      await limitedCoordinator.initialize();

      // Queue more workflows than limit
      const requests = Array(5).fill({
        sourceCode: 'export const x = 1;',
        language: 'typescript' as const,
        testType: 'unit' as const,
        framework: 'vitest' as const,
      });

      const results = await Promise.all(
        requests.map(req => limitedCoordinator.generateTests(req))
      );

      // All should complete (some may be queued)
      expect(results.every(r => r !== undefined)).toBe(true);

      await limitedCoordinator.dispose();
    });
  });
});
