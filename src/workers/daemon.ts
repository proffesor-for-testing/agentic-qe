/**
 * Agentic QE v3 - Daemon Process Management
 * ADR-014: Background Workers for QE Monitoring
 *
 * Manages the background daemon process that runs all QE workers.
 * Provides start/stop/restart functionality and health monitoring.
 */

import {
  Daemon as IDaemon,
  DaemonStatus,
  WorkerManager,
} from './interfaces';
import { WorkerManagerImpl } from './worker-manager';

// Import all QE workers (ADR-014)
import {
  TestHealthWorker,
  CoverageTrackerWorker,
  FlakyDetectorWorker,
  SecurityScanWorker,
  QualityGateWorker,
  LearningConsolidationWorker,
  DefectPredictorWorker,
  RegressionMonitorWorker,
  PerformanceBaselineWorker,
  ComplianceCheckerWorker,
} from './workers';

/**
 * Daemon configuration
 */
export interface DaemonConfig {
  /** Whether to auto-start workers on daemon start */
  autoStart?: boolean;

  /** Workers to enable (defaults to all) */
  enabledWorkers?: string[];

  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';

  /** Health check interval (ms) */
  healthCheckIntervalMs?: number;
}

/**
 * Default daemon configuration
 */
const DEFAULT_CONFIG: Required<DaemonConfig> = {
  autoStart: true,
  enabledWorkers: [],
  logLevel: 'info',
  healthCheckIntervalMs: 60000,
};

/**
 * Daemon implementation
 */
export class QEDaemon implements IDaemon {
  private _running = false;
  private _startedAt?: Date;
  private _healthCheckTimer?: NodeJS.Timeout;
  private workerManager: WorkerManagerImpl;
  private config: Required<DaemonConfig>;

  constructor(config?: DaemonConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.workerManager = new WorkerManagerImpl();
    this.registerWorkers();
  }

  get running(): boolean {
    return this._running;
  }

  get uptime(): number {
    if (!this._startedAt) return 0;
    return Math.floor((Date.now() - this._startedAt.getTime()) / 1000);
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    if (this._running) {
      console.info('[Daemon] Already running');
      return;
    }

    console.info('[Daemon] Starting QE Background Workers...');
    this._running = true;
    this._startedAt = new Date();

    // Start health check timer
    this._healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);

    // Auto-start workers if configured
    if (this.config.autoStart) {
      await this.workerManager.startAll();
      console.info('[Daemon] All workers started');
    }

    // Log registered workers
    const workers = this.workerManager.list();
    console.info(`[Daemon] Registered ${workers.length} workers:`);
    for (const worker of workers) {
      console.info(
        `  - ${worker.config.id}: ${worker.config.name} (interval: ${worker.config.intervalMs}ms)`
      );
    }
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    if (!this._running) {
      console.info('[Daemon] Not running');
      return;
    }

    console.info('[Daemon] Stopping...');

    // Clear health check timer
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = undefined;
    }

    // Stop all workers
    await this.workerManager.stopAll();

    this._running = false;
    console.info('[Daemon] Stopped');
  }

  /**
   * Restart the daemon
   */
  async restart(): Promise<void> {
    console.info('[Daemon] Restarting...');
    await this.stop();
    await this.start();
    console.info('[Daemon] Restarted');
  }

  /**
   * Get daemon status
   */
  getStatus(): DaemonStatus {
    return {
      running: this._running,
      pid: process.pid,
      uptime: this.uptime,
      startedAt: this._startedAt,
      workerManager: this.workerManager.getHealth(),
    };
  }

  /**
   * Get the worker manager for direct access
   */
  getWorkerManager(): WorkerManager {
    return this.workerManager;
  }

  /**
   * Run a specific worker immediately
   */
  async runWorker(workerId: string): Promise<void> {
    const result = await this.workerManager.runNow(workerId);
    console.info(`[Daemon] Worker ${workerId} completed:`, {
      success: result.success,
      duration: `${result.durationMs}ms`,
      findings: result.findings.length,
      healthScore: result.metrics.healthScore,
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private registerWorkers(): void {
    // All 10 QE-specific workers per ADR-014
    const allWorkers = [
      new TestHealthWorker(),           // 5 min - Test suite health
      new CoverageTrackerWorker(),      // 10 min - Coverage trends
      new FlakyDetectorWorker(),        // 15 min - Flaky test detection
      new SecurityScanWorker(),         // 30 min - Vulnerability scanning
      new QualityGateWorker(),          // 5 min - Gate evaluation
      new LearningConsolidationWorker(),// 30 min - Pattern consolidation
      new DefectPredictorWorker(),      // 15 min - ML defect prediction
      new RegressionMonitorWorker(),    // 10 min - Regression watching
      new PerformanceBaselineWorker(),  // 1 hour - Performance tracking
      new ComplianceCheckerWorker(),    // 30 min - ADR/DDD compliance
    ];

    for (const worker of allWorkers) {
      // Check if worker is enabled
      if (
        this.config.enabledWorkers.length === 0 ||
        this.config.enabledWorkers.includes(worker.config.id)
      ) {
        this.workerManager.register(worker);
      }
    }
  }

  private performHealthCheck(): void {
    const health = this.workerManager.getHealth();

    if (health.errorWorkers > 0) {
      console.warn(
        `[Daemon] Health check: ${health.errorWorkers} workers in error state`
      );
    }

    if (health.healthScore < 70) {
      console.warn(
        `[Daemon] Health score degraded: ${health.healthScore}%`
      );
    }

    if (this.config.logLevel === 'debug') {
      console.debug('[Daemon] Health check:', health);
    }
  }
}

/**
 * Factory function to create and configure the daemon
 */
export function createDaemon(config?: DaemonConfig): QEDaemon {
  return new QEDaemon(config);
}

/**
 * Global daemon instance (singleton)
 */
let globalDaemon: QEDaemon | undefined;

/**
 * Get or create the global daemon instance
 */
export function getDaemon(config?: DaemonConfig): QEDaemon {
  if (!globalDaemon) {
    globalDaemon = createDaemon(config);
  }
  return globalDaemon;
}

/**
 * Reset the global daemon instance (for testing)
 */
export function resetDaemon(): void {
  if (globalDaemon?.running) {
    globalDaemon.stop().catch(console.error);
  }
  globalDaemon = undefined;
}
