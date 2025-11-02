/**
 * Workflow Checkpoint Handler
 *
 * Creates checkpoints for workflow state recovery.
 * Integrates with SwarmMemoryManager for persistence.
 *
 * @version 1.0.0
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { SecureRandom } from '../../../utils/SecureRandom.js';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager.js';

export interface WorkflowCheckpointArgs {
  executionId: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface Checkpoint {
  checkpointId: string;
  executionId: string;
  timestamp: string;
  reason?: string;
  state: {
    completedSteps: string[];
    currentStep?: string;
    failedSteps: string[];
    variables: Record<string, any>;
    context: Record<string, any>;
  };
  metadata: Record<string, any>;
}

export class WorkflowCheckpointHandler extends BaseHandler {
  private checkpoints: Map<string, Checkpoint> = new Map();

  constructor(private memory: SwarmMemoryManager) {
    super();
  }

  async handle(args: WorkflowCheckpointArgs): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      this.log('info', 'Creating workflow checkpoint', { requestId, executionId: args.executionId });

      // Validate required fields
      this.validateRequired(args, ['executionId']);

      const { result: checkpoint, executionTime } = await this.measureExecutionTime(
        () => this.createCheckpoint(args)
      );

      this.log('info', `Checkpoint created in ${executionTime.toFixed(2)}ms`, {
        checkpointId: checkpoint.checkpointId,
        executionId: checkpoint.executionId
      });

      return this.createSuccessResponse(checkpoint, requestId);
    });
  }

  private async createCheckpoint(args: WorkflowCheckpointArgs): Promise<Checkpoint> {
    const checkpointId = `cp-${Date.now()}-${SecureRandom.generateId(3)}`;

    // Retrieve execution state from memory
    const execution = await this.memory.retrieve(`workflow:execution:${args.executionId}`, {
      partition: 'workflow_executions'
    });

    if (!execution) {
      throw new Error(`Execution ${args.executionId} not found`);
    }

    const checkpoint: Checkpoint = {
      checkpointId,
      executionId: args.executionId,
      timestamp: new Date().toISOString(),
      reason: args.reason,
      state: {
        completedSteps: execution.completedSteps || [],
        currentStep: execution.currentStep,
        failedSteps: execution.failedSteps || [],
        variables: execution.context?.variables || {},
        context: execution.context || {}
      },
      metadata: {
        ...args.metadata,
        executionStatus: execution.status,
        createdBy: 'workflow-checkpoint-handler'
      }
    };

    // Store checkpoint in memory
    await this.memory.store(`workflow:checkpoint:${checkpointId}`, checkpoint, {
      partition: 'workflow_checkpoints',
      ttl: 604800 // 7 days
    });

    // Store in local map
    this.checkpoints.set(checkpointId, checkpoint);

    // Post hint to blackboard for coordination
    await this.memory.postHint({
      key: `aqe/checkpoint/${checkpointId}`,
      value: {
        checkpointId,
        executionId: args.executionId,
        timestamp: checkpoint.timestamp
      },
      ttl: 3600 // 1 hour
    });

    return checkpoint;
  }

  /**
   * Get checkpoint by ID
   */
  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    // Try local map first
    let checkpoint = this.checkpoints.get(checkpointId);

    // Fallback to memory
    if (!checkpoint) {
      checkpoint = await this.memory.retrieve(`workflow:checkpoint:${checkpointId}`, {
        partition: 'workflow_checkpoints'
      });
    }

    return checkpoint || null;
  }

  /**
   * List checkpoints for an execution
   */
  async listCheckpoints(executionId: string): Promise<Checkpoint[]> {
    const pattern = `workflow:checkpoint:%`;
    const entries = await this.memory.query(pattern, {
      partition: 'workflow_checkpoints'
    });

    return entries
      .map(entry => entry.value)
      .filter(cp => cp.executionId === executionId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}
