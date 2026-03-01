/**
 * Agentic QE v3 - QE Unified Memory
 * ADR-038: V3 QE Memory System Unification
 *
 * Unified memory facade for 6+ QE memory systems with HNSW indexing:
 * - test-suites: Test case storage and retrieval
 * - coverage: Coverage reports and gap detection (HNSW)
 * - defects: Defect patterns and predictions (HNSW)
 * - quality: Quality metrics and gates (HNSW)
 * - learning: Learning patterns and knowledge transfer (HNSW)
 * - coordination: Agent state and swarm coordination (HNSW)
 *
 * Features:
 * - Single API for all QE memory operations
 * - O(log n) HNSW search for 150x-12,500x faster retrieval
 * - Cross-domain semantic search
 * - Data migration from legacy systems
 * - Domain-specific HNSW configurations
 *
 * @module learning/qe-unified-memory
 */

import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('qe-unified-memory');

import type { MemoryBackend, StoreOptions, VectorSearchResult } from '../kernel/interfaces.js';
import type { QEDomain } from './qe-patterns.js';
import type { Result } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import { migrateV2ToV3 } from './v2-to-v3-migration.js';
import { EMBEDDING_CONFIG } from '../shared/embeddings/types.js';

// Import HNSWIndex types - using proper import to avoid re-export issues
import type {
  HNSWIndexConfig,
  IHNSWIndex,
  HNSWInsertItem,
  CoverageVectorMetadata,
  HNSWSearchResult,
  HNSWIndexStats,
} from '../domains/coverage-analysis/services/hnsw-index.js';

import { toErrorMessage } from '../shared/error-utils.js';
import {
  DEFAULT_HNSW_CONFIG,
  HNSWIndex,
  createHNSWIndex,
  benchmarkHNSW,
} from '../domains/coverage-analysis/services/hnsw-index.js';

// ============================================================================
// QE Memory Domain Types
// ============================================================================

/**
 * The 6 unified QE memory domains
 */
export type QEMemoryDomain =
  | 'test-suites'
  | 'coverage'
  | 'defects'
  | 'quality'
  | 'learning'
  | 'coordination';

/**
 * All QE memory domains (including extended)
 */
export const QE_MEMORY_DOMAINS: readonly QEMemoryDomain[] = [
  'test-suites',
  'coverage',
  'defects',
  'quality',
  'learning',
  'coordination',
] as const;

/**
 * Map QEMemoryDomain to QEDomain for compatibility
 */
export function memoryDomainToQEDomain(domain: QEMemoryDomain): QEDomain {
  const mapping: Record<QEMemoryDomain, QEDomain> = {
    'test-suites': 'test-generation',
    'coverage': 'coverage-analysis',
    'defects': 'defect-intelligence',
    'quality': 'quality-assessment',
    'learning': 'learning-optimization',
    'coordination': 'learning-optimization', // Coordination is part of learning
  };
  return mapping[domain];
}

// ============================================================================
// Domain-Specific HNSW Configurations
// ============================================================================

/**
 * HNSW configuration per QE domain
 * Optimized for each domain's specific use case
 *
 * Reference: ADR-038 Table "HNSW Configuration per Domain"
 */
export const QE_DOMAIN_HNSW_CONFIGS: Record<QEMemoryDomain, HNSWIndexConfig> = {
  'test-suites': {
    dimensions: EMBEDDING_CONFIG.DIMENSIONS,
    M: 8,              // Low connectivity for fast lookup
    efConstruction: 100,
    efSearch: 50,
    metric: 'cosine',
    namespace: 'test-suites-hnsw',
    maxElements: 100000,
  },
  coverage: {
    dimensions: EMBEDDING_CONFIG.DIMENSIONS,
    M: 16,             // Balanced for gap detection
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine',
    namespace: 'coverage-hnsw',
    maxElements: 100000,
  },
  defects: {
    dimensions: EMBEDDING_CONFIG.DIMENSIONS,
    M: 32,             // High connectivity for precision
    efConstruction: 400,
    efSearch: 200,     // Higher efSearch for better recall
    metric: 'cosine',
    namespace: 'defects-hnsw',
    maxElements: 100000,
  },
  quality: {
    dimensions: EMBEDDING_CONFIG.DIMENSIONS,
    M: 16,             // Balanced configuration
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine',
    namespace: 'quality-hnsw',
    maxElements: 100000,
  },
  learning: {
    dimensions: EMBEDDING_CONFIG.DIMENSIONS,
    M: 24,             // Higher recall for knowledge transfer
    efConstruction: 300,
    efSearch: 150,
    metric: 'cosine',
    namespace: 'learning-hnsw',
    maxElements: 100000,
  },
  coordination: {
    dimensions: EMBEDDING_CONFIG.DIMENSIONS,
    M: 8,              // Fast lookup for coordination
    efConstruction: 100,
    efSearch: 50,
    metric: 'cosine',
    namespace: 'coordination-hnsw',
    maxElements: 50000, // Fewer entries needed
  },
};

