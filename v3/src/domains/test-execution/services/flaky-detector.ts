/**
 * Agentic QE v3 - Flaky Test Detector Service
 * Identifies and analyzes flaky tests from execution history
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types';
import {
  FlakyDetectionRequest,
  FlakyTestReport,
  FlakyTest,
} from '../interfaces';
import { MemoryBackend } from '../../../kernel/interfaces';

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
// Flaky Detector Service
// ============================================================================

export class FlakyDetectorService implements IFlakyTestDetector {
  private readonly testHistory = new Map<string, TestExecutionRecord[]>();
  private readonly analysisCache = new Map<string, FlakyAnalysis>();

  constructor(private readonly memory: MemoryBackend) {}

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

      // Cache result
      this.analysisCache.set(testId, analysis);
      await this.memory.set(`flaky-analysis:${testId}`, analysis, {
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
  // Private Methods
  // ============================================================================

  private async runMultipleTimes(
    _file: string,
    runs: number
  ): Promise<Map<string, TestExecutionRecord[]>> {
    const results = new Map<string, TestExecutionRecord[]>();

    // Simulate multiple test runs
    // In real implementation, this would execute the actual test file
    const testIds = [`test-${uuidv4().slice(0, 8)}`, `test-${uuidv4().slice(0, 8)}`];

    for (const testId of testIds) {
      const records: TestExecutionRecord[] = [];

      for (let i = 0; i < runs; i++) {
        // Simulate some flakiness
        const isFlaky = Math.random() > 0.7;
        const passed = isFlaky ? Math.random() > 0.3 : true;

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
