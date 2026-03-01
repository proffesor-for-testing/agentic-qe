/**
 * Agentic QE v3 - Validate Swarm Command
 * ADR-056 Phase 5: CLI for parallel skill validation using Claude Flow swarms
 *
 * Provides CLI access to swarm-based skill validation:
 * - Validate multiple skills in parallel
 * - Cross-model validation support
 * - Configurable concurrency and timeouts
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import {
  SwarmSkillValidator,
  createSwarmSkillValidator,
  P0_SKILLS,
  DEFAULT_VALIDATION_MODELS,
  DEFAULT_SWARM_VALIDATION_CONFIG,
  type SwarmValidationConfig,
  type SwarmValidationResult,
  type SwarmTopology,
} from '../../validation/index.js';
import {
  createSkillValidationLearner,
  type SkillValidationLearner,
} from '../../learning/skill-validation-learner.js';
import { createRealQEReasoningBank } from '../../learning/real-qe-reasoning-bank.js';

/**
 * Create the validate swarm command
 */
export function createValidateSwarmCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const validateCmd = new Command('validate')
    .description('Validation commands for skills and agents');

  // Swarm subcommand for parallel validation
  validateCmd
    .command('swarm')
    .description('Validate skills in parallel using Claude Flow swarms (ADR-056)')
    .option(
      '-s, --skills <skills>',
      'Comma-separated list of skills to validate, or "all" for P0 skills',
      'all'
    )
    .option(
      '-m, --models <models>',
      'Comma-separated list of models to validate against',
      DEFAULT_VALIDATION_MODELS.join(',')
    )
    .option(
      '-t, --topology <topology>',
      'Swarm topology: hierarchical or mesh',
      'hierarchical'
    )
    .option(
      '--max-concurrent <number>',
      'Maximum concurrent skill validations',
      String(DEFAULT_SWARM_VALIDATION_CONFIG.maxConcurrentSkills)
    )
    .option(
      '--max-models <number>',
      'Maximum concurrent models per skill',
      String(DEFAULT_SWARM_VALIDATION_CONFIG.maxConcurrentModels)
    )
    .option(
      '--timeout <ms>',
      'Timeout per validation in milliseconds',
      String(DEFAULT_SWARM_VALIDATION_CONFIG.timeout)
    )
    .option('--no-retry', 'Disable retries on failure')
    .option('-v, --verbose', 'Show detailed output')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        console.log(chalk.blue('\n Swarm Skill Validation\n'));

        // Parse skills
        const skills = options.skills === 'all'
          ? [...P0_SKILLS]
          : options.skills.split(',').map((s: string) => s.trim());

        // Parse models
        const models = options.models.split(',').map((m: string) => m.trim());

        // Parse topology
        const topology = validateTopology(options.topology);

        // Create configuration
        const config: Partial<SwarmValidationConfig> = {
          topology,
          maxConcurrentSkills: parseInt(options.maxConcurrent, 10) || DEFAULT_SWARM_VALIDATION_CONFIG.maxConcurrentSkills,
          maxConcurrentModels: parseInt(options.maxModels, 10) || DEFAULT_SWARM_VALIDATION_CONFIG.maxConcurrentModels,
          timeout: parseInt(options.timeout, 10) || DEFAULT_SWARM_VALIDATION_CONFIG.timeout,
          continueOnFailure: true,
          retry: options.retry !== false
            ? DEFAULT_SWARM_VALIDATION_CONFIG.retry
            : undefined,
        };

        // Log configuration
        if (options.verbose) {
          console.log(chalk.gray('Configuration:'));
          console.log(chalk.gray(`  Topology: ${config.topology}`));
          console.log(chalk.gray(`  Skills: ${skills.length}`));
          console.log(chalk.gray(`  Models: ${models.length}`));
          console.log(chalk.gray(`  Max Concurrent Skills: ${config.maxConcurrentSkills}`));
          console.log(chalk.gray(`  Max Concurrent Models: ${config.maxConcurrentModels}`));
          console.log(chalk.gray(`  Timeout: ${config.timeout}ms`));
          console.log(chalk.gray(`  Retry: ${config.retry ? 'enabled' : 'disabled'}`));
          console.log('');
        }

        console.log(chalk.cyan(`  Skills: ${skills.join(', ')}`));
        console.log(chalk.cyan(`  Models: ${models.join(', ')}`));
        console.log(chalk.cyan(`  Topology: ${topology}`));
        console.log('');

        // Create learner (with memory from kernel)
        const reasoningBank = await createReasoningBankFromContext(context);
        const learner = createSkillValidationLearner(reasoningBank);

        // Create validator
        const validator = createSwarmSkillValidator(config, learner);

        // Start validation
        const startTime = Date.now();
        console.log(chalk.yellow('  Starting parallel validation...\n'));

        const results = await validator.validateSkillsParallel(skills, models);
        const summary = validator.getSummary(results);

        const totalTime = Date.now() - startTime;

        // Output results
        if (options.json) {
          outputJsonResults(summary);
        } else {
          outputTextResults(summary, options.verbose);
        }

        // Summary
        console.log(chalk.blue('\n Summary\n'));
        console.log(`  Total validations: ${chalk.white(summary.results.length)}`);
        console.log(`  Passed: ${chalk.green(summary.successCount)}`);
        console.log(`  Failed: ${chalk.red(summary.failureCount)}`);
        console.log(`  Pass rate: ${getPassRateColor(summary.overallPassRate)}`);
        console.log(`  Total time: ${chalk.gray(formatDuration(totalTime))}`);
        console.log(`  Avg time per validation: ${chalk.gray(formatDuration(summary.avgDurationMs))}`);
        console.log('');

        // Exit with appropriate code
        const exitCode = summary.failureCount > 0 ? 1 : 0;
        await cleanupAndExit(exitCode);

      } catch (err) {
        console.error(chalk.red('\nValidation failed:'), err);
        await cleanupAndExit(1);
      }
    });

  // List subcommand to show available skills
  validateCmd
    .command('list')
    .description('List available P0 skills for validation')
    .action(async () => {
      console.log(chalk.blue('\n P0 Skills (Trust Tier 3)\n'));

      for (const skill of P0_SKILLS) {
        console.log(`  ${chalk.green('*')} ${chalk.white(skill)}`);
      }

      console.log(chalk.gray(`\n  Total: ${P0_SKILLS.length} skills\n`));
      console.log(chalk.cyan(' Default Models:\n'));

      for (const model of DEFAULT_VALIDATION_MODELS) {
        console.log(`  ${chalk.blue('*')} ${chalk.white(model)}`);
      }

      console.log('');
      await cleanupAndExit(0);
    });

  return validateCmd;
}

