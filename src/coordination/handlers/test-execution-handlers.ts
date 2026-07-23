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
