/**
 * TRMLearningStrategy - TRM-enhanced agent learning with SONA integration
 *
 * Implements AgentLearningStrategy with Test-time Reasoning & Metacognition (TRM)
 * capabilities from @ruvector/ruvllm. Features:
 * - TRM pattern learning with convergence tracking
 * - SONA adaptive learning with LoRA adapters
 * - ReasoningBank for pattern storage and retrieval
 * - EWC++ for catastrophic forgetting prevention
 * - Binary cache for fast pattern access
 *
 * @module core/strategies/TRMLearningStrategy
 * @version 1.0.0
 */

import type {
  AgentLearningStrategy,
  LearnedPattern,
  PatternQuery,
  StrategyRecommendation,
  ExecutionEvent,
  TrainingResult,
  LearningStatus,
  LearningMetrics,
} from './AgentLearningStrategy';
import type {
  TRMPatternEntry,
  TRMPatternMetadata,
  TRMCacheStats,
} from '../cache/BinaryMetadataCache';
import { createTRMPatternEntry, getQualityBucket } from '../cache/BinaryMetadataCache';
import { Logger } from '../../utils/Logger';
import {
  loadRuvLLM,
  type RuvLLMInstance,
  type SonaCoordinatorInstance,
  type ReasoningBankInstance,
  type LoraManagerInstance,
  type RuvLLMModule,
  type RuvLLMLearnedPattern,
} from '../../utils/ruvllm-loader';

// Re-export types for compatibility
type RuvLLM = RuvLLMInstance;
type SonaCoordinator = SonaCoordinatorInstance;
type ReasoningBank = ReasoningBankInstance;
type LoraManager = LoraManagerInstance;

/**
 * TRM Learning Strategy configuration
 */
export interface TRMLearningConfig {
  /** Enable SONA adaptive learning */
  enableSONA?: boolean;
  /** LoRA rank for adapters */
  loraRank?: number;
  /** LoRA alpha scaling */
  loraAlpha?: number;
  /** EWC++ lambda (prevents catastrophic forgetting) */
  ewcLambda?: number;
  /** Minimum pattern quality threshold */
  minQuality?: number;
  /** Maximum TRM patterns to store */
  maxPatterns?: number;
  /** Pattern similarity threshold */
  similarityThreshold?: number;
  /** Enable trajectory recording */
  enableTrajectories?: boolean;
  /** Maximum execution history */
  maxExecutions?: number;
  /** Learning rate for confidence updates */
  learningRate?: number;
}

/**
 * TRM trajectory step
 */
interface TrajectoryStep {
  type: string;
  input: string;
  output: string;
  confidence: number;
  latency: number;
  iteration: number;
}

/**
 * TRM trajectory record
 */
interface TrajectoryRecord {
  id: string;
  steps: TrajectoryStep[];
  finalQuality: number;
  converged: boolean;
  timestamp: Date;
}

/**
 * TRMLearningStrategy - TRM-enhanced learning with SONA integration
 *
 * Uses @ruvector/ruvllm for:
 * - RuvLLM: Core inference with memory and feedback
 * - SonaCoordinator: Trajectory recording and learning
 * - ReasoningBank: Pattern storage with similarity search
 * - LoraManager: MicroLoRA/BaseLoRA adapters
 * - TrajectoryBuilder: Learning trajectory construction
 */
export class TRMLearningStrategy implements AgentLearningStrategy {
  private readonly logger: Logger;
  private readonly config: Required<TRMLearningConfig>;
  private initialized = false;
  private trainingIterations = 0;
  private lastTraining?: Date;

  // TRM patterns and executions
  private trmPatterns: Map<string, TRMPatternEntry> = new Map();
  private patterns: Map<string, LearnedPattern> = new Map();
  private executions: ExecutionEvent[] = [];
  private trajectories: TrajectoryRecord[] = [];
  private recommendations: Map<string, { recommendation: StrategyRecommendation; outcome?: boolean }> = new Map();

  // ruvLLM components (properly typed, lazily loaded)
  private ruvllm?: RuvLLM;
  private sonaCoordinator?: SonaCoordinator;
  private reasoningBank?: ReasoningBank;
  private loraManager?: LoraManager;

