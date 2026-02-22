/**
 * Agentic QE v3 - Test Generation Domain Interfaces
 * All types and interfaces for the test-generation domain
 */

import { Result } from '../../shared/types';

// ============================================================================
// Domain API
// ============================================================================

export interface ITestGenerationAPI {
  /** Generate tests for source files */
  generateTests(request: IGenerateTestsRequest): Promise<Result<IGeneratedTests, Error>>;

  /** Generate tests using TDD workflow */
  generateTDDTests(request: ITDDRequest): Promise<Result<ITDDResult, Error>>;

  /** Generate property-based tests */
  generatePropertyTests(request: IPropertyTestRequest): Promise<Result<IPropertyTests, Error>>;

  /** Generate test data */
  generateTestData(request: ITestDataRequest): Promise<Result<ITestData, Error>>;

  /** Learn patterns from existing tests */
  learnPatterns(request: ILearnPatternsRequest): Promise<Result<ILearnedPatterns, Error>>;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface IGenerateTestsRequest {
  sourceFiles: string[];
  testType: 'unit' | 'integration' | 'e2e';
  framework: 'jest' | 'vitest' | 'mocha' | 'pytest' | 'node-test';
  coverageTarget?: number;
  patterns?: string[];
}

export interface IGeneratedTests {
  tests: IGeneratedTest[];
  coverageEstimate: number;
  patternsUsed: string[];
}

export interface IGeneratedTest {
  id: string;
  name: string;
  sourceFile: string;
  testFile: string;
  testCode: string;
  type: 'unit' | 'integration' | 'e2e';
  assertions: number;
  /** ADR-051: Whether test was enhanced by LLM */
  llmEnhanced?: boolean;
}

export interface ITDDRequest {
  feature: string;
  behavior: string;
  framework: string;
  phase: 'red' | 'green' | 'refactor';
}

export interface ITDDResult {
  phase: string;
  testCode?: string;
  implementationCode?: string;
  refactoringChanges?: string[];
  nextStep: string;
}

export interface IPropertyTestRequest {
  function: string;
  properties: string[];
  constraints?: Record<string, unknown>;
}

export interface IPropertyTests {
  tests: IPropertyTest[];
  arbitraries: string[];
}

export interface IPropertyTest {
  property: string;
  testCode: string;
  generators: string[];
}

export interface ITestDataRequest {
  schema: Record<string, unknown>;
  count: number;
  locale?: string;
  preserveRelationships?: boolean;
}

export interface ITestData {
  records: unknown[];
  schema: Record<string, unknown>;
  seed: number;
}

export interface ILearnPatternsRequest {
  testFiles: string[];
  depth: 'shallow' | 'deep';
}

export interface ILearnedPatterns {
  patterns: IPattern[];
  confidence: number;
}

export interface IPattern {
  id: string;
  name: string;
  structure: string;
  examples: number;
  applicability: number;
}

// ============================================================================
// Test Generator Strategy Pattern Interfaces
// ============================================================================

/**
 * Supported test frameworks
 */
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'node-test';

/**
 * Types of tests that can be generated
 */
export type TestType = 'unit' | 'integration' | 'e2e';

/**
 * Information about a function extracted from AST
 */
export interface IFunctionInfo {
  name: string;
  parameters: IParameterInfo[];
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
export interface IClassInfo {
  name: string;
  methods: IFunctionInfo[];
  properties: IPropertyInfo[];
  isExported: boolean;
  hasConstructor: boolean;
  constructorParams?: IParameterInfo[];
}

/**
 * Information about a parameter
 */
export interface IParameterInfo {
  name: string;
  type: string | undefined;
  optional: boolean;
  defaultValue: string | undefined;
}

/**
 * Information about a class property
 */
export interface IPropertyInfo {
  name: string;
  type: string | undefined;
  isPrivate: boolean;
  isReadonly: boolean;
}

/**
 * Test case definition
 */
export interface ITestCase {
  description: string;
  type: 'happy-path' | 'edge-case' | 'error-handling' | 'boundary';
  setup?: string;
  action: string;
  assertion: string;
}

/**
 * Code analysis result from AST parsing
 */
export interface ICodeAnalysis {
  functions: IFunctionInfo[];
  classes: IClassInfo[];
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
export interface ITestGenerationContext {
  moduleName: string;
  importPath: string;
  testType: TestType;
  patterns: IPattern[];
  analysis?: ICodeAnalysis;
  dependencies?: KGDependencyContext;
  similarCode?: KGSimilarCodeContext;
}

/**
 * ITestGenerator - Strategy interface for framework-specific test generation
 */
export interface ITestGenerator {
  readonly framework: TestFramework;
  generateTests(context: ITestGenerationContext): string;
  generateFunctionTests(fn: IFunctionInfo, testType: TestType): string;
  generateClassTests(cls: IClassInfo, testType: TestType): string;
  generateStubTests(context: ITestGenerationContext): string;
  generateCoverageTests(moduleName: string, importPath: string, lines: number[]): string;
}

/**
 * Factory interface for creating test generators
 */
export interface ITestGeneratorFactory {
  create(framework: TestFramework): ITestGenerator;
  supports(framework: string): framework is TestFramework;
  getDefault(): TestFramework;
}

// ============================================================================
// Backward Compatibility Exports (non-I prefixed)
// ============================================================================

/** @deprecated Use ITestGenerationAPI */
export type TestGenerationAPI = ITestGenerationAPI;
/** @deprecated Use IGenerateTestsRequest */
export type GenerateTestsRequest = IGenerateTestsRequest;
/** @deprecated Use IGeneratedTests */
export type GeneratedTests = IGeneratedTests;
/** @deprecated Use IGeneratedTest */
export type GeneratedTest = IGeneratedTest;
/** @deprecated Use ITDDRequest */
export type TDDRequest = ITDDRequest;
/** @deprecated Use ITDDResult */
export type TDDResult = ITDDResult;
/** @deprecated Use IPropertyTestRequest */
export type PropertyTestRequest = IPropertyTestRequest;
/** @deprecated Use IPropertyTests */
export type PropertyTests = IPropertyTests;
/** @deprecated Use IPropertyTest */
export type PropertyTest = IPropertyTest;
/** @deprecated Use ITestDataRequest */
export type TestDataRequest = ITestDataRequest;
/** @deprecated Use ITestData */
export type TestData = ITestData;
/** @deprecated Use ILearnPatternsRequest */
export type LearnPatternsRequest = ILearnPatternsRequest;
/** @deprecated Use ILearnedPatterns */
export type LearnedPatterns = ILearnedPatterns;
/** @deprecated Use IPattern */
export type Pattern = IPattern;
/** @deprecated Use IFunctionInfo */
export type FunctionInfo = IFunctionInfo;
/** @deprecated Use IClassInfo */
export type ClassInfo = IClassInfo;
/** @deprecated Use IParameterInfo */
export type ParameterInfo = IParameterInfo;
/** @deprecated Use IPropertyInfo */
export type PropertyInfo = IPropertyInfo;
/** @deprecated Use ITestCase */
export type TestCase = ITestCase;
/** @deprecated Use ICodeAnalysis */
export type CodeAnalysis = ICodeAnalysis;
/** @deprecated Use ITestGenerationContext */
export type TestGenerationContext = ITestGenerationContext;
