/**
 * Agentic QE v3 - Domain Events
 * Event definitions for cross-domain communication
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainEvent, DomainName, Severity } from '../types';

// ============================================================================
// Base Event Factory
// ============================================================================

export function createEvent<T>(
  type: string,
  source: DomainName,
  payload: T,
  correlationId?: string
): DomainEvent<T> {
  return {
    id: uuidv4(),
    type,
    timestamp: new Date(),
    source,
    correlationId,
    payload,
  };
}

// ============================================================================
// Test Generation Events
// ============================================================================

export interface TestGeneratedPayload {
  testId: string;
  testFile: string;
  framework: string;
  sourceFile: string;
  testType: 'unit' | 'integration' | 'e2e' | 'property';
}

export interface TestSuiteCreatedPayload {
  suiteId: string;
  testCount: number;
  sourceFiles: string[];
  coverageEstimate: number;
}

export const TestGenerationEvents = {
  TestGenerated: 'test-generation.TestGenerated',
  TestSuiteCreated: 'test-generation.TestSuiteCreated',
  PatternLearned: 'test-generation.PatternLearned',
  GenerationFailed: 'test-generation.GenerationFailed',
} as const;

// ============================================================================
// Test Execution Events
// ============================================================================

export interface TestRunStartedPayload {
  runId: string;
  testCount: number;
  parallel: boolean;
  workers: number;
}

export interface TestRunCompletedPayload {
  runId: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export interface FlakyTestDetectedPayload {
  testId: string;
  testFile: string;
  failureRate: number;
  pattern: string;
}

export const TestExecutionEvents = {
  TestRunStarted: 'test-execution.TestRunStarted',
  TestRunCompleted: 'test-execution.TestRunCompleted',
  FlakyTestDetected: 'test-execution.FlakyTestDetected',
  RetryTriggered: 'test-execution.RetryTriggered',
} as const;

// ============================================================================
// Coverage Analysis Events
// ============================================================================

export interface CoverageReportPayload {
  reportId: string;
  line: number;
  branch: number;
  function: number;
  statement: number;
  files: number;
}

export interface CoverageGapPayload {
  gapId: string;
  file: string;
  uncoveredLines: number[];
  uncoveredBranches: number[];
  riskScore: number;
}

export const CoverageAnalysisEvents = {
  CoverageReportCreated: 'coverage-analysis.CoverageReportCreated',
  CoverageGapDetected: 'coverage-analysis.CoverageGapDetected',
  RiskZoneIdentified: 'coverage-analysis.RiskZoneIdentified',
} as const;

// ============================================================================
// Quality Assessment Events
// ============================================================================

export interface QualityGatePayload {
  gateId: string;
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    value: number;
    threshold: number;
  }>;
}

export interface DeploymentDecisionPayload {
  decision: 'approved' | 'blocked' | 'warning';
  reason: string;
  riskScore: number;
  recommendations: string[];
}

export const QualityAssessmentEvents = {
  QualityGateEvaluated: 'quality-assessment.QualityGateEvaluated',
  DeploymentApproved: 'quality-assessment.DeploymentApproved',
  DeploymentBlocked: 'quality-assessment.DeploymentBlocked',
} as const;

// ============================================================================
// Defect Intelligence Events
// ============================================================================

export interface DefectPredictedPayload {
  predictionId: string;
  file: string;
  probability: number;
  factors: string[];
  recommendations: string[];
}

export interface RootCausePayload {
  analysisId: string;
  defectId: string;
  rootCause: string;
  confidence: number;
  relatedFiles: string[];
}

export const DefectIntelligenceEvents = {
  DefectPredicted: 'defect-intelligence.DefectPredicted',
  RootCauseIdentified: 'defect-intelligence.RootCauseIdentified',
  RegressionRiskAnalyzed: 'defect-intelligence.RegressionRiskAnalyzed',
} as const;

// ============================================================================
// Code Intelligence Events
// ============================================================================

export interface KnowledgeGraphUpdatedPayload {
  nodes: number;
  edges: number;
  filesIndexed: number;
  duration: number;
}

export interface ImpactAnalysisPayload {
  analysisId: string;
  changedFiles: string[];
  impactedFiles: string[];
  impactedTests: string[];
  riskLevel: Severity;
}

/**
 * Payload for C4DiagramsGenerated event
 */