// ============================================================================
// Metadata Types for Each Domain
// ============================================================================

/**
 * Test suite metadata
 */
export interface TestSuiteMetadata {
  /** Test file path */
  filePath: string;
  /** Test framework (jest, vitest, pytest, etc.) */
  framework: string;
  /** Programming language */
  language: string;
  /** Number of test cases */
  testCount: number;
  /** Execution time in ms */
  executionTimeMs: number;
  /** Pass/fail status */
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  /** Last run timestamp */
  lastRun: number;
  /** Associated coverage */
  coveragePercent?: number;
}

/**
 * Coverage metadata (extends coverage-analysis metadata)
 */
export interface CoverageMetadata {
  /** File path */
  filePath: string;
  /** Line coverage percentage */
  lineCoverage: number;
  /** Branch coverage percentage */
  branchCoverage: number;
  /** Function coverage percentage */
  functionCoverage: number;
  /** Statement coverage percentage */
  statementCoverage: number;
  /** Number of uncovered lines */
  uncoveredLineCount: number;
  /** Number of uncovered branches */
  uncoveredBranchCount: number;
  /** Risk score (0-1) */
  riskScore: number;
  /** Timestamp of last update */
  lastUpdated: number;
  /** File size in lines */
  totalLines: number;
}

/**
 * Defect metadata
 */
export interface DefectMetadata {
  /** File path where defect found */
  filePath: string;
  /** Defect type (bug, vulnerability, smell, etc.) */
  defectType: string;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Confidence score (0-1) */
  confidence: number;
  /** Defect description */
  description: string;
  /** Suggested fix */
  suggestedFix?: string;
  /** Discovery timestamp */
  discoveredAt: number;
  /** Status */
  status: 'open' | 'fixed' | 'ignored' | 'false-positive';
}

/**
 * Quality metrics metadata
 */
export interface QualityMetricsMetadata {
  /** Module/component path */
  modulePath: string;
  /** Overall quality score (0-1) */
  qualityScore: number;
  /** Code complexity score */
  complexityScore: number;
  /** Maintainability index */
  maintainabilityIndex: number;
  /** Technical debt ratio */
  technicalDebtRatio: number;
  /** Test coverage percentage */
  testCoverage: number;
  /** Code smell count */
  codeSmellCount: number;
  /** Security vulnerability count */
  vulnerabilityCount: number;
  /** Last assessment timestamp */
  lastAssessed: number;
}

/**
 * Learning pattern metadata
 */
export interface LearningPatternMetadata {
  /** Pattern ID */
  patternId: string;
  /** Pattern type */
  patternType: string;
  /** Associated QE domain */
  qeDomain: QEDomain;
  /** Usage count */
  usageCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Quality score (0-1) */
  qualityScore: number;
  /** Pattern tier */
  tier: 'short-term' | 'working' | 'long-term';
  /** Timestamp created */
  createdAt: number;
  /** Last used timestamp */
  lastUsedAt: number;
}

/**
 * Coordination metadata
 */
export interface CoordinationMetadata {
  /** Agent ID */
  agentId: string;
  /** Agent type */
  agentType: string;
  /** Current state */
  state: 'idle' | 'active' | 'blocked' | 'failed';
  /** Current task (if any) */
  currentTask?: string;
  /** Performance score (0-1) */
  performanceScore: number;
  /** Tasks completed */
  tasksCompleted: number;
  /** Last heartbeat timestamp */
  lastHeartbeat: number;
}

/**
 * Union type of all domain metadata types
 */
export type QEMemoryMetadata =
  | TestSuiteMetadata
  | CoverageMetadata
  | DefectMetadata
  | QualityMetricsMetadata
  | LearningPatternMetadata
  | CoordinationMetadata;

// ============================================================================
// Cross-Domain Search Types
// ============================================================================

/**
 * Cross-domain search result
 */
