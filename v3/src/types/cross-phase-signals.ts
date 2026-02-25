/**
 * Cross-Phase Signal Types
 *
 * TypeScript interfaces for QCSD cross-phase feedback loops.
 * These enable automated learning between QCSD phases.
 *
 * @module cross-phase-signals
 * @version 1.0.0
 */

import { randomUUID } from 'crypto';

// =============================================================================
// Base Types
// =============================================================================

export type QCSDPhase = 'ideation' | 'refinement' | 'development' | 'cicd' | 'production';
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
// Loop 2: Production → Refinement (Tactical)
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
  target: 'refinement';
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
// Loop 4: Development → Refinement (Quality Criteria)
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
  target: 'refinement';
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
  const random = randomUUID().split('-')[0];
  return `${prefix || loopType}-signal-${timestamp}-${random}`;
}

export function calculateExpiry(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

export function isSignalExpired(signal: BaseSignal): boolean {
  return new Date(signal.expiresAt) < new Date();
}
