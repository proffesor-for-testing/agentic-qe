/**
 * Task Completed Hook
 * ADR-064: TaskCompleted Hook with Pattern Training (Phase 1C)
 *
 * Fires when an agent finishes a task. Validates quality gates
 * and trains patterns from successful work.
 *
 * @module task-completed-hook
 */

import type {
  QualityGateConfig,
  QualityGateResult,
  TaskResult,
  TaskMetrics,
} from './quality-gate-enforcer.js';
import { toErrorMessage } from '../shared/error-utils.js';
import {
  QualityGateEnforcer,
  DEFAULT_QUALITY_GATE_CONFIG,
} from './quality-gate-enforcer.js';

// Re-export shared types so consumers can import from a single module
export type { TaskResult, TaskMetrics, QualityGateConfig, QualityGateResult };

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the TaskCompleted hook
 */
export interface TaskCompletedHookConfig {
  /** Train patterns from completed work */
  readonly trainPatterns: boolean;
  /** Quality gate configuration */
  readonly qualityGate: QualityGateConfig;
  /** Domains to extract patterns from */
  readonly patternDomains: string[];
  /** Emit events on completion */
  readonly emitEvents: boolean;
  /** Maximum patterns to extract per task */
  readonly maxPatternsPerTask: number;
}

/**
 * An extracted pattern from a completed task
 */
export interface ExtractedPattern {
  readonly domain: string;
  readonly type: string;
  readonly content: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

/**
 * Abstraction over pattern storage to allow dependency injection
 */
export interface PatternStore {
  /** Store a pattern and return its ID */
  store(pattern: ExtractedPattern): Promise<string>;
  /** Record whether a stored pattern led to a successful outcome */
  recordOutcome(patternId: string, success: boolean): Promise<void>;
}

/**
 * Action returned when a task is accepted
 */
export interface AcceptAction {
  readonly action: 'accept';
  readonly patternsExtracted: number;
}

/**
 * Action returned when a task is rejected
 */
export interface RejectAction {
  readonly action: 'reject';
  readonly exitCode: 2;
  readonly reason: string;
  readonly gateResult: QualityGateResult;
}

/** Union type for the result of processing a completed task */
export type CompletionAction = AcceptAction | RejectAction;

/**
 * Handler signature for completion event callbacks
 */
export type CompletionHandler = (taskId: string, action: CompletionAction) => void;

/**
 * Aggregate statistics tracked by the hook
 */
export interface TaskCompletedStats {
  readonly totalProcessed: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly patternsExtracted: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration for TaskCompletedHook
 */
export const DEFAULT_TASK_COMPLETED_HOOK_CONFIG: TaskCompletedHookConfig = {
  trainPatterns: true,
  qualityGate: DEFAULT_QUALITY_GATE_CONFIG,
  patternDomains: [
    'test-generation',
    'coverage-analysis',
    'security-compliance',
    'quality-assessment',
    'defect-intelligence',
    'contract-testing',
  ],
  emitEvents: true,
  maxPatternsPerTask: 5,
};

// ============================================================================
// Pattern extraction helpers (domain-specific)
// ============================================================================

/** Domain-specific pattern extraction strategy */
interface ExtractionStrategy {
  readonly types: string[];
  readonly contentKeys: string[];
  readonly baseConfidence: number;
}

/** Mapping from task domain to pattern extraction strategies */
const EXTRACTION_STRATEGIES: Record<string, ExtractionStrategy> = {
  'test-generation':    { types: ['test-template', 'assertion-pattern', 'mock-pattern'], contentKeys: ['testCode', 'template', 'assertions', 'mocks'], baseConfidence: 0.6 },
  'coverage-analysis':  { types: ['coverage-strategy', 'mutation-strategy'], contentKeys: ['coverageReport', 'gaps', 'strategy', 'recommendations'], baseConfidence: 0.55 },
  'security-compliance':{ types: ['security-pattern', 'vulnerability-fix'], contentKeys: ['findings', 'fixes', 'recommendations', 'rules'], baseConfidence: 0.5 },
  'quality-assessment': { types: ['quality-rule', 'threshold-pattern'], contentKeys: ['rules', 'thresholds', 'assessments'], baseConfidence: 0.5 },
  'defect-intelligence':{ types: ['defect-pattern', 'root-cause'], contentKeys: ['rootCause', 'pattern', 'prediction', 'analysis'], baseConfidence: 0.45 },
  'contract-testing':   { types: ['api-contract', 'schema-pattern'], contentKeys: ['contract', 'schema', 'endpoints', 'violations'], baseConfidence: 0.55 },
  'test-execution':     { types: ['flaky-fix', 'retry-strategy'], contentKeys: ['flakyTests', 'retryPolicy', 'stabilization'], baseConfidence: 0.5 },
  'visual-accessibility':{ types: ['visual-baseline', 'a11y-check'], contentKeys: ['baseline', 'violations', 'wcagResults'], baseConfidence: 0.5 },
  'chaos-resilience':   { types: ['perf-benchmark', 'resilience-pattern'], contentKeys: ['benchmark', 'faultInjection', 'recoveryTime'], baseConfidence: 0.45 },
};

// ============================================================================
// TaskCompletedHook
// ============================================================================

/**
 * Hook that fires when an agent finishes a task.
 *
 * Responsibilities:
 * 1. Validate quality gates on the task result
 * 2. Extract reusable patterns from successful work
 * 3. Store patterns via the injected PatternStore
 * 4. Emit completion events for downstream consumers
 */
export class TaskCompletedHook {
  private readonly config: TaskCompletedHookConfig;
  private readonly gateEnforcer: QualityGateEnforcer;
  private readonly patternStore: PatternStore | null;
  private readonly completionHandlers: Set<CompletionHandler> = new Set();

