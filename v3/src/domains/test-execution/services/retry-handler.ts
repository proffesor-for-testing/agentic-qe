/**
 * Agentic QE v3 - Retry Handler Service
 * Implements intelligent retry logic for failed tests
 */

import { Result, ok, err } from '../../../shared/types';
import { RetryResult, FailedTest } from '../interfaces';
import { MemoryBackend } from '../../../kernel/interfaces';

// ============================================================================
// Interfaces
// ============================================================================

export interface IRetryHandler {
  /** Determine if a test should be retried */
  shouldRetry(testId: string, attempt: number, error: string): Promise<boolean>;

  /** Execute a test with retry logic */
  executeWithRetry(request: RetryExecutionRequest): Promise<Result<RetryResult, Error>>;

  /** Get retry statistics */
  getRetryStats(runId?: string): Promise<Result<RetryStatistics, Error>>;

  /** Configure retry policy for a test */
  setRetryPolicy(testId: string, policy: RetryPolicy): Promise<void>;

  /** Get retry policy for a test */
  getRetryPolicy(testId: string): Promise<RetryPolicy>;
}

export interface RetryExecutionRequest {
  runId: string;
  failedTests: FailedTest[];
  maxRetries: number;
  backoff: 'linear' | 'exponential' | 'constant';
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (testId: string, attempt: number) => void;
}

export interface RetryStatistics {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttemptsToPass: number;
  retryRate: number;
  testStats: Map<string, TestRetryStats>;
}

export interface TestRetryStats {
  testId: string;
  attempts: number;
  lastResult: 'passed' | 'failed';
  errorPatterns: string[];
}

export interface RetryPolicy {
  maxRetries: number;
  backoff: 'linear' | 'exponential' | 'constant';
  baseDelay: number;
  maxDelay: number;
  retryOn: RetryCondition[];
  noRetryOn: RetryCondition[];
}

export type RetryCondition =
  | { type: 'error_pattern'; pattern: string }
  | { type: 'exit_code'; code: number }
  | { type: 'flakiness_score'; threshold: number }
  | { type: 'custom'; predicate: string };

// ============================================================================
// Retry Handler Service
// ============================================================================

export class RetryHandlerService implements IRetryHandler {
  private readonly retryHistory = new Map<string, RetryRecord[]>();
  private readonly retryPolicies = new Map<string, RetryPolicy>();
  private readonly runStats = new Map<string, RunRetryStats>();

  private readonly defaultPolicy: RetryPolicy = {
    maxRetries: 3,
    backoff: 'exponential',
    baseDelay: 1000,
    maxDelay: 30000,
    retryOn: [],
    noRetryOn: [
      { type: 'error_pattern', pattern: 'SyntaxError' },
      { type: 'error_pattern', pattern: 'TypeError' },
    ],
  };

  constructor(private readonly memory: MemoryBackend) {}

  /**
   * Determine if a test should be retried based on policy and history
   */
  async shouldRetry(testId: string, attempt: number, error: string): Promise<boolean> {
    const policy = await this.getRetryPolicy(testId);

    // Check max retries
    if (attempt >= policy.maxRetries) {
      return false;
    }

    // Check noRetryOn conditions
    for (const condition of policy.noRetryOn) {
      if (this.matchesCondition(condition, error)) {
        return false;
      }
    }

    // Check retryOn conditions (if specified, at least one must match)
    if (policy.retryOn.length > 0) {
      const shouldRetry = policy.retryOn.some(condition =>
        this.matchesCondition(condition, error)
      );
      return shouldRetry;
    }

    // Default: retry for any error not in noRetryOn
    return true;
  }

