/**
 * Agentic QE v3 - Consensus Engine Implementation
 * MM-006: Multi-model consensus verification engine
 *
 * Orchestrates multiple model providers to verify security findings,
 * improving detection accuracy by requiring consensus among models.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import { randomUUID } from 'crypto';
import {
  ConsensusEngine,
  ConsensusEngineConfig,
  ConsensusResult,
  ConsensusStats,
  ConsensusVerdict,
  SecurityFinding,
  VerificationOptions,
  ModelProvider,
  ModelVote,
  DEFAULT_CONSENSUS_CONFIG,
} from './interfaces';
import {
  buildVerificationPrompt,
  parseVerificationResponse,
  buildModelVote,
  ModelProviderRegistry,
} from './model-provider';
import { Result, ok, err, Severity } from '../../shared/types';
import { toErrorMessage, toError } from '../../shared/error-utils.js';
import {
  ConsensusStrategyType,
  MajorityStrategy,
  WeightedStrategy,
  UnanimousStrategy,
  createStrategy,
} from './strategies';

// ============================================================================
// ConsensusEngine Implementation
// ============================================================================

/**
 * Multi-model consensus engine for security verification
 *
 * Orchestrates multiple model providers to verify security findings,
 * applying configurable consensus strategies to determine final verdicts.
 *
 * @example
 * ```typescript
 * const registry = createProviderRegistry([claudeProvider, gptProvider]);
 * const engine = new ConsensusEngineImpl(registry, {
 *   defaultThreshold: 2/3,
 *   minModels: 2,
 *   verifySeverities: ['critical', 'high'],
 * });
 *
 * const result = await engine.verify(securityFinding);
 * if (result.success && result.value.verdict === 'verified') {
 *   // Finding is valid, take action
 * }
 * ```
 */
export class ConsensusEngineImpl implements ConsensusEngine {
  private readonly registry: ModelProviderRegistry;
  private config: ConsensusEngineConfig;
  private strategy: MajorityStrategy | WeightedStrategy | UnanimousStrategy;
  private stats: {
    totalVerifications: number;
    byVerdict: Record<ConsensusVerdict, number>;
    averageConfidence: number;
    averageExecutionTime: number;
    totalCost: number;
    humanReviewCount: number;
    modelStats: Record<string, {
      votes: number;
      agreements: number;
      averageConfidence: number;
      averageExecutionTime: number;
      errors: number;
    }>;
  };
  private disposed: boolean = false;

  /**
   * Create a new consensus engine
   *
   * @param registry - Model provider registry
   * @param config - Optional engine configuration
   * @param strategyType - Consensus strategy type (default: 'majority')
   */
  constructor(
    registry: ModelProviderRegistry,
    config: Partial<ConsensusEngineConfig> = {},
    strategyType: ConsensusStrategyType = 'majority'
  ) {
    this.registry = registry;
    this.config = { ...DEFAULT_CONSENSUS_CONFIG, ...config };
    this.strategy = this.createStrategyFromConfig(strategyType);
    this.stats = this.initializeStats();
  }

