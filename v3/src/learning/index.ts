/**
 * Agentic QE v3 - Learning Module
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * This module provides QE-specific pattern learning capabilities:
 * - QEReasoningBank: Pattern storage and retrieval with HNSW indexing
 * - QE Patterns: Domain-specific pattern types and validation
 * - QE Guidance: Best practices and anti-pattern detection
 * - QE Hooks: Event handlers for pattern capture
 *
 * @example
 * ```typescript
 * import {
 *   createQEReasoningBank,
 *   setupQEHooks,
 *   QEDomain,
 *   generateGuidanceContext,
 * } from './learning';
 *
 * // Create and initialize
 * const reasoningBank = createQEReasoningBank(memory);
 * await reasoningBank.initialize();
 *
 * // Setup hooks
 * const hooks = setupQEHooks(reasoningBank, eventBus);
 *
 * // Route a task
 * const routing = await reasoningBank.routeTask({
 *   task: 'Generate unit tests for UserService',
 *   context: { language: 'typescript', framework: 'vitest' },
 * });
 *
 * // Get guidance
 * const guidance = generateGuidanceContext('test-generation', {
 *   framework: 'vitest',
 *   language: 'typescript',
 * });
 * ```
 *
 * @module learning
 */

// ============================================================================
// QE ReasoningBank
// ============================================================================

export {
  QEReasoningBank,
  createQEReasoningBank,
  DEFAULT_QE_REASONING_BANK_CONFIG,
} from './qe-reasoning-bank.js';

export type {
  QEReasoningBankConfig,
  QERoutingRequest,
  QERoutingResult,
  LearningOutcome,
  IQEReasoningBank,
  QEReasoningBankStats,
} from './qe-reasoning-bank.js';

// ============================================================================
// QE Patterns
// ============================================================================

export {
  // Domain patterns
  QE_DOMAINS,
  QE_DOMAIN_LIST,

  // Pattern types
  QE_PATTERN_TYPES,

  // Utility functions
  detectQEDomain,
  detectQEDomains,
  mapQEDomainToAQE,
  calculateQualityScore,
  shouldPromotePattern,
  validateQEPattern,
  applyPatternTemplate,
  matchPatternContext,
} from './qe-patterns.js';

export type {
  QEDomain,
  QEPatternType,
  QEPattern,
  QEPatternContext,
  QEPatternTemplate,
  QETemplateVariable,
  ProgrammingLanguage,
  TestFramework,
  ComplexityLevel,
  CreateQEPatternOptions,
  PatternMatchResult,
} from './qe-patterns.js';

// ============================================================================
// QE Guidance
// ============================================================================

export {
  // Guidance registry
  QE_GUIDANCE_REGISTRY,

  // Domain guidance templates
  TEST_GENERATION_GUIDANCE,
  COVERAGE_ANALYSIS_GUIDANCE,
  MUTATION_TESTING_GUIDANCE,
  API_TESTING_GUIDANCE,
  SECURITY_TESTING_GUIDANCE,
  VISUAL_TESTING_GUIDANCE,
  ACCESSIBILITY_GUIDANCE,
  PERFORMANCE_GUIDANCE,

  // Guidance functions
  getGuidance,
  getFrameworkGuidance,
  getLanguageGuidance,
  getCombinedGuidance,
  checkAntiPatterns,
  generateGuidanceContext,
} from './qe-guidance.js';

export type {
  QEGuidance,
  AntiPattern,
  GuidanceExample,
} from './qe-guidance.js';

// ============================================================================
// Pattern Store
// ============================================================================

export {
  PatternStore,
  createPatternStore,
  DEFAULT_PATTERN_STORE_CONFIG,
} from './pattern-store.js';

export type {
  IPatternStore,
  PatternStoreConfig,
  PatternStoreStats,
  PatternSearchOptions,
  PatternSearchResult,
} from './pattern-store.js';

// ============================================================================
// QE Hooks
// ============================================================================

export {
  // Hook events
  QE_HOOK_EVENTS,

  // Hook handlers
  createQEHookHandlers,

  // Hook registry
  QEHookRegistry,
  createQEHookRegistry,
  setupQEHooks,
} from './qe-hooks.js';

