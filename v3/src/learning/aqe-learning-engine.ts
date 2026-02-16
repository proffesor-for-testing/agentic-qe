/**
 * AQE Learning Engine
 * Unified learning engine with graceful degradation
 *
 * This is the main entry point for AQE's learning capabilities.
 * It works standalone and optionally integrates with Claude Flow
 * for enhanced learning features.
 *
 * Features:
 * - Pattern storage and retrieval (standalone)
 * - HNSW vector search (standalone)
 * - Task routing to agents (standalone)
 * - SONA trajectory tracking (when Claude Flow available)
 * - 3-tier model routing (when Claude Flow available)
 * - Codebase pretrain analysis (when Claude Flow available)
 *
 * @example
 * ```typescript
 * // Create engine (works standalone)
 * const engine = createAQELearningEngine({
 *   projectRoot: process.cwd(),
 * });
 *
 * // Initialize (auto-detects Claude Flow)
 * await engine.initialize();
 *
 * // Use learning features
 * const routing = await engine.routeTask('Generate unit tests for UserService');
 *
 * // Track task execution (uses SONA if available)
 * const taskId = await engine.startTask('test-generation', 'qe-test-architect');
 * await engine.recordStep(taskId, 'analyzed-code', 'Found 5 methods');
 * await engine.endTask(taskId, true);
 *
 * // Get model recommendation (uses CF router if available)
 * const model = await engine.recommendModel('complex security audit');
 * ```
 */

import type { MemoryBackend, EventBus } from '../kernel/interfaces.js';
import type { Result } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import { toErrorMessage } from '../shared/error-utils.js';
import {
  QEReasoningBank,
  createQEReasoningBank,
  type QEReasoningBankConfig,
  type QERoutingRequest,
  type QERoutingResult,
  type LearningOutcome,
  type QEReasoningBankStats,
  type CreateQEPatternOptions,
  type QEPattern,
  type QEDomain,
} from './qe-reasoning-bank.js';
import type {
  PatternSearchOptions,
  PatternSearchResult,
} from './pattern-store.js';
import {
  ClaudeFlowBridge,
  createClaudeFlowBridge,
  type BridgeStatus,
  type Trajectory,
  type TrajectoryStep,
  type ModelRoutingResult,
  type PretrainResult,
} from '../adapters/claude-flow/index.js';
import {
  ExperienceCaptureService,
  createExperienceCaptureService,
  type TaskExperience,
  type ExperienceCaptureStats,
} from './experience-capture.js';
import { createPatternStore, type PatternStore } from './pattern-store.js';
import {
  wasmLoader,
  createCoherenceService,
  type CoherenceService,
  type ICoherenceService,
} from '../integrations/coherence/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * AQE Learning Engine configuration
 */
export interface AQELearningEngineConfig {
  /** Project root path */
  projectRoot: string;

  /** Enable Claude Flow integration (auto-detected) */
  enableClaudeFlow?: boolean;

  /** QEReasoningBank configuration */
  reasoningBank?: Partial<QEReasoningBankConfig>;

  /** Enable experience capture */
  enableExperienceCapture?: boolean;

  /** Enable pattern promotion (3+ successful uses) */
  enablePatternPromotion?: boolean;

  /** Minimum uses before pattern promotion */
  promotionThreshold?: number;
}

/**
 * Default configuration
 */
export const DEFAULT_ENGINE_CONFIG: Omit<AQELearningEngineConfig, 'projectRoot'> = {
  enableClaudeFlow: true,
  enableExperienceCapture: true,
  enablePatternPromotion: true,
  promotionThreshold: 3,
};

/**
 * Task execution context
 */
export interface TaskExecution {
  id: string;
  task: string;
  agent?: string;
  startedAt: number;
  steps: TaskStep[];
  model?: 'haiku' | 'sonnet' | 'opus';
}

/**
 * Task step
 */
