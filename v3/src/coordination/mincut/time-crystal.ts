/**
 * Agentic QE v3 - Time Crystal CI/CD Coordination
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 4
 * ADR-032: Kuramoto CPG oscillators for self-sustaining scheduling (INTEGRATED)
 *
 * Implements temporal patterns for CI/CD optimization using time crystal concepts.
 * The system identifies periodic patterns in build/test execution, predicts optimal
 * execution windows, and coordinates scheduling for maximum throughput.
 *
 * Key Concepts:
 * - TemporalAttractor: Stable states the system evolves toward (stable, degraded, chaotic)
 * - TimeCrystalPhase: Periodic patterns in CI/CD execution
 * - CrystalLattice: Network of temporal dependencies between tests
 * - TimeCrystalController: Orchestrates temporal coordination
 * - KuramotoCPG: Self-sustaining oscillator-based scheduler (from kuramoto-cpg.ts)
 *
 * Integration Points:
 * - StrangeLoopController: Feedback for self-healing decisions
 * - MinCutHealthMonitor: Health metrics for stability assessment
 * - TestFailureCausalGraph: Failure prediction and prevention
 * - KuramotoCPG: Self-sustaining phase transitions without external timers
 *
 * Reference: RuVector Time Crystal Pattern (time_crystal.rs)
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainEvent, DomainName } from '../../shared/types';
import { EventBus } from '../../kernel/interfaces';
import type { StrangeLoopController } from './strange-loop';
import type { MinCutHealthMonitor } from './mincut-health-monitor';
import type { TestFailureCausalGraph } from './causal-discovery';

// Re-export all Kuramoto CPG types and classes for convenience
export {
  OscillatorState,
  CPGConfig,
  DEFAULT_CPG_CONFIG,
  PRODUCTION_CPG_CONFIG,
  TestPhaseType,
  PhaseQualityThresholds,
  PhaseAgentConfig,
  CPGTestPhase,
  CPGPhaseTransition,
  CPGPhaseResult,
  DEFAULT_CPG_TEST_PHASES,
  OscillatorNeuron,
  computeOrderParameter,
  createEvenlySpacedOscillators,
  buildRingCouplingMatrix,
  KuramotoCPG,
  createKuramotoCPG,
  createProductionKuramotoCPG,
} from './kuramoto-cpg';

/** Domain name for time crystal events */
const TIME_CRYSTAL_SOURCE: DomainName = 'coordination';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Temporal attractors - states the CI/CD system naturally evolves toward
 */
export type TemporalAttractor = 'stable' | 'degraded' | 'chaotic';

/**
 * Phase state in the time crystal
 */
export type PhaseState = 'dormant' | 'activating' | 'active' | 'completing' | 'cooldown';

/**
 * CI/CD execution metrics for a time window
 */
export interface ExecutionMetrics {
  /** Timestamp of the metrics */
  readonly timestamp: Date;

  /** Number of builds executed */
  readonly buildCount: number;

  /** Number of successful builds */
  readonly successfulBuilds: number;

  /** Number of tests executed */
  readonly testCount: number;

  /** Number of tests passed */
  readonly testsPassed: number;

  /** Number of tests failed */
  readonly testsFailed: number;

  /** Average build duration (ms) */
  readonly avgBuildDuration: number;

  /** Average test duration (ms) */
  readonly avgTestDuration: number;

  /** Resource utilization (0-1) */
  readonly resourceUtilization: number;

  /** Queue depth (pending items) */
  readonly queueDepth: number;

  /** Throughput (items/minute) */
  readonly throughput: number;
}

/**
 * Time crystal phase representing a periodic CI/CD pattern
 */
export interface TimeCrystalPhase {
  /** Phase ID */
  readonly id: string;

  /** Phase name */
  readonly name: string;

  /** Phase state */
  state: PhaseState;

  /** Phase period (ms) - how long a complete cycle takes */
  readonly periodMs: number;

  /** Phase offset (ms) - when this phase starts within a cycle */
  readonly offsetMs: number;

