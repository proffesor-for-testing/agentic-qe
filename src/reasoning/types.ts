/**
 * Type Definitions for QE ReasoningBank (v1.1.0)
 *
 * Comprehensive TypeScript interfaces for test pattern storage,
 * retrieval, and cross-project sharing.
 *
 * @module reasoning/types
 */

// ============================================================================
// Core Pattern Types
// ============================================================================

/**
 * Pattern classification types
 */
export type PatternType =
    | 'edge-case'           // Edge case testing (null, undefined, boundary values)
    | 'integration'         // Integration testing (API, database, external services)
    | 'boundary'            // Boundary value testing (min/max, limits)
    | 'error-handling'      // Error and exception handling
    | 'unit'                // Unit testing (single function/class)
    | 'e2e'                 // End-to-end testing (full user flow)
    | 'performance'         // Performance and load testing
    | 'security'            // Security testing (XSS, injection, auth)
    | 'accessibility'       // Accessibility testing (a11y)
    | 'regression';         // Regression testing

/**
 * Supported testing frameworks
 */
export type Framework =
    | 'jest'
    | 'mocha'
    | 'cypress'
    | 'vitest'
    | 'playwright'
    | 'ava'
    | 'tape'
    | 'jasmine'
    | 'qunit';

/**
 * Supported languages
 */
export type Language =
    | 'typescript'
    | 'javascript'
    | 'tsx'
    | 'jsx';

/**
 * Pattern quality trend
 */
export type PatternTrend =
    | 'rising'      // Increasing usage and quality
    | 'stable'      // Consistent usage and quality
    | 'declining';  // Decreasing usage or quality issues

// ============================================================================
// Code Signature
// ============================================================================

/**
 * Structured representation of code to be tested
 *
 * @example
 * ```typescript
 * const signature: CodeSignature = {
 *   functionName: 'calculateTotal',
 *   parameters: [
 *     { name: 'items', type: 'Item[]', optional: false },
 *     { name: 'taxRate', type: 'number', optional: true }
 *   ],
 *   returnType: 'number',
 *   imports: [
 *     { module: './types', identifiers: ['Item'] }
 *   ],
 *   dependencies: [],
 *   complexity: {
 *     cyclomaticComplexity: 5,
 *     cognitiveComplexity: 3
 *   },
 *   testStructure: {
 *     describeBlocks: 1,
 *     itBlocks: 6,
 *     hooks: ['beforeEach', 'afterEach']
 *   }
 * };
 * ```
 */
export interface CodeSignature {
    /**
     * Function or class name being tested
     */
    functionName?: string;

    /**
     * Function parameters with types
     */
    parameters: ParameterSignature[];

    /**
     * Return type of the function
     */
    returnType?: string;

    /**
     * Import statements required
     */
    imports: ImportSignature[];

    /**
     * External package dependencies
     */
    dependencies: string[];

    /**
     * Code complexity metrics
     */
    complexity: ComplexityMetrics;

    /**
     * Test structure information
     */
    testStructure: TestStructure;

    /**
     * Optional class information (for class testing)
     */
    classInfo?: ClassSignature;
}

/**
 * Function parameter signature
 */
export interface ParameterSignature {
    name: string;
    type: string;
    optional: boolean;
    defaultValue?: string;
}

/**
 * Import statement signature
 */
export interface ImportSignature {
    module: string;
    identifiers: string[];
    isDefault?: boolean;
    namespace?: string;
}

/**
 * Code complexity metrics
 */
export interface ComplexityMetrics {
    /**
     * Cyclomatic complexity (control flow complexity)
     */
    cyclomaticComplexity: number;

    /**
     * Cognitive complexity (human readability complexity)
     */
    cognitiveComplexity: number;

    /**
     * Lines of code
     */
    linesOfCode?: number;

    /**
     * Number of branches (if/else, switch, etc.)
     */
    branchCount?: number;
}

/**
 * Test structure metadata
 */
export interface TestStructure {
    /**
     * Number of describe/suite blocks
     */
    describeBlocks: number;

    /**
     * Number of it/test blocks
     */
    itBlocks: number;

    /**
     * Lifecycle hooks used
     */
    hooks: TestHook[];

    /**
     * Assertion types used
     */
    assertionTypes?: string[];
}

/**
 * Test lifecycle hooks
 */
export type TestHook =
    | 'beforeAll'
    | 'beforeEach'
    | 'afterEach'
    | 'afterAll';

