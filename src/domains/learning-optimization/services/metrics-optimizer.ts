/**
 * Agentic QE v3 - Metrics Optimizer Service
 * Optimizes strategies and metrics across QE operations
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainName } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { toError } from '../../../shared/error-utils.js';
import { secureRandom } from '../../../shared/utils/crypto-random.js';
import {
  Strategy,
  OptimizedStrategy,
  OptimizationObjective,
  ValidationResult,
  ABTestConfig,
  ABTestResult,
  StrategyEvaluation,
  Experience,
  PatternContext,
  IStrategyOptimizerService,
} from '../interfaces.js';

/**
 * Configuration for the metrics optimizer
 */
export interface MetricsOptimizerConfig {
  defaultConfidenceLevel: number;
  minSamplesForOptimization: number;
  maxOptimizationIterations: number;
  improvementThreshold: number;
  explorationRate: number;
}

const DEFAULT_CONFIG: MetricsOptimizerConfig = {
  defaultConfidenceLevel: 0.95,
  minSamplesForOptimization: 20,
  maxOptimizationIterations: 100,
  improvementThreshold: 0.05,
  explorationRate: 0.1,
};

/**
 * SEC-003: Dangerous keys that could lead to prototype pollution
 */
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Check if a key is safe from prototype pollution
 */
function isSafeKey(key: string): boolean {
  return !DANGEROUS_KEYS.includes(key);
}

/**
 * Metrics tracking for optimization
 */
export interface MetricsSnapshot {
  readonly strategyId: string;
  readonly metrics: Record<string, number>;
  readonly timestamp: Date;
  readonly samples: number;
}

/**
 * Metrics Optimizer Service
 * Implements strategy optimization using various techniques
 */
export class MetricsOptimizerService implements IStrategyOptimizerService {
  private readonly config: MetricsOptimizerConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<MetricsOptimizerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // IStrategyOptimizerService Implementation
  // ============================================================================

