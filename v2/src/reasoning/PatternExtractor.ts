/**
 * PatternExtractor - AST-based pattern extraction from test suites
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 *
 * Extracts reusable patterns from existing test suites including:
 * - Edge cases and boundary conditions
 * - Error handling patterns
 * - Mock and assertion patterns
 * - Integration patterns
 *
 * Performance: Process 100+ test files in < 5 seconds
 * Accuracy: > 85% pattern extraction accuracy
 */

import { parse } from '@babel/parser';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  TestPattern,
  PatternType,
  PatternCategory,
  TestFramework,
  CodeLocation,
  PatternMatch,
  PatternExtractionResult,
  PatternExtractionConfig,
  ExtractionStatistics,
  ExtractionError,
  ASTAnalysisOptions,
  TestTemplate,
  TemplateNode
} from '../types/pattern.types';
import { Logger } from '../utils/Logger';

// ============================================================================
// AST Node Types - Representing Babel AST structure
// ============================================================================

/**
 * Base AST node interface representing common properties
 */
interface ASTNodeBase {
  type: string;
  loc?: SourceLocation;
}

/**
 * Source location information for AST nodes
 */
interface SourceLocation {
  start: Position;
  end: Position;
}

/**
 * Position within source code
 */
interface Position {
  line: number;
  column: number;
}

/**
 * Identifier AST node
 */
interface IdentifierNode extends ASTNodeBase {
  type: 'Identifier';
  name: string;
}

/**
 * String literal AST node
 */
interface StringLiteralNode extends ASTNodeBase {
  type: 'StringLiteral';
  value: string;
}

/**
 * Member expression AST node (e.g., object.property)
 */
interface MemberExpressionNode extends ASTNodeBase {
  type: 'MemberExpression';
  object: ASTNode;
  property: ASTNode;
}

/**
 * Call expression callee - can be identifier or member expression
 */
type CalleeNode = IdentifierNode | MemberExpressionNode | ASTNode;

/**
 * Call expression AST node (function calls)
 */
interface CallExpressionNode extends ASTNodeBase {
  type: 'CallExpression';
  callee: CalleeNode;
  arguments: ASTNode[];
}

/**
 * Parsed file/program AST node
 */
interface ProgramNode extends ASTNodeBase {
  type: 'File' | 'Program';
  program?: ProgramNode;
  body?: ASTNode[];
}

/**
 * Represents a generic value that can appear in AST nodes
 */
type ASTNodeValue = string | number | boolean | null | undefined;

/**
 * Represents a generic AST node structure for traversal
 * This is a simplified representation that works with Babel's AST
 */
interface GenericASTNode {
  type: string;
  loc?: SourceLocation;
  [key: string]: GenericASTNode | GenericASTNode[] | ASTNodeValue | SourceLocation | undefined;
}

/**
 * Union type for all AST node types
 */
type ASTNode =
  | ASTNodeBase
  | IdentifierNode
  | StringLiteralNode
  | MemberExpressionNode
  | CallExpressionNode
  | ProgramNode
  | GenericASTNode;

/**
 * Type guard for CallExpressionNode
 */
function isCallExpression(node: ASTNode): node is CallExpressionNode {
  return node.type === 'CallExpression';
}

/**
 * Type guard for IdentifierNode
 */
function isIdentifier(node: ASTNode): node is IdentifierNode {
  return node.type === 'Identifier';
}

/**
 * Type guard for StringLiteralNode
 */
function isStringLiteral(node: ASTNode): node is StringLiteralNode {
  return node.type === 'StringLiteral';
}

/**
 * Type guard for MemberExpressionNode
 */
function isMemberExpression(node: ASTNode): node is MemberExpressionNode {
  return node.type === 'MemberExpression';
}

// ============================================================================
// Test Suite Input Types
// ============================================================================

/**
 * Input test definition for extractFromTestSuite method
 */
export interface TestSuiteInput {
  /** Unique test identifier */
  id: string;
  /** Test name/description */
  name: string;
  /** Test type (unit, integration, e2e, etc.) */
  type: string;
  /** Test code content */
  code?: string;
  /** Assertions in the test */
  assertions?: string[];
  /** Additional test metadata */
  metadata?: TestInputMetadata;
}

/**
 * Metadata for test input
 */
