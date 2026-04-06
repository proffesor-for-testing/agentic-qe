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
import type { QEKernel } from '../kernel/interfaces.js';
import type { WorkflowOrchestrator } from '../coordination/workflow-orchestrator.js';
import { DomainName, ALL_DOMAINS } from '../shared/types';
import type { VisualAccessibilityAPI } from '../domains/visual-accessibility/plugin.js';
import type { RequirementsValidationExtendedAPI } from '../domains/requirements-validation/plugin.js';

// Handler interfaces — type-only, erased at compile time
import type { CLIContext } from './handlers/interfaces.js';

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
  '[RequirementsValidation]', '[ParserRegistry]', '[AdversarialDefense]',
  '[ContinueGateIntegration]', '[ContinueGate]', '[SQLitePatternStore]',
  '[TokenTracking]', '[InfraHealing]', '[ExperienceCapture]',
];

/** Timestamped log pattern: [HH:MM:SS.sss] [LEVEL] */
const TIMESTAMPED_LOG_RE = /^\[\d{2}:\d{2}:\d{2}\.\d{3}\]\s+\[/;

const originalConsoleLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  const trimmed = first.trimStart();
  if (
    INTERNAL_LOG_PREFIXES.some(prefix => trimmed.startsWith(prefix)) ||
    TIMESTAMPED_LOG_RE.test(trimmed)
  ) {
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
  const { QEKernelImpl } = await import('../kernel/kernel.js');
  const { CrossDomainEventRouter } = await import('../coordination/cross-domain-router.js');
  const { DefaultProtocolExecutor } = await import('../coordination/protocol-executor.js');
  const { WorkflowOrchestrator } = await import('../coordination/workflow-orchestrator.js');
  const { createQueenCoordinator } = await import('../coordination/queen-coordinator.js');
  const { createPersistentScheduler } = await import('./scheduler/index.js');

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
  // Synchronous best-effort cleanup first — no awaits that could block.
  try {
    if (context.workflowOrchestrator) { context.workflowOrchestrator.dispose().catch(() => {}); }
    if (context.queen) { context.queen.dispose().catch(() => {}); }
    if (context.router) { context.router.dispose().catch(() => {}); }
    if (context.kernel) { context.kernel.dispose().catch(() => {}); }
  } catch { /* best effort */ }

  // Force exit immediately. Native NAPI handles (@ruvector/rvf-node and
  // historically @ruvector/router, replaced by hnswlib-node in #399 /
  // ADR-090) create ref'd event loop handles that prevent natural exit,
  // and dynamic import() of cleanup modules can load more native
  // bindings that make it worse. Exit now, clean later.
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
// Register Handlers (lazy — each handler loads only when its command runs)
// ============================================================================

import { registerLazyCommand, registerLazyHandler } from './lazy-registry.js';

registerLazyHandler(program, 'init', 'Initialize the AQE v3 system',
  () => import('./handlers/init-handler.js').then(m => m.createInitHandler(cleanupAndExit)),
  context,
);
registerLazyHandler(program, 'status', 'Show system status',
  () => import('./handlers/status-handler.js').then(m => m.createStatusHandler(cleanupAndExit, ensureInitializedStrict)),
  context,
);
registerLazyHandler(program, 'health', 'Check system health',
  () => import('./handlers/status-handler.js').then(m => m.createHealthHandler(cleanupAndExit, ensureInitializedStrict)),
  context,
);
registerLazyHandler(program, 'task', 'Manage QE tasks',
  () => import('./handlers/task-handler.js').then(m => m.createTaskHandler(cleanupAndExit, ensureInitialized)),
  context,
);
registerLazyHandler(program, 'agent', 'Manage QE agents',
  () => import('./handlers/agent-handler.js').then(m => m.createAgentHandler(cleanupAndExit, ensureInitialized)),
  context,
);
registerLazyHandler(program, 'domain', 'Domain operations',
  () => import('./handlers/domain-handler.js').then(m => m.createDomainHandler(cleanupAndExit, ensureInitialized)),
  context,
);
registerLazyHandler(program, 'protocol', 'Execute coordination protocols',
  () => import('./handlers/protocol-handler.js').then(m => m.createProtocolHandler(cleanupAndExit, ensureInitialized)),
  context,
);
registerLazyHandler(program, 'brain', 'Export, import, and inspect QE brain state',
  () => import('./handlers/brain-handler.js').then(m => m.createBrainHandler(cleanupAndExit, ensureInitialized)),
  context,
);
registerLazyHandler(program, 'hypergraph', 'Query the code knowledge hypergraph',
  () => import('./handlers/hypergraph-handler.js').then(m => m.createHypergraphHandler(cleanupAndExit, ensureInitialized)),
  context, ['hg'],
);
registerLazyHandler(program, 'heartbeat', 'Manage the token-free heartbeat scheduler',
  () => import('./handlers/heartbeat-handler.js').then(m => m.createHeartbeatHandler(cleanupAndExit)),
  context,
);
registerLazyHandler(program, 'routing', 'View routing performance, economics, and accuracy',
  () => import('./handlers/routing-handler.js').then(m => m.createRoutingHandler(cleanupAndExit)),
  context,
);

// Workflow command — lazy loaded from commands/workflow.ts
registerLazyCommand(program, {
  name: 'workflow',
  description: 'Manage QE workflows and pipelines (ADR-041)',
  factory: () => import('./commands/workflow.js').then(m => m.createWorkflowCommand(context, cleanupAndExit, ensureInitialized)),
});

registerLazyCommand(program, {
  name: 'test',
  description: 'Test generation, execution, scheduling, and load testing',
  factory: () => import('./commands/test.js').then(m => m.createTestCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'coverage',
  description: 'Coverage analysis shortcut',
  factory: () => import('./commands/coverage.js').then(m => m.createCoverageCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'quality',
  description: 'Quality assessment shortcut',
  factory: () => import('./commands/quality.js').then(m => m.createQualityCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'security',
  description: 'Security scanning and URL validation',
  factory: () => import('./commands/security.js').then(m => m.createSecurityCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'code',
  description: 'Code intelligence analysis',
  factory: () => import('./commands/code.js').then(m => m.createCodeCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'completions',
  description: 'Generate shell completions for aqe',
  factory: () => import('./commands/completions.js').then(m => m.createCompletionsCommand(cleanupAndExit)),
});
registerLazyCommand(program, {
  name: 'fleet',
  description: 'Fleet operations with multi-agent progress tracking',
  factory: () => import('./commands/fleet.js').then(m => m.createFleetCommand(context, cleanupAndExit, ensureInitialized, registerDomainWorkflowActions)),
});
registerLazyCommand(program, {
  name: 'validate',
  description: 'Validation commands for skills and agents',
  factory: () => import('./commands/validate-swarm.js').then(m => m.createValidateSwarmCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'skill',
  description: 'Skill validation and reporting (ADR-056)',
  factory: () => import('./commands/validate.js').then(m => m.createValidateCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'eval',
  description: 'Run skill evaluation suites in parallel',
  factory: () => import('./commands/eval.js').then(m => m.createEvalCommand()),
});
registerLazyCommand(program, {
  name: 'ci',
  description: 'CI/CD pipeline orchestration',
  factory: () => import('./commands/ci.js').then(m => m.createCICommand(context, cleanupAndExit, ensureInitialized)),
});

// External command modules
registerLazyCommand(program, {
  name: 'token-usage',
  description: 'View and analyze token consumption metrics (ADR-042)',
  factory: () => import('./commands/token-usage.js').then(m => m.createTokenUsageCommand()),
});
registerLazyCommand(program, {
  name: 'llm',
  description: 'LLM Router management (ADR-043)',
  factory: () => import('./commands/llm-router.js').then(m => m.createLLMRouterCommand()),
});
registerLazyCommand(program, {
  name: 'sync',
  description: 'Sync local learning data to cloud PostgreSQL',
  factory: () => import('./commands/sync.js').then(m => m.createSyncCommands()),
});
registerLazyCommand(program, {
  name: 'hooks',
  description: 'Self-learning QE hooks for pattern recognition and guidance',
  factory: () => import('./commands/hooks.js').then(m => m.createHooksCommand()),
});
registerLazyCommand(program, {
  name: 'learning',
  description: 'AQE self-learning system management (standalone, no claude-flow required)',
  factory: () => import('./commands/learning.js').then(m => m.createLearningCommand()),
});
registerLazyCommand(program, {
  name: 'memory',
  description: 'Memory store, retrieve, search, and delete operations',
  factory: () => import('./commands/memory.js').then(m => m.createMemoryCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'mcp',
  description: 'Start the MCP protocol server for Claude Code integration',
  factory: () => import('./commands/mcp.js').then(m => m.createMcpCommand()),
});
registerLazyCommand(program, {
  name: 'platform',
  description: 'Manage coding agent platform configurations',
  factory: () => import('./commands/platform.js').then(m => m.createPlatformCommand()),
});
registerLazyCommand(program, {
  name: 'prove',
  description: 'Generate a verifiable Proof-of-Quality attestation',
  factory: () => import('./commands/prove.js').then(m => m.createProveCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'ruvector',
  description: 'RuVector integration management',
  factory: () => import('./commands/ruvector-commands.js').then(m => m.createRuVectorCommand()),
});
registerLazyCommand(program, {
  name: 'audit',
  description: 'Witness chain audit trail management',
  factory: () => import('./commands/audit.js').then(m => m.createAuditCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'pipeline',
  description: 'Manage YAML deterministic pipelines (Imp-9)',
  factory: () => import('./commands/pipeline.js').then(m => m.createPipelineCommand(context, cleanupAndExit, ensureInitialized)),
});
registerLazyCommand(program, {
  name: 'plugin',
  description: 'Manage external QE domain plugins',
  factory: () => import('./commands/plugin.js').then(m => m.createPluginCommand()),
});
registerLazyCommand(program, {
  name: 'daemon',
  description: 'Manage the QE Quality Daemon',
  factory: () => import('./commands/daemon.js').then(m => m.createDaemonCommand()),
});

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
  // IMP-06: Fast path for --version / -v — skip all heavy initialization
  const { isVersionFastPath } = await import('../boot/fast-paths.js');
  if (isVersionFastPath(process.argv)) {
    console.log(VERSION);
    process.exit(0);
  }

  const { bootstrapTokenTracking } = await import('../init/token-bootstrap.js');
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
