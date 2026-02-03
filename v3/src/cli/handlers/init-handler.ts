/**
 * Agentic QE v3 - Init Command Handler
 *
 * Handles the 'aqe init' command for system initialization.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ICommandHandler, CLIContext } from './interfaces.js';
import { QEKernelImpl } from '../../kernel/kernel.js';
import { DomainName, ALL_DOMAINS } from '../../shared/types/index.js';
import { CrossDomainEventRouter } from '../../coordination/cross-domain-router.js';
import { DefaultProtocolExecutor } from '../../coordination/protocol-executor.js';
import { WorkflowOrchestrator } from '../../coordination/workflow-orchestrator.js';
import { createQueenCoordinator } from '../../coordination/queen-coordinator.js';
import { InitOrchestrator, type InitOrchestratorOptions } from '../../init/init-wizard.js';
import {
  createModularInitOrchestrator,
} from '../../init/orchestrator.js';
import { setupClaudeFlowIntegration, type ClaudeFlowSetupResult } from '../commands/claude-flow-setup.js';
import { createPersistentScheduler } from '../scheduler/index.js';
import type { VisualAccessibilityAPI } from '../../domains/visual-accessibility/plugin.js';
import type { RequirementsValidationExtendedAPI } from '../../domains/requirements-validation/plugin.js';
import type { QEKernel } from '../../kernel/interfaces.js';

// ============================================================================
// Init Handler
// ============================================================================

export class InitHandler implements ICommandHandler {
  readonly name = 'init';
  readonly description = 'Initialize the AQE v3 system';

  private cleanupAndExit: (code: number) => Promise<never>;

  constructor(cleanupAndExit: (code: number) => Promise<never>) {
    this.cleanupAndExit = cleanupAndExit;
  }

  register(program: Command, context: CLIContext): void {
    program
      .command('init')
      .description(this.description)
      .option('-d, --domains <domains>', 'Comma-separated list of domains to enable', 'all')
      .option('-m, --max-agents <number>', 'Maximum concurrent agents', '15')
      .option('--memory <backend>', 'Memory backend (sqlite|agentdb|hybrid)', 'hybrid')
      .option('--lazy', 'Enable lazy loading of domains')
      .option('--wizard', 'Run interactive setup wizard')
      .option('--auto', 'Auto-configure based on project analysis')
      .option('-u, --upgrade', 'Upgrade existing installation (overwrite skills, agents, validation)')
      .option('--minimal', 'Minimal configuration (skip optional features)')
      .option('--skip-patterns', 'Skip loading pre-trained patterns')
      .option('--with-n8n', 'Install n8n workflow testing agents and skills')
      .option('--auto-migrate', 'Automatically migrate from v2 if detected')
      .option('--with-claude-flow', 'Force Claude Flow integration setup')
      .option('--skip-claude-flow', 'Skip Claude Flow integration')
      .option('--modular', 'Use new modular init system (default for --auto)')
      .action(async (options) => {
        await this.execute(options, context);
      });
  }

  async execute(options: InitOptions, context: CLIContext): Promise<void> {
    try {
      // --auto-migrate implies --auto (must use orchestrator for migration)
      if (options.autoMigrate && !options.auto && !options.wizard) {
        options.auto = true;
      }

      // --upgrade implies --auto (must use modular orchestrator to overwrite files)
      if (options.upgrade && !options.auto && !options.wizard) {
        options.auto = true;
      }

      // Check if wizard mode requested
      if (options.wizard || options.auto) {
        console.log(chalk.blue('\n  Agentic QE v3 Initialization\n'));

        // Use modular orchestrator for --auto or --modular
        if (options.auto || options.modular) {
          await this.runModularInit(options, context);
          return;
        }

        // Legacy wizard mode using InitOrchestrator
        await this.runLegacyWizard(options, context);
        return;
      }

      // Standard init without wizard
      await this.runStandardInit(options, context);
    } catch (error) {
      console.error(chalk.red('\n  Failed to initialize:'), error);
      await this.cleanupAndExit(1);
    }
  }

  private async runModularInit(options: InitOptions, context: CLIContext): Promise<void> {
    const orchestrator = createModularInitOrchestrator({
      projectRoot: process.cwd(),
      autoMode: options.auto,
      upgrade: options.upgrade,
      minimal: options.minimal,
      skipPatterns: options.skipPatterns,
      withN8n: options.withN8n,
      autoMigrate: options.autoMigrate,
    });

    console.log(chalk.white('  Analyzing project...\n'));

    const result = await orchestrator.initialize();

    // Display step results
    for (const step of result.steps) {
      const statusIcon = step.status === 'success' ? '*' : step.status === 'error' ? 'x' : '!';
      const statusColor = step.status === 'success' ? chalk.green : step.status === 'error' ? chalk.red : chalk.yellow;
      console.log(statusColor(`  ${statusIcon} ${step.step} (${step.durationMs}ms)`));
    }
    console.log('');

    // Claude Flow integration (after base init)
    let cfResult: ClaudeFlowSetupResult | undefined;
    if (!options.skipClaudeFlow && (options.withClaudeFlow || result.success)) {
      try {
        cfResult = await setupClaudeFlowIntegration({
          projectRoot: process.cwd(),
          force: options.withClaudeFlow,
        });

        if (cfResult.available) {
          console.log(chalk.green('  * Claude Flow integration enabled'));
          if (cfResult.features.trajectories) {
            console.log(chalk.gray('    - SONA trajectory tracking'));
          }
          if (cfResult.features.modelRouting) {
            console.log(chalk.gray('    - 3-tier model routing (haiku/sonnet/opus)'));
          }
          if (cfResult.features.pretrain) {
            console.log(chalk.gray('    - Codebase pretrain analysis'));
          }
          console.log('');
        }
      } catch {
        // Claude Flow not available - continue without it
      }
    }

    if (result.success) {
      console.log(chalk.green('  AQE v3 initialized successfully!\n'));

      // Show summary
      console.log(chalk.blue('  Summary:'));
      console.log(chalk.gray(`    - Patterns loaded: ${result.summary.patternsLoaded}`));
      console.log(chalk.gray(`    - Skills installed: ${result.summary.skillsInstalled}`));
      console.log(chalk.gray(`    - Agents installed: ${result.summary.agentsInstalled}`));
      console.log(chalk.gray(`    - Hooks configured: ${result.summary.hooksConfigured ? 'Yes' : 'No'}`));
      console.log(chalk.gray(`    - Workers started: ${result.summary.workersStarted}`));
      console.log(chalk.gray(`    - Claude Flow: ${cfResult?.available ? 'Enabled' : 'Standalone mode'}`));
      console.log(chalk.gray(`    - Total time: ${result.totalDurationMs}ms\n`));

      console.log(chalk.white('Next steps:'));
      console.log(chalk.gray('  1. Add MCP: claude mcp add aqe -- aqe-mcp'));
      console.log(chalk.gray('  2. Run tests: aqe test <path>'));
      console.log(chalk.gray('  3. Check status: aqe status\n'));
    } else {
      console.log(chalk.red('  Initialization failed. Check errors above.\n'));
      await this.cleanupAndExit(1);
    }

    await this.cleanupAndExit(0);
  }

  private async runLegacyWizard(options: InitOptions, context: CLIContext): Promise<void> {
    const orchestratorOptions: InitOrchestratorOptions = {
      projectRoot: process.cwd(),
      autoMode: options.auto,
      minimal: options.minimal,
      skipPatterns: options.skipPatterns,
      withN8n: options.withN8n,
      autoMigrate: options.autoMigrate,
    };

    const orchestrator = new InitOrchestrator(orchestratorOptions);

    if (options.wizard) {
      // Show wizard steps
      console.log(chalk.white('  Setup Wizard Steps:\n'));
      const steps = orchestrator.getWizardSteps();
      for (let i = 0; i < steps.length; i++) {
        console.log(chalk.gray(`  ${i + 1}. ${steps[i].title}`));
        console.log(chalk.gray(`     ${steps[i].description}\n`));
      }
    }

    console.log(chalk.white('  Analyzing project...\n'));

    const result = await orchestrator.initialize();

    // Display step results
    for (const step of result.steps) {
      const statusIcon = step.status === 'success' ? '*' : step.status === 'error' ? 'x' : '!';
      const statusColor = step.status === 'success' ? chalk.green : step.status === 'error' ? chalk.red : chalk.yellow;
      console.log(statusColor(`  ${statusIcon} ${step.step} (${step.durationMs}ms)`));
    }
    console.log('');

    if (result.success) {
      console.log(chalk.green('  AQE v3 initialized successfully!\n'));

      // Show summary
      console.log(chalk.blue('  Summary:'));
      console.log(chalk.gray(`    - Patterns loaded: ${result.summary.patternsLoaded}`));
      console.log(chalk.gray(`    - Hooks configured: ${result.summary.hooksConfigured ? 'Yes' : 'No'}`));
      console.log(chalk.gray(`    - Workers started: ${result.summary.workersStarted}`));
      if (result.summary.n8nInstalled) {
        console.log(chalk.gray(`    - N8n agents: ${result.summary.n8nInstalled.agents}`));
        console.log(chalk.gray(`    - N8n skills: ${result.summary.n8nInstalled.skills}`));
      }
      console.log(chalk.gray(`    - Total time: ${result.totalDurationMs}ms\n`));

      console.log(chalk.white('Next steps:'));
      console.log(chalk.gray('  1. Add MCP: claude mcp add aqe -- aqe-mcp'));
      console.log(chalk.gray('  2. Run tests: aqe test <path>'));
      console.log(chalk.gray('  3. Check status: aqe status\n'));
    } else {
      console.log(chalk.red('  Initialization failed. Check errors above.\n'));
      await this.cleanupAndExit(1);
    }

    await this.cleanupAndExit(0);
  }

  private async runStandardInit(options: InitOptions, context: CLIContext): Promise<void> {
    console.log(chalk.blue('\n  Initializing Agentic QE v3...\n'));

    // Determine enabled domains
    const enabledDomains: DomainName[] =
      options.domains === 'all'
        ? [...ALL_DOMAINS]
        : options.domains.split(',').filter((d: string) => ALL_DOMAINS.includes(d as DomainName)) as DomainName[];

    console.log(chalk.gray(`  Domains: ${enabledDomains.length}`));
    console.log(chalk.gray(`  Max Agents: ${options.maxAgents}`));
    console.log(chalk.gray(`  Memory: ${options.memory}`));
    console.log(chalk.gray(`  Lazy Loading: ${options.lazy ? 'enabled' : 'disabled'}\n`));

    // Create kernel
    context.kernel = new QEKernelImpl({
      maxConcurrentAgents: parseInt(options.maxAgents, 10),
      memoryBackend: options.memory as 'sqlite' | 'agentdb' | 'hybrid',
      hnswEnabled: true,
      lazyLoading: options.lazy || false,
      enabledDomains,
    });

    await context.kernel.initialize();
    console.log(chalk.green('  * Kernel initialized'));

    // Create cross-domain router
    context.router = new CrossDomainEventRouter(context.kernel.eventBus);
    await context.router.initialize();
    console.log(chalk.green('  * Cross-domain router initialized'));

    // Create protocol executor
    const getDomainAPI = <T>(domain: DomainName): T | undefined => {
      return context.kernel!.getDomainAPI<T>(domain);
    };
    const protocolExecutor = new DefaultProtocolExecutor(
      context.kernel.eventBus,
      context.kernel.memory,
      getDomainAPI
    );
    console.log(chalk.green('  * Protocol executor initialized'));

    // Create workflow orchestrator
    context.workflowOrchestrator = new WorkflowOrchestrator(
      context.kernel.eventBus,
      context.kernel.memory,
      context.kernel.coordinator
    );
    await context.workflowOrchestrator.initialize();

    // Register domain workflow actions (Issue #206)
    this.registerDomainWorkflowActions(context.kernel, context.workflowOrchestrator);
    console.log(chalk.green('  * Workflow orchestrator initialized'));

    // Create Queen Coordinator
    context.queen = createQueenCoordinator(
      context.kernel,
      context.router,
      protocolExecutor,
      undefined
    );
    await context.queen.initialize();
    console.log(chalk.green('  * Queen Coordinator initialized'));

    context.initialized = true;

    console.log(chalk.green('\n  AQE v3 initialized successfully!\n'));

    // Show enabled domains
    console.log(chalk.blue('  Enabled Domains:'));
    for (const domain of enabledDomains) {
      console.log(chalk.gray(`    - ${domain}`));
    }
    console.log('');

    await this.cleanupAndExit(0);
  }

  private registerDomainWorkflowActions(
    kernel: QEKernel,
    orchestrator: WorkflowOrchestrator
  ): void {
    // Register visual-accessibility domain actions
    const visualAccessibilityAPI = kernel.getDomainAPI<VisualAccessibilityAPI>('visual-accessibility');
    if (visualAccessibilityAPI?.registerWorkflowActions) {
      try {
        visualAccessibilityAPI.registerWorkflowActions(orchestrator);
      } catch (error) {
        // Log but don't fail - domain may not be enabled
        console.error(
          chalk.yellow(`  ! Could not register visual-accessibility workflow actions: ${error instanceof Error ? error.message : String(error)}`)
        );
      }
    }

    // Register requirements-validation domain actions (QCSD Ideation Swarm)
    const requirementsValidationAPI = kernel.getDomainAPI<RequirementsValidationExtendedAPI>('requirements-validation');
    if (requirementsValidationAPI?.registerWorkflowActions) {
      try {
        requirementsValidationAPI.registerWorkflowActions(orchestrator);
      } catch (error) {
        // Log but don't fail - domain may not be enabled
        console.error(
          chalk.yellow(`  ! Could not register requirements-validation workflow actions: ${error instanceof Error ? error.message : String(error)}`)
        );
      }
    }
  }

  getHelp(): string {
    return `
Initialize the AQE v3 system with various configuration options.

Usage:
  aqe init [options]

Options:
  -d, --domains <domains>    Comma-separated list of domains to enable (default: all)
  -m, --max-agents <number>  Maximum concurrent agents (default: 15)
  --memory <backend>         Memory backend: sqlite, agentdb, or hybrid (default: hybrid)
  --lazy                     Enable lazy loading of domains
  --wizard                   Run interactive setup wizard
  --auto                     Auto-configure based on project analysis
  -u, --upgrade              Upgrade existing installation (overwrite skills, agents, validation)
  --minimal                  Minimal configuration (skip optional features)
  --skip-patterns            Skip loading pre-trained patterns
  --with-n8n                 Install n8n workflow testing agents and skills
  --auto-migrate             Automatically migrate from v2 if detected
  --with-claude-flow         Force Claude Flow integration setup
  --skip-claude-flow         Skip Claude Flow integration
  --modular                  Use new modular init system

Examples:
  aqe init --auto            # Auto-configure based on project (keeps existing skills)
  aqe init --auto --upgrade  # Auto-configure AND update all skills/agents
  aqe init --upgrade         # Upgrade existing installation
  aqe init --wizard          # Run interactive wizard
  aqe init --domains test-generation,coverage-analysis
`;
  }
}

// ============================================================================
// Types
// ============================================================================

interface InitOptions {
  domains: string;
  maxAgents: string;
  memory: string;
  lazy?: boolean;
  wizard?: boolean;
  auto?: boolean;
  upgrade?: boolean;
  minimal?: boolean;
  skipPatterns?: boolean;
  withN8n?: boolean;
  autoMigrate?: boolean;
  withClaudeFlow?: boolean;
  skipClaudeFlow?: boolean;
  modular?: boolean;
}

// ============================================================================
// Factory
// ============================================================================

export function createInitHandler(cleanupAndExit: (code: number) => Promise<never>): InitHandler {
  return new InitHandler(cleanupAndExit);
}
