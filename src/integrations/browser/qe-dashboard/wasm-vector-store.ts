/**
 * Browser-side WASM Vector Store for QE Dashboard (Task 4.6)
 *
 * Provides a vector store that attempts to load `rvlite` for WASM-based
 * vector search. When unavailable, falls back to a lightweight in-memory
 * vector store with cosine similarity search and namespace support.
 *
 * Design Goals:
 * - No browser-specific APIs (must work in Node.js for testing)
 * - All WASM imports are optional with TypeScript fallback
 * - Efficient cosine similarity computation
 * - Namespace-scoped vector storage
 *
 * @module integrations/browser/qe-dashboard/wasm-vector-store
 */

// ============================================================================
// Types
// ============================================================================

/** Result of a similarity search */
export interface SearchResult {
  /** Unique identifier for the matched vector */
  id: string;
  /** Cosine similarity score (0..1 for normalized vectors, -1..1 otherwise) */
  similarity: number;
  /** Metadata associated with the vector */
  metadata: Record<string, unknown>;
  /** Namespace the vector belongs to */
  namespace?: string;
}

/** Statistics about the vector store */
export interface StoreStats {
  /** Total number of vectors stored */
  totalVectors: number;
  /** Number of distinct namespaces */
  namespaceCount: number;
  /** Vectors per namespace */
  namespaceSizes: Record<string, number>;
  /** Dimensionality of stored vectors (0 if empty) */
  dimensions: number;
  /** Whether the WASM backend is active */
  wasmActive: boolean;
  /** Approximate memory usage in bytes */
  memoryBytes: number;
}

/** Internal entry for a stored vector */
interface VectorEntry {
  vector: Float32Array;
  metadata: Record<string, unknown>;
  namespace: string;
  /** Pre-computed L2 norm for fast cosine similarity */
  norm: number;
}

// ============================================================================
// Math Utilities
// ============================================================================

/**
 * Compute the L2 norm of a vector
 */
function l2Norm(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/**
 * Compute cosine similarity between two vectors
 *
 * cosine_similarity = dot(a, b) / (||a|| * ||b||)
 *
 * Optimized to accept pre-computed norms for repeated queries.
 */
export function cosineSimilarity(
  a: Float32Array,
  b: Float32Array,
  normA?: number,
  normB?: number,
): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }

  const na = normA ?? l2Norm(a);
  const nb = normB ?? l2Norm(b);

  if (na === 0 || nb === 0) {
    return 0;
  }

  return dot / (na * nb);
}

// ============================================================================
// WASM Backend Detection
// ============================================================================

/** Interface for an rvlite WASM module (if available) */
interface RvliteWasmModule {
  add(id: string, vector: Float32Array, namespace?: string): void;
  search(query: Float32Array, k: number, namespace?: string): SearchResult[];
  remove(id: string): boolean;
  count(): number;
}

/**
 * Attempt to load the rvlite WASM module
 * Returns null if unavailable (expected in most environments)
 */
async function tryLoadRvlite(): Promise<RvliteWasmModule | null> {
  try {
    // Dynamic import - will fail gracefully if rvlite is not installed
    const rvlite = await import('rvlite' as string);
    if (rvlite && typeof rvlite.add === 'function') {
      return rvlite as unknown as RvliteWasmModule;
    }
    return null;
  } catch {
    // Expected: rvlite is not installed in most environments
    return null;
  }
}

// ============================================================================
// WasmVectorStore
// ============================================================================

/**
 * Browser-side vector store with optional WASM acceleration.
 *
 * Tries to load `rvlite` for WASM-based vector search. When unavailable,
 * uses a pure TypeScript in-memory implementation with cosine similarity.
 *
 * @example
 * ```typescript
 * const store = new WasmVectorStore();
 * await store.initialize();
 *
 * // Add vectors
 * store.add('pattern-1', new Float32Array([0.1, 0.2, 0.3]), { domain: 'testing' });
 * store.add('pattern-2', new Float32Array([0.4, 0.5, 0.6]), { domain: 'coverage' });
 *
 * // Search
 * const results = store.search(new Float32Array([0.1, 0.2, 0.3]), 5);
 * console.log(results[0].id); // 'pattern-1'
 * console.log(results[0].similarity); // ~1.0
 * ```
 */
export class WasmVectorStore {
  private vectors: Map<string, VectorEntry> = new Map();
  private wasmModule: RvliteWasmModule | null = null;
  private dimensions: number = 0;
  private initialized: boolean = false;

