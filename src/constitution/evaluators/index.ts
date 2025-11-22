/**
 * Constitution Evaluators
 *
 * Exports all evaluator types and factory for creating evaluators.
 * Provides a unified interface for evaluating constitution rules.
 *
 * @module constitution/evaluators
 * @version 1.0.0
 */

export * from './base';
export { ASTEvaluator } from './ast-evaluator';
export { MetricEvaluator } from './metric-evaluator';
export { PatternEvaluator, CustomPatternEvaluator } from './pattern-evaluator';
export { SemanticEvaluator } from './semantic-evaluator';

import { EvaluatorFactory } from './base';
import { ASTEvaluator } from './ast-evaluator';
import { MetricEvaluator } from './metric-evaluator';
import { PatternEvaluator } from './pattern-evaluator';
import { SemanticEvaluator } from './semantic-evaluator';

/**
 * Register all built-in evaluators
 */
export function registerBuiltInEvaluators(): void {
  EvaluatorFactory.register('ast', () => new ASTEvaluator());
  EvaluatorFactory.register('metric', () => new MetricEvaluator());
  EvaluatorFactory.register('pattern', () => new PatternEvaluator());
  EvaluatorFactory.register('semantic', () => new SemanticEvaluator());
}

/**
 * Initialize evaluator factory with all built-in evaluators
 */
registerBuiltInEvaluators();
