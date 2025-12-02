/**
 * SwarmOptimizer - Stream D Implementation
 *
 * Provides topology recommendation, agent allocation, bottleneck detection,
 * and performance optimization for agent swarms.
 */

import { Logger } from '../../utils/Logger';
import { SwarmMemoryManager } from '../memory/SwarmMemoryManager';
import { PerformanceTracker } from '../../learning/PerformanceTracker';
import { LearningEngine } from '../../learning/LearningEngine';
import { QEEventBus } from '../events/QEEventBus';
import {
  OptimizationConfig,
  TopologyRecommendation,
  WorkloadProfile,
  AgentAllocation,
  PerformanceMetrics,
  Bottleneck,
  OptimizationResult
} from './types';

/**
 * Task definition for allocation
 */
export interface Task {
  id: string;
  type: string;
  complexity: number; // 0-1
  estimatedDuration: number; // milliseconds
  dependencies: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  requiredCapabilities?: string[];
}

/**
 * Agent definition for allocation
 */
export interface Agent {
  id: string;
  type: string;
  capabilities: string[];
  currentLoad: number; // 0-1
  performanceScore: number; // 0-1
  isAvailable: boolean;
}

/**
 * SwarmOptimizer - Optimize swarm topology and agent allocation
 */
export class SwarmOptimizer {
  private readonly logger: Logger;
  private readonly memoryStore: SwarmMemoryManager;
  private readonly eventBus?: QEEventBus;
  private performanceTrackers: Map<string, PerformanceTracker>;
  private learningEngines: Map<string, LearningEngine>;
  private currentTopology?: string;
  private optimizationHistory: OptimizationResult[];

  // Topology performance weights
  private readonly TOPOLOGY_WEIGHTS = {
    hierarchical: { coordination: 0.9, parallelization: 0.6, scalability: 0.7 },
    mesh: { coordination: 0.7, parallelization: 0.9, scalability: 0.8 },
    ring: { coordination: 0.6, parallelization: 0.7, scalability: 0.5 },
    star: { coordination: 0.8, parallelization: 0.5, scalability: 0.6 }
  };

  constructor(
    memoryStore: SwarmMemoryManager,
    eventBus?: QEEventBus
  ) {
    this.logger = Logger.getInstance();
    this.memoryStore = memoryStore;
    this.eventBus = eventBus;
    this.performanceTrackers = new Map();
    this.learningEngines = new Map();
    this.optimizationHistory = [];
  }

