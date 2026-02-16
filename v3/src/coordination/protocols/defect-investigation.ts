/**
 * Agentic QE v3 - Defect Investigation Protocol
 *
 * Orchestrates multi-agent investigation of test failures.
 * Trigger: Test failure event
 * Participants: Defect Predictor, RCA, Flaky Hunter, Regression
 * Actions: Check flakiness, analyze root cause, predict related failures
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  ok,
  err,
  DomainName,
  Severity,
} from '../../shared/types';
import { createEvent } from '../../shared/events/domain-events';
import { EventBus, MemoryBackend } from '../../kernel/interfaces';
import type {
  RootCauseAnalysis,
  ContributingFactor,
  RegressionRisk,
} from '../../domains/defect-intelligence/interfaces';
import type { ImpactAnalysis } from '../../domains/code-intelligence/interfaces';
import { toError } from '../../shared/error-utils.js';

// ============================================================================
// Protocol Types
// ============================================================================

/**
 * Input for defect investigation - a test failure to investigate
 */
export interface TestFailure {
  testId: string;
  testName: string;
  file: string;
  error: string;
  stack?: string;
  duration: number;
  runId: string;
  timestamp: Date;
  context?: TestFailureContext;
}

export interface TestFailureContext {
  precedingTests?: string[];
  environment?: Record<string, string>;
  parallelWorkers?: number;
  retryAttempt?: number;
}

/**
 * Result of a complete defect investigation
 */
export interface DefectInvestigationResult {
  investigationId: string;
  testFailure: TestFailure;
  isFlaky: boolean;
  flakyAnalysis?: FlakyTestAnalysis;
  rootCause?: RootCauseAnalysis;
  regressionAnalysis?: RegressionRisk;
  relatedFailures: RelatedFailure[];
  impactAnalysis?: ImpactAnalysis;
  coverageContext?: CoverageContext;
  recommendations: DefectRecommendation[];
  confidence: number;
  duration: number;
}

export interface FlakyTestAnalysis {
  isFlaky: boolean;
  confidence: number;
  pattern?: 'timing' | 'ordering' | 'resource' | 'async' | 'unknown';
  failureRate?: number;
  recommendation?: string;
}

export interface RelatedFailure {
  testId: string;
  testName: string;
  file: string;
  similarity: number;
  reason: string;
}

export interface CoverageContext {
  file: string;
  lineCoverage: number;
  branchCoverage: number;
  uncoveredLines: number[];
  riskScore: number;
}

export interface DefectRecommendation {
  type: 'fix' | 'investigate' | 'retry' | 'skip' | 'quarantine';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  action: string;
  effort: 'low' | 'medium' | 'high';
  confidence: number;
}

// ============================================================================
// Protocol Events
// ============================================================================

export interface DefectInvestigationStartedPayload {
  investigationId: string;
  testId: string;
  testFile: string;
  error: string;
  runId: string;
}

export interface FlakinessDetectedPayload {
  investigationId: string;
  testId: string;
  pattern: string;
  failureRate: number;
  confidence: number;
}

export interface RootCauseIdentifiedPayload {
  investigationId: string;
  testId: string;
  rootCause: string;
  confidence: number;
  contributingFactors: string[];
}

export interface RelatedFailuresPredictedPayload {
  investigationId: string;
  testId: string;
  relatedTests: string[];
  similarityScores: number[];
}

export interface DefectInvestigationCompletedPayload {
  investigationId: string;
  testId: string;
  isFlaky: boolean;
  rootCause?: string;
  relatedFailuresCount: number;
  recommendationsCount: number;
  confidence: number;
  duration: number;
}

export const DefectInvestigationEvents = {
  DefectInvestigationStarted: 'coordination.DefectInvestigationStarted',
  FlakinessDetected: 'coordination.FlakinessDetected',
  RootCauseIdentified: 'coordination.RootCauseIdentified',
  RelatedFailuresPredicted: 'coordination.RelatedFailuresPredicted',
  DefectInvestigationCompleted: 'coordination.DefectInvestigationCompleted',
} as const;

