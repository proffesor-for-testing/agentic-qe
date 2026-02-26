/**
 * Gradient-Free Tuning Algorithm
 * ADR-024: Self-Optimization Engine
 *
 * Implements a gradient-free optimization algorithm for parameter tuning.
 * Uses a combination of coordinate descent and random exploration.
 */

import type {
  TunableParameter,
  NumericTunableParameter,
  CategoricalTunableParameter,
  TuningConfig,
  EvaluationResult,
  ParameterSuggestion,
  MetricStats,
} from './types.js';
import { secureRandom, secureRandomInt, secureRandomShuffle } from '../shared/utils/crypto-random.js';

// ============================================================================
// Tuning Algorithm Interface
// ============================================================================

/**
 * Interface for tuning algorithms
 */
export interface TuningAlgorithm {
  /**
   * Generate next parameter configuration to evaluate
   */
  suggestNextConfiguration(
    parameters: TunableParameter[],
    history: EvaluationResult[],
    config: TuningConfig
  ): Record<string, number | string>;

  /**
   * Generate improvement suggestions based on evaluation history
   */
  generateSuggestions(
    parameters: TunableParameter[],
    history: EvaluationResult[],
    metricStats: Map<string, MetricStats>
  ): ParameterSuggestion[];

  /**
   * Calculate score for a configuration
   */
  calculateScore(
    parameters: TunableParameter[],
    metricValues: Record<string, number>
  ): number;
}

// ============================================================================
// Coordinate Descent with Exploration Algorithm
// ============================================================================

/**
 * Gradient-free tuning using coordinate descent with random exploration
 *
 * Strategy:
 * 1. With probability (1 - explorationRate): Exploit by moving toward better configurations
 * 2. With probability explorationRate: Explore by trying random perturbations
 * 3. Evaluate and update best known configuration
 */
export class CoordinateDescentTuner implements TuningAlgorithm {
  private bestConfiguration: Record<string, number | string> | null = null;
  private bestScore = -Infinity;
  private currentParameterIndex = 0;
  private currentDirection = 1; // 1 or -1
  private stepsWithoutImprovement = 0;

  /**
   * Suggest next configuration to evaluate
   */
  suggestNextConfiguration(
    parameters: TunableParameter[],
    history: EvaluationResult[],
    config: TuningConfig
  ): Record<string, number | string> {
    // Initialize best configuration from current values
    if (!this.bestConfiguration) {
      this.bestConfiguration = {};
      for (const param of parameters) {
        this.bestConfiguration[param.name] = param.current;
      }
    }

    // Update best from history
    if (history.length > 0) {
      const latest = history[history.length - 1];
      if (latest.overallScore > this.bestScore) {
        this.bestScore = latest.overallScore;
        this.bestConfiguration = { ...latest.parameterValues };
        this.stepsWithoutImprovement = 0;
      } else {
        this.stepsWithoutImprovement++;
      }
    }

    // Reset direction if stuck
    if (this.stepsWithoutImprovement > parameters.length * 2) {
      this.currentDirection *= -1;
      this.stepsWithoutImprovement = 0;
    }

    // Decide: explore or exploit
    const shouldExplore = secureRandom() < config.explorationRate;

    if (shouldExplore) {
      return this.generateExploratoryConfiguration(parameters, config);
    } else {
      return this.generateExploitConfiguration(parameters, config);
    }
  }

  /**
   * Generate a configuration by perturbing current best along one dimension
   */
  private generateExploitConfiguration(
    parameters: TunableParameter[],
    config: TuningConfig
  ): Record<string, number | string> {
    const result = { ...this.bestConfiguration! };
    const enabledParams = parameters.filter(p => p.enabled);

    if (enabledParams.length === 0) {
      return result;
    }

    // Move to next parameter (coordinate descent)
    this.currentParameterIndex = (this.currentParameterIndex + 1) % enabledParams.length;
    const param = enabledParams[this.currentParameterIndex];

    // Perturb this parameter
    result[param.name] = this.perturbParameter(param, config.maxChangePerCycle, this.currentDirection);

    return result;
  }

  /**
   * Generate a random exploratory configuration
   */
  private generateExploratoryConfiguration(
    parameters: TunableParameter[],
    config: TuningConfig
  ): Record<string, number | string> {
    const result = { ...this.bestConfiguration! };
    const enabledParams = parameters.filter(p => p.enabled);

    // Randomly perturb 1-3 parameters
    const numToPerturb = Math.min(1 + secureRandomInt(0, 3), enabledParams.length);
    const toPerturb = secureRandomShuffle([...enabledParams]).slice(0, numToPerturb);

    for (const param of toPerturb) {
      const direction = secureRandom() < 0.5 ? -1 : 1;
      result[param.name] = this.perturbParameter(param, config.maxChangePerCycle, direction);
    }

    return result;
  }

  /**
   * Perturb a single parameter
   */
  private perturbParameter(
    param: TunableParameter,
    maxChange: number,
    direction: number
  ): number | string {
    if (param.type === 'numeric') {
      return this.perturbNumeric(param, maxChange, direction);
    } else {
      return this.perturbCategorical(param, direction);
    }
  }

  /**
   * Perturb a numeric parameter
   */
  private perturbNumeric(
    param: NumericTunableParameter,
    maxChange: number,
    direction: number
  ): number {
    const range = param.max - param.min;
    const step = param.step || (range / 20);

    // Calculate perturbation
    const maxDelta = range * maxChange;
    const delta = direction * Math.min(step + secureRandom() * step, maxDelta);

    // Apply and clamp
    let newValue = param.current + delta;
    newValue = Math.max(param.min, Math.min(param.max, newValue));

    // Snap to step if defined
    if (param.step) {
      newValue = Math.round(newValue / param.step) * param.step;
    }

    return newValue;
  }