  /**
   * Execute failed tests with retry logic
   */
  async executeWithRetry(request: RetryExecutionRequest): Promise<Result<RetryResult, Error>> {
    const {
      runId,
      failedTests,
      maxRetries,
      backoff,
      baseDelay = 1000,
      maxDelay = 30000,
      onRetry,
    } = request;

    try {
      const stats: RunRetryStats = {
        runId,
        totalRetries: 0,
        successful: 0,
        failed: 0,
        flakyDetected: [],
        startTime: Date.now(),
      };

      const nowPassing: string[] = [];
      const stillFailing: string[] = [];
      const flakyDetected: string[] = [];

      for (const test of failedTests) {
        const result = await this.retryTest(
          test,
          maxRetries,
          backoff,
          baseDelay,
          maxDelay,
          onRetry
        );

        stats.totalRetries += result.attempts;

        if (result.passed) {
          nowPassing.push(test.testId);
          stats.successful++;

          // If it passed on retry, it's likely flaky
          if (result.attempts > 0) {
            flakyDetected.push(test.testId);
          }
        } else {
          stillFailing.push(test.testId);
          stats.failed++;
        }

        // Record retry history
        await this.recordRetry(test.testId, result);
      }

      stats.flakyDetected = flakyDetected;
      stats.endTime = Date.now();
      this.runStats.set(runId, stats);

      // Persist stats
      await this.memory.set(`retry-stats:${runId}`, stats, {
        namespace: 'test-execution',
        persist: true,
      });

      const retryResult: RetryResult = {
        originalFailed: failedTests.length,
        retried: stats.totalRetries,
        nowPassing: nowPassing.length,
        stillFailing: stillFailing.length,
        flakyDetected,
      };

      return ok(retryResult);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get retry statistics for a run or overall
   */
  async getRetryStats(runId?: string): Promise<Result<RetryStatistics, Error>> {
    try {
      if (runId) {
        const stats = this.runStats.get(runId);
        if (!stats) {
          const stored = await this.memory.get<RunRetryStats>(`retry-stats:${runId}`);
          if (!stored) {
            return err(new Error(`No retry stats found for run: ${runId}`));
          }
          return ok(this.convertToRetryStatistics([stored]));
        }
        return ok(this.convertToRetryStatistics([stats]));
      }

      // Aggregate all stats
      const allStats = Array.from(this.runStats.values());
      return ok(this.convertToRetryStatistics(allStats));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Set retry policy for a specific test
   */
  async setRetryPolicy(testId: string, policy: RetryPolicy): Promise<void> {
    this.retryPolicies.set(testId, policy);
    await this.memory.set(`retry-policy:${testId}`, policy, {
      namespace: 'test-execution',
      persist: true,
    });
  }

  /**
   * Get retry policy for a test (or default)
   */
  async getRetryPolicy(testId: string): Promise<RetryPolicy> {
    // Check cache
    const cached = this.retryPolicies.get(testId);
    if (cached) {
      return cached;
    }

    // Check storage
    const stored = await this.memory.get<RetryPolicy>(`retry-policy:${testId}`);
    if (stored) {
      this.retryPolicies.set(testId, stored);
      return stored;
    }

    // Return default
    return this.defaultPolicy;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private matchesCondition(condition: RetryCondition, error: string): boolean {
    switch (condition.type) {
      case 'error_pattern':
        return error.includes(condition.pattern) ||
          new RegExp(condition.pattern, 'i').test(error);

      case 'exit_code':
        // Would need to parse exit code from error message
        return error.includes(`exit code ${condition.code}`);

      case 'flakiness_score':
        // Would need to check flakiness score from detector
        return false;

      case 'custom':
        // Custom predicates would need to be evaluated
        return false;

      default:
        return false;
    }
  }

  private async retryTest(
    test: FailedTest,
    maxRetries: number,
    backoff: 'linear' | 'exponential' | 'constant',
    baseDelay: number,
    maxDelay: number,
    onRetry?: (testId: string, attempt: number) => void
  ): Promise<RetryTestResult> {
    let attempts = 0;
    let lastError = test.error;

    while (attempts < maxRetries) {
      // Check if should retry
      const shouldRetry = await this.shouldRetry(test.testId, attempts, lastError);
      if (!shouldRetry) {
        break;
      }

      // Calculate delay
      const delay = this.calculateDelay(attempts, backoff, baseDelay, maxDelay);
      await this.sleep(delay);

      // Notify retry
      if (onRetry) {
        onRetry(test.testId, attempts + 1);
      }

      attempts++;

      // Execute test (simulated - in real implementation, would run actual test)
      const result = await this.executeTest(test);

      if (result.passed) {
        return {
          testId: test.testId,
          passed: true,
          attempts,
          finalError: undefined,
        };
      }

      lastError = result.error ?? lastError;
    }

    return {
      testId: test.testId,
      passed: false,
      attempts,
      finalError: lastError,
    };
  }

  private async executeTest(test: FailedTest): Promise<{ passed: boolean; error?: string }> {
    // In a real implementation, this would execute the actual test
    // For now, simulate with some probability of success on retry
    const passOnRetry = Math.random() > 0.3;

    return {
      passed: passOnRetry,
      error: passOnRetry ? undefined : test.error,
    };
  }

  private calculateDelay(
    attempt: number,
    backoff: 'linear' | 'exponential' | 'constant',
    baseDelay: number,
    maxDelay: number
  ): number {
    let delay: number;

    switch (backoff) {
      case 'constant':
        delay = baseDelay;
        break;

      case 'linear':
        delay = baseDelay * (attempt + 1);
        break;

      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt);
        break;

      default:
        delay = baseDelay;
    }

    // Add some jitter (0-10% random variation)
    const jitter = delay * 0.1 * Math.random();
    delay += jitter;

    return Math.min(delay, maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async recordRetry(testId: string, result: RetryTestResult): Promise<void> {
    const history = this.retryHistory.get(testId) ?? [];

    history.push({
      testId: result.testId,
      attempts: result.attempts,
      passed: result.passed,
      error: result.finalError,
      timestamp: new Date(),
    });

    // Keep last 50 entries
    if (history.length > 50) {
      history.shift();
    }

    this.retryHistory.set(testId, history);

    await this.memory.set(`retry-history:${testId}`, history, {
      namespace: 'test-execution',
      persist: true,
    });
  }

  private convertToRetryStatistics(stats: RunRetryStats[]): RetryStatistics {
    const testStatsMap = new Map<string, TestRetryStats>();

    let totalRetries = 0;
    let successfulRetries = 0;
    let failedRetries = 0;
    let totalAttempts = 0;
    let passedCount = 0;

    for (const stat of stats) {
      totalRetries += stat.totalRetries;
      successfulRetries += stat.successful;
      failedRetries += stat.failed;
      totalAttempts += stat.totalRetries;

      if (stat.successful > 0) {
        passedCount += stat.successful;
      }
    }

    // Calculate retry rate (retries per test)
    const totalTests = successfulRetries + failedRetries;
    const retryRate = totalTests > 0 ? totalRetries / totalTests : 0;

    // Average attempts to pass (for tests that eventually passed)
    const averageAttemptsToPass = passedCount > 0 ? totalAttempts / passedCount : 0;

    return {
      totalRetries,
      successfulRetries,
      failedRetries,
      averageAttemptsToPass,
      retryRate,
      testStats: testStatsMap,
    };
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface RetryRecord {
  testId: string;
  attempts: number;
  passed: boolean;
  error?: string;
  timestamp: Date;
}

interface RetryTestResult {
  testId: string;
  passed: boolean;
  attempts: number;
  finalError?: string;
}

interface RunRetryStats {
  runId: string;
  totalRetries: number;
  successful: number;
  failed: number;
  flakyDetected: string[];
  startTime: number;
  endTime?: number;
}
