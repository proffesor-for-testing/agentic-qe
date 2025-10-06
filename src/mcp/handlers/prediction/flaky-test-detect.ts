/**
 * Flaky Test Detection Handler
 *
 * Identifies flaky tests using pattern recognition and statistical analysis.
 * Helps improve test suite reliability and developer confidence.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { AgentRegistry } from '../../services/AgentRegistry.js';
import { HookExecutor } from '../../services/HookExecutor.js';

export interface FlakyTestDetectArgs {
  testData: {
    testResults: TestRunResult[];
    minRuns?: number; // Minimum runs to consider, default 5
    timeWindow?: number; // Days to analyze, default 30
  };
  analysisConfig?: {
    flakinessThreshold: number; // 0-1, default 0.1 (10% failure rate)
    patternDetection?: boolean;
    includeTimingAnalysis?: boolean;
    clusteringEnabled?: boolean;
  };
  reportConfig?: {
    includeRecommendations?: boolean;
    generateFixSuggestions?: boolean;
    prioritizeByImpact?: boolean;
  };
}

export interface TestRunResult {
  testId: string;
  testName: string;
  status: 'pass' | 'fail' | 'skip' | 'timeout';
  duration: number;
  timestamp: string;
  environment?: string;
  errorMessage?: string;
  stackTrace?: string;
}

export interface FlakyTestResult {
  id: string;
  summary: {
    totalTests: number;
    flakyTests: number;
    suspiciousTests: number;
    stableTests: number;
    overallReliability: number;
  };
  flakyTests: FlakyTest[];
  patterns: FlakinessPattern[];
  recommendations: FlakyTestRecommendation[];
  insights: {
    commonCauses: string[];
    environmentalFactors: string[];
    timingIssues: number;
    resourceContention: number;
  };
  performance: {
    analysisTime: number;
    testsAnalyzed: number;
  };
}

export interface FlakyTest {
  testId: string;
  testName: string;
  flakinessScore: number;
  status: 'flaky' | 'suspicious' | 'stable';
  statistics: {
    totalRuns: number;
    passes: number;
    failures: number;
    timeouts: number;
    passRate: number;
    failureRate: number;
  };
  patterns: {
    type: string;
    confidence: number;
    description: string;
  }[];
  rootCauses: FlakyRootCause[];
  impact: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    developerTimeWasted: number; // hours
    ciCostImpact: number; // dollars
    confidenceImpact: string;
  };
  suggestedFixes: string[];
}

export interface FlakyRootCause {
  category: 'timing' | 'race-condition' | 'external-dependency' | 'resource-leak' | 'environment' | 'test-order' | 'unknown';
  confidence: number;
  description: string;
  evidence: string[];
  fixComplexity: 'low' | 'medium' | 'high';
}

export interface FlakinessPattern {
  id: string;
  type: 'time-based' | 'environment-based' | 'order-dependent' | 'resource-contention' | 'network-flake';
  affectedTests: string[];
  frequency: number;
  description: string;
  suggestedMitigation: string;
}

export interface FlakyTestRecommendation {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'quick-fix' | 'refactor' | 'infrastructure' | 'quarantine';
  title: string;
  description: string;
  actions: string[];
  estimatedEffort: number; // hours
  impactReduction: number; // percentage
  affectedTests: string[];
}

/**
 * Flaky Test Detection Handler
 */
