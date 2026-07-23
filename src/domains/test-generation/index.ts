/**
 * Agentic QE v3 - Test Generation Domain
 * AI-powered test creation with pattern learning
 *
 * This module exports the public API for the test-generation domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  TestGenerationPlugin,
  createTestGenerationPlugin,
  type TestGenerationPluginConfig,
  type TestGenerationExtendedAPI,
} from './plugin';

// ============================================================================
// Coordinator
// ============================================================================

export {
  TestGenerationCoordinator,
  type ITestGenerationCoordinator,
  type WorkflowStatus,
  type CoordinatorConfig,
} from './coordinator';

// ============================================================================
// Services
// ============================================================================

export {
  TestGeneratorService,
  createTestGeneratorService,
  createTestGeneratorServiceWithDependencies,
  type ITestGenerationService,
  type TestGeneratorConfig,
  type TestGeneratorDependencies,
} from './services/test-generator';

export {
  PatternMatcherService,
  type IPatternMatchingService,
  type PatternMatcherConfig,
  type PatternSearchContext,
  type PatternMatch,
  type AppliedPattern,
  type PatternModification,
  type PatternDefinition,
  type PatternExample,
  type PatternFilter,
} from './services/pattern-matcher';

// ============================================================================
// Coherence Gate Service (ADR-052)
// ============================================================================

export {
  TestGenerationCoherenceGate,
  createTestGenerationCoherenceGate,
  CoherenceError,
  DEFAULT_COHERENCE_GATE_CONFIG,
  type Requirement,
  type TestSpecification,
  type EnrichmentRecommendation,
  type RequirementCoherenceResult,
  type RequirementContradiction,
  type ContradictionSeverity,
  type TestGenerationCoherenceGateConfig,
  type IEmbeddingService,
} from './services/coherence-gate-service';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

// ============================================================================
// CQ-005: Register domain services in the shared DomainServiceRegistry
// so coordination/ can resolve them without importing from domains/.
// ============================================================================
import { DomainServiceRegistry, ServiceKeys } from '../../shared/domain-service-registry';
import type { MemoryBackend } from '../../kernel/interfaces';
import type { HybridRouter } from '../../shared/llm/router/hybrid-router';
import {
  createTestGeneratorService as _createTestGeneratorService,
  createTestGeneratorServiceWithDependencies as _createTestGeneratorServiceWithDependencies,
} from './services/test-generator';

/**
 * Issue #567: the factory MUST accept an optional `llmRouter`.
 *
 * The flat MCP tool `test_generate_enhanced` and the CLI both reach the
 * generator through the task-executor, which resolves it from this registry.
 * When the factory dropped `llmRouter` on the floor,
 * `TestGeneratorService.isLLMEnhancementAvailable()` was permanently false and
 * the ADR-051 LLM branch was unreachable on those paths — the tool silently
 * returned generic template scaffolding no matter how the provider was
 * configured. Keep the second parameter optional so the router stays a
 * degradation-friendly dependency: no router => deterministic templates, same
 * as before.
 */
DomainServiceRegistry.register(
  ServiceKeys.createTestGeneratorService,
  (memory: MemoryBackend, llmRouter?: HybridRouter) =>
    llmRouter
      ? _createTestGeneratorServiceWithDependencies({ memory, llmRouter })
      : _createTestGeneratorService(memory),
);

export type {
  // API interface
  TestGenerationAPI,

  // Request types
  GenerateTestsRequest,
  TDDRequest,
  PropertyTestRequest,
  TestDataRequest,
  LearnPatternsRequest,

  // Response types
  GeneratedTests,
  GeneratedTest,
  TDDResult,
  PropertyTests,
  PropertyTest,
  TestData,
  LearnedPatterns,
  Pattern,
} from './interfaces';