/**
 * Class signature (for class testing)
 */
export interface ClassSignature {
    className: string;
    methods: MethodSignature[];
    properties: PropertySignature[];
    extends?: string;
    implements?: string[];
}

/**
 * Method signature within a class
 */
export interface MethodSignature {
    name: string;
    parameters: ParameterSignature[];
    returnType?: string;
    isStatic: boolean;
    isPrivate: boolean;
    isAsync: boolean;
}

/**
 * Property signature within a class
 */
export interface PropertySignature {
    name: string;
    type: string;
    isPrivate: boolean;
    isReadonly: boolean;
}

// ============================================================================
// Test Template
// ============================================================================

/**
 * Reusable test template with placeholders
 *
 * @example
 * ```typescript
 * const template: TestTemplate = {
 *   templateId: 'unit-calculation-basic',
 *   code: `
 *     describe('{{functionName}}', () => {
 *       it('should calculate {{expectedBehavior}}', () => {
 *         const result = {{functionName}}({{inputParams}});
 *         expect(result).{{assertion}}({{expectedValue}});
 *       });
 *     });
 *   `,
 *   placeholders: [
 *     { name: 'functionName', type: 'identifier', description: 'Function under test' },
 *     { name: 'expectedBehavior', type: 'value', description: 'What the test validates' },
 *     { name: 'inputParams', type: 'value', description: 'Input parameters' },
 *     { name: 'assertion', type: 'identifier', description: 'Assertion method' },
 *     { name: 'expectedValue', type: 'value', description: 'Expected result' }
 *   ],
 *   assertions: [
 *     { type: 'toEqual', template: 'expect({{actual}}).toEqual({{expected}})' }
 *   ]
 * };
 * ```
 */
export interface TestTemplate {
    /**
     * Unique template identifier
     */
    templateId: string;

    /**
     * Template code with {{placeholders}}
     */
    code: string;

    /**
     * Placeholder definitions
     */
    placeholders: TemplatePlaceholder[];

    /**
     * Assertion templates
     */
    assertions: AssertionTemplate[];

    /**
     * Setup/teardown code (optional)
     */
    setup?: SetupTeardown;

    /**
     * Template metadata
     */
    metadata?: {
        description?: string;
        tags?: string[];
        version?: string;
    };
}

/**
 * Template placeholder definition
 */
export interface TemplatePlaceholder {
    name: string;
    type: PlaceholderType;
    description: string;
    defaultValue?: string;
    validationRules?: ValidationRule[];
    required?: boolean;
}

/**
 * Placeholder types
 */
export type PlaceholderType =
    | 'identifier'      // Variable/function/class names
    | 'value'           // Literal values (strings, numbers, objects)
    | 'type'            // TypeScript types
    | 'import'          // Import statements
    | 'expression';     // Code expressions

/**
 * Validation rule for placeholders
 */
export interface ValidationRule {
    type: 'regex' | 'length' | 'custom';
    rule: string;
    errorMessage?: string;
}

/**
 * Assertion template
 */
export interface AssertionTemplate {
    type: AssertionType;
    template: string;
    description?: string;
}

/**
 * Common assertion types
 */
export type AssertionType =
    | 'toBe'
    | 'toEqual'
    | 'toThrow'
    | 'toContain'
    | 'toBeGreaterThan'
    | 'toBeLessThan'
    | 'toBeNull'
    | 'toBeUndefined'
    | 'toBeTruthy'
    | 'toBeFalsy'
    | 'toHaveBeenCalled'
    | 'toHaveBeenCalledWith'
    | 'custom';

/**
 * Setup and teardown code
 */
export interface SetupTeardown {
    beforeEach?: string;
    afterEach?: string;
    beforeAll?: string;
    afterAll?: string;
}

// ============================================================================
// Pattern Metadata
// ============================================================================

/**
 * Comprehensive pattern metadata
 *
 * @example
 * ```typescript
 * const metadata: PatternMetadata = {
 *   name: 'Error handling with custom error types',
 *   description: 'Test pattern for validating custom error types and messages',
 *   tags: ['error-handling', 'typescript', 'custom-errors'],
 *   language: 'typescript',
 *   sourceProject: 'user-service',
 *   version: '1.0.0',
 *   quality: {
 *     coverage: 0.95,
 *     maintainability: 0.88,
 *     reliability: 0.92
 *   },
 *   usage: {
 *     totalUses: 47,
 *     successRate: 0.94,
 *     avgExecutionTime: 23.5
 *   }
 * };
 * ```
 */