// ============================================================================
// Protocol Configuration
// ============================================================================

export interface DefectInvestigationConfig {
  /** Maximum time to spend on investigation (ms) */
  maxDuration: number;
  /** Minimum confidence threshold to report findings */
  minConfidence: number;
  /** Number of historical runs to check for flakiness */
  flakinessHistorySize: number;
  /** Failure rate threshold to consider test flaky */
  flakinessThreshold: number;
  /** Maximum related failures to predict */
  maxRelatedFailures: number;
  /** Enable deep root cause analysis */
  enableDeepAnalysis: boolean;
  /** Skip investigation for known flaky tests */
  skipKnownFlaky: boolean;
  /** Namespace for storing investigation data */
  namespace: string;
}

const DEFAULT_CONFIG: DefectInvestigationConfig = {
  maxDuration: 30000,
  minConfidence: 0.3,
  flakinessHistorySize: 10,
  flakinessThreshold: 0.2,
  maxRelatedFailures: 10,
  enableDeepAnalysis: true,
  skipKnownFlaky: true,
  namespace: 'defect-investigation',
};

// ============================================================================
// Defect Investigation Protocol
// ============================================================================

/**
 * DefectInvestigationProtocol orchestrates multi-agent investigation of test failures.
 *
 * Investigation workflow:
 * 1. Check if test is known flaky (return early if yes)
 * 2. Analyze root cause
 * 3. Check for regression patterns
 * 4. Predict related failures
 * 5. Generate remediation suggestions
 */
