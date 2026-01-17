/**
 * Hook-related TypeScript interfaces for agent lifecycle hooks
 * Provides type safety for verification hooks and task lifecycle
 */

import { TaskAssignment } from './index';

// ============================================================================
// Core Task Result Types
// ============================================================================

/**
 * Base interface for all task execution results
 */
export interface TaskResultBase {
  /** Whether the task completed successfully */
  success: boolean;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Timestamp when the result was produced */
  timestamp?: Date | number;
}

/**
 * Test generation task result
 */
export interface TestGenerationResult extends TaskResultBase {
  /** Number of tests generated */
  testsGenerated: number;
  /** Generated test files */
  testFiles?: string[];
  /** Code coverage achieved */
  coverage?: number;
  /** Test framework used */
  framework?: string;
  /** Quality score (0-1) */
  qualityScore?: number;
}

/**
 * Coverage analysis task result
 */
export interface CoverageAnalysisResult extends TaskResultBase {
  /** Overall coverage percentage */
  coverage: number;
  /** Line coverage percentage */
  lineCoverage?: number;
  /** Branch coverage percentage */
  branchCoverage?: number;
  /** Function coverage percentage */
  functionCoverage?: number;
  /** Uncovered lines */
  uncoveredLines?: number[];
  /** Coverage gaps identified */
  gaps?: CoverageGap[];
}

/**
 * Coverage gap information
 */
export interface CoverageGap {
  file: string;
  startLine: number;
  endLine: number;
  reason?: string;
}

/**
 * Security scan task result
 */
export interface SecurityScanResult extends TaskResultBase {
  /** Number of issues found */
  issuesFound: number;
  /** Issues by severity */
  bySeverity?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    info?: number;
  };
  /** Detailed vulnerability findings */
  vulnerabilities?: SecurityVulnerability[];
}

/**
 * Security vulnerability finding
 */
export interface SecurityVulnerability {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file?: string;
  line?: number;
  description?: string;
  remediation?: string;
}

/**
 * Performance test result
 */
export interface PerformanceTestResult extends TaskResultBase {
  /** Average response time in ms */
  avgResponseTime?: number;
  /** P95 response time in ms */
  p95ResponseTime?: number;
  /** P99 response time in ms */
  p99ResponseTime?: number;
  /** Throughput (requests per second) */
  throughput?: number;
  /** Error rate percentage */
  errorRate?: number;
}

/**
 * Quality gate evaluation result
 */
export interface QualityGateResult extends TaskResultBase {
  /** Whether the quality gate passed */
  passed: boolean;
  /** Overall quality score (0-1) */
  score?: number;
  /** Individual gate results */
  gates?: QualityGateCheck[];
}

/**
 * Individual quality gate check
 */
export interface QualityGateCheck {
  name: string;
  passed: boolean;
  threshold: number;
  actual: number;
  message?: string;
}

/**
 * Union type for common task results
 * Note: Agents may define their own specific result types that extend TaskResultBase
 */
export type TaskResult =
  | TaskResultBase
  | TestGenerationResult
  | CoverageAnalysisResult
  | SecurityScanResult
  | PerformanceTestResult
  | QualityGateResult;

/**
 * Flexible task result type that accepts any result structure
 * Used in hook data interfaces where result type varies by agent
 */
export type FlexibleTaskResult = TaskResult | Record<string, unknown> | unknown;

// ============================================================================
// File Change Types
// ============================================================================

/**
 * Represents a single line change in a file
 */
export interface LineChange {
  /** Line number */
  line: number;
  /** Original content (if update/delete) */
  oldContent?: string;
  /** New content (if create/update) */
  newContent?: string;
  /** Type of change */
  type: 'insert' | 'delete' | 'modify';
}

/**
 * Represents changes to a file
 */
export interface FileChanges {
  /** Changed lines */
  lines?: LineChange[];
  /** Range of changes (start line) */
  startLine?: number;
  /** Range of changes (end line) */
  endLine?: number;
  /** Content before changes */
  before?: string;
  /** Content after changes */
  after?: string;
  /** Diff in unified format */
  diff?: string;
  /** Number of insertions */
  insertions?: number;
  /** Number of deletions */
  deletions?: number;
}

// ============================================================================
// Configuration and Schema Types
// ============================================================================

/**
 * JSON Schema definition for configuration validation
 */
export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/**
 * Configuration object for hook context
 */
