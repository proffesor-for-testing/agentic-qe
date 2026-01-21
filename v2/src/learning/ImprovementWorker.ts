/**
 * ImprovementWorker - Phase 2 (Milestone 2.2)
 *
 * Background worker for running continuous improvement cycles
 * at scheduled intervals with monitoring and error recovery.
 */

import { Logger } from '../utils/Logger';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { ImprovementLoop } from './ImprovementLoop';
import { LearningEngine } from './LearningEngine';
import { PerformanceTracker } from './PerformanceTracker';

/**
 * Worker configuration
 */
export interface WorkerConfig {
  intervalMs: number; // default: 3600000 (1 hour)
  maxRetries: number; // default: 3
  retryDelayMs: number; // default: 60000 (1 minute)
  enabled: boolean; // default: true
}

/**
 * Worker status
 */
export interface WorkerStatus {
  isRunning: boolean;
  lastCycleAt?: Date;
  nextCycleAt?: Date;
  cyclesCompleted: number;
  cyclesFailed: number;
  currentCycle?: {
    startedAt: Date;
    status: 'running' | 'failed' | 'completed';
  };
}

/**
 * ImprovementWorker - Manages background improvement cycles
 */
export class ImprovementWorker {
  private readonly logger: Logger;
  private readonly improvementLoop: ImprovementLoop;
  private config: WorkerConfig;
  private status: WorkerStatus;
  private intervalHandle?: NodeJS.Timeout;

  constructor(
    improvementLoop: ImprovementLoop,
    config: Partial<WorkerConfig> = {}
  ) {
    this.logger = Logger.getInstance();
    this.improvementLoop = improvementLoop;
    this.config = {
      intervalMs: config.intervalMs || 3600000, // 1 hour
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 60000, // 1 minute
      enabled: config.enabled ?? true
    };
    this.status = {
      isRunning: false,
      cyclesCompleted: 0,
      cyclesFailed: 0
    };
  }

  /**
   * Start the background worker
   */
  async start(): Promise<void> {
    if (this.status.isRunning) {
      this.logger.warn('ImprovementWorker already running');
      return;
    }

    if (!this.config.enabled) {
      this.logger.info('ImprovementWorker is disabled');
      return;
    }

    this.status.isRunning = true;
    this.logger.info(`Starting ImprovementWorker with ${this.config.intervalMs}ms interval`);

    // Run first cycle immediately
    await this.runCycleWithRetry();

    // Schedule periodic cycles
    this.intervalHandle = setInterval(async () => {
      await this.runCycleWithRetry();
    }, this.config.intervalMs);

    this.updateNextCycleTime();
  }

  /**
   * Stop the background worker
   */
  async stop(): Promise<void> {
    if (!this.status.isRunning) {
      return;
    }

    this.status.isRunning = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    this.logger.info('ImprovementWorker stopped');
  }

  /**
   * Run a single cycle with retry logic
   */
  private async runCycleWithRetry(): Promise<void> {
    let retries = 0;
    let success = false;

    this.status.currentCycle = {
      startedAt: new Date(),
      status: 'running'
    };

    while (retries < this.config.maxRetries && !success) {
      try {
        const result = await this.improvementLoop.runImprovementCycle();

        this.status.cyclesCompleted++;
        this.status.lastCycleAt = new Date();
        this.status.currentCycle.status = 'completed';
        success = true;

        this.logger.info('Improvement cycle completed', {
          cyclesCompleted: this.status.cyclesCompleted,
          result
        });
      } catch (error) {
        retries++;
        this.logger.error(`Improvement cycle failed (attempt ${retries}/${this.config.maxRetries}):`, error);

        if (retries < this.config.maxRetries) {
          // Wait before retrying
          await this.delay(this.config.retryDelayMs);
        } else {
          // All retries exhausted
          this.status.cyclesFailed++;
          this.status.currentCycle.status = 'failed';
          this.logger.error('Improvement cycle failed after all retries');
        }
      }
    }

    this.updateNextCycleTime();
  }

  /**
   * Get current worker status
   */
  getStatus(): WorkerStatus {
    return { ...this.status };
  }

  /**
   * Update worker configuration
   */
  updateConfig(config: Partial<WorkerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Worker configuration updated', this.config);

    // Restart if running and interval changed
    if (this.status.isRunning && config.intervalMs) {
      this.stop().then(() => this.start());
    }
  }

  /**
   * Force run a cycle immediately (manual trigger)
   */
  async runNow(): Promise<void> {
    this.logger.info('Manually triggering improvement cycle');
    await this.runCycleWithRetry();
  }

  /**
   * Update next cycle time
   */
  private updateNextCycleTime(): void {
    if (this.status.isRunning) {
      const nextCycle = new Date(Date.now() + this.config.intervalMs);
      this.status.nextCycleAt = nextCycle;
    } else {
      this.status.nextCycleAt = undefined;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    cyclesCompleted: number;
    cyclesFailed: number;
    successRate: number;
    uptime?: number;
  } {
    const total = this.status.cyclesCompleted + this.status.cyclesFailed;
    const successRate = total > 0 ? this.status.cyclesCompleted / total : 0;

    return {
      cyclesCompleted: this.status.cyclesCompleted,
      cyclesFailed: this.status.cyclesFailed,
      successRate,
      uptime: this.status.lastCycleAt
        ? Date.now() - this.status.lastCycleAt.getTime()
        : undefined
    };
  }
}
