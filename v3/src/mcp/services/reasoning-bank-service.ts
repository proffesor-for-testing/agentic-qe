/**
 * Agentic QE v3 - ReasoningBank Service
 * ADR-051: Provides ReasoningBank integration for MCP task handlers
 *
 * This service bridges the RealQEReasoningBank with MCP task execution,
 * enabling learning from task outcomes and intelligent routing.
 */

import {
  RealQEReasoningBank,
  createRealQEReasoningBank,
  type RealQEReasoningBankConfig,
  type RealQERoutingRequest,
  type RealQERoutingResult,
  type LearningOutcome,
  type RealQEReasoningBankStats,
} from '../../learning/real-qe-reasoning-bank';
import type { QEPattern, QEDomain } from '../../learning/qe-patterns';

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
 * ReasoningBank service configuration
 */
export interface ReasoningBankServiceConfig {
  /** Enable learning from outcomes */
  enableLearning: boolean;
  /** Enable intelligent routing */
  enableRouting: boolean;
  /** Enable pattern guidance */
  enableGuidance: boolean;
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
  minQualityThreshold: 0.6,
};

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * ReasoningBank Service
 *
 * Provides learning and routing capabilities for MCP task execution.
 * Integrates with RealQEReasoningBank for HNSW-indexed pattern storage.
 */
export class ReasoningBankService {
  private static instance: ReasoningBankService | null = null;
  private static initPromise: Promise<ReasoningBankService> | null = null;

  private readonly config: ReasoningBankServiceConfig;
  private readonly reasoningBank: RealQEReasoningBank;
  private disposed = false;

  // Metrics tracking
  private tasksRecorded = 0;
  private successfulTasks = 0;
  private failedTasks = 0;
  private patternsStored = 0;
  private routingRequests = 0;

  private constructor(
    config: ReasoningBankServiceConfig,
    reasoningBank: RealQEReasoningBank
  ) {
    this.config = config;
    this.reasoningBank = reasoningBank;
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

    const reasoningBank = createRealQEReasoningBank({
      enableLearning: fullConfig.enableLearning,
      enableRouting: fullConfig.enableRouting,
      enableGuidance: fullConfig.enableGuidance,
    });

    await reasoningBank.initialize();

    console.error('[ReasoningBankService] Initialized with HNSW index');
    return new ReasoningBankService(fullConfig, reasoningBank);
  }

  /**
   * Record a task outcome for learning
   *
   * This is called after task execution to learn from the outcome.
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

      await this.reasoningBank.recordOutcome(learningOutcome);

      // If high quality, store as a pattern
      if (
        outcome.success &&
        (outcome.qualityScore || 0.5) >= this.config.minQualityThreshold
      ) {
        await this.storeTaskPattern(outcome);
        this.patternsStored++;
      }

      console.error(
        `[ReasoningBankService] Recorded outcome: task=${outcome.taskId} ` +
          `success=${outcome.success} quality=${outcome.qualityScore?.toFixed(2) || 'N/A'}`
      );
    } catch (error) {
      console.error('[ReasoningBankService] Failed to record outcome:', error);
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
      ].filter((t): t is string => t !== undefined);

      await this.reasoningBank.storeQEPattern({
        patternType: 'test-template',
        name: `${outcome.taskType}-${outcome.domain || 'general'}`,
        description: outcome.task,
        template: {
          type: 'workflow',
          content: JSON.stringify({
            approach: outcome.task,
            metrics: outcome.metrics,
            executionTimeMs: outcome.executionTimeMs,
          }),
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

  /**
   * Get routing recommendation for a task
   *
   * Uses pattern similarity to recommend the best agent and approach.
   */
  async getRoutingRecommendation(
    request: RealQERoutingRequest
  ): Promise<RealQERoutingResult> {
    if (!this.config.enableRouting || this.disposed) {
      return this.createFallbackRouting(request);
    }

    this.routingRequests++;

    try {
      const result = await this.reasoningBank.routeTask(request);

      if (!result.success) {
        console.error('[ReasoningBankService] Routing returned error:', result.error);
        return this.createFallbackRouting(request);
      }

      console.error(
        `[ReasoningBankService] Routing: task="${request.task.slice(0, 50)}..." ` +
          `→ agent=${result.value.recommendedAgent} confidence=${result.value.confidence.toFixed(2)}`
      );

      return result.value;
    } catch (error) {
      console.error('[ReasoningBankService] Routing failed:', error);
      return this.createFallbackRouting(request);
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
      const result = await this.reasoningBank.routeTask({
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
      const results = await this.reasoningBank.searchQEPatterns(query, {
        limit: options?.limit || 10,
        domain: options?.domain,
      });
      if (!results.success) {
        console.error('[ReasoningBankService] Search returned error:', results.error);
        return [];
      }
      return results.value.map((r) => r.pattern);
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
    };
    reasoningBank: RealQEReasoningBankStats;
  }> {
    const bankStats = await this.reasoningBank.getQEStats();

    return {
      service: {
        tasksRecorded: this.tasksRecorded,
        successfulTasks: this.successfulTasks,
        failedTasks: this.failedTasks,
        successRate:
          this.tasksRecorded > 0 ? this.successfulTasks / this.tasksRecorded : 0,
        patternsStored: this.patternsStored,
        routingRequests: this.routingRequests,
      },
      reasoningBank: bankStats,
    };
  }

  /**
   * Create fallback routing when service unavailable
   */
  private createFallbackRouting(request: RealQERoutingRequest): RealQERoutingResult {
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
    await this.reasoningBank.dispose();
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
): Promise<RealQERoutingResult> {
  const service = await getReasoningBankService();
  return service.getRoutingRecommendation(request);
}
