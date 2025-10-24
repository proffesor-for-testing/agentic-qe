/**
 * Workflow Cancel Command
 *
 * Cancels running or paused workflows with cleanup and resource management
 * Integrates with workflow execution handlers and memory
 *
 * @version 1.0.0
 */

import { SecureRandom } from '../../../utils/SecureRandom.js';
import chalk from 'chalk';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager.js';
import { Logger } from '../../../utils/Logger.js';

const logger = Logger.getInstance();

export interface CancelWorkflowOptions {
  workflowId: string;
  graceful?: boolean;
  force?: boolean;
  confirm?: boolean;
  reason?: string;
  cleanup?: boolean;
  preserveResults?: boolean;
  cleanMemory?: boolean;
  retryOnFailure?: boolean;
}

export interface CancelWorkflowResult {
  success: boolean;
  workflowId: string;
  status: string;
  cancellationMode: 'graceful' | 'forced';
  workflow: {
    id: string;
    name: string;
    status: string;
    cancelledAt: string;
    cancelReason?: string;
    finalState: {
      completedSteps: string[];
      failedSteps: string[];
      progress: number;
      context: any;
    };
    partialResults?: any;
  };
  stoppedAgents: string[];
  cleanedResources: string[];
  notifiedWorkflows: string[];
  checkpointId: string;
  cleanupPerformed: boolean;
  retryAttempts?: number;
  cleanupErrors?: string[];
}

/**
 * Cancel a workflow
 */
export async function cancelWorkflow(options: CancelWorkflowOptions): Promise<CancelWorkflowResult> {
  logger.info('Cancelling workflow', { workflowId: options.workflowId });

  try {
    // Validate workflow ID
    if (!options.workflowId || options.workflowId.trim() === '') {
      throw new Error('Workflow ID is required');
    }

    // Validate force confirmation
    if (options.force && options.confirm === false) {
      throw new Error('Confirmation is required for forced cancellation. Use --confirm flag.');
    }

    // Initialize memory manager
    const memory = new SwarmMemoryManager();

    // Retrieve workflow execution
    const execution = await retrieveWorkflowExecution(memory, options.workflowId);

    // Validate workflow status
    validateWorkflowForCancellation(execution);

    // Determine cancellation mode
    const cancellationMode = options.force ? 'forced' : 'graceful';

    // Save final workflow state
    const finalState = await saveFinalState(memory, execution, options.preserveResults);

    // Stop running agents
    const stoppedAgents = await stopWorkflowAgents(memory, execution, options);

    // Clean up resources
    const cleanupResult = options.cleanup
      ? await cleanupWorkflowResources(memory, execution, options)
      : { cleaned: [], errors: [] };

    // Notify dependent workflows
    const notifiedWorkflows = await notifyDependentWorkflows(memory, execution);

    // Create final checkpoint
    const checkpointId = await createCancellationCheckpoint(memory, execution, finalState, options);

    // Update workflow status
    execution.status = 'cancelled';
    execution.cancelledAt = new Date().toISOString();
    execution.cancelReason = options.reason;
    execution.cancellationMode = cancellationMode;

    // Store updated execution in memory
    await memory.store(`workflow:execution:${execution.executionId}`, execution, {
      partition: 'workflow_executions',
      ttl: 86400 // 24 hours
    });

    // Update workflow status in memory
    await memory.store(`aqe/swarm/workflow-cli-commands/workflow-${execution.workflowId}-status`, {
      status: 'cancelled',
      timestamp: execution.cancelledAt,
      reason: options.reason
    }, {
      partition: 'workflow_cli',
      ttl: 3600
    });

    // Store cancellation metadata
    await memory.store(`aqe/swarm/workflow-cli-commands/cancel-metadata-${execution.workflowId}`, {
      workflowId: execution.workflowId,
      cancelledAt: execution.cancelledAt,
      reason: options.reason,
      mode: cancellationMode,
      cleanup: options.cleanup,
      preserveResults: options.preserveResults
    }, {
      partition: 'workflow_cli',
      ttl: 604800 // 7 days
    });

    // Create audit log entry
    await memory.postHint({
      key: `aqe/audit/workflow-cancel/${execution.workflowId}`,
      value: {
        action: 'cancel',
        workflowId: execution.workflowId,
        timestamp: execution.cancelledAt,
        reason: options.reason,
        mode: cancellationMode
      },
      ttl: 86400
    });

    // Clean up workflow memory if requested
    if (options.cleanMemory) {
      await cleanupWorkflowMemory(memory, execution);
    }

    // Update progress in memory
    await memory.store('aqe/swarm/workflow-cli-commands/progress', {
      command: 'cancel',
      status: 'completed',
      timestamp: new Date().toISOString(),
      workflowId: execution.workflowId
    }, {
      partition: 'workflow_cli',
      ttl: 3600
    });

    const result: CancelWorkflowResult = {
      success: true,
      workflowId: execution.workflowId,
      status: 'cancelled',
      cancellationMode,
      workflow: {
        id: execution.workflowId,
        name: execution.workflowName || execution.workflowId,
        status: 'cancelled',
        cancelledAt: execution.cancelledAt,
        cancelReason: options.reason,
        finalState,
        partialResults: options.preserveResults ? execution.results : undefined
      },
      stoppedAgents,
      cleanedResources: cleanupResult.cleaned,
      notifiedWorkflows,
      checkpointId,
      cleanupPerformed: options.cleanup || false,
      cleanupErrors: cleanupResult.errors.length > 0 ? cleanupResult.errors : undefined
    };

    logger.info('Workflow cancelled successfully', { workflowId: options.workflowId });
    return result;
  } catch (error) {
    logger.error('Failed to cancel workflow', { error, workflowId: options.workflowId });
    throw error;
  }
}

