/**
 * Agentic QE v3 - Task Command Handler
 *
 * Handles the 'aqe task' command group for task management.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  ICommandHandler,
  CLIContext,
  getStatusColor,
  formatDuration,
} from './interfaces.js';
import type { TaskType } from '../../coordination/queen-coordinator.js';
import { DomainName, Priority } from '../../shared/types/index.js';
import { createTimedSpinner } from '../utils/progress.js';
import { parseJsonOption } from '../helpers/safe-json.js';

// ============================================================================
// Task Handler
// ============================================================================

export class TaskHandler implements ICommandHandler {
  readonly name = 'task';
  readonly description = 'Manage QE tasks';

  private cleanupAndExit: (code: number) => Promise<never>;
  private ensureInitialized: () => Promise<boolean>;

  constructor(
    cleanupAndExit: (code: number) => Promise<never>,
    ensureInitialized: () => Promise<boolean>
  ) {
    this.cleanupAndExit = cleanupAndExit;
    this.ensureInitialized = ensureInitialized;
  }

  register(program: Command, context: CLIContext): void {
    const taskCmd = program
      .command('task')
      .description(this.description);

    // task submit
    taskCmd
      .command('submit <type>')
      .description('Submit a task to the Queen Coordinator')
      .option('-p, --priority <priority>', 'Task priority (p0|p1|p2|p3)', 'p1')
      .option('-d, --domain <domain>', 'Target domain')
      .option('-t, --timeout <ms>', 'Task timeout in ms', '300000')
      .option('--payload <json>', 'Task payload as JSON', '{}')
      .option('--wait', 'Wait for task completion with progress')
      .option('--no-progress', 'Disable progress indicator')
      .action(async (type: string, options) => {
        await this.executeSubmit(type, options, context);
      });

    // task list
    taskCmd
      .command('list')
      .description('List all tasks')
      .option('-s, --status <status>', 'Filter by status')
      .option('-p, --priority <priority>', 'Filter by priority')
      .option('-d, --domain <domain>', 'Filter by domain')
      .action(async (options) => {
        await this.executeList(options, context);
      });

    // task cancel
    taskCmd
      .command('cancel <taskId>')
      .description('Cancel a task')
      .action(async (taskId: string) => {
        await this.executeCancel(taskId, context);
      });

    // task status
    taskCmd
      .command('status <taskId>')
      .description('Get task status')
      .action(async (taskId: string) => {
        await this.executeTaskStatus(taskId, context);
      });
  }

  private async executeSubmit(type: string, options: SubmitOptions, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const taskType = type as TaskType;
      const payload = parseJsonOption(options.payload, 'payload');
      const targetDomains = options.domain ? [options.domain as DomainName] : [];

      console.log(chalk.blue(`\n  Submitting task: ${taskType}\n`));

      // Use spinner for submit operation
      const spinner = options.progress !== false
        ? createTimedSpinner(`Submitting ${taskType} task`)
        : null;

      const result = await context.queen!.submitTask({
        type: taskType,
        priority: options.priority as Priority,
        targetDomains,
        payload,
        timeout: parseInt(options.timeout, 10),
      });

      if (spinner) {
        if (result.success) {
          spinner.succeed(`Task submitted successfully`);
        } else {
          spinner.fail(`Failed to submit task`);
        }
      }

      if (result.success) {
        console.log(chalk.cyan(`   ID: ${result.value}`));
        console.log(chalk.gray(`   Type: ${taskType}`));
        console.log(chalk.gray(`   Priority: ${options.priority}`));

        // If --wait flag is provided, poll for task completion with progress
        if (options.wait) {
          console.log('');
          const taskId = result.value as string;
          const waitSpinner = createTimedSpinner('Waiting for task completion');

          const timeout = parseInt(options.timeout, 10);
          const startTime = Date.now();
          let completed = false;

          while (!completed && (Date.now() - startTime) < timeout) {
            const taskStatus = context.queen!.getTaskStatus(taskId);
            if (taskStatus) {
              if (taskStatus.status === 'completed') {
                waitSpinner.succeed('Task completed successfully');
                completed = true;
              } else if (taskStatus.status === 'failed') {
                waitSpinner.fail(`Task failed: ${taskStatus.error || 'Unknown error'}`);
                completed = true;
              } else {
                // Update spinner with progress info
                waitSpinner.spinner.text = `Task ${taskStatus.status}... (${Math.round((Date.now() - startTime) / 1000)}s)`;
              }
            }
            if (!completed) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }

          if (!completed) {
            waitSpinner.fail('Task timed out');
          }
        }
      } else {
        console.log(chalk.red(`   Error: ${(result as { success: false; error: Error }).error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n  Failed to submit task:'), error);
      await this.cleanupAndExit(1);
    }
  }

  private async executeList(options: ListOptions, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const tasks = context.queen!.listTasks({
        status: options.status as 'queued' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled' | undefined,
        priority: options.priority as Priority | undefined,
        domain: options.domain as DomainName | undefined,
      });

      console.log(chalk.blue(`\n  Tasks (${tasks.length})\n`));

      if (tasks.length === 0) {
        console.log(chalk.gray('  No tasks found'));
      } else {
        for (const task of tasks) {
          console.log(`  ${chalk.cyan(task.taskId)}`);
          console.log(`    Type: ${task.task.type}`);
          console.log(`    Status: ${getStatusColor(task.status)}`);
          console.log(`    Priority: ${task.task.priority}`);
          if (task.assignedDomain) {
            console.log(`    Domain: ${task.assignedDomain}`);
          }
          if (task.startedAt) {
            console.log(chalk.gray(`    Started: ${task.startedAt.toISOString()}`));
          }
          console.log('');
        }
      }

    } catch (error) {
      console.error(chalk.red('\n  Failed to list tasks:'), error);
      await this.cleanupAndExit(1);
    }
  }

  private async executeCancel(taskId: string, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const result = await context.queen!.cancelTask(taskId);

      if (result.success) {
        console.log(chalk.green(`\n  Task cancelled: ${taskId}\n`));
      } else {
        console.log(chalk.red(`\n  Failed to cancel task: ${(result as { success: false; error: Error }).error.message}\n`));
      }

    } catch (error) {
      console.error(chalk.red('\n  Failed to cancel task:'), error);
      await this.cleanupAndExit(1);
    }
  }

  private async executeTaskStatus(taskId: string, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const task = context.queen!.getTaskStatus(taskId);

      if (!task) {
        console.log(chalk.red(`\n  Task not found: ${taskId}\n`));
        return;
      }

      console.log(chalk.blue(`\n  Task: ${taskId}\n`));
      console.log(`  Type: ${task.task.type}`);
      console.log(`  Status: ${getStatusColor(task.status)}`);
      console.log(`  Priority: ${task.task.priority}`);
      if (task.assignedDomain) {
        console.log(`  Domain: ${task.assignedDomain}`);
      }
      if (task.assignedAgents.length > 0) {
        console.log(`  Agents: ${task.assignedAgents.join(', ')}`);
      }
      console.log(`  Created: ${task.task.createdAt.toISOString()}`);
      if (task.startedAt) {
        console.log(`  Started: ${task.startedAt.toISOString()}`);
      }
      if (task.completedAt) {
        console.log(`  Completed: ${task.completedAt.toISOString()}`);
        const duration = task.completedAt.getTime() - task.startedAt!.getTime();
        console.log(`  Duration: ${formatDuration(duration)}`);
      }
      if (task.error) {
        console.log(chalk.red(`  Error: ${task.error}`));
      }
      if (task.retryCount > 0) {
        console.log(chalk.yellow(`  Retries: ${task.retryCount}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n  Failed to get task status:'), error);
      await this.cleanupAndExit(1);
    }
  }

  getHelp(): string {
    return `
Manage QE tasks including submission, listing, and cancellation.

Usage:
  aqe task <command> [options]

Commands:
  submit <type>     Submit a task to the Queen Coordinator
  list              List all tasks
  cancel <taskId>   Cancel a task
  status <taskId>   Get task status

Submit Options:
  -p, --priority <priority>   Task priority: p0, p1, p2, p3 (default: p1)
  -d, --domain <domain>       Target domain
  -t, --timeout <ms>          Task timeout in milliseconds (default: 300000)
  --payload <json>            Task payload as JSON
  --wait                      Wait for task completion with progress
  --no-progress               Disable progress indicator

List Options:
  -s, --status <status>       Filter by status
  -p, --priority <priority>   Filter by priority
  -d, --domain <domain>       Filter by domain

Examples:
  aqe task submit generate-tests --domain test-generation
  aqe task submit analyze-coverage --wait --timeout 60000
  aqe task list --status running
  aqe task status task-123
  aqe task cancel task-123
`;
  }
}

// ============================================================================
// Types
// ============================================================================

interface SubmitOptions {
  priority: string;
  domain?: string;
  timeout: string;
  payload: string;
  wait?: boolean;
  progress?: boolean;
}

interface ListOptions {
  status?: string;
  priority?: string;
  domain?: string;
}

// ============================================================================
// Factory
// ============================================================================

export function createTaskHandler(
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): TaskHandler {
  return new TaskHandler(cleanupAndExit, ensureInitialized);
}
