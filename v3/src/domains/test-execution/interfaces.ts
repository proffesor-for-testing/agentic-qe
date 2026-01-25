/**
 * Agentic QE v3 - Test Execution Domain Interfaces
 * All types and interfaces for the test-execution domain
 */

import { Result } from '../../shared/types';

// Re-export types from types subdirectory for backward compatibility
export type {
  // E2E Step Types
  E2EStepType,
  NavigateStepOptions,
  ClickStepOptions,
  TypeStepOptions,
  WaitStepOptions,
  WaitConditionType,
  AssertStepOptions,
  AssertionType,
  ScreenshotStepOptions,
  A11yCheckStepOptions,
  StepOptions,
  E2EStepBase,
  NavigateStep,
  ClickStep,
  TypeStep,
  WaitStep,
  AssertStep,
  ScreenshotStep,
  A11yCheckStep,
  E2EStep,
  E2EStepResult,
  Viewport,
  BrowserContextOptions,
  E2ETestHooks,
  E2ETestCase,
  E2ETestResult,
  E2ETestSuite,
  E2ETestSuiteResult,
  ExtractStepType,
  StepOptionsFor,
  E2EStepBuilder,
  SerializableE2ETestCase,

  // Flow Template Types
  FlowCategory,
  FlowStatus,
  RecordedActionType,
  RecordedAction,
  NavigateAction,
  ClickAction,
  TypeAction,
  HoverAction,
  ScrollAction,
  SelectAction,
  UploadAction,
  DownloadAction,
  DragDropAction,
  KeyboardAction,
  AssertionAction,
  AnyRecordedAction,
  FlowTemplateBase,
  LoginFlowTemplate,
  CheckoutFlowTemplate,
  FormSubmissionFlowTemplate,
  SearchFlowTemplate,
  NavigationFlowTemplate,
  FlowTemplate,
  RecordingConfig,
  RecordingSession,
  UserFlow,
  CodeGenerationOptions,
  GeneratedTestCode,
} from './types';

// Re-export factory functions
export {
  createNavigateStep,
  createClickStep,
  createTypeStep,
  createWaitStep,
  createAssertStep,
  createScreenshotStep,
  createA11yCheckStep,
  createE2ETestCase,
  isNavigateStep,
  isClickStep,
  isTypeStep,
  isWaitStep,
  isAssertStep,
  isScreenshotStep,
  isA11yCheckStep,
  isNavigateAction,
  isClickAction,
  isTypeAction,
  isAssertionAction,
  isLoginFlowTemplate,
  isCheckoutFlowTemplate,
  isFormSubmissionFlowTemplate,
  isSearchFlowTemplate,
  isNavigationFlowTemplate,
  DEFAULT_RECORDING_CONFIG,
  DEFAULT_CODE_GENERATION_OPTIONS,
} from './types';

import type { ExecutionStrategy } from './services/e2e-runner';
import type { E2ETestCase, E2ETestResult, E2ETestSuite, E2ETestSuiteResult } from './types';

// ============================================================================
// Domain API
// ============================================================================

export interface ITestExecutionAPI {
  /**
   * Simple test execution - convenience method for CLI
   * Auto-detects framework and uses sensible defaults
   */
  runTests(request: ISimpleTestRequest): Promise<Result<ITestRunResult, Error>>;

  /** Execute test suite */
  execute(request: IExecuteTestsRequest): Promise<Result<ITestRunResult, Error>>;

  /** Execute tests in parallel */
  executeParallel(request: IParallelExecutionRequest): Promise<Result<ITestRunResult, Error>>;

  /** Detect flaky tests */
  detectFlaky(request: IFlakyDetectionRequest): Promise<Result<IFlakyTestReport, Error>>;

  /** Retry failed tests */
  retry(request: IRetryRequest): Promise<Result<IRetryResult, Error>>;

  /** Get execution statistics */
  getStats(runId: string): Promise<Result<IExecutionStats, Error>>;

  /** Execute E2E test case */
  executeE2ETestCase?(testCase: E2ETestCase): Promise<Result<E2ETestResult, Error>>;

  /** Execute E2E test suite */
  executeE2ETestSuite?(suite: E2ETestSuite, strategy?: ExecutionStrategy): Promise<Result<E2ETestSuiteResult, Error>>;
}

/** @deprecated Use ITestExecutionAPI */
export type TestExecutionAPI = ITestExecutionAPI;

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Simple test request for CLI convenience method
 * Auto-detects framework and uses sensible defaults
 */
