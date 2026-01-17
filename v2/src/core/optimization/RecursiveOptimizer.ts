/**
 * RecursiveOptimizer - TRM-based recursive optimization with binary cache
 *
 * Implements iterative refinement optimization using Test-time Reasoning
 * & Metacognition (TRM) patterns. Features:
 * - Recursive quality improvement with convergence detection
 * - Binary cache for fast pattern retrieval
 * - SONA integration for adaptive learning
 * - EWC++ for preventing catastrophic forgetting
 *
 * @module core/optimization/RecursiveOptimizer
 * @version 1.0.0
 */

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
} from '../../utils/ruvllm-loader';

// Re-export types for compatibility
type RuvLLM = RuvLLMInstance;
type SonaCoordinator = SonaCoordinatorInstance;

/**
 * Optimization configuration
 */
export interface RecursiveOptimizerConfig {
  /** Maximum optimization iterations */
  maxIterations?: number;
  /** Convergence threshold (0-1) - stop when improvement below this */
  convergenceThreshold?: number;
  /** Quality metric to optimize */
  qualityMetric?: 'coherence' | 'coverage' | 'diversity' | 'composite';
  /** Minimum acceptable quality */
  minQuality?: number;
  /** Enable binary cache for patterns */
  enableCache?: boolean;
  /** Cache file path */
  cachePath?: string;
  /** Enable SONA learning */
  enableSONA?: boolean;
  /** LoRA rank for adapters */
  loraRank?: number;
  /** Pattern similarity threshold */
  similarityThreshold?: number;
}

/**
 * Optimization result
 */
export interface OptimizationResult<T> {
  /** Optimized output */
  output: T;
  /** Final quality score (0-1) */
  quality: number;
  /** Number of iterations performed */
  iterations: number;
  /** Whether convergence was achieved */
  converged: boolean;
  /** Quality history per iteration */
  qualityHistory: number[];
  /** Total optimization time (ms) */
  duration: number;
  /** Pattern ID if cached */
  patternId?: string;
  /** Metadata about the optimization */
  metadata: {
    metric: string;
    initialQuality: number;
    improvement: number;
    avgIterationTime: number;
    cacheHit: boolean;
  };
}

/**
 * Optimization step function type
 */
export type OptimizationStep<T> = (
  current: T,
  iteration: number,
  previousQuality: number
) => Promise<T>;

/**
 * Quality evaluation function type
 */
export type QualityEvaluator<T> = (
  output: T,
  metric: string
) => number;

/**
 * Cache entry for optimization patterns
 */
interface OptimizationCacheEntry<T> {
  input: T;
  inputHash: string;
  pattern: TRMPatternEntry;
  result: OptimizationResult<T>;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * RecursiveOptimizer - TRM-based recursive optimization
 *
 * Uses iterative refinement with convergence detection to optimize
 * outputs. Patterns are cached for fast retrieval on similar inputs.
 */
export class RecursiveOptimizer {
  private readonly logger: Logger;
  private readonly config: Required<RecursiveOptimizerConfig>;
  private cache: Map<string, OptimizationCacheEntry<unknown>> = new Map();
  private initialized = false;

  // Statistics
  private stats = {
    totalOptimizations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgIterations: 0,
    avgQuality: 0,
    avgDuration: 0,
    convergenceRate: 0,
  };

  // ruvLLM components (properly typed)
  private ruvllm?: RuvLLM;
  private sonaCoordinator?: SonaCoordinator;

  constructor(config?: RecursiveOptimizerConfig) {
    this.logger = Logger.getInstance();
    this.config = {
      maxIterations: config?.maxIterations ?? 7,
      convergenceThreshold: config?.convergenceThreshold ?? 0.95,
      qualityMetric: config?.qualityMetric ?? 'coherence',
      minQuality: config?.minQuality ?? 0.5,
      enableCache: config?.enableCache ?? true,
      cachePath: config?.cachePath ?? '.aqe/cache/optimizer.bin',
      enableSONA: config?.enableSONA ?? true,
      loraRank: config?.loraRank ?? 8,
      similarityThreshold: config?.similarityThreshold ?? 0.85,
    };
  }

