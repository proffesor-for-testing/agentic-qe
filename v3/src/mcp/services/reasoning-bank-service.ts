/**
 * Agentic QE v3 - ReasoningBank Service
 * ADR-051: Provides ReasoningBank integration for MCP task handlers
 *
 * This service bridges the EnhancedReasoningBankAdapter with MCP task execution,
 * enabling learning from task outcomes, intelligent routing, and trajectory tracking.
 *
 * INTEGRATION FIX: Now uses EnhancedReasoningBankAdapter for full learning pipeline:
 * - Trajectory tracking during task execution
 * - Experience-guided routing decisions
 * - Pattern evolution and consolidation
 * - Synchronous learning (no fire-and-forget)
 */

import {
  EnhancedReasoningBankAdapter,
  createEnhancedReasoningBank,
  type Trajectory,
  type TrajectoryStep as TrackerTrajectoryStep,
  type TrajectoryOptions,
  type ExperienceGuidance,
  type EnhancedReasoningBankAdapterStats,
} from '../../integrations/agentic-flow/reasoning-bank/index.js';
import {
  type RealQERoutingRequest,
  type RealQERoutingResult,
  type LearningOutcome,
  type RealQEReasoningBankStats,
} from '../../learning/real-qe-reasoning-bank.js';
import type { QEPattern, QEDomain } from '../../learning/qe-patterns.js';
import { getPatternLoader } from '../../integrations/agentic-flow/pattern-loader.js';
import { updateAgentPerformance } from '../../routing/qe-agent-registry.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Task outcome record for learning
 */
export interface TaskOutcome {
  /** Task ID */
  taskId: string;
  /** Task description */
  task: string;
  /** Task type */
  taskType: string;
  /** Whether the task succeeded */
  success: boolean;
  /** Execution time in ms */
  executionTimeMs: number;
  /** Agent that executed the task */
  agentId?: string;
  /** Domain the task ran in */
  domain?: string;
  /** Model tier used */
  modelTier?: number;
  /** Quality score (0-1) */
  qualityScore?: number;
  /** Error message if failed */
  error?: string;
  /** Additional metrics */
  metrics?: {
    tokensUsed?: number;
    testsGenerated?: number;
    testsPassed?: number;
    coverageImprovement?: number;
  };
}

/**
 * Trajectory step for detailed learning
 */
export interface TrajectoryStep {
  /** Step type */
  type: 'action' | 'observation' | 'decision';
  /** Step description */
  description: string;
  /** Timestamp */
  timestamp: Date;
  /** Step result */
  result?: string;
  /** Quality score (0-1) */
  quality?: number;
}

/**
 * Enhanced routing result with experience guidance
 */
export interface EnhancedRoutingResult extends RealQERoutingResult {
  experienceGuidance?: ExperienceGuidance;
  similarTrajectories?: Array<{
    id: string;
    task: string;
    outcome: string;
    similarity: number;
  }>;
}

/**
 * ReasoningBank service configuration
 */
export interface ReasoningBankServiceConfig {
  /** Enable learning from outcomes */
  enableLearning: boolean;
  /** Enable intelligent routing */
  enableRouting: boolean;
  /** Enable pattern guidance */
  enableGuidance: boolean;
  /** Enable trajectory tracking */
  enableTrajectories: boolean;
  /** Enable experience replay */
  enableExperienceReplay: boolean;
  /** Auto-store successful trajectories as experiences */
  autoStoreExperiences: boolean;
  /** Minimum quality score to store patterns */
  minQualityThreshold: number;
}

/**
 * Default configuration
 */
export const DEFAULT_SERVICE_CONFIG: ReasoningBankServiceConfig = {
  enableLearning: true,
  enableRouting: true,
  enableGuidance: true,
  enableTrajectories: true,
  enableExperienceReplay: true,
  autoStoreExperiences: true,
  minQualityThreshold: 0.6,
};

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * ReasoningBank Service
 *
 * Provides learning and routing capabilities for MCP task execution.
 * Uses EnhancedReasoningBankAdapter for full learning pipeline including:
 * - Trajectory tracking
 * - Experience replay
 * - Pattern evolution
 * - HNSW-indexed pattern storage
 */
export class ReasoningBankService {
  private static instance: ReasoningBankService | null = null;
  private static initPromise: Promise<ReasoningBankService> | null = null;

