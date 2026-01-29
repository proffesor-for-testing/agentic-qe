/**
 * Agentic QE v3 - Flaky Test Detector Service
 * Identifies and analyzes flaky tests from execution history
 */

import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Result, ok, err } from '../../../shared/types';
import {
  FlakyDetectionRequest,
  FlakyTestReport,
  FlakyTest,
} from '../interfaces';
import { MemoryBackend } from '../../../kernel/interfaces';
import { TEST_EXECUTION_CONSTANTS, RETRY_CONSTANTS } from '../../constants.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the flaky detector service
 */
export interface FlakyDetectorConfig {
  /**
   * When true, simulates test execution with random outcomes (for unit testing).
   * When false (default), actually executes tests using the configured test runner.
   */
  simulateForTesting: boolean;
  /**
   * Base flakiness probability (0-1) when simulateForTesting is true.
   * Defaults to 0.3 (30% of tests are flaky in simulation).
   */
  simulatedFlakinessRate: number;
  /**
   * Simulated pass rate for flaky tests (0-1) when simulateForTesting is true.
   * Defaults to 0.7 (70% pass rate for flaky tests).
   */
  simulatedFlakyPassRate: number;
  /**
   * Number of tests per file in simulation mode.
   * Defaults to 2.
   */
  simulatedTestsPerFile: number;
  /**
   * Test runner command to use. Defaults to 'npx vitest'.
   * Examples: 'npx vitest', 'npm test --', 'npx jest', 'npx mocha'
   */
  testRunner: string;
  /**
   * Additional arguments to pass to the test runner.
   */
  testRunnerArgs: string[];
  /**
   * Working directory for test execution.
   */
  cwd?: string;
  /**
   * Timeout in milliseconds for each test run.
   * Defaults to 60000 (60 seconds).
   */
  runTimeout: number;
  /**
   * Environment variables to pass to the test runner.
   */
  env?: Record<string, string>;
}

const DEFAULT_FLAKY_CONFIG: FlakyDetectorConfig = {
  simulateForTesting: false,
  simulatedFlakinessRate: RETRY_CONSTANTS.DEFAULT_FLAKY_RATE,
  simulatedFlakyPassRate: RETRY_CONSTANTS.DEFAULT_FLAKY_PASS_RATE,
  simulatedTestsPerFile: 2,
  testRunner: 'npx',
  testRunnerArgs: ['vitest', 'run', '--reporter=json'],
  runTimeout: TEST_EXECUTION_CONSTANTS.DEFAULT_TEST_TIMEOUT_MS,
};

// ============================================================================
// Interfaces
// ============================================================================

export interface IFlakyTestDetector {
  /** Detect flaky tests by running multiple times */
  detectFlaky(request: FlakyDetectionRequest): Promise<Result<FlakyTestReport, Error>>;

  /** Analyze failure patterns from history */
  analyzePattern(testId: string): Promise<Result<FlakyAnalysis, Error>>;

  /** Suggest remediation for a flaky test */
  suggestFix(testId: string): Promise<Result<FlakySuggestion, Error>>;

  /** Record test execution result for analysis */
  recordExecution(testId: string, result: TestExecutionRecord): Promise<void>;

  /** Get flakiness score for a test */
  getFlakinessScore(testId: string): Promise<number>;
}

export interface FlakyAnalysis {
  testId: string;
  pattern: 'timing' | 'ordering' | 'resource' | 'async' | 'unknown';
  confidence: number;
  factors: string[];
  correlations: CorrelationFactor[];
}

export interface CorrelationFactor {
  factor: string;
  correlation: number;
  description: string;
}

export interface FlakySuggestion {
  testId: string;
  pattern: string;
  recommendations: Recommendation[];
  priority: 'high' | 'medium' | 'low';
}

export interface Recommendation {
  action: string;
  description: string;
  codeSnippet?: string;
  effort: 'low' | 'medium' | 'high';
}

export interface TestExecutionRecord {
  runId: string;
  passed: boolean;
  duration: number;
  error?: string;
  timestamp: Date;
  context?: ExecutionContext;
}

export interface ExecutionContext {
  workerIndex?: number;
  parallelRuns?: number;
  environment?: Record<string, string>;
  precedingTests?: string[];
}