  /**
   * Initialize optimizer
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing SwarmOptimizer');

    // Load previous optimization history
    await this.loadOptimizationHistory();

    // Subscribe to performance events if event bus available
    if (this.eventBus) {
      this.eventBus.subscribe('agent:completed', this.handleAgentCompleted.bind(this));
      this.eventBus.subscribe('test:completed', this.handleTestCompleted.bind(this));
    }

    this.logger.info('SwarmOptimizer initialized successfully');
  }

  /**
   * Recommend optimal topology based on workload profile
   *
   * Analyzes task characteristics and recommends:
   * - hierarchical: High coordination, moderate parallelization
   * - mesh: High parallelization, moderate coordination
   * - ring: Balanced but limited scalability
   * - star: Centralized coordination, limited parallelization
   */
  async recommendTopology(workload: WorkloadProfile): Promise<TopologyRecommendation> {
    this.logger.info('Analyzing workload for topology recommendation');

    // Calculate topology scores based on workload characteristics
    const scores = new Map<string, number>();

    for (const [topology, weights] of Object.entries(this.TOPOLOGY_WEIGHTS)) {
      // Score calculation considers:
      // 1. Parallelizability - higher is better for mesh/hierarchical
      // 2. Interdependencies - higher needs better coordination (hierarchical/star)
      // 3. Resource intensity - affects scalability requirements
      // 4. Task count - larger swarms benefit from hierarchical

      const parallelScore = weights.parallelization * workload.parallelizability;
      const coordScore = weights.coordination * workload.interdependencies;
      const scaleScore = weights.scalability * (workload.taskCount / 100); // normalize to 100 tasks
      const complexityScore = (1 - workload.averageComplexity) * 0.5; // simpler tasks = higher score
      const resourceScore = (1 - workload.resourceIntensity) * weights.scalability;

      const totalScore =
        parallelScore * 0.3 +
        coordScore * 0.3 +
        scaleScore * 0.2 +
        complexityScore * 0.1 +
        resourceScore * 0.1;

      scores.set(topology, totalScore);
    }

    // Find best topology
    let bestTopology = 'hierarchical';
    let bestScore = 0;

    for (const [topology, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestTopology = topology;
      }
    }

    // Calculate expected speedup based on parallelizability and topology
    const baseSpeedup = 1.0;
    const topologyMultiplier = this.TOPOLOGY_WEIGHTS[bestTopology as keyof typeof this.TOPOLOGY_WEIGHTS].parallelization;
    const expectedSpeedup = baseSpeedup + (workload.parallelizability * topologyMultiplier * 3); // Max ~3.5x

    // Calculate agent allocation recommendations
    const agentAllocation = this.calculateAgentDistribution(workload, bestTopology);

    // Calculate confidence based on score margin
    const sortedScores = Array.from(scores.values()).sort((a, b) => b - a);
    const scoreMargin = sortedScores[0] - sortedScores[1];
    const confidence = Math.min(0.95, 0.5 + scoreMargin * 2);

    const reasoning = this.generateTopologyReasoning(
      workload,
      bestTopology,
      scores,
      expectedSpeedup
    );

    const recommendation: TopologyRecommendation = {
      topology: bestTopology as 'hierarchical' | 'mesh' | 'ring' | 'star',
      reasoning,
      expectedSpeedup,
      agentAllocation,
      confidence
    };

    // Store recommendation
    await this.memoryStore.store(
      'optimization/topology/latest',
      recommendation,
      { partition: 'optimization' }
    );

    this.currentTopology = bestTopology;

    return recommendation;
  }

  /**
   * Allocate agents to tasks optimally
   *
   * Matches tasks to agents based on:
   * - Capability matching
   * - Load balancing
   * - Performance history
   * - Task dependencies
   */
  async allocateAgents(tasks: Task[], agents: Agent[]): Promise<AgentAllocation> {
    this.logger.info(`Allocating ${agents.length} agents to ${tasks.length} tasks`);

    const allocations = new Map<string, string[]>();
    const agentLoads = new Map<string, number>();

    // Initialize agent loads
    for (const agent of agents) {
      if (agent.isAvailable) {
        allocations.set(agent.id, []);
        agentLoads.set(agent.id, agent.currentLoad);
      }
    }

    // Sort tasks by priority and complexity (critical + complex first)
    const sortedTasks = [...tasks].sort((a, b) => {
      const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
      const aPriority = priorityWeight[a.priority];
      const bPriority = priorityWeight[b.priority];

      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      return b.complexity - a.complexity;
    });

    // Allocate tasks using capability matching and load balancing
    const reasoning: string[] = [];

    for (const task of sortedTasks) {
      const suitableAgents = this.findSuitableAgents(task, agents, agentLoads);

      if (suitableAgents.length === 0) {
        reasoning.push(`Warning: No suitable agent found for task ${task.id} (${task.type})`);
        continue;
      }

      // Select best agent (highest score, lowest load)
      const bestAgent = suitableAgents.reduce((best, current) => {
        const currentLoad = agentLoads.get(current.id) || 0;
        const bestLoad = agentLoads.get(best.id) || 0;

        // Score combines performance and inverse load
        const currentScore = current.performanceScore * (1 - currentLoad);
        const bestScore = best.performanceScore * (1 - bestLoad);

        return currentScore > bestScore ? current : best;
      });

      // Allocate task to agent
      const agentTasks = allocations.get(bestAgent.id) || [];
      agentTasks.push(task.id);
      allocations.set(bestAgent.id, agentTasks);

      // Update agent load (estimate)
      const estimatedLoad = (task.estimatedDuration / 60000) * task.complexity; // normalize to minutes
      agentLoads.set(bestAgent.id, (agentLoads.get(bestAgent.id) || 0) + estimatedLoad);

      reasoning.push(
        `Task ${task.id} (${task.type}, ${task.priority}) → Agent ${bestAgent.id} (score: ${bestAgent.performanceScore.toFixed(2)})`
      );
    }

    // Calculate load balance metric (1 = perfectly balanced, 0 = highly imbalanced)
    const loads = Array.from(agentLoads.values());
    const avgLoad = loads.reduce((sum, load) => sum + load, 0) / loads.length;
    const variance = loads.reduce((sum, load) => sum + Math.pow(load - avgLoad, 2), 0) / loads.length;
    const stdDev = Math.sqrt(variance);
    const loadBalance = Math.max(0, 1 - (stdDev / avgLoad));

    // Calculate expected duration (critical path)
    const expectedDuration = this.calculateExpectedDuration(tasks, allocations, agentLoads);

    const allocation: AgentAllocation = {
      allocations,
      reasoning: reasoning.join('\n'),
      loadBalance,
      expectedDuration
    };

    // Store allocation
    await this.memoryStore.store(
      'optimization/allocation/latest',
      allocation,
      { partition: 'optimization' }
    );

    return allocation;
  }

