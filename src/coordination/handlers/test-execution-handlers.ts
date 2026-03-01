/**
 * Test generation and execution task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: generate-tests, execute-tests
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import { ok, err } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';

export function registerTestExecutionHandlers(ctx: TaskHandlerContext): void {
  // Register test generation handler - REAL IMPLEMENTATION
  ctx.registerHandler('generate-tests', async (task) => {
    const payload = task.payload as {
      sourceCode?: string;
      filePath?: string;
      sourceFiles?: string[];
      language: string;
      framework: string;
      testType: 'unit' | 'integration' | 'e2e';
      coverageGoal: number;
    };

    try {
      const generator = ctx.getTestGenerator();

      // Determine source files to analyze
      let sourceFiles: string[] = [];
      if (payload.sourceFiles && payload.sourceFiles.length > 0) {
        sourceFiles = payload.sourceFiles;
      } else if (payload.filePath) {
        sourceFiles = [payload.filePath];
      } else if (payload.sourceCode) {
        // Write temporary file for analysis if only source code provided
        // Use correct file extension based on language parameter
        const langExtMap: Record<string, string> = {
          python: '.py', typescript: '.ts', javascript: '.js',
          go: '.go', rust: '.rs', java: '.java', ruby: '.rb',
          kotlin: '.kt', csharp: '.cs', php: '.php', swift: '.swift',
          cpp: '.cpp', c: '.c', scala: '.scala',
        };
        const ext = langExtMap[payload.language?.toLowerCase() || 'typescript'] || '.ts';
        const tempPath = `/tmp/aqe-temp-${uuidv4()}${ext}`;
        await fs.writeFile(tempPath, payload.sourceCode, 'utf-8');
        sourceFiles = [tempPath];
      }

      if (sourceFiles.length === 0) {
        // Return a graceful fallback with warning when no source files provided
        return ok({
          testsGenerated: 0,
          coverageEstimate: 0,
          tests: [],
          patternsUsed: [],
          warning: 'No source files or code provided for test generation. Provide sourceCode, filePath, or sourceFiles in the payload.',
        });
      }

      // Use the real TestGeneratorService
      const framework = (payload.framework || 'vitest') as 'jest' | 'vitest' | 'mocha' | 'pytest' | 'node-test';
      const result = await generator.generateTests({
        sourceFiles,
        testType: payload.testType || 'unit',
        framework,
        coverageTarget: payload.coverageGoal || 80,
        patterns: [],
      });

      if (!result.success) {
        return result;
      }

      const generatedTests = result.value;

      return ok({
        testsGenerated: generatedTests.tests.length,
        coverageEstimate: generatedTests.coverageEstimate,
        tests: generatedTests.tests.map(t => ({
          name: t.name,
          file: t.testFile,
          type: t.type,
          sourceFile: t.sourceFile,
          assertions: t.assertions,
          testCode: t.testCode,
        })),
        patternsUsed: generatedTests.patternsUsed,
      });
    } catch (error) {
      return err(toError(error));
    }
  });

  // Register test execution handler - runs real tests via child process
  ctx.registerHandler('execute-tests', async (task) => {
    const payload = task.payload as {
      testFiles: string[];
      parallel: boolean;
      retryCount: number;
    };

    try {
      const testFiles = payload.testFiles || [];

      if (testFiles.length === 0) {
        return ok({
          total: 0, passed: 0, failed: 0, skipped: 0,
          duration: 0, coverage: 0, failedTests: [],
          warning: 'No test files specified. Provide testFiles array with paths to test files.',
        });
      }

      // Attempt to run tests using common test runners
      const cwd = process.cwd();
      let output: string;

      // Validate test file paths to prevent command injection
      const safePathPattern = /^[a-zA-Z0-9_.\/\-@]+$/;
      const safeFiles = testFiles.filter(f => safePathPattern.test(f));
      if (safeFiles.length !== testFiles.length) {
        return ok({
          total: 0, passed: 0, failed: 0, skipped: 0,
          duration: 0, coverage: 0, failedTests: [],
          warning: 'Some test file paths contain invalid characters and were rejected.',
        });
      }

      try {
        // Use spawnSync with argument arrays to prevent command injection
        const { spawnSync } = await import('child_process');
        const vitestResult = spawnSync('npx', ['vitest', 'run', ...safeFiles, '--reporter=json'], {
          cwd, timeout: 120000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
        });
        output = vitestResult.stdout || '';

        // If vitest failed (not just test failures), try jest
        if (!output.includes('{') && vitestResult.status !== 0) {
          const jestResult = spawnSync('npx', ['jest', ...safeFiles, '--json'], {
            cwd, timeout: 120000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
          });
          output = jestResult.stdout || '';
        }
      } catch (execError) {
        // Test runner may exit non-zero when tests fail — that's expected
        output = (execError as { stdout?: string }).stdout || '';
      }

      // Try to parse JSON output from test runner
      try {
        const jsonStart = output.indexOf('{');
        if (jsonStart >= 0) {
          const json = JSON.parse(output.slice(jsonStart));
          // vitest format
          if (json.testResults) {
            const total = json.numTotalTests || 0;
            const passed = json.numPassedTests || 0;
            const failed = json.numFailedTests || 0;
            return ok({ total, passed, failed, skipped: total - passed - failed, duration: 0, coverage: 0, failedTests: [] });
          }
        }
      } catch {
        // JSON parsing failed — return raw info
      }

      return ok({
        total: testFiles.length, passed: 0, failed: 0, skipped: 0,
        duration: 0, coverage: 0, failedTests: [],
        warning: 'Could not parse test runner output. Check that vitest or jest is installed.',
        rawOutput: output.slice(0, 500),
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}
