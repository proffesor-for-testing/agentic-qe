/**
 * AST Evaluator
 *
 * Analyzes code structure using Abstract Syntax Tree parsing.
 * Calculates metrics like cyclomatic complexity, function length, cognitive complexity.
 * Uses @babel/parser for JavaScript/TypeScript analysis.
 *
 * @module constitution/evaluators/ast-evaluator
 * @version 1.0.0
 */

import { parse, type ParseResult } from '@babel/parser';
import traverse, { type NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { RuleCondition } from '../schema';
import { BaseEvaluator, type CheckResult, type EvaluationContext } from './base';

/**
 * AST-based code metrics
 */
interface ASTMetrics {
  /** Cyclomatic complexity */
  cyclomaticComplexity: number;
  /** Cognitive complexity */
  cognitiveComplexity: number;
  /** Function length in lines */
  functionLines: number;
  /** File length in lines */
  fileLines: number;
  /** Number of functions */
  functionCount: number;
  /** Maximum nesting depth */
  maxNestingDepth: number;
  /** Number of parameters */
  parameterCount: number;
}

/**
 * Fields that AST evaluator can check
 */
const AST_FIELDS = new Set([
  'cyclomatic_complexity',
  'cognitive_complexity',
  'function_lines',
  'file_lines',
  'function_count',
  'max_nesting_depth',
  'parameter_count',
  'nesting_depth',
]);

/**
 * AST Evaluator for structural code analysis
 */
export class ASTEvaluator extends BaseEvaluator {
  readonly type = 'ast' as const;

  canHandle(condition: RuleCondition): boolean {
    return AST_FIELDS.has(condition.field);
  }

  async evaluate(condition: RuleCondition, context: EvaluationContext): Promise<CheckResult> {
    if (!context.sourceCode) {
      return this.createResult(
        false,
        condition.field,
        null,
        condition.value,
        condition.operator,
        'No source code provided for AST analysis'
      );
    }

    try {
      // Parse source code to AST
      const ast = this.parseCode(context.sourceCode, context.language);

      // Calculate metrics
      const metrics = this.calculateMetrics(ast, context.sourceCode);

      // Get the requested metric value
      const actualValue = this.getMetricValue(condition.field, metrics);

      // Compare against expected value
      const passed = this.compareValues(actualValue, condition.operator, condition.value);

      return this.createResult(
        passed,
        condition.field,
        actualValue,
        condition.value,
        condition.operator
      );
    } catch (error) {
      return this.createResult(
        false,
        condition.field,
        null,
        condition.value,
        condition.operator,
        `AST analysis failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse source code to AST
   * @param code - Source code
   * @param language - Programming language
   * @returns Parsed AST
   */
  private parseCode(code: string, language: string = 'typescript'): ParseResult<t.File> {
    const isTypeScript = language === 'typescript' || language === 'tsx';

    return parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        ...(isTypeScript ? ['typescript' as const] : []),
        'decorators-legacy',
        'classProperties',
        'objectRestSpread',
        'asyncGenerators',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    });
  }

  /**
   * Calculate AST metrics
   * @param ast - Parsed AST
   * @param sourceCode - Original source code
   * @returns Calculated metrics
   */
  private calculateMetrics(ast: ParseResult<t.File>, sourceCode: string): ASTMetrics {
    const metrics: ASTMetrics = {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 0,
      functionLines: 0,
      fileLines: sourceCode.split('\n').length,
      functionCount: 0,
      maxNestingDepth: 0,
      parameterCount: 0,
    };

    let currentNestingDepth = 0;
    let maxFunctionLines = 0;
    let maxCyclomaticComplexity = 1;
    let maxCognitiveComplexity = 0;
    let maxParameterCount = 0;

    traverse(ast, {
      Function: {
        enter(path: NodePath<t.Function>) {
          metrics.functionCount++;
          currentNestingDepth++;

          // Calculate function length
          const { start, end } = path.node.loc || { start: { line: 0 }, end: { line: 0 } };
          const functionLines = end.line - start.line + 1;
          maxFunctionLines = Math.max(maxFunctionLines, functionLines);

          // Calculate cyclomatic complexity for this function
          const complexity = calculateCyclomaticComplexity(path);
          maxCyclomaticComplexity = Math.max(maxCyclomaticComplexity, complexity);

          // Calculate cognitive complexity for this function
          const cognitiveComplexity = calculateCognitiveComplexity(path);
          maxCognitiveComplexity = Math.max(maxCognitiveComplexity, cognitiveComplexity);

          // Count parameters
          const paramCount = path.node.params.length;
          maxParameterCount = Math.max(maxParameterCount, paramCount);
        },
        exit() {
          currentNestingDepth--;
        },
      },

      BlockStatement: {
        enter() {
          currentNestingDepth++;
          metrics.maxNestingDepth = Math.max(metrics.maxNestingDepth, currentNestingDepth);
        },
        exit() {
          currentNestingDepth--;
        },
      },
    });

    metrics.functionLines = maxFunctionLines;
    metrics.cyclomaticComplexity = maxCyclomaticComplexity;
    metrics.cognitiveComplexity = maxCognitiveComplexity;
    metrics.parameterCount = maxParameterCount;

    return metrics;
  }

  /**
   * Get metric value by field name
   * @param field - Field name
   * @param metrics - Calculated metrics
   * @returns Metric value
   */
  private getMetricValue(field: string, metrics: ASTMetrics): number {
    switch (field) {
      case 'cyclomatic_complexity':
        return metrics.cyclomaticComplexity;
      case 'cognitive_complexity':
        return metrics.cognitiveComplexity;
      case 'function_lines':
        return metrics.functionLines;
      case 'file_lines':
        return metrics.fileLines;
      case 'function_count':
        return metrics.functionCount;
      case 'max_nesting_depth':
      case 'nesting_depth':
        return metrics.maxNestingDepth;
      case 'parameter_count':
        return metrics.parameterCount;
      default:
        return 0;
    }
  }
}

/**
 * Calculate cyclomatic complexity for a function
 * @param path - Function AST path
 * @returns Cyclomatic complexity
 */
function calculateCyclomaticComplexity(path: NodePath<t.Function>): number {
  let complexity = 1; // Start at 1

  path.traverse({
    IfStatement() { complexity++; },
    ConditionalExpression() { complexity++; },
    LogicalExpression(logicalPath) {
      if (logicalPath.node.operator === '||' || logicalPath.node.operator === '&&') {
        complexity++;
      }
    },
    ForStatement() { complexity++; },
    ForInStatement() { complexity++; },
    ForOfStatement() { complexity++; },
    WhileStatement() { complexity++; },
    DoWhileStatement() { complexity++; },
    SwitchCase(casePath) {
      if (casePath.node.test !== null) { // Don't count default case
        complexity++;
      }
    },
    CatchClause() { complexity++; },
  });

  return complexity;
}

/**
 * Calculate cognitive complexity for a function
 * Cognitive complexity penalizes nested control structures more heavily
 * @param path - Function AST path
 * @returns Cognitive complexity
 */
function calculateCognitiveComplexity(path: NodePath<t.Function>): number {
  let complexity = 0;
  let nestingLevel = 0;

  path.traverse({
    IfStatement: {
      enter() {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      },
      exit() {
        nestingLevel--;
      },
    },

    ConditionalExpression: {
      enter() {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      },
      exit() {
        nestingLevel--;
      },
    },

    SwitchStatement: {
      enter() {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      },
      exit() {
        nestingLevel--;
      },
    },

    ForStatement: {
      enter() {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      },
      exit() {
        nestingLevel--;
      },
    },

    ForInStatement: {
      enter() {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      },
      exit() {
        nestingLevel--;
      },
    },

    ForOfStatement: {
      enter() {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      },
      exit() {
        nestingLevel--;
      },
    },

    WhileStatement: {
      enter() {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      },
      exit() {
        nestingLevel--;
      },
    },

    DoWhileStatement: {
      enter() {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      },
      exit() {
        nestingLevel--;
      },
    },

    CatchClause: {
      enter() {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      },
      exit() {
        nestingLevel--;
      },
    },

    LogicalExpression(logicalPath) {
      if (logicalPath.node.operator === '&&' || logicalPath.node.operator === '||') {
        complexity += 1;
      }
    },
  });

  return complexity;
}