export interface ISimpleTestRequest {
  /** Test files to execute */
  testFiles: string[];
  /** Run tests in parallel (default: true) */
  parallel?: boolean;
  /** Number of retry attempts for failed tests (default: 0) */
  retryCount?: number;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Number of parallel workers (default: auto based on file count) */
  workers?: number;
}

export interface IExecuteTestsRequest {
  testFiles: string[];
  framework: string;
  timeout?: number;
  env?: Record<string, string>;
  reporters?: string[];
}

export interface IParallelExecutionRequest extends IExecuteTestsRequest {
  workers: number;
  sharding?: 'file' | 'test' | 'time-balanced';
  isolation?: 'process' | 'worker' | 'none';
}

export interface ITestRunResult {
  runId: string;
  status: 'passed' | 'failed' | 'error';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failedTests: IFailedTest[];
  coverage?: ICoverageData;
}

export interface IFailedTest {
  testId: string;
  testName: string;
  file: string;
  error: string;
  stack?: string;
  duration: number;
}

export interface ICoverageData {
  line: number;
  branch: number;
  function: number;
  statement: number;
}

export interface IFlakyDetectionRequest {
  testFiles: string[];
  runs: number;
  threshold: number;
}

export interface IFlakyTestReport {
  flakyTests: IFlakyTest[];
  totalRuns: number;
  analysisTime: number;
}

export interface IFlakyTest {
  testId: string;
  testName: string;
  file: string;
  failureRate: number;
  pattern: 'timing' | 'ordering' | 'resource' | 'async' | 'unknown';
  recommendation: string;
}

export interface IRetryRequest {
  runId: string;
  failedTests: string[];
  maxRetries: number;
  backoff?: 'linear' | 'exponential';
}

export interface IRetryResult {
  originalFailed: number;
  retried: number;
  nowPassing: number;
  stillFailing: number;
  flakyDetected: string[];
}

export interface IExecutionStats {
  runId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  testsPerSecond: number;
  workers: number;
  memoryUsage: number;
}
import type { TestExecutionState, TestExecutionAction } from '../../integrations/rl-suite/interfaces.js';
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
    defer: 'p3', // Map defer to lowest priority (p3)
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
 * Input metadata for creating test prioritization state
 */
export interface TestPrioritizationMetadata {
  filePath: string;
  testName: string;
  testType?: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  priority?: Priority;
  complexity?: number;
  domain?: DomainName;
  dependencies?: string[];
  estimatedDuration?: number;
  coverage?: number;
  failureHistory?: number[];
  failureRate?: number;
  flakinessScore?: number;
  executionCount?: number;
  timeSinceModification?: number;
  businessCriticality?: number;
  dependencyCount?: number;
  assignedPriority?: Priority;
}

/**
 * Create test prioritization state from test metadata
 */
export function createTestPrioritizationState(
  testId: string,
  metadata: TestPrioritizationMetadata
): TestPrioritizationState {
  const features = mapToFeatures(metadata as Partial<TestPrioritizationState>);

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
    failureRate: metadata.failureRate ?? 0,
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

// ============================================================================
// Backward Compatibility Exports (non-I prefixed)
// ============================================================================

/** @deprecated Use ISimpleTestRequest */
export type SimpleTestRequest = ISimpleTestRequest;
/** @deprecated Use IExecuteTestsRequest */
export type ExecuteTestsRequest = IExecuteTestsRequest;
/** @deprecated Use IParallelExecutionRequest */
export type ParallelExecutionRequest = IParallelExecutionRequest;
/** @deprecated Use ITestRunResult */
export type TestRunResult = ITestRunResult;
/** @deprecated Use IFailedTest */
export type FailedTest = IFailedTest;
/** @deprecated Use ICoverageData */
export type CoverageData = ICoverageData;
/** @deprecated Use IFlakyDetectionRequest */
export type FlakyDetectionRequest = IFlakyDetectionRequest;
/** @deprecated Use IFlakyTestReport */
export type FlakyTestReport = IFlakyTestReport;
/** @deprecated Use IFlakyTest */
export type FlakyTest = IFlakyTest;
/** @deprecated Use IRetryRequest */
export type RetryRequest = IRetryRequest;
/** @deprecated Use IRetryResult */
export type RetryResult = IRetryResult;
/** @deprecated Use IExecutionStats */
export type ExecutionStats = IExecutionStats;
