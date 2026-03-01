/**
 * Agentic QE v3 - Background Worker Interfaces
 * ADR-014: Background Workers for QE Monitoring
 *
 * Defines the contracts for background workers that continuously monitor
 * and optimize the QE system without requiring manual intervention.
 */

import { DomainName, Severity, Priority } from '../shared/types';

// ============================================================================
// Worker Status Types
// ============================================================================

export type WorkerStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'error';

export type WorkerPriority = 'low' | 'normal' | 'high' | 'critical';

// ============================================================================
// Worker Configuration
// ============================================================================

export interface WorkerConfig {
  /** Unique worker identifier */
  readonly id: string;

  /** Human-readable worker name */
  readonly name: string;

  /** Worker description */
  readonly description: string;

  /** Execution interval in milliseconds */
  readonly intervalMs: number;

  /** Worker priority */
  readonly priority: WorkerPriority;

  /** Domains this worker monitors */
  readonly targetDomains: DomainName[];

  /** Whether worker is enabled */
  enabled: boolean;

  /** Maximum execution time before timeout (ms) */
  readonly timeoutMs: number;

  /** Number of retries on failure */
  readonly retryCount: number;

  /** Delay between retries (ms) */
  readonly retryDelayMs: number;

  /** Custom configuration options */
  readonly options?: Record<string, unknown>;
}

// ============================================================================
// Worker Result Types
// ============================================================================

export interface WorkerResult {
  /** Worker that produced this result */
  readonly workerId: string;

  /** Execution timestamp */
  readonly timestamp: Date;

  /** Duration of execution in milliseconds */
  readonly durationMs: number;

  /** Whether execution was successful */
  readonly success: boolean;

  /** Error message if failed */
  readonly error?: string;

  /** Metrics collected during execution */
  readonly metrics: WorkerMetrics;

  /** Findings from the worker analysis */
  readonly findings: WorkerFinding[];

  /** Recommendations based on findings */
  readonly recommendations: WorkerRecommendation[];
}

export interface WorkerMetrics {
  /** Number of items analyzed */
  readonly itemsAnalyzed: number;

  /** Number of issues found */
  readonly issuesFound: number;

  /** Health score (0-100) */
  readonly healthScore: number;

  /** Trend direction */
  readonly trend: 'improving' | 'stable' | 'degrading';

  /** Domain-specific metrics */
  readonly domainMetrics: Record<string, number | string>;
}

export interface WorkerFinding {
  /** Finding type */
  readonly type: string;

  /** Severity level */
  readonly severity: Severity;

  /** Affected domain */
  readonly domain: DomainName;

  /** Finding title */
  readonly title: string;

  /** Detailed description */
  readonly description: string;

  /** Affected resource (file, test, etc.) */
  readonly resource?: string;

  /** Additional context */
  readonly context?: Record<string, unknown>;
}

export interface WorkerRecommendation {
  /** Priority of the recommendation */
  readonly priority: Priority;

  /** Target domain */
  readonly domain: DomainName;

  /** Action title */
  readonly action: string;

  /** Detailed description */
  readonly description: string;

  /** Estimated impact */
  readonly estimatedImpact: 'low' | 'medium' | 'high';

  /** Effort required */
  readonly effort: 'low' | 'medium' | 'high';

  /** Auto-fixable flag */
  readonly autoFixable: boolean;
}

// ============================================================================
// Worker Interface
// ============================================================================

export interface Worker {
  /** Worker configuration */
  readonly config: WorkerConfig;

  /** Current worker status */
  readonly status: WorkerStatus;

  /** Last execution result */
  readonly lastResult?: WorkerResult;

  /** Last execution time */
  readonly lastRunAt?: Date;

  /** Next scheduled execution time */
  readonly nextRunAt?: Date;

  /**
   * Initialize the worker
   */
  initialize(): Promise<void>;

