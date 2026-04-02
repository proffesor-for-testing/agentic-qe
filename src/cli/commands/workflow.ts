/**
 * Agentic QE v3 - Workflow Command (ADR-041)
 *
 * Extracted from index.ts to enable lazy loading.
 * Manages QE workflows and pipelines.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { WorkflowExecutionStatus } from '../../coordination/workflow-orchestrator.js';
import {
  parsePipelineFile,
  validatePipeline,
  describeCronSchedule,
} from '../utils/workflow-parser.js';
import { parseJsonOption } from '../helpers/safe-json.js';
import { createScheduleEntry } from '../scheduler/index.js';
import { CLIContext, formatDuration, ScheduledWorkflow } from '../handlers/interfaces.js';

function collectWorkflowVars(val: string, acc: Record<string, string>): Record<string, string> {
  const idx = val.indexOf('=');
  if (idx > 0) {
    acc[val.substring(0, idx)] = val.substring(idx + 1);
  }
  return acc;
}

export function createWorkflowCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>,
): Command {
  const workflowCmd = new Command('workflow')
    .description('Manage QE workflows and pipelines (ADR-041)');

  workflowCmd
    .command('run <file>')
    .description('Execute a QE pipeline from YAML file')
    .option('-w, --watch', 'Watch execution progress')
    .option('-v, --verbose', 'Show detailed output')
    .option('--params <json>', 'Additional parameters as JSON', '{}')
    .action(async (file: string, options) => {
      if (!await ensureInitialized()) return;

      const fs = await import('fs');
      const pathModule = await import('path');
      const filePath = pathModule.resolve(file);

      try {
        console.log(chalk.blue(`\n Running workflow from: ${file}\n`));

        const parseResult = parsePipelineFile(filePath);

        if (!parseResult.success || !parseResult.workflow) {
          console.log(chalk.red('Failed to parse pipeline:'));
          for (const error of parseResult.errors) {
            console.log(chalk.red(`   ${error}`));
          }
          await cleanupAndExit(1);
        }

        const additionalParams = parseJsonOption(options.params, 'params');
        const input: Record<string, unknown> = { ...additionalParams };

        if (parseResult.pipeline) {
          for (const stage of parseResult.pipeline.stages) {
            if (stage.params) {
              for (const [key, value] of Object.entries(stage.params)) {
                input[key] = value;
              }
            }
          }
        }

        const existingWorkflow = context.workflowOrchestrator!.getWorkflow(parseResult.workflow!.id);
        if (!existingWorkflow) {
          const registerResult = context.workflowOrchestrator!.registerWorkflow(parseResult.workflow!);
          if (!registerResult.success) {
            console.log(chalk.red(`Failed to register workflow: ${registerResult.error.message}`));
            await cleanupAndExit(1);
          }
        }

        const execResult = await context.workflowOrchestrator!.executeWorkflow(
          parseResult.workflow!.id,
          input
        );

        if (!execResult.success) {
          console.log(chalk.red(`Failed to start workflow: ${execResult.error.message}`));
          await cleanupAndExit(1);
          return;
        }

        const executionId = execResult.value;
        console.log(chalk.cyan(`  Execution ID: ${executionId}`));
        console.log(chalk.gray(`  Workflow: ${parseResult.workflow!.name}`));
        console.log(chalk.gray(`  Stages: ${parseResult.workflow!.steps.length}`));
        console.log('');

        if (options.watch) {
          console.log(chalk.blue('Workflow Progress:\n'));

          let lastStatus: WorkflowExecutionStatus | undefined;
          const startTime = Date.now();

          while (true) {
            const status = context.workflowOrchestrator!.getWorkflowStatus(executionId);
            if (!status) break;

            if (!lastStatus ||
                lastStatus.progress !== status.progress ||
                lastStatus.status !== status.status ||
                JSON.stringify(lastStatus.currentSteps) !== JSON.stringify(status.currentSteps)) {

              process.stdout.write('\r\x1b[K');

              const progressBar = String.fromCharCode(0x2588).repeat(Math.floor(status.progress / 5)) +
                                 String.fromCharCode(0x2591).repeat(20 - Math.floor(status.progress / 5));

              const statusColor = status.status === 'completed' ? chalk.green :
                                 status.status === 'failed' ? chalk.red :
                                 status.status === 'running' ? chalk.yellow : chalk.gray;

              console.log(`  [${progressBar}] ${status.progress}% - ${statusColor(status.status)}`);

              if (status.currentSteps.length > 0 && options.verbose) {
                console.log(chalk.gray(`    Running: ${status.currentSteps.join(', ')}`));
              }

              lastStatus = status;
            }

            if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
              break;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
          }

          const finalStatus = context.workflowOrchestrator!.getWorkflowStatus(executionId);
          if (finalStatus) {
            console.log('');
            const duration = finalStatus.duration || (Date.now() - startTime);

            if (finalStatus.status === 'completed') {
              console.log(chalk.green(`Workflow completed successfully`));
              console.log(chalk.gray(`   Duration: ${formatDuration(duration)}`));
              console.log(chalk.gray(`   Completed: ${finalStatus.completedSteps.length} stages`));
              if (finalStatus.skippedSteps.length > 0) {
                console.log(chalk.yellow(`   Skipped: ${finalStatus.skippedSteps.length} stages`));
              }
            } else if (finalStatus.status === 'failed') {
              console.log(chalk.red(`Workflow failed`));
              console.log(chalk.red(`   Error: ${finalStatus.error}`));
              console.log(chalk.gray(`   Failed stages: ${finalStatus.failedSteps.join(', ')}`));
            } else {
              console.log(chalk.yellow(`Workflow ${finalStatus.status}`));
            }
          }
        } else {
          console.log(chalk.green('Workflow execution started'));
          console.log(chalk.gray(`   Use 'aqe workflow status ${executionId}' to check progress`));
        }

        console.log('');
        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nFailed to run workflow:'), error);
        await cleanupAndExit(1);
      }
    });

  workflowCmd
    .command('schedule <file>')
    .description('Schedule a QE pipeline for recurring execution')
    .option('-c, --cron <expression>', 'Override cron schedule from file')
    .option('-e, --enable', 'Enable immediately', true)
    .action(async (file: string, options) => {
      if (!await ensureInitialized()) return;

      const pathModule = await import('path');
      const filePath = pathModule.resolve(file);

      try {
        console.log(chalk.blue(`\nScheduling workflow from: ${file}\n`));

        const parseResult = parsePipelineFile(filePath);

        if (!parseResult.success || !parseResult.pipeline || !parseResult.workflow) {
          console.log(chalk.red('Failed to parse pipeline:'));
          for (const error of parseResult.errors) {
            console.log(chalk.red(`   ${error}`));
          }
          await cleanupAndExit(1);
        }

        const schedule = options.cron || parseResult.pipeline!.schedule;
        if (!schedule) {
          console.log(chalk.red('No schedule specified'));
          console.log(chalk.gray('   Add "schedule" field to YAML or use --cron option'));
          await cleanupAndExit(1);
        }

        const existingWorkflow = context.workflowOrchestrator!.getWorkflow(parseResult.workflow!.id);
        if (!existingWorkflow) {
          const registerResult = context.workflowOrchestrator!.registerWorkflow(parseResult.workflow!);
          if (!registerResult.success) {
            console.log(chalk.red(`Failed to register workflow: ${registerResult.error.message}`));
            await cleanupAndExit(1);
          }
        }

        const persistedSchedule = createScheduleEntry({
          workflowId: parseResult.workflow!.id,
          pipelinePath: filePath,
          schedule,
          scheduleDescription: describeCronSchedule(schedule),
          enabled: options.enable !== false,
        });

        await context.persistentScheduler!.saveSchedule(persistedSchedule);

        const scheduledWorkflow: ScheduledWorkflow = {
          id: persistedSchedule.id,
          workflowId: persistedSchedule.workflowId,
          pipelinePath: persistedSchedule.pipelinePath,
          schedule: persistedSchedule.schedule,
          scheduleDescription: persistedSchedule.scheduleDescription,
          nextRun: new Date(persistedSchedule.nextRun),
          enabled: persistedSchedule.enabled,
          createdAt: new Date(persistedSchedule.createdAt),
        };
        context.scheduledWorkflows.set(scheduledWorkflow.id, scheduledWorkflow);

        console.log(chalk.green('Workflow scheduled successfully (persisted to disk)'));
        console.log(chalk.cyan(`   Schedule ID: ${persistedSchedule.id}`));
        console.log(chalk.gray(`   Workflow: ${parseResult.workflow!.name}`));
        console.log(chalk.gray(`   Schedule: ${schedule}`));
        console.log(chalk.gray(`   Description: ${persistedSchedule.scheduleDescription}`));
        console.log(chalk.gray(`   Next run: ${persistedSchedule.nextRun}`));
        console.log(chalk.gray(`   Status: ${persistedSchedule.enabled ? chalk.green('enabled') : chalk.yellow('disabled')}`));

        console.log(chalk.yellow('\nNote: Scheduled workflows require daemon mode to run automatically'));
        console.log(chalk.gray('   Start daemon with: npx aqe daemon start'));
        console.log(chalk.gray('   Schedules are persisted to: ~/.aqe/schedules.json'));

        console.log('');
        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nFailed to schedule workflow:'), error);
        await cleanupAndExit(1);
      }
    });

  workflowCmd
    .command('list')
    .description('List workflows')
    .option('-s, --scheduled', 'Show only scheduled workflows')
    .option('-a, --active', 'Show only active executions')
    .option('--all', 'Show all workflows (registered + scheduled + active)')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        console.log(chalk.blue('\nWorkflows\n'));

        if (options.scheduled || options.all) {
          console.log(chalk.cyan('Scheduled Workflows:'));
          const scheduled = await context.persistentScheduler!.getSchedules();

          if (scheduled.length === 0) {
            console.log(chalk.gray('  No scheduled workflows\n'));
          } else {
            for (const sched of scheduled) {
              const statusIcon = sched.enabled ? chalk.green('*') : chalk.gray('o');
              console.log(`  ${statusIcon} ${chalk.white(sched.workflowId)}`);
              console.log(chalk.gray(`     ID: ${sched.id}`));
              console.log(chalk.gray(`     Schedule: ${sched.schedule} (${sched.scheduleDescription})`));
              console.log(chalk.gray(`     File: ${sched.pipelinePath}`));
              console.log(chalk.gray(`     Next run: ${sched.nextRun}`));
              if (sched.lastRun) {
                console.log(chalk.gray(`     Last run: ${sched.lastRun}`));
              }
              console.log(chalk.gray(`     Status: ${sched.enabled ? chalk.green('enabled') : chalk.yellow('disabled')}`));
              console.log('');
            }
          }
        }

        if (options.active || options.all) {
          console.log(chalk.cyan('Active Executions:'));
          const activeExecutions = context.workflowOrchestrator!.getActiveExecutions();

          if (activeExecutions.length === 0) {
            console.log(chalk.gray('  No active executions\n'));
          } else {
            for (const exec of activeExecutions) {
              const statusColor = exec.status === 'running' ? chalk.yellow : chalk.gray;
              console.log(`  ${statusColor('*')} ${chalk.white(exec.workflowName)}`);
              console.log(chalk.gray(`     Execution: ${exec.executionId}`));
              console.log(chalk.gray(`     Status: ${exec.status}`));
              console.log(chalk.gray(`     Progress: ${exec.progress}%`));
              if (exec.currentSteps.length > 0) {
                console.log(chalk.gray(`     Current: ${exec.currentSteps.join(', ')}`));
              }
              console.log('');
            }
          }
        }

        if (!options.scheduled && !options.active || options.all) {
          console.log(chalk.cyan('Registered Workflows:'));
          const workflows = context.workflowOrchestrator!.listWorkflows();

          if (workflows.length === 0) {
            console.log(chalk.gray('  No registered workflows\n'));
          } else {
            for (const workflow of workflows) {
              console.log(`  ${chalk.white(workflow.name)} (${chalk.cyan(workflow.id)})`);
              console.log(chalk.gray(`     Version: ${workflow.version}`));
              console.log(chalk.gray(`     Steps: ${workflow.stepCount}`));
              if (workflow.description) {
                console.log(chalk.gray(`     ${workflow.description}`));
              }
              if (workflow.tags && workflow.tags.length > 0) {
                console.log(chalk.gray(`     Tags: ${workflow.tags.join(', ')}`));
              }
              if (workflow.triggers && workflow.triggers.length > 0) {
                console.log(chalk.gray(`     Triggers: ${workflow.triggers.join(', ')}`));
              }
              console.log('');
            }
          }
        }

        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nFailed to list workflows:'), error);
        await cleanupAndExit(1);
      }
    });

  workflowCmd
    .command('validate <file>')
    .description('Validate a pipeline YAML file')
    .option('-v, --verbose', 'Show detailed validation results')
    .action(async (file: string, options) => {
      const fs = await import('fs');
      const pathModule = await import('path');
      const filePath = pathModule.resolve(file);

      try {
        console.log(chalk.blue(`\nValidating pipeline: ${file}\n`));

        if (!fs.existsSync(filePath)) {
          console.log(chalk.red(`File not found: ${filePath}`));
          await cleanupAndExit(1);
        }

        const parseResult = parsePipelineFile(filePath);

        if (!parseResult.success) {
          console.log(chalk.red('Parse errors:'));
          for (const error of parseResult.errors) {
            console.log(chalk.red(`   * ${error}`));
          }
          await cleanupAndExit(1);
        }

        const validationResult = validatePipeline(parseResult.pipeline!);

        if (validationResult.valid) {
          console.log(chalk.green('Pipeline is valid\n'));
        } else {
          console.log(chalk.red('Pipeline has errors:\n'));
          for (const error of validationResult.errors) {
            console.log(chalk.red(`   x [${error.path}] ${error.message}`));
          }
          console.log('');
        }

        if (validationResult.warnings.length > 0) {
          console.log(chalk.yellow('Warnings:'));
          for (const warning of validationResult.warnings) {
            console.log(chalk.yellow(`   * [${warning.path}] ${warning.message}`));
          }
          console.log('');
        }

        if (options.verbose && parseResult.pipeline) {
          const pipeline = parseResult.pipeline;
          console.log(chalk.cyan('Pipeline Details:\n'));
          console.log(chalk.gray(`  Name: ${pipeline.name}`));
          console.log(chalk.gray(`  Version: ${pipeline.version || '1.0.0'}`));
          if (pipeline.description) {
            console.log(chalk.gray(`  Description: ${pipeline.description}`));
          }
          if (pipeline.schedule) {
            console.log(chalk.gray(`  Schedule: ${pipeline.schedule} (${describeCronSchedule(pipeline.schedule)})`));
          }
          if (pipeline.tags && pipeline.tags.length > 0) {
            console.log(chalk.gray(`  Tags: ${pipeline.tags.join(', ')}`));
          }

          console.log(chalk.cyan('\n  Stages:'));
          for (let i = 0; i < pipeline.stages.length; i++) {
            const stage = pipeline.stages[i];
            console.log(`    ${i + 1}. ${chalk.white(stage.name)}`);
            console.log(chalk.gray(`       Command: ${stage.command}`));
            if (stage.params) {
              console.log(chalk.gray(`       Params: ${JSON.stringify(stage.params)}`));
            }
            if (stage.depends_on && stage.depends_on.length > 0) {
              console.log(chalk.gray(`       Depends on: ${stage.depends_on.join(', ')}`));
            }
            if (stage.timeout) {
              console.log(chalk.gray(`       Timeout: ${stage.timeout}s`));
            }
          }

          if (pipeline.triggers && pipeline.triggers.length > 0) {
            console.log(chalk.cyan('\n  Triggers:'));
            for (const trigger of pipeline.triggers) {
              console.log(chalk.gray(`    * ${trigger.event}`));
              if (trigger.branches) {
                console.log(chalk.gray(`      Branches: ${trigger.branches.join(', ')}`));
              }
            }
          }
        }

        if (options.verbose && parseResult.workflow) {
          console.log(chalk.cyan('\n  Converted Workflow ID: ') + chalk.white(parseResult.workflow.id));
          console.log(chalk.gray(`  Steps: ${parseResult.workflow.steps.length}`));
          for (const step of parseResult.workflow.steps) {
            console.log(chalk.gray(`    * ${step.id}: ${step.domain}.${step.action}`));
          }
        }

        console.log('');
        await cleanupAndExit(validationResult.valid ? 0 : 1);

      } catch (error) {
        console.error(chalk.red('\nValidation failed:'), error);
        await cleanupAndExit(1);
      }
    });

  workflowCmd
    .command('status <executionId>')
    .description('Get workflow execution status')
    .option('-v, --verbose', 'Show detailed step results')
    .action(async (executionId: string, options) => {
      if (!await ensureInitialized()) return;

      try {
        const status = context.workflowOrchestrator!.getWorkflowStatus(executionId);

        if (!status) {
          console.log(chalk.red(`\nExecution not found: ${executionId}\n`));
          await cleanupAndExit(1);
          return;
        }

        console.log(chalk.blue(`\nWorkflow Execution Status\n`));

        const statusColor = status.status === 'completed' ? chalk.green :
                           status.status === 'failed' ? chalk.red :
                           status.status === 'running' ? chalk.yellow : chalk.gray;

        console.log(`  Execution ID: ${chalk.cyan(status.executionId)}`);
        console.log(`  Workflow: ${chalk.white(status.workflowName)} (${status.workflowId})`);
        console.log(`  Status: ${statusColor(status.status)}`);
        console.log(`  Progress: ${status.progress}%`);
        console.log(`  Started: ${status.startedAt.toISOString()}`);
        if (status.completedAt) {
          console.log(`  Completed: ${status.completedAt.toISOString()}`);
        }
        if (status.duration) {
          console.log(`  Duration: ${formatDuration(status.duration)}`);
        }

        console.log(chalk.cyan('\n  Step Summary:'));
        console.log(chalk.gray(`    Completed: ${status.completedSteps.length}`));
        console.log(chalk.gray(`    Skipped: ${status.skippedSteps.length}`));
        console.log(chalk.gray(`    Failed: ${status.failedSteps.length}`));
        if (status.currentSteps.length > 0) {
          console.log(chalk.yellow(`    Running: ${status.currentSteps.join(', ')}`));
        }

        if (status.error) {
          console.log(chalk.red(`\n  Error: ${status.error}`));
        }

        if (options.verbose && status.stepResults.size > 0) {
          console.log(chalk.cyan('\n  Step Results:'));
          for (const [stepId, result] of status.stepResults) {
            const stepStatusColor = result.status === 'completed' ? chalk.green :
                                    result.status === 'failed' ? chalk.red :
                                    result.status === 'skipped' ? chalk.yellow : chalk.gray;
            console.log(`    ${stepStatusColor('*')} ${chalk.white(stepId)}: ${stepStatusColor(result.status)}`);
            if (result.duration) {
              console.log(chalk.gray(`       Duration: ${formatDuration(result.duration)}`));
            }
            if (result.error) {
              console.log(chalk.red(`       Error: ${result.error}`));
            }
            if (result.retryCount && result.retryCount > 0) {
              console.log(chalk.yellow(`       Retries: ${result.retryCount}`));
            }
          }
        }

        console.log('');
        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nFailed to get workflow status:'), error);
        await cleanupAndExit(1);
      }
    });

  workflowCmd
    .command('cancel <executionId>')
    .description('Cancel a running workflow')
    .action(async (executionId: string) => {
      if (!await ensureInitialized()) return;

      try {
        const result = await context.workflowOrchestrator!.cancelWorkflow(executionId);

        if (result.success) {
          console.log(chalk.green(`\nWorkflow cancelled: ${executionId}\n`));
        } else {
          console.log(chalk.red(`\nFailed to cancel workflow: ${result.error.message}\n`));
        }

        await cleanupAndExit(result.success ? 0 : 1);

      } catch (error) {
        console.error(chalk.red('\nFailed to cancel workflow:'), error);
        await cleanupAndExit(1);
      }
    });

  workflowCmd
    .command('browser-list')
    .description('List available browser workflow templates')
    .action(async () => {
      try {
        const { BrowserWorkflowTool } = await import('../../mcp/tools/test-execution/browser-workflow.js');
        const tool = new BrowserWorkflowTool();
        const result = await tool.invoke({});

        if (result.success && result.data) {
          console.log(chalk.blue('\n Browser Workflow Templates:\n'));
          for (const t of result.data.availableTemplates) {
            console.log(`  ${chalk.cyan(t)}`);
          }
          console.log('');
        } else {
          console.log(chalk.red(`Failed: ${result.error || 'Unknown error'}`));
        }
        await cleanupAndExit(0);
      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
    });

  workflowCmd
    .command('browser-load [template]')
    .description('Load and validate a browser workflow template or inline YAML')
    .option('--yaml <yaml>', 'Inline YAML workflow definition')
    .option('-v, --var <key=value>', 'Variable override (repeatable)', collectWorkflowVars, {})
    .option('-F, --format <format>', 'Output format (text|json)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .action(async (template: string | undefined, options) => {
      try {
        const { BrowserWorkflowTool } = await import('../../mcp/tools/test-execution/browser-workflow.js');
        const { writeOutput, toJSON } = await import('../utils/ci-output.js');
        const tool = new BrowserWorkflowTool();

        const params: Record<string, unknown> = {
          variables: options.var || {},
        };

        if (options.yaml) {
          params.workflowYaml = options.yaml;
        } else if (template) {
          if (template.endsWith('.yaml') || template.endsWith('.yml')) {
            const fs = await import('fs');
            const pathModule = await import('path');
            const filePath = pathModule.resolve(template);
            if (!fs.existsSync(filePath)) {
              console.log(chalk.red(`\nFile not found: ${filePath}\n`));
              await cleanupAndExit(1);
            }
            params.workflowYaml = fs.readFileSync(filePath, 'utf-8');
          } else {
            params.templateName = template;
          }
        } else {
          console.log(chalk.red('\nProvide a template name or --yaml. Use "workflow browser-list" to see templates.\n'));
          await cleanupAndExit(1);
        }

        console.log(chalk.blue(`\n Loading browser workflow${template ? ': ' + template : ''}...\n`));

        const result = await tool.invoke(params);

        if (result.success && result.data) {
          const data = result.data;
          if (options.format === 'json') {
            writeOutput(toJSON(data), options.output);
          } else {
            console.log(chalk.green(` Workflow: ${data.workflowName}`));
            if (data.description) {
              console.log(chalk.gray(`  ${data.description}`));
            }
            console.log(`  Source: ${chalk.cyan(data.source)}`);
            console.log(`  Steps: ${chalk.white(data.steps.length)}`);

            if (data.steps.length > 0) {
              console.log(chalk.cyan('\n  Steps:'));
              for (const step of data.steps) {
                const optTag = step.optional ? chalk.gray(' (optional)') : '';
                const assertTag = step.assertionCount > 0 ? chalk.gray(` [${step.assertionCount} assertions]`) : '';
                console.log(`    ${chalk.white(step.name)} — ${step.action}${optTag}${assertTag}`);
              }
            }

            if (data.variables.defined.length > 0) {
              console.log(chalk.cyan('\n  Variables:'));
              for (const v of data.variables.defined) {
                const req = v.required ? chalk.red('*') : '';
                const def = v.hasDefault ? chalk.gray(' (has default)') : '';
                console.log(`    ${req}${chalk.white(v.name)}: ${v.type}${def}`);
              }
            }

            if (!data.validation.valid) {
              console.log(chalk.red('\n  Validation errors:'));
              for (const err of data.validation.errors) {
                console.log(chalk.red(`    - ${err}`));
              }
            }
            console.log('');
          }

          await cleanupAndExit(data.validation.valid ? 0 : 1);
        } else {
          console.log(chalk.red(`Failed: ${result.error || 'Unknown error'}`));
          await cleanupAndExit(1);
        }
      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
    });

  return workflowCmd;
}
