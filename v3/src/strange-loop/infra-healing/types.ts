/**
 * Infrastructure Self-Healing Types
 * ADR-057: Infrastructure Self-Healing Extension for Strange Loop
 *
 * Defines types for detecting infrastructure failures during test execution
 * and orchestrating automated recovery via YAML-driven playbooks.
 */

import type { SwarmVulnerability } from '../types.js';

// ============================================================================
// Classification Types
// ============================================================================

/**
 * Classification of a test output error
 */
export type TestOutputClassification =
  | 'test_bug'
  | 'infra_failure'
  | 'flaky'
  | 'unknown';

/**
 * Infrastructure error signature for pattern matching
 */
export interface InfraErrorSignature {
  /** Regex pattern to match against test output */
  readonly pattern: RegExp;
  /** Classification when this pattern matches */
  readonly classification: TestOutputClassification;
  /** Vulnerability type to emit when classified as infra_failure */
  readonly vulnerabilityType: SwarmVulnerability['type'];
  /** Service name to associate with (for playbook lookup) */
  readonly serviceName: string;
  /** Default severity (0-1) */
  readonly defaultSeverity: number;
  /** Human-readable description */
  readonly description: string;
}

/**
 * Result of classifying a single test output line or block
 */
export interface ClassifiedError {
  /** The original output text that matched */
  readonly rawOutput: string;
  /** Line number in the output (if available) */
  readonly lineNumber?: number;
  /** Classification result */
  readonly classification: TestOutputClassification;
  /** Matched signature (if any) */
  readonly matchedSignature?: InfraErrorSignature;
  /** Confidence in classification (0-1) */
  readonly confidence: number;
  /** Extracted service name */
  readonly serviceName?: string;
  /** Timestamp of classification */
  readonly classifiedAt: number;
}

/**
 * Aggregated result from observing an entire test run's output
 */
export interface TestOutputObservation {
  /** Unique observation ID */
  readonly id: string;
  /** Total lines parsed */
  readonly totalLinesParsed: number;
  /** Classified errors found */
  readonly classifiedErrors: readonly ClassifiedError[];
  /** Infra failures detected (subset of classifiedErrors) */
  readonly infraFailures: readonly ClassifiedError[];
  /** Generated vulnerabilities for the Strange Loop */
  readonly vulnerabilities: readonly SwarmVulnerability[];
  /** Timestamp */
  readonly observedAt: number;
  /** Duration of parsing in ms */
  readonly parsingDurationMs: number;
}

// ============================================================================
// Command Runner Interface (DI for shell execution)
// ============================================================================

/**
 * Result of executing a shell command
 */
export interface CommandResult {
  /** Exit code (0 = success) */
  readonly exitCode: number;
  /** Standard output */
  readonly stdout: string;
  /** Standard error */
  readonly stderr: string;
  /** Execution duration in ms */
  readonly durationMs: number;
  /** Whether the command timed out */
  readonly timedOut: boolean;
}

/**
 * Interface for executing shell commands.
 * Injected into InfraActionExecutor for testability.
 */
export interface CommandRunner {
  /**
   * Execute a shell command and return the result.
   * @param command - The command to execute
   * @param timeoutMs - Timeout in milliseconds
   * @returns Result with exit code, stdout, stderr
   */
  run(command: string, timeoutMs: number): Promise<CommandResult>;
}

// ============================================================================
// Recovery Playbook Types
// ============================================================================

/**
 * A single recovery step command
 */
export interface RecoveryCommand {
  /** Shell command to execute */
  readonly command: string;
  /** Timeout in milliseconds */
  readonly timeoutMs: number;
  /** Whether this command must succeed for recovery to continue */
  readonly required: boolean;
}

/**
 * Recovery plan for a single service
 */
export interface ServiceRecoveryPlan {
  /** Service identifier (matches InfraErrorSignature.serviceName) */
  readonly serviceName: string;
  /** Human-readable service description */
  readonly description: string;
  /** Health check command — returns exit 0 if service is healthy */
  readonly healthCheck: RecoveryCommand;
  /** Recovery commands — executed in order */
  readonly recover: readonly RecoveryCommand[];
  /** Verification command — returns exit 0 if recovery succeeded */
  readonly verify: RecoveryCommand;
  /** Maximum retry attempts */
  readonly maxRetries: number;
  /** Backoff delays in milliseconds per attempt */
  readonly backoffMs: readonly number[];
}

/**
 * Complete playbook configuration loaded from YAML
 */
