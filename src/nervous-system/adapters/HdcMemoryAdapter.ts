/**
 * HDC Memory Adapter for RuVector Nervous System Integration
 *
 * Provides high-level interface to Hyperdimensional Computing (HDC) memory
 * for QE agent pattern storage and retrieval. HDC enables:
 * - Noise-tolerant pattern matching
 * - One-shot learning of test patterns
 * - Sub-microsecond similarity queries (<100ns target)
 * - Distributed pattern representation (10,000-bit hypervectors)
 *
 * @module nervous-system/adapters/HdcMemoryAdapter
 * @see https://github.com/ruvector/nervous-system-wasm
 */

import {
  Hypervector,
  HdcMemory,
  initNervousSystem,
  isWasmInitialized,
} from '../wasm-loader.js';

import type { TestPattern, PatternType, PatternCategory, TestFramework } from '../../types/pattern.types.js';

/**
 * Configuration options for HdcMemoryAdapter
 */
export interface HdcMemoryConfig {
  /** Similarity threshold for pattern retrieval (0.0 to 1.0) */
  similarityThreshold: number;
  /** Maximum number of results to return from retrieval */
  maxRetrievalResults: number;
  /** Enable automatic WASM initialization */
  autoInit: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_HDC_CONFIG: HdcMemoryConfig = {
  similarityThreshold: 0.7,
  maxRetrievalResults: 10,
  autoInit: true,
};

/**
 * Result from pattern retrieval operations
 */
export interface RetrievalResult {
  /** Pattern key/label */
  key: string;
  /** Similarity score (0.0 to 1.0) */
  similarity: number;
  /** The hypervector (if requested) */
  vector?: Hypervector;
}

/**
 * Simplified pattern interface for HDC encoding
 * Used when the full TestPattern interface is not needed
 */
export interface SimplePattern {
  /** Pattern type identifier */
  type: string;
  /** Domain/category of the pattern */
  domain: string;
  /** Content or description */
  content: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for HDC Memory operations
 * Defines the contract for hyperdimensional computing memory adapters
 */
export interface IHdcMemory {
  /**
   * Initialize the WASM module (required before any operations)
   */
  initialize(): Promise<void>;

  /**
   * Check if the adapter is initialized
   */
  isInitialized(): boolean;

  /**
   * Create a new random hypervector (10,000 bits)
   * @param seed Optional seed for reproducibility (as bigint)
   * @returns New hypervector
   */
  createHypervector(seed?: bigint): Hypervector;

  /**
   * Bind two hypervectors using XOR operation
   * Binding creates associations: bind(A, B) encodes "A relates to B"
   * Properties: associative, commutative, self-inverse (bind(A,A) = identity)
   * @param a First hypervector
   * @param b Second hypervector
   * @returns Bound hypervector
   */
  bind(a: Hypervector, b: Hypervector): Hypervector;

  /**
   * Bundle multiple hypervectors using majority voting
   * Bundling creates superpositions: bundle([A,B,C]) encodes "A or B or C"
   * @param vectors Array of hypervectors to bundle (minimum 3)
   * @returns Bundled hypervector
   */
  bundle(vectors: Hypervector[]): Hypervector;

  /**
   * Compute similarity between two hypervectors
   * Returns value in [-1.0, 1.0]:
   *   1.0  = identical vectors
   *   0.0  = random/orthogonal vectors
   *  -1.0  = completely opposite vectors
   * @param a First hypervector
   * @param b Second hypervector
   * @returns Similarity score
   */
  similarity(a: Hypervector, b: Hypervector): number;

  /**
   * Store a hypervector with a key in associative memory
   * @param key Unique identifier for the pattern
   * @param vector Hypervector to store
   */
  store(key: string, vector: Hypervector): void;

  /**
   * Retrieve patterns similar to query above threshold
   * @param query Query hypervector
   * @param threshold Minimum similarity threshold (0.0 to 1.0)
   * @returns Array of matching results with similarity scores
   */
  retrieve(query: Hypervector, threshold?: number): RetrievalResult[];