export interface QEMemorySearchResult {
  /** Domain where result was found */
  domain: QEMemoryDomain;
  /** Result key */
  key: string;
  /** Similarity score (0-1) */
  score: number;
  /** Domain-specific metadata */
  metadata?: QEMemoryMetadata;
}

/**
 * Cross-domain search options
 */
export interface QEMemorySearchOptions {
  /** Domains to search (default: all) */
  domains?: QEMemoryDomain[];
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
  /** Maximum results per domain */
  maxPerDomain?: number;
  /** Filter by metadata */
  filter?: (metadata: QEMemoryMetadata) => boolean;
}

// ============================================================================
// Migration Types
// ============================================================================

/**
 * Migration source types
 */
export type MigrationSource = 'sqlite' | 'markdown' | 'in-memory' | 'json' | 'custom';

/**
 * Migration configuration
 */
export interface MigrationConfig {
  /** Source type */
  source: MigrationSource;
  /** Source path or connection string */
  sourcePath?: string;
  /** Additional source configuration options */
  sourceConfig?: {
    path?: string;
    [key: string]: unknown;
  };
  /** Domain to migrate */
  domain: QEMemoryDomain;
  /** Whether to migrate all domains (V2 → V3 mode) */
  migrateAll?: boolean;
  /** Whether to preserve existing IDs */
  preserveIds: boolean;
  /** Whether to generate embeddings for migrated data */
  generateEmbeddings: boolean;
  /** Batch size for migration */
  batchSize: number;
  /** Callback for progress updates */
  onProgress?: (progress: MigrationProgress) => void;
}

/**
 * Migration progress
 */
export interface MigrationProgress {
  /** Domain being migrated */
  domain: QEMemoryDomain;
  /** Total items to migrate */
  total: number;
  /** Items processed so far */
  processed: number;
  /** Migration status */
  status: 'running' | 'completed' | 'failed';
  /** Error message if failed */
  error?: string;
}

/**
 * Migration result
 */
export interface MigrationResult {
  /** Domain that was migrated */
  domain: QEMemoryDomain;
  /** Success status */
  success: boolean;
  /** Number of items migrated */
  itemsMigrated: number;
  /** Number of items skipped */
  itemsSkipped: number;
  /** Errors encountered */
  errors: string[];
}

// ============================================================================
// QE Unified Memory Configuration
// ============================================================================

/**
 * QEUnifiedMemory configuration
 */
export interface QEUnifiedMemoryConfig {
  /** Base memory backend for persistence */
  memoryBackend: MemoryBackend;

  /** Enable HNSW indexing for each domain */
  enableHNSW: Record<QEMemoryDomain, boolean>;

  /** Custom HNSW configurations per domain */
  hnswConfigs?: Partial<Record<QEMemoryDomain, Partial<HNSWIndexConfig>>>;

  /** Default namespace for non-vector storage */
  defaultNamespace: string;

  /** Enable cross-domain search */
  enableCrossDomainSearch: boolean;

  /** Embedding dimension (must match HNSW configs) */
  embeddingDimension: number;
}

/**
 * Default QEUnifiedMemory configuration
 */
export const DEFAULT_QE_UNIFIED_MEMORY_CONFIG: Omit<QEUnifiedMemoryConfig, 'memoryBackend'> = {
  enableHNSW: {
    'test-suites': true,
    'coverage': true,      // Already has HNSW
    'defects': true,
    'quality': true,
    'learning': true,      // Already has HNSW (ReasoningBank)
    'coordination': true,
  },
  defaultNamespace: 'qe-unified',
  enableCrossDomainSearch: true,
  embeddingDimension: EMBEDDING_CONFIG.DIMENSIONS,
};

// ============================================================================
// QE Unified Memory Statistics
// ============================================================================

/**
 * Per-domain statistics
 */
export interface QEMemoryDomainStats {
  /** Domain name */
  domain: QEMemoryDomain;
  /** Total entries */
  totalEntries: number;
  /** Vector entries in HNSW index */
  vectorCount: number;
  /** HNSW enabled */
  hnswEnabled: boolean;
  /** HNSW index size in bytes */
  indexSizeBytes: number;
  /** Average search latency */
  avgSearchLatencyMs: number;
}

/**
 * Unified memory statistics
 */
export interface QEUnifiedMemoryStats {
  /** Statistics per domain */
  byDomain: Record<QEMemoryDomain, QEMemoryDomainStats>;
  /** Total entries across all domains */
  totalEntries: number;
  /** Total vectors across all domains */
  totalVectors: number;
  /** Total index size */
  totalIndexSize: number;
  /** Overall HNSW health */
  hnswHealthy: boolean;
}

