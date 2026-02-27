#!/usr/bin/env node

/**
 * Agentic QE v3 - Command Line Interface
 *
 * Provides CLI access to the v3 DDD architecture through the Queen Coordinator.
 * All commands delegate to domain services via the coordination layer.
 *
 * Refactored to use CommandRegistry and handlers for better maintainability.
 * See: cli/handlers/ for command implementations
 * See: cli/commands/ for additional command modules
 */

import { toErrorMessage } from '../shared/error-utils.js';
import { Command } from 'commander';
import chalk from 'chalk';
import { QEKernel } from '../kernel/interfaces';
import { QEKernelImpl } from '../kernel/kernel';
import { UnifiedMemoryManager } from '../kernel/unified-memory';
import {
  QueenCoordinator,
  createQueenCoordinator,
} from '../coordination/queen-coordinator';
import { CrossDomainEventRouter } from '../coordination/cross-domain-router';
import { DefaultProtocolExecutor } from '../coordination/protocol-executor';
import { WorkflowOrchestrator, type WorkflowExecutionStatus } from '../coordination/workflow-orchestrator';
import { DomainName, ALL_DOMAINS } from '../shared/types';
import { integrateCodeIntelligence, type FleetIntegrationResult } from '../init/fleet-integration';
import { bootstrapTokenTracking, shutdownTokenTracking } from '../init/token-bootstrap.js';
import {
  FleetProgressManager,
  createTimedSpinner,
} from './utils/progress';
import {
  parsePipelineFile,
  validatePipeline,
  describeCronSchedule,
} from './utils/workflow-parser.js';
import { parseJsonOption, parseJsonFile } from './helpers/safe-json.js';
import {
  runFleetInitWizard,
  type FleetWizardResult,
} from './wizards/fleet-wizard.js';
import {
  runCoverageAnalysisWizard,
  type CoverageWizardResult,
} from './wizards/coverage-wizard.js';
import {
  createPersistentScheduler,
  createScheduleEntry,
  type PersistentScheduler,
} from './scheduler/index.js';
import {
  v2AgentMapping,
  resolveAgentName,
  isDeprecatedAgent,
  v3Agents,
} from '../migration/agent-compat.js';
import {
  generateCompletion,
  detectShell,
  getInstallInstructions,
  DOMAINS as COMPLETION_DOMAINS,
  QE_AGENTS,
  OTHER_AGENTS,
} from './completions/index.js';
import type { VisualAccessibilityAPI } from '../domains/visual-accessibility/plugin.js';
import type { RequirementsValidationExtendedAPI } from '../domains/requirements-validation/plugin.js';

// Import handlers and registry
import { createCommandRegistry } from './command-registry.js';
import { CLIContext, formatDuration, getStatusColor, walkDirectory, getColorForPercent, ScheduledWorkflow } from './handlers/interfaces.js';

// ============================================================================
// Redirect internal domain logs to stderr so stdout stays clean for CI/JSON
// ============================================================================

const INTERNAL_LOG_PREFIXES = [
  '[UnifiedMemory]', '[HybridBackend]', '[UnifiedPersistence]',
  '[PersistentSONAEngine]', '[QueenGovernance]', '[QueenCoordinator]',
  '[Queen]', '[QUEEN]', '[DomainBreakerRegistry]',
  '[RealEmbeddings]', '[HNSWIndex]', '[PatternStore]',
  '[TestGenerationCoordinator]', '[CodeIntelligence]', '[ProductFactorsBridge]',
  '[LearningOptimizationCoordinator]', '[DreamEngine]', '[DreamScheduler]',
  '[SecurityCompliance]', '[Providers]', '[GNN]',
  '[test-generation]', '[test-execution]', '[coverage-analysis]',
  '[quality-assessment]', '[defect-intelligence]', '[requirements-validation]',
  '[code-intelligence]', '[security-compliance]', '[contract-testing]',
  '[visual-accessibility]', '[chaos-resilience]', '[learning-optimization]',
  '[enterprise-integration]', '[coordination]', '[PatternLearnerService]',
  '[RequirementsValidation]',
];

const originalConsoleLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  const trimmed = first.trimStart();
  if (INTERNAL_LOG_PREFIXES.some(prefix => trimmed.startsWith(prefix))) {
    process.stderr.write(args.map(String).join(' ') + '\n');
    return;
  }
  originalConsoleLog(...args);
};

