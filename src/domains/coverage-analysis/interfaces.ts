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

// ============================================================================
// Q-Learning Integration Types
// ============================================================================

/**
 * Coverage state for Q-Learning
 */
export interface CoverageQLState {
  id: string;
  features: number[];
  filePath: string;
  currentCoverage: number;
  targetCoverage: number;
  complexity: number;
  changeFrequency: number;
  businessCriticality: number;
  uncoveredLines: number;
  branchPoints: number;
  riskScore: number;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Q-Learning action for coverage optimization
 */
export interface CoverageQLAction {
  type: 'generate-unit' | 'generate-integration' | 'prioritize' | 'skip';
  value: number | string;
  metadata?: Record<string, unknown>;
}

/**
 * Q-Learning prediction result for coverage
 */
export interface CoverageQLPrediction {
  action: CoverageQLAction;
  confidence: number;
  value: number;
  reasoning: string;
  estimatedCoverageGain: number;
  estimatedTestCount: number;
}

/**
 * Test prioritization with Q-Learning
 */
export type QLPrioritizedTests = {
  tests: PrioritizedTest[];
  totalEstimatedCoverageGain: number;
  totalEstimatedDuration: number;
  reasoning: string;
};

/**
 * Single prioritized test
 */
export interface PrioritizedTest {
  filePath: string;
  testType: 'unit' | 'integration' | 'e2e';
  priority: number;
  estimatedCoverageGain: number;
  estimatedDuration: number;
  action: CoverageQLAction;
  confidence: number;
}

// ============================================================================
// ADR-059: Ghost Intent Coverage Analysis
// ============================================================================

/**
 * Phantom gap category (ADR-059)
 * Classifies gaps by what's MISSING rather than what EXISTS
 */
export type PhantomGapCategory =
  | 'missing-error-handler'
  | 'missing-edge-case'
  | 'missing-integration-boundary'
  | 'missing-security-check'
  | 'missing-concurrency-guard'
  | 'missing-state-transition'
  | 'missing-cleanup'
  | 'missing-validation'
  | 'missing-negative-test'
  | 'missing-boundary-test'
  | 'uncategorized';

/**
 * A single phantom gap — something that SHOULD exist but DOESN'T
 */
export interface PhantomGap {
  readonly id: string;
  readonly category: PhantomGapCategory;
  readonly description: string;
  readonly confidence: number;
  readonly severity: Severity;
  readonly suggestedTest: string;
}

/**
 * The phantom test surface — the full set of missing coverage
 */
export interface PhantomSurface {
  readonly gaps: readonly PhantomGap[];
  readonly totalGhostScore: number;
  readonly coverageCompleteness: number;
  readonly computedAt: Date;
}

/**
 * Ghost Coverage Analyzer API (ADR-059)
 */
export interface GhostCoverageAnalyzerAPI {
  computePhantomSurface(existingTests: string[], codeContext: string): Promise<PhantomSurface>;
  detectPhantomGaps(codeContext: string, existingPatterns: number[][]): Promise<PhantomGap[]>;
  rankPhantomGaps(gaps: PhantomGap[]): PhantomGap[];
}
