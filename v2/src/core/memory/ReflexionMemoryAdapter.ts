/**
 * ReflexionMemory Adapter for QE Fleet
 * Learns from test failures to predict and prevent flakiness
 */

import { generateEmbedding } from '../../utils/EmbeddingGenerator.js';

export interface TestExecution {
  testId: string;
  testName: string;
  signature: string;
  outcome: 'pass' | 'fail' | 'flaky' | 'timeout';
  duration: number;
  errorMessage?: string;
  errorStack?: string;
  retryCount: number;
  environment: Record<string, string>;
  timestamp: number;
}

export interface ReflexionEpisode {
  id: string;
  executions: TestExecution[];
  reflection: string;
  lessonsLearned: string[];
  flakinessIndicators: string[];
  confidence: number;
  createdAt: number;
}

export interface FlakinessPrediction {
  testId: string;
  flakinessScore: number;  // 0-1, higher = more likely flaky
  confidence: number;
  indicators: string[];
  similarFailures: TestExecution[];
  recommendations: string[];
}

/**
 * Flakiness indicators extracted from test executions
 */
const FLAKINESS_INDICATORS = [
  { pattern: /timeout/i, indicator: 'timeout-related', weight: 0.8 },
  { pattern: /race condition/i, indicator: 'race-condition', weight: 0.9 },
  { pattern: /async/i, indicator: 'async-timing', weight: 0.6 },
  { pattern: /network/i, indicator: 'network-dependency', weight: 0.7 },
  { pattern: /database|db|sql/i, indicator: 'database-dependency', weight: 0.5 },
  { pattern: /random|Math\.random/i, indicator: 'non-deterministic', weight: 0.85 },
  { pattern: /date|time|now/i, indicator: 'time-dependency', weight: 0.7 },
  { pattern: /file|fs|path/i, indicator: 'filesystem-dependency', weight: 0.5 },
  { pattern: /port|socket|connection/i, indicator: 'port-contention', weight: 0.75 },
  { pattern: /memory|heap|gc/i, indicator: 'memory-pressure', weight: 0.6 },
];

export class ReflexionMemoryAdapter {
  private episodes: Map<string, ReflexionEpisode> = new Map();
  private executionHistory: Map<string, TestExecution[]> = new Map();
  private dimension: number;
  private episodeEmbeddings: Map<string, number[]> = new Map();

  constructor(dimension: number = 384) {
    this.dimension = dimension;
  }

  /**
   * Record a test execution outcome
   */
  async recordExecution(execution: TestExecution): Promise<void> {
    const history = this.executionHistory.get(execution.testId) || [];
    history.push(execution);
    this.executionHistory.set(execution.testId, history);

    // Check if this creates a flaky pattern
    if (this.detectFlakyPattern(history)) {
      await this.createReflectionEpisode(execution.testId, history);
    }
  }

  /**
   * Record a failure with context for learning
   */
  async recordFailure(
    testId: string,
    errorContext: {
      message: string;
      stack?: string;
      environment?: Record<string, string>;
    }
  ): Promise<void> {
    const execution: TestExecution = {
      testId,
      testName: testId,
      signature: testId,
      outcome: 'fail',
      duration: 0,
      errorMessage: errorContext.message,
      errorStack: errorContext.stack,
      retryCount: 0,
      environment: errorContext.environment || {},
      timestamp: Date.now(),
    };

    await this.recordExecution(execution);
  }

  /**
   * Detect if execution history shows flaky pattern
   */
  private detectFlakyPattern(history: TestExecution[]): boolean {
    if (history.length < 3) return false;

    const recent = history.slice(-10);
    const outcomes = recent.map(e => e.outcome);

    // Check for alternating pass/fail pattern
    let transitions = 0;
    for (let i = 1; i < outcomes.length; i++) {
      if (outcomes[i] !== outcomes[i - 1]) {
        transitions++;
      }
    }

    // High transition rate indicates flakiness
    return transitions / (outcomes.length - 1) > 0.3;
  }