  /**
   * Detect performance bottlenecks
   *
   * Analyzes metrics to identify:
   * - Agent bottlenecks (overloaded, underperforming)
   * - Memory bottlenecks (high usage, slow queries)
   * - Coordination bottlenecks (high latency, contention)
   * - IO bottlenecks (disk, network)
   */
  async detectBottlenecks(metrics: PerformanceMetrics[]): Promise<Bottleneck[]> {
    this.logger.info(`Analyzing ${metrics.length} performance metric snapshots`);

    const bottlenecks: Bottleneck[] = [];

    if (metrics.length === 0) {
      return bottlenecks;
    }

    // Calculate average metrics
    const avgThroughput = metrics.reduce((sum, m) => sum + m.taskThroughput, 0) / metrics.length;
    const avgLatency = metrics.reduce((sum, m) => sum + m.averageLatency, 0) / metrics.length;
    const avgUtilization = metrics.reduce((sum, m) => sum + m.resourceUtilization, 0) / metrics.length;

    // Detect agent bottlenecks
    if (avgUtilization > 0.85) {
      bottlenecks.push({
        type: 'agent',
        location: 'swarm',
        severity: Math.min(1, avgUtilization - 0.85) / 0.15,
        impact: `High agent utilization (${(avgUtilization * 100).toFixed(1)}%) limiting throughput`,
        recommendation: 'Scale up agent count or optimize task distribution'
      });
    }

    // Detect memory bottlenecks
    if (avgUtilization > 0.75 && avgLatency > 1000) {
      bottlenecks.push({
        type: 'memory',
        location: 'storage',
        severity: Math.min(1, avgLatency / 5000), // 5s max
        impact: `High memory latency (${avgLatency.toFixed(0)}ms) affecting performance`,
        recommendation: 'Enable caching, optimize queries, or add memory capacity'
      });
    }

    // Detect coordination bottlenecks
    const latencyVariance = this.calculateVariance(metrics.map(m => m.averageLatency));
    if (latencyVariance > avgLatency * 0.5) {
      bottlenecks.push({
        type: 'coordination',
        location: 'event-bus',
        severity: Math.min(1, latencyVariance / (avgLatency * 2)),
        impact: 'High coordination overhead causing latency spikes',
        recommendation: 'Optimize event handling, reduce synchronization, or switch topology'
      });
    }

    // Detect IO bottlenecks (low throughput with low utilization)
    if (avgThroughput < 5 && avgUtilization < 0.5) {
      bottlenecks.push({
        type: 'io',
        location: 'storage',
        severity: Math.min(1, (0.5 - avgUtilization) * 2),
        impact: 'Low throughput despite available capacity suggests IO limitations',
        recommendation: 'Enable batch processing, optimize file operations, or use async IO'
      });
    }

    // Include existing bottlenecks from metrics
    for (const metric of metrics) {
      if (metric.bottlenecks && metric.bottlenecks.length > 0) {
        bottlenecks.push(...metric.bottlenecks);
      }
    }

    // Store bottleneck analysis
    await this.memoryStore.store(
      'optimization/bottlenecks/latest',
      { timestamp: new Date(), bottlenecks },
      { partition: 'optimization' }
    );

    this.logger.info(`Detected ${bottlenecks.length} bottlenecks`);

    return bottlenecks;
  }

