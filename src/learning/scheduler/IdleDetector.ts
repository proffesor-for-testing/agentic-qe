/**
 * IdleDetector - Detects system idle state for triggering learning cycles
 *
 * Monitors CPU, memory, and task queue to determine when the system is idle
 * and learning activities can safely run without impacting user operations.
 *
 * Works in DevPod/Codespaces container environments.
 *
 * @version 1.0.0
 * @module src/learning/scheduler/IdleDetector
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import { Logger } from '../../utils/Logger';

export interface IdleDetectorConfig {
  /** CPU usage threshold below which system is considered idle (0-100). Default: 20 */
  cpuThreshold: number;
  /** Memory usage threshold below which system is considered idle (0-100). Default: 70 */
  memoryThreshold: number;
  /** Whether task queue must be empty. Default: true */
  taskQueueEmpty: boolean;
  /** Minimum continuous idle duration before triggering (ms). Default: 60000 (1 min) */
  minIdleDuration: number;
  /** How often to check idle state (ms). Default: 10000 (10 sec) */
  checkInterval: number;
  /** Enable debug logging. Default: false */
  debug: boolean;
}

export interface IdleState {
  /** Whether system is currently idle */
  isIdle: boolean;
  /** Timestamp when idle state started, null if not idle */
  idleSince: Date | null;
  /** Current CPU usage percentage (0-100) */
  cpuUsage: number;
  /** Current memory usage percentage (0-100) */
  memoryUsage: number;
  /** Number of active tasks in queue */
  activeTaskCount: number;
  /** How long system has been idle (ms), 0 if not idle */
  idleDuration: number;
  /** Last check timestamp */
  lastCheck: Date;
}

export interface IdleDetectorEvents {
  /** Emitted when system becomes idle (after minIdleDuration) */
  'idle:detected': (state: IdleState) => void;
  /** Emitted when system exits idle state */
  'idle:ended': (state: IdleState) => void;
  /** Emitted on each check with current state */
  'state:update': (state: IdleState) => void;
  /** Emitted on error */
  'error': (error: Error) => void;
}

/**
 * IdleDetector monitors system resources to detect idle periods
 *
 * @example
 * ```typescript
 * const detector = new IdleDetector({ cpuThreshold: 20, minIdleDuration: 60000 });
 * detector.on('idle:detected', (state) => {
 *   console.log('System is idle, starting learning cycle...');
 * });
 * await detector.start();
 * ```
 */
export class IdleDetector extends EventEmitter {
  private config: IdleDetectorConfig;
  private logger: Logger;
  private checkTimer: NodeJS.Timeout | null = null;
  private previousCpuTimes: os.CpuInfo[] | null = null;
  private idleSince: Date | null = null;
  private isRunning: boolean = false;
  private taskQueue: Set<string> = new Set();
  private hasEmittedIdleDetected: boolean = false;

  constructor(config?: Partial<IdleDetectorConfig>) {
    super();
    this.config = {
      cpuThreshold: 20,
      memoryThreshold: 70,
      taskQueueEmpty: true,
      minIdleDuration: 60000,   // 1 minute
      checkInterval: 10000,     // 10 seconds
      debug: false,
      ...config,
    };
    this.logger = Logger.getInstance();
  }

  /**
   * Start monitoring for idle state
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('[IdleDetector] Already running');
      return;
    }

    this.isRunning = true;
    this.previousCpuTimes = os.cpus();
    this.hasEmittedIdleDetected = false;

    this.logger.info('[IdleDetector] Starting idle detection', {
      cpuThreshold: this.config.cpuThreshold,
      memoryThreshold: this.config.memoryThreshold,
      minIdleDuration: this.config.minIdleDuration,
      checkInterval: this.config.checkInterval,
    });

    // Start periodic check
    this.checkTimer = setInterval(() => this.checkIdleState(), this.config.checkInterval);

    // Do initial check
    await this.checkIdleState();
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.logger.info('[IdleDetector] Stopped');
  }

  /**
   * Get current idle state
   */
  getState(): IdleState {
    return {
      isIdle: this.isSystemIdle(),
      idleSince: this.idleSince,
      cpuUsage: this.getCpuUsage(),
      memoryUsage: this.getMemoryUsage(),
      activeTaskCount: this.taskQueue.size,
      idleDuration: this.idleSince ? Date.now() - this.idleSince.getTime() : 0,
      lastCheck: new Date(),
    };
  }

  /**
   * Register a task as active (prevents idle detection)
   */
  registerTask(taskId: string): void {
    this.taskQueue.add(taskId);
    if (this.config.debug) {
      this.logger.debug('[IdleDetector] Task registered', { taskId, queueSize: this.taskQueue.size });
    }
  }