export interface PatternMetadata {
    /**
     * Pattern name (human-readable)
     */
    name: string;

    /**
     * Detailed description
     */
    description: string;

    /**
     * Searchable tags
     */
    tags: string[];

    /**
     * Programming language
     */
    language: Language;

    /**
     * Source file path (optional)
     */
    sourceFile?: string;

    /**
     * Source project (optional)
     */
    sourceProject?: string;

    /**
     * Pattern author (optional)
     */
    author?: string;

    /**
     * Semantic version
     */
    version: string;

    /**
     * Quality metrics
     */
    quality: QualityMetrics;

    /**
     * Usage statistics
     */
    usage: UsageMetrics;

    /**
     * Code examples (optional)
     */
    examples?: CodeExample[];
}

/**
 * Pattern quality metrics
 */
export interface QualityMetrics {
    /**
     * Code coverage (0.0 - 1.0)
     */
    coverage: number;

    /**
     * Maintainability index (0.0 - 1.0)
     */
    maintainability: number;

    /**
     * Reliability score (0.0 - 1.0)
     */
    reliability: number;
}

/**
 * Pattern usage metrics
 */
export interface UsageMetrics {
    /**
     * Total number of times pattern was used
     */
    totalUses: number;

    /**
     * Success rate (0.0 - 1.0)
     */
    successRate: number;

    /**
     * Average execution time (milliseconds)
     */
    avgExecutionTime: number;
}

/**
 * Code example
 */
export interface CodeExample {
    code: string;
    description: string;
    language?: Language;
}

// ============================================================================
// Complete Pattern
// ============================================================================

/**
 * Complete test pattern with all components
 */
export interface TestPattern {
    /**
     * Unique pattern identifier (UUID)
     */
    id: string;

    /**
     * Pattern classification
     */
    patternType: PatternType;

    /**
     * Testing framework
     */
    framework: Framework;

    /**
     * Code signature
     */
    codeSignature: CodeSignature;

    /**
     * Test template
     */
    testTemplate: TestTemplate;

    /**
     * Pattern metadata
     */
    metadata: PatternMetadata;

    /**
     * Creation timestamp
     */
    createdAt?: Date;

    /**
     * Last update timestamp
     */
    updatedAt?: Date;
}

// ============================================================================
// Query & Matching Types
// ============================================================================

/**
 * Pattern search query
 */
export interface PatternQuery {
    /**
     * Code signature to match (partial match supported)
     */
    codeSignature?: Partial<CodeSignature>;

    /**
     * Framework filter
     */
    framework?: Framework;

    /**
     * Pattern type filter
     */
    patternType?: PatternType;

    /**
     * Tag search
     */
    tags?: string[];

    /**
     * Minimum similarity threshold (0.0 - 1.0)
     */
    minSimilarity?: number;

    /**
     * Full-text search query
     */
    searchText?: string;

    /**
     * Result limit
     */
    limit?: number;

    /**
     * Result offset (pagination)
     */
    offset?: number;

    /**
     * Sort order
     */
    sortBy?: 'similarity' | 'usage' | 'quality' | 'recent';

    /**
     * Sort direction
     */
    sortOrder?: 'asc' | 'desc';
}

/**
 * Pattern match result with similarity score
 */
export interface PatternMatch {
    /**
     * Matched pattern
     */
    pattern: TestPattern;

    /**
     * Overall similarity score (0.0 - 1.0)
     */
    similarityScore: number;

    /**
     * Detailed match breakdown
     */
    matchDetails: MatchDetails;

    /**
     * Match rank
     */
    rank?: number;
}

/**
 * Detailed similarity breakdown
 */
export interface MatchDetails {
    /**
     * Code structure similarity (0.0 - 1.0)
     */
    structureSimilarity: number;

    /**
     * Identifier/naming similarity (0.0 - 1.0)
     */
    identifierSimilarity: number;

    /**
     * Metadata similarity (0.0 - 1.0)
     */
    metadataSimilarity: number;

    /**
     * Usage-based scoring (0.0 - 1.0)
     */
    usageScore: number;

    /**
     * Matching components
     */
    matchingComponents?: {
        parametersMatch: boolean;
        returnTypeMatch: boolean;
        complexityMatch: boolean;
        frameworkMatch: boolean;
    };
}

// ============================================================================
// Pattern Extraction
// ============================================================================

/**
 * Pattern extraction options
 */
