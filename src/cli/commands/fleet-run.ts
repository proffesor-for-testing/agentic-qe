/**
 * Agentic QE v3 - `aqe fleet run` command
 *
 * Runs a coordinated fleet operation (test|analyze|scan) on real domain
 * handlers and judges what they returned (#1125). The target's files are
 * split across the workers (#1146), and `--format json` prints every worker's
 * result as the handler returned it.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import type { TaskType } from '../../coordination/queen-coordinator.js';
import type { DomainName } from '../../shared/types/index.js';
import { FleetProgressManager } from '../utils/progress.js';
import { FLEET_OPERATIONS, planFleetOperation, type FleetOperation } from '../utils/fleet-operation.js';
import { judgeFleetRun, reportFleetVerdict } from '../utils/fleet-result.js';
import { shardFleetPayload } from '../utils/fleet-shard.js';
import { writeOutput, toJSON } from '../utils/ci-output.js';

/** How long a worker waits for its task to reach a terminal state. */
const TASK_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 250;

type Progress = Pick<FleetProgressManager, 'start' | 'addAgent' | 'updateAgent' | 'completeAgent' | 'stop'>;

/** JSON output draws no progress bars on stdout. */
const SILENT_PROGRESS: Progress = {
  start: () => {}, addAgent: () => {}, updateAgent: () => {}, completeAgent: () => {}, stop: () => {},
};

interface WorkerRun {
  id: string;
  name: string;
  /** The share of the target's files this worker was given. */
  files: string[];
  success: boolean;
  result: unknown;
  error?: string;
}

interface WorkerTask {
  queen: NonNullable<CLIContext['queen']>;
  type: TaskType;
  domain: DomainName;
  payload: Record<string, unknown>;
}

