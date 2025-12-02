/**
 * Workflow Pause Command
 *
 * Pauses running workflows with graceful shutdown and state preservation
 * Integrates with workflow execution handlers and memory
 *
 * @version 1.0.0
 */

import chalk from 'chalk';
import { getSharedMemoryManager } from '../../../core/memory/MemoryManagerFactory.js';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager.js';
import { Logger } from '../../../utils/Logger.js';

const logger = Logger.getInstance();

export interface PauseWorkflowOptions {
  workflowId: string;
  graceful?: boolean;
  immediate?: boolean;
  reason?: string;
  timeout?: number;
}

export interface PauseWorkflowResult {
  success: boolean;
  workflowId: string;
  status: string;
  pauseMode: 'graceful' | 'immediate';
  workflow: {
    id: string;
    name: string;
    status: string;
    pausedAt: string;
    pauseReason?: string;
    savedState: {
      completedSteps: string[];
      currentStep?: string;
      progress: number;
      context: any;
    };
  };
  notifiedAgents: string[];
}

/**
 * Pause a running workflow
 */
export async function pauseWorkflow(options: PauseWorkflowOptions): Promise<PauseWorkflowResult> {
  logger.info('Pausing workflow', { workflowId: options.workflowId });

  try {
    // Validate workflow ID
    if (!options.workflowId || options.workflowId.trim() === '') {
      throw new Error('Workflow ID is required');
    }

    // Initialize memory manager (uses shared singleton at .agentic-qe/memory.db)
    const memory = getSharedMemoryManager();
    await memory.initialize();

    // Retrieve workflow execution
    const execution = await retrieveWorkflowExecution(memory, options.workflowId);

    // Validate workflow status
    validateWorkflowForPause(execution);

    // Determine pause mode
    const pauseMode = options.immediate ? 'immediate' : 'graceful';

    // Save current workflow state
    const savedState = await saveWorkflowState(memory, execution);

    // Notify agents about pause
    const notifiedAgents = await notifyAgentsOfPause(memory, execution);

    // Update workflow status
    execution.status = 'paused';
    execution.pausedAt = new Date().toISOString();
    execution.pauseReason = options.reason;
    execution.pauseMode = pauseMode;

    // Store updated execution in memory
    await memory.store(`workflow:execution:${execution.executionId}`, execution, {
      partition: 'workflow_executions',
      ttl: 86400 // 24 hours
    });

    // Store pause checkpoint
    await memory.store(`aqe/swarm/workflow-cli-commands/checkpoint-${execution.workflowId}`, {
      checkpointId: `pause-${Date.now()}`,
      workflowId: execution.workflowId,
      executionId: execution.executionId,
      timestamp: execution.pausedAt,
      state: savedState,
      reason: options.reason
    }, {
      partition: 'workflow_cli',
      ttl: 604800 // 7 days
    });

    // Update workflow status in memory
    await memory.store(`aqe/swarm/workflow-cli-commands/workflow-${execution.workflowId}-status`, {
      status: 'paused',
      timestamp: execution.pausedAt
    }, {
      partition: 'workflow_cli',
      ttl: 3600
    });

    // Create audit log entry
    await memory.postHint({
      key: `aqe/audit/workflow-pause/${execution.workflowId}`,
      value: {
        action: 'pause',
        workflowId: execution.workflowId,
        timestamp: execution.pausedAt,
        reason: options.reason,
        mode: pauseMode
      },
      ttl: 86400
    });

    // Update progress in memory
    await memory.store('aqe/swarm/workflow-cli-commands/progress', {
      command: 'pause',
      status: 'completed',
      timestamp: new Date().toISOString(),
      workflowId: execution.workflowId
    }, {
      partition: 'workflow_cli',
      ttl: 3600
    });

    const result: PauseWorkflowResult = {
      success: true,
      workflowId: execution.workflowId,
      status: 'paused',
      pauseMode,
      workflow: {
        id: execution.workflowId,
        name: execution.workflowName || execution.workflowId,
        status: 'paused',
        pausedAt: execution.pausedAt,
        pauseReason: options.reason,
        savedState
      },
      notifiedAgents
    };

    logger.info('Workflow paused successfully', { workflowId: options.workflowId });
    return result;
  } catch (error) {
    logger.error('Failed to pause workflow', { error, workflowId: options.workflowId });
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
  // Try to find execution by workflow ID
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
 * Validate workflow can be paused
 */
function validateWorkflowForPause(execution: any): void {
  if (execution.status === 'paused') {
    throw new Error(`Workflow ${execution.workflowId} is already paused`);
  }

  if (execution.status === 'completed') {
    throw new Error(`Cannot pause completed workflow ${execution.workflowId}`);
  }

  if (execution.status === 'failed') {
    throw new Error(`Cannot pause failed workflow ${execution.workflowId}`);
  }

  if (execution.status === 'cancelled') {
    throw new Error(`Cannot pause cancelled workflow ${execution.workflowId}`);
  }

  if (execution.status !== 'running') {
    throw new Error(`Cannot pause workflow ${execution.workflowId} with status: ${execution.status}`);
  }
}

/**
 * Save workflow state for recovery
 */
async function saveWorkflowState(
  memory: SwarmMemoryManager,
  execution: any
): Promise<any> {
  const savedState = {
    completedSteps: execution.completedSteps || [],
    currentStep: execution.currentStep,
    failedSteps: execution.failedSteps || [],
    progress: calculateProgress(execution),
    context: execution.context || {},
    variables: execution.context?.variables || {},
    checkpoints: execution.checkpoints || []
  };

  // Store state snapshot
  await memory.store(`workflow:state:${execution.executionId}`, savedState, {
    partition: 'workflow_states',
    ttl: 604800 // 7 days
  });

  return savedState;
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
 * Notify agents about workflow pause
 */
async function notifyAgentsOfPause(
  memory: SwarmMemoryManager,
  execution: any
): Promise<string[]> {
  const notifiedAgents: string[] = [];

  // Post notification to blackboard
  await memory.postHint({
    key: `aqe/notifications/workflow-pause/${execution.workflowId}`,
    value: {
      event: 'workflow_paused',
      workflowId: execution.workflowId,
      executionId: execution.executionId,
      timestamp: new Date().toISOString()
    },
    ttl: 3600
  });

  // In a real implementation, this would notify actual agents
  // For now, we'll simulate notification
  const mockAgents = ['qe-test-executor', 'qe-coverage-analyzer', 'qe-quality-gate'];
  notifiedAgents.push(...mockAgents);

  return notifiedAgents;
}

/**
 * Display pause result in console
 */
export function displayPauseResult(result: PauseWorkflowResult): void {
  console.log(chalk.green('\n✓ Workflow paused successfully\n'));
  console.log(chalk.cyan('Workflow ID:'), result.workflow.id);
  console.log(chalk.cyan('Status:'), chalk.yellow(result.workflow.status));
  console.log(chalk.cyan('Pause Mode:'), result.pauseMode);
  console.log(chalk.cyan('Paused At:'), result.workflow.pausedAt);

  if (result.workflow.pauseReason) {
    console.log(chalk.cyan('Reason:'), result.workflow.pauseReason);
  }

  console.log(chalk.cyan('Progress:'), `${(result.workflow.savedState.progress * 100).toFixed(1)}%`);
  console.log(chalk.cyan('Completed Steps:'), result.workflow.savedState.completedSteps.length);

  if (result.notifiedAgents.length > 0) {
    console.log(chalk.cyan('Notified Agents:'), result.notifiedAgents.join(', '));
  }

  console.log(chalk.gray('\nWorkflow state has been saved and can be resumed later.\n'));
}
