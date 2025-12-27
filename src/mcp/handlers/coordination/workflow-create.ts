/**
 * Workflow Create Handler
 *
 * Creates QE workflows with checkpoints and dependency management.
 * Integrates with GOAP for action planning and validation.
 *
 * @version 1.0.0
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { SecureRandom } from '../../../utils/SecureRandom.js';
import { AgentRegistry } from '../../services/AgentRegistry.js';
import { HookExecutor } from '../../services/HookExecutor.js';

export interface WorkflowCreateArgs {
  name: string;
  description?: string;
  steps: WorkflowStepDefinition[];
  checkpoints?: {
    enabled: boolean;
    frequency?: 'manual' | 'after-each-step' | 'on-failure' | 'timed';
    interval?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  type: string;
  dependencies: string[];
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoff: 'linear' | 'exponential';
  };
  config?: Record<string, unknown>;
}

export interface Workflow {
  workflowId: string;
  name: string;
  description?: string;
  steps: WorkflowStepDefinition[];
  checkpoints: {
    enabled: boolean;
    frequency: string;
    interval?: number;
  };
  metadata: Record<string, unknown>;
  createdAt: string;
  validationStatus: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export class WorkflowCreateHandler extends BaseHandler {
  private workflows: Map<string, Workflow> = new Map();

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor
  ) {
    super();
  }

  async handle(args: WorkflowCreateArgs): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      this.log('info', 'Creating QE workflow', { requestId, name: args.name });

      // Validate required fields
      this.validateRequired(args, ['name', 'steps']);

      // Validate workflow structure
      const validation = this.validateWorkflow(args);
      if (!validation.isValid) {
        return this.createErrorResponse(
          `Workflow validation failed: ${validation.errors.join(', ')}`,
          requestId
        );
      }

      const { result: workflow, executionTime } = await this.measureExecutionTime(
        () => this.createWorkflow(args, validation)
      );

      this.log('info', `Workflow created in ${executionTime.toFixed(2)}ms`, {
        workflowId: workflow.workflowId,
        stepsCount: workflow.steps.length
      });

      return this.createSuccessResponse(workflow, requestId);
    });
  }

  private validateWorkflow(args: WorkflowCreateArgs): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate steps
    if (!args.steps || args.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Validate step IDs are unique
    const stepIds = new Set<string>();
    for (const step of args.steps || []) {
      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);

      // Validate step has required fields
      if (!step.name) {
        errors.push(`Step ${step.id} is missing name`);
      }
      if (!step.type) {
        errors.push(`Step ${step.id} is missing type`);
      }
    }

    // Validate dependencies exist
    for (const step of args.steps || []) {
      for (const depId of step.dependencies || []) {
        if (!stepIds.has(depId)) {
          errors.push(`Step ${step.id} has invalid dependency: ${depId}`);
        }
      }
    }

    // Check for circular dependencies
    try {
      this.detectCircularDependencies(args.steps || []);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Circular dependency detected');
    }

    // Warnings for best practices
    if (args.steps && args.steps.length > 20) {
      warnings.push('Workflow has more than 20 steps. Consider breaking into sub-workflows');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private detectCircularDependencies(steps: WorkflowStepDefinition[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (stepId: string): boolean => {
      visited.add(stepId);
      recursionStack.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (!step) return false;

      for (const depId of step.dependencies || []) {
        if (!visited.has(depId)) {
          if (hasCycle(depId)) {
            return true;
          }
        } else if (recursionStack.has(depId)) {
          throw new Error(`Circular dependency detected: ${stepId} -> ${depId}`);
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        hasCycle(step.id);
      }
    }
  }

  private async createWorkflow(
    args: WorkflowCreateArgs,
    validation: { isValid: boolean; errors: string[]; warnings: string[] }
  ): Promise<Workflow> {
    const workflowId = `workflow-${Date.now()}-${SecureRandom.generateId(3)}`;

    const workflow: Workflow = {
      workflowId,
      name: args.name,
      description: args.description,
      steps: args.steps,
      checkpoints: {
        enabled: args.checkpoints?.enabled ?? true,
        frequency: args.checkpoints?.frequency ?? 'after-each-step',
        interval: args.checkpoints?.interval
      },
      metadata: args.metadata || {},
      createdAt: new Date().toISOString(),
      validationStatus: validation
    };

    // Store workflow
    this.workflows.set(workflowId, workflow);

    // Execute post-task hook
    await this.hookExecutor.executePostTask({
      taskId: workflowId,
      results: {
        workflowId,
        name: workflow.name,
        stepsCount: workflow.steps.length
      }
    });

    return workflow;
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * List all workflows
   */
  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }
}
