/**
 * Training Data Generator for Neural Pattern Matcher
 *
 * Generates 1000+ diverse, realistic test patterns including:
 * - All 7 flaky patterns (flip-flop, gradual degradation, environment, etc.)
 * - Realistic edge cases
 * - Balanced classes (stable vs flaky)
 * - High-quality synthetic data for model training
 */

import { TestResult } from '../../src/learning/types';

export interface TestPattern {
  name: string;
  results: TestResult[];
  isFlaky: boolean;
  patternType: string;
}

export class TrainingDataGenerator {
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  /**
   * Generate comprehensive training dataset with 1000+ samples
   */
  public generateTrainingSet(count: number = 1000): TestPattern[] {
    const patterns: TestPattern[] = [];
    const patternsPerType = Math.floor(count / 14); // 7 flaky + 7 stable types

    // === FLAKY PATTERNS ===

    // 1. Flip-flop pattern (alternating pass/fail)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateFlipFlopPattern(`flip-flop-${i}`));
    }

    // 2. Gradual degradation (pass rate decreases over time)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateGradualDegradationPattern(`gradual-${i}`));
    }

    // 3. Environment-sensitive (fails in specific environments)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateEnvironmentSensitivePattern(`env-sensitive-${i}`));
    }

    // 4. Resource contention (fails under load)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateResourceContentionPattern(`resource-${i}`));
    }

    // 5. Timing-dependent (sensitive to execution speed)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateTimingDependentPattern(`timing-${i}`));
    }

    // 6. Data-dependent (fails with specific data)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateDataDependentPattern(`data-dependent-${i}`));
    }

    // 7. Concurrency issues (fails in parallel execution)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateConcurrencyIssuesPattern(`concurrency-${i}`));
    }

    // === STABLE PATTERNS ===

    // 8. Highly stable (>98% pass rate, low variance)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateHighlyStablePattern(`stable-high-${i}`));
    }

    // 9. Moderately stable (90-95% pass rate)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateModeratelyStablePattern(`stable-moderate-${i}`));
    }

    // 10. Consistently fast (low variance in duration)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateConsistentlyFastPattern(`stable-fast-${i}`));
    }

    // 11. Slow but stable
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateSlowButStablePattern(`stable-slow-${i}`));
    }

    // 12. Perfect score (100% pass rate)
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generatePerfectPattern(`stable-perfect-${i}`));
    }

    // 13. Stable with occasional retry
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateStableWithRetryPattern(`stable-retry-${i}`));
    }

    // 14. Edge cases and borderline
    for (let i = 0; i < patternsPerType; i++) {
      patterns.push(this.generateEdgeCasePattern(`edge-case-${i}`));
    }

    // Shuffle for better training
    return this.shuffle(patterns);
  }

  /**
   * Generate flip-flop pattern (alternating pass/fail)
   */
  private generateFlipFlopPattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      const passed = i % 2 === 0;
      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: 100 + this.random() * 20,
        timestamp: baseTime + i * 1000,
        retryCount: passed ? 0 : 1
      });
    }

    return { name, results, isFlaky: true, patternType: 'flip-flop' };
  }

  /**
   * Generate gradual degradation pattern
   */
  private generateGradualDegradationPattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      // Pass rate decreases linearly from 95% to 40%
      const passThreshold = 0.95 - (i / 50) * 0.55;
      const passed = this.random() < passThreshold;

      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: 100 + i * 2 + this.random() * 30, // Increasing duration
        timestamp: baseTime + i * 1000
      });
    }

    return { name, results, isFlaky: true, patternType: 'gradual-degradation' };
  }

  /**
   * Generate environment-sensitive pattern
   */
  private generateEnvironmentSensitivePattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();
    const environments = ['dev', 'staging', 'prod'];

    for (let i = 0; i < 50; i++) {
      const env = environments[i % 3];
      // Fails 70% of time in prod, passes 95% in dev/staging
      const passRate = env === 'prod' ? 0.3 : 0.95;
      const passed = this.random() < passRate;

      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: 100 + this.random() * 50,
        timestamp: baseTime + i * 1000,
        environment: { platform: env, nodeVersion: '18', os: 'linux' }
      });
    }

    return { name, results, isFlaky: true, patternType: 'environment-sensitive' };
  }

  /**
   * Generate resource contention pattern
   */
  private generateResourceContentionPattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      // Simulate CPU load (0-100%)
      const cpuLoad = this.random() * 100;
      // Higher failure rate under high load
      const passed = cpuLoad < 70 || this.random() < 0.3;

      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: 100 + cpuLoad * 2 + this.random() * 100,
        timestamp: baseTime + i * 1000,
        environment: { cpuLoad: cpuLoad.toFixed(1) }
      });
    }

    return { name, results, isFlaky: true, patternType: 'resource-contention' };
  }

  /**
   * Generate timing-dependent pattern
   */
  private generateTimingDependentPattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      // Very fast executions often fail (race condition)
      const duration = 50 + this.random() * 200;
      const passed = duration > 100 || this.random() < 0.4;

      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: Math.round(duration),
        timestamp: baseTime + i * 1000
      });
    }

    return { name, results, isFlaky: true, patternType: 'timing-dependent' };
  }

  /**
   * Generate data-dependent pattern
   */
  private generateDataDependentPattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      // Fails with specific data combinations (e.g., every 7th test)
      const passed = i % 7 !== 0 || this.random() < 0.2;

      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: 100 + this.random() * 40,
        timestamp: baseTime + i * 1000
      });
    }

    return { name, results, isFlaky: true, patternType: 'data-dependent' };
  }

  /**
   * Generate concurrency issues pattern
   */
  private generateConcurrencyIssuesPattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      // Clustered failures (deadlocks occur in bursts)
      const isInDeadlockCluster = (i >= 10 && i <= 15) || (i >= 35 && i <= 40);
      const passed = !isInDeadlockCluster || this.random() < 0.3;

      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: passed ? 100 + this.random() * 30 : 5000 + this.random() * 2000,
        timestamp: baseTime + i * 1000,
        retryCount: passed ? 0 : Math.floor(this.random() * 3)
      });
    }

    return { name, results, isFlaky: true, patternType: 'concurrency-issues' };
  }

  /**
   * Generate highly stable pattern (>98% pass rate)
   */
  private generateHighlyStablePattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      const passed = this.random() < 0.99;
      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: 100 + this.random() * 10, // Low variance
        timestamp: baseTime + i * 1000
      });
    }

    return { name, results, isFlaky: false, patternType: 'highly-stable' };
  }

  /**
   * Generate moderately stable pattern (90-95% pass rate)
   */
  private generateModeratelyStablePattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      const passed = this.random() < 0.93;
      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: 150 + this.random() * 30,
        timestamp: baseTime + i * 1000
      });
    }

    return { name, results, isFlaky: false, patternType: 'moderately-stable' };
  }

  /**
   * Generate consistently fast pattern
   */
  private generateConsistentlyFastPattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      results.push({
        testName: name,
        passed: true,
        status: 'passed',
        duration: 50 + this.random() * 5, // Very low variance
        timestamp: baseTime + i * 1000
      });
    }

    return { name, results, isFlaky: false, patternType: 'consistently-fast' };
  }

  /**
   * Generate slow but stable pattern
   */
  private generateSlowButStablePattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      const passed = this.random() < 0.96;
      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: 500 + this.random() * 50,
        timestamp: baseTime + i * 1000
      });
    }

    return { name, results, isFlaky: false, patternType: 'slow-stable' };
  }

  /**
   * Generate perfect pattern (100% pass rate)
   */
  private generatePerfectPattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      results.push({
        testName: name,
        passed: true,
        status: 'passed',
        duration: 120 + this.random() * 15,
        timestamp: baseTime + i * 1000
      });
    }

    return { name, results, isFlaky: false, patternType: 'perfect' };
  }

  /**
   * Generate stable with occasional retry pattern
   */
  private generateStableWithRetryPattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 50; i++) {
      const needsRetry = this.random() < 0.05; // 5% need retry but pass
      results.push({
        testName: name,
        passed: true,
        status: 'passed',
        duration: 100 + this.random() * 20,
        timestamp: baseTime + i * 1000,
        retryCount: needsRetry ? 1 : 0
      });
    }

    return { name, results, isFlaky: false, patternType: 'stable-with-retry' };
  }

  /**
   * Generate edge case / borderline pattern
   */
  private generateEdgeCasePattern(name: string): TestPattern {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    // Borderline case: 82% pass rate (just above flaky threshold)
    for (let i = 0; i < 50; i++) {
      const passed = this.random() < 0.82;
      results.push({
        testName: name,
        passed,
        status: passed ? 'passed' : 'failed',
        duration: 150 + this.random() * 100,
        timestamp: baseTime + i * 1000
      });
    }

    return { name, results, isFlaky: false, patternType: 'edge-case' };
  }

  /**
   * Seeded random number generator
   */
  private random(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * Export function for easy integration
 */
export function generateTrainingData(count: number = 1000, seed: number = 42): TestPattern[] {
  const generator = new TrainingDataGenerator(seed);
  return generator.generateTrainingSet(count);
}
