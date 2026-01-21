/**
 * Learning Telemetry for Agentic QE Fleet
 *
 * OpenTelemetry integration for tracking learning metrics, algorithm performance,
 * and agent improvement over time using reinforcement learning.
 *
 * Tracks:
 * - Learning episodes and Q-value updates
 * - Reward distribution and convergence
 * - Pattern discovery and matching
 * - Algorithm performance and switches
 * - Experience sharing metrics
 */

import { Meter, Counter, Histogram, UpDownCounter, ObservableGauge, Attributes } from '@opentelemetry/api';
import { getMeter, getTracer, withSpan } from './bootstrap';
import { HISTOGRAM_BOUNDARIES, MetricRecordOptions } from './types';
import { RLAlgorithmType } from '../learning/LearningEngine';

/**
 * Learning metrics registry
 */
export interface LearningMetrics {
  // Episode and update counters
  /** Total number of learning episodes recorded */
  episodesTotal: Counter;
  /** Total number of Q-value updates performed */
  qValueUpdates: Counter;
  /** Total sum of rewards received across all episodes */
  rewardSum: Counter;
  /** Number of algorithm switches performed */
  algorithmSwitches: Counter;
  /** Number of pattern cache hits */
  patternHits: Counter;
  /** Number of pattern cache misses */
  patternMisses: Counter;

  // Histograms
  /** Distribution of episode durations in milliseconds */
  episodeDuration: Histogram;
  /** Distribution of reward values */
  rewardDistribution: Histogram;
  /** Distribution of Q-values */
  qValueDistribution: Histogram;
  /** Distribution of pattern confidence scores */
  patternConfidence: Histogram;

  // Gauges (observable metrics)
  /** Current learning rate */
  learningRate: ObservableGauge;
  /** Current exploration rate */
  explorationRate: ObservableGauge;
  /** Current convergence rate */
  convergenceRate: ObservableGauge;
  /** Size of Q-table (state-action pairs) */
  qTableSize: ObservableGauge;
  /** Number of experiences in replay buffer */
  experienceBufferSize: ObservableGauge;
  /** Pattern hit rate (cache efficiency) */
  patternHitRate: ObservableGauge;

  // Experience sharing metrics
  /** Number of experiences shared with peers */
  experiencesShared: Counter;
  /** Number of experiences received from peers */
  experiencesReceived: Counter;
  /** Number of active experience sharing connections */
  activeSharingConnections: UpDownCounter;
}

// Singleton metrics instance
let learningMetrics: LearningMetrics | null = null;

// Storage for observable gauge values
const gaugeValues = {
  learningRate: 0,
  explorationRate: 0,
  convergenceRate: 0,
  qTableSize: 0,
  experienceBufferSize: 0,
  patternHitRate: 0,
};

// Pattern hit tracking
let totalPatternRequests = 0;
let totalPatternHits = 0;

/**
 * Initialize learning metrics
 *
 * @param meter - OpenTelemetry Meter instance
 * @returns Learning metrics registry
 */