  constructor(config?: TRMLearningConfig) {
    this.logger = Logger.getInstance();
    this.config = {
      enableSONA: config?.enableSONA ?? true,
      loraRank: config?.loraRank ?? 8,
      loraAlpha: config?.loraAlpha ?? 16,
      ewcLambda: config?.ewcLambda ?? 2000,
      minQuality: config?.minQuality ?? 0.5,
      maxPatterns: config?.maxPatterns ?? 10000,
      similarityThreshold: config?.similarityThreshold ?? 0.85,
      enableTrajectories: config?.enableTrajectories ?? true,
      maxExecutions: config?.maxExecutions ?? 1000,
      learningRate: config?.learningRate ?? 0.1,
    };
  }

  /**
   * Initialize the TRM learning strategy
   *
   * Loads ruvLLM components for SONA learning, trajectory tracking,
   * and pattern storage.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('TRMLearningStrategy already initialized');
      return;
    }

    try {
      // Load ruvLLM via CJS (ESM build is broken)
      const ruvllmModule = loadRuvLLM();

      if (!ruvllmModule) {
        this.logger.warn('RuvLLM not available, using fallback mode');
        this.initialized = true;
        return;
      }

      // Initialize RuvLLM core
      this.ruvllm = new ruvllmModule.RuvLLM({
        learningEnabled: this.config.enableSONA,
        embeddingDim: 768,
        ewcLambda: this.config.ewcLambda,
      });

      // Initialize SONA components if enabled
      if (this.config.enableSONA) {
        this.sonaCoordinator = new ruvllmModule.SonaCoordinator();
        this.reasoningBank = new ruvllmModule.ReasoningBank(this.config.similarityThreshold);
        this.loraManager = new ruvllmModule.LoraManager();

        this.logger.info('SONA components initialized', {
          loraRank: this.config.loraRank,
          loraAlpha: this.config.loraAlpha,
          ewcLambda: this.config.ewcLambda,
        });
      }

      this.initialized = true;
      this.logger.info('TRMLearningStrategy initialized');

    } catch (error) {
      // Fallback to basic mode without ruvLLM
      this.logger.warn('Failed to load ruvLLM, using fallback mode', {
        error: (error as Error).message,
      });
      this.initialized = true;
    }
  }

  /**
   * Store a learned pattern (converts to TRM format)
   */
  async storePattern(pattern: LearnedPattern): Promise<void> {
    this.ensureInitialized();

    // Enforce max patterns limit
    if (this.patterns.size >= this.config.maxPatterns) {
      this.removeLowestQualityPattern();
    }

    // Store standard pattern
    this.patterns.set(pattern.id, {
      ...pattern,
      updatedAt: new Date(),
    });

    // Store in ReasoningBank if SONA enabled
    if (this.reasoningBank && pattern.embedding) {
      try {
        // ReasoningBank.store(type, embedding, metadata)
        this.reasoningBank.store(
          'query_response' as const,
          pattern.embedding,
          {
            patternId: pattern.id,
            content: pattern.content,
            confidence: pattern.confidence,
            type: pattern.type,
            domain: pattern.domain,
          }
        );
      } catch (error) {
        this.logger.debug('ReasoningBank store failed', { error: (error as Error).message });
      }
    }

    // Also add to ruvLLM memory if available
    if (this.ruvllm) {
      try {
        this.ruvllm.addMemory(pattern.content, {
          patternId: pattern.id,
          type: pattern.type,
          domain: pattern.domain,
          confidence: pattern.confidence,
        });
      } catch (error) {
        this.logger.debug('RuvLLM memory add failed', { error: (error as Error).message });
      }
    }
  }

