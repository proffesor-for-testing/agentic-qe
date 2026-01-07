/**
 * Agentic QE v3 - Coverage Analysis Domain Interface
 * O(log n) coverage gap detection with HNSW
 */

import { Result, Severity } from '../../shared/types';

// ============================================================================
// Domain API
// ============================================================================

export interface CoverageAnalysisAPI {
  /** Analyze coverage report */
  analyze(request: AnalyzeCoverageRequest): Promise<Result<CoverageReport, Error>>;

  /** Detect coverage gaps with HNSW (O(log n)) */
  detectGaps(request: GapDetectionRequest): Promise<Result<CoverageGaps, Error>>;

  /** Calculate risk score for uncovered code */
  calculateRisk(request: RiskCalculationRequest): Promise<Result<RiskReport, Error>>;

  /** Generate coverage trend report */
  getTrend(request: TrendRequest): Promise<Result<CoverageTrend, Error>>;

  /** Find similar coverage patterns */
  findSimilar(request: SimilarityRequest): Promise<Result<SimilarPatterns, Error>>;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface AnalyzeCoverageRequest {
  coverageData: CoverageData;
  threshold?: number;
  includeFileDetails?: boolean;
}

export interface CoverageData {
  files: FileCoverage[];
  summary: CoverageSummary;
}

export interface FileCoverage {
  path: string;
  lines: { covered: number; total: number };
  branches: { covered: number; total: number };
  functions: { covered: number; total: number };
  statements: { covered: number; total: number };
  uncoveredLines: number[];
  uncoveredBranches: number[];
}

export interface CoverageSummary {
  line: number;
  branch: number;
  function: number;
  statement: number;
  files: number;
}

export interface CoverageReport {
  summary: CoverageSummary;
  meetsThreshold: boolean;
  delta?: CoverageDelta;
  recommendations: string[];
}

export interface CoverageDelta {
  line: number;
  branch: number;
  function: number;
  statement: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface GapDetectionRequest {
  coverageData: CoverageData;
  minCoverage?: number;
  prioritize?: 'risk' | 'size' | 'recent-changes';
}

export interface CoverageGaps {
  gaps: CoverageGap[];
  totalUncoveredLines: number;
  estimatedEffort: number;
}

export interface CoverageGap {
  id: string;
  file: string;
  lines: number[];
  branches: number[];
  riskScore: number;
  severity: Severity;
  recommendation: string;
}

export interface RiskCalculationRequest {
  file: string;
  uncoveredLines: number[];
  factors?: RiskFactor[];
}

export interface RiskFactor {
  name: string;
  weight: number;
}

export interface RiskReport {
  file: string;
  overallRisk: number;
  riskLevel: Severity;
  factors: { name: string; score: number; contribution: number }[];
  recommendations: string[];
}

export interface TrendRequest {
  timeRange: { start: Date; end: Date };
  granularity: 'daily' | 'weekly' | 'monthly';
}

export interface CoverageTrend {
  dataPoints: TrendPoint[];
  trend: 'improving' | 'declining' | 'stable';
  forecast: number;
}

export interface TrendPoint {
  date: Date;
  coverage: CoverageSummary;
}

export interface SimilarityRequest {
  pattern: CoverageGap;
  k: number;
}

export interface SimilarPatterns {
  patterns: { gap: CoverageGap; similarity: number }[];
  searchTime: number;
}
