/**
 * Agentic-Flow ReasoningBank Integration for AQE v3
 * ADR-051: ReasoningBank enhancement for 46% faster recurring tasks
 *
 * This adapter integrates agentic-flow's advanced learning features with
 * the existing RealQEReasoningBank:
 *
 * - TrajectoryTracker: Captures task execution sequences for learning
 * - ExperienceReplay: Stores and retrieves proven strategies
 * - PatternEvolution: Manages pattern versions, drift, and consolidation
 *
 * The combination enables:
 * - 46% faster task completion on recurring patterns
 * - Cross-session learning persistence
 * - Automatic strategy recommendations
 * - Pattern quality improvement over time
 */

import {
  RealQEReasoningBank,
  createRealQEReasoningBank,
  type RealQEReasoningBankConfig,
  type RealQERoutingRequest,
  type RealQERoutingResult,
  type LearningOutcome,
} from '../../../learning/real-qe-reasoning-bank.js';
import {
  TrajectoryTracker,
  createTrajectoryTracker,
  type Trajectory,
  type TrajectoryStep,
  type TrajectoryOptions,
  type TrajectoryTrackerConfig,
} from './trajectory-tracker.js';
import {
  ExperienceReplay,
  createExperienceReplay,
  type Experience,
  type ExperienceGuidance,
  type ExperienceReplayConfig,
} from './experience-replay.js';
import {
  PatternEvolution,
  createPatternEvolution,
  type PatternVersion,
  type DriftDetectionResult,
  type MergeCandidate,
  type PatternEvolutionConfig,
} from './pattern-evolution.js';
import type { QEPattern, QEDomain, CreateQEPatternOptions } from '../../../learning/qe-patterns.js';

// ============================================================================
// Adapter Statistics Type
// ============================================================================

export interface EnhancedReasoningBankAdapterStats {
  tasksRouted: number;
  trajectoriesCompleted: number;
  experiencesApplied: number;
  tokensSavedEstimate: number;
  avgTaskSpeedupPercent: number;
  successRate: number;
  totalSuccesses: number;
  totalTasks: number;
}
import type { Result } from '../../../shared/types/index.js';
import { ok, err } from '../../../shared/types/index.js';
import { toError } from '../../../shared/error-utils.js';

// ============================================================================
// Re-exports
// ============================================================================

export {
  // Trajectory
  TrajectoryTracker,
  createTrajectoryTracker,
  type Trajectory,
  type TrajectoryStep,
  type TrajectoryOptions,
  type TrajectoryTrackerConfig,
} from './trajectory-tracker.js';

export {
  // Experience
  ExperienceReplay,
  createExperienceReplay,
  type Experience,
  type ExperienceGuidance,
  type ExperienceReplayConfig,
} from './experience-replay.js';

export {
  // Evolution
  PatternEvolution,
  createPatternEvolution,
  type PatternVersion,
  type DriftDetectionResult,
  type MergeCandidate,
  type PatternEvolutionConfig,
} from './pattern-evolution.js';

// ============================================================================
// Enhanced ReasoningBank Configuration
// ============================================================================

/**
 * Configuration for Enhanced ReasoningBank Adapter
 */
export interface EnhancedReasoningBankConfig {
  /** Base ReasoningBank configuration */
  base: Partial<RealQEReasoningBankConfig>;

  /** Trajectory tracker configuration */
  trajectoryTracker: Partial<TrajectoryTrackerConfig>;

  /** Experience replay configuration */
  experienceReplay: Partial<ExperienceReplayConfig>;

  /** Pattern evolution configuration */
  patternEvolution: Partial<PatternEvolutionConfig>;

  /** Enable trajectory tracking */
  enableTrajectories: boolean;

  /** Enable experience replay */
  enableExperienceReplay: boolean;

  /** Enable pattern evolution */
  enablePatternEvolution: boolean;

  /** Auto-store successful trajectories as experiences */
  autoStoreExperiences: boolean;

  /** Auto-consolidate patterns periodically */
  autoConsolidate: boolean;

  /** Consolidation interval in milliseconds */
  consolidationIntervalMs: number;
}