export interface ExtractionOptions {
    /**
     * Test files to extract from (glob patterns)
     */
    testFiles: string[];

    /**
     * Testing framework
     */
    framework: Framework;

    /**
     * Project identifier
     */
    projectId: string;

    /**
     * Minimum quality threshold (0.0 - 1.0)
     */
    minQuality?: number;

    /**
     * Patterns to exclude (regex)
     */
    excludePatterns?: string[];

    /**
     * Extract only specific pattern types
     */
    patternTypes?: PatternType[];

    /**
     * Enable pattern deduplication
     */
    deduplicate?: boolean;
}

// ============================================================================
// Cross-Project Sharing
// ============================================================================

/**
 * Framework transformation rules
 */
export interface TransformationRules {
    /**
     * Import statement mappings
     * @example { '@testing-library/react': '@testing-library/vue' }
     */
    importMappings?: Record<string, string>;

    /**
     * Identifier name mappings
     * @example { 'describe': 'suite', 'it': 'test' }
     */
    identifierMappings?: Record<string, string>;

    /**
     * Assertion method mappings
     * @example { 'toBe': 'toStrictEqual' }
     */
    assertionMappings?: Record<string, string>;

    /**
     * Custom transformation function
     */
    customTransformations?: Array<{
        pattern: string;
        replacement: string;
        description?: string;
    }>;
}

/**
 * Cross-project mapping
 */
export interface CrossProjectMapping {
    id: number;
    patternId: string;
    sourceFramework: Framework;
    targetFramework: Framework;
    transformationRules: TransformationRules;
    compatibilityScore: number;
    projectCount: number;
    successRate: number;
}

// ============================================================================
// Statistics & Analytics
// ============================================================================

/**
 * Pattern usage statistics
 */
export interface PatternStats {
    patternId: string;
    totalUses: number;
    successRate: number;
    avgCoverageGain: number;
    projectCount: number;
    lastUsed: Date;
    trend: PatternTrend;
}

/**
 * Usage update result
 */
export interface UsageResult {
    success: boolean;
    coverageGain?: number;
    executionTime?: number;
    errors?: string[];
}

/**
 * Pattern filter for export/analytics
 */
export interface PatternFilter {
    framework?: Framework;
    patternType?: PatternType;
    projectId?: string;
    minQuality?: number;
    dateRange?: {
        start: Date;
        end: Date;
    };
}

/**
 * Cleanup options
 */
export interface CleanupOptions {
    /**
     * Delete patterns older than this date
     */
    olderThan?: Date;

    /**
     * Minimum usage count to keep
     */
    minUsage?: number;

    /**
     * Minimum quality score to keep
     */
    minQuality?: number;

    /**
     * Dry run (don't actually delete)
     */
    dryRun?: boolean;
}

// ============================================================================
// QEReasoningBank Configuration
// ============================================================================

/**
 * ReasoningBank initialization options
 */
export interface ReasoningBankConfig {
    /**
     * SQLite database file path
     */
    databasePath: string;

    /**
     * LRU cache size (number of patterns)
     */
    cacheSize?: number;

    /**
     * Cache TTL (milliseconds)
     */
    cacheTTL?: number;

    /**
     * Enable ML-powered pattern matching
     */
    enableMLMatching?: boolean;

    /**
     * Similarity algorithm
     */
    similarityAlgorithm?: 'hybrid-tfidf' | 'cosine' | 'jaccard' | 'ml';

    /**
     * Enable auto-extraction on test execution
     */
    autoExtract?: boolean;

    /**
     * Pattern quality threshold for auto-storage
     */
    autoStoreQualityThreshold?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * ReasoningBank specific errors
 */
export class ReasoningBankError extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ReasoningBankError';
    }
}

/**
 * Pattern validation error
 */
export class PatternValidationError extends ReasoningBankError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'PATTERN_VALIDATION_ERROR', details);
        this.name = 'PatternValidationError';
    }
}

/**
 * Pattern not found error
 */
export class PatternNotFoundError extends ReasoningBankError {
    constructor(patternId: string) {
        super(`Pattern not found: ${patternId}`, 'PATTERN_NOT_FOUND', { patternId });
        this.name = 'PatternNotFoundError';
    }
}

/**
 * Similarity computation error
 */
export class SimilarityComputationError extends ReasoningBankError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'SIMILARITY_COMPUTATION_ERROR', details);
        this.name = 'SimilarityComputationError';
    }
}
