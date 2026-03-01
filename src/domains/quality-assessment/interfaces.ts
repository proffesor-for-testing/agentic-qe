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
}

export interface QualityReport {
  score: QualityScore;
  metrics: QualityMetricDetail[];
  trends: QualityTrend[];
  recommendations: Recommendation[];
  /** ADR-051: Optional LLM-generated insights (when enableLLMInsights is true) */
  llmInsights?: LLMQualityInsights;
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

export interface FileComplexity {
  path: string;
  cyclomatic: number;
  cognitive: number;
  maintainability: number;
  linesOfCode: number;
}

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
