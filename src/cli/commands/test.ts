/**
 * Agentic QE v3 - Test Command
 *
 * Provides test generation and execution shortcuts.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { walkSourceFiles } from '../utils/file-discovery.js';
import { type OutputFormat, writeOutput, toJSON, toJUnit, testRunToMarkdown, type TestRunSummary } from '../utils/ci-output.js';

export function createTestCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const testCmd = new Command('test')
    .description('Test generation, execution, scheduling, and load testing')
    .argument('<action>', 'Action (generate|execute|schedule|load)')
    .argument('[target]', 'Target file or directory')
    .option('-f, --framework <framework>', 'Test framework', 'vitest')
    .option('-t, --type <type>', 'Test type (unit|integration|e2e)', 'unit')
    .option('-F, --format <format>', 'Output format (text|json|junit|markdown)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .option('--git-ref <ref>', 'Git ref for schedule action (e.g., main, HEAD~3)')
    .option('--no-git-aware', 'Disable git-aware test selection (schedule action)')
    .option('--no-flaky', 'Disable flaky test tracking (schedule action)')
    .option('--agents <count>', 'Target agent count for load action', '10')
    .option('--profile <profile>', 'Workload profile for load action (light|medium|heavy)', 'medium')
    .option('--duration <ms>', 'Duration in ms for load action', '30000')
    .option('--real', 'Use real agents instead of mock (load action, requires fleet_init)')
    .action(async (action: string, target: string, options) => {
      if (!await ensureInitialized()) return;

      try {
        if (action === 'generate') {
          console.log(chalk.blue(`\n Generating tests for ${target || 'current directory'}...\n`));

          const testGenAPI = await context.kernel!.getDomainAPIAsync!<{
            generateTests(request: { sourceFiles: string[]; testType: string; framework: string; coverageTarget?: number }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          }>('test-generation');

          if (!testGenAPI) {
            console.log(chalk.red('Test generation domain not available'));
            return;
          }

          const path = await import('path');
          const targetPath = path.resolve(target || '.');

          // Fix #280: Use shared file discovery supporting all languages
          const sourceFiles = walkSourceFiles(targetPath, { includeTests: false });

          if (sourceFiles.length === 0) {
            console.log(chalk.yellow('No source files found'));
            return;
          }

          console.log(chalk.gray(`  Found ${sourceFiles.length} source files\n`));

          const result = await testGenAPI.generateTests({
            sourceFiles,
            testType: options.type as 'unit' | 'integration' | 'e2e',
            framework: options.framework as 'jest' | 'vitest',
            coverageTarget: 80,
          });

          if (result.success && result.value) {
            const generated = result.value as { tests: Array<{ name: string; sourceFile: string; testFile: string; testCode?: string; assertions: number }>; coverageEstimate: number; patternsUsed: string[] };
            const format = options.format as OutputFormat;

            if (format === 'json') {
              writeOutput(toJSON(generated), options.output);
            } else if (format === 'markdown') {
              const md = `# Test Generation Report\n\n` +
                `- **Tests Generated**: ${generated.tests.length}\n` +
                `- **Coverage Estimate**: ${generated.coverageEstimate}%\n` +
                `- **Patterns Used**: ${generated.patternsUsed.join(', ') || 'none'}\n\n` +
                `## Tests\n\n` +
                generated.tests.map(t => `- **${t.name}** (${t.assertions} assertions) — \`${t.sourceFile}\``).join('\n') + '\n';
              writeOutput(md, options.output);
            } else {
              // Default text output
              console.log(chalk.green(`Generated ${generated.tests.length} tests\n`));
              console.log(chalk.cyan('  Tests:'));
              for (const test of generated.tests.slice(0, 10)) {
                console.log(`    ${chalk.white(test.name)}`);
                console.log(chalk.gray(`      Source: ${path.basename(test.sourceFile)}`));
                console.log(chalk.gray(`      Assertions: ${test.assertions}`));
                if (test.testCode) {
                  console.log(chalk.gray(`      Test File: ${test.testFile}`));

                  // Bug #295 fix: Write generated test code to disk
                  const fs = await import('fs');
                  const testDir = path.dirname(test.testFile);
                  fs.mkdirSync(testDir, { recursive: true });
                  fs.writeFileSync(test.testFile, test.testCode, 'utf-8');
                  console.log(chalk.green(`      Written to: ${test.testFile}`));
                }
              }
              if (generated.tests.length > 10) {
                console.log(chalk.gray(`    ... and ${generated.tests.length - 10} more`));
              }
              console.log(`\n  Coverage Estimate: ${chalk.yellow(generated.coverageEstimate + '%')}`);
              if (generated.patternsUsed.length > 0) {
                console.log(`  Patterns Used: ${chalk.cyan(generated.patternsUsed.join(', '))}`);
              }
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }

        } else if (action === 'execute') {
          console.log(chalk.blue(`\n Executing tests in ${target || 'current directory'}...\n`));

          const testExecAPI = await context.kernel!.getDomainAPIAsync!<{
            runTests(request: { testFiles: string[]; parallel?: boolean; retryCount?: number }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          }>('test-execution');

          if (!testExecAPI) {
            console.log(chalk.red('Test execution domain not available'));
            return;
          }

          const path = await import('path');
          const targetPath = path.resolve(target || '.');

          // Fix #280: Use shared file discovery supporting all languages
          const testFiles = walkSourceFiles(targetPath, { testsOnly: true });

          if (testFiles.length === 0) {
            console.log(chalk.yellow('No test files found'));
            return;
          }

          console.log(chalk.gray(`  Found ${testFiles.length} test files\n`));

          const result = await testExecAPI.runTests({
            testFiles,
            parallel: true,
            retryCount: 2,
          });

          if (result.success && result.value) {
            const run = result.value as TestRunSummary;
            const format = options.format as OutputFormat;

            if (format === 'json') {
              writeOutput(toJSON(run), options.output);
            } else if (format === 'junit') {
              writeOutput(toJUnit(run), options.output);
            } else if (format === 'markdown') {
              writeOutput(testRunToMarkdown(run), options.output);
            } else {
              // Default text output
              const total = run.passed + run.failed + run.skipped;
              console.log(chalk.green(`Test run complete`));
              console.log(`\n  Results:`);
              console.log(`    Total: ${chalk.white(total)}`);
              console.log(`    Passed: ${chalk.green(run.passed)}`);
              console.log(`    Failed: ${chalk.red(run.failed)}`);
              console.log(`    Skipped: ${chalk.yellow(run.skipped)}`);
              console.log(`    Duration: ${chalk.cyan(run.duration + 'ms')}`);
            }

            // Exit codes: 1 = failures, 2 = >20% skipped, 0 = all good
            if (run.failed > 0) {
              await cleanupAndExit(1);
            }
            const total = run.passed + run.failed + run.skipped;
            if (total > 0 && run.skipped / total > 0.2) {
              await cleanupAndExit(2);
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }
        } else if (action === 'schedule') {
          const format = options.format as OutputFormat;
          if (format === 'text') {
            console.log(chalk.blue(`\n Running test schedule pipeline...\n`));
          }

          const { TestScheduleTool } = await import('../../mcp/tools/test-execution/schedule.js');
          const tool = new TestScheduleTool();
          const result = await tool.invoke({
            cwd: target || process.cwd(),
            gitRef: options.gitRef,
            useGitAware: options.gitAware !== false,
            trackFlaky: options.flaky !== false,
          });

          if (result.success && result.data) {
            const data = result.data;
            if (format === 'json') {
              writeOutput(toJSON(data), options.output);
            } else {
              console.log(chalk.green(` Schedule complete\n`));
              console.log(`  Phases: ${chalk.white(data.phases.length)}`);
              for (const phase of data.phases) {
                const passColor = phase.failed === 0 ? chalk.green : chalk.red;
                console.log(`    ${chalk.cyan(phase.phaseName)}: ${passColor(`${phase.passed}/${phase.totalTests} passed`)} (${phase.durationMs}ms)`);
              }
              console.log(`\n  Git-aware: ${data.gitAware.enabled ? chalk.green(`yes (${data.gitAware.selectedTests} selected)`) : chalk.gray('disabled')}`);
              console.log(`  Duration: ${chalk.cyan(data.totalDuration + 'ms')}`);
              console.log(`\n  ${data.summary}`);
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error || 'Unknown error'}`));
          }

        } else if (action === 'load') {
          const format = options.format as OutputFormat;
          const agents = parseInt(options.agents, 10) || 10;
          const duration = parseInt(options.duration, 10) || 30000;
          const profile = options.profile as 'light' | 'medium' | 'heavy';
          const mockMode = !options.real;

          if (format === 'text') {
            console.log(chalk.blue(`\n Running load test: ${agents} agents, ${profile} profile, ${duration}ms${mockMode ? ' (mock)' : ' (real)'}...\n`));
          }

          const { LoadTestTool } = await import('../../mcp/tools/test-execution/load-test.js');
          const tool = new LoadTestTool();
          const result = await tool.invoke({
            targetAgents: agents,
            profile,
            durationMs: duration,
            mockMode,
          });

          if (result.success && result.data) {
            const data = result.data;
            if (format === 'json') {
              writeOutput(toJSON(data), options.output);
            } else {
              const statusColor = data.passed ? chalk.green : chalk.red;
              console.log(statusColor(` Load test ${data.passed ? 'PASSED' : 'FAILED'}\n`));
              console.log(`  Profile: ${chalk.cyan(data.profile)} (${data.mockMode ? 'mock' : 'real'})`);
              console.log(`  Agents: ${chalk.white(data.targetAgents)}`);
              console.log(`  Duration: ${chalk.cyan(data.duration + 'ms')}`);
              console.log(`  Bottlenecks: ${data.bottleneckCount > 0 ? chalk.red(data.bottleneckCount) : chalk.green('none')}`);
              if (data.report.hasCritical) {
                console.log(chalk.red(`  CRITICAL bottlenecks detected!`));
              }
              console.log(`\n  ${data.summary}`);
            }

            if (!data.passed) {
              await cleanupAndExit(1);
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error || 'Unknown error'}`));
          }

        } else {
          console.log(chalk.red(`\nUnknown action: ${action}. Use: generate, execute, schedule, or load\n`));
          await cleanupAndExit(1);
        }

        console.log('');
        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
    });

  return testCmd;
}
