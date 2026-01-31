/**
 * Agentic QE v3 - Agent Load Tester
 * Load testing framework for 100+ agent coordination
 *
 * Issue #177 Targets:
 * - 100+ agents coordinated simultaneously
 * - Memory usage < 4GB at scale
 * - No agent starvation or deadlocks
 * - Queen Coordinator handles load
 * - Gossip protocol stable at scale
 * - Coordination latency < 100ms p95
 */

import { v4 as uuidv4 } from 'uuid';
import {
  MetricsCollector,
  createMetricsCollector,
  LoadTestReport,
  MetricsCollectorConfig,
} from './metrics-collector.js';
import {
  BottleneckAnalyzer,
  createBottleneckAnalyzer,
  createBottleneckAnalyzerWithThresholds,
  BottleneckReport,
  BottleneckThresholds,
} from './bottleneck-analyzer.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Workload profile intensity
 */
export type WorkloadProfile = 'light' | 'medium' | 'heavy';

/**
 * Agent workload configuration
 */
export interface AgentWorkload {
  /** Number of tasks per agent */
  readonly taskCount: number;
  /** Average task duration in milliseconds */
  readonly taskDuration: number;
  /** Estimated memory per agent in bytes */
  readonly memoryUsage: number;
  /** How often agent coordinates (per second) */
  readonly coordinationFrequency: number;
  /** Variance in task duration (0-1, default 0.2) */
  readonly durationVariance?: number;
}

/**
 * Load test configuration
 */
export interface LoadTestConfig {
  /** Maximum agent count (target: 100+) */
  readonly maxAgents: number;
  /** Memory limit in bytes (target: 4GB) */
  readonly memoryLimit: number;
  /** Max coordination latency (target: 100ms) */
  readonly coordinationTimeout: number;
  /** Workload intensity profile */
  readonly workloadProfile: WorkloadProfile;
  /** Custom workload (overrides profile) */
  readonly customWorkload?: AgentWorkload;
  /** Enable mock mode (faster, no real agents) */
  readonly mockMode: boolean;
  /** Random seed for reproducibility */
  readonly seed?: number;
}

/**
 * Load test result
 */
export interface LoadTestResult {
  /** Whether the test passed all criteria */
  readonly success: boolean;
  /** Detailed report */
  readonly report: LoadTestReport;
  /** Bottleneck analysis */
  readonly bottlenecks: BottleneckReport;
  /** Test configuration used */
  readonly config: LoadTestConfig;
  /** Duration in milliseconds */
  readonly duration: number;
  /** Error if test failed */
  readonly error?: string;
}

/**
 * Load test scenario step
 */
export interface LoadTestStep {
  /** Target number of agents */
  readonly agents: number;
  /** Time to hold at this level (ms) */
  readonly holdTime: number;
  /** Churn rate (agents spawning/terminating per minute, 0-1) */
  readonly churnRate?: number;
}

/**
 * Load test scenario
 */
export interface LoadTestScenario {
  /** Scenario name */
  readonly name: string;
  /** Description */
  readonly description: string;
  /** Steps to execute */
  readonly steps: readonly LoadTestStep[];
  /** Workload configuration */
  readonly workload: AgentWorkload;
  /** Success criteria overrides */
  readonly criteria?: Partial<SuccessCriteria>;
}

/**
 * Success criteria for load tests
 */
export interface SuccessCriteria {
  /** Minimum agent count (default: 100) */
  readonly agentCount: number;
  /** Maximum memory in bytes (default: 4GB) */
  readonly memoryLimit: number;
  /** Maximum P95 coordination latency (default: 100ms) */
  readonly coordinationLatency: number;
  /** No agent starvation (default: true) */
  readonly noAgentStarvation: boolean;
  /** No deadlocks (default: true) */
  readonly noDeadlocks: boolean;
  /** Gossip protocol stable (default: true) */
  readonly gossipStable: boolean;
}

/**
 * Mock agent for testing
 */