export interface RecoveryPlaybookConfig {
  /** Playbook version */
  readonly version: string;
  /** Default timeout for commands if not specified */
  readonly defaultTimeoutMs: number;
  /** Default max retries if not specified */
  readonly defaultMaxRetries: number;
  /** Default backoff delays */
  readonly defaultBackoffMs: readonly number[];
  /** Services and their recovery plans */
  readonly services: Record<string, ServiceRecoveryPlan>;
}

// ============================================================================
// Coordination Lock Types
// ============================================================================

/**
 * A lock entry for a service recovery in progress
 */
export interface CoordinationLockEntry {
  /** Service being recovered */
  readonly serviceName: string;
  /** ID of the holder (e.g., action ID) */
  readonly holderId: string;
  /** When the lock was acquired */
  readonly acquiredAt: number;
  /** TTL in milliseconds (auto-release after) */
  readonly ttlMs: number;
}

/**
 * Result of attempting to acquire a lock
 */
export interface LockAcquireResult {
  /** Whether the lock was acquired */
  readonly acquired: boolean;
  /** If not acquired, who holds it */
  readonly currentHolder?: string;
  /** If not acquired, when it expires */
  readonly expiresAt?: number;
}

// ============================================================================
// Recovery Result Types
// ============================================================================

/**
 * Result of a single recovery attempt for a service
 */
export interface RecoveryAttemptResult {
  /** Service that was recovered */
  readonly serviceName: string;
  /** Whether recovery succeeded */
  readonly success: boolean;
  /** Attempt number (1-based) */
  readonly attempt: number;
  /** Health check result before recovery */
  readonly healthCheckResult: CommandResult;
  /** Recovery command results */
  readonly recoveryResults: readonly CommandResult[];
  /** Verification result after recovery */
  readonly verifyResult?: CommandResult;
  /** Total duration in ms */
  readonly durationMs: number;
  /** Error message if failed */
  readonly error?: string;
  /** Timestamp */
  readonly attemptedAt: number;
}

/**
 * Aggregate result of all recovery attempts for a service
 */
export interface ServiceRecoveryResult {
  /** Service name */
  readonly serviceName: string;
  /** Whether the service was ultimately recovered */
  readonly recovered: boolean;
  /** Total attempts made */
  readonly totalAttempts: number;
  /** Individual attempt results */
  readonly attempts: readonly RecoveryAttemptResult[];
  /** Total time spent on recovery */
  readonly totalDurationMs: number;
  /** Whether escalation was triggered */
  readonly escalated: boolean;
  /** Test IDs that were affected by this infra failure and should be re-run */
  readonly affectedTestIds: readonly string[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the infrastructure healing subsystem
 */
export interface InfraHealingConfig {
  /** Path to the recovery playbook YAML file (or inline YAML content) */
  readonly playbookPath: string;
  /** Whether to auto-classify test output */
  readonly autoClassifyEnabled: boolean;
  /** Lock TTL in milliseconds (default: 120_000 = 2 min) */
  readonly lockTtlMs: number;
  /** Maximum concurrent recoveries */
  readonly maxConcurrentRecoveries: number;
  /** Whether verbose logging is enabled */
  readonly verboseLogging: boolean;
  /** Prefix for synthetic infra agent IDs */
  readonly infraAgentPrefix: string;
}

/**
 * Default configuration for infrastructure healing
 */
export const DEFAULT_INFRA_HEALING_CONFIG: InfraHealingConfig = {
  playbookPath: './recovery-playbook.yaml',
  autoClassifyEnabled: true,
  lockTtlMs: 120_000,
  maxConcurrentRecoveries: 3,
  verboseLogging: false,
  infraAgentPrefix: 'infra-',
};

// ============================================================================
// Statistics
// ============================================================================

/**
 * Statistics for the infrastructure healing subsystem
 */
export interface InfraHealingStats {
  /** Total test outputs observed */
  totalObservations: number;
  /** Total infra failures detected */
  infraFailuresDetected: number;
  /** Total recoveries attempted */
  recoveriesAttempted: number;
  /** Successful recoveries */
  recoveriesSucceeded: number;
  /** Failed recoveries */
  recoveriesFailed: number;
  /** Lock contention events (lock was already held) */
  lockContentionEvents: number;
  /** Breakdown by service name */
  byService: Record<string, {
    failures: number;
    recoveries: number;
    successes: number;
  }>;
}

/**
 * Create initial empty stats
 */
export function createEmptyStats(): InfraHealingStats {
  return {
    totalObservations: 0,
    infraFailuresDetected: 0,
    recoveriesAttempted: 0,
    recoveriesSucceeded: 0,
    recoveriesFailed: 0,
    lockContentionEvents: 0,
    byService: {},
  };
}
