/**
 * DreamScheduler - Automated Dream Cycle Scheduling
 * ADR-021: QE ReasoningBank - Dream Cycle Integration
 *
 * The DreamScheduler provides automated triggering of dream cycles based on:
 * - Time-based scheduling (periodic dreams)
 * - Experience accumulation thresholds
 * - Event-based triggers (quality gate failures, domain milestones)
 *
 * It coordinates with the DreamEngine to run actual dream cycles and
 * can automatically apply high-confidence insights.
 *
 * @module v3/learning/dream/dream-scheduler
 */

import { v4 as uuidv4 } from 'uuid';
import type { EventBus, Subscription, MemoryBackend } from '../../kernel/interfaces.js';
import type { DomainEvent } from '../../shared/types/index.js';
import type { DreamEngine, DreamCycleResult } from './dream-engine.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the DreamScheduler
 */
export interface DreamSchedulerConfig {
  // Time-based scheduling
  /** Interval between automatic dreams in ms. Default: 3600000 (1 hour) */
  autoScheduleIntervalMs: number;
  /** Minimum time between dreams in ms. Default: 300000 (5 minutes) */
  minTimeBetweenDreamsMs: number;

  // Experience-based triggers
  /** Number of experiences before triggering a dream. Default: 20 */
  experienceThreshold: number;
  /** Whether to trigger dreams when experience threshold is reached. Default: true */
  enableExperienceTrigger: boolean;

  // Event-based triggers
  /** Trigger dream on quality gate failures. Default: true */
  enableQualityGateFailureTrigger: boolean;
  /** Trigger dream on domain milestones. Default: false */
  enableDomainMilestoneTrigger: boolean;

  // Dream configuration
  /** Default dream duration in ms. Default: 10000 (10 seconds) */
  defaultDreamDurationMs: number;
  /** Quick dream duration in ms. Default: 5000 (5 seconds) */
  quickDreamDurationMs: number;
  /** Full dream duration in ms. Default: 30000 (30 seconds) */
  fullDreamDurationMs: number;

  // Insight handling
  /** Automatically apply insights above confidence threshold. Default: false */
  autoApplyHighConfidenceInsights: boolean;
  /** Confidence threshold for auto-applying insights. Default: 0.8 */
  insightConfidenceThreshold: number;
}

/**
 * Default DreamScheduler configuration
 */
export const DEFAULT_DREAM_SCHEDULER_CONFIG: DreamSchedulerConfig = {
  // Time-based scheduling
  autoScheduleIntervalMs: 3600000, // 1 hour
  minTimeBetweenDreamsMs: 300000, // 5 minutes

  // Experience-based triggers
  experienceThreshold: 20,
  enableExperienceTrigger: true,

  // Event-based triggers
  enableQualityGateFailureTrigger: true,
  enableDomainMilestoneTrigger: false,

  // Dream configuration
  defaultDreamDurationMs: 10000, // 10 seconds
  quickDreamDurationMs: 5000, // 5 seconds
  fullDreamDurationMs: 30000, // 30 seconds

  // Insight handling
  autoApplyHighConfidenceInsights: false,
  insightConfidenceThreshold: 0.8,
};

// ============================================================================
// Experience Types
// ============================================================================

/**
 * A task experience to be recorded for dream processing
 */
