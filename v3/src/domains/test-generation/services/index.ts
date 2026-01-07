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
