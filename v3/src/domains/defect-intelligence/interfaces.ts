/**
 * Agentic QE v3 - Defect Intelligence Domain Interface
 * Defect prediction, root cause analysis, regression risk
 */

import { Result, Severity } from '../../shared/types';

// ============================================================================
// Domain API
// ============================================================================

export interface DefectIntelligenceAPI {
  /** Predict defect probability */
  predictDefects(request: PredictRequest): Promise<Result<PredictionResult, Error>>;

  /** Analyze root cause of defects */
  analyzeRootCause(request: RootCauseRequest): Promise<Result<RootCauseAnalysis, Error>>;

  /** Analyze regression risk */
  analyzeRegressionRisk(request: RegressionRequest): Promise<Result<RegressionRisk, Error>>;

  /** Cluster similar defects */
  clusterDefects(request: ClusterRequest): Promise<Result<DefectClusters, Error>>;

  /** Learn from defect patterns */
  learnPatterns(request: LearnRequest): Promise<Result<LearnedDefectPatterns, Error>>;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface PredictRequest {
  files: string[];
  features?: PredictionFeature[];
  threshold?: number;
}

export interface PredictionFeature {
  name: string;
  weight: number;
}

export interface PredictionResult {
  predictions: FilePrediction[];
  modelConfidence: number;
  factors: string[];
  /** ADR-051: LLM-enhanced analysis when enabled */
  llmAnalysis?: LLMDefectAnalysis;
}

/**
 * ADR-051: LLM-enhanced defect analysis result
 */
export interface LLMDefectAnalysis {
  /** Specific risk factors identified by AI */
  riskFactors: string[];
  /** Code areas requiring focused review */
  reviewFocusAreas: string[];
  /** Similar historical defect patterns to watch for */
  similarHistoricalDefects: string[];
  /** AI confidence level (0-1) */
  confidenceLevel: number;
  /** Detailed explanation of the risk assessment */
  explanation: string;
}

export interface FilePrediction {
  file: string;
  probability: number;
  riskLevel: Severity;
  factors: { name: string; contribution: number }[];
  recommendations: string[];
}

export interface RootCauseRequest {
  defectId: string;
  symptoms: string[];
  context?: Record<string, unknown>;
}

export interface RootCauseAnalysis {
  defectId: string;
  rootCause: string;
  confidence: number;
  contributingFactors: ContributingFactor[];
  relatedFiles: string[];
  recommendations: string[];
  timeline: TimelineEvent[];
}

export interface ContributingFactor {
  factor: string;
  impact: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface TimelineEvent {
  timestamp: Date;
  event: string;
  relevance: number;
}

export interface RegressionRequest {
  changeset: string[];
  baseline?: string;
  depth?: 'shallow' | 'deep';
}

export interface RegressionRisk {
  overallRisk: number;
  riskLevel: Severity;
  impactedAreas: ImpactedArea[];
  recommendedTests: string[];
  confidence: number;
}

export interface ImpactedArea {
  area: string;
  files: string[];
  risk: number;
  reason: string;
}

export interface ClusterRequest {
  defects: DefectInfo[];
  method: 'semantic' | 'behavioral' | 'temporal';
  minClusterSize?: number;
}

export interface DefectInfo {
  id: string;
  title: string;
  description: string;
  file?: string;
  tags?: string[];
}

export interface DefectClusters {
  clusters: DefectCluster[];
  outliers: string[];
  clusteringMetrics: { silhouette: number; cohesion: number };
}

export interface DefectCluster {
  id: string;
  label: string;
  defects: string[];
  commonFactors: string[];
  suggestedFix: string;
}

export interface LearnRequest {
  defects: DefectInfo[];
  includeResolutions?: boolean;
}

export interface LearnedDefectPatterns {
  patterns: DefectPattern[];
  modelUpdated: boolean;
  improvementEstimate: number;
}

export interface DefectPattern {
  id: string;
  name: string;
  indicators: string[];
  frequency: number;
  prevention: string;
}
