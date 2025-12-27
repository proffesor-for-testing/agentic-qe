/**
 * UnifiedMemoryCoordinator - Single interface for all memory systems
 *
 * Integrates:
 * - SwarmMemoryManager (cross-agent coordination with SQLite)
 * - AgentDBService (vector database operations)
 * - RuVectorPatternStore (high-performance pattern storage)
 *
 * Features:
 * - Automatic SQLite ↔ JSON fallback
 * - Memory health monitoring
 * - Unified namespace management
 * - Cross-system synchronization
 * - Transparent backend switching
 * - Metrics collection
 *
 * @module core/memory/UnifiedMemoryCoordinator
 * @version 1.0.0
 */

import { Logger } from '../../utils/Logger';
import { SwarmMemoryManager, type MemoryEntry, type StoreOptions, type RetrieveOptions } from './SwarmMemoryManager';
import { AgentDBService, type QEPattern, type PatternSearchOptions as AgentDBSearchOptions, type PatternSearchResult as AgentDBSearchResult } from './AgentDBService';
import { RuVectorPatternStore, type TestPattern, type PatternSearchOptions, type PatternSearchResult } from './RuVectorPatternStore';
import { isRuVectorAvailable } from './RuVectorPatternStore';
import {
  BinaryCacheManager,
  BinaryCacheReaderImpl,
  BinaryCacheBuilderImpl,
  TRMBinaryCacheBuilderImpl,
} from '../cache/BinaryCacheImpl';
import type {
  TRMPatternEntry,
  PatternEntry,
  BinaryCacheConfig,
  CacheMetrics,
  CacheBuildResult,
} from '../cache/BinaryMetadataCache';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Memory coordinator configuration
 */
export interface MemoryConfig {
  /** Preferred backend: sqlite, agentdb, json, or auto */
  preferredBackend: 'sqlite' | 'agentdb' | 'json' | 'auto';

  /** Enable fallback to JSON when SQLite fails */
  enableFallback: boolean;

  /** Sync interval in milliseconds */
  syncInterval: number;

  /** Health check interval in milliseconds */
  healthCheckInterval: number;

  /** Maximum retries for operations */
  maxRetries: number;

  /** Default namespace for operations */
  namespace: string;

  /** Database paths */
  dbPaths?: {
    swarm?: string;
    agentdb?: string;
    ruvector?: string;
  };

  /** Enable vector operations */
  enableVectorOps?: boolean;

  /** Vector dimension */
  vectorDimension?: number;

  /** Enable binary cache for TRM patterns */
  enableBinaryCache?: boolean;

  /** Binary cache configuration */
  binaryCacheConfig?: Partial<BinaryCacheConfig>;
}

/**
 * Health status for a memory backend
 */
export interface MemoryHealth {
  backend: string;
  status: 'healthy' | 'degraded' | 'failed';
  latency: number;
  lastCheck: Date;
  errorCount: number;
  details: Record<string, any>;
}

/**
 * Synchronization result
 */
export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  conflicts: number;
  duration: number;
  errors?: string[];
}

/**
 * Memory backend type
 */
export type MemoryBackend = 'sqlite' | 'agentdb' | 'json' | 'vector';

/**
 * Search options for unified interface
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  filter?: Record<string, any>;
}

/**
 * Search result from any backend
 */
export interface SearchResult {
  key: string;
  value: any;
  score?: number;
  backend: MemoryBackend;
  metadata?: Record<string, any>;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  key: string;
  similarity: number;
  metadata?: any;
  vector?: number[];
}

/**
 * Pattern for storage
 */
export interface Pattern {
  id: string;
  type: string;
  content: string;
  confidence: number;
  metadata: Record<string, any>;
  embedding?: number[];
}

/**
 * Pattern filter for querying
 */
export interface PatternFilter {
  type?: string;
  minConfidence?: number;
  domain?: string;
  limit?: number;
  metadata?: Record<string, any>;
}

/**
 * Memory metrics
 */
export interface MemoryMetrics {
  totalOperations: number;
  operationsByBackend: Map<MemoryBackend, number>;
  averageLatency: number;
  failoverCount: number;
  cacheHitRate: number;
  syncCount: number;
  errorCount: number;
  lastSync?: Date;
}

/**
 * UnifiedMemoryCoordinator - Unified interface for all memory systems
 */
export class UnifiedMemoryCoordinator {
  private readonly logger: Logger;
  private readonly config: MemoryConfig;

  // Backend instances
  private swarmMemory!: SwarmMemoryManager;
  private agentDB?: AgentDBService;
  private vectorStore?: RuVectorPatternStore;

  // Binary cache for TRM patterns (G4 integration)
  private binaryCacheManager?: BinaryCacheManager;
  private trmCacheBuilder?: TRMBinaryCacheBuilderImpl;
  private pendingTRMPatterns: TRMPatternEntry[] = [];