  /**
   * Initialize the optimizer
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('RecursiveOptimizer already initialized');
      return;
    }

    try {
      // Load ruvLLM if SONA enabled
      if (this.config.enableSONA) {
        const ruvllmModule = loadRuvLLM();
        if (ruvllmModule) {
          this.ruvllm = new ruvllmModule.RuvLLM({ learningEnabled: true });
          this.sonaCoordinator = new ruvllmModule.SonaCoordinator();
          this.logger.info('SONA components loaded for RecursiveOptimizer');
        } else {
          this.logger.warn('RuvLLM not available, SONA disabled');
        }
      }

      this.initialized = true;
      this.logger.info('RecursiveOptimizer initialized', {
        maxIterations: this.config.maxIterations,
        convergenceThreshold: this.config.convergenceThreshold,
        qualityMetric: this.config.qualityMetric,
        enableCache: this.config.enableCache,
        enableSONA: this.config.enableSONA,
      });

    } catch (error) {
      this.logger.warn('Failed to load ruvLLM, using fallback mode', {
        error: (error as Error).message,
      });
      this.initialized = true;
    }
  }

  /**
   * Optimize an output using recursive refinement
   *
   * @param initial - Initial output to optimize
   * @param refine - Function to refine the output in each iteration
   * @param evaluate - Function to evaluate output quality
   * @param options - Override configuration options
   * @returns Optimization result
   */
  async optimize<T>(
    initial: T,
    refine: OptimizationStep<T>,
    evaluate: QualityEvaluator<T>,
    options?: Partial<RecursiveOptimizerConfig>
  ): Promise<OptimizationResult<T>> {
    this.ensureInitialized();

    const startTime = Date.now();
    const effectiveConfig = { ...this.config, ...options };
    const qualityHistory: number[] = [];

    // Check cache first
    if (effectiveConfig.enableCache) {
      const cached = this.checkCache(initial);
      if (cached) {
        this.stats.cacheHits++;
        this.logger.debug('Cache hit for optimization', { patternId: cached.result.patternId });
        return cached.result as OptimizationResult<T>;
      }
      this.stats.cacheMisses++;
    }

    // Initial quality evaluation
    let current = initial;
    let quality = evaluate(current, effectiveConfig.qualityMetric);
    const initialQuality = quality;
    qualityHistory.push(quality);

    this.logger.debug('Starting optimization', {
      initialQuality,
      metric: effectiveConfig.qualityMetric,
      maxIterations: effectiveConfig.maxIterations,
    });

    // Iterative refinement loop
    let converged = false;
    let iteration = 0;

    for (iteration = 1; iteration < effectiveConfig.maxIterations; iteration++) {
      // Refine the output
      const refined = await refine(current, iteration, quality);

      // Evaluate new quality
      const newQuality = evaluate(refined, effectiveConfig.qualityMetric);
      const improvement = newQuality - quality;
      qualityHistory.push(newQuality);

      this.logger.debug(`Iteration ${iteration}`, {
        quality: newQuality,
        improvement,
        converged: improvement < (1 - effectiveConfig.convergenceThreshold),
      });

      // Check convergence
      if (improvement < (1 - effectiveConfig.convergenceThreshold)) {
        converged = true;
        this.logger.info('Optimization converged', {
          iterations: iteration,
          finalQuality: newQuality,
          improvement: newQuality - initialQuality,
        });
        break;
      }

      current = refined;
      quality = newQuality;
    }

    const duration = Date.now() - startTime;

    // Create result
    const result: OptimizationResult<T> = {
      output: current,
      quality,
      iterations: iteration,
      converged,
      qualityHistory,
      duration,
      metadata: {
        metric: effectiveConfig.qualityMetric,
        initialQuality,
        improvement: quality - initialQuality,
        avgIterationTime: duration / iteration,
        cacheHit: false,
      },
    };

    // Cache the result
    if (effectiveConfig.enableCache && quality >= effectiveConfig.minQuality) {
      result.patternId = await this.cacheResult(initial, result);
    }

    // Track trajectory in SONA
    if (this.sonaCoordinator && this.config.enableSONA) {
      await this.trackOptimizationTrajectory(initial, result);
    }

    // Update statistics
    this.updateStats(result);

    return result;
  }

  /**
   * Optimize with default text quality evaluation
   */
  async optimizeText(
    initial: string,
    refine: OptimizationStep<string>,
    options?: Partial<RecursiveOptimizerConfig>
  ): Promise<OptimizationResult<string>> {
    return this.optimize(initial, refine, this.defaultTextEvaluator, options);
  }

  /**
   * Batch optimize multiple outputs
   */
  async optimizeBatch<T>(
    items: T[],
    refine: OptimizationStep<T>,
    evaluate: QualityEvaluator<T>,
    options?: Partial<RecursiveOptimizerConfig> & { parallel?: boolean }
  ): Promise<OptimizationResult<T>[]> {
    this.ensureInitialized();

    if (options?.parallel) {
      // Parallel optimization
      return Promise.all(
        items.map((item) => this.optimize(item, refine, evaluate, options))
      );
    }

    // Sequential optimization
    const results: OptimizationResult<T>[] = [];
    for (const item of items) {
      results.push(await this.optimize(item, refine, evaluate, options));
    }
    return results;
  }