  /**
   * Unregister a task (allows idle detection if queue empty)
   */
  unregisterTask(taskId: string): void {
    this.taskQueue.delete(taskId);
    if (this.config.debug) {
      this.logger.debug('[IdleDetector] Task unregistered', { taskId, queueSize: this.taskQueue.size });
    }
  }

  /**
   * Clear all registered tasks
   */
  clearTasks(): void {
    this.taskQueue.clear();
  }

  /**
   * Check and update idle state
   */
  private async checkIdleState(): Promise<void> {
    try {
      const state = this.getState();
      const wasIdle = this.idleSince !== null;
      const isNowIdle = this.isSystemIdle();

      // Emit state update
      this.emit('state:update', state);

      if (this.config.debug) {
        this.logger.debug('[IdleDetector] State check', {
          cpu: state.cpuUsage.toFixed(1),
          memory: state.memoryUsage.toFixed(1),
          tasks: state.activeTaskCount,
          isIdle: isNowIdle,
          idleDuration: state.idleDuration,
        });
      }

      if (isNowIdle && !wasIdle) {
        // Transition to idle
        this.idleSince = new Date();
        this.hasEmittedIdleDetected = false;
        if (this.config.debug) {
          this.logger.info('[IdleDetector] System entering idle state');
        }
      } else if (!isNowIdle && wasIdle) {
        // Transition from idle
        const finalState = this.getState();
        this.idleSince = null;
        this.hasEmittedIdleDetected = false;
        this.emit('idle:ended', finalState);
        this.logger.info('[IdleDetector] System exited idle state', {
          idleDuration: finalState.idleDuration,
        });
      } else if (isNowIdle && wasIdle && !this.hasEmittedIdleDetected) {
        // Still idle - check if we've met minimum duration
        const idleDuration = Date.now() - this.idleSince!.getTime();
        if (idleDuration >= this.config.minIdleDuration) {
          this.hasEmittedIdleDetected = true;
          const currentState = this.getState();
          this.emit('idle:detected', currentState);
          this.logger.info('[IdleDetector] Idle detected - minimum duration reached', {
            idleDuration,
            cpu: currentState.cpuUsage.toFixed(1),
            memory: currentState.memoryUsage.toFixed(1),
          });
        }
      }
    } catch (error) {
      this.emit('error', error as Error);
      this.logger.error('[IdleDetector] Error checking idle state', error);
    }
  }

  /**
   * Check if system is currently idle based on thresholds
   */
  private isSystemIdle(): boolean {
    const cpuUsage = this.getCpuUsage();
    const memoryUsage = this.getMemoryUsage();
    const taskQueueCheck = !this.config.taskQueueEmpty || this.taskQueue.size === 0;

    return (
      cpuUsage <= this.config.cpuThreshold &&
      memoryUsage <= this.config.memoryThreshold &&
      taskQueueCheck
    );
  }

  /**
   * Get current CPU usage percentage
   * Uses delta between two readings for accuracy
   */
  private getCpuUsage(): number {
    const currentCpus = os.cpus();

    if (!this.previousCpuTimes) {
      this.previousCpuTimes = currentCpus;
      return 0; // No previous reading
    }

    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < currentCpus.length; i++) {
      const currentCpu = currentCpus[i];
      const previousCpu = this.previousCpuTimes[i];

      // Calculate deltas
      const idleDelta = currentCpu.times.idle - previousCpu.times.idle;
      const userDelta = currentCpu.times.user - previousCpu.times.user;
      const niceDelta = currentCpu.times.nice - previousCpu.times.nice;
      const sysDelta = currentCpu.times.sys - previousCpu.times.sys;
      const irqDelta = currentCpu.times.irq - previousCpu.times.irq;

      const totalDelta = idleDelta + userDelta + niceDelta + sysDelta + irqDelta;

      totalIdle += idleDelta;
      totalTick += totalDelta;
    }

    // Update previous reading
    this.previousCpuTimes = currentCpus;

    if (totalTick === 0) return 0;

    // Return CPU usage (100 - idle percentage)
    const idlePercentage = (totalIdle / totalTick) * 100;
    return Math.max(0, Math.min(100, 100 - idlePercentage));
  }

  /**
   * Get current memory usage percentage
   */
  private getMemoryUsage(): number {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    return (usedMemory / totalMemory) * 100;
  }

  /**
   * Get configuration
   */
  getConfig(): IdleDetectorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart to take effect for interval)
   */
  updateConfig(config: Partial<IdleDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export default IdleDetector;