  // In-memory fallback
  private jsonStore: Map<string, { value: any; ttl?: number; createdAt: number }>;

  // State
  private activeBackend: MemoryBackend;
  private healthStatus: Map<MemoryBackend, MemoryHealth>;
  private fallbackChain: MemoryBackend[];
  private syncInProgress: boolean;
  private healthCheckTimer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;

  // Metrics
  private metrics: MemoryMetrics;

  constructor(config: Partial<MemoryConfig> = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      preferredBackend: config.preferredBackend ?? 'auto',
      enableFallback: config.enableFallback ?? true,
      syncInterval: config.syncInterval ?? 60000, // 1 minute
      healthCheckInterval: config.healthCheckInterval ?? 30000, // 30 seconds
      maxRetries: config.maxRetries ?? 3,
      namespace: config.namespace ?? 'default',
      dbPaths: config.dbPaths ?? {},
      enableVectorOps: config.enableVectorOps ?? true,
      vectorDimension: config.vectorDimension ?? 384,
      enableBinaryCache: config.enableBinaryCache ?? true,
      binaryCacheConfig: config.binaryCacheConfig ?? {},
    };

    this.jsonStore = new Map();
    this.healthStatus = new Map();
    this.syncInProgress = false;
    this.activeBackend = 'json'; // Start with fallback
    this.fallbackChain = [];

