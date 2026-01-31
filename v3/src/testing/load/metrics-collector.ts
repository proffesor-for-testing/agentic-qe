/**
 * Agentic QE v3 - Load Test Metrics Collector
 * Performance metrics collection for 100+ agent coordination testing
 *
 * Issue #177 Targets:
 * - 100+ agents
 * - <4GB memory
 * - <100ms coordination latency
 */

import { CircularBuffer } from '../../shared/utils/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Individual agent lifecycle event
 */
export interface AgentLifecycleEvent {
  readonly agentId: string;
  readonly timestamp: number;
  readonly type: 'spawn' | 'terminate';
}

/**
 * Task execution event
 */
export interface TaskEvent {
  readonly agentId: string;
  readonly taskId: string;
  readonly timestamp: number;
  readonly type: 'start' | 'complete';
  readonly duration?: number; // Only for complete events
}

/**
 * Coordination latency measurement
 */
export interface CoordinationEvent {
  readonly agentId: string;
  readonly timestamp: number;
  readonly latency: number;
}

/**
 * Memory snapshot
 */
export interface MemorySnapshot {
  readonly timestamp: number;
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly external: number;
  readonly rss: number;
}

/**
 * Latency percentiles
 */
export interface LatencyPercentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly min: number;
  readonly avg: number;
  readonly count: number;
}

/**
 * Throughput metrics
 */
export interface ThroughputMetrics {
  readonly tasks: number;
  readonly tasksPerSecond: number;
  readonly agents: number;
  readonly agentsPerSecond: number;
}

/**
 * Resource utilization metrics
 */
export interface ResourceMetrics {
  readonly memoryPeak: number;
  readonly memoryAverage: number;
  readonly cpuPeak: number;
  readonly cpuAverage: number;
}

/**
 * Complete load test report
 */
export interface LoadTestReport {
  readonly summary: {
    readonly totalAgents: number;
    readonly peakAgents: number;
    readonly totalTasks: number;
    readonly duration: number;
    readonly success: boolean;
    readonly successCriteria: {
      readonly agentCount: boolean;
      readonly memoryLimit: boolean;
      readonly coordinationLatency: boolean;
      readonly noDeadlocks: boolean;
      readonly noStarvation: boolean;
    };
  };
  readonly performance: {
    readonly coordinationLatency: LatencyPercentiles;
    readonly taskLatency: LatencyPercentiles;
    readonly throughput: ThroughputMetrics;
  };
  readonly resources: ResourceMetrics;
  readonly timeline: {
    readonly agentCounts: Array<{ timestamp: number; count: number }>;
    readonly latencies: Array<{ timestamp: number; p95: number }>;
    readonly memoryUsage: Array<{ timestamp: number; heapUsed: number }>;
  };
  readonly issues: string[];
  readonly recommendations: string[];
}

/**
 * Metrics collector configuration
 */
export interface MetricsCollectorConfig {
  /** Maximum number of events to store (default: 100000) */
  readonly maxEvents: number;
  /** Memory sampling interval in ms (default: 1000) */
  readonly memorySampleInterval: number;
  /** Enable detailed timeline (default: true) */
  readonly enableTimeline: boolean;
  /** Timeline sample interval in ms (default: 1000) */
  readonly timelineSampleInterval: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: MetricsCollectorConfig = {
  maxEvents: 100000,
  memorySampleInterval: 1000,
  enableTimeline: true,
  timelineSampleInterval: 1000,
};

// ============================================================================
// Metrics Collector Implementation
// ============================================================================

/**
 * MetricsCollector - Collects and analyzes performance metrics for load testing
 *
 * Efficiently tracks:
 * - Agent spawn/terminate events
 * - Task start/complete with duration
 * - Coordination latency measurements
 * - Memory usage snapshots
 *
 * Provides:
 * - P50/P95/P99 latency calculations
 * - Peak/average memory tracking
 * - Throughput calculations
 * - Timeline data for visualization
 */
export class MetricsCollector {
  private readonly config: MetricsCollectorConfig;

  // Active agent tracking
  private readonly activeAgents = new Map<string, number>(); // agentId -> spawnTimestamp
  private peakAgentCount = 0;
  private totalAgentsSpawned = 0;

  // Task tracking
  private readonly activeTasks = new Map<string, { agentId: string; startTime: number }>();
  private totalTasksStarted = 0;
  private totalTasksCompleted = 0;