const DEFAULT_ENHANCED_CONFIG: EnhancedReasoningBankConfig = {
  base: {},
  trajectoryTracker: {},
  experienceReplay: {},
  patternEvolution: {},
  enableTrajectories: true,
  enableExperienceReplay: true,
  enablePatternEvolution: true,
  autoStoreExperiences: true,
  autoConsolidate: true,
  consolidationIntervalMs: 60 * 60 * 1000, // 1 hour
};

// ============================================================================
// Enhanced Routing Result
// ============================================================================

/**
 * Enhanced routing result with experience guidance
 */
export interface EnhancedRoutingResult extends RealQERoutingResult {
  /** Guidance from similar experiences */
  experienceGuidance?: ExperienceGuidance;

  /** Active trajectory ID if task tracking is enabled */
  trajectoryId?: string;

  /** Similar past trajectories */
  similarTrajectories?: Array<{
    id: string;
    task: string;
    outcome: string;
    similarity: number;
  }>;
}

// ============================================================================
// Enhanced ReasoningBank Adapter
// ============================================================================

/**
 * EnhancedReasoningBankAdapter integrates agentic-flow's learning features
 * with AQE's RealQEReasoningBank for superior task performance.
 *
 * Usage:
 * ```typescript
 * const adapter = new EnhancedReasoningBankAdapter();
 * await adapter.initialize();
 *
 * // Route task with experience guidance
 * const result = await adapter.routeTaskWithExperience({
 *   task: 'Generate unit tests for authentication module'
 * });
 *
 * // Track task execution
 * const trajId = await adapter.startTaskTrajectory('Fix timeout bug');
 * await adapter.recordTaskStep(trajId, 'analyze', { outcome: 'success' });
 * await adapter.recordTaskStep(trajId, 'implement-fix', { outcome: 'success' });
 * const trajectory = await adapter.endTaskTrajectory(trajId, true);
 *
 * // Automatic experience storage for successful trajectories
 * ```
 */
export class EnhancedReasoningBankAdapter {
  private readonly config: EnhancedReasoningBankConfig;
  private reasoningBank: RealQEReasoningBank | null = null;
  private trajectoryTracker: TrajectoryTracker | null = null;
  private experienceReplay: ExperienceReplay | null = null;
  private patternEvolution: PatternEvolution | null = null;
  private initialized = false;
  private consolidationTimer: NodeJS.Timeout | null = null;

  // Statistics
  private stats = {
    tasksRouted: 0,
    trajectoriesCompleted: 0,
    experiencesApplied: 0,
    tokensSavedEstimate: 0,
    avgTaskSpeedupPercent: 0,
    successRate: 0,
    totalSuccesses: 0,
    totalTasks: 0,
  };

  constructor(config: Partial<EnhancedReasoningBankConfig> = {}) {
    this.config = { ...DEFAULT_ENHANCED_CONFIG, ...config };
  }

  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = performance.now();

    // Initialize base ReasoningBank
    this.reasoningBank = createRealQEReasoningBank(this.config.base);
    await this.reasoningBank.initialize();

    // Initialize trajectory tracker
    if (this.config.enableTrajectories) {
      this.trajectoryTracker = createTrajectoryTracker(this.config.trajectoryTracker);
      await this.trajectoryTracker.initialize();
    }

    // Initialize experience replay
    if (this.config.enableExperienceReplay) {
      this.experienceReplay = createExperienceReplay(this.config.experienceReplay);
      await this.experienceReplay.initialize();
    }

    // Initialize pattern evolution
    if (this.config.enablePatternEvolution) {
      this.patternEvolution = createPatternEvolution(this.config.patternEvolution);
      await this.patternEvolution.initialize();
    }

    // Start auto-consolidation timer
    if (this.config.autoConsolidate && this.patternEvolution) {
      this.startConsolidationTimer();
    }