  /**
   * Verify a security finding using multiple models
   *
   * @param finding - The security finding to verify
   * @param options - Optional verification configuration
   * @returns Promise resolving to consensus result
   */
  async verify(
    finding: SecurityFinding,
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult, Error>> {
    if (this.disposed) {
      return err(new Error('ConsensusEngine has been disposed'));
    }

    const correlationId = options?.correlationId || finding.correlationId || this.generateCorrelationId();
    const startTime = Date.now();

    try {
      // Check if verification is required
      if (!this.shouldVerify(finding, options)) {
        return ok(this.createSkippedResult(finding, correlationId, startTime));
      }

      // Select models for verification
      const modelIds = await this.selectModels(options);
      if (modelIds.length < this.config.minModels) {
        return err(
          new Error(
            `Insufficient models available: ${modelIds.length} found, ${this.config.minModels} required`
          )
        );
      }

      // Query models in parallel
      const votes = await this.queryModels(finding, modelIds, options);

      // Apply consensus strategy
      const strategyResult = this.strategy.apply(votes);

      // Build final result
      const result: ConsensusResult = {
        verdict: strategyResult.verdict,
        finding,
        confidence: strategyResult.confidence,
        votes,
        agreementRatio: strategyResult.agreementRatio,
        requiresHumanReview: strategyResult.requiresHumanReview,
        reasoning: strategyResult.reasoning,
        adjustedSeverity: this.determineAdjustedSeverity(votes, finding.severity),
        combinedSuggestions: this.combineSuggestions(votes),
        totalExecutionTime: Date.now() - startTime,
        totalCost: this.calculateTotalCost(votes),
        completedAt: new Date(),
        correlationId,
      };

      // Update statistics
      this.updateStats(result);

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Verify multiple findings in batch
   *
   * @param findings - Array of findings to verify
   * @param options - Optional verification configuration
   * @returns Promise resolving to array of consensus results
   */
  async verifyBatch(
    findings: SecurityFinding[],
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult[], Error>> {
    try {
      const results = await Promise.all(
        findings.map(finding => this.verify(finding, options))
      );

      // Check if any verification failed
      const errors = results.filter(r => !r.success);
      if (errors.length > 0) {
        return err(
          new Error(
            `Batch verification failed: ${errors.length}/${findings.length} verifications errored`
          )
        );
      }

      // Extract successful results
      const successResults = results
        .filter((r): r is { success: true; value: ConsensusResult } => r.success)
        .map(r => r.value);

      return ok(successResults);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get current consensus threshold
   */
  getThreshold(): number {
    return this.config.defaultThreshold;
  }

  /**
   * Set consensus threshold
   */
  setThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    this.config = { ...this.config, defaultThreshold: threshold };
  }

  /**
   * Configure which models to use for verification
   */
  setModels(models: ModelProvider[]): void {
    this.registry.clear();
    models.forEach(model => this.registry.register(model));
  }

  /**
   * Get currently configured models
   */
  getModels(): string[] {
    return this.registry.getIds();
  }

  /**
   * Add a model provider
   */
  addModel(model: ModelProvider): void {
    this.registry.register(model);
  }

  /**
   * Remove a model provider
   */
  removeModel(modelId: string): boolean {
    return this.registry.unregister(modelId);
  }

  /**
   * Get engine configuration
   */
  getConfig(): ConsensusEngineConfig {
    return { ...this.config };
  }

  /**
   * Update engine configuration
   */
  updateConfig(config: Partial<ConsensusEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get verification statistics
   */
  getStats(): ConsensusStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
  }

  /**
   * Check if a finding requires verification based on severity
   */
  requiresVerification(finding: SecurityFinding): boolean {
    return this.config.verifySeverities.includes(finding.severity);
  }

  /**
   * Dispose engine resources
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    await this.registry.dispose();
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Create strategy from configuration
   */
  private createStrategyFromConfig(
    type: ConsensusStrategyType
  ): MajorityStrategy | WeightedStrategy | UnanimousStrategy {
    return createStrategy(type, {
      minVotes: this.config.minModels,
      humanReviewThreshold: this.config.humanReviewThreshold,
    });
  }

  /**
   * Initialize statistics (mutable internal state)
   */
  private initializeStats(): {
    totalVerifications: number;
    byVerdict: Record<ConsensusVerdict, number>;
    averageConfidence: number;
    averageExecutionTime: number;
    totalCost: number;
    humanReviewCount: number;
    modelStats: Record<string, {
      votes: number;
      agreements: number;
      averageConfidence: number;
      averageExecutionTime: number;
      errors: number;
    }>;
  } {
    return {
      totalVerifications: 0,
      byVerdict: {
        verified: 0,
        rejected: 0,
        disputed: 0,
        insufficient: 0,
        error: 0,
      },
      averageConfidence: 0,
      averageExecutionTime: 0,
      totalCost: 0,
      humanReviewCount: 0,
      modelStats: {},
    };
  }

  /**
   * Determine if finding should be verified
   */
  private shouldVerify(finding: SecurityFinding, options?: VerificationOptions): boolean {
    if (options?.forceVerification) {
      return true;
    }
    return this.requiresVerification(finding);
  }

  /**
   * Select models for verification
   */
  private async selectModels(options?: VerificationOptions): Promise<string[]> {
    // Use specified models if provided
    if (options?.models && options.models.length > 0) {
      return options.models;
    }

    // Get available models
    const available = await this.registry.getAvailable();
    const modelIds = available.map(p => p.id);

    // Limit to maxModels
    return modelIds.slice(0, this.config.maxModels);
  }

  /**
   * Query multiple models in parallel
   */
  private async queryModels(
    finding: SecurityFinding,
    modelIds: string[],
    options?: VerificationOptions
  ): Promise<ModelVote[]> {
    const timeout = options?.perModelTimeout || this.config.defaultModelTimeout;

    const votePromises = modelIds.map(async (modelId): Promise<ModelVote> => {
      const provider = this.registry.get(modelId);
      if (!provider) {
        throw new Error(`Provider not found: ${modelId}`);
      }

      return this.queryModel(provider, finding, timeout, options);
    });

    // Execute all queries in parallel
    const votes = await Promise.allSettled(votePromises);

    // Convert results to votes (handling errors)
    return votes.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Create error vote
        return {
          modelId: modelIds[index],
          agrees: false,
          assessment: 'inconclusive' as const,
          confidence: 0,
          reasoning: 'Model query failed',
          executionTime: 0,
          votedAt: new Date(),
          error: toErrorMessage(result.reason),
        };
      }
    });
  }

  /**
   * Query a single model
   */
  private async queryModel(
    provider: ModelProvider,
    finding: SecurityFinding,
    timeout: number,
    options?: VerificationOptions
  ): Promise<ModelVote> {
    const startTime = Date.now();

    try {
      // Build verification prompt
      const prompt = buildVerificationPrompt(finding, {
        additionalContext: options?.additionalContext,
        sourceCode: options?.sourceCode,
        includeEvidence: true,
        includeRemediation: true,
      });

      // Query model
      const response = await provider.complete(prompt, {
        timeout,
        maxTokens: 4096,
        temperature: 0.7,
      });

      // Parse response
      const parsed = parseVerificationResponse(response);

      // Calculate cost if tracking enabled
      let cost: number | undefined;
      if (this.config.enableCostTracking && parsed.parseSuccess) {
        const costs = provider.getCostPerToken();
        const inputTokens = Math.ceil(prompt.length / 4); // Rough estimate
        const outputTokens = Math.ceil(response.length / 4);
        cost = (inputTokens * costs.input) + (outputTokens * costs.output);
      }

      // Build vote
      return buildModelVote({
        modelId: provider.id,
        modelVersion: provider.getSupportedModels()[0],
        finding,
        parsedResponse: parsed,
        executionTime: Date.now() - startTime,
        tokenUsage: parsed.parseSuccess ? {
          input: Math.ceil(prompt.length / 4),
          output: Math.ceil(response.length / 4),
          total: Math.ceil((prompt.length + response.length) / 4),
        } : undefined,
        cost,
      });
    } catch (error) {
      // Return error vote
      return {
        modelId: provider.id,
        agrees: false,
        assessment: 'inconclusive',
        confidence: 0,
        reasoning: 'Query failed',
        executionTime: Date.now() - startTime,
        votedAt: new Date(),
        error: toErrorMessage(error),
      };
    }
  }

  /**
   * Determine adjusted severity based on model votes
   */
  private determineAdjustedSeverity(
    votes: ModelVote[],
    originalSeverity: Severity
  ): Severity | undefined {
    const suggestions = votes
      .map(v => v.suggestedSeverity)
      .filter((s): s is Severity => s !== undefined);

    if (suggestions.length === 0) {
      return undefined;
    }

    // Count suggestions
    const counts = suggestions.reduce((acc, severity) => {
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<Severity, number>);

    // Find most common suggestion
    const [mostCommon] = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];

    // Only return if different from original
    return mostCommon !== originalSeverity ? (mostCommon as Severity) : undefined;
  }

  /**
   * Combine suggestions from all votes
   */
  private combineSuggestions(votes: ModelVote[]): string[] | undefined {
    const allSuggestions = votes
      .flatMap(v => v.suggestions || [])
      .filter(s => s.length > 0);

    if (allSuggestions.length === 0) {
      return undefined;
    }

    // Deduplicate similar suggestions
    const unique = Array.from(new Set(allSuggestions));
    return unique;
  }

  /**
   * Calculate total cost from votes
   */
  private calculateTotalCost(votes: ModelVote[]): number | undefined {
    if (!this.config.enableCostTracking) {
      return undefined;
    }

    const costs = votes
      .map(v => v.cost)
      .filter((c): c is number => c !== undefined);

    if (costs.length === 0) {
      return undefined;
    }

    return costs.reduce((sum, c) => sum + c, 0);
  }

  /**
   * Create a result for skipped verification
   */
  private createSkippedResult(
    finding: SecurityFinding,
    correlationId: string,
    startTime: number
  ): ConsensusResult {
    return {
      verdict: 'insufficient',
      finding,
      confidence: 0,
      votes: [],
      agreementRatio: 0,
      requiresHumanReview: false,
      reasoning: `Verification skipped: finding severity '${finding.severity}' not in verifySeverities list`,
      totalExecutionTime: Date.now() - startTime,
      completedAt: new Date(),
      correlationId,
    };
  }

  /**
   * Update statistics with new result
   */
  private updateStats(result: ConsensusResult): void {
    this.stats.totalVerifications++;
    this.stats.byVerdict[result.verdict]++;

    // Update average confidence
    const prevTotal = this.stats.averageConfidence * (this.stats.totalVerifications - 1);
    this.stats.averageConfidence = (prevTotal + result.confidence) / this.stats.totalVerifications;

    // Update average execution time
    const prevTimeTotal = this.stats.averageExecutionTime * (this.stats.totalVerifications - 1);
    this.stats.averageExecutionTime = (prevTimeTotal + result.totalExecutionTime) / this.stats.totalVerifications;

    // Update total cost
    if (result.totalCost !== undefined) {
      this.stats.totalCost += result.totalCost;
    }

    // Update human review count
    if (result.requiresHumanReview) {
      this.stats.humanReviewCount++;
    }

    // Update model stats
    result.votes.forEach(vote => {
      if (!this.stats.modelStats[vote.modelId]) {
        this.stats.modelStats[vote.modelId] = {
          votes: 0,
          agreements: 0,
          averageConfidence: 0,
          averageExecutionTime: 0,
          errors: 0,
        };
      }

      const modelStats = this.stats.modelStats[vote.modelId];
      modelStats.votes++;
      if (vote.agrees) {
        modelStats.agreements++;
      }
      if (vote.error) {
        modelStats.errors++;
      }

      // Update model averages
      const prevConfTotal = modelStats.averageConfidence * (modelStats.votes - 1);
      modelStats.averageConfidence = (prevConfTotal + vote.confidence) / modelStats.votes;

      const prevTimeTotal = modelStats.averageExecutionTime * (modelStats.votes - 1);
      modelStats.averageExecutionTime = (prevTimeTotal + vote.executionTime) / modelStats.votes;
    });
  }

  /**
   * Generate a unique correlation ID
   */
  private generateCorrelationId(): string {
    return `consensus-${Date.now()}-${randomUUID().split('-')[0]}`;
  }
}

/**
 * Set the consensus strategy
 *
 * @param type - Strategy type to use
 */
export function setConsensusStrategy(
  engine: ConsensusEngineImpl,
  type: ConsensusStrategyType
): void {
  const strategy = createStrategy(type, {
    minVotes: engine.getConfig().minModels,
    humanReviewThreshold: engine.getConfig().humanReviewThreshold,
  });

  // Update strategy via indexed access (accessing private field)
  engine['strategy'] = strategy;
}