  /**
   * Optimize swarm performance
   *
   * Applies optimizations based on configuration:
   * - Topology adjustment
   * - Agent reallocation
   * - Parameter tuning
   * - Resource scaling
   */
  async optimize(config: OptimizationConfig): Promise<OptimizationResult> {
    this.logger.info('Starting swarm optimization');

    const improvements = new Map<string, number>();
    let topology: TopologyRecommendation | undefined;
    let allocation: AgentAllocation | undefined;

    try {
      // 1. Collect current performance metrics
      const currentMetrics = await this.collectCurrentMetrics();
      const baselinePerformance = this.calculateCompositeScore(currentMetrics);

      this.logger.debug(`Baseline performance score: ${baselinePerformance.toFixed(3)}`);

      // 2. Detect bottlenecks if enabled
      if (config.enableBottleneckDetection) {
        const bottlenecks = await this.detectBottlenecks(currentMetrics);
        this.logger.info(`Found ${bottlenecks.length} bottlenecks`);

        // Apply bottleneck-specific optimizations
        for (const bottleneck of bottlenecks) {
          await this.applyBottleneckFix(bottleneck);
        }
      }

      // 3. Recommend topology optimization
      if (config.enableAutoTuning) {
        const workloadProfile = await this.analyzeWorkload();
        topology = await this.recommendTopology(workloadProfile);

        this.logger.info(`Recommended topology: ${topology.topology} (expected speedup: ${topology.expectedSpeedup.toFixed(2)}x)`);
      }

      // 4. Optimize agent allocation if adaptive scaling enabled
      if (config.enableAdaptiveScaling) {
        const tasks = await this.loadPendingTasks();
        const agents = await this.loadActiveAgents(config.maxAgents);
        allocation = await this.allocateAgents(tasks, agents);

        this.logger.info(`Agent allocation optimized (load balance: ${allocation.loadBalance.toFixed(2)})`);
      }

      // 5. Calculate improvements
      const optimizedMetrics = await this.collectCurrentMetrics();
      const optimizedPerformance = this.calculateCompositeScore(optimizedMetrics);

      const throughputImprovement = this.calculateImprovement(
        currentMetrics.map(m => m.taskThroughput),
        optimizedMetrics.map(m => m.taskThroughput)
      );

      const latencyImprovement = -this.calculateImprovement( // negative because lower is better
        currentMetrics.map(m => m.averageLatency),
        optimizedMetrics.map(m => m.averageLatency)
      );

      const utilizationImprovement = this.calculateImprovement(
        currentMetrics.map(m => m.resourceUtilization),
        optimizedMetrics.map(m => m.resourceUtilization)
      );

      improvements.set('throughput', throughputImprovement);
      improvements.set('latency', latencyImprovement);
      improvements.set('utilization', utilizationImprovement);
      improvements.set('overall', ((optimizedPerformance - baselinePerformance) / baselinePerformance) * 100);

      const result: OptimizationResult = {
        success: true,
        improvements,
        topology,
        allocation,
        timestamp: new Date()
      };

      // Store optimization result
      this.optimizationHistory.push(result);
      await this.storeOptimizationResult(result);

      this.logger.info(`Optimization complete. Overall improvement: ${improvements.get('overall')?.toFixed(1)}%`);

      return result;

    } catch (error) {
      this.logger.error('Optimization failed:', error);

      return {
        success: false,
        improvements: new Map(),
        timestamp: new Date()
      };
    }
  }

