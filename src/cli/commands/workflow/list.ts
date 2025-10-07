/**
 * Workflow List Command
 *
 * Lists all workflows with filtering and formatting options
 * Integrates with workflow execution handlers and memory
 *
 * @version 1.0.0
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager.js';
import { Logger } from '../../../utils/Logger.js';

const logger = Logger.getInstance();

export interface ListWorkflowsOptions {
  status?: string | string[];
  name?: string;
  limit?: number;
  sort?: 'startTime' | 'name' | 'status';
  format?: 'json' | 'table';
  detailed?: boolean;
}

export interface WorkflowInfo {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  startedAt: string;
  completedAt?: string;
  steps?: number;
  completedSteps?: number;
  failedSteps?: number;
  executionId?: string;
}

export interface ListWorkflowsResult {
  workflows: WorkflowInfo[];
  total: number;
  filtered: number;
  formatted?: string;
}

/**
 * List all workflows with optional filtering
 */
export async function listWorkflows(options: ListWorkflowsOptions): Promise<ListWorkflowsResult> {
  logger.info('Listing workflows', { options });

  try {
    // Validate status filter if provided
    if (options.status) {
      const validStatuses = ['running', 'paused', 'completed', 'failed', 'cancelled'];
      const statuses = Array.isArray(options.status) ? options.status : [options.status];

      for (const status of statuses) {
        if (!validStatuses.includes(status)) {
          throw new Error(`Invalid status filter: ${status}. Valid values are: ${validStatuses.join(', ')}`);
        }
      }
    }

    // Initialize memory manager
    const memory = new SwarmMemoryManager();

    // Retrieve workflows from memory
    const workflows = await retrieveWorkflows(memory, options);

    // Filter workflows
    const filtered = filterWorkflows(workflows, options);

    // Sort workflows
    const sorted = sortWorkflows(filtered, options.sort || 'startTime');

    // Limit results
    const limited = options.limit ? sorted.slice(0, options.limit) : sorted;

    // Store results in cache
    await memory.store('aqe/swarm/workflow-cli-commands/list-cache', {
      timestamp: new Date().toISOString(),
      options,
      count: limited.length
    }, {
      partition: 'workflow_cli',
      ttl: 300 // 5 minutes
    });

    // Format output
    let formatted: string | undefined;
    if (options.format === 'table') {
      formatted = formatAsTable(limited, options.detailed || false);
    }

    const result: ListWorkflowsResult = {
      workflows: limited,
      total: workflows.length,
      filtered: limited.length,
      formatted
    };

    // Update progress in memory
    await memory.store('aqe/swarm/workflow-cli-commands/progress', {
      command: 'list',
      status: 'completed',
      timestamp: new Date().toISOString(),
      workflowsListed: limited.length
    }, {
      partition: 'workflow_cli',
      ttl: 3600
    });

    return result;
  } catch (error) {
    logger.error('Failed to list workflows', { error });
    throw error;
  }
}

/**
 * Retrieve workflows from memory
 */
async function retrieveWorkflows(
  memory: SwarmMemoryManager,
  options: ListWorkflowsOptions
): Promise<WorkflowInfo[]> {
  const workflows: WorkflowInfo[] = [];

  // Query workflow executions from memory
  const pattern = 'workflow:execution:%';
  const entries = await memory.query(pattern, {
    partition: 'workflow_executions'
  });

  for (const entry of entries) {
    const execution = entry.value;

    const workflow: WorkflowInfo = {
      id: execution.workflowId || execution.executionId,
      name: execution.workflowName || `Workflow ${execution.workflowId}`,
      status: execution.status,
      progress: calculateProgress(execution),
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      executionId: execution.executionId
    };

    if (options.detailed) {
      workflow.steps = (execution.completedSteps?.length || 0) + (execution.failedSteps?.length || 0);
      workflow.completedSteps = execution.completedSteps?.length || 0;
      workflow.failedSteps = execution.failedSteps?.length || 0;
    }

    workflows.push(workflow);
  }

  return workflows;
}

/**
 * Calculate workflow progress
 */
function calculateProgress(execution: any): number {
  if (execution.status === 'completed') return 1.0;
  if (execution.status === 'failed' || execution.status === 'cancelled') return 0;

  const total = (execution.completedSteps?.length || 0) + (execution.failedSteps?.length || 0);
  const completed = execution.completedSteps?.length || 0;

  return total > 0 ? completed / total : 0;
}

/**
 * Filter workflows based on options
 */
function filterWorkflows(workflows: WorkflowInfo[], options: ListWorkflowsOptions): WorkflowInfo[] {
  let filtered = workflows;

  // Filter by status
  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    filtered = filtered.filter(w => statuses.includes(w.status));
  }

  // Filter by name
  if (options.name) {
    const namePattern = options.name.toLowerCase();
    filtered = filtered.filter(w => w.name.toLowerCase().includes(namePattern));
  }

  // Exclude cancelled by default unless explicitly requested
  if (!options.status || !options.status.toString().includes('cancelled')) {
    filtered = filtered.filter(w => w.status !== 'cancelled');
  }

  return filtered;
}

/**
 * Sort workflows
 */
function sortWorkflows(workflows: WorkflowInfo[], sortBy: string): WorkflowInfo[] {
  const sorted = [...workflows];

  switch (sortBy) {
    case 'startTime':
      sorted.sort((a, b) => {
        const timeA = new Date(a.startedAt).getTime();
        const timeB = new Date(b.startedAt).getTime();
        return timeB - timeA; // Most recent first
      });
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'status':
      sorted.sort((a, b) => a.status.localeCompare(b.status));
      break;
  }

  return sorted;
}

/**
 * Format workflows as table
 */
function formatAsTable(workflows: WorkflowInfo[], detailed: boolean): string {
  const table = new Table({
    head: detailed
      ? ['ID', 'Name', 'Status', 'Progress', 'Steps', 'Started']
      : ['ID', 'Name', 'Status', 'Progress', 'Started'],
    style: {
      head: ['cyan']
    }
  });

  for (const workflow of workflows) {
    const progress = workflow.progress
      ? `${(workflow.progress * 100).toFixed(0)}%`
      : 'N/A';

    const status = getColoredStatus(workflow.status);
    const startedAt = formatTimestamp(workflow.startedAt);

    if (detailed) {
      const steps = workflow.steps
        ? `${workflow.completedSteps}/${workflow.steps}`
        : 'N/A';

      table.push([
        workflow.id,
        workflow.name,
        status,
        progress,
        steps,
        startedAt
      ]);
    } else {
      table.push([
        workflow.id,
        workflow.name,
        status,
        progress,
        startedAt
      ]);
    }
  }

  return table.toString();
}

/**
 * Get colored status string
 */
function getColoredStatus(status: string): string {
  const colors: Record<string, any> = {
    running: chalk.green,
    paused: chalk.yellow,
    completed: chalk.blue,
    failed: chalk.red,
    cancelled: chalk.gray
  };

  const color = colors[status] || chalk.white;
  return color(status);
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

/**
 * Display workflows in console
 */
export function displayWorkflows(result: ListWorkflowsResult): void {
  if (result.formatted) {
    console.log('\n' + result.formatted + '\n');
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  console.log(chalk.gray(`\nTotal: ${result.total} | Displayed: ${result.filtered}`));
}
