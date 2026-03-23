/**
 * Agentic QE v3 - Time Crystal Analysis & Observation
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 4
 *
 * Pure functions for metrics collection, attractor detection,
 * anomaly detection, phase prediction, and stabilization decisions.
 */

import type {
  ExecutionMetrics,
  TimeCrystalPhase,
  CrystalAnomaly,
  CrystalObservation,
  TemporalAttractor,
  StabilizationAction,
  TimeCrystalConfig,
} from './time-crystal-types';
import type { StrangeLoopController } from './strange-loop';
import type { MinCutHealthMonitor } from './mincut-health-monitor';
import type { TestFailureCausalGraph } from './causal-discovery';

/**
 * Collect current execution metrics from available monitors
 */
export function collectMetrics(
  observations: CrystalObservation[],
  config: TimeCrystalConfig,
  healthMonitor?: MinCutHealthMonitor,
  strangeLoop?: StrangeLoopController,
): ExecutionMetrics {
  // Get health metrics if available
  const health = healthMonitor?.getHealth();

  // Get Strange Loop stats if available
  const loopStats = strangeLoop?.getStats();

  // Calculate throughput from recent observations
  const recentObs = observations.slice(-10);
  const recentMetrics = recentObs.map(o => o.metrics);

  const avgTestCount = recentMetrics.length > 0
    ? recentMetrics.reduce((s, m) => s + m.testCount, 0) / recentMetrics.length
    : 0;

  const avgBuildDuration = recentMetrics.length > 0
    ? recentMetrics.reduce((s, m) => s + m.avgBuildDuration, 0) / recentMetrics.length
    : 0;

  // Estimate resource utilization from health status
  let resourceUtilization = 0.5;
  if (health) {
    resourceUtilization = health.status === 'healthy' ? 0.6 :
      health.status === 'warning' ? 0.8 : 0.95;
  }

  return {
    timestamp: new Date(),
    buildCount: loopStats?.totalCycles ?? 1,
    successfulBuilds: loopStats?.successfulActions ?? 1,
    testCount: Math.floor(avgTestCount * 1.1), // Slight increase for current window
    testsPassed: Math.floor(avgTestCount * 0.9),
    testsFailed: Math.floor(avgTestCount * 0.1),
    avgBuildDuration: avgBuildDuration || 30000,
    avgTestDuration: 5000,
    resourceUtilization,
    queueDepth: health?.weakVertexCount ?? 0,
    throughput: avgTestCount / (config.observationIntervalMs / 60000),
  };
}

/**
 * Detect the current attractor state from metrics
 */
export function detectAttractor(
  metrics: ExecutionMetrics,
  config: TimeCrystalConfig,
  healthMonitor?: MinCutHealthMonitor,
): TemporalAttractor {
  const passRate = metrics.testCount > 0
    ? metrics.testsPassed / metrics.testCount
    : 1;

  const buildSuccessRate = metrics.buildCount > 0
    ? metrics.successfulBuilds / metrics.buildCount
    : 1;

  // Get health info if available
  const health = healthMonitor?.getHealth();
  const healthFactor = health
    ? (health.status === 'healthy' ? 1 : health.status === 'warning' ? 0.7 : 0.3)
    : 0.8;

  // Combined stability score
  const stabilityScore = (passRate * 0.4 + buildSuccessRate * 0.3 + healthFactor * 0.3);

  if (stabilityScore >= config.stabilityThreshold) {
    return 'stable';
  } else if (stabilityScore >= config.stabilityThreshold * 0.5) {
    return 'degraded';
  } else {
    return 'chaotic';
  }
}

/**
 * Detect anomalies in the metrics
 */
