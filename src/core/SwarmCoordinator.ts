/**
 * SwarmCoordinator - Master Orchestration Layer
 *
 * Coordinates SwarmOptimizer, WorkflowOrchestrator, and UnifiedMemoryCoordinator
 * to provide unified swarm management with feedback loops and adaptive optimization.
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';
import { SwarmMemoryManager } from './memory/SwarmMemoryManager.js';
import { QEEventBus } from './events/QEEventBus.js';
import { SwarmOptimizer, Task, Agent } from './optimization/SwarmOptimizer.js';
import { WorkflowOrchestrator } from './orchestration/WorkflowOrchestrator.js';
import { UnifiedMemoryCoordinator } from './memory/UnifiedMemoryCoordinator.js';
import { RecoveryOrchestrator, getRecoveryOrchestrator } from './recovery/index.js';

// CPU tracking state for utilization calculation
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

/**
 * Calculate current CPU usage percentage
 * Uses process.cpuUsage() delta to compute actual CPU utilization
 */
function calculateCpuUsage(): number {
  const currentCpuUsage = process.cpuUsage(lastCpuUsage);
  const currentTime = Date.now();
  const elapsedMs = currentTime - lastCpuTime;

  if (elapsedMs === 0) return 0;

  // Total CPU time used in microseconds (user + system)
  const totalCpuTime = currentCpuUsage.user + currentCpuUsage.system;
  // Convert to percentage: (microseconds / 1000 = ms) / elapsed ms * 100
  const cpuPercent = (totalCpuTime / 1000 / elapsedMs) * 100;

  // Update tracking state for next calculation
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = currentTime;

  // Clamp to 0-1 range (normalized utilization)
  return Math.min(cpuPercent / 100, 1);
}

/**
 * Swarm topology types
 */
export type SwarmTopology = 'hierarchical' | 'mesh' | 'ring' | 'star' | 'adaptive';

/**
 * Swarm status
 */
export type SwarmStatus = 'initializing' | 'running' | 'paused' | 'degraded' | 'stopped' | 'error';

/**
 * Coordinator configuration
 */
export interface SwarmCoordinatorConfig {
  /** Default topology to use */
  defaultTopology: SwarmTopology;
  /** Maximum agents in swarm */
  maxAgents: number;
  /** Enable automatic optimization */
  autoOptimize: boolean;
  /** Optimization interval in milliseconds */
  optimizationInterval: number;
  /** Enable health monitoring */
  healthMonitoring: boolean;
  /** Health check interval in milliseconds */
  healthCheckInterval: number;
  /** Enable performance feedback loop */
  enableFeedbackLoop: boolean;
  /** Feedback loop interval in milliseconds */
  feedbackInterval: number;
  /** Enable automatic recovery */
  autoRecovery: boolean;
}

/**
 * Swarm metrics
 */
export interface SwarmMetrics {
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskDuration: number;
  throughput: number; // tasks per second
  queueDepth: number;
  memoryUsage: number;
  cpuUtilization: number;
  errorRate: number;
  topology: SwarmTopology;
  uptime: number;
}

/**
 * Feedback loop data
 */
export interface FeedbackData {
  timestamp: Date;
  metrics: SwarmMetrics;
  optimizerRecommendations: any;
  orchestratorStatus: any;
  memoryHealth: any;
}

/**
 * Swarm Coordinator - Master orchestration layer
 */