export interface TestInputMetadata {
  /** Tags for categorization */
  tags?: string[];
  /** Priority level */
  priority?: 'low' | 'medium' | 'high' | 'critical';
  /** Test timeout in milliseconds */
  timeout?: number;
  /** Skip reason if test is skipped */
  skipReason?: string;
  /** Additional custom properties */
  [key: string]: string | string[] | number | boolean | undefined;
}

// ============================================================================
// Extracted Pattern Types (for extractFromTestSuite output)
// ============================================================================

/**
 * Pattern category for extracted patterns from test suite
 */
export type ExtractedPatternCategory =
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'performance'
  | 'security';

/**
 * Framework type for extracted patterns
 */
export type ExtractedPatternFramework =
  | 'jest'
  | 'mocha'
  | 'vitest'
  | 'playwright'
  | 'cypress'
  | 'jasmine'
  | 'ava';

/**
 * Metadata for extracted patterns from test suite
 */
export interface ExtractedPatternMetadata {
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Pattern version */
  version: string;
  /** Categorization tags */
  tags: string[];
  /** Origin source of the pattern */
  source: string;
  /** Type of test this pattern came from */
  testType: string;
  /** Assertions used in the pattern */
  assertions: string[];
}

/**
 * Pattern extracted from a test suite (compatible with QEReasoningBank.TestPattern)
 */
export interface ExtractedTestPattern {
  /** Unique pattern identifier */
  id: string;
  /** Pattern name */
  name: string;
  /** Pattern description */
  description: string;
  /** Pattern category */
  category: ExtractedPatternCategory;
  /** Testing framework */
  framework: ExtractedPatternFramework;
  /** Programming language */
  language: 'typescript' | 'javascript' | 'tsx' | 'jsx';
  /** Normalized template code */
  template: string;
  /** Example code snippets */
  examples: string[];
  /** Pattern confidence score (0-1) */
  confidence: number;
  /** Number of times this pattern has been used */
  usageCount: number;
  /** Success rate of pattern application (0-1) */
  successRate: number;
  /** Pattern metadata */
  metadata: ExtractedPatternMetadata;
}


/**
 * Main pattern extractor class
 */
export class PatternExtractor {
  private logger: Logger;
  private config: PatternExtractionConfig;
  private extractedPatterns: Map<string, TestPattern>;
  private patternFrequency: Map<string, number>;

  constructor(config?: Partial<PatternExtractionConfig>) {
    this.logger = Logger.getInstance();
    this.extractedPatterns = new Map();
    this.patternFrequency = new Map();

    this.config = {
      frameworks: [TestFramework.JEST, TestFramework.MOCHA, TestFramework.CYPRESS],
      minConfidence: 0.7,
      minFrequency: 2,
      maxPatternsPerFile: 10,
      parallel: true,
      astOptions: {
        typescript: true,
        jsx: true,
        includeComments: true,
        maxDepth: 50
      },
      ...config
    };
  }

  /**
   * Extract patterns from multiple test files
   */
  async extractFromFiles(filePaths: string[]): Promise<PatternExtractionResult> {
    const startTime = Date.now();
    const errors: ExtractionError[] = [];
    let totalTests = 0;
    const patterns: TestPattern[] = [];

    this.logger.info(`Extracting patterns from ${filePaths.length} files`);

    for (const filePath of filePaths) {
      try {
        const filePatterns = await this.extractFromFile(filePath);
        patterns.push(...filePatterns);
        totalTests += this.countTestsInFile(filePath);
      } catch (error) {
        errors.push({
          file: filePath,
          message: (error as Error).message,
          type: 'analysis-error',
          stack: (error as Error).stack
        });
        this.logger.error(`Failed to extract patterns from ${filePath}:`, error);
      }
    }

    const processingTime = Date.now() - startTime;
    const statistics = this.calculateStatistics(filePaths.length, totalTests, patterns, processingTime);

    return {
      patterns: this.deduplicatePatterns(patterns),
      signatures: [],
      statistics,
      errors,
      timestamp: new Date()
    };
  }

