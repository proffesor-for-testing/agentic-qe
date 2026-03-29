/**
 * Agentic QE v3 - Pattern Store with HNSW Indexing
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Provides persistent pattern storage with HNSW vector indexing for
 * O(log n) approximate nearest neighbor search.
 */

import { v4 as uuidv4 } from 'uuid';
import type { MemoryBackend } from '../kernel/interfaces.js';
import type { Result } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import { toErrorMessage, toError } from '../shared/error-utils.js';
import {
  QEPattern,
  QEPatternContext,
  QEPatternTemplate,
  QEPatternType,
  QEDomain,
  CreateQEPatternOptions,
  calculateQualityScore,
  shouldPromotePattern,
  validateQEPattern,
  mapQEDomainToAQE,
  PROMOTION_THRESHOLD,
} from './qe-patterns.js';
import type { FilterExpression } from '../integrations/ruvector/interfaces.js';
import { applyFilterSync } from '../integrations/ruvector/filter-adapter.js';
import {
  isHDCFingerprintingEnabled,
  isDeltaEventSourcingEnabled,
} from '../integrations/ruvector/feature-flags.js';
import {
  HdcFingerprinter,
  createHdcFingerprinter,
  type PatternFingerprint,
} from '../integrations/ruvector/hdc-fingerprint.js';
import { DeltaTracker } from '../integrations/ruvector/delta-tracker.js';

// ============================================================================
// R1: HDC Fingerprint Singleton (lazy-initialized)
// ============================================================================

/** Module-level HDC fingerprinter, created on first use */
let hdcFingerprinter: HdcFingerprinter | null = null;

function getHdcFingerprinter(): HdcFingerprinter {
  if (!hdcFingerprinter) {
    hdcFingerprinter = createHdcFingerprinter({ dimensions: 10000 });
  }
  return hdcFingerprinter;
}

// ============================================================================
// Pattern Store Configuration
// ============================================================================

/**
 * Token tracking configuration (ADR-042)
 */
export interface TokenTrackingConfig {
  /** Enable token tracking */
  enabled: boolean;

  /** Track input and output tokens separately */
  trackInputOutput: boolean;

  /** Estimate costs based on token usage */
  estimateCosts: boolean;

  /** Cost per input token (e.g., 0.003 / 1000 = 0.000003) */
  costPerInputToken: number;

  /** Cost per output token (e.g., 0.015 / 1000 = 0.000015) */
  costPerOutputToken: number;
}

/**
 * Reuse optimization configuration (ADR-042)
 */
export interface ReuseOptimizationConfig {
  /** Enable pattern reuse optimization */
  enabled: boolean;

  /** Minimum similarity threshold for reuse (0-1) */
  minSimilarityForReuse: number;

  /** Minimum success rate required for reuse (0-1) */
  minSuccessRateForReuse: number;

  /** Maximum age in days for pattern reuse */
  maxAgeForReuse: number;
}

/**
 * Pattern store configuration
 */
export interface PatternStoreConfig {
  /** Namespace for pattern storage keys */
  namespace: string;

  /** Dimension of embedding vectors */
  embeddingDimension: number;

  /** HNSW configuration */
  hnsw: {
    M: number;
    efConstruction: number;
    efSearch: number;
    maxElements: number;
  };

  /** Promotion threshold (successful uses required) */
  promotionThreshold: number;

  /** Minimum confidence for storage */
  minConfidence: number;

  /** Maximum patterns per domain */
  maxPatternsPerDomain: number;

  /** Enable automatic cleanup of low-quality patterns */
  autoCleanup: boolean;

  /** Cleanup interval in milliseconds */
  cleanupIntervalMs: number;

  /** Token tracking configuration (ADR-042) */
  tokenTracking: TokenTrackingConfig;

  /** Reuse optimization configuration (ADR-042) */
  reuseOptimization: ReuseOptimizationConfig;
}

/**
 * Default pattern store configuration
 */
export const DEFAULT_PATTERN_STORE_CONFIG: PatternStoreConfig = {
  namespace: 'qe-patterns',
  embeddingDimension: 384, // Native all-MiniLM-L6-v2 dimension
  hnsw: {
    M: 16,
    efConstruction: 200,
    efSearch: 100,
    maxElements: 50000,
  },
  promotionThreshold: PROMOTION_THRESHOLD,
  minConfidence: 0.3,
  maxPatternsPerDomain: 5000,
  autoCleanup: true,
  cleanupIntervalMs: 3600000, // 1 hour
  tokenTracking: {
    enabled: true,
    trackInputOutput: true,
    estimateCosts: true,
    costPerInputToken: 0.000003, // $0.003 per 1K tokens
    costPerOutputToken: 0.000015, // $0.015 per 1K tokens
  },
  reuseOptimization: {
    enabled: true,
    minSimilarityForReuse: 0.85,
    minSuccessRateForReuse: 0.90,
    maxAgeForReuse: 7, // 7 days
  },
};

// ============================================================================
// Pattern Store Statistics
// ============================================================================

/**
 * Pattern store statistics
 */
export interface PatternStoreStats {
  /** Total patterns stored */
  totalPatterns: number;

  /** Patterns by tier */
  byTier: {
    shortTerm: number;
    longTerm: number;
  };

  /** Patterns by domain */
  byDomain: Record<QEDomain, number>;

  /** Patterns by type */
  byType: Record<QEPatternType, number>;

  /** Average confidence score */
  avgConfidence: number;

  /** Average quality score */
  avgQualityScore: number;

  /** Average success rate */
  avgSuccessRate: number;

  /** Search operations count */
  searchOperations: number;

  /** Average search latency (ms) */
  avgSearchLatencyMs: number;

  /** HNSW index stats */
  hnswStats: {
    nativeAvailable: boolean;
    vectorCount: number;
    indexSizeBytes: number;
  };
}

