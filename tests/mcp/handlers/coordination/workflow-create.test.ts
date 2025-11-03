/**
 * coordination/workflow-create Test Suite
 *
 * Tests for workflow creation with dependencies.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WorkflowCreateHandler, WorkflowCreateArgs, Workflow, WorkflowStepDefinition } from '@mcp/handlers/coordination/workflow-create';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('WorkflowCreateHandler', () => {
  let handler: WorkflowCreateHandler;
  let mockRegistry: jest.Mocked<AgentRegistry>;
  let mockHookExecutor: jest.Mocked<HookExecutor>;

  beforeEach(() => {
    // Create mock services
    mockRegistry = {
      registerAgent: jest.fn(),
      getAgent: jest.fn(),
      listAgents: jest.fn(),
      unregisterAgent: jest.fn()
    } as any;

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      executePostEdit: jest.fn().mockResolvedValue(undefined)
    } as any;

    handler = new WorkflowCreateHandler(mockRegistry, mockHookExecutor);
  });

  describe('Happy Path', () => {
    it('should create workflow with valid steps successfully', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'init',
          name: 'Initialize Environment',
          type: 'setup',
          dependencies: [],
          timeout: 30000,
          config: { environment: 'staging' }
        },
        {
          id: 'test',
          name: 'Run Tests',
          type: 'test',
          dependencies: ['init'],
          timeout: 120000,
          retryPolicy: {
            maxRetries: 3,
            backoff: 'exponential'
          },
          config: { testSuite: 'unit' }
        },
        {
          id: 'deploy',
          name: 'Deploy Application',
          type: 'deployment',
          dependencies: ['test'],
          timeout: 180000,
          config: { target: 'production' }
        }
      ];

      const args: WorkflowCreateArgs = {
        name: 'CI/CD Pipeline',
        description: 'Continuous integration and deployment workflow',
        steps,
        checkpoints: {
          enabled: true,
          frequency: 'after-each-step'
        },
        metadata: {
          team: 'platform',
          priority: 'high'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.workflowId).toMatch(/^workflow-\d+-[a-zA-Z0-9]+$/);
      expect(response.data.name).toBe('CI/CD Pipeline');
      expect(response.data.steps).toHaveLength(3);
      expect(response.data.checkpoints.enabled).toBe(true);
      expect(response.data.checkpoints.frequency).toBe('after-each-step');
      expect(response.data.validationStatus.isValid).toBe(true);
      expect(response.data.validationStatus.errors).toHaveLength(0);

      // Verify post-task hook was called
      expect(mockHookExecutor.executePostTask).toHaveBeenCalledWith({
        taskId: response.data.workflowId,
        results: expect.objectContaining({
          workflowId: response.data.workflowId,
          name: 'CI/CD Pipeline',
          stepsCount: 3
        })
      });
    });

    it('should return expected data structure with all workflow fields', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'build',
          name: 'Build Project',
          type: 'build',
          dependencies: []
        },
        {
          id: 'verify',
          name: 'Verify Build',
          type: 'verification',
          dependencies: ['build']
        }
      ];

      const args: WorkflowCreateArgs = {
        name: 'Build Workflow',
        description: 'Standard build and verification workflow',
        steps
      };

      const response = await handler.handle(args);

      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
      expect(response.metadata).toHaveProperty('timestamp');

      const workflow: Workflow = response.data;
      expect(workflow).toHaveProperty('workflowId');
      expect(workflow).toHaveProperty('name');
      expect(workflow).toHaveProperty('description');
      expect(workflow).toHaveProperty('steps');
      expect(workflow).toHaveProperty('checkpoints');
      expect(workflow).toHaveProperty('metadata');
      expect(workflow).toHaveProperty('createdAt');
      expect(workflow).toHaveProperty('validationStatus');

      expect(workflow.validationStatus).toHaveProperty('isValid');
      expect(workflow.validationStatus).toHaveProperty('errors');
      expect(workflow.validationStatus).toHaveProperty('warnings');
    });

    it('should create workflow with default checkpoint configuration', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: []
        }
      ];

      const args: WorkflowCreateArgs = {
        name: 'Simple Workflow',
        steps
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.checkpoints.enabled).toBe(true);
      expect(response.data.checkpoints.frequency).toBe('after-each-step');
    });

    it('should create workflow with manual checkpoints', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: []
        }
      ];

      const args: WorkflowCreateArgs = {
        name: 'Manual Checkpoint Workflow',
        steps,
        checkpoints: {
          enabled: true,
          frequency: 'manual'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.checkpoints.frequency).toBe('manual');
    });

    it('should create workflow with timed checkpoints', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'long-running',
          name: 'Long Running Task',
          type: 'task',
          dependencies: [],
          timeout: 3600000
        }
      ];

      const args: WorkflowCreateArgs = {
        name: 'Timed Checkpoint Workflow',
        steps,
        checkpoints: {
          enabled: true,
          frequency: 'timed',
          interval: 300000 // 5 minutes
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.checkpoints.frequency).toBe('timed');
      expect(response.data.checkpoints.interval).toBe(300000);
    });

    it('should create workflow with complex dependency graph', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'init',
          name: 'Initialize',
          type: 'setup',
          dependencies: []
        },
        {
          id: 'build-frontend',
          name: 'Build Frontend',
          type: 'build',
          dependencies: ['init']
        },
        {
          id: 'build-backend',
          name: 'Build Backend',
          type: 'build',
          dependencies: ['init']
        },
        {
          id: 'test-frontend',
          name: 'Test Frontend',
          type: 'test',
          dependencies: ['build-frontend']
        },
        {
          id: 'test-backend',
          name: 'Test Backend',
          type: 'test',
          dependencies: ['build-backend']
        },
        {
          id: 'integration-test',
          name: 'Integration Tests',
          type: 'test',
          dependencies: ['build-frontend', 'build-backend']
        },
        {
          id: 'deploy',
          name: 'Deploy',
          type: 'deployment',
          dependencies: ['test-frontend', 'test-backend', 'integration-test']
        }
      ];

      const args: WorkflowCreateArgs = {
        name: 'Full Stack Deployment',
        description: 'Complete build, test, and deploy workflow',
        steps
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.steps).toHaveLength(7);
      expect(response.data.validationStatus.isValid).toBe(true);
    });

    it('should create workflow with retry policies', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'flaky-test',
          name: 'Flaky Test',
          type: 'test',
          dependencies: [],
          retryPolicy: {
            maxRetries: 5,
            backoff: 'exponential'
          }
        },
        {
          id: 'reliable-step',
          name: 'Reliable Step',
          type: 'task',
          dependencies: ['flaky-test'],
          retryPolicy: {
            maxRetries: 1,
            backoff: 'linear'
          }
        }
      ];

      const args: WorkflowCreateArgs = {
        name: 'Retry Policy Workflow',
        steps
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.steps[0].retryPolicy?.maxRetries).toBe(5);
      expect(response.data.steps[0].retryPolicy?.backoff).toBe('exponential');
      expect(response.data.steps[1].retryPolicy?.maxRetries).toBe(1);
      expect(response.data.steps[1].retryPolicy?.backoff).toBe('linear');
    });
  });

  describe('Input Validation', () => {
    it('should reject workflow without name', async () => {
      const response = await handler.handle({
        steps: []
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('name');
    });

    it('should reject workflow without steps', async () => {
      const response = await handler.handle({
        name: 'Invalid Workflow'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('steps');
    });

    it('should reject workflow with empty steps array', async () => {
      const response = await handler.handle({
        name: 'Empty Workflow',
        steps: []
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('at least one step');
    });

    it('should reject workflow with duplicate step IDs', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'duplicate',
          name: 'Step 1',
          type: 'task',
          dependencies: []
        },
        {
          id: 'duplicate',
          name: 'Step 2',
          type: 'task',
          dependencies: []
        }
      ];

      const response = await handler.handle({
        name: 'Duplicate Steps Workflow',
        steps
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Duplicate step ID');
    });

    it('should reject workflow with invalid dependency reference', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: ['non-existent-step']
        }
      ];

      const response = await handler.handle({
        name: 'Invalid Dependency Workflow',
        steps
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('invalid dependency');
    });

    it('should reject workflow with circular dependencies', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: ['step2']
        },
        {
          id: 'step2',
          name: 'Step 2',
          type: 'task',
          dependencies: ['step1']
        }
      ];

      const response = await handler.handle({
        name: 'Circular Dependency Workflow',
        steps
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Circular dependency');
    });

    it('should reject workflow with step missing name', async () => {
      const steps = [
        {
          id: 'step1',
          type: 'task',
          dependencies: []
        }
      ] as any;

      const response = await handler.handle({
        name: 'Missing Name Workflow',
        steps
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('missing name');
    });

    it('should reject workflow with step missing type', async () => {
      const steps = [
        {
          id: 'step1',
          name: 'Step 1',
          dependencies: []
        }
      ] as any;

      const response = await handler.handle({
        name: 'Missing Type Workflow',
        steps
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('missing type');
    });
  });

  describe('Error Handling', () => {
    it('should handle hook executor failure gracefully', async () => {
      mockHookExecutor.executePostTask.mockRejectedValue(new Error('Hook execution failed'));

      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: []
        }
      ];

      const response = await handler.handle({
        name: 'Hook Failure Workflow',
        steps
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should provide meaningful error messages for validation failures', async () => {
      const response = await handler.handle({
        name: 'Invalid Workflow',
        steps: []
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
      expect(typeof response.error).toBe('string');
    });

    it('should handle complex circular dependency detection', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: ['step3']
        },
        {
          id: 'step2',
          name: 'Step 2',
          type: 'task',
          dependencies: ['step1']
        },
        {
          id: 'step3',
          name: 'Step 3',
          type: 'task',
          dependencies: ['step2']
        }
      ];

      const response = await handler.handle({
        name: 'Complex Circular Workflow',
        steps
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Circular dependency');
    });

    it('should handle self-referencing step', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: ['step1']
        }
      ];

      const response = await handler.handle({
        name: 'Self Reference Workflow',
        steps
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Circular dependency');
    });
  });

  describe('Edge Cases', () => {
    it('should handle workflow with single step', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'only-step',
          name: 'Only Step',
          type: 'task',
          dependencies: []
        }
      ];

      const response = await handler.handle({
        name: 'Single Step Workflow',
        steps
      });

      expect(response.success).toBe(true);
      expect(response.data.steps).toHaveLength(1);
    });

    it('should handle workflow with maximum steps and show warning', async () => {
      const steps: WorkflowStepDefinition[] = Array.from({ length: 25 }, (_, i) => ({
        id: `step${i}`,
        name: `Step ${i}`,
        type: 'task',
        dependencies: i > 0 ? [`step${i - 1}`] : []
      }));

      const response = await handler.handle({
        name: 'Large Workflow',
        steps
      });

      expect(response.success).toBe(true);
      expect(response.data.steps).toHaveLength(25);
      expect(response.data.validationStatus.warnings.length).toBeGreaterThan(0);
      expect(response.data.validationStatus.warnings[0]).toContain('more than 20 steps');
    });

    it('should handle workflow with no dependencies', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: []
        },
        {
          id: 'step2',
          name: 'Step 2',
          type: 'task',
          dependencies: []
        },
        {
          id: 'step3',
          name: 'Step 3',
          type: 'task',
          dependencies: []
        }
      ];

      const response = await handler.handle({
        name: 'Parallel Steps Workflow',
        steps
      });

      expect(response.success).toBe(true);
      expect(response.data.steps.every(s => s.dependencies.length === 0)).toBe(true);
    });

    it('should handle workflow with complex nested metadata', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: [],
          config: {
            nested: {
              deeply: {
                nested: {
                  value: 'deep-value'
                }
              }
            },
            array: [1, 2, 3],
            complex: {
              key1: 'value1',
              key2: ['a', 'b', 'c']
            }
          }
        }
      ];

      const response = await handler.handle({
        name: 'Complex Metadata Workflow',
        steps,
        metadata: {
          project: 'test-project',
          tags: ['tag1', 'tag2'],
          config: {
            advanced: true
          }
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.steps[0].config?.nested.deeply.nested.value).toBe('deep-value');
      expect(response.data.metadata.project).toBe('test-project');
    });

    it('should handle workflow with special characters in names', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step-1',
          name: 'Step 1: Initialize & Setup (Production)',
          type: 'task',
          dependencies: []
        },
        {
          id: 'step-2',
          name: 'Step 2: Test <Critical> Components',
          type: 'test',
          dependencies: ['step-1']
        }
      ];

      const response = await handler.handle({
        name: 'Workflow with Special Characters: <>&"\'',
        steps
      });

      expect(response.success).toBe(true);
      expect(response.data.name).toContain('<>&"\'');
      expect(response.data.steps[0].name).toContain('&');
      expect(response.data.steps[1].name).toContain('<Critical>');
    });

    it('should handle concurrent workflow creation requests', async () => {
      const createWorkflow = (index: number) => {
        const steps: WorkflowStepDefinition[] = [
          {
            id: `step${index}`,
            name: `Step ${index}`,
            type: 'task',
            dependencies: []
          }
        ];

        return handler.handle({
          name: `Concurrent Workflow ${index}`,
          steps
        });
      };

      const promises = Array.from({ length: 10 }, (_, i) => createWorkflow(i));
      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result).toHaveProperty('success', true);
        expect(result.data.name).toBe(`Concurrent Workflow ${index}`);
      });

      // All workflow IDs should be unique
      const workflowIds = results.map(r => r.data.workflowId);
      const uniqueIds = new Set(workflowIds);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle workflow with very long dependency chain', async () => {
      const chainLength = 50;
      const steps: WorkflowStepDefinition[] = Array.from({ length: chainLength }, (_, i) => ({
        id: `chain-step-${i}`,
        name: `Chain Step ${i}`,
        type: 'task',
        dependencies: i > 0 ? [`chain-step-${i - 1}`] : []
      }));

      const response = await handler.handle({
        name: 'Long Chain Workflow',
        steps
      });

      expect(response.success).toBe(true);
      expect(response.data.steps).toHaveLength(chainLength);
      expect(response.data.steps[chainLength - 1].dependencies).toEqual([`chain-step-${chainLength - 2}`]);
    });

    it('should handle workflow with diamond dependency pattern', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'start',
          name: 'Start',
          type: 'task',
          dependencies: []
        },
        {
          id: 'left',
          name: 'Left Path',
          type: 'task',
          dependencies: ['start']
        },
        {
          id: 'right',
          name: 'Right Path',
          type: 'task',
          dependencies: ['start']
        },
        {
          id: 'end',
          name: 'End',
          type: 'task',
          dependencies: ['left', 'right']
        }
      ];

      const response = await handler.handle({
        name: 'Diamond Pattern Workflow',
        steps
      });

      expect(response.success).toBe(true);
      expect(response.data.steps).toHaveLength(4);
      expect(response.data.validationStatus.isValid).toBe(true);
    });

    it('should handle workflow with checkpoints disabled', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: []
        }
      ];

      const response = await handler.handle({
        name: 'No Checkpoints Workflow',
        steps,
        checkpoints: {
          enabled: false
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.checkpoints.enabled).toBe(false);
    });

    it('should handle workflow with on-failure checkpoints', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: [],
          retryPolicy: {
            maxRetries: 3,
            backoff: 'exponential'
          }
        }
      ];

      const response = await handler.handle({
        name: 'Failure Checkpoint Workflow',
        steps,
        checkpoints: {
          enabled: true,
          frequency: 'on-failure'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.checkpoints.frequency).toBe('on-failure');
    });
  });

  describe('Performance', () => {
    it('should complete workflow creation within reasonable time', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: []
        }
      ];

      const startTime = Date.now();
      await handler.handle({
        name: 'Performance Test Workflow',
        steps
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle rapid sequential workflow creation', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 50; i++) {
        const steps: WorkflowStepDefinition[] = [
          {
            id: `step${i}`,
            name: `Step ${i}`,
            type: 'task',
            dependencies: []
          }
        ];

        await handler.handle({
          name: `Rapid Workflow ${i}`,
          steps
        });
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / 50;

      expect(avgTime).toBeLessThan(100); // Average less than 100ms per workflow
    });

    it('should efficiently validate large workflow', async () => {
      const steps: WorkflowStepDefinition[] = Array.from({ length: 100 }, (_, i) => ({
        id: `step${i}`,
        name: `Step ${i}`,
        type: 'task',
        dependencies: i > 0 ? [`step${i - 1}`] : []
      }));

      const startTime = Date.now();
      await handler.handle({
        name: 'Large Validation Workflow',
        steps
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // Should complete in under 2 seconds
    });
  });

  describe('Workflow Retrieval', () => {
    it('should retrieve workflow by ID', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: []
        }
      ];

      const createResponse = await handler.handle({
        name: 'Retrievable Workflow',
        steps
      });

      const workflow = handler.getWorkflow(createResponse.data.workflowId);

      expect(workflow).toBeDefined();
      expect(workflow?.workflowId).toBe(createResponse.data.workflowId);
      expect(workflow?.name).toBe('Retrievable Workflow');
    });

    it('should return undefined for non-existent workflow', async () => {
      const workflow = handler.getWorkflow('non-existent-workflow-id');

      expect(workflow).toBeUndefined();
    });

    it('should list all created workflows', async () => {
      const workflowNames = ['Workflow 1', 'Workflow 2', 'Workflow 3'];

      for (const name of workflowNames) {
        await handler.handle({
          name,
          steps: [
            {
              id: 'step1',
              name: 'Step 1',
              type: 'task',
              dependencies: []
            }
          ]
        });
      }

      const workflows = handler.listWorkflows();

      expect(workflows.length).toBeGreaterThanOrEqual(3);
      const names = workflows.map(w => w.name);
      workflowNames.forEach(name => {
        expect(names).toContain(name);
      });
    });

    it('should return empty array when no workflows exist', async () => {
      const freshHandler = new WorkflowCreateHandler(mockRegistry, mockHookExecutor);
      const workflows = freshHandler.listWorkflows();

      expect(workflows).toEqual([]);
    });
  });

  describe('Validation Details', () => {
    it('should provide detailed validation errors', async () => {
      const steps = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: ['non-existent']
        },
        {
          id: 'step1', // Duplicate
          name: 'Step 1 Duplicate',
          type: 'task',
          dependencies: []
        },
        {
          id: 'step3',
          // Missing name
          type: 'task',
          dependencies: []
        },
        {
          id: 'step4',
          name: 'Step 4',
          // Missing type
          dependencies: []
        }
      ] as any;

      const response = await handler.handle({
        name: 'Multi-Error Workflow',
        steps
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Duplicate step ID');
    });

    it('should include warnings in validation status', async () => {
      const steps: WorkflowStepDefinition[] = Array.from({ length: 30 }, (_, i) => ({
        id: `step${i}`,
        name: `Step ${i}`,
        type: 'task',
        dependencies: []
      }));

      const response = await handler.handle({
        name: 'Warning Test Workflow',
        steps
      });

      expect(response.success).toBe(true);
      expect(response.data.validationStatus.warnings).toContain(
        expect.stringContaining('more than 20 steps')
      );
    });

    it('should validate workflows without warnings when appropriate', async () => {
      const steps: WorkflowStepDefinition[] = [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'task',
          dependencies: []
        }
      ];

      const response = await handler.handle({
        name: 'Clean Workflow',
        steps
      });

      expect(response.success).toBe(true);
      expect(response.data.validationStatus.warnings).toHaveLength(0);
    });
  });
});