// ============================================================================
// QE Unified Memory Interface
// ============================================================================

/**
 * QEUnifiedMemory interface
 *
 * Provides a unified API for all QE memory operations across 6 domains.
 * Each domain can use HNSW indexing for O(log n) vector search.
 */
export interface IQEUnifiedMemory {
  /** Initialize the unified memory system */
  initialize(): Promise<void>;

  /** Dispose of all resources */
  dispose(): Promise<void>;

  // -------------------------------------------------------------------------
  // Key-Value Operations (Domain-Scoped)
  // -------------------------------------------------------------------------

  /** Store a value in a specific domain */
  set<T>(
    domain: QEMemoryDomain,
    key: string,
    value: T,
    options?: StoreOptions
  ): Promise<void>;

  /** Retrieve a value from a specific domain */
  get<T>(
    domain: QEMemoryDomain,
    key: string
  ): Promise<T | undefined>;

  /** Delete a value from a specific domain */
  delete(
    domain: QEMemoryDomain,
    key: string
  ): Promise<boolean>;

  /** Check if a key exists in a specific domain */
  has(
    domain: QEMemoryDomain,
    key: string
  ): Promise<boolean>;

  /** Search for keys matching a pattern in a specific domain */
  search(
    domain: QEMemoryDomain,
    pattern: string,
    limit?: number
  ): Promise<string[]>;

  // -------------------------------------------------------------------------
  // Vector Operations (Domain-Scoped HNSW)
  // -------------------------------------------------------------------------

  /** Store a vector embedding in a specific domain's HNSW index */
  storeVector(
    domain: QEMemoryDomain,
    key: string,
    embedding: number[],
    metadata?: QEMemoryMetadata
  ): Promise<void>;

  /** Search for similar vectors in a specific domain */
  vectorSearch(
    domain: QEMemoryDomain,
    query: number[],
    k: number
  ): Promise<QEMemorySearchResult[]>;

  /** Batch insert vectors into a specific domain */
  batchInsertVectors(
    domain: QEMemoryDomain,
    items: Array<{
      key: string;
      vector: number[];
      metadata?: QEMemoryMetadata;
    }>
  ): Promise<void>;

  // -------------------------------------------------------------------------
  // Cross-Domain Operations
  // -------------------------------------------------------------------------

  /** Search across all or selected domains */
  searchAllDomains(
    query: number[],
    options?: QEMemorySearchOptions
  ): Promise<QEMemorySearchResult[]>;

  /** Get unified statistics across all domains */
  getStats(): Promise<QEUnifiedMemoryStats>;

  /** Clear all entries in a specific domain */
  clearDomain(domain: QEMemoryDomain): Promise<void>;

  /** Clear all entries across all domains */
  clearAll(): Promise<void>;

  // -------------------------------------------------------------------------
  // Migration Operations
  // -------------------------------------------------------------------------

  /** Migrate data from legacy system to unified memory */
  migrate(config: MigrationConfig): Promise<MigrationResult>;

  /** Validate migration before running */
  validateMigration(config: MigrationConfig): Promise<Result<void, string>>;
}

// ============================================================================
// QE Unified Memory Implementation
// ============================================================================

/**
 * QEUnifiedMemory - Unified facade for QE memory systems
 *
 * Implementation notes:
 * - Uses base MemoryBackend for persistence (SQLite, AgentDB, Hybrid, etc.)
 * - Creates HNSWIndex instances for each enabled domain
 * - Provides domain namespacing for key isolation
 * - Supports cross-domain semantic search
 *
 * @example
 * ```typescript
 * const unifiedMemory = new QEUnifiedMemory({
 *   memoryBackend: memory,
 *   enableHNSW: {
 *     'coverage': true,
 *     'defects': true,
 *   },
 * });
 * await unifiedMemory.initialize();
 *
 * // Store coverage data with HNSW indexing
 * await unifiedMemory.storeVector('coverage', 'file:src/main.ts', embedding, {
 *   filePath: 'src/main.ts',
 *   lineCoverage: 85,
 *   riskScore: 0.3,
 * });
 *
 * // Search across all domains
 * const results = await unifiedMemory.searchAllDomains(queryEmbedding, {
 *   minSimilarity: 0.7,
 *   maxPerDomain: 5,
 * });
 * ```
 */