  // Latency buffers (using CircularBuffer for memory efficiency)
  private readonly coordinationLatencies: CircularBuffer<number>;
  private readonly taskDurations: CircularBuffer<number>;

  // Memory tracking
  private readonly memorySnapshots: CircularBuffer<MemorySnapshot>;
  private peakMemoryUsed = 0;
  private memorySum = 0;
  private memorySamples = 0;

  // Timeline tracking
  private readonly agentTimeline: Array<{ timestamp: number; count: number }> = [];
  private readonly latencyTimeline: Array<{ timestamp: number; p95: number }> = [];
  private readonly memoryTimeline: Array<{ timestamp: number; heapUsed: number }> = [];

  // Timing
  private startTime = 0;
  private endTime = 0;
  private running = false;
  private memorySamplerTimer: NodeJS.Timeout | null = null;
  private timelineSamplerTimer: NodeJS.Timeout | null = null;

  // Issue tracking
  private readonly issues: string[] = [];

  constructor(config: Partial<MetricsCollectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize circular buffers
    this.coordinationLatencies = new CircularBuffer<number>(this.config.maxEvents);
    this.taskDurations = new CircularBuffer<number>(this.config.maxEvents);
    this.memorySnapshots = new CircularBuffer<MemorySnapshot>(10000);
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start collecting metrics
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.startTime = Date.now();

    // Start memory sampler
    this.memorySamplerTimer = setInterval(() => {
      this.sampleMemory();
    }, this.config.memorySampleInterval);

    // Start timeline sampler if enabled
    if (this.config.enableTimeline) {
      this.timelineSamplerTimer = setInterval(() => {
        this.sampleTimeline();
      }, this.config.timelineSampleInterval);
    }
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.endTime = Date.now();

    if (this.memorySamplerTimer) {
      clearInterval(this.memorySamplerTimer);
      this.memorySamplerTimer = null;
    }

    if (this.timelineSamplerTimer) {
      clearInterval(this.timelineSamplerTimer);
      this.timelineSamplerTimer = null;
    }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.stop();

    this.activeAgents.clear();
    this.peakAgentCount = 0;
    this.totalAgentsSpawned = 0;

    this.activeTasks.clear();
    this.totalTasksStarted = 0;
    this.totalTasksCompleted = 0;

    this.coordinationLatencies.clear();
    this.taskDurations.clear();
    this.memorySnapshots.clear();

    this.peakMemoryUsed = 0;
    this.memorySum = 0;
    this.memorySamples = 0;

    this.agentTimeline.length = 0;
    this.latencyTimeline.length = 0;
    this.memoryTimeline.length = 0;

    this.startTime = 0;
    this.endTime = 0;
    this.issues.length = 0;
  }

  // ============================================================================
  // Recording Methods
  // ============================================================================

  /**
   * Record agent spawn
   */
  recordAgentSpawn(agentId: string, timestamp: number = Date.now()): void {
    this.activeAgents.set(agentId, timestamp);
    this.totalAgentsSpawned++;

    const currentCount = this.activeAgents.size;
    if (currentCount > this.peakAgentCount) {
      this.peakAgentCount = currentCount;
    }
  }

  /**
   * Record agent termination
   */
  recordAgentTerminate(agentId: string, _timestamp: number = Date.now()): void {
    this.activeAgents.delete(agentId);
  }

  /**
   * Record task start
   */
  recordTaskStart(agentId: string, taskId: string, timestamp: number = Date.now()): void {
    this.activeTasks.set(taskId, { agentId, startTime: timestamp });
    this.totalTasksStarted++;
  }

  /**
   * Record task completion with duration
   */
  recordTaskComplete(
    agentId: string,
    taskId: string,
    duration: number,
    _timestamp: number = Date.now()
  ): void {
    const taskInfo = this.activeTasks.get(taskId);
    if (taskInfo && taskInfo.agentId === agentId) {
      this.activeTasks.delete(taskId);
      this.taskDurations.push(duration);
      this.totalTasksCompleted++;
    }
  }

