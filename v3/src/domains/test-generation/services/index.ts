/**
 * Agentic QE v3 - Test Generation Services
 * Service layer exports for the test-generation domain
 */

export {
  TestGeneratorService,
  createTestGeneratorService,
  createTestGeneratorServiceWithDependencies,
  type ITestGenerationService,
  type TestGeneratorConfig,
  type TestGeneratorDependencies,
} from './test-generator';

export {
  TDDGeneratorService,
  type ITDDGeneratorService,
} from './tdd-generator';

export {
  PropertyTestGeneratorService,
  type IPropertyTestGeneratorService,
} from './property-test-generator';

export {
  TestDataGeneratorService,
  type ITestDataGeneratorService,
} from './test-data-generator';

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

// Coherence Gate Service (ADR-052)
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
} from './coherence-gate-service';

// Strategy Pattern - Test Generators (ADR-XXX)
export {
  // Interfaces
  type ITestGenerator,
  type ITestGeneratorFactory,
  type TestFramework,
  type TestType,
  type FunctionInfo,
  type ClassInfo,
  type ParameterInfo,
  type PropertyInfo,
  type TestCase,
  type CodeAnalysis,
  type TestGenerationContext,
  type Pattern as GeneratorPattern,
} from '../interfaces';

// Generator implementations
export {
  BaseTestGenerator,
  JestVitestGenerator,
  MochaGenerator,
  PytestGenerator,
} from '../generators';

// Factory
export {
  TestGeneratorFactory,
  testGeneratorFactory,
  createTestGenerator,
  isValidTestFramework,
} from '../factories';
