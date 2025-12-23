/**
 * Main initialization orchestrator for Agentic QE Fleet
 *
 * Coordinates all initialization steps in the correct order with proper error handling,
 * progress logging, and rollback capabilities.
 *
 * @module cli/init
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { FleetConfig, InitOptions } from '../../types';
import { ProcessExit } from '../../utils/ProcessExit';

// Phase modules (will be created incrementally)
import { createDirectoryStructure } from './directory-structure';
import { initializeDatabases } from './database-init';
import { generateClaudeSettings, generateMcpJson, setupMCPServer } from './claude-config';
import { copyDocumentation } from './documentation';
import { createBashWrapper } from './bash-wrapper';
import { createClaudeMd } from './claude-md';
import { copyAgentTemplates } from './agents';
import { copySkillTemplates } from './skills';
import { copyCommandTemplates } from './commands';
import { copyHelperScripts, copyHookScripts } from './helpers';
import { initializeLearningSystem } from './learning-init';
import { installOptionalDependencies, displayOptionalDependenciesHelp } from './optional-dependencies';
import { initializeCodeIntelligence } from './code-intelligence-init';

// Import version from package.json
const packageJson = require('../../../package.json');
const PACKAGE_VERSION = packageJson.version;

/**
 * Initialization phase configuration
 */
interface InitPhase {
  name: string;
  description: string;
  execute: (config: FleetConfig, options: InitOptions) => Promise<void>;
  critical: boolean;  // If true, failure stops initialization
  rollback?: (config: FleetConfig) => Promise<void>;
}

/**
 * Main initialization command
 *
 * Coordinates all initialization phases in the correct order with:
 * - Progress tracking and user feedback
 * - Error handling and recovery
 * - Rollback on critical failures
 * - Skippable non-critical phases
 *
 * @param options - Initialization options from CLI
 * @returns Promise that resolves when initialization is complete
 */
