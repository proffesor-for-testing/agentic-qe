/**
 * Agentic QE v3 - Test Command
 *
 * Provides test generation and execution shortcuts.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import type { CLIContext } from '../handlers/interfaces.js';
import { walkSourceFiles } from '../utils/file-discovery.js';

export function createTestCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const testCmd = new Command('test')
    .description('Test generation shortcut')
    .argument('<action>', 'Action (generate|execute)')
    .argument('[target]', 'Target file or directory')
    .option('-f, --framework <framework>', 'Test framework (vitest|jest|mocha|node-test)', 'vitest')
    .option('-t, --type <type>', 'Test type (unit|integration|e2e)', 'unit')
    .option('-w, --write', 'Write test files to disk (default: print to stdout)')
    .option('-o, --output <dir>', 'Output directory for test files', 'tests')
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
            framework: options.framework as 'jest' | 'vitest' | 'mocha' | 'pytest' | 'node-test',
            coverageTarget: 80,
          });

          if (result.success && result.value) {
            const generated = result.value as { tests: Array<{ name: string; sourceFile: string; testFile: string; testCode?: string; assertions: number }>; coverageEstimate: number; patternsUsed: string[] };
            console.log(chalk.green(`Generated ${generated.tests.length} tests\n`));
            
            // Write files if --write flag is set
            if (options.write) {
              const outputDir = path.resolve(options.output || 'tests');
              let filesWritten = 0;
              
              for (const test of generated.tests) {
                if (test.testCode) {
                  // Determine test file path
                  let testFilePath = test.testFile;
                  if (!path.isAbsolute(testFilePath)) {
                    testFilePath = path.join(outputDir, testFilePath);
                  }
                  
                  // Ensure directory exists
                  const testDir = path.dirname(testFilePath);
                  if (!fs.existsSync(testDir)) {
                    fs.mkdirSync(testDir, { recursive: true });
                  }
                  
                  // Write the test file
                  fs.writeFileSync(testFilePath, test.testCode, 'utf-8');
                  filesWritten++;
                  console.log(chalk.green(`  ✓ ${path.relative(process.cwd(), testFilePath)}`));
                }
              }
              
              console.log(chalk.green(`\n  Wrote ${filesWritten} test file(s) to ${options.output || 'tests'}/`));
            } else {
              // Original behavior: print to stdout
              console.log(chalk.cyan('  Tests:'));
              for (const test of generated.tests.slice(0, 10)) {
                console.log(`    ${chalk.white(test.name)}`);
                console.log(chalk.gray(`      Source: ${path.basename(test.sourceFile)}`));
                console.log(chalk.gray(`      Assertions: ${test.assertions}`));
                if (test.testCode) {
                  console.log(chalk.gray(`      Test File: ${test.testFile}`));
                  console.log(`\n--- Generated Code ---`);
                  console.log(test.testCode);
                  console.log(`--- End Generated Code ---\n`);
                }
              }
              if (generated.tests.length > 10) {
                console.log(chalk.gray(`    ... and ${generated.tests.length - 10} more`));
              }
              console.log(chalk.yellow('\n  Tip: Use --write to save test files to disk'));
            }
            
            console.log(`\n  Coverage Estimate: ${chalk.yellow(generated.coverageEstimate + '%')}`);
            if (generated.patternsUsed.length > 0) {
              console.log(`  Patterns Used: ${chalk.cyan(generated.patternsUsed.join(', '))}`);
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
            const run = result.value as { runId: string; passed: number; failed: number; skipped: number; duration: number };
            const total = run.passed + run.failed + run.skipped;
            console.log(chalk.green(`Test run complete`));
            console.log(`\n  Results:`);
            console.log(`    Total: ${chalk.white(total)}`);
            console.log(`    Passed: ${chalk.green(run.passed)}`);
            console.log(`    Failed: ${chalk.red(run.failed)}`);
            console.log(`    Skipped: ${chalk.yellow(run.skipped)}`);
            console.log(`    Duration: ${chalk.cyan(run.duration + 'ms')}`);
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }
        } else {
          console.log(chalk.red(`\nUnknown action: ${action}\n`));
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
