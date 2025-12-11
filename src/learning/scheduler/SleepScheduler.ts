/**
 * SleepScheduler - Orchestrates learning cycles during system idle periods
 *
 * Triggers learning activities when the system is idle, using either:
 * - Idle detection (CPU/memory monitoring)
 * - Time-based scheduling (cron-like)
 * - Hybrid mode (both)
 *
 * Part of the Nightly-Learner Phase 1 implementation.
 *
 * @version 1.0.0
 * @module src/learning/scheduler/SleepScheduler
 */

import { EventEmitter } from 'events';
import { IdleDetector, IdleDetectorConfig, IdleState } from './IdleDetector';
import { SleepCycle, SleepPhase, CycleSummary, SleepCycleConfig } from './SleepCycle';
import { Logger } from '../../utils/Logger';

export interface LearningBudget {
  /** Maximum patterns to process per cycle. Default: 50 */
  maxPatternsPerCycle: number;
  /** Maximum agents to process per cycle. Default: 5 */
  maxAgentsPerCycle: number;
  /** Maximum duration for a cycle in ms. Default: 3600000 (1 hour) */
  maxDurationMs: number;
}

export interface ScheduleConfig {
  /** Hour to start (0-23). Default: 2 (2 AM) */
  startHour: number;
  /** Duration in minutes. Default: 60 */
  durationMinutes: number;
  /** Days to run (0=Sunday, 6=Saturday). Default: all days */
  daysOfWeek?: number[];
}

export interface SleepSchedulerConfig {
  /** Scheduling mode: idle-based, time-based, or hybrid */
  mode: 'idle' | 'time' | 'hybrid';
  /** Idle detector configuration (for idle/hybrid modes) */
  idleConfig?: Partial<IdleDetectorConfig>;
  /** Time-based schedule configuration (for time/hybrid modes) */
  schedule?: Partial<ScheduleConfig>;
  /** Learning budget constraints */
  learningBudget: Partial<LearningBudget>;
  /** Minimum time between cycles in ms. Default: 3600000 (1 hour) */
  minCycleInterval?: number;
  /** Phase durations for sleep cycle (for testing with short durations) */
  phaseDurations?: Partial<Record<'N1_CAPTURE' | 'N2_PROCESS' | 'N3_CONSOLIDATE' | 'REM_DREAM', number>>;
  /** Enable debug logging */
  debug?: boolean;
}

export interface SleepSchedulerState {
  isRunning: boolean;
  mode: 'idle' | 'time' | 'hybrid';
  currentCycle: SleepCycle | null;
  lastCycleEnd: Date | null;
  cyclesCompleted: number;
  totalPatternsProcessed: number;
  totalAgentsProcessed: number;
  nextScheduledRun: Date | null;
}

/**
 * SleepScheduler orchestrates learning cycles during idle periods
 *
 * @example
 * ```typescript
 * const scheduler = new SleepScheduler({
 *   mode: 'hybrid',
 *   learningBudget: { maxPatternsPerCycle: 50, maxAgentsPerCycle: 5 },
 * });
 *
 * scheduler.on('sleep:start', (cycle) => console.log('Learning cycle started'));
 * scheduler.on('sleep:end', (summary) => console.log('Cycle complete:', summary));
 *
 * await scheduler.start();
 * ```
 */
export class SleepScheduler extends EventEmitter {
  private config: Omit<Required<SleepSchedulerConfig>, 'phaseDurations'> & Pick<SleepSchedulerConfig, 'phaseDurations'>;
  private idleDetector: IdleDetector;
  private currentCycle: SleepCycle | null = null;
  private isRunning: boolean = false;
  private logger: Logger;
  private timeBasedTimer: NodeJS.Timeout | null = null;
  private lastCycleEnd: Date | null = null;
  private cyclesCompleted: number = 0;
  private totalPatternsProcessed: number = 0;
  private totalAgentsProcessed: number = 0;