  /**
   * Register performance tracker for an agent
   */
  registerPerformanceTracker(agentId: string, tracker: PerformanceTracker): void {
    this.performanceTrackers.set(agentId, tracker);
  }

  /**
   * Register learning engine for an agent
   */
  registerLearningEngine(agentId: string, engine: LearningEngine): void {
    this.learningEngines.set(agentId, engine);
  }

  // ============= PRIVATE HELPER METHODS =============

  /**
   * Calculate agent distribution for topology
   */
  private calculateAgentDistribution(workload: WorkloadProfile, topology: string): Map<string, number> {
    const allocation = new Map<string, number>();

    // Estimate agent types needed based on task types
    for (const [taskType, count] of workload.taskTypes.entries()) {
      const agentType = this.mapTaskTypeToAgentType(taskType);
      const currentCount = allocation.get(agentType) || 0;
      allocation.set(agentType, currentCount + count);
    }

    // Adjust based on topology
    if (topology === 'hierarchical') {
      // Add coordinator agents
      allocation.set('coordinator', Math.ceil(workload.taskCount / 10));
    } else if (topology === 'star') {
      // Single coordinator
      allocation.set('coordinator', 1);
    }

    return allocation;
  }

  /**
   * Generate reasoning explanation for topology recommendation
   */
  private generateTopologyReasoning(
    workload: WorkloadProfile,
    topology: string,
    scores: Map<string, number>,
    expectedSpeedup: number
  ): string {
    const parts: string[] = [];

    parts.push(`Recommended ${topology} topology based on workload analysis:`);
    parts.push(`- Task count: ${workload.taskCount}`);
    parts.push(`- Parallelizability: ${(workload.parallelizability * 100).toFixed(0)}%`);
    parts.push(`- Interdependencies: ${(workload.interdependencies * 100).toFixed(0)}%`);
    parts.push(`- Resource intensity: ${(workload.resourceIntensity * 100).toFixed(0)}%`);
    parts.push(`- Average complexity: ${(workload.averageComplexity * 100).toFixed(0)}%`);
    parts.push('');
    parts.push('Topology scores:');

    for (const [topo, score] of Array.from(scores.entries()).sort((a, b) => b[1] - a[1])) {
      parts.push(`- ${topo}: ${score.toFixed(3)}`);
    }

    parts.push('');
    parts.push(`Expected speedup: ${expectedSpeedup.toFixed(2)}x`);

    return parts.join('\n');
  }