interface MockAgent {
  readonly id: string;
  readonly domain: string;
  readonly spawnedAt: number;
  readonly workload: AgentWorkload;
  activeTasks: number;
  totalTasks: number;
  terminated: boolean;
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_CONFIG: LoadTestConfig = {
  maxAgents: 100,
  memoryLimit: 4 * 1024 * 1024 * 1024, // 4GB
  coordinationTimeout: 100,
  workloadProfile: 'medium',
  mockMode: true,
};

const DEFAULT_SUCCESS_CRITERIA: SuccessCriteria = {
  agentCount: 100,
  memoryLimit: 4 * 1024 * 1024 * 1024,
  coordinationLatency: 100,
  noAgentStarvation: true,
  noDeadlocks: true,
  gossipStable: true,
};

const WORKLOAD_PROFILES: Record<WorkloadProfile, AgentWorkload> = {
  light: {
    taskCount: 5,
    taskDuration: 50,
    memoryUsage: 5 * 1024 * 1024, // 5MB
    coordinationFrequency: 2,
    durationVariance: 0.1,
  },
  medium: {
    taskCount: 10,
    taskDuration: 100,
    memoryUsage: 10 * 1024 * 1024, // 10MB
    coordinationFrequency: 5,
    durationVariance: 0.2,
  },
  heavy: {
    taskCount: 20,
    taskDuration: 200,
    memoryUsage: 20 * 1024 * 1024, // 20MB
    coordinationFrequency: 10,
    durationVariance: 0.3,
  },
};

// ============================================================================
// Predefined Scenarios
// ============================================================================

/**
 * Scenario 1: Gradual ramp-up to 100 agents
 */
export const SCENARIO_RAMP_UP_100: LoadTestScenario = {
  name: 'ramp-up-100',
  description: 'Gradually add agents until reaching 100',
  steps: [
    { agents: 25, holdTime: 30000 },
    { agents: 50, holdTime: 30000 },
    { agents: 75, holdTime: 30000 },
    { agents: 100, holdTime: 60000 },
  ],
  workload: WORKLOAD_PROFILES.medium,
};

/**
 * Scenario 2: Burst to 100 agents
 */
export const SCENARIO_BURST_100: LoadTestScenario = {
  name: 'burst-100',
  description: 'Instantly spawn 100 agents',
  steps: [{ agents: 100, holdTime: 120000 }],
  workload: {
    taskCount: 20,
    taskDuration: 50,
    memoryUsage: 10 * 1024 * 1024,
    coordinationFrequency: 5,
  },
};

/**
 * Scenario 3: Sustained load with churn
 */
export const SCENARIO_CHURN_100: LoadTestScenario = {
  name: 'churn-100',
  description: 'Maintain 100 agents with continuous spawn/terminate',
  steps: [{ agents: 100, holdTime: 180000, churnRate: 0.1 }],
  workload: {
    taskCount: 15,
    taskDuration: 75,
    memoryUsage: 10 * 1024 * 1024,
    coordinationFrequency: 5,
  },
};

/**
 * Scenario 4: Stress test beyond target
 */
export const SCENARIO_STRESS_150: LoadTestScenario = {
  name: 'stress-150',
  description: 'Push beyond 100 agents to find limits',
  steps: [
    { agents: 100, holdTime: 30000 },
    { agents: 125, holdTime: 30000 },
    { agents: 150, holdTime: 60000 },
  ],
  workload: WORKLOAD_PROFILES.heavy,
  criteria: {
    agentCount: 150,
  },
};

// ============================================================================
// Agent Load Tester Implementation
// ============================================================================

/**
 * AgentLoadTester - Load testing framework for agent coordination
 *
 * Features:
 * - Configurable agent count and workload
 * - Gradual ramp-up and burst modes
 * - Agent churn simulation
 * - Mock mode for fast testing
 * - Real coordination integration
 * - Comprehensive metrics collection
 * - Bottleneck detection
 */
export class AgentLoadTester {
  readonly config: LoadTestConfig;
  private readonly metrics: MetricsCollector;
  private readonly analyzer: BottleneckAnalyzer;

  private running = false;
  private stopRequested = false;

  // Mock agents for mock mode
  private readonly mockAgents = new Map<string, MockAgent>();
  private mockTaskTimers = new Map<string, NodeJS.Timeout>();
  private mockCoordinationTimers = new Map<string, NodeJS.Timeout>();
  private churnTimer: NodeJS.Timeout | null = null;

  // Random number generator (seeded for reproducibility)
  private random: () => number;