  /**
   * Initialize the vector store
   *
   * Attempts to load the WASM backend. Falls back to TypeScript if unavailable.
   * Safe to call multiple times (idempotent).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.wasmModule = await tryLoadRvlite();
    this.initialized = true;
  }

  /**
   * Add a vector with optional metadata and namespace
   *
   * @param id - Unique identifier for the vector
   * @param vector - The vector data as Float32Array
   * @param metadata - Optional key-value metadata
   * @param namespace - Optional namespace for scoped queries (default: 'default')
   * @throws Error if vector dimensions are inconsistent
   */
  add(
    id: string,
    vector: Float32Array,
    metadata: Record<string, unknown> = {},
    namespace: string = 'default',
  ): void {
    if (vector.length === 0) {
      throw new Error('Cannot add zero-length vector');
    }

    // Enforce consistent dimensionality
    if (this.dimensions === 0) {
      this.dimensions = vector.length;
    } else if (vector.length !== this.dimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.dimensions}, got ${vector.length}`,
      );
    }

    // Delegate to WASM if available
    if (this.wasmModule) {
      this.wasmModule.add(id, vector, namespace);
      // Still keep in JS map for metadata lookups
    }

    const norm = l2Norm(vector);
    this.vectors.set(id, { vector, metadata, namespace, norm });
  }

  /**
   * Search for the k most similar vectors to a query
   *
   * @param query - The query vector
   * @param k - Number of results to return
   * @param namespace - Optional namespace filter (searches all if omitted)
   * @returns Array of SearchResult sorted by descending similarity
   */
  search(query: Float32Array, k: number, namespace?: string): SearchResult[] {
    if (query.length === 0) {
      return [];
    }

    if (this.vectors.size === 0) {
      return [];
    }

    // Dimension check for query
    if (this.dimensions > 0 && query.length !== this.dimensions) {
      throw new Error(
        `Query dimension mismatch: expected ${this.dimensions}, got ${query.length}`,
      );
    }

    const queryNorm = l2Norm(query);
    const results: SearchResult[] = [];

    for (const [id, entry] of this.vectors) {
      // Namespace filter
      if (namespace !== undefined && entry.namespace !== namespace) {
        continue;
      }

      const similarity = cosineSimilarity(query, entry.vector, queryNorm, entry.norm);
      results.push({
        id,
        similarity,
        metadata: { ...entry.metadata },
        namespace: entry.namespace,
      });
    }

    // Sort by descending similarity
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, Math.max(0, k));
  }

  /**
   * Remove a vector by id
   *
   * @param id - The vector id to remove
   * @returns true if the vector was found and removed, false otherwise
   */
  remove(id: string): boolean {
    if (this.wasmModule) {
      this.wasmModule.remove(id);
    }

    const existed = this.vectors.delete(id);

    // Reset dimensions if store is now empty
    if (this.vectors.size === 0) {
      this.dimensions = 0;
    }

    return existed;
  }

  /**
   * Check if a vector exists
   *
   * @param id - The vector id to check
   * @returns true if a vector with this id exists
   */
  has(id: string): boolean {
    return this.vectors.has(id);
  }

  /**
   * Get the number of stored vectors
   */
  get size(): number {
    return this.vectors.size;
  }

  /**
   * Clear all vectors, optionally within a specific namespace
   *
   * @param namespace - If provided, only clear vectors in this namespace
   */
  clear(namespace?: string): void {
    if (namespace === undefined) {
      this.vectors.clear();
      this.dimensions = 0;
    } else {
      for (const [id, entry] of this.vectors) {
        if (entry.namespace === namespace) {
          this.vectors.delete(id);
        }
      }
      if (this.vectors.size === 0) {
        this.dimensions = 0;
      }
    }
  }

  /**
   * Get store statistics
   *
   * @returns StoreStats with counts, dimensions, memory usage, etc.
   */
  getStats(): StoreStats {
    const namespaceSizes: Record<string, number> = {};
    let memoryBytes = 0;

    for (const [, entry] of this.vectors) {
      const ns = entry.namespace;
      namespaceSizes[ns] = (namespaceSizes[ns] || 0) + 1;
      // Approximate: Float32Array bytes + metadata overhead
      memoryBytes += entry.vector.byteLength + 128;
    }

    return {
      totalVectors: this.vectors.size,
      namespaceCount: Object.keys(namespaceSizes).length,
      namespaceSizes,
      dimensions: this.dimensions,
      wasmActive: this.wasmModule !== null,
      memoryBytes,
    };
  }

  /**
   * Get all vector ids, optionally filtered by namespace
   *
   * @param namespace - Optional namespace filter
   * @returns Array of vector ids
   */
  getIds(namespace?: string): string[] {
    if (namespace === undefined) {
      return Array.from(this.vectors.keys());
    }
    const ids: string[] = [];
    for (const [id, entry] of this.vectors) {
      if (entry.namespace === namespace) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Whether the WASM backend is loaded
   */
  get isWasmActive(): boolean {
    return this.wasmModule !== null;
  }
}
