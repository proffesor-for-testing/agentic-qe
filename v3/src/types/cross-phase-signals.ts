/**
 * Cross-Phase Signal Types
 *
 * TypeScript interfaces for QCSD cross-phase feedback loops.
 * These enable automated learning between QCSD phases.
 *
 * @module cross-phase-signals
 * @version 1.0.0
 */

// =============================================================================
// Base Types
// =============================================================================

export type QCSDPhase = 'ideation' | 'grooming' | 'development' | 'cicd' | 'production';
export type FeedbackLoopType = 'strategic' | 'tactical' | 'operational' | 'quality-criteria';
export type SignalPriority = 'critical' | 'high' | 'medium' | 'low';

export interface BaseSignal {
  id: string;
  timestamp: string;
  source: QCSDPhase;
  target: QCSDPhase;
  loopType: FeedbackLoopType;
  expiresAt: string;
  version: string;
}

// =============================================================================
// Loop 1: Production → Ideation (Strategic)
// =============================================================================

export interface RiskWeight {
  category: string;
  weight: number;  // 0.0 - 1.0 (higher = riskier)
  confidence: number;  // 0.0 - 1.0
  evidence: {
    defectCount: number;
    percentageOfTotal: number;
    severityDistribution: Record<string, number>;
    timeRange: {
      start: string;
      end: string;
    };
  };
}

export interface ProductionRiskSignal extends BaseSignal {
  source: 'production';
  target: 'ideation';
  loopType: 'strategic';

  riskWeights: RiskWeight[];

  recommendations: {
    forRiskAssessor: string[];
    forQualityCriteria: string[];
  };
}

// =============================================================================
// Loop 2: Production → Grooming (Tactical)
// =============================================================================

export type SFDIPOTFactor =
  | 'Structure'
  | 'Function'
  | 'Data'
  | 'Interfaces'
  | 'Platform'
  | 'Operations'
  | 'Time';

export interface FactorWeight {
  factor: SFDIPOTFactor;
  weight: number;  // 0.0 - 1.0
  defectPercentage: number;
  commonPatterns: string[];
}

export interface SFDIPOTWeightSignal extends BaseSignal {
  source: 'production';
  target: 'grooming';
  loopType: 'tactical';

  factorWeights: FactorWeight[];
  featureContext: string;

  recommendations: {
    forProductFactorsAssessor: string[];
  };
}

// =============================================================================
// Loop 3: CI/CD → Development (Operational)
// =============================================================================

export interface FlakyPattern {
  pattern: string;
  frequency: number;  // 0.0 - 1.0
  affectedTests: string[];
  rootCause: string;
  fix: string;
}

export interface GateFailure {
  reason: string;
  percentage: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface TestHealthSignal extends BaseSignal {
  source: 'cicd';
  target: 'development';
  loopType: 'operational';

  flakyPatterns: FlakyPattern[];
  gateFailures: GateFailure[];

  recommendations: {
    forTestArchitect: string[];
    antiPatterns: string[];
  };
}

// =============================================================================
// Loop 4: Development → Grooming (Quality Criteria)
// =============================================================================

export interface UntestablePattern {
  acPattern: string;
  problem: string;
  frequency: number;
  betterPattern: string;
}

export interface CoverageGap {
  codeArea: string;
  coveragePercentage: number;
  rootCause: string;
  acImprovement: string;
}

export interface ACQualitySignal extends BaseSignal {
  source: 'development';
  target: 'grooming';
  loopType: 'quality-criteria';

  untestablePatterns: UntestablePattern[];
  coverageGaps: CoverageGap[];

  recommendations: {
    forRequirementsValidator: string[];
    acTemplates: Record<string, string>;
  };
}

// =============================================================================
// Union Type for All Signals
// =============================================================================

export type CrossPhaseSignal =
  | ProductionRiskSignal
  | SFDIPOTWeightSignal
  | TestHealthSignal
  | ACQualitySignal;

// =============================================================================
// Memory Namespace Constants
// =============================================================================

export const CROSS_PHASE_NAMESPACES = {
  // Loop 1 & 2: Production patterns
  DEFECT_WEIGHTS: 'qcsd-memory/production-patterns/defect-weights',
  FAILURE_MODES: 'qcsd-memory/production-patterns/failure-modes',
  SLA_VIOLATIONS: 'qcsd-memory/production-patterns/sla-violations',

  // Loop 3: CI/CD patterns
  FLAKY_TESTS: 'qcsd-memory/cicd-patterns/flaky-tests',
  GATE_FAILURES: 'qcsd-memory/cicd-patterns/gate-failures',
  BUILD_HEALTH: 'qcsd-memory/cicd-patterns/build-health',

  // Loop 4: Development patterns
  COVERAGE_GAPS: 'qcsd-memory/development-patterns/coverage-gaps',
  AC_PROBLEMS: 'qcsd-memory/development-patterns/ac-problems',
  TEST_DEBT: 'qcsd-memory/development-patterns/test-debt',

  // Cross-phase routing
  IDEATION_INPUTS: 'qcsd-memory/cross-phase-signals/ideation-inputs',
  GROOMING_INPUTS: 'qcsd-memory/cross-phase-signals/grooming-inputs',
  DEVELOPMENT_INPUTS: 'qcsd-memory/cross-phase-signals/development-inputs',
} as const;

export type CrossPhaseNamespace = typeof CROSS_PHASE_NAMESPACES[keyof typeof CROSS_PHASE_NAMESPACES];

// =============================================================================
// TTL Constants (in milliseconds)
// =============================================================================

export const SIGNAL_TTL = {
  RISK_WEIGHTS: 90 * 24 * 60 * 60 * 1000,      // 90 days
  SFDIPOT_WEIGHTS: 90 * 24 * 60 * 60 * 1000,   // 90 days
  FLAKY_PATTERNS: 30 * 24 * 60 * 60 * 1000,    // 30 days
  AC_QUALITY: 60 * 24 * 60 * 60 * 1000,        // 60 days
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

export function createSignalId(loopType: FeedbackLoopType, prefix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix || loopType}-signal-${timestamp}-${random}`;
}

export function calculateExpiry(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

export function isSignalExpired(signal: BaseSignal): boolean {
  return new Date(signal.expiresAt) < new Date();
}

export function getNamespaceForLoop(loopType: FeedbackLoopType): CrossPhaseNamespace {
  switch (loopType) {
    case 'strategic':
      return CROSS_PHASE_NAMESPACES.DEFECT_WEIGHTS;
    case 'tactical':
      return CROSS_PHASE_NAMESPACES.FAILURE_MODES;
    case 'operational':
      return CROSS_PHASE_NAMESPACES.FLAKY_TESTS;
    case 'quality-criteria':
      return CROSS_PHASE_NAMESPACES.AC_PROBLEMS;
  }
}