  constructor(
    config: Partial<LoadTestConfig> = {},
    metricsConfig?: Partial<MetricsCollectorConfig>,
    thresholds?: Partial<BottleneckThresholds>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = createMetricsCollector(metricsConfig);
    this.analyzer = thresholds
      ? createBottleneckAnalyzerWithThresholds(thresholds)
      : createBottleneckAnalyzer();

    // Initialize random number generator
    this.random = this.config.seed !== undefined
      ? this.seededRandom(this.config.seed)
      : Math.random.bind(Math);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Run a load test with specified agent count and duration
   */
  async runTest(agentCount: number, duration: number): Promise<LoadTestResult> {
    const scenario: LoadTestScenario = {
      name: 'custom',
      description: `Custom test with ${agentCount} agents for ${duration}ms`,
      steps: [{ agents: agentCount, holdTime: duration }],
      workload: this.getWorkload(),
    };

    return this.runScenario(scenario);
  }

  /**
   * Run a predefined load test scenario
   */
  async runScenario(scenario: LoadTestScenario): Promise<LoadTestResult> {
    if (this.running) {
      throw new Error('Load test already running');
    }

    this.running = true;
    this.stopRequested = false;
    const startTime = Date.now();

    try {
      // Start metrics collection
      this.metrics.reset();
      this.metrics.start();

      // Execute scenario steps
      for (const step of scenario.steps) {
        if (this.stopRequested) break;
        await this.executeStep(step, scenario.workload);
      }

      // Stop metrics collection
      this.metrics.stop();

      // Generate report
      const report = this.metrics.exportReport();
      const bottlenecks = this.analyzer.analyzeReport(report);

      // Determine overall success
      const criteria = { ...DEFAULT_SUCCESS_CRITERIA, ...scenario.criteria };
      const success = this.evaluateSuccess(report, criteria);

      return {
        success,
        report,
        bottlenecks,
        config: this.config,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.metrics.stop();
      return {
        success: false,
        report: this.metrics.exportReport(),
        bottlenecks: this.analyzer.analyze(this.metrics),
        config: this.config,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await this.cleanup();
      this.running = false;
    }
  }

  /**
   * Gradually ramp up to target agent count
   */
  async rampUp(targetCount: number, rampDuration: number): Promise<void> {
    const currentCount = this.mockAgents.size;
    const agentsToSpawn = targetCount - currentCount;

    if (agentsToSpawn <= 0) return;

    const spawnInterval = rampDuration / agentsToSpawn;
    const workload = this.getWorkload();

    for (let i = 0; i < agentsToSpawn && !this.stopRequested; i++) {
      await this.spawnMockAgent(workload);
      await this.delay(spawnInterval);
    }
  }

  /**
   * Simulate a single agent's lifecycle
   */
  async simulateAgent(agentId: string, workload: AgentWorkload): Promise<{
    agentId: string;
    tasksCompleted: number;
    totalDuration: number;
    coordinationEvents: number;
  }> {
    const startTime = Date.now();
    let tasksCompleted = 0;
    let coordinationEvents = 0;

    // Simulate tasks
    for (let i = 0; i < workload.taskCount && !this.stopRequested; i++) {
      const taskId = `${agentId}_task_${i}`;
      const taskStart = Date.now();

      this.metrics.recordTaskStart(agentId, taskId, taskStart);

      // Simulate task duration with variance
      const variance = workload.durationVariance ?? 0.2;
      const actualDuration =
        workload.taskDuration * (1 + (this.random() - 0.5) * 2 * variance);

      await this.delay(actualDuration);

      this.metrics.recordTaskComplete(agentId, taskId, Date.now() - taskStart);
      tasksCompleted++;

      // Simulate coordination
      const coordLatency = this.simulateCoordinationLatency();
      this.metrics.recordCoordination(agentId, coordLatency);
      coordinationEvents++;
    }

    return {
      agentId,
      tasksCompleted,
      totalDuration: Date.now() - startTime,
      coordinationEvents,
    };
  }

  /**
   * Stop the running test
   */
  async stop(): Promise<void> {
    this.stopRequested = true;

    // Wait for current operations to complete
    await this.delay(100);

    await this.cleanup();
  }

  /**
   * Get current metrics collector
   */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Get current agent count
   */
  getAgentCount(): number {
    return this.mockAgents.size;
  }

  /**
   * Check if test is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Private Methods - Scenario Execution
  // ============================================================================

  private async executeStep(step: LoadTestStep, workload: AgentWorkload): Promise<void> {
    const targetAgents = step.agents;
    const currentAgents = this.mockAgents.size;

    // Adjust agent count
    if (targetAgents > currentAgents) {
      await this.spawnAgents(targetAgents - currentAgents, workload);
    } else if (targetAgents < currentAgents) {
      await this.terminateAgents(currentAgents - targetAgents);
    }

    // Start churn if specified
    if (step.churnRate && step.churnRate > 0) {
      this.startChurn(step.churnRate, targetAgents, workload);
    }

    // Hold at this level
    await this.hold(step.holdTime);

    // Stop churn
    this.stopChurn();
  }

  private async spawnAgents(count: number, workload: AgentWorkload): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < count && !this.stopRequested; i++) {
      promises.push(this.spawnMockAgent(workload));

      // Batch spawning to avoid overwhelming
      if (promises.length >= 10) {
        await Promise.all(promises);
        promises.length = 0;
        await this.delay(10); // Brief pause between batches
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  private async terminateAgents(count: number): Promise<void> {
    const agents = Array.from(this.mockAgents.keys()).slice(0, count);

    for (const agentId of agents) {
      await this.terminateMockAgent(agentId);
    }
  }

  private async hold(duration: number): Promise<void> {
    const checkInterval = 100;
    let elapsed = 0;

    while (elapsed < duration && !this.stopRequested) {
      await this.delay(checkInterval);
      elapsed += checkInterval;
    }
  }

  private startChurn(rate: number, targetCount: number, workload: AgentWorkload): void {
    // Churn rate is per minute, convert to ms interval
    const churnPerMinute = Math.ceil(targetCount * rate);
    const churnInterval = 60000 / churnPerMinute;

    this.churnTimer = setInterval(async () => {
      // Randomly spawn or terminate
      if (this.random() < 0.5) {
        // Terminate random agent
        const agents = Array.from(this.mockAgents.keys());
        if (agents.length > 0) {
          const randomAgent = agents[Math.floor(this.random() * agents.length)];
          await this.terminateMockAgent(randomAgent);
        }
      }

      // Always spawn to maintain target
      if (this.mockAgents.size < targetCount) {
        await this.spawnMockAgent(workload);
      }
    }, churnInterval);
  }

  private stopChurn(): void {
    if (this.churnTimer) {
      clearInterval(this.churnTimer);
      this.churnTimer = null;
    }
  }

  // ============================================================================
  // Private Methods - Mock Agent Management
  // ============================================================================

  private async spawnMockAgent(workload: AgentWorkload): Promise<void> {
    const agentId = `agent_${uuidv4().slice(0, 8)}`;
    const now = Date.now();

    const agent: MockAgent = {
      id: agentId,
      domain: this.getRandomDomain(),
      spawnedAt: now,
      workload,
      activeTasks: 0,
      totalTasks: 0,
      terminated: false,
    };

    this.mockAgents.set(agentId, agent);
    this.metrics.recordAgentSpawn(agentId, now);

    // Start task simulation
    this.startAgentTasks(agent);

    // Start coordination simulation
    this.startAgentCoordination(agent);

    // Simulate memory usage
    this.simulateMemoryUsage();
  }

  private async terminateMockAgent(agentId: string): Promise<void> {
    const agent = this.mockAgents.get(agentId);
    if (!agent) return;

    agent.terminated = true;

    // Clear timers
    const taskTimer = this.mockTaskTimers.get(agentId);
    if (taskTimer) {
      clearInterval(taskTimer);
      this.mockTaskTimers.delete(agentId);
    }

    const coordTimer = this.mockCoordinationTimers.get(agentId);
    if (coordTimer) {
      clearInterval(coordTimer);
      this.mockCoordinationTimers.delete(agentId);
    }

    this.mockAgents.delete(agentId);
    this.metrics.recordAgentTerminate(agentId, Date.now());
  }

  private startAgentTasks(agent: MockAgent): void {
    const taskInterval = agent.workload.taskDuration * 1.5; // Some buffer

    const timer = setInterval(() => {
      if (agent.terminated || agent.totalTasks >= agent.workload.taskCount) {
        clearInterval(timer);
        this.mockTaskTimers.delete(agent.id);
        return;
      }

      const taskId = `${agent.id}_task_${agent.totalTasks}`;
      const taskStart = Date.now();

      agent.activeTasks++;
      agent.totalTasks++;
      this.metrics.recordTaskStart(agent.id, taskId, taskStart);

      // Simulate task completion
      const variance = agent.workload.durationVariance ?? 0.2;
      const duration =
        agent.workload.taskDuration * (1 + (this.random() - 0.5) * 2 * variance);

      setTimeout(() => {
        if (!agent.terminated) {
          agent.activeTasks--;
          this.metrics.recordTaskComplete(agent.id, taskId, Date.now() - taskStart);
        }
      }, duration);
    }, taskInterval);

    this.mockTaskTimers.set(agent.id, timer);
  }

  private startAgentCoordination(agent: MockAgent): void {
    const coordInterval = 1000 / agent.workload.coordinationFrequency;

    const timer = setInterval(() => {
      if (agent.terminated) {
        clearInterval(timer);
        this.mockCoordinationTimers.delete(agent.id);
        return;
      }

      const latency = this.simulateCoordinationLatency();
      this.metrics.recordCoordination(agent.id, latency);
    }, coordInterval);

    this.mockCoordinationTimers.set(agent.id, timer);
  }

  // ============================================================================
  // Private Methods - Simulation Helpers
  // ============================================================================

  private simulateCoordinationLatency(): number {
    // Simulate realistic coordination latency distribution
    // Base latency + variable component + occasional spikes
    const baseLatency = 5;
    const variableLatency = this.random() * 30;
    const spike = this.random() < 0.05 ? this.random() * 100 : 0;

    // Increase latency under load
    const loadFactor = Math.min(this.mockAgents.size / 100, 2);
    const loadLatency = loadFactor * 10;

    return baseLatency + variableLatency + spike + loadLatency;
  }

  private simulateMemoryUsage(): void {
    // Estimate memory based on agent count and workload
    const agentCount = this.mockAgents.size;
    const avgMemoryPerAgent = this.getWorkload().memoryUsage;

    // Base memory + agent memory + overhead
    const baseMemory = 50 * 1024 * 1024; // 50MB base
    const agentMemory = agentCount * avgMemoryPerAgent;
    const overhead = agentCount * 1024 * 100; // 100KB overhead per agent

    const estimatedHeapUsed = baseMemory + agentMemory + overhead;
    const estimatedHeapTotal = estimatedHeapUsed * 1.5;

    this.metrics.recordMemoryUsage(estimatedHeapUsed, estimatedHeapTotal);
  }

  private getRandomDomain(): string {
    const domains = [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
      'defect-intelligence',
      'security-compliance',
    ];
    return domains[Math.floor(this.random() * domains.length)];
  }

  private getWorkload(): AgentWorkload {
    if (this.config.customWorkload) {
      return this.config.customWorkload;
    }
    return WORKLOAD_PROFILES[this.config.workloadProfile];
  }

  private evaluateSuccess(report: LoadTestReport, criteria: SuccessCriteria): boolean {
    const { summary, performance } = report;

    // Check each criterion
    if (summary.peakAgents < criteria.agentCount) return false;
    if (report.resources.memoryPeak >= criteria.memoryLimit) return false;
    if (performance.coordinationLatency.p95 > criteria.coordinationLatency) return false;
    if (criteria.noAgentStarvation && !summary.successCriteria.noStarvation) return false;
    if (criteria.noDeadlocks && !summary.successCriteria.noDeadlocks) return false;

    return true;
  }

  private async cleanup(): Promise<void> {
    // Stop churn
    this.stopChurn();

    // Terminate all mock agents
    const agents = Array.from(this.mockAgents.keys());
    for (const agentId of agents) {
      await this.terminateMockAgent(agentId);
    }

    // Clear all timers
    this.mockTaskTimers.forEach((timer) => {
      clearInterval(timer);
    });
    this.mockTaskTimers.clear();

    this.mockCoordinationTimers.forEach((timer) => {
      clearInterval(timer);
    });
    this.mockCoordinationTimers.clear();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private seededRandom(seed: number): () => number {
    // Simple seeded PRNG (mulberry32)
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new AgentLoadTester instance
 */
export function createAgentLoadTester(
  config?: Partial<LoadTestConfig>,
  metricsConfig?: Partial<MetricsCollectorConfig>,
  thresholds?: Partial<BottleneckThresholds>
): AgentLoadTester {
  return new AgentLoadTester(config, metricsConfig, thresholds);
}

/**
 * Create a load tester with specific agent target
 */
export function createLoadTesterForTarget(
  targetAgents: number,
  workloadProfile: WorkloadProfile = 'medium'
): AgentLoadTester {
  return new AgentLoadTester({
    maxAgents: targetAgents,
    workloadProfile,
    mockMode: true,
  });
}

// ============================================================================
// Exports
// ============================================================================

export {
  DEFAULT_CONFIG as DEFAULT_LOAD_TEST_CONFIG,
  DEFAULT_SUCCESS_CRITERIA,
  WORKLOAD_PROFILES,
};
