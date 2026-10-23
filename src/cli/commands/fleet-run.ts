/**
 * Agentic QE v3 - `aqe fleet run` command
 *
 * Runs a coordinated fleet operation (test|analyze|scan) on real domain
 * handlers and judges what they returned (#1125).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import type { TaskType } from '../../coordination/queen-coordinator.js';
import { FleetProgressManager } from '../utils/progress.js';
import { FLEET_OPERATIONS, planFleetOperation, type FleetOperation } from '../utils/fleet-operation.js';
import { reportFleetVerdict } from '../utils/fleet-result.js';

export function registerFleetRunCommand(
  fleetCmd: Command,
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>,
): void {
  fleetCmd
    .command('run')
    .description('Run a coordinated fleet operation')
    .argument('<operation>', 'Operation type (test|analyze|scan)')
    .option('-t, --target <path>', 'Target path', '.')
    .option('--parallel <count>', 'Number of parallel agents', '4')
    .action(async (operation: string, options) => {
      if (!await ensureInitialized()) return cleanupAndExit(1);

      try {
        const parallelCount = Number(options.parallel);
        if (!Number.isSafeInteger(parallelCount) || parallelCount < 1) {
          throw new Error('--parallel must be a positive integer');
        }
        if (!(FLEET_OPERATIONS as readonly string[]).includes(operation)) {
          throw new Error(`Unsupported operation: ${operation}`);
        }

        // #1125: each operation runs a real domain handler with the input it
        // needs, taken from the target; without that input it is refused.
        const plan = await planFleetOperation(operation as FleetOperation, options.target);
        if (!plan.success) {
          console.error(chalk.red(`\n Operation '${operation}' cannot run: ${plan.error}`));
          return cleanupAndExit(1);
        }
        const { domain, payload } = plan.task;
        const taskType = plan.task.type as TaskType;

        // #1081: refuse an operation whose task no domain plugin executes,
        // instead of submitting work that can only fail at dispatch.
        const executable = context.queen!.validateTaskExecutable(taskType, [domain]);
        if (!executable.success) {
          console.error(chalk.red(`\n Operation '${operation}' cannot run: ${executable.error.message}`));
          return cleanupAndExit(1);
        }

        console.log(chalk.blue(`\n Fleet Operation: ${operation}\n`));

        const progress = new FleetProgressManager({
          title: `${operation.charAt(0).toUpperCase() + operation.slice(1)} Progress`,
          showEta: true,
        });

        progress.start(parallelCount);

        const agentOperations = Array.from({ length: parallelCount }, (_, i) => {
          const agentId = `${operation}-agent-${i + 1}`;
          return {
            id: agentId,
            name: `${operation}-worker-${i + 1}`,
            domain,
          };
        });

        for (const op of agentOperations) {
          progress.addAgent({
            id: op.id,
            name: op.name,
            status: 'pending',
            progress: 0,
          });
        }

        const results = await Promise.all(
          agentOperations.map(async (op) => {

            progress.updateAgent(op.id, 0, { status: 'running' });

            try {
              const taskResult = await context.queen!.submitTask({
                type: taskType,
                priority: 'p1',
                targetDomains: [domain],
                payload: { ...payload, target: options.target, workerId: op.id },
                timeout: 60000,
              });

              if (!taskResult.success) {
                throw taskResult.error;
              }

              // Submission is only an acknowledgement. Keep the process alive
              // until the domain reports a terminal result or the task expires.
              const deadline = Date.now() + 60000;
              while (Date.now() < deadline) {
                const task = context.queen!.getTaskStatus(taskResult.value);
                if (!task) throw new Error(`Task status unavailable: ${taskResult.value}`);
                if (task.status === 'completed') {
                  progress.completeAgent(op.id, true);
                  return { id: op.id, success: true, result: task.result };
                }
                if (task.status === 'failed' || task.status === 'cancelled') {
                  throw new Error(task.error || `Task ${task.status}`);
                }
                await new Promise(resolve => setTimeout(resolve, 250));
              }
              throw new Error(`Task timed out: ${taskResult.value}`);
            } catch (error) {
              console.error(chalk.red(`   ${op.name}: ${error instanceof Error ? error.message : String(error)}`));
              progress.completeAgent(op.id, false);
              return { id: op.id, success: false, result: undefined };
            }
          })
        );

        // #1168: a completed agent is not a passed check, so the completion
        // line only says "successfully" when the verdict passes.
        const verdictPassed = reportFleetVerdict(operation as FleetOperation, results, () => {}, plan.task.insufficientEvidence);
        progress.stop({ verdictFailed: !verdictPassed });

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(chalk.blue('\n Operation Summary:'));
        console.log(chalk.gray(`   Operation: ${operation}`));
        console.log(chalk.gray(`   Target: ${options.target}`));
        console.log(chalk.gray(`   Completed: ${successful}`));
        if (failed > 0) {
          console.log(chalk.red(`   Failed: ${failed}`));
        }

        // #1125 review: a completed task is not a passed check.
        const passed = reportFleetVerdict(operation as FleetOperation, results, undefined, plan.task.insufficientEvidence);
        console.log('');

        await cleanupAndExit(passed ? 0 : 1);

      } catch (error) {
        console.error(chalk.red('\n Fleet operation failed:'), error);
        await cleanupAndExit(1);
      }
    });
}
