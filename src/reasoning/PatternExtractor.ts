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
  ASTAnalysisOptions
} from '../types/pattern.types';
import { Logger } from '../utils/Logger';

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
   * Parse source code to AST
   */
  private parseCode(code: string, filePath: string): any {
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
      });
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
  private extractEdgeCasePatterns(ast: any, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];
    const edgeCaseIndicators = [
      'null', 'undefined', 'empty', 'zero', 'negative', 'max', 'min',
      'edge', 'boundary', 'limit', 'extreme'
    ];

    this.traverseAST(ast, (node: any) => {
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
  private extractBoundaryConditionPatterns(ast: any, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];
    const boundaryIndicators = [
      'boundary', 'range', 'between', 'threshold', 'limit',
      '>=', '<=', '>', '<', 'minimum', 'maximum'
    ];

    this.traverseAST(ast, (node: any) => {
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
  private extractErrorHandlingPatterns(ast: any, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];

    this.traverseAST(ast, (node: any) => {
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
  private extractMockPatterns(ast: any, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];
    const mockIndicators = ['mock', 'stub', 'spy', 'jest.fn', 'sinon', 'jest.spyOn'];

    this.traverseAST(ast, (node: any) => {
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
  private extractAssertionPatterns(ast: any, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];

    this.traverseAST(ast, (node: any) => {
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
  private extractAsyncPatterns(ast: any, framework: TestFramework, filePath: string): TestPattern[] {
    const patterns: TestPattern[] = [];

    this.traverseAST(ast, (node: any) => {
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
    node: any,
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
  private traverseAST(ast: any, visitor: (node: any) => void): void {
    const traverse = (node: any, depth: number = 0) => {
      if (!node || depth > (this.config.astOptions.maxDepth || 50)) return;

      visitor(node);

      for (const key in node) {
        if (node[key] && typeof node[key] === 'object') {
          if (Array.isArray(node[key])) {
            node[key].forEach((child: any) => traverse(child, depth + 1));
          } else {
            traverse(node[key], depth + 1);
          }
        }
      }
    };

    traverse(ast);
  }

  /**
   * Check if node is a test block
   */
  private isTestBlock(node: any): boolean {
    if (node.type !== 'CallExpression') return false;
    const callee = node.callee;
    if (!callee) return false;

    const testFunctions = ['it', 'test', 'describe', 'context', 'specify'];
    return testFunctions.includes(callee.name || callee.property?.name);
  }

  /**
   * Get test name from node
   */
  private getTestName(node: any): string {
    if (node.arguments && node.arguments.length > 0) {
      const firstArg = node.arguments[0];
      if (firstArg.type === 'StringLiteral') {
        return firstArg.value;
      }
    }
    return 'unnamed-test';
  }

  /**
   * Get code from node
   */
  private getNodeCode(node: any): string {
    // Simplified - in real implementation, use recast or similar
    return JSON.stringify(node, null, 2);
  }

  /**
   * Count assertions in test block
   */
  private countAssertions(node: any): number {
    let count = 0;
    this.traverseAST(node, (n: any) => {
      if (n.type === 'CallExpression') {
        const callee = n.callee;
        if (callee?.name === 'expect' || callee?.property?.name === 'expect') {
          count++;
        }
      }
    });
    return count;
  }

  /**
   * Get node location
   */
  private getLocation(node: any): CodeLocation {
    return {
      startLine: node.loc?.start?.line || 0,
      endLine: node.loc?.end?.line || 0,
      startColumn: node.loc?.start?.column || 0,
      endColumn: node.loc?.end?.column || 0
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
  private createEmptyTemplate(id: string, name: string): any {
    return {
      id: `template-${id}`,
      name: `Template: ${name}`,
      description: 'Auto-generated template',
      structure: { type: 'root', id: 'root', children: [], properties: {}, parameterRefs: [] },
      parameters: [],
      validationRules: [],
      codeGenerators: {}
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
    const patternTypeDistribution: Record<PatternType, number> = {} as any;
    patterns.forEach(p => {
      patternTypeDistribution[p.type] = (patternTypeDistribution[p.type] || 0) + 1;
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
   * Deduplicate patterns by normalizing names and merging similar patterns
   */
  private deduplicatePatterns(patterns: TestPattern[]): TestPattern[] {
    const seen = new Map<string, TestPattern>();
    patterns.forEach(p => {
      // Normalize pattern name to detect similarity
      const normalizedName = this.normalizePatternName(p.name);
      const key = `${p.type}-${normalizedName}`;

      if (!seen.has(key)) {
        seen.set(key, p);
      } else {
        // Merge examples and update frequency
        const existing = seen.get(key)!;
        existing.examples.push(...p.examples);
        existing.frequency++;
        // Increase confidence slightly based on frequency
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
