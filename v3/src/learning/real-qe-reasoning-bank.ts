/**
 * Real QE ReasoningBank - Standalone Implementation
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * This implementation:
 * - Standalone implementation (HybridReasoningBank has problematic singleton behavior)
 * - Uses REAL transformer embeddings (@xenova/transformers)
 * - Uses REAL SQLite persistence (better-sqlite3)
 * - Uses REAL HNSW indexing (hnswlib-node)
 *
 * NO fake claims, NO hash-based "embeddings", NO silent fallbacks.
 *
 * NOTE: We don't extend HybridReasoningBank because:
 * 1. It has a bug where Database is not imported (requires globalThis polyfill)
 * 2. It uses SharedMemoryPool singleton that causes repeated re-initialization
 * 3. Standalone implementation gives us full control and better performance
 */
import { v4 as uuidv4 } from 'uuid';
import {
  computeRealEmbedding,
  computeBatchEmbeddings,
  cosineSimilarity,
  isTransformerAvailable,
  getEmbeddingDimension,
  clearEmbeddingCache,
  type EmbeddingConfig,
} from './real-embeddings.js';
import {
  SQLitePatternStore,
  createSQLitePatternStore,
  type SQLitePersistenceConfig,
} from './sqlite-persistence.js';
import {
  QEPattern,
  QEPatternType,
  QEDomain,
  QEPatternContext,
  CreateQEPatternOptions,
  detectQEDomain,
  detectQEDomains,
  mapQEDomainToAQE,
  QE_DOMAIN_LIST,
} from './qe-patterns.js';
import {
  QEGuidance,
  getGuidance,
  getCombinedGuidance,
  generateGuidanceContext,
  checkAntiPatterns,
} from './qe-guidance.js';
import type { Result } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import { CircularBuffer } from '../shared/utils/circular-buffer.js';

// ============================================================================
// Configuration
// ============================================================================

export interface RealQEReasoningBankConfig {
  /** SQLite database configuration */
  sqlite: Partial<SQLitePersistenceConfig>;

  /** Embedding model configuration */
  embeddings: Partial<EmbeddingConfig>;

  /** Enable learning from outcomes */
  enableLearning: boolean;

  /** Enable task routing */
  enableRouting: boolean;

  /** Enable guidance generation */
  enableGuidance: boolean;

  /** HNSW index parameters */
  hnsw: {
    M: number;
    efConstruction: number;
    efSearch: number;
  };

  /** Routing weights */
  routingWeights: {
    similarity: number;
    performance: number;
    capabilities: number;
  };
}

export const DEFAULT_REAL_CONFIG: RealQEReasoningBankConfig = {
  sqlite: {
    // ADR-046: Now uses unified storage via UnifiedMemoryManager by default
    // dbPath is ignored when useUnified=true (the default)
    dbPath: '.agentic-qe/qe-patterns.db', // Legacy fallback path
    walMode: true,
    useUnified: true, // Uses shared .agentic-qe/memory.db
  },
  embeddings: {
    modelName: 'Xenova/all-MiniLM-L6-v2',
    quantized: true,
    enableCache: true,
  },
  enableLearning: true,
  enableRouting: true,
  enableGuidance: true,
  hnsw: {
    M: 16,
    efConstruction: 200,
    efSearch: 100,
  },
  routingWeights: {
    similarity: 0.3,
    performance: 0.4,
    capabilities: 0.3,
  },
};

// ============================================================================
// Routing Types
// ============================================================================

export interface RealQERoutingRequest {
  task: string;
  taskType?: 'test-generation' | 'analysis' | 'debugging' | 'optimization';
  domain?: QEDomain;
  capabilities?: string[];
  context?: Partial<QEPatternContext>;
}

export interface RealQERoutingResult {
  recommendedAgent: string;
  confidence: number;
  alternatives: Array<{ agent: string; score: number }>;
  domains: QEDomain[];
  patterns: QEPattern[];
  guidance: string[];
  reasoning: string;
  latencyMs: number;
}

export interface LearningOutcome {
  patternId: string;
  success: boolean;
  metrics?: {
    testsPassed?: number;
    testsFailed?: number;
    coverageImprovement?: number;
    executionTimeMs?: number;
  };
  feedback?: string;
}

