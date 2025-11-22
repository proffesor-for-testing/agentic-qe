/**
 * Base Evaluator Interface
 *
 * Defines the contract for all clause evaluators in the constitution framework.
 * Evaluators analyze code/data against constitution rules and return evaluation results.
 *
 * @module constitution/evaluators/base
 * @version 1.0.0
 */

import type { RuleCondition, ConditionOperator } from '../schema';

/**
 * Check types supported by evaluators
 */
export type CheckType =
  | 'ast'           // Abstract Syntax Tree analysis
  | 'metric'        // Quantitative metric calculation
  | 'pattern'       // Regex pattern matching
  | 'semantic';     // LLM-based semantic understanding

/**
 * Evaluation context providing data for checks
 */
export interface EvaluationContext {
  /** Source code to evaluate */
  sourceCode?: string;
  /** File path being evaluated */
  filePath?: string;
  /** Programming language */
  language?: string;
  /** Pre-calculated metrics */
  metrics?: Record<string, number>;
  /** Additional context data */
  data?: Record<string, unknown>;
}

/**
 * Result of a single check evaluation
 */
export interface CheckResult {
  /** Whether the check passed */
  passed: boolean;
  /** Actual value found */
  actualValue: unknown;
  /** Expected value from condition */
  expectedValue: unknown;
  /** Operator used for comparison */
  operator: ConditionOperator;
  /** Field that was checked */
  field: string;
  /** Optional message */
  message?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for an evaluator
 */
export interface EvaluatorConfig {
  /** Evaluator type */
  type: CheckType;
  /** Enabled state */
  enabled?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Custom configuration */
  options?: Record<string, unknown>;
}

/**
 * Base evaluator interface
 */
export interface IEvaluator {
  /** Evaluator type */
  readonly type: CheckType;

  /**
   * Check if this evaluator can handle the given condition
   * @param condition - Rule condition to check
   * @returns True if evaluator can handle this condition
   */
  canHandle(condition: RuleCondition): boolean;

  /**
   * Evaluate a condition against the context
   * @param condition - Rule condition to evaluate
   * @param context - Evaluation context with source code/data
   * @returns Check result
   */
  evaluate(condition: RuleCondition, context: EvaluationContext): Promise<CheckResult>;

  /**
   * Initialize the evaluator with configuration
   * @param config - Evaluator configuration
   */
  initialize?(config: EvaluatorConfig): Promise<void>;

  /**
   * Clean up resources
   */
  dispose?(): Promise<void>;
}

/**
 * Abstract base class for evaluators
 */
export abstract class BaseEvaluator implements IEvaluator {
  abstract readonly type: CheckType;
  protected config?: EvaluatorConfig;

  abstract canHandle(condition: RuleCondition): boolean;
  abstract evaluate(condition: RuleCondition, context: EvaluationContext): Promise<CheckResult>;

  async initialize(config: EvaluatorConfig): Promise<void> {
    this.config = config;
  }

  async dispose(): Promise<void> {
    // Base implementation does nothing
  }

  /**
   * Helper to compare values using operator
   * @param actual - Actual value
   * @param operator - Comparison operator
   * @param expected - Expected value
   * @returns True if comparison passes
   */
  protected compareValues(
    actual: unknown,
    operator: ConditionOperator,
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'greater_than':
        return typeof actual === 'number' && typeof expected === 'number'
          ? actual > expected
          : false;
      case 'less_than':
        return typeof actual === 'number' && typeof expected === 'number'
          ? actual < expected
          : false;
      case 'greater_than_or_equal':
        return typeof actual === 'number' && typeof expected === 'number'
          ? actual >= expected
          : false;
      case 'less_than_or_equal':
        return typeof actual === 'number' && typeof expected === 'number'
          ? actual <= expected
          : false;
      case 'contains':
        return typeof actual === 'string' && typeof expected === 'string'
          ? actual.includes(expected)
          : Array.isArray(actual)
            ? actual.includes(expected)
            : false;
      case 'not_contains':
        return typeof actual === 'string' && typeof expected === 'string'
          ? !actual.includes(expected)
          : Array.isArray(actual)
            ? !actual.includes(expected)
            : true;
      case 'matches':
        if (typeof actual === 'string' && typeof expected === 'string') {
          try {
            const regex = new RegExp(expected);
            return regex.test(actual);
          } catch {
            return false;
          }
        }
        return false;
      case 'in':
        return Array.isArray(expected)
          ? expected.includes(actual as string | number)
          : false;
      case 'not_in':
        return Array.isArray(expected)
          ? !expected.includes(actual as string | number)
          : true;
      case 'exists':
        return actual !== null && actual !== undefined;
      case 'not_exists':
        return actual === null || actual === undefined;
      default:
        return false;
    }
  }

  /**
   * Create a check result
   * @param passed - Whether check passed
   * @param field - Field checked
   * @param actual - Actual value
   * @param expected - Expected value
   * @param operator - Operator used
   * @param message - Optional message
   * @returns Check result
   */
  protected createResult(
    passed: boolean,
    field: string,
    actual: unknown,
    expected: unknown,
    operator: ConditionOperator,
    message?: string
  ): CheckResult {
    return {
      passed,
      actualValue: actual,
      expectedValue: expected,
      operator,
      field,
      message,
    };
  }
}

/**
 * Factory for creating evaluators
 */
export class EvaluatorFactory {
  private static evaluators = new Map<CheckType, () => IEvaluator>();

  /**
   * Register an evaluator type
   * @param type - Check type
   * @param factory - Factory function to create evaluator
   */
  static register(type: CheckType, factory: () => IEvaluator): void {
    this.evaluators.set(type, factory);
  }

  /**
   * Create an evaluator for the given type
   * @param type - Check type
   * @returns Evaluator instance or null if not found
   */
  static create(type: CheckType): IEvaluator | null {
    const factory = this.evaluators.get(type);
    return factory ? factory() : null;
  }

  /**
   * Get all registered evaluator types
   * @returns Array of check types
   */
  static getTypes(): CheckType[] {
    return Array.from(this.evaluators.keys());
  }
}