// Also redirect timestamped INFO/WARN/ERROR log lines (e.g. "[07:12:24.372] [INFO ]")
const originalConsoleInfo = console.info.bind(console);
console.info = (...args: unknown[]) => {
  process.stderr.write(args.map(String).join(' ') + '\n');
};

// ============================================================================
// CLI State
// ============================================================================

const context: CLIContext = {
  kernel: null,
  queen: null,
  router: null,
  workflowOrchestrator: null,
  scheduledWorkflows: new Map(),
  persistentScheduler: null,
  initialized: false,
};

/**
 * Register domain workflow actions with the WorkflowOrchestrator (Issue #206)
 */
function registerDomainWorkflowActions(
  kernel: QEKernel,
  orchestrator: WorkflowOrchestrator
): void {
  // Register visual-accessibility workflow actions
  const visualAccessibilityAPI = kernel.getDomainAPI<VisualAccessibilityAPI>('visual-accessibility');
  if (visualAccessibilityAPI?.registerWorkflowActions) {
    try {
      visualAccessibilityAPI.registerWorkflowActions(orchestrator);
    } catch (error) {
      console.error(
        chalk.yellow(`  Warning: Could not register visual-accessibility workflow actions: ${toErrorMessage(error)}`)
      );
    }
  }

  // Register requirements-validation workflow actions (QCSD Ideation Swarm)
  const requirementsValidationAPI = kernel.getDomainAPI<RequirementsValidationExtendedAPI>('requirements-validation');
  if (requirementsValidationAPI?.registerWorkflowActions) {
    try {
      requirementsValidationAPI.registerWorkflowActions(orchestrator);
    } catch (error) {
      console.error(
        chalk.yellow(`  Warning: Could not register requirements-validation workflow actions: ${toErrorMessage(error)}`)
      );
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function autoInitialize(): Promise<void> {
  context.kernel = new QEKernelImpl({
    maxConcurrentAgents: 15,
    memoryBackend: 'sqlite',
    hnswEnabled: true,
    lazyLoading: true,
    enabledDomains: [...ALL_DOMAINS],
  });

  await context.kernel.initialize();

  context.router = new CrossDomainEventRouter(context.kernel.eventBus);
  await context.router.initialize();

  const getDomainAPI = <T>(domain: DomainName): T | undefined => {
    return context.kernel!.getDomainAPI<T>(domain);
  };
  const protocolExecutor = new DefaultProtocolExecutor(
    context.kernel.eventBus,
    context.kernel.memory,
    getDomainAPI
  );

  context.workflowOrchestrator = new WorkflowOrchestrator(
    context.kernel.eventBus,
    context.kernel.memory,
    context.kernel.coordinator
  );
  await context.workflowOrchestrator.initialize();

  registerDomainWorkflowActions(context.kernel, context.workflowOrchestrator);

  context.persistentScheduler = createPersistentScheduler();

  context.queen = createQueenCoordinator(
    context.kernel,
    context.router,
    protocolExecutor,
    undefined
  );
  await context.queen.initialize();

  context.initialized = true;
}

async function ensureInitializedStrict(): Promise<boolean> {
  if (context.initialized && context.kernel && context.queen) {
    return true;
  }

  // For diagnostic commands: check if project was explicitly initialized
  const fs = await import('fs');
  const path = await import('path');
  const configDir = path.resolve('.agentic-qe');
  if (!fs.existsSync(configDir)) {
    console.error(chalk.red('\nError: AQE system not initialized in this directory.'));
    console.log(chalk.yellow('Run `aqe init` first to set up this project.\n'));
    return false;
  }

  return ensureInitialized();
}

async function ensureInitialized(): Promise<boolean> {
  if (context.initialized && context.kernel && context.queen) {
    return true;
  }

  process.stderr.write(chalk.gray('Auto-initializing v3 system...') + '\n');
  const timeout = 30000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Initialization timeout after 30 seconds')), timeout);
  });

  try {
    await Promise.race([autoInitialize(), timeoutPromise]);
    process.stderr.write(chalk.green('System ready') + '\n\n');
    return true;
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('timeout')) {
      console.error(chalk.red('Initialization timed out after 30 seconds.'));
      console.log(chalk.yellow('Try running `aqe init` manually.'));
    } else {
      console.error(chalk.red('Failed to auto-initialize:'), err);
      console.log(chalk.yellow('Try running `aqe init` manually.'));
    }
    return false;
  }
}

/**
 * Cleanup resources and exit the process
 */