export class SwarmCoordinator extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: SwarmCoordinatorConfig;

  // Core components
  private memoryManager: SwarmMemoryManager;
  private eventBus: QEEventBus;
  private optimizer: SwarmOptimizer;
  private orchestrator: WorkflowOrchestrator;
  private memoryCoordinator: UnifiedMemoryCoordinator;
  private recoveryOrchestrator: RecoveryOrchestrator;

  // State
  private status: SwarmStatus = 'initializing';
  private currentTopology: SwarmTopology = 'hierarchical';
  private agents: Map<string, Agent> = new Map();
  private startTime: Date = new Date();
  private metricsHistory: SwarmMetrics[] = [];

  // Timers
  private optimizationTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private feedbackTimer?: NodeJS.Timeout;

  // Metrics tracking
  private taskStats = {
    total: 0,
    completed: 0,
    failed: 0,
    durations: [] as number[],
  };

  constructor(
    memoryManager: SwarmMemoryManager,
    eventBus: QEEventBus,
    config?: Partial<SwarmCoordinatorConfig>
  ) {
    super();

    this.logger = Logger.getInstance();
    this.memoryManager = memoryManager;
    this.eventBus = eventBus;

    this.config = {
      defaultTopology: 'hierarchical',
      maxAgents: 10,
      autoOptimize: true,
      optimizationInterval: 60000, // 1 minute
      healthMonitoring: true,
      healthCheckInterval: 30000, // 30 seconds
      enableFeedbackLoop: true,
      feedbackInterval: 120000, // 2 minutes
      autoRecovery: true,
      ...config,
    };

    // Initialize core components
    this.optimizer = new SwarmOptimizer(memoryManager, eventBus);
    this.orchestrator = new WorkflowOrchestrator(memoryManager, eventBus, this.optimizer);
    this.memoryCoordinator = new UnifiedMemoryCoordinator();
    this.recoveryOrchestrator = getRecoveryOrchestrator();

    this.currentTopology = this.config.defaultTopology;
  }

  /**
   * Initialize the coordinator and all sub-components
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing SwarmCoordinator');
    this.status = 'initializing';

    try {
      // Initialize components in order
      await this.optimizer.initialize();
      await this.orchestrator.initialize();
      await this.memoryCoordinator.initialize();

      // Set up event handlers
      this.setupEventHandlers();

      // Start monitoring if enabled
      if (this.config.autoOptimize) {
        this.startOptimizationLoop();
      }

      if (this.config.healthMonitoring) {
        this.startHealthMonitoring();
      }

      if (this.config.enableFeedbackLoop) {
        this.startFeedbackLoop();
      }

      this.status = 'running';
      this.startTime = new Date();
      this.emit('initialized', { topology: this.currentTopology });

      this.logger.info('SwarmCoordinator initialized successfully');
    } catch (error) {
      this.status = 'error';
      this.logger.error('Failed to initialize SwarmCoordinator:', error);
      throw error;
    }
  }

  /**
   * Get current swarm status
   */
  getStatus(): SwarmStatus {
    return this.status;
  }

  /**
   * Get current topology
   */
  getTopology(): SwarmTopology {
    return this.currentTopology;
  }

  /**
   * Get current metrics
   */
  getMetrics(): SwarmMetrics {
    const avgDuration = this.taskStats.durations.length > 0
      ? this.taskStats.durations.reduce((a, b) => a + b, 0) / this.taskStats.durations.length
      : 0;

    const uptime = Date.now() - this.startTime.getTime();
    const throughput = uptime > 0
      ? (this.taskStats.completed / (uptime / 1000))
      : 0;

    const errorRate = this.taskStats.total > 0
      ? this.taskStats.failed / this.taskStats.total
      : 0;

    // Get queue depth from orchestrator
    const queueDepth = this.orchestrator?.getQueueDepth() ?? 0;

    // Calculate real CPU utilization using process.cpuUsage()
    const cpuUtilization = calculateCpuUsage();

    return {
      activeAgents: this.agents.size,
      totalTasks: this.taskStats.total,
      completedTasks: this.taskStats.completed,
      failedTasks: this.taskStats.failed,
      averageTaskDuration: avgDuration,
      throughput,
      queueDepth,
      memoryUsage: process.memoryUsage().heapUsed,
      cpuUtilization,
      errorRate,
      topology: this.currentTopology,
      uptime,
    };
  }

  /**
   * Register an agent with the swarm
   */
  async registerAgent(agent: Agent): Promise<void> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Maximum agent limit (${this.config.maxAgents}) reached`);
    }

    this.agents.set(agent.id, agent);
    this.emit('agent:registered', { agentId: agent.id, type: agent.type });

    this.logger.info(`Agent registered: ${agent.id} (${agent.type})`);
  }

  /**
   * Unregister an agent from the swarm
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.emit('agent:unregistered', { agentId, type: agent.type });
      this.logger.info(`Agent unregistered: ${agentId}`);
    }
  }

  /**
   * Submit a task for execution
   */
  async submitTask(task: Task): Promise<string> {
    this.taskStats.total++;

    try {
      // Use recovery orchestrator for resilient execution
      const result = await this.recoveryOrchestrator.executeWithRecovery(
        'orchestration',
        `task:${task.id}`,
        async () => {
          // Get optimal allocation from optimizer
          const allocation = await this.optimizer.allocateAgents(
            [task],
            Array.from(this.agents.values())
          );

          // Execute through orchestrator
          // Note: WorkflowOrchestrator handles actual execution
          return task.id;
        }
      );

      this.emit('task:submitted', { taskId: task.id, priority: task.priority });
      return result;
    } catch (error) {
      this.taskStats.failed++;
      throw error;
    }
  }

  /**
   * Change swarm topology
   */
  async changeTopology(newTopology: SwarmTopology): Promise<void> {
    if (newTopology === this.currentTopology) {
      return;
    }

    this.logger.info(`Changing topology: ${this.currentTopology} -> ${newTopology}`);

    const oldTopology = this.currentTopology;
    this.currentTopology = newTopology;

    // Notify all agents of topology change
    this.emit('topology:changed', { from: oldTopology, to: newTopology });

    // Store in memory for persistence
    await this.memoryCoordinator.store(
      'swarm:topology',
      { topology: newTopology, changedAt: new Date().toISOString() }
    );
  }

  /**
   * Pause the swarm
   */
  async pause(): Promise<void> {
    this.status = 'paused';
    this.stopTimers();
    this.emit('paused');
    this.logger.info('Swarm paused');
  }

  /**
   * Resume the swarm
   */
  async resume(): Promise<void> {
    this.status = 'running';

    if (this.config.autoOptimize) {
      this.startOptimizationLoop();
    }
    if (this.config.healthMonitoring) {
      this.startHealthMonitoring();
    }
    if (this.config.enableFeedbackLoop) {
      this.startFeedbackLoop();
    }

    this.emit('resumed');
    this.logger.info('Swarm resumed');
  }

  /**
   * Shutdown the coordinator
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down SwarmCoordinator');
    this.status = 'stopped';

    this.stopTimers();

    // Persist final metrics
    await this.persistMetrics();

    this.emit('shutdown');
    this.removeAllListeners();

    this.logger.info('SwarmCoordinator shutdown complete');
  }

  /**
   * Force optimization cycle
   */
  async optimize(): Promise<void> {
    this.logger.debug('Running optimization cycle');

    try {
      // Get current workload profile
      const metrics = this.getMetrics();
      const workloadProfile = this.buildWorkloadProfile(metrics);

      // Get topology recommendation
      const recommendation = await this.optimizer.recommendTopology(workloadProfile);

      // Apply recommendation if different from current
      if (recommendation && recommendation.topology !== this.currentTopology) {
        if (recommendation.confidence > 0.7) {
          await this.changeTopology(recommendation.topology as SwarmTopology);
        }
      }

      this.emit('optimization:complete', { recommendation, metrics });
    } catch (error) {
      this.logger.error('Optimization cycle failed:', error);
      this.emit('optimization:failed', { error });
    }
  }

  /**
   * Get feedback loop data
   */
  async getFeedbackData(): Promise<FeedbackData> {
    const metrics = this.getMetrics();
    const memoryHealth = await this.memoryCoordinator.checkHealth();

    // Get latest optimization recommendations from optimizer
    const optimizerRecommendations = this.optimizer?.getLatestRecommendation() ?? null;

    // Get orchestrator status with queue depth and execution info
    const orchestratorStatus = this.orchestrator?.getStatus() ?? { status: 'unknown' };

    return {
      timestamp: new Date(),
      metrics,
      optimizerRecommendations,
      orchestratorStatus,
      memoryHealth: { healthy: memoryHealth },
    };
  }

  /**
   * Set up event handlers for sub-components
   */
  private setupEventHandlers(): void {
    // Forward events from sub-components
    this.eventBus.subscribe('agent:completed', (data) => {
      this.taskStats.completed++;
      if (data.duration) {
        this.taskStats.durations.push(data.duration);
        // Keep only last 1000 durations
        if (this.taskStats.durations.length > 1000) {
          this.taskStats.durations = this.taskStats.durations.slice(-1000);
        }
      }
    });

    this.eventBus.subscribe('agent:failed', () => {
      this.taskStats.failed++;
    });

    // Listen for recovery events
    this.recoveryOrchestrator.on('recovery-success', (data) => {
      this.logger.info(`Recovery succeeded for ${data.component}:`, data);
    });

    this.recoveryOrchestrator.on('recovery-failed', (data) => {
      this.logger.warn(`Recovery failed for ${data.component}:`, data);
      if (this.status !== 'degraded') {
        this.status = 'degraded';
        this.emit('status:degraded', { reason: data.error });
      }
    });
  }

  /**
   * Start optimization loop
   */
  private startOptimizationLoop(): void {
    this.optimizationTimer = setInterval(() => {
      this.optimize().catch(err => {
        this.logger.error('Optimization loop error:', err);
      });
    }, this.config.optimizationInterval);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const memoryHealthy = await this.memoryCoordinator.checkHealth();

        if (!memoryHealthy && this.config.autoRecovery) {
          await this.recoveryOrchestrator.attemptRecovery(
            'memory',
            new Error('Memory health check failed')
          );
        }

        this.emit('health:checked', {
          memoryHealthy,
          status: this.status,
        });
      } catch (error) {
        this.logger.error('Health check failed:', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Start feedback loop
   */
  private startFeedbackLoop(): void {
    this.feedbackTimer = setInterval(async () => {
      try {
        const feedbackData = await this.getFeedbackData();

        // Store metrics history
        this.metricsHistory.push(feedbackData.metrics);
        if (this.metricsHistory.length > 100) {
          this.metricsHistory = this.metricsHistory.slice(-100);
        }

        // Persist to memory (24 hours TTL)
        await this.memoryCoordinator.store(
          `swarm:feedback:${Date.now()}`,
          feedbackData,
          86400000 // 24 hours in ms
        );

        this.emit('feedback:collected', feedbackData);
      } catch (error) {
        this.logger.error('Feedback loop error:', error);
      }
    }, this.config.feedbackInterval);
  }

  /**
   * Stop all timers
   */
  private stopTimers(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = undefined;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    if (this.feedbackTimer) {
      clearInterval(this.feedbackTimer);
      this.feedbackTimer = undefined;
    }
  }

  /**
   * Build workload profile from metrics
   */
  private buildWorkloadProfile(metrics: SwarmMetrics): any {
    // Calculate average complexity from multiple factors:
    // 1. Duration factor: normalized task duration (0-1 scale, baseline 5000ms)
    const durationFactor = Math.min(metrics.averageTaskDuration / 5000, 1);

    // 2. Error factor: higher error rates indicate complex/problematic tasks
    const errorFactor = metrics.errorRate;

    // 3. Throughput factor: low throughput relative to agents indicates coordination complexity
    const expectedThroughput = metrics.activeAgents * 0.5; // 0.5 tasks/sec per agent baseline
    const throughputFactor = metrics.activeAgents > 0 && expectedThroughput > 0
      ? Math.max(0, 1 - (metrics.throughput / expectedThroughput))
      : 0;

    // 4. Memory factor: high memory usage indicates data-intensive complexity
    const memoryFactor = Math.min(metrics.memoryUsage / 1073741824, 1); // 1GB baseline

    // Weighted average complexity (0-1 scale)
    const averageComplexity = Math.min(1, Math.max(0,
      durationFactor * 0.4 +    // Duration is primary indicator
      errorFactor * 0.2 +       // Errors suggest complexity
      throughputFactor * 0.2 +  // Low throughput means coordination overhead
      memoryFactor * 0.2        // Memory usage indicates data complexity
    ));

    return {
      taskCount: metrics.totalTasks,
      averageComplexity,
      parallelizationPotential: metrics.activeAgents > 1 ? 0.8 : 0.3,
      coordinationNeeds: metrics.activeAgents > 5 ? 0.8 : 0.4,
      memoryIntensity: metrics.memoryUsage > 500000000 ? 0.8 : 0.4, // 500MB threshold
    };
  }

  /**
   * Persist current metrics
   */
  private async persistMetrics(): Promise<void> {
    try {
      await this.memoryCoordinator.store(
        'swarm:metrics:final',
        {
          metrics: this.getMetrics(),
          history: this.metricsHistory.slice(-20),
          shutdownTime: new Date().toISOString(),
        }
      );
    } catch (error) {
      this.logger.error('Failed to persist metrics:', error);
    }
  }
}

/**
 * Default coordinator instance
 */
let defaultCoordinator: SwarmCoordinator | null = null;

/**
 * Get or create default coordinator
 */
export async function getSwarmCoordinator(
  memoryManager?: SwarmMemoryManager,
  eventBus?: QEEventBus,
  config?: Partial<SwarmCoordinatorConfig>
): Promise<SwarmCoordinator> {
  if (!defaultCoordinator && memoryManager && eventBus) {
    defaultCoordinator = new SwarmCoordinator(memoryManager, eventBus, config);
    await defaultCoordinator.initialize();
  }

  if (!defaultCoordinator) {
    throw new Error('SwarmCoordinator not initialized. Provide memoryManager and eventBus.');
  }

  return defaultCoordinator;
}

/**
 * Reset default coordinator (for testing)
 */
export async function resetSwarmCoordinator(): Promise<void> {
  if (defaultCoordinator) {
    await defaultCoordinator.shutdown();
    defaultCoordinator = null;
  }
}
