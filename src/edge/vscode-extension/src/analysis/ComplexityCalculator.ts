/**
 * ComplexityCalculator - Calculate cyclomatic complexity from TypeScript AST
 *
 * Calculates cyclomatic complexity (McCabe's metric) by counting:
 * - if/else statements
 * - switch case clauses
 * - for/while/do-while loops
 * - for-in/for-of loops
 * - ternary expressions (? :)
 * - logical operators (&& and ||)
 * - catch clauses
 * - null coalescing operators (??)
 * - optional chaining (?.)
 *
 * @module vscode-extension/analysis/ComplexityCalculator
 * @version 0.1.0
 */

import * as ts from 'typescript';
import type { ExtractedFunction } from './FunctionExtractor';

/**
 * Complexity analysis result
 */
export interface ComplexityResult {
  /**
   * Cyclomatic complexity score
   */
  cyclomaticComplexity: number;

  /**
   * Cognitive complexity score (Sonar-style)
   */
  cognitiveComplexity: number;

  /**
   * Complexity category
   */
  category: ComplexityCategory;

  /**
   * Breakdown of complexity contributors
   */
  breakdown: ComplexityBreakdown;

  /**
   * Human-readable explanation
   */
  explanation: string;

  /**
   * Improvement suggestions
   */
  suggestions: string[];
}

/**
 * Complexity category based on thresholds
 */
export type ComplexityCategory = 'low' | 'moderate' | 'high' | 'very-high';

/**
 * Breakdown of complexity contributors
 */
export interface ComplexityBreakdown {
  ifStatements: number;
  elseStatements: number;
  switchCases: number;
  forLoops: number;
  whileLoops: number;
  doWhileLoops: number;
  forInLoops: number;
  forOfLoops: number;
  ternaryExpressions: number;
  logicalAnd: number;
  logicalOr: number;
  nullCoalescing: number;
  optionalChaining: number;
  catchClauses: number;
  recursiveCalls: number;
  nestedDepth: number;
}

/**
 * Complexity thresholds for categorization
 */
export interface ComplexityThresholds {
  low: number;
  moderate: number;
  high: number;
}

/**
 * Default complexity thresholds
 */
const DEFAULT_THRESHOLDS: ComplexityThresholds = {
  low: 5,
  moderate: 10,
  high: 20,
};

/**
 * Calculator options
 */
export interface ComplexityOptions {
  /**
   * Thresholds for categorization
   */
  thresholds?: ComplexityThresholds;

  /**
   * Include logical operators in complexity count
   */
  includeLogicalOperators?: boolean;

  /**
   * Include null coalescing and optional chaining
   */
  includeNullishOperators?: boolean;

  /**
   * Weight for nested structures
   */
  nestingWeight?: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: ComplexityOptions = {
  thresholds: DEFAULT_THRESHOLDS,
  includeLogicalOperators: true,
  includeNullishOperators: true,
  nestingWeight: 1,
};

/**
 * ComplexityCalculator
 *
 * Calculates cyclomatic and cognitive complexity for functions
 * using the TypeScript compiler API.
 */
export class ComplexityCalculator {
  private sourceFile: ts.SourceFile | null = null;
  private options: Required<ComplexityOptions>;

  constructor(options: ComplexityOptions = {}) {
    this.options = {
      thresholds: options.thresholds || DEFAULT_THRESHOLDS,
      includeLogicalOperators: options.includeLogicalOperators ?? true,
      includeNullishOperators: options.includeNullishOperators ?? true,
      nestingWeight: options.nestingWeight ?? 1,
    };
  }