// ============================================================================
// Pattern Search Options
// ============================================================================

/**
 * Options for pattern search
 */
export interface PatternSearchOptions {
  /** Maximum number of results */
  limit?: number;

  /** Filter by pattern type */
  patternType?: QEPatternType;

  /** Filter by QE domain */
  domain?: QEDomain;

  /** Filter by tier */
  tier?: 'short-term' | 'long-term';

  /** Minimum confidence threshold */
  minConfidence?: number;

  /** Minimum quality score */
  minQualityScore?: number;

  /** Context to match against */
  context?: Partial<QEPatternContext>;

  /** Include vector similarity search */
  useVectorSearch?: boolean;

  /**
   * Composable metadata filter expression (Task 1.2: ruvector-filter).
   * Applied post-search to refine results by domain, severity,
   * confidence range, tags, date range, etc.
   * When undefined, no additional filtering is applied (backward compatible).
   */
  filter?: FilterExpression;
}

/**
 * Pattern search result with reuse optimization (ADR-042)
 */
export interface PatternSearchResult {
  /** The matched pattern */
  pattern: QEPattern;

  /** Match score (0-1) */
  score: number;

  /** How the pattern was matched */
  matchType: 'vector' | 'exact' | 'context';

  /** Similarity score for vector matches (ADR-042) */
  similarity: number;

  /** Whether this pattern can be reused to skip LLM calls (ADR-042) */
  canReuse: boolean;

  /** Estimated tokens saved if this pattern is reused (ADR-042) */
  estimatedTokenSavings: number;

  /** Confidence level for reusing this pattern (0-1) (ADR-042) */
  reuseConfidence: number;
}

// ============================================================================
// Pattern Store Interface
// ============================================================================

/**
 * Interface for pattern store operations
 */
export interface IPatternStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Store a new pattern */
  store(pattern: QEPattern): Promise<Result<string>>;

  /** Create and store a pattern from options */
  create(options: CreateQEPatternOptions): Promise<Result<QEPattern>>;

  /** Get pattern by ID */
  get(id: string): Promise<QEPattern | null>;

  /** Search for patterns */
  search(
    query: string | number[],
    options?: PatternSearchOptions
  ): Promise<Result<PatternSearchResult[]>>;

  /** Update pattern after use */
  recordUsage(
    id: string,
    success: boolean
  ): Promise<Result<void>>;

  /** Promote pattern from short-term to long-term */
  promote(id: string): Promise<Result<void>>;

  /** Delete a pattern */
  delete(id: string): Promise<Result<void>>;

  /** Get store statistics */
  getStats(): Promise<PatternStoreStats>;

  /** Run cleanup to remove low-quality patterns */
  cleanup(): Promise<{ removed: number; promoted: number }>;

  /** Dispose the store */
  dispose(): Promise<void>;
}

// ============================================================================
// Pattern Store Implementation
// ============================================================================

/**
 * Pattern Store with HNSW indexing
 *
 * Provides O(log n) pattern search using HNSW approximate nearest neighbor.
 */
export class PatternStore implements IPatternStore {
  private readonly config: PatternStoreConfig;
  private initialized = false;
  private cleanupTimer?: NodeJS.Timeout;

  // Optional SQLite persistence delegate for delete/promote
  private sqliteStore: import('./sqlite-persistence.js').SQLitePatternStore | null = null;
  private loadingPromise: Promise<void> | null = null;

  // In-memory caches for fast access
  private patternCache: Map<string, QEPattern> = new Map();
  private domainIndex: Map<QEDomain, Set<string>> = new Map();
  private typeIndex: Map<QEPatternType, Set<string>> = new Map();
  private tierIndex: Map<'short-term' | 'long-term', Set<string>> = new Map();

  // HNSW index for vector search (lazy loaded - ADR-048)
  // Using dynamic import type since HNSWIndex is lazily loaded
  private hnswIndex: import('../domains/coverage-analysis/services/hnsw-index.js').IHNSWIndex | null = null;
  private hnswAvailable = false;
  private hnswInitPromise: Promise<void> | null = null;

  // R1: HDC fingerprint cache (pattern ID -> fingerprint vector)
  private hdcCache: Map<string, Uint8Array> = new Map();

  // R3: Delta event sourcing tracker (lazy-initialized with SQLite)
  private deltaTracker: DeltaTracker | null = null;