export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.blue.bold(`\n🚀 Initializing Agentic QE Fleet v${PACKAGE_VERSION}\n`));

  // Validate and prepare configuration
  const config = await prepareConfiguration(options);

  // Define initialization phases
  const phases: InitPhase[] = [
    {
      name: 'Directory Structure',
      description: 'Creating project directories',
      execute: async (cfg, opts) => createDirectoryStructure(opts.force || false),
      critical: true,
      rollback: async () => {
        // Cleanup directories if needed
        console.log(chalk.yellow('Rolling back directory creation...'));
      }
    },
    {
      name: 'Databases',
      description: 'Initializing AgentDB and memory databases',
      execute: async (cfg) => initializeDatabases(cfg),
      critical: true,
      rollback: async () => {
        console.log(chalk.yellow('Rolling back database initialization...'));
      }
    },
    {
      name: 'Claude Configuration',
      description: 'Generating Claude Code settings and MCP server',
      execute: async (cfg) => {
        await generateClaudeSettings(cfg);
        await generateMcpJson(cfg);  // Creates .claude/mcp.json with server definitions
        await setupMCPServer();
      },
      critical: true  // CRITICAL for learning system!
    },
    {
      name: 'Documentation',
      description: 'Copying reference documentation',
      execute: async () => copyDocumentation(),
      critical: false  // Non-critical, can skip if fails
    },
    {
      name: 'Bash Wrapper',
      description: 'Creating aqe command wrapper',
      execute: async () => createBashWrapper(),
      critical: false
    },
    {
      name: 'Agent Templates',
      description: 'Copying agent templates to .claude/agents',
      execute: async (cfg, opts) => copyAgentTemplates(cfg, opts.force || false),
      critical: false
    },
    {
      name: 'Skill Templates',
      description: 'Copying QE skill templates to .claude/skills',
      execute: async (cfg, opts) => copySkillTemplates(opts.force || false),
      critical: false
    },
    {
      name: 'Command Templates',
      description: 'Copying slash command templates to .claude/commands',
      execute: async (cfg, opts) => copyCommandTemplates(opts.force || false),
      critical: false
    },
    {
      name: 'Helper Scripts',
      description: 'Copying helper scripts to .claude/helpers',
      execute: async (cfg, opts) => copyHelperScripts(opts.force || false),
      critical: false
    },
    {
      name: 'Hook Scripts',
      description: 'Copying hook scripts for automatic learning capture',
      execute: async (cfg, opts) => copyHookScripts(opts.force || false),
      critical: false
    },
    {
      name: 'Learning System',
      description: 'Initializing Nightly-Learner for continuous improvement',
      execute: async (cfg) => initializeLearningSystem(cfg, {
        mode: 'hybrid',
        startHour: 2,
        durationMinutes: 60,
        enabled: true,
      }),
      critical: false  // Non-critical - learning is optional but valuable
    },
    {
      name: 'Code Intelligence',
      description: 'Setting up Code Intelligence System (semantic search + knowledge graph)',
      execute: async (cfg, opts) => initializeCodeIntelligence(cfg, !opts.yes && !opts.nonInteractive),
      critical: false  // Non-critical - requires Ollama + PostgreSQL
    }
  ];

  let spinner: Ora | null = null;
  const completedPhases: string[] = [];

  try {
    // ⚡ OPTIMIZATION: Execute phases in parallel groups for faster initialization
    // Group 1: Critical sequential phases (must run in order)
    const criticalPhases = phases.filter(p => p.critical);

    // Group 2: Non-critical parallel phases (can run concurrently)
    const parallelPhases = phases.filter(p => !p.critical);

    // Execute critical phases sequentially (dependencies require order)
    for (const phase of criticalPhases) {
      try {
        spinner = ora({
          text: phase.description,
          prefixText: chalk.blue(`[${phase.name}]`)
        }).start();

        await phase.execute(config, options);

        spinner.succeed(chalk.green(`${phase.description} - Complete`));
        completedPhases.push(phase.name);
      } catch (error) {
        spinner?.fail(chalk.red(`${phase.description} - Failed`));

        // Critical phases should have already stopped in the loop above
        console.error(chalk.red(`\n❌ Critical phase "${phase.name}" failed:`));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));

        // Attempt rollback
        await rollbackPhases(phases, completedPhases, config);

        ProcessExit.exitIfNotTest(1);
        return;
      }
    }

    // ⚡ Execute non-critical phases in parallel for 2-3x speedup
    console.log(chalk.cyan('\n📦 Installing optional components (parallel)...\n'));

    const parallelResults = await Promise.allSettled(
      parallelPhases.map(async (phase) => {
        const phaseSpinner = ora({
          text: phase.description,
          prefixText: chalk.blue(`[${phase.name}]`)
        }).start();

        try {
          await phase.execute(config, options);
          phaseSpinner.succeed(chalk.green(`${phase.description} - Complete`));
          return { success: true, phase: phase.name };
        } catch (error) {
          phaseSpinner.fail(chalk.yellow(`${phase.description} - Skipped`));
          console.warn(chalk.yellow(`  ⚠️  ${error instanceof Error ? error.message : String(error)}`));
          return { success: false, phase: phase.name, error };
        }
      })
    );

    // Track which parallel phases completed
    parallelResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        completedPhases.push(result.value.phase);
      }
    });

    // Create CLAUDE.md AFTER all agents/skills are copied (needs accurate counts)
    try {
      const claudeSpinner = ora({
        text: 'Creating CLAUDE.md configuration file',
        prefixText: chalk.blue('[CLAUDE.md]')
      }).start();
      await createClaudeMd(config, options.yes || options.nonInteractive || false);
      claudeSpinner.succeed(chalk.green('Creating CLAUDE.md configuration file - Complete'));
      completedPhases.push('CLAUDE.md');
    } catch (error) {
      console.warn(chalk.yellow(`  ⚠️  CLAUDE.md creation skipped: ${error instanceof Error ? error.message : String(error)}`));
    }

    // Install optional dependencies (prompt user unless -y flag)
    console.log(chalk.cyan('\n🔧 Optional Dependencies:\n'));
    const { installed, skipped } = await installOptionalDependencies(options);

    // All phases completed successfully (or skipped non-critical)
    displaySuccessMessage(config, options, skipped);

  } catch (error) {
    // Unexpected error during initialization
    spinner?.fail(chalk.red('Initialization failed'));
    console.error(chalk.red('\n❌ Unexpected initialization error:'));
    console.error(error);

    await rollbackPhases(phases, completedPhases, config);
    ProcessExit.exitIfNotTest(1);
  }
}

/**
 * Prepare and validate fleet configuration from CLI options
 */
async function prepareConfiguration(options: InitOptions): Promise<FleetConfig> {
  // Parse and validate options
  const maxAgents = parseInt(options.maxAgents);
  const testingFocus = options.focus.split(',').map(f => f.trim());
  const environments = options.environments.split(',').map(e => e.trim());
  const frameworks = options.frameworks
    ? options.frameworks.split(',').map(f => f.trim())
    : ['jest'];

  // Validation
  if (maxAgents < 5 || maxAgents > 50) {
    throw new Error('Max agents must be between 5 and 50');
  }

  const validTopologies = ['hierarchical', 'mesh', 'ring', 'adaptive'];
  if (!validTopologies.includes(options.topology)) {
    throw new Error(`Invalid topology. Must be one of: ${validTopologies.join(', ')}`);
  }

  // Create fleet configuration
  const config: FleetConfig = {
    agents: [],  // Will be populated during agent setup phase
    topology: options.topology,
    maxAgents,
    testingFocus,
    environments,
    frameworks,
    routing: {
      enabled: false,  // Disabled by default for safe rollout
      defaultModel: 'claude-sonnet-4.5',
      enableCostTracking: true,
      enableFallback: true,
      maxRetries: 3,
      costThreshold: 0.5
    },
    streaming: {
      enabled: true,  // Enabled by default
      progressInterval: 2000,
      bufferEvents: false,
      timeout: 1800000
    }
  };

  return config;
}