  private readonly config: ReasoningBankServiceConfig;
  private readonly enhancedAdapter: EnhancedReasoningBankAdapter;
  private disposed = false;

  // ADR-051: Pattern loading status
  private patternsLoaded = false;
  private qualityThresholdsFromPatterns: Awaited<ReturnType<ReturnType<typeof getPatternLoader>['getQualityGateThresholds']>> = null;

  // Metrics tracking
  private tasksRecorded = 0;
  private successfulTasks = 0;
  private failedTasks = 0;
  private patternsStored = 0;
  private routingRequests = 0;

  // INTEGRATION FIX: Track active trajectories per task
  private activeTrajectories = new Map<string, string>();

  private constructor(
    config: ReasoningBankServiceConfig,
    enhancedAdapter: EnhancedReasoningBankAdapter
  ) {
    this.config = config;
    this.enhancedAdapter = enhancedAdapter;
  }

  /**
   * Get or create the singleton service instance
   */
  static async getInstance(
    config?: Partial<ReasoningBankServiceConfig>
  ): Promise<ReasoningBankService> {
    if (ReasoningBankService.instance && !ReasoningBankService.instance.disposed) {
      return ReasoningBankService.instance;
    }

    if (ReasoningBankService.initPromise) {
      return ReasoningBankService.initPromise;
    }

    ReasoningBankService.initPromise = ReasoningBankService.create(config);

    try {
      ReasoningBankService.instance = await ReasoningBankService.initPromise;
      return ReasoningBankService.instance;
    } finally {
      ReasoningBankService.initPromise = null;
    }
  }

  /**
   * Create a new service instance
   */
  private static async create(
    config?: Partial<ReasoningBankServiceConfig>
  ): Promise<ReasoningBankService> {
    const fullConfig: ReasoningBankServiceConfig = {
      ...DEFAULT_SERVICE_CONFIG,
      ...config,
    };

    // INTEGRATION FIX: Use EnhancedReasoningBankAdapter instead of RealQEReasoningBank
    const enhancedAdapter = createEnhancedReasoningBank({
      enableTrajectories: fullConfig.enableTrajectories,
      enableExperienceReplay: fullConfig.enableExperienceReplay,
      enablePatternEvolution: true,
      autoStoreExperiences: fullConfig.autoStoreExperiences,
      autoConsolidate: true,
    });

    await enhancedAdapter.initialize();

    const service = new ReasoningBankService(fullConfig, enhancedAdapter);

    // ADR-051: Load quality thresholds from PatternLoader
    await service.loadPatternsFromLoader();

    // INTEGRATION FIX: Seed initial patterns if none exist
    await service.seedInitialPatternsIfNeeded();

    console.error('[ReasoningBankService] Initialized with EnhancedReasoningBankAdapter (trajectory + experience + evolution)');
    return service;
  }

