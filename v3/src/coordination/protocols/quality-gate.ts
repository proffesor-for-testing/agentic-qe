/**
 * Agentic QE v3 - Quality Gate Protocol
 * Cross-domain protocol for release candidate quality gate evaluation
 *
 * Trigger: Release candidate event
 * Participants: Queen, Quality Gate, Coverage, Regression, Security domains
 * Actions: Aggregate metrics, evaluate, ML risk assessment, recommend
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  ok,
  err,
  DomainName,
  Severity,
} from '../../shared/types';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces';
import { createEvent } from '../../shared/events/domain-events';

// ============================================================================
// Protocol Events
// ============================================================================

export const QualityGateProtocolEvents = {
  QualityGateTriggered: 'coordination.QualityGateTriggered',
  QualityGateCompleted: 'coordination.QualityGateCompleted',
  DeploymentApproved: 'coordination.DeploymentApproved',
  DeploymentBlocked: 'coordination.DeploymentBlocked',
} as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Release candidate information
 */
export interface ReleaseCandidate {
  id: string;
  version: string;
  branch: string;
  commitHash: string;
  buildId?: string;
  artifacts?: string[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated metrics from all participating domains
 */
export interface AggregatedMetrics {
  // Coverage metrics
  coverage: {
    line: number;
    branch: number;
    function: number;
    statement: number;
    trend: 'improving' | 'declining' | 'stable';
  };

  // Test execution metrics
  testExecution: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    flakyTests: number;
    duration: number;
  };

  // Quality metrics
  quality: {
    overallScore: number;
    technicalDebt: number;
    codeSmells: number;
    duplications: number;
    criticalBugs: number;
  };

  // Security metrics
  security: {
    vulnerabilities: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    complianceScore: number;
    lastAuditDate?: Date;
  };

  // Defect intelligence metrics
  defects: {
    regressionRisk: number;
    predictedDefects: number;
    hotspotCount: number;
  };

  // Metadata
  collectedAt: Date;
  sources: DomainName[];
}

/**
 * Quality gate check result
 */
export interface GateCheckResult {
  name: string;
  category: 'coverage' | 'tests' | 'quality' | 'security' | 'regression';
  passed: boolean;
  blocking: boolean;
  value: number;
  threshold: number;
  severity: Severity;
  message: string;
}

/**
 * ML-based risk assessment result
 */
export interface RiskAssessment {
  overallRisk: number;
  riskLevel: Severity;
  confidence: number;
  factors: RiskFactor[];
  historicalComparison?: {
    similarReleases: number;
    successRate: number;
  };
  predictions: {
    defectProbability: number;
    rollbackProbability: number;
    incidentProbability: number;
  };
}

export interface RiskFactor {
  name: string;
  contribution: number;
  description: string;
  mitigationSuggestion?: string;
}

/**
 * Quality gate recommendation
 */
export interface QualityGateRecommendation {
  decision: 'approved' | 'blocked' | 'conditional';
  confidence: number;
  summary: string;
  blockingIssues: string[];
  warnings: string[];
  conditions?: string[];
  rollbackPlan?: string;
  nextSteps: string[];
}

/**
 * Complete quality gate evaluation result
 */
export interface QualityGateEvaluation {
  id: string;
  releaseCandidate: ReleaseCandidate;
  metrics: AggregatedMetrics;
  checks: GateCheckResult[];
  riskAssessment: RiskAssessment;
  recommendation: QualityGateRecommendation;
  duration: number;
  evaluatedAt: Date;
}

/**
 * Configuration for quality gate thresholds
 */
export interface QualityGateThresholds {
  coverage: {
    line: { min: number; blocking: boolean };
    branch: { min: number; blocking: boolean };
  };
  tests: {
    passRate: { min: number; blocking: boolean };
    maxFlakyTests: { max: number; blocking: boolean };
  };
  quality: {
    minScore: { min: number; blocking: boolean };
    maxCriticalBugs: { max: number; blocking: boolean };
  };
  security: {
    maxCriticalVulns: { max: number; blocking: boolean };
    maxHighVulns: { max: number; blocking: boolean };
    minComplianceScore: { min: number; blocking: boolean };
  };
  regression: {
    maxRisk: { max: number; blocking: boolean };
  };
}

/**
 * Protocol configuration
 */
export interface QualityGateProtocolConfig {
  thresholds: QualityGateThresholds;
  enableMLRiskAssessment: boolean;
  publishEvents: boolean;
  timeout: number;
  parallelMetricsCollection: boolean;
  storeEvaluationHistory: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_THRESHOLDS: QualityGateThresholds = {
  coverage: {
    line: { min: 80, blocking: true },
    branch: { min: 70, blocking: false },
  },
  tests: {
    passRate: { min: 100, blocking: true },
    maxFlakyTests: { max: 5, blocking: false },
  },
  quality: {
    minScore: { min: 70, blocking: false },
    maxCriticalBugs: { max: 0, blocking: true },
  },
  security: {
    maxCriticalVulns: { max: 0, blocking: true },
    maxHighVulns: { max: 3, blocking: false },
    minComplianceScore: { min: 80, blocking: false },
  },
  regression: {
    maxRisk: { max: 0.7, blocking: false },
  },
};

const DEFAULT_CONFIG: QualityGateProtocolConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  enableMLRiskAssessment: true,
  publishEvents: true,
  timeout: 120000, // 2 minutes
  parallelMetricsCollection: true,
  storeEvaluationHistory: true,
};

// ============================================================================
// Protocol Interface
// ============================================================================

export interface IQualityGateProtocol {
  /**
   * Execute quality gate evaluation for a release candidate
   */
  execute(releaseCandidate: ReleaseCandidate): Promise<Result<QualityGateEvaluation, Error>>;

