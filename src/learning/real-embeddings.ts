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
  ENDPOINT_IDENTITY_CANARY,
  redactEndpoint,
  type EndpointIdentity,
} from './embedder-endpoint-client.js';
import {
  loadEmbedderIdentity,
  resetEmbedderIdentityStore,
  saveEmbedderIdentity,
} from './embedder-identity-store.js';
import {
  EMBEDDING_SPACE_CANARY,
  deriveEmbeddingSpaceIdentity,
  fingerprintEmbeddingRuntime,
  type EmbeddingSpaceIdentity,
} from './embedding-space.js';
import {
  resolveEmbeddingSpaceAdoptingLegacy,
  type EmbeddingSpaceRegistryDb,
  type ResolvedEmbeddingSpace,
} from './embedding-space-registry.js';
import { findAdoptableLegacySpace } from './embedding-space-legacy-adoption.js';

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
/** #1204: an in-flight recheckEmbedder() re-initialization, shared by callers. */
let initRetryPromise: Promise<void> | null = null;

/**
 * Set when ADR-097 endpoint path is active. Tracked separately so callers
 * (tests, observability) can verify endpoint vs in-process unambiguously.
 */
let endpointClient: EmbedderEndpointClient | null = null;
let endpointIdentity: EndpointIdentity | null = null;
let activeEmbeddingSpaceIdentity: EmbeddingSpaceIdentity | null = null;

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
async function initializeModel(
  config: Partial<EmbeddingConfig> = {},
  retryingAfterFailure = false
): Promise<void> {
  // #1204: a recheckEmbedder() retry runs while the failure is still recorded,
  // so other callers keep failing fast instead of waiting on a dead host.
  if (initializationFailed && !retryingAfterFailure) {
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
        const derivedSpace = deriveEmbeddingSpaceIdentity({
          provider: 'openai-compatible-endpoint',
          model: fullConfig.modelName,
          dimensions: endpointIdentity.dim,
          pooling: 'mean',
          normalized: true,
          preprocessingVersion: 'aqe-text-v1',
          implementation: endpointIdentity.endpoint,
          runtimeFingerprint: endpointIdentity.fingerprint,
        });
        const boundCanary = endpointClient.getBoundCanary();
        const space = boundCanary
          ? await resolveActiveSpace(
              derivedSpace,
              ENDPOINT_IDENTITY_CANARY,
              [...boundCanary],
              createEndpointPipeline(endpointClient)
            )
          : null;
        activeEmbeddingSpaceIdentity = space?.identity ?? derivedSpace;
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
          // #1298: a restart that kept its registered space is not a change,
          // even when float noise moved the fingerprint (#1302: nor one that
          // adopted its pre-registry space).
          const spaceKept =
            space?.resolution === 'matched-exact' ||
            space?.resolution === 'matched-cosine' ||
            space?.resolution === 'adopted-legacy';
          const changed =
            (previous !== null && previous.fingerprint !== endpointIdentity.fingerprint) ||
            (space?.otherSpaces ?? 0) > 0;
          if (!spaceKept && changed) {
            console.warn(
              `[RealEmbeddings] WARNING: endpoint identity changed since last run. ` +
                `Previous fingerprint=${previous?.fingerprint ?? 'unknown'} dim=${previous?.dim ?? 'unknown'}, ` +
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
        initializationFailed = false;
        failureReason = '';
        return;
      }

      // In-process branch — only here do we import the transformers package.
      // #565: `@huggingface/transformers` is NOT installed automatically (it
      // transitively pulls onnxruntime-node -> adm-zip <0.6.0, GHSA-xcpc-8h2w-3j85,
      // which upstream has not fixed). Users who want in-process embeddings opt in
      // explicitly; everyone else uses an embedding endpoint. Translate the raw
      // module-resolution failure into actionable guidance.
      let transformers: typeof import('@huggingface/transformers');
      try {
        transformers = await import('@huggingface/transformers');
      } catch {
        throw new Error(
          'In-process embeddings require the optional package "@huggingface/transformers", ' +
          'which is not installed. Configure an embedding endpoint ' +
          '(EmbeddingConfig.endpoint / AQE_EMBEDDER_ENDPOINT) so no local model is loaded. ' +
          'Installing @huggingface/transformers@4.2.0 is an explicit security opt-in: ' +
          'its compatible dependency chain currently has unresolved HIGH advisories ' +
          'GHSA-xcpc-8h2w-3j85 and GHSA-f88m-g3jw-g9cj.'
        );
      }
      pipeline = transformers.pipeline;

      console.log(`[RealEmbeddings] Loading model: ${fullConfig.modelName}`);
      const startTime = performance.now();

      // Create feature extraction pipeline
      embeddingModel = await pipeline('feature-extraction', fullConfig.modelName, {
        quantized: fullConfig.quantized,
      });

      const initializedModel = embeddingModel;
      if (!initializedModel) throw new Error('Transformer pipeline returned no embedding model');
      const canary = await initializedModel(EMBEDDING_SPACE_CANARY, {
        pooling: 'mean',
        normalize: true,
      });
      const canaryVector = Array.from(canary.data as Float32Array);
      const derivedSpace = deriveEmbeddingSpaceIdentity({
        provider: 'huggingface-transformers',
        model: fullConfig.modelName,
        dimensions: canaryVector.length,
        pooling: 'mean',
        normalized: true,
        preprocessingVersion: 'aqe-text-v1',
        implementation: `transformers:${fullConfig.quantized ? 'quantized' : 'full'}`,
        runtimeFingerprint: fingerprintEmbeddingRuntime(canaryVector),
      });
      activeEmbeddingSpaceIdentity = (
        await resolveActiveSpace(derivedSpace, EMBEDDING_SPACE_CANARY, canaryVector, initializedModel)
      ).identity;

      initializationFailed = false;
      failureReason = '';
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

/** @internal test seam: settles when the last space registration write ran. */
let lastSpaceRegistration: Promise<void> = Promise.resolve();
export function __spaceRegistrationSettledForTests(): Promise<void> {
  return lastSpaceRegistration;
}

/**
 * #1298: keep a restarted runtime in its registered embedding space when its
 * canary is within the round-trip cosine of that space's reference, instead
 * of minting a new id from the exact fingerprint. Uses the shared memory.db
 * connection only when UnifiedMemory is already open; otherwise (and on any
 * registry error) the derived space is used, as before.
 *
 * #1302: when no registered space matches, a pre-registry space id whose
 * stored experience vectors `model` reproduces is adopted instead of minting
 * a new one. That check re-embeds a bounded number of rows and runs once:
 * afterwards the chosen space is registered and matched from the registry.
 */
async function resolveActiveSpace(
  derived: EmbeddingSpaceIdentity,
  canaryText: string,
  canary: number[],
  model: FeatureExtractionPipeline
): Promise<ResolvedEmbeddingSpace> {
  let db: EmbeddingSpaceRegistryDb | null = null;
  try {
    const { getOpenUnifiedMemoryDatabase } = await import('../kernel/unified-memory.js');
    db = getOpenUnifiedMemoryDatabase();
  } catch (error) {
    console.warn(`[RealEmbeddings] embedding-space registry unavailable: ${toErrorMessage(error)}`);
  }
  const resolved = await resolveEmbeddingSpaceAdoptingLegacy(
    db,
    derived,
    canaryText,
    canary,
    async (space, registered) => {
      const adoption = await findAdoptableLegacySpace(db!, space, registered, async (text) => {
        if (isNonSemanticText(text)) return new Array<number>(space.dimensions).fill(0);
        const output = await model(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
      });
      if (adoption.spaceId) {
        console.log(
          `[RealEmbeddings] Embedding space ${adoption.spaceId.slice(0, 12)} adopted: it has no reference canary, ` +
            `and the active runtime reproduces its stored experience vectors: ${adoption.reason}`
        );
      } else {
        console.log(`[RealEmbeddings] No earlier embedding space adopted: ${adoption.reason}`);
      }
      return adoption.spaceId;
    }
  );
  lastSpaceRegistration = resolved.registration;
  if (resolved.resolution === 'matched-cosine') {
    console.log(
      `[RealEmbeddings] Embedding space ${resolved.identity.spaceId.slice(0, 12)} kept: ` +
        `runtime fingerprint ${derived.runtimeFingerprint} is within the round-trip cosine of its reference`
    );
  }
  return resolved;
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

  // Match computeRealEmbedding(): non-semantic inputs are represented by a
  // zero vector and must never reach the model or its cache (#585).
  const semanticIndices: number[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (isNonSemanticText(texts[i])) {
      results[i] = new Array(getEmbeddingDimension()).fill(0);
    } else {
      semanticIndices.push(i);
    }
  }

  // Preserve the single-item API's no-initialization behavior when every
  // input is non-semantic.
  if (semanticIndices.length === 0) {
    return results as number[][];
  }

  // Init BEFORE cache lookup so the cache key namespace is stable.
  if (!embeddingModel) {
    await initializeModel(config);
  }
  if (!embeddingModel) {
    throw new Error('Embedding model failed to initialize');
  }

  if (fullConfig.enableCache) {
    for (const i of semanticIndices) {
      const cached = embeddingCache.get(cacheKey(texts[i]));
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        results[i] = cached.embedding;
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }
  } else {
    for (const i of semanticIndices) {
      uncachedTexts.push(texts[i]);
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
  activeEmbeddingSpaceIdentity = null;
  // Drop the identity-store's cached DB connection so tests that flip cwd or
  // AQE_MEMORY_PATH between runs don't write into a stale handle.
  resetEmbedderIdentityStore();
}

/**
 * #1187: allow a new initialization attempt after a failed one. A failed
 * initialization is otherwise remembered for the whole process, so a short
 * embedding-endpoint outage at startup would disable embeddings until the
 * process restarts. Callers rate-limit retries. No-op unless the last
 * initialization failed.
 */
export function allowEmbedderInitRetry(): void {
  if (!initializationFailed) return;
  initializationFailed = false;
  failureReason = '';
  initPromise = null;
  if (endpointClient) {
    endpointClient.close();
  }
  endpointClient = null;
  endpointIdentity = null;
}

/**
 * #1204: check whether a failed embedder works again, for callers that retry
 * it after a cooldown. Resolves when the embedder is usable; throws otherwise.
 * Other callers keep failing fast while the check runs, so a host that never
 * answers stalls only the (background) check, never them:
 * - after a failed initialization, initialize again while the failure stays
 *   recorded; concurrent rechecks share that attempt;
 * - after runtime failures that opened the endpoint circuit breaker, probe the
 *   endpoint as the breaker's single trial request, so recovery does not wait
 *   for the breaker window as well as the caller's retry interval. The probe
 *   must find the identity this process bound to (ADR-097): a changed
 *   fingerprint means vectors would not be comparable.
 *   The client refuses it (EmbedderEndpointIdentityChangedError) and keeps
 *   refusing every caller, also when its breaker recovers on its own (#1282).
 * Callers rate-limit rechecks, then embed a canary to confirm.
 */
export async function recheckEmbedder(config: Partial<EmbeddingConfig> = {}): Promise<void> {
  if (initializationFailed) {
    initRetryPromise ??= retryInitialization(config).finally(() => {
      initRetryPromise = null;
    });
    return initRetryPromise;
  }
  const client = endpointClient;
  // #1216: also when the breaker window elapsed but no trial probe has
  // succeeded yet; embed() would only start that trial and fail fast.
  if (!client || !client.needsTrial()) return;
  await client.probeThroughOpenBreaker();
}

async function retryInitialization(config: Partial<EmbeddingConfig>): Promise<void> {
  if (endpointClient) {
    endpointClient.close();
  }
  endpointClient = null;
  endpointIdentity = null;
  initPromise = null;
  await initializeModel(config, true);
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

/** Runtime-backed identity of the initialized embedding space. */
export function getActiveEmbeddingSpaceIdentity(): EmbeddingSpaceIdentity | null {
  return activeEmbeddingSpaceIdentity;
}

/**
 * #754: resolve the configured endpoint's embedding-space identity before an
 * index binder (RVF pattern store, brain.rvf dual writer, SQLite HNSW) checks
 * its space manifest. The endpoint runtime otherwise initializes lazily on the
 * first embed call — after the binder has already refused for the process.
 * Returns null when no endpoint is configured, so binders stay fail-closed.
 */
export async function ensureEndpointEmbeddingSpaceIdentity(): Promise<EmbeddingSpaceIdentity | null> {
  if (activeEmbeddingSpaceIdentity) return activeEmbeddingSpaceIdentity;
  const endpoint = process.env.AQE_EMBEDDER_ENDPOINT;
  if (!endpoint) return null;
  await initializeModel({ endpoint, endpointToken: process.env.AQE_EMBEDDER_TOKEN });
  return activeEmbeddingSpaceIdentity;
}