// ============================================================================
// Statistics
// ============================================================================

export interface RealQEReasoningBankStats {
  totalPatterns: number;
  byDomain: Record<QEDomain, number>;
  byTier: Record<string, number>;
  routingRequests: number;
  avgRoutingLatencyMs: number;
  p95RoutingLatencyMs: number;
  learningOutcomes: number;
  patternSuccessRate: number;
  embeddingCacheSize: number;
  transformerAvailable: boolean;
  embeddingDimension: number;
  sqliteDbPath: string;
}

// ============================================================================
// Real QE ReasoningBank Implementation
// ============================================================================

/**
 * Real QE ReasoningBank - Standalone Implementation
 *
 * Standalone implementation with REAL:
 * - Transformer embeddings (all-MiniLM-L6-v2, 384 dimensions)
 * - SQLite persistence (better-sqlite3 with WAL mode)
 * - HNSW vector indexing (hnswlib-node)
 *
 * Does NOT extend HybridReasoningBank due to upstream bugs and problematic singleton behavior.
 */
export class RealQEReasoningBank {
  private readonly qeConfig: RealQEReasoningBankConfig;
  private sqliteStore: SQLitePatternStore;
  private hnswIndex: HierarchicalNSW | null = null;
  private patternIdMap: Map<number, string> = new Map();
  private initialized = false;

  // Statistics tracking - using CircularBuffer for O(1) operations (ADR memory leak fix)
  private stats = {
    routingRequests: 0,
    totalRoutingLatency: 0,
    learningOutcomes: 0,
    successfulOutcomes: 0,
  };

  // Separate CircularBuffer for routing latencies - prevents O(n) shift() calls
  // and bounds memory to exactly 1000 entries
  private routingLatencies = new CircularBuffer<number>(1000);

  // QE Agent capability mapping
  private readonly agentCapabilities: Record<string, {
    domains: QEDomain[];
    capabilities: string[];
    performanceScore: number;
  }> = {
    'qe-test-generator': {
      domains: ['test-generation'],
      capabilities: ['test-generation', 'tdd', 'bdd', 'unit-test', 'integration-test'],
      performanceScore: 0.85,
    },
    'qe-coverage-analyzer': {
      domains: ['coverage-analysis'],
      capabilities: ['coverage-analysis', 'gap-detection', 'risk-scoring'],
      performanceScore: 0.92,
    },
    'qe-coverage-specialist': {
      domains: ['coverage-analysis'],
      capabilities: ['sublinear-analysis', 'branch-coverage', 'mutation-testing'],
      performanceScore: 0.88,
    },
    'qe-test-architect': {
      domains: ['test-generation', 'coverage-analysis'],
      capabilities: ['test-strategy', 'test-pyramid', 'architecture'],
      performanceScore: 0.9,
    },
    'qe-api-contract-validator': {
      domains: ['contract-testing'],
      capabilities: ['contract-testing', 'openapi', 'graphql', 'pact'],
      performanceScore: 0.87,
    },
    'qe-security-auditor': {
      domains: ['security-compliance'],
      capabilities: ['sast', 'dast', 'vulnerability', 'owasp'],
      performanceScore: 0.82,
    },
    'qe-visual-tester': {
      domains: ['visual-accessibility'],
      capabilities: ['screenshot', 'visual-regression', 'percy', 'chromatic'],
      performanceScore: 0.8,
    },
    'qe-a11y-ally': {
      domains: ['visual-accessibility'],
      capabilities: ['wcag', 'aria', 'screen-reader', 'contrast'],
      performanceScore: 0.85,
    },
    'qe-performance-tester': {
      domains: ['chaos-resilience'],
      capabilities: ['load-testing', 'stress-testing', 'k6', 'artillery'],
      performanceScore: 0.83,
    },
    'qe-flaky-investigator': {
      domains: ['test-execution'],
      capabilities: ['flaky-detection', 'test-stability', 'retry'],
      performanceScore: 0.78,
    },
    'qe-chaos-engineer': {
      domains: ['chaos-resilience'],
      capabilities: ['chaos-testing', 'resilience', 'fault-injection'],
      performanceScore: 0.75,
    },
  };

