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
import { SwarmMemoryManager, SerializableValue } from '../../../core/memory/SwarmMemoryManager.js';

export interface WorkflowCheckpointArgs {
  executionId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
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
    variables: Record<string, unknown>;
    context: Record<string, unknown>;
  };
  metadata: Record<string, unknown>;
}

/**
 * Internal interface for execution data retrieved from memory
 */
interface ExecutionData {
  completedSteps?: string[];
  currentStep?: string;
  failedSteps?: string[];
  context?: {
    variables?: Record<string, unknown>;
    [key: string]: unknown;
  };
  status?: string;
  [key: string]: unknown;
}

/**
 * Type guard to check if a value is a valid ExecutionData object
 */
function isExecutionData(value: SerializableValue | null): value is ExecutionData {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Type guard to check if a value is a valid Checkpoint-like object
 */
function isCheckpoint(value: unknown): value is Checkpoint {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['checkpointId'] === 'string' &&
    typeof obj['executionId'] === 'string' &&
    typeof obj['timestamp'] === 'string' &&
    typeof obj['state'] === 'object' &&
    obj['state'] !== null
  );
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
    const executionRaw = await this.memory.retrieve(`workflow:execution:${args.executionId}`, {
      partition: 'workflow_executions'
    });

    if (!executionRaw) {
      throw new Error(`Execution ${args.executionId} not found`);
    }

    // Validate execution data with type guard
    if (!isExecutionData(executionRaw)) {
      throw new Error(`Invalid execution data format for ${args.executionId}`);
    }

    const execution = executionRaw;

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

    // Store checkpoint in memory - cast to Record<string, unknown> for SerializableValue compatibility
    const checkpointData: Record<string, unknown> = {
      checkpointId: checkpoint.checkpointId,
      executionId: checkpoint.executionId,
      timestamp: checkpoint.timestamp,
      reason: checkpoint.reason,
      state: checkpoint.state,
      metadata: checkpoint.metadata
    };

    await this.memory.store(`workflow:checkpoint:${checkpointId}`, checkpointData, {
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
    const cached = this.checkpoints.get(checkpointId);
    if (cached) {
      return cached;
    }

    // Fallback to memory
    const retrieved = await this.memory.retrieve(`workflow:checkpoint:${checkpointId}`, {
      partition: 'workflow_checkpoints'
    });

    // Validate retrieved data with type guard
    if (retrieved && isCheckpoint(retrieved)) {
      return retrieved;
    }

    return null;
  }

  /**
   * List checkpoints for an execution
   */
  listCheckpoints(executionId: string): Checkpoint[] {
    const pattern = `workflow:checkpoint:%`;
    const entries = this.memory.query(pattern, {
      partition: 'workflow_checkpoints'
    });

    // Filter and validate entries as Checkpoint objects
    const checkpoints: Checkpoint[] = [];
    for (const entry of entries) {
      if (isCheckpoint(entry.value)) {
        const cp = entry.value;
        if (cp.executionId === executionId) {
          checkpoints.push(cp);
        }
      }
    }

    // Sort by timestamp descending (most recent first)
    return checkpoints.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
}
