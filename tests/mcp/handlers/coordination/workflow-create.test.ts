/**
 * Workflow Create Handler Test Suite (RED Phase)
 *
 * Tests for creating QE workflows with validation, checkpoints, and dependency management.
 * Following TDD RED phase - tests should FAIL initially.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WorkflowCreateHandler } from '@mcp/handlers/coordination/workflow-create';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('WorkflowCreateHandler', () => {
  let handler: WorkflowCreateHandler;
  let mockRegistry: any;
  let mockHookExecutor: any;

  beforeEach(() => {
    mockRegistry = {
      getAgent: jest.fn(),
      registerAgent: jest.fn()
    };

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined)
    };

    handler = new WorkflowCreateHandler(mockRegistry, mockHookExecutor);
  });

  describe('Happy Path', () => {
    it('should create workflow with valid steps', async () => {
      // GIVEN: Valid workflow definition with sequential steps
      const args = {
        name: 'Test Generation Workflow',
        description: 'Generate and validate test suite',
        steps: [
          {
            id: 'generate-tests',
            name: 'Generate Tests',
            type: 'test-generation',
            dependencies: []
          },
          {
            id: 'run-tests',
            name: 'Run Tests',
            type: 'test-execution',
            dependencies: ['generate-tests']
          }
        ]
      };

      // WHEN: Creating workflow
      const result = await handler.handle(args);

      // THEN: Returns success with workflow ID and validation status
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        workflowId: expect.stringMatching(/^workflow-\d+-[a-z0-9]{3}$/),
        name: 'Test Generation Workflow',
        steps: expect.arrayContaining([
          expect.objectContaining({ id: 'generate-tests' }),
          expect.objectContaining({ id: 'run-tests' })
        ]),
        validationStatus: {
          isValid: true,
          errors: [],
          warnings: []
        }
      });
      expect(mockHookExecutor.executePostTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: expect.stringMatching(/^workflow-/),
          results: expect.objectContaining({
            name: 'Test Generation Workflow',
            stepsCount: 2
          })
        })
      );
    });

    it('should create workflow with checkpoint configuration', async () => {
      // GIVEN: Workflow with custom checkpoint settings
      const args = {
        name: 'Performance Test Workflow',
        steps: [
          {
            id: 'load-test',
            name: 'Load Testing',
            type: 'performance',
            dependencies: []
          }
        ],
        checkpoints: {
          enabled: true,
          frequency: 'after-each-step' as const,
          interval: 60000
        },
        metadata: {
          environment: 'staging',
          testType: 'performance'
        }
      };

      // WHEN: Creating workflow with checkpoints
      const result = await handler.handle(args);

      // THEN: Returns workflow with checkpoint configuration
      expect(result.success).toBe(true);
      expect(result.data?.checkpoints).toEqual({
        enabled: true,
        frequency: 'after-each-step',
        interval: 60000
      });
      expect(result.data?.metadata).toMatchObject({
        environment: 'staging',
        testType: 'performance'
      });
    });

    it('should handle workflow with parallel dependencies', async () => {
      // GIVEN: Workflow with parallel executable steps
      const args = {
        name: 'Parallel Test Suite',
        steps: [
          {
            id: 'unit-tests',
            name: 'Unit Tests',
            type: 'test',
            dependencies: []
          },
          {
            id: 'integration-tests',
            name: 'Integration Tests',
            type: 'test',
            dependencies: []
          },
          {
            id: 'report',
            name: 'Generate Report',
            type: 'reporting',
            dependencies: ['unit-tests', 'integration-tests']
          }
        ]
      };

      // WHEN: Creating workflow with parallel dependencies
      const result = await handler.handle(args);

      // THEN: Returns workflow with valid dependency graph
      expect(result.success).toBe(true);
      expect(result.data?.steps).toHaveLength(3);
      expect(result.data?.validationStatus.isValid).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should reject workflow without name', async () => {
      // GIVEN: Workflow missing required name field
      const args = {
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            type: 'test',
            dependencies: []
          }
        ]
      } as any;

      // WHEN: Creating workflow without name
      const result = await handler.handle(args);

      // THEN: Returns validation error
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/required.*name/i);
    });

    it('should reject workflow without steps', async () => {
      // GIVEN: Workflow with empty steps array
      const args = {
        name: 'Empty Workflow',
        steps: []
      };

      // WHEN: Creating workflow with no steps
      const result = await handler.handle(args);

      // THEN: Returns validation error for empty steps
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/at least one step/i);
    });

    it('should reject workflow with duplicate step IDs', async () => {
      // GIVEN: Workflow with duplicate step identifiers
      const args = {
        name: 'Duplicate Steps',
        steps: [
          {
            id: 'test-step',
            name: 'First Step',
            type: 'test',
            dependencies: []
          },
          {
            id: 'test-step',
            name: 'Second Step',
            type: 'test',
            dependencies: []
          }
        ]
      };

      // WHEN: Creating workflow with duplicate IDs
      const result = await handler.handle(args);

      // THEN: Returns validation error for duplicates
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/duplicate step id/i);
    });

    it('should reject workflow with invalid dependencies', async () => {
      // GIVEN: Workflow with non-existent dependency reference
      const args = {
        name: 'Invalid Dependencies',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            type: 'test',
            dependencies: ['non-existent-step']
          }
        ]
      };

      // WHEN: Creating workflow with invalid dependency
      const result = await handler.handle(args);

      // THEN: Returns validation error for invalid dependency
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid dependency.*non-existent-step/i);
    });

    it('should reject workflow with circular dependencies', async () => {
      // GIVEN: Workflow with circular dependency chain
      const args = {
        name: 'Circular Dependencies',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            type: 'test',
            dependencies: ['step2']
          },
          {
            id: 'step2',
            name: 'Step 2',
            type: 'test',
            dependencies: ['step1']
          }
        ]
      };

      // WHEN: Creating workflow with circular dependencies
      const result = await handler.handle(args);

      // THEN: Returns validation error for circular dependency
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/circular dependency/i);
    });

    it('should warn about workflows with too many steps', async () => {
      // GIVEN: Workflow with more than 20 steps
      const steps = Array.from({ length: 25 }, (_, i) => ({
        id: `step-${i}`,
        name: `Step ${i}`,
        type: 'test',
        dependencies: []
      }));

      const args = {
        name: 'Large Workflow',
        steps
      };

      // WHEN: Creating workflow with many steps
      const result = await handler.handle(args);

      // THEN: Returns success with warning about step count
      expect(result.success).toBe(true);
      expect(result.data?.validationStatus.warnings).toContain(
        expect.stringMatching(/more than 20 steps/i)
      );
    });

    it('should reject step missing required fields', async () => {
      // GIVEN: Step without required name and type fields
      const args = {
        name: 'Invalid Step',
        steps: [
          {
            id: 'incomplete-step',
            dependencies: []
          } as any
        ]
      };

      // WHEN: Creating workflow with incomplete step
      const result = await handler.handle(args);

      // THEN: Returns validation error for missing fields
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/(missing name|missing type)/i);
    });
  });

  describe('Boundary Cases', () => {
    it('should handle workflow with single step (minimum)', async () => {
      // GIVEN: Workflow with exactly one step
      const args = {
        name: 'Single Step',
        steps: [
          {
            id: 'only-step',
            name: 'Only Step',
            type: 'test',
            dependencies: []
          }
        ]
      };

      // WHEN: Creating minimal workflow
      const result = await handler.handle(args);

      // THEN: Returns success with single step
      expect(result.success).toBe(true);
      expect(result.data?.steps).toHaveLength(1);
    });

    it('should handle workflow with exactly 20 steps (boundary)', async () => {
      // GIVEN: Workflow with exactly 20 steps (warning threshold)
      const steps = Array.from({ length: 20 }, (_, i) => ({
        id: `step-${i}`,
        name: `Step ${i}`,
        type: 'test',
        dependencies: []
      }));

      const args = {
        name: 'Boundary Workflow',
        steps
      };

      // WHEN: Creating workflow at warning boundary
      const result = await handler.handle(args);

      // THEN: Returns success without warning
      expect(result.success).toBe(true);
      expect(result.data?.validationStatus.warnings).toHaveLength(0);
    });

    it('should handle workflow with complex dependency graph', async () => {
      // GIVEN: Workflow with deep dependency chain
      const args = {
        name: 'Deep Dependencies',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            type: 'test',
            dependencies: []
          },
          {
            id: 'step2',
            name: 'Step 2',
            type: 'test',
            dependencies: ['step1']
          },
          {
            id: 'step3',
            name: 'Step 3',
            type: 'test',
            dependencies: ['step2']
          },
          {
            id: 'step4',
            name: 'Step 4',
            type: 'test',
            dependencies: ['step3']
          }
        ]
      };

      // WHEN: Creating workflow with deep dependencies
      const result = await handler.handle(args);

      // THEN: Returns success with valid chain
      expect(result.success).toBe(true);
      expect(result.data?.validationStatus.isValid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle workflow with optional retry policy', async () => {
      // GIVEN: Step with retry configuration
      const args = {
        name: 'Retryable Workflow',
        steps: [
          {
            id: 'flaky-test',
            name: 'Flaky Test',
            type: 'test',
            dependencies: [],
            retryPolicy: {
              maxRetries: 3,
              backoff: 'exponential' as const
            }
          }
        ]
      };

      // WHEN: Creating workflow with retry policy
      const result = await handler.handle(args);

      // THEN: Returns workflow with retry configuration preserved
      expect(result.success).toBe(true);
      expect(result.data?.steps[0].retryPolicy).toEqual({
        maxRetries: 3,
        backoff: 'exponential'
      });
    });

    it('should handle workflow with timeout configuration', async () => {
      // GIVEN: Step with custom timeout
      const args = {
        name: 'Timeout Workflow',
        steps: [
          {
            id: 'long-test',
            name: 'Long Running Test',
            type: 'test',
            dependencies: [],
            timeout: 300000, // 5 minutes
            config: {
              maxDuration: 300000
            }
          }
        ]
      };

      // WHEN: Creating workflow with timeout
      const result = await handler.handle(args);

      // THEN: Returns workflow with timeout preserved
      expect(result.success).toBe(true);
      expect(result.data?.steps[0].timeout).toBe(300000);
    });

    it('should use default checkpoint settings when not provided', async () => {
      // GIVEN: Workflow without explicit checkpoint configuration
      const args = {
        name: 'Default Checkpoints',
        steps: [
          {
            id: 'test',
            name: 'Test',
            type: 'test',
            dependencies: []
          }
        ]
      };

      // WHEN: Creating workflow without checkpoint config
      const result = await handler.handle(args);

      // THEN: Returns workflow with default checkpoint settings
      expect(result.success).toBe(true);
      expect(result.data?.checkpoints).toEqual({
        enabled: true,
        frequency: 'after-each-step'
      });
    });
  });
});
