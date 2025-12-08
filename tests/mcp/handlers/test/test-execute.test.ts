/**
 * test-execute Test Suite (TDD RED Phase)
 *
 * Tests for TestExecuteHandler - Orchestrated parallel test execution.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestExecuteHandler } from '@mcp/handlers/test-execute';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock dependencies
jest.mock('@mcp/services/AgentRegistry');
jest.mock('@mcp/services/HookExecutor');

describe('TestExecuteHandler', () => {
  let handler: TestExecuteHandler;
  let mockRegistry: jest.Mocked<AgentRegistry>;
  let mockHookExecutor: jest.Mocked<HookExecutor>;

  beforeEach(() => {
    mockRegistry = {
      spawnAgent: jest.fn().mockResolvedValue({ id: 'agent-test-executor-1', type: 'test-executor' })
    } as any;

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue({}),
      executePostTask: jest.fn().mockResolvedValue({}),
      executeHook: jest.fn().mockResolvedValue({})
    } as any;

    handler = new TestExecuteHandler(mockRegistry, mockHookExecutor);
  });

  describe('Happy Path - Test Suite Execution', () => {
    it('should execute test suite successfully with Jest framework', async () => {
      // GIVEN: Valid test execution specification with Jest
      const args = {
        spec: {
          testSuites: ['tests/unit/*.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: Returns successful execution result
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.id).toMatch(/^execution-/);
      expect(response.data.status).toBe('completed');
      expect(response.data.results).toBeDefined();
      expect(response.data.results.summary).toMatchObject({
        total: expect.any(Number),
        passed: expect.any(Number),
        failed: expect.any(Number),
        skipped: expect.any(Number),
        retried: expect.any(Number)
      });
    });

    it('should execute tests with Vitest framework', async () => {
      // GIVEN: Test specification with Vitest
      const args = {
        spec: {
          testSuites: ['src/**/*.spec.ts'],
          framework: 'vitest',
          parallelExecution: true,
          retryCount: 1,
          timeoutSeconds: 60,
          reportFormat: 'html'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: Returns execution with framework info
      expect(response.success).toBe(true);
      expect(response.data.spec.framework).toBe('vitest');
    });

    it('should execute tests with Mocha framework', async () => {
      // GIVEN: Test specification with Mocha
      const args = {
        spec: {
          testSuites: ['test/*.js'],
          framework: 'mocha',
          parallelExecution: false,
          retryCount: 2,
          timeoutSeconds: 45,
          reportFormat: 'junit'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: Returns successful execution
      expect(response.success).toBe(true);
      expect(response.data.spec.framework).toBe('mocha');
      expect(response.data.spec.retryCount).toBe(2);
    });
  });

  describe('Parallel Execution', () => {
    it('should execute tests in parallel when enabled', async () => {
      // GIVEN: Multiple test suites with parallel execution enabled
      const args = {
        spec: {
          testSuites: ['tests/unit/*.test.ts', 'tests/integration/*.test.ts', 'tests/e2e/*.test.ts'],
          framework: 'jest',
          parallelExecution: true,
          retryCount: 1,
          timeoutSeconds: 120,
          reportFormat: 'html'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: Returns results for all suites
      expect(response.success).toBe(true);
      expect(response.data.results.suiteResults.length).toBeGreaterThanOrEqual(0);
      expect(response.data.spec.parallelExecution).toBe(true);
    });

    it('should execute tests sequentially when parallel disabled', async () => {
      // GIVEN: Multiple test suites with sequential execution
      const args = {
        spec: {
          testSuites: ['tests/api/*.test.ts', 'tests/db/*.test.ts'],
          framework: 'vitest',
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 90,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: Returns sequential execution results
      expect(response.success).toBe(true);
      expect(response.data.spec.parallelExecution).toBe(false);
    });
  });

  describe('Multiple Environments', () => {
    it('should execute tests across multiple environments', async () => {
      // GIVEN: Test suite with multiple environments
      const args = {
        spec: {
          testSuites: ['tests/cross-env/*.test.ts'],
          framework: 'jest',
          environments: ['node', 'jsdom', 'happy-dom'],
          parallelExecution: true,
          retryCount: 1,
          timeoutSeconds: 60,
          reportFormat: 'html'
        },
        fleetId: 'fleet-multi-env-001'
      };

      // WHEN: Executing tests with fleet coordination
      const response = await handler.handle(args);

      // THEN: Returns results with agent assignments per environment
      expect(response.success).toBe(true);
      expect(response.data.fleetId).toBe('fleet-multi-env-001');
      expect(response.data.agentAssignments).toBeDefined();
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed tests when retryCount > 0', async () => {
      // GIVEN: Test specification with retry enabled
      const args = {
        spec: {
          testSuites: ['tests/flaky/*.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 3,
          timeoutSeconds: 45,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing flaky tests
      const response = await handler.handle(args);

      // THEN: Returns results with retry information
      expect(response.success).toBe(true);
      expect(response.data.spec.retryCount).toBe(3);
      expect(response.data.results.summary.retried).toBeGreaterThanOrEqual(0);
    });

    it('should not retry when retryCount is 0', async () => {
      // GIVEN: Test specification with no retries
      const args = {
        spec: {
          testSuites: ['tests/stable/*.test.ts'],
          framework: 'vitest',
          parallelExecution: true,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'html'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: No retries performed
      expect(response.success).toBe(true);
      expect(response.data.spec.retryCount).toBe(0);
    });
  });

  describe('Timeout Handling', () => {
    it('should respect timeout settings', async () => {
      // GIVEN: Test with specific timeout
      const args = {
        spec: {
          testSuites: ['tests/long-running/*.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 180,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: Timeout is respected
      expect(response.success).toBe(true);
      expect(response.data.spec.timeoutSeconds).toBe(180);
    });

    it('should handle minimum timeout boundary', async () => {
      // GIVEN: Test with minimum timeout (10 seconds)
      const args = {
        spec: {
          testSuites: ['tests/quick/*.test.ts'],
          framework: 'vitest',
          parallelExecution: true,
          retryCount: 0,
          timeoutSeconds: 10,
          reportFormat: 'html'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: Minimum timeout is accepted
      expect(response.success).toBe(true);
      expect(response.data.spec.timeoutSeconds).toBe(10);
    });
  });

  describe('Coverage Collection', () => {
    it('should collect coverage when enabled', async () => {
      // GIVEN: Test specification with coverage enabled
      const args = {
        spec: {
          testSuites: ['tests/unit/*.test.ts'],
          framework: 'jest',
          parallelExecution: true,
          retryCount: 0,
          timeoutSeconds: 60,
          reportFormat: 'html',
          coverageThreshold: 80
        }
      };

      // WHEN: Executing tests with coverage
      const response = await handler.handle(args);

      // THEN: Coverage data is included
      expect(response.success).toBe(true);
      expect(response.data.results.coverage).toBeDefined();
      expect(response.data.results.coverage.overall).toBeGreaterThanOrEqual(0);
      expect(response.data.results.coverage.passed).toBeDefined();
    });
  });

  describe('Result Aggregation', () => {
    it('should aggregate results from all suites', async () => {
      // GIVEN: Multiple test suites
      const args = {
        spec: {
          testSuites: [
            'tests/unit/*.test.ts',
            'tests/integration/*.test.ts',
            'tests/e2e/*.test.ts'
          ],
          framework: 'jest',
          parallelExecution: true,
          retryCount: 1,
          timeoutSeconds: 120,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing all test suites
      const response = await handler.handle(args);

      // THEN: Returns aggregated summary
      expect(response.success).toBe(true);
      expect(response.data.results.summary).toBeDefined();
      expect(response.data.results.summary.total).toBeGreaterThanOrEqual(0);
      expect(
        response.data.results.summary.passed +
        response.data.results.summary.failed +
        response.data.results.summary.skipped
      ).toBe(response.data.results.summary.total);
    });
  });

  describe('Artifact Generation', () => {
    it('should generate test report artifacts', async () => {
      // GIVEN: Test execution that generates artifacts
      const args = {
        spec: {
          testSuites: ['tests/**/*.test.ts'],
          framework: 'jest',
          parallelExecution: true,
          retryCount: 0,
          timeoutSeconds: 60,
          reportFormat: 'html'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: Artifacts are generated
      expect(response.success).toBe(true);
      expect(response.data.results.artifacts).toBeDefined();
      expect(response.data.results.artifacts.length).toBeGreaterThan(0);
      expect(response.data.results.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: expect.stringMatching(/report|coverage|performance/),
            name: expect.any(String),
            path: expect.any(String),
            size: expect.any(Number)
          })
        ])
      );
    });
  });

  describe('Performance Metrics', () => {
    it('should track performance metrics', async () => {
      // GIVEN: Test execution
      const args = {
        spec: {
          testSuites: ['tests/performance/*.test.ts'],
          framework: 'vitest',
          parallelExecution: true,
          retryCount: 0,
          timeoutSeconds: 90,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing tests
      const response = await handler.handle(args);

      // THEN: Performance metrics are calculated
      expect(response.success).toBe(true);
      expect(response.data.results.performance).toBeDefined();
      expect(response.data.results.performance).toMatchObject({
        totalExecutionTime: expect.any(Number),
        averageTestTime: expect.any(Number),
        parallelismEfficiency: expect.any(Number),
        resourceUtilization: {
          cpu: expect.any(Number),
          memory: expect.any(Number),
          network: expect.any(Number)
        }
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject missing spec', async () => {
      // GIVEN: Invalid args without spec
      const args = {} as any;

      // WHEN: Attempting execution
      const response = await handler.handle(args);

      // THEN: Returns validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('spec');
    });

    it('should reject empty test suites', async () => {
      // GIVEN: Spec with empty test suites
      const args = {
        spec: {
          testSuites: [],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json'
        }
      };

      // WHEN: Attempting execution
      const response = await handler.handle(args);

      // THEN: Returns validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('test suite');
    });

    it('should reject invalid retry count (negative)', async () => {
      // GIVEN: Spec with negative retry count
      const args = {
        spec: {
          testSuites: ['tests/*.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: -1,
          timeoutSeconds: 30,
          reportFormat: 'json'
        }
      };

      // WHEN: Attempting execution
      const response = await handler.handle(args);

      // THEN: Returns validation error
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/retry.*between 0 and 5/i);
    });

    it('should reject invalid retry count (too high)', async () => {
      // GIVEN: Spec with retry count > 5
      const args = {
        spec: {
          testSuites: ['tests/*.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 10,
          timeoutSeconds: 30,
          reportFormat: 'json'
        }
      };

      // WHEN: Attempting execution
      const response = await handler.handle(args);

      // THEN: Returns validation error
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/retry.*between 0 and 5/i);
    });

    it('should reject timeout less than 10 seconds', async () => {
      // GIVEN: Spec with timeout < 10 seconds
      const args = {
        spec: {
          testSuites: ['tests/*.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 5,
          reportFormat: 'json'
        }
      };

      // WHEN: Attempting execution
      const response = await handler.handle(args);

      // THEN: Returns validation error
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/timeout.*at least 10 seconds/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single test suite', async () => {
      // GIVEN: Single test suite
      const args = {
        spec: {
          testSuites: ['tests/single.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing single test
      const response = await handler.handle(args);

      // THEN: Returns successful execution
      expect(response.success).toBe(true);
      expect(response.data.spec.testSuites.length).toBe(1);
    });

    it('should handle large number of test suites', async () => {
      // GIVEN: Many test suites
      const testSuites = Array.from({ length: 100 }, (_, i) => `tests/suite-${i}.test.ts`);
      const args = {
        spec: {
          testSuites,
          framework: 'vitest',
          parallelExecution: true,
          retryCount: 0,
          timeoutSeconds: 300,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing many tests
      const response = await handler.handle(args);

      // THEN: Handles large volume
      expect(response.success).toBe(true);
      expect(response.data.spec.testSuites.length).toBe(100);
    });

    it('should handle concurrent execution requests', async () => {
      // GIVEN: Multiple concurrent execution requests
      const args = {
        spec: {
          testSuites: ['tests/concurrent/*.test.ts'],
          framework: 'jest',
          parallelExecution: true,
          retryCount: 0,
          timeoutSeconds: 60,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing multiple concurrent requests
      const promises = Array.from({ length: 3 }, () => handler.handle(args));
      const results = await Promise.all(promises);

      // THEN: All executions complete successfully
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.id).toMatch(/^execution-/);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle hook execution failures gracefully', async () => {
      // GIVEN: Hook executor that fails
      mockHookExecutor.executePreTask.mockRejectedValueOnce(new Error('Hook failed'));

      const args = {
        spec: {
          testSuites: ['tests/unit/*.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing tests with failing hook
      const response = await handler.handle(args);

      // THEN: Error is handled gracefully
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle agent spawn failures', async () => {
      // GIVEN: Registry that fails to spawn agent
      mockRegistry.spawnAgent.mockRejectedValueOnce(new Error('Spawn failed'));

      const args = {
        spec: {
          testSuites: ['tests/unit/*.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json'
        }
      };

      // WHEN: Executing tests with spawn failure
      const response = await handler.handle(args);

      // THEN: Error is reported
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('Execution Queue Management', () => {
    it('should queue executions when at max concurrent limit', async () => {
      // GIVEN: Multiple execution requests
      const args = {
        spec: {
          testSuites: ['tests/*.test.ts'],
          framework: 'jest',
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json'
        }
      };

      // WHEN: Submitting many concurrent requests
      const promises = Array.from({ length: 10 }, () => handler.handle(args));
      const results = await Promise.all(promises);

      // THEN: All complete successfully (some queued)
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});