  constructor(config: SleepSchedulerConfig) {
    super();
    this.logger = Logger.getInstance();

    // Apply defaults
    this.config = {
      mode: config.mode,
      idleConfig: {
        cpuThreshold: 20,
        memoryThreshold: 70,
        taskQueueEmpty: true,
        minIdleDuration: 60000,
        checkInterval: 10000,
        debug: config.debug ?? false,
        ...config.idleConfig,
      },
      schedule: {
        startHour: 2,
        durationMinutes: 60,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        ...config.schedule,
      },
      learningBudget: {
        maxPatternsPerCycle: 50,
        maxAgentsPerCycle: 5,
        maxDurationMs: 3600000,
        ...config.learningBudget,
      },
      minCycleInterval: config.minCycleInterval ?? 3600000,
      phaseDurations: config.phaseDurations,
      debug: config.debug ?? false,
    };

    this.idleDetector = new IdleDetector(this.config.idleConfig);
  }

  /**
   * Start the sleep scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('[SleepScheduler] Already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('[SleepScheduler] Starting', {
      mode: this.config.mode,
      budget: this.config.learningBudget,
    });

    // Set up idle-based triggering
    if (this.config.mode === 'idle' || this.config.mode === 'hybrid') {
      this.idleDetector.on('idle:detected', this.handleIdleDetected.bind(this));
      await this.idleDetector.start();
      this.logger.info('[SleepScheduler] Idle detection enabled');
    }

    // Set up time-based triggering
    if (this.config.mode === 'time' || this.config.mode === 'hybrid') {
      this.scheduleTimeBased();
      this.logger.info('[SleepScheduler] Time-based scheduling enabled', {
        startHour: this.config.schedule.startHour,
        durationMinutes: this.config.schedule.durationMinutes,
      });
    }

    this.emit('scheduler:started', this.getState());
  }

  /**
   * Stop the sleep scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('[SleepScheduler] Stopping');
    this.isRunning = false;

    // Stop idle detection
    await this.idleDetector.stop();

    // Clear time-based timer
    if (this.timeBasedTimer) {
      clearTimeout(this.timeBasedTimer);
      this.timeBasedTimer = null;
    }

    // Abort current cycle if active
    if (this.currentCycle?.isActive) {
      await this.currentCycle.abort();
    }

    this.emit('scheduler:stopped', this.getState());
  }

  /**
   * Manually trigger a learning cycle
   */
  async triggerCycle(reason: string = 'manual'): Promise<CycleSummary | null> {
    if (!this.isRunning) {
      this.logger.warn('[SleepScheduler] Cannot trigger cycle - scheduler not running');
      return null;
    }

    if (this.currentCycle?.isActive) {
      this.logger.warn('[SleepScheduler] Cycle already in progress');
      return null;
    }

    this.logger.info('[SleepScheduler] Manual cycle triggered', { reason });
    return await this.executeCycle(reason);
  }

  /**
   * Get current scheduler state
   */
  getState(): SleepSchedulerState {
    return {
      isRunning: this.isRunning,
      mode: this.config.mode,
      currentCycle: this.currentCycle,
      lastCycleEnd: this.lastCycleEnd,
      cyclesCompleted: this.cyclesCompleted,
      totalPatternsProcessed: this.totalPatternsProcessed,
      totalAgentsProcessed: this.totalAgentsProcessed,
      nextScheduledRun: this.getNextScheduledRun(),
    };
  }

  /**
   * Register a task to prevent idle detection during critical operations
   */
  registerTask(taskId: string): void {
    this.idleDetector.registerTask(taskId);
  }

  /**
   * Unregister a task to allow idle detection
   */
  unregisterTask(taskId: string): void {
    this.idleDetector.unregisterTask(taskId);
  }