  /**
   * Optimize a strategy for a given objective
   */
  async optimizeStrategy(
    currentStrategy: Strategy,
    objective: OptimizationObjective,
    experiences: Experience[]
  ): Promise<Result<OptimizedStrategy>> {
    try {
      if (experiences.length < this.config.minSamplesForOptimization) {
        return err(
          new Error(
            `Need at least ${this.config.minSamplesForOptimization} experiences for optimization`
          )
        );
      }

      // Calculate current performance
      const currentPerformance = this.evaluateStrategyPerformance(
        currentStrategy,
        experiences,
        objective
      );

      // Generate optimized parameters
      const optimizedParameters = await this.optimizeParameters(
        currentStrategy.parameters,
        experiences,
        objective
      );

      // Create optimized strategy
      const optimizedStrategy: Strategy = {
        name: `${currentStrategy.name}-optimized`,
        parameters: optimizedParameters,
        expectedOutcome: this.predictOutcome(optimizedParameters, experiences),
      };

      // Validate optimization
      const validationResults = await this.validateOptimization(
        currentStrategy,
        optimizedStrategy,
        experiences.slice(-10) // Use recent experiences for validation
      );

      // Calculate improvement
      const optimizedPerformance = this.evaluateStrategyPerformance(
        optimizedStrategy,
        experiences,
        objective
      );
      const improvement = this.calculateImprovement(
        currentPerformance,
        optimizedPerformance,
        objective
      );

      // Calculate confidence
      const confidence = this.calculateOptimizationConfidence(
        experiences.length,
        improvement,
        validationResults
      );

      const domain = this.inferDomainFromExperiences(experiences);

      const result: OptimizedStrategy = {
        id: uuidv4(),
        domain,
        objective,
        currentStrategy,
        optimizedStrategy,
        improvement,
        confidence,
        validationResults,
      };

      // Store optimization result
      await this.storeOptimizationResult(result);

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Run A/B test between two strategies
   */
  async runABTest(
    strategyA: Strategy,
    strategyB: Strategy,
    testConfig: ABTestConfig
  ): Promise<Result<ABTestResult>> {
    try {
      // Simulate or retrieve test results
      const metricsA = await this.collectStrategyMetrics(
        strategyA,
        testConfig.metric,
        testConfig.minSamples
      );
      const metricsB = await this.collectStrategyMetrics(
        strategyB,
        testConfig.metric,
        testConfig.minSamples
      );

      // Calculate statistics
      const meanA = this.calculateMean(metricsA);
      const meanB = this.calculateMean(metricsB);
      const stdA = this.calculateStdDev(metricsA);
      const stdB = this.calculateStdDev(metricsB);

      // Calculate p-value using Welch's t-test approximation
      const pValue = this.calculatePValue(metricsA, metricsB);

      // Determine winner
      let winner: 'A' | 'B' | 'inconclusive';
      if (pValue < 1 - testConfig.confidenceLevel) {
        winner = meanA > meanB ? 'A' : 'B';
      } else {
        winner = 'inconclusive';
      }

      const result: ABTestResult = {
        winner,
        strategyAMetrics: {
          [testConfig.metric]: meanA,
          stdDev: stdA,
          samples: metricsA.length,
        },
        strategyBMetrics: {
          [testConfig.metric]: meanB,
          stdDev: stdB,
          samples: metricsB.length,
        },
        pValue,
        sampleSizeA: metricsA.length,
        sampleSizeB: metricsB.length,
      };

      // Store test result
      await this.storeABTestResult(strategyA, strategyB, result);

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Recommend a strategy based on context
   */
  async recommendStrategy(context: PatternContext): Promise<Result<Strategy>> {
    try {
      // Search for strategies that worked well in similar contexts
      const keys = await this.memory.search('learning:strategy:optimized:*', 100);
      const candidates: Array<{ strategy: Strategy; score: number }> = [];

      for (const key of keys) {
        const optimized = await this.memory.get<OptimizedStrategy>(key);
        if (optimized && optimized.confidence > 0.6) {
          const contextScore = this.scoreContextMatch(optimized, context);
          const performanceScore = optimized.improvement * optimized.confidence;
          candidates.push({
            strategy: optimized.optimizedStrategy,
            score: contextScore * 0.4 + performanceScore * 0.6,
          });
        }
      }

      if (candidates.length === 0) {
        // Return default strategy
        return ok({
          name: 'default-strategy',
          parameters: this.getDefaultParameters(context),
          expectedOutcome: { success_rate: 0.7 },
        });
      }

      // Sort by score and return best
      candidates.sort((a, b) => b.score - a.score);
      return ok(candidates[0].strategy);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Evaluate strategy performance
   */
  async evaluateStrategy(
    strategy: Strategy,
    experiences: Experience[]
  ): Promise<Result<StrategyEvaluation>> {
    try {
      // Calculate metrics
      const metrics: Record<string, number> = {};
      const successRate = this.calculateSuccessRate(experiences);
      const avgDuration = this.calculateAverageDuration(experiences);
      const avgReward = this.calculateAverageReward(experiences);

      metrics['success_rate'] = successRate;
      metrics['avg_duration_ms'] = avgDuration;
      metrics['avg_reward'] = avgReward;

      // Identify strengths
      const strengths: string[] = [];
      if (successRate > 0.8) {
        strengths.push('High success rate');
      }
      if (avgDuration < 5000) {
        strengths.push('Fast execution');
      }
      if (avgReward > 0.7) {
        strengths.push('Consistently good rewards');
      }

      // Identify weaknesses
      const weaknesses: string[] = [];
      if (successRate < 0.5) {
        weaknesses.push('Low success rate needs investigation');
      }
      if (avgDuration > 30000) {
        weaknesses.push('Slow execution time');
      }
      if (avgReward < 0.3) {
        weaknesses.push('Low reward values');
      }

      // Generate improvement areas
      const improvementAreas = this.identifyImprovementAreas(
        strategy,
        metrics,
        experiences
      );

      const evaluation: StrategyEvaluation = {
        strategy,
        metrics,
        strengths,
        weaknesses,
        improvementAreas,
      };

      // Store evaluation
      await this.storeStrategyEvaluation(evaluation);

      return ok(evaluation);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Additional Public Methods
  // ============================================================================

  /**
   * Track metrics for a strategy
   */
  async trackMetrics(
    strategyId: string,
    metrics: Record<string, number>
  ): Promise<Result<void>> {
    try {
      const snapshot: MetricsSnapshot = {
        strategyId,
        metrics,
        timestamp: new Date(),
        samples: 1,
      };

      // Append to metrics history
      const key = `learning:metrics:history:${strategyId}:${Date.now()}`;
      await this.memory.set(key, snapshot, {
        namespace: 'learning-optimization',
        ttl: 86400 * 30,
      });

      // Update aggregated metrics
      await this.updateAggregatedMetrics(strategyId, metrics);

      return ok(undefined);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get metrics history for a strategy
   */
  async getMetricsHistory(
    strategyId: string,
    limit = 100
  ): Promise<Result<MetricsSnapshot[]>> {
    try {
      const keys = await this.memory.search(
        `learning:metrics:history:${strategyId}:*`,
        limit
      );
      const snapshots: MetricsSnapshot[] = [];

      for (const key of keys) {
        const snapshot = await this.memory.get<MetricsSnapshot>(key);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }

      // Sort by timestamp
      snapshots.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      return ok(snapshots);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Calculate optimal parameters using grid search
   */
  async gridSearchOptimize(
    parameterRanges: Record<string, number[]>,
    objective: OptimizationObjective,
    experiences: Experience[]
  ): Promise<Result<Record<string, unknown>>> {
    try {
      const combinations = this.generateParameterCombinations(parameterRanges);
      let bestParams: Record<string, unknown> = {};
      let bestScore = objective.direction === 'maximize' ? -Infinity : Infinity;

      for (const params of combinations) {
        const score = this.scoreParameters(params, experiences, objective);

        const isBetter =
          objective.direction === 'maximize'
            ? score > bestScore
            : score < bestScore;

        if (isBetter) {
          bestScore = score;
          bestParams = params;
        }
      }

      return ok(bestParams);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private evaluateStrategyPerformance(
    _strategy: Strategy,
    experiences: Experience[],
    objective: OptimizationObjective
  ): number {
    let totalScore = 0;
    let count = 0;

    for (const exp of experiences) {
      const metricValue = (exp.result.outcome[objective.metric] as number) ?? 0;
      totalScore += metricValue;
      count++;
    }

    return count > 0 ? totalScore / count : 0;
  }

  private async optimizeParameters(
    currentParams: Record<string, unknown>,
    experiences: Experience[],
    objective: OptimizationObjective
  ): Promise<Record<string, unknown>> {
    const optimized: Record<string, unknown> = { ...currentParams };

    // Simple gradient-free optimization
    for (const [key, value] of Object.entries(currentParams)) {
      // SEC-003: Guard against prototype pollution
      if (!isSafeKey(key)) continue;
      if (typeof value === 'number') {
        // Try small adjustments
        const adjustments = [-0.1, -0.05, 0, 0.05, 0.1];
        let bestAdjustment = 0;
        let bestScore = this.scoreParameters(optimized, experiences, objective);

        for (const adj of adjustments) {
          const testParams = { ...optimized, [key]: value * (1 + adj) };
          const score = this.scoreParameters(testParams, experiences, objective);

          const isBetter =
            objective.direction === 'maximize'
              ? score > bestScore
              : score < bestScore;

          if (isBetter) {
            bestScore = score;
            bestAdjustment = adj;
          }
        }

        optimized[key] = (value as number) * (1 + bestAdjustment);
      }
    }

    return optimized;
  }

  private scoreParameters(
    params: Record<string, unknown>,
    experiences: Experience[],
    objective: OptimizationObjective
  ): number {
    // Score based on how well the parameters align with successful experiences
    let totalScore = 0;
    let totalWeight = 0;

    for (const exp of experiences) {
      const weight = exp.result.success ? 1 : 0.5;
      const similarity = this.calculateParamSimilarity(
        params,
        exp.state.context
      );
      const metricValue = (exp.result.outcome[objective.metric] as number) ?? 0;

      totalScore += similarity * metricValue * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private calculateParamSimilarity(
    params: Record<string, unknown>,
    context: Record<string, unknown>
  ): number {
    let matches = 0;
    let total = 0;

    for (const [key, value] of Object.entries(params)) {
      if (context[key] !== undefined) {
        total++;
        if (typeof value === 'number' && typeof context[key] === 'number') {
          const diff = Math.abs((value as number) - (context[key] as number));
          const maxVal = Math.max(
            Math.abs(value as number),
            Math.abs(context[key] as number),
            1
          );
          matches += 1 - diff / maxVal;
        } else if (value === context[key]) {
          matches++;
        }
      }
    }

    return total > 0 ? matches / total : 0.5;
  }

  private predictOutcome(
    _params: Record<string, unknown>,
    experiences: Experience[]
  ): Record<string, number> {
    const outcome: Record<string, number> = {};
    const metricSums: Record<string, number> = {};
    const metricCounts: Record<string, number> = {};

    for (const exp of experiences) {
      if (exp.result.success) {
        for (const [key, value] of Object.entries(exp.result.outcome)) {
          // SEC-003: Guard against prototype pollution
          if (!isSafeKey(key)) continue;
          if (typeof value === 'number') {
            metricSums[key] = (metricSums[key] || 0) + value;
            metricCounts[key] = (metricCounts[key] || 0) + 1;
          }
        }
      }
    }

    for (const [key, sum] of Object.entries(metricSums)) {
      // SEC-003: Guard against prototype pollution
      if (!isSafeKey(key)) continue;
      outcome[key] = sum / metricCounts[key];
    }

    return outcome;
  }

  private async validateOptimization(
    _current: Strategy,
    optimized: Strategy,
    validationExperiences: Experience[]
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const exp of validationExperiences) {
      const expected = optimized.expectedOutcome;
      const passed = Object.entries(expected).every(([key, value]) => {
        const actual = (exp.result.outcome[key] as number) ?? 0;
        return Math.abs(actual - value) / Math.max(value, 1) < 0.2;
      });

      results.push({
        testId: exp.id,
        passed,
        metrics: exp.state.metrics,
      });
    }

    return results;
  }

  private calculateImprovement(
    currentPerf: number,
    optimizedPerf: number,
    objective: OptimizationObjective
  ): number {
    if (currentPerf === 0) return optimizedPerf > 0 ? 1 : 0;

    const diff = optimizedPerf - currentPerf;
    const improvement =
      objective.direction === 'maximize' ? diff / currentPerf : -diff / currentPerf;

    return Math.max(-1, Math.min(1, improvement));
  }

  private calculateOptimizationConfidence(
    sampleSize: number,
    improvement: number,
    validationResults: ValidationResult[]
  ): number {
    // Base confidence from sample size
    const sampleConfidence = Math.min(
      1,
      sampleSize / (this.config.minSamplesForOptimization * 2)
    );

    // Validation pass rate
    const passRate =
      validationResults.filter((r) => r.passed).length /
      Math.max(validationResults.length, 1);

    // Improvement significance
    const improvementConfidence = Math.abs(improvement) > this.config.improvementThreshold ? 1 : 0.5;

    return sampleConfidence * 0.3 + passRate * 0.5 + improvementConfidence * 0.2;
  }

  private inferDomainFromExperiences(experiences: Experience[]): DomainName {
    const domainCounts: Map<DomainName, number> = new Map();

    for (const exp of experiences) {
      domainCounts.set(exp.domain, (domainCounts.get(exp.domain) || 0) + 1);
    }

    let maxDomain: DomainName = 'learning-optimization';
    let maxCount = 0;

    for (const [domain, count] of domainCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxDomain = domain;
      }
    }

    return maxDomain;
  }

  private async collectStrategyMetrics(
    strategy: Strategy,
    metric: string,
    minSamples: number
  ): Promise<number[]> {
    const keys = await this.memory.search(
      `learning:metrics:history:*:*`,
      minSamples * 2
    );
    const metrics: number[] = [];

    for (const key of keys) {
      const snapshot = await this.memory.get<MetricsSnapshot>(key);
      if (
        snapshot &&
        snapshot.metrics[metric] !== undefined
      ) {
        metrics.push(snapshot.metrics[metric]);
      }
    }

    // If not enough real data, generate simulated data
    while (metrics.length < minSamples) {
      const expected = strategy.expectedOutcome[metric] || 0.5;
      const variation = (secureRandom() - 0.5) * 0.2;
      metrics.push(expected + variation);
    }

    return metrics;
  }

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = this.calculateMean(values);
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  private calculatePValue(groupA: number[], groupB: number[]): number {
    // Simplified p-value calculation using Welch's t-test approximation
    const meanA = this.calculateMean(groupA);
    const meanB = this.calculateMean(groupB);
    const varA = Math.pow(this.calculateStdDev(groupA), 2);
    const varB = Math.pow(this.calculateStdDev(groupB), 2);
    const nA = groupA.length;
    const nB = groupB.length;

    const se = Math.sqrt(varA / nA + varB / nB);
    if (se === 0) return 0.5;

    const t = Math.abs(meanA - meanB) / se;

    // Approximate p-value using normal distribution
    const pValue = 2 * (1 - this.normalCDF(t));
    return Math.max(0, Math.min(1, pValue));
  }

  private normalCDF(x: number): number {
    // Approximation of the cumulative distribution function
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  private scoreContextMatch(
    optimized: OptimizedStrategy,
    context: PatternContext
  ): number {
    let score = 0;
    let total = 0;

    // Match based on objective metric
    if (context.tags.some((t) => t === optimized.objective.metric)) {
      score += 1;
    }
    total += 1;

    // Match based on domain
    if (context.tags.some((t) => t === optimized.domain)) {
      score += 1;
    }
    total += 1;

    return total > 0 ? score / total : 0.5;
  }

  private getDefaultParameters(context: PatternContext): Record<string, unknown> {
    const params: Record<string, unknown> = {
      timeout: 30000,
      retryCount: 3,
      concurrency: 4,
    };

    if (context.framework) {
      params['framework'] = context.framework;
    }

    if (context.language) {
      params['language'] = context.language;
    }

    return params;
  }

  private calculateSuccessRate(experiences: Experience[]): number {
    if (experiences.length === 0) return 0;
    return (
      experiences.filter((e) => e.result.success).length / experiences.length
    );
  }

  private calculateAverageDuration(experiences: Experience[]): number {
    if (experiences.length === 0) return 0;
    return (
      experiences.reduce((sum, e) => sum + e.result.duration, 0) /
      experiences.length
    );
  }

  private calculateAverageReward(experiences: Experience[]): number {
    if (experiences.length === 0) return 0;
    return (
      experiences.reduce((sum, e) => sum + e.reward, 0) / experiences.length
    );
  }

  private identifyImprovementAreas(
    strategy: Strategy,
    metrics: Record<string, number>,
    _experiences: Experience[]
  ): string[] {
    const areas: string[] = [];

    if (metrics['success_rate'] < 0.8) {
      areas.push('Increase success rate by tuning parameters');
    }

    if (metrics['avg_duration_ms'] > 10000) {
      areas.push('Optimize for faster execution');
    }

    if (metrics['avg_reward'] < 0.5) {
      areas.push('Improve reward through better strategy selection');
    }

    // Check strategy parameters
    const params = strategy.parameters;
    if ((params['retryCount'] as number) < 2) {
      areas.push('Consider increasing retry count for resilience');
    }

    if ((params['concurrency'] as number) > 8) {
      areas.push('High concurrency may cause resource contention');
    }

    return areas;
  }

  private generateParameterCombinations(
    ranges: Record<string, number[]>
  ): Record<string, unknown>[] {
    const keys = Object.keys(ranges);
    if (keys.length === 0) return [{}];

    const combinations: Record<string, unknown>[] = [];

    function generate(
      index: number,
      current: Record<string, unknown>
    ): void {
      if (index === keys.length) {
        combinations.push({ ...current });
        return;
      }

      const key = keys[index];
      // SEC-003: Guard against prototype pollution
      if (!isSafeKey(key)) {
        generate(index + 1, current);
        return;
      }
      for (const value of ranges[key]) {
        current[key] = value;
        generate(index + 1, current);
      }
    }

    generate(0, {});
    return combinations;
  }

  private async updateAggregatedMetrics(
    strategyId: string,
    metrics: Record<string, number>
  ): Promise<void> {
    const key = `learning:metrics:aggregated:${strategyId}`;
    const existing = await this.memory.get<{
      metrics: Record<string, { sum: number; count: number }>;
    }>(key);

    const aggregated = existing?.metrics || {};

    for (const [metricName, value] of Object.entries(metrics)) {
      // SEC-003: Guard against prototype pollution
      if (!isSafeKey(metricName)) continue;
      if (!aggregated[metricName]) {
        aggregated[metricName] = { sum: 0, count: 0 };
      }
      aggregated[metricName].sum += value;
      aggregated[metricName].count += 1;
    }

    await this.memory.set(
      key,
      { metrics: aggregated, updatedAt: new Date() },
      { namespace: 'learning-optimization', persist: true }
    );
  }

  private async storeOptimizationResult(result: OptimizedStrategy): Promise<void> {
    await this.memory.set(
      `learning:strategy:optimized:${result.id}`,
      result,
      { namespace: 'learning-optimization', persist: true }
    );

    // Index by domain
    await this.memory.set(
      `learning:strategy:domain:${result.domain}:${result.id}`,
      result.id,
      { namespace: 'learning-optimization', persist: true }
    );
  }

  private async storeABTestResult(
    strategyA: Strategy,
    strategyB: Strategy,
    result: ABTestResult
  ): Promise<void> {
    const testId = uuidv4();
    await this.memory.set(
      `learning:abtest:${testId}`,
      {
        testId,
        strategyA: strategyA.name,
        strategyB: strategyB.name,
        result,
        timestamp: new Date(),
      },
      { namespace: 'learning-optimization', persist: true }
    );
  }

  private async storeStrategyEvaluation(
    evaluation: StrategyEvaluation
  ): Promise<void> {
    const evalId = uuidv4();
    await this.memory.set(
      `learning:evaluation:${evalId}`,
      {
        ...evaluation,
        evaluatedAt: new Date(),
      },
      { namespace: 'learning-optimization', ttl: 86400 * 7 }
    );
  }
}