/**
 * Validate topology input
 */
function validateTopology(input: string): SwarmTopology {
  const normalized = input.toLowerCase().trim();
  if (normalized === 'hierarchical' || normalized === 'mesh') {
    return normalized;
  }
  console.log(chalk.yellow(`  Warning: Invalid topology "${input}", using hierarchical`));
  return 'hierarchical';
}

/**
 * Create a reasoning bank from CLI context
 */
async function createReasoningBankFromContext(context: CLIContext) {
  // Create real reasoning bank with proper config structure
  return createRealQEReasoningBank({
    sqlite: {
      dbPath: '.agentic-qe/validation.db',
      walMode: true,
    },
    embeddings: {
      quantized: true,
      enableCache: true,
      maxCacheSize: 5000,
    },
    enableLearning: true,
    enableRouting: true,
    enableGuidance: false,
    hnsw: {
      M: 16,
      efConstruction: 200,
      efSearch: 100,
    },
    routingWeights: {
      similarity: 0.4,
      performance: 0.35,
      capabilities: 0.25,
    },
  });
}

/**
 * Output results as JSON
 */
function outputJsonResults(summary: {
  totalSkills: number;
  totalModels: number;
  successCount: number;
  failureCount: number;
  overallPassRate: number;
  totalDurationMs: number;
  avgDurationMs: number;
  topology: string;
  results: SwarmValidationResult[];
}): void {
  const output = {
    summary: {
      totalSkills: summary.totalSkills,
      totalModels: summary.totalModels,
      successCount: summary.successCount,
      failureCount: summary.failureCount,
      overallPassRate: summary.overallPassRate,
      totalDurationMs: summary.totalDurationMs,
      avgDurationMs: summary.avgDurationMs,
      topology: summary.topology,
    },
    results: summary.results.map(r => ({
      skill: r.skill,
      model: r.model,
      schemaValid: r.schemaValid,
      validatorPassed: r.validatorPassed,
      evalPassRate: r.evalPassRate,
      durationMs: r.durationMs,
      errors: r.errors,
      trustTier: r.trustTier,
      validationLevel: r.validationLevel,
      retryCount: r.retryCount,
      timestamp: r.timestamp.toISOString(),
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Output results as formatted text
 */
function outputTextResults(
  summary: {
    bySkill: Map<string, SwarmValidationResult[]>;
    results: SwarmValidationResult[];
  },
  verbose: boolean
): void {
  console.log(chalk.cyan('  Results by Skill:\n'));

  for (const [skill, results] of summary.bySkill) {
    const passed = results.filter(r => r.errors.length === 0 && r.evalPassRate >= 0.9).length;
    const total = results.length;
    const passRate = total > 0 ? passed / total : 0;

    const statusIcon = passRate >= 0.9 ? chalk.green('*') :
                       passRate >= 0.7 ? chalk.yellow('!') : chalk.red('x');

    console.log(`  ${statusIcon} ${chalk.white(skill)}`);
    console.log(chalk.gray(`     Pass rate: ${(passRate * 100).toFixed(1)}% (${passed}/${total})`));

    if (verbose) {
      for (const result of results) {
        const modelIcon = result.errors.length === 0 ? chalk.green('+') : chalk.red('-');
        console.log(`       ${modelIcon} ${result.model}: ${(result.evalPassRate * 100).toFixed(1)}% (${formatDuration(result.durationMs)})`);

        if (result.errors.length > 0) {
          for (const error of result.errors) {
            console.log(chalk.red(`           Error: ${error}`));
          }
        }
      }
    }
    console.log('');
  }
}

/**
 * Get color based on pass rate
 */
function getPassRateColor(passRate: number): string {
  const percentage = `${(passRate * 100).toFixed(1)}%`;
  if (passRate >= 0.9) return chalk.green(percentage);
  if (passRate >= 0.7) return chalk.yellow(percentage);
  return chalk.red(percentage);
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}
