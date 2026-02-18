/**
 * Agentic QE v3 - Test Generator Strategy Pattern Interfaces
 * Defines the core abstractions for framework-specific test generation
 *
 * @module test-generation/interfaces
 */

// Pattern type is defined in the sibling interfaces.ts file (domain interfaces)
// We define our own Pattern type here to avoid circular dependency
export interface Pattern {
  id: string;
  name: string;
  structure: string;
  examples: number;
  applicability: number;
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Supported test frameworks
 */
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest';

/**
 * Types of tests that can be generated
 */
export type TestType = 'unit' | 'integration' | 'e2e';

/**
 * Information about a function extracted from AST
 */
export interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string | undefined;
  isAsync: boolean;
  isExported: boolean;
  complexity: number;
  startLine: number;
  endLine: number;
  body?: string;
}

/**
 * Information about a class extracted from AST
 */
export interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: PropertyInfo[];
  isExported: boolean;
  hasConstructor: boolean;
  constructorParams?: ParameterInfo[];
}

/**
 * Information about a parameter
 */
export interface ParameterInfo {
  name: string;
  type: string | undefined;
  optional: boolean;
  defaultValue: string | undefined;
}

/**
 * Information about a class property
 */
export interface PropertyInfo {
  name: string;
  type: string | undefined;
  isPrivate: boolean;
  isReadonly: boolean;
}

/**
 * Test case definition
 */
export interface TestCase {
  description: string;
  type: 'happy-path' | 'edge-case' | 'error-handling' | 'boundary';
  setup?: string;
  action: string;
  assertion: string;
}

/**
 * Code analysis result from AST parsing
 */
export interface CodeAnalysis {
  functions: FunctionInfo[];
  classes: ClassInfo[];
}

/**
 * KG-sourced dependency context for a file
 */
export interface KGDependencyContext {
  imports: string[];       // modules this file imports
  importedBy: string[];    // modules that import this file
  callees: string[];       // functions this module calls
  callers: string[];       // functions that call into this module
}

/**
 * KG-sourced similar code context
 */
export interface KGSimilarCodeContext {
  snippets: Array<{ file: string; snippet: string; score: number }>;
}

/**
 * Context for test generation
 */
export interface TestGenerationContext {
  moduleName: string;
  importPath: string;
  testType: TestType;
  patterns: Pattern[];
  analysis?: CodeAnalysis;
  dependencies?: KGDependencyContext;
  similarCode?: KGSimilarCodeContext;
}

// ============================================================================
// Strategy Interface
// ============================================================================

/**
 * ITestGenerator - Strategy interface for framework-specific test generation
 *
 * Each framework implementation (Jest, Vitest, Mocha, Pytest) implements this
 * interface to provide consistent test generation capabilities.
 *
 * @example
 * ```typescript
 * const generator: ITestGenerator = new JestVitestGenerator('jest');
 * const testCode = generator.generateTests(context);
 * ```
 */
export interface ITestGenerator {
  /**
   * The test framework this generator targets
   */
  readonly framework: TestFramework;

  /**
   * Generate complete test code for a module
   * @param context - The test generation context including source analysis
   * @returns Generated test code as a string
   */
  generateTests(context: TestGenerationContext): string;

  /**
   * Generate tests for a single function
   * @param fn - Function information from AST analysis
   * @param testType - Type of test to generate
   * @returns Generated test code for the function
   */
  generateFunctionTests(fn: FunctionInfo, testType: TestType): string;

  /**
   * Generate tests for a class
   * @param cls - Class information from AST analysis
   * @param testType - Type of test to generate
   * @returns Generated test code for the class
   */
  generateClassTests(cls: ClassInfo, testType: TestType): string;

  /**
   * Generate stub test code when no AST analysis is available
   * @param context - The test generation context
   * @returns Generated stub test code
   */
  generateStubTests(context: TestGenerationContext): string;

  /**
   * Generate coverage-focused test code for specific lines
   * @param moduleName - Name of the module under test
   * @param importPath - Import path to the module
   * @param lines - Line numbers to cover
   * @returns Generated coverage test code
   */
  generateCoverageTests(moduleName: string, importPath: string, lines: number[]): string;
}

// ============================================================================
// Factory Interface
// ============================================================================

/**
 * Factory interface for creating test generators
 */
export interface ITestGeneratorFactory {
  /**
   * Create a test generator for the specified framework
   * @param framework - Target test framework
   * @returns Test generator instance
   */
  create(framework: TestFramework): ITestGenerator;

  /**
   * Check if a framework is supported
   * @param framework - Framework to check
   * @returns True if supported
   */
  supports(framework: string): framework is TestFramework;

  /**
   * Get the default framework
   * @returns Default test framework
   */
  getDefault(): TestFramework;
}

