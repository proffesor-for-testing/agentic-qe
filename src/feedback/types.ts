/**
 * Quality Feedback Loop Types
 * ADR-023: Quality Feedback Loop System
 *
 * Types for tracking test outcomes, coverage improvements, and pattern quality.
 */

import type { QEDomain } from '../learning/qe-patterns.js';
import type { TestFramework, ProgrammingLanguage } from '../routing/types.js';

// ============================================================================
// Test Outcome Types
// ============================================================================

/**
 * Coverage metrics from a test run
 */
export interface CoverageMetrics {
  /** Line coverage percentage (0-100) */
  lines: number;
  /** Branch coverage percentage (0-100) */
  branches: number;
  /** Function coverage percentage (0-100) */
  functions: number;
  /** Statement coverage percentage (0-100) */
  statements?: number;
}

/**
 * Test outcome from a generated test
 */
export interface TestOutcome {
  /** Unique test outcome ID */
  readonly id: string;

  /** Test identifier */
  readonly testId: string;

  /** Test name/description */
  readonly testName: string;

  /** Agent that generated the test */
  readonly generatedBy: string;

  /** Pattern ID used for generation (if any) */
  readonly patternId?: string;

  /** Test framework used */
  readonly framework: TestFramework;

  /** Programming language */
  readonly language: ProgrammingLanguage;

  /** QE domain */
  readonly domain: QEDomain;

  /** Test result */
  readonly passed: boolean;

  /** Error message if failed */
  readonly errorMessage?: string;

  /** Coverage metrics achieved */
  readonly coverage: CoverageMetrics;

  /** Mutation score (0-1) if mutation testing was run */
  readonly mutationScore?: number;

  /** Execution time in ms */
  readonly executionTimeMs: number;

  /** Whether test exhibited flaky behavior */
  readonly flaky: boolean;

  /** Flakiness score (0-1, higher = more flaky) */
  readonly flakinessScore?: number;

  /** Maintainability score (0-1) */
  readonly maintainabilityScore: number;

  /** Code complexity of generated test */
  readonly complexity?: number;

  /** Lines of test code */
  readonly linesOfCode?: number;

  /** Number of assertions */
  readonly assertionCount?: number;

  /** File path of the test */
  readonly filePath?: string;

  /** Source file being tested */
  readonly sourceFilePath?: string;

  /** Timestamp */
  readonly timestamp: Date;

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Aggregated test outcome statistics
 */
export interface TestOutcomeStats {
  /** Total tests tracked */
  totalTests: number;

  /** Tests that passed */
  passedTests: number;

  /** Pass rate (0-1) */
  passRate: number;

  /** Average coverage */
  avgCoverage: CoverageMetrics;

  /** Average mutation score */
  avgMutationScore: number;

  /** Average execution time */
  avgExecutionTimeMs: number;

  /** Flaky test count */
  flakyTests: number;

  /** Average maintainability */
  avgMaintainability: number;

  /** Stats by agent */
  byAgent: Map<string, {
    total: number;
    passed: number;
    avgCoverage: number;
    avgMaintainability: number;
  }>;

  /** Stats by domain */
  byDomain: Map<QEDomain, {
    total: number;
    passed: number;
    avgCoverage: number;
  }>;
}

// ============================================================================
// Coverage Session Types
// ============================================================================

/**
 * Coverage improvement session
 */
export interface CoverageSession {
  /** Session ID */
  readonly id: string;

  /** Target file/module being improved */
  readonly targetPath: string;

  /** Agent that performed the analysis */
  readonly agentId: string;

  /** Technique used for coverage improvement */
  readonly technique: CoverageTechnique;

  /** Coverage before the session */
  readonly beforeCoverage: CoverageMetrics;

  /** Coverage after the session */
  readonly afterCoverage: CoverageMetrics;

  /** Tests generated during session */
  readonly testsGenerated: number;

  /** Tests that passed */
  readonly testsPassed: number;

  /** Gap areas targeted */
  readonly gapsTargeted: CoverageGap[];

  /** Duration of session in ms */
  readonly durationMs: number;

  /** Session start time */
  readonly startedAt: Date;

  /** Session end time */
  readonly completedAt: Date;

  /** Additional context */
  readonly context?: Record<string, unknown>;
}

/**
 * Coverage improvement technique
 */
export type CoverageTechnique =
  | 'gap-analysis'
  | 'branch-coverage'
  | 'edge-case-generation'
  | 'mutation-guided'
  | 'risk-based'
  | 'semantic-analysis'
  | 'boundary-testing'
  | 'state-machine'
  | 'data-flow';

/**
 * Coverage gap information
 */
export interface CoverageGap {
  /** Gap identifier */
  id: string;

  /** Type of gap */
  type: 'uncovered-line' | 'uncovered-branch' | 'uncovered-function' | 'partial-branch';

  /** File path */
  filePath: string;

  /** Start line number */
  startLine: number;

  /** End line number */
  endLine?: number;

  /** Risk score (0-1) */
  riskScore: number;

  /** Was the gap addressed? */
  addressed: boolean;

  /** Test IDs that addressed this gap */
  addressedBy?: string[];
}

/**
 * Coverage strategy learned from successful sessions
 */
export interface CoverageStrategy {
  /** Strategy ID */
  readonly id: string;

  /** Strategy description */
  readonly description: string;

  /** Technique used */
  readonly technique: CoverageTechnique;

  /** File patterns this works well for */
  readonly filePatterns: string[];