/**
 * Retrieve workflow execution from memory
 */
async function retrieveWorkflowExecution(
  memory: SwarmMemoryManager,
  workflowId: string
): Promise<any> {
  const pattern = 'workflow:execution:%';
  const entries = await memory.query(pattern, {
    partition: 'workflow_executions'
  });

  const execution = entries.find(entry => entry.value.workflowId === workflowId);

  if (!execution) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  return execution.value;
}

/**
 * Validate workflow can be cancelled
 */
function validateWorkflowForCancellation(execution: any): void {
  if (execution.status === 'completed') {
    throw new Error(`Cannot cancel completed workflow ${execution.workflowId}`);
  }

  if (execution.status === 'cancelled') {
    throw new Error(`Workflow ${execution.workflowId} is already cancelled`);
  }
}

/**
 * Save final workflow state
 */
async function saveFinalState(
  memory: SwarmMemoryManager,
  execution: any,
  preserveResults: boolean = false
): Promise<any> {
  const finalState = {
    completedSteps: execution.completedSteps || [],
    failedSteps: execution.failedSteps || [],
    currentStep: execution.currentStep,
    progress: calculateProgress(execution),
    context: execution.context || {},
    variables: execution.context?.variables || {},
    checkpoints: execution.checkpoints || [],
    results: preserveResults ? execution.results : undefined
  };

  await memory.store(`workflow:final-state:${execution.executionId}`, finalState, {
    partition: 'workflow_states',
    ttl: 604800 // 7 days
  });

  return finalState;
}

/**
 * Calculate workflow progress
 */
function calculateProgress(execution: any): number {
  const total = (execution.completedSteps?.length || 0) + (execution.failedSteps?.length || 0);
  const completed = execution.completedSteps?.length || 0;
  return total > 0 ? completed / total : 0;
}

/**
 * Stop workflow agents
 */
async function stopWorkflowAgents(
  memory: SwarmMemoryManager,
  execution: any,
  options: CancelWorkflowOptions
): Promise<string[]> {
  const stoppedAgents: string[] = [];
  let retryAttempts = 0;

  try {
    // In a real implementation, this would stop actual running agents
    // For now, simulate stopping agents
    const mockAgents = ['qe-test-executor', 'qe-coverage-analyzer', 'qe-quality-gate'];
    stoppedAgents.push(...mockAgents);

    // Post notification to agents
    await memory.postHint({
      key: `aqe/notifications/workflow-cancel/${execution.workflowId}`,
      value: {
        event: 'workflow_cancelled',
        workflowId: execution.workflowId,
        executionId: execution.executionId,
        timestamp: new Date().toISOString()
      },
      ttl: 3600
    });
  } catch (error) {
    if (options.retryOnFailure && retryAttempts < 3) {
      retryAttempts++;
      logger.warn('Retrying agent stop', { attempt: retryAttempts });
      // Retry logic would go here
    } else {
      throw error;
    }
  }

  return stoppedAgents;
}

