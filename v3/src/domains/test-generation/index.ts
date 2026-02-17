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
import { createTestGeneratorService as _createTestGeneratorService } from './services/test-generator';

DomainServiceRegistry.register(
  ServiceKeys.createTestGeneratorService,
  (memory: MemoryBackend) => _createTestGeneratorService(memory),
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