  /**
   * Store a TRM-specific pattern with quality metrics
   */
  async storeTRMPattern(
    input: string,
    output: string,
    metadata: Partial<TRMPatternMetadata>,
    inputEmbedding?: number[],
    outputEmbedding?: number[]
  ): Promise<string> {
    this.ensureInitialized();

    // Generate embeddings if not provided
    const inputEmb = inputEmbedding ?? this.generateEmbedding(input);
    const outputEmb = outputEmbedding ?? this.generateEmbedding(output);

    // Create TRM pattern entry
    const entry = createTRMPatternEntry(input, output, inputEmb, outputEmb, metadata);

    // Enforce max patterns limit
    if (this.trmPatterns.size >= this.config.maxPatterns) {
      this.removeLowestQualityTRMPattern();
    }

    this.trmPatterns.set(entry.id, entry);

    // Track trajectory if enabled
    if (this.config.enableTrajectories && this.sonaCoordinator) {
      try {
        const ruvllmModule = loadRuvLLM();
        if (ruvllmModule) {
          const trajectory = new ruvllmModule.TrajectoryBuilder()
            .startStep('query', input)
            .endStep(output, metadata.confidence ?? 0.5)
            .complete(metadata.converged ? 'success' : 'partial');

          this.sonaCoordinator.recordTrajectory(trajectory);
        }
      } catch (error) {
        this.logger.debug('Trajectory recording failed', { error: (error as Error).message });
      }
    }

    this.logger.debug('TRM pattern stored', {
      id: entry.id,
      type: entry.type,
      quality: metadata.quality,
      converged: metadata.converged,
    });

    return entry.id;
  }

