/**
 * Agentic QE v3 - Test Prioritization Types for Decision Transformer
 *
 * Defines state and action spaces for test case prioritization using RL.
 * Maps test metadata to RL state features and priority decisions to actions.
 */

import type { TestExecutionState, TestExecutionAction } from '../../../integrations/rl-suite/interfaces';
import type { Priority, DomainName } from '../../shared/types';

// ============================================================================
// Test Prioritization State
// ============================================================================

/**
 * Extended test execution state for prioritization
 */
export interface TestPrioritizationState extends TestExecutionState {
  /** Test file path */
  filePath: string;
  /** Test name within the file */
  testName: string;
  /** Test complexity score (0-1) */
  complexity: number;
  /** Estimated execution time (ms) */
  estimatedDuration: number;
  /** Code coverage percentage (0-100) */
  coverage: number;
  /** Recent failure rate (0-1) */
  failureRate: number;
  /** Flakiness score (0-1) */
  flakinessScore: number;
  /** Number of recent executions */
  executionCount: number;
  /** Time since last modification (ms) */
  timeSinceModification: number;
  /** Business criticality (0-1) */
  businessCriticality: number;
  /** Dependency count (number of tests this depends on) */
  dependencyCount: number;
  /** Priority assigned by human or rules */
  assignedPriority: Priority;
  /** Domain this test belongs to */
  domain: DomainName;
}

/**
 * Normalized feature vector for DT input
 * Features are normalized to [0, 1] range for stable training
 */
export interface TestPrioritizationFeatures {
  /** Feature 0: Failure probability (recent history) */
  failureProbability: number;
  /** Feature 1: Flakiness score */
  flakiness: number;
  /** Feature 2: Complexity */
  complexity: number;
  /** Feature 3: Coverage gap (1 - coverage) */
  coverageGap: number;
  /** Feature 4: Business criticality */
  criticality: number;
  /** Feature 5: Execution speed (inverse of duration) */
  speed: number;
  /** Feature 6: Age (inverse of time since modification) */
  age: number;
  /** Feature 7: Dependency complexity */
  dependencyComplexity: number;
}

/**
 * Map test metadata to normalized feature vector
 */
export function mapToFeatures(
  test: Partial<TestPrioritizationState>
): TestPrioritizationFeatures {
  // Normalize failure probability
  const failureProbability = Math.min(1, test.failureRate ?? 0);

  // Normalize flakiness
  const flakiness = Math.min(1, test.flakinessScore ?? 0);

  // Normalize complexity (already 0-1)
  const complexity = test.complexity ?? 0.5;

  // Calculate coverage gap
  const coverageGap = 1 - (test.coverage ?? 0) / 100;

  // Normalize criticality
  const criticality = test.businessCriticality ?? 0.5;

  // Normalize speed (faster = higher value)
  const maxDuration = 60000; // 1 minute as baseline
  const speed = Math.max(0, 1 - (test.estimatedDuration ?? 0) / maxDuration);

  // Normalize age (newer tests = higher priority for recent changes)
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 1 week
  const age = Math.max(0, 1 - (test.timeSinceModification ?? 0) / maxAge);

  // Normalize dependency complexity
  const dependencyComplexity = Math.min(1, (test.dependencyCount ?? 0) / 10);

  return {
    failureProbability,
    flakiness,
    complexity,
    coverageGap,
    criticality,
    speed,
    age,
    dependencyComplexity,
  };
}

/**
 * Convert features to numeric array for RL algorithms
 */
export function featuresToArray(features: TestPrioritizationFeatures): number[] {
  return [
    features.failureProbability,
    features.flakiness,
    features.complexity,
    features.coverageGap,
    features.criticality,
    features.speed,
    features.age,
    features.dependencyComplexity,
  ];
}

// ============================================================================
// Test Prioritization Action
// ============================================================================

/**
 * Priority level action for test ordering
 */
export type PriorityAction = 'critical' | 'high' | 'standard' | 'low' | 'defer';

/**
 * Test prioritization action
 */
