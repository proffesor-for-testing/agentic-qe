/**
 * Type definitions for Pattern Extraction System
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 */

/**
 * Code signature representing the unique fingerprint of a code block
 */
export interface CodeSignature {
  /** Unique identifier for the signature */
  id: string;
  /** Function or method signature */
  functionSignature: string;
  /** Parameter types and names */
  parameterTypes: Array<{ name: string; type: string; optional?: boolean }>;
  /** Return type */
  returnType: string;
  /** Cyclomatic complexity score */
  complexity: number;
  /** Identified patterns in the code */
  patterns: PatternMatch[];
  /** Source code hash for change detection */
  sourceHash: string;
  /** AST node types present in the code */
  nodeTypes: string[];
  /** Dependencies and imports */
  dependencies: string[];
  /** Created timestamp */
  createdAt: Date;
}

/**
 * Pattern match found in code
 */
export interface PatternMatch {
  /** Type of pattern */
  type: PatternType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Pattern description */
  description: string;
  /** Location in source code */
  location: CodeLocation;
  /** Extracted pattern data */
  data: Record<string, any>;
}

/**
 * Types of patterns that can be extracted
 */
export enum PatternType {
  EDGE_CASE = 'edge-case',
  BOUNDARY_CONDITION = 'boundary-condition',
  ERROR_HANDLING = 'error-handling',
  INTEGRATION = 'integration',
  ASYNC_PATTERN = 'async-pattern',
  MOCK_PATTERN = 'mock-pattern',
  ASSERTION_PATTERN = 'assertion-pattern',
  SETUP_TEARDOWN = 'setup-teardown',
  DATA_DRIVEN = 'data-driven',
  PARAMETERIZED = 'parameterized'
}

/**
 * Location in source code
 */
export interface CodeLocation {
  /** File path */
  filePath?: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Start column */
  startColumn: number;
  /** End column */
  endColumn: number;
}

/**
 * Extracted test pattern
 */
export interface TestPattern {
  /** Unique pattern identifier */
  id: string;
  /** Pattern name */
  name: string;
  /** Pattern type */
  type: PatternType;
  /** Pattern category */
  category: PatternCategory;
  /** Source framework (jest, mocha, cypress) */
  framework: TestFramework;
  /** Pattern template */
  template: TestTemplate;
  /** Example usage */
  examples: string[];
  /** Frequency of occurrence */
  frequency: number;
  /** Confidence score */
  confidence: number;
  /** Applicability conditions */
  applicabilityConditions: string[];
  /** Extracted from test file */
  sourceFile: string;
  /** Created timestamp */
  createdAt: Date;
  /** Metadata */
  metadata: Record<string, any>;
}

/**
 * Pattern category
 */
export enum PatternCategory {
  UNIT_TEST = 'unit-test',
  INTEGRATION_TEST = 'integration-test',
  E2E_TEST = 'e2e-test',
  PERFORMANCE_TEST = 'performance-test',
  SECURITY_TEST = 'security-test'
}

/**
 * Supported test frameworks
 */
export enum TestFramework {
  JEST = 'jest',
  MOCHA = 'mocha',
  CYPRESS = 'cypress',
  VITEST = 'vitest',
  JASMINE = 'jasmine',
  AVA = 'ava'
}

/**
 * Test template for reusable test generation
 */
export interface TestTemplate {
  /** Template identifier */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** Template structure in AST-like format */
  structure: TemplateNode;
  /** Parameters that can be customized */
  parameters: TemplateParameter[];
  /** Template validation rules */
  validationRules: ValidationRule[];
  /** Framework-specific code generation */
  codeGenerators: Record<TestFramework, string>;
}

/**
 * Template node representing a part of the test structure
 */
export interface TemplateNode {
  /** Node type (describe, it, expect, etc.) */
  type: string;
  /** Node identifier */
  id: string;
  /** Child nodes */
  children: TemplateNode[];
  /** Properties for the node */
  properties: Record<string, any>;
  /** Parameterized values */
  parameterRefs: string[];
}

/**
 * Template parameter
 */
export interface TemplateParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: ParameterType;
  /** Parameter description */
  description: string;
  /** Whether parameter is required */
  required: boolean;
  /** Default value */
  defaultValue?: any;
  /** Validation constraints */
  constraints?: ParameterConstraints;
}

/**
 * Parameter type
 */
export enum ParameterType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  FUNCTION = 'function',
  ANY = 'any'
}

/**
 * Parameter constraints
 */
export interface ParameterConstraints {
  /** Minimum value (for numbers) */
  min?: number;
  /** Maximum value (for numbers) */
  max?: number;
  /** Pattern to match (for strings) */
  pattern?: string;
  /** Allowed values */
  enum?: any[];
  /** Minimum length (for strings/arrays) */
  minLength?: number;
  /** Maximum length (for strings/arrays) */
  maxLength?: number;
}