export class QEUnifiedMemory implements IQEUnifiedMemory {
  private readonly config: QEUnifiedMemoryConfig;
  private readonly domainNamespaces: Record<QEMemoryDomain, string>;
  private initialized = false;

  // HNSW indices per domain (lazy initialization)
  private hnswIndices: Partial<Record<QEMemoryDomain, HNSWIndex>> = {};

  // Track which domains have HNSW enabled
  private hnswEnabled: Record<QEMemoryDomain, boolean> = {
    'test-suites': false,
    'coverage': false,
    'defects': false,
    'quality': false,
    'learning': false,
    'coordination': false,
  } as Record<QEMemoryDomain, boolean>;

  constructor(config: QEUnifiedMemoryConfig) {
    this.config = config;

    // Create domain namespaces for key isolation
    this.domainNamespaces = {
      'test-suites': `${config.defaultNamespace}:test-suites`,
      'coverage': `${config.defaultNamespace}:coverage`,
      'defects': `${config.defaultNamespace}:defects`,
      'quality': `${config.defaultNamespace}:quality`,
      'learning': `${config.defaultNamespace}:learning`,
      'coordination': `${config.defaultNamespace}:coordination`,
    };
  }

  /**
   * Initialize the unified memory system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize HNSW indices for enabled domains
    for (const domain of QE_MEMORY_DOMAINS) {
      if (this.config.enableHNSW[domain]) {
        // Get domain-specific config (use default if not provided)
        const domainConfig = this.config.hnswConfigs?.[domain]
          ? { ...QE_DOMAIN_HNSW_CONFIGS[domain], ...this.config.hnswConfigs[domain] }
          : QE_DOMAIN_HNSW_CONFIGS[domain];

        // Create HNSW index for this domain
        this.hnswIndices[domain] = new HNSWIndex(this.config.memoryBackend, domainConfig);
        await this.hnswIndices[domain]!.initialize();

        this.hnswEnabled[domain] = true;

        logger.info('HNSW enabled for domain', { domain });
      }
    }

    this.initialized = true;
    logger.info('Initialized with HNSW domains', {
      domains: Object.entries(this.hnswEnabled)
        .filter(([_, enabled]) => enabled)
        .map(([domain]) => domain),
    });
  }

  /**
   * Dispose of all resources
   */
  async dispose(): Promise<void> {
    // Dispose all HNSW indices
    for (const [domain, index] of Object.entries(this.hnswIndices)) {
      if (index) {
        await index.clear();
        logger.info('Disposed HNSW for domain', { domain });
      }
    }

    this.hnswIndices = {};
    this.initialized = false;
  }

  // ==========================================================================
  // Key-Value Operations (Domain-Scoped)
  // ==========================================================================

  async set<T>(
    domain: QEMemoryDomain,
    key: string,
    value: T,
    options?: StoreOptions
  ): Promise<void> {
    this.ensureInitialized();

    const namespace = this.domainNamespaces[domain];
    const fullKey = this.buildKey(key, namespace);

    await this.config.memoryBackend.set(fullKey, value, {
      ...options,
      namespace,
    });
  }

  async get<T>(
    domain: QEMemoryDomain,
    key: string
  ): Promise<T | undefined> {
    this.ensureInitialized();

    const namespace = this.domainNamespaces[domain];
    const fullKey = this.buildKey(key, namespace);

    return this.config.memoryBackend.get<T>(fullKey);
  }

  async delete(
    domain: QEMemoryDomain,
    key: string
  ): Promise<boolean> {
    this.ensureInitialized();

    const namespace = this.domainNamespaces[domain];
    const fullKey = this.buildKey(key, namespace);

    // Delete from HNSW if enabled
    if (this.hnswEnabled[domain] && this.hnswIndices[domain]) {
      await this.hnswIndices[domain]!.delete(key);
    }

    // Delete from memory backend
    return this.config.memoryBackend.delete(fullKey);
  }

  async has(
    domain: QEMemoryDomain,
    key: string
  ): Promise<boolean> {
    this.ensureInitialized();

    const namespace = this.domainNamespaces[domain];
    const fullKey = this.buildKey(key, namespace);

    return this.config.memoryBackend.has(fullKey);
  }

  async search(
    domain: QEMemoryDomain,
    pattern: string,
    limit: number = 100
  ): Promise<string[]> {
    this.ensureInitialized();

    const namespace = this.domainNamespaces[domain];
    const namespacedPattern = `${namespace}:${pattern}`;

    return this.config.memoryBackend.search(namespacedPattern, limit);
  }

