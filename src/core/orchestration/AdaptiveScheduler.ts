/**
 * AdaptiveScheduler - Intelligent Task Scheduling
 *
 * Provides dynamic scheduling with optimization feedback, backpressure handling,
 * and predictive queue management for QE agent swarms.
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger.js';
import { PriorityQueue } from './PriorityQueue.js';
import { Task, Agent } from '../optimization/SwarmOptimizer.js';

/**
 * Scheduling strategy
 */
export type SchedulingStrategy =
  | 'round-robin'
  | 'least-loaded'
  | 'capability-match'
  | 'performance-based'
  | 'adaptive';

/**
 * Queue pressure level
 */
export type PressureLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Scheduler configuration
 */
export interface AdaptiveSchedulerConfig {
  /** Default scheduling strategy */
  strategy: SchedulingStrategy;
  /** Maximum queue depth before backpressure */
  maxQueueDepth: number;
  /** High pressure threshold (ratio of queue to capacity) */
  highPressureThreshold: number;
  /** Critical pressure threshold */
  criticalPressureThreshold: number;
  /** Enable predictive scheduling */
  enablePrediction: boolean;
  /** Prediction window in milliseconds */
  predictionWindow: number;
  /** Enable work stealing */
  enableWorkStealing: boolean;
  /** Work stealing threshold (agent load difference) */
  workStealingThreshold: number;
}

/**
 * Task with scheduling metadata
 */
export interface ScheduledTask extends Task {
  scheduledAt: Date;
  assignedAgent?: string;
  estimatedStartTime?: Date;
  estimatedEndTime?: Date;
  actualStartTime?: Date;
  retryCount: number;
  schedulingScore: number;
}

/**
 * Agent with load tracking
 */
export interface TrackedAgent extends Agent {
  assignedTasks: string[];
  completedTasks: number;
  failedTasks: number;
  averageTaskDuration: number;
  lastTaskTime?: Date;
}

/**
 * Scheduler metrics
 */
export interface SchedulerMetrics {
  queueDepth: number;
  queueCapacity: number;
  pressureLevel: PressureLevel;
  scheduledCount: number;
  completedCount: number;
  failedCount: number;
  averageWaitTime: number;
  averageSchedulingTime: number;
  throughput: number;
  agentUtilization: Map<string, number>;
}

/**
 * Scheduling decision
 */
export interface SchedulingDecision {
  taskId: string;
  agentId: string;
  strategy: SchedulingStrategy;
  score: number;
  reason: string;
  estimatedDuration: number;
}

/**
 * Adaptive Scheduler Implementation
 */
