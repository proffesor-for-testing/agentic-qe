/**
 * Agent Performance Metrics for Agentic QE Fleet
 *
 * Metrics for tracking agent task execution, performance, and resource usage.
 */

import { Meter, Counter, Histogram, UpDownCounter, Attributes } from '@opentelemetry/api';
import { getMeter } from '../bootstrap';
import { METRIC_NAMES, HISTOGRAM_BOUNDARIES, MetricRecordOptions } from '../types';

/**
 * Agent metrics registry
 */
export interface AgentMetrics {
  /** Total number of tasks executed by agents */
  taskCount: Counter;
  /** Distribution of task durations in milliseconds */
  taskDuration: Histogram;
  /** Number of successful tasks */
  successCount: Counter;
  /** Number of failed tasks */
  errorCount: Counter;
  /** Total tokens consumed by agents */
  tokenUsage: Counter;
  /** Total cost incurred by agents */
  costTotal: Counter;
  /** Number of currently active agents */
  activeAgents: UpDownCounter;
}

// Singleton metrics instance
let agentMetrics: AgentMetrics | null = null;

/**
 * Initialize agent metrics
 *
 * @param meter - OpenTelemetry Meter instance
 * @returns Agent metrics registry
 */
export function createAgentMetrics(meter?: Meter): AgentMetrics {
  if (agentMetrics) {
    return agentMetrics;
  }

  const m = meter || getMeter();

  agentMetrics = {
    taskCount: m.createCounter(METRIC_NAMES.AGENT_TASK_COUNT, {
      description: 'Total number of tasks executed by agents',
      unit: 'tasks',
    }),

    taskDuration: m.createHistogram(METRIC_NAMES.AGENT_TASK_DURATION, {
      description: 'Distribution of agent task execution durations',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: HISTOGRAM_BOUNDARIES.taskDuration,
      },
    }),

    successCount: m.createCounter(`${METRIC_NAMES.AGENT_TASK_COUNT}.success`, {
      description: 'Total number of successful agent tasks',
      unit: 'tasks',
    }),

    errorCount: m.createCounter(METRIC_NAMES.AGENT_ERROR_COUNT, {
      description: 'Total number of failed agent tasks',
      unit: 'errors',
    }),

    tokenUsage: m.createCounter(METRIC_NAMES.AGENT_TOKEN_USAGE, {
      description: 'Total tokens consumed by agents',
      unit: 'tokens',
    }),

    costTotal: m.createCounter(METRIC_NAMES.AGENT_COST, {
      description: 'Total cost incurred by agent operations',
      unit: 'USD',
    }),

    activeAgents: m.createUpDownCounter(METRIC_NAMES.AGENT_ACTIVE_COUNT, {
      description: 'Number of currently active agents in the fleet',
      unit: 'agents',
    }),
  };

  return agentMetrics;
}

/**
 * Get initialized agent metrics
 *
 * @returns Agent metrics registry
 */
export function getAgentMetrics(): AgentMetrics {
  if (!agentMetrics) {
    return createAgentMetrics();
  }
  return agentMetrics;
}

/**
 * Record a completed agent task
 *
 * @param agentType - Type of agent (e.g., test-generator, coverage-analyzer)
 * @param taskType - Type of task executed
 * @param durationMs - Task duration in milliseconds
 * @param success - Whether the task succeeded
 * @param options - Additional recording options
 */