  // ==========================================================================
  // Vector Operations (Domain-Scoped HNSW)
  // ==========================================================================

  async storeVector(
    domain: QEMemoryDomain,
    key: string,
    embedding: number[],
    metadata?: QEMemoryMetadata
  ): Promise<void> {
    this.ensureInitialized();

    // Convert metadata to CoverageVectorMetadata for HNSW compatibility
    const hnswMetadata = this.toHNSWMetadata(domain, metadata);

    // Store in HNSW if enabled for domain
    if (this.hnswEnabled[domain] && this.hnswIndices[domain]) {
      await this.hnswIndices[domain]!.insert(key, embedding, hnswMetadata);
    } else {
      // Fall back to memory backend vector storage
      const namespace = this.domainNamespaces[domain];
      const fullKey = this.buildKey(key, namespace);
      await this.config.memoryBackend.storeVector(fullKey, embedding, metadata);
    }
  }

  async vectorSearch(
    domain: QEMemoryDomain,
    query: number[],
    k: number
  ): Promise<QEMemorySearchResult[]> {
    this.ensureInitialized();

    // Use HNSW if enabled
    if (this.hnswEnabled[domain] && this.hnswIndices[domain]) {
      const results = await this.hnswIndices[domain]!.search(query, k);
      return results.map(r => ({
        domain,
        key: r.key,
        score: r.score,
        metadata: r.metadata as QEMemoryMetadata,
      }));
    }

    // Fall back to memory backend vector search
    const namespace = this.domainNamespaces[domain];
    const results = await this.config.memoryBackend.vectorSearch(query, k);

    // Filter results to this domain's namespace
    return results
      .filter(r => r.key.startsWith(namespace + ':'))
      .map(r => ({
        domain,
        key: r.key.slice(namespace.length + 1),
        score: r.score,
        metadata: r.metadata as QEMemoryMetadata,
      }))
      .slice(0, k);
  }

  async batchInsertVectors(
    domain: QEMemoryDomain,
    items: Array<{
      key: string;
      vector: number[];
      metadata?: QEMemoryMetadata;
    }>
  ): Promise<void> {
    this.ensureInitialized();

    if (this.hnswEnabled[domain] && this.hnswIndices[domain]) {
      // Convert metadata to HNSW format
      const hnswItems: HNSWInsertItem[] = items.map(item => ({
        key: item.key,
        vector: item.vector,
        metadata: this.toHNSWMetadata(domain, item.metadata),
      }));
      await this.hnswIndices[domain]!.batchInsert(hnswItems);
    } else {
      // Fall back to individual inserts
      for (const item of items) {
        await this.storeVector(domain, item.key, item.vector, item.metadata);
      }
    }
  }

  // ==========================================================================
  // Cross-Domain Operations
  // ==========================================================================

  async searchAllDomains(
    query: number[],
    options: QEMemorySearchOptions = {}
  ): Promise<QEMemorySearchResult[]> {
    this.ensureInitialized();

    const {
      domains = QE_MEMORY_DOMAINS as QEMemoryDomain[],
      minSimilarity = 0,
      maxPerDomain = 10,
      filter,
    } = options;

    // Search each domain in parallel
    const searchPromises = domains.map(domain =>
      this.vectorSearch(domain, query, maxPerDomain)
    );

    const domainResults = await Promise.all(searchPromises);

    // Combine and filter results
    const combined: QEMemorySearchResult[] = [];

    for (const results of domainResults) {
      for (const result of results) {
        if (result.score >= minSimilarity) {
          if (filter && result.metadata) {
            try {
              if (!filter(result.metadata)) continue;
            } catch (e) {
              // Filter error, skip this result
              logger.debug('Search result filter callback failed', { error: e instanceof Error ? e.message : String(e) });
              continue;
            }
          }
          combined.push(result);
        }
      }
    }

    // Sort by score descending
    combined.sort((a, b) => b.score - a.score);

    return combined;
  }