export interface TestPrioritizationAction extends TestExecutionAction {
  type: 'prioritize';
  /** Priority level */
  value: PriorityAction;
  /** Position in execution queue (0 = first) */
  position?: number;
  /** Reasoning for priority */
  reasoning?: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Map priority action to numeric score for sorting
 */
export function priorityToScore(action: PriorityAction): number {
  const scores: Record<PriorityAction, number> = {
    critical: 100,
    high: 75,
    standard: 50,
    low: 25,
    defer: 0,
  };
  return scores[action];
}

/**
 * Map priority action to Priority enum
 */
export function priorityActionToPriority(action: PriorityAction): Priority {
  const mapping: Record<PriorityAction, Priority> = {
    critical: 'p0',
    high: 'p1',
    standard: 'p2',
    low: 'p3',
    defer: 'p4',
  };
  return mapping[action];
}

// ============================================================================
// Test Prioritization Context
// ============================================================================

/**
 * Execution context for prioritization decisions
 */
export interface TestPrioritizationContext {
  /** Current run ID */
  runId: string;
  /** Total tests to execute */
  totalTests: number;
  /** Available execution time (ms) */
  availableTime: number;
  /** Number of workers for parallel execution */
  workers: number;
  /** Execution mode */
  mode: 'sequential' | 'parallel';
  /** Current phase */
  phase: 'regression' | 'ci' | 'local' | 'smoke';
  /** Previous run results (for learning) */
  history?: TestExecutionHistory[];
}

/**
 * Historical execution data for learning
 */
export interface TestExecutionHistory {
  testId: string;
  timestamp: Date;
  passed: boolean;
  duration: number;
  priority: Priority;
  failureReason?: string;
}

// ============================================================================
// Reward Calculation
// ============================================================================

/**
 * Reward components for test prioritization
 */
export interface TestPrioritizationReward {
  /** Early failure detection reward */
  earlyDetection: number;
  /** Execution time efficiency */
  timeEfficiency: number;
  /** Coverage improvement */
  coverageGain: number;
  /** Flakiness reduction */
  flakinessReduction: number;
  /** Total reward */
  total: number;
}

/**
 * Calculate reward for test prioritization decision
 */
export function calculatePrioritizationReward(
  context: TestPrioritizationContext,
  result: {
    failedEarly: boolean;
    executionTime: number;
    coverageImproved: boolean;
    flakyDetected: boolean;
  }
): TestPrioritizationReward {
  const earlyDetection = result.failedEarly ? 0.5 : 0;

  const timeEfficiency = context.availableTime > 0
    ? Math.max(0, 1 - result.executionTime / context.availableTime) * 0.3
    : 0;

  const coverageGain = result.coverageImproved ? 0.2 : 0;

  const flakinessReduction = result.flakyDetected ? 0.1 : 0;

  const total = earlyDetection + timeEfficiency + coverageGain + flakinessReduction;

  return {
    earlyDetection,
    timeEfficiency,
    coverageGain,
    flakinessReduction,
    total,
  };
}

// ============================================================================
// State Creation Helpers
// ============================================================================

/**
 * Create test prioritization state from test metadata
 */
export function createTestPrioritizationState(
  testId: string,
  metadata: Partial<TestPrioritizationState> & {
    filePath: string;
    testName: string;
  }
): TestPrioritizationState {
  const features = mapToFeatures(metadata);

  return {
    id: testId,
    features: featuresToArray(features),
    testId,
    testType: metadata.testType ?? 'unit',
    priority: metadata.priority ?? metadata.assignedPriority ?? 'p2',
    complexity: metadata.complexity ?? 0.5,
    domain: metadata.domain ?? 'test-execution',
    dependencies: metadata.dependencies ?? [],
    estimatedDuration: metadata.estimatedDuration ?? 5000,
    coverage: metadata.coverage ?? 0,
    failureHistory: metadata.failureHistory ?? [],
    filePath: metadata.filePath,
    testName: metadata.testName,
    flakinessScore: metadata.flakinessScore ?? 0,
    executionCount: metadata.executionCount ?? 0,
    timeSinceModification: metadata.timeSinceModification ?? 0,
    businessCriticality: metadata.businessCriticality ?? 0.5,
    dependencyCount: metadata.dependencyCount ?? 0,
    assignedPriority: metadata.assignedPriority ?? metadata.priority ?? 'p2',
    timestamp: new Date(),
    metadata: {
      ...metadata,
      features,
    },
  };
}