export class DefectInvestigationProtocol {
  private readonly config: DefectInvestigationConfig;
  private readonly source: DomainName = 'defect-intelligence';

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    config: Partial<DefectInvestigationConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute the full defect investigation protocol
   */
  async execute(
    testFailure: TestFailure
  ): Promise<Result<DefectInvestigationResult, Error>> {
    const startTime = Date.now();
    const investigationId = uuidv4();

    try {
      // Publish investigation started event
      await this.publishEvent(
        DefectInvestigationEvents.DefectInvestigationStarted,
        {
          investigationId,
          testId: testFailure.testId,
          testFile: testFailure.file,
          error: testFailure.error,
          runId: testFailure.runId,
        } as DefectInvestigationStartedPayload,
        investigationId
      );

      // Step 1: Check flakiness
      const flakyResult = await this.checkFlakiness(
        investigationId,
        testFailure
      );

      // If known flaky and configured to skip, return early
      if (
        flakyResult.isFlaky &&
        flakyResult.confidence > 0.8 &&
        this.config.skipKnownFlaky
      ) {
        const result = this.buildEarlyFlakyResult(
          investigationId,
          testFailure,
          flakyResult,
          Date.now() - startTime
        );

        await this.completeInvestigation(result);
        return ok(result);
      }

      // Step 2: Analyze root cause
      const rootCause = await this.analyzeRootCause(
        investigationId,
        testFailure
      );

      // Step 3: Analyze regression patterns
      const regressionAnalysis = await this.analyzeRegression(testFailure);

      // Step 4: Predict related failures
      const relatedFailures = await this.predictRelatedFailures(
        investigationId,
        testFailure,
        rootCause
      );

      // Step 5: Get coverage context
      const coverageContext = await this.getCoverageContext(testFailure.file);

      // Step 6: Get impact analysis
      const impactAnalysis = await this.getImpactAnalysis(testFailure.file);

      // Step 7: Generate recommendations
      const recommendations = this.suggestFixes(
        testFailure,
        flakyResult,
        rootCause,
        regressionAnalysis,
        relatedFailures
      );

      // Calculate overall confidence
      const confidence = this.calculateOverallConfidence(
        flakyResult,
        rootCause,
        recommendations
      );

      // Build final result
      const result: DefectInvestigationResult = {
        investigationId,
        testFailure,
        isFlaky: flakyResult.isFlaky,
        flakyAnalysis: flakyResult,
        rootCause: rootCause ?? undefined,
        regressionAnalysis: regressionAnalysis ?? undefined,
        relatedFailures,
        impactAnalysis: impactAnalysis ?? undefined,
        coverageContext: coverageContext ?? undefined,
        recommendations,
        confidence,
        duration: Date.now() - startTime,
      };

      // Step 8: Update defect patterns for learning
      await this.updateDefectPatterns(result);

      // Complete investigation
      await this.completeInvestigation(result);

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Check if the test failure is due to flakiness
   */
  async checkFlakiness(
    investigationId: string,
    testFailure: TestFailure
  ): Promise<FlakyTestAnalysis> {
    // Get execution history for this test
    const historyKey = `test-execution:history:${testFailure.testId}`;
    const history = await this.memory.get<TestExecutionHistory[]>(historyKey);

    if (!history || history.length < 2) {
      return {
        isFlaky: false,
        confidence: 0.5,
      };
    }

    // Calculate failure rate
    const failures = history.filter((h) => !h.passed).length;
    const failureRate = failures / history.length;

    // Detect flakiness pattern
    const pattern = this.detectFlakinessPattern(history, testFailure);

    // Determine if flaky
    const isFlaky =
      failureRate > 0 &&
      failureRate < 1 &&
      failureRate >= this.config.flakinessThreshold;

    // Calculate confidence
    const confidence = this.calculateFlakinessConfidence(
      history.length,
      failureRate,
      pattern
    );

    const result: FlakyTestAnalysis = {
      isFlaky,
      confidence,
      pattern: isFlaky ? pattern : undefined,
      failureRate: isFlaky ? failureRate : undefined,
      recommendation: isFlaky
        ? this.getFlakyRecommendation(pattern)
        : undefined,
    };

    // Publish event if flaky detected
    if (isFlaky && confidence > this.config.minConfidence) {
      await this.publishEvent(
        DefectInvestigationEvents.FlakinessDetected,
        {
          investigationId,
          testId: testFailure.testId,
          pattern: pattern,
          failureRate,
          confidence,
        } as FlakinessDetectedPayload,
        investigationId
      );
    }

    return result;
  }

  /**
   * Analyze root cause of the test failure
   */
  async analyzeRootCause(
    investigationId: string,
    testFailure: TestFailure
  ): Promise<RootCauseAnalysis | null> {
    try {
      // Extract symptoms from error message and stack
      const symptoms = this.extractSymptoms(testFailure);

      // Use heuristic analysis to determine root cause
      const analysis = await this.performRootCauseAnalysis(
        testFailure,
        symptoms
      );

      if (analysis && analysis.confidence >= this.config.minConfidence) {
        // Publish event
        await this.publishEvent(
          DefectInvestigationEvents.RootCauseIdentified,
          {
            investigationId,
            testId: testFailure.testId,
            rootCause: analysis.rootCause,
            confidence: analysis.confidence,
            contributingFactors: analysis.contributingFactors.map(
              (f) => f.factor
            ),
          } as RootCauseIdentifiedPayload,
          investigationId
        );
      }

      return analysis;
    } catch {
      return null;
    }
  }

  /**
   * Predict tests that may have related failures
   */
  async predictRelatedFailures(
    investigationId: string,
    testFailure: TestFailure,
    rootCause: RootCauseAnalysis | null
  ): Promise<RelatedFailure[]> {
    const relatedFailures: RelatedFailure[] = [];

    try {
      // Find tests in same file
      const sameFileTests = await this.findTestsInSameFile(testFailure.file);
      for (const test of sameFileTests) {
        if (test.testId !== testFailure.testId) {
          relatedFailures.push({
            testId: test.testId,
            testName: test.testName,
            file: testFailure.file,
            similarity: 0.8,
            reason: 'Same test file',
          });
        }
      }

      // Find tests with similar error patterns
      if (rootCause) {
        const similarTests = await this.findTestsWithSimilarErrors(
          testFailure.error,
          rootCause.rootCause
        );
        for (const test of similarTests) {
          if (
            test.testId !== testFailure.testId &&
            !relatedFailures.find((r) => r.testId === test.testId)
          ) {
            relatedFailures.push({
              testId: test.testId,
              testName: test.testName,
              file: test.file,
              similarity: test.similarity,
              reason: `Similar error pattern: ${rootCause.rootCause}`,
            });
          }
        }
      }

      // Find tests that depend on same code
      const dependentTests = await this.findDependentTests(testFailure.file);
      for (const test of dependentTests) {
        if (
          test.testId !== testFailure.testId &&
          !relatedFailures.find((r) => r.testId === test.testId)
        ) {
          relatedFailures.push({
            testId: test.testId,
            testName: test.testName,
            file: test.file,
            similarity: 0.6,
            reason: 'Tests same code dependency',
          });
        }
      }

      // Limit results and sort by similarity
      const limitedResults = relatedFailures
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, this.config.maxRelatedFailures);

      // Publish event if any related failures predicted
      if (limitedResults.length > 0) {
        await this.publishEvent(
          DefectInvestigationEvents.RelatedFailuresPredicted,
          {
            investigationId,
            testId: testFailure.testId,
            relatedTests: limitedResults.map((r) => r.testId),
            similarityScores: limitedResults.map((r) => r.similarity),
          } as RelatedFailuresPredictedPayload,
          investigationId
        );
      }

      return limitedResults;
    } catch {
      return [];
    }
  }

  /**
   * Generate fix recommendations based on investigation findings
   */
  suggestFixes(
    testFailure: TestFailure,
    flakyAnalysis: FlakyTestAnalysis,
    rootCause: RootCauseAnalysis | null,
    regressionAnalysis: RegressionRisk | null,
    relatedFailures: RelatedFailure[]
  ): DefectRecommendation[] {
    const recommendations: DefectRecommendation[] = [];

    // Handle flaky tests
    if (flakyAnalysis.isFlaky) {
      recommendations.push(
        this.createFlakyRecommendation(flakyAnalysis, testFailure)
      );
    }

    // Root cause based recommendations
    if (rootCause) {
      recommendations.push(
        ...this.createRootCauseRecommendations(rootCause, testFailure)
      );
    }

    // Regression-based recommendations
    if (regressionAnalysis && regressionAnalysis.overallRisk > 0.5) {
      recommendations.push({
        type: 'investigate',
        priority: regressionAnalysis.riskLevel === 'critical' ? 'critical' : 'high',
        description: 'High regression risk detected',
        action: `Review recent changes to: ${regressionAnalysis.impactedAreas.map((a) => a.area).join(', ')}`,
        effort: 'medium',
        confidence: regressionAnalysis.confidence,
      });
    }

    // Related failures recommendations
    if (relatedFailures.length > 2) {
      recommendations.push({
        type: 'investigate',
        priority: 'high',
        description: `${relatedFailures.length} related tests may also fail`,
        action:
          'Review common code path and consider batch fix across related tests',
        effort: 'high',
        confidence: 0.7,
      });
    }

    // Default recommendation if nothing specific
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'investigate',
        priority: 'medium',
        description: 'Manual investigation required',
        action: `Review test ${testFailure.testName} for failure cause`,
        effort: 'medium',
        confidence: 0.5,
      });
    }

    // Sort by priority and confidence
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Update defect patterns for learning from this investigation
   */
  async updateDefectPatterns(
    result: DefectInvestigationResult
  ): Promise<void> {
    try {
      // Store investigation result
      await this.memory.set(
        `${this.config.namespace}:investigation:${result.investigationId}`,
        {
          investigationId: result.investigationId,
          testId: result.testFailure.testId,
          file: result.testFailure.file,
          isFlaky: result.isFlaky,
          rootCause: result.rootCause?.rootCause,
          relatedCount: result.relatedFailures.length,
          confidence: result.confidence,
          timestamp: new Date().toISOString(),
        },
        { namespace: this.config.namespace, persist: true }
      );

      // Update test history
      const historyKey = `test-execution:history:${result.testFailure.testId}`;
      const history =
        (await this.memory.get<TestExecutionHistory[]>(historyKey)) ?? [];

      history.push({
        runId: result.testFailure.runId,
        passed: false,
        duration: result.testFailure.duration,
        error: result.testFailure.error,
        timestamp: result.testFailure.timestamp,
      });

      // Keep only recent history
      const trimmedHistory = history.slice(-this.config.flakinessHistorySize);

      await this.memory.set(historyKey, trimmedHistory, {
        namespace: 'test-execution',
        persist: true,
      });

      // Update pattern statistics
      if (result.rootCause) {
        const patternKey = `${this.config.namespace}:pattern-stats`;
        const stats =
          (await this.memory.get<PatternStats>(patternKey)) ?? {
            patterns: {},
            totalInvestigations: 0,
          };

        const pattern = result.rootCause.rootCause;
        stats.patterns[pattern] = (stats.patterns[pattern] ?? 0) + 1;
        stats.totalInvestigations += 1;

        await this.memory.set(patternKey, stats, {
          namespace: this.config.namespace,
          persist: true,
        });
      }
    } catch {
      // Non-critical - log but don't fail
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async publishEvent<T>(
    eventType: string,
    payload: T,
    correlationId: string
  ): Promise<void> {
    const event = createEvent(eventType, this.source, payload, correlationId);
    await this.eventBus.publish(event);
  }

  private async completeInvestigation(
    result: DefectInvestigationResult
  ): Promise<void> {
    await this.publishEvent(
      DefectInvestigationEvents.DefectInvestigationCompleted,
      {
        investigationId: result.investigationId,
        testId: result.testFailure.testId,
        isFlaky: result.isFlaky,
        rootCause: result.rootCause?.rootCause,
        relatedFailuresCount: result.relatedFailures.length,
        recommendationsCount: result.recommendations.length,
        confidence: result.confidence,
        duration: result.duration,
      } as DefectInvestigationCompletedPayload,
      result.investigationId
    );
  }

  private buildEarlyFlakyResult(
    investigationId: string,
    testFailure: TestFailure,
    flakyResult: FlakyTestAnalysis,
    duration: number
  ): DefectInvestigationResult {
    return {
      investigationId,
      testFailure,
      isFlaky: true,
      flakyAnalysis: flakyResult,
      relatedFailures: [],
      recommendations: [
        {
          type: 'quarantine',
          priority: 'medium',
          description: 'Known flaky test detected',
          action: flakyResult.recommendation ?? 'Quarantine or fix flakiness',
          effort: 'medium',
          confidence: flakyResult.confidence,
        },
      ],
      confidence: flakyResult.confidence,
      duration,
    };
  }

  private detectFlakinessPattern(
    history: TestExecutionHistory[],
    testFailure: TestFailure
  ): 'timing' | 'ordering' | 'resource' | 'async' | 'unknown' {
    const failedRuns = history.filter((h) => !h.passed);
    const passedRuns = history.filter((h) => h.passed);

    if (failedRuns.length === 0 || passedRuns.length === 0) {
      return 'unknown';
    }

    // Check for timing issues
    const avgFailedDuration = this.average(failedRuns.map((r) => r.duration));
    const avgPassedDuration = this.average(passedRuns.map((r) => r.duration));

    if (Math.abs(avgFailedDuration - avgPassedDuration) / avgPassedDuration > 0.5) {
      return 'timing';
    }

    // Check for async issues
    const asyncKeywords = ['timeout', 'promise', 'async', 'await', 'callback'];
    const error = testFailure.error.toLowerCase();
    if (asyncKeywords.some((k) => error.includes(k))) {
      return 'async';
    }

    // Check for resource issues
    const resourceKeywords = ['connection', 'database', 'network', 'port', 'file'];
    if (resourceKeywords.some((k) => error.includes(k))) {
      return 'resource';
    }

    // Check for ordering issues
    if (testFailure.context?.precedingTests?.length) {
      return 'ordering';
    }

    return 'unknown';
  }

  private calculateFlakinessConfidence(
    sampleSize: number,
    failureRate: number,
    pattern: string
  ): number {
    // Base confidence on sample size
    const sampleConfidence = Math.min(1, sampleSize / 10);

    // Pattern confidence
    const patternConfidence = pattern !== 'unknown' ? 0.8 : 0.5;

    // Failure rate confidence (middle rates are more clearly flaky)
    const rateConfidence = Math.min(failureRate, 1 - failureRate) * 2;

    return sampleConfidence * 0.4 + patternConfidence * 0.3 + rateConfidence * 0.3;
  }

  private getFlakyRecommendation(
    pattern: 'timing' | 'ordering' | 'resource' | 'async' | 'unknown'
  ): string {
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

  private extractSymptoms(testFailure: TestFailure): string[] {
    const symptoms: string[] = [];

    // Add error message
    if (testFailure.error) {
      symptoms.push(testFailure.error);
    }

    // Extract key phrases from stack
    if (testFailure.stack) {
      const stackLines = testFailure.stack.split('\n').slice(0, 5);
      symptoms.push(...stackLines.filter((l) => l.trim().length > 0));
    }

    // Add file context
    symptoms.push(`file: ${testFailure.file}`);

    return symptoms;
  }

  private async performRootCauseAnalysis(
    testFailure: TestFailure,
    symptoms: string[]
  ): Promise<RootCauseAnalysis | null> {
    const symptomText = symptoms.join(' ').toLowerCase();

    // Match against known root cause categories
    const categories: Array<{
      category: string;
      patterns: string[];
      rootCause: string;
      impact: 'high' | 'medium' | 'low';
    }> = [
      {
        category: 'assertion',
        patterns: ['expect', 'assert', 'should', 'toBe', 'toEqual'],
        rootCause: 'Assertion failure - expected value mismatch',
        impact: 'high',
      },
      {
        category: 'null-reference',
        patterns: ['null', 'undefined', 'cannot read property', 'is not a function'],
        rootCause: 'Null or undefined reference error',
        impact: 'high',
      },
      {
        category: 'timeout',
        patterns: ['timeout', 'timed out', 'exceeded', 'too long'],
        rootCause: 'Operation timeout - async operation too slow',
        impact: 'medium',
      },
      {
        category: 'network',
        patterns: ['econnrefused', 'network', 'socket', 'connection'],
        rootCause: 'Network or connection error',
        impact: 'high',
      },
      {
        category: 'type-error',
        patterns: ['typeerror', 'type mismatch', 'invalid type'],
        rootCause: 'Type error - incorrect data type',
        impact: 'high',
      },
    ];

    let bestMatch: {
      category: string;
      rootCause: string;
      score: number;
      impact: 'high' | 'medium' | 'low';
    } | null = null;

    for (const cat of categories) {
      const matchCount = cat.patterns.filter((p) =>
        symptomText.includes(p)
      ).length;
      const score = matchCount / cat.patterns.length;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          category: cat.category,
          rootCause: cat.rootCause,
          score,
          impact: cat.impact,
        };
      }
    }

    if (!bestMatch || bestMatch.score < 0.2) {
      return null;
    }

    const contributingFactors: ContributingFactor[] = [
      {
        factor: `Error category: ${bestMatch.category}`,
        impact: bestMatch.impact,
        evidence: symptoms.slice(0, 3),
      },
    ];

    return {
      defectId: testFailure.testId,
      rootCause: bestMatch.rootCause,
      confidence: bestMatch.score,
      contributingFactors,
      relatedFiles: [testFailure.file],
      recommendations: this.getRootCauseRecommendations(bestMatch.category),
      timeline: [],
    };
  }

  private getRootCauseRecommendations(category: string): string[] {
    const recommendations: Record<string, string[]> = {
      assertion: [
        'Review expected vs actual values',
        'Check for race conditions in state setup',
        'Verify test data correctness',
      ],
      'null-reference': [
        'Add null checks before accessing properties',
        'Verify object initialization order',
        'Use optional chaining (?.) for safe access',
      ],
      timeout: [
        'Increase timeout for slow operations',
        'Add explicit waits for async conditions',
        'Check for deadlocks or infinite loops',
      ],
      network: [
        'Mock external services in tests',
        'Verify service availability',
        'Add retry logic for transient failures',
      ],
      'type-error': [
        'Verify input data types',
        'Add type validation',
        'Check for undefined parameters',
      ],
    };

    return recommendations[category] ?? ['Manual investigation required'];
  }

  private async analyzeRegression(
    testFailure: TestFailure
  ): Promise<RegressionRisk | null> {
    try {
      // Check for recent changes to the test file
      const changesKey = `code-intelligence:changes:${testFailure.file}`;
      const recentChanges = await this.memory.get<string[]>(changesKey);

      if (!recentChanges || recentChanges.length === 0) {
        return null;
      }

      // Calculate risk based on change recency
      const risk = Math.min(1, recentChanges.length * 0.2);

      return {
        overallRisk: risk,
        riskLevel: this.riskToSeverity(risk),
        impactedAreas: [
          {
            area: testFailure.file,
            files: [testFailure.file],
            risk,
            reason: `${recentChanges.length} recent changes`,
          },
        ],
        recommendedTests: [testFailure.testId],
        confidence: 0.7,
      };
    } catch {
      return null;
    }
  }

  private async getCoverageContext(
    file: string
  ): Promise<CoverageContext | null> {
    try {
      const coverageKey = `coverage-analysis:file:${file}`;
      const coverage = await this.memory.get<{
        line: number;
        branch: number;
        uncoveredLines: number[];
      }>(coverageKey);

      if (!coverage) {
        return null;
      }

      // Calculate risk based on coverage
      const avgCoverage = (coverage.line + coverage.branch) / 2;
      const riskScore = 1 - avgCoverage / 100;

      return {
        file,
        lineCoverage: coverage.line,
        branchCoverage: coverage.branch,
        uncoveredLines: coverage.uncoveredLines,
        riskScore,
      };
    } catch {
      return null;
    }
  }

  private async getImpactAnalysis(
    file: string
  ): Promise<ImpactAnalysis | null> {
    try {
      const impactKey = `code-intelligence:impact:${file}`;
      const impact = await this.memory.get<ImpactAnalysis>(impactKey);
      return impact ?? null;
    } catch {
      return null;
    }
  }

  private async findTestsInSameFile(
    file: string
  ): Promise<Array<{ testId: string; testName: string }>> {
    try {
      const testsKey = `test-execution:tests-by-file:${file}`;
      const tests = await this.memory.get<
        Array<{ testId: string; testName: string }>
      >(testsKey);
      return tests ?? [];
    } catch {
      return [];
    }
  }

  private async findTestsWithSimilarErrors(
    _error: string,
    rootCause: string
  ): Promise<
    Array<{ testId: string; testName: string; file: string; similarity: number }>
  > {
    try {
      const results: Array<{
        testId: string;
        testName: string;
        file: string;
        similarity: number;
      }> = [];

      // Search memory for similar error patterns
      const keys = await this.memory.search(`${this.config.namespace}:investigation:*`, 50);

      for (const key of keys) {
        const investigation = await this.memory.get<{
          testId: string;
          file: string;
          rootCause?: string;
        }>(key);

        if (investigation && investigation.rootCause === rootCause) {
          results.push({
            testId: investigation.testId,
            testName: investigation.testId,
            file: investigation.file,
            similarity: 0.7,
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  private async findDependentTests(
    file: string
  ): Promise<Array<{ testId: string; testName: string; file: string }>> {
    try {
      const depsKey = `code-intelligence:test-dependencies:${file}`;
      const deps = await this.memory.get<
        Array<{ testId: string; testName: string; file: string }>
      >(depsKey);
      return deps ?? [];
    } catch {
      return [];
    }
  }

  private createFlakyRecommendation(
    flakyAnalysis: FlakyTestAnalysis,
    _testFailure: TestFailure
  ): DefectRecommendation {
    const pattern = flakyAnalysis.pattern ?? 'unknown';

    return {
      type: flakyAnalysis.failureRate && flakyAnalysis.failureRate > 0.5 ? 'quarantine' : 'retry',
      priority: flakyAnalysis.failureRate && flakyAnalysis.failureRate > 0.5 ? 'high' : 'medium',
      description: `Flaky test (${pattern} pattern, ${Math.round((flakyAnalysis.failureRate ?? 0) * 100)}% failure rate)`,
      action: flakyAnalysis.recommendation ?? 'Investigate and stabilize test',
      effort: pattern === 'unknown' ? 'high' : 'medium',
      confidence: flakyAnalysis.confidence,
    };
  }

  private createRootCauseRecommendations(
    rootCause: RootCauseAnalysis,
    _testFailure: TestFailure
  ): DefectRecommendation[] {
    return rootCause.recommendations.slice(0, 3).map((rec, index) => ({
      type: 'fix' as const,
      priority: (index === 0 ? 'high' : index === 1 ? 'medium' : 'low') as
        | 'high'
        | 'medium'
        | 'low',
      description: rec,
      action: rec,
      effort: 'medium' as const,
      confidence: rootCause.confidence * (1 - index * 0.1),
    }));
  }

  private calculateOverallConfidence(
    flakyAnalysis: FlakyTestAnalysis,
    rootCause: RootCauseAnalysis | null,
    recommendations: DefectRecommendation[]
  ): number {
    const weights = {
      flaky: 0.3,
      rootCause: 0.4,
      recommendations: 0.3,
    };

    let confidence = 0;

    // Flaky analysis confidence
    confidence += flakyAnalysis.confidence * weights.flaky;

    // Root cause confidence
    if (rootCause) {
      confidence += rootCause.confidence * weights.rootCause;
    } else {
      confidence += 0.3 * weights.rootCause; // Base confidence if no root cause
    }

    // Recommendations confidence (average of top recommendations)
    if (recommendations.length > 0) {
      const avgRecConfidence =
        recommendations.slice(0, 3).reduce((sum, r) => sum + r.confidence, 0) /
        Math.min(3, recommendations.length);
      confidence += avgRecConfidence * weights.recommendations;
    } else {
      confidence += 0.3 * weights.recommendations;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  private riskToSeverity(risk: number): Severity {
    if (risk >= 0.8) return 'critical';
    if (risk >= 0.6) return 'high';
    if (risk >= 0.4) return 'medium';
    if (risk >= 0.2) return 'low';
    return 'info';
  }

  private average(values: number[]): number {
    return values.length === 0
      ? 0
      : values.reduce((a, b) => a + b, 0) / values.length;
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

interface TestExecutionHistory {
  runId: string;
  passed: boolean;
  duration: number;
  error?: string;
  timestamp: Date;
}

interface PatternStats {
  patterns: Record<string, number>;
  totalInvestigations: number;
}