  /**
   * Handle idle detection event
   */
  private async handleIdleDetected(state: IdleState): Promise<void> {
    // Check if we're within minimum cycle interval
    if (this.lastCycleEnd) {
      const timeSinceLastCycle = Date.now() - this.lastCycleEnd.getTime();
      if (timeSinceLastCycle < this.config.minCycleInterval) {
        this.logger.debug('[SleepScheduler] Skipping cycle - too soon since last', {
          timeSinceLastCycle,
          minInterval: this.config.minCycleInterval,
        });
        return;
      }
    }

    this.logger.info('[SleepScheduler] Idle detected, triggering cycle', {
      idleDuration: state.idleDuration,
      cpu: state.cpuUsage.toFixed(1) + '%',
      memory: state.memoryUsage.toFixed(1) + '%',
    });

    await this.executeCycle('idle');
  }

  /**
   * Execute a learning cycle
   */
  private async executeCycle(trigger: string): Promise<CycleSummary> {
    const cycleConfig: SleepCycleConfig = {
      budget: this.config.learningBudget as LearningBudget,
      phaseDurations: this.config.phaseDurations,
      debug: this.config.debug,
    };

    this.currentCycle = new SleepCycle(cycleConfig);

    // Forward cycle events
    this.currentCycle.on('phase:start', (phase) => {
      this.emit('sleep:phase', phase);
    });

    this.currentCycle.on('phase:complete', (phase, result) => {
      this.emit('sleep:phase:complete', phase, result);
    });

    this.emit('sleep:start', {
      cycle: this.currentCycle,
      trigger,
      timestamp: new Date(),
    });

    try {
      const summary = await this.currentCycle.execute();

      this.lastCycleEnd = new Date();
      this.cyclesCompleted++;
      this.totalPatternsProcessed += summary.patternsDiscovered + summary.patternsConsolidated;
      this.totalAgentsProcessed += summary.agentsProcessed.length;

      this.emit('sleep:end', summary);

      this.logger.info('[SleepScheduler] Cycle completed', {
        duration: summary.endTime.getTime() - summary.startTime.getTime(),
        patternsDiscovered: summary.patternsDiscovered,
        patternsConsolidated: summary.patternsConsolidated,
        agentsProcessed: summary.agentsProcessed.length,
        errors: summary.errors.length,
      });

      return summary;
    } catch (error) {
      this.logger.error('[SleepScheduler] Cycle failed', error);
      this.emit('error', error);
      throw error;
    } finally {
      this.currentCycle = null;
    }
  }

  /**
   * Set up time-based scheduling
   */
  private scheduleTimeBased(): void {
    const scheduleNext = () => {
      const nextRun = this.getNextScheduledRun();
      if (!nextRun) return;

      const delay = nextRun.getTime() - Date.now();

      this.logger.debug('[SleepScheduler] Next scheduled run', {
        nextRun: nextRun.toISOString(),
        delayMs: delay,
      });

      this.timeBasedTimer = setTimeout(async () => {
        if (!this.isRunning) return;

        // Check if today is a scheduled day
        const today = new Date().getDay();
        if (this.config.schedule.daysOfWeek?.includes(today)) {
          try {
            await this.executeCycle('scheduled');
          } catch (error) {
            this.logger.error('[SleepScheduler] Scheduled cycle failed', error);
          }
        }

        // Schedule next run
        scheduleNext();
      }, delay);
    };

    scheduleNext();
  }

  /**
   * Calculate next scheduled run time
   */
  private getNextScheduledRun(): Date | null {
    if (this.config.mode === 'idle') return null;

    const now = new Date();
    const nextRun = new Date(now);

    // Set to scheduled hour
    nextRun.setHours(this.config.schedule?.startHour ?? 2, 0, 0, 0);

    // If that time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    // Find next valid day
    const daysOfWeek = this.config.schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
    while (!daysOfWeek.includes(nextRun.getDay())) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun;
  }

  /**
   * Get configuration
   */
  getConfig(): SleepSchedulerConfig {
    return { ...this.config };
  }
}

export default SleepScheduler;