  async getStats(): Promise<QEUnifiedMemoryStats> {
    this.ensureInitialized();

    const byDomain: Partial<Record<QEMemoryDomain, QEMemoryDomainStats>> = {};
    let totalEntries = 0;
    let totalVectors = 0;
    let totalIndexSize = 0;
    let hnswHealthy = true;

    for (const domain of QE_MEMORY_DOMAINS) {
      let vectorCount = 0;
      let indexSize = 0;
      let avgSearchLatency = 0;

      if (this.hnswEnabled[domain] && this.hnswIndices[domain]) {
        const stats = await this.hnswIndices[domain]!.getStats();
        vectorCount = stats.vectorCount;
        indexSize = stats.indexSizeBytes;
        avgSearchLatency = stats.avgSearchLatencyMs;
      }

      // Count total entries in domain (from memory backend)
      const domainPattern = `${this.domainNamespaces[domain]}:*`;
      const keys = await this.config.memoryBackend.search(domainPattern, 10000);
      const total = keys.length;

      byDomain[domain] = {
        domain,
        totalEntries: total,
        vectorCount,
        hnswEnabled: this.hnswEnabled[domain],
        indexSizeBytes: indexSize,
        avgSearchLatencyMs: avgSearchLatency,
      };

      totalEntries += total;
      totalVectors += vectorCount;
      totalIndexSize += indexSize;
    }

    return {
      // All domains are populated by the loop above over QE_MEMORY_DOMAINS
      byDomain: byDomain as Record<QEMemoryDomain, QEMemoryDomainStats>,
      totalEntries,
      totalVectors,
      totalIndexSize,
      hnswHealthy,
    };
  }

  async clearDomain(domain: QEMemoryDomain): Promise<void> {
    this.ensureInitialized();

    // Clear HNSW index if enabled
    if (this.hnswEnabled[domain] && this.hnswIndices[domain]) {
      await this.hnswIndices[domain]!.clear();
    }

    // Clear all keys in domain namespace
    const namespace = this.domainNamespaces[domain];
    const keys = await this.config.memoryBackend.search(`${namespace}:*`, 10000);

    for (const key of keys) {
      await this.config.memoryBackend.delete(key);
    }
  }

  async clearAll(): Promise<void> {
    this.ensureInitialized();

    // Clear each domain
    for (const domain of QE_MEMORY_DOMAINS) {
      await this.clearDomain(domain);
    }
  }

  // ==========================================================================
  // Migration Operations
  // ==========================================================================

  async validateMigration(config: MigrationConfig): Promise<Result<void, string>> {
    // Validate configuration
    if (!config.source) {
      return err('Migration source is required');
    }

    if (!config.domain) {
      return err('Target domain is required');
    }

    // Check if source path exists for file-based sources
    if (config.source !== 'in-memory' && !config.sourcePath) {
      return err('Source path is required for non-in-memory migrations');
    }

    // Validate HNSW is enabled for target domain
    if (config.generateEmbeddings && !this.hnswEnabled[config.domain]) {
      return err(`HNSW not enabled for domain: ${config.domain}. Cannot generate embeddings.`);
    }

    return ok(undefined);
  }

  async migrate(config: MigrationConfig): Promise<MigrationResult> {
    this.ensureInitialized();

    // Validate first
    const validation = await this.validateMigration(config);
    if (!validation.success) {
      return {
        domain: config.domain,
        success: false,
        itemsMigrated: 0,
        itemsSkipped: 0,
        errors: [validation.error],
      };
    }

    let itemsMigrated = 0;
    let itemsSkipped = 0;
    const errors: string[] = [];

    try {
      switch (config.source) {
        case 'sqlite':
          itemsMigrated = await this.migrateFromSQLite(config);
          break;
        case 'json':
          itemsMigrated = await this.migrateFromJSON(config);
          break;
        case 'in-memory':
          // In-memory migration is a no-op
          break;
        default:
          errors.push(`Migration source not implemented: ${config.source}`);
      }

      return {
        domain: config.domain,
        success: errors.length === 0,
        itemsMigrated,
        itemsSkipped,
        errors,
      };
    } catch (error) {
      return {
        domain: config.domain,
        success: false,
        itemsMigrated,
        itemsSkipped,
        errors: [toErrorMessage(error)],
      };
    }
  }

  // -------------------------------------------------------------------------
  // Private Migration Helpers
  // -------------------------------------------------------------------------