  // Statistics
  private stats = {
    searchOperations: 0,
    searchLatencies: [] as number[],
  };

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<PatternStoreConfig> = {}
  ) {
    this.config = { ...DEFAULT_PATTERN_STORE_CONFIG, ...config };
  }

  /**
   * Set SQLite persistence delegate and load patterns into memory.
   *
   * When set, PatternStore will:
   * 1. Load existing patterns from SQLite into the in-memory cache
   * 2. Forward create/delete/promote operations to SQLite for persistence
   * 3. Persist embeddings alongside patterns on store()
   */
  setSqliteStore(store: import('./sqlite-persistence.js').SQLitePatternStore): void {
    this.sqliteStore = store;

    // R3: Initialize DeltaTracker using the same SQLite DB instance
    if (isDeltaEventSourcingEnabled() && !this.deltaTracker) {
      try {
        const db = store.getDb();
        this.deltaTracker = new DeltaTracker(db);
        this.deltaTracker.initialize();
        console.log('[PatternStore] Delta event sourcing initialized');
      } catch (e) {
        console.warn('[PatternStore] Delta tracker init failed:', e instanceof Error ? e.message : e);
      }
    }

    // Load patterns from SQLite if we're already initialized
    // (setSqliteStore is called after initialize() in QEReasoningBank)
    // Store promise so concurrent store/search calls can await it
    if (this.initialized) {
      this.loadingPromise = this.loadPatterns().catch((e) =>
        console.warn('[PatternStore] Failed to load patterns after setSqliteStore:', e)
      ).finally(() => {
        this.loadingPromise = null;
      });
    }
  }

  /**
   * Initialize the pattern store
   *
   * Note: HNSW is lazy-loaded (ADR-048) - only initialized when
   * vector search is actually needed, not on every CLI invocation.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize indices
    this.tierIndex.set('short-term', new Set());
    this.tierIndex.set('long-term', new Set());

    // HNSW is now lazy-loaded via ensureHNSW() when needed
    // This saves ~5-10 seconds on CLI startup for non-search commands

    // Load existing patterns from memory
    await this.loadPatterns();

    // Start cleanup timer if enabled
    if (this.config.autoCleanup) {
      this.cleanupTimer = setInterval(
        () => this.cleanup(),
        this.config.cleanupIntervalMs
      );
    }

    this.initialized = true;
  }

  /**
   * Ensure HNSW index is initialized (lazy loading - ADR-048)
   *
   * This method lazily initializes HNSW only when vector search is
   * actually needed. This avoids the 5-10 second startup cost for
   * CLI commands that don't use pattern search (migrate, status, etc.)
   *
   * @returns The HNSW index instance, or null if not available
   */
  private async ensureHNSW(): Promise<import('../domains/coverage-analysis/services/hnsw-index.js').IHNSWIndex | null> {
    // Already initialized
    if (this.hnswIndex !== null) {
      return this.hnswIndex;
    }

    // Already marked as unavailable
    if (this.hnswAvailable === false && this.hnswInitPromise === null) {
      // Check if we've already tried and failed
      if (this.hnswIndex === null && this.hnswAvailable === false) {
        // First time - try to initialize
      } else {
        return null;
      }
    }

    // If already initializing, wait for it
    if (this.hnswInitPromise) {
      await this.hnswInitPromise;
      return this.hnswIndex;
    }

    // Start initialization
    this.hnswInitPromise = this.initializeHNSWInternal();
    await this.hnswInitPromise;
    this.hnswInitPromise = null;

    return this.hnswIndex;
  }

  /**
   * Internal HNSW initialization with timeout protection
   */
  private async initializeHNSWInternal(): Promise<void> {
    try {
      // Try to import and use the existing HNSWIndex
      const { HNSWIndex } = await import(
        '../domains/coverage-analysis/services/hnsw-index.js'
      );

      this.hnswIndex = new HNSWIndex(this.memory, {
        dimensions: this.config.embeddingDimension,
        M: this.config.hnsw.M,
        efConstruction: this.config.hnsw.efConstruction,
        efSearch: this.config.hnsw.efSearch,
        maxElements: this.config.hnsw.maxElements,
        namespace: `${this.config.namespace}:hnsw`,
        metric: 'cosine',
      });

      // Add timeout to prevent hanging on problematic databases
      const timeoutMs = 5000;
      const initPromise = this.hnswIndex.initialize();
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('HNSW init timeout')), timeoutMs)
      );

      await Promise.race([initPromise, timeoutPromise]);
      this.hnswAvailable = this.hnswIndex.isNativeAvailable();

      // Load existing embeddings from SQLite into HNSW index (capped to prevent timeout)
      if (this.sqliteStore) {
        try {
          const embeddings = this.sqliteStore.getAllEmbeddings();
          const maxBootstrap = this.config.hnsw.maxElements;
          let loaded = 0;
          for (const { patternId, embedding } of embeddings) {
            if (loaded >= maxBootstrap) break;
            if (!embedding || embedding.length !== this.config.embeddingDimension) continue;
            const pattern = this.patternCache.get(patternId);
            if (!pattern) continue;
            try {
              await this.hnswIndex.insert(patternId, embedding, {
                filePath: pattern.patternType,
                lineCoverage: pattern.confidence * 100,
                branchCoverage: pattern.qualityScore * 100,
                functionCoverage: 0,
                statementCoverage: 0,
                uncoveredLineCount: 0,
                uncoveredBranchCount: 0,
                riskScore: 1 - pattern.confidence,
                lastUpdated: Date.now(),
                totalLines: 0,
              } as import('../domains/coverage-analysis/services/hnsw-index.js').CoverageVectorMetadata);
              loaded++;
            } catch {
              // Duplicate or invalid — skip
            }
          }
          if (loaded > 0) {
            console.log(`[PatternStore] Loaded ${loaded} embeddings from SQLite into HNSW`);
          }
        } catch (error) {
          console.warn('[PatternStore] Failed to load SQLite embeddings into HNSW:', toErrorMessage(error));
        }
      }

      console.log(
        `[PatternStore] HNSW lazy-initialized (native: ${this.hnswAvailable})`
      );
    } catch (error) {
      console.warn(
        '[PatternStore] HNSW not available, using memory backend search:',
        toErrorMessage(error)
      );
      this.hnswIndex = null;
      this.hnswAvailable = false;
    }
  }

  /**
   * Load existing patterns from SQLite into in-memory cache.
   *
   * Previously this was a no-op after Issue #258 removed kv_store duplication,
   * but that left 15,634 SQLite patterns invisible to search on every restart.
   * Now properly loads from SQLitePatternStore when wired.
   */
  private async loadPatterns(): Promise<void> {
    if (!this.sqliteStore) {
      return; // SQLite not wired yet — will be loaded after setSqliteStore()
    }

    try {
      const patterns = this.sqliteStore.getPatterns({ limit: 50000 });
      for (const pattern of patterns) {
        this.indexPattern(pattern);
      }
      if (patterns.length > 0) {
        console.log(
          `[PatternStore] Loaded ${patterns.length} patterns from SQLite into memory cache`
        );
      }
    } catch (error) {
      console.warn(
        '[PatternStore] Failed to load patterns from SQLite:',
        toErrorMessage(error)
      );
    }
  }

  /**
   * Index a pattern in local caches
   */
  private indexPattern(pattern: QEPattern): void {
    this.patternCache.set(pattern.id, pattern);

    // Domain index
    if (!this.domainIndex.has(pattern.qeDomain)) {
      this.domainIndex.set(pattern.qeDomain, new Set());
    }
    this.domainIndex.get(pattern.qeDomain)!.add(pattern.id);

    // Type index
    if (!this.typeIndex.has(pattern.patternType)) {
      this.typeIndex.set(pattern.patternType, new Set());
    }
    this.typeIndex.get(pattern.patternType)!.add(pattern.id);

    // Tier index (defensive: coerce unexpected tier values to 'short-term')
    const tier = (pattern.tier === 'long-term') ? 'long-term' : 'short-term';
    if (pattern.tier !== tier) {
      // Pattern has invalid tier from SQLite — store corrected copy in cache
      (pattern as { tier: string }).tier = tier;
    }
    this.tierIndex.get(tier)!.add(pattern.id);
  }

  /**
   * Remove pattern from local indices
   */
  private unindexPattern(pattern: QEPattern): void {
    this.patternCache.delete(pattern.id);
    this.domainIndex.get(pattern.qeDomain)?.delete(pattern.id);
    this.typeIndex.get(pattern.patternType)?.delete(pattern.id);
    this.tierIndex.get(pattern.tier)?.delete(pattern.id);
    this.hdcCache.delete(pattern.id); // R1: cleanup HDC fingerprint
  }

  /**
   * Store a new pattern
   */
  async store(pattern: QEPattern): Promise<Result<string>> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (this.loadingPromise) {
      await this.loadingPromise;
    }

    // Validate pattern
    const validation = validateQEPattern(pattern);
    if (!validation.valid) {
      return err(new Error(`Invalid pattern: ${validation.errors.join(', ')}`));
    }

    // Check confidence threshold
    if (pattern.confidence < this.config.minConfidence) {
      return err(
        new Error(
          `Pattern confidence ${pattern.confidence} below threshold ${this.config.minConfidence}`
        )
      );
    }

    // Check domain limit
    const domainCount = this.domainIndex.get(pattern.qeDomain)?.size || 0;
    if (domainCount >= this.config.maxPatternsPerDomain) {
      // Run cleanup for this domain
      await this.cleanupDomain(pattern.qeDomain);
    }

    // Index in memory cache
    this.indexPattern(pattern);

    // Persist to SQLite (pattern + embedding atomically)
    if (this.sqliteStore) {
      try {
        this.sqliteStore.storePattern(pattern, pattern.embedding);
      } catch (error) {
        console.warn(`[PatternStore] SQLite persist failed for ${pattern.id}:`, toErrorMessage(error));
      }
    }

    // Add to HNSW if embedding is available (lazy-load HNSW only when needed)
    if (pattern.embedding) {
      const hnsw = await this.ensureHNSW();
      if (hnsw) {
        try {
          // Cast pattern metadata to CoverageVectorMetadata for HNSW storage
          // Pattern-specific fields are stored as extensions
          await hnsw.insert(pattern.id, pattern.embedding, {
            filePath: pattern.patternType,
            lineCoverage: pattern.confidence * 100,
            branchCoverage: pattern.qualityScore * 100,
            functionCoverage: 0,
            statementCoverage: 0,
            uncoveredLineCount: 0,
            uncoveredBranchCount: 0,
            riskScore: 1 - pattern.confidence,
            lastUpdated: Date.now(),
            totalLines: 0,
          } as import('../domains/coverage-analysis/services/hnsw-index.js').CoverageVectorMetadata);
        } catch (error) {
          console.warn(`[PatternStore] Failed to index embedding for ${pattern.id}:`, error);
        }
      }
    }

    // R1: Compute and cache HDC fingerprint for fast pre-filtering
    if (isHDCFingerprintingEnabled()) {
      try {
        const hdc = getHdcFingerprinter();
        const fp = hdc.fingerprint({
          id: pattern.id,
          domain: pattern.qeDomain,
          type: pattern.patternType,
          content: pattern.description,
        });
        this.hdcCache.set(pattern.id, fp.vector);
      } catch (error) {
        console.debug(`[PatternStore] HDC fingerprint failed for ${pattern.id}:`, toErrorMessage(error));
      }
    }

    // R3: Create genesis delta event for new patterns
    if (isDeltaEventSourcingEnabled() && this.deltaTracker) {
      try {
        const snapshot = {
          id: pattern.id,
          name: pattern.name,
          confidence: pattern.confidence,
          qualityScore: pattern.qualityScore,
          usageCount: pattern.usageCount,
          successRate: pattern.successRate,
          tier: pattern.tier,
        };
        this.deltaTracker.createGenesis(pattern.id, snapshot);
      } catch (error) {
        // Genesis may already exist if pattern was re-stored; log at debug level
        console.debug(`[PatternStore] Delta genesis for ${pattern.id}:`, toErrorMessage(error));
      }
    }

    return ok(pattern.id);
  }

  /**
   * Create and store a pattern from options
   */
  async create(options: CreateQEPatternOptions): Promise<Result<QEPattern>> {
    const now = new Date();

    const resolvedDomain = options.qeDomain || this.detectDomainFromType(options.patternType);
    const pattern: QEPattern = {
      id: uuidv4(),
      patternType: options.patternType,
      qeDomain: resolvedDomain,
      domain: mapQEDomainToAQE(resolvedDomain),
      name: options.name,
      description: options.description,
      confidence: options.confidence ?? 0.5, // Use provided or default
      usageCount: 0,
      successRate: 0,
      qualityScore: 0.25, // Initial quality
      context: {
        ...options.context,
        tags: options.context?.tags || [],
      },
      template: {
        ...options.template,
        example: undefined,
      },
      embedding: options.embedding,
      tier: 'short-term',
      createdAt: now,
      lastUsedAt: now,
      successfulUses: 0,
      // Token tracking fields (ADR-042)
      reusable: false, // Not reusable until proven successful
      reuseCount: 0,
      averageTokenSavings: 0,
    };

    const storeResult = await this.store(pattern);
    if (!storeResult.success) {
      return err(storeResult.error);
    }

    return ok(pattern);
  }

  /**
   * Detect QE domain from pattern type
   */
  private detectDomainFromType(patternType: QEPatternType): QEDomain {
    const typeToDomain: Record<QEPatternType, QEDomain> = {
      'test-template': 'test-generation',
      'assertion-pattern': 'test-generation',
      'mock-pattern': 'test-generation',
      'coverage-strategy': 'coverage-analysis',
      'mutation-strategy': 'test-generation', // Mutation is part of test generation
      'api-contract': 'contract-testing',
      'visual-baseline': 'visual-accessibility',
      'a11y-check': 'visual-accessibility',
      'perf-benchmark': 'chaos-resilience',
      'flaky-fix': 'test-execution',
      'refactor-safe': 'code-intelligence',
      'error-handling': 'test-generation',
    };
    return typeToDomain[patternType] || 'test-generation';
  }

  /**
   * Get pattern by ID
   */
  async get(id: string): Promise<QEPattern | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (this.loadingPromise) {
      await this.loadingPromise;
    }

    return this.patternCache.get(id) ?? null;
  }

  /**
   * Search for patterns
   */
  async search(
    query: string | number[],
    options: PatternSearchOptions = {}
  ): Promise<Result<PatternSearchResult[]>> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (this.loadingPromise) {
      await this.loadingPromise;
    }

    const startTime = performance.now();
    const limit = options.limit || 10;
    const results: PatternSearchResult[] = [];

    try {
      // Vector search if query is embedding and HNSW available (lazy-load)
      if (Array.isArray(query) && options.useVectorSearch !== false) {
        const hnsw = await this.ensureHNSW();
        if (hnsw) {
          const hnswResults = await hnsw.search(query, limit * 2);

          for (const result of hnswResults) {
            const pattern = await this.get(result.key);
            if (pattern && this.matchesFilters(pattern, options)) {
              const reuseInfo = this.calculateReuseInfo(pattern, result.score);
              results.push({
                pattern,
                score: result.score,
                matchType: 'vector',
                similarity: result.score,
                canReuse: reuseInfo.canReuse,
                estimatedTokenSavings: reuseInfo.estimatedTokenSavings,
                reuseConfidence: reuseInfo.reuseConfidence,
              });
            }
          }
        }
      }

      // FTS5 hybrid search: blend BM25 text relevance with vector similarity
      // 75% vector score + 25% FTS5 score for patterns found by both
      if (typeof query === 'string' && query.trim() && this.sqliteStore) {
        try {
          const ftsResults = this.sqliteStore.searchFTS(query, limit * 2);
          if (ftsResults.length > 0) {
            const ftsScoreMap = new Map(ftsResults.map(r => [r.id, r.ftsScore]));
            const existingIds = new Set(results.map(r => r.pattern.id));

            // Boost existing vector results that also match FTS5
            for (const result of results) {
              const ftsScore = ftsScoreMap.get(result.pattern.id);
              if (ftsScore !== undefined) {
                result.score = 0.75 * result.score + 0.25 * ftsScore;
              }
            }

            // Add FTS5-only results not already in vector results
            for (const ftsResult of ftsResults) {
              if (existingIds.has(ftsResult.id)) continue;
              const pattern = await this.get(ftsResult.id);
              if (pattern && this.matchesFilters(pattern, options)) {
                const reuseInfo = this.calculateReuseInfo(pattern, ftsResult.ftsScore);
                results.push({
                  pattern,
                  score: 0.5 * ftsResult.ftsScore, // FTS-only: exact keyword match is valuable
                  matchType: 'exact',
                  similarity: ftsResult.ftsScore,
                  canReuse: reuseInfo.canReuse,
                  estimatedTokenSavings: reuseInfo.estimatedTokenSavings,
                  reuseConfidence: reuseInfo.reuseConfidence,
                });
              }
            }
          }
        } catch {
          // FTS5 unavailable, continue with text fallback
        }
      }

      // Text search fallback or additional
      if (typeof query === 'string' || results.length < limit) {
        const textResults = await this.searchByText(
          typeof query === 'string' ? query : '',
          options,
          limit - results.length
        );
        // Deduplicate: only add text results not already present
        const existingIds = new Set(results.map(r => r.pattern.id));
        for (const tr of textResults) {
          if (!existingIds.has(tr.pattern.id)) {
            results.push(tr);
          }
        }
      }

      // Apply temporal decay: boost recent patterns, penalize stale ones
      // Half-life of 30 days — patterns used recently score higher
      const TEMPORAL_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      for (const result of results) {
        const lastUsed = result.pattern.lastUsedAt?.getTime() ?? result.pattern.createdAt.getTime();
        const ageMs = now - lastUsed;
        const decayFactor = Math.pow(0.5, ageMs / TEMPORAL_HALF_LIFE_MS);
        // Only boost patterns that have been used — new untested patterns get neutral score
        const effectiveDecay = result.pattern.usageCount > 0 ? decayFactor : 0.5;
        // Multiplicative decay: preserves relative ordering from search scoring
        // while penalizing stale patterns (decayFactor is 0-1)
        result.score = result.score * (0.7 + 0.3 * effectiveDecay);
      }

      // Sort by score
      results.sort((a, b) => b.score - a.score);

      // Apply metadata filter BEFORE limit so we don't lose matching results (W-3 fix)
      let filteredResults = results;
      if (options.filter) {
        filteredResults = applyFilterSync(results, options.filter);
      }

      const finalResults = filteredResults.slice(0, limit);

      // Record stats
      const latency = performance.now() - startTime;
      this.recordSearchLatency(latency);

      return ok(finalResults);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Search patterns by text query
   */
  private async searchByText(
    query: string,
    options: PatternSearchOptions,
    limit: number
  ): Promise<PatternSearchResult[]> {
    const results: PatternSearchResult[] = [];
    const queryLower = query.toLowerCase();

    // Get candidate patterns from indices
    let candidates: Set<string>;

    if (options.domain) {
      candidates = this.domainIndex.get(options.domain) || new Set();
    } else if (options.patternType) {
      candidates = this.typeIndex.get(options.patternType) || new Set();
    } else if (options.tier) {
      candidates = this.tierIndex.get(options.tier) || new Set();
    } else {
      candidates = new Set(this.patternCache.keys());
    }

    // R1: HDC fast-path pre-filter — sort candidates by Hamming similarity
    // so we process the most likely matches first (reduces wasted iterations)
    let orderedCandidates: string[] = [...candidates];
    if (isHDCFingerprintingEnabled() && queryLower && this.hdcCache.size > 0) {
      try {
        const hdc = getHdcFingerprinter();
        const queryFp = hdc.fingerprint({
          id: 'query',
          domain: options.domain ?? 'unknown',
          type: options.patternType ?? 'unknown',
          content: query,
        });
        // Score each candidate by Hamming similarity and sort descending
        const scored = orderedCandidates
          .filter(id => this.hdcCache.has(id))
          .map(id => ({
            id,
            similarity: hdc.similarity(queryFp.vector, this.hdcCache.get(id)!),
          }));
        scored.sort((a, b) => b.similarity - a.similarity);
        // Pre-filter: only keep candidates with above-random similarity (>0.5)
        const hdcFiltered = scored.filter(s => s.similarity > 0.52).map(s => s.id);
        // Add back candidates without fingerprints at the end
        const hdcSet = new Set(hdcFiltered);
        const unfingerprinted = orderedCandidates.filter(id => !this.hdcCache.has(id));
        orderedCandidates = [...hdcFiltered, ...unfingerprinted];
      } catch {
        // HDC pre-filter is best-effort; fall through to normal search
      }
    }

    for (const id of orderedCandidates) {
      if (results.length >= limit) break;

      const pattern = this.patternCache.get(id);
      if (!pattern) continue;

      if (!this.matchesFilters(pattern, options)) continue;

      // Calculate text match score
      let score = 0;

      if (queryLower) {
        const nameLower = pattern.name.toLowerCase();
        const descLower = pattern.description.toLowerCase();

        // Exact match in name gets high score
        if (nameLower.includes(queryLower)) score += 0.5;

        // Check description - higher score for exact task match
        // Pattern descriptions often contain "Pattern extracted from: {task}"
        if (descLower.includes(queryLower)) {
          // If the query is a substantial part of description, it's a strong match
          const queryRatio = queryLower.length / descLower.length;
          if (queryRatio > 0.3) {
            score += 0.5; // Strong match - query is significant part of description
          } else {
            score += 0.3; // Weak match - query is small part of description
          }
        }

        for (const tag of pattern.context.tags) {
          if (tag.toLowerCase().includes(queryLower)) {
            score += 0.2;
            break;
          }
        }

        // Cap at 1.0
        score = Math.min(score, 1.0);
      } else {
        // No query - use quality score
        score = pattern.qualityScore;
      }

      if (score > 0 || !queryLower) {
        const reuseInfo = this.calculateReuseInfo(pattern, score);
        results.push({
          pattern,
          score: score || pattern.qualityScore,
          matchType: queryLower ? 'exact' : 'context',
          similarity: score || pattern.qualityScore,
          canReuse: reuseInfo.canReuse,
          estimatedTokenSavings: reuseInfo.estimatedTokenSavings,
          reuseConfidence: reuseInfo.reuseConfidence,
        });
      }
    }

    return results;
  }

  /**
   * Calculate reuse information for a pattern (ADR-042)
   */
  private calculateReuseInfo(
    pattern: QEPattern,
    similarity: number
  ): { canReuse: boolean; estimatedTokenSavings: number; reuseConfidence: number } {
    const { reuseOptimization } = this.config;

    // Check if pattern meets reuse criteria
    const meetsMinSimilarity = similarity >= reuseOptimization.minSimilarityForReuse;
    const meetsMinSuccessRate = pattern.successRate >= reuseOptimization.minSuccessRateForReuse;

    // Check age criteria
    // Note: lastUsedAt may be a string from SQLite JSON deserialization
    const lastUsedTime = pattern.lastUsedAt instanceof Date
      ? pattern.lastUsedAt.getTime()
      : new Date(pattern.lastUsedAt).getTime();
    const ageInDays = (Date.now() - lastUsedTime) / (1000 * 60 * 60 * 24);
    const meetsAgeCriteria = ageInDays <= reuseOptimization.maxAgeForReuse;

    // Pattern must be explicitly marked reusable and meet all criteria
    const canReuse =
      reuseOptimization.enabled &&
      pattern.reusable &&
      meetsMinSimilarity &&
      meetsMinSuccessRate &&
      meetsAgeCriteria;

    // Estimate token savings based on pattern's historical data
    const estimatedTokenSavings = canReuse
      ? pattern.averageTokenSavings > 0
        ? pattern.averageTokenSavings
        : pattern.tokensUsed || 0
      : 0;

    // Calculate reuse confidence based on multiple factors
    const similarityFactor = similarity;
    const successFactor = pattern.successRate;
    const usageFactor = Math.min(pattern.reuseCount / 10, 1); // Cap at 10 reuses
    const reuseConfidence = canReuse
      ? (similarityFactor * 0.4 + successFactor * 0.4 + usageFactor * 0.2)
      : 0;

    return { canReuse, estimatedTokenSavings, reuseConfidence };
  }

  /**
   * Check if pattern matches search filters
   */
  private matchesFilters(
    pattern: QEPattern,
    options: PatternSearchOptions
  ): boolean {
    if (options.patternType && pattern.patternType !== options.patternType) {
      return false;
    }

    if (options.domain && pattern.qeDomain !== options.domain) {
      return false;
    }

    if (options.tier && pattern.tier !== options.tier) {
      return false;
    }

    if (
      options.minConfidence !== undefined &&
      pattern.confidence < options.minConfidence
    ) {
      return false;
    }

    if (
      options.minQualityScore !== undefined &&
      pattern.qualityScore < options.minQualityScore
    ) {
      return false;
    }

    if (options.context) {
      const ctx = options.context;

      if (ctx.language && pattern.context.language !== ctx.language) {
        return false;
      }

      if (ctx.framework && pattern.context.framework !== ctx.framework) {
        return false;
      }

      if (ctx.testType && pattern.context.testType !== ctx.testType) {
        return false;
      }
    }

    return true;
  }

  /**
   * Record pattern usage and update stats
   */
  async recordUsage(id: string, success: boolean): Promise<Result<void>> {
    const pattern = await this.get(id);
    if (!pattern) {
      return err(new Error(`Pattern not found: ${id}`));
    }

    const now = new Date();
    const usageCount = pattern.usageCount + 1;
    const successfulUses = pattern.successfulUses + (success ? 1 : 0);
    const successRate = successfulUses / usageCount;

    // Update confidence based on outcomes
    const confidenceDelta = success ? 0.02 : -0.01;
    const confidence = Math.max(
      0.1,
      Math.min(1, pattern.confidence + confidenceDelta)
    );

    const qualityScore = calculateQualityScore({
      confidence,
      usageCount,
      successRate,
    });

    const updated: QEPattern = {
      ...pattern,
      usageCount,
      successfulUses,
      successRate,
      confidence,
      qualityScore,
      lastUsedAt: now,
    };

    // Persist usage to SQLite
    if (this.sqliteStore) {
      try {
        this.sqliteStore.recordUsage(id, success);
      } catch (error) {
        console.warn(`[PatternStore] SQLite recordUsage failed for ${id}:`, toErrorMessage(error));
      }
    }

    // R3: Record delta event for the pattern update
    if (isDeltaEventSourcingEnabled() && this.deltaTracker) {
      try {
        const before = {
          id: pattern.id,
          name: pattern.name,
          confidence: pattern.confidence,
          qualityScore: pattern.qualityScore,
          usageCount: pattern.usageCount,
          successRate: pattern.successRate,
          tier: pattern.tier,
        };
        const after = {
          id: updated.id,
          name: updated.name,
          confidence: updated.confidence,
          qualityScore: updated.qualityScore,
          usageCount: updated.usageCount,
          successRate: updated.successRate,
          tier: updated.tier,
        };
        this.deltaTracker.recordDelta(id, before, after, { success });
      } catch (error) {
        console.debug(`[PatternStore] Delta recordDelta for ${id}:`, toErrorMessage(error));
      }
    }

    // Check for promotion (ADR-052: shouldPromotePattern returns PromotionCheck object)
    const promotionCheck = shouldPromotePattern(updated);
    const shouldPromote = promotionCheck.meetsUsageCriteria &&
                          promotionCheck.meetsQualityCriteria &&
                          promotionCheck.meetsCoherenceCriteria;
    if (shouldPromote && updated.tier === 'short-term') {
      await this.promote(id);
    } else {
      // Update in-memory cache
      this.patternCache.set(id, updated);
    }

    return ok(undefined);
  }

  /**
   * Promote pattern from short-term to long-term storage
   */
  async promote(id: string): Promise<Result<void>> {
    const pattern = await this.get(id);
    if (!pattern) {
      return err(new Error(`Pattern not found: ${id}`));
    }

    if (pattern.tier === 'long-term') {
      return ok(undefined); // Already promoted
    }

    const promoted: QEPattern = {
      ...pattern,
      tier: 'long-term',
      confidence: Math.min(1, pattern.confidence + 0.1), // Boost confidence
    };

    // Update tier index
    this.tierIndex.get('short-term')?.delete(id);
    this.tierIndex.get('long-term')?.add(id);

    // Update cache
    this.patternCache.set(id, promoted);

    // Persist promotion to SQLite
    if (this.sqliteStore) {
      try {
        this.sqliteStore.promotePattern(id);
      } catch (e) {
        console.debug('[PatternStore] SQLite promotion error:', e instanceof Error ? e.message : e);
      }
    }

    console.log(
      `[PatternStore] Promoted pattern ${id} (${pattern.name}) to long-term storage`
    );

    return ok(undefined);
  }

  /**
   * Delete a pattern
   */
  async delete(id: string): Promise<Result<void>> {
    const pattern = this.patternCache.get(id);
    if (!pattern) {
      return err(new Error(`Pattern not found: ${id}`));
    }

    // Remove from indices
    this.unindexPattern(pattern);

    // Persist deletion to SQLite
    if (this.sqliteStore) {
      try {
        this.sqliteStore.deletePattern(id);
      } catch (e) {
        console.debug('[PatternStore] SQLite deletion error:', e instanceof Error ? e.message : e);
      }
    }

    // Only remove from HNSW if already initialized (no lazy-load for delete)
    if (this.hnswIndex !== null) {
      try {
        await this.hnswIndex.delete(id);
      } catch (error) {
        // Non-critical: HNSW deletion errors don't affect pattern removal
        console.debug('[PatternStore] HNSW deletion error:', error instanceof Error ? error.message : error);
      }
    }

    return ok(undefined);
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<PatternStoreStats> {
    const byDomain = {} as Record<QEDomain, number>;
    const byType = {} as Record<QEPatternType, number>;

    for (const [domain, ids] of this.domainIndex) {
      byDomain[domain] = ids.size;
    }

    for (const [type, ids] of this.typeIndex) {
      byType[type] = ids.size;
    }

    let totalConfidence = 0;
    let totalQuality = 0;
    let totalSuccess = 0;
    let count = 0;

    for (const pattern of this.patternCache.values()) {
      totalConfidence += pattern.confidence;
      totalQuality += pattern.qualityScore;
      totalSuccess += pattern.successRate;
      count++;
    }

    // Get HNSW stats only if already initialized (no lazy-load for stats)
    const hnswStats = this.hnswIndex !== null
      ? await this.hnswIndex.getStats()
      : { nativeHNSW: false, vectorCount: 0, indexSizeBytes: 0, lazyLoaded: true };

    return {
      totalPatterns: this.patternCache.size,
      byTier: {
        shortTerm: this.tierIndex.get('short-term')?.size || 0,
        longTerm: this.tierIndex.get('long-term')?.size || 0,
      },
      byDomain,
      byType,
      avgConfidence: count > 0 ? totalConfidence / count : 0,
      avgQualityScore: count > 0 ? totalQuality / count : 0,
      avgSuccessRate: count > 0 ? totalSuccess / count : 0,
      searchOperations: this.stats.searchOperations,
      avgSearchLatencyMs: this.calculateAvgLatency(),
      hnswStats: {
        nativeAvailable: hnswStats.nativeHNSW,
        vectorCount: hnswStats.vectorCount,
        indexSizeBytes: hnswStats.indexSizeBytes,
      },
    };
  }

  /**
   * Cleanup low-quality patterns
   */
  async cleanup(): Promise<{ removed: number; promoted: number }> {
    let removed = 0;
    let promoted = 0;

    const toRemove: string[] = [];
    const toPromote: string[] = [];

    for (const pattern of this.patternCache.values()) {
      // Check for promotion (ADR-052: returns PromotionCheck object)
      const promotionCheck = shouldPromotePattern(pattern);
      const canPromote = promotionCheck.meetsUsageCriteria &&
                         promotionCheck.meetsQualityCriteria &&
                         promotionCheck.meetsCoherenceCriteria;
      if (canPromote) {
        toPromote.push(pattern.id);
        continue;
      }

      // Check for removal (short-term, old, low quality)
      if (pattern.tier === 'short-term') {
        const createdTime = pattern.createdAt instanceof Date
          ? pattern.createdAt.getTime()
          : new Date(pattern.createdAt).getTime();
        const ageMs = Date.now() - createdTime;
        const isOld = ageMs > 7 * 24 * 60 * 60 * 1000; // 7 days
        const isLowQuality = pattern.qualityScore < 0.2;
        const isUnused = pattern.usageCount === 0 && ageMs > 24 * 60 * 60 * 1000; // 1 day

        if ((isOld && isLowQuality) || isUnused) {
          toRemove.push(pattern.id);
        }
      }
    }

    // Perform promotions
    for (const id of toPromote) {
      const result = await this.promote(id);
      if (result.success) promoted++;
    }

    // Perform removals
    for (const id of toRemove) {
      const result = await this.delete(id);
      if (result.success) removed++;
    }

    console.log(
      `[PatternStore] Cleanup: removed ${removed}, promoted ${promoted}`
    );

    return { removed, promoted };
  }

  /**
   * Cleanup patterns for a specific domain
   */
  private async cleanupDomain(domain: QEDomain): Promise<void> {
    const ids = this.domainIndex.get(domain);
    if (!ids || ids.size < this.config.maxPatternsPerDomain) return;

    // Get all patterns for domain
    const patterns: QEPattern[] = [];
    for (const id of ids) {
      const pattern = this.patternCache.get(id);
      if (pattern) patterns.push(pattern);
    }

    // Sort by quality score (worst first)
    patterns.sort((a, b) => a.qualityScore - b.qualityScore);

    // Remove lowest quality short-term patterns
    const removeCount = Math.ceil(patterns.length * 0.1); // Remove 10%
    let removed = 0;

    for (const pattern of patterns) {
      if (removed >= removeCount) break;
      if (pattern.tier === 'short-term') {
        await this.delete(pattern.id);
        removed++;
      }
    }
  }

  /**
   * Record search latency
   */
  private recordSearchLatency(latencyMs: number): void {
    this.stats.searchOperations++;
    this.stats.searchLatencies.push(latencyMs);

    // Keep only last 1000 latencies
    if (this.stats.searchLatencies.length > 1000) {
      this.stats.searchLatencies = this.stats.searchLatencies.slice(-1000);
    }
  }

  /**
   * Calculate average search latency
   */
  private calculateAvgLatency(): number {
    if (this.stats.searchLatencies.length === 0) return 0;
    const sum = this.stats.searchLatencies.reduce((a, b) => a + b, 0);
    return sum / this.stats.searchLatencies.length;
  }

  /**
   * Dispose the pattern store
   */
  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.patternCache.clear();
    this.domainIndex.clear();
    this.typeIndex.clear();
    this.tierIndex.clear();
    this.hdcCache.clear(); // R1: cleanup
    this.deltaTracker = null; // R3: cleanup

    this.initialized = false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new pattern store instance
 */
export function createPatternStore(
  memory: MemoryBackend,
  config?: Partial<PatternStoreConfig>
): PatternStore {
  return new PatternStore(memory, config);
}