  /**
   * Get a stored hypervector by key
   * @param key Pattern key
   * @returns Hypervector if found, undefined otherwise
   */
  get(key: string): Hypervector | undefined;

  /**
   * Check if a key exists in memory
   * @param key Pattern key
   * @returns True if key exists
   */
  has(key: string): boolean;

  /**
   * Clear all stored patterns
   */
  clear(): void;

  /**
   * Get number of stored patterns
   */
  size(): number;

  /**
   * Encode a QE TestPattern to a hypervector
   * @param pattern Test pattern to encode
   * @returns Encoded hypervector
   */
  encodePattern(pattern: TestPattern | SimplePattern): Hypervector;

  /**
   * Decode a hypervector to partial pattern information
   * Note: HDC is lossy, so only approximate reconstruction is possible
   * @param vector Hypervector to decode
   * @returns Partial pattern with best-match type and domain
   */
  decodePattern(vector: Hypervector): Partial<SimplePattern>;

  /**
   * Find top-k most similar patterns to query
   * @param query Query hypervector
   * @param k Number of results to return
   * @returns Array of top-k matching results
   */
  topK(query: Hypervector, k: number): RetrievalResult[];
}

/**
 * HDC Memory Adapter Implementation
 *
 * Wraps the WASM Hypervector and HdcMemory classes to provide
 * a high-level interface for QE agent pattern operations.
 *
 * @example
 * ```typescript
 * const adapter = new HdcMemoryAdapter();
 * await adapter.initialize();
 *
 * // Create and store patterns
 * const pattern: SimplePattern = {
 *   type: 'edge-case',
 *   domain: 'unit-test',
 *   content: 'null input handling'
 * };
 * const vector = adapter.encodePattern(pattern);
 * adapter.store('pattern-001', vector);
 *
 * // Query for similar patterns
 * const results = adapter.retrieve(vector, 0.8);
 * console.log(`Found ${results.length} similar patterns`);
 * ```
 */
export class HdcMemoryAdapter implements IHdcMemory {
  private memory: HdcMemory | null = null;
  private initialized = false;
  private readonly config: HdcMemoryConfig;

  /**
   * Codebook for encoding pattern types to hypervectors
   * Each type gets a unique random hypervector for binding
   */
  private typeCodebook: Map<string, Hypervector> = new Map();

  /**
   * Codebook for encoding domains/categories to hypervectors
   */
  private domainCodebook: Map<string, Hypervector> = new Map();

  /**
   * Codebook for encoding frameworks to hypervectors
   */
  private frameworkCodebook: Map<string, Hypervector> = new Map();

  /**
   * Base vectors for role encoding (TYPE, DOMAIN, CONTENT, FRAMEWORK)
   */
  private roleVectors: {
    type: Hypervector | null;
    domain: Hypervector | null;
    content: Hypervector | null;
    framework: Hypervector | null;
  } = {
    type: null,
    domain: null,
    content: null,
    framework: null,
  };

  /**
   * Local tracking of stored patterns for serialization
   * (WASM HdcMemory doesn't expose pattern iteration)
   */
  private storedPatterns: Map<string, { vector: Hypervector; metadata?: Record<string, unknown> }> =
    new Map();

  /**
   * Create a new HdcMemoryAdapter
   * @param config Optional configuration overrides
   */
  constructor(config: Partial<HdcMemoryConfig> = {}) {
    this.config = { ...DEFAULT_HDC_CONFIG, ...config };
  }