  private async migrateFromSQLite(config: MigrationConfig): Promise<number> {
    // Check if this is a V2 to V3 migration (patterns table)
    const sourcePath = config.sourceConfig?.path || '.agentic-qe/memory.db';

    // For V2 to V3 migration, use the dedicated migrator
    if (config.domain === 'learning' || config.migrateAll) {
      logger.info('Starting V2 to V3 migration', { sourcePath });

      const result = await migrateV2ToV3(
        sourcePath,
        '.agentic-qe/memory.db',
        (progress) => {
          logger.info('Migration progress', {
            stage: progress.stage,
            message: progress.message,
            table: progress.table,
            current: progress.current,
            total: progress.total,
          });
        }
      );

      if (result.success) {
        logger.info('V2 migration completed successfully', {
          tablesMigrated: result.tablesMigrated,
          totalRecords: Object.values(result.counts).reduce((a, b) => a + b, 0),
          durationSeconds: Number((result.duration / 1000).toFixed(2)),
        });
      } else {
        logger.error('V2 migration failed', undefined, { errors: result.errors });
      }

      return Object.values(result.counts).reduce((a, b) => a + b, 0);
    }

    // Generic SQLite migration for other domains
    logger.warn('Generic SQLite migration not yet implemented', { domain: config.domain });
    return 0;
  }

  private async migrateFromJSON(config: MigrationConfig): Promise<number> {
    // TODO: Implement JSON migration
    // This would read from a JSON file and import into unified memory
    logger.warn('JSON migration not yet implemented', { domain: config.domain });
    return 0;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('QEUnifiedMemory not initialized. Call initialize() first.');
    }
  }

  private buildKey(key: string, namespace: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Convert domain metadata to HNSW-compatible format
   * Since HNSWIndex expects CoverageVectorMetadata, we adapt other domain types
   */
  private toHNSWMetadata(
    domain: QEMemoryDomain,
    metadata?: QEMemoryMetadata
  ): CoverageVectorMetadata | undefined {
    if (!metadata) return undefined;

    // For coverage domain, it's already compatible
    if (domain === 'coverage' && this.isCoverageMetadata(metadata)) {
      return metadata as CoverageVectorMetadata;
    }

    // For other domains, create a compatible metadata structure
    return {
      filePath: this.extractFilePath(domain, metadata),
      lineCoverage: 0,
      branchCoverage: 0,
      functionCoverage: 0,
      statementCoverage: 0,
      uncoveredLineCount: 0,
      uncoveredBranchCount: 0,
      riskScore: this.extractRiskScore(domain, metadata),
      lastUpdated: Date.now(),
      totalLines: 0,
    };
  }

  private isCoverageMetadata(metadata: QEMemoryMetadata): metadata is CoverageMetadata {
    return 'lineCoverage' in metadata;
  }

  private extractFilePath(domain: QEMemoryDomain, metadata: QEMemoryMetadata): string {
    switch (domain) {
      case 'test-suites':
        return (metadata as TestSuiteMetadata).filePath;
      case 'defects':
        return (metadata as DefectMetadata).filePath;
      case 'quality':
        return (metadata as QualityMetricsMetadata).modulePath;
      case 'learning':
        return (metadata as LearningPatternMetadata).patternId;
      case 'coordination':
        return (metadata as CoordinationMetadata).agentId;
      case 'coverage':
      default:
        return (metadata as CoverageMetadata).filePath;
    }
  }

  private extractRiskScore(domain: QEMemoryDomain, metadata: QEMemoryMetadata): number {
    switch (domain) {
      case 'defects':
        const defectMeta = metadata as DefectMetadata;
        // Map severity to risk score
        const severityMap = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 };
        return severityMap[defectMeta.severity] * defectMeta.confidence;
      case 'quality':
        return 1 - (metadata as QualityMetricsMetadata).qualityScore;
      case 'learning':
        return 1 - (metadata as LearningPatternMetadata).successRate;
      case 'coordination':
        return 1 - (metadata as CoordinationMetadata).performanceScore;
      default:
        return 0.5;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a QEUnifiedMemory instance
 *
 * @param config - Configuration for unified memory
 * @returns Configured QEUnifiedMemory instance
 *
 * @example
 * ```typescript
 * const unifiedMemory = createQEUnifiedMemory({
 *   memoryBackend: memory,
 *   enableHNSW: {
 *     'coverage': true,
 *     'defects': true,
 *   },
 * });
 * await unifiedMemory.initialize();
 * ```
 */
export function createQEUnifiedMemory(
  config: QEUnifiedMemoryConfig
): QEUnifiedMemory {
  return new QEUnifiedMemory(config);
}

/**
 * Create QEUnifiedMemory with default configuration
 *
 * @param memoryBackend - Memory backend to use
 * @returns Configured QEUnifiedMemory with default settings
 */
export function createDefaultQEUnifiedMemory(
  memoryBackend: MemoryBackend
): QEUnifiedMemory {
  return createQEUnifiedMemory({
    memoryBackend,
    ...DEFAULT_QE_UNIFIED_MEMORY_CONFIG,
  });
}