  /**
   * Query learned patterns
   */
  async getPatterns(query: PatternQuery): Promise<LearnedPattern[]> {
    this.ensureInitialized();

    let results = Array.from(this.patterns.values());

    // Apply filters
    if (query.type) {
      results = results.filter((p) => p.type === query.type);
    }
    if (query.domain) {
      results = results.filter((p) => p.domain === query.domain);
    }
    if (query.minConfidence !== undefined) {
      results = results.filter((p) => p.confidence >= query.minConfidence!);
    }

    // Vector similarity search if embedding provided
    if (query.embedding) {
      results = await this.findSimilarPatterns(query.embedding, query.limit ?? 10);
    } else {
      // Sort by confidence (descending)
      results.sort((a, b) => b.confidence - a.confidence);
    }

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get TRM patterns with quality filtering
   */
  async getTRMPatterns(options?: {
    minQuality?: number;
    convergedOnly?: boolean;
    type?: string;
    limit?: number;
  }): Promise<TRMPatternEntry[]> {
    this.ensureInitialized();

    let results = Array.from(this.trmPatterns.values());

    // Apply filters
    if (options?.minQuality !== undefined) {
      results = results.filter((p) => p.metadata.quality >= options.minQuality!);
    }
    if (options?.convergedOnly) {
      results = results.filter((p) => p.metadata.converged);
    }
    if (options?.type) {
      results = results.filter((p) => p.type === options.type);
    }

    // Sort by quality (descending)
    results.sort((a, b) => b.metadata.quality - a.metadata.quality);

    // Apply limit
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Find similar patterns using vector similarity
   */
  async findSimilarPatterns(embedding: number[], limit = 10): Promise<LearnedPattern[]> {
    this.ensureInitialized();

    // Use ReasoningBank if available
    if (this.reasoningBank) {
      try {
        // ReasoningBank.findSimilar expects number[] (Embedding type)
        const similar = this.reasoningBank.findSimilar(embedding, limit);
        return similar
          .map((s: RuvLLMLearnedPattern) => this.patterns.get(s.id))
          .filter(Boolean) as LearnedPattern[];
      } catch (error) {
        this.logger.debug('ReasoningBank search failed, using fallback', { error: (error as Error).message });
      }
    }

    // Use ruvLLM memory search if available
    if (this.ruvllm) {
      try {
        const memoryResults = this.ruvllm.searchMemory(
          embedding.slice(0, 100).join(' '), // Convert to text query
          limit
        );
        return memoryResults
          .map((m: any) => this.patterns.get(m.metadata?.patternId))
          .filter(Boolean) as LearnedPattern[];
      } catch (error) {
        this.logger.debug('RuvLLM memory search failed', { error: (error as Error).message });
      }
    }

    // Fallback: brute force similarity
    const results: Array<{ pattern: LearnedPattern; similarity: number }> = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.embedding) {
        const similarity = this.cosineSimilarity(embedding, pattern.embedding);
        results.push({ pattern, similarity });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((r) => r.pattern);
  }

  /**
   * Find similar TRM patterns
   */
  async findSimilarTRMPatterns(
    embedding: Float32Array,
    limit = 10
  ): Promise<Array<{ pattern: TRMPatternEntry; score: number }>> {
    this.ensureInitialized();

    const results: Array<{ pattern: TRMPatternEntry; score: number }> = [];

    for (const pattern of this.trmPatterns.values()) {
      const similarity = this.cosineSimilarity(
        Array.from(embedding),
        Array.from(pattern.inputEmbedding)
      );
      results.push({ pattern, score: similarity });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Update pattern confidence based on feedback
   */
  async updatePatternConfidence(patternId: string, success: boolean): Promise<void> {
    this.ensureInitialized();

    const pattern = this.patterns.get(patternId);
    if (pattern) {
      // Exponential moving average for confidence
      const adjustment = success ? this.config.learningRate : -this.config.learningRate;
      pattern.confidence = Math.max(0, Math.min(1, pattern.confidence + adjustment));
      pattern.usageCount++;

      // Update success rate
      const totalUses = pattern.usageCount;
      const successRate = success
        ? (pattern.successRate * (totalUses - 1) + 1) / totalUses
        : (pattern.successRate * (totalUses - 1)) / totalUses;
      pattern.successRate = successRate;
      pattern.updatedAt = new Date();

      this.patterns.set(patternId, pattern);
    }

    // Update TRM pattern if exists
    const trmPattern = this.trmPatterns.get(patternId);
    if (trmPattern) {
      const adjustment = success ? this.config.learningRate : -this.config.learningRate;
      trmPattern.metadata.quality = Math.max(0, Math.min(1, trmPattern.metadata.quality + adjustment));
      trmPattern.metadata.usageCount++;
      trmPattern.metadata.lastUsed = Date.now();
      this.trmPatterns.set(patternId, trmPattern);
    }

    // Record feedback in ruvLLM if available (uses requestId, not patternId)
    // Note: RuvLLM feedback API expects Feedback { requestId, rating, correction? }
    // We skip this if we don't have a requestId - pattern updates are handled above
    // This is a design limitation: we can't directly map pattern IDs to request IDs
  }

  /**
   * Recommend a strategy based on task state with TRM enhancement
   */
  async recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null> {
    this.ensureInitialized();

    // Generate embedding for task state
    const stateText = JSON.stringify(taskState);
    const stateEmbedding = this.generateEmbedding(stateText);

    // Find similar TRM patterns first
    const similarTRM = await this.findSimilarTRMPatterns(
      new Float32Array(stateEmbedding),
      5
    );

    if (similarTRM.length > 0 && similarTRM[0].score > this.config.similarityThreshold) {
      const bestPattern = similarTRM[0].pattern;

      const recommendation: StrategyRecommendation = {
        strategy: bestPattern.type,
        confidence: bestPattern.metadata.quality * similarTRM[0].score,
        reasoning: `TRM pattern match (similarity: ${(similarTRM[0].score * 100).toFixed(1)}%, ` +
          `quality: ${(bestPattern.metadata.quality * 100).toFixed(1)}%, ` +
          `${bestPattern.metadata.iterations} iterations, ` +
          `${bestPattern.metadata.converged ? 'converged' : 'partial'})`,
        alternatives: similarTRM.slice(1).map((s) => ({
          strategy: s.pattern.type,
          confidence: s.pattern.metadata.quality * s.score,
        })),
        metadata: {
          trmPatternId: bestPattern.id,
          trmIterations: bestPattern.metadata.iterations,
          trmConverged: bestPattern.metadata.converged,
        },
      };

      // Track recommendation
      this.recommendations.set(recommendation.strategy, { recommendation });

      return recommendation;
    }

    // Fallback to standard patterns
    const patterns = await this.getPatterns({
      minConfidence: this.config.minQuality,
      embedding: stateEmbedding,
      limit: 5,
    });

    if (patterns.length === 0) {
      return null;
    }

    const best = patterns[0];
    const recommendation: StrategyRecommendation = {
      strategy: best.type,
      confidence: best.confidence,
      reasoning: `Pattern match with ${(best.confidence * 100).toFixed(1)}% confidence`,
      alternatives: patterns.slice(1, 4).map((p) => ({
        strategy: p.type,
        confidence: p.confidence,
      })),
    };

    this.recommendations.set(recommendation.strategy, { recommendation });
    return recommendation;
  }

  /**
   * Record recommendation outcome
   */
  async recordRecommendationOutcome(
    recommendation: StrategyRecommendation,
    success: boolean
  ): Promise<void> {
    this.ensureInitialized();

    const record = this.recommendations.get(recommendation.strategy);
    if (record) {
      record.outcome = success;

      // Update pattern confidence based on outcome
      if (recommendation.metadata?.trmPatternId) {
        await this.updatePatternConfidence(recommendation.metadata.trmPatternId as string, success);
      }
    }
  }

  /**
   * Record a task execution for learning
   */
  async recordExecution(event: ExecutionEvent): Promise<void> {
    this.ensureInitialized();

    // Enforce max executions limit
    if (this.executions.length >= this.config.maxExecutions) {
      this.executions.shift();
    }

    this.executions.push(event);

    // Record in SONA if available
    if (this.sonaCoordinator && this.config.enableTrajectories) {
      try {
        const ruvllmModule = loadRuvLLM();
        if (ruvllmModule) {
          const trajectory = new ruvllmModule.TrajectoryBuilder()
            .startStep('query', JSON.stringify(event.task))
            .endStep(JSON.stringify(event.result ?? event.error), event.success ? 0.9 : 0.1)
            .complete(event.success ? 'success' : 'failure');

          this.sonaCoordinator.recordTrajectory(trajectory);
        }
      } catch (error) {
        this.logger.debug('Trajectory recording failed', { error: (error as Error).message });
      }
    }
  }

  /**
   * Get execution history
   */
  async getExecutionHistory(limit = 100): Promise<ExecutionEvent[]> {
    this.ensureInitialized();
    return this.executions.slice(-limit);
  }

  /**
   * Train the learning model with TRM optimization
   */
  async train(iterations = 10): Promise<TrainingResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    let improvement = 0;
    let patternsLearned = 0;

    // Train LoRA adapters if SONA enabled
    if (this.loraManager && this.config.enableSONA) {
      try {
        const ruvllmModule = loadRuvLLM();

        if (!ruvllmModule) {
          this.logger.warn('RuvLLM not available for training');
        } else {
          // Create or get adapter
          const adapter = new ruvllmModule.LoraAdapter({
            rank: this.config.loraRank,
            alpha: this.config.loraAlpha,
          });

          // Training loop
          for (let i = 0; i < iterations; i++) {
            // Use high-quality TRM patterns for training
            const trainingPatterns = await this.getTRMPatterns({
              minQuality: this.config.minQuality,
              convergedOnly: true,
              limit: 100,
            });

            for (const pattern of trainingPatterns) {
              const loss = adapter.backward(
                Array.from(pattern.inputEmbedding),
                Array.from(pattern.outputEmbedding),
                this.config.learningRate
              );
              improvement += 1 / (1 + loss);
              patternsLearned++;
            }
          }

          this.logger.info('LoRA training complete', {
            iterations,
            patternsLearned,
            improvement: improvement / iterations,
          });
        }
      } catch (error) {
        this.logger.warn('LoRA training failed', { error: (error as Error).message });
      }
    }

    // Update patterns based on execution outcomes
    const recentExecutions = await this.getExecutionHistory(100);
    const successRate = recentExecutions.filter((e) => e.success).length / Math.max(recentExecutions.length, 1);

    this.trainingIterations += iterations;
    this.lastTraining = new Date();

    return {
      iterations,
      improvement: improvement / Math.max(iterations, 1),
      patternsLearned,
      duration: Date.now() - startTime,
      metrics: {
        accuracy: successRate,
        loss: 1 - improvement / Math.max(iterations * patternsLearned, 1),
        recall: patternsLearned / Math.max(this.trmPatterns.size, 1),
      },
    };
  }

  /**
   * Export learned patterns
   */
  async exportPatterns(): Promise<LearnedPattern[]> {
    this.ensureInitialized();
    return Array.from(this.patterns.values());
  }

  /**
   * Import patterns from another agent
   */
  async importPatterns(patterns: LearnedPattern[]): Promise<number> {
    this.ensureInitialized();

    let imported = 0;
    for (const pattern of patterns) {
      if (!this.patterns.has(pattern.id)) {
        await this.storePattern(pattern);
        imported++;
      }
    }

    return imported;
  }

  /**
   * Get learning status
   */
  getStatus(): LearningStatus {
    return {
      enabled: this.config.enableSONA,
      initialized: this.initialized,
      patternsCount: this.patterns.size + this.trmPatterns.size,
      executionsRecorded: this.executions.length,
      lastTraining: this.lastTraining,
      accuracy: this.calculateAccuracy(),
      modelVersion: '1.0.0-trm',
    };
  }

  /**
   * Get learning metrics
   */
  async getMetrics(): Promise<LearningMetrics> {
    this.ensureInitialized();

    const successfulExecutions = this.executions.filter((e) => e.success).length;
    const recommendationOutcomes = Array.from(this.recommendations.values())
      .filter((r) => r.outcome !== undefined);
    const successfulRecommendations = recommendationOutcomes.filter((r) => r.outcome).length;

    // Calculate average confidence
    const allPatterns = Array.from(this.patterns.values());
    const avgConfidence = allPatterns.length > 0
      ? allPatterns.reduce((sum, p) => sum + p.confidence, 0) / allPatterns.length
      : 0;

    return {
      totalExecutions: this.executions.length,
      successfulExecutions,
      failedExecutions: this.executions.length - successfulExecutions,
      patternsStored: this.patterns.size + this.trmPatterns.size,
      recommendationsGiven: this.recommendations.size,
      recommendationAccuracy: recommendationOutcomes.length > 0
        ? successfulRecommendations / recommendationOutcomes.length
        : 0,
      averageConfidence: avgConfidence,
      trainingIterations: this.trainingIterations,
      lastActivity: this.executions.length > 0
        ? new Date()
        : new Date(0),
    };
  }

  /**
   * Get TRM-specific statistics
   */
  getTRMStats(): TRMCacheStats {
    const patterns = Array.from(this.trmPatterns.values());
    const converged = patterns.filter((p) => p.metadata.converged);
    const highQuality = patterns.filter((p) => p.metadata.quality >= 0.75);

    return {
      totalPatterns: patterns.length,
      convergedCount: converged.length,
      highQualityCount: highQuality.length,
      avgQuality: patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.metadata.quality, 0) / patterns.length
        : 0,
      avgIterations: patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.metadata.iterations, 0) / patterns.length
        : 0,
      loraAdaptersCount: 0, // TODO: Track LoRA adapters
      cacheAge: 0,
    };
  }

  /**
   * Reset learning state
   */
  async reset(): Promise<void> {
    this.patterns.clear();
    this.trmPatterns.clear();
    this.executions = [];
    this.trajectories = [];
    this.recommendations.clear();
    this.trainingIterations = 0;
    this.lastTraining = undefined;

    this.logger.info('TRMLearningStrategy reset');
  }

  // === Private Helpers ===

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('TRMLearningStrategy not initialized. Call initialize() first.');
    }
  }

  private generateEmbedding(text: string): number[] {
    // Use ruvLLM if available
    if (this.ruvllm) {
      try {
        return Array.from(this.ruvllm.embed(text));
      } catch {
        // Fallback to simple hash-based embedding
      }
    }

    // Simple deterministic embedding (fallback)
    const embedding = new Array(768).fill(0);
    for (let i = 0; i < text.length; i++) {
      const idx = i % 768;
      embedding[idx] += text.charCodeAt(i) / 256;
    }
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / (magnitude || 1));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private removeLowestQualityPattern(): void {
    let lowestId: string | null = null;
    let lowestConfidence = Infinity;

    for (const [id, pattern] of this.patterns) {
      if (pattern.confidence < lowestConfidence) {
        lowestConfidence = pattern.confidence;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.patterns.delete(lowestId);
    }
  }

  private removeLowestQualityTRMPattern(): void {
    let lowestId: string | null = null;
    let lowestQuality = Infinity;

    for (const [id, pattern] of this.trmPatterns) {
      if (pattern.metadata.quality < lowestQuality) {
        lowestQuality = pattern.metadata.quality;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.trmPatterns.delete(lowestId);
    }
  }

  private calculateAccuracy(): number {
    if (this.executions.length === 0) return 0;
    return this.executions.filter((e) => e.success).length / this.executions.length;
  }
}