export interface C4DiagramsGeneratedPayload {
  /** Request ID for correlation */
  requestId: string;
  /** Project path that was analyzed */
  projectPath: string;
  /** Number of components detected */
  componentsDetected: number;
  /** Number of external systems detected */
  externalSystemsDetected: number;
  /** Number of relationships detected */
  relationshipsDetected: number;
  /** Analysis duration in milliseconds */
  analysisTimeMs: number;
  /** Whether context diagram was generated */
  hasContextDiagram: boolean;
  /** Whether container diagram was generated */
  hasContainerDiagram: boolean;
  /** Whether component diagram was generated */
  hasComponentDiagram: boolean;
}

export const CodeIntelligenceEvents = {
  KnowledgeGraphUpdated: 'code-intelligence.KnowledgeGraphUpdated',
  ImpactAnalysisCompleted: 'code-intelligence.ImpactAnalysisCompleted',
  SemanticSearchCompleted: 'code-intelligence.SemanticSearchCompleted',
  C4DiagramsGenerated: 'code-intelligence.C4DiagramsGenerated',
} as const;

// ============================================================================
// Security Compliance Events
// ============================================================================

export interface VulnerabilityPayload {
  vulnId: string;
  cve?: string;
  severity: Severity;
  file: string;
  line?: number;
  description: string;
  remediation: string;
}

export interface CompliancePayload {
  standard: string;
  passed: boolean;
  violations: number;
  findings: string[];
}

export const SecurityComplianceEvents = {
  VulnerabilityDetected: 'security-compliance.VulnerabilityDetected',
  ComplianceValidated: 'security-compliance.ComplianceValidated',
  SecurityAuditCompleted: 'security-compliance.SecurityAuditCompleted',
} as const;

// ============================================================================
// Learning Optimization Events
// ============================================================================

export interface PatternConsolidatedPayload {
  patternCount: number;
  domains: DomainName[];
  improvements: number;
}

export interface TransferCompletedPayload {
  sourceProject: string;
  targetProject: string;
  patternsTransferred: number;
  successRate: number;
}

/**
 * Payload for dream cycle completion event
 * Contains insights generated during the dream cycle
 */
export interface DreamCycleCompletedPayload {
  /** Unique cycle identifier */
  cycleId: string;
  /** Duration of dream cycle in milliseconds */
  durationMs: number;
  /** Number of concepts processed */
  conceptsProcessed: number;
  /** Insights generated during the dream cycle */
  insights: Array<{
    id: string;
    type: string;
    description: string;
    noveltyScore: number;
    confidenceScore: number;
    actionable: boolean;
    suggestedAction?: string;
    sourceConcepts: string[];
  }>;
  /** Number of patterns created from insights */
  patternsCreated: number;
}

export const LearningOptimizationEvents = {
  PatternConsolidated: 'learning-optimization.PatternConsolidated',
  TransferCompleted: 'learning-optimization.TransferCompleted',
  OptimizationApplied: 'learning-optimization.OptimizationApplied',
  DreamCycleCompleted: 'learning-optimization.dream.completed',
} as const;

// ============================================================================
// All Events Map
// ============================================================================

export const AllDomainEvents = {
  ...TestGenerationEvents,
  ...TestExecutionEvents,
  ...CoverageAnalysisEvents,
  ...QualityAssessmentEvents,
  ...DefectIntelligenceEvents,
  ...CodeIntelligenceEvents,
  ...SecurityComplianceEvents,
  ...LearningOptimizationEvents,
} as const;

export type DomainEventType = (typeof AllDomainEvents)[keyof typeof AllDomainEvents];