async function cleanupAndExit(code: number = 0): Promise<never> {
  // Safety net: force exit after 3s if async handles keep event loop alive
  const forceExitTimer = setTimeout(() => process.exit(code), 3000);
  forceExitTimer.unref?.();

  try {
    await shutdownTokenTracking();

    if (context.workflowOrchestrator) {
      await context.workflowOrchestrator.dispose();
    }
    if (context.queen) {
      await context.queen.dispose();
    }
    if (context.router) {
      await context.router.dispose();
    }
    if (context.kernel) {
      await context.kernel.dispose();
    }

    UnifiedMemoryManager.resetInstance();
  } catch (error) {
    // Non-critical: cleanup errors during exit
    console.debug('[CLI] Cleanup error during exit:', error instanceof Error ? error.message : error);
  }
  process.exit(code);
}

// ============================================================================
// CLI Program
// ============================================================================

const program = new Command();

const VERSION = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : '0.0.0-dev';

program
  .name('aqe')
  .description('Agentic QE - Domain-Driven Quality Engineering')
  .version(VERSION);

// ============================================================================
// Register Handlers via CommandRegistry
// ============================================================================

const registry = createCommandRegistry(context, cleanupAndExit, ensureInitialized, ensureInitializedStrict);
registry.registerAll(program);

// ============================================================================
// Workflow Command Group (ADR-041)
// ============================================================================

const workflowCmd = program
  .command('workflow')
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

// ============================================================================
// Shortcut Commands (test, coverage, quality, security, code)
// ============================================================================

import { createTestCommand } from './commands/test.js';
import { createCoverageCommand } from './commands/coverage.js';
import { createQualityCommand } from './commands/quality.js';
import { createSecurityCommand } from './commands/security.js';
import { createCodeCommand } from './commands/code.js';
import { createMigrateCommand } from './commands/migrate.js';
import { createCompletionsCommand } from './commands/completions.js';
import { createFleetCommand } from './commands/fleet.js';
import { createValidateSwarmCommand } from './commands/validate-swarm.js';
import { createValidateCommand } from './commands/validate.js';
import { createEvalCommand } from './commands/eval.js';
import { createCICommand } from './commands/ci.js';

// Register shortcut commands
program.addCommand(createTestCommand(context, cleanupAndExit, ensureInitialized));
program.addCommand(createCoverageCommand(context, cleanupAndExit, ensureInitialized));
program.addCommand(createQualityCommand(context, cleanupAndExit, ensureInitialized));
program.addCommand(createSecurityCommand(context, cleanupAndExit, ensureInitialized));
program.addCommand(createCodeCommand(context, cleanupAndExit, ensureInitialized));
program.addCommand(createMigrateCommand(context, cleanupAndExit, ensureInitialized));
program.addCommand(createCompletionsCommand(cleanupAndExit));
program.addCommand(createFleetCommand(context, cleanupAndExit, ensureInitialized, registerDomainWorkflowActions));
program.addCommand(createValidateSwarmCommand(context, cleanupAndExit, ensureInitialized));
program.addCommand(createValidateCommand(context, cleanupAndExit, ensureInitialized));
program.addCommand(createEvalCommand());
program.addCommand(createCICommand(context, cleanupAndExit, ensureInitialized));

// ============================================================================
// External Command Modules
// ============================================================================

import { createTokenUsageCommand } from './commands/token-usage.js';
import { createLLMRouterCommand } from './commands/llm-router.js';
import { createSyncCommands } from './commands/sync.js';
import { createHooksCommand } from './commands/hooks.js';
import { createLearningCommand } from './commands/learning.js';
import { createMcpCommand } from './commands/mcp.js';

program.addCommand(createTokenUsageCommand());
program.addCommand(createLLMRouterCommand());
program.addCommand(createSyncCommands());
program.addCommand(createHooksCommand());
program.addCommand(createLearningCommand());
program.addCommand(createMcpCommand());

// ============================================================================
// Shutdown Handlers
// ============================================================================

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\nShutting down...'));
  console.log(chalk.green('Shutdown complete\n'));
  await cleanupAndExit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\nReceived SIGTERM, shutting down gracefully...'));
  await cleanupAndExit(0);
});

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  await bootstrapTokenTracking({
    enableOptimization: true,
    enablePersistence: true,
    verbose: process.env.AQE_VERBOSE === 'true',
  });

  await program.parseAsync();

  // If the command didn't explicitly exit, clean up and exit now.
  // This prevents process hangs from active handles (domain init, embeddings, etc.)
  await cleanupAndExit(0);
}

main().catch(async (error) => {
  console.error(chalk.red('Fatal error:'), error);
  await cleanupAndExit(1);
});
