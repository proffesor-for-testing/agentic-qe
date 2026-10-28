/**
 * Test generation and execution task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: generate-tests, execute-tests
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import { ok, err, type Result } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
import { capDiagnostics, getTestRunnerExecutionError, TestRunnerExecutionError } from '../../shared/test-runner-verdict.js';
import { createVitestJsonReport } from '../../shared/vitest-json-report.js';
import { jestExactPathPattern, runnerFilePath } from '../../shared/test-runner-args.js';
import { testCaseFailureMessage, testCasesFromRunnerReport } from '../../domains/test-execution/services/runner-test-cases.js';
import { createPytestJunitReport, isPythonTestFile, pytestCommand, pytestRunFromReport, PYTEST_ENV } from '../../shared/pytest-junit-report.js';
import { runTestRunnerProcess } from '../../shared/test-runner-process.js';
import { MAX_PAYLOAD_FILE_BYTES, requirePayloadFiles } from '../../shared/io/payload-path-guard.js';
import { groupByRunnerProject, requireTestRunTargets, runnerFrameworkFor } from '../../shared/test-runner-project.js';

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

type ProjectRun = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  testCases?: ReturnType<typeof testCasesFromRunnerReport>;
};

/** #1248: run Python test files with pytest, reading its JUnit report. */
async function runPytestTests(testFiles: string[], cwd: string): Promise<Result<ProjectRun, Error>> {
  const report = createPytestJunitReport();
  try {
    const { command, args } = pytestCommand(testFiles.map(file => runnerFilePath(file)), report.path);
    const execution = await runTestRunnerProcess(command, args, { cwd, timeout: 120000, env: { ...process.env, ...PYTEST_ENV } });
    const output = [execution.stderr, execution.stdout].filter(Boolean).join('\n');
    if (execution.error || execution.signal) {
      const reason = execution.error?.message ?? `Terminated by ${execution.signal}`;
      return err(new TestRunnerExecutionError(`pytest could not complete: ${capDiagnostics(`${reason}\n${output}`)}`));
    }
    const run = pytestRunFromReport(report.read(), testFiles, execution.status, output, command);
    if (!run.success) return run;
    const testCases = run.value.tests.map(test => {
      const failureMessage = test.failureMessage && testCaseFailureMessage(test.failureMessage);
      return {
        name: test.name, file: test.file, status: test.status,
        ...(test.duration !== undefined ? { duration: test.duration } : {}),
        ...(failureMessage ? { failureMessage } : {}),
      };
    });
    const { total, passed, failed, skipped } = run.value;
    return ok({ total, passed, failed, skipped, testCases });
  } finally {
    report.cleanup();
  }
}

/**
 * Run `testFiles` (paths relative to the process cwd, or absolute) with the
 * runner started in `cwd`.
 */
