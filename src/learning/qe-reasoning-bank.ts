/**
 * Agentic QE v3 - QE ReasoningBank
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * QE-specific pattern learning system that extends the concept from
 * claude-flow's ReasoningBank with quality engineering domains.
 *
 * Features:
 * - 8 QE domains for pattern classification
 * - HNSW vector indexing (150x faster search)
 * - Pattern quality scoring with outcome tracking
 * - Short-term to long-term promotion (3+ successful uses)
 * - Domain-specific guidance generation
 * - Agent routing via pattern similarity
 */

import { LoggerFactory } from '../logging/index.js';
import type { Logger } from '../logging/index.js';
import type { MemoryBackend, EventBus } from '../kernel/interfaces.js';

const logger: Logger = LoggerFactory.create('QEReasoningBank');
import type { Result } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import { toError, toErrorMessage } from '../shared/error-utils.js';
import {
  QEPattern,
  QEPatternContext,
  QEPatternType,
  QEDomain,
  ProgrammingLanguage,
  TestFramework,
  CreateQEPatternOptions,
  detectQEDomain,
  detectQEDomains,
  mapQEDomainToAQE,
  applyPatternTemplate,
  QE_DOMAIN_LIST,
} from './qe-patterns.js';
import {
  QEGuidance,
  getGuidance,
  getCombinedGuidance,
  generateGuidanceContext,
  checkAntiPatterns,
} from './qe-guidance.js';
import {
  type IPatternStore,
  PatternSearchOptions,
  PatternSearchResult,
  createPatternStore,
} from './pattern-store.js';
import {
  SQLitePatternStore,
  createSQLitePatternStore,
} from './sqlite-persistence.js';
import { getWitnessChain } from '../audit/witness-chain.js';
import type { RvfDualWriter } from '../integrations/ruvector/rvf-dual-writer.js';

// Import extracted modules
import { DEFAULT_QE_REASONING_BANK_CONFIG } from './qe-reasoning-bank-types.js';
import type {
  QEReasoningBankConfig,
  QERoutingRequest,
  QERoutingResult,
  LearningOutcome,
  IQEReasoningBank,
  QEReasoningBankStats,
} from './qe-reasoning-bank-types.js';
import { PRETRAINED_PATTERNS } from './pretrained-patterns.js';
import {
  AGENT_CAPABILITIES,
  calculateAgentScores,
} from './agent-routing.js';
import { resizeEmbedding, hashEmbedding } from './embedding-utils.js';
import {
  checkPatternPromotionWithCoherence,
  promotePattern as promotePatternFn,
  seedCrossDomainPatterns as seedCrossDomainPatternsFn,
  type PromotionDeps,
} from './pattern-promotion.js';

// ============================================================================
// QEReasoningBank Implementation
// ============================================================================

/**
 * QE ReasoningBank - Pattern learning for quality engineering
 *
 * @example
 * ```typescript
 * const bank = new QEReasoningBank(memory);
 * await bank.initialize();
 *
 * // Store a pattern
 * await bank.storePattern({
 *   patternType: 'test-template',
 *   name: 'AAA Unit Test',
 *   description: 'Arrange-Act-Assert pattern for unit tests',
 *   template: { type: 'code', content: '...', variables: [] },
 * });
 *
 * // Route a task
 * const routing = await bank.routeTask({
 *   task: 'Generate unit tests for UserService',
 *   context: { language: 'typescript', framework: 'vitest' },
 * });
 * ```
 */
export class QEReasoningBank implements IQEReasoningBank {
  private readonly config: QEReasoningBankConfig;
  private patternStore: IPatternStore;
  private initialized = false;
  private sqliteStore: SQLitePatternStore | null = null;
  private rvfDualWriter: RvfDualWriter | null = null;