export interface TaskStep {
  action: string;
  result?: string;
  quality?: number;
  timestamp: number;
}

/**
 * Engine status
 */
export interface AQELearningEngineStatus {
  initialized: boolean;
  claudeFlowAvailable: boolean;
  features: {
    patternLearning: boolean;
    vectorSearch: boolean;
    taskRouting: boolean;
    trajectories: boolean;
    modelRouting: boolean;
    pretrain: boolean;
  };
}

/**
 * Engine statistics
 */
export interface AQELearningEngineStats extends QEReasoningBankStats {
  activeTasks: number;
  completedTasks: number;
  claudeFlowStatus: BridgeStatus;
  claudeFlowErrors: number;
  experienceCapture: ExperienceCaptureStats;
}

// ============================================================================
// AQE Learning Engine
// ============================================================================

/**
 * Unified AQE Learning Engine
 *
 * Works standalone with graceful Claude Flow enhancement.
 */
export class AQELearningEngine {
  private readonly config: AQELearningEngineConfig;
  private reasoningBank?: QEReasoningBank;
  private claudeFlowBridge?: ClaudeFlowBridge;
  private experienceCapture?: ExperienceCaptureService;
  private patternStore?: PatternStore;
  private coherenceService?: ICoherenceService;
  private initialized = false;

  // Task tracking
  private activeTasks: Map<string, TaskExecution> = new Map();
  private completedTasks = 0;
  private claudeFlowErrors = 0;