  /**
   * ADR-051: Load quality gate thresholds from PatternLoader
   * Falls back to hardcoded defaults if patterns unavailable
   */
  private async loadPatternsFromLoader(): Promise<void> {
    try {
      const loader = getPatternLoader();
      const thresholds = await loader.getQualityGateThresholds();

      if (thresholds) {
        this.qualityThresholdsFromPatterns = thresholds;
        this.patternsLoaded = true;

        console.error('[ReasoningBankService] Loaded quality thresholds from PatternLoader', {
          tiers: Object.keys(thresholds),
        });
        return;
      }

      console.error('[ReasoningBankService] PatternLoader returned no thresholds, using defaults');
    } catch (error) {
      console.error('[ReasoningBankService] Failed to load patterns from PatternLoader, using defaults', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    this.patternsLoaded = false;
  }

  /**
   * INTEGRATION FIX: Seed initial QE patterns for bootstrap
   * This ensures the system has baseline data to work with
   */
  private async seedInitialPatternsIfNeeded(): Promise<void> {
    try {
      const stats = await this.enhancedAdapter.getStats();
      if (stats.reasoningBank.totalPatterns > 0) {
        console.error(`[ReasoningBankService] Found ${stats.reasoningBank.totalPatterns} existing patterns, skipping seed`);
        return;
      }

      console.error('[ReasoningBankService] Seeding initial QE patterns...');

      // Helper to create template variables
      const makeVar = (name: string, type: 'string' | 'number' = 'string', required = false) => ({
        name,
        type,
        required,
        description: `${name} parameter`,
      });

      const seedPatterns = [
        {
          patternType: 'test-template' as const,
          name: 'unit-test-generation',
          description: 'Generate comprehensive unit tests for TypeScript/JavaScript modules',
          domain: 'test-generation' as QEDomain,
          template: {
            type: 'workflow' as const,
            content: 'Analyze module exports, identify edge cases, generate Jest/Vitest tests with proper mocking',
            variables: [makeVar('modulePath'), makeVar('framework')],
          },
          context: { tags: ['unit', 'typescript', 'jest', 'vitest'] },
        },
        {
          patternType: 'coverage-strategy' as const,
          name: 'coverage-gap-analysis',
          description: 'Identify untested code paths and recommend targeted tests',
          domain: 'coverage-analysis' as QEDomain,
          template: {
            type: 'workflow' as const,
            content: 'Parse coverage report, identify uncovered branches, prioritize by risk, generate recommendations',
            variables: [makeVar('coveragePath'), makeVar('threshold', 'number')],
          },
          context: { tags: ['coverage', 'analysis', 'risk'] },
        },
        {
          patternType: 'test-template' as const,
          name: 'integration-test-generation',
          description: 'Generate integration tests for API endpoints and service interactions',
          domain: 'test-generation' as QEDomain,
          template: {
            type: 'workflow' as const,
            content: 'Identify API contracts, generate request/response tests, validate error handling',
            variables: [makeVar('apiPath'), makeVar('framework')],
          },
          context: { tags: ['integration', 'api', 'contract'] },
        },
        {
          patternType: 'flaky-fix' as const,
          name: 'flaky-test-remediation',
          description: 'Detect and fix flaky tests through pattern analysis',
          domain: 'test-execution' as QEDomain,
          template: {
            type: 'workflow' as const,
            content: 'Analyze test history, identify timing/race conditions, apply stabilization patterns',
            variables: [makeVar('testPath'), makeVar('retryCount', 'number')],
          },
          context: { tags: ['flaky', 'stability', 'retry'] },
        },
        {
          patternType: 'error-handling' as const,
          name: 'security-vulnerability-scan',
          description: 'Scan code for security vulnerabilities using OWASP patterns',
          domain: 'security-compliance' as QEDomain,
          template: {
            type: 'workflow' as const,
            content: 'Run SAST analysis, check for injection risks, validate authentication/authorization',
            variables: [makeVar('targetPath'), makeVar('severity')],
          },
          context: { tags: ['security', 'owasp', 'sast'] },
        },
      ];

      for (const pattern of seedPatterns) {
        try {
          await this.enhancedAdapter.storePattern(pattern);
          this.patternsStored++;
        } catch (err) {
          console.error(`[ReasoningBankService] Failed to seed pattern ${pattern.name}:`, err);
        }
      }

      console.error(`[ReasoningBankService] Seeded ${seedPatterns.length} initial patterns`);
    } catch (error) {
      console.error('[ReasoningBankService] Failed to seed patterns:', error);
    }
  }

  /**
   * ADR-051: Get pattern loading status for health checks
   */
  getPatternsLoaded(): boolean {
    return this.patternsLoaded;
  }

  /**
   * ADR-051: Get quality thresholds from patterns (for debugging/reporting)
   */
  getQualityThresholdsFromPatterns(): typeof this.qualityThresholdsFromPatterns {
    return this.qualityThresholdsFromPatterns;
  }

  // ============================================================================
  // INTEGRATION FIX: Trajectory Tracking Methods
  // ============================================================================

  /**
   * Start tracking a task trajectory
   * Call this when a task begins execution
   */
  async startTaskTrajectory(
    taskId: string,
    task: string,
    options: TrajectoryOptions = {}
  ): Promise<string> {
    if (!this.config.enableTrajectories || this.disposed) {
      return taskId; // Return taskId as fallback trajectory ID
    }

    try {
      const trajectoryId = await this.enhancedAdapter.startTaskTrajectory(task, options);
      this.activeTrajectories.set(taskId, trajectoryId);

      console.error(`[ReasoningBankService] Started trajectory: task=${taskId} trajectory=${trajectoryId}`);
      return trajectoryId;
    } catch (error) {
      console.error('[ReasoningBankService] Failed to start trajectory:', error);
      return taskId;
    }
  }

  /**
   * Record a step in the current task trajectory
   */
  async recordTrajectoryStep(
    taskId: string,
    action: string,
    result: TrackerTrajectoryStep['result'],
    options?: {
      quality?: number;
      durationMs?: number;
      tokensUsed?: number;
      context?: Record<string, unknown>;
    }
  ): Promise<void> {
    if (!this.config.enableTrajectories || this.disposed) {
      return;
    }

    const trajectoryId = this.activeTrajectories.get(taskId);
    if (!trajectoryId) {
      console.error(`[ReasoningBankService] No active trajectory for task ${taskId}`);
      return;
    }

    try {
      await this.enhancedAdapter.recordTaskStep(trajectoryId, action, result, options);
    } catch (error) {
      console.error('[ReasoningBankService] Failed to record trajectory step:', error);
    }
  }

  /**
   * End a task trajectory and trigger learning
   * Call this when a task completes
   */
  async endTaskTrajectory(
    taskId: string,
    success: boolean,
    feedback?: string
  ): Promise<Trajectory | null> {
    if (!this.config.enableTrajectories || this.disposed) {
      return null;
    }

    const trajectoryId = this.activeTrajectories.get(taskId);
    if (!trajectoryId) {
      console.error(`[ReasoningBankService] No active trajectory for task ${taskId}`);
      return null;
    }

    try {
      const trajectory = await this.enhancedAdapter.endTaskTrajectory(trajectoryId, success, feedback);
      this.activeTrajectories.delete(taskId);

      console.error(
        `[ReasoningBankService] Ended trajectory: task=${taskId} success=${success} ` +
        `steps=${trajectory.steps.length} quality=${trajectory.metrics.averageQuality.toFixed(2)}`
      );

      return trajectory;
    } catch (error) {
      console.error('[ReasoningBankService] Failed to end trajectory:', error);
      this.activeTrajectories.delete(taskId);
      return null;
    }
  }

  /**
   * Get active trajectory ID for a task
   */
  getActiveTrajectoryId(taskId: string): string | undefined {
    return this.activeTrajectories.get(taskId);
  }

  // ============================================================================
  // Record Task Outcome (Synchronous Learning)
  // ============================================================================

  /**
   * Record a task outcome for learning
   * INTEGRATION FIX: Now synchronous (awaited) to ensure learning occurs
   */
  async recordTaskOutcome(outcome: TaskOutcome): Promise<void> {
    if (!this.config.enableLearning || this.disposed) {
      return;
    }

    this.tasksRecorded++;
    if (outcome.success) {
      this.successfulTasks++;
    } else {
      this.failedTasks++;
    }

    try {
      // Store as a learning outcome
      const learningOutcome: LearningOutcome = {
        patternId: `task-${outcome.taskId}`,
        success: outcome.success,
        metrics: {
          executionTimeMs: outcome.executionTimeMs,
          testsPassed: outcome.metrics?.testsPassed,
          testsFailed: outcome.metrics?.testsGenerated
            ? outcome.metrics.testsGenerated - (outcome.metrics.testsPassed || 0)
            : undefined,
          coverageImprovement: outcome.metrics?.coverageImprovement,
        },
        feedback: outcome.error,
      };

      await this.enhancedAdapter.recordPatternOutcome(learningOutcome);

      // If high quality, store as a pattern
      if (
        outcome.success &&
        (outcome.qualityScore || 0.5) >= this.config.minQualityThreshold
      ) {
        await this.storeTaskPattern(outcome);
        this.patternsStored++;
      }

      // INTEGRATION FIX: Update agent performance metrics
      if (outcome.agentId) {
        await this.updateAgentPerformanceFromOutcome(outcome);
      }

      console.error(
        `[ReasoningBankService] Recorded outcome: task=${outcome.taskId} ` +
          `success=${outcome.success} quality=${outcome.qualityScore?.toFixed(2) || 'N/A'}`
      );
    } catch (error) {
      console.error('[ReasoningBankService] Failed to record outcome:', error);
      // INTEGRATION FIX: Re-throw to ensure caller knows learning failed
      throw error;
    }
  }

  /**
   * INTEGRATION FIX: Update agent performance metrics from task outcome
   */
  private async updateAgentPerformanceFromOutcome(outcome: TaskOutcome): Promise<void> {
    if (!outcome.agentId) return;

    try {
      updateAgentPerformance(outcome.agentId, {
        success: outcome.success,
        executionTimeMs: outcome.executionTimeMs,
        qualityScore: outcome.qualityScore,
      });

      console.error(
        `[ReasoningBankService] Updated agent performance: agent=${outcome.agentId} ` +
        `success=${outcome.success} duration=${outcome.executionTimeMs}ms`
      );
    } catch (error) {
      // Don't fail the whole operation if performance update fails
      console.error('[ReasoningBankService] Failed to update agent performance:', error);
    }
  }

  /**
   * Store a successful task as a reusable pattern
   */
  private async storeTaskPattern(outcome: TaskOutcome): Promise<void> {
    try {
      // Build tags from outcome metadata for searchability
      const tags = [
        outcome.taskType,
        outcome.domain || 'general',
        outcome.agentId ? `agent:${outcome.agentId}` : undefined,
        outcome.modelTier ? `tier:${outcome.modelTier}` : undefined,
        outcome.executionTimeMs ? `duration:${outcome.executionTimeMs}ms` : undefined,
      ].filter((t): t is string => t !== undefined);

      await this.enhancedAdapter.storePattern({
        patternType: 'test-template',
        name: `${outcome.taskType}-${outcome.domain || 'general'}`,
        description: outcome.task,
        template: {
          type: 'workflow',
          // Store only the task approach as content - not JSON.stringify'd metrics
          // This avoids expensive embedding computation on non-semantic JSON strings
          content: outcome.task,
          variables: [],
        },
        context: {
          tags,
        },
      });
    } catch (error) {
      console.error('[ReasoningBankService] Failed to store pattern:', error);
    }
  }

  // ============================================================================
  // INTEGRATION FIX: Experience-Guided Routing
  // ============================================================================

  /**
   * Get routing recommendation with experience guidance
   * INTEGRATION FIX: Uses routeTaskWithExperience for enhanced routing
   */
  async getRoutingRecommendation(
    request: RealQERoutingRequest
  ): Promise<EnhancedRoutingResult> {
    if (!this.config.enableRouting || this.disposed) {
      return this.createFallbackRouting(request);
    }

    this.routingRequests++;

    try {
      // INTEGRATION FIX: Use experience-guided routing
      const result = await this.enhancedAdapter.routeTaskWithExperience(request);

      if (!result.success) {
        console.error('[ReasoningBankService] Routing returned error:', result.error);
        return this.createFallbackRouting(request);
      }

      const enhancedResult = result.value as EnhancedRoutingResult;

      // Log experience guidance if available
      if (enhancedResult.experienceGuidance) {
        console.error(
          `[ReasoningBankService] Experience guidance: strategy="${enhancedResult.experienceGuidance.recommendedStrategy}" ` +
          `confidence=${enhancedResult.experienceGuidance.confidence.toFixed(2)} ` +
          `tokenSavings=${enhancedResult.experienceGuidance.estimatedTokenSavings}`
        );
      }

      console.error(
        `[ReasoningBankService] Routing: task="${request.task.slice(0, 50)}..." ` +
          `-> agent=${enhancedResult.recommendedAgent} confidence=${enhancedResult.confidence.toFixed(2)}`
      );

      return enhancedResult;
    } catch (error) {
      console.error('[ReasoningBankService] Routing failed:', error);
      return this.createFallbackRouting(request);
    }
  }

  /**
   * Get experience guidance for a task (without routing)
   */
  async getExperienceGuidance(task: string, domain?: QEDomain): Promise<ExperienceGuidance | null> {
    if (!this.config.enableExperienceReplay || this.disposed) {
      return null;
    }

    try {
      return await this.enhancedAdapter.getExperienceGuidance(task, domain);
    } catch (error) {
      console.error('[ReasoningBankService] Failed to get experience guidance:', error);
      return null;
    }
  }

  /**
   * Get guidance for a task
   */
  async getTaskGuidance(task: string, domain?: QEDomain): Promise<string[]> {
    if (!this.config.enableGuidance || this.disposed) {
      return [];
    }

    try {
      const result = await this.enhancedAdapter.routeTaskWithExperience({
        task,
        domain,
      });
      if (!result.success) {
        return [];
      }
      return result.value.guidance;
    } catch (error) {
      console.error('[ReasoningBankService] Guidance failed:', error);
      return [];
    }
  }

  /**
   * Search for similar patterns
   */
  async searchPatterns(
    query: string,
    options?: { limit?: number; domain?: QEDomain }
  ): Promise<QEPattern[]> {
    if (this.disposed) {
      return [];
    }

    try {
      const results = await this.enhancedAdapter.searchPatterns(query, {
        limit: options?.limit || 10,
        domain: options?.domain,
      });
      if (!results.success) {
        console.error('[ReasoningBankService] Search returned error:', results.error);
        return [];
      }
      return results.value.map((r: { pattern: QEPattern; similarity: number }) => r.pattern);
    } catch (error) {
      console.error('[ReasoningBankService] Search failed:', error);
      return [];
    }
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<{
    service: {
      tasksRecorded: number;
      successfulTasks: number;
      failedTasks: number;
      successRate: number;
      patternsStored: number;
      routingRequests: number;
      patternsLoaded: boolean;
      activeTrajectories: number;
    };
    reasoningBank: RealQEReasoningBankStats;
    adapter: EnhancedReasoningBankAdapterStats;
  }> {
    const adapterStats = await this.enhancedAdapter.getStats();

    return {
      service: {
        tasksRecorded: this.tasksRecorded,
        successfulTasks: this.successfulTasks,
        failedTasks: this.failedTasks,
        successRate:
          this.tasksRecorded > 0 ? this.successfulTasks / this.tasksRecorded : 0,
        patternsStored: this.patternsStored,
        routingRequests: this.routingRequests,
        patternsLoaded: this.patternsLoaded,
        activeTrajectories: this.activeTrajectories.size,
      },
      reasoningBank: adapterStats.reasoningBank,
      adapter: adapterStats.adapter,
    };
  }

  /**
   * Create fallback routing when service unavailable
   */
  private createFallbackRouting(request: RealQERoutingRequest): EnhancedRoutingResult {
    return {
      recommendedAgent: 'qe-test-architect',
      confidence: 0.5,
      alternatives: [],
      domains: request.domain ? [request.domain] : ['test-generation'],
      patterns: [],
      guidance: [],
      reasoning: 'Fallback routing - ReasoningBank unavailable',
      latencyMs: 0,
    };
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return !this.disposed;
  }

  /**
   * Dispose the service
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;

    this.disposed = true;
    await this.enhancedAdapter.dispose();
    this.activeTrajectories.clear();
    ReasoningBankService.instance = null;

    console.error('[ReasoningBankService] Disposed');
  }

  /**
   * Reset the singleton (for testing)
   */
  static reset(): void {
    if (ReasoningBankService.instance) {
      ReasoningBankService.instance.dispose();
    }
    ReasoningBankService.instance = null;
    ReasoningBankService.initPromise = null;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the ReasoningBank service singleton
 */
export async function getReasoningBankService(
  config?: Partial<ReasoningBankServiceConfig>
): Promise<ReasoningBankService> {
  return ReasoningBankService.getInstance(config);
}

/**
 * Record a task outcome (shorthand)
 */
export async function recordTaskOutcome(outcome: TaskOutcome): Promise<void> {
  const service = await getReasoningBankService();
  return service.recordTaskOutcome(outcome);
}

/**
 * Get routing recommendation (shorthand)
 */
export async function getRoutingRecommendation(
  request: RealQERoutingRequest
): Promise<EnhancedRoutingResult> {
  const service = await getReasoningBankService();
  return service.getRoutingRecommendation(request);
}

/**
 * Start task trajectory (shorthand)
 */
export async function startTaskTrajectory(
  taskId: string,
  task: string,
  options?: TrajectoryOptions
): Promise<string> {
  const service = await getReasoningBankService();
  return service.startTaskTrajectory(taskId, task, options);
}

/**
 * End task trajectory (shorthand)
 */
export async function endTaskTrajectory(
  taskId: string,
  success: boolean,
  feedback?: string
): Promise<Trajectory | null> {
  const service = await getReasoningBankService();
  return service.endTaskTrajectory(taskId, success, feedback);
}
