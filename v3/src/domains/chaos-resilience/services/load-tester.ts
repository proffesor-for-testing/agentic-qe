/**
 * Agentic QE v3 - Load Testing Service
 * Implements ILoadTestingService for performance and stress testing
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  LoadTest,
  LoadTestType,
  LoadTestResult,
  TimelinePoint,
  LoadTestError,
  AssertionResult,
  LoadAssertion,
  TrafficSample,
  LoadProfile,
  LoadScenario,
  ILoadTestingService,
} from '../interfaces';

/**
 * Configuration for the load tester service
 */
export interface LoadTesterConfig {
  defaultTimeout: number;
  maxVirtualUsers: number;
  reportingInterval: number;
  enableDetailedMetrics: boolean;
  connectionPoolSize: number;
}

const DEFAULT_CONFIG: LoadTesterConfig = {
  defaultTimeout: 300000, // 5 minutes
  maxVirtualUsers: 1000,
  reportingInterval: 1000, // 1 second
  enableDetailedMetrics: true,
  connectionPoolSize: 100,
};

/**
 * Mutable versions for internal tracking
 */
interface MutableLoadTestSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsPerSecond: number;
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  maxResponseTime: number;
  errorRate: number;
}

interface MutableLoadTestResult {
  testId: string;
  status: 'completed' | 'failed' | 'aborted';
  duration: number;
  summary: MutableLoadTestSummary;
  timeline: TimelinePoint[];
  errors: LoadTestError[];
  assertionResults: AssertionResult[];
}

interface MutableLoadTestError {
  type: string;
  message: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
}

/**
 * Load Testing Service Implementation
 * Manages load tests, stress tests, and performance benchmarking
 */