  /**
   * Initialize the WASM module for Node.js environment
   *
   * Must be called before any other operations.
   * Loads the WASM binary and initializes all codebooks.
   *
   * @throws Error if WASM file cannot be loaded
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Use shared WASM loader
      await initNervousSystem();

      // Create the HDC memory instance
      this.memory = new HdcMemory();

      // Initialize role vectors (used for structured encoding)
      this.roleVectors.type = Hypervector.random();
      this.roleVectors.domain = Hypervector.random();
      this.roleVectors.content = Hypervector.random();
      this.roleVectors.framework = Hypervector.random();

      // Initialize codebooks with known pattern types
      this.initializeCodebooks();

      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize HdcMemoryAdapter: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Initialize codebooks with predefined pattern types and domains
   */
  private initializeCodebooks(): void {
    // Pattern types from PatternType enum
    const patternTypes = [
      'edge-case',
      'boundary-condition',
      'error-handling',
      'integration',
      'async-pattern',
      'mock-pattern',
      'assertion-pattern',
      'setup-teardown',
      'data-driven',
      'parameterized',
    ];

    for (const type of patternTypes) {
      this.typeCodebook.set(type, Hypervector.random());
    }

    // Pattern categories from PatternCategory enum
    const domains = [
      'unit-test',
      'integration-test',
      'e2e-test',
      'performance-test',
      'security-test',
    ];

    for (const domain of domains) {
      this.domainCodebook.set(domain, Hypervector.random());
    }

    // Test frameworks from TestFramework enum
    const frameworks = [
      'jest',
      'mocha',
      'cypress',
      'vitest',
      'jasmine',
      'ava',
    ];

    for (const framework of frameworks) {
      this.frameworkCodebook.set(framework, Hypervector.random());
    }
  }

  /**
   * Check if the adapter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the adapter is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.memory) {
      throw new Error(
        'HdcMemoryAdapter not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Create a new hypervector
   * @param seed Optional seed for reproducibility
   * @returns New 10,000-bit hypervector
   */
  createHypervector(seed?: bigint): Hypervector {
    this.ensureInitialized();

    if (seed !== undefined) {
      return Hypervector.from_seed(seed);
    }
    return Hypervector.random();
  }

  /**
   * Bind two hypervectors using XOR
   * @param a First hypervector
   * @param b Second hypervector
   * @returns Bound hypervector
   */
  bind(a: Hypervector, b: Hypervector): Hypervector {
    this.ensureInitialized();
    return a.bind(b);
  }

  /**
   * Bundle multiple hypervectors using majority voting
   *
   * For arrays smaller than 3, uses repeated bundling with padding.
   * For larger arrays, chains bundle_3 operations.
   *
   * @param vectors Array of hypervectors to bundle
   * @returns Bundled hypervector
   * @throws Error if vectors array is empty
   */
  bundle(vectors: Hypervector[]): Hypervector {
    this.ensureInitialized();

    if (vectors.length === 0) {
      throw new Error('Cannot bundle empty array of vectors');
    }

    if (vectors.length === 1) {
      return vectors[0];
    }

    if (vectors.length === 2) {
      // For 2 vectors, add a random tiebreaker
      const tiebreaker = Hypervector.random();
      return Hypervector.bundle_3(vectors[0], vectors[1], tiebreaker);
    }

    if (vectors.length === 3) {
      return Hypervector.bundle_3(vectors[0], vectors[1], vectors[2]);
    }

    // For more than 3, chain bundle operations
    // Bundle first 3, then iteratively bundle with pairs
    let result = Hypervector.bundle_3(vectors[0], vectors[1], vectors[2]);

    for (let i = 3; i < vectors.length; i += 2) {
      if (i + 1 < vectors.length) {
        result = Hypervector.bundle_3(result, vectors[i], vectors[i + 1]);
      } else {
        // Odd remaining element - use random tiebreaker
        const tiebreaker = Hypervector.random();
        result = Hypervector.bundle_3(result, vectors[i], tiebreaker);
      }
    }

    return result;
  }

  /**
   * Compute similarity between two hypervectors
   * @param a First hypervector
   * @param b Second hypervector
   * @returns Similarity score in [-1.0, 1.0]
   */
  similarity(a: Hypervector, b: Hypervector): number {
    this.ensureInitialized();
    return a.similarity(b);
  }