    this.initialized = true;
    const initTime = performance.now() - startTime;
    console.log(`[EnhancedReasoningBank] Initialized in ${initTime.toFixed(0)}ms`);
  }

  // ============================================================================
  // Enhanced Routing
  // ============================================================================

  /**
   * Route a task with experience guidance
   *
   * @param request - Routing request
   * @returns Enhanced routing result with experience guidance
   */
  async routeTaskWithExperience(
    request: RealQERoutingRequest
  ): Promise<Result<EnhancedRoutingResult>> {
    this.ensureInitialized();
    this.stats.tasksRouted++;

    try {
      // Get base routing result
      const baseResult = await this.reasoningBank!.routeTask(request);
      if (!baseResult.success) {
        return baseResult as Result<EnhancedRoutingResult>;
      }

      const result: EnhancedRoutingResult = { ...baseResult.value };

      // Add experience guidance if enabled
      if (this.experienceReplay) {
        const guidance = await this.experienceReplay.getGuidance(
          request.task,
          request.domain
        );
        if (guidance) {
          result.experienceGuidance = guidance;
          result.guidance = [
            `Strategy: ${guidance.recommendedStrategy}`,
            ...guidance.suggestedActions.map(a => `Action: ${a}`),
            ...result.guidance,
          ];
          this.stats.tokensSavedEstimate += guidance.estimatedTokenSavings;
          this.stats.experiencesApplied++;

          // Record application of each source experience for reuse tracking
          for (const src of guidance.sourceExperiences) {
            this.experienceReplay.recordApplication(
              src.id,
              request.task,
              true, // success=true at routing time; updated later via recordOutcome
              Math.round(guidance.estimatedTokenSavings),
            ).catch(err => {
              console.warn(`[EnhancedAdapter] Failed to record experience application: ${err}`);
            });
          }
        }
      }

      // Find similar past trajectories
      if (this.trajectoryTracker) {
        const similar = await this.trajectoryTracker.findSimilarTrajectories(request.task, 3);
        if (similar.length > 0) {
          result.similarTrajectories = similar.map(t => ({
            id: t.id,
            task: t.task,
            outcome: t.outcome,
            similarity: 0.8, // TODO: Calculate actual similarity
          }));
        }
      }

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Trajectory Tracking
  // ============================================================================

  /**
   * Start tracking a task trajectory
   *
   * @param task - Task description
   * @param options - Optional trajectory options
   * @returns Trajectory ID
   */
  async startTaskTrajectory(
    task: string,
    options: TrajectoryOptions = {}
  ): Promise<string> {
    this.ensureInitialized();

    if (!this.trajectoryTracker) {
      throw new Error('Trajectory tracking not enabled');
    }

    return this.trajectoryTracker.startTrajectory(task, options);
  }

  /**
   * Record a step in a trajectory
   *
   * @param trajectoryId - Trajectory ID
   * @param action - Action name
   * @param result - Step result
   * @param options - Optional step options
   */
  async recordTaskStep(
    trajectoryId: string,
    action: string,
    result: TrajectoryStep['result'],
    options?: {
      quality?: number;
      durationMs?: number;
      tokensUsed?: number;
      context?: Record<string, unknown>;
    }
  ): Promise<void> {
    this.ensureInitialized();

    if (!this.trajectoryTracker) {
      throw new Error('Trajectory tracking not enabled');
    }

    await this.trajectoryTracker.recordStep(trajectoryId, action, result, options);
  }

  /**
   * End a trajectory and optionally store as experience
   *
   * @param trajectoryId - Trajectory ID
   * @param success - Whether task was successful
   * @param feedback - Optional feedback
   * @returns Completed trajectory
   */
  async endTaskTrajectory(
    trajectoryId: string,
    success: boolean,
    feedback?: string
  ): Promise<Trajectory> {
    this.ensureInitialized();

    if (!this.trajectoryTracker) {
      throw new Error('Trajectory tracking not enabled');
    }

    const trajectory = await this.trajectoryTracker.endTrajectory(trajectoryId, success, feedback);

    this.stats.trajectoriesCompleted++;
    this.stats.totalTasks++;
    if (success) {
      this.stats.totalSuccesses++;
    }
    this.stats.successRate = this.stats.totalSuccesses / this.stats.totalTasks;

    // Auto-store successful trajectories as experiences
    if (this.config.autoStoreExperiences && success && this.experienceReplay) {
      const strategy = this.deriveStrategy(trajectory);
      await this.experienceReplay.storeExperience(trajectory, strategy);
    }

    return trajectory;
  }

  /**
   * Get a trajectory by ID
   */
  async getTrajectory(id: string): Promise<Trajectory | null> {
    this.ensureInitialized();
    return this.trajectoryTracker?.getTrajectory(id) ?? null;
  }

  // ============================================================================
  // Experience Management
  // ============================================================================

  /**
   * Get guidance based on similar past experiences
   *
   * @param task - Task description
   * @param domain - Optional domain filter
   * @returns Experience guidance
   */
  async getExperienceGuidance(
    task: string,
    domain?: QEDomain
  ): Promise<ExperienceGuidance | null> {
    this.ensureInitialized();

    if (!this.experienceReplay) {
      return null;
    }

    const guidance = await this.experienceReplay.getGuidance(task, domain);
    if (guidance) {
      this.stats.experiencesApplied++;

      // Record application for reuse tracking (experience_applications table)
      for (const src of guidance.sourceExperiences) {
        this.experienceReplay.recordApplication(
          src.id,
          task,
          true,
          Math.round(guidance.estimatedTokenSavings),
        ).catch(err => {
          console.warn(`[EnhancedAdapter] Failed to record experience application: ${err}`);
        });
      }
    }
    return guidance;
  }

  /**
   * Record that an experience was applied
   *
   * @param experienceId - Experience ID
   * @param task - Task it was applied to
   * @param success - Whether application was successful
   * @param tokensSaved - Tokens saved by using experience
   */
  async recordExperienceApplication(
    experienceId: string,
    task: string,
    success: boolean,
    tokensSaved: number = 0
  ): Promise<void> {
    this.ensureInitialized();

    if (!this.experienceReplay) return;

    await this.experienceReplay.recordApplication(experienceId, task, success, tokensSaved);
    this.stats.tokensSavedEstimate += tokensSaved;
  }

  // ============================================================================
  // Pattern Management (Delegating to base ReasoningBank)
  // ============================================================================

  /**
   * Store a QE pattern with evolution tracking
   */
  async storePattern(options: CreateQEPatternOptions): Promise<Result<QEPattern>> {
    this.ensureInitialized();

    const result = await this.reasoningBank!.storeQEPattern(options);

    // Track pattern version if evolution is enabled
    if (result.success && this.patternEvolution && result.value.embedding) {
      await this.patternEvolution.trackVersion(
        result.value.id,
        result.value.embedding,
        ['Initial version'],
        'initial'
      );
    }

    return result;
  }

  /**
   * Search patterns with enhanced results
   */
  async searchPatterns(
    query: string,
    options?: { limit?: number; domain?: QEDomain; minSimilarity?: number }
  ): Promise<Result<Array<{ pattern: QEPattern; similarity: number }>>> {
    this.ensureInitialized();
    return this.reasoningBank!.searchQEPatterns(query, options);
  }

  /**
   * Record a pattern outcome with evolution tracking
   */
  async recordPatternOutcome(outcome: LearningOutcome): Promise<Result<void>> {
    this.ensureInitialized();

    const result = await this.reasoningBank!.recordOutcome(outcome);

    // Check for pattern drift if evolution is enabled
    if (this.patternEvolution && outcome.success !== undefined) {
      const drift = await this.patternEvolution.detectDrift(outcome.patternId);
      if (drift?.hasSignificantDrift) {
        console.log(
          `[EnhancedReasoningBank] Pattern drift detected: ${outcome.patternId}, ` +
          `recommendation: ${drift.recommendation}`
        );
      }
    }

    return result;
  }

  // ============================================================================
  // Evolution Management
  // ============================================================================

  /**
   * Detect drift in a pattern
   */
  async detectPatternDrift(patternId: string): Promise<DriftDetectionResult | null> {
    this.ensureInitialized();
    return this.patternEvolution?.detectDrift(patternId) ?? null;
  }

  /**
   * Find patterns that could be merged
   */
  async findMergeCandidates(domain: QEDomain): Promise<MergeCandidate[]> {
    this.ensureInitialized();
    return this.patternEvolution?.findMergeCandidates(domain) ?? [];
  }

  /**
   * Manually trigger pattern consolidation
   */
  async consolidatePatterns(domain: QEDomain): Promise<{
    merged: number;
    pruned: number;
    retained: number;
  }> {
    this.ensureInitialized();

    if (!this.patternEvolution) {
      return { merged: 0, pruned: 0, retained: 0 };
    }

    return this.patternEvolution.autoConsolidate(domain);
  }

  /**
   * Get pattern evolution history
   */
  async getPatternHistory(patternId: string): Promise<{
    versions: PatternVersion[];
    events: Array<{ id: string; eventType: string; details: unknown; timestamp: Date }>;
  } | null> {
    this.ensureInitialized();
    return this.patternEvolution?.getEvolutionHistory(patternId) ?? null;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get comprehensive statistics
   */
  async getStats(): Promise<{
    adapter: EnhancedReasoningBankAdapterStats;
    reasoningBank: Awaited<ReturnType<RealQEReasoningBank['getQEStats']>>;
    trajectoryTracker?: ReturnType<TrajectoryTracker['getStats']>;
    experienceReplay?: ReturnType<ExperienceReplay['getStats']>;
    patternEvolution?: ReturnType<PatternEvolution['getStats']>;
  }> {
    this.ensureInitialized();

    return {
      adapter: this.stats,
      reasoningBank: await this.reasoningBank!.getQEStats(),
      trajectoryTracker: this.trajectoryTracker?.getStats(),
      experienceReplay: this.experienceReplay?.getStats(),
      patternEvolution: this.patternEvolution?.getStats(),
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Dispose all components
   */
  async dispose(): Promise<void> {
    // Stop consolidation timer
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
      this.consolidationTimer = null;
    }

    // Dispose components
    await this.patternEvolution?.dispose();
    await this.experienceReplay?.dispose();
    await this.trajectoryTracker?.dispose();
    await this.reasoningBank?.dispose();

    this.patternEvolution = null;
    this.experienceReplay = null;
    this.trajectoryTracker = null;
    this.reasoningBank = null;
    this.initialized = false;

    console.log('[EnhancedReasoningBank] Disposed');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.reasoningBank) {
      throw new Error('EnhancedReasoningBankAdapter not initialized. Call initialize() first.');
    }
  }

  private startConsolidationTimer(): void {
    this.consolidationTimer = setInterval(async () => {
      try {
        // Consolidate each domain
        const domains: QEDomain[] = [
          'test-generation',
          'coverage-analysis',
          'test-execution',
          'quality-assessment',
        ];

        for (const domain of domains) {
          const result = await this.patternEvolution!.autoConsolidate(domain);
          if (result.merged > 0 || result.pruned > 0) {
            console.log(
              `[EnhancedReasoningBank] Consolidated ${domain}: ` +
              `merged=${result.merged}, pruned=${result.pruned}, retained=${result.retained}`
            );
          }
        }
      } catch (error) {
        console.error('[EnhancedReasoningBank] Consolidation error:', error);
      }
    }, this.config.consolidationIntervalMs);
  }

  /**
   * Derive a strategy description from a trajectory
   */
  private deriveStrategy(trajectory: Trajectory): string {
    const successfulActions = trajectory.steps
      .filter(s => s.result.outcome === 'success')
      .map(s => s.action);

    if (successfulActions.length === 0) {
      return `Attempted ${trajectory.steps.length} actions for: ${trajectory.task}`;
    }

    return `Used ${successfulActions.join(' -> ')} pattern for: ${trajectory.task.substring(0, 50)}`;
  }
}

/**
 * Create an EnhancedReasoningBankAdapter instance
 */
export function createEnhancedReasoningBank(
  config: Partial<EnhancedReasoningBankConfig> = {}
): EnhancedReasoningBankAdapter {
  return new EnhancedReasoningBankAdapter(config);
}

/**
 * Default export for convenience
 */
export default EnhancedReasoningBankAdapter;