/**
 * Validation rule for templates (SECURE - No eval)
 *
 * Security: Uses ValidationConfig instead of code strings
 * to prevent code injection vulnerabilities.
 *
 * @see SecureValidation in utils/SecureValidation.ts
 */
export interface ValidationRule {
  /** Rule identifier */
  id: string;
  /** Rule description */
  description: string;
  /** Validation type */
  type: 'required' | 'type-check' | 'range' | 'pattern' | 'length' | 'enum' | 'custom';
  /** Validation configuration (secure - no code execution) */
  config: ValidationConfig;
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
}

/**
 * Secure validation configuration
 */
export interface ValidationConfig {
  /** Required parameter names */
  requiredParams?: string[];
  /** Type checks: param name -> expected type */
  typeChecks?: Record<string, ValidationType>;
  /** Range checks for numbers */
  rangeChecks?: Record<string, { min?: number; max?: number }>;
  /** Pattern checks using RegExp */
  patternChecks?: Record<string, RegExp>;
  /** Length checks for strings/arrays */
  lengthChecks?: Record<string, { min?: number; max?: number }>;
  /** Enum checks: param name -> allowed values */
  enumChecks?: Record<string, any[]>;
  /** Custom validator ID (references predefined validators only) */
  customValidatorId?: string;
}

/**
 * Supported validation types
 */
export type ValidationType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'undefined'
  | 'null';

/**
 * Pattern extraction result
 */
export interface PatternExtractionResult {
  /** Extracted patterns */
  patterns: TestPattern[];
  /** Code signatures generated */
  signatures: CodeSignature[];
  /** Extraction statistics */
  statistics: ExtractionStatistics;
  /** Extraction errors */
  errors: ExtractionError[];
  /** Timestamp */
  timestamp: Date;
}

/**
 * Extraction statistics
 */
export interface ExtractionStatistics {
  /** Total files processed */
  filesProcessed: number;
  /** Total tests analyzed */
  testsAnalyzed: number;
  /** Patterns extracted */
  patternsExtracted: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Average patterns per file */
  avgPatternsPerFile: number;
  /** Pattern type distribution */
  patternTypeDistribution: Record<PatternType, number>;
}

/**
 * Extraction error
 */
export interface ExtractionError {
  /** File that caused the error */
  file: string;
  /** Error message */
  message: string;
  /** Error type */
  type: 'parse-error' | 'analysis-error' | 'validation-error';
  /** Stack trace */
  stack?: string;
}

/**
 * Pattern similarity score
 */
export interface PatternSimilarity {
  /** First pattern ID */
  pattern1: string;
  /** Second pattern ID */
  pattern2: string;
  /** Similarity score (0-1) */
  score: number;
  /** Similarity details */
  details: SimilarityDetails;
}

/**
 * Similarity calculation details
 */
export interface SimilarityDetails {
  /** Structural similarity */
  structuralSimilarity: number;
  /** Semantic similarity */
  semanticSimilarity: number;
  /** Type compatibility */
  typeCompatibility: number;
  /** Common patterns */
  commonPatterns: string[];
}

/**
 * Pattern classifier result
 */
export interface PatternClassificationResult {
  /** Pattern ID */
  patternId: string;
  /** Classified type */
  type: PatternType;
  /** Classification confidence */
  confidence: number;
  /** Reasoning for classification */
  reasoning: string;
  /** Alternative classifications */
  alternatives: Array<{ type: PatternType; confidence: number }>;
}

/**
 * Pattern recommendation
 */
export interface PatternRecommendation {
  /** Pattern ID */
  patternId: string;
  /** Pattern name */
  patternName: string;
  /** Recommendation score */
  score: number;
  /** Reason for recommendation */
  reason: string;
  /** Code snippet to test */
  targetCode: string;
  /** Applicability score */
  applicability: number;
}

/**
 * AST analysis options
 */
export interface ASTAnalysisOptions {
  /** Include comments in analysis */
  includeComments?: boolean;
  /** Parse TypeScript */
  typescript?: boolean;
  /** Parse JSX/TSX */
  jsx?: boolean;
  /** Maximum depth for AST traversal */
  maxDepth?: number;
  /** Custom node visitors */
  visitors?: Record<string, (node: any) => void>;
}

/**
 * Pattern extraction configuration
 */
export interface PatternExtractionConfig {
  /** Frameworks to support */
  frameworks: TestFramework[];
  /** Minimum pattern confidence threshold */
  minConfidence: number;
  /** Minimum pattern frequency for inclusion */
  minFrequency: number;
  /** Maximum patterns to extract per file */
  maxPatternsPerFile: number;
  /** Enable parallel processing */
  parallel: boolean;
  /** AST analysis options */
  astOptions: ASTAnalysisOptions;
  /** Pattern type filters */
  patternTypeFilters?: PatternType[];
}