// ============================================================================
// Test Runner Output Types
// ============================================================================

interface VitestAssertionResult {
  title: string;
  fullName?: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration?: number;
  failureMessages?: string[];
}

interface VitestTestResult {
  assertionResults?: VitestAssertionResult[];
}

interface VitestJsonOutput {
  testResults?: VitestTestResult[];
}

interface JestAssertionResult {
  title: string;
  fullName?: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration?: number;
  failureMessages?: string[];
}

interface JestTestFileResult {
  assertionResults?: JestAssertionResult[];
}

interface JestJsonOutput {
  testResults?: JestTestFileResult[];
}

// ============================================================================
// Flaky Detector Service
// ============================================================================

export class FlakyDetectorService implements IFlakyTestDetector {
  private readonly testHistory = new Map<string, TestExecutionRecord[]>();
  private readonly analysisCache = new Map<string, FlakyAnalysis & { analyzedAt?: number }>();
  private readonly config: FlakyDetectorConfig;

  /** Maximum number of tests to track in history */
  private readonly MAX_TESTS_TRACKED = TEST_EXECUTION_CONSTANTS.MAX_TESTS_TRACKED;
  /** Cache TTL for analysis results (1 hour) */
  private readonly ANALYSIS_CACHE_TTL_MS = TEST_EXECUTION_CONSTANTS.ANALYSIS_CACHE_TTL_MS;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<FlakyDetectorConfig> = {}
  ) {
    this.config = { ...DEFAULT_FLAKY_CONFIG, ...config };
  }

  /**
   * Detect flaky tests by running them multiple times
   */
  async detectFlaky(request: FlakyDetectionRequest): Promise<Result<FlakyTestReport, Error>> {
    const startTime = Date.now();

    try {
      const { testFiles, runs, threshold } = request;

      if (runs < 2) {
        return err(new Error('Minimum 2 runs required for flaky detection'));
      }
      if (threshold < 0 || threshold > 1) {
        return err(new Error('Threshold must be between 0 and 1'));
      }

      const flakyTests: FlakyTest[] = [];

      for (const file of testFiles) {
        const fileResults = await this.runMultipleTimes(file, runs);
        const flakyInFile = this.identifyFlakyTests(fileResults, threshold);
        flakyTests.push(...flakyInFile);
      }

      const report: FlakyTestReport = {
        flakyTests,
        totalRuns: runs * testFiles.length,
        analysisTime: Date.now() - startTime,
      };

      // Store report for future reference
      await this.storeReport(report);

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze failure patterns for a specific test
   */
  async analyzePattern(testId: string): Promise<Result<FlakyAnalysis, Error>> {
    try {
      // Check cache
      const cached = this.analysisCache.get(testId);
      if (cached) {
        return ok(cached);
      }

      // Load history
      const history = await this.getTestHistory(testId);
      if (history.length < 5) {
        return err(new Error('Insufficient history for pattern analysis (minimum 5 runs)'));
      }

      // Analyze patterns
      const analysis = this.performPatternAnalysis(testId, history);

      // Cache result with timestamp
      const cachedAnalysis = { ...analysis, analyzedAt: Date.now() };
      this.analysisCache.set(testId, cachedAnalysis);
      await this.memory.set(`flaky-analysis:${testId}`, cachedAnalysis, {
        namespace: 'test-execution',
        ttl: 3600000, // 1 hour
      });

      return ok(analysis);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Suggest fixes for a flaky test
   */
  async suggestFix(testId: string): Promise<Result<FlakySuggestion, Error>> {
    try {
      const analysisResult = await this.analyzePattern(testId);
      if (!analysisResult.success) {
        return err(analysisResult.error);
      }

      const analysis = analysisResult.value;
      const recommendations = this.generateRecommendations(analysis);

      const suggestion: FlakySuggestion = {
        testId,
        pattern: analysis.pattern,
        recommendations,
        priority: this.determinePriority(analysis),
      };

      return ok(suggestion);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Record a test execution for future analysis
   */
  async recordExecution(testId: string, result: TestExecutionRecord): Promise<void> {
    // Add to in-memory history
    const history = this.testHistory.get(testId) ?? [];
    history.push(result);

    // Keep only last 100 executions
    if (history.length > 100) {
      history.shift();
    }
    this.testHistory.set(testId, history);

    // Persist to storage
    await this.memory.set(`test-history:${testId}`, history, {
      namespace: 'test-execution',
      persist: true,
    });

    // Invalidate analysis cache
    this.analysisCache.delete(testId);
  }

  /**
   * Calculate flakiness score (0-1, where 1 is most flaky)
   */
  async getFlakinessScore(testId: string): Promise<number> {
    const history = await this.getTestHistory(testId);

    if (history.length < 2) {
      return 0;
    }

    // Count state changes
    let stateChanges = 0;
    for (let i = 1; i < history.length; i++) {
      if (history[i].passed !== history[i - 1].passed) {
        stateChanges++;
      }
    }

    // Calculate score based on state change frequency
    const changeRate = stateChanges / (history.length - 1);

    // Factor in failure rate
    const failures = history.filter(h => !h.passed).length;
    const failureRate = failures / history.length;

    // Flakiness is high when there are many state changes and intermediate failure rate
    // Pure passes (failureRate = 0) or pure failures (failureRate = 1) are not flaky
    const flakinessFactor = Math.min(failureRate, 1 - failureRate) * 2;

    return Math.min(1, changeRate * 0.6 + flakinessFactor * 0.4);
  }

  // ============================================================================
  // Cleanup Methods
  // ============================================================================

  /**
   * Clean up stale data from caches and enforce size limits.
   * @returns Number of entries cleaned up
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    // Clean stale analysis cache entries
    for (const [testId, analysis] of this.analysisCache) {
      if (now - (analysis.analyzedAt ?? 0) > this.ANALYSIS_CACHE_TTL_MS) {
        this.analysisCache.delete(testId);
        cleaned++;
      }
    }

    // Enforce max tests tracked (remove oldest entries)
    if (this.testHistory.size > this.MAX_TESTS_TRACKED) {
      const excess = this.testHistory.size - this.MAX_TESTS_TRACKED;
      const keys = Array.from(this.testHistory.keys()).slice(0, excess);
      for (const key of keys) {
        this.testHistory.delete(key);
        this.analysisCache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Dispose of all resources held by this service.
   * Call this when the service is no longer needed.
   */
  destroy(): void {
    this.testHistory.clear();
    this.analysisCache.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async runMultipleTimes(
    file: string,
    runs: number
  ): Promise<Map<string, TestExecutionRecord[]>> {
    // In simulation mode (for unit testing), use random behavior
    if (this.config.simulateForTesting) {
      return this.simulateMultipleRuns(runs);
    }

    // In production mode, ACTUALLY execute the test file multiple times
    // Verify the test file exists
    const resolvedPath = this.config.cwd
      ? path.resolve(this.config.cwd, file)
      : path.resolve(file);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `Test file not found: ${resolvedPath}. Cannot perform flaky detection without a valid test file.`
      );
    }

    // Execute the test file N times and collect results
    const allResults = new Map<string, TestExecutionRecord[]>();

    for (let runIndex = 0; runIndex < runs; runIndex++) {
      const runResult = await this.executeTestFile(file, runIndex);

      // Merge results from this run into allResults
      for (const [testId, records] of runResult.entries()) {
        const existing = allResults.get(testId) ?? [];
        existing.push(...records);
        allResults.set(testId, existing);
      }
    }

    // If we got no results after N runs, that means the test runner failed
    if (allResults.size === 0) {
      throw new Error(
        `Test execution produced no results for ${file}. ` +
          `Ensure the test runner (${this.config.testRunner}) is properly configured ` +
          `and the test file contains valid tests.`
      );
    }

    // Record all executions for future reference
    for (const [testId, records] of allResults.entries()) {
      for (const record of records) {
        await this.recordExecution(testId, record);
      }
    }

    return allResults;
  }

  /**
   * Execute a single test file and parse the results
   */
  private async executeTestFile(
    file: string,
    runIndex: number
  ): Promise<Map<string, TestExecutionRecord[]>> {
    const results = new Map<string, TestExecutionRecord[]>();
    const runId = uuidv4();
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const args = [...this.config.testRunnerArgs, file];
      const cwd = this.config.cwd ?? process.cwd();

      const child = spawn(this.config.testRunner, args, {
        cwd,
        env: { ...process.env, ...this.config.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Set timeout
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(
          new Error(
            `Test execution timed out after ${this.config.runTimeout}ms for ${file}`
          )
        );
      }, this.config.runTimeout);

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Failed to execute test runner: ${error.message}. ` +
              `Ensure ${this.config.testRunner} is installed and accessible.`
          )
        );
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        const duration = Date.now() - startTime;

        try {
          // Parse the test results from stdout
          const parsedResults = this.parseTestOutput(
            stdout,
            stderr,
            code ?? 0,
            file,
            runId,
            runIndex,
            duration
          );

          // If parsing fails but we have an exit code, create a single result for the file
          if (parsedResults.size === 0) {
            const testId = this.generateTestId(file, 'main');
            results.set(testId, [
              {
                runId,
                passed: code === 0,
                duration,
                error: code !== 0 ? stderr || `Exit code: ${code}` : undefined,
                timestamp: new Date(),
                context: {
                  parallelRuns: 1,
                  workerIndex: runIndex,
                },
              },
            ]);
          } else {
            for (const [testId, records] of parsedResults.entries()) {
              results.set(testId, records);
            }
          }

          resolve(results);
        } catch (parseError) {
          // If we can't parse output but process completed, create result from exit code
          const testId = this.generateTestId(file, 'main');
          results.set(testId, [
            {
              runId,
              passed: code === 0,
              duration,
              error:
                code !== 0
                  ? stderr || `Exit code: ${code}, Parse error: ${parseError}`
                  : undefined,
              timestamp: new Date(),
              context: {
                parallelRuns: 1,
                workerIndex: runIndex,
              },
            },
          ]);
          resolve(results);
        }
      });
    });
  }

  /**
   * Parse test runner output to extract individual test results
   */
  private parseTestOutput(
    stdout: string,
    stderr: string,
    exitCode: number,
    file: string,
    runId: string,
    runIndex: number,
    totalDuration: number
  ): Map<string, TestExecutionRecord[]> {
    const results = new Map<string, TestExecutionRecord[]>();

    // Try to parse as JSON (vitest with --reporter=json)
    try {
      const jsonOutput = this.extractJson(stdout);
      if (jsonOutput) {
        const parsed = JSON.parse(jsonOutput);
        return this.parseVitestJson(parsed, file, runId, runIndex);
      }
    } catch (error) {
      // Non-critical: not valid JSON, try other formats
      console.debug('[FlakyDetector] Vitest JSON parse failed:', error instanceof Error ? error.message : error);
    }

    // Try to parse Jest JSON output
    try {
      const jsonOutput = this.extractJson(stdout);
      if (jsonOutput) {
        const parsed = JSON.parse(jsonOutput);
        if (parsed.testResults) {
          return this.parseJestJson(parsed, file, runId, runIndex);
        }
      }
    } catch (error) {
      // Non-critical: not Jest format
      console.debug('[FlakyDetector] Jest JSON parse failed:', error instanceof Error ? error.message : error);
    }

    // Try to parse TAP format
    if (stdout.includes('TAP version') || stdout.match(/^(ok|not ok)\s+\d+/m)) {
      return this.parseTapOutput(stdout, file, runId, runIndex);
    }

    // Try to parse Mocha-style output
    const mochaResults = this.parseMochaOutput(
      stdout,
      stderr,
      exitCode,
      file,
      runId,
      runIndex,
      totalDuration
    );
    if (mochaResults.size > 0) {
      return mochaResults;
    }

    // Fallback: create a single result based on exit code
    return results;
  }

  /**
   * Extract JSON from mixed output
   */
  private extractJson(output: string): string | null {
    // Try to find JSON object or array
    const jsonStart = output.indexOf('{');
    const jsonArrayStart = output.indexOf('[');
    const start =
      jsonStart === -1
        ? jsonArrayStart
        : jsonArrayStart === -1
          ? jsonStart
          : Math.min(jsonStart, jsonArrayStart);

    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < output.length; i++) {
      const char = output[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{' || char === '[') depth++;
      if (char === '}' || char === ']') depth--;

      if (depth === 0) {
        return output.substring(start, i + 1);
      }
    }

    return null;
  }

  /**
   * Parse Vitest JSON output
   */
  private parseVitestJson(
    json: VitestJsonOutput,
    file: string,
    runId: string,
    runIndex: number
  ): Map<string, TestExecutionRecord[]> {
    const results = new Map<string, TestExecutionRecord[]>();

    if (!json.testResults) return results;

    for (const suite of json.testResults) {
      for (const test of suite.assertionResults || []) {
        const testId = this.generateTestId(file, test.fullName || test.title);
        const record: TestExecutionRecord = {
          runId,
          passed: test.status === 'passed',
          duration: test.duration || 0,
          error:
            test.status === 'failed'
              ? test.failureMessages?.join('\n')
              : undefined,
          timestamp: new Date(),
          context: {
            parallelRuns: 1,
            workerIndex: runIndex,
          },
        };
        results.set(testId, [record]);
      }
    }

    return results;
  }

  /**
   * Parse Jest JSON output
   */
  private parseJestJson(
    json: JestJsonOutput,
    file: string,
    runId: string,
    runIndex: number
  ): Map<string, TestExecutionRecord[]> {
    const results = new Map<string, TestExecutionRecord[]>();

    for (const testResult of json.testResults || []) {
      for (const assertion of testResult.assertionResults || []) {
        const testId = this.generateTestId(
          file,
          assertion.fullName || assertion.title
        );
        const record: TestExecutionRecord = {
          runId,
          passed: assertion.status === 'passed',
          duration: assertion.duration || 0,
          error:
            assertion.status === 'failed'
              ? assertion.failureMessages?.join('\n')
              : undefined,
          timestamp: new Date(),
          context: {
            parallelRuns: 1,
            workerIndex: runIndex,
          },
        };
        results.set(testId, [record]);
      }
    }

    return results;
  }

  /**
   * Parse TAP output format
   */
  private parseTapOutput(
    output: string,
    file: string,
    runId: string,
    runIndex: number
  ): Map<string, TestExecutionRecord[]> {
    const results = new Map<string, TestExecutionRecord[]>();
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^(ok|not ok)\s+(\d+)\s*-?\s*(.*)/);
      if (match) {
        const [, status, , testName] = match;
        const testId = this.generateTestId(file, testName || `test-${match[2]}`);
        const record: TestExecutionRecord = {
          runId,
          passed: status === 'ok',
          duration: 0,
          error: status !== 'ok' ? `Test failed: ${testName}` : undefined,
          timestamp: new Date(),
          context: {
            parallelRuns: 1,
            workerIndex: runIndex,
          },
        };
        results.set(testId, [record]);
      }
    }

    return results;
  }

  /**
   * Parse Mocha-style console output
   */
  private parseMochaOutput(
    stdout: string,
    stderr: string,
    exitCode: number,
    file: string,
    runId: string,
    runIndex: number,
    duration: number
  ): Map<string, TestExecutionRecord[]> {
    const results = new Map<string, TestExecutionRecord[]>();

    // Look for passing/failing indicators
    const passMatch = stdout.match(/(\d+)\s+passing/);
    const failMatch = stdout.match(/(\d+)\s+failing/);

    if (passMatch || failMatch) {
      const passing = passMatch ? parseInt(passMatch[1], 10) : 0;
      const failing = failMatch ? parseInt(failMatch[1], 10) : 0;

      // Create aggregate results
      for (let i = 0; i < passing; i++) {
        const testId = this.generateTestId(file, `passing-${i + 1}`);
        results.set(testId, [
          {
            runId,
            passed: true,
            duration: duration / (passing + failing),
            timestamp: new Date(),
            context: { parallelRuns: 1, workerIndex: runIndex },
          },
        ]);
      }

      for (let i = 0; i < failing; i++) {
        const testId = this.generateTestId(file, `failing-${i + 1}`);
        results.set(testId, [
          {
            runId,
            passed: false,
            duration: duration / (passing + failing),
            error: stderr || 'Test failed',
            timestamp: new Date(),
            context: { parallelRuns: 1, workerIndex: runIndex },
          },
        ]);
      }
    }

    return results;
  }

  /**
   * Generate a deterministic test ID from file and test name
   */
  private generateTestId(file: string, testName: string): string {
    const sanitizedFile = file.replace(/[^a-zA-Z0-9]/g, '-');
    const sanitizedName = testName.replace(/[^a-zA-Z0-9]/g, '-');
    return `${sanitizedFile}::${sanitizedName}`;
  }

  /**
   * Get recorded execution history for tests in a file
   */
  private async getHistoryForFile(file: string): Promise<Map<string, TestExecutionRecord[]>> {
    const results = new Map<string, TestExecutionRecord[]>();

    // Check for any test IDs associated with this file in memory
    for (const [testId, history] of this.testHistory.entries()) {
      // Simple file association check (in real implementation, would use proper mapping)
      if (testId.includes(file.replace(/[^a-zA-Z0-9]/g, '-'))) {
        results.set(testId, history);
      }
    }

    return results;
  }

  /**
   * Simulate multiple test runs with random outcomes (for unit testing only)
   */
  private simulateMultipleRuns(runs: number): Map<string, TestExecutionRecord[]> {
    const results = new Map<string, TestExecutionRecord[]>();
    const testCount = this.config.simulatedTestsPerFile;
    const testIds = Array.from(
      { length: testCount },
      () => `test-${uuidv4().slice(0, 8)}`
    );

    for (const testId of testIds) {
      const records: TestExecutionRecord[] = [];

      // Determine if this test is flaky
      const isFlaky = Math.random() < this.config.simulatedFlakinessRate;

      for (let i = 0; i < runs; i++) {
        // If flaky, randomly pass/fail; otherwise always pass
        const passed = isFlaky
          ? Math.random() < this.config.simulatedFlakyPassRate
          : true;

        records.push({
          runId: uuidv4(),
          passed,
          duration: Math.random() * 1000 + 100,
          error: passed ? undefined : 'Assertion failed',
          timestamp: new Date(),
          context: { parallelRuns: runs },
        });
      }

      results.set(testId, records);
    }

    return results;
  }

  private identifyFlakyTests(
    results: Map<string, TestExecutionRecord[]>,
    threshold: number
  ): FlakyTest[] {
    const flakyTests: FlakyTest[] = [];

    for (const [testId, records] of results) {
      const failures = records.filter(r => !r.passed).length;
      const failureRate = failures / records.length;

      // Test is flaky if it has inconsistent results above threshold
      if (failureRate > 0 && failureRate < 1 && failureRate >= threshold) {
        const pattern = this.detectPattern(records);

        flakyTests.push({
          testId,
          testName: testId,
          file: 'unknown',
          failureRate,
          pattern,
          recommendation: this.getQuickRecommendation(pattern),
        });
      }
    }

    return flakyTests;
  }

  private detectPattern(records: TestExecutionRecord[]): FlakyTest['pattern'] {
    // Analyze records to determine the flakiness pattern

    // Check for timing issues
    const failedRecords = records.filter(r => !r.passed);
    const passedRecords = records.filter(r => r.passed);

    if (failedRecords.length > 0 && passedRecords.length > 0) {
      const avgFailedDuration = this.average(failedRecords.map(r => r.duration));
      const avgPassedDuration = this.average(passedRecords.map(r => r.duration));

      if (Math.abs(avgFailedDuration - avgPassedDuration) / avgPassedDuration > 0.5) {
        return 'timing';
      }
    }

    // Check for async issues (errors mentioning timeout, promise, async)
    const asyncKeywords = ['timeout', 'promise', 'async', 'await', 'callback'];
    const hasAsyncErrors = failedRecords.some(r =>
      r.error && asyncKeywords.some(k => r.error!.toLowerCase().includes(k))
    );
    if (hasAsyncErrors) {
      return 'async';
    }

    // Check for resource issues
    const resourceKeywords = ['connection', 'database', 'network', 'port', 'file'];
    const hasResourceErrors = failedRecords.some(r =>
      r.error && resourceKeywords.some(k => r.error!.toLowerCase().includes(k))
    );
    if (hasResourceErrors) {
      return 'resource';
    }

    // Check for ordering issues (failures correlate with preceding tests)
    const hasOrderingPattern = failedRecords.some(r =>
      r.context?.precedingTests && r.context.precedingTests.length > 0
    );
    if (hasOrderingPattern) {
      return 'ordering';
    }

    return 'unknown';
  }

  private getQuickRecommendation(pattern: FlakyTest['pattern']): string {
    switch (pattern) {
      case 'timing':
        return 'Increase timeouts or use explicit waits instead of fixed delays';
      case 'ordering':
        return 'Ensure test isolation and independent setup/teardown';
      case 'resource':
        return 'Mock external dependencies or use connection pooling';
      case 'async':
        return 'Properly await async operations and handle promise rejections';
      case 'unknown':
        return 'Review test for potential race conditions or external dependencies';
    }
  }

  private async getTestHistory(testId: string): Promise<TestExecutionRecord[]> {
    // Check in-memory first
    const cached = this.testHistory.get(testId);
    if (cached && cached.length > 0) {
      return cached;
    }

    // Load from storage
    const stored = await this.memory.get<TestExecutionRecord[]>(`test-history:${testId}`);
    if (stored) {
      this.testHistory.set(testId, stored);
      return stored;
    }

    return [];
  }

  private performPatternAnalysis(
    testId: string,
    history: TestExecutionRecord[]
  ): FlakyAnalysis {
    const pattern = this.detectPattern(history);
    const factors = this.identifyFactors(history, pattern);
    const correlations = this.calculateCorrelations(history);
    const confidence = this.calculateConfidence(history, pattern);

    return {
      testId,
      pattern,
      confidence,
      factors,
      correlations,
    };
  }

  private identifyFactors(
    history: TestExecutionRecord[],
    pattern: FlakyTest['pattern']
  ): string[] {
    const factors: string[] = [];

    switch (pattern) {
      case 'timing':
        factors.push('Variable execution duration');
        factors.push('Possible race conditions');
        if (this.hasDurationSpikes(history)) {
          factors.push('Duration spikes before failures');
        }
        break;

      case 'async':
        factors.push('Unhandled async operations');
        factors.push('Missing await statements');
        break;

      case 'resource':
        factors.push('External dependency instability');
        factors.push('Shared resource contention');
        break;

      case 'ordering':
        factors.push('Shared state between tests');
        factors.push('Incomplete cleanup');
        break;

      case 'unknown':
        factors.push('No clear pattern identified');
        factors.push('Manual investigation recommended');
        break;
    }

    return factors;
  }

  private calculateCorrelations(history: TestExecutionRecord[]): CorrelationFactor[] {
    const correlations: CorrelationFactor[] = [];

    // Duration correlation
    const durationCorr = this.correlateWithFailure(
      history,
      r => r.duration
    );
    if (Math.abs(durationCorr) > 0.3) {
      correlations.push({
        factor: 'duration',
        correlation: durationCorr,
        description: durationCorr > 0
          ? 'Failures correlate with longer duration'
          : 'Failures correlate with shorter duration',
      });
    }

    // Time of day correlation
    const hourCorr = this.correlateWithFailure(
      history,
      r => new Date(r.timestamp).getHours()
    );
    if (Math.abs(hourCorr) > 0.3) {
      correlations.push({
        factor: 'time_of_day',
        correlation: hourCorr,
        description: 'Failures correlate with specific times',
      });
    }

    // Parallel execution correlation
    const parallelCorr = this.correlateWithFailure(
      history,
      r => r.context?.parallelRuns ?? 1
    );
    if (Math.abs(parallelCorr) > 0.3) {
      correlations.push({
        factor: 'parallelism',
        correlation: parallelCorr,
        description: 'Failures correlate with parallel execution',
      });
    }

    return correlations;
  }

  private correlateWithFailure(
    history: TestExecutionRecord[],
    getValue: (r: TestExecutionRecord) => number
  ): number {
    if (history.length < 2) return 0;

    const values = history.map(getValue);
    const failures = history.map(r => r.passed ? 0 : 1);

    return this.pearsonCorrelation(values, failures);
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
    const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);
    const sumY2 = y.reduce((a, yi) => a + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateConfidence(
    history: TestExecutionRecord[],
    pattern: FlakyTest['pattern']
  ): number {
    // Base confidence on sample size
    const sampleConfidence = Math.min(1, history.length / 20);

    // Pattern-specific confidence
    let patternConfidence = 0.5;
    if (pattern !== 'unknown') {
      patternConfidence = 0.8;
    }

    // Consistency of pattern
    const failureRate = history.filter(h => !h.passed).length / history.length;
    const consistencyFactor = Math.min(failureRate, 1 - failureRate) * 2;

    return sampleConfidence * 0.4 + patternConfidence * 0.4 + consistencyFactor * 0.2;
  }

  private generateRecommendations(analysis: FlakyAnalysis): Recommendation[] {
    const recommendations: Recommendation[] = [];

    switch (analysis.pattern) {
      case 'timing':
        recommendations.push({
          action: 'Use explicit waits',
          description: 'Replace fixed delays with condition-based waits',
          codeSnippet: `await waitFor(() => expect(element).toBeVisible());`,
          effort: 'low',
        });
        recommendations.push({
          action: 'Increase timeout margins',
          description: 'Add buffer time for slow environments',
          codeSnippet: `jest.setTimeout(10000);`,
          effort: 'low',
        });
        break;

      case 'async':
        recommendations.push({
          action: 'Ensure proper async handling',
          description: 'Await all promises and use async/await consistently',
          codeSnippet: `const result = await asyncOperation();\nexpect(result).toBeDefined();`,
          effort: 'medium',
        });
        recommendations.push({
          action: 'Add error boundaries',
          description: 'Catch and handle promise rejections',
          codeSnippet: `try {\n  await operation();\n} catch (e) {\n  console.error('Operation failed:', e);\n  throw e;\n}`,
          effort: 'medium',
        });
        break;

      case 'resource':
        recommendations.push({
          action: 'Mock external dependencies',
          description: 'Use mocks for external services in unit tests',
          codeSnippet: `jest.mock('./externalService');`,
          effort: 'medium',
        });
        recommendations.push({
          action: 'Implement retry logic',
          description: 'Add retries for transient failures',
          codeSnippet: `const result = await retry(() => fetchData(), { retries: 3 });`,
          effort: 'low',
        });
        break;

      case 'ordering':
        recommendations.push({
          action: 'Isolate test state',
          description: 'Reset shared state in beforeEach/afterEach',
          codeSnippet: `beforeEach(() => {\n  resetDatabase();\n  clearCache();\n});`,
          effort: 'medium',
        });
        recommendations.push({
          action: 'Remove inter-test dependencies',
          description: 'Each test should set up its own required state',
          effort: 'high',
        });
        break;

      case 'unknown':
        recommendations.push({
          action: 'Add detailed logging',
          description: 'Log test state at key points to identify patterns',
          effort: 'low',
        });
        recommendations.push({
          action: 'Run in isolation',
          description: 'Execute test alone to determine if it is a test interaction issue',
          effort: 'low',
        });
        break;
    }

    return recommendations;
  }

  private determinePriority(analysis: FlakyAnalysis): 'high' | 'medium' | 'low' {
    if (analysis.confidence > 0.8 && analysis.pattern !== 'unknown') {
      return 'high';
    }
    if (analysis.confidence > 0.5) {
      return 'medium';
    }
    return 'low';
  }

  private hasDurationSpikes(history: TestExecutionRecord[]): boolean {
    const durations = history.map(r => r.duration);
    const avg = this.average(durations);
    const stdDev = this.standardDeviation(durations);

    return durations.some(d => d > avg + 2 * stdDev);
  }

  private average(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  }

  private standardDeviation(values: number[]): number {
    const avg = this.average(values);
    const squareDiffs = values.map(v => (v - avg) ** 2);
    return Math.sqrt(this.average(squareDiffs));
  }

  private async storeReport(report: FlakyTestReport): Promise<void> {
    const reportId = uuidv4();
    await this.memory.set(`flaky-report:${reportId}`, report, {
      namespace: 'test-execution',
      persist: true,
    });
  }
}
