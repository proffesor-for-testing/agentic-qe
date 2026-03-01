/**
 * Agentic QE v3 - Test Generation Strategy Pattern Interfaces
 * Re-exports from main interfaces file for backward compatibility
 *
 * @deprecated Import directly from '../interfaces' instead
 * @module test-generation/interfaces
 */

export type {
  // Core types
  TestFramework,
  TestType,
  Pattern,
  IPattern,

  // AST analysis types
  FunctionInfo,
  ClassInfo,
  ParameterInfo,
  PropertyInfo,
  TestCase,
  CodeAnalysis,
  IFunctionInfo,
  IClassInfo,
  IParameterInfo,
  IPropertyInfo,
  ITestCase,
  ICodeAnalysis,

  // Strategy types
  TestGenerationContext,
  ITestGenerationContext,
  ITestGenerator,
  ITestGeneratorFactory,
} from '../interfaces';