  constructor(
    private readonly memory: MemoryBackend,
    config: AQELearningEngineConfig,
    private readonly eventBus?: EventBus
  ) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
  }

  /**
   * Initialize the learning engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize CoherenceService (optional - falls back to TypeScript implementation)
    try {
      this.coherenceService = await createCoherenceService(wasmLoader);
      if (this.coherenceService.isInitialized()) {
        console.log('[AQELearningEngine] CoherenceService initialized with WASM engines');
      }
    } catch (error) {
      // WASM not available - coherence service will use fallback
      console.log(
        '[AQELearningEngine] CoherenceService WASM unavailable, using fallback:',
        toErrorMessage(error)
      );
    }

    // Initialize PatternStore (always available)
    this.patternStore = createPatternStore(this.memory, {
      promotionThreshold: this.config.promotionThreshold,
    });
    await this.patternStore.initialize();

    // Initialize QEReasoningBank with CoherenceService for filtering
    this.reasoningBank = createQEReasoningBank(
      this.memory,
      this.eventBus,
      this.config.reasoningBank,
      this.coherenceService // Pass coherence service for coherence-gated retrieval
    );
    await this.reasoningBank.initialize();

    // Initialize ExperienceCaptureService (always available)
    if (this.config.enableExperienceCapture) {
      this.experienceCapture = createExperienceCaptureService(
        this.memory,
        this.patternStore,
        this.eventBus,
        {
          promotionThreshold: this.config.promotionThreshold,
        }
      );
      await this.experienceCapture.initialize();
    }

    // Try to initialize Claude Flow bridge (optional)
    if (this.config.enableClaudeFlow) {
      try {
        this.claudeFlowBridge = createClaudeFlowBridge({
          projectRoot: this.config.projectRoot,
        });
        await this.claudeFlowBridge.initialize();

        if (this.claudeFlowBridge.isAvailable()) {
          console.log('[AQELearningEngine] Claude Flow integration enabled');
        }
      } catch (error) {
        // Claude Flow not available - continue without it
        if (process.env.DEBUG) {
          console.log(
            '[AQELearningEngine] Claude Flow not available, using standalone mode:',
            toErrorMessage(error)
          );
        }
      }
    }

    this.initialized = true;
    console.log('[AQELearningEngine] Initialized');
  }

  // ==========================================================================
  // Status & Info
  // ==========================================================================

  /**
   * Get engine status
   */
  getStatus(): AQELearningEngineStatus {
    const cfStatus = this.claudeFlowBridge?.getStatus();

    return {
      initialized: this.initialized,
      claudeFlowAvailable: cfStatus?.available ?? false,
      features: {
        patternLearning: true, // Always available
        vectorSearch: true, // Always available (HNSW or hash fallback)
        taskRouting: true, // Always available
        trajectories: cfStatus?.features.trajectories ?? false,
        modelRouting: cfStatus?.features.modelRouting ?? false,
        pretrain: cfStatus?.features.pretrain ?? false,
      },
    };
  }

  /**
   * Get engine statistics
   */
  async getStats(): Promise<AQELearningEngineStats> {
    if (!this.initialized || !this.reasoningBank) {
      throw new Error('Engine not initialized');
    }

    const rbStats = await this.reasoningBank.getStats();
    const ecStats = this.experienceCapture
      ? await this.experienceCapture.getStats()
      : {
          totalExperiences: 0,
          byDomain: {} as Record<QEDomain, number>,
          successRate: 0,
          avgQuality: 0,
          patternsExtracted: 0,
          patternsPromoted: 0,
        };

    return {
      ...rbStats,
      activeTasks: this.activeTasks.size,
      completedTasks: this.completedTasks,
      claudeFlowStatus: this.claudeFlowBridge?.getStatus() ?? {
        available: false,
        features: {
          trajectories: false,
          modelRouting: false,
          pretrain: false,
          patternSearch: false,
        },
      },
      claudeFlowErrors: this.claudeFlowErrors,
      experienceCapture: ecStats,
    };
  }

  // ==========================================================================
  // Pattern Learning (Standalone)
  // ==========================================================================

  /**
   * Store a new pattern
   */
  async storePattern(options: CreateQEPatternOptions): Promise<Result<QEPattern>> {
    if (!this.initialized || !this.reasoningBank) {
      return err(new Error('Engine not initialized'));
    }

    return this.reasoningBank.storePattern(options);
  }

  /**
   * Search for patterns
   */
  async searchPatterns(
    query: string | number[],
    options?: PatternSearchOptions
  ): Promise<Result<PatternSearchResult[]>> {
    if (!this.initialized || !this.reasoningBank) {
      return err(new Error('Engine not initialized'));
    }

    return this.reasoningBank.searchPatterns(query, options);
  }

  /**
   * Get pattern by ID
   */
  async getPattern(id: string): Promise<QEPattern | null> {
    if (!this.initialized || !this.reasoningBank) {
      return null;
    }

    return this.reasoningBank.getPattern(id);
  }

  /**
   * Record pattern usage outcome
   */
  async recordOutcome(outcome: LearningOutcome): Promise<Result<void>> {
    if (!this.initialized || !this.reasoningBank) {
      return err(new Error('Engine not initialized'));
    }

    return this.reasoningBank.recordOutcome(outcome);
  }

  // ==========================================================================
  // Task Routing (Standalone with CF Enhancement)
  // ==========================================================================

  /**
   * Route a task to optimal agent
   *
   * When Claude Flow is available, combines local routing with CF patterns.
   * Searches for similar patterns and includes them as context in the routing result.
   */
  async routeTask(request: QERoutingRequest): Promise<Result<QERoutingResult>> {
    if (!this.initialized || !this.reasoningBank) {
      return err(new Error('Engine not initialized'));
    }

    // Search for similar patterns before routing (Phase 5.1 & 5.3)
    const patternSearchResult = await this.searchPatternsForTask(request.task, {
      limit: 5,
      minConfidence: 0.4,
      domain: request.domain,
    });

    // Track pattern usage for found patterns (Phase 5.4)
    if (patternSearchResult.success && patternSearchResult.value.length > 0) {
      await this.trackPatternSearch(request.task, patternSearchResult.value);
    }

    // Use local routing with pattern context
    const localResult = await this.reasoningBank.routeTask(request);

    // Enhance with Claude Flow if available
    if (
      localResult.success &&
      this.claudeFlowBridge?.pretrain.isClaudeFlowAvailable()
    ) {
      // Could enhance with pretrain patterns here
      // For now, just return local result
    }

    // Enhance routing result with pattern context (Phase 5.2)
    if (localResult.success && patternSearchResult.success) {
      const enhancedResult = this.enhanceRoutingWithPatterns(
        localResult.value,
        patternSearchResult.value
      );
      return ok(enhancedResult);
    }

    return localResult;
  }

  /**
   * Route a task (convenience method)
   */
  async route(task: string, context?: QERoutingRequest['context']): Promise<QERoutingResult | null> {
    const result = await this.routeTask({ task, context });
    return result.success ? result.value : null;
  }

  /**
   * Search for patterns relevant to a task
   *
   * @param task - Task description to search for
   * @param options - Search options
   * @returns Pattern search results
   */
  private async searchPatternsForTask(
    task: string,
    options: {
      limit?: number;
      minConfidence?: number;
      domain?: QEDomain;
    } = {}
  ): Promise<Result<PatternSearchResult[]>> {
    if (!this.reasoningBank) {
      return ok([]);
    }

    try {
      return await this.reasoningBank.searchPatterns(task, {
        limit: options.limit || 5,
        minConfidence: options.minConfidence || 0.4,
        domain: options.domain,
        useVectorSearch: true,
      });
    } catch (error) {
      console.warn(
        '[AQELearningEngine] Pattern search failed:',
        toErrorMessage(error)
      );
      return ok([]);
    }
  }

  /**
   * Track pattern searches for usage metrics (Phase 5.4)
   *
   * @param task - Task that triggered the search
   * @param results - Pattern search results
   */
  private async trackPatternSearch(
    task: string,
    results: PatternSearchResult[]
  ): Promise<void> {
    // Store pattern search event for metrics
    const searchEvent = {
      timestamp: Date.now(),
      task: task.slice(0, 500),
      patternsFound: results.length,
      patternIds: results.map(r => r.pattern.id),
      avgSimilarity: results.length > 0
        ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
        : 0,
    };

    try {
      // Store in memory backend for tracking
      const key = `pattern-usage:search:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await this.memory.set(key, searchEvent, {
        persist: true,
        ttl: 7 * 24 * 60 * 60 * 1000, // 7 days retention
      });
    } catch (error) {
      // Non-critical - don't fail if tracking fails
      console.debug(
        '[AQELearningEngine] Failed to track pattern search:',
        toErrorMessage(error)
      );
    }
  }

  /**
   * Enhance routing result with pattern context (Phase 5.2)
   *
   * Adds relevant patterns as actionable hints to the routing result.
   *
   * @param routingResult - Original routing result
   * @param patterns - Found patterns
   * @returns Enhanced routing result
   */
  private enhanceRoutingWithPatterns(
    routingResult: QERoutingResult,
    patterns: PatternSearchResult[]
  ): QERoutingResult {
    // Filter to high-quality patterns only
    const relevantPatterns = patterns.filter(
      p => p.similarity >= 0.5 && p.pattern.qualityScore >= 0.3
    );

    if (relevantPatterns.length === 0) {
      return routingResult;
    }

    // Generate pattern hints for agent prompts
    const patternHints = relevantPatterns.map(result => {
      const pattern = result.pattern;
      return `[Pattern: ${pattern.name}] ${pattern.description} (confidence: ${(pattern.confidence * 100).toFixed(0)}%, similarity: ${(result.similarity * 100).toFixed(0)}%)`;
    });

    // Add pattern-based guidance to existing guidance
    const enhancedGuidance = [
      ...routingResult.guidance,
      '--- Relevant Patterns ---',
      ...patternHints,
    ];

    // Include pattern objects in result for downstream use
    const enhancedPatterns = [
      ...routingResult.patterns,
      ...relevantPatterns.map(r => r.pattern),
    ];

    // Build enhanced reasoning
    const patternReasoning = relevantPatterns.length > 0
      ? `; Found ${relevantPatterns.length} relevant pattern(s) with avg similarity ${(relevantPatterns.reduce((sum, p) => sum + p.similarity, 0) / relevantPatterns.length * 100).toFixed(0)}%`
      : '';

    return {
      ...routingResult,
      patterns: enhancedPatterns,
      guidance: enhancedGuidance,
      reasoning: routingResult.reasoning + patternReasoning,
      // Boost confidence slightly when relevant patterns are found
      confidence: Math.min(1, routingResult.confidence + relevantPatterns.length * 0.02),
    };
  }

  // ==========================================================================
  // Model Routing (CF Enhanced)
  // ==========================================================================

  /**
   * Get recommended model for a task
   *
   * Uses Claude Flow 3-tier routing when available,
   * falls back to rule-based routing.
   */
  async recommendModel(task: string): Promise<ModelRoutingResult> {
    // Try Claude Flow model routing
    if (this.claudeFlowBridge?.modelRouter.isClaudeFlowAvailable()) {
      try {
        return await this.claudeFlowBridge.modelRouter.routeTask(task);
      } catch (error) {
        // Non-critical: Claude Flow routing failed, using local fallback
        console.debug('[AQELearningEngine] Claude Flow model routing failed:', error instanceof Error ? error.message : error);
      }
    }

    // Local rule-based routing (fallback)
    return this.localModelRoute(task);
  }

  /**
   * Record model routing outcome
   */
  async recordModelOutcome(
    task: string,
    model: 'haiku' | 'sonnet' | 'opus',
    outcome: 'success' | 'failure' | 'escalated'
  ): Promise<void> {
    if (this.claudeFlowBridge?.modelRouter.isClaudeFlowAvailable()) {
      await this.claudeFlowBridge.modelRouter.recordOutcome({ task, model, outcome });
    }
  }

  /**
   * Local rule-based model routing
   */
  private localModelRoute(task: string): ModelRoutingResult {
    const taskLower = task.toLowerCase();

    // Low complexity → Haiku
    const lowComplexity = [
      /simple/i, /basic/i, /fix typo/i, /rename/i, /format/i,
      /add comment/i, /lint/i, /minor/i, /quick/i, /small/i,
    ];

    for (const pattern of lowComplexity) {
      if (pattern.test(taskLower)) {
        return {
          model: 'haiku',
          confidence: 0.75,
          reasoning: 'Low complexity task - using haiku for speed',
        };
      }
    }

    // High complexity → Opus
    const highComplexity = [
      /architect/i, /design/i, /complex/i, /security/i, /performance/i,
      /refactor.*large/i, /critical/i, /analysis/i, /multi.*file/i,
      /distributed/i, /concurrent/i, /migration/i,
    ];

    for (const pattern of highComplexity) {
      if (pattern.test(taskLower)) {
        return {
          model: 'opus',
          confidence: 0.8,
          reasoning: 'High complexity task - using opus for capability',
        };
      }
    }

    // Task length heuristic
    if (task.length > 500) {
      return {
        model: 'opus',
        confidence: 0.65,
        reasoning: 'Long task description - using opus for complex reasoning',
      };
    }

    if (task.length < 50) {
      return {
        model: 'haiku',
        confidence: 0.6,
        reasoning: 'Short task - using haiku for efficiency',
      };
    }

    // Default → Sonnet
    return {
      model: 'sonnet',
      confidence: 0.7,
      reasoning: 'Medium complexity - using sonnet for balance',
    };
  }

  // ==========================================================================
  // Task Tracking (CF Enhanced with SONA)
  // ==========================================================================

  /**
   * Start tracking a task execution
   *
   * When Claude Flow is available, creates a SONA trajectory.
   * Also starts experience capture for pattern learning.
   */
  async startTask(task: string, agent?: string, domain?: QEDomain): Promise<string> {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Try to start SONA trajectory
    let trajectoryId = id;
    if (this.claudeFlowBridge?.trajectory.isClaudeFlowAvailable()) {
      try {
        trajectoryId = await this.claudeFlowBridge.trajectory.startTrajectory(task, agent);
      } catch (error) {
        this.claudeFlowErrors++;
        console.warn(
          `[AQELearningEngine] Claude Flow startTrajectory failed (${this.claudeFlowErrors} total errors):`,
          toErrorMessage(error)
        );
        // Fall through to local tracking
      }
    }

    // Start experience capture (linked to trajectory if available)
    let experienceId: string | undefined;
    if (this.experienceCapture) {
      experienceId = this.experienceCapture.startCapture(task, {
        agent,
        domain,
        trajectoryId: trajectoryId !== id ? trajectoryId : undefined,
      });
    }

    // Local tracking
    const execution: TaskExecution = {
      id: experienceId || trajectoryId,
      task,
      agent,
      startedAt: Date.now(),
      steps: [],
    };

    this.activeTasks.set(execution.id, execution);

    return execution.id;
  }

  /**
   * Record a step in task execution
   */
  async recordStep(
    taskId: string,
    action: string,
    result?: string,
    quality?: number
  ): Promise<void> {
    // Try SONA trajectory step
    if (this.claudeFlowBridge?.trajectory.isClaudeFlowAvailable()) {
      try {
        await this.claudeFlowBridge.trajectory.recordStep(taskId, action, result, quality);
      } catch (error) {
        this.claudeFlowErrors++;
        console.warn(
          `[AQELearningEngine] Claude Flow recordStep failed (${this.claudeFlowErrors} total errors):`,
          toErrorMessage(error)
        );
        // Continue with local tracking
      }
    }

    // Record in experience capture
    if (this.experienceCapture) {
      this.experienceCapture.recordStep(taskId, {
        action,
        result,
        quality,
      });
    }

    // Local tracking
    const execution = this.activeTasks.get(taskId);
    if (execution) {
      execution.steps.push({
        action,
        result,
        quality,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * End task tracking
   */
  async endTask(
    taskId: string,
    success: boolean,
    feedback?: string
  ): Promise<TaskExecution | undefined> {
    // Try to end SONA trajectory
    if (this.claudeFlowBridge?.trajectory.isClaudeFlowAvailable()) {
      try {
        await this.claudeFlowBridge.trajectory.endTrajectory(taskId, success, feedback);
      } catch (error) {
        this.claudeFlowErrors++;
        console.warn(
          `[AQELearningEngine] Claude Flow endTrajectory failed (${this.claudeFlowErrors} total errors):`,
          toErrorMessage(error)
        );
        // Continue with local completion
      }
    }

    // Complete local tracking
    const execution = this.activeTasks.get(taskId);
    if (execution) {
      this.activeTasks.delete(taskId);
      this.completedTasks++;

      // Experience capture for pattern learning
      if (this.config.enableExperienceCapture && success) {
        await this.captureExperience(execution);
      }

      return execution;
    }

    return undefined;
  }

  /**
   * Get active task
   */
  getTask(taskId: string): TaskExecution | undefined {
    return this.activeTasks.get(taskId);
  }

  // ==========================================================================
  // Codebase Analysis (CF Enhanced)
  // ==========================================================================

  /**
   * Analyze codebase for optimal configuration
   *
   * Uses Claude Flow pretrain when available.
   */
  async analyzeCodebase(
    path?: string,
    depth: 'shallow' | 'medium' | 'deep' = 'medium'
  ): Promise<PretrainResult> {
    const targetPath = path || this.config.projectRoot;

    // Try Claude Flow pretrain
    if (this.claudeFlowBridge?.pretrain.isClaudeFlowAvailable()) {
      try {
        return await this.claudeFlowBridge.pretrain.analyze(targetPath, depth);
      } catch (error) {
        // Non-critical: Claude Flow pretrain failed, using local analysis
        console.debug('[AQELearningEngine] Claude Flow pretrain analyze failed:', error instanceof Error ? error.message : error);
      }
    }

    // Local analysis (always available)
    return this.localAnalyze(targetPath, depth);
  }

  /**
   * Generate agent configurations
   */
  async generateAgentConfigs(format: 'yaml' | 'json' = 'yaml'): Promise<Record<string, unknown>[]> {
    // Try Claude Flow
    if (this.claudeFlowBridge?.pretrain.isClaudeFlowAvailable()) {
      try {
        return await this.claudeFlowBridge.pretrain.generateAgentConfigs(format);
      } catch (error) {
        // Non-critical: Claude Flow agent config generation failed
        console.debug('[AQELearningEngine] Claude Flow agent config failed:', error instanceof Error ? error.message : error);
      }
    }

    // Return default QE agents
    return [
      {
        name: 'qe-test-architect',
        type: 'worker',
        capabilities: ['test-generation', 'test-design'],
        model: 'sonnet',
      },
      {
        name: 'qe-coverage-specialist',
        type: 'worker',
        capabilities: ['coverage-analysis', 'gap-detection'],
        model: 'haiku',
      },
      {
        name: 'qe-security-scanner',
        type: 'worker',
        capabilities: ['security-scanning', 'vulnerability-detection'],
        model: 'opus',
      },
    ];
  }

  // ==========================================================================
  // Experience Capture (Pattern Learning)
  // ==========================================================================

  /**
   * Capture experience from completed task
   *
   * Uses ExperienceCaptureService for comprehensive experience tracking
   * with pattern extraction and promotion.
   */
  private async captureExperience(execution: TaskExecution): Promise<void> {
    if (!this.experienceCapture || !this.config.enableExperienceCapture) return;

    // Calculate average quality from steps
    const avgQuality =
      execution.steps.length > 0
        ? execution.steps.reduce((sum, s) => sum + (s.quality ?? 0.5), 0) / execution.steps.length
        : 0.5;

    // Complete capture using ExperienceCaptureService
    // This handles pattern extraction and promotion automatically
    await this.experienceCapture.completeCapture(execution.id, {
      success: true,
      quality: avgQuality,
    });

    // Also share across domains if quality is high
    const experience = await this.experienceCapture.getExperience(execution.id);
    if (experience && experience.quality >= 0.7) {
      await this.experienceCapture.shareAcrossDomains(experience);
    }
  }

  /**
   * Start experience capture for a task
   *
   * Called automatically by startTask but can be used directly
   * for more control over the capture process.
   */
  startExperienceCapture(
    task: string,
    options?: {
      agent?: string;
      domain?: QEDomain;
      model?: 'haiku' | 'sonnet' | 'opus';
      trajectoryId?: string;
    }
  ): string | undefined {
    if (!this.experienceCapture) return undefined;

    return this.experienceCapture.startCapture(task, options);
  }

  /**
   * Get experience capture service (for advanced usage)
   */
  getExperienceCaptureService(): ExperienceCaptureService | undefined {
    return this.experienceCapture;
  }

  /**
   * Local codebase analysis
   */
  private async localAnalyze(
    targetPath: string,
    depth: 'shallow' | 'medium' | 'deep'
  ): Promise<PretrainResult> {
    try {
      const glob = await import('fast-glob');
      const { existsSync, readFileSync } = await import('fs');
      const { join } = await import('path');

      // Scan patterns based on depth
      const patterns = depth === 'shallow'
        ? ['*.ts', '*.js', '*.json']
        : depth === 'medium'
        ? ['**/*.ts', '**/*.js', '**/*.json', '**/*.py']
        : ['**/*'];

      const ignore = ['node_modules/**', 'dist/**', 'coverage/**', '.git/**'];

      const files = await glob.default(patterns, {
        cwd: targetPath,
        ignore,
        onlyFiles: true,
      });

      // Detect languages and frameworks
      const languages = new Set<string>();
      const frameworks = new Set<string>();

      for (const file of files.slice(0, 100)) {
        if (file.endsWith('.ts') || file.endsWith('.tsx')) languages.add('typescript');
        if (file.endsWith('.js') || file.endsWith('.jsx')) languages.add('javascript');
        if (file.endsWith('.py')) languages.add('python');
        if (file.endsWith('.go')) languages.add('go');
        if (file.endsWith('.rs')) languages.add('rust');
      }

      // Check package.json for frameworks
      const packageJsonPath = join(targetPath, 'package.json');
      if (existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };

          if (deps.react) frameworks.add('react');
          if (deps.vue) frameworks.add('vue');
          if (deps.vitest) frameworks.add('vitest');
          if (deps.jest) frameworks.add('jest');
          if (deps.playwright) frameworks.add('playwright');
        } catch (error) {
          // Non-critical: package.json parse errors during analysis
          console.debug('[AQELearningEngine] package.json parse failed:', error instanceof Error ? error.message : error);
        }
      }

      return {
        success: true,
        repositoryPath: targetPath,
        depth,
        analysis: {
          languages: Array.from(languages),
          frameworks: Array.from(frameworks),
          patterns: [],
          complexity: files.length > 500 ? 3 : files.length > 100 ? 2 : 1,
        },
      };
    } catch (error) {
      return {
        success: false,
        repositoryPath: targetPath,
        depth,
        error: toErrorMessage(error),
      };
    }
  }

  // ==========================================================================
  // Guidance (Standalone)
  // ==========================================================================

  /**
   * Get QE guidance for a domain
   */
  getGuidance(domain: QEDomain, context?: Parameters<QEReasoningBank['getGuidance']>[1]) {
    if (!this.reasoningBank) {
      throw new Error('Engine not initialized');
    }
    return this.reasoningBank.getGuidance(domain, context);
  }

  /**
   * Generate guidance context for Claude
   */
  generateContext(domain: QEDomain, context?: Parameters<QEReasoningBank['generateContext']>[1]): string {
    if (!this.reasoningBank) {
      throw new Error('Engine not initialized');
    }
    return this.reasoningBank.generateContext(domain, context);
  }

  /**
   * Check for anti-patterns
   */
  checkAntiPatterns(domain: QEDomain, content: string) {
    if (!this.reasoningBank) {
      throw new Error('Engine not initialized');
    }
    return this.reasoningBank.checkAntiPatterns(domain, content);
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Dispose the engine
   */
  async dispose(): Promise<void> {
    if (this.experienceCapture) {
      await this.experienceCapture.dispose();
    }
    if (this.patternStore) {
      await this.patternStore.dispose();
    }
    if (this.reasoningBank) {
      await this.reasoningBank.dispose();
    }
    this.activeTasks.clear();
    this.initialized = false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create AQE Learning Engine
 *
 * @example
 * ```typescript
 * const engine = createAQELearningEngine(memory, {
 *   projectRoot: process.cwd(),
 * });
 * await engine.initialize();
 * ```
 */
export function createAQELearningEngine(
  memory: MemoryBackend,
  config: AQELearningEngineConfig,
  eventBus?: EventBus
): AQELearningEngine {
  return new AQELearningEngine(memory, config, eventBus);
}

/**
 * Create AQE Learning Engine with defaults
 */
export function createDefaultLearningEngine(
  memory: MemoryBackend,
  projectRoot: string,
  eventBus?: EventBus
): AQELearningEngine {
  return createAQELearningEngine(memory, { projectRoot }, eventBus);
}
