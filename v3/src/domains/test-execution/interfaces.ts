/**
 * Agentic QE v3 - Test Execution Domain Interface
 * Parallel test execution with intelligent retry
 */

import { Result } from '../../shared/types';
import type {
  E2ETestCase,
  E2ETestSuite,
  E2ETestResult,
  E2ETestSuiteResult,
} from './types';
import type { ExecutionStrategy } from './services/e2e-runner';

// ============================================================================
// Domain API
// ============================================================================

export interface TestExecutionAPI {
  /**
   * Simple test execution - convenience method for CLI
   * Auto-detects framework and uses sensible defaults
   */
  runTests(request: SimpleTestRequest): Promise<Result<TestRunResult, Error>>;

  /** Execute test suite */
  execute(request: ExecuteTestsRequest): Promise<Result<TestRunResult, Error>>;

  /** Execute tests in parallel */
  executeParallel(request: ParallelExecutionRequest): Promise<Result<TestRunResult, Error>>;

  /** Detect flaky tests */
  detectFlaky(request: FlakyDetectionRequest): Promise<Result<FlakyTestReport, Error>>;

  /** Retry failed tests */
  retry(request: RetryRequest): Promise<Result<RetryResult, Error>>;

  /** Get execution statistics */
  getStats(runId: string): Promise<Result<ExecutionStats, Error>>;

  /** Execute E2E test case */
  executeE2ETestCase?(testCase: E2ETestCase): Promise<Result<E2ETestResult, Error>>;

  /** Execute E2E test suite */
  executeE2ETestSuite?(suite: E2ETestSuite, strategy?: ExecutionStrategy): Promise<Result<E2ETestSuiteResult, Error>>;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Simple test request for CLI convenience method
 * Auto-detects framework and uses sensible defaults
 */
export interface SimpleTestRequest {
  /** Test files to execute */
  testFiles: string[];
  /** Run tests in parallel (default: true) */
  parallel?: boolean;
  /** Number of retry attempts for failed tests (default: 0) */
  retryCount?: number;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Number of parallel workers (default: auto based on file count) */
  workers?: number;
}

export interface ExecuteTestsRequest {
  testFiles: string[];
  framework: string;
  timeout?: number;
  env?: Record<string, string>;
  reporters?: string[];
}

export interface ParallelExecutionRequest extends ExecuteTestsRequest {
  workers: number;
  sharding?: 'file' | 'test' | 'time-balanced';
  isolation?: 'process' | 'worker' | 'none';
}

export interface TestRunResult {
  runId: string;
  status: 'passed' | 'failed' | 'error';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failedTests: FailedTest[];
  coverage?: CoverageData;
}

export interface FailedTest {
  testId: string;
  testName: string;
  file: string;
  error: string;
  stack?: string;
  duration: number;
}

export interface CoverageData {
  line: number;
  branch: number;
  function: number;
  statement: number;
}

export interface FlakyDetectionRequest {
  testFiles: string[];
  runs: number;
  threshold: number;
}

export interface FlakyTestReport {
  flakyTests: FlakyTest[];
  totalRuns: number;
  analysisTime: number;
}

export interface FlakyTest {
  testId: string;
  testName: string;
  file: string;
  failureRate: number;
  pattern: 'timing' | 'ordering' | 'resource' | 'async' | 'unknown';
  recommendation: string;
}

export interface RetryRequest {
  runId: string;
  failedTests: string[];
  maxRetries: number;
  backoff?: 'linear' | 'exponential';
}

export interface RetryResult {
  originalFailed: number;
  retried: number;
  nowPassing: number;
  stillFailing: number;
  flakyDetected: string[];
}

export interface ExecutionStats {
  runId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  testsPerSecond: number;
  workers: number;
  memoryUsage: number;
}