    this.metrics = {
      totalOperations: 0,
      operationsByBackend: new Map(),
      averageLatency: 0,
      failoverCount: 0,
      cacheHitRate: 0,
      syncCount: 0,
      errorCount: 0,
    };
  }

  /**
   * Initialize the memory coordinator
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing UnifiedMemoryCoordinator...');

    try {
      // Detect available backends
      const availableBackends = await this.detectAvailableBackends();
      this.logger.info('Available backends:', availableBackends);

      // Initialize SwarmMemoryManager (always available)
      await this.initializeSwarmMemory();

      // Initialize AgentDB if available
      if (availableBackends.includes('agentdb')) {
        await this.initializeAgentDB();
      }

      // Initialize RuVector if available
      if (availableBackends.includes('vector') && this.config.enableVectorOps) {
        await this.initializeVectorStore();
      }

      // Initialize Binary Cache for TRM patterns (G4)
      if (this.config.enableBinaryCache) {
        await this.initializeBinaryCache();
      }

      // Select optimal backend
      this.activeBackend = await this.selectOptimalBackend();
      this.logger.info(`Active backend: ${this.activeBackend}`);

      // Build fallback chain
      this.fallbackChain = this.buildFallbackChain(this.activeBackend);
      this.logger.info('Fallback chain:', this.fallbackChain);

      // Start health monitoring
      this.startHealthMonitoring();

      // Start periodic sync
      if (this.config.syncInterval > 0) {
        this.startPeriodicSync();
      }

      this.logger.info('UnifiedMemoryCoordinator initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize UnifiedMemoryCoordinator:', error);
      throw error;
    }
  }

  /**
   * Detect available backends
   */
  private async detectAvailableBackends(): Promise<MemoryBackend[]> {
    const backends: MemoryBackend[] = [];

    // SQLite is always available via SwarmMemoryManager
    backends.push('sqlite');

    // Check AgentDB
    try {
      require('agentdb');
      backends.push('agentdb');
    } catch {
      this.logger.debug('AgentDB not available');
    }

    // Check RuVector
    if (isRuVectorAvailable()) {
      backends.push('vector');
    } else {
      this.logger.debug('RuVector not available');
    }

    // JSON is always available as fallback
    backends.push('json');

    return backends;
  }

  /**
   * Initialize SwarmMemoryManager
   */
  private async initializeSwarmMemory(): Promise<void> {
    try {
      const dbPath = this.config.dbPaths?.swarm ??
        path.join(process.cwd(), '.agentic-qe', 'memory.db');

      await fs.ensureDir(path.dirname(dbPath));

      this.swarmMemory = new SwarmMemoryManager(dbPath);
      await this.swarmMemory.initialize();

      this.updateHealthStatus('sqlite', {
        backend: 'sqlite',
        status: 'healthy',
        latency: 0,
        lastCheck: new Date(),
        errorCount: 0,
        details: { dbPath },
      });

      this.logger.debug('SwarmMemoryManager initialized');
    } catch (error) {
      this.logger.error('Failed to initialize SwarmMemoryManager:', error);
      this.updateHealthStatus('sqlite', {
        backend: 'sqlite',
        status: 'failed',
        latency: 0,
        lastCheck: new Date(),
        errorCount: 1,
        details: { error: String(error) },
      });
      throw error;
    }
  }

  /**
   * Initialize AgentDB
   */
  private async initializeAgentDB(): Promise<void> {
    try {
      const dbPath = this.config.dbPaths?.agentdb ??
        path.join(process.cwd(), '.agentic-qe', 'agentdb.db');

      this.agentDB = new AgentDBService({
        dbPath,
        embeddingDim: this.config.vectorDimension!,
        enableHNSW: true,
        enableCache: true,
      });

      await this.agentDB.initialize();

      this.updateHealthStatus('agentdb', {
        backend: 'agentdb',
        status: 'healthy',
        latency: 0,
        lastCheck: new Date(),
        errorCount: 0,
        details: { dbPath },
      });

      this.logger.debug('AgentDB initialized');
    } catch (error) {
      this.logger.error('Failed to initialize AgentDB:', error);
      this.updateHealthStatus('agentdb', {
        backend: 'agentdb',
        status: 'failed',
        latency: 0,
        lastCheck: new Date(),
        errorCount: 1,
        details: { error: String(error) },
      });
    }
  }

  /**
   * Initialize RuVector store
   */
  private async initializeVectorStore(): Promise<void> {
    try {
      const dbPath = this.config.dbPaths?.ruvector ??
        path.join(process.cwd(), '.agentic-qe', 'vectors.db');

      this.vectorStore = new RuVectorPatternStore({
        dimension: this.config.vectorDimension!,
        metric: 'cosine',
        storagePath: dbPath,
        autoPersist: true,
        enableMetrics: true,
      });

      await this.vectorStore.initialize();

      this.updateHealthStatus('vector', {
        backend: 'vector',
        status: 'healthy',
        latency: 0,
        lastCheck: new Date(),
        errorCount: 0,
        details: { dbPath },
      });

      this.logger.debug('RuVector store initialized');
    } catch (error) {
      this.logger.error('Failed to initialize RuVector store:', error);
      this.updateHealthStatus('vector', {
        backend: 'vector',
        status: 'failed',
        latency: 0,
        lastCheck: new Date(),
        errorCount: 1,
        details: { error: String(error) },
      });
    }
  }

  /**
   * Initialize Binary Cache for TRM patterns (G4 integration)
   */
  private async initializeBinaryCache(): Promise<void> {
    try {
      const cachePath = path.join(
        this.config.dbPaths?.ruvector ?? path.join(process.cwd(), '.agentic-qe'),
        'pattern-cache.bin'
      );

      // Ensure directory exists
      await fs.ensureDir(path.dirname(cachePath));

      // Create cache manager with merged config
      const cacheConfig: Partial<BinaryCacheConfig> = {
        cachePath,
        enabled: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours default
        ...this.config.binaryCacheConfig,
      };

      this.binaryCacheManager = new BinaryCacheManager(cacheConfig);
      this.trmCacheBuilder = new TRMBinaryCacheBuilderImpl();
      this.pendingTRMPatterns = [];

      // Try to load existing cache
      const loaded = await this.binaryCacheManager.load();
      if (loaded) {
        this.logger.info('Binary cache loaded successfully');
        const metrics = this.binaryCacheManager.getMetrics();
        this.logger.debug(`Binary cache: ${metrics.patternCount} patterns, ${metrics.cacheFileSize} bytes`);
      } else {
        this.logger.debug('No existing binary cache found, will create on first persist');
      }
    } catch (error) {
      this.logger.warn('Failed to initialize binary cache, continuing without it:', error);
      this.binaryCacheManager = undefined;
      this.trmCacheBuilder = undefined;
    }
  }

  /**
   * Select optimal backend
   */
  private async selectOptimalBackend(): Promise<MemoryBackend> {
    if (this.config.preferredBackend !== 'auto') {
      const health = this.healthStatus.get(this.config.preferredBackend);
      if (health && health.status === 'healthy') {
        return this.config.preferredBackend as MemoryBackend;
      }
    }

    // Auto-select based on health and capabilities
    const priorities: MemoryBackend[] = ['sqlite', 'agentdb', 'vector', 'json'];

    for (const backend of priorities) {
      const health = this.healthStatus.get(backend);
      if (health && health.status === 'healthy') {
        return backend;
      }
    }

    // Fallback to JSON
    return 'json';
  }

  /**
   * Build fallback chain
   */
  private buildFallbackChain(primary: MemoryBackend): MemoryBackend[] {
    const chain: MemoryBackend[] = [primary];

    const alternatives: MemoryBackend[] = ['sqlite', 'agentdb', 'vector', 'json'];

    for (const backend of alternatives) {
      if (backend !== primary) {
        const health = this.healthStatus.get(backend);
        if (health && health.status !== 'failed') {
          chain.push(backend);
        }
      }
    }

    // Always have JSON as final fallback
    if (!chain.includes('json')) {
      chain.push('json');
    }

    return chain;
  }

  /**
   * Store a key-value pair
   */
  async store(key: string, value: any, ttl?: number): Promise<void> {
    const startTime = Date.now();
    const fullKey = this.prefixKey(key);

    try {
      await this.executeWithFallback(async (backend) => {
        await this.storeInBackend(backend, fullKey, value, ttl);
      });

      this.updateMetrics('store', startTime, this.activeBackend);
    } catch (error) {
      this.logger.error(`Failed to store key ${fullKey}:`, error);
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Store in specific backend
   */
  private async storeInBackend(backend: MemoryBackend, key: string, value: any, ttl?: number): Promise<void> {
    switch (backend) {
      case 'sqlite':
        await this.swarmMemory.store(key, value, { ttl, partition: this.config.namespace });
        break;

      case 'agentdb':
        // AgentDB stores patterns, not key-value pairs
        // Fall through to JSON for key-value storage
        throw new Error('AgentDB not suitable for key-value storage');

      case 'json':
        this.jsonStore.set(key, {
          value,
          ttl,
          createdAt: Date.now(),
        });
        break;

      default:
        throw new Error(`Unknown backend: ${backend}`);
    }
  }

  /**
   * Retrieve a value by key
   */
  async retrieve<T = any>(key: string): Promise<T | null> {
    const startTime = Date.now();
    const fullKey = this.prefixKey(key);

    try {
      const result = await this.executeWithFallback(async (backend) => {
        return await this.retrieveFromBackend<T>(backend, fullKey);
      });

      this.updateMetrics('retrieve', startTime, this.activeBackend);
      return result;
    } catch (error) {
      this.logger.error(`Failed to retrieve key ${fullKey}:`, error);
      this.metrics.errorCount++;
      return null;
    }
  }

  /**
   * Retrieve from specific backend
   */
  private async retrieveFromBackend<T>(backend: MemoryBackend, key: string): Promise<T | null> {
    switch (backend) {
      case 'sqlite':
        return await this.swarmMemory.retrieve(key, { partition: this.config.namespace }) as T | null;

      case 'json': {
        const entry = this.jsonStore.get(key);
        if (!entry) return null;

        // Check TTL
        if (entry.ttl && Date.now() - entry.createdAt > entry.ttl * 1000) {
          this.jsonStore.delete(key);
          return null;
        }

        return entry.value as T;
      }

      default:
        throw new Error(`Backend ${backend} not suitable for key-value retrieval`);
    }
  }

  /**
   * Delete a key
   */
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    const fullKey = this.prefixKey(key);

    try {
      const result = await this.executeWithFallback(async (backend) => {
        return await this.deleteFromBackend(backend, fullKey);
      });

      this.updateMetrics('delete', startTime, this.activeBackend);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete key ${fullKey}:`, error);
      this.metrics.errorCount++;
      return false;
    }
  }

  /**
   * Delete from specific backend
   */
  private async deleteFromBackend(backend: MemoryBackend, key: string): Promise<boolean> {
    switch (backend) {
      case 'sqlite':
        await this.swarmMemory.delete(key, this.config.namespace);
        return true;

      case 'json':
        return this.jsonStore.delete(key);

      default:
        return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.retrieve(key);
    return value !== null;
  }

  /**
   * List keys matching pattern
   */
  async list(pattern?: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      const result = await this.executeWithFallback(async (backend) => {
        return await this.listFromBackend(backend, pattern);
      });

      this.updateMetrics('list', startTime, this.activeBackend);
      return result;
    } catch (error) {
      this.logger.error('Failed to list keys:', error);
      this.metrics.errorCount++;
      return [];
    }
  }

  /**
   * List from specific backend
   */
  private async listFromBackend(backend: MemoryBackend, pattern?: string): Promise<string[]> {
    switch (backend) {
      case 'sqlite': {
        const sqlPattern = pattern ? pattern.replace(/\*/g, '%') : '%';
        const entries = await this.swarmMemory.query(sqlPattern, { partition: this.config.namespace });
        return entries.map(e => e.key);
      }

      case 'json': {
        const keys = Array.from(this.jsonStore.keys());
        if (!pattern) return keys;

        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return keys.filter(k => regex.test(k));
      }

      default:
        return [];
    }
  }

  /**
   * Search for entries
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      const results = await this.executeWithFallback(async (backend) => {
        return await this.searchInBackend(backend, query, options);
      });

      this.updateMetrics('search', startTime, this.activeBackend);
      return results;
    } catch (error) {
      this.logger.error('Failed to search:', error);
      this.metrics.errorCount++;
      return [];
    }
  }

  /**
   * Search in specific backend
   */
  private async searchInBackend(backend: MemoryBackend, query: string, options: SearchOptions): Promise<SearchResult[]> {
    switch (backend) {
      case 'sqlite': {
        const sqlPattern = `%${query}%`;
        const entries = await this.swarmMemory.query(sqlPattern, { partition: this.config.namespace });
        const keys = entries.map(e => e.key);
        const results: SearchResult[] = [];

        for (const key of keys.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 10))) {
          const value = await this.swarmMemory.retrieve(key, { partition: this.config.namespace });
          if (value) {
            results.push({ key, value, backend: 'sqlite' });
          }
        }

        return results;
      }

      case 'json': {
        const results: SearchResult[] = [];
        const limit = options.limit ?? 10;
        const offset = options.offset ?? 0;
        let count = 0;

        for (const [key, entry] of this.jsonStore.entries()) {
          if (key.includes(query)) {
            if (count >= offset && count < offset + limit) {
              results.push({ key, value: entry.value, backend: 'json' });
            }
            count++;
          }
        }

        return results;
      }

      default:
        return [];
    }
  }

  /**
   * Store multiple entries in batch
   */
  async storeBatch(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const startTime = Date.now();

    try {
      await this.executeWithFallback(async (backend) => {
        for (const entry of entries) {
          const fullKey = this.prefixKey(entry.key);
          await this.storeInBackend(backend, fullKey, entry.value, entry.ttl);
        }
      });

      this.updateMetrics('storeBatch', startTime, this.activeBackend);
    } catch (error) {
      this.logger.error('Failed to store batch:', error);
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Retrieve multiple entries in batch
   */
  async retrieveBatch<T = any>(keys: string[]): Promise<Map<string, T | null>> {
    const startTime = Date.now();
    const results = new Map<string, T | null>();

    try {
      await this.executeWithFallback(async (backend) => {
        for (const key of keys) {
          const fullKey = this.prefixKey(key);
          const value = await this.retrieveFromBackend<T>(backend, fullKey);
          results.set(key, value);
        }
      });

      this.updateMetrics('retrieveBatch', startTime, this.activeBackend);
      return results;
    } catch (error) {
      this.logger.error('Failed to retrieve batch:', error);
      this.metrics.errorCount++;
      return results;
    }
  }

  /**
   * Store a vector
   */
  async storeVector(key: string, vector: number[], metadata?: any): Promise<void> {
    if (!this.vectorStore) {
      throw new Error('Vector operations not enabled');
    }

    const pattern: TestPattern = {
      id: this.prefixKey(key),
      type: 'vector',
      domain: this.config.namespace,
      content: '',
      embedding: vector,
      metadata,
    };

    await this.vectorStore.storePattern(pattern);
  }

  /**
   * Search for similar vectors
   */
  async searchSimilar(vector: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    if (!this.vectorStore) {
      throw new Error('Vector operations not enabled');
    }

    const results = await this.vectorStore.searchSimilar(vector, { k: limit });

    return results.map(r => ({
      key: r.pattern.id,
      similarity: r.score,
      metadata: r.pattern.metadata,
      vector: r.pattern.embedding,
    }));
  }

  /**
   * Store a pattern
   */
  async storePattern(pattern: Pattern): Promise<void> {
    if (this.vectorStore && pattern.embedding) {
      const testPattern: TestPattern = {
        id: pattern.id,
        type: pattern.type,
        domain: this.config.namespace,
        content: pattern.content,
        embedding: pattern.embedding,
        metadata: pattern.metadata,
      };

      await this.vectorStore.storePattern(testPattern);
    } else {
      // Store as key-value
      await this.store(`pattern:${pattern.id}`, pattern);
    }
  }

  /**
   * Query patterns
   */
  async queryPatterns(filter: PatternFilter): Promise<Pattern[]> {
    const results: Pattern[] = [];

    if (this.vectorStore) {
      // Use vector store
      const keys = await this.list('pattern:*');

      for (const key of keys.slice(0, filter.limit ?? 100)) {
        const patternId = key.replace('pattern:', '');
        const pattern = await this.vectorStore.getPattern(patternId);

        if (pattern) {
          if (filter.type && pattern.type !== filter.type) continue;
          if (filter.domain && pattern.domain !== filter.domain) continue;

          results.push({
            id: pattern.id,
            type: pattern.type,
            content: pattern.content,
            confidence: 1.0,
            metadata: pattern.metadata ?? {},
            embedding: pattern.embedding,
          });
        }
      }
    } else {
      // Fall back to key-value search
      const keys = await this.list('pattern:*');

      for (const key of keys.slice(0, filter.limit ?? 100)) {
        const pattern = await this.retrieve<Pattern>(key);

        if (pattern) {
          if (filter.type && pattern.type !== filter.type) continue;
          if (filter.minConfidence && pattern.confidence < filter.minConfidence) continue;

          results.push(pattern);
        }
      }
    }

    return results;
  }

  /**
   * Get backend-specific instance
   */
  getSwarmMemory(): SwarmMemoryManager {
    return this.swarmMemory;
  }

  getAgentDB(): AgentDBService | undefined {
    return this.agentDB;
  }

  getVectorStore(): RuVectorPatternStore | undefined {
    return this.vectorStore;
  }

  /**
   * Get binary cache manager (G4)
   */
  getBinaryCacheManager(): BinaryCacheManager | undefined {
    return this.binaryCacheManager;
  }

  // ============================================
  // TRM Pattern Caching Methods (G4 Integration)
  // ============================================

  /**
   * Cache a TRM pattern for fast lookup
   * Patterns are staged in memory and persisted on flush or shutdown.
   */
  async cacheTRMPattern(pattern: TRMPatternEntry): Promise<void> {
    if (!this.binaryCacheManager) {
      this.logger.debug('Binary cache not available, skipping TRM pattern cache');
      return;
    }

    this.pendingTRMPatterns.push(pattern);

    // Auto-persist when batch size reaches threshold
    if (this.pendingTRMPatterns.length >= 100) {
      await this.persistBinaryCache();
    }
  }

  /**
   * Get a cached TRM pattern by ID
   */
  getCachedTRMPattern(id: string): PatternEntry | null {
    if (!this.binaryCacheManager) {
      return null;
    }

    // Check pending patterns first (not yet persisted)
    const pending = this.pendingTRMPatterns.find(p => p.id === id);
    if (pending) {
      // Convert TRMPatternEntry to PatternEntry format
      return {
        id: pending.id,
        type: pending.type,
        domain: pending.metadata.qualityMetric || 'default',
        content: pending.inputText + '\n---\n' + pending.outputText,
        embedding: pending.inputEmbedding || new Float32Array([]),
        framework: pending.metadata.iterations?.toString() || 'unknown',
        metadata: {
          coverage: pending.metadata.quality,
          flakinessScore: 0,
          verdict: pending.metadata.converged ? 'success' : 'unknown',
          createdAt: pending.metadata.createdAt || Date.now(),
          usageCount: pending.metadata.usageCount || 1,
          lastUsed: pending.metadata.lastUsed || Date.now(),
          successCount: pending.metadata.converged ? 1 : 0,
        },
      };
    }

    // Check persisted cache
    return this.binaryCacheManager.getPattern(id);
  }

  /**
   * Get all cached TRM patterns of a specific type
   */
  getCachedTRMPatternsByType(type: string): PatternEntry[] {
    if (!this.binaryCacheManager) {
      return [];
    }
    return this.binaryCacheManager.getPatternsByType(type);
  }

  /**
   * Persist all pending TRM patterns to binary cache
   */
  async persistBinaryCache(): Promise<CacheBuildResult | null> {
    if (!this.binaryCacheManager || this.pendingTRMPatterns.length === 0) {
      return null;
    }

    const startTime = Date.now();
    this.logger.debug(`Persisting ${this.pendingTRMPatterns.length} TRM patterns to binary cache`);

    try {
      // Convert TRM patterns to TestPattern format for the builder
      const testPatterns: TestPattern[] = this.pendingTRMPatterns.map(p => ({
        id: p.id,
        type: p.type,
        domain: p.metadata.qualityMetric || 'default',
        content: p.inputText + '\n---\n' + p.outputText,
        embedding: Array.from(p.inputEmbedding || []),
        metadata: {
          quality: p.metadata.quality,
          converged: p.metadata.converged,
          iterations: p.metadata.iterations,
          qualityMetric: p.metadata.qualityMetric,
        },
      }));

      // Merge with existing patterns from cache
      const existingPatterns = this.binaryCacheManager.getAllPatterns();
      const mergedTestPatterns = this.mergePatterns(existingPatterns, testPatterns);

      // Build and save cache
      const result = await this.binaryCacheManager.buildAndSave(mergedTestPatterns);

      if (result.success) {
        this.logger.info(`Binary cache persisted: ${result.patternCount} patterns, ${result.cacheFileSize} bytes, ${Date.now() - startTime}ms`);
        this.pendingTRMPatterns = []; // Clear pending
      } else {
        this.logger.error('Failed to persist binary cache:', result.error);
      }

      return result;
    } catch (error) {
      this.logger.error('Error persisting binary cache:', error);
      return null;
    }
  }

  /**
   * Merge existing PatternEntry with new TestPattern (dedup by id)
   */
  private mergePatterns(existing: PatternEntry[], newPatterns: TestPattern[]): TestPattern[] {
    const merged = new Map<string, TestPattern>();

    // Add existing patterns
    for (const p of existing) {
      merged.set(p.id, {
        id: p.id,
        type: p.type,
        domain: p.domain,
        content: p.content,
        embedding: Array.from(p.embedding),
        metadata: p.metadata,
      });
    }

    // Overwrite/add new patterns
    for (const p of newPatterns) {
      merged.set(p.id, p);
    }

    return Array.from(merged.values());
  }

  /**
   * Get binary cache metrics
   */
  getBinaryCacheMetrics(): CacheMetrics | null {
    if (!this.binaryCacheManager) {
      return null;
    }
    return this.binaryCacheManager.getMetrics();
  }

  /**
   * Invalidate binary cache (forces rebuild on next persist)
   */
  invalidateBinaryCache(trigger: 'pattern_stored' | 'pattern_deleted' | 'config_updated' | 'schema_migration' | 'ttl_expired' | 'manual'): void {
    if (this.binaryCacheManager) {
      this.binaryCacheManager.invalidate(trigger);
      this.logger.debug(`Binary cache invalidated: ${trigger}`);
    }
  }

  /**
   * Check if binary cache should be rebuilt
   */
  shouldRebuildBinaryCache(): boolean {
    return this.binaryCacheManager?.shouldRebuild() ?? false;
  }

  /**
   * Check health of all backends
   */
  async checkHealth(): Promise<Map<MemoryBackend, MemoryHealth>> {
    const backends: MemoryBackend[] = ['sqlite', 'agentdb', 'json', 'vector'];

    for (const backend of backends) {
      const startTime = Date.now();

      try {
        await this.healthCheckBackend(backend);

        const latency = Date.now() - startTime;

        this.updateHealthStatus(backend, {
          backend,
          status: 'healthy',
          latency,
          lastCheck: new Date(),
          errorCount: 0,
          details: {},
        });
      } catch (error) {
        const health = this.healthStatus.get(backend);
        const errorCount = (health?.errorCount ?? 0) + 1;

        this.updateHealthStatus(backend, {
          backend,
          status: errorCount > 3 ? 'failed' : 'degraded',
          latency: 0,
          lastCheck: new Date(),
          errorCount,
          details: { error: String(error) },
        });
      }
    }

    return this.healthStatus;
  }

  /**
   * Health check for specific backend
   */
  private async healthCheckBackend(backend: MemoryBackend): Promise<void> {
    switch (backend) {
      case 'sqlite':
        if (!this.swarmMemory) throw new Error('SwarmMemory not initialized');
        // Try a simple operation - query with wildcard to verify connectivity
        await this.swarmMemory.query('%', { partition: this.config.namespace });
        break;

      case 'agentdb':
        if (!this.agentDB) throw new Error('AgentDB not initialized');
        // AgentDB health check would go here
        break;

      case 'vector':
        if (!this.vectorStore) throw new Error('VectorStore not initialized');
        await this.vectorStore.getStats();
        break;

      case 'json':
        // JSON store is always healthy
        break;
    }
  }

  /**
   * Get health status
   */
  getHealthStatus(): Map<MemoryBackend, MemoryHealth> {
    return new Map(this.healthStatus);
  }

  /**
   * Check if coordinator is healthy
   */
  isHealthy(): boolean {
    const primaryHealth = this.healthStatus.get(this.activeBackend);
    return primaryHealth?.status === 'healthy';
  }

  /**
   * Execute with fallback
   */
  private async executeWithFallback<T>(
    operation: (backend: MemoryBackend) => Promise<T>,
    backends?: MemoryBackend[]
  ): Promise<T> {
    const chain = backends ?? this.fallbackChain;
    let lastError: Error | null = null;

    for (const backend of chain) {
      try {
        const result = await operation(backend);

        // If we're not using the primary backend, consider switching
        if (backend !== this.activeBackend) {
          this.metrics.failoverCount++;
          this.logger.warn(`Using fallback backend: ${backend}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        this.logger.debug(`Backend ${backend} failed:`, error);

        // Update health status
        const health = this.healthStatus.get(backend);
        if (health) {
          health.errorCount++;
          health.status = 'degraded';
        }
      }
    }

    throw new Error(`All backends failed: ${lastError?.message}`);
  }

  /**
   * Switch backend
   */
  private async switchBackend(from: MemoryBackend, to: MemoryBackend): Promise<void> {
    this.logger.info(`Switching backend from ${from} to ${to}`);

    this.activeBackend = to;
    this.fallbackChain = this.buildFallbackChain(to);

    // Optionally sync data
    if (this.config.enableFallback) {
      await this.syncBackends();
    }
  }

  /**
   * Sync data between backends
   */
  async syncBackends(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return {
        success: false,
        recordsSynced: 0,
        conflicts: 0,
        duration: 0,
        errors: ['Sync already in progress'],
      };
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    let recordsSynced = 0;
    const errors: string[] = [];

    try {
      this.logger.debug('Starting backend synchronization...');

      // Sync SQLite to JSON
      if (this.swarmMemory) {
        try {
          const entries = await this.swarmMemory.query('%', { partition: this.config.namespace });
          const keys = entries.map(e => e.key);

          for (const key of keys) {
            try {
              const value = await this.swarmMemory.retrieve(key, { partition: this.config.namespace });

              if (value) {
                this.jsonStore.set(key, {
                  value,
                  createdAt: Date.now(),
                });
                recordsSynced++;
              }
            } catch (error) {
              errors.push(`Failed to sync key ${key}: ${error}`);
            }
          }
        } catch (error) {
          errors.push(`Failed to sync from SQLite: ${error}`);
        }
      }

      const duration = Date.now() - startTime;
      this.metrics.syncCount++;
      this.metrics.lastSync = new Date();

      this.logger.info(`Sync completed: ${recordsSynced} records in ${duration}ms`);

      return {
        success: errors.length === 0,
        recordsSynced,
        conflicts: 0,
        duration,
        errors: errors.length > 0 ? errors : undefined,
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Create namespaced coordinator
   */
  createNamespace(name: string): NamespacedCoordinator {
    return new NamespacedCoordinator(this, name);
  }

  /**
   * Get metrics
   */
  getMetrics(): MemoryMetrics {
    return {
      ...this.metrics,
      operationsByBackend: new Map(this.metrics.operationsByBackend),
    };
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        this.logger.error('Health check failed:', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      try {
        await this.syncBackends();
      } catch (error) {
        this.logger.error('Periodic sync failed:', error);
      }
    }, this.config.syncInterval);
  }

  /**
   * Update health status
   */
  private updateHealthStatus(backend: MemoryBackend, health: MemoryHealth): void {
    this.healthStatus.set(backend, health);
  }

  /**
   * Update metrics
   */
  private updateMetrics(operation: string, startTime: number, backend: MemoryBackend): void {
    const duration = Date.now() - startTime;

    this.metrics.totalOperations++;

    const backendOps = this.metrics.operationsByBackend.get(backend) ?? 0;
    this.metrics.operationsByBackend.set(backend, backendOps + 1);

    // Update average latency
    const totalLatency = this.metrics.averageLatency * (this.metrics.totalOperations - 1) + duration;
    this.metrics.averageLatency = totalLatency / this.metrics.totalOperations;
  }

  /**
   * Prefix key with namespace
   */
  private prefixKey(key: string): string {
    return `${this.config.namespace}:${key}`;
  }

  /**
   * Shutdown coordinator
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down UnifiedMemoryCoordinator...');

    // Stop timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Persist binary cache before shutdown (G4)
    if (this.binaryCacheManager && this.pendingTRMPatterns.length > 0) {
      this.logger.debug('Persisting pending TRM patterns before shutdown...');
      await this.persistBinaryCache();
    }

    // Close binary cache
    if (this.binaryCacheManager) {
      this.binaryCacheManager.close();
    }

    // Final sync
    if (this.config.enableFallback) {
      await this.syncBackends();
    }

    // Shutdown backends
    if (this.vectorStore) {
      await this.vectorStore.shutdown();
    }

    if (this.agentDB) {
      await this.agentDB.close();
    }

    if (this.swarmMemory) {
      await this.swarmMemory.close();
    }

    this.logger.info('UnifiedMemoryCoordinator shut down');
  }
}

/**
 * Namespaced wrapper for isolated operations
 */
export class NamespacedCoordinator {
  constructor(
    private coordinator: UnifiedMemoryCoordinator,
    private namespace: string
  ) {}

  async store(key: string, value: any, ttl?: number): Promise<void> {
    return this.coordinator.store(this.prefixKey(key), value, ttl);
  }

  async retrieve<T = any>(key: string): Promise<T | null> {
    return this.coordinator.retrieve<T>(this.prefixKey(key));
  }

  async delete(key: string): Promise<boolean> {
    return this.coordinator.delete(this.prefixKey(key));
  }

  async list(pattern?: string): Promise<string[]> {
    const keys = await this.coordinator.list(pattern ? this.prefixKey(pattern) : undefined);
    return keys.map(k => this.unprefixKey(k));
  }

  private prefixKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  private unprefixKey(key: string): string {
    const prefix = `${this.namespace}:`;
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
  }
}

/**
 * Convenience function to create a coordinator
 */
export async function createUnifiedMemoryCoordinator(
  config?: Partial<MemoryConfig>
): Promise<UnifiedMemoryCoordinator> {
  const coordinator = new UnifiedMemoryCoordinator(config);
  await coordinator.initialize();
  return coordinator;
}
