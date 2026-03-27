/**
 * Agentic QE v3 - Pipeline Command (Imp-9)
 *
 * CLI commands for YAML deterministic pipeline management:
 *   aqe pipeline load <file.yaml> [--vars key=value]
 *   aqe pipeline validate <file.yaml>
 *   aqe pipeline run <pipeline-id> [--input key=value] [--wait]
 *   aqe pipeline list
 *   aqe pipeline status <execution-id>
 *   aqe pipeline approve <execution-id> <step-id>
 *   aqe pipeline reject <execution-id> <step-id> [--reason "..."]
 */

import { Command } from 'commander';
import { resolve } from 'path';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { YamlPipelineLoader } from '../../coordination/yaml-pipeline-loader.js';
import type { WorkflowOrchestrator } from '../../coordination/workflow-orchestrator.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse `--vars key1=value1 key2=value2` into a Record.
 */
function parseVars(rawVars: string[]): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const entry of rawVars) {
    const eqIndex = entry.indexOf('=');
    if (eqIndex === -1) {
      vars[entry] = true;
    } else {
      const key = entry.slice(0, eqIndex);
      const value = entry.slice(eqIndex + 1);
      // Try to parse as number or boolean
      if (value === 'true') vars[key] = true;
      else if (value === 'false') vars[key] = false;
      else if (!isNaN(Number(value)) && value !== '') vars[key] = Number(value);
      else vars[key] = value;
    }
  }
  return vars;
}

/**
 * Parse `--input key1=value1 key2=value2` into a Record.
 */
function parseInput(rawInput: string[]): Record<string, unknown> {
  return parseVars(rawInput);
}

function getOrchestrator(context: CLIContext): WorkflowOrchestrator | null {
  return context.workflowOrchestrator;
}

// ============================================================================
// Command Factory
// ============================================================================

