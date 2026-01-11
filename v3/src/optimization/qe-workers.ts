/**
 * QE Optimization Workers
 * ADR-024: Self-Optimization Engine
 *
 * Background workers for QE-specific optimization tasks:
 * - Pattern consolidation
 * - Coverage gap scanning
 * - Flaky test detection
 * - Routing accuracy monitoring
 */

import { BaseWorker } from '../workers/base-worker.js';
import type {
  WorkerConfig,
  WorkerResult,
  WorkerContext,
  WorkerFinding,
  WorkerRecommendation,
} from '../workers/interfaces.js';

// ============================================================================
// Worker Configurations
// ============================================================================

/**
 * QE optimization worker configurations
 */
export const QE_OPTIMIZATION_WORKER_CONFIGS: Record<string, Omit<WorkerConfig, 'id'>> = {
  'pattern-consolidator': {
    name: 'Pattern Consolidator',
    description: 'Consolidates and prunes patterns in the ReasoningBank for optimal memory usage',
    intervalMs: 30 * 60 * 1000, // 30 minutes
    priority: 'normal',
    targetDomains: ['learning-optimization'],
    enabled: true,
    timeoutMs: 60 * 1000, // 1 minute
    retryCount: 2,
    retryDelayMs: 5000,
  },
  'coverage-gap-scanner': {
    name: 'Coverage Gap Scanner',
    description: 'Scans codebase for coverage gaps and identifies untested code',
    intervalMs: 60 * 60 * 1000, // 1 hour
    priority: 'high',
    targetDomains: ['coverage-analysis', 'test-generation'],
    enabled: true,
    timeoutMs: 120 * 1000, // 2 minutes
    retryCount: 2,
    retryDelayMs: 10000,
  },
  'flaky-test-detector': {
    name: 'Flaky Test Detector',
    description: 'Detects flaky tests by analyzing test execution history and patterns',
    intervalMs: 2 * 60 * 60 * 1000, // 2 hours
    priority: 'high',
    targetDomains: ['test-execution', 'defect-intelligence'],
    enabled: true,
    timeoutMs: 180 * 1000, // 3 minutes
    retryCount: 1,
    retryDelayMs: 15000,
  },
  'routing-accuracy-monitor': {
    name: 'Routing Accuracy Monitor',
    description: 'Monitors agent routing accuracy and provides improvement recommendations',
    intervalMs: 15 * 60 * 1000, // 15 minutes
    priority: 'critical',
    targetDomains: ['learning-optimization', 'quality-assessment'],
    enabled: true,
    timeoutMs: 30 * 1000, // 30 seconds
    retryCount: 3,
    retryDelayMs: 3000,
  },
};

// ============================================================================
// Pattern Consolidator Worker
// ============================================================================

/**
 * Dependencies for pattern consolidator
 */
export interface PatternConsolidatorDeps {
  consolidatePatterns: () => Promise<{
    merged: number;
    pruned: number;
    updated: number;
  }>;
  getPatternStats: () => Promise<{
    total: number;
    duplicateGroups: number;
    lowQuality: number;
  }>;
}

/**
 * Worker that consolidates and prunes patterns in the ReasoningBank
 */
export class PatternConsolidatorWorker extends BaseWorker {
  private deps: PatternConsolidatorDeps;