  /** Expected duration (ms) */
  readonly expectedDuration: number;

  /** Optimal parallelism for this phase */
  readonly optimalParallelism: number;

  /** Test types typically run in this phase */
  readonly testTypes: string[];

  /** Historical success rate (0-1) */
  successRate: number;

  /** Average actual duration (ms) */
  avgActualDuration: number;

  /** Execution count */
  executionCount: number;

  /** Last activation timestamp */
  lastActivation?: Date;
}

/**
 * Temporal dependency between execution units
 */
export interface TemporalDependency {
  /** Source execution unit ID */
  readonly sourceId: string;

  /** Target execution unit ID */
  readonly targetId: string;

  /** Dependency type */
  readonly type: 'must-precede' | 'should-precede' | 'independent' | 'conflicts';

  /** Dependency strength (0-1) */
  readonly strength: number;

  /** Historical latency between executions (ms) */
  readonly latencyMs: number;

  /** Observation count */
  observationCount: number;
}

/**
 * Crystal lattice - network of temporal dependencies
 */
export interface CrystalLattice {
  /** All execution units in the lattice */
  readonly nodes: Map<string, LatticeNode>;

  /** Dependencies between nodes */
  readonly dependencies: TemporalDependency[];

  /** Computed execution order (mutable for optimization) */
  executionOrder: string[];

  /** Parallel execution groups (mutable for optimization) */
  parallelGroups: string[][];

  /** Last optimization timestamp */
  lastOptimized: Date;
}

/**
 * Node in the crystal lattice
 */
export interface LatticeNode {
  /** Node ID (test or build unit) */
  readonly id: string;

  /** Node type */
  readonly type: 'test' | 'build' | 'deploy' | 'validate';

  /** Average execution time (ms) */
  avgExecutionTime: number;

  /** Failure probability (0-1) */
  failureProbability: number;

  /** Priority (higher = execute earlier) */
  priority: number;

  /** Resource requirements */
  readonly resources: {
    cpu: number;
    memory: number;
    io: number;
  };
}

/**
 * Observation from CI/CD execution
 */
export interface CrystalObservation {
  /** Observation ID */
  readonly id: string;

  /** Timestamp */
  readonly timestamp: Date;

  /** Current attractor state */
  readonly attractor: TemporalAttractor;

  /** Execution metrics */
  readonly metrics: ExecutionMetrics;

  /** Active phases */
  readonly activePhases: string[];

  /** Detected anomalies */
  readonly anomalies: CrystalAnomaly[];

  /** Predicted next phase */
  readonly predictedNextPhase?: string;

  /** Confidence in prediction */
  readonly predictionConfidence: number;
}

/**
 * Anomaly detected in CI/CD patterns
 */
export interface CrystalAnomaly {
  /** Anomaly type */
  readonly type: 'phase-drift' | 'cascade-failure' | 'resource-contention' | 'timeout-spike' | 'throughput-drop';

  /** Severity (0-1) */
  readonly severity: number;

  /** Affected phase/node IDs */
  readonly affected: string[];

  /** Description */
  readonly description: string;

  /** Suggested action */
  readonly suggestion: string;
}

/**
 * Optimization action for the scheduler
 */
export type ScheduleOptimization =
  | { readonly type: 'reorder'; readonly newOrder: string[] }
  | { readonly type: 'parallelize'; readonly groups: string[][] }
  | { readonly type: 'delay'; readonly nodeId: string; readonly delayMs: number }
  | { readonly type: 'skip'; readonly nodeId: string; readonly reason: string }
  | { readonly type: 'retry'; readonly nodeId: string; readonly maxAttempts: number }
  | { readonly type: 'no_change'; readonly reason: string };

/**
 * Stabilization action to move toward stable attractor
 */