  /**
   * Calculate complexity for a function
   */
  calculate(func: ExtractedFunction): ComplexityResult {
    // Parse the function source code
    this.sourceFile = ts.createSourceFile(
      'temp.ts',
      func.sourceCode,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const breakdown = this.initializeBreakdown();
    let maxNestingDepth = 0;

    // Walk the AST and count complexity contributors
    const visit = (node: ts.Node, depth: number): void => {
      maxNestingDepth = Math.max(maxNestingDepth, depth);

      // Count decision points
      switch (node.kind) {
        case ts.SyntaxKind.IfStatement:
          breakdown.ifStatements++;
          const ifStmt = node as ts.IfStatement;
          if (ifStmt.elseStatement) {
            if (!ts.isIfStatement(ifStmt.elseStatement)) {
              breakdown.elseStatements++;
            }
          }
          break;

        case ts.SyntaxKind.CaseClause:
          breakdown.switchCases++;
          break;

        case ts.SyntaxKind.ForStatement:
          breakdown.forLoops++;
          break;

        case ts.SyntaxKind.WhileStatement:
          breakdown.whileLoops++;
          break;

        case ts.SyntaxKind.DoStatement:
          breakdown.doWhileLoops++;
          break;

        case ts.SyntaxKind.ForInStatement:
          breakdown.forInLoops++;
          break;

        case ts.SyntaxKind.ForOfStatement:
          breakdown.forOfLoops++;
          break;

        case ts.SyntaxKind.ConditionalExpression:
          breakdown.ternaryExpressions++;
          break;

        case ts.SyntaxKind.BinaryExpression: {
          const binary = node as ts.BinaryExpression;
          if (this.options.includeLogicalOperators) {
            if (binary.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
              breakdown.logicalAnd++;
            } else if (binary.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
              breakdown.logicalOr++;
            } else if (
              this.options.includeNullishOperators &&
              binary.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
            ) {
              breakdown.nullCoalescing++;
            }
          }
          break;
        }

        case ts.SyntaxKind.CatchClause:
          breakdown.catchClauses++;
          break;

        case ts.SyntaxKind.CallExpression: {
          // Check for recursive calls
          const call = node as ts.CallExpression;
          if (ts.isIdentifier(call.expression)) {
            const calledName = call.expression.getText(this.sourceFile!);
            if (calledName === func.name) {
              breakdown.recursiveCalls++;
            }
          }
          break;
        }
      }

      // Check for optional chaining
      if (this.options.includeNullishOperators) {
        if (
          ts.isPropertyAccessExpression(node) &&
          (node as ts.PropertyAccessExpression).questionDotToken
        ) {
          breakdown.optionalChaining++;
        }
        if (
          ts.isElementAccessExpression(node) &&
          (node as ts.ElementAccessExpression).questionDotToken
        ) {
          breakdown.optionalChaining++;
        }
        if (
          ts.isCallExpression(node) &&
          (node as ts.CallExpression).questionDotToken
        ) {
          breakdown.optionalChaining++;
        }
      }

      // Calculate new nesting depth for block-creating statements
      let newDepth = depth;
      if (
        ts.isIfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isDoStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isTryStatement(node) ||
        ts.isSwitchStatement(node)
      ) {
        newDepth = depth + 1;
      }

      ts.forEachChild(node, (child) => visit(child, newDepth));
    };

    visit(this.sourceFile, 0);
    breakdown.nestedDepth = maxNestingDepth;

    // Calculate cyclomatic complexity
    // Base complexity is 1, add 1 for each decision point
    const cyclomaticComplexity =
      1 +
      breakdown.ifStatements +
      breakdown.switchCases +
      breakdown.forLoops +
      breakdown.whileLoops +
      breakdown.doWhileLoops +
      breakdown.forInLoops +
      breakdown.forOfLoops +
      breakdown.ternaryExpressions +
      (this.options.includeLogicalOperators
        ? breakdown.logicalAnd + breakdown.logicalOr
        : 0) +
      breakdown.catchClauses;

    // Calculate cognitive complexity (accounts for nesting)
    const cognitiveComplexity = this.calculateCognitiveComplexity(breakdown);

    // Determine category
    const category = this.categorize(cyclomaticComplexity);

    // Generate explanation and suggestions
    const explanation = this.generateExplanation(cyclomaticComplexity, breakdown);
    const suggestions = this.generateSuggestions(cyclomaticComplexity, breakdown, func);

    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      category,
      breakdown,
      explanation,
      suggestions,
    };
  }

  /**
   * Calculate complexity for raw source code
   */
  calculateFromSource(sourceCode: string, functionName: string = 'anonymous'): ComplexityResult {
    // Create a minimal ExtractedFunction
    const func: ExtractedFunction = {
      name: functionName,
      qualifiedName: functionName,
      kind: 'function',
      parameters: [],
      returnType: undefined,
      isAsync: false,
      isExported: false,
      isGenerator: false,
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 0, column: 0, offset: sourceCode.length },
      sourceCode,
      bodyCode: sourceCode,
      jsdoc: undefined,
      modifiers: [],
      parentClass: undefined,
      dependencies: [],
      nodeKind: 'FunctionDeclaration',
    };