  /**
   * Store a hypervector with a key
   *
   * Note: The WASM store operation consumes the vector (move semantics).
   * If you need to keep using the vector after storing, create a clone first
   * using `Hypervector.from_bytes(vector.to_bytes())`.
   *
   * @param key Unique identifier
   * @param vector Hypervector to store (will be consumed)
   */
  store(key: string, vector: Hypervector): void {
    this.ensureInitialized();
    // Clone the vector before storing to preserve the original
    const bytes = vector.to_bytes();
    const clone = Hypervector.from_bytes(bytes);
    this.memory!.store(key, clone);

    // Track locally for serialization (clone again for our map)
    const trackingClone = Hypervector.from_bytes(bytes);
    this.storedPatterns.set(key, { vector: trackingClone });
  }

  /**
   * Retrieve patterns similar to query
   * @param query Query hypervector
   * @param threshold Minimum similarity (default from config)
   * @returns Array of matching results
   */
  retrieve(query: Hypervector, threshold?: number): RetrievalResult[] {
    this.ensureInitialized();

    const actualThreshold = threshold ?? this.config.similarityThreshold;

    try {
      const rawResults = this.memory!.retrieve(query, actualThreshold);

      // Convert raw results to typed array
      if (!Array.isArray(rawResults)) {
        return [];
      }

      const results: RetrievalResult[] = [];
      for (const item of rawResults) {
        if (Array.isArray(item) && item.length >= 2) {
          results.push({
            key: String(item[0]),
            similarity: Number(item[1]),
          });
        }
      }

      // Sort by similarity descending and limit results
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, this.config.maxRetrievalResults);
    } catch (error) {
      // Handle potential WASM errors gracefully
      console.warn('HDC retrieve error:', error);
      return [];
    }
  }

  /**
   * Get a stored hypervector by key
   * @param key Pattern key
   * @returns Hypervector if found
   */
  get(key: string): Hypervector | undefined {
    this.ensureInitialized();
    return this.memory!.get(key);
  }

  /**
   * Check if a key exists
   * @param key Pattern key
   * @returns True if exists
   */
  has(key: string): boolean {
    this.ensureInitialized();
    return this.memory!.has(key);
  }

  /**
   * Clear all stored patterns
   */
  clear(): void {
    this.ensureInitialized();
    this.memory!.clear();
  }

  /**
   * Get number of stored patterns
   */
  size(): number {
    this.ensureInitialized();
    return this.memory!.size;
  }

  /**
   * Find top-k most similar patterns
   * @param query Query hypervector
   * @param k Number of results
   * @returns Top-k matching results
   */
  topK(query: Hypervector, k: number): RetrievalResult[] {
    this.ensureInitialized();

    try {
      const rawResults = this.memory!.top_k(query, k);

      if (!Array.isArray(rawResults)) {
        return [];
      }

      const results: RetrievalResult[] = [];
      for (const item of rawResults) {
        if (Array.isArray(item) && item.length >= 2) {
          results.push({
            key: String(item[0]),
            similarity: Number(item[1]),
          });
        }
      }

      return results;
    } catch (error) {
      console.warn('HDC top_k error:', error);
      return [];
    }
  }