  /**
   * Create a reflection episode from failure history
   */
  private async createReflectionEpisode(
    testId: string,
    history: TestExecution[]
  ): Promise<void> {
    const failures = history.filter(e => e.outcome === 'fail' || e.outcome === 'flaky');
    const indicators = this.extractIndicators(failures);
    const lessons = this.generateLessons(failures, indicators);

    const episode: ReflexionEpisode = {
      id: `episode-${testId}-${Date.now()}`,
      executions: history.slice(-20),
      reflection: this.generateReflection(failures, indicators),
      lessonsLearned: lessons,
      flakinessIndicators: indicators,
      confidence: Math.min(0.9, 0.5 + (failures.length * 0.1)),
      createdAt: Date.now(),
    };

    this.episodes.set(episode.id, episode);

    // Generate embedding for similarity search
    const embedding = generateEmbedding(
      `${episode.reflection} ${lessons.join(' ')} ${indicators.join(' ')}`,
      this.dimension
    );
    this.episodeEmbeddings.set(episode.id, embedding);
  }

  /**
   * Extract flakiness indicators from failures
   */
  private extractIndicators(failures: TestExecution[]): string[] {
    const indicators: Set<string> = new Set();

    for (const failure of failures) {
      const text = `${failure.errorMessage || ''} ${failure.errorStack || ''}`;

      for (const { pattern, indicator } of FLAKINESS_INDICATORS) {
        if (pattern.test(text)) {
          indicators.add(indicator);
        }
      }
    }

    return Array.from(indicators);
  }

  /**
   * Generate lessons from failure patterns
   */
  private generateLessons(
    failures: TestExecution[],
    indicators: string[]
  ): string[] {
    const lessons: string[] = [];

    if (indicators.includes('timeout-related')) {
      lessons.push('Increase timeout or add explicit waits');
    }
    if (indicators.includes('race-condition')) {
      lessons.push('Add synchronization or use async/await properly');
    }
    if (indicators.includes('async-timing')) {
      lessons.push('Use waitFor or explicit polling instead of fixed delays');
    }
    if (indicators.includes('network-dependency')) {
      lessons.push('Mock network calls or add retry logic');
    }
    if (indicators.includes('non-deterministic')) {
      lessons.push('Seed random generators or mock random values');
    }
    if (indicators.includes('time-dependency')) {
      lessons.push('Mock Date.now() or use time-travel testing');
    }
    if (indicators.includes('port-contention')) {
      lessons.push('Use dynamic port allocation or run tests serially');
    }

    // Duration-based lessons
    const avgDuration = failures.reduce((s, f) => s + f.duration, 0) / failures.length;
    if (avgDuration > 5000) {
      lessons.push('Test is slow - consider breaking into smaller tests');
    }

    return lessons;
  }

  /**
   * Generate reflection summary
   */
  private generateReflection(
    failures: TestExecution[],
    indicators: string[]
  ): string {
    const failCount = failures.length;
    const indicatorList = indicators.join(', ') || 'unknown';

    return `Test failed ${failCount} times with indicators: ${indicatorList}. ` +
      `Failures suggest ${indicators.length > 2 ? 'multiple' : 'single'} root cause(s).`;
  }