  // Statistics
  private stats = {
    totalProcessed: 0,
    accepted: 0,
    rejected: 0,
    patternsExtracted: 0,
  };

  constructor(
    config: Partial<TaskCompletedHookConfig> = {},
    patternStore?: PatternStore
  ) {
    this.config = { ...DEFAULT_TASK_COMPLETED_HOOK_CONFIG, ...config };

    // Merge qualityGate if partially provided
    if (config.qualityGate) {
      this.config = {
        ...this.config,
        qualityGate: { ...DEFAULT_QUALITY_GATE_CONFIG, ...config.qualityGate },
      };
    }

    this.gateEnforcer = new QualityGateEnforcer(this.config.qualityGate);
    this.patternStore = patternStore ?? null;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Process a completed task through quality gates and pattern extraction.
   *
   * Flow:
   * 1. Evaluate quality gates
   * 2. If failed and rejectOnFailure -> reject with exit code 2
   * 3. If passed and trainPatterns -> extract and store patterns
   * 4. Emit completion event
   * 5. Return the action taken
   *
   * @param result - The completed task result
   * @returns The action taken (accept or reject)
   */
  async onTaskCompleted(result: TaskResult): Promise<CompletionAction> {
    this.stats.totalProcessed++;

    console.log(
      `[TaskCompletedHook] Processing task ${result.taskId} ` +
      `(agent=${result.agentId}, domain=${result.domain}, status=${result.status})`
    );

    // Step 1: Run quality gate evaluation
    const gateResult = this.gateEnforcer.evaluate(result);

    // Step 2: Handle rejection
    if (!gateResult.passed && this.config.qualityGate.rejectOnFailure) {
      this.stats.rejected++;

      const rejectAction: RejectAction = {
        action: 'reject',
        exitCode: 2,
        reason: gateResult.reason || 'Quality gate check failed',
        gateResult,
      };

      console.log(
        `[TaskCompletedHook] Task ${result.taskId} REJECTED: ${rejectAction.reason}`
      );

      this.emitCompletion(result.taskId, rejectAction);
      return rejectAction;
    }

    // Step 3: Extract and store patterns from successful work
    let patternsExtracted = 0;

    if (this.config.trainPatterns && this.patternStore) {
      const patterns = this.extractPatterns(result);
      patternsExtracted = await this.storePatterns(patterns, result);
      this.stats.patternsExtracted += patternsExtracted;
    }

    // Step 4: Build accept action
    this.stats.accepted++;

    const acceptAction: AcceptAction = {
      action: 'accept',
      patternsExtracted,
    };

    console.log(
      `[TaskCompletedHook] Task ${result.taskId} ACCEPTED ` +
      `(score=${gateResult.score.toFixed(3)}, patterns=${patternsExtracted})`
    );

    this.emitCompletion(result.taskId, acceptAction);
    return acceptAction;
  }

  /**
   * Extract reusable patterns from a completed task result.
   *
   * Extraction strategy is determined by the task domain and type:
   * - test-generation: test templates, assertion patterns, mock patterns
   * - coverage-analysis: coverage strategies, mutation strategies
   * - security-compliance: security patterns, vulnerability fixes
   * - And other domain-specific strategies
   *
   * Confidence is based on the quality of task metrics.
   *
   * @param result - The task result to extract patterns from
   * @returns Array of extracted patterns (limited by maxPatternsPerTask)
   */
  extractPatterns(result: TaskResult): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];
    const domain = result.domain;

    // Only extract from configured domains
    if (!this.config.patternDomains.includes(domain)) {
      return patterns;
    }

    const strategy = EXTRACTION_STRATEGIES[domain];
    if (!strategy) {
      // Fallback: extract a generic pattern from the output
      return this.extractGenericPatterns(result);
    }

    // Calculate confidence boost from metrics
    const confidenceBoost = this.computeConfidenceBoost(result.metrics);