  constructor(deps: PatternConsolidatorDeps) {
    super({
      id: 'pattern-consolidator',
      ...QE_OPTIMIZATION_WORKER_CONFIGS['pattern-consolidator'],
    });
    this.deps = deps;
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    try {
      // Get current pattern stats
      const beforeStats = await this.deps.getPatternStats();
      context.logger.info(`Pattern stats before: ${JSON.stringify(beforeStats)}`);

      // Run consolidation
      const result = await this.deps.consolidatePatterns();

      // Get stats after consolidation
      const afterStats = await this.deps.getPatternStats();

      // Record findings
      if (result.merged > 0) {
        findings.push({
          type: 'pattern-merged',
          severity: 'info',
          domain: 'learning-optimization',
          title: 'Patterns Merged',
          description: `Merged ${result.merged} duplicate pattern groups`,
          resource: 'ReasoningBank',
        });
      }

      if (result.pruned > 0) {
        findings.push({
          type: 'pattern-pruned',
          severity: 'info',
          domain: 'learning-optimization',
          title: 'Patterns Pruned',
          description: `Pruned ${result.pruned} low-quality patterns`,
          resource: 'ReasoningBank',
        });
      }

      // Generate recommendations
      if (afterStats.duplicateGroups > 10) {
        recommendations.push({
          priority: 'p2',
          domain: 'learning-optimization',
          action: 'Review patterns with similar embeddings',
          description: `${afterStats.duplicateGroups} potential duplicate groups remain. Consider manual review.`,
          estimatedImpact: 'medium',
          effort: 'medium',
          autoFixable: false,
        });
      }

      if (afterStats.lowQuality > afterStats.total * 0.2) {
        recommendations.push({
          priority: 'p1',
          domain: 'learning-optimization',
          action: 'Review pattern quality thresholds',
          description: `${afterStats.lowQuality} low-quality patterns (${((afterStats.lowQuality / afterStats.total) * 100).toFixed(1)}% of total)`,
          estimatedImpact: 'high',
          effort: 'low',
          autoFixable: true,
        });
      }

      const durationMs = Date.now() - startTime;
      return this.createResult(
        durationMs,
        {
          itemsAnalyzed: beforeStats.total,
          issuesFound: result.merged + result.pruned,
          healthScore: Math.max(0, 100 - afterStats.duplicateGroups - afterStats.lowQuality),
          trend: result.merged + result.pruned > 0 ? 'improving' : 'stable',
          domainMetrics: {
            patternsMerged: result.merged,
            patternsPruned: result.pruned,
            patternsUpdated: result.updated,
            totalPatterns: afterStats.total,
          },
        },
        findings,
        recommendations
      );
    } catch (error) {
      throw error;
    }
  }
}

// ============================================================================
// Coverage Gap Scanner Worker
// ============================================================================

/**
 * Dependencies for coverage gap scanner
 */
export interface CoverageGapScannerDeps {
  findCoverageGaps: () => Promise<Array<{
    file: string;
    type: 'uncovered-lines' | 'uncovered-branches' | 'uncovered-functions';
    startLine: number;
    endLine: number;
    riskScore: number;
  }>>;
  prioritizeGaps: (gaps: Array<{ file: string; riskScore: number }>) => Promise<Array<{
    file: string;
    priority: number;
    reason: string;
  }>>;
  queueCoverageTask: (task: { file: string; priority: number }) => Promise<void>;
}

/**
 * Worker that scans for coverage gaps and queues improvement tasks
 */
export class CoverageGapScannerWorker extends BaseWorker {
  private deps: CoverageGapScannerDeps;

  constructor(deps: CoverageGapScannerDeps) {
    super({
      id: 'coverage-gap-scanner',
      ...QE_OPTIMIZATION_WORKER_CONFIGS['coverage-gap-scanner'],
    });
    this.deps = deps;
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    try {
      // Find all coverage gaps
      const gaps = await this.deps.findCoverageGaps();
      context.logger.info(`Found ${gaps.length} coverage gaps`);

      // Prioritize gaps
      const prioritized = await this.deps.prioritizeGaps(
        gaps.map(g => ({ file: g.file, riskScore: g.riskScore }))
      );

      // Group gaps by file
      const gapsByFile = new Map<string, typeof gaps>();
      for (const gap of gaps) {
        const existing = gapsByFile.get(gap.file) || [];
        existing.push(gap);
        gapsByFile.set(gap.file, existing);
      }

      // Create findings for high-risk gaps
      const highRiskGaps = gaps.filter(g => g.riskScore > 0.7);
      for (const gap of highRiskGaps.slice(0, 10)) {
        findings.push({
          type: 'coverage-gap',
          severity: gap.riskScore > 0.9 ? 'critical' : 'high',
          domain: 'coverage-analysis',
          title: `High-Risk Coverage Gap: ${gap.file}`,
          description: `${gap.type} at lines ${gap.startLine}-${gap.endLine} (risk: ${(gap.riskScore * 100).toFixed(0)}%)`,
          resource: `${gap.file}:${gap.startLine}`,
        });
      }

      // Queue top priority tasks
      const topPriority = prioritized.slice(0, 5);
      for (const task of topPriority) {
        await this.deps.queueCoverageTask({
          file: task.file,
          priority: task.priority,
        });
      }

      // Generate recommendations
      if (highRiskGaps.length > 20) {
        recommendations.push({
          priority: 'p0',
          domain: 'coverage-analysis',
          action: 'Dedicate sprint time to coverage improvement',
          description: `${highRiskGaps.length} high-risk coverage gaps detected`,
          estimatedImpact: 'high',
          effort: 'high',
          autoFixable: false,
        });
      }

      const uncoveredFunctions = gaps.filter(g => g.type === 'uncovered-functions');
      if (uncoveredFunctions.length > 10) {
        recommendations.push({
          priority: 'p1',
          domain: 'test-generation',
          action: 'Generate unit tests for untested functions',
          description: `${uncoveredFunctions.length} functions have no test coverage`,
          estimatedImpact: 'high',
          effort: 'medium',
          autoFixable: true,
        });
      }

      const durationMs = Date.now() - startTime;
      return this.createResult(
        durationMs,
        {
          itemsAnalyzed: gapsByFile.size,
          issuesFound: gaps.length,
          healthScore: Math.max(0, 100 - (highRiskGaps.length * 2)),
          trend: gaps.length > 50 ? 'degrading' : 'stable',
          domainMetrics: {
            totalGaps: gaps.length,
            highRiskGaps: highRiskGaps.length,
            filesAffected: gapsByFile.size,
            tasksQueued: topPriority.length,
          },
        },
        findings,
        recommendations
      );
    } catch (error) {
      throw error;
    }
  }
}