  /**
   * Record coordination latency
   */
  recordCoordination(agentId: string, latency: number, _timestamp: number = Date.now()): void {
    this.coordinationLatencies.push(latency);

    // Check for latency issues
    if (latency > 100) {
      this.issues.push(`High coordination latency for agent ${agentId}: ${latency}ms`);
    }
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(heapUsed: number, heapTotal: number): void {
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed,
      heapTotal,
      external: 0,
      rss: 0,
    };

    this.memorySnapshots.push(snapshot);
    this.memorySum += heapUsed;
    this.memorySamples++;

    if (heapUsed > this.peakMemoryUsed) {
      this.peakMemoryUsed = heapUsed;
    }

    // Check for memory issues (4GB limit from Issue #177)
    const MEMORY_LIMIT = 4 * 1024 * 1024 * 1024;
    if (heapUsed > MEMORY_LIMIT) {
      this.issues.push(`Memory exceeded 4GB limit: ${(heapUsed / 1024 / 1024 / 1024).toFixed(2)}GB`);
    }
  }

  /**
   * Record an issue
   */
  recordIssue(message: string): void {
    this.issues.push(message);
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get current active agent count
   */
  getAgentCount(): number {
    return this.activeAgents.size;
  }

  /**
   * Get peak agent count
   */
  getPeakAgentCount(): number {
    return this.peakAgentCount;
  }

  /**
   * Get total agents spawned
   */
  getTotalAgentsSpawned(): number {
    return this.totalAgentsSpawned;
  }

  /**
   * Get coordination latency at P95
   */
  getP95CoordinationLatency(): number {
    return this.calculatePercentile(this.coordinationLatencies.toArray(), 0.95);
  }

  /**
   * Get coordination latency at P99
   */
  getP99CoordinationLatency(): number {
    return this.calculatePercentile(this.coordinationLatencies.toArray(), 0.99);
  }

  /**
   * Get coordination latency percentiles
   */
  getCoordinationLatencyPercentiles(): LatencyPercentiles {
    return this.calculatePercentiles(this.coordinationLatencies.toArray());
  }

  /**
   * Get task latency percentiles
   */
  getTaskLatencyPercentiles(): LatencyPercentiles {
    return this.calculatePercentiles(this.taskDurations.toArray());
  }

  /**
   * Get maximum memory usage
   */
  getMaxMemoryUsage(): number {
    return this.peakMemoryUsed;
  }

  /**
   * Get average memory usage
   */
  getAverageMemoryUsage(): number {
    return this.memorySamples > 0 ? this.memorySum / this.memorySamples : 0;
  }

  /**
   * Get throughput metrics
   */
  getThroughput(): ThroughputMetrics {
    const duration = this.getDuration();
    const durationSeconds = duration / 1000;

    return {
      tasks: this.totalTasksCompleted,
      tasksPerSecond: durationSeconds > 0 ? this.totalTasksCompleted / durationSeconds : 0,
      agents: this.totalAgentsSpawned,
      agentsPerSecond: durationSeconds > 0 ? this.totalAgentsSpawned / durationSeconds : 0,
    };
  }

  /**
   * Get test duration in milliseconds
   */
  getDuration(): number {
    if (this.startTime === 0) return 0;
    const end = this.endTime > 0 ? this.endTime : Date.now();
    return end - this.startTime;
  }

  /**
   * Check if any agents are starving (no tasks for extended period)
   */
  hasAgentStarvation(): boolean {
    // Check if active agents have no active tasks
    const activeAgentCount = this.activeAgents.size;
    const activeTaskCount = this.activeTasks.size;

    // If we have agents but no tasks running for them, potential starvation
    return activeAgentCount > 0 && activeTaskCount === 0 && this.totalTasksCompleted > 0;
  }

  /**
   * Check for potential deadlocks (tasks started but not completing)
   */
  hasDeadlocks(): boolean {
    // Simple heuristic: if tasks have been running for > 60 seconds, potential deadlock
    const now = Date.now();
    const DEADLOCK_THRESHOLD = 60000;

    const tasks = Array.from(this.activeTasks.values());
    for (const taskInfo of tasks) {
      if (now - taskInfo.startTime > DEADLOCK_THRESHOLD) {
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // Report Generation
  // ============================================================================

  /**
   * Export complete load test report
   */
  exportReport(): LoadTestReport {
    const duration = this.getDuration();
    const coordinationLatency = this.getCoordinationLatencyPercentiles();
    const taskLatency = this.getTaskLatencyPercentiles();
    const throughput = this.getThroughput();

    // Success criteria from Issue #177
    const AGENT_TARGET = 100;
    const MEMORY_LIMIT = 4 * 1024 * 1024 * 1024;
    const LATENCY_TARGET = 100;

    const successCriteria = {
      agentCount: this.peakAgentCount >= AGENT_TARGET,
      memoryLimit: this.peakMemoryUsed < MEMORY_LIMIT,
      coordinationLatency: coordinationLatency.p95 <= LATENCY_TARGET,
      noDeadlocks: !this.hasDeadlocks(),
      noStarvation: !this.hasAgentStarvation(),
    };

    const allCriteriaMet = Object.values(successCriteria).every(Boolean);

    // Generate recommendations based on metrics
    const recommendations = this.generateRecommendations(
      coordinationLatency,
      this.peakMemoryUsed,
      throughput
    );

    return {
      summary: {
        totalAgents: this.totalAgentsSpawned,
        peakAgents: this.peakAgentCount,
        totalTasks: this.totalTasksCompleted,
        duration,
        success: allCriteriaMet,
        successCriteria,
      },
      performance: {
        coordinationLatency,
        taskLatency,
        throughput,
      },
      resources: {
        memoryPeak: this.peakMemoryUsed,
        memoryAverage: this.getAverageMemoryUsage(),
        cpuPeak: 0, // Not tracked yet
        cpuAverage: 0,
      },
      timeline: {
        agentCounts: [...this.agentTimeline],
        latencies: [...this.latencyTimeline],
        memoryUsage: [...this.memoryTimeline],
      },
      issues: [...this.issues],
      recommendations,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private sampleMemory(): void {
    const memUsage = process.memoryUsage();
    this.recordMemoryUsage(memUsage.heapUsed, memUsage.heapTotal);
  }

  private sampleTimeline(): void {
    const now = Date.now();

    // Sample agent count
    this.agentTimeline.push({
      timestamp: now,
      count: this.activeAgents.size,
    });

    // Sample latency P95
    const latencies = this.coordinationLatencies.toArray();
    if (latencies.length > 0) {
      this.latencyTimeline.push({
        timestamp: now,
        p95: this.calculatePercentile(latencies, 0.95),
      });
    }

    // Sample memory
    const memUsage = process.memoryUsage();
    this.memoryTimeline.push({
      timestamp: now,
      heapUsed: memUsage.heapUsed,
    });

    // Limit timeline size
    const MAX_TIMELINE_POINTS = 1000;
    if (this.agentTimeline.length > MAX_TIMELINE_POINTS) {
      this.agentTimeline.shift();
    }
    if (this.latencyTimeline.length > MAX_TIMELINE_POINTS) {
      this.latencyTimeline.shift();
    }
    if (this.memoryTimeline.length > MAX_TIMELINE_POINTS) {
      this.memoryTimeline.shift();
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  private calculatePercentiles(values: number[]): LatencyPercentiles {
    if (values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, max: 0, min: 0, avg: 0, count: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      p50: this.calculatePercentile(sorted, 0.5),
      p95: this.calculatePercentile(sorted, 0.95),
      p99: this.calculatePercentile(sorted, 0.99),
      max: sorted[sorted.length - 1],
      min: sorted[0],
      avg: sum / sorted.length,
      count: sorted.length,
    };
  }

  private generateRecommendations(
    latency: LatencyPercentiles,
    memoryPeak: number,
    throughput: ThroughputMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Latency recommendations
    if (latency.p95 > 100) {
      recommendations.push(
        `P95 coordination latency (${latency.p95.toFixed(1)}ms) exceeds 100ms target. ` +
          'Consider optimizing gossip protocol or reducing agent count.'
      );
    }

    if (latency.p99 > latency.p95 * 2) {
      recommendations.push(
        'High P99/P95 ratio indicates latency outliers. ' +
          'Investigate specific agents or network conditions.'
      );
    }

    // Memory recommendations
    const memoryGB = memoryPeak / 1024 / 1024 / 1024;
    if (memoryGB > 3) {
      recommendations.push(
        `Memory usage (${memoryGB.toFixed(2)}GB) approaching 4GB limit. ` +
          'Consider implementing agent pooling or reducing per-agent memory.'
      );
    }

    // Throughput recommendations
    if (throughput.tasksPerSecond < 10) {
      recommendations.push(
        `Task throughput (${throughput.tasksPerSecond.toFixed(1)}/s) is low. ` +
          'Consider parallelizing task execution or reducing task complexity.'
      );
    }

    // General recommendations
    if (this.issues.length > 10) {
      recommendations.push(
        `${this.issues.length} issues recorded. ` +
          'Review issue log for patterns and prioritize fixes.'
      );
    }

    return recommendations;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new MetricsCollector instance
 */
export function createMetricsCollector(
  config?: Partial<MetricsCollectorConfig>
): MetricsCollector {
  return new MetricsCollector(config);
}