  /**
   * Encode a pattern to a hypervector
   *
   * Uses structured encoding with role-filler binding:
   * - TYPE role bound to type hypervector
   * - DOMAIN role bound to domain hypervector
   * - CONTENT encoded via hash-based seeding
   * - FRAMEWORK role bound to framework hypervector (if present)
   *
   * Final pattern is the bundle of all role-filler pairs.
   *
   * @param pattern Pattern to encode
   * @returns Encoded hypervector
   */
  encodePattern(pattern: TestPattern | SimplePattern): Hypervector {
    this.ensureInitialized();

    const temporaryVectors: Hypervector[] = [];
    const components: Hypervector[] = [];

    try {
      // Encode type
      const typeStr = this.getPatternType(pattern);
      const typeVec = this.getOrCreateCodebookEntry(this.typeCodebook, typeStr);
      const typeBound = this.roleVectors.type!.bind(typeVec);
      temporaryVectors.push(typeBound);
      components.push(typeBound);

      // Encode domain
      const domainStr = this.getPatternDomain(pattern);
      const domainVec = this.getOrCreateCodebookEntry(this.domainCodebook, domainStr);
      const domainBound = this.roleVectors.domain!.bind(domainVec);
      temporaryVectors.push(domainBound);
      components.push(domainBound);

      // Encode content via hash-based seeding
      const contentStr = this.getPatternContent(pattern);
      const contentHash = this.hashString(contentStr);
      const contentVec = Hypervector.from_seed(contentHash);
      temporaryVectors.push(contentVec);
      const contentBound = this.roleVectors.content!.bind(contentVec);
      temporaryVectors.push(contentBound);
      components.push(contentBound);

      // Encode framework if present (for full TestPattern)
      if (this.isTestPattern(pattern) && pattern.framework) {
        const frameworkStr = String(pattern.framework);
        const frameworkVec = this.getOrCreateCodebookEntry(
          this.frameworkCodebook,
          frameworkStr
        );
        const frameworkBound = this.roleVectors.framework!.bind(frameworkVec);
        temporaryVectors.push(frameworkBound);
        components.push(frameworkBound);
      }

      // Bundle all components
      const result = this.bundle(components);

      // Clone the result before freeing temporaries
      const resultBytes = result.to_bytes();
      const clonedResult = Hypervector.from_bytes(resultBytes);

      // Free bundle result if different from components
      if (!components.includes(result)) {
        temporaryVectors.push(result);
      }

      return clonedResult;
    } finally {
      // Note: We don't free temporaryVectors here because they may be
      // reused by bundle. The WASM runtime will handle cleanup.
      // If memory issues occur, uncomment the following:
      // for (const vec of temporaryVectors) {
      //   try { vec.free(); } catch { /* ignore */ }
      // }
    }
  }

  /**
   * Type guard to check if pattern is a full TestPattern
   */
  private isTestPattern(pattern: TestPattern | SimplePattern): pattern is TestPattern {
    return 'framework' in pattern && 'id' in pattern && 'name' in pattern;
  }

  /**
   * Decode a hypervector to partial pattern information
   *
   * Since HDC encoding is lossy, this performs best-match retrieval
   * against the codebooks to determine the most likely type and domain.
   *
   * @param vector Hypervector to decode
   * @returns Partial pattern with best-match type and domain
   */
  decodePattern(vector: Hypervector): Partial<SimplePattern> {
    this.ensureInitialized();

    const result: Partial<SimplePattern> = {};
    const temporaryVectors: Hypervector[] = [];

    try {
      // Decode type by unbinding and finding best match
      // XOR is self-inverse: vector.bind(roleType) "extracts" the type component
      const typeUnbound = vector.bind(this.roleVectors.type!);
      temporaryVectors.push(typeUnbound);
      let bestTypeSimilarity = -1;
      let bestType = '';

      this.typeCodebook.forEach((typeVec, type) => {
        const sim = typeUnbound.similarity(typeVec);
        if (sim > bestTypeSimilarity) {
          bestTypeSimilarity = sim;
          bestType = type;
        }
      });

      if (bestTypeSimilarity > 0.3) {
        result.type = bestType;
      }

      // Decode domain by unbinding and finding best match
      const domainUnbound = vector.bind(this.roleVectors.domain!);
      temporaryVectors.push(domainUnbound);
      let bestDomainSimilarity = -1;
      let bestDomain = '';

      this.domainCodebook.forEach((domainVec, domain) => {
        const sim = domainUnbound.similarity(domainVec);
        if (sim > bestDomainSimilarity) {
          bestDomainSimilarity = sim;
          bestDomain = domain;
        }
      });

      if (bestDomainSimilarity > 0.3) {
        result.domain = bestDomain;
      }

      // Content cannot be decoded (hash is one-way)
      // but we can indicate that metadata might be reconstructable
      result.metadata = {
        decodedAt: new Date().toISOString(),
        typeConfidence: bestTypeSimilarity,
        domainConfidence: bestDomainSimilarity,
      };

      return result;
    } finally {
      // Clean up temporary vectors
      for (const vec of temporaryVectors) {
        try {
          vec.free();
        } catch {
          // Ignore errors during cleanup
        }
      }
    }
  }

