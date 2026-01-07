/**
 * Agentic QE v3 - Test Generation Domain Interface
 * AI-powered test creation with pattern learning
 */

import { Result } from '../../shared/types';

// ============================================================================
// Domain API
// ============================================================================

export interface TestGenerationAPI {
  /** Generate tests for source files */
  generateTests(request: GenerateTestsRequest): Promise<Result<GeneratedTests, Error>>;

  /** Generate tests using TDD workflow */
  generateTDDTests(request: TDDRequest): Promise<Result<TDDResult, Error>>;

  /** Generate property-based tests */
  generatePropertyTests(request: PropertyTestRequest): Promise<Result<PropertyTests, Error>>;

  /** Generate test data */
  generateTestData(request: TestDataRequest): Promise<Result<TestData, Error>>;

  /** Learn patterns from existing tests */
  learnPatterns(request: LearnPatternsRequest): Promise<Result<LearnedPatterns, Error>>;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface GenerateTestsRequest {
  sourceFiles: string[];
  testType: 'unit' | 'integration' | 'e2e';
  framework: 'jest' | 'vitest' | 'mocha' | 'pytest';
  coverageTarget?: number;
  patterns?: string[];
}

export interface GeneratedTests {
  tests: GeneratedTest[];
  coverageEstimate: number;
  patternsUsed: string[];
}

export interface GeneratedTest {
  id: string;
  name: string;
  sourceFile: string;
  testFile: string;
  testCode: string;
  type: 'unit' | 'integration' | 'e2e';
  assertions: number;
}

export interface TDDRequest {
  feature: string;
  behavior: string;
  framework: string;
  phase: 'red' | 'green' | 'refactor';
}

export interface TDDResult {
  phase: string;
  testCode?: string;
  implementationCode?: string;
  refactoringChanges?: string[];
  nextStep: string;
}

export interface PropertyTestRequest {
  function: string;
  properties: string[];
  constraints?: Record<string, unknown>;
}

export interface PropertyTests {
  tests: PropertyTest[];
  arbitraries: string[];
}

export interface PropertyTest {
  property: string;
  testCode: string;
  generators: string[];
}

export interface TestDataRequest {
  schema: Record<string, unknown>;
  count: number;
  locale?: string;
  preserveRelationships?: boolean;
}

export interface TestData {
  records: unknown[];
  schema: Record<string, unknown>;
  seed: number;
}

export interface LearnPatternsRequest {
  testFiles: string[];
  depth: 'shallow' | 'deep';
}

export interface LearnedPatterns {
  patterns: Pattern[];
  confidence: number;
}

export interface Pattern {
  id: string;
  name: string;
  structure: string;
  examples: number;
  applicability: number;
}
