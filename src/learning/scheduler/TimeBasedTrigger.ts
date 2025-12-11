/**
 * TimeBasedTrigger - Cron-like scheduling for learning cycles
 *
 * Provides time-based triggering as a fallback or supplement to idle detection.
 * Supports daily scheduling with configurable hours and days of week.
 *
 * Part of the Nightly-Learner Phase 1 implementation.
 *
 * @version 1.0.0
 * @module src/learning/scheduler/TimeBasedTrigger
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';

export interface TimeBasedTriggerConfig {
  /** Hour to trigger (0-23). Default: 2 (2 AM) */
  hour: number;
  /** Minute to trigger (0-59). Default: 0 */
  minute?: number;
  /** Days of week to trigger (0=Sunday, 6=Saturday). Default: all days */
  daysOfWeek?: number[];
  /** Timezone offset in hours. Default: 0 (UTC) */
  timezoneOffset?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface TriggerEvent {
  timestamp: Date;
  scheduledTime: Date;
  dayOfWeek: number;
  triggered: boolean;
  skipped?: string;
}

/**
 * TimeBasedTrigger provides cron-like scheduling
 *
 * @example
 * ```typescript
 * const trigger = new TimeBasedTrigger({
 *   hour: 2,
 *   minute: 30,
 *   daysOfWeek: [1, 2, 3, 4, 5], // Weekdays only
 * });
 *
 * trigger.on('trigger', () => {
 *   console.log('Time to learn!');
 * });
 *
 * trigger.start();
 * ```
 */
export class TimeBasedTrigger extends EventEmitter {
  private config: Required<TimeBasedTriggerConfig>;
  private logger: Logger;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private triggerHistory: TriggerEvent[] = [];
  private skipNextTrigger: boolean = false;

  constructor(config: TimeBasedTriggerConfig) {
    super();
    this.logger = Logger.getInstance();

    this.config = {
      hour: config.hour,
      minute: config.minute ?? 0,
      daysOfWeek: config.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
      timezoneOffset: config.timezoneOffset ?? 0,
      debug: config.debug ?? false,
    };

    // Validate config
    if (this.config.hour < 0 || this.config.hour > 23) {
      throw new Error('Hour must be between 0 and 23');
    }
    if (this.config.minute < 0 || this.config.minute > 59) {
      throw new Error('Minute must be between 0 and 59');
    }
  }

  /**
   * Start the time-based trigger
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('[TimeBasedTrigger] Already running');
      return;
    }

    this.isRunning = true;
    this.scheduleNextTrigger();

    this.logger.info('[TimeBasedTrigger] Started', {
      hour: this.config.hour,
      minute: this.config.minute,
      daysOfWeek: this.config.daysOfWeek,
      nextTrigger: this.getNextTriggerTime()?.toISOString(),
    });

    this.emit('started');
  }

  /**
   * Stop the time-based trigger
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.logger.info('[TimeBasedTrigger] Stopped');
    this.emit('stopped');
  }

  /**
   * Skip the next scheduled trigger
   */
  skipNext(reason?: string): void {
    this.skipNextTrigger = true;
    this.logger.info('[TimeBasedTrigger] Next trigger will be skipped', { reason });
  }

  /**
   * Get the next scheduled trigger time
   */
  getNextTriggerTime(): Date | null {
    if (!this.isRunning) return null;

    const now = new Date();
    const next = new Date(now);

    // Set to configured time
    next.setHours(this.config.hour, this.config.minute, 0, 0);

    // Adjust for timezone
    next.setTime(next.getTime() - this.config.timezoneOffset * 60 * 60 * 1000);

    // If time has passed today, move to tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    // Find next valid day of week
    while (!this.config.daysOfWeek.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * Get time until next trigger in milliseconds
   */
  getTimeUntilNextTrigger(): number | null {
    const next = this.getNextTriggerTime();
    if (!next) return null;
    return Math.max(0, next.getTime() - Date.now());
  }

  /**
   * Get trigger history
   */
  getHistory(limit: number = 10): TriggerEvent[] {
    return this.triggerHistory.slice(-limit);
  }

  /**
   * Check if a specific day is enabled
   */
  isDayEnabled(day: number): boolean {
    return this.config.daysOfWeek.includes(day);
  }

  /**
   * Update configuration (requires restart)
   */
  updateConfig(config: Partial<TimeBasedTriggerConfig>): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    this.config = {
      ...this.config,
      ...config,
    };

    if (wasRunning) {
      this.start();
    }
  }

  /**
   * Schedule the next trigger
   */
  private scheduleNextTrigger(): void {
    const nextTime = this.getNextTriggerTime();
    if (!nextTime) return;

    const delay = nextTime.getTime() - Date.now();

    if (this.config.debug) {
      this.logger.debug('[TimeBasedTrigger] Scheduling next trigger', {
        nextTime: nextTime.toISOString(),
        delayMs: delay,
        delayHours: (delay / 1000 / 60 / 60).toFixed(2),
      });
    }

    this.timer = setTimeout(() => this.handleTrigger(nextTime), delay);
  }

  /**
   * Handle a trigger event
   */
  private handleTrigger(scheduledTime: Date): void {
    if (!this.isRunning) return;

    const event: TriggerEvent = {
      timestamp: new Date(),
      scheduledTime,
      dayOfWeek: new Date().getDay(),
      triggered: false,
    };

    // Check if we should skip this trigger
    if (this.skipNextTrigger) {
      event.skipped = 'Manual skip requested';
      this.skipNextTrigger = false;
      this.logger.info('[TimeBasedTrigger] Trigger skipped', { reason: event.skipped });
    } else if (!this.config.daysOfWeek.includes(event.dayOfWeek)) {
      event.skipped = `Day ${event.dayOfWeek} not in schedule`;
    } else {
      event.triggered = true;
      this.logger.info('[TimeBasedTrigger] Triggering');
      this.emit('trigger', event);
    }

    this.triggerHistory.push(event);

    // Keep history limited
    if (this.triggerHistory.length > 100) {
      this.triggerHistory = this.triggerHistory.slice(-50);
    }

    // Schedule next trigger
    this.scheduleNextTrigger();
  }

  /**
   * Get configuration
   */
  getConfig(): TimeBasedTriggerConfig {
    return { ...this.config };
  }

  /**
   * Check if trigger is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}

export default TimeBasedTrigger;