export type StabilizationAction =
  | { readonly type: 'reduce_parallelism'; readonly by: number }
  | { readonly type: 'increase_parallelism'; readonly by: number }
  | { readonly type: 'isolate_flaky'; readonly testIds: string[] }
  | { readonly type: 'warm_cache'; readonly cacheKeys: string[] }
  | { readonly type: 'clear_queue'; readonly reason: string }
  | { readonly type: 'throttle'; readonly durationMs: number }
  | { readonly type: 'no_action'; readonly reason: string };

/**
 * Time crystal controller configuration
 */
export interface TimeCrystalConfig {
  /** Enable time crystal coordination */
  enabled: boolean;

  /** Observation interval (ms) */
  observationIntervalMs: number;

  /** Phase detection window (ms) */
  phaseDetectionWindowMs: number;

  /** Minimum observations for pattern detection */
  minObservationsForPattern: number;

  /** Anomaly detection sensitivity (0-1, higher = more sensitive) */
  anomalySensitivity: number;

  /** Stability threshold for attractor detection */
  stabilityThreshold: number;

  /** Maximum parallel execution groups */
  maxParallelGroups: number;

  /** Prediction horizon (ms) */
  predictionHorizonMs: number;

  /** Enable automatic optimization */
  autoOptimize: boolean;

  /** Enable automatic stabilization */
  autoStabilize: boolean;
}

/**
 * Default time crystal configuration
 */
export const DEFAULT_TIME_CRYSTAL_CONFIG: TimeCrystalConfig = {
  enabled: true,
  observationIntervalMs: 30000, // 30 seconds
  phaseDetectionWindowMs: 3600000, // 1 hour
  minObservationsForPattern: 10,
  anomalySensitivity: 0.7,
  stabilityThreshold: 0.8,
  maxParallelGroups: 8,
  predictionHorizonMs: 600000, // 10 minutes
  autoOptimize: true,
  autoStabilize: true,
};

/**
 * Time crystal event types
 */
export type TimeCrystalEventType =
  | 'crystal.observation'
  | 'crystal.phase.activated'
  | 'crystal.phase.completed'
  | 'crystal.attractor.changed'
  | 'crystal.anomaly.detected'
  | 'crystal.optimization.applied'
  | 'crystal.stabilization.applied'
  | 'crystal.cpg.tick'
  | 'crystal.cpg.transition'
  | 'crystal.cpg.started'
  | 'crystal.cpg.stopped'
  | 'crystal.cpg.repair';

// ============================================================================
// Time Crystal Controller Implementation
// ============================================================================

/**
 * Time Crystal Controller - Orchestrates temporal CI/CD coordination
 *
 * Implements the observe -> predict -> optimize -> stabilize cycle
 * for CI/CD pipeline optimization based on temporal patterns.
 */
export class TimeCrystalController {
  private readonly config: TimeCrystalConfig;
  private readonly eventBus?: EventBus;
  private readonly strangeLoop?: StrangeLoopController;
  private readonly healthMonitor?: MinCutHealthMonitor;
  private readonly causalGraph?: TestFailureCausalGraph;

  // State
  private running = false;
  private observationTimer: NodeJS.Timeout | null = null;
  private observations: CrystalObservation[] = [];
  private phases: Map<string, TimeCrystalPhase> = new Map();
  private lattice: CrystalLattice;
  private currentAttractor: TemporalAttractor = 'stable';
  private metricsHistory: ExecutionMetrics[] = [];

  // Statistics
  private stats = {
    totalObservations: 0,
    totalOptimizations: 0,
    totalStabilizations: 0,
    attractorTransitions: 0,
    anomaliesDetected: 0,
    phasesCompleted: 0,
  };

