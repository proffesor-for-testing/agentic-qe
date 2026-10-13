/**
 * Agentic QE v3 - Quality Assessment Domain Interface
 * Intelligent quality gate decisions
 */

import { Result, Severity, QualityScore } from '../../shared/types';

// ============================================================================
// Domain API
// ============================================================================

export interface QualityAssessmentAPI {
  /** Evaluate quality gate */
  evaluateGate(request: GateEvaluationRequest): Promise<Result<GateResult, Error>>;

  /** Analyze code quality */
  analyzeQuality(request: QualityAnalysisRequest): Promise<Result<QualityReport, Error>>;

  /** Get deployment recommendation */
  getDeploymentAdvice(request: DeploymentRequest): Promise<Result<DeploymentAdvice, Error>>;

  /** Analyze code complexity */
  analyzeComplexity(request: ComplexityRequest): Promise<Result<ComplexityReport, Error>>;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface GateEvaluationRequest {
  gateName: string;
  metrics: QualityMetrics;
  thresholds: GateThresholds;
}

export interface QualityMetrics {
  coverage: number;
  testsPassing: number;
  criticalBugs: number;
  codeSmells: number;
  securityVulnerabilities: number;
  technicalDebt: number;
  duplications: number;
}

export interface GateThresholds {
  coverage?: { min: number };
  testsPassing?: { min: number };
  criticalBugs?: { max: number };
  codeSmells?: { max: number };
  securityVulnerabilities?: { max: number };
  technicalDebt?: { max: number };
  duplications?: { max: number };
}

export interface GateResult {
  gateName: string;
  passed: boolean;
  checks: GateCheck[];
  overallScore: number;
  failedChecks: string[];
}

export interface GateCheck {
  name: string;
  passed: boolean;
  value: number;
  threshold: number;
  severity: Severity;
}

export interface QualityAnalysisRequest {
  sourceFiles: string[];
  includeMetrics: string[];
  compareBaseline?: string;
  /**
   * #1021: files the caller named explicitly. If one of them fails to read or
   * parse, the affected metrics are unmeasured regardless of coverage of scope.
   */
  explicitFiles?: string[];
}

export interface QualityReport {
  score: QualityScore;
  metrics: QualityMetricDetail[];
  trends: QualityTrend[];
  recommendations: Recommendation[];
  /** ADR-051: Optional LLM-generated insights (when enableLLMInsights is true) */
  llmInsights?: LLMQualityInsights;
  /**
   * #1011: requested metrics that were NOT measured, with the reason. They are
   * absent from `metrics` and -1 in `score`; never a fixed fallback value.
   */
  unmeasured?: UnmeasuredQualityMetric[];
  /**
   * #1021: files left out of the scope (binary, generated, minified, type
   * declarations, refused by the reader's path policy). Metrics stay measured
   * over the remaining files.
   */
  excluded?: ExcludedQualityFile[];
  /**
   * #1021: metrics measured over most, but not all, analysable files. Their
   * value covers `analysedFiles` of `totalFiles`; `failed` lists the gaps.
   */
  partial?: PartialQualityMetric[];
}

/** #1021: a file excluded from static analysis, with the reason. */
export interface ExcludedQualityFile {
  file: string;
  reason: string;
}

/** #1021: a metric measured over part of its scope. */
export interface PartialQualityMetric {
  metric: string;
  analysedFiles: number;
  totalFiles: number;
  /** analysedFiles / totalFiles, three decimals, rounded down (never 1 while a file failed). */
  coverageOfScope: number;
  failed: ExcludedQualityFile[];
}

/** #1011: a requested metric the static analysis could not measure. */
export interface UnmeasuredQualityMetric {
  metric: string;
  reason: string;
  /** Files that could not be analysed, when the cause is file-specific. */
  files?: string[];
}

/**
 * ADR-051: LLM-generated quality insights
 * Provides AI-powered explanation and recommendations for quality issues
 */
export interface LLMQualityInsights {
  /** Natural language explanation of quality issues */
  explanation: string;
  /** Prioritized list of improvement recommendations */
  prioritizedRecommendations: Array<{
    priority: number;
    title: string;
    description: string;
    estimatedImpact: 'high' | 'medium' | 'low';
    estimatedEffort: 'high' | 'medium' | 'low';
  }>;
  /** Estimated impact of improvements on overall quality score */
  estimatedImpactOnScore: number;
  /** Summary of key findings */
  keySummary: string;
}

export interface QualityMetricDetail {
  name: string;
  value: number;
  rating: 'A' | 'B' | 'C' | 'D' | 'E';
  trend: 'improving' | 'declining' | 'stable';
}

export interface QualityTrend {
  metric: string;
  dataPoints: { date: Date; value: number }[];
  direction: 'up' | 'down' | 'stable';
}

export interface Recommendation {
  type: 'improvement' | 'warning' | 'critical';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
}

export interface DeploymentRequest {
  releaseCandidate: string;
  metrics: QualityMetrics;
  riskTolerance: 'low' | 'medium' | 'high';
}

export interface DeploymentAdvice {
  decision: 'approved' | 'warning' | 'blocked';
  confidence: number;
  riskScore: number;
  reasons: string[];
  conditions?: string[];
  rollbackPlan?: string;
}

export interface ComplexityRequest {
  sourceFiles: string[];
  metrics: ('cyclomatic' | 'cognitive' | 'halstead' | 'maintainability')[];
}

export interface ComplexityReport {
  files: FileComplexity[];
  summary: ComplexitySummary;
  hotspots: ComplexityHotspot[];
}

/** Values are -1 when not measured (not requested, or the file could not be analysed). */
export interface FileComplexity {
  path: string;
  cyclomatic: number;
  cognitive: number;
  maintainability: number;
  linesOfCode: number;
  /** #1011: why this file's metrics are unmeasured (unreadable, binary, unparseable). */
  unmeasuredReason?: string;
}

/** Averages over measured files only; -1 when no file was measured for that metric. */
export interface ComplexitySummary {
  averageCyclomatic: number;
  averageCognitive: number;
  averageMaintainability: number;
  totalLinesOfCode: number;
}

export interface ComplexityHotspot {
  file: string;
  function: string;
  complexity: number;
  recommendation: string;
}
