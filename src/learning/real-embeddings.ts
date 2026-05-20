/**
 * Real Transformer-Based Embeddings
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Uses @xenova/transformers for actual ML embeddings instead of hash-based fallback.
 * Model: all-MiniLM-L6-v2 (384-dimensional sentence embeddings)
 */

// Re-export cosineSimilarity from shared utility for backward compatibility
export { cosineSimilarity } from '../shared/utils/vector-math.js';
import { toErrorMessage } from '../shared/error-utils.js';
import {
  EmbedderEndpointClient,
  redactEndpoint,
  type EndpointIdentity,
} from './embedder-endpoint-client.js';
import {
  loadEmbedderIdentity,
  resetEmbedderIdentityStore,
  saveEmbedderIdentity,
} from './embedder-identity-store.js';

/**
 * Type for the @xenova/transformers pipeline function
 * Using any since the actual transformers.js types are complex and vary by task
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PipelineFunction = any;

/**
 * Type for the feature extraction pipeline output
 */
interface EmbeddingOutput {
  data: Float32Array;
  dims?: number[];
}

/**
 * Type for the feature extraction pipeline
 * Supports both single string and batch string[] inputs
 */
interface FeatureExtractionPipeline {
  (
    input: string | string[],
    options?: { pooling?: string; normalize?: boolean }
  ): Promise<EmbeddingOutput>;
}

// Lazy-loaded transformer pipeline
let pipeline: PipelineFunction | null = null;
let embeddingModel: FeatureExtractionPipeline | null = null;
let initPromise: Promise<void> | null = null;
let initializationFailed = false;
let failureReason = '';

/**
 * Set when ADR-097 endpoint path is active. Tracked separately so callers
 * (tests, observability) can verify endpoint vs in-process unambiguously.
 */
let endpointClient: EmbedderEndpointClient | null = null;
let endpointIdentity: EndpointIdentity | null = null;

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

  /**
   * Optional external embedder endpoint (ADR-097).
   *
   * When set, AQE routes feature-extraction to an OpenAI-compatible
   * `/v1/embeddings` service instead of loading `@huggingface/transformers`
   * in-process. Forms:
   *   - `http(s)://host:port`  — HTTP transport
   *   - `unix:/absolute/path`  — HTTP-over-Unix-socket transport
   *
   * Defaults to `process.env.AQE_EMBEDDER_ENDPOINT` when unset.
   * When neither is set, behavior is identical to pre-ADR-097.
   */
  endpoint?: string;

  /**
   * Bearer token for the embedder endpoint (ADR-097).
   * Defaults to `process.env.AQE_EMBEDDER_TOKEN`. Env-only — never in config files.
   */
  endpointToken?: string;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  modelName: 'Xenova/all-MiniLM-L6-v2',
  quantized: true,
  enableCache: true,
  maxCacheSize: 10000,
  endpoint: process.env.AQE_EMBEDDER_ENDPOINT,
  endpointToken: process.env.AQE_EMBEDDER_TOKEN,
};

// Embedding cache (LRU). Keys are namespaced by embedding mode to prevent
// cross-mode collisions (e.g. flipping endpoint on/off mid-process must not
// return a vector computed under the other mode). See `cacheKey()`.
const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL_MS = 3600000; // 1 hour

/**
 * Build the cache key for a given text under the current embedding mode.
 * Endpoint mode: `endpoint:<fingerprint>:<text>` — different fingerprints
 *   (e.g. after a model swap) get separate cache entries.
 * In-process mode: `inproc:<text>`.
 *
 * Until the endpoint probe completes, calls land under `inproc:` — these get
 * evicted naturally by TTL/LRU after init. Callers should not interleave
 * endpoint-enabled and endpoint-disabled `computeRealEmbedding` against the
 * same text within the cache TTL.
 */
function cacheKey(text: string): string {
  if (endpointIdentity) {
    return `endpoint:${endpointIdentity.fingerprint}:${text}`;
  }
  return `inproc:${text}`;
}

/**
 * Detect if text is a JSON metrics/internal data string that shouldn't be embedded.
 * These strings have no semantic value for vector search and waste compute.
 */
function isNonSemanticText(text: string): boolean {
  const trimmed = text.trim();
  // Skip JSON objects with metrics keys (e.g. {"metrics":{"tasksReceived":1,...}})
  if (trimmed.startsWith('{') && /["']metrics["']/.test(trimmed)) {
    return true;
  }
  // Skip raw JSON arrays
  if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length > 50) {
    return true;
  }
  // Skip strings that are predominantly numeric/punctuation (UUIDs, hashes, etc.)
  const alphaRatio = (trimmed.match(/[a-zA-Z]/g) || []).length / Math.max(trimmed.length, 1);
  if (alphaRatio < 0.3 && trimmed.length > 20) {
    return true;
  }
  return false;
}

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
      // ADR-097: Endpoint branch — when an external embedder endpoint is configured,
      // we MUST NOT import @huggingface/transformers in this process. The cold-load
      // elimination depends on the dynamic import being inside the else branch only.
      if (fullConfig.endpoint) {
        const safeUrl = redactEndpoint(fullConfig.endpoint);
        console.log(`[RealEmbeddings] Using external embedder endpoint: ${safeUrl}`);
        endpointClient = new EmbedderEndpointClient({
          endpoint: fullConfig.endpoint,
          token: fullConfig.endpointToken,
          model: fullConfig.modelName,
          expectedDim: getEmbeddingDimension(),
        });
        // Probe + identity fingerprint. Fails loud on dim mismatch.
        endpointIdentity = await endpointClient.probe();
        console.log(
          `[RealEmbeddings] Endpoint identity: dim=${endpointIdentity.dim} fingerprint=${endpointIdentity.fingerprint}`
        );

        // Cross-run drift detection: compare against the last-known identity
        // for this endpoint (memory.db kv_store, namespace _system). If the
        // fingerprint changed since last run, log a loud warning — the operator
        // either intentionally swapped models (fine, but should know) or the
        // remote silently changed (poisoning risk for the existing index).
        try {
          const previous = loadEmbedderIdentity(endpointIdentity.endpoint);
          if (previous && previous.fingerprint !== endpointIdentity.fingerprint) {
            console.warn(
              `[RealEmbeddings] WARNING: endpoint identity changed since last run. ` +
                `Previous fingerprint=${previous.fingerprint} dim=${previous.dim}, ` +
                `current fingerprint=${endpointIdentity.fingerprint} dim=${endpointIdentity.dim}. ` +
                `Vectors written before this change may no longer be comparable.`
            );
          }
          saveEmbedderIdentity(endpointIdentity);
        } catch (persistErr) {
          // Persistence failure is non-fatal — we still have the in-memory identity
          // for this run. Log so operators see it.
          console.warn(
            `[RealEmbeddings] Could not persist endpoint identity: ${toErrorMessage(persistErr)}`
          );
        }

        embeddingModel = createEndpointPipeline(endpointClient);
        return;
      }

      // In-process branch — only here do we import the transformers package.
      const transformers = await import('@huggingface/transformers');
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
      failureReason = toErrorMessage(error);
      throw new Error(`Failed to initialize transformer model: ${failureReason}`);
    }
  })();

  return initPromise;
}