    return this.calculate(func);
  }

  /**
   * Calculate cognitive complexity
   */
  private calculateCognitiveComplexity(breakdown: ComplexityBreakdown): number {
    // Cognitive complexity adds extra weight for nesting
    const nestingMultiplier = 1 + breakdown.nestedDepth * this.options.nestingWeight;

    return Math.round(
      (breakdown.ifStatements +
        breakdown.elseStatements +
        breakdown.switchCases +
        breakdown.forLoops +
        breakdown.whileLoops +
        breakdown.doWhileLoops +
        breakdown.forInLoops +
        breakdown.forOfLoops +
        breakdown.ternaryExpressions +
        breakdown.logicalAnd +
        breakdown.logicalOr +
        breakdown.catchClauses +
        breakdown.recursiveCalls * 2) // Recursion adds extra cognitive load
        * nestingMultiplier
    );
  }

  /**
   * Categorize complexity based on thresholds
   */
  private categorize(complexity: number): ComplexityCategory {
    const { low, moderate, high } = this.options.thresholds;

    if (complexity <= low) return 'low';
    if (complexity <= moderate) return 'moderate';
    if (complexity <= high) return 'high';
    return 'very-high';
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    complexity: number,
    breakdown: ComplexityBreakdown
  ): string {
    const parts: string[] = [];

    parts.push(`Cyclomatic complexity: ${complexity}`);

    const contributors: string[] = [];
    if (breakdown.ifStatements > 0) {
      contributors.push(`${breakdown.ifStatements} if statement(s)`);
    }
    if (breakdown.elseStatements > 0) {
      contributors.push(`${breakdown.elseStatements} else clause(s)`);
    }
    if (breakdown.switchCases > 0) {
      contributors.push(`${breakdown.switchCases} switch case(s)`);
    }
    if (breakdown.forLoops + breakdown.forInLoops + breakdown.forOfLoops > 0) {
      const totalFor =
        breakdown.forLoops + breakdown.forInLoops + breakdown.forOfLoops;
      contributors.push(`${totalFor} for loop(s)`);
    }
    if (breakdown.whileLoops + breakdown.doWhileLoops > 0) {
      const totalWhile = breakdown.whileLoops + breakdown.doWhileLoops;
      contributors.push(`${totalWhile} while loop(s)`);
    }
    if (breakdown.ternaryExpressions > 0) {
      contributors.push(`${breakdown.ternaryExpressions} ternary expression(s)`);
    }
    if (breakdown.logicalAnd + breakdown.logicalOr > 0) {
      const totalLogical = breakdown.logicalAnd + breakdown.logicalOr;
      contributors.push(`${totalLogical} logical operator(s)`);
    }
    if (breakdown.catchClauses > 0) {
      contributors.push(`${breakdown.catchClauses} catch clause(s)`);
    }
    if (breakdown.recursiveCalls > 0) {
      contributors.push(`${breakdown.recursiveCalls} recursive call(s)`);
    }

    if (contributors.length > 0) {
      parts.push(`Contributing factors: ${contributors.join(', ')}`);
    }

    if (breakdown.nestedDepth > 2) {
      parts.push(`Maximum nesting depth: ${breakdown.nestedDepth}`);
    }

    return parts.join('. ');
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(
    complexity: number,
    breakdown: ComplexityBreakdown,
    func: ExtractedFunction
  ): string[] {
    const suggestions: string[] = [];

    if (complexity <= this.options.thresholds.low) {
      return ['Complexity is low - no changes needed'];
    }

    // Deep nesting
    if (breakdown.nestedDepth > 3) {
      suggestions.push(
        'Reduce nesting depth by extracting nested logic into separate functions'
      );
    }

    // Many if statements
    if (breakdown.ifStatements > 5) {
      suggestions.push(
        'Consider using a strategy pattern or lookup table instead of multiple if statements'
      );
    }

    // Many switch cases
    if (breakdown.switchCases > 5) {
      suggestions.push(
        'Consider using polymorphism or a map/dictionary instead of large switch statements'
      );
    }

    // Multiple loops
    if (
      breakdown.forLoops +
      breakdown.forInLoops +
      breakdown.forOfLoops +
      breakdown.whileLoops +
      breakdown.doWhileLoops > 2
    ) {
      suggestions.push(
        'Consider extracting loop logic into helper functions or using higher-order array methods'
      );
    }

    // Many ternary expressions
    if (breakdown.ternaryExpressions > 3) {
      suggestions.push(
        'Replace complex ternary expressions with if statements or extract into named functions'
      );
    }

    // Many logical operators
    if (breakdown.logicalAnd + breakdown.logicalOr > 4) {
      suggestions.push(
        'Extract complex boolean expressions into well-named boolean variables or functions'
      );
    }

    // Recursion
    if (breakdown.recursiveCalls > 0 && complexity > 10) {
      suggestions.push(
        'Consider converting recursive logic to iterative approach for better testability'
      );
    }

    // Many catch clauses
    if (breakdown.catchClauses > 2) {
      suggestions.push(
        'Consider consolidating error handling or using a centralized error handler'
      );
    }

    // General high complexity
    if (complexity > this.options.thresholds.high) {
      suggestions.push(
        'Function is too complex - consider breaking it into smaller, focused functions'
      );
      suggestions.push(
        `Target complexity below ${this.options.thresholds.moderate} for better testability`
      );
    }

    // Long function
    const lines = func.sourceCode.split('\n').length;
    if (lines > 50) {
      suggestions.push(
        `Function is ${lines} lines long - aim for functions under 30 lines`
      );
    }

    return suggestions;
  }

  /**
   * Initialize empty breakdown
   */
  private initializeBreakdown(): ComplexityBreakdown {
    return {
      ifStatements: 0,
      elseStatements: 0,
      switchCases: 0,
      forLoops: 0,
      whileLoops: 0,
      doWhileLoops: 0,
      forInLoops: 0,
      forOfLoops: 0,
      ternaryExpressions: 0,
      logicalAnd: 0,
      logicalOr: 0,
      nullCoalescing: 0,
      optionalChaining: 0,
      catchClauses: 0,
      recursiveCalls: 0,
      nestedDepth: 0,
    };
  }

  /**
   * Get complexity for multiple functions with ranking
   */
  calculateForFunctions(
    functions: ExtractedFunction[]
  ): Array<{ func: ExtractedFunction; result: ComplexityResult }> {
    const results = functions.map((func) => ({
      func,
      result: this.calculate(func),
    }));

    // Sort by complexity (highest first)
    results.sort((a, b) => b.result.cyclomaticComplexity - a.result.cyclomaticComplexity);

    return results;
  }

  /**
   * Get summary statistics for a set of functions
   */
  getSummary(
    results: Array<{ func: ExtractedFunction; result: ComplexityResult }>
  ): ComplexitySummary {
    if (results.length === 0) {
      return {
        totalFunctions: 0,
        averageComplexity: 0,
        maxComplexity: 0,
        minComplexity: 0,
        medianComplexity: 0,
        byCategory: {
          low: 0,
          moderate: 0,
          high: 0,
          'very-high': 0,
        },
        hotspots: [],
      };
    }

    const complexities = results.map((r) => r.result.cyclomaticComplexity);
    const sorted = [...complexities].sort((a, b) => a - b);

    return {
      totalFunctions: results.length,
      averageComplexity:
        complexities.reduce((a, b) => a + b, 0) / complexities.length,
      maxComplexity: Math.max(...complexities),
      minComplexity: Math.min(...complexities),
      medianComplexity: sorted[Math.floor(sorted.length / 2)],
      byCategory: {
        low: results.filter((r) => r.result.category === 'low').length,
        moderate: results.filter((r) => r.result.category === 'moderate').length,
        high: results.filter((r) => r.result.category === 'high').length,
        'very-high': results.filter((r) => r.result.category === 'very-high')
          .length,
      },
      hotspots: results
        .filter(
          (r) =>
            r.result.category === 'high' || r.result.category === 'very-high'
        )
        .slice(0, 5)
        .map((r) => ({
          name: r.func.qualifiedName,
          complexity: r.result.cyclomaticComplexity,
          line: r.func.start.line,
        })),
    };
  }
}

/**
 * Summary statistics for complexity analysis
 */
export interface ComplexitySummary {
  totalFunctions: number;
  averageComplexity: number;
  maxComplexity: number;
  minComplexity: number;
  medianComplexity: number;
  byCategory: Record<ComplexityCategory, number>;
  hotspots: Array<{
    name: string;
    complexity: number;
    line: number;
  }>;
}