    // Extract patterns based on domain strategy
    for (const patternType of strategy.types) {
      if (patterns.length >= this.config.maxPatternsPerTask) break;

      for (const key of strategy.contentKeys) {
        if (patterns.length >= this.config.maxPatternsPerTask) break;

        const content = result.output[key];
        if (content === undefined || content === null) continue;

        const contentStr = typeof content === 'string'
          ? content
          : JSON.stringify(content);

        // Skip empty or trivially small content
        if (contentStr.length < 10) continue;

        const confidence = Math.min(
          1.0,
          strategy.baseConfidence + confidenceBoost
        );

        patterns.push({
          domain,
          type: patternType,
          content: contentStr,
          confidence,
          metadata: {
            sourceTaskId: result.taskId,
            sourceAgent: result.agentId,
            taskType: result.type,
            duration: result.duration,
            extractedFrom: key,
            timestamp: result.timestamp,
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Register a callback that fires whenever a task completion is processed.
   *
   * @param handler - Callback receiving the taskId and the action taken
   */
  onCompletion(handler: CompletionHandler): void {
    this.completionHandlers.add(handler);
  }

  /**
   * Remove a previously registered completion handler.
   *
   * @param handler - The handler to remove
   */
  offCompletion(handler: CompletionHandler): void {
    this.completionHandlers.delete(handler);
  }

  /**
   * Get aggregate statistics for all tasks processed by this hook instance.
   *
   * @returns Statistics snapshot
   */
  getStats(): TaskCompletedStats {
    return { ...this.stats };
  }

  /**
   * Reset all internal statistics to zero.
   */
  resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      accepted: 0,
      rejected: 0,
      patternsExtracted: 0,
    };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Store extracted patterns via the pattern store and record outcomes.
   *
   * @returns The number of patterns successfully stored
   */
  private async storePatterns(
    patterns: ExtractedPattern[],
    result: TaskResult
  ): Promise<number> {
    if (!this.patternStore || patterns.length === 0) return 0;

    let stored = 0;

    for (const pattern of patterns) {
      try {
        const patternId = await this.patternStore.store(pattern);
        // Record that this pattern came from a successful (accepted) task
        const isSuccess = result.status === 'completed';
        await this.patternStore.recordOutcome(patternId, isSuccess);
        stored++;
      } catch (error) {
        console.error(
          `[TaskCompletedHook] Failed to store pattern: ${toErrorMessage(error)}`
        );
      }
    }

    if (stored > 0) {
      console.log(
        `[TaskCompletedHook] Stored ${stored}/${patterns.length} patterns from task ${result.taskId}`
      );
    }

    return stored;
  }

  /** Extract generic patterns when no domain-specific strategy is available */
  private extractGenericPatterns(result: TaskResult): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];
    for (const [key, value] of Object.entries(result.output)) {
      if (patterns.length >= this.config.maxPatternsPerTask) break;
      if (value === undefined || value === null) continue;
      const contentStr = typeof value === 'string' ? value : JSON.stringify(value);
      if (contentStr.length < 10) continue;
      patterns.push({
        domain: result.domain, type: 'generic', content: contentStr,
        confidence: 0.3 + this.computeConfidenceBoost(result.metrics),
        metadata: {
          sourceTaskId: result.taskId, sourceAgent: result.agentId,
          taskType: result.type, extractedFrom: key, timestamp: result.timestamp,
        },
      });
    }
    return patterns;
  }

  /**
   * Compute a confidence boost (0 to 0.4) based on task metrics quality.
   * Higher test pass rates, positive coverage, and zero security issues boost confidence.
   */
  private computeConfidenceBoost(metrics: TaskMetrics): number {
    let boost = 0;
    const passed = metrics.testsPassed ?? 0;
    const failed = metrics.testsFailed ?? 0;
    const total = passed + failed;
    if (total > 0) boost += (passed / total) * 0.15;
    if (metrics.coverageChange !== undefined && metrics.coverageChange > 0) {
      boost += Math.min(0.1, metrics.coverageChange * 0.5);
    }
    if (metrics.securityIssues !== undefined && metrics.securityIssues === 0) boost += 0.1;
    if (metrics.performanceMs !== undefined && metrics.performanceMs < 5000) boost += 0.05;
    return Math.min(0.4, boost);
  }

  /**
   * Emit completion event to all registered handlers.
   */
  private emitCompletion(taskId: string, action: CompletionAction): void {
    if (!this.config.emitEvents) return;

    for (const handler of this.completionHandlers) {
      try {
        handler(taskId, action);
      } catch (error) {
        console.error(
          `[TaskCompletedHook] Completion handler error: ${toErrorMessage(error)}`
        );
      }
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a TaskCompletedHook with optional configuration and pattern store.
 *
 * @param config - Partial configuration to merge with defaults
 * @param patternStore - Optional pattern store for persisting extracted patterns
 * @returns A new TaskCompletedHook instance
 */
export function createTaskCompletedHook(
  config?: Partial<TaskCompletedHookConfig>,
  patternStore?: PatternStore
): TaskCompletedHook {
  return new TaskCompletedHook(config, patternStore);
}