export function createLearningMetrics(meter?: Meter): LearningMetrics {
  if (learningMetrics) {
    return learningMetrics;
  }

  const m = meter || getMeter();

  learningMetrics = {
    // Counters
    episodesTotal: m.createCounter('aqe.learning.episodes_total', {
      description: 'Total number of learning episodes recorded',
      unit: 'episodes',
    }),

    qValueUpdates: m.createCounter('aqe.learning.qvalue_updates', {
      description: 'Total number of Q-value updates performed',
      unit: 'updates',
    }),

    rewardSum: m.createCounter('aqe.learning.reward_sum', {
      description: 'Cumulative sum of rewards received across all episodes',
      unit: 'reward',
    }),

    algorithmSwitches: m.createCounter('aqe.learning.algorithm_switches', {
      description: 'Number of RL algorithm switches performed',
      unit: 'switches',
    }),

    patternHits: m.createCounter('aqe.learning.pattern_hits', {
      description: 'Number of successful pattern cache hits',
      unit: 'hits',
    }),

    patternMisses: m.createCounter('aqe.learning.pattern_misses', {
      description: 'Number of pattern cache misses',
      unit: 'misses',
    }),

    experiencesShared: m.createCounter('aqe.learning.experiences_shared', {
      description: 'Number of experiences shared with peer agents',
      unit: 'experiences',
    }),

    experiencesReceived: m.createCounter('aqe.learning.experiences_received', {
      description: 'Number of experiences received from peer agents',
      unit: 'experiences',
    }),

    // Histograms
    episodeDuration: m.createHistogram('aqe.learning.episode_duration', {
      description: 'Distribution of learning episode durations',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      },
    }),

    rewardDistribution: m.createHistogram('aqe.learning.reward_distribution', {
      description: 'Distribution of reward values across episodes',
      unit: 'reward',
      advice: {
        explicitBucketBoundaries: [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2],
      },
    }),

    qValueDistribution: m.createHistogram('aqe.learning.qvalue_distribution', {
      description: 'Distribution of Q-values in the Q-table',
      unit: 'qvalue',
      advice: {
        explicitBucketBoundaries: [-5, -2, -1, 0, 1, 2, 5, 10, 20, 50],
      },
    }),

    patternConfidence: m.createHistogram('aqe.learning.pattern_confidence', {
      description: 'Distribution of pattern confidence scores',
      unit: 'confidence',
      advice: {
        explicitBucketBoundaries: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0],
      },
    }),

    // Observable Gauges
    learningRate: m.createObservableGauge('aqe.learning.learning_rate', {
      description: 'Current learning rate (alpha)',
      unit: 'rate',
    }),

    explorationRate: m.createObservableGauge('aqe.learning.exploration_rate', {
      description: 'Current exploration rate (epsilon)',
      unit: 'rate',
    }),

    convergenceRate: m.createObservableGauge('aqe.learning.convergence_rate', {
      description: 'Learning convergence rate (improvement over time)',
      unit: 'rate',
    }),

    qTableSize: m.createObservableGauge('aqe.learning.qtable_size', {
      description: 'Number of state-action pairs in Q-table',
      unit: 'pairs',
    }),

    experienceBufferSize: m.createObservableGauge('aqe.learning.experience_buffer_size', {
      description: 'Number of experiences in replay buffer',
      unit: 'experiences',
    }),

    patternHitRate: m.createObservableGauge('aqe.learning.pattern_hit_rate', {
      description: 'Pattern cache hit rate (efficiency)',
      unit: 'rate',
    }),

    activeSharingConnections: m.createUpDownCounter('aqe.learning.active_sharing_connections', {
      description: 'Number of active experience sharing connections',
      unit: 'connections',
    }),
  };

  // Register observable callbacks
  learningMetrics.learningRate.addCallback((observableResult) => {
    observableResult.observe(gaugeValues.learningRate);
  });

  learningMetrics.explorationRate.addCallback((observableResult) => {
    observableResult.observe(gaugeValues.explorationRate);
  });

  learningMetrics.convergenceRate.addCallback((observableResult) => {
    observableResult.observe(gaugeValues.convergenceRate);
  });

  learningMetrics.qTableSize.addCallback((observableResult) => {
    observableResult.observe(gaugeValues.qTableSize);
  });

  learningMetrics.experienceBufferSize.addCallback((observableResult) => {
    observableResult.observe(gaugeValues.experienceBufferSize);
  });

  learningMetrics.patternHitRate.addCallback((observableResult) => {
    observableResult.observe(gaugeValues.patternHitRate);
  });

  return learningMetrics;
}

/**
 * Get initialized learning metrics
 *
 * @returns Learning metrics registry
 */
export function getLearningMetrics(): LearningMetrics {
  if (!learningMetrics) {
    return createLearningMetrics();
  }
  return learningMetrics;
}

