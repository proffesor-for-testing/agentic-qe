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
import { getTestRunnerExecutionError, TestRunnerExecutionError } from '../../shared/test-runner-verdict.js';
import { createVitestJsonReport } from '../../shared/vitest-json-report.js';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite any temp-source references in a generated test so the user gets a
 * test that imports from the original source path (when known) or a clear
 * placeholder. Without this, generated tests reference the throwaway
 * `/tmp/aqe-temp-*` file we created for analysis — that file is unlinked
 * after generation, so the test would never run as-emitted.
 *
 * The generator may emit the temp path with the original extension
 * (`/tmp/aqe-temp-X.ts`), with a substituted extension
 * (`/tmp/aqe-temp-X.test.ts`), or extension-stripped (TS import convention:
 * `/tmp/aqe-temp-X`). All three forms must be rewritten.
 *
 * Exported for unit testing (bug #1 regression).
 */
export function rewriteTempPathsInGeneratedTest(
  testCode: string | undefined,
  sourceFile: string | undefined,
  tempPath: string | undefined,
  originalFilePath: string | undefined
): { testCode?: string; sourceFile?: string } {
  if (!tempPath) {
    return { testCode, sourceFile };
  }
  // For the user's import target we strip the source extension when the
  // original is a path (TS imports omit `.ts`); preserve it otherwise.
  const stripExt = (p: string): string => p.replace(/\.[a-z]+$/i, '');
  const replacement = originalFilePath
    ? (originalFilePath.match(/\.(ts|tsx|js|jsx|mjs|cjs)$/i) ? stripExt(originalFilePath) : originalFilePath)
    : './module-under-test';
  const todoComment = originalFilePath
    ? ''
    : `// TODO: replace './module-under-test' with the actual import path of the module under test\n`;
  // Build a regex that matches the temp path with any (or no) extension suffix.
  // Order matters: replace extension-bearing forms before extension-less, since
  // the extension-less form is a prefix of the others.
  const tempBase = stripExt(tempPath);
  const tempBaseEscaped = escapeRegExp(tempBase);
  // Matches: <base>.<ext> | <base>.<ext>.<ext> | <base>
  const anyForm = new RegExp(tempBaseEscaped + '(?:\\.[a-zA-Z]+){0,2}', 'g');
  const newCode = testCode
    ? todoComment + testCode.replace(anyForm, replacement)
    : testCode;
  const newRef = sourceFile === tempPath ? (originalFilePath || sourceFile) : sourceFile;
  return { testCode: newCode, sourceFile: newRef };
}

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
      aiEnhancement?: boolean;
    };

    try {
      // #567: honor the tool's documented `aiEnhancement` knob (default true).
      const generator = await ctx.getTestGenerator(payload.aiEnhancement !== false);

      // Determine source files to analyze
      let sourceFiles: string[] = [];
      let tempPath: string | undefined;
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
        tempPath = `/tmp/aqe-temp-${uuidv4()}${ext}`;
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

      // Use the real TestGeneratorService.
      // Bug #1 fix: when we wrote a temp file for analysis, tell the generator
      // to bake a sensible logical import path into the emitted tests instead
      // of the throwaway temp path. If the user supplied filePath, use that;
      // otherwise use a placeholder the user can edit.
      const framework = (payload.framework || 'vitest') as 'jest' | 'vitest' | 'mocha' | 'pytest' | 'node-test';
      const importPathOverrides: Record<string, string> | undefined = tempPath
        ? { [tempPath]: payload.filePath
            ? payload.filePath.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/i, '')
            : './module-under-test' }
        : undefined;
      const result = await generator.generateTests({
        sourceFiles,
        testType: payload.testType || 'unit',
        framework,
        coverageTarget: payload.coverageGoal || 80,
        patterns: [],
        importPathOverrides,
      });

      // Always clean up the temp file we created — even on failure
      if (tempPath) {
        try { await fs.unlink(tempPath); } catch { /* best-effort */ }
      }

      if (!result.success) {
        return result;
      }

      const generatedTests = result.value;

      // Rewrite any temp-path references in generated tests so users get tests
      // that reference a real source path (or a clear placeholder) rather than
      // a /tmp/aqe-temp-* path that never existed in their codebase.
      const tests = generatedTests.tests.map(t => {
        const rewritten = rewriteTempPathsInGeneratedTest(
          t.testCode,
          t.sourceFile,
          tempPath,
          payload.filePath
        );
        return {
          name: t.name,
          file: t.testFile,
          type: t.type,
          sourceFile: rewritten.sourceFile,
          assertions: t.assertions,
          testCode: rewritten.testCode,
        };
      });

      // #567: surface whether the LLM branch actually ran. Previously the only
      // clue that generation had silently fallen back to template scaffolding
      // was a suspiciously constant coverage estimate and a sub-20ms duration.
      const llmEnhanced = generatedTests.tests.some(t => t.llmEnhanced === true);

      return ok({
        testsGenerated: tests.length,
        coverageEstimate: generatedTests.coverageEstimate,
        tests,
        patternsUsed: generatedTests.patternsUsed,
        llmEnhanced,
        ...(llmEnhanced ? {} : {
          generationMode: 'deterministic-template' as const,
          note: payload.aiEnhancement === false
            ? 'LLM enhancement was disabled by the caller (aiEnhancement: false).'
            : 'No LLM provider was available, so tests are deterministic template ' +
              'scaffolding rather than source-aware. Configure a provider in ' +
              '.agentic-qe/llm-config.json (or set a provider API key) and ensure ' +
              'AQE_LLM_ROUTER_DISABLED is not set.',
        }),
      });
    } catch (error) {
      return err(toError(error));
    }
  });

  // execute-tests accepts a nonempty list of concrete paths; callers expand globs.
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
        return err(new TestRunnerExecutionError('No test files specified. Provide testFiles array with paths to test files.'));
      }

      // Validate test file paths before invoking a runner.
      const safePathPattern = /^[a-zA-Z0-9_./@-]+$/;
      if (testFiles.some(file => !safePathPattern.test(file))) {
        return err(new TestRunnerExecutionError('Some test file paths contain invalid characters and were rejected. Provide concrete paths; expand glob patterns before calling.'));
      }

      const { spawnSync } = await import('child_process');
      const options = { cwd: process.cwd(), timeout: 120000, encoding: 'utf-8' as const };
      let runner = 'vitest';
      // Vitest 5 writes the JSON report to a file rather than stdout; an explicit
      // --outputFile gives Vitest 4 and 5 the same contract.
      const report = createVitestJsonReport();
      let execution;
      let output: string;
      try {
        execution = spawnSync('npx', ['vitest', 'run', ...testFiles, '--reporter=json', ...report.args], options);
        output = execution.error || execution.signal
          ? ''
          : report.read(execution.stdout || '') ?? '';
      } finally {
        report.cleanup();
      }
      // Preserve the existing Jest fallback when Vitest cannot produce a report.
      if (!output.includes('{') && execution.status !== 0 && !execution.error && !execution.signal) {
        runner = 'jest';
        execution = spawnSync('npx', ['jest', ...testFiles, '--json'], options);
        output = execution.stdout || '';
      }
      const diagnostics = [execution.error?.message, execution.signal && `Terminated by ${execution.signal}`, execution.stderr, output].filter(Boolean).join('\n');
      if (execution.error) {
        return err(new TestRunnerExecutionError(`${runner} could not complete: ${diagnostics.slice(0, 4000)}`));
      }

      try {
        const jsonStart = output.indexOf('{');
        if (jsonStart >= 0) {
          const json = JSON.parse(output.slice(jsonStart));
          if (json.testResults) {
            const total = json.numTotalTests || 0;
            const passed = json.numPassedTests || 0;
            const failed = json.numFailedTests || 0;
            const skipped = total - passed - failed;
            const executionError = getTestRunnerExecutionError(runner, testFiles.join(', '),
              execution.status, { passed, failed, skipped }, diagnostics, json);
            if (executionError) return err(executionError);
            return ok({ total, passed, failed, skipped, duration: 0, coverage: 0, failedTests: [] });
          }
        }
      } catch {
        // A malformed report cannot establish that the requested tests completed.
      }

      return err(new TestRunnerExecutionError(
        `Could not parse ${runner} results (exit code ${execution.status ?? 'unknown'}):\n${diagnostics.slice(0, 4000)}`
      ));
    } catch (error) {
      return err(toError(error));
    }
  });
}