// ============================================================================
// Flaky Test Detector Worker
// ============================================================================

/**
 * Dependencies for flaky test detector
 */
export interface FlakyTestDetectorDeps {
  getTestHistory: () => Promise<Array<{
    testId: string;
    testName: string;
    filePath: string;
    runs: number;
    passes: number;
    failures: number;
    avgDuration: number;
    durationVariance: number;
  }>>;
  queueFlakyTestFix: (task: {
    testId: string;
    flakinessScore: number;
    reason: string;
  }) => Promise<void>;
}

/**
 * Worker that detects flaky tests and queues fix tasks
 */
export class FlakyTestDetectorWorker extends BaseWorker {
  private deps: FlakyTestDetectorDeps;

  constructor(deps: FlakyTestDetectorDeps) {
    super({
      id: 'flaky-test-detector',
      ...QE_OPTIMIZATION_WORKER_CONFIGS['flaky-test-detector'],
    });
    this.deps = deps;
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    try {
      // Get test history
      const testHistory = await this.deps.getTestHistory();
      context.logger.info(`Analyzing ${testHistory.length} tests for flakiness`);

      // Detect flaky tests
      const flakyTests: Array<{
        testId: string;
        testName: string;
        filePath: string;
        flakinessScore: number;
        reason: string;
      }> = [];

      for (const test of testHistory) {
        if (test.runs < 5) continue; // Need enough data

        const passRate = test.passes / test.runs;
        const durationCoefficient = Math.sqrt(test.durationVariance) / test.avgDuration;

        // Flakiness indicators
        let flakinessScore = 0;
        const reasons: string[] = [];

        // Inconsistent pass/fail rate (not 100% pass or 100% fail)
        if (passRate > 0.05 && passRate < 0.95) {
          flakinessScore += (1 - Math.abs(passRate - 0.5) * 2) * 0.5;
          reasons.push(`Inconsistent pass rate: ${(passRate * 100).toFixed(1)}%`);
        }

        // High duration variance
        if (durationCoefficient > 0.5) {
          flakinessScore += Math.min(durationCoefficient * 0.3, 0.3);
          reasons.push(`High duration variance: ${(durationCoefficient * 100).toFixed(0)}%`);
        }

        // Recent failures after passing
        if (test.failures > 0 && test.passes > 0) {
          flakinessScore += 0.2;
          reasons.push('Mix of passes and failures');
        }

        if (flakinessScore > 0.3) {
          flakyTests.push({
            testId: test.testId,
            testName: test.testName,
            filePath: test.filePath,
            flakinessScore: Math.min(flakinessScore, 1),
            reason: reasons.join('; '),
          });
        }
      }

      // Sort by flakiness score
      flakyTests.sort((a, b) => b.flakinessScore - a.flakinessScore);

      // Create findings
      for (const test of flakyTests.slice(0, 15)) {
        findings.push({
          type: 'flaky-test',
          severity: test.flakinessScore > 0.7 ? 'high' : 'medium',
          domain: 'test-execution',
          title: `Flaky Test: ${test.testName}`,
          description: test.reason,
          resource: test.filePath,
          context: {
            testId: test.testId,
            flakinessScore: test.flakinessScore,
          },
        });
      }

      // Queue fix tasks for worst offenders
      for (const test of flakyTests.slice(0, 5)) {
        await this.deps.queueFlakyTestFix({
          testId: test.testId,
          flakinessScore: test.flakinessScore,
          reason: test.reason,
        });
      }

      // Generate recommendations
      if (flakyTests.length > 10) {
        recommendations.push({
          priority: 'p1',
          domain: 'test-execution',
          action: 'Implement test quarantine and systematic fixes',
          description: `${flakyTests.length} flaky tests detected. CI reliability at risk.`,
          estimatedImpact: 'high',
          effort: 'medium',
          autoFixable: false,
        });
      }

      const highVarianceTests = testHistory.filter(
        t => Math.sqrt(t.durationVariance) / t.avgDuration > 0.8
      );
      if (highVarianceTests.length > 5) {
        recommendations.push({
          priority: 'p2',
          domain: 'test-execution',
          action: 'Review tests for timing-dependent code or resource contention',
          description: `${highVarianceTests.length} tests have inconsistent execution times`,
          estimatedImpact: 'medium',
          effort: 'medium',
          autoFixable: false,
        });
      }

      const durationMs = Date.now() - startTime;
      return this.createResult(
        durationMs,
        {
          itemsAnalyzed: testHistory.length,
          issuesFound: flakyTests.length,
          healthScore: Math.max(0, 100 - (flakyTests.length * 3)),
          trend: flakyTests.length > 20 ? 'degrading' : 'stable',
          domainMetrics: {
            testsAnalyzed: testHistory.length,
            flakyTests: flakyTests.length,
            highFlakinessTests: flakyTests.filter(t => t.flakinessScore > 0.7).length,
            tasksQueued: Math.min(5, flakyTests.length),
          },
        },
        findings,
        recommendations
      );
    } catch (error) {
      throw error;
    }
  }
}