export function detectAnomalies(
  metrics: ExecutionMetrics,
  metricsHistory: ExecutionMetrics[],
  phases: Map<string, TimeCrystalPhase>,
  config: TimeCrystalConfig,
  causalGraph?: TestFailureCausalGraph,
): CrystalAnomaly[] {
  const anomalies: CrystalAnomaly[] = [];

  // Check for throughput drop
  if (metricsHistory.length >= 5) {
    const recent = metricsHistory.slice(-5);
    const older = metricsHistory.slice(-10, -5);

    if (older.length >= 5) {
      const recentAvg = recent.reduce((s, m) => s + m.throughput, 0) / recent.length;
      const olderAvg = older.reduce((s, m) => s + m.throughput, 0) / older.length;

      if (recentAvg < olderAvg * (1 - config.anomalySensitivity * 0.5)) {
        anomalies.push({
          type: 'throughput-drop',
          severity: Math.min(1, (olderAvg - recentAvg) / olderAvg),
          affected: [],
          description: `Throughput dropped from ${olderAvg.toFixed(1)} to ${recentAvg.toFixed(1)} items/min`,
          suggestion: 'Consider increasing parallelism or checking for resource contention',
        });
      }
    }
  }

  // Check for resource contention
  if (metrics.resourceUtilization > 0.9) {
    anomalies.push({
      type: 'resource-contention',
      severity: metrics.resourceUtilization,
      affected: [],
      description: `High resource utilization: ${(metrics.resourceUtilization * 100).toFixed(0)}%`,
      suggestion: 'Reduce parallelism or scale up resources',
    });
  }

  // Check for cascade failures using causal graph
  if (causalGraph) {
    const recentFailures = causalGraph.getAllFailures()
      .filter(f => Date.now() - f.timestamp.getTime() < config.phaseDetectionWindowMs);

    if (recentFailures.length >= 5) {
      // Check if failures are cascading
      for (const failure of recentFailures.slice(0, 3)) {
        const effects = causalGraph.getEffects(failure.id);
        if (effects.length >= 3) {
          anomalies.push({
            type: 'cascade-failure',
            severity: Math.min(1, effects.length / 10),
            affected: [failure.testId, ...effects.map(e => e.testId)],
            description: `Test ${failure.testName} is causing ${effects.length} cascading failures`,
            suggestion: 'Isolate the root cause test and fix before continuing',
          });
        }
      }
    }
  }

  // Check for phase drift
  for (const [id, phase] of Array.from(phases.entries())) {
    if (phase.executionCount >= 5 && phase.avgActualDuration > phase.expectedDuration * 1.5) {
      anomalies.push({
        type: 'phase-drift',
        severity: Math.min(1, (phase.avgActualDuration - phase.expectedDuration) / phase.expectedDuration),
        affected: [id],
        description: `Phase ${phase.name} is taking ${((phase.avgActualDuration / phase.expectedDuration - 1) * 100).toFixed(0)}% longer than expected`,
        suggestion: 'Review tests in this phase for performance issues',
      });
    }
  }

  return anomalies;
}

/**
 * Predict the next phase based on observation history
 */
export function predictPhase(
  observations: CrystalObservation[],
  minObservationsForPattern: number,
): { phase: string | undefined; confidence: number } {
  if (observations.length < minObservationsForPattern) {
    return { phase: undefined, confidence: 0 };
  }

  // Analyze phase transition patterns
  const transitions: Map<string, Map<string, number>> = new Map();

  for (let i = 1; i < observations.length; i++) {
    const prev = observations[i - 1].activePhases;
    const curr = observations[i].activePhases;

    for (const prevPhase of prev) {
      for (const currPhase of curr) {
        if (!transitions.has(prevPhase)) {
          transitions.set(prevPhase, new Map());
        }
        const count = transitions.get(prevPhase)!.get(currPhase) || 0;
        transitions.get(prevPhase)!.set(currPhase, count + 1);
      }
    }
  }

  // Find most likely next phase
  const currentPhases = observations[observations.length - 1]?.activePhases || [];
  let bestNext: string | undefined;
  let bestCount = 0;
  let totalCount = 0;

  for (const currentPhase of currentPhases) {
    const nextTransitions = transitions.get(currentPhase);
    if (nextTransitions) {
      for (const [next, count] of Array.from(nextTransitions.entries())) {
        totalCount += count;
        if (count > bestCount) {
          bestCount = count;
          bestNext = next;
        }
      }
    }
  }

  const confidence = totalCount > 0 ? bestCount / totalCount : 0;

  return { phase: bestNext, confidence };
}

/**
 * Determine the stabilization action to move toward stable attractor
 */
export function determineStabilization(
  observations: CrystalObservation[],
  causalGraph?: TestFailureCausalGraph,
): StabilizationAction {
  const lastObs = observations[observations.length - 1];
  if (!lastObs) {
    return { type: 'no_action', reason: 'No observations available' };
  }

  // Handle chaotic state
  if (lastObs.attractor === 'chaotic') {
    // Find flaky tests to isolate
    if (causalGraph) {
      const rootCauses: string[] = [];
      const failures = causalGraph.getAllFailures().slice(-20);

      for (const failure of failures) {
        const analyses = causalGraph.findRootCauses(failure.id);
        for (const analysis of analyses) {
          if (analysis.confidence > 0.7 && analysis.impact >= 3) {
            rootCauses.push(analysis.rootCauseTest);
          }
        }
      }

      if (rootCauses.length > 0) {
        return {
          type: 'isolate_flaky',
          testIds: Array.from(new Set(rootCauses)),
        };
      }
    }

    // Reduce parallelism to stabilize
    return { type: 'reduce_parallelism', by: 2 };
  }

  // Handle degraded state
  if (lastObs.attractor === 'degraded') {
    const metrics = lastObs.metrics;

    // Check for resource contention
    if (metrics.resourceUtilization > 0.85) {
      return { type: 'reduce_parallelism', by: 1 };
    }

    // Check for queue buildup
    if (metrics.queueDepth > 10) {
      return { type: 'throttle', durationMs: 5000 };
    }

    // Try warming caches
    return {
      type: 'warm_cache',
      cacheKeys: ['test-deps', 'build-artifacts', 'node-modules'],
    };
  }

  // System is stable - consider increasing parallelism if throughput is low
  const metrics = lastObs.metrics;
  if (metrics.resourceUtilization < 0.5 && metrics.throughput < 10) {
    return { type: 'increase_parallelism', by: 1 };
  }

  return { type: 'no_action', reason: 'System is stable' };
}