  /**
   * Execute the worker's main task
   * @param context - Execution context with dependencies
   */
  execute(context: WorkerContext): Promise<WorkerResult>;

  /**
   * Pause the worker
   */
  pause(): void;

  /**
   * Resume the worker
   */
  resume(): void;

  /**
   * Stop the worker
   */
  stop(): Promise<void>;

  /**
   * Get worker health status
   */
  getHealth(): WorkerHealth;
}

// ============================================================================
// Worker Context
// ============================================================================

export interface WorkerContext {
  /** Event bus for publishing findings */
  readonly eventBus: WorkerEventBus;

  /** Memory backend for storing results */
  readonly memory: WorkerMemory;

  /** Logger for worker output */
  readonly logger: WorkerLogger;

  /** Access to domain APIs */
  readonly domains: WorkerDomainAccess;

  /** Abort signal for cancellation */
  readonly signal: AbortSignal;
}

export interface WorkerEventBus {
  publish(event: WorkerEvent): Promise<void>;
}

export interface WorkerEvent {
  readonly type: string;
  readonly workerId: string;
  readonly timestamp: Date;
  readonly payload: unknown;
}

export interface WorkerMemory {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  search(pattern: string): Promise<string[]>;
}

export interface WorkerLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface WorkerDomainAccess {
  getDomainAPI<T>(domain: DomainName): T | undefined;
  getDomainHealth(domain: DomainName): { status: string; errors: string[] };
}

// ============================================================================
// Worker Health
// ============================================================================

export interface WorkerHealth {
  /** Worker status */
  readonly status: WorkerStatus;

  /** Health score (0-100) */
  readonly healthScore: number;

  /** Total executions */
  readonly totalExecutions: number;

  /** Successful executions */
  readonly successfulExecutions: number;

  /** Failed executions */
  readonly failedExecutions: number;

  /** Average execution duration (ms) */
  readonly avgDurationMs: number;

  /** Last 5 execution results */
  readonly recentResults: Array<{
    timestamp: Date;
    success: boolean;
    durationMs: number;
  }>;
}

// ============================================================================
// Worker Manager Interface
// ============================================================================

export interface WorkerManager {
  /**
   * Register a worker
   */
  register(worker: Worker): void;

  /**
   * Unregister a worker
   */
  unregister(workerId: string): void;

  /**
   * Get a worker by ID
   */
  get(workerId: string): Worker | undefined;

  /**
   * List all registered workers
   */
  list(): Worker[];

  /**
   * Start all enabled workers
   */
  startAll(): Promise<void>;

  /**
   * Stop all workers
   */
  stopAll(): Promise<void>;

  /**
   * Run a specific worker immediately
   */
  runNow(workerId: string): Promise<WorkerResult>;

  /**
   * Get manager health status
   */
  getHealth(): WorkerManagerHealth;
}

export interface WorkerManagerHealth {
  /** Total registered workers */
  readonly totalWorkers: number;

  /** Running workers */
  readonly runningWorkers: number;

  /** Paused workers */
  readonly pausedWorkers: number;

  /** Workers in error state */
  readonly errorWorkers: number;

  /** Overall health score */
  readonly healthScore: number;

  /** Worker statuses */
  readonly workers: Record<string, WorkerHealth>;
}

// ============================================================================
// Daemon Interface
// ============================================================================

export interface Daemon {
  /** Whether daemon is running */
  readonly running: boolean;

  /** Daemon uptime in seconds */
  readonly uptime: number;

  /**
   * Start the daemon
   */
  start(): Promise<void>;

  /**
   * Stop the daemon
   */
  stop(): Promise<void>;

  /**
   * Restart the daemon
   */
  restart(): Promise<void>;

  /**
   * Get daemon status
   */
  getStatus(): DaemonStatus;
}

export interface DaemonStatus {
  readonly running: boolean;
  readonly pid?: number;
  readonly uptime: number;
  readonly startedAt?: Date;
  readonly workerManager: WorkerManagerHealth;
}