  /**
   * Predict flakiness for a test
   */
  async predictFlakiness(testSignature: string): Promise<FlakinessPrediction> {
    const history = this.executionHistory.get(testSignature) || [];

    // Calculate base flakiness from history
    let baseScore = 0;
    if (history.length >= 3) {
      const failRate = history.filter(e => e.outcome !== 'pass').length / history.length;
      const isFlaky = this.detectFlakyPattern(history);
      baseScore = isFlaky ? Math.max(0.6, failRate) : failRate * 0.5;
    }

    // Find similar failures
    const queryEmbedding = generateEmbedding(testSignature, this.dimension);
    const similarEpisodes = this.findSimilarEpisodes(queryEmbedding, 5);

    // Aggregate indicators from similar episodes
    const allIndicators: string[] = [];
    const similarFailures: TestExecution[] = [];

    for (const episode of similarEpisodes) {
      allIndicators.push(...episode.flakinessIndicators);
      similarFailures.push(...episode.executions.filter(e => e.outcome !== 'pass'));
    }

    // Boost score based on similar failures
    const similarityBoost = similarEpisodes.length > 0
      ? similarEpisodes.reduce((s, e) => s + e.confidence, 0) / similarEpisodes.length * 0.3
      : 0;

    const indicators = [...new Set(allIndicators)];
    const flakinessScore = Math.min(1, baseScore + similarityBoost);

    return {
      testId: testSignature,
      flakinessScore,
      confidence: history.length >= 5 ? 0.8 : 0.5,
      indicators,
      similarFailures: similarFailures.slice(0, 5),
      recommendations: this.generateRecommendations(indicators),
    };
  }

  /**
   * Find similar reflection episodes
   */
  private findSimilarEpisodes(
    queryEmbedding: number[],
    k: number
  ): ReflexionEpisode[] {
    const results: Array<{ episode: ReflexionEpisode; score: number }> = [];

    for (const [id, embedding] of this.episodeEmbeddings) {
      const episode = this.episodes.get(id);
      if (!episode) continue;

      const score = this.cosineSimilarity(queryEmbedding, embedding);
      results.push({ episode, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .filter(r => r.score > 0.5)
      .map(r => r.episode);
  }

  /**
   * Generate recommendations based on indicators
   */
  private generateRecommendations(indicators: string[]): string[] {
    const recommendations: string[] = [];

    if (indicators.includes('timeout-related')) {
      recommendations.push('Add explicit wait conditions instead of fixed timeouts');
    }
    if (indicators.includes('race-condition')) {
      recommendations.push('Use test isolation and proper synchronization');
    }
    if (indicators.includes('async-timing')) {
      recommendations.push('Replace setTimeout with proper async patterns');
    }
    if (indicators.includes('network-dependency')) {
      recommendations.push('Mock external network calls in tests');
    }
    if (indicators.includes('database-dependency')) {
      recommendations.push('Use test database with proper cleanup');
    }
    if (indicators.includes('non-deterministic')) {
      recommendations.push('Seed random values or use deterministic alternatives');
    }
    if (indicators.includes('time-dependency')) {
      recommendations.push('Use jest.useFakeTimers() or similar time mocking');
    }
    if (indicators.includes('port-contention')) {
      recommendations.push('Use dynamic port allocation with getPort()');
    }
    if (indicators.includes('memory-pressure')) {
      recommendations.push('Add afterEach cleanup and check for memory leaks');
    }

    if (recommendations.length === 0) {
      recommendations.push('Run test multiple times to gather more data');
      recommendations.push('Enable verbose logging to identify failure patterns');
    }

    return recommendations;
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalEpisodes: number;
    totalExecutions: number;
    averageConfidence: number;
    topIndicators: Array<{ indicator: string; count: number }>;
  } {
    const indicatorCounts = new Map<string, number>();
    let totalConfidence = 0;
    let totalExecutions = 0;

    for (const episode of this.episodes.values()) {
      totalConfidence += episode.confidence;
      totalExecutions += episode.executions.length;

      for (const indicator of episode.flakinessIndicators) {
        indicatorCounts.set(indicator, (indicatorCounts.get(indicator) || 0) + 1);
      }
    }

    const topIndicators = Array.from(indicatorCounts.entries())
      .map(([indicator, count]) => ({ indicator, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalEpisodes: this.episodes.size,
      totalExecutions,
      averageConfidence: this.episodes.size > 0 ? totalConfidence / this.episodes.size : 0,
      topIndicators,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.episodes.clear();
    this.executionHistory.clear();
    this.episodeEmbeddings.clear();
  }
}

/**
 * Create ReflexionMemory adapter instance
 */
export function createReflexionMemoryAdapter(dimension?: number): ReflexionMemoryAdapter {
  return new ReflexionMemoryAdapter(dimension);
}