  constructor(config: Partial<RealQEReasoningBankConfig> = {}) {
    this.qeConfig = { ...DEFAULT_REAL_CONFIG, ...config };
    this.sqliteStore = createSQLitePatternStore(this.qeConfig.sqlite);
  }

  /**
   * Initialize the QE ReasoningBank
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = performance.now();

    // Initialize SQLite persistence
    await this.sqliteStore.initialize();
    console.log('[RealQEReasoningBank] SQLite persistence initialized');

    // Initialize HNSW index
    await this.initializeHNSW();
    console.log('[RealQEReasoningBank] HNSW index initialized');

    // Load existing patterns into HNSW
    await this.loadPatternsIntoHNSW();

    // Load foundational patterns if database is empty
    const stats = this.sqliteStore.getStats();
    if (stats.totalPatterns === 0) {
      await this.loadFoundationalPatterns();
    }

    this.initialized = true;
    const initTime = performance.now() - startTime;
    console.log(`[RealQEReasoningBank] Fully initialized in ${initTime.toFixed(0)}ms`);
  }

  /**
   * Initialize HNSW index for fast similarity search
   */
  private async initializeHNSW(): Promise<void> {
    try {
      // Import hnswlib-node
      // Note: Dynamic import returns { default: { HierarchicalNSW, ... } } structure
      const hnswModule = await import('hnswlib-node');
      // Access through default due to ES module interop
      const HierarchicalNSW = (hnswModule.default as any)?.HierarchicalNSW || hnswModule.HierarchicalNSW;

      if (typeof HierarchicalNSW !== 'function') {
        throw new Error('HierarchicalNSW not found in hnswlib-node module');
      }

      const dimension = getEmbeddingDimension();

      // Create HNSW index with metric and dimensions (2 arguments)
      // metric: 'cosine' | 'l2' | 'ip'
      this.hnswIndex = new HierarchicalNSW('cosine', dimension) as unknown as HierarchicalNSW;
      this.hnswIndex!.initIndex(
        100000, // max elements
        this.qeConfig.hnsw.M,
        this.qeConfig.hnsw.efConstruction
      );
      this.hnswIndex!.setEf(this.qeConfig.hnsw.efSearch);

      console.log(`[RealQEReasoningBank] HNSW initialized: dim=${dimension}, M=${this.qeConfig.hnsw.M}`);
    } catch (error) {
      console.error('[RealQEReasoningBank] HNSW initialization failed:', error);
      throw error; // Don't silently fall back - fail explicitly
    }
  }

  /**
   * Load existing patterns into HNSW index
   */
  private async loadPatternsIntoHNSW(): Promise<void> {
    if (!this.hnswIndex) return;

    const embeddings = this.sqliteStore.getAllEmbeddings();
    let loaded = 0;

    for (const { patternId, embedding } of embeddings) {
      const index = this.hnswIndex.getCurrentCount();
      this.hnswIndex.addPoint(embedding, index);
      this.patternIdMap.set(index, patternId);
      loaded++;
    }

    console.log(`[RealQEReasoningBank] Loaded ${loaded} patterns into HNSW index`);
  }

  /**
   * Load foundational QE patterns
   */
  private async loadFoundationalPatterns(): Promise<void> {
    const foundationalPatterns: CreateQEPatternOptions[] = [
      {
        patternType: 'test-template',
        name: 'AAA Unit Test',
        description: 'Arrange-Act-Assert pattern for clear, maintainable unit tests',
        template: {
          type: 'code',
          content: `describe('{{className}}', () => {
  describe('{{methodName}}', () => {
    it('should {{expectedBehavior}}', {{async}} () => {
      // Arrange
      {{arrangeCode}}

      // Act
      {{actCode}}

      // Assert
      {{assertCode}}
    });
  });
});`,
          variables: [
            { name: 'className', type: 'string', required: true },
            { name: 'methodName', type: 'string', required: true },
            { name: 'expectedBehavior', type: 'string', required: true },
          ],
        },
        context: { testType: 'unit', tags: ['unit-test', 'aaa', 'best-practice'] },
      },
      {
        patternType: 'coverage-strategy',
        name: 'Risk-Based Coverage',
        description: 'Prioritize coverage by code risk and complexity',
        template: {
          type: 'prompt',
          content: 'Analyze coverage gaps focusing on critical business logic, error handling, and high-complexity functions.',
          variables: [],
        },
        context: { tags: ['coverage', 'risk-based'] },
      },
    ];

    for (const options of foundationalPatterns) {
      try {
        await this.storeQEPattern(options);
      } catch (error) {
        console.warn(`[RealQEReasoningBank] Failed to load foundational pattern: ${options.name}`, error);
      }
    }

    console.log(`[RealQEReasoningBank] Loaded ${foundationalPatterns.length} foundational patterns`);
  }