  /**
   * Aggregate metrics from all participating domains
   */
  aggregateMetrics(releaseCandidate: ReleaseCandidate): Promise<Result<AggregatedMetrics, Error>>;

  /**
   * Evaluate quality gate checks against aggregated metrics
   */
  evaluateGate(metrics: AggregatedMetrics): Promise<Result<GateCheckResult[], Error>>;

  /**
   * Perform ML-based deployment risk assessment
   */
  assessRisk(
    metrics: AggregatedMetrics,
    checks: GateCheckResult[]
  ): Promise<Result<RiskAssessment, Error>>;

  /**
   * Generate go/no-go recommendation
   */
  generateRecommendation(
    releaseCandidate: ReleaseCandidate,
    checks: GateCheckResult[],
    riskAssessment: RiskAssessment
  ): Promise<Result<QualityGateRecommendation, Error>>;

  /**
   * Get evaluation history for a release
   */
  getEvaluationHistory(releaseId: string): Promise<QualityGateEvaluation[]>;

  /**
   * Update thresholds configuration
   */
  updateThresholds(thresholds: Partial<QualityGateThresholds>): void;
}

// ============================================================================
// Protocol Implementation
// ============================================================================

export class QualityGateProtocol implements IQualityGateProtocol {
  private config: QualityGateProtocolConfig;
  private readonly participatingDomains: DomainName[] = [
    'quality-assessment',
    'coverage-analysis',
    'defect-intelligence',
    'security-compliance',
    'test-execution',
  ];

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<QualityGateProtocolConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        ...config.thresholds,
      },
    };
  }

  /**
   * Execute complete quality gate evaluation
   */
  async execute(
    releaseCandidate: ReleaseCandidate
  ): Promise<Result<QualityGateEvaluation, Error>> {
    const evaluationId = uuidv4();
    const startTime = Date.now();
    let spawnedAgentId: string | undefined;

    try {
      // Publish triggered event
      if (this.config.publishEvents) {
        await this.publishQualityGateTriggered(evaluationId, releaseCandidate);
      }

      // Spawn coordinator agent if available
      spawnedAgentId = await this.spawnCoordinatorAgent(evaluationId, releaseCandidate);

      // Step 1: Aggregate metrics from all participating domains
      const metricsResult = await this.aggregateMetrics(releaseCandidate);
      if (!metricsResult.success) {
        await this.publishGateCompleted(evaluationId, releaseCandidate, 'blocked', metricsResult.error.message);
        return err(metricsResult.error);
      }

      // Step 2: Evaluate quality gate checks
      const checksResult = await this.evaluateGate(metricsResult.value);
      if (!checksResult.success) {
        await this.publishGateCompleted(evaluationId, releaseCandidate, 'blocked', checksResult.error.message);
        return err(checksResult.error);
      }

      // Step 3: ML-based risk assessment
      const riskResult = await this.assessRisk(metricsResult.value, checksResult.value);
      if (!riskResult.success) {
        await this.publishGateCompleted(evaluationId, releaseCandidate, 'blocked', riskResult.error.message);
        return err(riskResult.error);
      }

      // Step 4: Generate recommendation
      const recommendationResult = await this.generateRecommendation(
        releaseCandidate,
        checksResult.value,
        riskResult.value
      );
      if (!recommendationResult.success) {
        await this.publishGateCompleted(evaluationId, releaseCandidate, 'blocked', recommendationResult.error.message);
        return err(recommendationResult.error);
      }

      const duration = Date.now() - startTime;

      const evaluation: QualityGateEvaluation = {
        id: evaluationId,
        releaseCandidate,
        metrics: metricsResult.value,
        checks: checksResult.value,
        riskAssessment: riskResult.value,
        recommendation: recommendationResult.value,
        duration,
        evaluatedAt: new Date(),
      };

      // Store evaluation history
      if (this.config.storeEvaluationHistory) {
        await this.storeEvaluation(evaluation);
      }

      // Publish completion events
      if (this.config.publishEvents) {
        await this.publishGateCompleted(
          evaluationId,
          releaseCandidate,
          recommendationResult.value.decision,
          recommendationResult.value.summary
        );

        if (recommendationResult.value.decision === 'approved') {
          await this.publishDeploymentApproved(evaluationId, releaseCandidate, recommendationResult.value);
        } else if (recommendationResult.value.decision === 'blocked') {
          await this.publishDeploymentBlocked(evaluationId, releaseCandidate, recommendationResult.value);
        }
      }

      // Cleanup spawned agent
      if (spawnedAgentId) {
        await this.stopCoordinatorAgent(spawnedAgentId);
      }

      return ok(evaluation);
    } catch (error) {
      // Cleanup on error
      if (spawnedAgentId) {
        await this.stopCoordinatorAgent(spawnedAgentId);
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.publishGateCompleted(evaluationId, releaseCandidate, 'blocked', errorMessage);
      return err(error instanceof Error ? error : new Error(errorMessage));
    }
  }

  /**
   * Aggregate metrics from all participating domains
   */
  async aggregateMetrics(
    releaseCandidate: ReleaseCandidate
  ): Promise<Result<AggregatedMetrics, Error>> {
    try {
      const sources: DomainName[] = [];

      // Collect metrics from each domain
      const [coverageData, testData, qualityData, securityData, defectData] =
        this.config.parallelMetricsCollection
          ? await Promise.all([
              this.getCoverageMetrics(releaseCandidate),
              this.getTestExecutionMetrics(releaseCandidate),
              this.getQualityMetrics(releaseCandidate),
              this.getSecurityMetrics(releaseCandidate),
              this.getDefectMetrics(releaseCandidate),
            ])
          : [
              await this.getCoverageMetrics(releaseCandidate),
              await this.getTestExecutionMetrics(releaseCandidate),
              await this.getQualityMetrics(releaseCandidate),
              await this.getSecurityMetrics(releaseCandidate),
              await this.getDefectMetrics(releaseCandidate),
            ];

      // Track which domains contributed data
      if (coverageData) sources.push('coverage-analysis');
      if (testData) sources.push('test-execution');
      if (qualityData) sources.push('quality-assessment');
      if (securityData) sources.push('security-compliance');
      if (defectData) sources.push('defect-intelligence');

      const metrics: AggregatedMetrics = {
        coverage: coverageData || {
          line: 0,
          branch: 0,
          function: 0,
          statement: 0,
          trend: 'stable',
        },
        testExecution: testData || {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          passRate: 0,
          flakyTests: 0,
          duration: 0,
        },
        quality: qualityData || {
          overallScore: 0,
          technicalDebt: 0,
          codeSmells: 0,
          duplications: 0,
          criticalBugs: 0,
        },
        security: securityData || {
          vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
          complianceScore: 0,
        },
        defects: defectData || {
          regressionRisk: 0,
          predictedDefects: 0,
          hotspotCount: 0,
        },
        collectedAt: new Date(),
        sources,
      };

      // Store aggregated metrics for reference
      await this.memory.set(
        `quality-gate:metrics:${releaseCandidate.id}`,
        metrics,
        { namespace: 'coordination', ttl: 86400 * 7 }
      );

      return ok(metrics);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Evaluate quality gate checks
   */
  async evaluateGate(
    metrics: AggregatedMetrics
  ): Promise<Result<GateCheckResult[], Error>> {
    try {
      const checks: GateCheckResult[] = [];
      const thresholds = this.config.thresholds;

      // Coverage checks
      checks.push(
        this.createCheck(
          'Line Coverage',
          'coverage',
          metrics.coverage.line,
          thresholds.coverage.line.min,
          thresholds.coverage.line.blocking,
          'min',
          'Line coverage percentage'
        )
      );

      checks.push(
        this.createCheck(
          'Branch Coverage',
          'coverage',
          metrics.coverage.branch,
          thresholds.coverage.branch.min,
          thresholds.coverage.branch.blocking,
          'min',
          'Branch coverage percentage'
        )
      );

      // Test execution checks
      checks.push(
        this.createCheck(
          'Test Pass Rate',
          'tests',
          metrics.testExecution.passRate,
          thresholds.tests.passRate.min,
          thresholds.tests.passRate.blocking,
          'min',
          'Percentage of tests passing'
        )
      );

      checks.push(
        this.createCheck(
          'Flaky Tests',
          'tests',
          metrics.testExecution.flakyTests,
          thresholds.tests.maxFlakyTests.max,
          thresholds.tests.maxFlakyTests.blocking,
          'max',
          'Number of flaky tests detected'
        )
      );

      // Quality checks
      checks.push(
        this.createCheck(
          'Quality Score',
          'quality',
          metrics.quality.overallScore,
          thresholds.quality.minScore.min,
          thresholds.quality.minScore.blocking,
          'min',
          'Overall code quality score'
        )
      );

      checks.push(
        this.createCheck(
          'Critical Bugs',
          'quality',
          metrics.quality.criticalBugs,
          thresholds.quality.maxCriticalBugs.max,
          thresholds.quality.maxCriticalBugs.blocking,
          'max',
          'Number of critical bugs'
        )
      );

      // Security checks
      checks.push(
        this.createCheck(
          'Critical Vulnerabilities',
          'security',
          metrics.security.vulnerabilities.critical,
          thresholds.security.maxCriticalVulns.max,
          thresholds.security.maxCriticalVulns.blocking,
          'max',
          'Critical security vulnerabilities'
        )
      );

      checks.push(
        this.createCheck(
          'High Vulnerabilities',
          'security',
          metrics.security.vulnerabilities.high,
          thresholds.security.maxHighVulns.max,
          thresholds.security.maxHighVulns.blocking,
          'max',
          'High severity vulnerabilities'
        )
      );

      checks.push(
        this.createCheck(
          'Compliance Score',
          'security',
          metrics.security.complianceScore,
          thresholds.security.minComplianceScore.min,
          thresholds.security.minComplianceScore.blocking,
          'min',
          'Security compliance score'
        )
      );

      // Regression risk check
      checks.push(
        this.createCheck(
          'Regression Risk',
          'regression',
          metrics.defects.regressionRisk,
          thresholds.regression.maxRisk.max,
          thresholds.regression.maxRisk.blocking,
          'max',
          'ML-predicted regression risk'
        )
      );

      return ok(checks);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * ML-based risk assessment
   */
  async assessRisk(
    metrics: AggregatedMetrics,
    checks: GateCheckResult[]
  ): Promise<Result<RiskAssessment, Error>> {
    try {
      if (!this.config.enableMLRiskAssessment) {
        // Return basic risk assessment without ML
        return ok(this.createBasicRiskAssessment(metrics, checks));
      }

      // Calculate risk factors
      const factors = this.calculateRiskFactors(metrics, checks);

      // Calculate overall risk score (weighted average)
      const overallRisk = this.calculateOverallRisk(factors);

      // Determine risk level
      const riskLevel = this.riskScoreToSeverity(overallRisk);

      // Get historical comparison
      const historicalComparison = await this.getHistoricalComparison(metrics);

      // Calculate predictions
      const predictions = this.calculatePredictions(metrics, overallRisk, historicalComparison);

      // Calculate confidence based on data quality
      const confidence = this.calculateConfidence(metrics, historicalComparison);

      const assessment: RiskAssessment = {
        overallRisk,
        riskLevel,
        confidence,
        factors,
        historicalComparison,
        predictions,
      };

      return ok(assessment);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate go/no-go recommendation
   */
  async generateRecommendation(
    releaseCandidate: ReleaseCandidate,
    checks: GateCheckResult[],
    riskAssessment: RiskAssessment
  ): Promise<Result<QualityGateRecommendation, Error>> {
    try {
      // Separate blocking and warning issues
      const blockingIssues: string[] = [];
      const warnings: string[] = [];

      for (const check of checks) {
        if (!check.passed) {
          if (check.blocking) {
            blockingIssues.push(`${check.name}: ${check.message} (${check.value} vs threshold ${check.threshold})`);
          } else {
            warnings.push(`${check.name}: ${check.message} (${check.value} vs threshold ${check.threshold})`);
          }
        }
      }

      // Add risk-based warnings
      if (riskAssessment.overallRisk > 0.5) {
        warnings.push(`High deployment risk detected (${Math.round(riskAssessment.overallRisk * 100)}%)`);
      }

      for (const factor of riskAssessment.factors) {
        if (factor.contribution > 0.2) {
          warnings.push(`Risk factor: ${factor.description}`);
        }
      }

      // Determine decision
      let decision: QualityGateRecommendation['decision'];
      if (blockingIssues.length > 0) {
        decision = 'blocked';
      } else if (warnings.length > 0 || riskAssessment.riskLevel === 'high') {
        decision = 'conditional';
      } else {
        decision = 'approved';
      }

      // Generate summary
      const summary = this.generateSummary(decision, blockingIssues, warnings, riskAssessment);

      // Generate conditions for conditional approval
      const conditions = decision === 'conditional'
        ? this.generateConditions(warnings, riskAssessment)
        : undefined;

      // Generate rollback plan
      const rollbackPlan = decision !== 'blocked'
        ? this.generateRollbackPlan(releaseCandidate)
        : undefined;

      // Generate next steps
      const nextSteps = this.generateNextSteps(decision, blockingIssues, warnings);

      // Calculate confidence
      const confidence = this.calculateRecommendationConfidence(
        checks,
        riskAssessment,
        blockingIssues.length === 0
      );

      const recommendation: QualityGateRecommendation = {
        decision,
        confidence,
        summary,
        blockingIssues,
        warnings,
        conditions,
        rollbackPlan,
        nextSteps,
      };

      return ok(recommendation);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get evaluation history for a release
   */
  async getEvaluationHistory(releaseId: string): Promise<QualityGateEvaluation[]> {
    const keys = await this.memory.search(
      `quality-gate:evaluation:${releaseId}:*`,
      100
    );

    const evaluations: QualityGateEvaluation[] = [];

    for (const key of keys) {
      const evaluation = await this.memory.get<QualityGateEvaluation>(key);
      if (evaluation) {
        evaluations.push(evaluation);
      }
    }

    // Sort by date descending
    return evaluations.sort(
      (a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime()
    );
  }

  /**
   * Update thresholds configuration
   */
  updateThresholds(thresholds: Partial<QualityGateThresholds>): void {
    this.config.thresholds = {
      ...this.config.thresholds,
      ...thresholds,
      coverage: { ...this.config.thresholds.coverage, ...thresholds.coverage },
      tests: { ...this.config.thresholds.tests, ...thresholds.tests },
      quality: { ...this.config.thresholds.quality, ...thresholds.quality },
      security: { ...this.config.thresholds.security, ...thresholds.security },
      regression: { ...this.config.thresholds.regression, ...thresholds.regression },
    };
  }

  // ============================================================================
  // Private Helper Methods - Metrics Collection
  // ============================================================================

  private async getCoverageMetrics(
    _releaseCandidate: ReleaseCandidate
  ): Promise<AggregatedMetrics['coverage'] | null> {
    try {
      // Try to get latest coverage data from memory
      const latestCoverage = await this.memory.get<{
        line: number;
        branch: number;
        function: number;
        statement: number;
      }>('coverage:latest');

      if (!latestCoverage) {
        return null;
      }

      // Get previous coverage for trend
      const previousCoverage = await this.memory.get<{
        line: number;
      }>('coverage:previous');

      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (previousCoverage) {
        const delta = latestCoverage.line - previousCoverage.line;
        if (delta > 0.5) trend = 'improving';
        else if (delta < -0.5) trend = 'declining';
      }

      return {
        line: latestCoverage.line,
        branch: latestCoverage.branch,
        function: latestCoverage.function,
        statement: latestCoverage.statement,
        trend,
      };
    } catch {
      return null;
    }
  }

  private async getTestExecutionMetrics(
    _releaseCandidate: ReleaseCandidate
  ): Promise<AggregatedMetrics['testExecution'] | null> {
    try {
      // Search for recent test run results
      const runKeys = await this.memory.search('test-execution:run:*', 10);

      if (runKeys.length === 0) {
        return null;
      }

      // Get the most recent run
      const latestRun = await this.memory.get<{
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
      }>(runKeys[0]);

      if (!latestRun) {
        return null;
      }

      // Get flaky test count
      const flakyKeys = await this.memory.search('test-execution:flaky:*', 100);

      return {
        total: latestRun.total,
        passed: latestRun.passed,
        failed: latestRun.failed,
        skipped: latestRun.skipped,
        passRate: latestRun.total > 0 ? (latestRun.passed / latestRun.total) * 100 : 0,
        flakyTests: flakyKeys.length,
        duration: latestRun.duration,
      };
    } catch {
      return null;
    }
  }

  private async getQualityMetrics(
    _releaseCandidate: ReleaseCandidate
  ): Promise<AggregatedMetrics['quality'] | null> {
    try {
      const qualityData = await this.memory.get<{
        overallScore: number;
        technicalDebt: number;
        codeSmells: number;
        duplications: number;
        criticalBugs: number;
      }>('quality-assessment:latest');

      if (!qualityData) {
        return null;
      }

      return qualityData;
    } catch {
      return null;
    }
  }

  private async getSecurityMetrics(
    _releaseCandidate: ReleaseCandidate
  ): Promise<AggregatedMetrics['security'] | null> {
    try {
      const securityData = await this.memory.get<{
        vulnerabilities: { critical: number; high: number; medium: number; low: number };
        complianceScore: number;
        lastAuditDate?: string;
      }>('security-compliance:posture');

      if (!securityData) {
        return null;
      }

      return {
        vulnerabilities: securityData.vulnerabilities,
        complianceScore: securityData.complianceScore,
        lastAuditDate: securityData.lastAuditDate
          ? new Date(securityData.lastAuditDate)
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private async getDefectMetrics(
    _releaseCandidate: ReleaseCandidate
  ): Promise<AggregatedMetrics['defects'] | null> {
    try {
      const defectData = await this.memory.get<{
        regressionRisk: number;
        predictedDefects: number;
        hotspotCount: number;
      }>('defect-intelligence:analysis');

      if (!defectData) {
        return null;
      }

      return defectData;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Private Helper Methods - Check Creation
  // ============================================================================

  private createCheck(
    name: string,
    category: GateCheckResult['category'],
    value: number,
    threshold: number,
    blocking: boolean,
    comparison: 'min' | 'max',
    description: string
  ): GateCheckResult {
    const passed = comparison === 'min' ? value >= threshold : value <= threshold;

    const severity = this.determineCheckSeverity(blocking, passed, value, threshold, comparison);

    const message = passed
      ? `${description} meets threshold`
      : `${description} ${comparison === 'min' ? 'below' : 'exceeds'} threshold`;

    return {
      name,
      category,
      passed,
      blocking,
      value,
      threshold,
      severity,
      message,
    };
  }

  private determineCheckSeverity(
    blocking: boolean,
    passed: boolean,
    value: number,
    threshold: number,
    comparison: 'min' | 'max'
  ): Severity {
    if (passed) {
      return 'info';
    }

    if (blocking) {
      return 'critical';
    }

    // Calculate how far from threshold
    const deviation = comparison === 'min'
      ? (threshold - value) / threshold
      : (value - threshold) / threshold;

    if (deviation > 0.5) return 'high';
    if (deviation > 0.2) return 'medium';
    return 'low';
  }

  // ============================================================================
  // Private Helper Methods - Risk Assessment
  // ============================================================================

  private createBasicRiskAssessment(
    metrics: AggregatedMetrics,
    checks: GateCheckResult[]
  ): RiskAssessment {
    const failedChecks = checks.filter((c) => !c.passed);
    const overallRisk = Math.min(1, failedChecks.length * 0.15 + metrics.defects.regressionRisk);

    return {
      overallRisk,
      riskLevel: this.riskScoreToSeverity(overallRisk),
      confidence: 0.6, // Lower confidence for basic assessment
      factors: [
        {
          name: 'Failed Checks',
          contribution: failedChecks.length * 0.1,
          description: `${failedChecks.length} quality checks failed`,
        },
      ],
      predictions: {
        defectProbability: overallRisk * 0.5,
        rollbackProbability: overallRisk * 0.3,
        incidentProbability: overallRisk * 0.2,
      },
    };
  }

  private calculateRiskFactors(
    metrics: AggregatedMetrics,
    checks: GateCheckResult[]
  ): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // Coverage risk
    const coverageRisk = 1 - metrics.coverage.line / 100;
    if (coverageRisk > 0.2) {
      factors.push({
        name: 'Low Coverage',
        contribution: coverageRisk * 0.25,
        description: `Test coverage at ${metrics.coverage.line}% is below recommended levels`,
        mitigationSuggestion: 'Add tests for uncovered code paths',
      });
    }

    // Test stability risk
    const testRisk = metrics.testExecution.flakyTests > 0 || metrics.testExecution.failed > 0;
    if (testRisk) {
      const contribution = Math.min(0.3, (metrics.testExecution.failed + metrics.testExecution.flakyTests) * 0.05);
      factors.push({
        name: 'Test Instability',
        contribution,
        description: `${metrics.testExecution.failed} failed tests, ${metrics.testExecution.flakyTests} flaky tests`,
        mitigationSuggestion: 'Fix failing tests and stabilize flaky tests',
      });
    }

    // Security risk
    const securityRisk =
      metrics.security.vulnerabilities.critical * 0.4 +
      metrics.security.vulnerabilities.high * 0.2 +
      metrics.security.vulnerabilities.medium * 0.05;
    if (securityRisk > 0) {
      factors.push({
        name: 'Security Vulnerabilities',
        contribution: Math.min(0.5, securityRisk),
        description: `${metrics.security.vulnerabilities.critical} critical, ${metrics.security.vulnerabilities.high} high vulnerabilities`,
        mitigationSuggestion: 'Address security vulnerabilities before deployment',
      });
    }

    // Regression risk
    if (metrics.defects.regressionRisk > 0.3) {
      factors.push({
        name: 'Regression Risk',
        contribution: metrics.defects.regressionRisk * 0.3,
        description: `ML model predicts ${Math.round(metrics.defects.regressionRisk * 100)}% regression risk`,
        mitigationSuggestion: 'Run extended regression test suite',
      });
    }

    // Failed checks risk
    const failedBlockingChecks = checks.filter((c) => !c.passed && c.blocking);
    if (failedBlockingChecks.length > 0) {
      factors.push({
        name: 'Blocking Checks Failed',
        contribution: Math.min(0.5, failedBlockingChecks.length * 0.2),
        description: `${failedBlockingChecks.length} blocking quality checks failed`,
        mitigationSuggestion: 'Address blocking issues before proceeding',
      });
    }

    return factors;
  }

  private calculateOverallRisk(factors: RiskFactor[]): number {
    if (factors.length === 0) {
      return 0;
    }

    // Sum contributions with diminishing returns
    let totalRisk = 0;
    const sortedFactors = [...factors].sort((a, b) => b.contribution - a.contribution);

    for (let i = 0; i < sortedFactors.length; i++) {
      const weight = 1 / (i + 1); // Diminishing weight for additional factors
      totalRisk += sortedFactors[i].contribution * weight;
    }

    return Math.min(1, totalRisk);
  }

  private async getHistoricalComparison(
    metrics: AggregatedMetrics
  ): Promise<RiskAssessment['historicalComparison'] | undefined> {
    try {
      const historicalKeys = await this.memory.search('quality-gate:evaluation:*', 100);

      if (historicalKeys.length < 5) {
        return undefined;
      }

      let similarCount = 0;
      let successCount = 0;

      for (const key of historicalKeys) {
        const evaluation = await this.memory.get<QualityGateEvaluation>(key);
        if (!evaluation) continue;

        // Check similarity (within 10% on key metrics)
        const coverageSimilar =
          Math.abs(evaluation.metrics.coverage.line - metrics.coverage.line) < 10;
        const qualitySimilar =
          Math.abs(evaluation.metrics.quality.overallScore - metrics.quality.overallScore) < 10;

        if (coverageSimilar && qualitySimilar) {
          similarCount++;
          if (evaluation.recommendation.decision === 'approved') {
            successCount++;
          }
        }
      }

      if (similarCount < 3) {
        return undefined;
      }

      return {
        similarReleases: similarCount,
        successRate: successCount / similarCount,
      };
    } catch {
      return undefined;
    }
  }

  private calculatePredictions(
    metrics: AggregatedMetrics,
    overallRisk: number,
    historicalComparison?: RiskAssessment['historicalComparison']
  ): RiskAssessment['predictions'] {
    // Base predictions on risk score
    let defectProbability = overallRisk * 0.6;
    let rollbackProbability = overallRisk * 0.4;
    let incidentProbability = overallRisk * 0.3;

    // Adjust based on specific metrics
    if (metrics.security.vulnerabilities.critical > 0) {
      incidentProbability += 0.2;
    }

    if (metrics.testExecution.passRate < 100) {
      defectProbability += 0.15;
    }

    // Adjust based on historical data
    if (historicalComparison) {
      const historicalFailureRate = 1 - historicalComparison.successRate;
      defectProbability = (defectProbability + historicalFailureRate) / 2;
      rollbackProbability = (rollbackProbability + historicalFailureRate * 0.5) / 2;
    }

    return {
      defectProbability: Math.min(1, defectProbability),
      rollbackProbability: Math.min(1, rollbackProbability),
      incidentProbability: Math.min(1, incidentProbability),
    };
  }

  private calculateConfidence(
    metrics: AggregatedMetrics,
    historicalComparison?: RiskAssessment['historicalComparison']
  ): number {
    let confidence = 0.7;

    // Increase confidence based on data completeness
    if (metrics.sources.length >= 4) {
      confidence += 0.1;
    }

    // Increase confidence if we have historical data
    if (historicalComparison && historicalComparison.similarReleases >= 10) {
      confidence += 0.1;
    }

    // Decrease confidence if recent security audit is missing
    if (!metrics.security.lastAuditDate) {
      confidence -= 0.1;
    }

    return Math.max(0.5, Math.min(0.95, confidence));
  }

  private riskScoreToSeverity(risk: number): Severity {
    if (risk >= 0.8) return 'critical';
    if (risk >= 0.6) return 'high';
    if (risk >= 0.4) return 'medium';
    if (risk >= 0.2) return 'low';
    return 'info';
  }

  // ============================================================================
  // Private Helper Methods - Recommendation Generation
  // ============================================================================

  private generateSummary(
    decision: QualityGateRecommendation['decision'],
    blockingIssues: string[],
    warnings: string[],
    riskAssessment: RiskAssessment
  ): string {
    switch (decision) {
      case 'approved':
        return `Release approved with ${Math.round((1 - riskAssessment.overallRisk) * 100)}% confidence. All quality gates passed.`;
      case 'conditional':
        return `Conditional approval with ${warnings.length} warning(s). Risk level: ${riskAssessment.riskLevel}. Review recommended before proceeding.`;
      case 'blocked':
        return `Release blocked due to ${blockingIssues.length} critical issue(s). These must be resolved before deployment.`;
    }
  }

  private generateConditions(
    warnings: string[],
    riskAssessment: RiskAssessment
  ): string[] {
    const conditions: string[] = [];

    if (riskAssessment.overallRisk > 0.5) {
      conditions.push('Deploy during low-traffic period');
      conditions.push('Ensure on-call team is available');
    }

    if (warnings.some((w) => w.includes('flaky'))) {
      conditions.push('Monitor test stability for 24 hours post-deployment');
    }

    if (warnings.some((w) => w.includes('coverage'))) {
      conditions.push('Add tests for new functionality within 1 sprint');
    }

    if (warnings.some((w) => w.includes('vulnerability') || w.includes('security'))) {
      conditions.push('Security team sign-off required');
    }

    conditions.push('Feature flag recommended for gradual rollout');

    return conditions;
  }

  private generateRollbackPlan(releaseCandidate: ReleaseCandidate): string {
    return `Rollback Plan for ${releaseCandidate.version}:
1. Monitor key metrics for 15 minutes post-deployment
2. If issues detected, execute: deploy rollback ${releaseCandidate.version}
3. Verify rollback completion via health checks
4. Notify stakeholders and create incident ticket
5. Schedule post-mortem within 24 hours`;
  }

  private generateNextSteps(
    decision: QualityGateRecommendation['decision'],
    blockingIssues: string[],
    _warnings: string[]
  ): string[] {
    const steps: string[] = [];

    switch (decision) {
      case 'approved':
        steps.push('Proceed with deployment');
        steps.push('Monitor deployment metrics');
        steps.push('Notify stakeholders of successful deployment');
        break;

      case 'conditional':
        steps.push('Review warnings with team');
        steps.push('Implement mitigation measures');
        steps.push('Get sign-off from technical lead');
        steps.push('Deploy with enhanced monitoring');
        break;

      case 'blocked':
        steps.push('Address blocking issues:');
        for (const issue of blockingIssues.slice(0, 3)) {
          steps.push(`  - ${issue}`);
        }
        steps.push('Re-run quality gate after fixes');
        steps.push('Update team on blockers and timeline');
        break;
    }

    return steps;
  }

  private calculateRecommendationConfidence(
    checks: GateCheckResult[],
    riskAssessment: RiskAssessment,
    isApproved: boolean
  ): number {
    let confidence = riskAssessment.confidence;

    // Increase confidence if all checks passed
    const allChecksPassed = checks.every((c) => c.passed);
    if (allChecksPassed) {
      confidence += 0.1;
    }

    // Decrease confidence if decision is marginal
    if (!isApproved) {
      const blockingFailed = checks.filter((c) => c.blocking && !c.passed);
      if (blockingFailed.length === 1) {
        confidence -= 0.1; // Marginal failure
      }
    }

    return Math.max(0.5, Math.min(0.95, confidence));
  }

  // ============================================================================
  // Private Helper Methods - Event Publishing
  // ============================================================================

  private async publishQualityGateTriggered(
    evaluationId: string,
    releaseCandidate: ReleaseCandidate
  ): Promise<void> {
    const event = createEvent(
      QualityGateProtocolEvents.QualityGateTriggered,
      'quality-assessment',
      {
        evaluationId,
        releaseCandidate: {
          id: releaseCandidate.id,
          version: releaseCandidate.version,
          branch: releaseCandidate.branch,
        },
        participatingDomains: this.participatingDomains,
        triggeredAt: new Date().toISOString(),
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishGateCompleted(
    evaluationId: string,
    releaseCandidate: ReleaseCandidate,
    decision: string,
    summary: string
  ): Promise<void> {
    const event = createEvent(
      QualityGateProtocolEvents.QualityGateCompleted,
      'quality-assessment',
      {
        evaluationId,
        releaseCandidate: {
          id: releaseCandidate.id,
          version: releaseCandidate.version,
        },
        decision,
        summary,
        completedAt: new Date().toISOString(),
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishDeploymentApproved(
    evaluationId: string,
    releaseCandidate: ReleaseCandidate,
    recommendation: QualityGateRecommendation
  ): Promise<void> {
    const event = createEvent(
      QualityGateProtocolEvents.DeploymentApproved,
      'quality-assessment',
      {
        evaluationId,
        releaseCandidate: {
          id: releaseCandidate.id,
          version: releaseCandidate.version,
          commitHash: releaseCandidate.commitHash,
        },
        confidence: recommendation.confidence,
        conditions: recommendation.conditions,
        rollbackPlan: recommendation.rollbackPlan,
        approvedAt: new Date().toISOString(),
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishDeploymentBlocked(
    evaluationId: string,
    releaseCandidate: ReleaseCandidate,
    recommendation: QualityGateRecommendation
  ): Promise<void> {
    const event = createEvent(
      QualityGateProtocolEvents.DeploymentBlocked,
      'quality-assessment',
      {
        evaluationId,
        releaseCandidate: {
          id: releaseCandidate.id,
          version: releaseCandidate.version,
        },
        blockingIssues: recommendation.blockingIssues,
        nextSteps: recommendation.nextSteps,
        blockedAt: new Date().toISOString(),
      }
    );

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Private Helper Methods - Storage
  // ============================================================================

  private async storeEvaluation(evaluation: QualityGateEvaluation): Promise<void> {
    const key = `quality-gate:evaluation:${evaluation.releaseCandidate.id}:${evaluation.id}`;

    await this.memory.set(key, evaluation, {
      namespace: 'coordination',
      persist: true,
    });

    // Also store as latest for this release
    await this.memory.set(
      `quality-gate:latest:${evaluation.releaseCandidate.id}`,
      evaluation,
      { namespace: 'coordination', persist: true }
    );
  }

  // ============================================================================
  // Private Helper Methods - Agent Coordination
  // ============================================================================

  /**
   * Spawn a coordinator agent for the quality gate evaluation
   */
  private async spawnCoordinatorAgent(
    evaluationId: string,
    releaseCandidate: ReleaseCandidate
  ): Promise<string | undefined> {
    if (!this.agentCoordinator.canSpawn()) {
      // No capacity for agent - proceed without coordination agent
      return undefined;
    }

    try {
      const result = await this.agentCoordinator.spawn({
        name: `quality-gate-${evaluationId.slice(0, 8)}`,
        domain: 'quality-assessment',
        type: 'coordinator',
        capabilities: [
          'quality-gate-evaluation',
          'metrics-aggregation',
          'risk-assessment',
          'deployment-recommendation',
        ],
        config: {
          evaluationId,
          releaseCandidate: {
            id: releaseCandidate.id,
            version: releaseCandidate.version,
          },
          participatingDomains: this.participatingDomains,
        },
      });

      if (result.success) {
        return result.value;
      }

      // Failed to spawn - continue without agent
      return undefined;
    } catch {
      // Error spawning agent - continue without
      return undefined;
    }
  }

  /**
   * Stop the coordinator agent after evaluation completes
   */
  private async stopCoordinatorAgent(agentId: string): Promise<void> {
    try {
      await this.agentCoordinator.stop(agentId);
    } catch {
      // Best effort cleanup - ignore errors
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createQualityGateProtocol(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: Partial<QualityGateProtocolConfig>
): IQualityGateProtocol {
  return new QualityGateProtocol(eventBus, memory, agentCoordinator, config);
}
