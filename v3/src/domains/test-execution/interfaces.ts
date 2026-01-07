/**
 * Agentic QE v3 - Test Execution Domain Interface
 * Parallel test execution with intelligent retry
 */

import { Result } from '../../shared/types';

// ============================================================================
// Domain API
// ============================================================================

export interface TestExecutionAPI {
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
}

// ============================================================================
// Request/Response Types
// ============================================================================

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