export type {
  QEHookEvent,
  QEHookContext,
  QEHookResult,
  QEHookHandler,
} from './qe-hooks.js';

// ============================================================================
// REAL Implementation (ADR-021 Compliant)
// ============================================================================

export {
  // Real QE ReasoningBank (extends agentic-flow HybridReasoningBank)
  RealQEReasoningBank,
  createRealQEReasoningBank,
  DEFAULT_REAL_CONFIG,
} from './real-qe-reasoning-bank.js';

export type {
  RealQEReasoningBankConfig,
  RealQERoutingRequest,
  RealQERoutingResult,
  RealQEReasoningBankStats,
  LearningOutcome as RealLearningOutcome,
} from './real-qe-reasoning-bank.js';

// Real Transformer Embeddings
export {
  computeRealEmbedding,
  computeBatchEmbeddings,
  cosineSimilarity,
  clearEmbeddingCache,
  getCacheStats,
  isTransformerAvailable,
  getEmbeddingDimension,
  resetInitialization,
  DEFAULT_EMBEDDING_CONFIG,
} from './real-embeddings.js';

export type {
  EmbeddingConfig,
} from './real-embeddings.js';

// Real SQLite Persistence
export {
  SQLitePatternStore,
  createSQLitePatternStore,
  DEFAULT_SQLITE_CONFIG,
} from './sqlite-persistence.js';

export type {
  SQLitePersistenceConfig,
} from './sqlite-persistence.js';

// ============================================================================
// QE Unified Memory (ADR-038)
// ============================================================================

export {
  QEUnifiedMemory,
  createQEUnifiedMemory,
  createDefaultQEUnifiedMemory,
  QE_MEMORY_DOMAINS,
  QE_DOMAIN_HNSW_CONFIGS,
  DEFAULT_QE_UNIFIED_MEMORY_CONFIG,
} from './qe-unified-memory.js';

export type {
  QEMemoryDomain,
  QEMemoryMetadata,
  TestSuiteMetadata,
  DefectMetadata,
  QualityMetricsMetadata,
  LearningPatternMetadata,
  CoordinationMetadata,
  QEMemorySearchResult,
  QEMemorySearchOptions,
  MigrationConfig,
  MigrationProgress,
  MigrationResult,
  MigrationSource,
  QEUnifiedMemoryConfig,
  QEUnifiedMemoryStats,
  QEMemoryDomainStats,
  IQEUnifiedMemory,
} from './qe-unified-memory.js';

// ============================================================================
// V2 to V3 Migration (ADR-038)
// ============================================================================

export {
  V2ToV3Migrator,
  migrateV2ToV3,
} from './v2-to-v3-migration.js';

export type {
  V2MigrationConfig,
  V2MigrationProgress,
  V2MigrationResult,
} from './v2-to-v3-migration.js';

// ============================================================================
// Token Tracking (ADR-042)
// ============================================================================

export {
  // Singleton instance
  TokenMetricsCollector,

  // Class for testing/custom instances
  TokenMetricsCollectorImpl,

  // Utility functions
  formatCostUsd,
  estimateTokens,
} from './token-tracker.js';

export type {
  // Core types
  TokenUsage,
  TaskTokenMetric,
  AgentTokenMetrics,
  SessionTokenSummary,
  TokenEfficiencyReport,
  Timeframe,
  TokenCostConfig,
} from './token-tracker.js';

// ============================================================================
// Dream System (ADR-021 - Dream Cycle Integration)
// ============================================================================

export {
  // ConceptGraph
  ConceptGraph,
  createConceptGraph,

  // Default config
  DEFAULT_CONCEPT_GRAPH_CONFIG,
} from './dream/index.js';

export type {
  // Concept types
  ConceptType,
  EdgeType,
  InsightType,
  DreamCycleStatus,

  // Concept Node
  ConceptNode,
  CreateConceptNodeInput,

  // Concept Edge
  ConceptEdge,
  CreateEdgeInput,

  // Dream Cycle
  DreamCycle,

  // Dream Insight
  DreamInsight,

  // Statistics
  ConceptGraphStats,

  // Configuration
  ConceptGraphConfig,

  // Pattern Import
  PatternImportData,
  NeighborResult,
} from './dream/index.js';