/**
 * Record a learning episode
 *
 * @param agentId - Agent identifier
 * @param taskType - Type of task being learned
 * @param reward - Reward received for this episode
 * @param durationMs - Episode duration in milliseconds
 * @param algorithm - RL algorithm used
 * @param options - Additional recording options
 */
export function recordLearningEpisode(
  agentId: string,
  taskType: string,
  reward: number,
  durationMs: number,
  algorithm: RLAlgorithmType = 'q-learning',
  options?: {
    qValueUpdate?: boolean;
    patternDiscovered?: boolean;
    explorationRate?: number;
    learningRate?: number;
  }
): void {
  const metrics = getLearningMetrics();

  const attributes: Attributes = {
    'agent.id': agentId,
    'task.type': taskType,
    'learning.algorithm': algorithm,
  };

  // Record episode
  metrics.episodesTotal.add(1, attributes);

  // Record episode duration
  metrics.episodeDuration.record(durationMs, attributes);

  // Record reward
  metrics.rewardSum.add(reward, attributes);
  metrics.rewardDistribution.record(reward, attributes);

  // Record Q-value update if occurred
  if (options?.qValueUpdate) {
    metrics.qValueUpdates.add(1, attributes);
  }

  // Update gauge values if provided
  if (options?.explorationRate !== undefined) {
    updateGaugeValue('explorationRate', options.explorationRate);
  }
  if (options?.learningRate !== undefined) {
    updateGaugeValue('learningRate', options.learningRate);
  }
}

/**
 * Record Q-value updates
 *
 * @param agentId - Agent identifier
 * @param count - Number of Q-value updates
 * @param qValue - The Q-value (optional, for distribution tracking)
 * @param algorithm - RL algorithm used
 */
export function recordQValueUpdate(
  agentId: string,
  count: number = 1,
  qValue?: number,
  algorithm: RLAlgorithmType = 'q-learning'
): void {
  const metrics = getLearningMetrics();

  const attributes: Attributes = {
    'agent.id': agentId,
    'learning.algorithm': algorithm,
  };

  metrics.qValueUpdates.add(count, attributes);

  // Record Q-value distribution if provided
  if (qValue !== undefined) {
    metrics.qValueDistribution.record(qValue, attributes);
  }
}

/**
 * Record pattern matching activity
 *
 * @param agentId - Agent identifier
 * @param hit - Whether the pattern was found in cache
 * @param confidence - Pattern confidence score (if hit)
 * @param patternType - Type of pattern
 */
export function recordPatternMatch(
  agentId: string,
  hit: boolean,
  confidence?: number,
  patternType?: string
): void {
  const metrics = getLearningMetrics();

  const attributes: Attributes = {
    'agent.id': agentId,
  };

  if (patternType) {
    attributes['pattern.type'] = patternType;
  }

  // Track hit/miss
  totalPatternRequests++;
  if (hit) {
    totalPatternHits++;
    metrics.patternHits.add(1, attributes);

    // Record confidence if provided
    if (confidence !== undefined) {
      metrics.patternConfidence.record(confidence, attributes);
    }
  } else {
    metrics.patternMisses.add(1, attributes);
  }

  // Update hit rate
  updateGaugeValue('patternHitRate', totalPatternRequests > 0 ? totalPatternHits / totalPatternRequests : 0);
}

/**
 * Record algorithm switch
 *
 * @param agentId - Agent identifier
 * @param fromAlgorithm - Previous algorithm
 * @param toAlgorithm - New algorithm
 */
export function recordAlgorithmSwitch(
  agentId: string,
  fromAlgorithm: RLAlgorithmType,
  toAlgorithm: RLAlgorithmType
): void {
  const metrics = getLearningMetrics();

  metrics.algorithmSwitches.add(1, {
    'agent.id': agentId,
    'learning.algorithm.from': fromAlgorithm,
    'learning.algorithm.to': toAlgorithm,
  });
}