  /**
   * Extract patterns from a single test file
   */
  async extractFromFile(filePath: string): Promise<TestPattern[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const framework = this.detectFramework(content);

    const ast = this.parseCode(content, filePath);
    const patterns: TestPattern[] = [];

    // Extract different pattern types
    patterns.push(...this.extractEdgeCasePatterns(ast, framework, filePath));
    patterns.push(...this.extractBoundaryConditionPatterns(ast, framework, filePath));
    patterns.push(...this.extractErrorHandlingPatterns(ast, framework, filePath));
    patterns.push(...this.extractMockPatterns(ast, framework, filePath));
    patterns.push(...this.extractAssertionPatterns(ast, framework, filePath));
    patterns.push(...this.extractAsyncPatterns(ast, framework, filePath));

    // Filter by confidence and frequency
    return patterns
      .filter(p => p.confidence >= this.config.minConfidence)
      .slice(0, this.config.maxPatternsPerFile);
  }

  /**
   * Extract patterns from generated test suite (in-memory Test[] objects)
   * This is used to learn from AI-generated tests
   * Returns patterns compatible with QEReasoningBank.TestPattern
   */
  async extractFromTestSuite(tests: TestSuiteInput[], framework: string): Promise<ExtractedTestPattern[]> {
    const patterns: ExtractedTestPattern[] = [];

    for (const test of tests) {
      // Only extract from tests that have actual code
      if (!test.code || test.code.length < 20) {
        continue;
      }

      try {
        // Detect pattern type from test name and code
        const testName = test.name.toLowerCase();
        const testCode = test.code;

        let patternType: string = 'unit';
        let confidence = 0.7;

        // Classify test type
        if (testName.includes('integration') || testName.includes('api') || testName.includes('endpoint')) {
          patternType = 'integration';
          confidence = 0.8;
        } else if (testName.includes('e2e') || testName.includes('end-to-end')) {
          patternType = 'e2e';
          confidence = 0.75;
        } else if (testName.includes('performance') || testName.includes('load')) {
          patternType = 'performance';
          confidence = 0.8;
        } else if (testName.includes('security') || testName.includes('auth')) {
          patternType = 'security';
          confidence = 0.85;
        }

        // Boost confidence for edge cases and error handling
        if (testName.includes('edge') || testName.includes('boundary') || testName.includes('null') || testName.includes('undefined')) {
          confidence += 0.1;
        }
        if (testName.includes('error') || testName.includes('exception') || testName.includes('invalid')) {
          confidence += 0.05;
        }

        // Cap confidence at 1.0
        confidence = Math.min(confidence, 1.0);

        // Extract template from code
        const template = this.normalizeTestCode(testCode);

        // Create pattern ID from test name
        const patternId = `pattern-${crypto.createHash('md5').update(test.name + testCode.slice(0, 100)).digest('hex').slice(0, 12)}`;

        const pattern: ExtractedTestPattern = {
          id: patternId,
          name: `${test.name} Pattern`,
          description: `Test pattern extracted from generated test: ${test.name}`,
          category: patternType as ExtractedPatternCategory,
          framework: this.normalizeFramework(framework),
          language: 'typescript',
          template,
          examples: [testCode],
          confidence,
          usageCount: 1, // Initial usage
          successRate: 0.0, // Will be updated as pattern is reused
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: this.extractTags(testName, testCode),
            source: 'ai-generated',
            testType: test.type,
            assertions: test.assertions || []
          }
        };

        patterns.push(pattern);

      } catch (error) {
        this.logger.warn(`Failed to extract pattern from test ${test.name}:`, error);
        // Continue with other tests
      }
    }