  /**
   * Perturb a categorical parameter
   */
  private perturbCategorical(
    param: CategoricalTunableParameter,
    direction: number
  ): string {
    const currentIndex = param.options.indexOf(param.current);
    let newIndex = currentIndex + direction;

    // Wrap around
    if (newIndex < 0) newIndex = param.options.length - 1;
    if (newIndex >= param.options.length) newIndex = 0;

    return param.options[newIndex];
  }

  /**
   * Generate improvement suggestions
   */
  generateSuggestions(
    parameters: TunableParameter[],
    history: EvaluationResult[],
    metricStats: Map<string, MetricStats>
  ): ParameterSuggestion[] {
    const suggestions: ParameterSuggestion[] = [];

    if (history.length < 5) {
      return suggestions;
    }

    // Analyze each parameter
    for (const param of parameters.filter(p => p.enabled)) {
      const suggestion = this.analyzeParameter(param, history, metricStats);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    // Sort by expected improvement
    return suggestions.sort((a, b) => b.expectedImprovement - a.expectedImprovement);
  }

  /**
   * Analyze a parameter and suggest improvements
   */
  private analyzeParameter(
    param: TunableParameter,
    history: EvaluationResult[],
    metricStats: Map<string, MetricStats>
  ): ParameterSuggestion | null {
    const metricStat = metricStats.get(param.metric);
    if (!metricStat) return null;

    // Check if we're meeting the target
    const currentMetricValue = metricStat.mean;
    const distanceFromTarget = param.higherIsBetter
      ? param.target - currentMetricValue
      : currentMetricValue - param.target;

    if (distanceFromTarget <= 0) {
      // Already meeting target
      return null;
    }

    // Find correlation between parameter values and metric
    const correlation = this.calculateCorrelation(param, history);

    // Suggest direction based on correlation and target
    let suggestedValue: number | string;
    let reasoning: string;

    if (param.type === 'numeric') {
      const direction = (correlation > 0 === param.higherIsBetter) ? 1 : -1;
      const step = param.step || ((param.max - param.min) / 10);
      suggestedValue = Math.max(
        param.min,
        Math.min(param.max, param.current + direction * step * 2)
      );
      reasoning = `Metric ${param.metric} is ${distanceFromTarget.toFixed(3)} from target. ` +
        `Correlation with parameter: ${correlation.toFixed(3)}. ` +
        `Suggesting ${direction > 0 ? 'increase' : 'decrease'} based on historical data.`;
    } else {
      // For categorical, suggest the next option
      const currentIndex = param.options.indexOf(param.current);
      const nextIndex = (currentIndex + 1) % param.options.length;
      suggestedValue = param.options[nextIndex];
      reasoning = `Metric ${param.metric} is ${distanceFromTarget.toFixed(3)} from target. ` +
        `Suggesting trying '${suggestedValue}' as an alternative.`;
    }

    return {
      parameterName: param.name,
      currentValue: param.current,
      suggestedValue,
      expectedImprovement: Math.abs(correlation) * distanceFromTarget * param.weight,
      confidence: Math.min(0.9, Math.abs(correlation) + (history.length / 100)),
      reasoning,
    };
  }

  /**
   * Calculate correlation between parameter values and metric in history
   */
  private calculateCorrelation(
    param: TunableParameter,
    history: EvaluationResult[]
  ): number {
    if (param.type === 'categorical') {
      // For categorical, return weak correlation
      return 0.1;
    }

    const values = history.map(h => ({
      param: h.parameterValues[param.name] as number,
      metric: h.metricValues[param.metric] || 0,
    }));

    if (values.length < 3) return 0;

    // Calculate Pearson correlation
    const n = values.length;
    const sumX = values.reduce((a, v) => a + v.param, 0);
    const sumY = values.reduce((a, v) => a + v.metric, 0);
    const sumXY = values.reduce((a, v) => a + v.param * v.metric, 0);
    const sumX2 = values.reduce((a, v) => a + v.param * v.param, 0);
    const sumY2 = values.reduce((a, v) => a + v.metric * v.metric, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  /**
   * Calculate score for a configuration
   */
  calculateScore(
    parameters: TunableParameter[],
    metricValues: Record<string, number>
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const param of parameters.filter(p => p.enabled)) {
      const metricValue = metricValues[param.metric];
      if (metricValue === undefined) continue;

      // Normalize metric value relative to target
      let normalizedScore: number;
      if (param.higherIsBetter) {
        // Higher is better: score = value / target (capped at 1.0 for exceeding target)
        normalizedScore = Math.min(1.0, metricValue / param.target);
      } else {
        // Lower is better: score = target / value (capped at 1.0 for meeting target)
        normalizedScore = metricValue <= param.target ? 1.0 : param.target / metricValue;
      }

      totalScore += normalizedScore * param.weight;
      totalWeight += param.weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffleArray<T>(array: T[]): T[] {
    return secureRandomShuffle(array);
  }

  /**
   * Reset the algorithm state
   */
  reset(): void {
    this.bestConfiguration = null;
    this.bestScore = -Infinity;
    this.currentParameterIndex = 0;
    this.currentDirection = 1;
    this.stepsWithoutImprovement = 0;
  }
}

/**
 * Create the default tuning algorithm
 */
export function createTuningAlgorithm(): TuningAlgorithm {
  return new CoordinateDescentTuner();
}
