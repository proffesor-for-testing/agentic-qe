/**
 * Real Transformer-Based Embeddings
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Uses @xenova/transformers for actual ML embeddings instead of hash-based fallback.
 * Model: all-MiniLM-L6-v2 (384-dimensional sentence embeddings)
 */

// Re-export cosineSimilarity from shared utility for backward compatibility
export { cosineSimilarity } from '../shared/utils/vector-math.js';

/**
 * Type for the @xenova/transformers pipeline function
 * Using unknown since the actual type depends on the task parameter
 */
type PipelineFunction = (
  task: string,
  model: string,
  options?: { quantized?: boolean }
) => Promise<FeatureExtractionPipeline>;

/**
 * Type for the feature extraction pipeline
 */
interface FeatureExtractionPipeline {
  (
    input: string,
    options?: { pooling?: string; normalize?: boolean }
  ): Promise<{ data: Float32Array }>;
}

// Lazy-loaded transformer pipeline
let pipeline: PipelineFunction | null = null;
let embeddingModel: FeatureExtractionPipeline | null = null;
let initPromise: Promise<void> | null = null;
let initializationFailed = false;
let failureReason = '';

/**
 * Embedding model configuration
 */
export interface EmbeddingConfig {
  /** Model name (default: Xenova/all-MiniLM-L6-v2) */
  modelName: string;

  /** Whether to use quantized model for faster inference */
  quantized: boolean;

  /** Cache embeddings in memory */
  enableCache: boolean;

  /** Maximum cache size */
  maxCacheSize: number;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  modelName: 'Xenova/all-MiniLM-L6-v2',
  quantized: true,
  enableCache: true,
  maxCacheSize: 10000,
};

// Embedding cache (LRU)
const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL_MS = 3600000; // 1 hour

/**
 * Initialize the transformer model
 */
async function initializeModel(config: Partial<EmbeddingConfig> = {}): Promise<void> {
  if (initializationFailed) {
    throw new Error(`Transformer initialization previously failed: ${failureReason}`);
  }

  if (initPromise) {
    return initPromise;
  }

  const fullConfig = { ...DEFAULT_EMBEDDING_CONFIG, ...config };

  initPromise = (async () => {
    try {
      // Dynamic import to avoid issues if transformers not available
      const transformers = await import('@xenova/transformers');
      pipeline = transformers.pipeline;

      console.log(`[RealEmbeddings] Loading model: ${fullConfig.modelName}`);
      const startTime = performance.now();

      // Create feature extraction pipeline
      embeddingModel = await pipeline('feature-extraction', fullConfig.modelName, {
        quantized: fullConfig.quantized,
      });

      const loadTime = performance.now() - startTime;
      console.log(`[RealEmbeddings] Model loaded in ${loadTime.toFixed(0)}ms`);
    } catch (error) {
      initializationFailed = true;
      failureReason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize transformer model: ${failureReason}`);
    }
  })();

  return initPromise;
}

/**
 * Compute real embedding using transformer model
 *
 * @param text - Text to embed
 * @param config - Optional embedding configuration
 * @returns 384-dimensional embedding vector
 */
export async function computeRealEmbedding(
  text: string,
  config: Partial<EmbeddingConfig> = {}
): Promise<number[]> {
  const fullConfig = { ...DEFAULT_EMBEDDING_CONFIG, ...config };

  // Check cache first
  if (fullConfig.enableCache) {
    const cached = embeddingCache.get(text);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.embedding;
    }
  }

  // Ensure model is initialized
  if (!embeddingModel) {
    await initializeModel(config);
  }

  // Compute embedding
  const startTime = performance.now();
  const output = await embeddingModel(text, { pooling: 'mean', normalize: true });

  // Extract embedding array from tensor
  const embedding = Array.from(output.data as Float32Array);
  const computeTime = performance.now() - startTime;

  if (computeTime > 100) {
    console.warn(`[RealEmbeddings] Slow embedding computation: ${computeTime.toFixed(1)}ms for "${text.slice(0, 50)}..."`);
  }

  // Cache the embedding
  if (fullConfig.enableCache) {
    // LRU eviction
    if (embeddingCache.size >= fullConfig.maxCacheSize) {
      const oldestKey = embeddingCache.keys().next().value;
      if (oldestKey) embeddingCache.delete(oldestKey);
    }
    embeddingCache.set(text, { embedding, timestamp: Date.now() });
  }

  return embedding;
}

/**
 * Compute embeddings for multiple texts in batch (more efficient)
 */
export async function computeBatchEmbeddings(
  texts: string[],
  config: Partial<EmbeddingConfig> = {}
): Promise<number[][]> {
  const fullConfig = { ...DEFAULT_EMBEDDING_CONFIG, ...config };

  // Check which texts need computation
  const uncachedTexts: string[] = [];
  const uncachedIndices: number[] = [];
  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  if (fullConfig.enableCache) {
    for (let i = 0; i < texts.length; i++) {
      const cached = embeddingCache.get(texts[i]);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        results[i] = cached.embedding;
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }
  } else {
    uncachedTexts.push(...texts);
    for (let i = 0; i < texts.length; i++) {
      uncachedIndices.push(i);
    }
  }

  // Compute uncached embeddings
  if (uncachedTexts.length > 0) {
    if (!embeddingModel) {
      await initializeModel(config);
    }

    const startTime = performance.now();

    // Process in batches of 32 for memory efficiency
    const BATCH_SIZE = 32;
    for (let batchStart = 0; batchStart < uncachedTexts.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, uncachedTexts.length);
      const batchTexts = uncachedTexts.slice(batchStart, batchEnd);

      const outputs = await embeddingModel(batchTexts, { pooling: 'mean', normalize: true });

      // Extract embeddings from batch output
      const dims = outputs.dims;
      const batchSize = dims[0];
      const embeddingDim = dims[1];

      for (let i = 0; i < batchSize; i++) {
        const start = i * embeddingDim;
        const embedding = Array.from(outputs.data.slice(start, start + embeddingDim) as Float32Array);
        const textIndex = batchStart + i;
        const originalIndex = uncachedIndices[textIndex];

        results[originalIndex] = embedding;

        // Cache
        if (fullConfig.enableCache) {
          if (embeddingCache.size >= fullConfig.maxCacheSize) {
            const oldestKey = embeddingCache.keys().next().value;
            if (oldestKey) embeddingCache.delete(oldestKey);
          }
          embeddingCache.set(uncachedTexts[textIndex], { embedding, timestamp: Date.now() });
        }
      }
    }

    const computeTime = performance.now() - startTime;
    console.log(`[RealEmbeddings] Batch computed ${uncachedTexts.length} embeddings in ${computeTime.toFixed(0)}ms`);
  }

  return results.filter((r): r is number[] => r !== null);
}

/**
 * Clear the embedding cache
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  console.log('[RealEmbeddings] Cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; hitRate: number } {
  return {
    size: embeddingCache.size,
    hitRate: 0, // Would need to track hits/misses for this
  };
}

/**
 * Check if transformer model is available
 */
export function isTransformerAvailable(): boolean {
  return !initializationFailed && embeddingModel !== null;
}

/**
 * Get the embedding dimension (384 for all-MiniLM-L6-v2)
 */
export function getEmbeddingDimension(): number {
  return 384;
}

/**
 * Reset initialization state (for testing)
 */
export function resetInitialization(): void {
  pipeline = null;
  embeddingModel = null;
  initPromise = null;
  initializationFailed = false;
  failureReason = '';
  embeddingCache.clear();
}