export class LoadTesterService implements ILoadTestingService {
  private readonly config: LoadTesterConfig;
  private readonly activeTests: Map<string, LoadTestExecution> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<LoadTesterConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new load test
   */
  async createTest(test: LoadTest): Promise<Result<string>> {
    try {
      // Validate test configuration
      const validationResult = this.validateTest(test);
      if (!validationResult.success) {
        return err(validationResult.error);
      }

      // Store test configuration
      await this.memory.set(
        `loadtest:tests:${test.id}`,
        test,
        { namespace: 'chaos-resilience', persist: true }
      );

      return ok(test.id);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Run a load test
   */
  async runTest(testId: string): Promise<Result<LoadTestResult>> {
    try {
      // Load test configuration
      const test = await this.memory.get<LoadTest>(`loadtest:tests:${testId}`);
      if (!test) {
        return err(new Error(`Load test not found: ${testId}`));
      }

      // Check if test is already running
      if (this.activeTests.has(testId)) {
        return err(new Error(`Load test ${testId} is already running`));
      }

      // Check virtual user limit
      if (test.profile.virtualUsers.max > this.config.maxVirtualUsers) {
        return err(
          new Error(
            `Virtual users (${test.profile.virtualUsers.max}) exceeds maximum (${this.config.maxVirtualUsers})`
          )
        );
      }

      // Create test execution
      const execution = this.createExecution(test);
      this.activeTests.set(testId, execution);

      try {
        // Execute the load test based on type
        await this.executeLoadTest(execution, test);

        // Evaluate assertions
        execution.result.assertionResults = this.evaluateAssertions(
          test.assertions,
          execution.result.summary
        );

        // Determine final status
        execution.result.status = this.determineTestStatus(execution.result);

        return ok(this.finalizeExecution(execution));
      } catch (error) {
        execution.result.status = 'failed';
        execution.result.errors.push({
          type: 'execution_error',
          message: error instanceof Error ? error.message : String(error),
          count: 1,
          firstOccurrence: new Date(),
          lastOccurrence: new Date(),
        });
        return ok(this.finalizeExecution(execution));
      } finally {
        this.activeTests.delete(testId);
      }
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Stop a running test
   */
  async stopTest(testId: string): Promise<Result<LoadTestResult>> {
    try {
      const execution = this.activeTests.get(testId);
      if (!execution) {
        return err(new Error(`No active load test found: ${testId}`));
      }

      execution.aborted = true;
      execution.result.status = 'aborted';

      return ok(this.finalizeExecution(execution));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get real-time metrics for a running test
   */
  async getRealtimeMetrics(testId: string): Promise<Result<TimelinePoint>> {
    try {
      const execution = this.activeTests.get(testId);
      if (!execution) {
        return err(new Error(`No active load test found: ${testId}`));
      }

      const latestPoint = execution.result.timeline[execution.result.timeline.length - 1];
      if (!latestPoint) {
        return err(new Error('No metrics available yet'));
      }

      return ok(latestPoint);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate a load test from traffic sample
   */
  async generateFromTraffic(
    trafficSample: TrafficSample,
    multiplier: number
  ): Promise<Result<LoadTest>> {
    try {
      if (trafficSample.requests.length === 0) {
        return err(new Error('Traffic sample contains no requests'));
      }

      if (multiplier <= 0) {
        return err(new Error('Multiplier must be positive'));
      }

      // Analyze traffic patterns
      const totalFrequency = trafficSample.requests.reduce((sum, r) => sum + r.frequency, 0);
      const avgResponseTime =
        trafficSample.requests.reduce((sum, r) => sum + r.avgResponseTime * r.frequency, 0) /
        totalFrequency;

      // Generate scenarios from traffic
      const scenarios: LoadScenario[] = trafficSample.requests.map((request) => ({
        name: `${request.method} ${request.url}`,
        weight: request.frequency / totalFrequency,
        steps: [
          {
            type: 'request' as const,
            target: {
              url: request.url,
              method: request.method,
            },
          },
          {
            type: 'think' as const,
            duration: Math.max(100, avgResponseTime * 0.5), // Think time based on response time
          },
        ],
      }));

      // Calculate virtual users based on traffic volume and multiplier
      const rps = totalFrequency / trafficSample.duration;
      const targetRps = rps * multiplier;
      const estimatedVirtualUsers = Math.ceil(targetRps * (avgResponseTime / 1000));

      const profile: LoadProfile = {
        virtualUsers: {
          start: Math.ceil(estimatedVirtualUsers * 0.1),
          max: Math.min(estimatedVirtualUsers, this.config.maxVirtualUsers),
          pattern: 'ramp',
        },
        duration: Math.max(60000, trafficSample.duration * multiplier), // At least 1 minute
        rampUp: 30000, // 30 second ramp up
        rampDown: 15000, // 15 second ramp down
      };

      // Generate assertions based on baseline performance
      const assertions: LoadAssertion[] = [
        {
          metric: 'p95',
          operator: 'lt',
          value: avgResponseTime * 2, // P95 should be within 2x baseline
        },
        {
          metric: 'error-rate',
          operator: 'lt',
          value: 5, // Less than 5% error rate
        },
        {
          metric: 'throughput',
          operator: 'gte',
          value: targetRps * 0.9, // At least 90% of target throughput
        },
      ];

      const loadTestType: LoadTestType = multiplier > 5 ? 'stress' : 'load';

      const loadTest: LoadTest = {
        id: uuidv4(),
        name: `Generated from ${trafficSample.source} (${multiplier}x)`,
        type: loadTestType,
        target: {
          url: trafficSample.requests[0].url,
          method: trafficSample.requests[0].method,
        },
        profile,
        scenarios,
        assertions,
      };

      return ok(loadTest);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private validateTest(test: LoadTest): Result<void> {
    if (!test.id) {
      return err(new Error('Test ID is required'));
    }

    if (!test.name) {
      return err(new Error('Test name is required'));
    }

    if (!test.target || !test.target.url) {
      return err(new Error('Test target URL is required'));
    }

    if (!test.profile) {
      return err(new Error('Test profile is required'));
    }

    if (test.profile.virtualUsers.max <= 0) {
      return err(new Error('Maximum virtual users must be positive'));
    }

    if (test.profile.duration <= 0) {
      return err(new Error('Test duration must be positive'));
    }

    return ok(undefined);
  }

  private createExecution(test: LoadTest): LoadTestExecution {
    return {
      testId: test.id,
      startTime: new Date(),
      aborted: false,
      result: {
        testId: test.id,
        status: 'completed',
        duration: 0,
        summary: this.createEmptySummary(),
        timeline: [],
        errors: [],
        assertionResults: [],
      },
    };
  }

  private createEmptySummary(): MutableLoadTestSummary {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      requestsPerSecond: 0,
      avgResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      maxResponseTime: 0,
      errorRate: 0,
    };
  }

  private async executeLoadTest(
    execution: LoadTestExecution,
    test: LoadTest
  ): Promise<void> {
    const startTime = Date.now();
    const duration = test.profile.duration;
    const responseTimes: number[] = [];
    const errorMap: Map<string, MutableLoadTestError> = new Map();

    // Determine test execution strategy based on type
    const strategy = this.getExecutionStrategy(test.type);

    // Main execution loop
    while (Date.now() - startTime < duration && !execution.aborted) {
      const elapsedTime = Date.now() - startTime;
      const currentVUs = this.calculateCurrentVirtualUsers(test.profile, elapsedTime, duration);

      // Simulate requests based on current VUs
      const batchResults = await this.executeBatch(test, currentVUs, strategy);

      // Collect metrics
      responseTimes.push(...batchResults.responseTimes);

      // Track errors
      for (const error of batchResults.errors) {
        const existing = errorMap.get(error);
        if (existing) {
          existing.count++;
          existing.lastOccurrence = new Date();
        } else {
          errorMap.set(error, {
            type: 'request_error',
            message: error,
            count: 1,
            firstOccurrence: new Date(),
            lastOccurrence: new Date(),
          });
        }
      }

      // Update summary
      execution.result.summary.totalRequests += batchResults.totalRequests;
      execution.result.summary.successfulRequests += batchResults.successfulRequests;
      execution.result.summary.failedRequests += batchResults.failedRequests;

      // Record timeline point
      const timelinePoint: TimelinePoint = {
        timestamp: new Date(),
        virtualUsers: currentVUs,
        requestsPerSecond: batchResults.totalRequests,
        avgResponseTime:
          batchResults.responseTimes.length > 0
            ? batchResults.responseTimes.reduce((a, b) => a + b, 0) /
              batchResults.responseTimes.length
            : 0,
        errorRate:
          batchResults.totalRequests > 0
            ? (batchResults.failedRequests / batchResults.totalRequests) * 100
            : 0,
      };
      execution.result.timeline.push(timelinePoint);

      // Wait for reporting interval
      await this.sleep(this.config.reportingInterval);
    }

    // Calculate final metrics
    execution.result.duration = Date.now() - startTime;
    execution.result.errors = Array.from(errorMap.values());

    if (responseTimes.length > 0) {
      const sorted = responseTimes.sort((a, b) => a - b);
      execution.result.summary.avgResponseTime =
        sorted.reduce((a, b) => a + b, 0) / sorted.length;
      execution.result.summary.p50ResponseTime = this.percentile(sorted, 50);
      execution.result.summary.p95ResponseTime = this.percentile(sorted, 95);
      execution.result.summary.p99ResponseTime = this.percentile(sorted, 99);
      execution.result.summary.maxResponseTime = sorted[sorted.length - 1];
    }

    execution.result.summary.requestsPerSecond =
      execution.result.summary.totalRequests / (execution.result.duration / 1000);
    execution.result.summary.errorRate =
      execution.result.summary.totalRequests > 0
        ? (execution.result.summary.failedRequests / execution.result.summary.totalRequests) * 100
        : 0;
  }

  private getExecutionStrategy(type: LoadTestType): ExecutionStrategy {
    switch (type) {
      case 'load':
        return { requestMultiplier: 1.0, errorInjectionRate: 0 };
      case 'stress':
        return { requestMultiplier: 1.5, errorInjectionRate: 0.01 };
      case 'spike':
        return { requestMultiplier: 3.0, errorInjectionRate: 0.02 };
      case 'soak':
        return { requestMultiplier: 0.8, errorInjectionRate: 0 };
      case 'breakpoint':
        return { requestMultiplier: 2.0, errorInjectionRate: 0.05 };
      default:
        return { requestMultiplier: 1.0, errorInjectionRate: 0 };
    }
  }

  private calculateCurrentVirtualUsers(
    profile: LoadProfile,
    elapsedTime: number,
    duration: number
  ): number {
    const { virtualUsers, rampUp = 0, rampDown = 0 } = profile;
    const { start, max, pattern } = virtualUsers;

    switch (pattern) {
      case 'constant':
        return max;

      case 'ramp':
        if (elapsedTime < rampUp) {
          // Ramp up phase
          return Math.round(start + (max - start) * (elapsedTime / rampUp));
        } else if (elapsedTime > duration - rampDown) {
          // Ramp down phase
          const rampDownProgress = (duration - elapsedTime) / rampDown;
          return Math.round(start + (max - start) * rampDownProgress);
        }
        return max;

      case 'step':
        const steps = 5;
        const stepDuration = duration / steps;
        const currentStep = Math.floor(elapsedTime / stepDuration);
        const stepSize = (max - start) / steps;
        return Math.round(start + stepSize * currentStep);

      case 'spike':
        // Create periodic spikes
        const spikeInterval = 30000; // 30 seconds
        const spikeDuration = 5000; // 5 second spike
        const timeInCycle = elapsedTime % spikeInterval;
        if (timeInCycle < spikeDuration) {
          return max;
        }
        return start;

      default:
        return max;
    }
  }

  private async executeBatch(
    _test: LoadTest,
    virtualUsers: number,
    strategy: ExecutionStrategy
  ): Promise<BatchResult> {
    // Stub: In production, this would execute actual HTTP requests
    // using a library like axios, undici, or node-fetch

    const totalRequests = Math.round(virtualUsers * strategy.requestMultiplier);
    const responseTimes: number[] = [];
    const errors: string[] = [];
    let successfulRequests = 0;
    let failedRequests = 0;

    for (let i = 0; i < totalRequests; i++) {
      // Simulate request execution
      const responseTime = this.simulateRequest(strategy);

      if (responseTime.success) {
        successfulRequests++;
        responseTimes.push(responseTime.value);
      } else {
        failedRequests++;
        errors.push(responseTime.error);
      }
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      responseTimes,
      errors,
    };
  }

  private simulateRequest(
    strategy: ExecutionStrategy
  ): { success: true; value: number } | { success: false; error: string } {
    // Simulate request with some randomness
    const shouldFail = Math.random() < strategy.errorInjectionRate;

    if (shouldFail) {
      const errorTypes = [
        'Connection timeout',
        'Connection refused',
        'HTTP 500',
        'HTTP 502',
        'HTTP 503',
      ];
      return {
        success: false,
        error: errorTypes[Math.floor(Math.random() * errorTypes.length)],
      };
    }

    // Simulate response time with some variance
    const baseResponseTime = 50; // 50ms base
    const variance = 100 * Math.random(); // Up to 100ms variance
    const loadFactor = strategy.requestMultiplier * 10; // Additional latency under load

    return {
      success: true,
      value: baseResponseTime + variance + loadFactor,
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  private evaluateAssertions(
    assertions: LoadAssertion[],
    summary: MutableLoadTestSummary
  ): AssertionResult[] {
    return assertions.map((assertion) => {
      const actualValue = this.getMetricValue(assertion.metric, summary);
      const passed = this.checkAssertion(assertion, actualValue);

      return {
        assertion,
        passed,
        actualValue,
      };
    });
  }

  private getMetricValue(metric: LoadAssertion['metric'], summary: MutableLoadTestSummary): number {
    switch (metric) {
      case 'response-time':
        return summary.avgResponseTime;
      case 'throughput':
        return summary.requestsPerSecond;
      case 'error-rate':
        return summary.errorRate;
      case 'p95':
        return summary.p95ResponseTime;
      case 'p99':
        return summary.p99ResponseTime;
      default:
        return 0;
    }
  }

  private checkAssertion(assertion: LoadAssertion, actual: number): boolean {
    switch (assertion.operator) {
      case 'lt':
        return actual < assertion.value;
      case 'gt':
        return actual > assertion.value;
      case 'lte':
        return actual <= assertion.value;
      case 'gte':
        return actual >= assertion.value;
      default:
        return false;
    }
  }

  private determineTestStatus(result: MutableLoadTestResult): 'completed' | 'failed' | 'aborted' {
    if (result.status === 'aborted') {
      return 'aborted';
    }

    // Check if any assertions failed
    const failedAssertions = result.assertionResults.filter((a) => !a.passed);
    if (failedAssertions.length > 0) {
      return 'failed';
    }

    // Check if error rate is too high (more than 10%)
    if (result.summary.errorRate > 10) {
      return 'failed';
    }

    return 'completed';
  }

  private finalizeExecution(execution: LoadTestExecution): LoadTestResult {
    // Convert to readonly result
    const result: LoadTestResult = {
      testId: execution.result.testId,
      status: execution.result.status,
      duration: execution.result.duration,
      summary: execution.result.summary,
      timeline: execution.result.timeline,
      errors: execution.result.errors,
      assertionResults: execution.result.assertionResults,
    };

    // Store result in memory
    this.memory.set(
      `loadtest:results:${execution.testId}:${Date.now()}`,
      result,
      { namespace: 'chaos-resilience', persist: true }
    );

    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Internal types
 */
interface LoadTestExecution {
  testId: string;
  startTime: Date;
  aborted: boolean;
  result: MutableLoadTestResult;
}

interface ExecutionStrategy {
  requestMultiplier: number;
  errorInjectionRate: number;
}

interface BatchResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  responseTimes: number[];
  errors: string[];
}