  /**
   * Get or create a codebook entry for a value
   */
  private getOrCreateCodebookEntry(
    codebook: Map<string, Hypervector>,
    value: string
  ): Hypervector {
    let vec = codebook.get(value);
    if (!vec) {
      vec = Hypervector.random();
      codebook.set(value, vec);
    }
    return vec;
  }

  /**
   * Extract type string from pattern
   */
  private getPatternType(pattern: TestPattern | SimplePattern): string {
    // Both TestPattern and SimplePattern have 'type' property
    const patternType = pattern.type;
    if (typeof patternType === 'string') {
      return patternType;
    }
    // TestPattern.type is PatternType enum, SimplePattern.type is string
    return String(patternType);
  }

  /**
   * Extract domain string from pattern
   */
  private getPatternDomain(pattern: TestPattern | SimplePattern): string {
    if ('domain' in pattern) {
      return pattern.domain;
    }
    if (this.isTestPattern(pattern) && 'category' in pattern) {
      return typeof pattern.category === 'string'
        ? pattern.category
        : String(pattern.category);
    }
    return 'unknown';
  }

  /**
   * Extract content string from pattern
   */
  private getPatternContent(pattern: TestPattern | SimplePattern): string {
    if ('content' in pattern) {
      return pattern.content;
    }
    if (this.isTestPattern(pattern) && 'name' in pattern) {
      return pattern.name;
    }
    return '';
  }

  /**
   * Hash a string to a bigint seed for reproducible hypervector generation
   * Uses FNV-1a hash algorithm for good distribution
   */
  private hashString(str: string): bigint {
    // FNV-1a 64-bit hash
    const FNV_PRIME = BigInt('0x00000100000001B3');
    const FNV_OFFSET = BigInt('0xcbf29ce484222325');
    const MASK_64 = BigInt('0xFFFFFFFFFFFFFFFF');

    let hash = FNV_OFFSET;

    for (let i = 0; i < str.length; i++) {
      hash ^= BigInt(str.charCodeAt(i));
      hash = (hash * FNV_PRIME) & MASK_64;
    }

    return hash;
  }

  /**
   * Get the current configuration
   */
  getConfig(): HdcMemoryConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param updates Partial configuration updates
   */
  updateConfig(updates: Partial<HdcMemoryConfig>): void {
    Object.assign(this.config, updates);
  }

  /**
   * Get statistics about the memory state
   */
  getStats(): {
    initialized: boolean;
    size: number;
    typeCodebookSize: number;
    domainCodebookSize: number;
    frameworkCodebookSize: number;
  } {
    return {
      initialized: this.initialized,
      size: this.initialized ? this.size() : 0,
      typeCodebookSize: this.typeCodebook.size,
      domainCodebookSize: this.domainCodebook.size,
      frameworkCodebookSize: this.frameworkCodebook.size,
    };
  }

  /**
   * Dispose of WASM resources
   * Call this when done using the adapter to free memory
   */
  dispose(): void {
    if (this.memory) {
      this.memory.free();
      this.memory = null;
    }

    // Free role vectors
    const roleKeys: Array<keyof typeof this.roleVectors> = ['type', 'domain', 'content', 'framework'];
    for (const key of roleKeys) {
      if (this.roleVectors[key]) {
        this.roleVectors[key]!.free();
        this.roleVectors[key] = null;
      }
    }

    // Free codebook vectors
    this.typeCodebook.forEach((vec) => vec.free());
    this.typeCodebook.clear();

    this.domainCodebook.forEach((vec) => vec.free());
    this.domainCodebook.clear();

    this.frameworkCodebook.forEach((vec) => vec.free());
    this.frameworkCodebook.clear();

    // Free stored pattern vectors
    this.storedPatterns.forEach(({ vector }) => vector.free());
    this.storedPatterns.clear();

    this.initialized = false;
  }