/** Submit one worker's task and wait for its terminal result. */
async function runWorkerTask({ queen, type, domain, payload }: WorkerTask): Promise<unknown> {
  const submitted = await queen.submitTask({ type, priority: 'p1', targetDomains: [domain], payload, timeout: TASK_TIMEOUT_MS });
  if (!submitted.success) throw submitted.error;

  // Submission is only an acknowledgement. Keep the process alive until the
  // domain reports a terminal result or the task expires.
  const deadline = Date.now() + TASK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const task = queen.getTaskStatus(submitted.value);
    if (!task) throw new Error(`Task status unavailable: ${submitted.value}`);
    if (task.status === 'completed') return task.result;
    if (task.status === 'failed' || task.status === 'cancelled') throw new Error(task.error || `Task ${task.status}`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Task timed out: ${submitted.value}`);
}

function parseParallel(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('--parallel must be a positive integer');
  return count;
}

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
    .option('--parallel <count>', 'Workers to split the target\'s files across (default 4; analyze runs as one task)')
    .option('-F, --format <format>', 'Output format (text|json)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .action(async (operation: string, options) => {
      const json = options.format === 'json';
      const fail = async (error: string) => {
        if (json) writeOutput(toJSON({ operation, target: options.target, status: 'refused', error }), options.output);
        else console.error(chalk.red(`\n Operation '${operation}' cannot run: ${error}`));
        return cleanupAndExit(1);
      };
      if (!await ensureInitialized()) return cleanupAndExit(1);

      try {
        if (options.format !== 'text' && !json) throw new Error(`Unsupported format: ${options.format} (text|json)`);
        const requested = parseParallel(options.parallel);
        if (!(FLEET_OPERATIONS as readonly string[]).includes(operation)) {
          throw new Error(`Unsupported operation: ${operation}`);
        }
        const op = operation as FleetOperation;

        // #1125: each operation runs a real domain handler with the input it
        // needs, taken from the target; without that input it is refused.
        const plan = await planFleetOperation(op, options.target);
        if (!plan.success) return fail(plan.error);
        const { domain, payload } = plan.task;
        const taskType = plan.task.type as TaskType;

        // #1081: refuse an operation whose task no domain plugin executes,
        // instead of submitting work that can only fail at dispatch.
        const executable = context.queen!.validateTaskExecutable(taskType, [domain]);
        if (!executable.success) return fail(executable.error.message);

        // #1146: each worker handles its own share of the target's files.
        const shards = shardFleetPayload(op, payload, requested);
        const workers = shards.payloads.map((shardPayload, i) => ({
          id: `${operation}-agent-${i + 1}`,
          name: `${operation}-worker-${i + 1}`,
          files: shards.files[i],
          payload: { ...shardPayload, target: options.target, workerId: `${operation}-agent-${i + 1}` },
        }));

        if (!json) {
          console.log(chalk.blue(`\n Fleet Operation: ${operation}\n`));
          if (shards.note) console.log(chalk.yellow(`   Note: ${shards.note}`));
        }
        const progress: Progress = json ? SILENT_PROGRESS : new FleetProgressManager({
          title: `${operation.charAt(0).toUpperCase() + operation.slice(1)} Progress`,
          showEta: true,
        });
        progress.start(workers.length);
        for (const w of workers) progress.addAgent({ id: w.id, name: w.name, status: 'pending', progress: 0 });

        const results: WorkerRun[] = await Promise.all(workers.map(async (w) => {
          progress.updateAgent(w.id, 0, { status: 'running' });
          const run = { id: w.id, name: w.name, files: w.files };
          try {
            const result = await runWorkerTask({ queen: context.queen!, type: taskType, domain, payload: w.payload });
            progress.completeAgent(w.id, true);
            return { ...run, success: true, result };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!json) console.error(chalk.red(`   ${w.name}: ${message}`));
            progress.completeAgent(w.id, false);
            return { ...run, success: false, result: undefined, error: message };
          }
        }));

        const verdict = judgeFleetRun(op, results, plan.task.insufficientEvidence);
        // #1168: the completion line only says "successfully" when the verdict passes.
        progress.stop({ verdictFailed: !verdict.passed });

        if (json) {
          writeOutput(toJSON({
            operation,
            target: options.target,
            status: verdict.passed ? 'passed' : 'failed',
            verdict: { passed: verdict.passed, reasons: verdict.reasons },
            ...(verdict.summary ? { summary: verdict.summary.lines } : {}),
            ...(plan.task.insufficientEvidence ? { insufficientEvidence: plan.task.insufficientEvidence } : {}),
            ...(shards.note ? { note: shards.note } : {}),
            combined: verdict.combined,
            workers: results.map(({ id, files, success, result, error }) => ({
              id, files, status: success ? 'completed' : 'failed', ...(error ? { error } : { result }),
            })),
          }), options.output);
          return cleanupAndExit(verdict.passed ? 0 : 1);
        }

        const failed = results.filter(r => !r.success).length;
        console.log(chalk.blue('\n Operation Summary:'));
        console.log(chalk.gray(`   Operation: ${operation}`));
        console.log(chalk.gray(`   Target: ${options.target}`));
        const split = shards.files.map(f => f.length);
        if (split.some(n => n > 0)) {
          console.log(chalk.gray(`   Workers: ${results.length}, files per worker: ${split.join(', ')}`));
        }
        console.log(chalk.gray(`   Completed: ${results.length - failed}`));
        if (failed > 0) console.log(chalk.red(`   Failed: ${failed}`));

        // #1125 review: a completed task is not a passed check.
        const passed = reportFleetVerdict(op, results, undefined, plan.task.insufficientEvidence);
        console.log('');
        await cleanupAndExit(passed ? 0 : 1);
      } catch (error) {
        if (json) {
          writeOutput(toJSON({
            operation, target: options.target, status: 'error',
            error: error instanceof Error ? error.message : String(error),
          }), options.output);
        } else {
          console.error(chalk.red('\n Fleet operation failed:'), error);
        }
        await cleanupAndExit(1);
      }
    });
}