  /** Average improvement achieved */
  readonly avgImprovement: number;

  /** Number of times used successfully */
  readonly successCount: number;

  /** Confidence in strategy (0-1) */
  readonly confidence: number;

  /** Created timestamp */
  readonly createdAt: Date;

  /** Last used timestamp */
  readonly lastUsedAt: Date;
}

// ============================================================================
// Quality Score Types
// ============================================================================

/**
 * Quality dimensions for scoring
 */
export interface QualityDimensions {
  /** Test effectiveness (0-1) */
  effectiveness: number;

  /** Code coverage achieved (0-1) */
  coverage: number;

  /** Mutation score (0-1) */
  mutationKill: number;

  /** Test stability (0-1, inverse of flakiness) */
  stability: number;

  /** Maintainability (0-1) */
  maintainability: number;

  /** Performance (0-1, based on execution time) */
  performance: number;
}

/**
 * Quality score with breakdown
 */
export interface QualityScore {
  /** Overall quality score (0-1) */
  overall: number;

  /** Dimension scores */
  dimensions: QualityDimensions;

  /** Weights used for calculation */
  weights: QualityWeights;

  /** Trend compared to previous */
  trend: 'improving' | 'stable' | 'declining';

  /** Calculated timestamp */
  calculatedAt: Date;
}

/**
 * Weights for quality dimensions
 */
export interface QualityWeights {
  effectiveness: number;
  coverage: number;
  mutationKill: number;
  stability: number;
  maintainability: number;
  performance: number;
}

/**
 * Default quality weights
 */
export const DEFAULT_QUALITY_WEIGHTS: QualityWeights = {
  effectiveness: 0.25,   // Test pass/fail
  coverage: 0.20,        // Code coverage
  mutationKill: 0.15,    // Mutation testing
  stability: 0.15,       // Non-flaky
  maintainability: 0.15, // Clean code
  performance: 0.10,     // Fast execution
};

// ============================================================================
// Pattern Promotion Types
// ============================================================================

/**
 * Pattern promotion tier
 */
export type PatternTier = 'short-term' | 'working' | 'long-term' | 'permanent';

/**
 * Pattern promotion criteria
 */
export interface PromotionCriteria {
  /** Minimum successful uses for promotion */
  minSuccessCount: number;

  /** Minimum success rate (0-1) */
  minSuccessRate: number;

  /** Minimum quality score (0-1) */
  minQualityScore: number;

  /** Minimum age in days */
  minAgeDays: number;
}

/**
 * Default promotion criteria by tier
 */
export const DEFAULT_PROMOTION_CRITERIA: Record<PatternTier, PromotionCriteria> = {
  'short-term': {
    minSuccessCount: 0,
    minSuccessRate: 0,
    minQualityScore: 0,
    minAgeDays: 0,
  },
  'working': {
    minSuccessCount: 3,
    minSuccessRate: 0.6,
    minQualityScore: 0.5,
    minAgeDays: 1,
  },
  'long-term': {
    minSuccessCount: 10,
    minSuccessRate: 0.75,
    minQualityScore: 0.7,
    minAgeDays: 7,
  },
  'permanent': {
    minSuccessCount: 50,
    minSuccessRate: 0.9,
    minQualityScore: 0.85,
    minAgeDays: 30,
  },
};

/**
 * Pattern promotion event
 */
export interface PatternPromotionEvent {
  /** Pattern ID */
  patternId: string;

  /** Previous tier */
  fromTier: PatternTier;

  /** New tier */
  toTier: PatternTier;

  /** Reason for promotion */
  reason: string;

  /** Metrics at time of promotion */
  metrics: {
    successCount: number;
    successRate: number;
    qualityScore: number;
    ageDays: number;
  };

  /** Timestamp */
  timestamp: Date;
}

/**
 * Pattern demotion event (for patterns that decline)
 */
export interface PatternDemotionEvent {
  /** Pattern ID */
  patternId: string;

  /** Previous tier */
  fromTier: PatternTier;

  /** New tier */
  toTier: PatternTier;

  /** Reason for demotion */
  reason: string;

  /** Metrics at time of demotion */
  metrics: {
    recentSuccessRate: number;
    recentQualityScore: number;
    failureCount: number;
  };

  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// Feedback Configuration
// ============================================================================

/**
 * Feedback loop configuration
 */
export interface FeedbackConfig {
  /** Quality score weights */
  qualityWeights: QualityWeights;

  /** Promotion criteria by tier */
  promotionCriteria: Record<PatternTier, PromotionCriteria>;

  /** Enable automatic pattern promotion */
  autoPromote: boolean;

  /** Enable automatic pattern demotion */
  autoDemote: boolean;

  /** Minimum coverage improvement to learn strategy (percentage points) */
  minCoverageImprovementToLearn: number;

  /** Maximum outcomes to store in memory */
  maxOutcomesInMemory: number;

  /** Persist outcomes to database */
  persistOutcomes: boolean;

  /** Batch size for processing */
  batchSize: number;
}

/**
 * Default feedback configuration
 */
export const DEFAULT_FEEDBACK_CONFIG: FeedbackConfig = {
  qualityWeights: DEFAULT_QUALITY_WEIGHTS,
  promotionCriteria: DEFAULT_PROMOTION_CRITERIA,
  autoPromote: true,
  autoDemote: true,
  minCoverageImprovementToLearn: 5,
  maxOutcomesInMemory: 10000,
  persistOutcomes: true,
  batchSize: 100,
};