  /**
   * Lazy getter for SQLitePatternStore — persists pattern usage/promotion
   * to the qe_patterns table (same DB as UnifiedMemory).
   */
  private getSqliteStore(): SQLitePatternStore {
    if (!this.sqliteStore) {
      this.sqliteStore = createSQLitePatternStore();
      // initialize() is sync-safe when useUnified=true (already open)
      // but we call it defensively; it no-ops if already initialized
      this.sqliteStore.initialize().catch((e) => {
        logger.warn('SQLitePatternStore init failed', { error: toErrorMessage(e) });
      });
    }
    return this.sqliteStore;
  }

  /**
   * Set the RVF dual-writer at runtime (Phase 3 vector replication).
   * When set, pattern writes will be replicated to the RVF store best-effort.
   */
  setRvfDualWriter(writer: RvfDualWriter): void {
    this.rvfDualWriter = writer;
  }

  // Statistics
  private stats = {
    routingRequests: 0,
    totalRoutingConfidence: 0,
    learningOutcomes: 0,
    successfulOutcomes: 0,
  };

  constructor(
    private readonly memory: MemoryBackend,
    private readonly eventBus?: EventBus,
    config: Partial<QEReasoningBankConfig> = {},
    private readonly coherenceService?: import('../integrations/coherence/coherence-service.js').ICoherenceService
  ) {
    this.config = { ...DEFAULT_QE_REASONING_BANK_CONFIG, ...config };
    if (config.rvfDualWriter) {
      this.rvfDualWriter = config.rvfDualWriter;
    }
    this.patternStore = createPatternStore(memory, {
      embeddingDimension: this.config.embeddingDimension,
      ...config.patternStore,
    });
  }

  /**
   * Initialize the reasoning bank
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.patternStore.initialize();

    // Wire SQLitePatternStore into PatternStore for delete/promote persistence
    try {
      const store = this.getSqliteStore();
      await store.initialize();
      this.patternStore.setSqliteStore?.(store);
    } catch (e) {
      logger.warn('Failed to wire SQLitePatternStore into PatternStore', { error: toErrorMessage(e) });
    }

    // Load any pre-trained patterns
    await this.loadPretrainedPatterns();

    this.initialized = true;

    // Run cross-domain transfer ONCE per DB lifetime (not every init)
    // IMPORTANT: Set the flag BEFORE the transfer so that even if the transfer
    // times out (hooks.ts has a 10s timeout on initialize()), the flag persists
    // and we don't re-run on every session, causing unbounded DB growth.
    try {
      const SEED_FLAG_KEY = 'reasoning-bank:cross-domain-seeded';
      const alreadySeeded = await this.memory.get<boolean>(SEED_FLAG_KEY);
      if (!alreadySeeded) {
        // Set flag FIRST to prevent re-runs if transfer times out or process exits
        await this.memory.set(SEED_FLAG_KEY, true);
        await this.seedCrossDomainPatterns();
      } else {
        const stats = await this.patternStore.getStats();
        logger.info('Cross-domain transfer already complete', { totalPatterns: stats.totalPatterns });
      }
    } catch (error) {
      logger.warn('Cross-domain seeding failed (non-fatal)', { error });
    }

    logger.info('Initialized');
  }

  /**
   * Load pre-trained patterns for common QE scenarios
   */
  private async loadPretrainedPatterns(): Promise<void> {
    // Check if we already have patterns
    const stats = await this.patternStore.getStats();
    if (stats.totalPatterns > 0) {
      logger.info('Found existing patterns', { totalPatterns: stats.totalPatterns });
      return;
    }

    // Add foundational patterns from extracted module
    for (const options of PRETRAINED_PATTERNS) {
      try {
        await this.patternStore.create(options);
      } catch (error) {
        logger.warn('Failed to load pattern', { name: options.name, error });
      }
    }

    logger.info('Loaded foundational patterns', { count: PRETRAINED_PATTERNS.length });
  }

  /**
   * Seed cross-domain patterns by transferring generalizable patterns
   * from populated domains to their related domains.
   *
   * Uses the domain compatibility matrix to determine which domains
   * are related and applies a relevance decay to transferred patterns.
   */
  async seedCrossDomainPatterns(): Promise<{ transferred: number; skipped: number }> {
    if (!this.initialized) {
      await this.initialize();
    }

    return seedCrossDomainPatternsFn({
      searchPatterns: this.searchPatterns.bind(this),
      storePattern: this.storePattern.bind(this) as unknown as (options: Record<string, unknown>) => Promise<Result<QEPattern>>,
      patternStore: this.patternStore,
    });
  }

