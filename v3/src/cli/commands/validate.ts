/**
 * Agentic QE v3 - Validate Command
 * ADR-056 Phase 5: CLI for validation result aggregation
 *
 * Provides commands for:
 * - Aggregating validation results from parallel runs
 * - Generating markdown and JSON reports
 * - Detecting regressions against baselines
 * - Updating trust tier manifest with pass rates
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, basename, dirname } from 'path';
import chalk from 'chalk';
import { safeJsonParse } from '../../shared/safe-json.js';
import type { CLIContext } from '../handlers/interfaces.js';
import {
  ValidationResultAggregator,
  createValidationResultAggregator,
  type ParallelValidationRunResult,
  type AggregatedValidationReport,
} from '../../validation/index.js';
import { createSkillValidationLearner, type SkillValidationLearner } from '../../learning/skill-validation-learner.js';

// ============================================================================
// Types
// ============================================================================

interface ValidateReportOptions {
  input: string;
  output?: string;
  format?: 'markdown' | 'json' | 'both';
  baseline?: string;
  detectRegressions?: boolean;
  updateManifest?: boolean;
  threshold?: number;
  verbose?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Load validation results from file(s)
 */
function loadValidationResults(inputPath: string): ParallelValidationRunResult[] {
  const resolvedPath = resolve(inputPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Input path not found: ${resolvedPath}`);
  }

  const stat = statSync(resolvedPath);

  if (stat.isDirectory()) {
    // Load all JSON files from directory
    const results: ParallelValidationRunResult[] = [];
    const files = readdirSync(resolvedPath)
      .filter(f => f.endsWith('.json'))
      .map(f => join(resolvedPath, f));

    for (const file of files) {
      try {
        const content = safeJsonParse<unknown>(readFileSync(file, 'utf-8'));
        if (isValidationRunResult(content)) {
          results.push(content);
        } else if (Array.isArray(content)) {
          // Handle array of results
          for (const item of content) {
            if (isValidationRunResult(item)) {
              results.push(item);
            }
          }
        }
      } catch (e) {
        console.warn(chalk.yellow(`Warning: Could not parse ${basename(file)}`));
      }
    }

    return results;
  } else {
    // Load single file
    const content = safeJsonParse<unknown>(readFileSync(resolvedPath, 'utf-8'));

    if (isValidationRunResult(content)) {
      return [content];
    } else if (Array.isArray(content)) {
      return content.filter(isValidationRunResult);
    }

    throw new Error('Invalid input format. Expected ParallelValidationRunResult or array of results.');
  }
}

/**
 * Type guard for ParallelValidationRunResult
 */
function isValidationRunResult(obj: unknown): obj is ParallelValidationRunResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'runId' in obj &&
    'model' in obj &&
    'outcomes' in obj &&
    Array.isArray((obj as ParallelValidationRunResult).outcomes)
  );
}

/**
 * Create a mock learner for CLI usage when ReasoningBank is not available
 */
function createMockLearner(): SkillValidationLearner {
  // Create a minimal mock that satisfies the interface
  const mockReasoningBank = {
    storeQEPattern: async () => {},
    searchQEPatterns: async () => ({ success: true, value: [] }),
    addFact: async () => ({ success: true, value: undefined }),
    query: async () => ({ success: true, value: { results: [], confidence: 0 } }),
    getStats: () => ({
      totalPatterns: 0,
      totalFacts: 0,
      indexHealth: 1,
      lastCompaction: new Date(),
    }),
  };

  return createSkillValidationLearner(mockReasoningBank as never);
}

/**
 * Get default manifest path
 */
function getDefaultManifestPath(): string {
  const cwd = process.cwd();

  // Try common locations
  const candidates = [
    join(cwd, '.claude/skills/trust-tier-manifest.json'),
    join(cwd, '.claude/skills/skills-manifest.json'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Default to trust-tier-manifest.json
  return join(cwd, '.claude/skills/trust-tier-manifest.json');
}

/**
 * Write report to file or stdout
 */
function writeReport(
  report: AggregatedValidationReport,
  aggregator: ValidationResultAggregator,
  options: ValidateReportOptions
): void {
  const format = options.format || 'markdown';

  if (format === 'markdown' || format === 'both') {
    const markdown = aggregator.generateMarkdownReport(report);

    if (options.output) {
      const mdPath = format === 'both'
        ? options.output.replace(/\.\w+$/, '.md')
        : options.output;
      writeFileSync(mdPath, markdown);
      console.log(chalk.green(`Markdown report written to: ${mdPath}`));
    } else {
      console.log('\n' + markdown);
    }
  }

  if (format === 'json' || format === 'both') {
    const json = aggregator.generateJsonReport(report);

    if (options.output) {
      const jsonPath = format === 'both'
        ? options.output.replace(/\.\w+$/, '.json')
        : options.output;
      writeFileSync(jsonPath, json);
      console.log(chalk.green(`JSON report written to: ${jsonPath}`));
    } else {
      console.log('\n' + json);
    }
  }
}

// ============================================================================
// Command Factory
// ============================================================================

export function createValidateCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const validateCmd = new Command('skill')
    .description('Skill validation and reporting (ADR-056)');

  // ============================================================================
  // validate report
  // ============================================================================

  validateCmd
    .command('report')
    .description('Generate aggregated report from validation results')
    .requiredOption('-i, --input <path>', 'Input file or directory containing validation results')
    .option('-o, --output <path>', 'Output file path (default: stdout)')
    .option('-f, --format <format>', 'Output format: markdown, json, or both', 'markdown')
    .option('-b, --baseline <path>', 'Baseline directory for regression detection')
    .option('--detect-regressions', 'Enable regression detection against historical data')
    .option('--update-manifest', 'Update trust tier manifest with new pass rates')
    .option('-t, --threshold <number>', 'Regression threshold (0-1)', parseFloat)
    .option('-v, --verbose', 'Verbose output')
    .action(async (options: ValidateReportOptions) => {
      try {
        if (options.verbose) {
          console.log(chalk.blue('\nValidation Result Aggregator'));
          console.log(chalk.gray('ADR-056 Phase 5\n'));
        }

        // Load validation results
        console.log(chalk.gray(`Loading results from: ${options.input}`));
        const results = loadValidationResults(options.input);

        if (results.length === 0) {
          console.log(chalk.yellow('No validation results found'));
          await cleanupAndExit(0);
          return;
        }

        console.log(chalk.gray(`Loaded ${results.length} validation run(s)`));

        // Get manifest path
        const manifestPath = getDefaultManifestPath();

        // Create learner and aggregator
        // Note: In CLI context, we use a mock learner since the full ReasoningBank
        // requires database initialization. For production usage, integrate with
        // the kernel's learning domain via getDomainAPI('learning-optimization').
        const learner = createMockLearner();

        const aggregator = createValidationResultAggregator(
          learner,
          manifestPath,
          {
            regressionThreshold: options.threshold ?? 0.1,
            autoUpdateManifest: options.updateManifest ?? false,
          }
        );

        // Aggregate results
        console.log(chalk.gray('Aggregating results...'));
        const report = await aggregator.aggregateResults(results);

        // Print summary
        console.log('\n' + chalk.bold('Summary:'));
        console.log(`  Total Skills: ${chalk.white(report.summary.totalSkills)}`);
        console.log(`  Passed: ${chalk.green(report.summary.passedSkills)}`);
        console.log(`  Failed: ${chalk.red(report.summary.failedSkills)}`);
        console.log(`  Avg Pass Rate: ${chalk.cyan((report.summary.avgPassRate * 100).toFixed(1) + '%')}`);
        console.log(`  Total Tests: ${chalk.white(report.summary.totalTests)}`);
        console.log(`  Duration: ${chalk.gray((report.summary.totalDurationMs / 1000).toFixed(1) + 's')}`);

        // Print regressions if any
        if (report.regressions.length > 0) {
          console.log('\n' + chalk.bold.red('Regressions Detected:'));
          for (const reg of report.regressions.slice(0, 5)) {
            const arrow = reg.regressionAmount > 0.2 ? chalk.red(' !') : chalk.yellow(' !');
            console.log(`${arrow} ${reg.skill} (${reg.model}): ${(reg.previousPassRate * 100).toFixed(1)}% -> ${(reg.currentPassRate * 100).toFixed(1)}%`);
          }
          if (report.regressions.length > 5) {
            console.log(chalk.gray(`  ... and ${report.regressions.length - 5} more`));
          }
        }

        // Print recommendations
        if (report.recommendations.length > 0 && options.verbose) {
          console.log('\n' + chalk.bold('Recommendations:'));
          for (const rec of report.recommendations) {
            console.log(chalk.cyan(`  - ${rec}`));
          }
        }

        // Write report
        writeReport(report, aggregator, options);

        // Update manifest if requested
        if (options.updateManifest) {
          console.log(chalk.gray(`\nUpdating manifest: ${manifestPath}`));
          await aggregator.updateManifest(report);
          console.log(chalk.green('Manifest updated successfully'));
        }

        console.log('');
        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
        if (options.verbose && error instanceof Error) {
          console.error(chalk.gray(error.stack));
        }
        await cleanupAndExit(1);
      }
    });

  // ============================================================================
  // validate summary
  // ============================================================================

  validateCmd
    .command('summary')
    .description('Show quick summary of validation results')
    .requiredOption('-i, --input <path>', 'Input file or directory')
    .action(async (options: { input: string }) => {
      try {
        const results = loadValidationResults(options.input);

        if (results.length === 0) {
          console.log(chalk.yellow('No validation results found'));
          await cleanupAndExit(0);
          return;
        }

        // Quick summary without full aggregation
        let totalSkills = 0;
        let totalTests = 0;
        let passedTests = 0;
        const models = new Set<string>();
        const skills = new Set<string>();

        for (const run of results) {
          models.add(run.model);
          for (const outcome of run.outcomes) {
            skills.add(outcome.skillName);
            totalTests += outcome.testCaseResults.length;
            passedTests += outcome.testCaseResults.filter(t => t.passed).length;
          }
        }

        totalSkills = skills.size;

        console.log('\n' + chalk.bold('Quick Summary'));
        console.log(chalk.gray('-'.repeat(30)));
        console.log(`  Validation Runs: ${chalk.white(results.length)}`);
        console.log(`  Models: ${chalk.cyan(Array.from(models).join(', '))}`);
        console.log(`  Unique Skills: ${chalk.white(totalSkills)}`);
        console.log(`  Total Tests: ${chalk.white(totalTests)}`);
        console.log(`  Passed: ${chalk.green(passedTests)} (${(passedTests / totalTests * 100).toFixed(1)}%)`);
        console.log(`  Failed: ${chalk.red(totalTests - passedTests)}`);
        console.log('');

        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
        await cleanupAndExit(1);
      }
    });

  // ============================================================================
  // validate compare
  // ============================================================================

  validateCmd
    .command('compare')
    .description('Compare two validation runs')
    .requiredOption('-a, --run-a <path>', 'First validation run')
    .requiredOption('-b, --run-b <path>', 'Second validation run')
    .option('-o, --output <path>', 'Output comparison report')
    .action(async (options: { runA: string; runB: string; output?: string }) => {
      try {
        const resultsA = loadValidationResults(options.runA);
        const resultsB = loadValidationResults(options.runB);

        if (resultsA.length === 0 || resultsB.length === 0) {
          console.log(chalk.yellow('Both runs must contain validation results'));
          await cleanupAndExit(1);
          return;
        }

        // Build skill pass rate maps
        const passRatesA = new Map<string, number>();
        const passRatesB = new Map<string, number>();

        for (const run of resultsA) {
          for (const outcome of run.outcomes) {
            const passRate = outcome.testCaseResults.filter(t => t.passed).length /
              (outcome.testCaseResults.length || 1);
            passRatesA.set(outcome.skillName, passRate);
          }
        }

        for (const run of resultsB) {
          for (const outcome of run.outcomes) {
            const passRate = outcome.testCaseResults.filter(t => t.passed).length /
              (outcome.testCaseResults.length || 1);
            passRatesB.set(outcome.skillName, passRate);
          }
        }

        // Compare
        const allSkills = new Set([...passRatesA.keys(), ...passRatesB.keys()]);
        const improved: Array<{ skill: string; delta: number }> = [];
        const regressed: Array<{ skill: string; delta: number }> = [];
        const unchanged: string[] = [];
        const newSkills: string[] = [];
        const removedSkills: string[] = [];

        for (const skill of allSkills) {
          const rateA = passRatesA.get(skill);
          const rateB = passRatesB.get(skill);

          if (rateA === undefined) {
            newSkills.push(skill);
          } else if (rateB === undefined) {
            removedSkills.push(skill);
          } else {
            const delta = rateB - rateA;
            if (delta > 0.05) {
              improved.push({ skill, delta });
            } else if (delta < -0.05) {
              regressed.push({ skill, delta: Math.abs(delta) });
            } else {
              unchanged.push(skill);
            }
          }
        }

        // Sort by delta
        improved.sort((a, b) => b.delta - a.delta);
        regressed.sort((a, b) => b.delta - a.delta);

        // Print comparison
        console.log('\n' + chalk.bold('Validation Run Comparison'));
        console.log(chalk.gray('-'.repeat(40)));

        if (improved.length > 0) {
          console.log('\n' + chalk.green('Improved:'));
          for (const { skill, delta } of improved.slice(0, 10)) {
            console.log(`  + ${skill}: +${(delta * 100).toFixed(1)}%`);
          }
        }

        if (regressed.length > 0) {
          console.log('\n' + chalk.red('Regressed:'));
          for (const { skill, delta } of regressed.slice(0, 10)) {
            console.log(`  - ${skill}: -${(delta * 100).toFixed(1)}%`);
          }
        }

        if (newSkills.length > 0) {
          console.log('\n' + chalk.blue('New Skills:'));
          for (const skill of newSkills.slice(0, 5)) {
            console.log(`  * ${skill}`);
          }
        }

        if (removedSkills.length > 0) {
          console.log('\n' + chalk.yellow('Removed Skills:'));
          for (const skill of removedSkills.slice(0, 5)) {
            console.log(`  * ${skill}`);
          }
        }

        console.log('\n' + chalk.gray(`Unchanged: ${unchanged.length} skills`));

        // Write output if requested
        if (options.output) {
          const comparison = {
            timestamp: new Date().toISOString(),
            runA: options.runA,
            runB: options.runB,
            improved,
            regressed,
            unchanged,
            newSkills,
            removedSkills,
          };
          writeFileSync(options.output, JSON.stringify(comparison, null, 2));
          console.log(chalk.green(`\nComparison written to: ${options.output}`));
        }

        console.log('');
        await cleanupAndExit(regressed.length > 0 ? 1 : 0);

      } catch (error) {
        console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
        await cleanupAndExit(1);
      }
    });

  return validateCmd;
}