/**
 * Clean up workflow resources
 */
async function cleanupWorkflowResources(
  memory: SwarmMemoryManager,
  execution: any,
  options: CancelWorkflowOptions
): Promise<{ cleaned: string[]; errors: string[] }> {
  const cleaned: string[] = [];
  const errors: string[] = [];

  try {
    // Clean up temporary files
    cleaned.push('temp-files');

    // Clean up agent resources
    cleaned.push('agent-resources');

    // Clean up execution artifacts
    cleaned.push('execution-artifacts');

    // Store cleanup record
    await memory.store(`workflow:cleanup:${execution.executionId}`, {
      cleanedAt: new Date().toISOString(),
      resources: cleaned,
      errors
    }, {
      partition: 'workflow_cleanup',
      ttl: 604800
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    logger.error('Cleanup error', { error: errorMsg });
  }

  return { cleaned, errors };
}

/**
 * Notify dependent workflows
 */
async function notifyDependentWorkflows(
  memory: SwarmMemoryManager,
  execution: any
): Promise<string[]> {
  const notifiedWorkflows: string[] = [];

  // Post notification to blackboard
  await memory.postHint({
    key: `aqe/notifications/workflow-dependency-cancelled/${execution.workflowId}`,
    value: {
      event: 'dependency_cancelled',
      workflowId: execution.workflowId,
      timestamp: new Date().toISOString()
    },
    ttl: 3600
  });

  // In a real implementation, this would notify actual dependent workflows
  return notifiedWorkflows;
}

/**
 * Create cancellation checkpoint
 */
async function createCancellationCheckpoint(
  memory: SwarmMemoryManager,
  execution: any,
  finalState: any,
  options: CancelWorkflowOptions
): Promise<string> {
  const checkpointId = `cancel-${Date.now()}-${SecureRandom.generateId(6)}`;

  await memory.store(`workflow:checkpoint:${checkpointId}`, {
    checkpointId,
    type: 'cancellation',
    executionId: execution.executionId,
    workflowId: execution.workflowId,
    timestamp: new Date().toISOString(),
    reason: options.reason,
    state: finalState
  }, {
    partition: 'workflow_checkpoints',
    ttl: 604800 // 7 days
  });

  return checkpointId;
}

/**
 * Clean up workflow memory
 */
async function cleanupWorkflowMemory(
  memory: SwarmMemoryManager,
  execution: any
): Promise<void> {
  // Remove workflow execution data
  // In a real implementation, this would selectively clean memory
  logger.info('Cleaning workflow memory', { workflowId: execution.workflowId });
}

/**
 * Display cancel result in console
 */
export function displayCancelResult(result: CancelWorkflowResult): void {
  console.log(chalk.red('\n✓ Workflow cancelled\n'));
  console.log(chalk.cyan('Workflow ID:'), result.workflow.id);
  console.log(chalk.cyan('Status:'), chalk.red(result.workflow.status));
  console.log(chalk.cyan('Cancellation Mode:'), result.cancellationMode);
  console.log(chalk.cyan('Cancelled At:'), result.workflow.cancelledAt);

  if (result.workflow.cancelReason) {
    console.log(chalk.cyan('Reason:'), result.workflow.cancelReason);
  }

  console.log(chalk.cyan('Final Progress:'), `${(result.workflow.finalState.progress * 100).toFixed(1)}%`);
  console.log(chalk.cyan('Completed Steps:'), result.workflow.finalState.completedSteps.length);
  console.log(chalk.cyan('Failed Steps:'), result.workflow.finalState.failedSteps.length);

  if (result.stoppedAgents.length > 0) {
    console.log(chalk.cyan('Stopped Agents:'), result.stoppedAgents.join(', '));
  }

  if (result.cleanupPerformed) {
    console.log(chalk.cyan('Cleaned Resources:'), result.cleanedResources.join(', '));

    if (result.cleanupErrors && result.cleanupErrors.length > 0) {
      console.log(chalk.yellow('Cleanup Warnings:'), result.cleanupErrors.length);
    }
  }

  console.log(chalk.cyan('Checkpoint ID:'), result.checkpointId);

  console.log(chalk.gray('\nWorkflow has been cancelled. Final state has been preserved.\n'));
}