export interface TaskExperience {
  /** Unique identifier */
  id: string;
  /** Agent type that produced this experience */
  agentType: string;
  /** Domain this experience belongs to */
  domain: string;
  /** Type of task */
  taskType: string;
  /** Whether the task succeeded */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** Additional context */
  context?: Record<string, unknown>;
  /** When this experience occurred */
  timestamp: Date;
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * Current status of the DreamScheduler
 */
export interface DreamSchedulerStatus {
  /** Whether the scheduler is initialized */
  initialized: boolean;
  /** Whether the scheduler is running */
  running: boolean;
  /** Whether a dream is currently in progress */
  dreaming: boolean;
  /** Number of experiences in the buffer */
  experienceCount: number;
  /** Experience threshold for triggering */
  experienceThreshold: number;
  /** Time until next scheduled dream (ms) */
  timeUntilNextDream: number | null;
  /** Total dreams completed */
  totalDreamsCompleted: number;
  /** Last dream timestamp */
  lastDreamTime: Date | null;
  /** Whether auto-scheduling is enabled */
  autoSchedulingEnabled: boolean;
}

// ============================================================================
// Dependencies Type
// ============================================================================

/**
 * Dependencies required by DreamScheduler
 */
export interface DreamSchedulerDependencies {
  /** The DreamEngine instance for running dreams */
  dreamEngine: DreamEngine;
  /** EventBus for subscribing to domain events */
  eventBus: EventBus;
  /** Memory backend for persisting scheduler state (optional) */
  memoryBackend?: MemoryBackend;
}

// ============================================================================
// DreamScheduler Implementation
// ============================================================================

/**
 * DreamScheduler manages automatic triggering of dream cycles.
 *
 * It follows the dependency injection pattern - all required dependencies
 * (DreamEngine, EventBus) must be provided via the constructor.
 *
 * @example
 * ```typescript
 * const scheduler = new DreamScheduler({
 *   dreamEngine,
 *   eventBus,
 *   memoryBackend, // optional
 * });
 *
 * await scheduler.initialize();
 * scheduler.start();
 *
 * // Record experiences as they happen
 * scheduler.recordExperience({
 *   id: 'exp-1',
 *   agentType: 'tester',
 *   domain: 'test-execution',
 *   taskType: 'run-tests',
 *   success: true,
 *   duration: 5000,
 *   timestamp: new Date(),
 * });
 *
 * // Manually trigger a dream
 * const result = await scheduler.triggerDream();
 *
 * // Stop and cleanup
 * scheduler.stop();
 * await scheduler.dispose();
 * ```
 */
export class DreamScheduler {
  private readonly config: DreamSchedulerConfig;
  private readonly dreamEngine: DreamEngine;
  private readonly eventBus: EventBus;
  private readonly memoryBackend?: MemoryBackend;

  // State
  private initialized = false;
  private running = false;
  private dreaming = false;

  // Experience buffer
  private experienceBuffer: TaskExperience[] = [];

  // Timing
  private lastDreamTime: Date | null = null;
  private scheduledDreamTimer: ReturnType<typeof setTimeout> | null = null;
  private totalDreamsCompleted = 0;

  // Event subscriptions
  private subscriptions: Subscription[] = [];

  // Last result
  private lastDreamResult: DreamCycleResult | null = null;

