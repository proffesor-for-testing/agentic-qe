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
 * @module learning/dream/dream-scheduler
 */

import { v4 as uuidv4 } from 'uuid';
import { LoggerFactory } from '../../logging/index.js';
import type { Logger } from '../../logging/index.js';
import type { EventBus, Subscription, MemoryBackend } from '../../kernel/interfaces.js';
import type { DomainEvent } from '../../shared/types/index.js';
import type { DreamEngine, DreamCycleResult } from './dream-engine.js';

// ADR-062: Meta-learning integration
import {
  MetaLearningEngine,
  DEFAULT_META_LEARNING_CONFIG,
  type MetaInsight,
} from '../aqe-learning-engine.js';
import {
  LearningMetricsTracker,
  type UnifiedMetricsSnapshot,
} from '../metrics-tracker.js';
// ADR-094 / #488 B.2: record per-tick liveness so `aqe learning loop-health`
// surfaces the kernel-side dream loop as live.
import { recordLoopHealth } from '../loop-health.js';

const logger: Logger = LoggerFactory.create('DreamScheduler');

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

/**
 * kv_store key that the SessionStart hook reads for its dream readout and the
 * post-task hook increments. Mirrors `DREAM_STATE_KEY` in
 * cli/commands/hooks-handlers/hooks-dream-learning.ts — kept as a local literal
 * (not imported) to avoid a learning→cli layering dependency. MUST match that
 * value and use the DEFAULT namespace (the hook path passes no namespace).
 * #509: this scheduler is the entity that actually dreams (ADR-094) but never
 * reset this row, so SessionStart showed lastDreamTime:null + an ever-growing
 * pendingExperiences. reconcileHookState() below stamps the truth per cycle.
 */
const DREAM_HOOK_STATE_KEY = 'dream-scheduler:hook-state';