/**
 * Record experience sharing activity
 *
 * @param agentId - Agent identifier
 * @param direction - 'shared' or 'received'
 * @param count - Number of experiences
 * @param priority - Experience priority (0-1)
 */
export function recordExperienceSharing(
  agentId: string,
  direction: 'shared' | 'received',
  count: number = 1,
  priority?: number
): void {
  const metrics = getLearningMetrics();

  const attributes: Attributes = {
    'agent.id': agentId,
  };

  if (priority !== undefined) {
    attributes['experience.priority'] = priority;
  }

  if (direction === 'shared') {
    metrics.experiencesShared.add(count, attributes);
  } else {
    metrics.experiencesReceived.add(count, attributes);
  }
}

/**
 * Update sharing connection count
 *
 * @param agentId - Agent identifier
 * @param delta - Change in connection count (+1 for connect, -1 for disconnect)
 */
export function updateSharingConnections(agentId: string, delta: number): void {
  const metrics = getLearningMetrics();

  metrics.activeSharingConnections.add(delta, {
    'agent.id': agentId,
  });
}

/**
 * Update gauge values (for observable metrics)
 *
 * @param gauge - Gauge name
 * @param value - New value
 */
export function updateGaugeValue(
  gauge: keyof typeof gaugeValues,
  value: number
): void {
  gaugeValues[gauge] = value;
}

/**
 * Update multiple gauge values at once
 *
 * @param values - Object with gauge values to update
 */
export function updateGaugeValues(values: Partial<typeof gaugeValues>): void {
  Object.assign(gaugeValues, values);
}

/**
 * Create a traced learning operation span
 *
 * @param operationName - Name of the learning operation
 * @param agentId - Agent identifier
 * @param fn - Function to execute within the span
 * @returns Result of the function
 */
export async function withLearningSpan<T>(
  operationName: string,
  agentId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`aqe.learning.${operationName}`, async () => {
    const tracer = getTracer();
    const currentSpan = tracer.startActiveSpan(operationName, (span) => {
      span.setAttribute('agent.id', agentId);
      span.setAttribute('operation.type', 'learning');
      return span;
    });

    try {
      const result = await fn();
      return result;
    } finally {
      currentSpan?.end();
    }
  });
}

/**
 * Record learning session summary
 * Call this periodically or at session end to capture overall metrics
 *
 * @param agentId - Agent identifier
 * @param stats - Learning statistics
 */
export function recordLearningSession(
  agentId: string,
  stats: {
    algorithm: RLAlgorithmType;
    totalEpisodes: number;
    totalExperiences: number;
    qTableSize: number;
    explorationRate: number;
    learningRate: number;
    convergenceRate?: number;
    avgReward?: number;
    patternsDiscovered?: number;
  }
): void {
  // Update all gauge values
  updateGaugeValues({
    learningRate: stats.learningRate,
    explorationRate: stats.explorationRate,
    convergenceRate: stats.convergenceRate || 0,
    qTableSize: stats.qTableSize,
    experienceBufferSize: stats.totalExperiences,
  });

  // Record average reward if provided
  if (stats.avgReward !== undefined) {
    const metrics = getLearningMetrics();
    metrics.rewardDistribution.record(stats.avgReward, {
      'agent.id': agentId,
      'learning.algorithm': stats.algorithm,
      'session.type': 'summary',
    });
  }
}

/**
 * Get current pattern hit rate
 *
 * @returns Pattern hit rate (0-1)
 */
export function getPatternHitRate(): number {
  return totalPatternRequests > 0 ? totalPatternHits / totalPatternRequests : 0;
}

/**
 * Reset pattern hit tracking (useful for testing or per-session metrics)
 */
export function resetPatternHitTracking(): void {
  totalPatternRequests = 0;
  totalPatternHits = 0;
  updateGaugeValue('patternHitRate', 0);
}

// Export types
export type { MetricRecordOptions };