  /**
   * Store a QE pattern with REAL embeddings
   */
  async storeQEPattern(options: CreateQEPatternOptions): Promise<Result<QEPattern>> {
    // Require explicit initialization - don't auto-initialize to avoid memory issues

    try {
      // Generate REAL embedding using transformer model
      const textToEmbed = `${options.name} ${options.description || ''} ${options.context?.tags?.join(' ') || ''}`;
      const embedding = await computeRealEmbedding(textToEmbed, this.qeConfig.embeddings);

      // Detect QE domain
      const qeDomain = detectQEDomain(textToEmbed) || 'test-generation';

      // Generate pattern ID
      const patternId = uuidv4();

      // Create pattern object
      const pattern: QEPattern = {
        id: patternId,
        patternType: options.patternType,
        qeDomain,
        domain: mapQEDomainToAQE(qeDomain),
        name: options.name,
        description: options.description || '',
        confidence: 0.5,
        usageCount: 0,
        successRate: 0,
        qualityScore: 0,
        tier: 'short-term',
        template: options.template as QEPattern['template'],
        context: { tags: [], ...options.context } as QEPatternContext,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        successfulUses: 0,
        embedding,
        // Token tracking fields (ADR-042)
        reusable: false,
        reuseCount: 0,
        averageTokenSavings: 0,
      };

      // Store in SQLite
      this.sqliteStore.storePattern(pattern, embedding);

      // Add to HNSW index
      if (this.hnswIndex) {
        const index = this.hnswIndex.getCurrentCount();
        this.hnswIndex.addPoint(embedding, index);
        this.patternIdMap.set(index, patternId);
      }

      return ok(pattern);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Search patterns using REAL vector similarity (HNSW)
   */
  async searchQEPatterns(
    query: string,
    options: { limit?: number; domain?: QEDomain; minSimilarity?: number } = {}
  ): Promise<Result<Array<{ pattern: QEPattern; similarity: number }>>> {
    // Require explicit initialization - don't auto-initialize to avoid memory issues

    const startTime = performance.now();

    try {
      if (!this.hnswIndex) {
        return err(new Error('HNSW index not available'));
      }

      // Generate REAL embedding for query
      const queryEmbedding = await computeRealEmbedding(query, this.qeConfig.embeddings);

      // Search HNSW index
      const limit = options.limit || 10;
      const results = this.hnswIndex.searchKnn(queryEmbedding, limit * 2); // Get extra for filtering

      const patterns: Array<{ pattern: QEPattern; similarity: number }> = [];

      for (let i = 0; i < results.neighbors.length && patterns.length < limit; i++) {
        const hnswIndex = results.neighbors[i];
        const distance = results.distances[i];
        const similarity = 1 - distance; // Convert distance to similarity

        if (options.minSimilarity && similarity < options.minSimilarity) {
          continue;
        }

        const patternId = this.patternIdMap.get(hnswIndex);
        if (!patternId) continue;

        const pattern = this.sqliteStore.getPattern(patternId);
        if (!pattern) continue;

        // Filter by domain if specified
        if (options.domain && pattern.qeDomain !== options.domain) {
          continue;
        }

        patterns.push({ pattern, similarity });
      }

      const searchTime = performance.now() - startTime;
      if (searchTime > 10) {
        console.warn(`[RealQEReasoningBank] Slow search: ${searchTime.toFixed(1)}ms`);
      }

      return ok(patterns);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Route a task to optimal agent
   */
  async routeTask(request: RealQERoutingRequest): Promise<Result<RealQERoutingResult>> {
    // Require explicit initialization - don't auto-initialize to avoid memory issues

    const startTime = performance.now();
    this.stats.routingRequests++;

    try {
      // Detect domains
      const detectedDomains = request.domain
        ? [request.domain]
        : detectQEDomains(request.task);

      if (detectedDomains.length === 0) {
        detectedDomains.push('test-generation');
      }

      // Search for similar patterns
      const searchResult = await this.searchQEPatterns(request.task, {
        limit: 10,
        domain: detectedDomains[0],
      });

      const patterns = searchResult.success ? searchResult.value.map(r => r.pattern) : [];

      // Calculate agent scores
      const agentScores: Array<{ agent: string; score: number; reasoning: string[] }> = [];

      for (const [agentType, profile] of Object.entries(this.agentCapabilities)) {
        let score = 0;
        const reasoning: string[] = [];

        // Domain match
        const domainMatch = detectedDomains.filter(d => profile.domains.includes(d)).length;
        const domainScore = domainMatch > 0 ? (domainMatch / detectedDomains.length) * 0.4 : 0;
        score += domainScore * this.qeConfig.routingWeights.similarity;
        if (domainScore > 0) reasoning.push(`Domain: ${(domainScore * 100).toFixed(0)}%`);

        // Capability match
        if (request.capabilities && request.capabilities.length > 0) {
          const capMatch = request.capabilities.filter(c =>
            profile.capabilities.some(pc => pc.toLowerCase().includes(c.toLowerCase()))
          ).length;
          const capScore = capMatch > 0 ? (capMatch / request.capabilities.length) * 0.3 : 0;
          score += capScore * this.qeConfig.routingWeights.capabilities;
          if (capScore > 0) reasoning.push(`Caps: ${(capScore * 100).toFixed(0)}%`);
        } else {
          score += 0.15 * this.qeConfig.routingWeights.capabilities;
        }

        // Performance
        score += profile.performanceScore * 0.3 * this.qeConfig.routingWeights.performance;
        reasoning.push(`Perf: ${(profile.performanceScore * 100).toFixed(0)}%`);

        agentScores.push({ agent: agentType, score, reasoning });
      }

      agentScores.sort((a, b) => b.score - a.score);

      const recommended = agentScores[0];
      const alternatives = agentScores.slice(1, 4);

      // Generate guidance
      const guidance: string[] = [];
      if (this.qeConfig.enableGuidance && detectedDomains.length > 0) {
        const domainGuidance = getCombinedGuidance(detectedDomains[0], {
          framework: request.context?.framework as any,
          language: request.context?.language as any,
          includeAntiPatterns: true,
        });
        guidance.push(...domainGuidance.slice(0, 5));
      }

      const latencyMs = performance.now() - startTime;
      this.stats.totalRoutingLatency += latencyMs;
      // CircularBuffer handles bounded size automatically - O(1) operation
      this.routingLatencies.push(latencyMs);

      return ok({
        recommendedAgent: recommended.agent,
        confidence: recommended.score,
        alternatives: alternatives.map(a => ({ agent: a.agent, score: a.score })),
        domains: detectedDomains,
        patterns,
        guidance,
        reasoning: recommended.reasoning.join('; '),
        latencyMs,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Record pattern usage outcome
   */
  async recordOutcome(outcome: LearningOutcome): Promise<Result<void>> {
    // Require explicit initialization - don't auto-initialize to avoid memory issues

    if (!this.qeConfig.enableLearning) {
      return ok(undefined);
    }

    try {
      this.sqliteStore.recordUsage(
        outcome.patternId,
        outcome.success,
        outcome.metrics,
        outcome.feedback
      );

      this.stats.learningOutcomes++;
      if (outcome.success) {
        this.stats.successfulOutcomes++;
      }

      // Check if pattern should be promoted
      const pattern = this.sqliteStore.getPattern(outcome.patternId);
      if (pattern && this.shouldPromote(pattern)) {
        this.sqliteStore.promotePattern(outcome.patternId);
        console.log(`[RealQEReasoningBank] Pattern promoted to long-term: ${pattern.name}`);
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check if pattern should be promoted to long-term
   */
  private shouldPromote(pattern: QEPattern): boolean {
    return (
      pattern.tier === 'short-term' &&
      pattern.successfulUses >= 3 &&
      pattern.successRate >= 0.7 &&
      pattern.confidence >= 0.6
    );
  }

  /**
   * Get QE guidance for a domain
   */
  getQEGuidance(domain: QEDomain): QEGuidance {
    return getGuidance(domain);
  }

  /**
   * Generate guidance context
   */
  generateQEContext(
    domain: QEDomain,
    context?: { framework?: string; language?: string }
  ): string {
    return generateGuidanceContext(domain, context as any || {});
  }

  /**
   * Check for anti-patterns
   */
  checkQEAntiPatterns(domain: QEDomain, content: string) {
    return checkAntiPatterns(domain, content);
  }

  /**
   * Get REAL statistics with REAL metrics
   */
  async getQEStats(): Promise<RealQEReasoningBankStats> {
    // Require explicit initialization - don't auto-initialize to avoid memory issues

    const sqliteStats = this.sqliteStore.getStats();

    // Calculate P95 latency using CircularBuffer's percentile method
    const p95Latency = this.routingLatencies.percentile(95) || 0;

    const byDomain: Record<QEDomain, number> = {} as Record<QEDomain, number>;
    for (const domain of QE_DOMAIN_LIST) {
      byDomain[domain] = sqliteStats.byDomain[domain] || 0;
    }

    return {
      totalPatterns: sqliteStats.totalPatterns,
      byDomain,
      byTier: sqliteStats.byTier,
      routingRequests: this.stats.routingRequests,
      avgRoutingLatencyMs: this.stats.routingRequests > 0
        ? this.stats.totalRoutingLatency / this.stats.routingRequests
        : 0,
      p95RoutingLatencyMs: p95Latency,
      learningOutcomes: this.stats.learningOutcomes,
      patternSuccessRate: this.stats.learningOutcomes > 0
        ? this.stats.successfulOutcomes / this.stats.learningOutcomes
        : 0,
      embeddingCacheSize: 0, // Would need to track this in real-embeddings
      transformerAvailable: isTransformerAvailable(),
      embeddingDimension: getEmbeddingDimension(),
      sqliteDbPath: this.qeConfig.sqlite.dbPath || '.agentic-qe/qe-patterns.db',
    };
  }

  // ============================================================================
  // Feedback Loop Methods (ADR-023)
  // ============================================================================

  /**
   * Record a pattern outcome for feedback learning
   */
  async recordPatternOutcome(
    patternId: string,
    success: boolean,
    qualityScore: number
  ): Promise<void> {
    const pattern = this.sqliteStore.getPattern(patternId);
    if (!pattern) return;

    // Calculate updated metrics (pattern properties are readonly, so we compute new values)
    const newUsageCount = pattern.usageCount + 1;
    const newSuccessfulUses = success ? pattern.successfulUses + 1 : pattern.successfulUses;

    // Update success rate (rolling average)
    const newSuccessRate = newSuccessfulUses / newUsageCount;

    // Update quality score (exponential moving average)
    const alpha = 0.3; // Weight for new observation
    const newQualityScore = (1 - alpha) * pattern.qualityScore + alpha * qualityScore;

    // Update confidence
    const newConfidence = Math.min(1.0, 0.5 + (newUsageCount * 0.05) + (newSuccessRate * 0.3));

    // Persist updates
    this.sqliteStore.updatePattern(patternId, {
      usageCount: newUsageCount,
      successfulUses: newSuccessfulUses,
      successRate: newSuccessRate,
      qualityScore: newQualityScore,
      confidence: newConfidence,
    });
  }

  /**
   * Check if a pattern should be promoted
   */
  async checkPatternPromotion(
    patternId: string,
    successCount: number,
    successRate: number,
    avgQuality: number
  ): Promise<boolean> {
    const pattern = this.sqliteStore.getPattern(patternId);
    if (!pattern) return false;

    // Promotion criteria
    if (pattern.tier === 'short-term') {
      return successCount >= 3 && successRate >= 0.6 && avgQuality >= 0.5;
    } else if (pattern.tier === 'long-term') {
      // Long-term patterns need higher thresholds to indicate they should be kept
      return successCount >= 10 && successRate >= 0.75 && avgQuality >= 0.7;
    }

    return false;
  }

  /**
   * Promote a pattern to the next tier
   */
  async promotePattern(patternId: string): Promise<void> {
    this.sqliteStore.promotePattern(patternId);
  }

  /**
   * Demote a pattern to a lower tier
   */
  async demotePattern(patternId: string): Promise<void> {
    const pattern = this.sqliteStore.getPattern(patternId);
    if (!pattern) return;

    const tierOrder: Array<'short-term' | 'working' | 'long-term'> = ['short-term', 'working', 'long-term'];
    const currentIndex = tierOrder.indexOf(pattern.tier as any);

    if (currentIndex > 0) {
      const newTier = tierOrder[currentIndex - 1];
      this.sqliteStore.updatePattern(patternId, { tier: newTier });
      console.log(`[RealQEReasoningBank] Pattern demoted to ${newTier}: ${pattern.name}`);
    }
  }

  // ============================================================================
  // Memory Management (ADR Memory Leak Fixes)
  // ============================================================================

  /**
   * Clean up stale patternIdMap entries that reference deleted patterns.
   * Call this periodically to prevent memory leaks from deleted patterns.
   *
   * Note: HNSW doesn't support true deletion, but we can at least clean
   * the patternIdMap to prevent it from growing unbounded.
   *
   * @returns Number of stale entries removed
   */
  cleanupPatternIdMap(): number {
    if (!this.initialized) return 0;

    let cleaned = 0;

    // Get all valid pattern IDs from SQLite storage
    const allPatterns = this.sqliteStore.getPatterns({ limit: 100000 });
    const validPatternIds = new Set(allPatterns.map(p => p.id));

    // Remove entries that reference non-existent patterns
    for (const [hnswIdx, patternId] of Array.from(this.patternIdMap.entries())) {
      if (!validPatternIds.has(patternId)) {
        this.patternIdMap.delete(hnswIdx);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RealQEReasoningBank] Cleaned ${cleaned} stale patternIdMap entries`);
    }

    return cleaned;
  }

  /**
   * Remove a pattern from the HNSW index mapping.
   * Note: HNSW doesn't support true deletion, so we just remove from mapping.
   * The orphaned HNSW entry will be ignored in search results.
   *
   * @param patternId - Pattern ID to remove from mapping
   * @returns true if found and removed, false otherwise
   */
  removePatternFromHNSW(patternId: string): boolean {
    for (const [hnswIdx, id] of Array.from(this.patternIdMap.entries())) {
      if (id === patternId) {
        this.patternIdMap.delete(hnswIdx);
        console.log(`[RealQEReasoningBank] Removed pattern ${patternId} from HNSW mapping`);
        return true;
      }
    }
    return false;
  }

  /**
   * Get memory usage statistics for monitoring
   */
  getMemoryStats(): {
    patternIdMapSize: number;
    routingLatenciesSize: number;
    hnswIndexCount: number;
  } {
    return {
      patternIdMapSize: this.patternIdMap.size,
      routingLatenciesSize: this.routingLatencies.length,
      hnswIndexCount: this.hnswIndex?.getCurrentCount() ?? 0,
    };
  }

  /**
   * Dispose and cleanup all resources
   */
  async dispose(): Promise<void> {
    this.sqliteStore.close();
    clearEmbeddingCache();
    this.hnswIndex = null;
    this.patternIdMap.clear();
    this.routingLatencies.clear();
    this.stats.routingRequests = 0;
    this.stats.totalRoutingLatency = 0;
    this.stats.learningOutcomes = 0;
    this.stats.successfulOutcomes = 0;
    this.initialized = false;
    console.log('[RealQEReasoningBank] Disposed');
  }

  /**
   * Alias for dispose() for consistency with other components
   */
  async destroy(): Promise<void> {
    return this.dispose();
  }
}

// Type definition for HNSW (hnswlib-node)
interface HierarchicalNSW {
  initIndex(maxElements: number, M: number, efConstruction: number): void;
  setEf(ef: number): void;
  addPoint(point: number[], label: number): void;
  searchKnn(query: number[], k: number): { neighbors: number[]; distances: number[] };
  getCurrentCount(): number;
}

/**
 * Create a Real QE ReasoningBank
 */
export function createRealQEReasoningBank(
  config: Partial<RealQEReasoningBankConfig> = {}
): RealQEReasoningBank {
  return new RealQEReasoningBank(config);
}
