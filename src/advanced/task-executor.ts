/**
 * Advanced Task Executor with Timeout and Resource Management
 * Inspired by Claude Flow's executor implementation
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface TaskDefinition {
  id: string;
  name: string;
  type: 'development' | 'analysis' | 'research' | 'optimization' | 'testing';
  priority: number;
  dependencies: string[];
  timeout: number;
  retryCount: number;
  resources: ResourceRequirements;
  metadata: Record<string, any>;
}

export interface ResourceRequirements {
  maxMemory: number;
  maxCpuPercent: number;
  maxDiskSpace: number;
  maxNetworkBandwidth: number;
  requiredAgents: number;
}

export interface ExecutionContext {
  task: TaskDefinition;
  agentId: string;
  workingDirectory: string;
  environment: Record<string, string>;
  startTime: number;
  timeout: number;
}

export interface ExecutionResult {
  success: boolean;
  output: any;
  error?: string;
  duration: number;
  resourcesUsed: ResourceMetrics;
  retries: number;
  artifacts: string[];
}

export interface ResourceMetrics {
  peakMemory: number;
  cpuTime: number;
  diskIO: number;
  networkIO: number;
  agentsUsed: number;
}

export class TaskExecutor extends EventEmitter {
  private activeExecutions: Map<string, ExecutionContext> = new Map();
  private executionQueue: TaskDefinition[] = [];
  private resourceMonitor: ResourceMonitor;
  private processPool: ProcessPool;
  private maxConcurrent: number = 10;

  constructor(config?: { maxConcurrent?: number }) {
    super();
    this.maxConcurrent = config?.maxConcurrent || 10;
    this.resourceMonitor = new ResourceMonitor();
    this.processPool = new ProcessPool();
  }

  async executeTask(task: TaskDefinition, agentId: string): Promise<ExecutionResult> {
    const context: ExecutionContext = {
      task,
      agentId,
      workingDirectory: await this.prepareWorkspace(task.id),
      environment: this.prepareEnvironment(task),
      startTime: Date.now(),
      timeout: task.timeout || 30000
    };

    this.activeExecutions.set(task.id, context);
    this.emit('taskStarted', { taskId: task.id, agentId });

    try {
      // Check dependencies
      await this.waitForDependencies(task.dependencies);

      // Execute with timeout and retry
      const result = await this.executeWithRetry(context);

      this.emit('taskCompleted', { taskId: task.id, result });
      return result;

    } catch (error: any) {
      const errorResult: ExecutionResult = {
        success: false,
        output: null,
        error: error.message,
        duration: Date.now() - context.startTime,
        resourcesUsed: await this.resourceMonitor.getMetrics(task.id),
        retries: task.retryCount,
        artifacts: []
      };

      this.emit('taskFailed', { taskId: task.id, error: error.message });
      return errorResult;

    } finally {
      this.activeExecutions.delete(task.id);
      await this.cleanupWorkspace(context.workingDirectory);
    }
  }

  private async executeWithRetry(context: ExecutionContext): Promise<ExecutionResult> {
    let lastError: Error | null = null;
    let retries = 0;

    while (retries <= context.task.retryCount) {
      try {
        return await this.executeWithTimeout(context);
      } catch (error: any) {
        lastError = error;
        retries++;

        if (retries <= context.task.retryCount) {
          await this.backoff(retries);
          this.emit('taskRetrying', {
            taskId: context.task.id,
            attempt: retries + 1,
            error: error.message
          });
        }
      }
    }

    throw lastError || new Error('Execution failed');
  }

  private async executeWithTimeout(context: ExecutionContext): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task ${context.task.id} timed out after ${context.timeout}ms`));
      }, context.timeout);

      this.performExecution(context)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private async performExecution(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Start resource monitoring
    this.resourceMonitor.startMonitoring(context.task.id);

    try {
      // Simulate task execution based on type
      const output = await this.executeTaskByType(context);

      const metrics = await this.resourceMonitor.getMetrics(context.task.id);

      return {
        success: true,
        output,
        duration: Date.now() - startTime,
        resourcesUsed: metrics,
        retries: 0,
        artifacts: await this.collectArtifacts(context.workingDirectory)
      };

    } finally {
      this.resourceMonitor.stopMonitoring(context.task.id);
    }
  }

  private async executeTaskByType(context: ExecutionContext): Promise<any> {
    switch (context.task.type) {
      case 'development':
        return this.executeDevelopmentTask(context);
      case 'analysis':
        return this.executeAnalysisTask(context);
      case 'research':
        return this.executeResearchTask(context);
      case 'optimization':
        return this.executeOptimizationTask(context);
      case 'testing':
        return this.executeTestingTask(context);
      default:
        throw new Error(`Unknown task type: ${context.task.type}`);
    }
  }

  private async executeDevelopmentTask(context: ExecutionContext): Promise<any> {
    // Simulate development task execution
    await this.simulateWork(100, 500);
    return {
      filesCreated: ['src/app.js', 'src/config.js'],
      linesOfCode: 250,
      testsCreated: 5
    };
  }

  private async executeAnalysisTask(context: ExecutionContext): Promise<any> {
    await this.simulateWork(200, 800);
    return {
      metricsAnalyzed: 15,
      issues: 3,
      recommendations: ['Optimize database queries', 'Add caching layer']
    };
  }

  private async executeResearchTask(context: ExecutionContext): Promise<any> {
    await this.simulateWork(150, 600);
    return {
      sourcesReviewed: 10,
      findings: ['Pattern A is more efficient', 'Consider library X'],
      confidence: 0.85
    };
  }

  private async executeOptimizationTask(context: ExecutionContext): Promise<any> {
    await this.simulateWork(300, 1000);
    return {
      performanceImprovement: '35%',
      memoryReduction: '20%',
      optimizationsApplied: 8
    };
  }

  private async executeTestingTask(context: ExecutionContext): Promise<any> {
    await this.simulateWork(100, 400);
    return {
      testsRun: 50,
      passed: 47,
      failed: 3,
      coverage: 85
    };
  }

  private async simulateWork(min: number, max: number): Promise<void> {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async waitForDependencies(dependencies: string[]): Promise<void> {
    if (dependencies.length === 0) return;

    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const pending = dependencies.filter(dep => this.activeExecutions.has(dep));

      if (pending.length === 0) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Dependencies not met within timeout: ${dependencies}`);
  }

  private async prepareWorkspace(taskId: string): Promise<string> {
    const workDir = path.join(os.tmpdir(), 'qe-tasks', taskId);
    await fs.mkdir(workDir, { recursive: true });
    return workDir;
  }

  private prepareEnvironment(task: TaskDefinition): Record<string, string> {
    return {
      ...process.env,
      TASK_ID: task.id,
      TASK_TYPE: task.type,
      TASK_PRIORITY: String(task.priority)
    };
  }

  private async cleanupWorkspace(workDir: string): Promise<void> {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  private async collectArtifacts(workDir: string): Promise<string[]> {
    try {
      const files = await fs.readdir(workDir);
      return files.filter(f => !f.startsWith('.'));
    } catch {
      return [];
    }
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async getQueueStatus(): Promise<any> {
    return {
      queued: this.executionQueue.length,
      active: this.activeExecutions.size,
      maxConcurrent: this.maxConcurrent
    };
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown');

    // Wait for active executions to complete
    const timeout = 5000;
    const startTime = Date.now();

    while (this.activeExecutions.size > 0 && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Force cleanup remaining
    for (const [taskId, context] of this.activeExecutions) {
      await this.cleanupWorkspace(context.workingDirectory);
    }

    this.activeExecutions.clear();
    this.executionQueue = [];
  }
}

// Resource monitoring
class ResourceMonitor {
  private metrics: Map<string, ResourceMetrics> = new Map();
  private intervals: Map<string, NodeJS.Timer> = new Map();

  startMonitoring(taskId: string): void {
    const metrics: ResourceMetrics = {
      peakMemory: 0,
      cpuTime: 0,
      diskIO: 0,
      networkIO: 0,
      agentsUsed: 0
    };

    this.metrics.set(taskId, metrics);

    // Update metrics periodically
    const interval = setInterval(() => {
      const current = this.metrics.get(taskId);
      if (current) {
        const memUsage = process.memoryUsage();
        current.peakMemory = Math.max(current.peakMemory, memUsage.heapUsed);
        current.cpuTime += 100; // Simplified CPU tracking
      }
    }, 100);

    this.intervals.set(taskId, interval);
  }

  stopMonitoring(taskId: string): void {
    const interval = this.intervals.get(taskId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(taskId);
    }
  }

  async getMetrics(taskId: string): Promise<ResourceMetrics> {
    return this.metrics.get(taskId) || {
      peakMemory: 0,
      cpuTime: 0,
      diskIO: 0,
      networkIO: 0,
      agentsUsed: 0
    };
  }
}

// Process pool for parallel execution
class ProcessPool {
  private processes: Map<string, ChildProcess> = new Map();
  private available: string[] = [];
  private maxProcesses: number = 4;

  async initialize(): Promise<void> {
    // Pre-spawn worker processes
    for (let i = 0; i < this.maxProcesses; i++) {
      const id = `worker-${i}`;
      this.available.push(id);
    }
  }

  async getProcess(): Promise<string> {
    while (this.available.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.available.pop()!;
  }

  releaseProcess(id: string): void {
    this.available.push(id);
  }

  async shutdown(): Promise<void> {
    for (const [id, process] of this.processes) {
      process.kill();
    }
    this.processes.clear();
    this.available = [];
  }
}

export default TaskExecutor;