export function createPipelineCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>,
): Command {
  const loader = new YamlPipelineLoader();

  const pipelineCmd = new Command('pipeline')
    .description('Manage YAML deterministic pipelines (Imp-9)');

  // ---------------------------------------------------------------
  // pipeline load <file.yaml>
  // ---------------------------------------------------------------
  pipelineCmd
    .command('load <file>')
    .description('Load and register a pipeline from a YAML file')
    .option('--vars <entries...>', 'Variable substitutions (key=value)')
    .action(async (file: string, options: { vars?: string[] }) => {
      if (!await ensureInitialized()) return;
      const orchestrator = getOrchestrator(context);
      if (!orchestrator) {
        console.error(chalk.red('  Workflow orchestrator not available. Run "aqe fleet init" first.'));
        await cleanupAndExit(1);
        return;
      }

      const filePath = resolve(file);
      const vars = options.vars ? parseVars(options.vars) : undefined;

      console.log(chalk.blue(`\n  Loading pipeline from: ${file}\n`));

      const result = await loader.loadFromFile(filePath, vars);
      if (!result.success) {
        console.error(chalk.red(`  Parse error: ${result.error.message}`));
        await cleanupAndExit(1);
        return;
      }

      const definition = result.value;
      const registerResult = orchestrator.registerWorkflow(definition);
      if (!registerResult.success) {
        console.error(chalk.red(`  Registration error: ${registerResult.error.message}`));
        await cleanupAndExit(1);
        return;
      }

      console.log(chalk.green('  Pipeline loaded successfully.'));
      console.log(`  ID:      ${chalk.cyan(definition.id)}`);
      console.log(`  Name:    ${chalk.cyan(definition.name)}`);
      console.log(`  Steps:   ${chalk.cyan(definition.steps.length)}`);
      console.log(`  Version: ${chalk.cyan(definition.version)}`);
      if (definition.tags?.length) {
        console.log(`  Tags:    ${chalk.cyan(definition.tags.join(', '))}`);
      }
      console.log('');
      await cleanupAndExit(0);
    });

  // ---------------------------------------------------------------
  // pipeline validate <file.yaml>
  // ---------------------------------------------------------------
  pipelineCmd
    .command('validate <file>')
    .description('Validate a YAML pipeline without registering it')
    .option('--vars <entries...>', 'Variable substitutions (key=value)')
    .action(async (file: string, options: { vars?: string[] }) => {
      const filePath = resolve(file);
      const vars = options.vars ? parseVars(options.vars) : undefined;

      console.log(chalk.blue(`\n  Validating pipeline: ${file}\n`));

      const result = await loader.loadFromFile(filePath, vars);
      if (!result.success) {
        console.log(chalk.red(`  Invalid: ${result.error.message}`));
        await cleanupAndExit(1);
        return;
      }

      const def = result.value;
      console.log(chalk.green('  Valid pipeline.'));
      console.log(`  ID:      ${chalk.cyan(def.id)}`);
      console.log(`  Name:    ${chalk.cyan(def.name)}`);
      console.log(`  Steps:   ${chalk.cyan(def.steps.length)}`);
      console.log('');
      await cleanupAndExit(0);
    });

  // ---------------------------------------------------------------
  // pipeline run <pipeline-id>
  // ---------------------------------------------------------------
  pipelineCmd
    .command('run <pipelineId>')
    .description('Execute a registered pipeline')
    .option('--input <entries...>', 'Input parameters (key=value)')
    .option('--wait', 'Wait for execution to complete')
    .action(async (pipelineId: string, options: { input?: string[]; wait?: boolean }) => {
      if (!await ensureInitialized()) return;
      const orchestrator = getOrchestrator(context);
      if (!orchestrator) {
        console.error(chalk.red('  Workflow orchestrator not available. Run "aqe fleet init" first.'));
        await cleanupAndExit(1);
        return;
      }

      const input = options.input ? parseInput(options.input) : {};

      console.log(chalk.blue(`\n  Running pipeline: ${pipelineId}\n`));

      const result = await orchestrator.executeWorkflow(pipelineId, input);
      if (!result.success) {
        console.error(chalk.red(`  Failed: ${result.error.message}`));
        await cleanupAndExit(1);
        return;
      }

      const executionId = result.value;
      console.log(chalk.green('  Pipeline started.'));
      console.log(`  Execution ID: ${chalk.cyan(executionId)}`);

      if (options.wait) {
        console.log(chalk.gray('  Waiting for completion...'));
        let status = orchestrator.getWorkflowStatus(executionId);
        while (status && (status.status === 'running' || status.status === 'paused')) {
          await new Promise((r) => setTimeout(r, 500));
          status = orchestrator.getWorkflowStatus(executionId);
        }
        if (status) {
          const statusColor = status.status === 'completed' ? chalk.green : chalk.red;
          console.log(`  Status:  ${statusColor(status.status)}`);
          if (status.duration) console.log(`  Duration: ${chalk.cyan(`${status.duration}ms`)}`);
          if (status.error) console.log(`  Error:   ${chalk.red(status.error)}`);
        }
      }

      console.log('');
      await cleanupAndExit(0);
    });

  // ---------------------------------------------------------------
  // pipeline list
  // ---------------------------------------------------------------
  pipelineCmd
    .command('list')
    .description('List all registered pipelines')
    .action(async () => {
      if (!await ensureInitialized()) return;
      const orchestrator = getOrchestrator(context);
      if (!orchestrator) {
        console.error(chalk.red('  Workflow orchestrator not available. Run "aqe fleet init" first.'));
        await cleanupAndExit(1);
        return;
      }

      const workflows = orchestrator.listWorkflows();
      console.log(chalk.blue(`\n  Registered Pipelines (${workflows.length})\n`));

      if (workflows.length === 0) {
        console.log(chalk.gray('  No pipelines registered.'));
      } else {
        for (const wf of workflows) {
          console.log(`  ${chalk.cyan(wf.id)} — ${wf.name} (${wf.stepCount} steps, v${wf.version})`);
          if (wf.tags?.length) {
            console.log(`    Tags: ${chalk.gray(wf.tags.join(', '))}`);
          }
        }
      }

      console.log('');
      await cleanupAndExit(0);
    });

  // ---------------------------------------------------------------
  // pipeline status <execution-id>
  // ---------------------------------------------------------------
  pipelineCmd
    .command('status <executionId>')
    .description('Show the status of a pipeline execution')
    .action(async (executionId: string) => {
      if (!await ensureInitialized()) return;
      const orchestrator = getOrchestrator(context);
      if (!orchestrator) {
        console.error(chalk.red('  Workflow orchestrator not available. Run "aqe fleet init" first.'));
        await cleanupAndExit(1);
        return;
      }

      const status = orchestrator.getWorkflowStatus(executionId);
      if (!status) {
        console.error(chalk.red(`  Execution not found: ${executionId}`));
        await cleanupAndExit(1);
        return;
      }

      const statusColor =
        status.status === 'completed' ? chalk.green :
        status.status === 'failed' ? chalk.red :
        status.status === 'running' ? chalk.yellow : chalk.gray;

      console.log(chalk.blue(`\n  Pipeline Execution Status\n`));
      console.log(`  Execution:  ${chalk.cyan(executionId)}`);
      console.log(`  Pipeline:   ${chalk.cyan(status.workflowName)} (${status.workflowId})`);
      console.log(`  Status:     ${statusColor(status.status)}`);
      console.log(`  Progress:   ${chalk.cyan(`${status.progress}%`)}`);
      console.log(`  Completed:  ${chalk.cyan(status.completedSteps.join(', ') || 'none')}`);
      if (status.failedSteps.length > 0) {
        console.log(`  Failed:     ${chalk.red(status.failedSteps.join(', '))}`);
      }
      if (status.skippedSteps.length > 0) {
        console.log(`  Skipped:    ${chalk.gray(status.skippedSteps.join(', '))}`);
      }
      if (status.currentSteps.length > 0) {
        console.log(`  Running:    ${chalk.yellow(status.currentSteps.join(', '))}`);
      }
      if (status.duration) {
        console.log(`  Duration:   ${chalk.cyan(`${status.duration}ms`)}`);
      }
      if (status.error) {
        console.log(`  Error:      ${chalk.red(status.error)}`);
      }

      console.log('');
      await cleanupAndExit(0);
    });

  // ---------------------------------------------------------------
  // pipeline approve <execution-id> <step-id>
  // ---------------------------------------------------------------
  pipelineCmd
    .command('approve <executionId> <stepId>')
    .description('Approve a step that is awaiting approval')
    .action(async (executionId: string, stepId: string) => {
      if (!await ensureInitialized()) return;
      const orchestrator = getOrchestrator(context);
      if (!orchestrator) {
        console.error(chalk.red('  Workflow orchestrator not available.'));
        await cleanupAndExit(1);
        return;
      }

      const success = orchestrator.approveStep(executionId, stepId);
      if (success) {
        console.log(chalk.green(`\n  Step '${stepId}' approved.\n`));
      } else {
        console.error(chalk.red(`\n  No pending approval found for step '${stepId}' in execution '${executionId}'.\n`));
        await cleanupAndExit(1);
        return;
      }
      await cleanupAndExit(0);
    });

  // ---------------------------------------------------------------
  // pipeline reject <execution-id> <step-id>
  // ---------------------------------------------------------------
  pipelineCmd
    .command('reject <executionId> <stepId>')
    .description('Reject a step that is awaiting approval')
    .option('--reason <reason>', 'Rejection reason')
    .action(async (executionId: string, stepId: string, options: { reason?: string }) => {
      if (!await ensureInitialized()) return;
      const orchestrator = getOrchestrator(context);
      if (!orchestrator) {
        console.error(chalk.red('  Workflow orchestrator not available.'));
        await cleanupAndExit(1);
        return;
      }

      const success = orchestrator.rejectStep(executionId, stepId, options.reason);
      if (success) {
        console.log(chalk.green(`\n  Step '${stepId}' rejected.`));
        if (options.reason) console.log(`  Reason: ${chalk.gray(options.reason)}`);
        console.log('');
      } else {
        console.error(chalk.red(`\n  No pending approval found for step '${stepId}' in execution '${executionId}'.\n`));
        await cleanupAndExit(1);
        return;
      }
      await cleanupAndExit(0);
    });

  return pipelineCmd;
}