interface DreamHookStateRow {
  lastDreamTime: string | null;
  experienceCount: number;
  sessionStartTime?: string;
  totalDreamsThisSession: number;
}

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

  // ADR-062: Meta-learning integration
  private readonly metaLearningEngine: MetaLearningEngine;
  private readonly metaLearningSnapshots: UnifiedMetricsSnapshot[] = [];
  private metricsTracker: LearningMetricsTracker | null = null;
  private static readonly MAX_META_SNAPSHOTS = 20;

  /** Queryable store of detected meta-learning insights (Gap 1: persist, not just log) */
  private readonly detectedInsights: MetaInsight[] = [];
  private static readonly MAX_DETECTED_INSIGHTS = 100;

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

    // ADR-062: Initialize meta-learning engine
    this.metaLearningEngine = new MetaLearningEngine();
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
    logger.info('Initialized');
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
    logger.info('Started');
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
    logger.info('Stopped');
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

    // Close meta-learning metrics tracker if initialized
    if (this.metricsTracker) {
      this.metricsTracker.close();
      this.metricsTracker = null;
    }

    // Save state before disposing
    await this.saveState();

    this.initialized = false;
    logger.info('Disposed');
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
      logger.info('Experience threshold reached, triggering dream', {
        threshold: this.config.experienceThreshold,
      });
      // Fire and forget - don't block the caller
      this.executeDream(this.config.defaultDreamDurationMs).catch((err) => {
        logger.error('Experience-triggered dream failed', err instanceof Error ? err : undefined);
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

  /**
   * Return all detected meta-learning insights (most recent first).
   *
   * Gap 1 fix: insights are now stored in-memory rather than only logged,
   * making them queryable by other subsystems (e.g., PatternStore consumers,
   * quality gates, or dashboards).
   *
   * @param limit - Maximum number of insights to return (default: all)
   * @returns Array of MetaInsight objects, newest first
   */
  getMetaInsights(limit?: number): MetaInsight[] {
    // Return newest first (reverse of insertion order)
    const reversed = [...this.detectedInsights].reverse();
    return limit !== undefined ? reversed.slice(0, limit) : reversed;
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
    logger.info('Starting dream cycle', { durationMs });

    let dreamError: Error | undefined;
    try {
      // Ensure concepts are loaded before dreaming
      const loaded = await this.dreamEngine.ensureConceptsLoaded();
      if (loaded > 0) {
        logger.info('Auto-loaded concepts for dream', { loaded });
      }

      // Run the dream
      const result = await this.dreamEngine.dream(durationMs);

      // Update state
      this.lastDreamTime = new Date();
      this.lastDreamResult = result;
      this.totalDreamsCompleted++;

      // Clear experience buffer after successful dream
      this.clearExperienceBuffer();

      // #509: reconcile the SessionStart-read hook-state row. The post-task hook
      // only increments its experienceCount and nothing on the active dream path
      // reset it, so the readout was perpetually stale. Best-effort.
      await this.reconcileHookState();

      // Auto-apply high-confidence insights if enabled
      if (this.config.autoApplyHighConfidenceInsights) {
        await this.autoApplyInsights(result);
      }

      // Publish dream completed event
      await this.publishDreamCompletedEvent(result);

      // Reclaim dead space in patterns.rvf after each dream cycle. Best-effort
      // and threshold-gated (only runs when deadSpaceRatio or fileSize cross
      // configured thresholds), so idle cycles are nearly free. Without this
      // call patterns.rvf grows monotonically — see the field reports of
      // 59 GB regrowth on a fresh clone.
      //
      // AWAITED on purpose: native compact() takes an exclusive lock against
      // the RVF file. Running concurrently with the meta-learning analysis
      // (which reads from RVF) would risk lock contention. The threshold
      // gate keeps the wall-clock cost near zero on healthy installations.
      await this.maybeCompactPatternsRvf();

      // ADR-062: Run meta-learning analysis after dream cycle
      if (process.env.AQE_META_LEARNING_ENABLED === 'true') {
        try {
          await this.runPostDreamMetaLearning();
        } catch (metaErr) {
          // Meta-learning failure must never break dream cycles
          logger.warn('Post-dream meta-learning failed (non-critical)', {
            error: metaErr instanceof Error ? metaErr.message : String(metaErr),
          });
        }
      }

      // Reschedule next dream if running
      if (this.running) {
        this.scheduleNextDream();
      }

      logger.info('Dream completed', { insightsGenerated: result.insights.length });
      return result;
    } catch (err) {
      dreamError = err instanceof Error ? err : new Error(String(err));
      throw err;
    } finally {
      this.dreaming = false;
      // ADR-094 / #488 B.2: record liveness so `aqe learning loop-health`
      // can show the kernel-side dream scheduler as live. Best-effort —
      // recordLoopHealth itself never throws.
      if (this.memoryBackend) {
        await recordLoopHealth(this.memoryBackend, 'dreamScheduler', {
          success: !dreamError,
          error: dreamError,
        });
      }
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
          logger.info('Auto-applied insight', { insightId: insight.id, patternId: applyResult.patternId });
        }
      } catch (err) {
        logger.error('Failed to auto-apply insight', err instanceof Error ? err : undefined, { insightId: insight.id });
      }
    }
  }

  /**
   * Reclaim dead space in patterns.rvf and brain.rvf after a dream cycle.
   *
   * Background: RVF is append-only — every ingest/delete writes a new segment.
   * Without periodic compaction these files grow monotonically (field reports
   * have seen 59 GB on a fresh clone). The shared adapter exposes a helper
   * that runs `compact()` only when configured thresholds are exceeded, so
   * idle cycles are essentially free.
   *
   * Two files are compacted:
   *   • patterns.rvf — primary HNSW vector store (every storePattern() append)
   *   • brain.rvf — dual-write target (one append per storePattern() via
   *     RvfDualWriter.writePattern)
   *
   * Best-effort throughout: any error is logged and swallowed. The dream
   * cycle's success is not contingent on compaction completing.
   */
  private async maybeCompactPatternsRvf(): Promise<void> {
    // patterns.rvf — threshold-gated compaction via the shared singleton.
    try {
      const mod = await import('../../integrations/ruvector/shared-rvf-adapter.js');
      const result = mod.compactSharedRvfAdapter();
      if (result && result.bytesReclaimed > 0) {
        logger.info('patterns.rvf compacted', {
          bytesReclaimed: result.bytesReclaimed,
          segmentsCompacted: result.segmentsCompacted,
        });
      }
    } catch (err) {
      logger.warn('patterns.rvf compaction skipped (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // brain.rvf — separate file, separate writer (RvfDualWriter). The
    // dual-writer does not gate on thresholds (it has no status surface that
    // exposes deadSpaceRatio), so we call compact() unconditionally. Native
    // compact() is a no-op on a clean file, so the cost is bounded.
    try {
      const mod = await import('../../integrations/ruvector/shared-rvf-dual-writer.js');
      const writer = mod.getSharedRvfDualWriterSync();
      if (writer) {
        const result = writer.compact();
        if (result && result.bytesReclaimed > 0) {
          logger.info('brain.rvf compacted', {
            bytesReclaimed: result.bytesReclaimed,
            segmentsCompacted: result.segmentsCompacted,
          });
        }
      }
    } catch (err) {
      logger.warn('brain.rvf compaction skipped (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ==========================================================================
  // Private: Meta-Learning (ADR-062)
  // ==========================================================================

  /**
   * Collect a metrics snapshot and, if enough have accumulated, run a
   * meta-learning analysis cycle to detect token-waste, quality plateaus,
   * learning stalls, and performance regressions.
   */
  private async runPostDreamMetaLearning(): Promise<void> {
    // Lazily initialize the metrics tracker
    if (!this.metricsTracker) {
      this.metricsTracker = new LearningMetricsTracker();
      await this.metricsTracker.initialize();
    }

    // Collect a unified snapshot
    const snapshot = await this.metricsTracker.collectUnifiedSnapshot();
    this.metaLearningSnapshots.push(snapshot);

    // Cap the buffer at MAX_META_SNAPSHOTS (keep most recent)
    while (this.metaLearningSnapshots.length > DreamScheduler.MAX_META_SNAPSHOTS) {
      this.metaLearningSnapshots.shift();
    }

    // Run meta-learning if we have enough snapshots
    const minRequired = DEFAULT_META_LEARNING_CONFIG.minSnapshotsForAnalysis;
    if (this.metaLearningSnapshots.length >= minRequired) {
      const insights = this.metaLearningEngine.runMetaLearningCycle(
        this.metaLearningSnapshots,
      );
      if (insights.length > 0) {
        logger.info('Meta-learning insights detected', {
          count: insights.length,
          types: insights.map(i => i.type),
        });

        // Gap 1: Store insights in queryable in-memory buffer (not just logs)
        for (const insight of insights) {
          logger.info(`Meta-insight [${insight.type}]: ${insight.description}`, {
            confidence: insight.confidence.toFixed(2),
            suggestedAction: insight.suggestedAction,
          });
          this.detectedInsights.push(insight);
        }

        // Cap the insights buffer at MAX_DETECTED_INSIGHTS (keep most recent)
        while (this.detectedInsights.length > DreamScheduler.MAX_DETECTED_INSIGHTS) {
          this.detectedInsights.shift();
        }

        // Publish event so other subsystems can react to meta-learning insights
        try {
          this.eventBus.publish({
            id: uuidv4(),
            type: 'meta-learning.insight-detected',
            timestamp: new Date(),
            source: 'learning-optimization',
            payload: {
              count: insights.length,
              insights: insights.map(i => ({
                id: i.id,
                type: i.type,
                description: i.description,
                confidence: i.confidence,
                suggestedAction: i.suggestedAction,
                detectedAt: i.detectedAt,
              })),
            },
          } satisfies DomainEvent);
        } catch {
          // Event publishing is best-effort; insight storage above is the primary mechanism
          logger.debug('Failed to publish meta-learning insight event');
        }
      }
    } else {
      logger.debug('Meta-learning: accumulating snapshots', {
        current: this.metaLearningSnapshots.length,
        required: minRequired,
      });
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
        logger.error('Scheduled dream failed', err instanceof Error ? err : undefined);
        // Reschedule even on failure
        if (this.running) {
          this.scheduleNextDream();
        }
      }
    }, nextDreamDelay);

    logger.info('Next dream scheduled', { delaySeconds: Math.ceil(nextDreamDelay / 1000) });
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
      logger.info('Quality gate failed but cannot start dream yet');
      return;
    }

    logger.info('Quality gate failed, triggering analysis dream');
    try {
      await this.executeDream(this.config.quickDreamDurationMs);
    } catch (err) {
      logger.error('Quality gate triggered dream failed', err instanceof Error ? err : undefined);
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
      logger.info('Milestone reached but cannot start dream yet');
      return;
    }

    logger.info('Domain milestone reached, triggering consolidation dream');
    try {
      await this.executeDream(this.config.defaultDreamDurationMs);
    } catch (err) {
      logger.error('Milestone triggered dream failed', err instanceof Error ? err : undefined);
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
      logger.error('Failed to publish dream completed event', err instanceof Error ? err : undefined);
    }
  }

  // ==========================================================================
  // Private: State Persistence
  // ==========================================================================

  /**
   * #509: Reconcile the SessionStart-read `dream-scheduler:hook-state` row after
   * a successful dream cycle. The post-task hook only ever INCREMENTS that row's
   * experienceCount; this kernel scheduler is the entity that actually dreams
   * (ADR-094) but historically never wrote it back, so the SessionStart readout
   * showed lastDreamTime:null and a pendingExperiences counter that only grew.
   * We stamp { lastDreamTime: now, experienceCount: 0, totalDreamsThisSession++ }
   * using the SAME key + DEFAULT namespace the hook path uses. Best-effort: a
   * failure here must never break a dream cycle.
   */
  private async reconcileHookState(): Promise<void> {
    if (!this.memoryBackend) return;
    try {
      const prev = await this.memoryBackend.get<DreamHookStateRow>(DREAM_HOOK_STATE_KEY);
      const next: DreamHookStateRow = {
        lastDreamTime: (this.lastDreamTime ?? new Date()).toISOString(),
        experienceCount: 0,
        sessionStartTime: prev?.sessionStartTime,
        totalDreamsThisSession: (prev?.totalDreamsThisSession ?? 0) + 1,
      };
      await this.memoryBackend.set(DREAM_HOOK_STATE_KEY, next);
    } catch (err) {
      logger.warn('Dream hook-state reconcile failed (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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
      logger.error('Failed to save state', err instanceof Error ? err : undefined);
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
        logger.info('Restored state', {
          totalDreamsCompleted: this.totalDreamsCompleted,
          experienceCount: this.experienceBuffer.length,
        });
      }
    } catch (err) {
      logger.error('Failed to restore state', err instanceof Error ? err : undefined);
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