  /**
   * Create a new DreamScheduler instance.
   *
   * @param dependencies - Required dependencies (dreamEngine, eventBus, memoryBackend)
   * @param config - Optional configuration overrides
   * @throws {Error} If required dependencies are missing
   */
  constructor(
    dependencies: DreamSchedulerDependencies,
    config?: Partial<DreamSchedulerConfig>
  ) {
    // Validate required dependencies (Integration Prevention Pattern)
    if (!dependencies.dreamEngine) {
      throw new Error('DreamScheduler requires dreamEngine dependency');
    }
    if (!dependencies.eventBus) {
      throw new Error('DreamScheduler requires eventBus dependency');
    }

    this.dreamEngine = dependencies.dreamEngine;
    this.eventBus = dependencies.eventBus;
    this.memoryBackend = dependencies.memoryBackend;
    this.config = { ...DEFAULT_DREAM_SCHEDULER_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  /**
   * Initialize the scheduler.
   *
   * Sets up event subscriptions and restores state from memory if available.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Subscribe to quality gate failure events
    if (this.config.enableQualityGateFailureTrigger) {
      const qualitySubscription = this.eventBus.subscribe<{ passed: boolean }>(
        'quality-assessment:gate:completed',
        this.handleQualityGateEvent.bind(this)
      );
      this.subscriptions.push(qualitySubscription);
    }

    // Subscribe to domain milestone events
    if (this.config.enableDomainMilestoneTrigger) {
      const milestoneSubscription = this.eventBus.subscribe(
        'coordination:milestone:reached',
        this.handleDomainMilestoneEvent.bind(this)
      );
      this.subscriptions.push(milestoneSubscription);
    }

    // Restore state from memory if available
    await this.restoreState();

    this.initialized = true;
    console.log('[DreamScheduler] Initialized');
  }

  /**
   * Start the scheduler.
   *
   * Begins automatic dream scheduling based on the configured interval.
   */
  start(): void {
    this.ensureInitialized();
    if (this.running) return;

    this.running = true;
    this.scheduleNextDream();
    console.log('[DreamScheduler] Started');
  }

  /**
   * Stop the scheduler.
   *
   * Stops automatic scheduling but does not dispose resources.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.clearScheduledDream();
    console.log('[DreamScheduler] Stopped');
  }

  /**
   * Dispose of all resources.
   *
   * Stops scheduling, unsubscribes from events, and saves state.
   */
  async dispose(): Promise<void> {
    this.stop();

    // Unsubscribe from all events
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions = [];

    // Save state before disposing
    await this.saveState();

    this.initialized = false;
    console.log('[DreamScheduler] Disposed');
  }

  // ==========================================================================
  // Manual Dream Triggers
  // ==========================================================================

  /**
   * Manually trigger a dream cycle.
   *
   * @param duration - Optional duration override in ms
   * @returns Result of the dream cycle
   */
  async triggerDream(duration?: number): Promise<DreamCycleResult> {
    this.ensureInitialized();

    // Check minimum time between dreams
    if (!this.canDream()) {
      const waitTime = this.getTimeUntilCanDream();
      throw new Error(
        `Cannot start dream: minimum interval not met. Wait ${Math.ceil(waitTime / 1000)}s.`
      );
    }

    return this.executeDream(duration ?? this.config.defaultDreamDurationMs);
  }

  /**
   * Trigger a quick dream (shorter duration).
   *
   * @returns Result of the dream cycle
   */
  async triggerQuickDream(): Promise<DreamCycleResult> {
    return this.triggerDream(this.config.quickDreamDurationMs);
  }

  /**
   * Trigger a full dream (longer duration).
   *
   * @returns Result of the dream cycle
   */
  async triggerFullDream(): Promise<DreamCycleResult> {
    return this.triggerDream(this.config.fullDreamDurationMs);
  }

  // ==========================================================================
  // Experience Recording
  // ==========================================================================

  /**
   * Record a task experience for future dream processing.
   *
   * If experience threshold is reached and enabled, triggers a dream.
   *
   * @param experience - The experience to record
   */
  recordExperience(experience: TaskExperience): void {
    this.experienceBuffer.push(experience);

    // Check if we should trigger an experience-based dream
    if (
      this.config.enableExperienceTrigger &&
      this.experienceBuffer.length >= this.config.experienceThreshold &&
      this.canDream() &&
      !this.dreaming
    ) {
      console.log(
        `[DreamScheduler] Experience threshold (${this.config.experienceThreshold}) reached, triggering dream`
      );
      // Fire and forget - don't block the caller
      this.executeDream(this.config.defaultDreamDurationMs).catch((err) => {
        console.error('[DreamScheduler] Experience-triggered dream failed:', err);
      });
    }
  }

  /**
   * Get the current experience buffer.
   *
   * @returns Copy of the experience buffer
   */
  getExperienceBuffer(): TaskExperience[] {
    return [...this.experienceBuffer];
  }

  /**
   * Clear the experience buffer.
   */
  clearExperienceBuffer(): void {
    this.experienceBuffer = [];
  }

  // ==========================================================================
  // Status Methods
  // ==========================================================================

  /**
   * Get the current scheduler status.
   *
   * @returns Current status object
   */
  getStatus(): DreamSchedulerStatus {
    const timeUntilNext = this.scheduledDreamTimer
      ? this.getTimeUntilScheduledDream()
      : null;

    return {
      initialized: this.initialized,
      running: this.running,
      dreaming: this.dreaming,
      experienceCount: this.experienceBuffer.length,
      experienceThreshold: this.config.experienceThreshold,
      timeUntilNextDream: timeUntilNext,
      totalDreamsCompleted: this.totalDreamsCompleted,
      lastDreamTime: this.lastDreamTime,
      autoSchedulingEnabled: this.running,
    };
  }

  /**
   * Get the result of the last completed dream.
   *
   * @returns Last dream result or null
   */
  getLastDreamResult(): DreamCycleResult | null {
    return this.lastDreamResult;
  }

  // ==========================================================================
  // Private: Dream Execution
  // ==========================================================================

  /**
   * Execute a dream cycle with the specified duration.
   */
  private async executeDream(durationMs: number): Promise<DreamCycleResult> {
    if (this.dreaming) {
      throw new Error('A dream is already in progress');
    }

    this.dreaming = true;
    console.log(`[DreamScheduler] Starting dream cycle (${durationMs}ms)`);

    try {
      // Run the dream
      const result = await this.dreamEngine.dream(durationMs);

      // Update state
      this.lastDreamTime = new Date();
      this.lastDreamResult = result;
      this.totalDreamsCompleted++;

      // Clear experience buffer after successful dream
      this.clearExperienceBuffer();

      // Auto-apply high-confidence insights if enabled
      if (this.config.autoApplyHighConfidenceInsights) {
        await this.autoApplyInsights(result);
      }

      // Publish dream completed event
      await this.publishDreamCompletedEvent(result);

      // Reschedule next dream if running
      if (this.running) {
        this.scheduleNextDream();
      }

      console.log(
        `[DreamScheduler] Dream completed: ${result.insights.length} insights generated`
      );
      return result;
    } finally {
      this.dreaming = false;
    }
  }

  /**
   * Auto-apply insights that meet the confidence threshold.
   */
  private async autoApplyInsights(result: DreamCycleResult): Promise<void> {
    const highConfidenceInsights = result.insights.filter(
      (insight) =>
        insight.actionable &&
        insight.confidenceScore >= this.config.insightConfidenceThreshold
    );

    for (const insight of highConfidenceInsights) {
      try {
        const applyResult = await this.dreamEngine.applyInsight(insight.id);
        if (applyResult.success) {
          console.log(
            `[DreamScheduler] Auto-applied insight ${insight.id}: ${applyResult.patternId}`
          );
        }
      } catch (err) {
        console.error(`[DreamScheduler] Failed to auto-apply insight ${insight.id}:`, err);
      }
    }
  }

  // ==========================================================================
  // Private: Scheduling
  // ==========================================================================

  /**
   * Schedule the next automatic dream.
   */
  private scheduleNextDream(): void {
    this.clearScheduledDream();

    if (!this.running) return;

    const nextDreamDelay = this.calculateNextDreamDelay();
    this.scheduledDreamTimer = setTimeout(async () => {
      if (!this.running || this.dreaming) return;

      try {
        await this.executeDream(this.config.defaultDreamDurationMs);
      } catch (err) {
        console.error('[DreamScheduler] Scheduled dream failed:', err);
        // Reschedule even on failure
        if (this.running) {
          this.scheduleNextDream();
        }
      }
    }, nextDreamDelay);

    console.log(
      `[DreamScheduler] Next dream scheduled in ${Math.ceil(nextDreamDelay / 1000)}s`
    );
  }

  /**
   * Clear any scheduled dream timer.
   */
  private clearScheduledDream(): void {
    if (this.scheduledDreamTimer) {
      clearTimeout(this.scheduledDreamTimer);
      this.scheduledDreamTimer = null;
    }
  }

  /**
   * Calculate delay until next scheduled dream.
   */
  private calculateNextDreamDelay(): number {
    if (!this.lastDreamTime) {
      // First dream - wait full interval
      return this.config.autoScheduleIntervalMs;
    }

    const timeSinceLastDream = Date.now() - this.lastDreamTime.getTime();
    const remainingTime = this.config.autoScheduleIntervalMs - timeSinceLastDream;

    // Ensure minimum delay
    return Math.max(remainingTime, this.config.minTimeBetweenDreamsMs);
  }

  /**
   * Get time until the currently scheduled dream.
   */
  private getTimeUntilScheduledDream(): number {
    // Approximate - we track when we scheduled, not the exact timer
    return this.calculateNextDreamDelay();
  }

  // ==========================================================================
  // Private: Dream Timing Checks
  // ==========================================================================

  /**
   * Check if enough time has passed since the last dream.
   */
  private canDream(): boolean {
    if (!this.lastDreamTime) return true;
    const timeSinceLastDream = Date.now() - this.lastDreamTime.getTime();
    return timeSinceLastDream >= this.config.minTimeBetweenDreamsMs;
  }

  /**
   * Get time until we can start a dream.
   */
  private getTimeUntilCanDream(): number {
    if (!this.lastDreamTime) return 0;
    const timeSinceLastDream = Date.now() - this.lastDreamTime.getTime();
    return Math.max(0, this.config.minTimeBetweenDreamsMs - timeSinceLastDream);
  }

  // ==========================================================================
  // Private: Event Handlers
  // ==========================================================================

  /**
   * Handle quality gate completion events.
   * Triggers a dream when a gate fails to analyze what went wrong.
   */
  private async handleQualityGateEvent(
    event: DomainEvent<{ passed: boolean }>
  ): Promise<void> {
    if (event.payload.passed) return; // Only trigger on failures

    if (!this.canDream() || this.dreaming) {
      console.log(
        '[DreamScheduler] Quality gate failed but cannot start dream yet'
      );
      return;
    }

    console.log('[DreamScheduler] Quality gate failed, triggering analysis dream');
    try {
      await this.executeDream(this.config.quickDreamDurationMs);
    } catch (err) {
      console.error('[DreamScheduler] Quality gate triggered dream failed:', err);
    }
  }

  /**
   * Handle domain milestone events.
   * Triggers a dream to consolidate learnings after significant progress.
   */
  private async handleDomainMilestoneEvent(
    event: DomainEvent<unknown>
  ): Promise<void> {
    if (!this.canDream() || this.dreaming) {
      console.log('[DreamScheduler] Milestone reached but cannot start dream yet');
      return;
    }

    console.log('[DreamScheduler] Domain milestone reached, triggering consolidation dream');
    try {
      await this.executeDream(this.config.defaultDreamDurationMs);
    } catch (err) {
      console.error('[DreamScheduler] Milestone triggered dream failed:', err);
    }
  }

  // ==========================================================================
  // Private: Event Publishing
  // ==========================================================================

  /**
   * Publish a dream completed event.
   */
  private async publishDreamCompletedEvent(result: DreamCycleResult): Promise<void> {
    try {
      await this.eventBus.publish({
        id: uuidv4(),
        type: 'learning-optimization:dream:completed',
        timestamp: new Date(),
        source: 'learning-optimization',
        payload: {
          cycleId: result.cycle.id,
          insightsGenerated: result.insights.length,
          patternsCreated: result.patternsCreated,
          duration: result.cycle.durationMs,
        },
      });
    } catch (err) {
      console.error('[DreamScheduler] Failed to publish dream completed event:', err);
    }
  }

  // ==========================================================================
  // Private: State Persistence
  // ==========================================================================

  /**
   * Save scheduler state to memory backend.
   */
  private async saveState(): Promise<void> {
    if (!this.memoryBackend) return;

    try {
      await this.memoryBackend.set(
        'dream-scheduler:state',
        {
          lastDreamTime: this.lastDreamTime?.toISOString() ?? null,
          totalDreamsCompleted: this.totalDreamsCompleted,
          experienceBuffer: this.experienceBuffer,
        },
        { namespace: 'learning-optimization', persist: true }
      );
    } catch (err) {
      console.error('[DreamScheduler] Failed to save state:', err);
    }
  }

  /**
   * Restore scheduler state from memory backend.
   */
  private async restoreState(): Promise<void> {
    if (!this.memoryBackend) return;

    try {
      const state = await this.memoryBackend.get<{
        lastDreamTime: string | null;
        totalDreamsCompleted: number;
        experienceBuffer: TaskExperience[];
      }>('dream-scheduler:state');

      if (state) {
        this.lastDreamTime = state.lastDreamTime
          ? new Date(state.lastDreamTime)
          : null;
        this.totalDreamsCompleted = state.totalDreamsCompleted ?? 0;
        this.experienceBuffer = state.experienceBuffer ?? [];
        console.log(
          `[DreamScheduler] Restored state: ${this.totalDreamsCompleted} dreams, ${this.experienceBuffer.length} experiences`
        );
      }
    } catch (err) {
      console.error('[DreamScheduler] Failed to restore state:', err);
    }
  }

  // ==========================================================================
  // Private: Validation
  // ==========================================================================

  /**
   * Ensure the scheduler is initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DreamScheduler not initialized. Call initialize() first.');
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DreamScheduler instance.
 *
 * @param dependencies - Required dependencies
 * @param config - Optional configuration overrides
 * @returns New DreamScheduler instance
 */
export function createDreamScheduler(
  dependencies: DreamSchedulerDependencies,
  config?: Partial<DreamSchedulerConfig>
): DreamScheduler {
  return new DreamScheduler(dependencies, config);
}

export default DreamScheduler;
