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

import { v4 as uuidv4 } from 'uuid';
import type { MemoryBackend, EventBus } from '../kernel/interfaces.js';
import type { Result, DomainName } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
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
  PromotionCheck,
  shouldPromotePattern,
} from './qe-patterns.js';
import {
  QEGuidance,
  getGuidance,
  getCombinedGuidance,
  generateGuidanceContext,
  checkAntiPatterns,
} from './qe-guidance.js';
import {
  PatternStore,
  PatternSearchOptions,
  PatternSearchResult,
  createPatternStore,
} from './pattern-store.js';

// ============================================================================
// QEReasoningBank Configuration
// ============================================================================

/**
 * QEReasoningBank configuration
 */
export interface QEReasoningBankConfig {
  /** Enable pattern learning */
  enableLearning: boolean;

  /** Enable guidance generation */
  enableGuidance: boolean;

  /** Enable task routing */
  enableRouting: boolean;

  /** Embedding dimension (must match HNSW config) */
  embeddingDimension: number;

  /** Use ONNX embeddings (when available) */
  useONNXEmbeddings: boolean;

  /** Maximum patterns to consider for routing */
  maxRoutingCandidates: number;

  /** Weights for routing score calculation */
  routingWeights: {
    similarity: number;
    performance: number;
    capabilities: number;
  };

  /** Pattern store configuration */
  patternStore?: Partial<import('./pattern-store.js').PatternStoreConfig>;

  /** Coherence energy threshold for pattern promotion (ADR-052) */
  coherenceThreshold?: number;
}

/**
 * Default configuration
 */
export const DEFAULT_QE_REASONING_BANK_CONFIG: QEReasoningBankConfig = {
  enableLearning: true,
  enableGuidance: true,
  enableRouting: true,
  embeddingDimension: 128,
  useONNXEmbeddings: true, // ADR-051: Enable ONNX embeddings by default
  maxRoutingCandidates: 10,
  routingWeights: {
    similarity: 0.3,
    performance: 0.4,
    capabilities: 0.3,
  },
  coherenceThreshold: 0.4, // ADR-052: Coherence gate threshold
};

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Task routing request
 */
export interface QERoutingRequest {
  /** Task description */
  task: string;

  /** Task type hint */
  taskType?: 'test-generation' | 'analysis' | 'debugging' | 'optimization';

  /** Target domain hint */
  domain?: QEDomain;

  /** Required capabilities */
  capabilities?: string[];

  /** Context for matching */
  context?: Partial<QEPatternContext>;
}

/**
 * Task routing result
 */
export interface QERoutingResult {
  /** Recommended agent type */
  recommendedAgent: string;

  /** Confidence in recommendation (0-1) */
  confidence: number;

  /** Alternative agent recommendations */
  alternatives: Array<{ agent: string; score: number }>;

  /** Detected QE domains */
  domains: QEDomain[];

  /** Relevant patterns found */
  patterns: QEPattern[];

  /** Generated guidance */
  guidance: string[];

  /** Reasoning for the recommendation */
  reasoning: string;
}

/**
 * Pattern learning outcome
 */
export interface LearningOutcome {
  /** Pattern ID that was used */
  patternId: string;

  /** Whether the application was successful */
  success: boolean;

  /** Quality metrics from the outcome */
  metrics?: {
    testsPassed?: number;
    testsFailed?: number;
    coverageImprovement?: number;
    executionTimeMs?: number;
  };

  /** Feedback from the agent or user */
  feedback?: string;
}

/**
 * Pattern promotion blocked event (ADR-052)
 */
export interface PromotionBlockedEvent {
  patternId: string;
  patternName: string;
  reason: 'coherence_violation' | 'insufficient_usage' | 'low_quality';
  energy?: number;
  existingPatternConflicts?: string[];
}

// ============================================================================
// QEReasoningBank Interface
// ============================================================================

/**
 * QEReasoningBank interface
 */
export interface IQEReasoningBank {
  /** Initialize the reasoning bank */
  initialize(): Promise<void>;

  /** Store a new pattern */
  storePattern(options: CreateQEPatternOptions): Promise<Result<QEPattern>>;

  /** Search for patterns */
  searchPatterns(
    query: string | number[],
    options?: PatternSearchOptions
  ): Promise<Result<PatternSearchResult[]>>;

  /** Get pattern by ID */
  getPattern(id: string): Promise<QEPattern | null>;

  /** Record pattern usage outcome */
  recordOutcome(outcome: LearningOutcome): Promise<Result<void>>;

  /** Route a task to optimal agent */
  routeTask(request: QERoutingRequest): Promise<Result<QERoutingResult>>;

  /** Get guidance for a domain */
  getGuidance(domain: QEDomain, context?: Partial<QEPatternContext>): QEGuidance;