/**
 * Build a FeatureExtractionPipeline-shaped wrapper around the endpoint client.
 * The shape matches `pipeline('feature-extraction', ...)` so the rest of
 * computeRealEmbedding / computeBatchEmbeddings remains unchanged.
 *
 * The endpoint already returns L2-normalized vectors (and we re-normalize on
 * receive inside the client), so the `pooling` / `normalize` options from
 * upstream callers are no-ops here — that's the OpenAI contract.
 */
function createEndpointPipeline(client: EmbedderEndpointClient): FeatureExtractionPipeline {
  return async (input: string | string[]): Promise<EmbeddingOutput> => {
    const texts = Array.isArray(input) ? input : [input];
    const vectors = await client.embed(texts);
    const dim = vectors[0]?.length ?? getEmbeddingDimension();
    const data = new Float32Array(texts.length * dim);
    for (let i = 0; i < vectors.length; i++) {
      data.set(vectors[i], i * dim);
    }
    return { data, dims: [texts.length, dim] };
  };
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

  // Skip non-semantic text (JSON metrics, UUIDs, etc.) - return zero vector
  if (isNonSemanticText(text)) {
    return new Array(getEmbeddingDimension()).fill(0);
  }

  // Ensure model is initialized BEFORE checking cache so the cache key
  // namespace (which depends on endpoint identity) is stable.
  if (!embeddingModel) {
    await initializeModel(config);
  }

  if (!embeddingModel) {
    throw new Error('Embedding model failed to initialize');
  }

  const key = cacheKey(text);
  if (fullConfig.enableCache) {
    const cached = embeddingCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.embedding;
    }
  }

  // Compute embedding
  const startTime = performance.now();
  const output = await embeddingModel(text, { pooling: 'mean', normalize: true });

  // Extract embedding array from tensor
  const embedding = Array.from(output.data as Float32Array);
  const computeTime = performance.now() - startTime;

  if (computeTime > 500) {
    console.warn(`[RealEmbeddings] Slow embedding computation: ${computeTime.toFixed(1)}ms for "${text.slice(0, 50)}..."`);
  }

  // Cache the embedding
  if (fullConfig.enableCache) {
    // LRU eviction
    if (embeddingCache.size >= fullConfig.maxCacheSize) {
      const oldestKey = embeddingCache.keys().next().value;
      if (oldestKey) embeddingCache.delete(oldestKey);
    }
    embeddingCache.set(key, { embedding, timestamp: Date.now() });
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

  // Init BEFORE cache lookup so the cache key namespace is stable.
  if (!embeddingModel) {
    await initializeModel(config);
  }
  if (!embeddingModel) {
    throw new Error('Embedding model failed to initialize');
  }

  if (fullConfig.enableCache) {
    for (let i = 0; i < texts.length; i++) {
      const cached = embeddingCache.get(cacheKey(texts[i]));
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

    const startTime = performance.now();

    // Process in batches of 32 for memory efficiency
    const BATCH_SIZE = 32;
    for (let batchStart = 0; batchStart < uncachedTexts.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, uncachedTexts.length);
      const batchTexts = uncachedTexts.slice(batchStart, batchEnd);

      const outputs = await embeddingModel(batchTexts, { pooling: 'mean', normalize: true });

      // Extract embeddings from batch output
      const dims = outputs.dims || [batchTexts.length, 384]; // Default to MiniLM dimensions
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
          embeddingCache.set(cacheKey(uncachedTexts[textIndex]), { embedding, timestamp: Date.now() });
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
  if (endpointClient) {
    endpointClient.close();
  }
  endpointClient = null;
  endpointIdentity = null;
  // Drop the identity-store's cached DB connection so tests that flip cwd or
  // AQE_MEMORY_PATH between runs don't write into a stale handle.
  resetEmbedderIdentityStore();
}

/**
 * ADR-097: Returns true when the embedding pipeline is the external endpoint path,
 * false when it's the in-process transformer (or uninitialized).
 */
export function isUsingEndpoint(): boolean {
  return endpointClient !== null;
}

/**
 * ADR-097: Returns the endpoint identity fingerprint, or null when not using an endpoint.
 */
export function getEndpointIdentity(): EndpointIdentity | null {
  return endpointIdentity;
}
