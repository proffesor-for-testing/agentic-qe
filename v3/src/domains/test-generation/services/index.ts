/**
 * Agentic QE v3 - Test Generation Services
 * Service layer exports for the test-generation domain
 */

export {
  TestGeneratorService,
  type ITestGenerationService,
  type TestGeneratorConfig,
} from './test-generator';

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
} from './pattern-matcher';

// Agent Booster Integration (ADR-051)
export {
  CodeTransformService,
  createCodeTransformService,
  quickTransformTestCode,
  isEligibleForTransform,
  detectEligibleTransforms,
  DEFAULT_TRANSFORM_CONFIG,
  type CodeTransformConfig,
  type CodeTransformResult,
} from './code-transform-integration';

// Coherence Gate (ADR-052)
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
} from '../coherence-gate';