export function recordAgentTask(
  agentType: string,
  taskType: string,
  durationMs: number,
  success: boolean,
  options?: {
    agentId?: string;
    taskId?: string;
    priority?: string;
    tokensUsed?: number;
    cost?: number;
  }
): void {
  const metrics = getAgentMetrics();

  const attributes: Attributes = {
    'agent.type': agentType,
    'task.type': taskType,
    'task.status': success ? 'success' : 'failed',
  };

  if (options?.agentId) {
    attributes['agent.id'] = options.agentId;
  }
  if (options?.taskId) {
    attributes['task.id'] = options.taskId;
  }
  if (options?.priority) {
    attributes['task.priority'] = options.priority;
  }

  // Record task count
  metrics.taskCount.add(1, attributes);

  // Record duration
  metrics.taskDuration.record(durationMs, attributes);

  // Record success/failure
  if (success) {
    metrics.successCount.add(1, attributes);
  } else {
    metrics.errorCount.add(1, attributes);
  }

  // Record token usage if provided
  if (options?.tokensUsed && options.tokensUsed > 0) {
    metrics.tokenUsage.add(options.tokensUsed, attributes);
  }

  // Record cost if provided
  if (options?.cost && options.cost > 0) {
    metrics.costTotal.add(options.cost, attributes);
  }
}

/**
 * Record agent spawn/despawn
 *
 * @param agentType - Type of agent
 * @param delta - Change in agent count (+1 for spawn, -1 for despawn)
 * @param attributes - Additional attributes
 */
export function recordAgentCount(
  agentType: string,
  delta: number,
  attributes?: Attributes
): void {
  const metrics = getAgentMetrics();

  metrics.activeAgents.add(delta, {
    'agent.type': agentType,
    ...attributes,
  });
}

/**
 * Record model routing decision
 */
export interface ModelRoutingRecord {
  /** Model provider (anthropic, openai, etc.) */
  provider: string;
  /** Model name/ID */
  model: string;
  /** Model tier (fast, balanced, quality) */
  tier: string;
  /** Task complexity score */
  complexity: number;
  /** Routing latency in ms */
  routingLatencyMs: number;
  /** Tokens used for routing */
  tokensUsed?: number;
  /** Cost of the routed call */
  cost?: number;
}

/**
 * Create model routing metrics
 *
 * @param meter - OpenTelemetry Meter instance
 * @returns Model routing metrics
 */
export function createModelRoutingMetrics(meter?: Meter) {
  const m = meter || getMeter();

  return {
    routingCount: m.createCounter('aqe.model.routing.count', {
      description: 'Number of model routing decisions',
      unit: 'routes',
    }),

    routingLatency: m.createHistogram('aqe.model.routing.latency', {
      description: 'Model routing decision latency',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500],
      },
    }),

    modelInvocationCount: m.createCounter('aqe.model.invocation.count', {
      description: 'Number of model invocations',
      unit: 'invocations',
    }),

    modelTokensInput: m.createCounter('aqe.model.tokens.input', {
      description: 'Total input tokens sent to models',
      unit: 'tokens',
    }),

    modelTokensOutput: m.createCounter('aqe.model.tokens.output', {
      description: 'Total output tokens received from models',
      unit: 'tokens',
    }),

    modelCost: m.createCounter('aqe.model.cost', {
      description: 'Total cost of model invocations',
      unit: 'USD',
    }),

    modelLatency: m.createHistogram('aqe.model.invocation.latency', {
      description: 'Model invocation latency',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      },
    }),
  };
}

/**
 * Learning and pattern metrics for agents
 */
export function createLearningMetrics(meter?: Meter) {
  const m = meter || getMeter();

  return {
    patternMatchCount: m.createCounter('aqe.learning.pattern.match.count', {
      description: 'Number of pattern matches found',
      unit: 'matches',
    }),

    patternMatchScore: m.createHistogram('aqe.learning.pattern.match.score', {
      description: 'Distribution of pattern match scores',
      unit: 'score',
      advice: {
        explicitBucketBoundaries: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      },
    }),

    learningEpisodeCount: m.createCounter('aqe.learning.episode.count', {
      description: 'Number of learning episodes recorded',
      unit: 'episodes',
    }),

    rewardScore: m.createHistogram('aqe.learning.reward.score', {
      description: 'Distribution of reward scores',
      unit: 'score',
      advice: {
        explicitBucketBoundaries: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      },
    }),

    experienceBufferSize: m.createUpDownCounter('aqe.learning.buffer.size', {
      description: 'Current size of experience replay buffer',
      unit: 'experiences',
    }),
  };
}

// Export types
export type { MetricRecordOptions };