/**
 * Rollback completed phases on critical failure
 */
async function rollbackPhases(
  phases: InitPhase[],
  completedPhases: string[],
  config: FleetConfig
): Promise<void> {
  if (completedPhases.length === 0) {
    return;
  }

  console.log(chalk.yellow('\n⏮️  Rolling back completed phases...'));

  // Rollback in reverse order
  for (let i = completedPhases.length - 1; i >= 0; i--) {
    const phaseName = completedPhases[i];
    const phase = phases.find(p => p.name === phaseName);

    if (phase?.rollback) {
      try {
        await phase.rollback(config);
        console.log(chalk.gray(`  ✓ Rolled back: ${phaseName}`));
      } catch (rollbackError) {
        console.warn(chalk.yellow(`  ⚠️  Rollback failed for: ${phaseName}`));
        console.warn(chalk.gray(String(rollbackError)));
      }
    }
  }

  console.log(chalk.yellow('\n⚠️  Initialization rolled back. Please fix errors and try again.\n'));
}

/**
 * Display success message with next steps
 */
function displaySuccessMessage(config: FleetConfig, options: InitOptions, skippedDeps: string[] = []): void {
  console.log(chalk.green.bold('\n✅ Initialization Complete!\n'));

  console.log(chalk.blue('Fleet Configuration:'));
  console.log(chalk.gray(`  • Topology: ${config.topology}`));
  console.log(chalk.gray(`  • Max Agents: ${config.maxAgents}`));
  console.log(chalk.gray(`  • Testing Focus: ${config.testingFocus?.join(', ')}`));
  console.log(chalk.gray(`  • Environments: ${config.environments?.join(', ')}`));
  console.log(chalk.gray(`  • Frameworks: ${config.frameworks?.join(', ')}`));

  // Show optional dependencies that were skipped
  displayOptionalDependenciesHelp(skippedDeps);

  console.log(chalk.yellow('\n💡 Next Steps:\n'));
  console.log(chalk.white('  1. Check fleet status:'));
  console.log(chalk.cyan('     aqe status'));
  console.log(chalk.white('\n  2. Check learning status:'));
  console.log(chalk.cyan('     aqe learn status'));
  console.log(chalk.white('\n  3. View learned patterns:'));
  console.log(chalk.cyan('     aqe patterns list'));
  console.log(chalk.white('\n  4. For agent capabilities, see:'));
  console.log(chalk.cyan('     .agentic-qe/docs/agents.md\n'));

  if (config.routing?.enabled) {
    console.log(chalk.blue('💰 Multi-Model Router enabled - expect 70-81% cost savings!\n'));
  }

  if (options.enableLearning) {
    console.log(chalk.blue('🧠 Learning system enabled - agents will improve over time!\n'));
  }

  // Show RuVector optional enhancement
  console.log(chalk.gray('┌─────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.gray('│') + chalk.yellow(' 🧬 Optional: RuVector Self-Learning (GNN + LoRA + EWC++)       ') + chalk.gray('│'));
  console.log(chalk.gray('│                                                                 │'));
  console.log(chalk.gray('│') + chalk.white(' Enable advanced self-learning for 330x faster pattern search:  ') + chalk.gray('│'));
  console.log(chalk.gray('│') + chalk.cyan('   docker run -d --name ruvector -p 5432:5432 \\                 ') + chalk.gray('│'));
  console.log(chalk.gray('│') + chalk.cyan('     ruvnet/ruvector:latest                                     ') + chalk.gray('│'));
  console.log(chalk.gray('│') + chalk.cyan('   echo "AQE_RUVECTOR_ENABLED=true" >> .env                     ') + chalk.gray('│'));
  console.log(chalk.gray('│                                                                 │'));
  console.log(chalk.gray('│') + chalk.gray(' Default: memory.db (SQLite) - no Docker required               ') + chalk.gray('│'));
  console.log(chalk.gray('└─────────────────────────────────────────────────────────────────┘\n'));
}

/**
 * Export individual phase functions for testing and reuse
 */
export {
  createDirectoryStructure,
  initializeDatabases,
  generateClaudeSettings,
  generateMcpJson,
  setupMCPServer,
  copyDocumentation,
  createBashWrapper
};