// ============================================================================
// Routing Accuracy Monitor Worker
// ============================================================================

/**
 * Dependencies for routing accuracy monitor
 */
export interface RoutingAccuracyMonitorDeps {
  getRoutingStats: (periodMs: number) => Promise<{
    totalDecisions: number;
    followedRecommendations: number;
    successWhenFollowed: number;
    successWhenOverridden: number;
    avgConfidence: number;
    confidenceCorrelation: number;
  }>;
  retrainRouter: () => Promise<{
    success: boolean;
    patternsUsed: number;
    accuracy: number;
  }>;
}

/**
 * Worker that monitors routing accuracy and triggers retraining
 */
export class RoutingAccuracyMonitorWorker extends BaseWorker {
  private deps: RoutingAccuracyMonitorDeps;
  private accuracyThreshold = 0.8;

  constructor(deps: RoutingAccuracyMonitorDeps) {
    super({
      id: 'routing-accuracy-monitor',
      ...QE_OPTIMIZATION_WORKER_CONFIGS['routing-accuracy-monitor'],
    });
    this.deps = deps;
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    try {
      // Get routing stats for the last hour
      const stats = await this.deps.getRoutingStats(60 * 60 * 1000);
      context.logger.info(`Routing stats: ${JSON.stringify(stats)}`);

      // Calculate accuracy
      const followRate = stats.totalDecisions > 0
        ? stats.followedRecommendations / stats.totalDecisions
        : 0;
      const accuracy = stats.followedRecommendations > 0
        ? stats.successWhenFollowed / stats.followedRecommendations
        : 0;

      // Check if retraining is needed
      let retrainResult: { success: boolean; patternsUsed: number; accuracy: number } | null = null;
      if (accuracy < this.accuracyThreshold && stats.totalDecisions > 10) {
        context.logger.info(`Accuracy ${accuracy.toFixed(2)} below threshold ${this.accuracyThreshold}, triggering retrain`);
        retrainResult = await this.deps.retrainRouter();

        findings.push({
          type: 'router-retrained',
          severity: 'medium',
          domain: 'learning-optimization',
          title: 'Router Retrained',
          description: `Retrained with ${retrainResult.patternsUsed} patterns. New accuracy: ${(retrainResult.accuracy * 100).toFixed(1)}%`,
          resource: 'QERouter',
        });
      }

      // Generate findings for concerning patterns
      if (followRate < 0.5 && stats.totalDecisions > 20) {
        findings.push({
          type: 'low-follow-rate',
          severity: 'high',
          domain: 'learning-optimization',
          title: 'Low Recommendation Follow Rate',
          description: `Only ${(followRate * 100).toFixed(1)}% of recommendations are being followed`,
          resource: 'QERouter',
        });
      }

      if (stats.successWhenOverridden > stats.successWhenFollowed && stats.totalDecisions > 20) {
        findings.push({
          type: 'override-better',
          severity: 'critical',
          domain: 'learning-optimization',
          title: 'Override Success Higher Than Follow',
          description: 'Overriding recommendations leads to better outcomes than following them',
          resource: 'QERouter',
        });
      }

      if (stats.confidenceCorrelation < 0.3 && stats.totalDecisions > 30) {
        findings.push({
          type: 'low-correlation',
          severity: 'medium',
          domain: 'learning-optimization',
          title: 'Low Confidence-Success Correlation',
          description: `Confidence scores poorly predict success (correlation: ${stats.confidenceCorrelation.toFixed(2)})`,
          resource: 'QERouter',
        });
      }

      // Generate recommendations
      if (accuracy < this.accuracyThreshold) {
        recommendations.push({
          priority: 'p1',
          domain: 'learning-optimization',
          action: 'Review and augment training patterns',
          description: `Current accuracy ${(accuracy * 100).toFixed(1)}% is below ${(this.accuracyThreshold * 100).toFixed(0)}% threshold`,
          estimatedImpact: 'high',
          effort: 'medium',
          autoFixable: false,
        });
      }

      if (followRate < 0.7) {
        recommendations.push({
          priority: 'p2',
          domain: 'learning-optimization',
          action: 'Analyze override patterns to improve routing logic',
          description: 'Users frequently override recommendations',
          estimatedImpact: 'medium',
          effort: 'low',
          autoFixable: false,
        });
      }

      const durationMs = Date.now() - startTime;
      const healthScore = Math.round(
        (accuracy * 50) + (followRate * 30) + (stats.confidenceCorrelation * 20)
      );

      return this.createResult(
        durationMs,
        {
          itemsAnalyzed: stats.totalDecisions,
          issuesFound: findings.filter(f => f.type === 'issue' || f.type === 'warning').length,
          healthScore: Math.max(0, Math.min(100, healthScore)),
          trend: accuracy < this.accuracyThreshold ? 'degrading' : 'stable',
          domainMetrics: {
            totalDecisions: stats.totalDecisions,
            accuracy: Math.round(accuracy * 100),
            followRate: Math.round(followRate * 100),
            confidenceCorrelation: stats.confidenceCorrelation,
            retrainTriggered: retrainResult !== null ? 1 : 0,
          },
        },
        findings,
        recommendations
      );
    } catch (error) {
      throw error;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create pattern consolidator worker
 */
export function createPatternConsolidatorWorker(
  deps: PatternConsolidatorDeps
): PatternConsolidatorWorker {
  return new PatternConsolidatorWorker(deps);
}

/**
 * Create coverage gap scanner worker
 */
export function createCoverageGapScannerWorker(
  deps: CoverageGapScannerDeps
): CoverageGapScannerWorker {
  return new CoverageGapScannerWorker(deps);
}

/**
 * Create flaky test detector worker
 */
export function createFlakyTestDetectorWorker(
  deps: FlakyTestDetectorDeps
): FlakyTestDetectorWorker {
  return new FlakyTestDetectorWorker(deps);
}

/**
 * Create routing accuracy monitor worker
 */
export function createRoutingAccuracyMonitorWorker(
  deps: RoutingAccuracyMonitorDeps
): RoutingAccuracyMonitorWorker {
  return new RoutingAccuracyMonitorWorker(deps);
}