  /**
   * Find suitable agents for a task
   */
  private findSuitableAgents(
    task: Task,
    agents: Agent[],
    agentLoads: Map<string, number>
  ): Agent[] {
    return agents.filter(agent => {
      if (!agent.isAvailable) return false;

      // Check if agent is overloaded
      const currentLoad = agentLoads.get(agent.id) || 0;
      if (currentLoad > 0.9) return false;

      // Check capability match
      if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
        const hasAllCapabilities = task.requiredCapabilities.every(cap =>
          agent.capabilities.includes(cap)
        );
        if (!hasAllCapabilities) return false;
      }

      // Check type compatibility
      const compatibleTypes = this.getCompatibleAgentTypes(task.type);
      return compatibleTypes.includes(agent.type);
    });
  }

  /**
   * Get compatible agent types for a task type
   */
  private getCompatibleAgentTypes(taskType: string): string[] {
    const typeMap: Record<string, string[]> = {
      'test-generation': ['qe-test-generator', 'qe-integration-tester', 'coder'],
      'coverage-analysis': ['qe-coverage-analyzer', 'qe-test-gap-finder'],
      'performance-test': ['qe-performance-tester', 'qe-load-test-specialist'],
      'security-test': ['qe-security-tester', 'qe-penetration-tester'],
      'code-review': ['qe-code-reviewer', 'reviewer'],
      'planning': ['qe-test-strategist', 'planner'],
      'default': ['coder', 'tester', 'reviewer']
    };

    return typeMap[taskType] || typeMap['default'];
  }

  /**
   * Map task type to agent type
   */
  private mapTaskTypeToAgentType(taskType: string): string {
    const typeMap: Record<string, string> = {
      'test-generation': 'qe-test-generator',
      'coverage-analysis': 'qe-coverage-analyzer',
      'performance-test': 'qe-performance-tester',
      'security-test': 'qe-security-tester',
      'code-review': 'qe-code-reviewer',
      'planning': 'qe-test-strategist'
    };

    return typeMap[taskType] || 'coder';
  }

  /**
   * Calculate expected duration (critical path)
   */
  private calculateExpectedDuration(
    tasks: Task[],
    allocations: Map<string, string[]>,
    agentLoads: Map<string, number>
  ): number {
    let maxDuration = 0;

    for (const [agentId, taskIds] of allocations.entries()) {
      let agentDuration = 0;

      for (const taskId of taskIds) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          agentDuration += task.estimatedDuration;
        }
      }

      maxDuration = Math.max(maxDuration, agentDuration);
    }

    return maxDuration;
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    return variance;
  }

  /**
   * Calculate improvement percentage
   */
  private calculateImprovement(before: number[], after: number[]): number {
    if (before.length === 0 || after.length === 0) return 0;

    const avgBefore = before.reduce((sum, v) => sum + v, 0) / before.length;
    const avgAfter = after.reduce((sum, v) => sum + v, 0) / after.length;

    return ((avgAfter - avgBefore) / avgBefore) * 100;
  }

  /**
   * Calculate composite performance score
   */
  private calculateCompositeScore(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;

    const weights = {
      throughput: 0.4,
      latency: 0.3,
      utilization: 0.3
    };

    const avgThroughput = metrics.reduce((sum, m) => sum + m.taskThroughput, 0) / metrics.length;
    const avgLatency = metrics.reduce((sum, m) => sum + m.averageLatency, 0) / metrics.length;
    const avgUtilization = metrics.reduce((sum, m) => sum + m.resourceUtilization, 0) / metrics.length;

    // Normalize metrics (throughput higher is better, latency lower is better)
    const normalizedThroughput = Math.min(1, avgThroughput / 10); // 10 tasks/sec baseline
    const normalizedLatency = Math.max(0, 1 - (avgLatency / 5000)); // 5s baseline
    const normalizedUtilization = avgUtilization;

    return (
      normalizedThroughput * weights.throughput +
      normalizedLatency * weights.latency +
      normalizedUtilization * weights.utilization
    );
  }

  /**
   * Collect current performance metrics
   */
  private async collectCurrentMetrics(): Promise<PerformanceMetrics[]> {
    const metrics: PerformanceMetrics[] = [];

    // Collect from registered performance trackers
    for (const [agentId, tracker] of this.performanceTrackers.entries()) {
      try {
        const improvement = await tracker.calculateImprovement();

        metrics.push({
          taskThroughput: improvement.current.metrics.tasksCompleted / improvement.daysElapsed,
          averageLatency: improvement.current.metrics.averageExecutionTime,
          resourceUtilization: improvement.current.metrics.resourceEfficiency,
          bottlenecks: [],
          timestamp: new Date()
        });
      } catch (error) {
        this.logger.warn(`Failed to collect metrics for agent ${agentId}:`, error);
      }
    }

    // If no trackers, load from memory
    if (metrics.length === 0) {
      const stored = await this.memoryStore.retrieve(
        'optimization/metrics/current',
        { partition: 'optimization' }
      );

      if (stored && Array.isArray(stored)) {
        metrics.push(...stored);
      }
    }

    return metrics;
  }

  /**
   * Analyze current workload profile
   */
  private async analyzeWorkload(): Promise<WorkloadProfile> {
    // Load from memory or estimate based on current state
    const stored = await this.memoryStore.retrieve(
      'optimization/workload/profile',
      { partition: 'optimization' }
    );

    if (stored) {
      return stored as WorkloadProfile;
    }

    // Default workload profile
    return {
      taskCount: 10,
      taskTypes: new Map([['test-generation', 5], ['coverage-analysis', 3], ['code-review', 2]]),
      averageComplexity: 0.5,
      parallelizability: 0.7,
      resourceIntensity: 0.5,
      interdependencies: 0.3
    };
  }

  /**
   * Load pending tasks
   */
  private async loadPendingTasks(): Promise<Task[]> {
    const stored = await this.memoryStore.retrieve(
      'optimization/tasks/pending',
      { partition: 'optimization' }
    );

    if (stored && Array.isArray(stored)) {
      return stored as Task[];
    }

    return [];
  }

  /**
   * Load active agents
   */
  private async loadActiveAgents(maxAgents: number): Promise<Agent[]> {
    const stored = await this.memoryStore.retrieve(
      'optimization/agents/active',
      { partition: 'optimization' }
    );

    if (stored && Array.isArray(stored)) {
      return (stored as Agent[]).slice(0, maxAgents);
    }

    return [];
  }

  /**
   * Apply bottleneck-specific fix
   */
  private async applyBottleneckFix(bottleneck: Bottleneck): Promise<void> {
    this.logger.info(`Applying fix for ${bottleneck.type} bottleneck at ${bottleneck.location}`);

    // Store fix action
    await this.memoryStore.store(
      `optimization/bottleneck-fixes/${Date.now()}`,
      {
        bottleneck,
        timestamp: new Date(),
        applied: true
      },
      { partition: 'optimization', ttl: 86400 } // 24 hour TTL
    );
  }

  /**
   * Store optimization result
   */
  private async storeOptimizationResult(result: OptimizationResult): Promise<void> {
    await this.memoryStore.store(
      `optimization/results/${result.timestamp.getTime()}`,
      result,
      { partition: 'optimization', ttl: 2592000 } // 30 days
    );
  }

  /**
   * Load optimization history
   */
  private async loadOptimizationHistory(): Promise<void> {
    try {
      const entries = await this.memoryStore.query(
        'optimization/results/%',
        { partition: 'optimization' }
      );

      this.optimizationHistory = entries
        .map(entry => entry.value as OptimizationResult)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      this.logger.info(`Loaded ${this.optimizationHistory.length} optimization history entries`);
    } catch (error) {
      this.logger.warn('No previous optimization history found');
    }
  }

  /**
   * Handle agent completed event
   */
  private async handleAgentCompleted(event: any): Promise<void> {
    // Update metrics based on completed agent work
    this.logger.debug(`Agent ${event.agentId} completed in ${event.duration}ms`);
  }

  /**
   * Handle test completed event
   */
  private async handleTestCompleted(event: any): Promise<void> {
    // Update test metrics
    this.logger.debug(`Test suite completed: ${event.passed}/${event.passed + event.failed} passed`);
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory(): OptimizationResult[] {
    return [...this.optimizationHistory];
  }

  /**
   * Get current topology
   */
  getCurrentTopology(): string | undefined {
    return this.currentTopology;
  }

  /**
   * Shutdown optimizer
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down SwarmOptimizer');
    this.performanceTrackers.clear();
    this.learningEngines.clear();
  }
}