  // ============================================
  // Serialization Methods
  // ============================================

  /**
   * Get codebooks for serialization
   * @returns Object containing all codebooks
   */
  getCodebooks(): {
    type: Map<string, Hypervector>;
    domain: Map<string, Hypervector>;
    framework: Map<string, Hypervector>;
  } {
    return {
      type: this.typeCodebook,
      domain: this.domainCodebook,
      framework: this.frameworkCodebook,
    };
  }

  /**
   * Get role vectors for serialization
   * @returns Object containing all role vectors
   */
  getRoleVectors(): {
    type: Hypervector;
    domain: Hypervector;
    content: Hypervector;
    framework: Hypervector;
  } {
    this.ensureInitialized();
    return {
      type: this.roleVectors.type!,
      domain: this.roleVectors.domain!,
      content: this.roleVectors.content!,
      framework: this.roleVectors.framework!,
    };
  }

  /**
   * Get all stored patterns for serialization
   * @returns Map of pattern keys to vectors and metadata
   */
  getStoredPatterns(): Map<string, { vector: Hypervector; metadata?: Record<string, unknown> }> {
    this.ensureInitialized();
    // Return the locally tracked patterns
    return this.storedPatterns;
  }

  /**
   * Get the hypervector dimension
   * @returns Dimension (default 10000)
   */
  getDimension(): number {
    return 10000; // Default HDC dimension
  }

  /**
   * Restore codebooks from serialized state
   * @param codebooks Codebook maps to restore
   */
  restoreCodebooks(codebooks: {
    type: Map<string, Hypervector>;
    domain: Map<string, Hypervector>;
    framework: Map<string, Hypervector>;
  }): void {
    this.ensureInitialized();

    // Free existing codebook vectors
    this.typeCodebook.forEach((vec) => vec.free());
    this.domainCodebook.forEach((vec) => vec.free());
    this.frameworkCodebook.forEach((vec) => vec.free());

    // Restore codebooks
    this.typeCodebook = codebooks.type;
    this.domainCodebook = codebooks.domain;
    this.frameworkCodebook = codebooks.framework;
  }

  /**
   * Restore role vectors from serialized state
   * @param roleVectors Role vectors to restore
   */
  restoreRoleVectors(roleVectors: {
    type: Hypervector;
    domain: Hypervector;
    content: Hypervector;
    framework: Hypervector;
  }): void {
    this.ensureInitialized();

    // Free existing role vectors
    if (this.roleVectors.type) this.roleVectors.type.free();
    if (this.roleVectors.domain) this.roleVectors.domain.free();
    if (this.roleVectors.content) this.roleVectors.content.free();
    if (this.roleVectors.framework) this.roleVectors.framework.free();

    // Restore role vectors
    this.roleVectors.type = roleVectors.type;
    this.roleVectors.domain = roleVectors.domain;
    this.roleVectors.content = roleVectors.content;
    this.roleVectors.framework = roleVectors.framework;
  }

  /**
   * Restore patterns from serialized state
   * @param patterns Map of patterns to restore
   */
  restorePatterns(
    patterns: Map<string, { vector: Hypervector; metadata?: Record<string, unknown> }>
  ): void {
    this.ensureInitialized();

    // Restore each pattern to the HDC memory
    for (const [key, { vector }] of patterns) {
      this.store(key, vector);
    }
  }
}

// Re-export types for convenience
export type { TestPattern, PatternType, PatternCategory, TestFramework };