  /** Generate guidance context for Claude */
  generateContext(
    domain: QEDomain,
    context?: { framework?: TestFramework; language?: ProgrammingLanguage }
  ): string;

  /** Check for anti-patterns in content */
  checkAntiPatterns(domain: QEDomain, content: string): ReturnType<typeof checkAntiPatterns>;

  /** Get embedding for text */
  embed(text: string): Promise<number[]>;

  /** Get statistics */
  getStats(): Promise<QEReasoningBankStats>;

  /** Dispose the reasoning bank */
  dispose(): Promise<void>;
}

/**
 * QEReasoningBank statistics
 */
export interface QEReasoningBankStats {
  /** Total patterns */
  totalPatterns: number;

  /** Patterns by domain */
  byDomain: Record<QEDomain, number>;

  /** Routing requests served */
  routingRequests: number;

  /** Average routing confidence */
  avgRoutingConfidence: number;

  /** Learning outcomes recorded */
  learningOutcomes: number;

  /** Pattern success rate */
  patternSuccessRate: number;

  /** Pattern store stats */
  patternStoreStats: import('./pattern-store.js').PatternStoreStats;
}

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
  private patternStore: PatternStore;
  private initialized = false;

  // Statistics
  private stats = {
    routingRequests: 0,
    totalRoutingConfidence: 0,
    learningOutcomes: 0,
    successfulOutcomes: 0,
  };

  // Agent capability mapping (QE agents)
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

  constructor(
    private readonly memory: MemoryBackend,
    private readonly eventBus?: EventBus,
    config: Partial<QEReasoningBankConfig> = {},
    private readonly coherenceService?: import('../integrations/coherence/coherence-service.js').ICoherenceService
  ) {
    this.config = { ...DEFAULT_QE_REASONING_BANK_CONFIG, ...config };
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

    // Load any pre-trained patterns
    await this.loadPretrainedPatterns();

    this.initialized = true;
    console.log('[QEReasoningBank] Initialized');
  }

  /**
   * Load pre-trained patterns for common QE scenarios
   */
  private async loadPretrainedPatterns(): Promise<void> {
    // Check if we already have patterns
    const stats = await this.patternStore.getStats();
    if (stats.totalPatterns > 0) {
      console.log(`[QEReasoningBank] Found ${stats.totalPatterns} existing patterns`);
      return;
    }

    // Add foundational patterns
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
            { name: 'className', type: 'string', required: true, description: 'Class under test' },
            { name: 'methodName', type: 'string', required: true, description: 'Method under test' },
            { name: 'expectedBehavior', type: 'string', required: true, description: 'Expected behavior in plain English' },
            { name: 'async', type: 'string', required: false, defaultValue: '', description: 'async keyword if needed' },
            { name: 'arrangeCode', type: 'code', required: true, description: 'Setup code' },
            { name: 'actCode', type: 'code', required: true, description: 'Action code' },
            { name: 'assertCode', type: 'code', required: true, description: 'Assertion code' },
          ],
        },
        context: {
          testType: 'unit',
          tags: ['unit-test', 'aaa', 'arrange-act-assert', 'best-practice'],
        },
      },
      {
        patternType: 'mock-pattern',
        name: 'Dependency Mock',
        description: 'Pattern for mocking external dependencies in tests',
        template: {
          type: 'code',
          content: `const mock{{DependencyName}} = {
  {{mockMethods}}
};

vi.mock('{{modulePath}}', () => ({
  {{DependencyName}}: vi.fn(() => mock{{DependencyName}}),
}));`,
          variables: [
            { name: 'DependencyName', type: 'string', required: true, description: 'Name of dependency to mock' },
            { name: 'modulePath', type: 'string', required: true, description: 'Module path to mock' },
            { name: 'mockMethods', type: 'code', required: true, description: 'Mock method implementations' },
          ],
        },
        context: {
          framework: 'vitest',
          testType: 'unit',
          tags: ['mock', 'vitest', 'dependency-injection'],
        },
      },
      {
        patternType: 'coverage-strategy',
        name: 'Risk-Based Coverage',
        description: 'Prioritize coverage by code risk and complexity',
        template: {
          type: 'prompt',
          content: `Analyze coverage gaps for {{targetPath}} with focus on:
1. Critical business logic paths
2. Error handling branches
3. Edge cases and boundary conditions
4. High-complexity functions (cyclomatic complexity > 10)

Risk scoring:
- Critical: Business logic, auth, payments
- High: Data validation, external integrations
- Medium: Internal utilities, helpers
- Low: Config, constants`,
          variables: [
            { name: 'targetPath', type: 'string', required: true, description: 'Path to analyze' },
          ],
        },
        context: {
          tags: ['coverage', 'risk-based', 'prioritization'],
        },
      },
      {
        patternType: 'flaky-fix',
        name: 'Timing-Based Flakiness',
        description: 'Fix flaky tests caused by timing issues',
        template: {
          type: 'prompt',
          content: `The test {{testName}} is flaky due to timing issues.

Common fixes:
1. Replace setTimeout with explicit waits
2. Use waitFor or waitForCondition
3. Mock time-dependent functions
4. Increase timeouts for async operations
5. Add retry logic with exponential backoff

Check for:
- Race conditions in async code
- Missing await keywords
- Shared state between tests
- External service dependencies`,
          variables: [
            { name: 'testName', type: 'string', required: true, description: 'Name of flaky test' },
          ],
        },
        context: {
          tags: ['flaky', 'timing', 'async', 'stability'],
        },
      },
    ];

    for (const options of foundationalPatterns) {
      try {
        await this.patternStore.create(options);
      } catch (error) {
        console.warn(`[QEReasoningBank] Failed to load pattern ${options.name}:`, error);
      }
    }

    console.log(`[QEReasoningBank] Loaded ${foundationalPatterns.length} foundational patterns`);
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

    return this.patternStore.create(options);
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

    if (result.success) {
      this.stats.learningOutcomes++;
      if (outcome.success) {
        this.stats.successfulOutcomes++;
      }

      // Check if pattern should be promoted (with coherence gate)
      const pattern = await this.getPattern(outcome.patternId);
      if (pattern && await this.checkPatternPromotionWithCoherence(pattern)) {
        await this.promotePattern(outcome.patternId);
        console.log(`[QEReasoningBank] Pattern promoted to long-term: ${pattern.name}`);
      }
    }

    return result;
  }

  /**
   * Check if a pattern should be promoted with coherence gate (ADR-052)
   *
   * This method implements a two-stage promotion check:
   * 1. Basic criteria (usage and quality) - cheap to check
   * 2. Coherence criteria (only if basic passes) - expensive, requires coherence service
   *
   * @param pattern - Pattern to evaluate for promotion
   * @returns true if pattern should be promoted, false otherwise
   */
  private async checkPatternPromotionWithCoherence(pattern: QEPattern): Promise<boolean> {
    // 1. Check basic criteria first (cheap)
    const basicCheck = shouldPromotePattern(pattern);
    if (!basicCheck.meetsUsageCriteria || !basicCheck.meetsQualityCriteria) {
      return false;
    }

    // 2. Check coherence with existing long-term patterns (expensive, only if basic passes)
    if (this.coherenceService && this.coherenceService.isInitialized()) {
      const longTermPatterns = await this.getLongTermPatterns();

      // Create coherence check with candidate pattern added to long-term set
      const allPatterns = [...longTermPatterns, pattern];
      const coherenceNodes = allPatterns.map(p => ({
        id: p.id,
        embedding: p.embedding || [],
        weight: p.confidence,
        metadata: { name: p.name, domain: p.qeDomain },
      }));

      const coherenceResult = await this.coherenceService.checkCoherence(coherenceNodes);

      if (coherenceResult.energy >= (this.config.coherenceThreshold || 0.4)) {
        // Promotion blocked due to coherence violation
        const event: PromotionBlockedEvent = {
          patternId: pattern.id,
          patternName: pattern.name,
          reason: 'coherence_violation',
          energy: coherenceResult.energy,
          existingPatternConflicts: coherenceResult.contradictions?.map(c => c.nodeIds).flat(),
        };

        // Publish event if eventBus is available
        if (this.eventBus) {
          await this.eventBus.publish({
            id: `pattern-promotion-blocked-${pattern.id}`,
            type: 'pattern:promotion_blocked',
            timestamp: new Date(),
            source: 'learning-optimization',
            payload: event,
          });
        }

        console.log(
          `[QEReasoningBank] Pattern promotion blocked due to coherence violation: ` +
          `${pattern.name} (energy: ${coherenceResult.energy.toFixed(3)})`
        );

        return false;
      }
    }

    return true;
  }

  /**
   * Get all long-term patterns for coherence checking
   *
   * @returns Array of long-term patterns
   */
  private async getLongTermPatterns(): Promise<QEPattern[]> {
    const result = await this.searchPatterns('', { tier: 'long-term', limit: 1000 });
    return result.success ? result.value.map(r => r.pattern) : [];
  }

  /**
   * Promote a pattern to long-term storage
   *
   * @param patternId - Pattern ID to promote
   */
  private async promotePattern(patternId: string): Promise<void> {
    // This would be implemented by the pattern store
    // For now, we'll just log it
    console.log(`[QEReasoningBank] Promoting pattern ${patternId} to long-term`);
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

      // 3. Calculate agent scores
      const agentScores: Array<{ agent: string; score: number; reasoning: string[] }> = [];

      for (const [agentType, profile] of Object.entries(this.agentCapabilities)) {
        let score = 0;
        const reasoning: string[] = [];

        // Domain match (0-0.4)
        const domainMatch = detectedDomains.filter((d) =>
          profile.domains.includes(d)
        ).length;
        const domainScore =
          domainMatch > 0 ? (domainMatch / detectedDomains.length) * 0.4 : 0;
        score += domainScore * this.config.routingWeights.similarity;
        if (domainScore > 0) {
          reasoning.push(`Domain match: ${(domainScore * 100).toFixed(0)}%`);
        }

        // Capability match (0-0.3)
        if (request.capabilities && request.capabilities.length > 0) {
          const capMatch = request.capabilities.filter((c) =>
            profile.capabilities.some(
              (pc) => pc.toLowerCase().includes(c.toLowerCase())
            )
          ).length;
          const capScore =
            capMatch > 0 ? (capMatch / request.capabilities.length) * 0.3 : 0;
          score += capScore * this.config.routingWeights.capabilities;
          if (capScore > 0) {
            reasoning.push(`Capability match: ${(capScore * 100).toFixed(0)}%`);
          }
        } else {
          score += 0.15 * this.config.routingWeights.capabilities;
        }

        // Historical performance (0-0.3)
        score += profile.performanceScore * 0.3 * this.config.routingWeights.performance;
        reasoning.push(`Performance score: ${(profile.performanceScore * 100).toFixed(0)}%`);

        // Pattern similarity boost
        const agentPatterns = patterns.filter((p) =>
          profile.domains.includes(p.qeDomain)
        );
        if (agentPatterns.length > 0) {
          const patternBoost = Math.min(0.1, agentPatterns.length * 0.02);
          score += patternBoost;
          reasoning.push(`Pattern matches: ${agentPatterns.length}`);
        }

        agentScores.push({ agent: agentType, score, reasoning });
      }

      // Sort by score
      agentScores.sort((a, b) => b.score - a.score);

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
      return err(error instanceof Error ? error : new Error(String(error)));
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
          return this.resizeEmbedding(embedding, this.config.embeddingDimension);
        }
        return embedding;
      } catch (error) {
        // ARM64 ONNX compatibility issue or module not available
        // Fall through to hash-based embedding silently
        if (process.env.DEBUG) {
          console.warn(
            '[QEReasoningBank] ONNX embeddings unavailable, using hash fallback:',
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }

    // Hash-based fallback (always works, including ARM64)
    return this.hashEmbedding(text);
  }

  /**
   * Resize embedding to target dimension using averaging or truncation
   */
  private resizeEmbedding(embedding: number[], targetDim: number): number[] {
    if (embedding.length === targetDim) {
      return embedding;
    }

    if (embedding.length > targetDim) {
      // Average adjacent values to reduce dimension
      const ratio = embedding.length / targetDim;
      const result = new Array(targetDim).fill(0);
      for (let i = 0; i < targetDim; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.floor((i + 1) * ratio);
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += embedding[j];
        }
        result[i] = sum / (end - start);
      }
      // Normalize
      const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 0) {
        for (let i = 0; i < targetDim; i++) {
          result[i] /= magnitude;
        }
      }
      return result;
    } else {
      // Interpolate to increase dimension (less common)
      const result = new Array(targetDim).fill(0);
      const ratio = (embedding.length - 1) / (targetDim - 1);
      for (let i = 0; i < targetDim; i++) {
        const pos = i * ratio;
        const lower = Math.floor(pos);
        const upper = Math.min(lower + 1, embedding.length - 1);
        const weight = pos - lower;
        result[i] = embedding[lower] * (1 - weight) + embedding[upper] * weight;
      }
      // Normalize
      const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 0) {
        for (let i = 0; i < targetDim; i++) {
          result[i] /= magnitude;
        }
      }
      return result;
    }
  }

  /**
   * Simple hash-based embedding fallback
   */
  private hashEmbedding(text: string): number[] {
    const dimension = this.config.embeddingDimension;
    const embedding = new Array(dimension).fill(0);
    const normalized = text.toLowerCase().trim();

    // Use multiple hash passes for better distribution
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < normalized.length; i++) {
        const charCode = normalized.charCodeAt(i);
        const idx = (charCode * (i + 1) * (pass + 1)) % dimension;
        embedding[idx] += Math.sin(charCode * (pass + 1)) / (i + 1);
      }
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude > 0) {
      for (let i = 0; i < dimension; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
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
// Convenience Exports
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