export class AdaptiveScheduler extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: AdaptiveSchedulerConfig;

  private taskQueue: PriorityQueue<ScheduledTask>;
  private agents: Map<string, TrackedAgent> = new Map();
  private pendingTasks: Map<string, ScheduledTask> = new Map();
  private completedTasks: Map<string, ScheduledTask> = new Map();

  private metrics = {
    scheduled: 0,
    completed: 0,
    failed: 0,
    totalWaitTime: 0,
    totalSchedulingTime: 0,
  };

  private roundRobinIndex = 0;
  private isRunning = false;
  private schedulerLoop?: NodeJS.Timeout;

  constructor(config?: Partial<AdaptiveSchedulerConfig>) {
    super();

    this.logger = Logger.getInstance();
    this.config = {
      strategy: 'adaptive',
      maxQueueDepth: 1000,
      highPressureThreshold: 0.7,
      criticalPressureThreshold: 0.9,
      enablePrediction: true,
      predictionWindow: 60000, // 1 minute
      enableWorkStealing: true,
      workStealingThreshold: 0.3,
      ...config,
    };

    this.taskQueue = new PriorityQueue<ScheduledTask>();
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.schedulerLoop = setInterval(() => this.processQueue(), 100);
    this.emit('started');
    this.logger.info('AdaptiveScheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;
    if (this.schedulerLoop) {
      clearInterval(this.schedulerLoop);
      this.schedulerLoop = undefined;
    }
    this.emit('stopped');
    this.logger.info('AdaptiveScheduler stopped');
  }

  /**
   * Enqueue a task for scheduling
   */
  enqueue(task: Task): ScheduledTask {
    // Check backpressure
    const pressure = this.getPressureLevel();
    if (pressure === 'critical' && task.priority !== 'critical') {
      throw new Error('Queue at critical pressure, only critical tasks accepted');
    }

    const scheduledTask: ScheduledTask = {
      ...task,
      scheduledAt: new Date(),
      retryCount: 0,
      schedulingScore: this.calculateSchedulingScore(task),
    };

    // Calculate priority value for queue
    const priorityValue = this.calculatePriorityValue(scheduledTask);

    this.taskQueue.enqueue(scheduledTask, priorityValue);
    this.pendingTasks.set(task.id, scheduledTask);

    this.emit('task:enqueued', { taskId: task.id, priority: task.priority, queueDepth: this.taskQueue.size() });
    return scheduledTask;
  }

  /**
   * Register an agent
   */
  registerAgent(agent: Agent): void {
    const trackedAgent: TrackedAgent = {
      ...agent,
      assignedTasks: [],
      completedTasks: 0,
      failedTasks: 0,
      averageTaskDuration: 0,
    };

    this.agents.set(agent.id, trackedAgent);
    this.emit('agent:registered', { agentId: agent.id });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      // Re-queue any assigned tasks
      for (const taskId of agent.assignedTasks) {
        const task = this.pendingTasks.get(taskId);
        if (task) {
          task.assignedAgent = undefined;
          task.retryCount++;
          this.taskQueue.enqueue(task, this.calculatePriorityValue(task));
        }
      }
      this.agents.delete(agentId);
      this.emit('agent:unregistered', { agentId });
    }
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string, duration: number): void {
    const task = this.pendingTasks.get(taskId);
    if (!task) return;

    this.pendingTasks.delete(taskId);
    this.completedTasks.set(taskId, task);
    this.metrics.completed++;

    // Update agent stats
    if (task.assignedAgent) {
      const agent = this.agents.get(task.assignedAgent);
      if (agent) {
        agent.assignedTasks = agent.assignedTasks.filter(id => id !== taskId);
        agent.completedTasks++;
        agent.lastTaskTime = new Date();
        agent.currentLoad = Math.max(0, agent.currentLoad - 0.1);

        // Update average duration
        const prevTotal = agent.averageTaskDuration * (agent.completedTasks - 1);
        agent.averageTaskDuration = (prevTotal + duration) / agent.completedTasks;
      }
    }

    const waitTime = task.actualStartTime
      ? task.actualStartTime.getTime() - task.scheduledAt.getTime()
      : 0;
    this.metrics.totalWaitTime += waitTime;

    this.emit('task:completed', { taskId, duration, waitTime });
  }

  /**
   * Mark task as failed
   */
  failTask(taskId: string, error: string): void {
    const task = this.pendingTasks.get(taskId);
    if (!task) return;

    // Update agent stats
    if (task.assignedAgent) {
      const agent = this.agents.get(task.assignedAgent);
      if (agent) {
        agent.assignedTasks = agent.assignedTasks.filter(id => id !== taskId);
        agent.failedTasks++;
        agent.currentLoad = Math.max(0, agent.currentLoad - 0.1);
        agent.performanceScore = Math.max(0, agent.performanceScore - 0.05);
      }
    }

    // Retry if possible
    if (task.retryCount < 3) {
      task.retryCount++;
      task.assignedAgent = undefined;
      this.taskQueue.enqueue(task, this.calculatePriorityValue(task));
      this.emit('task:retrying', { taskId, retryCount: task.retryCount });
    } else {
      this.pendingTasks.delete(taskId);
      this.metrics.failed++;
      this.emit('task:failed', { taskId, error, retryCount: task.retryCount });
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): SchedulerMetrics {
    const agentUtilization = new Map<string, number>();
    for (const [id, agent] of this.agents) {
      agentUtilization.set(id, agent.currentLoad);
    }

    const elapsed = Date.now() - (this.completedTasks.values().next().value?.scheduledAt?.getTime() || Date.now());
    const throughput = elapsed > 0 ? (this.metrics.completed / (elapsed / 1000)) : 0;

    return {
      queueDepth: this.taskQueue.size(),
      queueCapacity: this.config.maxQueueDepth,
      pressureLevel: this.getPressureLevel(),
      scheduledCount: this.metrics.scheduled,
      completedCount: this.metrics.completed,
      failedCount: this.metrics.failed,
      averageWaitTime: this.metrics.completed > 0
        ? this.metrics.totalWaitTime / this.metrics.completed
        : 0,
      averageSchedulingTime: this.metrics.scheduled > 0
        ? this.metrics.totalSchedulingTime / this.metrics.scheduled
        : 0,
      throughput,
      agentUtilization,
    };
  }

  /**
   * Get queue pressure level
   */
  getPressureLevel(): PressureLevel {
    const ratio = this.taskQueue.size() / this.config.maxQueueDepth;

    if (ratio >= this.config.criticalPressureThreshold) return 'critical';
    if (ratio >= this.config.highPressureThreshold) return 'high';
    if (ratio >= 0.4) return 'medium';
    return 'low';
  }

  /**
   * Get available agents
   */
  getAvailableAgents(): TrackedAgent[] {
    return Array.from(this.agents.values())
      .filter(a => a.isAvailable && a.currentLoad < 0.9);
  }

  /**
   * Process queue and assign tasks
   */
  private processQueue(): void {
    if (!this.isRunning) return;

    const availableAgents = this.getAvailableAgents();
    if (availableAgents.length === 0 || this.taskQueue.isEmpty()) return;

    // Work stealing if enabled
    if (this.config.enableWorkStealing) {
      this.performWorkStealing(availableAgents);
    }

    // Assign tasks to available agents
    while (!this.taskQueue.isEmpty() && availableAgents.length > 0) {
      const task = this.taskQueue.peek();
      if (!task) break;

      const decision = this.makeSchedulingDecision(task, availableAgents);
      if (!decision) break;

      // Dequeue and assign
      this.taskQueue.dequeue();
      this.assignTask(task, decision);

      // Update agent availability
      const agentIndex = availableAgents.findIndex(a => a.id === decision.agentId);
      if (agentIndex >= 0) {
        const agent = availableAgents[agentIndex];
        if (agent.currentLoad >= 0.9) {
          availableAgents.splice(agentIndex, 1);
        }
      }
    }
  }

  /**
   * Make scheduling decision for a task
   */
  private makeSchedulingDecision(
    task: ScheduledTask,
    availableAgents: TrackedAgent[]
  ): SchedulingDecision | null {
    if (availableAgents.length === 0) return null;

    const startTime = Date.now();
    let decision: SchedulingDecision;

    switch (this.config.strategy) {
      case 'round-robin':
        decision = this.roundRobinSchedule(task, availableAgents);
        break;
      case 'least-loaded':
        decision = this.leastLoadedSchedule(task, availableAgents);
        break;
      case 'capability-match':
        decision = this.capabilityMatchSchedule(task, availableAgents);
        break;
      case 'performance-based':
        decision = this.performanceBasedSchedule(task, availableAgents);
        break;
      case 'adaptive':
      default:
        decision = this.adaptiveSchedule(task, availableAgents);
    }

    this.metrics.totalSchedulingTime += Date.now() - startTime;
    return decision;
  }

  /**
   * Round-robin scheduling
   */
  private roundRobinSchedule(
    task: ScheduledTask,
    agents: TrackedAgent[]
  ): SchedulingDecision {
    const agent = agents[this.roundRobinIndex % agents.length];
    this.roundRobinIndex++;

    return {
      taskId: task.id,
      agentId: agent.id,
      strategy: 'round-robin',
      score: 0.5,
      reason: 'Round-robin selection',
      estimatedDuration: task.estimatedDuration,
    };
  }

  /**
   * Least-loaded scheduling
   */
  private leastLoadedSchedule(
    task: ScheduledTask,
    agents: TrackedAgent[]
  ): SchedulingDecision {
    const agent = agents.reduce((min, a) =>
      a.currentLoad < min.currentLoad ? a : min
    );

    return {
      taskId: task.id,
      agentId: agent.id,
      strategy: 'least-loaded',
      score: 1 - agent.currentLoad,
      reason: `Lowest load: ${(agent.currentLoad * 100).toFixed(1)}%`,
      estimatedDuration: task.estimatedDuration,
    };
  }

  /**
   * Capability-match scheduling
   */
  private capabilityMatchSchedule(
    task: ScheduledTask,
    agents: TrackedAgent[]
  ): SchedulingDecision {
    // Score agents by capability match
    const scored = agents.map(agent => {
      const requiredCaps = task.requiredCapabilities || [];
      const matchCount = requiredCaps.filter(cap =>
        agent.capabilities.includes(cap)
      ).length;
      const score = requiredCaps.length > 0
        ? matchCount / requiredCaps.length
        : 0.5;

      return { agent, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    return {
      taskId: task.id,
      agentId: best.agent.id,
      strategy: 'capability-match',
      score: best.score,
      reason: `Capability match: ${(best.score * 100).toFixed(1)}%`,
      estimatedDuration: task.estimatedDuration,
    };
  }

  /**
   * Performance-based scheduling
   */
  private performanceBasedSchedule(
    task: ScheduledTask,
    agents: TrackedAgent[]
  ): SchedulingDecision {
    const agent = agents.reduce((best, a) =>
      a.performanceScore > best.performanceScore ? a : best
    );

    return {
      taskId: task.id,
      agentId: agent.id,
      strategy: 'performance-based',
      score: agent.performanceScore,
      reason: `Best performance: ${(agent.performanceScore * 100).toFixed(1)}%`,
      estimatedDuration: task.estimatedDuration / agent.performanceScore,
    };
  }

  /**
   * Adaptive scheduling (combines all strategies)
   */
  private adaptiveSchedule(
    task: ScheduledTask,
    agents: TrackedAgent[]
  ): SchedulingDecision {
    const pressure = this.getPressureLevel();

    // Under high pressure, prefer fastest agents
    if (pressure === 'critical' || pressure === 'high') {
      return this.performanceBasedSchedule(task, agents);
    }

    // For capability-heavy tasks, match capabilities
    if (task.requiredCapabilities && task.requiredCapabilities.length > 2) {
      return this.capabilityMatchSchedule(task, agents);
    }

    // Default to least-loaded
    return this.leastLoadedSchedule(task, agents);
  }

  /**
   * Assign task to agent
   */
  private assignTask(task: ScheduledTask, decision: SchedulingDecision): void {
    const agent = this.agents.get(decision.agentId);
    if (!agent) return;

    task.assignedAgent = decision.agentId;
    task.actualStartTime = new Date();
    task.estimatedEndTime = new Date(Date.now() + decision.estimatedDuration);

    agent.assignedTasks.push(task.id);
    agent.currentLoad = Math.min(1, agent.currentLoad + 0.1 + (task.complexity * 0.1));

    this.metrics.scheduled++;

    this.emit('task:assigned', {
      taskId: task.id,
      agentId: agent.id,
      strategy: decision.strategy,
      score: decision.score,
    });
  }

  /**
   * Perform work stealing
   */
  private performWorkStealing(availableAgents: TrackedAgent[]): void {
    // Find overloaded and underloaded agents
    const underloaded = availableAgents.filter(a => a.currentLoad < 0.3);
    const overloaded = Array.from(this.agents.values()).filter(a =>
      a.currentLoad > 0.8 && a.assignedTasks.length > 1
    );

    if (underloaded.length === 0 || overloaded.length === 0) return;

    for (const heavy of overloaded) {
      const light = underloaded.find(a =>
        heavy.currentLoad - a.currentLoad > this.config.workStealingThreshold
      );

      if (light && heavy.assignedTasks.length > 1) {
        // Steal one task
        const taskId = heavy.assignedTasks[heavy.assignedTasks.length - 1];
        const task = this.pendingTasks.get(taskId);

        if (task && !task.actualStartTime) {
          // Task hasn't started, can be stolen
          heavy.assignedTasks.pop();
          heavy.currentLoad = Math.max(0, heavy.currentLoad - 0.15);

          task.assignedAgent = light.id;
          light.assignedTasks.push(taskId);
          light.currentLoad = Math.min(1, light.currentLoad + 0.15);

          this.emit('task:stolen', {
            taskId,
            fromAgent: heavy.id,
            toAgent: light.id,
          });
        }
      }
    }
  }

  /**
   * Calculate scheduling score for a task
   */
  private calculateSchedulingScore(task: Task): number {
    const priorityScores = { critical: 1.0, high: 0.75, medium: 0.5, low: 0.25 };
    const priorityScore = priorityScores[task.priority] || 0.5;
    const complexityScore = 1 - task.complexity;
    const dependencyScore = task.dependencies.length === 0 ? 1 : 0.5;

    return (priorityScore * 0.5) + (complexityScore * 0.3) + (dependencyScore * 0.2);
  }

  /**
   * Calculate priority value for queue ordering
   */
  private calculatePriorityValue(task: ScheduledTask): number {
    const priorityValues = { critical: 100, high: 75, medium: 50, low: 25 };
    const basePriority = priorityValues[task.priority] || 50;

    // Boost priority for retries
    const retryBoost = task.retryCount * 10;

    // Boost priority based on wait time (age)
    const waitTime = Date.now() - task.scheduledAt.getTime();
    const ageBoost = Math.min(20, waitTime / 60000); // Max 20 point boost for waiting

    return basePriority + retryBoost + ageBoost;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.agents.clear();
    this.pendingTasks.clear();
    this.completedTasks.clear();
  }
}