async function runProjectTests(testFiles: string[], cwd: string): Promise<Result<ProjectRun, Error>> {
  if (testFiles.some(isPythonTestFile)) return runPytestTests(testFiles, cwd);
  // #1074: run the runner asynchronously so the MCP server keeps serving
  // other requests (task_status, task_cancel, ...) during the test run.
  const options = { cwd, timeout: 120000 };
  const runJest = () => runTestRunnerProcess('npx', ['jest', ...testFiles.map(file => jestExactPathPattern(file)), '--json'], options);
  let runner = 'vitest';
  let execution;
  let output = '';
  if (runnerFrameworkFor(cwd) === 'jest') {
    // #1272: a project configured for Jest runs with Jest, never Vitest first.
    runner = 'jest';
    execution = await runJest();
    output = execution.stdout || '';
  } else {
    // Vitest 5 writes the JSON report to a file rather than stdout; an explicit
    // --outputFile gives Vitest 4 and 5 the same contract.
    const report = createVitestJsonReport();
    try {
      // #909: absolute paths cannot be read as flags (e.g. a "--watch" entry).
      execution = await runTestRunnerProcess('npx', ['vitest', 'run', ...testFiles.map(file => runnerFilePath(file)), '--reporter=json', ...report.args], options);
      output = execution.error || execution.signal
        ? ''
        : report.read(execution.stdout || '') ?? '';
    } finally {
      report.cleanup();
    }
    // Preserve the existing Jest fallback when Vitest cannot produce a report.
    if (!output.includes('{') && execution.status !== 0 && !execution.error && !execution.signal) {
      runner = 'jest';
      execution = await runJest();
      output = execution.stdout || '';
    }
  }
  const diagnostics = [execution.error?.message, execution.signal && `Terminated by ${execution.signal}`, execution.stderr, output].filter(Boolean).join('\n');
  if (execution.error) {
    return err(new TestRunnerExecutionError(`${runner} could not complete: ${capDiagnostics(diagnostics)}`));
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
        // #1110: per-test entries come from the runner report itself, or are left out.
        const testCases = testCasesFromRunnerReport(json, testFiles.join(', '));
        return ok({
          total, passed, failed, skipped,
          ...(testCases && testCases.length === total ? { testCases } : {}),
        });
      }
    }
  } catch {
    // A malformed report cannot establish that the requested tests completed.
  }

  return err(new TestRunnerExecutionError(
    `Could not parse ${runner} results (exit code ${execution.status ?? 'unknown'}):\n${capDiagnostics(diagnostics)}`
  ));
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
      behaviorExamples?: import('../../domains/test-generation/interfaces').BehaviorExample[];
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
      } else if (payload.filePath && !payload.sourceCode) {
        // With sourceCode, filePath is only the import target written into the
        // generated tests (tool contract); it is neither read nor required.
        sourceFiles = [payload.filePath];
      }
      if (sourceFiles.length > 0) {
        // #1126: the generator reads each file whole, so only project files.
        const field = payload.sourceFiles?.length ? 'sourceFiles' : 'filePath';
        const confined = await requirePayloadFiles('generate-tests', field, sourceFiles, { maxBytes: MAX_PAYLOAD_FILE_BYTES });
        if (!confined.success) return confined;
        sourceFiles = confined.value;
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
          coverageEstimate: null,
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
        behaviorExamples: payload.behaviorExamples,
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
          generationMode: t.generationMode,
          generationLimits: t.generationLimits,
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
          generationMode: generatedTests.tests.some(t => t.generationMode === 'behavior-examples') ? 'behavior-examples' : 'deterministic-template',
          note: generatedTests.tests.some(t => t.generationMode === 'behavior-examples')
            ? 'Assertions use caller-supplied specification examples. Coverage is unmeasured; inspect generationLimits on each test.'
            : payload.aiEnhancement === false
            ? 'LLM enhancement was disabled by the caller (aiEnhancement: false). Coverage is unmeasured; inspect generationLimits on each test.'
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
      timeout?: number;
      parallelism?: number;
      projectRoot?: string;
    };

    try {
      const requestedFiles = payload.testFiles || [];

      if (requestedFiles.length === 0) {
        return err(new TestRunnerExecutionError('No test files specified. Provide testFiles array with paths to test files.'));
      }

      // Validate test file paths before invoking a runner.
      const safePathPattern = /^[a-zA-Z0-9_./@-]+$/;
      if (requestedFiles.some(file => !safePathPattern.test(file))) {
        return err(new TestRunnerExecutionError('Some test file paths contain invalid characters and were rejected. Provide concrete paths; expand glob patterns before calling.'));
      }
      // #1126: a runner executes what it is given, so only files and
      // directories (#909 Jest targets) inside the project, run as the real
      // paths that were checked. A missing file is still reported by the runner.
      // #1247: an explicit projectRoot is confined the same way.
      const confined = await requireTestRunTargets('execute-tests', requestedFiles, payload.projectRoot);
      if (!confined.success) return confined;
      const { testFiles, projectRoot } = confined.value;

      // A caller-owned MCP task skips the Queen's plugin dispatch. Run through
      // that same domain API here: it owns persistence, measured quality evidence
      // and TestRunStarted/Completed events as well as the runner itself.
      if (task.executionOwner === 'caller') {
        const api = await ctx.getTestExecutionAPI?.();
        if (!api) return err(new TestRunnerExecutionError('Test-execution domain is unavailable.'));
        const result = await api.runTests({
          testFiles,
          parallel: payload.parallel,
          timeout: payload.timeout,
          workers: payload.parallelism,
          // The domain owns requested retries; Queen dispatch must not replay it.
          retryCount: payload.retryCount ?? 0,
          projectRoot,
        });
        if (!result.success) return result;
        return ok({ ...result.value, coverage: result.value.coverage?.line ?? null });
      }

      // #1247: a runner loads the config of the directory it starts in, so
      // each runner project's files run from that project (or projectRoot).
      // #1248: Python files run apart from the others, with pytest.
      const groups = projectRoot
        ? [testFiles.filter(isPythonTestFile), testFiles.filter(file => !isPythonTestFile(file))]
          .filter(files => files.length > 0)
          .map(files => ({ cwd: projectRoot, files }))
        : groupByRunnerProject(testFiles);
      const totals = { total: 0, passed: 0, failed: 0, skipped: 0 };
      const testCases: NonNullable<ProjectRun['testCases']> = [];
      let everyTestCase = true;
      for (const group of groups) {
        const run = await runProjectTests(group.files, group.cwd);
        if (!run.success) return run;
        totals.total += run.value.total;
        totals.passed += run.value.passed;
        totals.failed += run.value.failed;
        totals.skipped += run.value.skipped;
        if (run.value.testCases) testCases.push(...run.value.testCases);
        else everyTestCase = false;
      }
      // #1027 N5/NB5: this handler runs the tests without --coverage, so it has no
      // coverage figure to return (null, never 0%). For test_execute_parallel the
      // measured coverage + testsPassing are recorded by TestExecutorService.
      return ok({
        ...totals, duration: 0, coverage: null, failedTests: [],
        ...(everyTestCase ? { testCases } : {}),
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}