    return this.deduplicatePatterns(patterns);
  }

  /**
   * Normalize test code to create reusable template
   */
  private normalizeTestCode(code: string): string {
    // Replace specific values with placeholders
    let template = code;

    // Replace string literals
    template = template.replace(/'[^']*'/g, "'{{value}}'");
    template = template.replace(/"[^"]*"/g, '"{{value}}"');

    // Replace numeric literals (but keep simple numbers like 0, 1, 2)
    template = template.replace(/\b\d{3,}\b/g, '{{number}}');

    // Replace variable names in assertions
    template = template.replace(/expect\((\w+)\)/g, 'expect({{result}})');

    return template;
  }

  /**
   * Extract tags from test name and code
   */
  private extractTags(testName: string, code: string): string[] {
    const tags = new Set<string>();

    const keywords = ['async', 'mock', 'spy', 'stub', 'api', 'http', 'rest', 'graphql',
                      'error', 'exception', 'edge', 'boundary', 'integration', 'unit',
                      'validation', 'auth', 'security', 'performance'];

    const testNameLower = testName.toLowerCase();
    const codeLower = code.toLowerCase();

    for (const keyword of keywords) {
      if (testNameLower.includes(keyword) || codeLower.includes(keyword)) {
        tags.add(keyword);
      }
    }

    return Array.from(tags);
  }

  /**
   * Normalize framework name to ExtractedPatternFramework type
   */
  private normalizeFramework(framework: string): ExtractedPatternFramework {
    const lower = framework.toLowerCase();
    if (lower.includes('mocha')) return 'mocha';
    if (lower.includes('vitest')) return 'vitest';
    if (lower.includes('playwright')) return 'playwright';
    if (lower.includes('cypress')) return 'cypress';
    if (lower.includes('jasmine')) return 'jasmine';
    if (lower.includes('ava')) return 'ava';
    return 'jest'; // Default
  }

  /**
   * Parse source code to AST
   */
  private parseCode(code: string, filePath: string): ASTNode {
    try {
      return parse(code, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'asyncGenerators',
          'dynamicImport',
          'optionalChaining',
          'nullishCoalescingOperator'
        ],
        sourceFilename: filePath
      }) as ASTNode;
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Detect test framework from source code
   * Checks framework-specific indicators in priority order
   */
  private detectFramework(code: string): TestFramework {
    // Check framework-specific indicators first (highest priority)
    if (code.includes('cy.') || code.includes('Cypress')) {
      return TestFramework.CYPRESS;
    }
    if (code.includes('vitest') || code.includes('vi.') || code.includes('import { test, expect } from \'vitest\'')) {
      return TestFramework.VITEST;
    }
    if (code.includes('t.is(') || code.includes('test.serial') || code.includes('import test from \'ava\'')) {
      return TestFramework.AVA;
    }
    if (code.includes('jasmine') || code.includes('spyOn(') || code.includes('jasmine.')) {
      return TestFramework.JASMINE;
    }
    if (code.includes('mocha') || code.includes('chai') || code.includes('assert.') || code.includes('should.')) {
      return TestFramework.MOCHA;
    }
    if (code.includes('@jest') || code.includes('jest.') || code.includes('test.skip') || code.includes('test.only')) {
      return TestFramework.JEST;
    }

    // Fallback to generic detection (describe/it/test are used by multiple frameworks)
    if (code.includes('describe(') || code.includes('it(') || code.includes('test(')) {
      return TestFramework.JEST; // Default only after all specific checks
    }

    return TestFramework.JEST;
  }

  /**
   * Extract edge case patterns
   */
  private extractEdgeCasePatterns(ast: ASTNode, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];
    const edgeCaseIndicators = [
      'null', 'undefined', 'empty', 'zero', 'negative', 'max', 'min',
      'edge', 'boundary', 'limit', 'extreme'
    ];

    this.traverseAST(ast, (node: ASTNode) => {
      if (this.isTestBlock(node)) {
        const testName = this.getTestName(node);
        const hasEdgeCaseIndicator = edgeCaseIndicators.some(indicator =>
          testName.toLowerCase().includes(indicator)
        );

        if (hasEdgeCaseIndicator) {
          const pattern = this.createPattern(
            node,
            PatternType.EDGE_CASE,
            framework,
            filePath,
            testName,
            0.85
          );
          patterns.push(pattern);
        }
      }
    });

    return patterns;
  }

  /**
   * Extract boundary condition patterns
   */
  private extractBoundaryConditionPatterns(ast: ASTNode, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];
    const boundaryIndicators = [
      'boundary', 'range', 'between', 'threshold', 'limit',
      '>=', '<=', '>', '<', 'minimum', 'maximum'
    ];

    this.traverseAST(ast, (node: ASTNode) => {
      if (this.isTestBlock(node)) {
        const code = this.getNodeCode(node);
        const hasBoundaryCheck = boundaryIndicators.some(indicator =>
          code.includes(indicator)
        );

        if (hasBoundaryCheck) {
          const testName = this.getTestName(node);
          const pattern = this.createPattern(
            node,
            PatternType.BOUNDARY_CONDITION,
            framework,
            filePath,
            testName,
            0.8
          );
          patterns.push(pattern);
        }
      }
    });

    return patterns;
  }

  /**
   * Extract error handling patterns
   */
  private extractErrorHandlingPatterns(ast: ASTNode, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];

    this.traverseAST(ast, (node: ASTNode) => {
      if (this.isTestBlock(node)) {
        const code = this.getNodeCode(node);
        const hasErrorHandling =
          (code.includes('try') && code.includes('catch')) ||
          code.includes('toThrow') ||
          code.includes('rejects') ||
          code.includes('.catch(') ||
          (code.includes('expect') && code.includes('Error'));

        if (hasErrorHandling) {
          const testName = this.getTestName(node);
          const pattern = this.createPattern(
            node,
            PatternType.ERROR_HANDLING,
            framework,
            filePath,
            testName,
            0.9
          );
          patterns.push(pattern);
        }
      }
    });

    return patterns;
  }

  /**
   * Extract mock patterns
   */
  private extractMockPatterns(ast: ASTNode, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];
    const mockIndicators = ['mock', 'stub', 'spy', 'jest.fn', 'sinon', 'jest.spyOn'];

    this.traverseAST(ast, (node: ASTNode) => {
      if (this.isTestBlock(node)) {
        const code = this.getNodeCode(node);
        const hasMocking = mockIndicators.some(indicator => code.includes(indicator));

        if (hasMocking) {
          const testName = this.getTestName(node);
          const pattern = this.createPattern(
            node,
            PatternType.MOCK_PATTERN,
            framework,
            filePath,
            testName,
            0.85
          );
          patterns.push(pattern);
        }
      }
    });

    return patterns;
  }

  /**
   * Extract assertion patterns
   */
  private extractAssertionPatterns(ast: ASTNode, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];

    this.traverseAST(ast, (node: ASTNode) => {
      if (this.isTestBlock(node)) {
        const assertionCount = this.countAssertions(node);
        if (assertionCount >= 3) {
          const testName = this.getTestName(node);
          const pattern = this.createPattern(
            node,
            PatternType.ASSERTION_PATTERN,
            framework,
            filePath,
            testName,
            0.75
          );
          patterns.push(pattern);
        }
      }
    });

    return patterns;
  }

  /**
   * Extract async patterns
   */
  private extractAsyncPatterns(ast: ASTNode, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];

    this.traverseAST(ast, (node: ASTNode) => {
      if (this.isTestBlock(node)) {
        const code = this.getNodeCode(node);
        const isAsync =
          code.includes('async') ||
          code.includes('await') ||
          code.includes('Promise') ||
          code.includes('.then(');

        if (isAsync) {
          const testName = this.getTestName(node);
          const pattern = this.createPattern(
            node,
            PatternType.ASYNC_PATTERN,
            framework,
            filePath,
            testName,
            0.8
          );
          patterns.push(pattern);
        }
      }
    });

    return patterns;
  }

  /**
   * Create a test pattern from AST node
   */
  private createPattern(
    node: ASTNode,
    type: PatternType,
    framework: TestFramework,
    filePath: string,
    name: string,
    confidence: number
  ): TestPattern {
    const id = this.generatePatternId(name, type);
    const code = this.getNodeCode(node);

    return {
      id,
      name,
      type,
      category: this.inferCategory(type),
      framework,
      template: this.createEmptyTemplate(id, name),
      examples: [code],
      frequency: 1,
      confidence,
      applicabilityConditions: this.inferApplicabilityConditions(type),
      sourceFile: filePath,
      createdAt: new Date(),
      metadata: {
        nodeType: node.type,
        location: this.getLocation(node)
      }
    };
  }

  /**
   * Traverse AST and apply visitor function
   */
  private traverseAST(ast: ASTNode, visitor: (node: ASTNode) => void): void {
    const traverse = (node: ASTNode, depth: number = 0): void => {
      if (!node || depth > (this.config.astOptions.maxDepth || 50)) return;

      visitor(node);

      // Iterate through node properties to find child nodes
      const nodeRecord = node as Record<string, ASTNode | ASTNode[] | string | number | boolean | null | undefined>;
      for (const key in nodeRecord) {
        const value = nodeRecord[key];
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            value.forEach((child: ASTNode) => traverse(child, depth + 1));
          } else {
            traverse(value as ASTNode, depth + 1);
          }
        }
      }
    };

    traverse(ast);
  }

  /**
   * Check if node is a test block
   */
  private isTestBlock(node: ASTNode): node is CallExpressionNode {
    if (!isCallExpression(node)) return false;
    const callee = node.callee;
    if (!callee) return false;

    const testFunctions = ['it', 'test', 'describe', 'context', 'specify'];

    // Check if callee is an Identifier with a test function name
    if (isIdentifier(callee)) {
      return testFunctions.includes(callee.name);
    }

    // Check if callee is a MemberExpression with a test function property
    if (isMemberExpression(callee) && isIdentifier(callee.property)) {
      return testFunctions.includes(callee.property.name);
    }

    return false;
  }

  /**
   * Get test name from node
   */
  private getTestName(node: ASTNode): string {
    if (isCallExpression(node) && node.arguments && node.arguments.length > 0) {
      const firstArg = node.arguments[0];
      if (isStringLiteral(firstArg)) {
        return firstArg.value;
      }
    }
    return 'unnamed-test';
  }

  /**
   * Get code from node
   */
  private getNodeCode(node: ASTNode): string {
    // Simplified - in real implementation, use recast or similar
    return JSON.stringify(node, null, 2);
  }

  /**
   * Count assertions in test block
   */
  private countAssertions(node: ASTNode): number {
    let count = 0;
    this.traverseAST(node, (n: ASTNode) => {
      if (isCallExpression(n)) {
        const callee = n.callee;
        // Check for direct 'expect' call
        if (isIdentifier(callee) && callee.name === 'expect') {
          count++;
        }
        // Check for member expression with 'expect' property
        if (isMemberExpression(callee) && isIdentifier(callee.property) && callee.property.name === 'expect') {
          count++;
        }
      }
    });
    return count;
  }

  /**
   * Get node location
   */
  private getLocation(node: ASTNode): CodeLocation {
    return {
      startLine: node.loc?.start?.line ?? 0,
      endLine: node.loc?.end?.line ?? 0,
      startColumn: node.loc?.start?.column ?? 0,
      endColumn: node.loc?.end?.column ?? 0
    };
  }

  /**
   * Generate pattern ID
   */
  private generatePatternId(name: string, type: PatternType): string {
    const hash = crypto
      .createHash('md5')
      .update(`${name}-${type}-${Date.now()}`)
      .digest('hex')
      .substring(0, 8);
    return `pattern-${type}-${hash}`;
  }

  /**
   * Infer pattern category from type
   */
  private inferCategory(type: PatternType): PatternCategory {
    const categoryMap: Record<PatternType, PatternCategory> = {
      [PatternType.EDGE_CASE]: PatternCategory.UNIT_TEST,
      [PatternType.BOUNDARY_CONDITION]: PatternCategory.UNIT_TEST,
      [PatternType.ERROR_HANDLING]: PatternCategory.UNIT_TEST,
      [PatternType.INTEGRATION]: PatternCategory.INTEGRATION_TEST,
      [PatternType.ASYNC_PATTERN]: PatternCategory.INTEGRATION_TEST,
      [PatternType.MOCK_PATTERN]: PatternCategory.UNIT_TEST,
      [PatternType.ASSERTION_PATTERN]: PatternCategory.UNIT_TEST,
      [PatternType.SETUP_TEARDOWN]: PatternCategory.UNIT_TEST,
      [PatternType.DATA_DRIVEN]: PatternCategory.UNIT_TEST,
      [PatternType.PARAMETERIZED]: PatternCategory.UNIT_TEST
    };
    return categoryMap[type] || PatternCategory.UNIT_TEST;
  }

  /**
   * Infer applicability conditions
   */
  private inferApplicabilityConditions(type: PatternType): string[] {
    const conditionsMap: Record<PatternType, string[]> = {
      [PatternType.EDGE_CASE]: ['function with input validation', 'nullable parameters'],
      [PatternType.BOUNDARY_CONDITION]: ['range-based logic', 'numeric comparisons'],
      [PatternType.ERROR_HANDLING]: ['functions that throw errors', 'async operations'],
      [PatternType.INTEGRATION]: ['multiple module interactions', 'external dependencies'],
      [PatternType.ASYNC_PATTERN]: ['asynchronous operations', 'promises'],
      [PatternType.MOCK_PATTERN]: ['external dependencies', 'database calls', 'API calls'],
      [PatternType.ASSERTION_PATTERN]: ['complex return values', 'multiple properties'],
      [PatternType.SETUP_TEARDOWN]: ['stateful tests', 'resource initialization'],
      [PatternType.DATA_DRIVEN]: ['multiple test cases with similar structure'],
      [PatternType.PARAMETERIZED]: ['similar tests with different inputs']
    };
    return conditionsMap[type] || [];
  }

  /**
   * Create empty template (to be filled by TestTemplateCreator)
   */
  private createEmptyTemplate(id: string, name: string): TestTemplate {
    const emptyStructure: TemplateNode = {
      type: 'root',
      id: 'root',
      children: [],
      properties: {},
      parameterRefs: []
    };

    return {
      id: `template-${id}`,
      name: `Template: ${name}`,
      description: 'Auto-generated template',
      structure: emptyStructure,
      parameters: [],
      validationRules: [],
      codeGenerators: {} as Record<TestFramework, string>
    };
  }

  /**
   * Count tests in file
   */
  private countTestsInFile(filePath: string): number {
    // Simplified - count test blocks
    return 1;
  }

  /**
   * Calculate extraction statistics
   */
  private calculateStatistics(
    filesProcessed: number,
    testsAnalyzed: number,
    patterns: TestPattern[],
    processingTime: number
  ): ExtractionStatistics {
    // Initialize pattern type distribution with all pattern types set to 0
    const patternTypeDistribution: Record<PatternType, number> = {
      [PatternType.EDGE_CASE]: 0,
      [PatternType.BOUNDARY_CONDITION]: 0,
      [PatternType.ERROR_HANDLING]: 0,
      [PatternType.INTEGRATION]: 0,
      [PatternType.ASYNC_PATTERN]: 0,
      [PatternType.MOCK_PATTERN]: 0,
      [PatternType.ASSERTION_PATTERN]: 0,
      [PatternType.SETUP_TEARDOWN]: 0,
      [PatternType.DATA_DRIVEN]: 0,
      [PatternType.PARAMETERIZED]: 0
    };

    // Count occurrences of each pattern type
    patterns.forEach(p => {
      patternTypeDistribution[p.type] = patternTypeDistribution[p.type] + 1;
    });

    return {
      filesProcessed,
      testsAnalyzed,
      patternsExtracted: patterns.length,
      processingTime,
      avgPatternsPerFile: patterns.length / Math.max(filesProcessed, 1),
      patternTypeDistribution
    };
  }

  /**
   * Deduplicate TestPattern patterns by normalizing names and merging similar patterns
   */
  private deduplicatePatterns(patterns: TestPattern[]): TestPattern[];
  /**
   * Deduplicate ExtractedTestPattern patterns by normalizing names and merging similar patterns
   */
  private deduplicatePatterns(patterns: ExtractedTestPattern[]): ExtractedTestPattern[];
  /**
   * Implementation of pattern deduplication
   */
  private deduplicatePatterns(patterns: TestPattern[] | ExtractedTestPattern[]): TestPattern[] | ExtractedTestPattern[] {
    // Handle TestPattern[]
    if (patterns.length > 0 && 'type' in patterns[0]) {
      const testPatterns = patterns as TestPattern[];
      const seen = new Map<string, TestPattern>();
      testPatterns.forEach(p => {
        const normalizedName = this.normalizePatternName(p.name);
        const key = `${p.type}-${normalizedName}`;

        if (!seen.has(key)) {
          seen.set(key, p);
        } else {
          const existing = seen.get(key)!;
          existing.examples.push(...p.examples);
          existing.frequency++;
          existing.confidence = Math.min(existing.confidence + 0.02, 1.0);
        }
      });
      return Array.from(seen.values());
    }

    // Handle ExtractedTestPattern[]
    const extractedPatterns = patterns as ExtractedTestPattern[];
    const seen = new Map<string, ExtractedTestPattern>();
    extractedPatterns.forEach(p => {
      const normalizedName = this.normalizePatternName(p.name);
      const key = `${p.category}-${normalizedName}`;

      if (!seen.has(key)) {
        seen.set(key, p);
      } else {
        const existing = seen.get(key)!;
        existing.examples.push(...p.examples);
        existing.usageCount++;
        existing.confidence = Math.min(existing.confidence + 0.02, 1.0);
      }
    });
    return Array.from(seen.values());
  }

  /**
   * Normalize pattern name for deduplication
   * Removes trailing numbers, extra whitespace, and normalizes case
   */
  private normalizePatternName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+\d+$/g, '')  // Remove trailing numbers like " 1", " 2"
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim();
  }

  /**
   * Get extracted patterns
   */
  getPatterns(): TestPattern[] {
    return Array.from(this.extractedPatterns.values());
  }
}
