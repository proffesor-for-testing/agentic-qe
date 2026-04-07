/**
 * Agentic QE v3 - Init Command Handler
 *
 * Handles the 'aqe init' command for system initialization.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ICommandHandler, CLIContext } from './interfaces.js';
import { DomainName, ALL_DOMAINS } from '../../shared/types/index.js';
import type { WorkflowOrchestrator } from '../../coordination/workflow-orchestrator.js';
import type { ClaudeFlowSetupResult } from '../commands/claude-flow-setup.js';
import type { InitOrchestratorOptions } from '../../init/init-wizard.js';
import type { VisualAccessibilityAPI } from '../../domains/visual-accessibility/plugin.js';
import type { RequirementsValidationExtendedAPI } from '../../domains/requirements-validation/plugin.js';
import type { QEKernel } from '../../kernel/interfaces.js';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Init Handler
// ============================================================================

export class InitHandler implements ICommandHandler {
  readonly name = 'init';
  readonly description = 'Initialize the AQE v3 system';

  private cleanupAndExit: (code: number) => Promise<never>;

  /**
   * Original `process.stdout.write` captured before --json mode redirects
   * stdout to stderr. Restored at JSON-emission time. Null when not in
   * JSON mode.
   */
  private originalStdoutWrite: typeof process.stdout.write | null = null;

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
      .option('--skip-code-index', 'Skip code intelligence pre-scan (supported escape hatch — KG can be built later via `aqe code index`, also via env AQE_SKIP_CODE_INDEX=1)')
      .option('--json', 'Emit machine-readable JSON result on stdout (suppresses banners; phase progress goes to stderr). Used by the release-gate corpus and CI tooling. See InitJsonOutput in init-handler.ts for the schema.')
      .option('--with-n8n', 'Install n8n workflow testing agents and skills')
      .option('--with-opencode', 'Include OpenCode agent/skill provisioning')
      .option('--with-kiro', 'Include AWS Kiro IDE integration (agents, skills, hooks, steering)')
      .option('--with-copilot', 'Include GitHub Copilot MCP config and instructions')
      .option('--with-cursor', 'Include Cursor MCP config and rules')
      .option('--with-cline', 'Include Cline MCP config and custom QE mode')
      .option('--with-kilocode', 'Include Kilo Code MCP config and custom QE mode')
      .option('--with-roocode', 'Include Roo Code MCP config and custom QE mode')
      .option('--with-codex', 'Include OpenAI Codex CLI MCP config and AGENTS.md')
      .option('--with-windsurf', 'Include Windsurf MCP config and rules')
      .option('--with-continuedev', 'Include Continue.dev MCP config and rules')
      .option('--no-mcp', 'Skip MCP server config (MCP is enabled by default)')
      .option('--with-mcp', 'Enable MCP server config (default — kept for backward compatibility)')
      .option('--with-all-platforms', 'Include all coding agent platform configurations')
      .option('--auto-migrate', 'Automatically migrate from v2 if detected')
      .option('--with-claude-flow', 'Force Claude Flow integration setup')
      .option('--skip-claude-flow', 'Skip Claude Flow integration')
      .option('--no-governance', 'Skip governance configuration (ADR-058)')
      .option('--modular', 'Use new modular init system (default for --auto)')
      .action(async (options) => {
        await this.execute(options, context);
      });
  }

  async execute(options: InitOptions, context: CLIContext): Promise<void> {
    // In --json mode we must redirect stdout BEFORE any console.log so
    // that banners printed in this function don't pollute the JSON-only
    // stdout contract. The original write fn is captured on `this` so
    // runModularInit can restore it before emitting the final JSON. See
    // InitJsonOutput for the schema.
    if (options.json === true) {
      this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stderrWrite = (process.stderr.write as any).bind(process.stderr);
      process.stdout.write = ((...args: unknown[]): boolean => {
        return stderrWrite(...args);
      }) as typeof process.stdout.write;
    }

    try {
      // Expand --with-all-platforms into individual flags
      if (options.withAllPlatforms) {
        options.withCopilot = true;
        options.withCursor = true;
        options.withCline = true;
        options.withKilocode = true;
        options.withRoocode = true;
        options.withCodex = true;
        options.withWindsurf = true;
        options.withContinuedev = true;
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

  private async runModularInit(options: InitOptions, _context: CLIContext): Promise<void> {
    const isJsonMode = options.json === true;

    const { createModularInitOrchestrator } = await import('../../init/orchestrator.js');
    const orchestrator = createModularInitOrchestrator({
      projectRoot: process.cwd(),
      autoMode: options.auto,
      upgrade: options.upgrade,
      minimal: options.minimal,
      skipPatterns: options.skipPatterns,
      skipCodeIndex: options.skipCodeIndex,
      withN8n: options.withN8n,
      withOpenCode: options.withOpencode,
      withKiro: options.withKiro,
      withCopilot: options.withCopilot,
      withCursor: options.withCursor,
      withCline: options.withCline,
      withKiloCode: options.withKilocode,
      withRooCode: options.withRoocode,
      withCodex: options.withCodex,
      withWindsurf: options.withWindsurf,
      withContinueDev: options.withContinuedev,
      noMcp: options.noMcp && !options.withMcp,
      noGovernance: options.noGovernance,
    });

    console.log(chalk.white('  Analyzing project...\n'));

    const result = await orchestrator.initialize();

    // JSON mode: emit structured output and exit. Skip Claude Flow
    // integration and human banners — those are for interactive runs.
    if (isJsonMode) {
      // Restore the real stdout captured in execute() before any banners
      // were printed.
      if (this.originalStdoutWrite) {
        process.stdout.write = this.originalStdoutWrite;
      }

      const jsonOutput: InitJsonOutput = {
        schemaVersion: 1,
        success: result.success,
        steps: result.steps.map((s) => ({
          step: s.step,
          status: s.status,
          message: s.message,
          durationMs: s.durationMs,
        })),
        summary: result.summary,
        totalDurationMs: result.totalDurationMs,
        timestamp: result.timestamp.toISOString(),
      };
      process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');

      // Exit non-zero if EITHER critical failure OR any step errored.
      // This is stricter than `result.success` and is the contract the
      // gate relies on.
      const anyStepErrored = result.steps.some((s) => s.status === 'error');
      await this.cleanupAndExit(result.success && !anyStepErrored ? 0 : 1);
      return;
    }

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
        const { setupClaudeFlowIntegration } = await import('../commands/claude-flow-setup.js');
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
        } else {
          // Show friendly message about standalone mode
          const { getClaudeFlowNotFoundMessage } = await import('../../adapters/claude-flow/detect.js');
          console.log(chalk.gray(getClaudeFlowNotFoundMessage()));
          console.log('');
        }
      } catch {
        // Claude Flow detection failed — show friendly standalone message
        const { getClaudeFlowNotFoundMessage } = await import('../../adapters/claude-flow/detect.js');
        console.log(chalk.gray(getClaudeFlowNotFoundMessage()));
        console.log('');
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
      console.log(chalk.gray('  1. Run tests: aqe test <path>'));
      console.log(chalk.gray('  2. Check coverage: aqe coverage <path>'));
      console.log(chalk.gray('  3. Check status: aqe status'));
      if (result.summary.mcpConfigured) {
        console.log(chalk.gray('\n  MCP server configured in .mcp.json'));
        console.log(chalk.gray('    Use --no-mcp to skip MCP setup if using CLI only\n'));
      }
    } else {
      console.log(chalk.red('  Initialization failed. Check errors above.\n'));
      await this.cleanupAndExit(1);
    }

    await this.cleanupAndExit(0);
  }

  private async runLegacyWizard(options: InitOptions, _context: CLIContext): Promise<void> {
    const { InitOrchestrator } = await import('../../init/init-wizard.js');
    const orchestratorOptions: InitOrchestratorOptions = {
      projectRoot: process.cwd(),
      autoMode: options.auto,
      minimal: options.minimal,
      skipPatterns: options.skipPatterns,
      withN8n: options.withN8n,
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
      console.log(chalk.gray('  1. Run tests: aqe test <path>'));
      console.log(chalk.gray('  2. Check coverage: aqe coverage <path>'));
      console.log(chalk.gray('  3. Check status: aqe status'));
      if (result.summary.mcpConfigured) {
        console.log(chalk.gray('\n  MCP server configured in .mcp.json'));
        console.log(chalk.gray('    Use --no-mcp to skip MCP setup if using CLI only\n'));
      }
    } else {
      console.log(chalk.red('  Initialization failed. Check errors above.\n'));
      await this.cleanupAndExit(1);
    }

    await this.cleanupAndExit(0);
  }

  private async runStandardInit(options: InitOptions, context: CLIContext): Promise<void> {
    const { QEKernelImpl } = await import('../../kernel/kernel.js');
    const { CrossDomainEventRouter } = await import('../../coordination/cross-domain-router.js');
    const { DefaultProtocolExecutor } = await import('../../coordination/protocol-executor.js');
    const { WorkflowOrchestrator } = await import('../../coordination/workflow-orchestrator.js');
    const { createQueenCoordinator } = await import('../../coordination/queen-coordinator.js');

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
          chalk.yellow(`  ! Could not register visual-accessibility workflow actions: ${toErrorMessage(error)}`)
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
          chalk.yellow(`  ! Could not register requirements-validation workflow actions: ${toErrorMessage(error)}`)
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
  --with-opencode            Include OpenCode agent/skill provisioning
  --auto-migrate             Automatically migrate from v2 if detected
  --with-claude-flow         Force Claude Flow integration setup
  --skip-claude-flow         Skip Claude Flow integration
  --no-mcp                   Skip MCP server config (MCP is enabled by default)
  --no-governance            Skip governance configuration (ADR-058)
  --modular                  Use new modular init system

MCP Server:
  MCP server configuration is ENABLED BY DEFAULT. It writes .mcp.json
  at the project root so Claude Code auto-discovers the AQE MCP server.
  Use --no-mcp to skip if you only want CLI commands.

Governance:
  Governance is ENABLED BY DEFAULT. It installs .claude/guidance/ with:
  - constitution.md: 7 unbreakable QE invariants
  - shards/*.shard.md: 12 domain-specific governance rules

  Use --no-governance to skip, or set GOVERNANCE_*=false env vars for
  fine-grained control over individual gates (ContinueGate, MemoryWriteGate, etc.)

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

/**
 * JSON output schema emitted by `aqe init --json`. Versioned so the
 * release-gate corpus (tests/fixtures/init-corpus/) and any other
 * consumers can detect schema drift.
 *
 * Schema version 1 — added in response to issue #401 to give the
 * pre-publish gate a stable, structured contract instead of grepping
 * stdout for human banners that don't actually reflect phase success.
 *
 * IMPORTANT consumer contract: `success` here is the orchestrator's
 * success flag, which only flips to false on critical-phase failures
 * or unhandled exceptions. Non-critical phase failures (assets,
 * code-intelligence, workers, claude-md, hooks, mcp) leave `success`
 * true. Consumers MUST inspect `steps[*].status` to detect those.
 * `aqe init --json` itself enforces this stricter contract via its
 * exit code: it exits non-zero if ANY step has status === 'error',
 * not just on `success === false`.
 */
export interface InitJsonOutput {
  schemaVersion: 1;
  success: boolean;
  steps: Array<{
    step: string;
    status: 'success' | 'warning' | 'error' | 'skipped';
    message: string;
    durationMs: number;
  }>;
  summary: {
    projectAnalyzed: boolean;
    configGenerated: boolean;
    codeIntelligenceIndexed: number;
    patternsLoaded: number;
    skillsInstalled: number;
    agentsInstalled: number;
    hooksConfigured: boolean;
    mcpConfigured: boolean;
    claudeMdGenerated: boolean;
    workersStarted: number;
    n8nInstalled?: {
      agents: number;
      skills: number;
    };
  };
  totalDurationMs: number;
  timestamp: string;
}

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
  skipCodeIndex?: boolean;
  json?: boolean;
  withN8n?: boolean;
  withOpencode?: boolean;
  withKiro?: boolean;
  withCopilot?: boolean;
  withCursor?: boolean;
  withCline?: boolean;
  withKilocode?: boolean;
  withRoocode?: boolean;
  withCodex?: boolean;
  withWindsurf?: boolean;
  withContinuedev?: boolean;
  withAllPlatforms?: boolean;
  noMcp?: boolean;
  withMcp?: boolean;
  withClaudeFlow?: boolean;
  skipClaudeFlow?: boolean;
  noGovernance?: boolean;
  modular?: boolean;
}

// ============================================================================
// Factory
// ============================================================================

export function createInitHandler(cleanupAndExit: (code: number) => Promise<never>): InitHandler {
  return new InitHandler(cleanupAndExit);
}