  /**
   * Store a new pattern
   */
  async storePattern(options: CreateQEPatternOptions): Promise<Result<QEPattern>> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config.enableLearning) {
      return err(new Error('Pattern learning is disabled'));
    }

    // Generate embedding if not provided
    if (!options.embedding) {
      const embedding = await this.embed(
        `${options.name} ${options.description} ${options.context?.tags?.join(' ') || ''}`
      );
      options = { ...options, embedding };
    }

    const result = await this.patternStore.create(options);

    // ADR-070: Record pattern creation in witness chain
    if (result.success) {
      getWitnessChain().then(wc => wc.append('PATTERN_CREATE', { patternId: result.value.id, domain: result.value.qeDomain, confidence: result.value.confidence, name: result.value.name }, 'reasoning-bank')).catch((e) => { logger.warn('Witness chain PATTERN_CREATE failed', { error: toErrorMessage(e) }); });

      // Phase 3: Best-effort RVF dual-write for vector replication
      if (this.rvfDualWriter && result.value.embedding && result.value.embedding.length > 0) {
        try {
          this.rvfDualWriter.writePattern(result.value.id, result.value.embedding);
        } catch (rvfErr) {
          logger.warn('RVF dual-write failed (non-fatal)', { patternId: result.value.id, error: toErrorMessage(rvfErr) });
        }
      }
    }

    return result;
  }

  /**
   * Search for patterns
   *
   * Empty string queries return all patterns sorted by quality score.
   * Non-empty string queries use HNSW vector similarity search.
   * Array queries (pre-computed embeddings) use HNSW directly.
   */
  async searchPatterns(
    query: string | number[],
    options?: PatternSearchOptions
  ): Promise<Result<PatternSearchResult[]>> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Generate embedding for text query
    let searchQuery: string | number[] = query;
    let useVectorSearch = true;

    if (typeof query === 'string') {
      if (query.trim() === '') {
        // Empty query = return all patterns sorted by quality score
        // Skip vector search (zero vector produces meaningless results)
        useVectorSearch = false;
        searchQuery = '';
      } else {
        searchQuery = await this.embed(query);
      }
    }

    return this.patternStore.search(searchQuery, {
      ...options,
      useVectorSearch,
    });
  }

  /**
   * Get pattern by ID
   */
  async getPattern(id: string): Promise<QEPattern | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.patternStore.get(id);
  }

  /**
   * Record pattern usage outcome
   */
  async recordOutcome(outcome: LearningOutcome): Promise<Result<void>> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config.enableLearning) {
      return ok(undefined);
    }

    const result = await this.patternStore.recordUsage(
      outcome.patternId,
      outcome.success
    );

    // Persist usage to SQLite (updates qe_patterns row AND inserts qe_pattern_usage)
    try {
      const store = this.getSqliteStore();
      store.recordUsage(
        outcome.patternId,
        outcome.success,
        outcome.metrics as Record<string, unknown> | undefined,
        outcome.feedback
      );
    } catch (persistError) {
      // Non-critical — don't fail if persistence fails
      logger.warn('SQLite pattern usage persist failed', { error: toErrorMessage(persistError) });
    }

    if (result.success) {
      this.stats.learningOutcomes++;
      if (outcome.success) {
        this.stats.successfulOutcomes++;
      }

      // ADR-070: Record pattern update in witness chain
      getWitnessChain().then(wc => wc.append('PATTERN_UPDATE', { patternId: outcome.patternId, success: outcome.success }, 'reasoning-bank')).catch((e) => { logger.warn('Witness chain PATTERN_UPDATE failed', { error: toErrorMessage(e) }); });

      // Check if pattern should be promoted (with coherence gate)
      const pattern = await this.getPattern(outcome.patternId);
      const deps = this.getPromotionDeps();
      if (pattern && await checkPatternPromotionWithCoherence(pattern, deps)) {
        await promotePatternFn(outcome.patternId, deps);
        logger.info('Pattern promoted to long-term', { name: pattern.name });
      }
    }

    return result;
  }

  /**
   * Get promotion dependencies for the extracted promotion module
   */
  private getPromotionDeps(): PromotionDeps {
    return {
      patternStore: this.patternStore,
      coherenceService: this.coherenceService,
      eventBus: this.eventBus,
      coherenceThreshold: this.config.coherenceThreshold || 0.4,
      getSqliteStore: this.getSqliteStore.bind(this),
      rvfDualWriter: this.rvfDualWriter,
      searchPatterns: this.searchPatterns.bind(this),
      getPattern: this.getPattern.bind(this),
    };
  }

  /**
   * Route a task to optimal agent
   */
  async routeTask(request: QERoutingRequest): Promise<Result<QERoutingResult>> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config.enableRouting) {
      return err(new Error('Task routing is disabled'));
    }

    this.stats.routingRequests++;

    try {
      // 1. Detect domains from task description
      const detectedDomains = request.domain
        ? [request.domain]
        : detectQEDomains(request.task);

      if (detectedDomains.length === 0) {
        detectedDomains.push('test-generation'); // Default
      }

      // 2. Search for similar patterns
      const embedding = await this.embed(request.task);
      const patternResults = await this.patternStore.search(embedding, {
        limit: this.config.maxRoutingCandidates,
        domain: detectedDomains[0],
        useVectorSearch: true,
      });

      const patterns = patternResults.success
        ? patternResults.value.map((r) => r.pattern)
        : [];

      // 3. Build agent-to-pattern-count map for scoring
      const agentDomainPatternCounts = new Map<string, number>();
      for (const [agentType, profile] of Object.entries(AGENT_CAPABILITIES)) {
        const count = patterns.filter((p) =>
          profile.domains.includes(p.qeDomain)
        ).length;
        if (count > 0) {
          agentDomainPatternCounts.set(agentType, count);
        }
      }

      // 4. Calculate agent scores using extracted function
      const agentScores = calculateAgentScores(
        detectedDomains,
        request.capabilities,
        agentDomainPatternCounts,
        this.config.routingWeights,
      );

      const recommended = agentScores[0];
      const alternatives = agentScores.slice(1, 4);

      // Generate guidance
      const guidance: string[] = [];
      if (this.config.enableGuidance && detectedDomains.length > 0) {
        const domainGuidance = getCombinedGuidance(detectedDomains[0], {
          framework: request.context?.framework,
          language: request.context?.language,
          includeAntiPatterns: true,
        });
        guidance.push(...domainGuidance.slice(0, 5));
      }

      // Update stats
      this.stats.totalRoutingConfidence += recommended.score;

      const result: QERoutingResult = {
        recommendedAgent: recommended.agent,
        confidence: recommended.score,
        alternatives: alternatives.map((a) => ({ agent: a.agent, score: a.score })),
        domains: detectedDomains,
        patterns,
        guidance,
        reasoning: recommended.reasoning.join('; '),
      };

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get guidance for a domain
   */
  getGuidance(domain: QEDomain, _context?: Partial<QEPatternContext>): QEGuidance {
    return getGuidance(domain);
  }

  /**
   * Generate guidance context for Claude
   */
  generateContext(
    domain: QEDomain,
    context?: { framework?: TestFramework; language?: ProgrammingLanguage }
  ): string {
    return generateGuidanceContext(domain, context || {});
  }

  /**
   * Check for anti-patterns
   */
  checkAntiPatterns(domain: QEDomain, content: string) {
    return checkAntiPatterns(domain, content);
  }

  /**
   * Generate embedding for text
   *
   * Uses ONNX transformer embeddings when available, with hash-based fallback
   * for ARM64 or when transformers module cannot be loaded.
   */
  async embed(text: string): Promise<number[]> {
    // Try ONNX embeddings if enabled
    if (this.config.useONNXEmbeddings) {
      try {
        const { computeRealEmbedding } = await import('./real-embeddings.js');
        const embedding = await computeRealEmbedding(text);
        // Resize to configured dimension if needed (384 -> 128)
        if (embedding.length !== this.config.embeddingDimension) {
          return resizeEmbedding(embedding, this.config.embeddingDimension);
        }
        return embedding;
      } catch (error) {
        // ARM64 ONNX compatibility issue or module not available
        // Fall through to hash-based embedding silently
        if (process.env.DEBUG) {
          logger.warn('ONNX embeddings unavailable, using hash fallback', {
            error: toErrorMessage(error),
          });
        }
      }
    }

    // Hash-based fallback (always works, including ARM64)
    return hashEmbedding(text, this.config.embeddingDimension);
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<QEReasoningBankStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    const patternStoreStats = await this.patternStore.getStats();

    const byDomain: Record<QEDomain, number> = {} as Record<QEDomain, number>;
    for (const domain of QE_DOMAIN_LIST) {
      byDomain[domain] = patternStoreStats.byDomain[domain] || 0;
    }

    return {
      totalPatterns: patternStoreStats.totalPatterns,
      byDomain,
      routingRequests: this.stats.routingRequests,
      avgRoutingConfidence:
        this.stats.routingRequests > 0
          ? this.stats.totalRoutingConfidence / this.stats.routingRequests
          : 0,
      learningOutcomes: this.stats.learningOutcomes,
      patternSuccessRate:
        this.stats.learningOutcomes > 0
          ? this.stats.successfulOutcomes / this.stats.learningOutcomes
          : 0,
      patternStoreStats,
    };
  }

  /**
   * Dispose the reasoning bank
   */
  async dispose(): Promise<void> {
    await this.patternStore.dispose();
    if (this.sqliteStore) {
      this.sqliteStore.close();
      this.sqliteStore = null;
    }
    if (this.rvfDualWriter) {
      try { this.rvfDualWriter.close(); } catch { /* ignore */ }
      this.rvfDualWriter = null;
    }
    this.initialized = false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new QEReasoningBank instance
 */
export function createQEReasoningBank(
  memory: MemoryBackend,
  eventBus?: EventBus,
  config?: Partial<QEReasoningBankConfig>,
  coherenceService?: import('../integrations/coherence/coherence-service.js').ICoherenceService
): QEReasoningBank {
  return new QEReasoningBank(memory, eventBus, config, coherenceService);
}

// ============================================================================
// Re-exports from extracted modules
// ============================================================================

// Re-export all types/interfaces/constants so existing import paths work unchanged
export { DEFAULT_QE_REASONING_BANK_CONFIG } from './qe-reasoning-bank-types.js';

export type {
  QEReasoningBankConfig,
  QERoutingRequest,
  QERoutingResult,
  LearningOutcome,
  PromotionBlockedEvent,
  IQEReasoningBank,
  QEReasoningBankStats,
} from './qe-reasoning-bank-types.js';

export { PRETRAINED_PATTERNS } from './pretrained-patterns.js';

export {
  AGENT_CAPABILITIES,
  RELATED_DOMAINS,
  calculateAgentScores,
} from './agent-routing.js';

export type {
  AgentCapabilityProfile,
  ScoredAgent,
  RoutingWeights,
} from './agent-routing.js';

// ============================================================================
// Convenience Exports (preserved from original)
// ============================================================================

export {
  detectQEDomain,
  detectQEDomains,
  mapQEDomainToAQE,
  applyPatternTemplate,
} from './qe-patterns.js';

export type {
  QEPattern,
  QEPatternType,
  QEDomain,
  QEPatternContext,
  ProgrammingLanguage,
  TestFramework,
  CreateQEPatternOptions,
} from './qe-patterns.js';

export {
  getGuidance,
  getCombinedGuidance,
  generateGuidanceContext,
} from './qe-guidance.js';

export type { QEGuidance } from './qe-guidance.js';
