/**
 * Dream System Module
 * ADR-021: QE ReasoningBank - Dream Cycle Integration
 *
 * This module provides dream-based pattern discovery capabilities:
 * - DreamEngine: Orchestrator for complete dream cycles
 * - ConceptGraph: Graph-based concept storage with weighted edges
 * - SpreadingActivation: Neural-inspired activation propagation
 * - InsightGenerator: Transform associations into actionable insights
 *
 * Dream cycles enable:
 * - Spreading activation across concepts (simulating neural processes)
 * - Novel pattern discovery through random exploration
 * - Association learning from co-activated concepts
 * - Insight generation for pattern improvement
 *
 * @example
 * ```typescript
 * import { DreamEngine, createDreamEngine } from './dream';
 *
 * // Create and initialize
 * const engine = createDreamEngine('.aqe/dream.db');
 * await engine.initialize();
 *
 * // Load patterns for dreaming
 * const patterns = [
 *   { id: '1', name: 'Mock Pattern', description: 'Use mocks...', domain: 'testing', confidence: 0.8 },
 * ];
 * await engine.loadPatternsAsConcepts(patterns);
 *
 * // Run a dream cycle (30 seconds)
 * const result = await engine.dream(30000);
 * console.log(`Generated ${result.insights.length} insights`);
 *
 * // Apply high-confidence insights
 * for (const insight of result.insights) {
 *   if (insight.confidenceScore > 0.8) {
 *     await engine.applyInsight(insight.id);
 *   }
 * }
 *
 * // Get pending insights
 * const pending = await engine.getPendingInsights();
 *
 * // Cleanup
 * await engine.close();
 * ```
 *
 * @module v3/learning/dream
 */

// ============================================================================
// Types
// ============================================================================

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

  // Dream Insight (base)
  DreamInsight,

  // Statistics
  ConceptGraphStats,

  // Configuration
  ConceptGraphConfig,

  // Pattern Import
  PatternImportData,
  NeighborResult,

  // DreamEngine types
  DreamEngineConfig,
  DreamCycleResult,
} from './types.js';

export { DEFAULT_CONCEPT_GRAPH_CONFIG } from './types.js';

// ============================================================================
// ConceptGraph
// ============================================================================

export { ConceptGraph, createConceptGraph } from './concept-graph.js';

// ============================================================================
// SpreadingActivation
// ============================================================================

export {
  SpreadingActivation,
  type ActivationConfig,
  type ActivationResult,
  DEFAULT_ACTIVATION_CONFIG,
} from './spreading-activation.js';

// ============================================================================
// InsightGenerator
// ============================================================================

export {
  InsightGenerator,
  type InsightConfig,
  type DreamInsight as GeneratedInsight,
  type PatternTemplate,
  DEFAULT_INSIGHT_CONFIG,
} from './insight-generator.js';

// ============================================================================
// DreamEngine
// ============================================================================

export {
  DreamEngine,
  createDreamEngine,
  type DreamConfig,
  type DreamCycleResult as EngineResult,
  type ApplyInsightResult,
  DEFAULT_DREAM_CONFIG,
} from './dream-engine.js';

// ============================================================================
// DreamScheduler
// ============================================================================

export {
  DreamScheduler,
  createDreamScheduler,
  type DreamSchedulerConfig,
  type DreamSchedulerDependencies,
  type DreamSchedulerStatus,
  type TaskExperience,
  DEFAULT_DREAM_SCHEDULER_CONFIG,
} from './dream-scheduler.js';

// ============================================================================
// Default Export
// ============================================================================

export { default } from './dream-engine.js';