export interface HookConfigContext {
  /** Configuration key-value pairs */
  [key: string]: string | number | boolean | null | HookConfigContext | unknown[];
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Task execution metrics
 */
export interface TaskMetrics {
  /** CPU usage percentage */
  cpuUsage?: number;
  /** Memory usage in bytes */
  memoryUsage?: number;
  /** Execution duration in ms */
  executionTime?: number;
  /** Number of retries */
  retryCount?: number;
  /** Queue wait time in ms */
  queueWaitTime?: number;
}

/**
 * Quality metrics for post-task validation
 */
export interface QualityMetrics {
  /** Cyclomatic complexity */
  complexity?: number;
  /** Maintainability index */
  maintainability?: number;
  /** Code duplication percentage */
  duplication?: number;
  /** Test coverage percentage */
  coverage?: number;
  /** Technical debt (hours) */
  technicalDebt?: number;
}

/**
 * Coverage metrics for post-task validation
 */
export interface CoverageMetrics {
  /** Total lines */
  total: number;
  /** Covered lines */
  covered: number;
  /** Coverage percentage */
  percentage: number;
  /** By file breakdown */
  byFile?: Record<string, { covered: number; total: number; percentage: number }>;
}

/**
 * Performance metrics for post-task validation
 */
export interface PerformanceMetrics {
  /** Average response time in ms */
  avgResponseTime: number;
  /** P50 (median) response time */
  p50?: number;
  /** P95 response time */
  p95?: number;
  /** P99 response time */
  p99?: number;
  /** Throughput (requests/sec) */
  throughput?: number;
  /** Error rate percentage */
  errorRate?: number;
}

/**
 * Session metrics for session-end hooks
 */
export interface SessionMetrics {
  /** Total tasks executed */
  tasksExecuted: number;
  /** Successful tasks */
  tasksSucceeded: number;
  /** Failed tasks */
  tasksFailed: number;
  /** Total execution time in ms */
  totalExecutionTime: number;
  /** Average task duration in ms */
  avgTaskDuration?: number;
  /** Memory usage statistics */
  memoryStats?: {
    peak: number;
    average: number;
  };
}

// ============================================================================
// Pre-Task Data
// ============================================================================

/**
 * Environment validation context for pre-task hooks
 */
export interface EnvironmentValidationContext {
  /** Required environment variables */
  requiredVars?: string[];
  /** Minimum Node.js version */
  minNodeVersion?: string;
  /** Required modules */
  requiredModules?: string[];
}

/**
 * Resource validation context for pre-task hooks
 */
export interface ResourceValidationContext {
  /** Minimum memory in MB */
  minMemoryMB?: number;
  /** Minimum CPU cores */
  minCPUCores?: number;
  /** Minimum disk space in MB */
  minDiskSpaceMB?: number;
  /** Path to check for disk space */
  checkPath?: string;
  /** Maximum load average */
  maxLoadAverage?: number;
}

/**
 * File system validation context for pre-task hooks
 */
export interface FileSystemValidationContext {
  /** Files that must exist */
  files?: string[];
  /** Directories that must exist */
  directories?: string[];
  /** Required permissions */
  requiredPermissions?: string[];
  /** Required access levels */
  requiredAccess?: ('read' | 'write' | 'execute')[];
}

/**
 * Configuration validation context for pre-task hooks
 */
export interface ConfigValidationContext {
  /** Configuration to validate */
  config?: HookConfigContext;
  /** JSON Schema for validation */
  schema?: JsonSchema;
  /** Required configuration keys */
  requiredKeys?: string[];
  /** Validate against stored configuration */
  validateAgainstStored?: boolean;
  /** Key for stored configuration */
  storedKey?: string;
}

/**
 * Combined pre-task validation context
 */
export interface PreTaskValidationContext extends
  EnvironmentValidationContext,
  ResourceValidationContext,
  FileSystemValidationContext,
  ConfigValidationContext {}

/**
 * Base task structure that all tasks must have
 */
export interface TaskBase {
  /** Task type identifier */
  type: string;
}

/**
 * Base task assignment properties that all task assignments must have
 */
export interface TaskAssignmentBase {
  /** Unique identifier for the assignment */
  id: string;
  /** The task to be executed */
  task: TaskBase;
}

/**
 * Data passed to pre-task hooks
 * @template TAssignment - The type of the task assignment (defaults to TaskAssignment for strict typing)
 */
export interface PreTaskData<TAssignment extends TaskAssignmentBase = TaskAssignment> {
  /** The task assignment being executed */
  assignment: TAssignment;
  /** Optional context for environment/resource validation */
  context?: PreTaskValidationContext;
}

// ============================================================================
// Post-Task Data
// ============================================================================

/**
 * Output structure for post-task validation
 */
export interface TaskOutputStructure {
  /** Expected output type */
  type?: string;
  /** Expected output format */
  format?: 'json' | 'xml' | 'text' | 'binary';
  /** Expected output size range */
  sizeRange?: { min?: number; max?: number };
}

/**
 * Threshold configuration for quality validation
 */
export interface QualityThresholds {
  /** Maximum cyclomatic complexity */
  maxComplexity?: number;
  /** Minimum maintainability index (0-100) */
  minMaintainability?: number;
  /** Maximum code duplication percentage */
  maxDuplication?: number;
  /** Minimum test coverage percentage */
  minCoverage?: number;
}

/**
 * Threshold configuration for coverage validation
 */
export interface CoverageThresholds {
  /** Minimum overall coverage */
  minOverall?: number;
  /** Minimum line coverage */
  minLine?: number;
  /** Minimum branch coverage */
  minBranch?: number;
  /** Minimum function coverage */
  minFunction?: number;
}

/**
 * Threshold configuration for performance validation
 */
export interface PerformanceThresholds {
  /** Maximum average response time in ms */
  maxAvgResponseTime?: number;
  /** Maximum P95 response time in ms */
  maxP95?: number;
  /** Maximum P99 response time in ms */
  maxP99?: number;
  /** Minimum throughput (requests/sec) */
  minThroughput?: number;
  /** Maximum error rate percentage */
  maxErrorRate?: number;
}

/**
 * Baseline for coverage comparison
 */
export interface CoverageBaseline {
  /** Baseline overall coverage */
  overall: number;
  /** Baseline line coverage */
  line?: number;
  /** Baseline branch coverage */
  branch?: number;
  /** Baseline function coverage */
  function?: number;
  /** Baseline timestamp */
  timestamp?: Date | number;
}

/**
 * Baseline for performance comparison
 */
export interface PerformanceBaseline {
  /** Baseline average response time */
  avgResponseTime: number;
  /** Baseline P95 */
  p95?: number;
  /** Baseline P99 */
  p99?: number;
  /** Baseline throughput */
  throughput?: number;
  /** Baseline timestamp */
  timestamp?: Date | number;
}

/**
 * Post-task validation context
 */
export interface PostTaskValidationContext {
  /** Output to validate */
  output?: FlexibleTaskResult;
  /** Expected output structure */
  expectedStructure?: TaskOutputStructure;
  /** Expected types for output fields */
  expectedTypes?: Record<string, string>;
  /** Required fields in output */
  requiredFields?: string[];
  /** Quality metrics */
  metrics?: QualityMetrics | TaskMetrics;
  /** Quality thresholds */
  qualityThresholds?: QualityThresholds;
  /** Coverage metrics */
  coverage?: CoverageMetrics;
  /** Coverage thresholds */
  coverageThresholds?: CoverageThresholds;
  /** Coverage baseline for comparison */
  coverageBaseline?: CoverageBaseline;
  /** Performance metrics */
  performance?: PerformanceMetrics;
  /** Performance thresholds */
  performanceThresholds?: PerformanceThresholds;
  /** Performance baseline for comparison */
  performanceBaseline?: PerformanceBaseline;
  /** Regression threshold percentage */
  regressionThreshold?: number;
}

/**
 * Data passed to post-task hooks
 * @template TResult - The type of the task result (defaults to FlexibleTaskResult for backwards compatibility)
 * @template TAssignment - The type of the task assignment (defaults to TaskAssignment)
 */
export interface PostTaskData<TResult = FlexibleTaskResult, TAssignment extends TaskAssignmentBase = TaskAssignment> {
  /** The task assignment that was executed */
  assignment: TAssignment;
  /** The result of the task execution */
  result: TResult;
  /** Optional validation context */
  context?: PostTaskValidationContext;
}

// ============================================================================
// Task Error Data
// ============================================================================

/**
 * Error context for task failure hooks
 */
export interface TaskErrorContext {
  /** Stage where error occurred */
  stage?: 'initialization' | 'execution' | 'validation' | 'cleanup' | string;
  /** Attempt number (for retries) */
  attemptNumber?: number;
  /** Whether the task can be retried */
  canRetry?: boolean;
  /** Available recovery options */
  recoveryOptions?: string[];
  /** Stack trace */
  stackTrace?: string;
  /** Related error codes */
  errorCodes?: string[];
}

/**
 * Data passed to task error hooks
 * @template TAssignment - The type of the task assignment (defaults to TaskAssignment)
 */
export interface TaskErrorData<TAssignment extends TaskAssignmentBase = TaskAssignment> {
  /** The task assignment that failed */
  assignment: TAssignment;
  /** The error that occurred */
  error: Error;
  /** Optional error context */
  context?: TaskErrorContext;
}

// ============================================================================
// Edit Hook Data
// ============================================================================

/**
 * Pre-edit validation context
 */
export interface PreEditContext {
  /** Type of edit operation */
  editType?: 'create' | 'update' | 'delete';
  /** Expected file format */
  expectedFormat?: string;
  /** Validate syntax before edit */
  validateSyntax?: boolean;
  /** Check for file locks */
  checkLocks?: boolean;
  /** Validate file size limits */
  maxFileSize?: number;
  /** Required permissions for edit */
  requiredPermissions?: ('read' | 'write' | 'execute')[];
}

/**
 * Data passed to pre-edit hooks
 */
export interface PreEditData {
  /** File path being edited */
  file: string;
  /** Changes being applied */
  changes: FileChanges;
  /** Optional edit context */
  context?: PreEditContext;
}

/**
 * Post-edit result context
 */
export interface PostEditContext {
  /** Whether the edit succeeded */
  success?: boolean;
  /** Artifact ID if created */
  artifactId?: string;
  /** Whether to update dependencies */
  updateDependencies?: boolean;
  /** Whether to notify other agents */
  notifyAgents?: boolean;
  /** Files affected by the edit */
  affectedFiles?: string[];
  /** Validation results */
  validationResult?: {
    syntaxValid: boolean;
    lintPassed: boolean;
    errors?: string[];
  };
}

/**
 * Data passed to post-edit hooks
 */
export interface PostEditData {
  /** File path that was edited */
  file: string;
  /** Changes that were applied */
  changes: FileChanges;
  /** Optional edit result context */
  context?: PostEditContext;
}

// ============================================================================
// Session Hook Data
// ============================================================================

/**
 * Session end context
 */
export interface SessionEndContext {
  /** Final session metrics */
  finalMetrics?: SessionMetrics;
  /** Path to export session data */
  exportPath?: string;
  /** Whether cleanup is required */
  cleanupRequired?: boolean;
  /** Whether to persist state */
  persistState?: boolean;
  /** Session summary */
  summary?: {
    totalDuration: number;
    tasksCompleted: number;
    tasksFailed: number;
    errorsEncountered: number;
  };
}

/**
 * Data passed to session-end hooks
 */
export interface SessionEndData {
  /** Session identifier */
  sessionId: string;
  /** Session duration in milliseconds */
  duration: number;
  /** Number of tasks completed */
  tasksCompleted: number;
  /** Optional session context */
  context?: SessionEndContext;
}

// ============================================================================
// Generic Hook Types
// ============================================================================

/**
 * All possible hook data types
 */
export type HookData =
  | PreTaskData
  | PostTaskData
  | TaskErrorData
  | PreEditData
  | PostEditData
  | SessionEndData;

/**
 * Hook type identifiers
 */
export type HookType =
  | 'pre-task'
  | 'post-task'
  | 'task-error'
  | 'pre-edit'
  | 'post-edit'
  | 'session-start'
  | 'session-end'
  | 'pre-initialization'
  | 'post-initialization'
  | 'pre-termination'
  | 'post-termination';

/**
 * Generic hook handler function type
 * @template T - The type of data the handler receives
 * @template R - The return type (defaults to void)
 */
export type HookHandler<T extends HookData = HookData, R = void> = (data: T) => Promise<R> | R;

/**
 * Typed hook handlers for specific hook types
 */
export type PreTaskHookHandler = HookHandler<PreTaskData>;
export type PostTaskHookHandler = HookHandler<PostTaskData>;
export type TaskErrorHookHandler = HookHandler<TaskErrorData>;
export type PreEditHookHandler = HookHandler<PreEditData>;
export type PostEditHookHandler = HookHandler<PostEditData>;
export type SessionEndHookHandler = HookHandler<SessionEndData>;

/**
 * Hook execution result data
 */
export interface HookResultData {
  /** Verification results */
  verification?: {
    passed: boolean;
    score: number;
    checks: Array<{
      name: string;
      passed: boolean;
      message?: string;
    }>;
  };
  /** Validation results */
  validation?: {
    valid: boolean;
    accuracy: number;
    issues?: string[];
  };
  /** Transformed data */
  transformed?: Record<string, unknown>;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
  /** Whether the hook executed successfully */
  success: boolean;
  /** Hook stage identifier */
  stage: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Optional error if hook failed */
  error?: Error;
  /** Optional result data */
  data?: HookResultData;
}

// ============================================================================
// Hook Registry Types
// ============================================================================

/**
 * Hook registration entry
 */
export interface HookRegistration<T extends HookData = HookData> {
  /** Unique identifier for the registration */
  id: string;
  /** Hook type */
  type: HookType;
  /** Handler function */
  handler: HookHandler<T>;
  /** Priority (higher = runs first) */
  priority?: number;
  /** Whether the hook is enabled */
  enabled?: boolean;
  /** Optional filter function */
  filter?: (data: T) => boolean;
}

/**
 * Hook registry interface
 */
export interface IHookRegistry {
  /** Register a hook handler */
  register<T extends HookData>(registration: HookRegistration<T>): void;
  /** Unregister a hook handler */
  unregister(id: string): void;
  /** Execute all handlers for a hook type */
  execute<T extends HookData>(type: HookType, data: T): Promise<HookExecutionResult[]>;
  /** Get all registered handlers for a type */
  getHandlers(type: HookType): HookRegistration[];
}