  /**
   * Get optimizer statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    entries: number;
    hitRate: number;
    avgAccessCount: number;
    oldestEntry: number;
    newestEntry: number;
  } {
    const entries = Array.from(this.cache.values());
    const now = Date.now();

    return {
      entries: this.cache.size,
      hitRate: this.stats.cacheHits / Math.max(this.stats.cacheHits + this.stats.cacheMisses, 1),
      avgAccessCount: entries.length > 0
        ? entries.reduce((sum, e) => sum + e.accessCount, 0) / entries.length
        : 0,
      oldestEntry: entries.length > 0
        ? now - Math.min(...entries.map((e) => e.createdAt))
        : 0,
      newestEntry: entries.length > 0
        ? now - Math.max(...entries.map((e) => e.createdAt))
        : 0,
    };
  }

  /**
   * Clear the optimization cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Optimization cache cleared');
  }

  /**
   * Reset optimizer statistics
   */
  resetStats(): void {
    this.stats = {
      totalOptimizations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgIterations: 0,
      avgQuality: 0,
      avgDuration: 0,
      convergenceRate: 0,
    };
  }

  // === Private Helpers ===

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('RecursiveOptimizer not initialized. Call initialize() first.');
    }
  }

  private checkCache<T>(input: T): OptimizationCacheEntry<T> | null {
    const hash = this.hashInput(input);
    const entry = this.cache.get(hash) as OptimizationCacheEntry<T> | undefined;

    if (entry) {
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      return entry;
    }

    return null;
  }

  private async cacheResult<T>(
    input: T,
    result: OptimizationResult<T>
  ): Promise<string> {
    const hash = this.hashInput(input);
    const inputText = typeof input === 'string' ? input : JSON.stringify(input);
    const outputText = typeof result.output === 'string'
      ? result.output
      : JSON.stringify(result.output);

    // Generate embeddings
    const inputEmb = this.generateEmbedding(inputText);
    const outputEmb = this.generateEmbedding(outputText);

    // Create TRM pattern
    const pattern = createTRMPatternEntry(
      inputText,
      outputText,
      inputEmb,
      outputEmb,
      {
        quality: result.quality,
        qualityMetric: result.metadata.metric as 'coherence' | 'coverage' | 'diversity',
        iterations: result.iterations,
        converged: result.converged,
        confidence: result.quality,
        avgIterationLatency: result.metadata.avgIterationTime,
      }
    );

    // Store in cache
    const entry: OptimizationCacheEntry<T> = {
      input,
      inputHash: hash,
      pattern,
      result: { ...result, patternId: pattern.id },
      createdAt: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    this.cache.set(hash, entry as OptimizationCacheEntry<unknown>);

    return pattern.id;
  }

  private async trackOptimizationTrajectory<T>(
    input: T,
    result: OptimizationResult<T>
  ): Promise<void> {
    if (!this.sonaCoordinator) return;

    try {
      const ruvllmModule = loadRuvLLM();
      if (!ruvllmModule) return;

      const inputText = typeof input === 'string' ? input : JSON.stringify(input);
      const outputText = typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output);

      const trajectory = new ruvllmModule.TrajectoryBuilder()
        .startStep('query', inputText)
        .endStep(outputText, result.quality)
        .complete(result.converged ? 'success' : 'partial');

      this.sonaCoordinator.recordTrajectory(trajectory);

    } catch (error) {
      this.logger.debug('Trajectory tracking failed', { error: (error as Error).message });
    }
  }

  private updateStats<T>(result: OptimizationResult<T>): void {
    const n = this.stats.totalOptimizations;
    this.stats.totalOptimizations++;

    // Running averages
    this.stats.avgIterations = (this.stats.avgIterations * n + result.iterations) / (n + 1);
    this.stats.avgQuality = (this.stats.avgQuality * n + result.quality) / (n + 1);
    this.stats.avgDuration = (this.stats.avgDuration * n + result.duration) / (n + 1);

    // Convergence rate
    const convergedCount = this.stats.convergenceRate * n + (result.converged ? 1 : 0);
    this.stats.convergenceRate = convergedCount / (n + 1);
  }

  private hashInput<T>(input: T): string {
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `opt-${hash.toString(16)}`;
  }

  /**
   * Generates embeddings for text input.
   *
   * When ruvLLM is available, uses proper transformer-based embeddings.
   * Falls back to a simple character-based heuristic when ruvLLM is unavailable.
   *
   * @warning The fallback implementation is a PLACEHOLDER HEURISTIC.
   * The character-based embedding:
   * - Maps character codes to 768-dimensional space
   * - Normalizes to unit magnitude
   * - Does NOT capture semantic meaning
   *
   * This fallback is only used when:
   * - ruvLLM native module fails to load
   * - Running in test environment without ruvLLM server
   *
   * Production usage should always have ruvLLM available for proper embeddings.
   */
  private generateEmbedding(text: string): number[] {
    // Use ruvLLM if available - proper transformer-based embeddings
    if (this.ruvllm) {
      try {
        return Array.from(this.ruvllm.embed(text));
      } catch {
        // Fallback to simple embedding on error
      }
    }

    // HEURISTIC FALLBACK: Simple deterministic embedding
    // This does NOT capture semantic meaning - only for testing/development
    const embedding = new Array(768).fill(0);
    for (let i = 0; i < text.length; i++) {
      const idx = i % 768;
      embedding[idx] += text.charCodeAt(i) / 256;
    }
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / (magnitude || 1));
  }

  /**
   * Default text quality evaluator using heuristic metrics.
   *
   * @warning All metrics currently use PLACEHOLDER HEURISTICS.
   * See individual measure* methods for details on what proper implementations
   * would look like. These heuristics are sufficient for testing TRM iteration
   * mechanics but should not be used for production quality assessment.
   *
   * Available metrics:
   * - 'coherence': Sentence structure analysis (heuristic)
   * - 'coverage': Unique word ratio (heuristic)
   * - 'diversity': Vocabulary variety (heuristic)
   * - 'composite': Weighted combination (40% coherence, 30% coverage, 30% diversity)
   *
   * @todo M4 milestone: Replace with ML-based evaluation using ruvLLM
   */
  private defaultTextEvaluator = (text: string, metric: string): number => {
    switch (metric) {
      case 'coherence':
        return this.measureCoherence(text);
      case 'coverage':
        return this.measureCoverage(text);
      case 'diversity':
        return this.measureDiversity(text);
      case 'composite':
        return (
          this.measureCoherence(text) * 0.4 +
          this.measureCoverage(text) * 0.3 +
          this.measureDiversity(text) * 0.3
        );
      default:
        return this.measureCoherence(text);
    }
  };

  /**
   * HEURISTIC: Measures text coherence using simple sentence structure analysis.
   *
   * @warning This is a PLACEHOLDER HEURISTIC, not a proper ML-based evaluation.
   * Current implementation uses:
   * - Average sentence length (normalized to 0-1)
   * - Sentence count (normalized to 0-1)
   *
   * A proper implementation would use:
   * - Transformer-based coherence models (e.g., sentence embeddings + cosine similarity)
   * - Discourse structure analysis
   * - Named entity consistency tracking
   * - Coreference resolution scoring
   *
   * @todo Replace with ML-based coherence scoring in M4
   */
  private measureCoherence(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;

    const avgSentenceLength = text.length / sentences.length;
    const normalizedLength = Math.min(avgSentenceLength / 100, 1.0);
    const sentenceCount = Math.min(sentences.length / 10, 1.0);

    return (normalizedLength + sentenceCount) / 2;
  }

  /**
   * HEURISTIC: Measures text coverage using unique word ratio.
   *
   * @warning This is a PLACEHOLDER HEURISTIC, not a proper ML-based evaluation.
   * Current implementation uses:
   * - Ratio of unique words to total words
   *
   * A proper implementation would use:
   * - Topic modeling (LDA, BERTopic) to measure topic coverage
   * - Information density metrics
   * - Semantic role coverage analysis
   * - Requirement traceability scoring
   *
   * @todo Replace with ML-based coverage analysis in M4
   */
  private measureCoverage(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);

    if (words.length === 0) return 0;
    return Math.min(uniqueWords.size / words.length, 1.0);
  }

  /**
   * HEURISTIC: Measures text diversity using vocabulary variety.
   *
   * @warning This is a PLACEHOLDER HEURISTIC, not a proper ML-based evaluation.
   * Current implementation uses:
   * - Ratio of unique words (>3 chars) with 2x scaling
   *
   * A proper implementation would use:
   * - Type-token ratio with smoothing
   * - Lexical diversity indices (MTLD, HD-D, vocd-D)
   * - N-gram entropy measures
   * - Semantic embedding cluster analysis
   *
   * @todo Replace with ML-based diversity metrics in M4
   */
  private measureDiversity(text: string): number {
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const uniqueWords = new Set(words);

    if (words.length === 0) return 0;
    return Math.min((uniqueWords.size / words.length) * 2, 1.0);
  }
}

/**
 * Create a pre-configured RecursiveOptimizer for test generation
 */
export function createTestGenerationOptimizer(): RecursiveOptimizer {
  return new RecursiveOptimizer({
    maxIterations: 5,
    convergenceThreshold: 0.9,
    qualityMetric: 'composite',
    minQuality: 0.6,
    enableCache: true,
    enableSONA: true,
  });
}

/**
 * Create a pre-configured RecursiveOptimizer for code analysis
 */
export function createCodeAnalysisOptimizer(): RecursiveOptimizer {
  return new RecursiveOptimizer({
    maxIterations: 3,
    convergenceThreshold: 0.85,
    qualityMetric: 'coverage',
    minQuality: 0.7,
    enableCache: true,
    enableSONA: false, // Faster for code analysis
  });
}