export class FlakyTestDetectHandler extends BaseHandler {
  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor
  ) {
    super();
  }

  async handle(args: FlakyTestDetectArgs): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();
    const startTime = performance.now();

    try {
      this.log('info', 'Starting flaky test detection', { requestId, args });

      // Validate input
      this.validateRequired(args, ['testData']);
      if (!args.testData.testResults || args.testData.testResults.length === 0) {
        throw new Error('Test results are required');
      }

      // Execute pre-task hook
      await this.hookExecutor.executeHook('pre-task', {
        taskId: requestId,
        taskType: 'flaky-test-detect',
        metadata: args
      });

      // Run flaky test detection
      const result = await this.detectFlakyTests(args, requestId);

      // Execute post-task hook
      await this.hookExecutor.executeHook('post-task', {
        taskId: requestId,
        taskType: 'flaky-test-detect',
        result
      });

      const executionTime = performance.now() - startTime;
      this.log('info', 'Flaky test detection completed', {
        requestId,
        flakyTests: result.summary.flakyTests,
        executionTime
      });

      return this.createSuccessResponse(result, requestId);
    } catch (error) {
      this.log('error', 'Flaky test detection failed', { requestId, error });
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Detect flaky tests
   */
  private async detectFlakyTests(
    args: FlakyTestDetectArgs,
    requestId: string
  ): Promise<FlakyTestResult> {
    const analysisStartTime = performance.now();

    const minRuns = args.testData.minRuns || 5;
    const threshold = args.analysisConfig?.flakinessThreshold || 0.1;

    // Group test results by test ID
    const testGroups = this.groupTestResults(args.testData.testResults);

    // Analyze each test
    const flakyTests: FlakyTest[] = [];
    let suspiciousCount = 0;
    let stableCount = 0;

    for (const [testId, results] of testGroups.entries()) {
      if (results.length < minRuns) continue;

      const analysis = this.analyzeTest(testId, results, threshold);

      if (analysis.status === 'flaky') {
        flakyTests.push(analysis);
      } else if (analysis.status === 'suspicious') {
        flakyTests.push(analysis);
        suspiciousCount++;
      } else {
        stableCount++;
      }
    }

    // Sort by flakiness score
    flakyTests.sort((a, b) => b.flakinessScore - a.flakinessScore);

    // Detect patterns
    const patterns = this.detectPatterns(flakyTests, args.testData.testResults);

    // Generate recommendations
    const recommendations = this.generateRecommendations(flakyTests, patterns);

    // Generate insights
    const insights = this.generateInsights(flakyTests, patterns);

    const analysisTime = performance.now() - analysisStartTime;
    const totalTests = testGroups.size;
    const actualFlakyTests = flakyTests.filter(t => t.status === 'flaky').length;

    return {
      id: requestId,
      summary: {
        totalTests,
        flakyTests: actualFlakyTests,
        suspiciousTests: suspiciousCount,
        stableTests: stableCount,
        overallReliability: 1 - (actualFlakyTests / totalTests)
      },
      flakyTests,
      patterns,
      recommendations,
      insights,
      performance: {
        analysisTime,
        testsAnalyzed: totalTests
      }
    };
  }

  /**
   * Group test results by test ID
   */
  private groupTestResults(results: TestRunResult[]): Map<string, TestRunResult[]> {
    const groups = new Map<string, TestRunResult[]>();

    for (const result of results) {
      const existing = groups.get(result.testId) || [];
      existing.push(result);
      groups.set(result.testId, existing);
    }

    return groups;
  }

  /**
   * Analyze a single test for flakiness
   */
  private analyzeTest(testId: string, results: TestRunResult[], threshold: number): FlakyTest {
    const totalRuns = results.length;
    const passes = results.filter(r => r.status === 'pass').length;
    const failures = results.filter(r => r.status === 'fail').length;
    const timeouts = results.filter(r => r.status === 'timeout').length;
    const passRate = passes / totalRuns;
    const failureRate = failures / totalRuns;

    // Calculate flakiness score (0-1)
    const flakinessScore = this.calculateFlakinessScore(results);

    // Determine status
    let status: 'flaky' | 'suspicious' | 'stable' = 'stable';
    if (failureRate > threshold && failureRate < 0.9) {
      status = 'flaky';
    } else if (failureRate > threshold / 2 || timeouts > 0) {
      status = 'suspicious';
    }

    // Detect patterns
    const patterns = this.detectTestPatterns(results);

    // Identify root causes
    const rootCauses = this.identifyRootCauses(results, patterns);

    // Calculate impact
    const impact = this.calculateImpact(status, failureRate, totalRuns);

    // Generate fix suggestions
    const suggestedFixes = this.generateFixSuggestions(rootCauses, patterns);

    return {
      testId,
      testName: results[0].testName,
      flakinessScore,
      status,
      statistics: {
        totalRuns,
        passes,
        failures,
        timeouts,
        passRate,
        failureRate
      },
      patterns,
      rootCauses,
      impact,
      suggestedFixes
    };
  }

  /**
   * Calculate flakiness score
   */
  private calculateFlakinessScore(results: TestRunResult[]): number {
    const transitions = this.countStatusTransitions(results);
    const failureRate = results.filter(r => r.status === 'fail').length / results.length;
    const timeoutRate = results.filter(r => r.status === 'timeout').length / results.length;

    // Score based on transitions (instability) and failure/timeout rates
    return Math.min(
      (transitions / results.length) * 0.5 +
      failureRate * 0.3 +
      timeoutRate * 0.2,
      1.0
    );
  }

  /**
   * Count status transitions
   */
  private countStatusTransitions(results: TestRunResult[]): number {
    let transitions = 0;
    for (let i = 1; i < results.length; i++) {
      if (results[i].status !== results[i - 1].status) {
        transitions++;
      }
    }
    return transitions;
  }

  /**
   * Detect test-specific patterns
   */
  private detectTestPatterns(results: TestRunResult[]): Array<{ type: string; confidence: number; description: string }> {
    const patterns: Array<{ type: string; confidence: number; description: string }> = [];

    // Timing pattern
    const durations = results.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;

    if (variance > avgDuration * 0.5) {
      patterns.push({
        type: 'timing-instability',
        confidence: 0.85,
        description: 'Test duration varies significantly, suggesting timing issues'
      });
    }

    // Consecutive failures
    const consecutiveFailures = this.findConsecutiveFailures(results);
    if (consecutiveFailures > 2) {
      patterns.push({
        type: 'burst-failures',
        confidence: 0.9,
        description: `${consecutiveFailures} consecutive failures detected, possibly environment-related`
      });
    }

    // Timeout pattern
    if (results.some(r => r.status === 'timeout')) {
      patterns.push({
        type: 'timeout-pattern',
        confidence: 0.95,
        description: 'Timeouts detected, likely waiting for external resource or deadlock'
      });
    }

    return patterns;
  }

  /**
   * Find consecutive failures
   */
  private findConsecutiveFailures(results: TestRunResult[]): number {
    let maxConsecutive = 0;
    let current = 0;

    for (const result of results) {
      if (result.status === 'fail') {
        current++;
        maxConsecutive = Math.max(maxConsecutive, current);
      } else {
        current = 0;
      }
    }

    return maxConsecutive;
  }

  /**
   * Identify root causes
   */
  private identifyRootCauses(
    results: TestRunResult[],
    patterns: Array<{ type: string; confidence: number; description: string }>
  ): FlakyRootCause[] {
    const rootCauses: FlakyRootCause[] = [];

    // Check for timing issues
    if (patterns.some(p => p.type === 'timing-instability')) {
      rootCauses.push({
        category: 'timing',
        confidence: 0.8,
        description: 'Test contains timing-dependent assertions or waits',
        evidence: ['Variable test durations', 'Inconsistent results'],
        fixComplexity: 'medium'
      });
    }

    // Check for timeouts
    if (patterns.some(p => p.type === 'timeout-pattern')) {
      rootCauses.push({
        category: 'external-dependency',
        confidence: 0.85,
        description: 'Test depends on external resource that may be unavailable',
        evidence: ['Timeout failures', 'Network-related errors'],
        fixComplexity: 'medium'
      });
    }

    // Check error messages for race conditions
    const raceConditionKeywords = ['race', 'concurrent', 'parallel', 'synchronized'];
    const hasRaceCondition = results.some(r =>
      r.errorMessage && raceConditionKeywords.some(kw => r.errorMessage!.toLowerCase().includes(kw))
    );

    if (hasRaceCondition) {
      rootCauses.push({
        category: 'race-condition',
        confidence: 0.9,
        description: 'Race condition detected in concurrent operations',
        evidence: ['Concurrent access errors', 'Synchronization failures'],
        fixComplexity: 'high'
      });
    }

    return rootCauses;
  }

  /**
   * Calculate impact
   */
  private calculateImpact(
    status: string,
    failureRate: number,
    totalRuns: number
  ): FlakyTest['impact'] {
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (status === 'flaky' && failureRate > 0.3) severity = 'critical';
    else if (status === 'flaky' && failureRate > 0.15) severity = 'high';
    else if (status === 'suspicious') severity = 'medium';

    const developerTimeWasted = failureRate * totalRuns * 0.25; // 15 min per failure
    const ciCostImpact = failureRate * totalRuns * 0.5; // $0.50 per CI run

    return {
      severity,
      developerTimeWasted,
      ciCostImpact,
      confidenceImpact: `${(failureRate * 100).toFixed(1)}% confidence loss`
    };
  }

  /**
   * Generate fix suggestions
   */
  private generateFixSuggestions(
    rootCauses: FlakyRootCause[],
    patterns: Array<{ type: string; confidence: number; description: string }>
  ): string[] {
    const suggestions: string[] = [];

    for (const cause of rootCauses) {
      switch (cause.category) {
        case 'timing':
          suggestions.push('Replace hardcoded waits with explicit wait conditions');
          suggestions.push('Use polling with timeout instead of fixed delays');
          break;
        case 'race-condition':
          suggestions.push('Add proper synchronization mechanisms');
          suggestions.push('Use atomic operations or locks');
          break;
        case 'external-dependency':
          suggestions.push('Mock external dependencies in tests');
          suggestions.push('Add retry logic with exponential backoff');
          break;
      }
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }

  /**
   * Detect patterns across tests
   */
  private detectPatterns(flakyTests: FlakyTest[], allResults: TestRunResult[]): FlakinessPattern[] {
    const patterns: FlakinessPattern[] = [];

    // Time-based pattern
    const timeBasedTests = flakyTests.filter(t =>
      t.patterns.some(p => p.type === 'timing-instability')
    );
    if (timeBasedTests.length > 0) {
      patterns.push({
        id: `pattern-${Date.now()}-1`,
        type: 'time-based',
        affectedTests: timeBasedTests.map(t => t.testId),
        frequency: timeBasedTests.length / flakyTests.length,
        description: 'Tests fail due to timing dependencies',
        suggestedMitigation: 'Implement explicit waits and remove hardcoded delays'
      });
    }

    // Network/External dependency pattern
    const networkTests = flakyTests.filter(t =>
      t.rootCauses.some(c => c.category === 'external-dependency')
    );
    if (networkTests.length > 0) {
      patterns.push({
        id: `pattern-${Date.now()}-2`,
        type: 'network-flake',
        affectedTests: networkTests.map(t => t.testId),
        frequency: networkTests.length / flakyTests.length,
        description: 'Tests depend on external services',
        suggestedMitigation: 'Mock external dependencies or add retry mechanisms'
      });
    }

    return patterns;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    flakyTests: FlakyTest[],
    patterns: FlakinessPattern[]
  ): FlakyTestRecommendation[] {
    const recommendations: FlakyTestRecommendation[] = [];

    const criticalTests = flakyTests.filter(t => t.impact.severity === 'critical');
    if (criticalTests.length > 0) {
      recommendations.push({
        id: `rec-${Date.now()}-1`,
        priority: 'critical',
        category: 'quarantine',
        title: 'Quarantine critical flaky tests',
        description: `${criticalTests.length} tests with >30% failure rate need immediate attention`,
        actions: [
          'Move tests to quarantine suite',
          'Investigate and fix within 48 hours',
          'Disable from CI until fixed'
        ],
        estimatedEffort: criticalTests.length * 2,
        impactReduction: 60,
        affectedTests: criticalTests.map(t => t.testId)
      });
    }

    const timingTests = flakyTests.filter(t =>
      t.patterns.some(p => p.type === 'timing-instability')
    );
    if (timingTests.length > 0) {
      recommendations.push({
        id: `rec-${Date.now()}-2`,
        priority: 'high',
        category: 'quick-fix',
        title: 'Fix timing-related flakiness',
        description: 'Replace hardcoded waits with explicit conditions',
        actions: [
          'Identify hardcoded sleeps/waits',
          'Replace with explicit wait conditions',
          'Add retry logic where appropriate'
        ],
        estimatedEffort: timingTests.length * 0.5,
        impactReduction: 40,
        affectedTests: timingTests.map(t => t.testId)
      });
    }

    return recommendations;
  }

  /**
   * Generate insights
   */
  private generateInsights(flakyTests: FlakyTest[], patterns: FlakinessPattern[]): FlakyTestResult['insights'] {
    const rootCauseCategories = new Map<string, number>();
    const environmentFactors: string[] = [];
    let timingIssues = 0;
    let resourceContention = 0;

    for (const test of flakyTests) {
      for (const cause of test.rootCauses) {
        rootCauseCategories.set(
          cause.category,
          (rootCauseCategories.get(cause.category) || 0) + 1
        );

        if (cause.category === 'timing') timingIssues++;
        if (cause.category === 'resource-leak') resourceContention++;
      }
    }

    const commonCauses = Array.from(rootCauseCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => `${category}: ${count} tests`);

    return {
      commonCauses,
      environmentalFactors: environmentFactors,
      timingIssues,
      resourceContention
    };
  }
}