  constructor(
    config: Partial<TimeCrystalConfig> = {},
    eventBus?: EventBus,
    strangeLoop?: StrangeLoopController,
    healthMonitor?: MinCutHealthMonitor,
    causalGraph?: TestFailureCausalGraph
  ) {
    this.config = { ...DEFAULT_TIME_CRYSTAL_CONFIG, ...config };
    this.eventBus = eventBus;
    this.strangeLoop = strangeLoop;
    this.healthMonitor = healthMonitor;
    this.causalGraph = causalGraph;

    // Initialize empty lattice
    this.lattice = {
      nodes: new Map(),
      dependencies: [],
      executionOrder: [],
      parallelGroups: [],
      lastOptimized: new Date(),
    };

    // Initialize default phases
    this.initializeDefaultPhases();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the time crystal controller
   */
  start(): void {
    if (this.running || !this.config.enabled) return;

    this.running = true;
    this.observationTimer = setInterval(
      () => this.runCycle(),
      this.config.observationIntervalMs
    );

    // Run initial cycle
    this.runCycle();
  }

  /**
   * Stop the time crystal controller
   */
  stop(): void {
    if (this.observationTimer) {
      clearInterval(this.observationTimer);
      this.observationTimer = null;
    }
    this.running = false;
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ==========================================================================
  // Main Cycle: Observe -> Predict -> Optimize -> Stabilize
  // ==========================================================================

  /**
   * Run one complete time crystal cycle
   */
  async runCycle(): Promise<CrystalObservation> {
    // OBSERVE: Collect CI/CD timing metrics
    const observation = await this.observe();
    this.observations.push(observation);
    this.stats.totalObservations++;

    // Trim observations
    while (this.observations.length > 1000) {
      this.observations.shift();
    }

    // PREDICT: Forecast next phase based on history
    this.predictPhase();

    // OPTIMIZE: Adjust scheduling if auto-optimize is enabled
    if (this.config.autoOptimize) {
      const optimization = await this.optimize();
      if (optimization.type !== 'no_change') {
        this.stats.totalOptimizations++;
        await this.emitEvent('crystal.optimization.applied', { optimization });
      }
    }

    // STABILIZE: Move toward stable attractor if needed
    if (this.config.autoStabilize && observation.attractor !== 'stable') {
      const stabilization = await this.stabilize();
      if (stabilization.type !== 'no_action') {
        this.stats.totalStabilizations++;
        await this.emitEvent('crystal.stabilization.applied', { stabilization });
      }
    }

    await this.emitEvent('crystal.observation', { observation });

    return observation;
  }

  // ==========================================================================
  // OBSERVE: Collect CI/CD Timing Metrics
  // ==========================================================================

  /**
   * OBSERVE phase: Collect current CI/CD execution metrics
   */
  async observe(): Promise<CrystalObservation> {
    const metrics = this.collectMetrics();
    this.metricsHistory.push(metrics);

    // Trim metrics history
    while (this.metricsHistory.length > 500) {
      this.metricsHistory.shift();
    }

    // Detect current attractor state
    const attractor = this.detectAttractor(metrics);

    // Check for attractor transition
    if (attractor !== this.currentAttractor) {
      const previousAttractor = this.currentAttractor;
      this.currentAttractor = attractor;
      this.stats.attractorTransitions++;
      await this.emitEvent('crystal.attractor.changed', {
        from: previousAttractor,
        to: attractor,
      });
    }

    // Identify active phases
    const activePhases = this.identifyActivePhases();

    // Detect anomalies
    const anomalies = this.detectAnomalies(metrics);
    for (const anomaly of anomalies) {
      this.stats.anomaliesDetected++;
      await this.emitEvent('crystal.anomaly.detected', { anomaly });
    }

    // Predict next phase
    const { phase: predictedNextPhase, confidence: predictionConfidence } = this.predictPhase();

    return {
      id: uuidv4(),
      timestamp: new Date(),
      attractor,
      metrics,
      activePhases,
      anomalies,
      predictedNextPhase,
      predictionConfidence,
    };
  }

  /**
   * Collect current execution metrics
   */
  private collectMetrics(): ExecutionMetrics {
    // Get health metrics if available
    const health = this.healthMonitor?.getHealth();

    // Get Strange Loop stats if available
    const loopStats = this.strangeLoop?.getStats();

    // Calculate throughput from recent observations
    const recentObs = this.observations.slice(-10);
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
      throughput: avgTestCount / (this.config.observationIntervalMs / 60000),
    };
  }

  /**
   * Detect the current attractor state
   */
  private detectAttractor(metrics: ExecutionMetrics): TemporalAttractor {
    const passRate = metrics.testCount > 0
      ? metrics.testsPassed / metrics.testCount
      : 1;

    const buildSuccessRate = metrics.buildCount > 0
      ? metrics.successfulBuilds / metrics.buildCount
      : 1;

    // Get health info if available
    const health = this.healthMonitor?.getHealth();
    const healthFactor = health
      ? (health.status === 'healthy' ? 1 : health.status === 'warning' ? 0.7 : 0.3)
      : 0.8;

    // Combined stability score
    const stabilityScore = (passRate * 0.4 + buildSuccessRate * 0.3 + healthFactor * 0.3);

    if (stabilityScore >= this.config.stabilityThreshold) {
      return 'stable';
    } else if (stabilityScore >= this.config.stabilityThreshold * 0.5) {
      return 'degraded';
    } else {
      return 'chaotic';
    }
  }

  /**
   * Identify currently active phases
   */
  private identifyActivePhases(): string[] {
    const activePhases: string[] = [];

    for (const [id, phase] of Array.from(this.phases.entries())) {
      if (phase.state === 'active' || phase.state === 'activating') {
        activePhases.push(id);
      }
    }

    return activePhases;
  }

  /**
   * Detect anomalies in the metrics
   */
  private detectAnomalies(metrics: ExecutionMetrics): CrystalAnomaly[] {
    const anomalies: CrystalAnomaly[] = [];

    // Check for throughput drop
    if (this.metricsHistory.length >= 5) {
      const recent = this.metricsHistory.slice(-5);
      const older = this.metricsHistory.slice(-10, -5);

      if (older.length >= 5) {
        const recentAvg = recent.reduce((s, m) => s + m.throughput, 0) / recent.length;
        const olderAvg = older.reduce((s, m) => s + m.throughput, 0) / older.length;

        if (recentAvg < olderAvg * (1 - this.config.anomalySensitivity * 0.5)) {
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
    if (this.causalGraph) {
      const recentFailures = this.causalGraph.getAllFailures()
        .filter(f => Date.now() - f.timestamp.getTime() < this.config.phaseDetectionWindowMs);

      if (recentFailures.length >= 5) {
        // Check if failures are cascading
        for (const failure of recentFailures.slice(0, 3)) {
          const effects = this.causalGraph.getEffects(failure.id);
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
    for (const [id, phase] of Array.from(this.phases.entries())) {
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

  // ==========================================================================
  // PREDICT: Forecast Next Phase
  // ==========================================================================

  /**
   * PREDICT phase: Forecast the next phase based on history
   */
  predictPhase(): { phase: string | undefined; confidence: number } {
    if (this.observations.length < this.config.minObservationsForPattern) {
      return { phase: undefined, confidence: 0 };
    }

    // Analyze phase transition patterns
    const transitions: Map<string, Map<string, number>> = new Map();

    for (let i = 1; i < this.observations.length; i++) {
      const prev = this.observations[i - 1].activePhases;
      const curr = this.observations[i].activePhases;

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
    const currentPhases = this.observations[this.observations.length - 1]?.activePhases || [];
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

  // ==========================================================================
  // OPTIMIZE: Adjust Scheduling
  // ==========================================================================

  /**
   * OPTIMIZE phase: Adjust scheduling for optimal throughput
   */
  async optimize(): Promise<ScheduleOptimization> {
    // Get current lattice state
    const lattice = this.lattice;

    // Check if optimization is needed
    const lastObs = this.observations[this.observations.length - 1];
    if (!lastObs || lastObs.attractor === 'stable' && lastObs.anomalies.length === 0) {
      return { type: 'no_change', reason: 'System is stable with no anomalies' };
    }

    // Analyze execution order for optimization
    const optimizedOrder = this.computeOptimalOrder();

    if (this.ordersDiffer(optimizedOrder, lattice.executionOrder)) {
      return { type: 'reorder', newOrder: optimizedOrder };
    }

    // Analyze parallelization opportunities
    const parallelGroups = this.computeParallelGroups();

    if (parallelGroups.length > lattice.parallelGroups.length) {
      return { type: 'parallelize', groups: parallelGroups };
    }

    // Check for flaky tests to skip
    if (this.causalGraph) {
      const recentFailures = this.causalGraph.getAllFailures()
        .filter(f => Date.now() - f.timestamp.getTime() < 3600000); // Last hour

      const failureCounts = new Map<string, number>();
      for (const failure of recentFailures) {
        const count = failureCounts.get(failure.testId) || 0;
        failureCounts.set(failure.testId, count + 1);
      }

      // Find repeatedly failing tests
      for (const [testId, count] of Array.from(failureCounts.entries())) {
        if (count >= 3) {
          return {
            type: 'skip',
            nodeId: testId,
            reason: `Test has failed ${count} times in the last hour`,
          };
        }
      }
    }

    return { type: 'no_change', reason: 'No optimization opportunities found' };
  }

  /**
   * Compute optimal execution order
   */
  private computeOptimalOrder(): string[] {
    const nodes = Array.from(this.lattice.nodes.values());

    // Sort by priority (higher first), then by execution time (shorter first)
    nodes.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.avgExecutionTime - b.avgExecutionTime;
    });

    // Apply topological sort for dependencies
    return this.topologicalSort(nodes.map(n => n.id));
  }

  /**
   * Topological sort respecting dependencies
   */
  private topologicalSort(nodeIds: string[]): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }

    // Build adjacency and in-degree from dependencies
    for (const dep of this.lattice.dependencies) {
      if (dep.type === 'must-precede' || dep.type === 'should-precede') {
        const targets = adjacency.get(dep.sourceId) || [];
        targets.push(dep.targetId);
        adjacency.set(dep.sourceId, targets);

        const degree = inDegree.get(dep.targetId) || 0;
        inDegree.set(dep.targetId, degree + 1);
      }
    }

    // Kahn's algorithm
    const queue = nodeIds.filter(id => (inDegree.get(id) || 0) === 0);
    const result: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      for (const neighbor of adjacency.get(node) || []) {
        const degree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, degree);

        if (degree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Add any remaining nodes (in case of cycles)
    for (const id of nodeIds) {
      if (!result.includes(id)) {
        result.push(id);
      }
    }

    return result;
  }

  /**
   * Compute parallel execution groups
   */
  private computeParallelGroups(): string[][] {
    const groups: string[][] = [];
    const scheduled = new Set<string>();
    const nodes = Array.from(this.lattice.nodes.values());

    while (scheduled.size < nodes.length) {
      const group: string[] = [];

      for (const node of nodes) {
        if (scheduled.has(node.id)) continue;

        // Check if all dependencies are satisfied
        const canSchedule = this.lattice.dependencies
          .filter(d => d.targetId === node.id && (d.type === 'must-precede' || d.type === 'should-precede'))
          .every(d => scheduled.has(d.sourceId));

        // Check for conflicts with current group
        const hasConflict = this.lattice.dependencies
          .filter(d => d.type === 'conflicts')
          .some(d =>
            (d.sourceId === node.id && group.includes(d.targetId)) ||
            (d.targetId === node.id && group.includes(d.sourceId))
          );

        if (canSchedule && !hasConflict && group.length < this.config.maxParallelGroups) {
          group.push(node.id);
        }
      }

      if (group.length === 0) {
        // No progress - break to avoid infinite loop
        break;
      }

      groups.push(group);
      for (const id of group) {
        scheduled.add(id);
      }
    }

    return groups;
  }

  /**
   * Check if two execution orders differ significantly
   */
  private ordersDiffer(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return true;

    let differences = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        differences++;
      }
    }

    // Consider different if more than 20% of positions changed
    return differences > a.length * 0.2;
  }

  // ==========================================================================
  // STABILIZE: Move Toward Stable Attractor
  // ==========================================================================

  /**
   * STABILIZE phase: Apply actions to move toward stable attractor
   */
  async stabilize(): Promise<StabilizationAction> {
    const lastObs = this.observations[this.observations.length - 1];
    if (!lastObs) {
      return { type: 'no_action', reason: 'No observations available' };
    }

    // Handle chaotic state
    if (lastObs.attractor === 'chaotic') {
      // Find flaky tests to isolate
      if (this.causalGraph) {
        const rootCauses: string[] = [];
        const failures = this.causalGraph.getAllFailures().slice(-20);

        for (const failure of failures) {
          const analyses = this.causalGraph.findRootCauses(failure.id);
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

  // ==========================================================================
  // Phase Management
  // ==========================================================================

  /**
   * Initialize default CI/CD phases
   */
  private initializeDefaultPhases(): void {
    const defaultPhases: Omit<TimeCrystalPhase, 'state' | 'successRate' | 'avgActualDuration' | 'executionCount'>[] = [
      {
        id: 'unit-tests',
        name: 'Unit Tests',
        periodMs: 60000,
        offsetMs: 0,
        expectedDuration: 30000,
        optimalParallelism: 8,
        testTypes: ['unit'],
      },
      {
        id: 'integration-tests',
        name: 'Integration Tests',
        periodMs: 120000,
        offsetMs: 30000,
        expectedDuration: 60000,
        optimalParallelism: 4,
        testTypes: ['integration'],
      },
      {
        id: 'e2e-tests',
        name: 'End-to-End Tests',
        periodMs: 300000,
        offsetMs: 90000,
        expectedDuration: 180000,
        optimalParallelism: 2,
        testTypes: ['e2e', 'visual'],
      },
      {
        id: 'performance-tests',
        name: 'Performance Tests',
        periodMs: 600000,
        offsetMs: 270000,
        expectedDuration: 120000,
        optimalParallelism: 1,
        testTypes: ['performance', 'load'],
      },
    ];

    for (const phaseConfig of defaultPhases) {
      this.phases.set(phaseConfig.id, {
        ...phaseConfig,
        state: 'dormant',
        successRate: 1,
        avgActualDuration: phaseConfig.expectedDuration,
        executionCount: 0,
      });
    }
  }

  /**
   * Activate a phase
   */
  activatePhase(phaseId: string): boolean {
    const phase = this.phases.get(phaseId);
    if (!phase || phase.state !== 'dormant') return false;

    phase.state = 'activating';
    phase.lastActivation = new Date();

    this.emitEvent('crystal.phase.activated', { phaseId, phase });

    // Transition to active after brief activation period
    setTimeout(() => {
      if (phase.state === 'activating') {
        phase.state = 'active';
      }
    }, 1000);

    return true;
  }

  /**
   * Complete a phase
   */
  completePhase(phaseId: string, success: boolean, actualDuration: number): boolean {
    const phase = this.phases.get(phaseId);
    if (!phase || phase.state !== 'active') return false;

    phase.state = 'completing';
    phase.executionCount++;

    // Update running averages
    phase.avgActualDuration = (phase.avgActualDuration * (phase.executionCount - 1) + actualDuration) / phase.executionCount;
    phase.successRate = (phase.successRate * (phase.executionCount - 1) + (success ? 1 : 0)) / phase.executionCount;

    this.stats.phasesCompleted++;

    this.emitEvent('crystal.phase.completed', {
      phaseId,
      success,
      actualDuration,
      successRate: phase.successRate,
    });

    // Transition to cooldown then dormant
    setTimeout(() => {
      if (phase.state === 'completing') {
        phase.state = 'cooldown';
        setTimeout(() => {
          if (phase.state === 'cooldown') {
            phase.state = 'dormant';
          }
        }, 5000);
      }
    }, 1000);

    return true;
  }

  /**
   * Get a phase by ID
   */
  getPhase(phaseId: string): TimeCrystalPhase | undefined {
    return this.phases.get(phaseId);
  }

  /**
   * Get all phases
   */
  getAllPhases(): TimeCrystalPhase[] {
    return Array.from(this.phases.values());
  }

  // ==========================================================================
  // Lattice Management
  // ==========================================================================

  /**
   * Add a node to the lattice
   */
  addLatticeNode(node: LatticeNode): void {
    this.lattice.nodes.set(node.id, node);
  }

  /**
   * Add a dependency to the lattice
   */
  addDependency(dependency: TemporalDependency): void {
    this.lattice.dependencies.push(dependency);
  }

  /**
   * Get the current lattice
   */
  getLattice(): CrystalLattice {
    return this.lattice;
  }

  /**
   * Rebuild the lattice from causal graph
   */
  rebuildLatticeFromTestFailureCausalGraph(): void {
    if (!this.causalGraph) return;

    const failures = this.causalGraph.getAllFailures();
    const testIds = new Set<string>();

    for (const failure of failures) {
      testIds.add(failure.testId);
    }

    const testIdArray = Array.from(testIds);

    // Create nodes for each test
    for (const testId of testIdArray) {
      const testFailures = failures.filter(f => f.testId === testId);
      const avgDuration = 5000; // Default
      const failureRate = testFailures.length / Math.max(1, failures.length / testIds.size);

      this.lattice.nodes.set(testId, {
        id: testId,
        type: 'test',
        avgExecutionTime: avgDuration,
        failureProbability: Math.min(1, failureRate),
        priority: 1 - failureRate, // Lower priority for flaky tests
        resources: { cpu: 1, memory: 256, io: 1 },
      });
    }

    // Build dependencies from causal links
    for (const testId of testIdArray) {
      const testFailures = failures.filter(f => f.testId === testId);
      for (const failure of testFailures) {
        const effects = this.causalGraph.getEffects(failure.id);
        for (const effect of effects) {
          if (testId !== effect.testId) {
            // Check if dependency already exists
            const existing = this.lattice.dependencies.find(
              d => d.sourceId === testId && d.targetId === effect.testId
            );

            if (existing) {
              existing.observationCount++;
            } else {
              this.lattice.dependencies.push({
                sourceId: testId,
                targetId: effect.testId,
                type: 'should-precede',
                strength: 0.5,
                latencyMs: effect.timestamp.getTime() - failure.timestamp.getTime(),
                observationCount: 1,
              });
            }
          }
        }
      }
    }

    // Recompute execution order and parallel groups
    this.lattice.executionOrder = this.computeOptimalOrder();
    this.lattice.parallelGroups = this.computeParallelGroups();
    this.lattice.lastOptimized = new Date();
  }

  // ==========================================================================
  // Status & Statistics
  // ==========================================================================

  /**
   * Get current attractor state
   */
  getCurrentAttractor(): TemporalAttractor {
    return this.currentAttractor;
  }

  /**
   * Get recent observations
   */
  getObservations(limit: number = 10): CrystalObservation[] {
    return this.observations.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get configuration
   */
  getConfig(): TimeCrystalConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Event Emission
  // ==========================================================================

  /**
   * Emit a time crystal event
   */
  private async emitEvent(
    type: TimeCrystalEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.eventBus) return;

    const event: DomainEvent = {
      id: uuidv4(),
      type,
      source: TIME_CRYSTAL_SOURCE,
      timestamp: new Date(),
      correlationId: uuidv4(),
      payload: {
        attractor: this.currentAttractor,
        ...payload,
      },
    };

    try {
      await this.eventBus.publish(event);
    } catch (error) {
      console.error('Failed to publish Time Crystal event:', error);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Time Crystal controller
 */
export function createTimeCrystalController(
  config?: Partial<TimeCrystalConfig>,
  eventBus?: EventBus,
  strangeLoop?: StrangeLoopController,
  healthMonitor?: MinCutHealthMonitor,
  causalGraph?: TestFailureCausalGraph
): TimeCrystalController {
  return new TimeCrystalController(config, eventBus, strangeLoop, healthMonitor, causalGraph);
}
